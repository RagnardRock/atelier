// Petits outils communs à toute l'interface : sélecteurs, canvas, redimensionnement de qualité,
// encodage PNG / WebP / JPEG / ICO.
//
// Vocabulaire de Brokk :
// - une « source » = une image que tu donnes à Brokk (un PSD, un PNG, un SVG…).
// - un « asset » = une source + une « recette » (favicon, image @2x, responsive, Open Graph, tailles
//   libres) + ses réglages. Un asset produit plusieurs fichiers d'un coup.
// - une « sortie » = un des fichiers produits (favicon.ico, logo@2x.webp…), écrit dans le projet.

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const c of children) if (c != null) node.append(c);
  return node;
}

function newCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

// Réduire une image proprement : on divise par deux tant que c'est possible, puis on finit à la
// bonne taille. Réduire d'un seul coup (2000 px → 16 px) donnerait une image granuleuse.
function resample(src, width, height) {
  let current = src;
  width = Math.max(1, Math.round(width));
  height = Math.max(1, Math.round(height));
  while (current.width / 2 >= width && current.height / 2 >= height) {
    const half = newCanvas(current.width / 2, current.height / 2);
    const g = half.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(current, 0, 0, half.width, half.height);
    current = half;
  }
  const out = newCanvas(width, height);
  const g = out.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(current, 0, 0, width, height);
  return out;
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

// Rogner les bords transparents (un calque de PSD est souvent perdu au milieu d'un grand document).
function trim(canvas) {
  const b = opaqueBounds(canvas);
  if (!b || (b.w === canvas.width && b.h === canvas.height)) return canvas;
  const out = newCanvas(b.w, b.h);
  out.getContext('2d').drawImage(canvas, -b.x, -b.y);
  return out;
}

// Y a-t-il des pixels (même un peu) transparents ? Sert à proposer PNG plutôt que JPEG.
function hasTransparency(canvas) {
  const small = canvas.width * canvas.height > 1e6 ? resample(canvas, canvas.width / 4, canvas.height / 4) : canvas;
  const data = small.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, small.width, small.height).data;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true;
  return false;
}

// Placer l'image dans un cadre de taille fixe.
// - contenir : toute l'image est visible, centrée (bandes de fond autour si les proportions diffèrent).
// - couvrir : le cadre est rempli, ce qui dépasse est coupé (centré).
// - etirer : déformée pour remplir exactement le cadre.
// marge : en % du cadre, de chaque côté. fond : couleur, ou null pour transparent.
function fit(src, width, height, { mode = 'contenir', marge = 0, fond = null } = {}) {
  const out = newCanvas(width, height);
  const g = out.getContext('2d');
  if (fond) { g.fillStyle = fond; g.fillRect(0, 0, width, height); }
  const mx = Math.round(width * marge / 100), my = Math.round(height * marge / 100);
  const bw = Math.max(1, width - 2 * mx), bh = Math.max(1, height - 2 * my);
  if (mode === 'etirer') {
    g.drawImage(resample(src, bw, bh), mx, my);
    return out;
  }
  const scale = mode === 'couvrir' ? Math.max(bw / src.width, bh / src.height) : Math.min(bw / src.width, bh / src.height);
  const w = Math.max(1, Math.round(src.width * scale)), h = Math.max(1, Math.round(src.height * scale));
  const img = resample(src, w, h);
  g.save();
  g.beginPath();
  g.rect(mx, my, bw, bh);
  g.clip();
  g.drawImage(img, mx + Math.round((bw - w) / 2), my + Math.round((bh - h) / 2));
  g.restore();
  return out;
}

// --- Encodage ---
const MIME = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };
const EXTENSION = { png: 'png', jpeg: 'jpg', webp: 'webp', ico: 'ico' };
function encode(canvas, format, quality = 85, background = '#ffffff') {
  if (format === 'ico') return makeIco(canvas, [16, 32, 48]);
  let source = canvas;
  if (format === 'jpeg') {
    // Le JPEG n'a pas de transparence : on pose l'image sur un fond.
    source = newCanvas(canvas.width, canvas.height);
    const g = source.getContext('2d');
    g.fillStyle = background;
    g.fillRect(0, 0, source.width, source.height);
    g.drawImage(canvas, 0, 0);
  }
  return new Promise((resolve, reject) => source.toBlob(async (blob) => {
    if (!blob) return reject(new Error('Image trop grande pour être encodée.'));
    resolve(new Uint8Array(await blob.arrayBuffer()));
  }, MIME[format] || MIME.png, quality / 100));
}

// Fichier .ico : un petit en-tête, puis une image PNG par taille (comme dans Skald).
async function makeIco(canvas, sizes) {
  const images = [];
  for (const size of sizes) images.push({ size, png: await encode(fit(canvas, size, size), 'png') });
  const headerSize = 6 + 16 * images.length;
  const out = new Uint8Array(headerSize + images.reduce((n, i) => n + i.png.length, 0));
  const view = new DataView(out.buffer);
  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true); // 1 = icône
  view.setUint16(4, images.length, true);
  let offset = headerSize;
  images.forEach((img, n) => {
    const e = 6 + n * 16;
    out[e] = img.size >= 256 ? 0 : img.size; // 0 veut dire 256
    out[e + 1] = img.size >= 256 ? 0 : img.size;
    view.setUint16(e + 4, 1, true);   // plans de couleur
    view.setUint16(e + 6, 32, true);  // bits par pixel
    view.setUint32(e + 8, img.png.length, true);
    view.setUint32(e + 12, offset, true);
    out.set(img.png, offset);
    offset += img.png.length;
  });
  return out;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0).replace('.', ',')} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`;
}

// « public/img » + « logo.webp » → « public/img/logo.webp » (toujours avec des / , même sous Windows).
function joinRel(...parts) {
  return parts.join('/').replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/^\.?\//, '').replace(/\/$/, '');
}

// Nom de fichier sûr : « Mon Logo (final) » → « mon-logo-final ».
function slug(text) {
  return String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9@._-]+/g, '-').replace(/^-+|-+$/g, '') || 'image';
}

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
