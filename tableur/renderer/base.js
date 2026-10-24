// Petits outils communs à toute l'interface : sélecteurs, adresses de cellules (A1, B2:C5), couleurs.
//
// Vocabulaire de Reikna :
// - un « classeur » = le fichier ouvert (budget.xlsx), avec ses « feuilles » (les onglets du bas).
// - une cellule se repère par sa ligne et sa colonne, comptées à partir de 0 (A1 = ligne 0, colonne 0).
// - une « plage » = un rectangle de cellules : { r1, c1, r2, c2 } (B2:C5 = { r1: 1, c1: 1, r2: 4, c2: 2 }).

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const c of children) if (c != null) node.append(c);
  return node;
}

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Les limites d'Excel : 1 048 576 lignes et 16 384 colonnes (A à XFD).
const MAX_LIGNES = 1048576;
const MAX_COLONNES = 16384;

// 0 → A, 25 → Z, 26 → AA, 16383 → XFD
function lettreColonne(c) {
  let s = '';
  for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
function numeroColonne(lettres) {
  let n = 0;
  for (const ch of lettres.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

const adresse = (r, c) => `${lettreColonne(c)}${r + 1}`;
function adressePlage(p) {
  if (p.r1 === p.r2 && p.c1 === p.c2) return adresse(p.r1, p.c1);
  if (p.r1 === 0 && p.r2 === MAX_LIGNES - 1) return `${lettreColonne(p.c1)}:${lettreColonne(p.c2)}`;
  if (p.c1 === 0 && p.c2 === MAX_COLONNES - 1) return `${p.r1 + 1}:${p.r2 + 1}`;
  return `${adresse(p.r1, p.c1)}:${adresse(p.r2, p.c2)}`;
}

// « B3 », « b3:d10 », « $A$1 », « C:E » (colonnes entières), « 2:4 » (lignes entières) → plage, ou null.
function lirePlage(texte) {
  const t = String(texte || '').trim().replace(/\$/g, '').toUpperCase();
  let m = t.match(/^([A-Z]{1,3})(\d{1,7})(?::([A-Z]{1,3})(\d{1,7}))?$/);
  if (m) {
    const r1 = Number(m[2]) - 1, c1 = numeroColonne(m[1]);
    const r2 = m[3] ? Number(m[4]) - 1 : r1, c2 = m[3] ? numeroColonne(m[3]) : c1;
    return normaliser({ r1, c1, r2, c2 });
  }
  m = t.match(/^([A-Z]{1,3}):([A-Z]{1,3})$/);
  if (m) return normaliser({ r1: 0, c1: numeroColonne(m[1]), r2: MAX_LIGNES - 1, c2: numeroColonne(m[2]) });
  m = t.match(/^(\d{1,7}):(\d{1,7})$/);
  if (m) return normaliser({ r1: Number(m[1]) - 1, c1: 0, r2: Number(m[2]) - 1, c2: MAX_COLONNES - 1 });
  return null;
}

// Remet une plage dans le bon sens (r1 ≤ r2, c1 ≤ c2) et dans les limites de la feuille.
function normaliser(p) {
  const borne = (v, max) => Math.max(0, Math.min(max - 1, v));
  const r1 = borne(Math.min(p.r1, p.r2), MAX_LIGNES), r2 = borne(Math.max(p.r1, p.r2), MAX_LIGNES);
  const c1 = borne(Math.min(p.c1, p.c2), MAX_COLONNES), c2 = borne(Math.max(p.c1, p.c2), MAX_COLONNES);
  if (r1 > r2 || c1 > c2 || Number.isNaN(r1) || Number.isNaN(c1)) return null;
  return { r1, c1, r2, c2 };
}

const dansPlage = (p, r, c) => r >= p.r1 && r <= p.r2 && c >= p.c1 && c <= p.c2;
const memePlage = (a, b) => a && b && a.r1 === b.r1 && a.c1 === b.c1 && a.r2 === b.r2 && a.c2 === b.c2;
const croise = (a, b) => a.r1 <= b.r2 && b.r1 <= a.r2 && a.c1 <= b.c2 && b.c1 <= a.c2;
const taillePlage = (p) => (p.r2 - p.r1 + 1) * (p.c2 - p.c1 + 1);

// Couleurs : « #RRGGBB » partout dans Reikna. Luminosité perçue de 0 (noir) à 1 (blanc).
function luminosite(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return 0.5;
  const n = parseInt(m[1], 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

// Les nombres à la française : 1 234,5 (espace fine insécable pour les milliers).
const nombreFr = (n, decimales) => (decimales === undefined ? String(n) : n.toFixed(decimales)).replace('.', ',');
