// Petits raccourcis communs à tous les scripts de l'interface.
// Un widget détaché (disposition.js) vit dans une autre fenêtre : $ le cherche aussi là-bas.
const docsEnPlus = new Set();
const $ = (sel, root) => {
  if (root) return root.querySelector(sel);
  const ici = document.querySelector(sel);
  if (ici) return ici;
  for (const d of docsEnPlus) { const n = d.querySelector(sel); if (n) return n; }
  return null;
};

// Crée un élément : el('button', { className: 'button', textContent: 'OK' }, enfant1, enfant2…)
function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  for (const c of children) if (c != null) node.append(c);
  return node;
}

// « il y a 5 min », « hier à 14:32 », « 3 oct. »…
function dateRelative(ms) {
  const d = new Date(ms);
  const diff = (Date.now() - ms) / 1000;
  if (diff < 60) return 'à l\'instant';
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const aujourdhui = new Date();
  if (d.toDateString() === aujourdhui.toDateString()) return `aujourd'hui à ${heure}`;
  const hier = new Date(aujourdhui);
  hier.setDate(hier.getDate() - 1);
  if (d.toDateString() === hier.toDateString()) return `hier à ${heure}`;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', ...(d.getFullYear() !== aujourdhui.getFullYear() ? { year: 'numeric' } : {}) });
}

// Petit menu au clic droit : ouvrirMenu(x, y, [[libellé, action, coché ?], null (séparateur), 'Titre', …]).
let menuOuvert = null;
function fermerMenu() { menuOuvert?.remove(); menuOuvert = null; }
// doc : la fenêtre où l'ouvrir (celle d'un widget détaché) ; par défaut, celle où tu es.
function ouvrirMenu(x, y, items, doc = typeof Disposition !== 'undefined' ? Disposition.documentActif() : document) {
  fermerMenu();
  menuOuvert = el('div', { className: 'menu' });
  for (const item of items) {
    if (!item) { menuOuvert.append(el('div', { className: 'menu-sep' })); continue; }
    if (typeof item === 'string') { menuOuvert.append(el('div', { className: 'menu-titre', textContent: item })); continue; }
    const [label, run, coche] = item;
    // Sans action : ligne grisée (ex. « Coller » quand le presse-papiers est vide).
    const b = el('button', { className: `menu-item${coche ? ' coche' : ''}`, textContent: label, disabled: !run });
    b.onclick = () => { fermerMenu(); run(); };
    menuOuvert.append(b);
  }
  // Le menu ne prend pas le focus : la zone de texte garde sa sélection (pour corriger un mot, coller…).
  menuOuvert.addEventListener('mousedown', (e) => e.preventDefault());
  doc.body.append(menuOuvert);
  const vue = doc.defaultView;
  menuOuvert.style.left = `${Math.max(4, Math.min(x, vue.innerWidth - menuOuvert.offsetWidth - 8))}px`;
  menuOuvert.style.top = `${Math.max(4, Math.min(y, vue.innerHeight - menuOuvert.offsetHeight - 8))}px`;
}
// Fermer le menu en cliquant ailleurs : dans la fenêtre d'Atelier et dans celles des widgets détachés.
function brancherDocument(doc) {
  doc.addEventListener('pointerdown', (e) => { if (menuOuvert && !menuOuvert.contains(e.target)) fermerMenu(); });
  doc.defaultView.addEventListener('blur', () => { if (menuOuvert?.ownerDocument === doc) fermerMenu(); });
}
brancherDocument(document);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fermerMenu(); });

// Clic droit dans une zone de texte (notes, message à Claude…) : les corrections proposées pour un
// mot souligné en rouge, « Ajouter au dictionnaire », puis couper, copier, coller.
// fenetre : le nom de la fenêtre d'un widget détaché où le clic droit a eu lieu (sinon, Atelier).
window.atelier.onMenuEdition(({ x, y, mot, suggestions, peutCouper, peutCopier, peutColler, fenetre }) => {
  const commande = (c, m) => () => window.atelier.edition(c, m, fenetre).catch((err) => notify(cleanError(err), 'error'));
  const items = [];
  if (mot) {
    if (suggestions.length) items.push(...suggestions.slice(0, 6).map((s) => [s, commande('remplacer', s)]));
    else items.push('Aucune correction proposée');
    items.push([`Ajouter « ${mot} » au dictionnaire`, commande('dictionnaire', mot)], null);
  }
  items.push(
    ['Couper', peutCouper ? commande('cut') : null],
    ['Copier', peutCopier ? commande('copy') : null],
    ['Coller', peutColler ? commande('paste') : null],
    null,
    ['Tout sélectionner', commande('selectAll')],
  );
  const doc = fenetre ? [...docsEnPlus].find((d) => d.defaultView?.name === fenetre) : document;
  ouvrirMenu(x, y, items, doc || document);
  // Les corrections, en tête du menu, ressortent un peu.
  if (mot && suggestions.length) for (const b of [...menuOuvert.querySelectorAll('.menu-item')].slice(0, Math.min(6, suggestions.length))) b.classList.add('correction');
});
