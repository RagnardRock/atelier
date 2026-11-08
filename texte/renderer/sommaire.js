// Le sommaire (panneau à gauche de la page), les titres repliables, les repères et les blocs déroulants.
//
// Le sommaire liste les titres (Titre 1 à 6), les repères (un paragraphe marqué data-repere, bouton
// signet du ruban) et les blocs déroulants (<blockquote data-bloc>, dont la première ligne est le
// titre). Un clic y emmène et y pose le curseur.
//
// Ce qui se replie :
//   - un titre de la page : ce qui le suit, jusqu'au prochain titre de même niveau ou plus haut ;
//   - un bloc déroulant : tout sauf sa première ligne.
// Rien n'est changé dans la page pour replier : ni attribut, ni classe. Les éléments repliés sont
// gardés ici (un Set par page) et le pliage est une feuille de style à part, dans <head>, qui cache
// des éléments par leur chemin (:nth-child). Les formats (docx, odt…) lisent la page : ils
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
  const replis = new WeakMap(); // page → Set des titres et blocs repliés

  const TITRES = 'h1, h2, h3, h4, h5, h6';
  const estTitre = (n) => n?.nodeType === 1 && /^H[1-6]$/.test(n.tagName);
  const estBloc = (n) => n?.nodeType === 1 && n.tagName === 'BLOCKQUOTE' && n.hasAttribute('data-bloc');
  const niveau = (h) => Number(h.tagName[1]);
  const setDe = (page) => { let s = replis.get(page); if (!s) replis.set(page, s = new Set()); return s; };
  const idPage = (page) => { if (!page.id) page.id = `feuille-${Math.random().toString(36).slice(2, 9)}`; return page.id; };

  // Ce qui suit un titre de la page (enfant direct) : ses blocs jusqu'au prochain titre de niveau ≤.
  function section(h) {
    const blocs = [];
    for (let n = h.nextElementSibling; n && !(estTitre(n) && niveau(n) <= niveau(h)); n = n.nextElementSibling) blocs.push(n);
    return blocs;
  }
  const pliable = (x, page) => x?.isConnected && page.contains(x) && !x.hasAttribute('data-sentinelle')
    && ((estTitre(x) && x.parentNode === page) || estBloc(x));
  // Ce que cache un élément replié, et sa ligne visible (le titre, ou la première ligne du bloc).
  const contenu = (x) => (estBloc(x) ? [...x.children].slice(1) : section(x));
  const ligneTitre = (x) => (estBloc(x) ? x.firstElementChild || x : x);
  const dans = (liste, n) => liste.some((b) => b === n || b.contains(n));

  // Les éléments repliés qui cachent ce nœud (pour les déplier quand on y va).
  function replisQuiCachent(n, page) {
    if (n?.nodeType !== 1) n = n?.parentNode;
    if (!n) return [];
    return [...setDe(page)].filter((x) => dans(contenu(x), n));
  }

  // Le sélecteur d'un élément de la page : #feuille > :nth-child(a) > :nth-child(b)…
  function chemin(x, page) {
    const pas = [];
    for (let n = x; n && n !== page; n = n.parentNode) pas.unshift(`:nth-child(${[...n.parentNode.children].indexOf(n) + 1})`);
    return `#${CSS.escape(idPage(page))} > ${pas.join(' > ')}`;
  }

  // --- La feuille de style du pliage ---
  function ecrireStyle() {
    const regles = [];
    for (const page of $$('#pages > .feuille')) {
      const s = replis.get(page);
      if (!s?.size) continue;
      for (const x of [...s]) {
        if (!pliable(x, page)) { s.delete(x); continue; }
        const c = chemin(x, page);
        if (estBloc(x)) {
          regles.push(`${c} > :first-child::after { content: "  ⋯"; color: #8b8b8b; font-weight: normal; }`);
          regles.push(`${c} > :not(:first-child) { display: none !important; }`);
        } else {
          regles.push(`${c}::after { content: "  ⋯"; color: #8b8b8b; font-weight: normal; }`);
          const i = [...page.children].indexOf(x) + 1;
          const n = section(x).length;
          if (n) regles.push(`#${CSS.escape(idPage(page))} > :nth-child(n+${i + 1}):nth-child(-n+${i + n}) { display: none !important; }`);
        }
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

  // Si le curseur est dans une partie cachée, il revient au bout de la ligne visible.
  function sortirCurseur(x) {
    const s = window.getSelection();
    if (!s.rangeCount || !doc) return;
    if (!dans(contenu(x), s.anchorNode)) return;
    const r = document.createRange();
    r.selectNodeContents(ligneTitre(x));
    r.collapse(false);
    s.removeAllRanges();
    s.addRange(r);
    Editeur.memoriser();
  }

  function replier(x, oui) {
    const page = doc?.page;
    if (!page || !pliable(x, page)) return;
    const s = setDe(page);
    const etait = s.has(x);
    if (oui === undefined) oui = !etait;
    if (oui === etait) return;
    if (oui) s.add(x); else s.delete(x);
    ecrireStyle();
    if (oui) sortirCurseur(x);
    rafraichir(true);
  }
  const pliables = (page) => [...page.children].filter((h) => estTitre(h)).concat([...page.querySelectorAll('blockquote[data-bloc]')])
    .filter((x) => pliable(x, page) && contenu(x).length);
  function toutReplier(oui) {
    const page = doc?.page;
    if (!page) return;
    const s = setDe(page);
    s.clear();
    if (oui) for (const x of pliables(page)) s.add(x);
    ecrireStyle();
    if (oui) for (const x of s) sortirCurseur(x);
    rafraichir(true);
  }
  // Déplier ce qui cache un nœud (la recherche, un clic dans le sommaire, un collage).
  function montrer(n) {
    const page = doc?.page;
    if (!page) return false;
    const a = replisQuiCachent(n, page);
    if (!a.length) return false;
    for (const x of a) setDe(page).delete(x);
    ecrireStyle();
    rafraichir(true);
    return true;
  }

  // --- Le panneau ---
  function aller(x) {
    const page = doc?.page;
    if (!page) return;
    montrer(x);
    page.focus({ preventScroll: true });
    const r = document.createRange();
    r.selectNodeContents(ligneTitre(x));
    r.collapse(true);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
    Editeur.memoriser();
    const zr = defilement.getBoundingClientRect();
    defilement.scrollBy({ top: x.getBoundingClientRect().top - zr.top - 24 });
  }

  // Les entrées du sommaire, dans l'ordre du document.
  function entrees(page) {
    const res = [];
    for (const x of page.querySelectorAll(`${TITRES}, [data-repere], blockquote[data-bloc]`)) {
      if (x.hasAttribute('data-sentinelle')) continue;
      if (estTitre(x)) { if (x.textContent.trim()) res.push({ x, type: 'titre' }); continue; }
      if (estBloc(x)) { res.push({ x, type: 'bloc' }); continue; }
      if (x.querySelector(TITRES) || !x.textContent.trim()) continue;
      res.push({ x, type: 'repere' });
    }
    return res;
  }

  function rendreListe() {
    const page = doc?.page;
    const items = page ? entrees(page) : [];
    if (!items.length) {
      liste.replaceChildren(el('p', { className: 'sommaire-vide', textContent: 'Aucun titre pour l\'instant. Choisis « Titre 1 », « Titre 2 »… dans le ruban (Ctrl+Alt+1, 2, 3), ou marque un paragraphe d\'un repère (bouton signet du ruban).' }));
      return;
    }
    const s = setDe(page);
    const titres = items.filter((i) => i.type === 'titre');
    const min = titres.length ? Math.min(...titres.map((i) => niveau(i.x))) : 1;
    let dernier = -1; // retrait du dernier titre (-1 : pas encore de titre)
    liste.replaceChildren(...items.map(({ x, type }) => {
      let retrait;
      if (type === 'titre') retrait = dernier = niveau(x) - min;
      else {
        let profondeur = 0;
        for (let n = x.parentNode; n && n !== page; n = n.parentNode) if (estBloc(n)) profondeur++;
        retrait = dernier + 1 + profondeur;
      }
      const peut = type !== 'repere' && pliable(x, page) && contenu(x).length > 0;
      const replie = s.has(x);
      const icone = type === 'repere' ? 'bookmark' : `chevron-${replie ? 'right' : 'down'}`;
      const fleche = el('button', {
        className: `sommaire-fleche${peut || type === 'repere' ? '' : ' invisible'}${type === 'repere' ? ' signet' : ''}`,
        title: type === 'repere' ? 'Repère' : replie ? 'Déplier' : 'Replier',
        onmousedown: (e) => e.preventDefault(),
        onclick: (e) => { e.stopPropagation(); if (peut) replier(x); else aller(x); },
      }, el('i', { className: `codicon codicon-${icone}` }));
      const nom = (ligneTitre(x).textContent || '').replace(/\s+/g, ' ').trim();
      const ligne = el('div', {
        className: `sommaire-ligne type-${type}${replisQuiCachent(x, page).length ? ' cache' : ''}${replie ? ' replie' : ''}`,
        title: nom,
        // Garder le curseur dans la page ; sauf sur un titre, qu'on peut glisser (le clic y remet le curseur).
        onmousedown: (e) => { if (!(type === 'titre' && x.parentNode === page)) e.preventDefault(); },
        onclick: () => aller(x),
      }, fleche, el('span', { className: 'sommaire-nom', textContent: nom || (type === 'bloc' ? '(bloc sans titre)' : '(vide)') }));
      if (type === 'titre' && x.parentNode === page) ligne.draggable = true;
      ligne.style.paddingLeft = `${4 + retrait * 14}px`;
      ligne.titre = x;
      return ligne;
    }));
    marquerCourant();
  }

  // L'entrée où l'on est (la dernière passée sous le haut de la zone).
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

  // --- Les flèches (et les signets des repères) dans la marge de la page ---
  function placerFleches() {
    const page = doc?.page;
    calque.replaceChildren();
    if (!page || page.hidden) return;
    const s = setDe(page);
    const zr = defilement.getBoundingClientRect();
    const zoom = parseFloat(page.style.zoom) || 1;
    const poser = (b, x, ligne) => {
      const r = x.getBoundingClientRect(), rl = ligne.getBoundingClientRect();
      // Hauteur de la première ligne : la flèche se centre dessus.
      const h = Math.min(rl.height, parseFloat(getComputedStyle(ligne).lineHeight) * zoom || rl.height);
      b.style.top = `${rl.top - zr.top + defilement.scrollTop + h / 2 - 11}px`;
      b.style.left = `${Math.min(r.left, rl.left) - zr.left + defilement.scrollLeft - 26}px`;
      b.haut = rl.top - zr.top + defilement.scrollTop;
      b.bas = b.haut + rl.height;
      calque.append(b);
    };
    for (const x of pliables(page)) {
      const ligne = ligneTitre(x);
      if (!x.getBoundingClientRect().height || !ligne.getBoundingClientRect().height) continue;
      const replie = s.has(x);
      poser(el('button', {
        className: `repli-fleche${replie ? ' replie' : ''}${estBloc(x) ? ' bloc' : ''}`,
        title: replie ? 'Déplier' : 'Replier',
        onmousedown: (e) => e.preventDefault(),
        onclick: () => replier(x),
      }, el('i', { className: `codicon codicon-chevron-${replie ? 'right' : 'down'}` })), x, ligne);
    }
    for (const { x, type } of entrees(page)) {
      if (type !== 'repere' || !x.getBoundingClientRect().height) continue;
      poser(el('span', { className: 'repere-marque', title: 'Repère (dans le sommaire)' }, el('i', { className: 'codicon codicon-bookmark' })), x, x);
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
  }).observe($('#pages'), { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['data-repere', 'data-bloc'] });
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

  // L'élément replié dont la ligne visible contient ce nœud.
  const repliSurLigne = (n, page) => [...setDe(page)].find((x) => ligneTitre(x) === n || ligneTitre(x).contains(n));

  // Taper sur un titre replié : on le déplie d'abord (sinon on écrirait dans le texte caché).
  document.addEventListener('keydown', (e) => {
    const page = doc?.page;
    if (!page || document.activeElement !== page || !feuilleStyle.textContent) return;
    if (!['Enter', 'Delete', 'Backspace'].includes(e.key)) return;
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    if (!sel.isCollapsed) { montrer(sel.getRangeAt(0).startContainer); montrer(sel.getRangeAt(0).endContainer); return; }
    const sur = repliSurLigne(sel.anchorNode, page);
    if (e.key !== 'Backspace' && sur) { replier(sur, false); return; }
    // Retour arrière au début d'un bloc qui suit une partie repliée : on la déplie.
    if (e.key === 'Backspace') {
      let b = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentNode;
      while (b && b !== page && !/^(P|H[1-6]|LI|PRE|DIV|BLOCKQUOTE|TABLE)$/.test(b.tagName)) b = b.parentNode;
      if (!b || b === page) return;
      const avant = document.createRange(); avant.selectNodeContents(b); avant.setEnd(sel.anchorNode, sel.anchorOffset);
      if (avant.toString().length) return;
      for (let n = b; n && n !== page; n = n.parentNode) {
        const prec = n.previousElementSibling;
        if (prec) {
          if (setDe(page).has(prec) && estBloc(prec)) replier(prec, false);
          else montrer(prec);
          return;
        }
      }
    }
  }, true);
  // Coller ou lâcher du texte sur un titre replié : on le déplie d'abord (sinon le texte collé
  // tomberait dans la partie cachée).
  for (const t of ['paste', 'drop']) {
    document.addEventListener(t, () => {
      const page = doc?.page;
      const sel = window.getSelection();
      if (!page || !feuilleStyle.textContent || !sel.rangeCount) return;
      const sur = repliSurLigne(sel.anchorNode, page);
      if (sur) replier(sur, false);
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

  // --- Le plan : changer le niveau d'un titre avec ses sous-titres, déplacer une partie ---
  //
  // Une « partie » : un titre de la page et tout ce qui le suit jusqu'au prochain titre de niveau ≤.
  // Tout passe par Editeur.remplacerBlocs (un seul insertHTML) : un seul Ctrl+Z défait le changement.
  const vrais = (page) => [...page.children].filter((x) => !x.hasAttribute('data-sentinelle'));
  const partie = (h) => [h, ...section(h)].filter((x) => !x.hasAttribute('data-sentinelle'));
  const html = (blocs) => blocs.map((x) => x.outerHTML).join('');
  // Le bloc de la page (enfant direct) qui contient ce nœud.
  function blocDePage(n, page) {
    for (let b = n?.nodeType === 3 ? n.parentNode : n; b && b !== page; b = b.parentNode) if (b.parentNode === page) return b;
    return null;
  }
  // Le titre dont dépend un bloc : lui-même, ou le premier titre au-dessus.
  function titreDe(b) {
    for (let n = b; n; n = n.previousElementSibling) if (estTitre(n) && !n.hasAttribute('data-sentinelle') && n.textContent.trim()) return n;
    return null;
  }
  // Les titres choisis : celui du curseur, ou ceux de la sélection (chacun avec ses sous-titres).
  function titresChoisis(page) {
    if (!Editeur.restaurer()) return [];
    const r = Editeur.selection();
    if (!r) return [];
    const debut = blocDePage(r.startContainer, page) || vrais(page)[0];
    const fin = blocDePage(r.endContainer, page) || debut;
    if (!debut) return [];
    const blocs = vrais(page);
    const choisis = blocs.slice(blocs.indexOf(debut), blocs.indexOf(fin) + 1).filter((x) => estTitre(x) && x.textContent.trim());
    if (!choisis.length) { const t = titreDe(debut); if (t) choisis.push(t); }
    const tous = new Set();
    for (const t of choisis) for (const x of partie(t)) if (estTitre(x)) tous.add(x);
    return blocs.filter((x) => tous.has(x));
  }
  // Un titre au nouveau niveau, mêmes attributs et même contenu. Un style créé pour un autre niveau
  // de titre est enlevé (le titre prend l'aspect de son nouveau niveau).
  function auNiveau(h, n) {
    const t = document.createElement(`h${n}`);
    for (const a of h.attributes) t.setAttribute(a.name, a.value);
    const st = t.dataset.style && StylesDoc.get(doc, t.dataset.style);
    if (st && st.balise !== `h${n}`) t.removeAttribute('data-style');
    t.innerHTML = h.innerHTML;
    return t.outerHTML;
  }
  // delta -1 : monter d'un niveau (Titre 2 → Titre 1) ; +1 : descendre (Titre 1 → Titre 2).
  function decaler(delta) {
    const page = doc?.page;
    if (!page) return;
    const titres = titresChoisis(page);
    if (!titres.length) { notify('Mets le curseur dans un titre (ou dans son texte) pour changer son niveau.', 'info', 4000); return; }
    if (titres.some((h) => niveau(h) + delta < 1)) { notify('Un de ces titres est déjà un Titre 1 : il ne peut pas monter plus haut.', 'info', 4000); return; }
    if (titres.some((h) => niveau(h) + delta > 6)) { notify('Un de ces titres est déjà un Titre 6 : il ne peut pas descendre plus bas.', 'info', 4000); return; }
    const blocs = vrais(page);
    const a = blocs.indexOf(titres[0]), b = blocs.indexOf(titres[titres.length - 1]);
    const zone = blocs.slice(a, b + 1);
    const changes = new Set(titres);
    const replies = zone.map((x) => setDe(page).has(x));
    Editeur.remplacerBlocs(zone[0], zone[zone.length - 1], zone.map((x) => (changes.has(x) ? auNiveau(x, niveau(x) + delta) : x.outerHTML)).join(''));
    garderReplis(page, a, replies);
  }
  // Après un remplacement, les mêmes parties restent repliées (les blocs sont neufs).
  function garderReplis(page, depuis, replies) {
    const s = setDe(page);
    const blocs = vrais(page);
    replies.forEach((oui, i) => { if (oui && blocs[depuis + i]) s.add(blocs[depuis + i]); });
    for (const x of [...s]) if (!x.isConnected) s.delete(x);
    rafraichir(true);
  }
  // Mettre une partie juste avant un bloc de la page (null : à la fin du document).
  function deplacerPartie(h, avant) {
    const page = doc?.page;
    if (!page || !estTitre(h) || h.parentNode !== page) return false;
    const blocs = vrais(page);
    const S = partie(h);
    const a = blocs.indexOf(S[0]), b = blocs.indexOf(S[S.length - 1]);
    let t = avant ? blocs.indexOf(avant) : blocs.length;
    if (t < 0 || (t >= a && t <= b + 1)) return false; // dans la partie elle-même, ou déjà là
    let zone, nouvel, cible;
    if (t < a) { zone = blocs.slice(t, b + 1); nouvel = [...S, ...blocs.slice(t, a)]; cible = 0; }
    else { zone = blocs.slice(a, t); nouvel = [...blocs.slice(b + 1, t), ...S]; cible = t - b - 1; }
    const debut = Math.min(a, t);
    const replies = nouvel.map((x) => setDe(page).has(x));
    Editeur.remplacerBlocs(zone[0], zone[zone.length - 1], html(nouvel), { cible });
    garderReplis(page, debut, replies);
    return true;
  }
  // sens -1 : remonter la partie du curseur avant la précédente ; +1 : la descendre après la suivante.
  function deplacer(sens) {
    const page = doc?.page;
    if (!page) return;
    const h = titresChoisis(page)[0];
    if (!h) { notify('Mets le curseur dans un titre (ou dans son texte) pour déplacer sa partie.', 'info', 4000); return; }
    const blocs = vrais(page);
    const S = partie(h);
    let ok = false;
    if (sens < 0) {
      // Avant le titre précédent de même niveau ou plus haut (ou avant le texte du tout début).
      let p = null;
      for (let i = blocs.indexOf(h) - 1; i >= 0; i--) if (estTitre(blocs[i]) && blocs[i].textContent.trim() && niveau(blocs[i]) <= niveau(h)) { p = blocs[i]; break; }
      const i = blocs.indexOf(h);
      if (p) ok = deplacerPartie(h, p);
      else if (i > 0) ok = deplacerPartie(h, blocs[0]);
    } else {
      const n = blocs[blocs.indexOf(S[S.length - 1]) + 1];
      if (n) {
        // Même niveau : après sa partie ; niveau plus haut : sous ce titre, après son texte d'intro.
        let fin;
        if (niveau(n) === niveau(h)) { const Q = partie(n); fin = blocs[blocs.indexOf(Q[Q.length - 1]) + 1] || null; }
        else { let i = blocs.indexOf(n) + 1; while (blocs[i] && !estTitre(blocs[i])) i++; fin = blocs[i] || null; }
        ok = deplacerPartie(h, fin);
      }
    }
    if (!ok) notify(sens < 0 ? 'Cette partie est déjà tout en haut.' : 'Cette partie est déjà tout en bas.', 'info', 3000);
  }
  // Le menu du plan (clic droit dans le sommaire, menu Format, clic droit dans la page).
  const ctrlAlt = 'Alt+Maj+';
  const elementsPlan = () => [
    { label: 'Monter le titre d\'un niveau', keys: `${ctrlAlt}←`, icone: 'arrow-left', run: () => decaler(-1) },
    { label: 'Descendre le titre d\'un niveau', keys: `${ctrlAlt}→`, icone: 'arrow-right', run: () => decaler(1) },
    { label: 'Remonter la partie', keys: `${ctrlAlt}↑`, icone: 'arrow-up', run: () => deplacer(-1) },
    { label: 'Descendre la partie', keys: `${ctrlAlt}↓`, icone: 'arrow-down', run: () => deplacer(1) },
  ];
  document.addEventListener('keydown', (e) => {
    const page = doc?.page;
    if (!page || !e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey || Dialogs.isOpen()) return;
    if (document.activeElement !== page && !liste.contains(document.activeElement)) return;
    const f = { ArrowLeft: () => decaler(-1), ArrowRight: () => decaler(1), ArrowUp: () => deplacer(-1), ArrowDown: () => deplacer(1) }[e.key];
    if (!f) return;
    e.preventDefault();
    f();
  }, true);
  // Clic droit sur un titre du sommaire.
  liste.addEventListener('contextmenu', (e) => {
    const l = e.target.closest('.sommaire-ligne');
    if (!l || !estTitre(l.titre)) return;
    e.preventDefault();
    aller(l.titre);
    Menus.ouvrir(e.clientX, e.clientY, elementsPlan());
  });
  // Glisser un titre du sommaire : sa partie part avec lui. Lâché sur la moitié haute d'un titre, elle
  // va avant lui ; sur la moitié basse, avant le titre suivant (donc dans la partie de celui-ci).
  let glisse = null;
  const repere = el('div', { className: 'sommaire-depot', hidden: true });
  liste.after(repere);
  function ouDeposer(e) {
    const lignes = [...liste.querySelectorAll('.sommaire-ligne.type-titre')].filter((l) => l.offsetParent);
    const l = e.target.closest?.('.sommaire-ligne.type-titre');
    if (!l || !glisse) return null;
    const r = l.getBoundingClientRect();
    const bas = e.clientY > r.top + r.height / 2;
    const i = lignes.indexOf(l);
    const suivante = bas ? lignes[i + 1] : l;
    const page = doc.page;
    const avant = suivante ? suivante.titre : null;
    if (avant && avant.parentNode !== page) return null;
    if (avant && partie(glisse).includes(avant) && avant !== glisse) return null;
    return { avant, y: bas ? r.bottom : r.top, l };
  }
  liste.addEventListener('dragstart', (e) => {
    const l = e.target.closest('.sommaire-ligne.type-titre');
    if (!l || l.titre.parentNode !== doc?.page) { e.preventDefault(); return; }
    glisse = l.titre;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/x-edda-partie', '');
    l.classList.add('glisse');
  });
  liste.addEventListener('dragover', (e) => {
    const o = ouDeposer(e);
    repere.hidden = !o;
    if (!o) return;
    e.preventDefault();
    const pr = panneau.getBoundingClientRect();
    repere.style.top = `${o.y - pr.top - 1}px`;
  });
  liste.addEventListener('dragleave', (e) => { if (!liste.contains(e.relatedTarget)) repere.hidden = true; });
  liste.addEventListener('drop', (e) => {
    const o = ouDeposer(e);
    repere.hidden = true;
    if (!o) return;
    e.preventDefault();
    const h = glisse;
    glisse = null;
    deplacerPartie(h, o.avant);
  });
  // Lâché ailleurs (dans la page) : rien ne se passe (le texte du titre n'est pas collé).
  document.addEventListener('drop', (e) => { if (glisse && !liste.contains(e.target)) { e.preventDefault(); e.stopPropagation(); } }, true);
  liste.addEventListener('dragend', () => { glisse = null; repere.hidden = true; for (const x of liste.querySelectorAll('.glisse')) x.classList.remove('glisse'); });

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
    decaler,
    deplacer,
    elementsPlan,
  };
})();
