// Petits outils communs à toute l'interface : sélecteurs, création d'éléments, menus.
//
// Vocabulaire de Kenning :
// - la « bibliothèque » = tous tes livres (des fiches : titre, auteur, couverture, où tu en es…).
//   Les fichiers restent où ils sont sur le disque.
// - un « rayon » = un filtre de la bibliothèque (En cours, À lire, Terminés, une langue…).
// - une « collection » = un rayon que tu crées toi-même (Polonais, Fantasy…).
// - la « lecture » = la vue où un livre est ouvert.

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else node[k] = v;
  }
  for (const c of children) if (c != null && c !== false) node.append(c);
  return node;
}

// Un bouton icône : icone = nom d'une Codicon (https://microsoft.github.io/vscode-codicons/).
function bouton(icone, titre, onclick, { texte, classe = 'icon-button' } = {}) {
  const b = el('button', { type: 'button', className: classe, title: titre, onclick });
  b.append(el('i', { className: `codicon codicon-${icone}` }));
  if (texte) b.append(el('span', { textContent: texte }));
  return b;
}

const nomFichier = (chemin) => String(chemin).split(/[\\/]/).pop();
const dossierDe = (chemin) => String(chemin).replace(/[\\/][^\\/]*$/, '');

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0).replace('.', ',')} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`;
}

// « 3 h 20 », « 12 min », « moins d'une minute »
function duree(minutes) {
  if (!Number.isFinite(minutes) || minutes < 1) return 'moins d\'une minute';
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${String(r).padStart(2, '0')}` : `${h} h`;
}

// « aujourd'hui », « hier », « il y a 3 jours », « 12 mars 2026 »
function quand(ms) {
  if (!ms) return 'jamais';
  const jour = 24 * 3600 * 1000;
  const debut = new Date(); debut.setHours(0, 0, 0, 0);
  if (ms >= debut.getTime()) return 'aujourd\'hui';
  if (ms >= debut.getTime() - jour) return 'hier';
  const jours = Math.ceil((debut.getTime() - ms) / jour);
  if (jours < 7) return `il y a ${jours} jours`;
  return new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

const pourcent = (fraction) => `${Math.round((fraction || 0) * 100)} %`;

// Comparer des titres et des noms à la française (« Été » avec les E, sans tenir compte des majuscules).
const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });

// Un menu contextuel (clic droit) : items = [{ libelle, icone, run, coche, desactive } | null (séparateur)
// | { libelle, sous: [items] }]. Se ferme au clic ailleurs ou avec Échap.
const Menu = (() => {
  let ouvert = null;
  function fermer() { ouvert?.remove(); ouvert = null; }
  function ouvrir(x, y, items) {
    fermer();
    const menu = construire(items);
    document.body.append(menu);
    // Reste dans la fenêtre
    const r = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(4, Math.min(x, innerWidth - r.width - 4))}px`;
    menu.style.top = `${Math.max(4, Math.min(y, innerHeight - r.height - 4))}px`;
    ouvert = menu;
  }
  function construire(items, sous = false) {
    const menu = el('div', { className: `menu${sous ? ' sous-menu' : ''}`, onpointerdown: (e) => e.stopPropagation() });
    for (const it of items) {
      if (!it) { menu.append(el('div', { className: 'menu-sep' })); continue; }
      const ligne = el('div', { className: `menu-item${it.desactive ? ' desactive' : ''}${it.sous ? ' a-sous-menu' : ''}` },
        el('i', { className: `codicon codicon-${it.coche ? 'check' : it.icone || 'blank'}` }),
        el('span', { className: 'menu-label', textContent: it.libelle }),
        it.sous ? el('i', { className: 'codicon codicon-chevron-right' }) : null);
      if (it.sous) ligne.append(construire(it.sous, true));
      else if (!it.desactive) ligne.onclick = () => { fermer(); it.run(); };
      menu.append(ligne);
    }
    return menu;
  }
  window.addEventListener('pointerdown', fermer);
  window.addEventListener('blur', fermer);
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ouvert) { e.stopPropagation(); fermer(); } }, true);
  return { ouvrir, fermer, estOuvert: () => Boolean(ouvert) };
})();
