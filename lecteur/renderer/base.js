// Petits outils communs à toute l'interface : sélecteurs, création d'éléments, types de documents.
//
// Vocabulaire de Mímir :
// - un « document » = un fichier ouvert (un PDF, un livre EPUB, une BD, un .docx, une image, un texte).
// - un « onglet » = un document ouvert dans la fenêtre, avec son « lecteur ».
// - un « lecteur » = ce qui affiche un type de document (renderer/lecteurs/) : chacun a sa barre
//   d'outils, sa colonne de gauche (miniatures, sommaire) et ses actions pour Claude.

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

// Un bouton icône de barre d'outils : icone = nom d'une Codicon (https://microsoft.github.io/vscode-codicons/).
function bouton(icone, titre, onclick, { texte, classe = 'icon-button' } = {}) {
  const b = el('button', { type: 'button', className: classe, title: titre, onclick });
  b.append(el('i', { className: `codicon codicon-${icone}` }));
  if (texte) b.append(el('span', { textContent: texte }));
  return b;
}

const nomFichier = (chemin) => String(chemin).split(/[\\/]/).pop();
const dossierDe = (chemin) => String(chemin).replace(/[\\/][^\\/]*$/, '');
const extensionDe = (chemin) => (nomFichier(chemin).match(/\.([^.]+)$/)?.[1] || '').toLowerCase();

// Le type de chaque extension, et son icône. L'ordre suit main.js › FORMATS.
const TYPES = {
  pdf: { type: 'pdf', icone: 'file-pdf', libelle: 'PDF' },
  epub: { type: 'epub', icone: 'book', libelle: 'Livre EPUB' },
  cbz: { type: 'bd', icone: 'files', libelle: 'BD' },
  cbr: { type: 'bd', icone: 'files', libelle: 'BD' },
  zip: { type: 'bd', icone: 'files', libelle: 'Archive d\'images' },
  docx: { type: 'word', icone: 'file-text', libelle: 'Word' },
  md: { type: 'texte', icone: 'markdown', libelle: 'Markdown' },
  markdown: { type: 'texte', icone: 'markdown', libelle: 'Markdown' },
};
for (const e of ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'svg', 'ico']) TYPES[e] = { type: 'image', icone: 'file-media', libelle: 'Image' };
for (const e of ['txt', 'log', 'json', 'xml', 'csv', 'ini', 'yml', 'yaml']) TYPES[e] = { type: 'texte', icone: 'file-code', libelle: 'Texte' };
const typeDe = (chemin) => TYPES[extensionDe(chemin)] || { type: 'inconnu', icone: 'file', libelle: 'Fichier' };

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0).replace('.', ',')} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`;
}

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Attendre un peu (laisser la page se dessiner, par exemple).
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

// Un canvas réduit pour que Claude voie une page sans que l'image pèse trop lourd.
function reduireCanvas(canvas, largeurMax = 1100) {
  if (canvas.width <= largeurMax) return canvas;
  const out = document.createElement('canvas');
  out.width = largeurMax;
  out.height = Math.round(canvas.height * largeurMax / canvas.width);
  const g = out.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(canvas, 0, 0, out.width, out.height);
  return out;
}
