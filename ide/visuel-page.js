// Mode visuel de l'aperçu, côté page : ce script est ajouté par le serveur de l'aperçu (preview.js)
// aux pages servies dans le panneau Aperçu quand le mode visuel est allumé. Il n'existe que dans la
// réponse du serveur, jamais dans ton fichier.
//
// - Survol : un cadre montre l'élément sous la souris, avec son nom (balise, data-bf…).
// - Clic : l'élément est choisi ; Rune sélectionne son code et montre ses flags (panneau Bifrost).
//   Les liens et boutons ne réagissent pas pendant ce mode (le couper pour naviguer).
// - Sections de la page (enfants directs de <main>, ou de <body> s'il n'y en a pas) et éléments
//   de liste Bifrost : une poignée pour les monter, descendre, ou les glisser ailleurs.
// - Un bloc glissé depuis le panneau Bifrost se dépose entre deux sections.
// - Double-clic sur un texte : il se modifie sur place (Entrée ou clic ailleurs pour valider,
//   Échap pour annuler) ; Rune réécrit le contenu de la balise dans le code.
// - Une image lâchée (depuis l'Explorateur) sur une image de la page la remplace : Rune copie le
//   fichier à côté de l'ancienne image et change son src.
// - Le curseur placé dans le code éclaire l'élément correspondant dans la page.
// Rien n'est modifié ici : la page envoie à Rune ce qu'il faut faire, Rune retouche le code (Ctrl+Z
// pour annuler) et l'aperçu se recharge.

/* La fonction ci-dessous tourne dans la page de l'aperçu, pas dans Node. */
function pageVisuelle(fichier) {
  if (window.__runeVisuel) return;
  window.__runeVisuel = true;
  const css = `
.rune-v-ui{position:fixed;pointer-events:none;z-index:2147483646;box-sizing:border-box;font:12px/1.3 system-ui,sans-serif}
.rune-v-survol{outline:1px dashed #8b5cf6;outline-offset:-1px;background:rgba(139,92,246,.06)}
.rune-v-choix{outline:2px solid #8b5cf6;outline-offset:-2px}
.rune-v-nom{background:#8b5cf6;color:#fff;padding:2px 6px;border-radius:4px 4px 0 0;white-space:nowrap;max-width:60vw;overflow:hidden;text-overflow:ellipsis}
.rune-v-ligne{height:3px;background:#8b5cf6;border-radius:2px;box-shadow:0 0 0 2px rgba(139,92,246,.25)}
.rune-v-poignee{pointer-events:auto;display:flex;gap:2px;background:rgba(24,24,32,.88);backdrop-filter:blur(6px);border:1px solid rgba(255,255,255,.15);border-radius:6px;padding:2px}
.rune-v-poignee button{all:unset;cursor:pointer;color:#eee;width:22px;height:22px;display:grid;place-items:center;border-radius:4px;font-size:13px}
.rune-v-poignee button:hover{background:rgba(139,92,246,.6)}
.rune-v-poignee [draggable]{cursor:grab}
html.rune-v-glisse *{cursor:copy!important}`;
  const style = document.createElement('style');
  style.textContent = css;
  const ui = document.createElement('div');
  ui.setAttribute('data-rune-ui', '');
  const boite = (classe) => { const d = document.createElement('div'); d.className = `rune-v-ui ${classe}`; d.hidden = true; ui.appendChild(d); return d; };
  const survol = boite('rune-v-survol');
  const choix = boite('rune-v-choix');
  const nom = boite('rune-v-nom');
  const ligne = boite('rune-v-ligne');
  const poignee = boite('rune-v-poignee');
  poignee.innerHTML = '<button data-a="monter" title="Monter">▲</button><button data-a="descendre" title="Descendre">▼</button><button data-a="glisser" draggable="true" title="Glisser pour déplacer">⠿</button>';
  const monter = () => { document.documentElement.appendChild(style); document.documentElement.appendChild(ui); };
  if (document.body) monter(); else addEventListener('DOMContentLoaded', monter);

  const envoyer = (m, transfert) => parent.postMessage({ runeVisuel: { fichier, ...m } }, '*', transfert || []);
  const position = (el) => Number(el.getAttribute('data-rune'));
  const elDe = (n) => {
    if (!n || n.nodeType !== 1 || ui.contains(n)) return null;
    const el = n.closest('[data-rune]');
    return el && el !== document.documentElement ? el : null;
  };
  const conteneur = () => document.querySelector('main[data-rune]') || document.body;
  const bougeable = (el) => el && el.hasAttribute('data-rune') && (el.parentElement === conteneur() || el.hasAttribute('data-bf-element'))
    && !/^(script|style|link|template)$/i.test(el.tagName);
  const blocDe = (el) => { while (el && el !== document.body) { if (bougeable(el)) return el; el = el.parentElement; } return null; };
  const freres = (el) => [...el.parentElement.children].filter((x) => bougeable(x) && x.getClientRects().length);
  const libelle = (el) => {
    let t = el.tagName.toLowerCase();
    if (el.id) t += `#${el.id}`;
    const bf = el.getAttribute('data-bf') || el.getAttribute('data-bf-liste') || el.getAttribute('data-bf-formulaire');
    if (bf) t += ` · ${bf}`;
    else if (el.classList.length) t += `.${[...el.classList].slice(0, 2).join('.')}`;
    return t;
  };
  const placer = (d, el) => {
    const r = el.getBoundingClientRect();
    Object.assign(d.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    d.hidden = false;
    return r;
  };

  let choisi = null;
  let bloc = null;        // section sous la souris (celle de la poignée)
  let glisse = null;      // { de: élément } pendant un glisser de section, { bloc: id } pour un bloc du panneau
  let cible = null;       // { el, apres } : où le glisser déposerait

  function montrer(el) {
    if (!el) { survol.hidden = nom.hidden = true; return; }
    const r = placer(survol, el);
    nom.textContent = libelle(el);
    Object.assign(nom.style, { left: `${Math.max(r.left, 0)}px`, top: `${Math.max(r.top - 19, 0)}px`, width: '', height: '' });
    nom.hidden = false;
  }
  function montrerPoignee(el) {
    bloc = el;
    if (!el) { poignee.hidden = true; return; }
    const r = el.getBoundingClientRect();
    const f = freres(el);
    poignee.querySelector('[data-a="monter"]').style.display = f[0] === el ? 'none' : '';
    poignee.querySelector('[data-a="descendre"]').style.display = f[f.length - 1] === el ? 'none' : '';
    Object.assign(poignee.style, { left: `${Math.max(Math.min(r.right, innerWidth) - 84, 4)}px`, top: `${Math.max(r.top, 0) + 4}px` });
    poignee.hidden = false;
  }
  function suivre() {
    if (choisi && choisi.isConnected) placer(choix, choisi); else choix.hidden = true;
    if (bloc && bloc.isConnected) montrerPoignee(bloc);
    survol.hidden = nom.hidden = true;
  }

  addEventListener('mousemove', (e) => {
    if (glisse) return;
    if (poignee.contains(e.target)) return;
    const el = elDe(e.target);
    montrer(el);
    montrerPoignee(blocDe(el));
  }, true);
  document.addEventListener('mouseleave', () => { montrer(null); });
  addEventListener('scroll', suivre, true);
  addEventListener('resize', suivre);

  // Pendant le mode visuel, un clic choisit : les liens, boutons et formulaires ne réagissent pas.
  const bloquer = (e) => { if (!ui.contains(e.target)) { e.preventDefault(); e.stopPropagation(); } };
  addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-rune-ui] button');
    if (b) {
      e.preventDefault();
      e.stopPropagation();
      if (!bloc) return;
      const f = freres(bloc);
      const i = f.indexOf(bloc);
      if (b.dataset.a === 'monter' && i > 0) envoyer({ deplacer: { de: position(bloc), vers: position(f[i - 1]), apres: false } });
      if (b.dataset.a === 'descendre' && i < f.length - 1) envoyer({ deplacer: { de: position(bloc), vers: position(f[i + 1]), apres: true } });
      return;
    }
    if (edition && edition.el.contains(e.target)) return; // placer le curseur dans le texte
    bloquer(e);
    const el = elDe(e.target);
    if (!el) return;
    choisi = el;
    placer(choix, el);
    envoyer({ choix: position(el), tag: el.tagName.toLowerCase() });
  }, true);
  for (const t of ['submit', 'auxclick']) addEventListener(t, bloquer, true);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !edition) { choisi = null; choix.hidden = true; } });

  // --- Double-clic : modifier un texte sur place ---
  const EN_LIGNE = /^(B|I|EM|STRONG|BR|SPAN|A|SMALL|SUP|SUB|U|S|MARK|ABBR|CODE|Q|TIME)$/;
  const modifiable = (el) => !/^(HTML|BODY|HEAD|MAIN|SCRIPT|STYLE|IMG|INPUT|SELECT|TEXTAREA|VIDEO|AUDIO|IFRAME|SVG|PICTURE)$/.test(el.tagName)
    && el.textContent.trim() !== '' && [...el.querySelectorAll('*')].every((x) => EN_LIGNE.test(x.tagName));
  let edition = null; // { el, avant }
  function finEdition(garder) {
    if (!edition) return;
    const { el, avant } = edition;
    edition = null;
    el.removeAttribute('contenteditable');
    if (!garder) { el.innerHTML = avant; return; }
    const apres = el.innerHTML;
    if (apres !== avant) envoyer({ texte: { debut: position(el), tag: el.tagName.toLowerCase(), html: apres.replace(/ data-rune="\d+"/g, '') } });
  }
  addEventListener('dblclick', (e) => {
    if (ui.contains(e.target) || (edition && edition.el.contains(e.target))) return;
    e.preventDefault();
    e.stopPropagation();
    const el = elDe(e.target);
    if (!el || !modifiable(el)) return;
    finEdition(true);
    edition = { el, avant: el.innerHTML };
    el.setAttribute('contenteditable', el.children.length ? 'true' : 'plaintext-only');
    el.focus();
    const r = document.createRange();
    r.selectNodeContents(el);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    choisi = el;
    placer(choix, el);
  }, true);
  addEventListener('keydown', (e) => {
    if (!edition) return;
    if (e.key === 'Escape') { e.preventDefault(); finEdition(false); }
    else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finEdition(true); }
  }, true);
  // clic ailleurs dans la page : on valide ; la fenêtre de Rune qui prend le clavier : on attend
  addEventListener('focusout', (e) => { if (edition && e.target === edition.el && document.hasFocus()) finEdition(true); }, true);

  // --- Glisser : une section de la page, ou un bloc venu du panneau Bifrost ---
  poignee.querySelector('[data-a="glisser"]').addEventListener('dragstart', (e) => {
    if (!bloc) return e.preventDefault();
    glisse = { de: bloc };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', 'rune-section');
    try { e.dataTransfer.setDragImage(bloc, 20, 20); } catch { /* image par défaut */ }
  });
  const candidats = () => (glisse && glisse.de ? freres(glisse.de) : [...conteneur().children].filter((x) => bougeable(x) && x.getClientRects().length));
  function viser(y) {
    const c = candidats();
    if (!c.length) return null;
    let meilleur = null;
    for (const el of c) {
      const r = el.getBoundingClientRect();
      const d = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
      if (!meilleur || d < meilleur.d) meilleur = { el, r, d };
    }
    const apres = y > meilleur.r.top + meilleur.r.height / 2;
    const r = meilleur.r;
    Object.assign(ligne.style, { left: `${r.left}px`, width: `${r.width}px`, top: `${(apres ? r.bottom : r.top) - 1}px`, height: '' });
    ligne.hidden = false;
    return { el: meilleur.el, apres };
  }
  const finGlisse = () => { glisse = null; cible = null; ligne.hidden = true; document.documentElement.classList.remove('rune-v-glisse'); };
  // --- Image lâchée depuis l'Explorateur : remplace l'image visée ---
  const avecFichier = (e) => !glisse && e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  // l'image sous la souris, même si un texte est posé dessus (photo de fond d'un bandeau)
  const imageSous = (e) => document.elementsFromPoint(e.clientX, e.clientY).find((x) => x.tagName === 'IMG' && x.hasAttribute('data-rune') && !ui.contains(x)) || null;
  addEventListener('dragover', (e) => {
    if (!avecFichier(e)) return;
    e.preventDefault(); // sinon le cadre ouvrirait le fichier à la place de la page
    const img = imageSous(e);
    e.dataTransfer.dropEffect = img ? 'copy' : 'none';
    montrer(img);
    if (img) nom.textContent = 'Remplacer cette image';
  }, true);
  addEventListener('drop', async (e) => {
    if (!avecFichier(e)) return;
    e.preventDefault();
    e.stopPropagation();
    montrer(null);
    const img = imageSous(e);
    const f = e.dataTransfer.files[0];
    if (!img || !f) return;
    if (!/^image\//.test(f.type) || f.size > 20 * 1024 * 1024) return envoyer({ refus: 'Lâche une image (20 Mo au plus).' });
    const donnees = await f.arrayBuffer();
    envoyer({ image: { debut: position(img), nom: f.name, donnees } }, [donnees]);
  }, true);

  addEventListener('dragover', (e) => {
    if (!glisse) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = glisse.de ? 'move' : 'copy';
    cible = viser(e.clientY);
  }, true);
  addEventListener('dragenter', (e) => { if (glisse) e.preventDefault(); }, true);
  addEventListener('drop', (e) => {
    if (!glisse) return;
    e.preventDefault();
    e.stopPropagation();
    const c = cible || viser(e.clientY);
    if (c && glisse.de && c.el !== glisse.de) envoyer({ deplacer: { de: position(glisse.de), vers: position(c.el), apres: c.apres } });
    else if (c && glisse.bloc) envoyer({ deposer: { bloc: glisse.bloc, vers: position(c.el), apres: c.apres } });
    else if (!c && glisse.bloc) envoyer({ deposer: { bloc: glisse.bloc, vers: null, apres: true } });
    finGlisse();
  }, true);
  addEventListener('dragend', finGlisse, true);

  envoyer({ pret: true });
  addEventListener('message', (e) => {
    if (e.source !== parent || !e.data) return;
    // un bloc du panneau Bifrost commence (id) ou arrête (null) d'être glissé
    if ('runeGlisse' in e.data) {
      if (e.data.runeGlisse) { glisse = { bloc: String(e.data.runeGlisse) }; document.documentElement.classList.add('rune-v-glisse'); }
      else finGlisse();
    }
    // Rune a sélectionné un autre élément dans le code : on le montre dans la page
    if ('runeMontrer' in e.data && !edition) {
      const el = document.querySelector(`[data-rune="${Number(e.data.runeMontrer)}"]`);
      if (el === choisi && !choix.hidden) return;
      choisi = el && el.getClientRects().length ? el : null;
      if (choisi) { placer(choix, choisi); choisi.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } else choix.hidden = true;
    }
  });
}

// Le script à ajouter à une page servie : la fonction ci-dessus, lancée avec le chemin du fichier.
function scriptVisuel(fichier) {
  const arg = JSON.stringify(fichier).replace(/</g, '\\u003c');
  return `<script>/* Rune : mode visuel de l'aperçu (ajouté par l'aperçu, absent de ton fichier) */\n(${pageVisuelle.toString()})(${arg});</script>`;
}

module.exports = { scriptVisuel };
