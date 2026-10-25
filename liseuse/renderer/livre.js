// Ouvrir un livre et accéder à son texte, quel que soit son format.
//
// C'est la seule porte vers le contenu des livres : la bibliothèque (titre, auteur, couverture),
// la vue de lecture, la recherche, Loki, et plus tard le tuteur de langue passent tous par ici.
// - ouvrirLivre() rend un « livre » foliate-js (EPUB, MOBI, AZW3, FB2, CBZ), ou un livre fabriqué
//   ici pour les simples fichiers texte (.txt), avec la même forme.
// - chapitres() donne la liste des chapitres dans l'ordre de lecture (d'après le sommaire du livre,
//   ou section par section quand il n'en a pas) ; texteChapitre() leur texte, en paragraphes, et
//   découpé en phrases si on le demande.
// - phrases() et mots() découpent un texte selon les règles de sa langue (Intl.Segmenter).
//
// Rien ici ne dépend de l'affichage : ces fonctions marchent sur un livre ouvert à l'écran comme sur
// un livre ouvert en arrière-plan.

import { makeBook } from './foliate/view.js';

export const FORMATS = {
  epub: 'EPUB', mobi: 'MOBI', azw3: 'AZW3', azw: 'AZW', kf8: 'AZW3', fb2: 'FB2', fbz: 'FB2', cbz: 'CBZ', txt: 'TXT',
};
export function formatDe(nom) {
  const n = String(nom).toLowerCase();
  if (n.endsWith('.fb2.zip')) return 'FB2';
  return FORMATS[n.split('.').pop()] || n.split('.').pop().toUpperCase();
}

// --- Ouvrir ---

export async function ouvrirLivre({ bytes, nom }) {
  const format = formatDe(nom);
  if (format === 'PDF') throw new Error('Les PDF s\'ouvrent dans Mímir, le lecteur de documents d\'Atelier.');
  if (format === 'TXT') return livreTexte(decoderTexte(bytes), nom);
  // foliate-js reconnaît le format au contenu du fichier, et au nom pour le FB2 et le CBZ.
  const file = new File([bytes], String(nom).toLowerCase().endsWith('.fbz') ? `${nom}.fb2.zip` : nom);
  let book;
  try {
    book = await makeBook(file);
  } catch (err) {
    if (/not supported/i.test(err.message)) throw new Error(`${nom} n'est pas un livre que Kenning sait lire.`);
    throw new Error(`${nom} ne s'ouvre pas (${err.message}).`);
  }
  // Les livres Kindle achetés chez Amazon sont chiffrés (DRM) : leur texte est illisible.
  if (book.mobi?.headers?.palmdoc?.encryption > 0) {
    throw new Error(`${nom} est protégé par un DRM (livre Kindle acheté) : aucune liseuse libre ne peut l'ouvrir.`);
  }
  if (!book.sections?.length) throw new Error(`${nom} ne contient aucun texte.`);
  return book;
}

// Les fichiers texte anciens ne sont pas toujours en UTF-8 : on essaie l'UTF-8, puis l'encodage
// Windows d'Europe centrale (polonais) ou occidentale (français), selon les lettres trouvées.
function decoderTexte(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    const ce = new TextDecoder('windows-1250').decode(bytes);
    const polonais = (ce.match(/[ąćęłńśźżĄĆĘŁŃŚŹŻ]/g) || []).length;
    return polonais > ce.length / 500 ? ce : new TextDecoder('windows-1252').decode(bytes);
  }
}

const echapper = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Un fichier texte devient un petit livre : découpé en chapitres aux lignes qui en ont l'air
// (« Chapitre 3 », « Rozdział II », « IV. »…), sinon en parties d'une quarantaine de paragraphes.
const TITRE_CHAPITRE = /^\s*((chapitre|chapter|rozdzia[łl]|kapitel|cap[ií]tulo|capitolo|глава|partie|part|livre|book|cz[ęe][śs][ćc]|tom|prologue?|[ée]pilogue?|prolog|epilog)\b.{0,70}|[IVXLC]{1,7}\.?|\d{1,3}\.?)\s*$/i;

function livreTexte(texte, nom) {
  const lignes = texte.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const avecLignesVides = lignes.some((l) => !l.trim());
  // Paragraphes : séparés par des lignes vides (ou une ligne = un paragraphe s'il n'y en a aucune).
  const blocs = [];
  let courant = [];
  const fermer = () => { if (courant.length) blocs.push(courant.join(' ').replace(/\s+/g, ' ').trim()); courant = []; };
  lignes.forEach((l, i) => {
    if (!l.trim()) { fermer(); return; }
    const isole = (i === 0 || !lignes[i - 1].trim()) && (i === lignes.length - 1 || !lignes[i + 1].trim());
    if (TITRE_CHAPITRE.test(l) && (isole || !avecLignesVides)) { fermer(); blocs.push({ titre: l.trim() }); return; }
    courant.push(l.trim());
    if (!avecLignesVides) fermer();
  });
  fermer();

  const parties = [];
  let partie = null;
  for (const b of blocs) {
    if (typeof b === 'object') { partie = { titre: b.titre, paragraphes: [] }; parties.push(partie); continue; }
    if (!partie || (!parties.some((p) => p.titre) && partie.paragraphes.length >= 40)) {
      partie = { titre: null, paragraphes: [] };
      parties.push(partie);
    }
    partie.paragraphes.push(b);
  }
  if (!parties.length) parties.push({ titre: null, paragraphes: [''] });
  const titreLivre = String(nom).replace(/\.[^.]+$/, '');

  const sections = parties.map((p, i) => {
    const titre = p.titre || (parties.length > 1 ? `Partie ${i + 1}` : titreLivre);
    const html = `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${echapper(titre)}</title></head><body>`
      + (p.titre ? `<h2>${echapper(p.titre)}</h2>` : '')
      + p.paragraphes.map((x) => `<p>${echapper(x)}</p>`).join('') + '</body></html>';
    let url = null;
    return {
      id: i,
      titre,
      linear: 'yes',
      size: html.length,
      load: () => (url ??= URL.createObjectURL(new Blob([html], { type: 'application/xhtml+xml' }))),
      unload: () => { if (url) URL.revokeObjectURL(url); url = null; },
      createDocument: () => new DOMParser().parseFromString(html, 'application/xhtml+xml'),
    };
  });
  return {
    sections,
    dir: 'ltr',
    toc: sections.map((s, i) => ({ label: s.titre, href: String(i) })),
    metadata: { title: titreLivre },
    rendition: {},
    resolveHref: (href) => ({ index: Number(href) || 0, anchor: () => null }),
    splitTOCHref: (href) => [Number(href) || 0, null],
    getTOCFragment: (doc) => doc.body,
    isExternal: () => false,
    getCover: () => null,
  };
}

// --- Fiche du livre ---

// Les titres et les noms peuvent être une chaîne, { fr: '…', en: '…' }, { name: '…' } ou une liste.
const texteDe = (x) => {
  if (!x) return '';
  if (typeof x === 'string') return x;
  if (Array.isArray(x)) return x.map(texteDe).filter(Boolean).join(', ');
  if (x.name) return texteDe(x.name);
  const v = Object.values(x)[0];
  return typeof v === 'string' ? v : '';
};
const sansHtml = (s) => (s && /<[a-z]/i.test(s) ? new DOMParser().parseFromString(s, 'text/html').body.textContent : s || '').replace(/\s+/g, ' ').trim();

export function metadonnees(book, nom) {
  const m = book.metadata || {};
  const langue = Array.isArray(m.language) ? m.language[0] : m.language;
  const serie = m.belongsTo?.series;
  const s = Array.isArray(serie) ? serie[0] : serie;
  return {
    titre: texteDe(m.title).trim() || String(nom).replace(/\.[^.]+$/, ''),
    auteur: texteDe(m.author).trim().replace(/^(unknown|inconnu|anonymous)$/i, ''),
    langue: (langue || '').toLowerCase().split(/[-_]/)[0],
    editeur: texteDe(m.publisher).trim(),
    date: String(m.published || '').slice(0, 10),
    description: sansHtml(m.description).slice(0, 4000),
    sujets: (Array.isArray(m.subject) ? m.subject : []).map(texteDe).filter(Boolean).slice(0, 12),
    serie: s ? texteDe(s.name) : '',
    numeroSerie: s?.position && !Number.isNaN(s.position) ? s.position : null,
    // Taille du texte (octets), pour estimer le temps de lecture.
    tailleTexte: (book.sections || []).filter((x) => x.linear !== 'no').reduce((a, x) => a + (x.size || 0), 0),
  };
}

// La couverture réduite à 360 pixels de large, en JPEG (une vignette légère pour la bibliothèque).
export async function couvertureJpeg(book, largeur = 360) {
  let blob;
  try {
    blob = await book.getCover?.();
  } catch {
    return null;
  }
  if (!blob) return null;
  try {
    const img = await createImageBitmap(blob);
    const l = Math.min(largeur, img.width);
    const h = Math.round(img.height * l / img.width);
    const canvas = new OffscreenCanvas(l, h);
    const g = canvas.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, l, h);
    const out = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.86 });
    return new Uint8Array(await out.arrayBuffer());
  } catch {
    return null; // image illisible : la bibliothèque dessinera une couverture avec le titre
  }
}

// --- Chapitres ---

const cacheChapitres = new WeakMap();

// La liste des chapitres : [{ numero (à partir de 1), titre, niveau, index (section où il commence),
// href }]. Un chapitre s'étend jusqu'au début du suivant, même au milieu d'une section (beaucoup de
// livres mettent plusieurs chapitres dans un seul fichier).
export async function chapitres(book) {
  if (cacheChapitres.has(book)) return cacheChapitres.get(book);
  const liste = [];
  const parcourir = (items, niveau) => {
    for (const it of items || []) {
      const cible = it.href ? resoudre(book, it.href) : null;
      if (cible && cible.index >= 0) liste.push({ titre: (it.label || '').replace(/\s+/g, ' ').trim(), niveau, index: cible.index, href: it.href });
      parcourir(it.subitems, niveau + 1);
    }
  };
  parcourir(book.toc, 0);
  // L'ordre de lecture (un sommaire est parfois dans le désordre), sans doublons.
  liste.sort((a, b) => a.index - b.index);
  let resultat = liste.filter((c, i) => i === 0 || c.href !== liste[i - 1].href);

  const lineaires = book.sections.map((s, i) => (s.linear !== 'no' ? i : -1)).filter((i) => i >= 0);
  if (!resultat.length) {
    // Pas de sommaire : une section = un chapitre, titré par son premier titre (h1, h2…).
    resultat = [];
    for (const i of lineaires) {
      const doc = await documentDe(book, i);
      const h = doc?.querySelector('h1, h2, h3, title');
      const texte = doc?.body?.textContent.trim() || '';
      if (!texte) continue;
      resultat.push({ titre: (h?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120) || `Partie ${resultat.length + 1}`, niveau: 0, index: i, href: null });
    }
  } else if (lineaires.length && resultat[0].index > lineaires[0]) {
    // Du texte avant le premier chapitre du sommaire (avant-propos, dédicace…) : on le garde.
    let longueur = 0;
    for (const i of lineaires.filter((x) => x < resultat[0].index)) longueur += ((await documentDe(book, i))?.body?.textContent.trim().length || 0);
    if (longueur > 300) resultat.unshift({ titre: 'Début', niveau: 0, index: lineaires[0], href: null });
  }
  resultat.forEach((c, i) => { c.numero = i + 1; });
  cacheChapitres.set(book, resultat);
  return resultat;
}

function resoudre(book, href) {
  try {
    return book.resolveHref(href);
  } catch {
    return null;
  }
}

async function documentDe(book, index) {
  try {
    return await book.sections[index]?.createDocument?.();
  } catch {
    return null;
  }
}

// Le chapitre où se trouve une section (et, si on la connaît, une position dans la section).
export async function chapitreDe(book, index, range) {
  const liste = await chapitres(book);
  let trouve = liste[0] || null;
  for (const c of liste) {
    if (c.index < index) trouve = c;
    else if (c.index === index) {
      // Plusieurs chapitres dans la même section : celui qui commence avant la position.
      if (!range || !c.href) { trouve = c; continue; }
      const el = ancre(book, c.href, range.startContainer.ownerDocument || range.startContainer);
      if (!el || range.comparePoint(el, 0) <= 0) trouve = c;
    } else break;
  }
  return trouve;
}

function ancre(book, href, doc) {
  const cible = resoudre(book, href);
  if (!cible?.anchor || !doc) return null;
  try {
    const a = cible.anchor(doc);
    if (!a) return null;
    return a instanceof Range ? a.startContainer : a;
  } catch {
    return null;
  }
}

// Les éléments qui portent du texte : un paragraphe, un titre, un élément de liste… Une div ne compte
// que si elle ne contient aucun de ces éléments (certains livres n'ont que des div).
const BLOCS = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, dd, dt, figcaption, td, th, div';
const NOTES = 'aside, [epub\\:type~="footnote"], [epub\\:type~="endnote"], [epub\\:type~="rearnote"], [epub\\:type~="note"], script, style, nav';

function paragraphesDe(doc, debut, fin) {
  if (!doc?.body) return [];
  const range = doc.createRange();
  range.selectNodeContents(doc.body);
  if (debut) range.setStartBefore(debut);
  if (fin) range.setEndBefore(fin);
  const out = [];
  for (const el of doc.body.querySelectorAll(BLOCS)) {
    if (el.querySelector(BLOCS)) continue;
    if (el.closest(NOTES)) continue;
    if (!range.intersectsNode(el)) continue;
    // Le premier bloc, s'il contient l'ancre du chapitre, ne commence qu'à elle.
    const texte = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!texte) continue;
    out.push({ texte, titre: /^h[1-6]$/i.test(el.localName) });
  }
  return out;
}

// Le texte d'un chapitre (numéro à partir de 1) : { numero, titre, paragraphes: [{ texte, titre,
// phrases? }] }. phrases: true découpe aussi chaque paragraphe en phrases (pour lire phrase par phrase).
export async function texteChapitre(book, numero, { phrases: avecPhrases = false, langue } = {}) {
  const liste = await chapitres(book);
  const c = liste[numero - 1];
  if (!c) throw new Error(`Pas de chapitre ${numero} : ce livre en a ${liste.length}.`);
  const suivant = liste[numero];
  const derniere = suivant ? suivant.index : book.sections.length - 1;
  const paragraphes = [];
  for (let i = c.index; i <= derniere; i++) {
    if (book.sections[i]?.linear === 'no' && i !== c.index) continue;
    const doc = await documentDe(book, i);
    if (!doc) continue;
    const debut = i === c.index && c.href ? ancre(book, c.href, doc) : null;
    let fin = null;
    if (suivant && i === suivant.index) {
      fin = suivant.href ? ancre(book, suivant.href, doc) : null;
      // Le chapitre suivant commence au début de cette section : elle n'appartient pas à ce chapitre.
      if (!fin || fin === doc.body || fin === doc.documentElement) break;
    }
    paragraphes.push(...paragraphesDe(doc, debut, fin));
  }
  if (avecPhrases) {
    const l = langue || langueDe(book);
    for (const p of paragraphes) p.phrases = phrases(p.texte, l);
  }
  return { numero: c.numero, titre: c.titre, paragraphes };
}

// Tout le texte d'un chapitre en une chaîne (un paragraphe par ligne, titres précédés de « # »).
export async function texteBrut(book, numero) {
  const { paragraphes } = await texteChapitre(book, numero);
  return paragraphes.map((p) => (p.titre ? `# ${p.texte}` : p.texte)).join('\n\n');
}

// --- Langue, phrases et mots ---

export function langueDe(book) {
  const l = Array.isArray(book.metadata?.language) ? book.metadata.language[0] : book.metadata?.language;
  return (l || '').toLowerCase().split(/[-_]/)[0] || undefined;
}

export function phrases(texte, langue) {
  try {
    const seg = new Intl.Segmenter(langue || undefined, { granularity: 'sentence' });
    return [...seg.segment(texte)].map((s) => s.segment.trim()).filter(Boolean);
  } catch {
    return texte.split(/(?<=[.!?…])\s+/).filter(Boolean);
  }
}

export function mots(texte, langue) {
  try {
    const seg = new Intl.Segmenter(langue || undefined, { granularity: 'word' });
    return [...seg.segment(texte)].filter((s) => s.isWordLike).map((s) => ({ mot: s.segment, position: s.index }));
  } catch {
    return [...texte.matchAll(/[\p{L}\p{N}'’-]+/gu)].map((m) => ({ mot: m[0], position: m.index }));
  }
}

// Nom des langues en français (« pl » → « polonais »), pour la bibliothèque et Loki.
export function nomLangue(code) {
  if (!code) return '';
  try {
    return new Intl.DisplayNames(['fr'], { type: 'language' }).of(code) || code;
  } catch {
    return code;
  }
}
