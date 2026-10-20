// Le modèle d'une image ouverte : ses calques, sa sélection et son historique (annuler / rétablir).
//
// Vocabulaire :
// - un "document" = une image ouverte dans un onglet (un PSD, un PNG, une nouvelle image…).
// - un "calque" = un <canvas> avec sa position (x, y) dans le document, sa visibilité, son opacité
//   et son mode de fusion. Les calques sont rangés du bas (index 0) vers le haut.
// - la "composition" = tous les calques visibles fusionnés, ce qu'on voit à l'écran et ce qu'on exporte.
//
// Règle importante pour l'historique : on ne dessine JAMAIS directement dans le canvas d'un calque
// sans passer par editPixels(). Cette fonction remplace le canvas par une copie neuve : l'ancien
// reste intact dans l'historique, ce qui permet d'annuler sans tout recopier à chaque étape.

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function newCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}
function cloneCanvas(source) {
  const canvas = newCanvas(source.width, source.height);
  canvas.getContext('2d').drawImage(source, 0, 0);
  return canvas;
}
const ctx2d = (canvas) => canvas.getContext('2d', { willReadFrequently: false });

// Modes de fusion : les noms de <canvas> (ceux qu'on utilise) et leur nom affiché.
const BLEND_MODES = [
  ['source-over', 'Normal'],
  ['multiply', 'Produit'],
  ['screen', 'Superposition (écran)'],
  ['overlay', 'Incrustation'],
  ['darken', 'Obscurcir'],
  ['lighten', 'Éclaircir'],
  ['color-dodge', 'Densité couleur −'],
  ['color-burn', 'Densité couleur +'],
  ['hard-light', 'Lumière crue'],
  ['soft-light', 'Lumière tamisée'],
  ['difference', 'Différence'],
  ['exclusion', 'Exclusion'],
  ['hue', 'Teinte'],
  ['saturation', 'Saturation'],
  ['color', 'Couleur'],
  ['luminosity', 'Luminosité'],
  ['lighter', 'Densité linéaire − (ajout)'],
];

let nextId = 1;
const uid = () => nextId++;

function createLayer(name, canvas, options = {}) {
  return { id: uid(), name, canvas, x: 0, y: 0, visible: true, opacity: 1, blend: 'source-over', text: null, ...options };
}

function createDocument({ name, width, height, layers = [], path = null }) {
  const doc = {
    id: uid(),
    name,
    path,                 // fichier sur le disque (null = jamais enregistré)
    width,
    height,
    layers,
    activeId: layers.length ? layers[layers.length - 1].id : null,
    selection: null,      // { x, y, w, h } en pixels du document, ou null
    dirty: false,         // modifié depuis le dernier enregistrement
    undo: [],
    redo: [],
    view: null,           // zoom et position, choisis à l'affichage (view.js)
    stroke: null,         // coup de pinceau en cours (tools.js)
    float: null,          // pixels sélectionnés en train d'être déplacés (outil Déplacement)
    preview: null,        // { layerId, canvas, x, y } : aperçu d'un réglage pas encore validé
  };
  return doc;
}

const activeLayer = (doc) => doc && doc.layers.find((l) => l.id === doc.activeId);

// --- Historique ---

function snapshot(doc, label) {
  return {
    label,
    width: doc.width,
    height: doc.height,
    activeId: doc.activeId,
    selection: doc.selection && { ...doc.selection },
    layers: doc.layers.map((l) => ({ ...l, text: l.text && { ...l.text } })),
  };
}
function restore(doc, snap) {
  doc.width = snap.width;
  doc.height = snap.height;
  doc.activeId = snap.activeId;
  doc.selection = snap.selection && { ...snap.selection };
  doc.layers = snap.layers.map((l) => ({ ...l, text: l.text && { ...l.text } }));
}

// Toute modification passe par ici : on mémorise l'état d'avant, puis on modifie.
// fn peut renvoyer false pour dire « finalement rien n'a changé » (l'étape est alors oubliée).
function change(doc, label, fn) {
  if (!doc) return;
  const snap = snapshot(doc, label);
  const result = fn(doc);
  if (result === false) return;
  commit(doc, snap);
}
// Pour les gestes qui durent (un coup de pinceau, un glisser) : snapshot() au début,
// commit() à la fin, quand on sait que quelque chose a vraiment changé.
function commit(doc, snap) {
  doc.undo.push(snap);
  const max = App.config?.historySteps || 40;
  if (doc.undo.length > max) doc.undo.splice(0, doc.undo.length - max);
  doc.redo = [];
  doc.dirty = true;
  App.refresh();
}
function undo(doc) {
  if (!doc?.undo.length) return;
  const snap = doc.undo.pop();
  doc.redo.push(snapshot(doc, snap.label));
  restore(doc, snap);
  doc.dirty = true;
  App.refresh();
  notify(`Annulé : ${snap.label}`, 'info', 1200);
}
function redo(doc) {
  if (!doc?.redo.length) return;
  const snap = doc.redo.pop();
  doc.undo.push(snapshot(doc, snap.label));
  restore(doc, snap);
  doc.dirty = true;
  App.refresh();
  notify(`Rétabli : ${snap.label}`, 'info', 1200);
}

// Copie neuve du canvas du calque, prête à être modifiée (voir la règle en haut du fichier).
// cover = true agrandit d'abord le calque pour couvrir tout le document (pour peindre partout).
function editPixels(layer, doc, cover = false) {
  if (cover) {
    const left = Math.min(layer.x, 0);
    const top = Math.min(layer.y, 0);
    const right = Math.max(layer.x + layer.canvas.width, doc.width);
    const bottom = Math.max(layer.y + layer.canvas.height, doc.height);
    const canvas = newCanvas(right - left, bottom - top);
    canvas.getContext('2d').drawImage(layer.canvas, layer.x - left, layer.y - top);
    layer.canvas = canvas;
    layer.x = left;
    layer.y = top;
  } else {
    layer.canvas = cloneCanvas(layer.canvas);
  }
  layer.text = null; // un texte retouché au pinceau n'est plus modifiable comme texte
  return layer.canvas.getContext('2d');
}

// Remplace les pixels d'un calque par un canvas tout neuf (résultat d'un réglage, d'un texte…).
function replacePixels(layer, canvas, x = layer.x, y = layer.y) {
  layer.canvas = canvas;
  layer.x = Math.round(x);
  layer.y = Math.round(y);
  layer.text = null;
}

// Garde seulement la partie du calque qui tombe dans le rectangle (en pixels du document).
function cropLayerTo(layer, rect) {
  const left = Math.max(layer.x, rect.x), top = Math.max(layer.y, rect.y);
  const right = Math.min(layer.x + layer.canvas.width, rect.x + rect.w);
  const bottom = Math.min(layer.y + layer.canvas.height, rect.y + rect.h);
  if (right <= left || bottom <= top) return replacePixels(layer, newCanvas(1, 1), rect.x, rect.y);
  if (left === layer.x && top === layer.y && right - left === layer.canvas.width && bottom - top === layer.canvas.height) return;
  const canvas = newCanvas(right - left, bottom - top);
  canvas.getContext('2d').drawImage(layer.canvas, layer.x - left, layer.y - top);
  replacePixels(layer, canvas, left, top);
}

// --- Composition ---

// Canvas du calque tel qu'il doit apparaître maintenant (avec le coup de pinceau en cours,
// ou l'aperçu d'un réglage).
function layerAppearance(doc, layer) {
  if (doc.preview && doc.preview.layerId === layer.id) return doc.preview;
  if (doc.stroke && doc.stroke.layer === layer) return Tools.strokeAppearance(doc);
  return layer;
}

// Fusionne les calques visibles dans un canvas de la taille du document.
// Le résultat est gardé (doc.comp) et réutilisé tant que rien ne change.
function composite(doc, target) {
  const out = target || (doc.comp && doc.comp.width === doc.width && doc.comp.height === doc.height ? doc.comp : (doc.comp = newCanvas(doc.width, doc.height)));
  const ctx = out.getContext('2d');
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, out.width, out.height);
  for (const layer of doc.layers) {
    if (!layer.visible || layer.opacity <= 0) continue;
    const look = layerAppearance(doc, layer);
    ctx.globalAlpha = layer.opacity;
    ctx.globalCompositeOperation = layer.blend || 'source-over';
    ctx.drawImage(look.canvas, look.x, look.y);
    if (doc.float && doc.float.layerId === layer.id) ctx.drawImage(doc.float.canvas, doc.float.x, doc.float.y);
  }
  ctx.restore();
  return out;
}

// Image finale fusionnée, sur un canvas neuf (pour exporter, copier…).
const flatten = (doc) => composite(doc, newCanvas(doc.width, doc.height));

// Rectangle (x, y, w, h) ramené dans les limites du document, ou null s'il est vide.
function clampRect(doc, r) {
  if (!r) return null;
  const x = Math.max(0, Math.floor(Math.min(r.x, r.x + r.w)));
  const y = Math.max(0, Math.floor(Math.min(r.y, r.y + r.h)));
  const right = Math.min(doc.width, Math.ceil(Math.max(r.x, r.x + r.w)));
  const bottom = Math.min(doc.height, Math.ceil(Math.max(r.y, r.y + r.h)));
  if (right - x < 1 || bottom - y < 1) return null;
  return { x, y, w: right - x, h: bottom - y };
}

// Zone non transparente d'un canvas : { x, y, w, h } ou null si tout est transparent.
function opaqueBounds(canvas) {
  const { width, height } = canvas;
  const data = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, width, height).data;
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      if (data[row + x * 4 + 3] > 0) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        bottom = y;
      }
    }
  }
  return right < 0 ? null : { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
}

// Couleurs : "#rrggbb" <-> [r, g, b]
const hexToRgb = (hex) => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0');
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) || 0);
};
const rgbToHex = (r, g, b) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
