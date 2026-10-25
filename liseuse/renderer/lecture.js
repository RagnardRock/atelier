// La vue de lecture : le livre ouvert avec foliate-js, en pages (une, deux ou trois colonnes selon la
// largeur) ou en défilement continu ; le sommaire, les surlignages, les marque-pages et la recherche à
// gauche ; les réglages de lecture (bouton Aa) à droite ; la progression en bas.
//
// Où tu en es est gardé au fil de l'eau dans la fiche du livre (position exacte au caractère près,
// une « CFI » d'EPUB), ce qui permet de reprendre à la même phrase même après avoir changé la taille
// du texte. Les surlignages sont gardés de la même façon, avec le passage et ta note.

import { etat, ecrireConfig, ecrireLecturePlusTard } from './etat.js';
import { ouvrirLivre, chapitres, nomLangue, langueDe } from './livre.js';
import { Overlayer } from './foliate/overlayer.js';
import { Bibliotheque } from './bibliotheque.js';

const K = window.kenning;

// Les couleurs de surlignage (les mêmes noms pour Loki).
export const COULEURS = {
  jaune: { nom: 'Jaune', couleur: '#ffd34d' },
  vert: { nom: 'Vert', couleur: '#6fdc8c' },
  bleu: { nom: 'Bleu', couleur: '#6cb4ff' },
  rose: { nom: 'Rose', couleur: '#ff86bd' },
};

// Les thèmes de lecture : fond et texte des pages (aussi dans style.css, #vue-lecture[data-theme]).
const THEMES = {
  sombre: { nom: 'Sombre', fond: '#17171d', texte: '#d9d6e2', lien: '#a9b8ff' },
  nuit: { nom: 'Nuit', fond: '#000000', texte: '#b9b6c2', lien: '#8f9fe0' },
  sepia: { nom: 'Sépia', fond: '#f2e7cf', texte: '#4a3a26', lien: '#8a4b1c' },
  clair: { nom: 'Clair', fond: '#fbfaf6', texte: '#1f1e24', lien: '#2c55c8' },
};

// Les polices proposées. Les trois premières sont livrées avec Kenning (polices.css) ; les autres
// sont celles de Windows.
const POLICES = [
  ['Literata', 'Literata (faite pour les liseuses)'],
  ['Atkinson Hyperlegible', 'Atkinson Hyperlegible (très lisible)'],
  ['OpenDyslexic', 'OpenDyslexic (dyslexie)'],
  ['Georgia', 'Georgia'],
  ['Palatino Linotype', 'Palatino'],
  ['Cambria', 'Cambria'],
  ['Segoe UI', 'Segoe UI (sans empattements)'],
  ['Verdana', 'Verdana'],
];
const FICHIERS_POLICES = {
  Literata: ['literata/400.css', 'literata/400-italic.css', 'literata/700.css', 'literata/700-italic.css'],
  'Atkinson Hyperlegible': ['atkinson-hyperlegible/400.css', 'atkinson-hyperlegible/400-italic.css', 'atkinson-hyperlegible/700.css', 'atkinson-hyperlegible/700-italic.css'],
  OpenDyslexic: ['opendyslexic/400.css', 'opendyslexic/400-italic.css', 'opendyslexic/700.css', 'opendyslexic/700-italic.css'],
};

let view = null;        // l'élément <foliate-view>
let book = null;        // le livre (foliate-js)
let fiche = null;       // sa fiche dans la bibliothèque
let lieu = null;        // la dernière position connue (événement relocate de foliate-js)
let ongletCote = 'sommaire';
let selection = null;   // { range, cfi, texte, index } : le passage sélectionné
let rechercheResultats = [];
let delaiPosition = null;
let mesure = null;      // pour mesurer la vitesse de lecture
let surQuitter = () => {};

const ouvert = () => Boolean(view && fiche);
const L = () => etat.config.lecture;

// --- Le style des pages ---

// Le CSS donné au livre : thème, police, taille, interligne, justification. Les livres ont leur
// propre style ; on force seulement ce qui compte pour lire confortablement (couleurs et texte).
function cssLivre() {
  const r = L();
  const t = THEMES[r.theme] || THEMES.sombre;
  const fichiers = !r.policeLivre ? (FICHIERS_POLICES[r.police] || []) : [];
  const police = `"${r.police}", Georgia, serif`;
  return `
    ${fichiers.map((f) => `@import url("kenning://app/node_modules/@fontsource/${f}");`).join('\n')}
    @namespace epub "http://www.idpf.org/2007/ops";
    html {
      color-scheme: ${r.theme === 'sombre' || r.theme === 'nuit' ? 'dark' : 'light'};
      color: ${t.texte} !important;
      background: ${t.fond} !important;
      font-size: ${r.taille}px !important;
    }
    body { background: transparent !important; color: inherit !important; font-size: 1rem !important; }
    body :is(p, div, span, section, article, blockquote, li, dd, dt, h1, h2, h3, h4, h5, h6, td, th, em, i, b, strong, small, cite, sup, sub, font) {
      color: inherit !important; background-color: transparent !important;
    }
    a:link, a:visited { color: ${t.lien} !important; }
    ${!r.policeLivre ? `body, body :is(p, div, span, li, blockquote, dd, dt, td, th, h1, h2, h3, h4, h5, h6, em, i, b, strong, cite) { font-family: ${police} !important; }` : ''}
    p, li, blockquote, dd {
      line-height: ${r.interligne} !important;
      text-align: ${r.justifier ? 'justify' : 'start'};
      -webkit-hyphens: ${r.cesure ? 'auto' : 'manual'};
      hyphens: ${r.cesure ? 'auto' : 'manual'};
      -webkit-hyphenate-limit-before: 3;
      -webkit-hyphenate-limit-after: 2;
      -webkit-hyphenate-limit-lines: 2;
      hanging-punctuation: allow-end last;
      widows: 2; orphans: 2;
    }
    [align="left"] { text-align: left; }
    [align="right"] { text-align: right; }
    [align="center"] { text-align: center; }
    pre { white-space: pre-wrap !important; }
    img, svg { ${r.theme === 'nuit' ? 'opacity: 0.85;' : ''} }
    aside[epub|type~="endnote"], aside[epub|type~="footnote"], aside[epub|type~="note"], aside[epub|type~="rearnote"] { display: none; }
    ::selection { background: rgba(185, 163, 255, 0.4); }
  `;
}

// La mise en page : pages ou défilement, colonnes, marges, largeur du texte.
function appliquerMiseEnPage() {
  if (!view?.renderer) return;
  const r = L();
  const rd = view.renderer;
  rd.setAttribute('flow', r.mode === 'defilement' ? 'scrolled' : 'paginated');
  rd.setAttribute('margin', `${r.marges}px`);
  rd.setAttribute('gap', '6%');
  rd.setAttribute('max-inline-size', `${r.largeur}px`);
  rd.setAttribute('max-column-count', r.colonnes === 'auto' ? '2' : String(r.colonnes));
  if (r.animation) rd.setAttribute('animated', ''); else rd.removeAttribute('animated');
}

function appliquerStyles() {
  const r = L();
  $('#vue-lecture').dataset.theme = r.theme;
  $('#filtre-chaud').style.opacity = String((r.filtreChaud || 0) / 100);
  if (!view?.renderer) return;
  view.renderer.setStyles?.(cssLivre());
  view.style.setProperty('--overlayer-highlight-opacity', r.theme === 'sombre' || r.theme === 'nuit' ? '0.38' : '0.42');
  view.style.setProperty('--overlayer-highlight-blend-mode', r.theme === 'sombre' || r.theme === 'nuit' ? 'screen' : 'multiply');
}

// --- Ouvrir et fermer un livre ---

async function ouvrir(id) {
  const f = Bibliotheque.livre(id);
  if (!f) return;
  if (ouvert() && fiche.id === id) { montrerVue(); return; }
  if (ouvert()) await fermer({ revenir: false });
  fiche = f;
  montrerVue();
  const chargement = $('#lecture-chargement');
  chargement.hidden = false;
  chargement.querySelector('span').textContent = `Ouverture de « ${f.titre} »…`;
  $('#titre-livre').textContent = `${f.titre}${f.auteur ? ` · ${f.auteur}` : ''}`;
  document.title = `${f.titre} · Kenning`;
  try {
    const doc = await K.lireLivre(f.chemin);
    book = await ouvrirLivre({ bytes: doc.bytes, nom: doc.nom });
    view = document.createElement('foliate-view');
    view.addEventListener('relocate', (e) => quandDeplace(e.detail));
    view.addEventListener('load', (e) => quandSectionChargee(e.detail));
    view.addEventListener('create-overlay', () => dessinerSurlignages());
    view.addEventListener('draw-annotation', (e) => {
      const { draw, annotation } = e.detail;
      draw(Overlayer.highlight, { color: COULEURS[annotation.couleur]?.couleur || COULEURS.jaune.couleur });
    });
    view.addEventListener('show-annotation', (e) => montrerSurlignage(e.detail.value, e.detail.range));
    view.addEventListener('external-link', (e) => { e.preventDefault(); window.open(e.detail.a.href, '_blank'); });
    $('#lecture-page').prepend(view);
    await view.open(book);
    appliquerMiseEnPage();
    appliquerStyles();
    await view.init({ lastLocation: f.position || null, showTextStart: !f.position });
    chargement.hidden = true;
    const changes = { lu: Date.now() };
    if (f.statut === 'a-lire') changes.statut = 'en-cours';
    changes.nbChapitres = (await chapitres(book)).length;
    await Bibliotheque.maj(f.id, changes);
    ecrireConfig({ ouvert: f.id }).catch(() => {});
    mesure = null;
    construireBarre();
    construireCote();
    construirePied();
    view.focus();
  } catch (err) {
    chargement.hidden = true;
    notify(cleanError(err), 'error');
    await fermer();
  }
}

async function fermer({ revenir = true } = {}) {
  cacherBulle();
  if (view) {
    sauverPosition();
    try { view.close(); } catch { /* déjà fermé */ }
    view.remove();
  }
  view = null;
  book = null;
  fiche = null;
  lieu = null;
  rechercheResultats = [];
  ecrireConfig({ ouvert: null }).catch(() => {});
  if (revenir) surQuitter();
}

function montrerVue() {
  $('#vue-biblio').hidden = true;
  $('#vue-lecture').hidden = false;
  $('#btn-retour').hidden = false;
  $('#reglages-lecture').hidden = true;
  document.body.classList.add('en-lecture');
  document.body.classList.toggle('sans-cote', !etat.config.coteLecture);
}

// --- Position, progression, temps restant ---

function quandDeplace(detail) {
  lieu = detail;
  majPied();
  majSommaireActif();
  majMarquePage();
  clearTimeout(delaiPosition);
  delaiPosition = setTimeout(sauverPosition, 800);
  mesurerVitesse(detail);
  cacherBulle();
}

function sauverPosition() {
  if (!fiche || !lieu?.cfi) return;
  const changes = { position: lieu.cfi, progression: lieu.fraction || 0, lu: Date.now(), chapitre: lieu.tocItem?.label?.trim() || '' };
  // Arrivé à la dernière page : le livre est terminé.
  if (fiche.statut !== 'termine' && (lieu.fraction >= 0.995 || (lieu.section?.current === lieu.section?.total - 1 && lieu.time?.total < 0.3))) {
    changes.statut = 'termine';
    changes.termineLe = Date.now();
    notify(`Bravo, tu as terminé « ${fiche.titre} » !`, 'success', 6000);
  } else if (fiche.statut === 'a-lire') changes.statut = 'en-cours';
  Bibliotheque.maj(fiche.id, changes).catch(() => {});
}

// La vitesse de lecture se mesure en tournant les pages : quantité de texte lue / temps passé.
// Elle sert à estimer le temps qu'il reste dans le chapitre et dans le livre. Le temps passé sur le
// livre est compté aussi (pauses de plus de 2 minutes ignorées).
function mesurerVitesse(detail) {
  const maintenant = Date.now();
  const pos = detail.location?.current ?? 0;
  if (mesure && fiche) {
    const dt = (maintenant - mesure.t) / 1000;
    if (dt > 0 && dt < 120) fiche.tempsLecture = (fiche.tempsLecture || 0) + dt;
    const avance = pos - mesure.pos;
    if (dt >= 4 && dt <= 300 && avance > 0 && avance <= 3) {
      const vitesse = (avance * 1500) / (dt / 60); // octets par minute (une « position » foliate = 1 500 octets)
      const ancienne = etat.config.vitesse || 1600;
      etat.config.vitesse = Math.round(Math.min(8000, Math.max(300, ancienne * 0.92 + vitesse * 0.08)));
      mesure.n = (mesure.n || 0) + 1;
      if (mesure.n % 10 === 0) ecrireConfig({ vitesse: etat.config.vitesse }).catch(() => {});
    }
    if (mesure.n && mesure.n % 5 === 0) Bibliotheque.maj(fiche.id, { tempsLecture: Math.round(fiche.tempsLecture) }).catch(() => {});
  }
  mesure = { t: maintenant, pos, n: mesure?.n || 0 };
}

const facteurVitesse = () => 1600 / (etat.config.vitesse || 1600); // foliate-js compte 1 600 octets par minute

// --- Barre d'outils ---

function construireBarre() {
  const barre = $('#lecture-barre');
  barre.innerHTML = '';
  const champ = el('input', { type: 'search', className: 'recherche', placeholder: 'Chercher dans le livre', spellcheck: false });
  champ.onkeydown = (e) => { if (e.key === 'Enter') chercher(champ.value); if (e.key === 'Escape') { champ.value = ''; viderRecherche(); view?.focus(); } };
  barre.append(
    el('div', { className: 'groupe' },
      bouton('list-tree', 'Sommaire, surlignages et marque-pages (Ctrl+B)', () => basculerCote()),
      bouton('chevron-left', 'Page précédente (←)', () => view?.goLeft()),
      bouton('chevron-right', 'Page suivante (→)', () => view?.goRight())),
    el('span', { className: 'chapitre-courant', id: 'chapitre-courant' }),
    el('div', { className: 'groupe-recherche' }, el('i', { className: 'codicon codicon-search' }), champ),
    el('div', { className: 'groupe' },
      bouton('bookmark', 'Marque-page sur cette page (Ctrl+D)', () => basculerMarquePage()),
      bouton('text-size', 'Réglages de lecture : police, taille, thème… (Ctrl+T)', () => basculerReglages()),
      bouton('screen-full', 'Plein écran sans interface (F11)', () => pleinEcran()),
      bouton('info', 'Fiche du livre', () => Bibliotheque.fiche(fiche.id))));
  barre.querySelector('.codicon-bookmark').parentElement.id = 'btn-marque-page';
  barre.querySelector('.codicon-text-size').parentElement.id = 'btn-aa';
}

function basculerCote(montrer = !etat.config.coteLecture) {
  etat.config.coteLecture = montrer;
  document.body.classList.toggle('sans-cote', !montrer);
  ecrireConfig({ coteLecture: montrer }).catch(() => {});
}

// --- Colonne de gauche ---

function construireCote() {
  const cote = $('#lecture-cote');
  cote.innerHTML = '';
  const onglets = [['sommaire', 'list-tree', 'Sommaire'], ['surlignages', 'symbol-color', 'Notes'], ['marques', 'bookmark', 'Pages'], ['recherche', 'search', 'Chercher']];
  const barre = el('div', { className: 'cote-onglets' });
  for (const [id, icone, nom] of onglets) {
    barre.append(el('button', { type: 'button', className: `cote-onglet${ongletCote === id ? ' actif' : ''}`, title: nom, onclick: () => { ongletCote = id; construireCote(); } }, el('i', { className: `codicon codicon-${icone}` }), el('span', { textContent: nom })));
  }
  const entete = el('div', { className: 'cote-livre' }, Bibliotheque.couverture(fiche), el('div', {}, el('b', { textContent: fiche.titre }), el('span', { textContent: [fiche.auteur, nomLangue(fiche.langue)].filter(Boolean).join(' · ') })));
  const contenu = el('div', { className: 'cote-contenu', id: 'cote-contenu' });
  cote.append(entete, barre, contenu);
  if (ongletCote === 'sommaire') rendreSommaire(contenu);
  else if (ongletCote === 'surlignages') rendreSurlignages(contenu);
  else if (ongletCote === 'marques') rendreMarquePages(contenu);
  else rendreRecherche(contenu);
}

function rendreSommaire(contenu) {
  const ajouter = (items, niveau) => {
    for (const it of items || []) {
      const b = el('button', { type: 'button', className: 'sommaire-item', title: it.label?.trim(), style: { paddingLeft: `${10 + niveau * 14}px` }, onclick: () => { view.goTo(it.href); } },
        el('span', { className: 'sommaire-nom', textContent: it.label?.trim() || '(sans titre)' }));
      b.dataset.href = it.href;
      contenu.append(b);
      if (it.subitems?.length) ajouter(it.subitems, niveau + 1);
    }
  };
  ajouter(book.toc, 0);
  if (!book.toc?.length) contenu.append(el('p', { className: 'vide-texte', textContent: 'Ce livre n\'a pas de sommaire.' }));
  majSommaireActif();
}

function majSommaireActif() {
  const href = lieu?.tocItem?.href;
  $('#chapitre-courant') && ($('#chapitre-courant').textContent = lieu?.tocItem?.label?.trim() || '');
  if (ongletCote !== 'sommaire') return;
  let actif = null;
  for (const b of $$('#cote-contenu .sommaire-item')) {
    const oui = b.dataset.href === href;
    b.classList.toggle('actif', oui);
    if (oui) actif = b;
  }
  actif?.scrollIntoView({ block: 'nearest' });
}

// --- Bas de page ---

function construirePied() {
  const pied = $('#lecture-pied');
  pied.innerHTML = '';
  const barre = el('div', { className: 'barre-prog', id: 'barre-prog', title: 'Aller à un endroit du livre' }, el('div', { className: 'rempli' }), el('div', { className: 'curseur' }));
  // Un repère au début de chaque section du livre.
  const fractions = view.getSectionFractions();
  if (fractions.length < 120) for (const f of fractions.slice(1, -1)) barre.append(el('div', { className: 'repere', style: { left: `${f * 100}%` } }));
  barre.onclick = (e) => {
    const r = barre.getBoundingClientRect();
    view.goToFraction(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
  };
  pied.append(el('span', { id: 'pied-chapitre' }), barre, el('span', { id: 'pied-pourcent' }), el('span', { id: 'pied-temps' }));
  majPied();
}

function majPied() {
  if (!lieu || !$('#barre-prog')) return;
  const f = lieu.fraction || 0;
  $('#barre-prog .rempli').style.width = `${f * 100}%`;
  $('#barre-prog .curseur').style.left = `${f * 100}%`;
  const page = lieu.pageItem ? `p. ${lieu.pageItem.label}` : lieu.location ? `${lieu.location.current + 1} / ${lieu.location.total}` : '';
  $('#pied-chapitre').textContent = page;
  $('#pied-chapitre').title = lieu.pageItem ? 'Page de l\'édition imprimée' : 'Position dans le livre (une position ≈ une page)';
  $('#pied-pourcent').textContent = pourcent(f);
  const k = facteurVitesse();
  const chap = (lieu.time?.section || 0) * k;
  $('#pied-temps').textContent = `${duree(chap)} dans ce chapitre`;
  $('#pied-temps').title = `Environ ${duree((lieu.time?.total || 0) * k)} pour finir le livre, à ta vitesse de lecture`;
}

// --- Chaque section chargée : clavier, clics, sélection ---

function quandSectionChargee({ doc, index }) {
  doc.addEventListener('keydown', (e) => clavier(e));
  doc.addEventListener('pointerup', () => setTimeout(() => verifierSelection(doc, index), 10));
  doc.addEventListener('keyup', (e) => { if (e.shiftKey) verifierSelection(doc, index); });
  doc.addEventListener('pointerdown', () => cacherBulle());
  // Clic sur le bord gauche ou droit de la page : page précédente ou suivante (en mode pages).
  doc.addEventListener('click', (e) => {
    if (L().mode === 'defilement' || e.defaultPrevented || e.target.closest?.('a[href]')) return;
    if (!doc.getSelection().isCollapsed) return;
    const cadre = doc.defaultView.frameElement?.getBoundingClientRect();
    const zone = view.getBoundingClientRect();
    if (!cadre) return;
    const x = (cadre.left + e.clientX - zone.left) / zone.width;
    annotationCliquee = false;
    setTimeout(() => {
      if (annotationCliquee) return;
      if (x < 0.22) view.goLeft();
      else if (x > 0.78) view.goRight();
    }, 0);
  });
  // La molette tourne les pages (en mode pages).
  doc.addEventListener('wheel', (e) => molette(e), { passive: true });
}

let annotationCliquee = false;
let derniereMolette = 0;
function molette(e) {
  if (L().mode === 'defilement') return;
  const t = Date.now();
  if (t - derniereMolette < 280 || Math.abs(e.deltaY) < 4) return;
  derniereMolette = t;
  if (e.deltaY > 0) view.next(); else view.prev();
}

// --- Sélection et bulle ---

function rectEcran(range) {
  const doc = range.startContainer.ownerDocument;
  const cadre = doc.defaultView.frameElement?.getBoundingClientRect() || { left: 0, top: 0 };
  const rects = [...range.getClientRects()].filter((r) => r.width > 0);
  const zone = view.getBoundingClientRect();
  // En mode pages, le cadre est très large : on garde la partie du passage visible à l'écran.
  const visibles = rects.map((r) => ({ left: r.left + cadre.left, right: r.right + cadre.left, top: r.top + cadre.top, bottom: r.bottom + cadre.top }))
    .filter((r) => r.right > zone.left && r.left < zone.right);
  const liste = visibles.length ? visibles : [{ left: zone.left + zone.width / 2, right: zone.left + zone.width / 2, top: zone.top + 60, bottom: zone.top + 60 }];
  return { left: Math.min(...liste.map((r) => r.left)), right: Math.max(...liste.map((r) => r.right)), top: Math.min(...liste.map((r) => r.top)), bottom: Math.max(...liste.map((r) => r.bottom)) };
}

function placerBulle(bulle, rect) {
  bulle.hidden = false;
  const b = bulle.getBoundingClientRect();
  let x = (rect.left + rect.right) / 2 - b.width / 2;
  let y = rect.top - b.height - 10;
  if (y < 50) y = rect.bottom + 10;
  x = Math.max(8, Math.min(x, innerWidth - b.width - 8));
  y = Math.max(8, Math.min(y, innerHeight - b.height - 8));
  bulle.style.left = `${x}px`;
  bulle.style.top = `${y}px`;
}

function verifierSelection(doc, index) {
  const sel = doc.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  const texte = sel.toString().replace(/\s+/g, ' ').trim();
  if (!texte) return;
  selection = { range, texte, index, cfi: view.getCFI(index, range) };
  montrerBulleSelection();
}

function montrerBulleSelection() {
  const bulle = $('#bulle-selection');
  bulle.innerHTML = '';
  for (const [cle, c] of Object.entries(COULEURS)) {
    bulle.append(el('button', { type: 'button', className: 'pastille', title: `Surligner en ${c.nom.toLowerCase()}`, style: { background: c.couleur }, onclick: () => { surlignerSelection(cle); } }));
  }
  const unMot = !/\s/.test(selection.texte) && selection.texte.length < 40;
  bulle.append(
    el('span', { className: 'sep' }),
    bouton('note', 'Surligner et écrire une note', () => surlignerSelection('jaune', { note: true })),
    bouton('copy', 'Copier', async () => { await K.copierTexte(selection.texte); notify('Passage copié.', 'success', 2000); cacherBulle(); }),
    bouton('search', 'Chercher dans le livre', () => { const t = selection.texte; cacherBulle(); chercher(t); }),
    el('span', { className: 'sep' }),
    bouton(unMot ? 'symbol-keyword' : 'sparkle', unMot ? 'Que veut dire ce mot ? (Loki)' : 'Expliquer ce passage (Loki)', () => demanderLoki(unMot ? 'mot' : 'passage')));
  placerBulle(bulle, rectEcran(selection.range));
}

function cacherBulle() {
  $('#bulle-selection').hidden = true;
}

// « Expliquer ce passage » et « Que veut dire ce mot ? » : la question part à Loki, avec le
// contexte (livre, langue, chapitre).
function demanderLoki(quoi) {
  const s = selection;
  if (!s) return;
  cacherBulle();
  const langue = nomLangue(fiche.langue || langueDe(book));
  const ou = `dans « ${fiche.titre} »${fiche.auteur ? ` de ${fiche.auteur}` : ''}${lieu?.tocItem?.label ? `, chapitre « ${lieu.tocItem.label.trim()} »` : ''}${langue ? ` (livre en ${langue})` : ''}`;
  const texte = quoi === 'mot'
    ? `Que veut dire le mot « ${s.texte} » ${ou} ? Donne son sens ici, sa forme de base (dictionnaire) et un exemple simple.`
    : `Explique-moi ce passage ${ou} :\n\n« ${s.texte} »`;
  ClaudePanneau.demander(texte, { envoyer: true });
}

// --- Surlignages ---

const surlignages = () => fiche?.surlignages || [];

async function enregistrerSurlignages(liste) {
  fiche.surlignages = liste;
  await Bibliotheque.maj(fiche.id, { surlignages: liste });
  if (ongletCote === 'surlignages') construireCote();
}

function dessinerSurlignages() {
  for (const s of surlignages()) view.addAnnotation({ value: s.cfi, couleur: s.couleur });
}

async function surlignerSelection(couleur, { note = false } = {}) {
  const s = selection;
  if (!s) return;
  cacherBulle();
  s.range.startContainer.ownerDocument.getSelection().removeAllRanges();
  const existant = surlignages().find((x) => x.cfi === s.cfi);
  let entree = existant;
  if (existant) {
    entree = { ...existant, couleur };
    await enregistrerSurlignages(surlignages().map((x) => (x.cfi === s.cfi ? entree : x)));
  } else {
    entree = { id: `s${Date.now().toString(36)}`, cfi: s.cfi, couleur, texte: s.texte.slice(0, 2000), note: '', chapitre: lieu?.tocItem?.label?.trim() || '', fraction: lieu?.fraction || 0, cree: Date.now() };
    await enregistrerSurlignages([...surlignages(), entree]);
  }
  await view.addAnnotation({ value: entree.cfi, couleur });
  if (note) editerNote(entree, rectEcran(s.range));
}

// Surligner un passage donné par son texte (pour Loki) : cherché dans le chapitre affiché, sinon
// dans tout le livre.
async function surlignerTexte(texte, couleur = 'jaune', note = '') {
  if (!ouvert()) throw new Error('Aucun livre ouvert.');
  const index = lieu?.section?.current;
  let cfi = null;
  for (const portee of [index, undefined]) {
    for await (const r of view.search({ query: texte, index: portee })) {
      if (r === 'done') break;
      const trouve = r.cfi || r.subitems?.[0]?.cfi;
      if (trouve) { cfi = trouve; break; }
    }
    view.clearSearch();
    if (cfi) break;
  }
  if (!cfi) throw new Error(`Passage introuvable dans le livre : « ${texte.slice(0, 80)} ». Copie-le exactement, de préférence une seule phrase.`);
  const entree = { id: `s${Date.now().toString(36)}`, cfi, couleur, texte: texte.slice(0, 2000), note, chapitre: lieu?.tocItem?.label?.trim() || '', fraction: lieu?.fraction || 0, cree: Date.now() };
  await enregistrerSurlignages([...surlignages(), entree]);
  await view.goTo(cfi);
  await view.addAnnotation({ value: cfi, couleur });
  return entree;
}

// Clic sur un passage surligné : changer sa couleur, écrire une note, le supprimer.
function montrerSurlignage(cfi, range) {
  annotationCliquee = true;
  const s = surlignages().find((x) => x.cfi === cfi);
  if (!s) return;
  const bulle = $('#bulle-selection');
  bulle.innerHTML = '';
  for (const [cle, c] of Object.entries(COULEURS)) {
    bulle.append(el('button', { type: 'button', className: `pastille${s.couleur === cle ? ' actif' : ''}`, title: c.nom, style: { background: c.couleur }, onclick: async () => {
      cacherBulle();
      const maj = { ...s, couleur: cle };
      await enregistrerSurlignages(surlignages().map((x) => (x.id === s.id ? maj : x)));
      await view.addAnnotation({ value: s.cfi, couleur: cle });
    } }));
  }
  const rect = range ? rectEcran(range) : null;
  bulle.append(
    el('span', { className: 'sep' }),
    bouton('note', s.note ? 'Modifier la note' : 'Écrire une note', () => editerNote(s, rect)),
    bouton('copy', 'Copier le passage', async () => { await K.copierTexte(s.texte); notify('Passage copié.', 'success', 2000); cacherBulle(); }),
    bouton('sparkle', 'Expliquer ce passage (Loki)', () => { selection = { texte: s.texte }; demanderLoki('passage'); }),
    bouton('trash', 'Supprimer le surlignage', () => supprimerSurlignage(s.id)));
  if (rect) placerBulle(bulle, rect);
}

async function supprimerSurlignage(id) {
  cacherBulle();
  const s = surlignages().find((x) => x.id === id);
  if (!s) return;
  await enregistrerSurlignages(surlignages().filter((x) => x.id !== id));
  await view?.deleteAnnotation({ value: s.cfi });
}

function editerNote(s, rect) {
  const bulle = $('#bulle-selection');
  bulle.innerHTML = '';
  const zone = el('textarea', { value: s.note || '', placeholder: 'Ta note sur ce passage…' });
  const valider = async () => {
    cacherBulle();
    await enregistrerSurlignages(surlignages().map((x) => (x.id === s.id ? { ...x, note: zone.value.trim() } : x)));
  };
  zone.onkeydown = (e) => { if (e.key === 'Enter' && (e.ctrlKey || !e.shiftKey)) { e.preventDefault(); valider(); } if (e.key === 'Escape') cacherBulle(); };
  bulle.append(el('div', { className: 'bulle-note' }, zone, el('div', { className: 'rangee' }, el('span', { className: 'spacer' }),
    el('button', { type: 'button', className: 'button', textContent: 'Annuler', onclick: cacherBulle }),
    el('button', { type: 'button', className: 'button primary', textContent: 'Enregistrer', onclick: valider }))));
  placerBulle(bulle, rect || { left: innerWidth / 2, right: innerWidth / 2, top: innerHeight / 3, bottom: innerHeight / 3 });
  zone.focus();
}

function rendreSurlignages(contenu) {
  const liste = [...surlignages()].sort((a, b) => (a.fraction || 0) - (b.fraction || 0));
  if (!liste.length) {
    contenu.append(el('p', { className: 'vide-texte', textContent: 'Sélectionne un passage dans le livre pour le surligner (quatre couleurs) et y ajouter une note.' }));
    return;
  }
  contenu.append(el('div', { className: 'cote-actions' },
    el('button', { type: 'button', className: 'button small', onclick: exporterSurlignages }, el('i', { className: 'codicon codicon-export' }), el('span', { textContent: 'Exporter en Markdown' })),
    el('button', { type: 'button', className: 'button small', onclick: async () => { await K.copierTexte(markdownSurlignages()); notify('Surlignages copiés.', 'success', 2000); } }, el('i', { className: 'codicon codicon-copy' }), el('span', { textContent: 'Copier' }))));
  for (const s of liste) {
    const item = el('div', { className: 'note-item', style: { '--couleur': COULEURS[s.couleur]?.couleur }, onclick: () => view.goTo(s.cfi), oncontextmenu: (e) => {
      e.preventDefault();
      Menu.ouvrir(e.clientX, e.clientY, [
        { libelle: 'Aller au passage', icone: 'go-to-file', run: () => view.goTo(s.cfi) },
        { libelle: s.note ? 'Modifier la note' : 'Écrire une note', icone: 'note', run: () => editerNote(s) },
        { libelle: 'Couleur', icone: 'symbol-color', sous: Object.entries(COULEURS).map(([cle, c]) => ({ libelle: c.nom, coche: s.couleur === cle, run: async () => { await enregistrerSurlignages(surlignages().map((x) => (x.id === s.id ? { ...x, couleur: cle } : x))); await view.addAnnotation({ value: s.cfi, couleur: cle }); } })) },
        { libelle: 'Copier le passage', icone: 'copy', run: () => K.copierTexte(s.texte) },
        null,
        { libelle: 'Supprimer', icone: 'trash', run: () => supprimerSurlignage(s.id) },
      ]);
    } },
    el('span', { className: 'note-extrait', textContent: s.texte }),
    s.note ? el('span', { className: 'note-texte', textContent: s.note }) : null,
    el('span', { className: 'note-meta' }, el('span', { textContent: s.chapitre || '' }), el('span', { textContent: `· ${pourcent(s.fraction)}` })));
    contenu.append(item);
  }
}

function markdownSurlignages() {
  const lignes = [`# ${fiche.titre}`, fiche.auteur ? `*${fiche.auteur}*` : '', ''];
  let chapitre = null;
  for (const s of [...surlignages()].sort((a, b) => (a.fraction || 0) - (b.fraction || 0))) {
    if (s.chapitre && s.chapitre !== chapitre) { lignes.push(`## ${s.chapitre}`, ''); chapitre = s.chapitre; }
    lignes.push(`> ${s.texte}`, '');
    if (s.note) lignes.push(s.note, '');
  }
  return lignes.filter((l, i) => l || lignes[i - 1]).join('\n');
}

async function exporterSurlignages() {
  const chemin = await K.enregistrerTexte(`${fiche.titre} - surlignages.md`, markdownSurlignages());
  if (chemin) notify(`Surlignages exportés dans ${chemin}`, 'success', 6000);
}

// --- Marque-pages ---

const marquePages = () => fiche?.marquePages || [];
const marqueIci = () => {
  if (!lieu?.range) return null;
  // Un marque-page est « sur cette page » si sa position tombe dans la partie affichée.
  return marquePages().find((m) => {
    try {
      const r = view.resolveNavigation(m.cfi);
      if (r?.index !== lieu.section?.current) return false;
      const doc = lieu.range.startContainer.ownerDocument;
      const a = r.anchor(doc);
      const range = a instanceof Range ? a : null;
      if (!range) return false;
      return lieu.range.compareBoundaryPoints(Range.START_TO_START, range) <= 0 && lieu.range.compareBoundaryPoints(Range.END_TO_START, range) >= 0;
    } catch {
      return false;
    }
  }) || null;
};

function majMarquePage() {
  $('#btn-marque-page')?.classList.toggle('actif', Boolean(marqueIci()));
}

async function basculerMarquePage() {
  if (!lieu?.cfi) return;
  const ici = marqueIci();
  if (ici) {
    fiche.marquePages = marquePages().filter((m) => m.id !== ici.id);
    notify('Marque-page retiré.', 'info', 2000);
  } else {
    const extrait = lieu.range?.toString().replace(/\s+/g, ' ').trim().slice(0, 140) || '';
    fiche.marquePages = [...marquePages(), { id: `m${Date.now().toString(36)}`, cfi: lieu.cfi, fraction: lieu.fraction || 0, chapitre: lieu.tocItem?.label?.trim() || '', extrait, cree: Date.now() }];
    notify('Marque-page ajouté.', 'success', 2000);
  }
  await Bibliotheque.maj(fiche.id, { marquePages: fiche.marquePages });
  majMarquePage();
  if (ongletCote === 'marques') construireCote();
}

function rendreMarquePages(contenu) {
  const liste = [...marquePages()].sort((a, b) => a.fraction - b.fraction);
  if (!liste.length) {
    contenu.append(el('p', { className: 'vide-texte', textContent: 'Le bouton marque-page (ou Ctrl+D) marque la page affichée, pour y revenir d\'un clic.' }));
    return;
  }
  for (const m of liste) {
    contenu.append(el('div', { className: 'note-item', onclick: () => view.goTo(m.cfi), oncontextmenu: (e) => {
      e.preventDefault();
      Menu.ouvrir(e.clientX, e.clientY, [{ libelle: 'Supprimer le marque-page', icone: 'trash', run: async () => { fiche.marquePages = marquePages().filter((x) => x.id !== m.id); await Bibliotheque.maj(fiche.id, { marquePages: fiche.marquePages }); construireCote(); majMarquePage(); } }]);
    } },
    el('span', { className: 'note-extrait', textContent: m.extrait || '…' }),
    el('span', { className: 'note-meta' }, el('span', { textContent: m.chapitre }), el('span', { textContent: `· ${pourcent(m.fraction)} · ${quand(m.cree)}` }))));
  }
}

// --- Recherche ---

let rechercheId = 0;
async function chercher(texte) {
  texte = String(texte || '').trim();
  if (!texte || !view) return;
  basculerCote(true);
  ongletCote = 'recherche';
  rechercheResultats = [];
  const id = ++rechercheId;
  const champ = $('#lecture-barre input.recherche');
  if (champ && champ.value !== texte) champ.value = texte;
  construireCote();
  const contenu = $('#cote-contenu');
  contenu.innerHTML = '';
  const etatRecherche = el('p', { className: 'vide-texte', textContent: 'Recherche…' });
  contenu.append(etatRecherche);
  let n = 0;
  for await (const r of view.search({ query: texte })) {
    if (id !== rechercheId) return;
    if (r === 'done') break;
    if (r.progress !== undefined) { etatRecherche.textContent = `Recherche… ${Math.round(r.progress * 100)} %`; continue; }
    if (!r.subitems) continue;
    rechercheResultats.push(r);
    contenu.insertBefore(el('div', { className: 'resultat-chapitre', textContent: r.label?.trim() || '' }), etatRecherche);
    for (const s of r.subitems) {
      n++;
      const { pre, match, post } = s.excerpt;
      contenu.insertBefore(el('div', { className: 'resultat', onclick: () => view.goTo(s.cfi) }, `…${pre}`, el('mark', { textContent: match }), `${post}…`), etatRecherche);
    }
  }
  etatRecherche.textContent = n ? `${n} résultat${n > 1 ? 's' : ''}.` : `« ${texte} » n'apparaît pas dans le livre.`;
}

// Chercher sans rien afficher (pour Loki) : [{ chapitre, extrait, cfi }], 40 au plus.
async function chercherTexte(texte, max = 40) {
  if (!ouvert()) throw new Error('Aucun livre ouvert.');
  const out = [];
  for await (const r of view.search({ query: texte })) {
    if (r === 'done') break;
    for (const s of r.subitems || []) {
      out.push({ chapitre: r.label?.trim() || '', extrait: `…${s.excerpt.pre}[${s.excerpt.match}]${s.excerpt.post}…`, cfi: s.cfi });
      if (out.length >= max) break;
    }
    if (out.length >= max) break;
  }
  view.clearSearch();
  return out;
}

function viderRecherche() {
  rechercheId++;
  rechercheResultats = [];
  view?.clearSearch();
  if (ongletCote === 'recherche') construireCote();
}

function rendreRecherche(contenu) {
  if (!rechercheResultats.length) {
    contenu.append(el('p', { className: 'vide-texte', textContent: 'Écris un mot dans « Chercher dans le livre » (Ctrl+F), puis Entrée. Les accents et les majuscules ne comptent pas.' }));
    return;
  }
  for (const r of rechercheResultats) {
    contenu.append(el('div', { className: 'resultat-chapitre', textContent: r.label?.trim() || '' }));
    for (const s of r.subitems) {
      const { pre, match, post } = s.excerpt;
      contenu.append(el('div', { className: 'resultat', onclick: () => view.goTo(s.cfi) }, `…${pre}`, el('mark', { textContent: match }), `${post}…`));
    }
  }
}

// --- Réglages de lecture (Aa) ---

function basculerReglages(montrer) {
  const panneau = $('#reglages-lecture');
  const ouvrirLe = montrer ?? panneau.hidden;
  panneau.hidden = !ouvrirLe;
  $('#btn-aa')?.classList.toggle('actif', ouvrirLe);
  if (ouvrirLe) construireReglages();
}

function construireReglages() {
  const p = $('#reglages-lecture');
  p.innerHTML = '';
  const r = L();
  // L() à chaque changement, pas r : après chaque enregistrement, etat.config est remplacé par la
  // réponse de main.js, et r ne serait plus qu'une ancienne copie (le réglage ne marchait qu'une fois).
  const changer = (cle, valeur, { miseEnPage = false } = {}) => {
    L()[cle] = valeur;
    if (miseEnPage) appliquerMiseEnPage();
    appliquerStyles();
    ecrireLecturePlusTard();
  };
  const curseur = (cle, titre, min, max, pas, format, options) => {
    const valeur = el('b', { textContent: format(r[cle]) });
    const input = el('input', { type: 'range', min, max, step: pas, value: r[cle] });
    input.oninput = () => { valeur.textContent = format(Number(input.value)); changer(cle, Number(input.value), options); };
    return el('div', { className: 'reglage' }, el('div', { className: 'reglage-titre' }, el('span', { textContent: titre }), valeur), input);
  };
  const choix = (cle, titre, options, opts) => {
    const rangee = el('div', { className: 'choix-boutons' });
    for (const [v, nom] of options) {
      rangee.append(el('button', { type: 'button', className: String(r[cle]) === String(v) ? 'actif' : '', textContent: nom, onclick: () => { changer(cle, v, opts); construireReglages(); } }));
    }
    return el('div', { className: 'reglage' }, el('div', { className: 'reglage-titre' }, el('span', { textContent: titre })), rangee);
  };
  const caseACocher = (cle, titre, opts) => {
    const c = el('input', { type: 'checkbox', checked: Boolean(r[cle]) });
    c.onchange = () => changer(cle, c.checked, opts);
    return el('label', { className: 'case-reglage' }, c, el('span', { textContent: titre }));
  };

  const themes = el('div', { className: 'themes' });
  for (const [cle, t] of Object.entries(THEMES)) {
    themes.append(el('button', { type: 'button', className: r.theme === cle ? 'actif' : '', style: { background: t.fond, color: t.texte }, onclick: () => { changer('theme', cle); construireReglages(); } }, el('span', { textContent: 'Aa' }), el('small', { textContent: t.nom })));
  }
  const police = el('select', {});
  for (const [v, nom] of POLICES) police.add(new Option(nom, v));
  police.value = r.police;
  const apercu = el('div', { className: 'apercu-police', style: { fontFamily: `"${r.police}", Georgia, serif` }, textContent: 'Litwo ! Ojczyzno moja… Le vif renard brun saute.' });
  police.onchange = () => { apercu.style.fontFamily = `"${police.value}", Georgia, serif`; changer('police', police.value); };

  p.append(
    el('div', { className: 'panel-header' }, el('span', { className: 'panel-title', textContent: 'Réglages de lecture' }), el('div', { className: 'panel-actions' }, bouton('close', 'Fermer (Ctrl+T)', () => basculerReglages(false)))),
    el('div', { className: 'reglage' }, el('div', { className: 'reglage-titre' }, el('span', { textContent: 'Thème des pages' })), themes),
    curseur('filtreChaud', 'Lumière chaude (le soir)', 0, 60, 5, (v) => (v ? `${v} %` : 'non')),
    el('div', { className: 'reglage' }, el('div', { className: 'reglage-titre' }, el('span', { textContent: 'Police' })), police, apercu),
    caseACocher('policeLivre', 'Garder la police choisie par l\'éditeur du livre'),
    curseur('taille', 'Taille du texte', 12, 34, 1, (v) => `${v} px`),
    curseur('interligne', 'Interligne', 1.1, 2.4, 0.05, (v) => v.toFixed(2).replace('.', ',')),
    curseur('largeur', 'Largeur des colonnes', 420, 1100, 20, (v) => `${v} px`, { miseEnPage: true }),
    curseur('marges', 'Marges en haut et en bas', 0, 120, 4, (v) => `${v} px`, { miseEnPage: true }),
    choix('mode', 'Affichage', [['pages', 'Pages'], ['defilement', 'Défilement']], { miseEnPage: true }),
    choix('colonnes', 'Colonnes (en mode pages)', [['auto', 'Auto'], ['1', '1'], ['2', '2'], ['3', '3']], { miseEnPage: true }),
    caseACocher('justifier', 'Texte justifié'),
    caseACocher('cesure', 'Couper les mots en fin de ligne (césure)'),
    caseACocher('animation', 'Les pages glissent', { miseEnPage: true }),
    el('p', { className: 'vide-texte', textContent: 'Auto : deux colonnes quand la fenêtre est assez large (pratique sur un écran ultra-large), une seule sinon. Trois colonnes demandent un écran très large.' }));
}

// --- Plein écran sans interface ---

let immersif = false;
async function pleinEcran(oui = !immersif) {
  immersif = Boolean(await K.pleinEcran(oui));
  document.body.classList.toggle('immersif', immersif && ouvert());
  setTimeout(() => window.dispatchEvent(new Event('resize')), 200);
}
window.addEventListener('mousemove', (e) => {
  if (!immersif) return;
  document.body.classList.toggle('montrer-haut', e.clientY < 90);
  document.body.classList.toggle('montrer-bas', e.clientY > innerHeight - 50);
});

// --- Clavier ---

function clavier(e) {
  if (!ouvert() || Dialogs.isOpen()) return false;
  const saisie = ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName) && e.target.ownerDocument === document;
  const k = e.key;
  if (e.ctrlKey && !e.altKey) {
    const kl = k.toLowerCase();
    if (kl === 'f') { e.preventDefault(); basculerCote(true); $('#lecture-barre input.recherche')?.focus(); return true; }
    if (kl === 'd') { e.preventDefault(); basculerMarquePage(); return true; }
    if (kl === 'b') { e.preventDefault(); basculerCote(); return true; }
    if (kl === 't') { e.preventDefault(); basculerReglages(); return true; }
    if (k === '+' || k === '=') { e.preventDefault(); L().taille = Math.min(34, L().taille + 1); appliquerStyles(); ecrireLecturePlusTard(); if (!$('#reglages-lecture').hidden) construireReglages(); return true; }
    if (k === '-') { e.preventDefault(); L().taille = Math.max(12, L().taille - 1); appliquerStyles(); ecrireLecturePlusTard(); if (!$('#reglages-lecture').hidden) construireReglages(); return true; }
    return false;
  }
  if (saisie) return false;
  if (k === 'ArrowLeft' || k === 'PageUp') { e.preventDefault(); view.goLeft(); return true; }
  if (k === 'ArrowRight' || k === 'PageDown' || (k === ' ' && !e.shiftKey)) { e.preventDefault(); view.goRight(); return true; }
  if (k === ' ' && e.shiftKey) { e.preventDefault(); view.prev(); return true; }
  if ((k === 'ArrowDown' || k === 'ArrowUp') && L().mode === 'pages') { e.preventDefault(); if (k === 'ArrowDown') view.next(); else view.prev(); return true; }
  if (k === 'Home') { e.preventDefault(); view.renderer.firstSection?.(); return true; }
  if (k === 'End') { e.preventDefault(); view.renderer.lastSection?.(); return true; }
  if (k === 'F11') { e.preventDefault(); pleinEcran(); return true; }
  if (k === 'Escape') {
    e.preventDefault();
    if (!$('#bulle-selection').hidden) cacherBulle();
    else if (immersif) pleinEcran(false);
    else if (!$('#reglages-lecture').hidden) basculerReglages(false);
    else fermer();
    return true;
  }
  return false;
}

// --- Pour Loki (claude-actions.js) ---

async function allerChapitre(numero) {
  const liste = await chapitres(book);
  const c = liste[numero - 1];
  if (!c) throw new Error(`Pas de chapitre ${numero} : ce livre en a ${liste.length}.`);
  await view.goTo(c.href || c.index);
  return c;
}

async function chapitreCourant() {
  if (!ouvert() || !lieu) return null;
  const liste = await chapitres(book);
  const index = lieu.section?.current ?? 0;
  const href = lieu.tocItem?.href;
  return liste.find((c) => href && c.href === href) || [...liste].reverse().find((c) => c.index <= index) || liste[0] || null;
}

export const Lecture = {
  ouvrir,
  fermer,
  ouvert,
  clavier,
  fiche: () => fiche,
  livre: () => book,
  lieu: () => lieu,
  selection: () => selection?.texte || '',
  chapitreCourant,
  allerChapitre,
  allerFraction: (f) => view.goToFraction(Math.min(1, Math.max(0, f))),
  surlignerTexte,
  surlignages,
  chercher,
  chercherTexte,
  allerA: (cfi) => view.goTo(cfi),
  reglages: () => ({ ...L() }),
  changerReglages(changes) {
    Object.assign(L(), changes);
    appliquerMiseEnPage();
    appliquerStyles();
    ecrireLecturePlusTard();
    if (!$('#reglages-lecture').hidden) construireReglages();
  },
  // Une image de la page affichée n'est pas possible (les pages sont des cadres séparés) : Loki lit
  // le texte visible à la place.
  texteVisible: () => lieu?.range?.toString().replace(/\s+\n/g, '\n').trim() || '',
  THEMES,
  POLICES,
  quandQuitter(fn) { surQuitter = fn; },
  rafraichirStyle: appliquerStyles,
};
