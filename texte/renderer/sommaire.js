// Le sommaire (panneau à gauche de la page) et les titres repliables.
//
// Le sommaire liste les titres (Titre 1 à 6) de la page ; un clic y emmène et y pose le curseur.
//
// Replier un titre cache ce qui le suit, jusqu'au prochain titre de même niveau ou plus haut.
// Rien n'est changé dans la page : ni attribut, ni classe. Les titres repliés sont gardés ici (un Set
// d'éléments par document) et le pliage est une feuille de style à part, dans <head>, qui cache des
// enfants de la page par leur rang (:nth-child). Les formats (docx, odt…) lisent la page : ils
// enregistrent donc tout le texte, replié ou non. Le pliage n'est pas enregistré dans le fichier.
//
// Attention : innerText ne voit pas le texte caché. Pour lire tout le texte, passer par Sommaire.texte().

const Sommaire = (() => {
  const panneau = $('#sommaire');
  const liste = $('#sommaire-liste');
  const defilement = $('#defilement');
  const zone = $('#zone');
  const calque = el('div', { id: 'replis-calque' });
  defilement.append(calque);
  const feuilleStyle = el('style', { id: 'style-replis' });
  document.head.append(feuilleStyle);

  let doc = null;
  let ouvert = true;
  let quandBasculer = null; // App enregistre le réglage
  const replis = new WeakMap(); // page → Set des titres repliés

  const estTitre = (n) => n?.nodeType === 1 && /^H[1-6]$/.test(n.tagName);
  const niveau = (h) => Number(h.tagName[1]);
  const setDe = (page) => { let s = replis.get(page); if (!s) replis.set(page, s = new Set()); return s; };
  const idPage = (page) => { if (!page.id) page.id = `feuille-${Math.random().toString(36).slice(2, 9)}`; return page.id; };

  // Ce qui suit un titre de la page (enfant direct) : ses blocs jusqu'au prochain titre de niveau ≤.
  function section(h) {
    const blocs = [];
    for (let n = h.nextElementSibling; n && !(estTitre(n) && niveau(n) <= niveau(h)); n = n.nextElementSibling) blocs.push(n);
    return blocs;
  }
  const pliable = (h, page) => estTitre(h) && h.parentNode === page && !h.hasAttribute('data-sentinelle');

  // Les titres repliés qui cachent ce nœud (pour les déplier quand on y va).
  function replisQuiCachent(n, page) {
    let bloc = n?.nodeType === 1 ? n : n?.parentNode;
    while (bloc && bloc.parentNode !== page) bloc = bloc.parentNode;
    if (!bloc) return [];
    const res = [];
    for (const h of setDe(page)) if (section(h).includes(bloc)) res.push(h);
    return res;
  }

  // --- La feuille de style du pliage ---
  function ecrireStyle() {
    const regles = [];
    for (const page of $$('#pages > .feuille')) {
      const s = replis.get(page);
      if (!s?.size) continue;
      const enfants = [...page.children];
      for (const h of [...s]) {
        if (!h.isConnected || !pliable(h, page)) { s.delete(h); continue; }
        const i = enfants.indexOf(h) + 1;
        const blocs = section(h);
        const sel = `#${CSS.escape(idPage(page))} > :nth-child(`;
        regles.push(`${sel}${i})::after { content: "  ⋯"; color: #8b8b8b; font-weight: normal; }`);
        if (blocs.length) regles.push(`${sel}n+${i + 1}):nth-child(-n+${i + blocs.length}) { display: none !important; }`);
      }
    }
    const css = regles.join('\n');
    if (feuilleStyle.textContent !== css) feuilleStyle.textContent = css;
  }

  // Lire quelque chose de la page comme si rien n'était replié (innerText, hauteur…).
  function sansReplis(fn) {
    if (!feuilleStyle.textContent) return fn();
    feuilleStyle.disabled = true;
    try { return fn(); } finally { feuilleStyle.disabled = false; }
  }
  const texte = (page) => sansReplis(() => page.innerText || '');

  // Si le curseur est dans une partie cachée, il revient au bout du titre.
  function sortirCurseur(h) {
    const s = window.getSelection();
    if (!s.rangeCount || !doc) return;
    const n = s.anchorNode;
    if (!section(h).some((b) => b === n || b.contains(n))) return;
    const r = document.createRange();
    r.selectNodeContents(h);
    r.collapse(false);
    s.removeAllRanges();
    s.addRange(r);
    Editeur.memoriser();
  }

  function replier(h, oui) {
    const page = doc?.page;
    if (!page || !pliable(h, page)) return;
    const s = setDe(page);
    const etait = s.has(h);
    if (oui === undefined) oui = !etait;
    if (oui === etait) return;
    if (oui) s.add(h); else s.delete(h);
    ecrireStyle();
    if (oui) sortirCurseur(h);
    rafraichir(true);
  }
  function toutReplier(oui) {
    const page = doc?.page;
    if (!page) return;
    const s = setDe(page);
    s.clear();
    if (oui) for (const h of page.children) if (pliable(h, page) && section(h).length) s.add(h);
    ecrireStyle();
    if (oui) for (const h of s) sortirCurseur(h);
    rafraichir(true);
  }
  // Déplier ce qui cache un nœud (la recherche, un clic dans le sommaire, Claude qui y écrit).
  function montrer(n) {
    const page = doc?.page;
    if (!page) return false;
    const a = replisQuiCachent(n, page);
    if (!a.length) return false;
    for (const h of a) setDe(page).delete(h);
    ecrireStyle();
    rafraichir(true);
    return true;
  }

  // --- Le panneau ---
  function aller(h) {
    const page = doc?.page;
    if (!page) return;
    montrer(h);
    page.focus({ preventScroll: true });
    const r = document.createRange();
    r.selectNodeContents(h);
    r.collapse(true);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
    Editeur.memoriser();
    const zr = defilement.getBoundingClientRect();
    defilement.scrollBy({ top: h.getBoundingClientRect().top - zr.top - 24 });
  }

  function rendreListe() {
    const page = doc?.page;
    const titres = page ? [...page.querySelectorAll('h1, h2, h3, h4, h5, h6')].filter((h) => !h.hasAttribute('data-sentinelle') && h.textContent.trim()) : [];
    if (!titres.length) {
      liste.replaceChildren(el('p', { className: 'sommaire-vide', textContent: 'Aucun titre pour l\'instant. Choisis « Titre 1 », « Titre 2 »… dans le ruban (Ctrl+Alt+1, 2, 3).' }));
      return;
    }
    const s = setDe(page);
    const min = Math.min(...titres.map(niveau));
    const caches = new Set();
    for (const h of s) for (const b of section(h)) { caches.add(b); for (const x of b.querySelectorAll?.('h1, h2, h3, h4, h5, h6') || []) caches.add(x); }
    liste.replaceChildren(...titres.map((h) => {
      const peut = pliable(h, page) && section(h).length > 0;
      const replie = s.has(h);
      const fleche = el('button', {
        className: `sommaire-fleche${peut ? '' : ' invisible'}`,
        title: replie ? 'Déplier' : 'Replier',
        onmousedown: (e) => e.preventDefault(),
        onclick: (e) => { e.stopPropagation(); if (peut) replier(h); },
      }, el('i', { className: `codicon codicon-chevron-${replie ? 'right' : 'down'}` }));
      const nom = (h.textContent || '').replace(/\s+/g, ' ').trim();
      const ligne = el('div', {
        className: `sommaire-ligne${caches.has(h) ? ' cache' : ''}${replie ? ' replie' : ''}`,
        title: nom,
        onmousedown: (e) => e.preventDefault(),
        onclick: () => aller(h),
      }, fleche, el('span', { className: 'sommaire-nom', textContent: nom || '(titre vide)' }));
      ligne.style.paddingLeft = `${4 + (niveau(h) - min) * 14}px`;
      ligne.titre = h;
      return ligne;
    }));
    marquerCourant();
  }

  // Le titre où l'on est (le dernier passé sous le haut de la zone).
  function marquerCourant() {
    const lignes = [...liste.querySelectorAll('.sommaire-ligne')];
    if (!lignes.length) return;
    const haut = defilement.getBoundingClientRect().top + 60;
    let courant = null;
    for (const l of lignes) {
      const r = l.titre.getBoundingClientRect();
      if (!r.height) continue;
      if (r.top <= haut) courant = l; else break;
    }
    courant ||= lignes.find((l) => l.titre.getBoundingClientRect().height);
    for (const l of lignes) l.classList.toggle('actif', l === courant);
    if (courant && ouvert) {
      const lr = courant.getBoundingClientRect(), pr = liste.getBoundingClientRect();
      if (lr.top < pr.top || lr.bottom > pr.bottom) courant.scrollIntoView({ block: 'nearest' });
    }
  }

  // --- Les flèches dans la marge de la page ---
  function placerFleches() {
    const page = doc?.page;
    calque.replaceChildren();
    if (!page || page.hidden) return;
    const s = setDe(page);
    const zr = defilement.getBoundingClientRect();
    for (const h of page.children) {
      if (!pliable(h, page) || !section(h).length) continue;
      const r = h.getBoundingClientRect();
      if (!r.height) continue;
      const replie = s.has(h);
      // Hauteur de la première ligne du titre : la flèche se centre dessus.
      const ligne = Math.min(r.height, parseFloat(getComputedStyle(h).lineHeight) * (parseFloat(page.style.zoom) || 1) || r.height);
      const b = el('button', {
        className: `repli-fleche${replie ? ' replie' : ''}`,
        title: replie ? 'Déplier ce titre' : 'Replier ce titre',
        onmousedown: (e) => e.preventDefault(),
        onclick: () => replier(h),
      }, el('i', { className: `codicon codicon-chevron-${replie ? 'right' : 'down'}` }));
      b.style.top = `${r.top - zr.top + defilement.scrollTop + ligne / 2 - 11}px`;
      b.style.left = `${r.left - zr.left + defilement.scrollLeft - 26}px`;
      b.haut = r.top - zr.top + defilement.scrollTop;
      b.bas = b.haut + r.height;
      calque.append(b);
    }
  }
  // Survoler un titre montre sa flèche.
  defilement.addEventListener('mousemove', (e) => {
    const y = e.clientY - defilement.getBoundingClientRect().top + defilement.scrollTop;
    for (const b of calque.children) b.classList.toggle('survol', y >= b.haut - 4 && y <= b.bas + 4);
  });
  defilement.addEventListener('mouseleave', () => { for (const b of calque.children) b.classList.remove('survol'); });

  // --- Mise à jour ---
  let minuteur = 0;
  function rafraichir(tout = false) {
    clearTimeout(minuteur);
    const faire = () => { ecrireStyle(); placerFleches(); if (ouvert) rendreListe(); disposer(); };
    if (tout) faire(); else minuteur = setTimeout(faire, 150);
  }
  new MutationObserver((ms) => {
    // Les changements de la page active seulement (pas le « hidden » des autres onglets).
    if (doc?.page && ms.some((m) => doc.page === m.target || doc.page.contains(m.target))) rafraichir();
  }).observe($('#pages'), { childList: true, subtree: true, characterData: true });
  const ro = new ResizeObserver(() => rafraichir());
  ro.observe(defilement);
  ro.observe($('#pages'));
  defilement.addEventListener('scroll', () => { if (ouvert) marquerCourant(); }, { passive: true });

  // Écran étroit : le panneau passe par-dessus la page au lieu de la pousser.
  function disposer() {
    if (!ouvert || zone.hidden) return;
    const page = doc?.page;
    const largeurPage = page ? page.getBoundingClientRect().width : 800;
    panneau.classList.toggle('flottant', zone.clientWidth - 248 < largeurPage + 48);
  }

  // Taper sur un titre replié : on le déplie d'abord (sinon on écrirait dans le texte caché).
  document.addEventListener('keydown', (e) => {
    const page = doc?.page;
    if (!page || document.activeElement !== page || !feuilleStyle.textContent) return;
    if (!['Enter', 'Delete', 'Backspace'].includes(e.key)) return;
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const s = setDe(page);
    let bloc = sel.anchorNode;
    while (bloc && bloc.parentNode !== page) bloc = bloc.parentNode;
    if (!bloc) return;
    if (e.key !== 'Backspace' && s.has(bloc)) { replier(bloc, false); return; }
    if (!sel.isCollapsed) { montrer(sel.getRangeAt(0).startContainer); montrer(sel.getRangeAt(0).endContainer); return; }
    // Retour arrière au début du bloc qui suit une partie repliée : on la déplie.
    if (e.key === 'Backspace') {
      const prec = bloc.previousElementSibling;
      if (prec && replisQuiCachent(prec, page).length) montrer(prec);
    }
  }, true);
  // Coller ou lâcher du texte sur un titre replié : on le déplie d'abord (sinon le texte collé
  // tomberait dans la partie cachée).
  for (const t of ['paste', 'drop']) {
    document.addEventListener(t, () => {
      const page = doc?.page;
      const sel = window.getSelection();
      if (!page || !feuilleStyle.textContent || !sel.rangeCount) return;
      let bloc = sel.anchorNode;
      while (bloc && bloc.parentNode !== page) bloc = bloc.parentNode;
      if (bloc && setDe(page).has(bloc)) replier(bloc, false);
    }, true);
  }
    // Copier ce qui contient une partie repliée : le texte caché est copié aussi.
  for (const t of ['copy', 'cut', 'dragstart']) {
    document.addEventListener(t, () => {
      if (!feuilleStyle.textContent) return;
      feuilleStyle.disabled = true;
      setTimeout(() => { feuilleStyle.disabled = false; }, 0);
    }, true);
  }

  function basculer(oui = !ouvert) {
    ouvert = oui;
    panneau.hidden = !ouvert;
    document.body.classList.toggle('sommaire-ouvert', ouvert);
    if (ouvert) { panneau.classList.remove('flottant'); rafraichir(true); }
    quandBasculer?.(ouvert);
  }
  $('#sommaire-fermer').onclick = () => basculer(false);
  $('#sommaire-replier').onclick = () => toutReplier(true);
  $('#sommaire-deplier').onclick = () => toutReplier(false);
  $('#btn-sommaire').onclick = () => basculer();

  return {
    activer(d) { doc = d; rafraichir(true); },
    initialiser(o, f) { quandBasculer = null; basculer(o); quandBasculer = f; },
    basculer,
    estOuvert: () => ouvert,
    rafraichir: () => rafraichir(true),
    replier,
    toutReplier,
    montrer,
    sansReplis,
    texte,
  };
})();
