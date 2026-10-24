// Petits outils communs à toute l'interface : sélecteurs, nettoyage du HTML, couleurs, unités.
//
// Vocabulaire d'Edda :
// - un « document » = un onglet : sa page (le HTML qu'on modifie), son fichier (chemin, format) et
//   sa mise en page (format de papier, orientation, marges).
// - la « page » = la feuille blanche où l'on écrit (un élément contenteditable).
// - un « média » = une image, une vidéo ou un son posé dans la page.

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const c of children) if (c != null) node.append(c);
  return node;
}

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const nomFichier = (chemin) => String(chemin).split(/[\\/]/).pop();
const extension = (chemin) => (nomFichier(chemin).match(/\.([^.]+)$/)?.[1] || '').toLowerCase();

// --- Unités ---
// Tout ce qui est mesuré dans la page l'est en pixels CSS (96 par pouce). Word compte en vingtièmes
// de point (twips) et en EMU, LibreOffice en cm : les formats convertissent avec ces fonctions.
const Unites = {
  PX_PAR_CM: 96 / 2.54,
  cmEnPx: (cm) => cm * 96 / 2.54,
  pxEnCm: (px) => px * 2.54 / 96,
  ptEnPx: (pt) => pt * 96 / 72,
  pxEnPt: (px) => px * 72 / 96,
  pxEnTwips: (px) => Math.round(px * 15),
  twipsEnPx: (tw) => tw / 15,
  pxEnEmu: (px) => Math.round(px * 9525),
  emuEnPx: (emu) => emu / 9525,
  // « 12pt », « 16px », « 1.5cm », « 0.5in », « 3mm » → pixels (null si illisible).
  lire(valeur) {
    const m = String(valeur ?? '').trim().match(/^(-?[\d.]+)\s*(px|pt|cm|mm|in|pc|em|rem)?$/i);
    if (!m) return null;
    const n = Number(m[1]);
    switch ((m[2] || 'px').toLowerCase()) {
      case 'pt': return Unites.ptEnPx(n);
      case 'cm': return Unites.cmEnPx(n);
      case 'mm': return Unites.cmEnPx(n / 10);
      case 'in': return n * 96;
      case 'pc': return n * 16;
      case 'em': case 'rem': return n * 16;
      default: return n;
    }
  },
};

// Tailles de police nommées du HTML (et de document.execCommand('fontSize')) → points.
const TAILLES_NOMMEES = { 'xx-small': 7, 'x-small': 7.5, small: 10, medium: 12, large: 13.5, 'x-large': 18, 'xx-large': 24, 'xxx-large': 36 };
function taillePt(valeur) {
  if (!valeur) return null;
  if (TAILLES_NOMMEES[valeur]) return TAILLES_NOMMEES[valeur];
  const px = Unites.lire(valeur);
  return px ? Math.round(Unites.pxEnPt(px) * 2) / 2 : null;
}

// --- Couleurs ---
// « rgb(255, 0, 0) », « #f00 », « red » → « ff0000 » (sans dièse, comme dans Word), ou null.
const toileCouleur = document.createElement('canvas').getContext('2d');
function couleurHex(valeur) {
  if (!valeur) return null;
  const v = String(valeur).trim().toLowerCase();
  if (v === 'transparent' || v === 'inherit' || v === 'initial' || v === 'currentcolor' || v === 'auto' || v === 'none') return null;
  let m = v.match(/^#([0-9a-f]{3})$/);
  if (m) return m[1].split('').map((c) => c + c).join('');
  m = v.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/);
  if (m) return m[2] === '00' ? null : m[1];
  m = v.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+%?))?\s*\)$/);
  if (m) {
    if (m[4] !== undefined && parseFloat(m[4]) === 0) return null;
    return [m[1], m[2], m[3]].map((n) => Math.min(255, Number(n)).toString(16).padStart(2, '0')).join('');
  }
  toileCouleur.fillStyle = '#000000';
  toileCouleur.fillStyle = v;
  const r = toileCouleur.fillStyle;
  return r.startsWith('#') && (r !== '#000000' || v === 'black') ? r.slice(1) : null;
}
// Les surligneurs de Word ont des noms (yellow, green…) : on les traduit en couleurs.
const SURLIGNEURS_WORD = {
  yellow: 'ffff00', green: '00ff00', cyan: '00ffff', magenta: 'ff00ff', blue: '0000ff', red: 'ff0000',
  darkBlue: '000080', darkCyan: '008080', darkGreen: '008000', darkMagenta: '800080', darkRed: '800000',
  darkYellow: '808000', darkGray: '808080', lightGray: 'c0c0c0', black: '000000', white: 'ffffff',
};

// --- Texte : deviner l'encodage d'un fichier ---
// UTF-8 (avec ou sans BOM), UTF-16 (avec BOM), sinon Windows-1252 (les vieux fichiers de Windows).
function decoderTexte(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return { texte: new TextDecoder('utf-8').decode(b.subarray(3)), encodage: 'utf-8-bom' };
  if (b[0] === 0xff && b[1] === 0xfe) return { texte: new TextDecoder('utf-16le').decode(b.subarray(2)), encodage: 'utf-16le' };
  if (b[0] === 0xfe && b[1] === 0xff) return { texte: new TextDecoder('utf-16be').decode(b.subarray(2)), encodage: 'utf-16be' };
  try {
    return { texte: new TextDecoder('utf-8', { fatal: true }).decode(b), encodage: 'utf-8' };
  } catch {
    return { texte: new TextDecoder('windows-1252').decode(b), encodage: 'windows-1252' };
  }
}
const encoderTexte = (texte) => new TextEncoder().encode(texte);

// --- Nettoyage du HTML ---
// Tout ce qui entre dans la page (un fichier ouvert, un collage, ce qu'écrit Claude) passe par ici :
// on ne garde que ce qu'un traitement de texte sait représenter (titres, paragraphes, listes,
// tableaux, liens, médias, mise en forme du texte), et aucun script.
const Nettoyage = (() => {
  const BALISES = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code', 'ul', 'ol', 'li',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'colgroup', 'col',
    'a', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'ins', 'sub', 'sup', 'mark', 'span', 'font', 'small', 'big',
    'br', 'hr', 'div', 'section', 'article', 'header', 'footer', 'main', 'figure', 'figcaption', 'center',
    'img', 'video', 'audio', 'source', 'dl', 'dt', 'dd', 'kbd', 'samp', 'var', 'abbr', 'cite', 'q'];
  const ATTRIBUTS = ['style', 'href', 'src', 'alt', 'title', 'width', 'height', 'controls', 'colspan', 'rowspan',
    'class', 'start', 'type', 'align', 'color', 'face', 'size', 'poster', 'loop', 'data-nom', 'valign', 'bgcolor'];
  // Seulement les propriétés de mise en forme qu'Edda comprend : le reste (position, display…)
  // casserait la page.
  const STYLES = ['color', 'background-color', 'background', 'font-family', 'font-size', 'font-weight', 'font-style',
    'text-decoration', 'text-decoration-line', 'text-align', 'margin-left', 'padding-left', 'text-indent', 'width', 'height',
    'vertical-align', 'line-height', 'border', 'border-top', 'border-bottom', 'border-left', 'border-right',
    'border-collapse', 'page-break-before', 'page-break-after', 'break-before', 'break-after', 'list-style-type', 'float'];
  const CLASSES = ['saut-page', 'tab', 'media'];

  let pret = false;
  function preparer() {
    if (pret) return;
    pret = true;
    DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
      if (data.attrName === 'style') {
        const garde = [];
        const tmp = document.createElement('span');
        tmp.setAttribute('style', data.attrValue);
        for (const prop of STYLES) {
          const v = tmp.style.getPropertyValue(prop);
          if (v && !/url\(|expression/i.test(v)) garde.push(`${prop}: ${v}`);
        }
        data.attrValue = garde.join('; ');
        if (!data.attrValue) data.keepAttr = false;
      } else if (data.attrName === 'class') {
        data.attrValue = data.attrValue.split(/\s+/).filter((c) => CLASSES.includes(c)).join(' ');
        if (!data.attrValue) data.keepAttr = false;
      }
    });
  }

  // racine (facultatif) : l'adresse file:// du dossier du document, pour les images aux chemins relatifs.
  function html(source, { racine } = {}) {
    preparer();
    const frag = DOMPurify.sanitize(String(source ?? ''), {
      ALLOWED_TAGS: BALISES,
      ALLOWED_ATTR: ATTRIBUTS,
      ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|file|data|blob):|#|[^a-z]|[a-z0-9+.-]+(?:[^a-z0-9+.:-]|$))/i,
      ADD_DATA_URI_TAGS: ['video', 'audio', 'source'],
      RETURN_DOM_FRAGMENT: true,
    });
    normaliser(frag, racine);
    const div = document.createElement('div');
    div.append(frag);
    return div.innerHTML;
  }

  // Remet le HTML dans la forme qu'Edda attend (voir formats/commun.js) :
  // <font> devient <span style>, <center> un paragraphe centré, un saut de page (de Word ou d'un
  // site) un <hr class="saut-page">, les médias ont leur adresse complète.
  function normaliser(root, racine) {
    for (const f of [...root.querySelectorAll('font')]) {
      const span = document.createElement('span');
      if (f.getAttribute('color')) span.style.color = f.getAttribute('color');
      if (f.getAttribute('face')) span.style.fontFamily = f.getAttribute('face');
      const size = Number(f.getAttribute('size'));
      if (size) span.style.fontSize = `${[0, 7.5, 10, 12, 13.5, 18, 24, 36][Math.min(7, Math.max(1, size))]}pt`;
      if (f.getAttribute('style')) span.style.cssText += f.getAttribute('style');
      span.append(...f.childNodes);
      f.replaceWith(span);
    }
    for (const c of [...root.querySelectorAll('center')]) {
      const div = document.createElement('div');
      div.style.textAlign = 'center';
      div.append(...c.childNodes);
      c.replaceWith(div);
    }
    for (const n of [...root.querySelectorAll('[align]')]) {
      const a = n.getAttribute('align').toLowerCase();
      if (['left', 'center', 'right', 'justify'].includes(a) && !n.style.textAlign && !['IMG', 'TABLE'].includes(n.tagName)) n.style.textAlign = a;
      n.removeAttribute('align');
    }
    for (const n of [...root.querySelectorAll('[bgcolor]')]) {
      if (!n.style.backgroundColor) n.style.backgroundColor = n.getAttribute('bgcolor');
      n.removeAttribute('bgcolor');
    }
    for (const n of [...root.querySelectorAll('*')]) {
      const s = n.style;
      if (!s) continue;
      if (/always|page/.test(s.pageBreakBefore + s.breakBefore) && n.tagName !== 'HR') {
        n.before(Object.assign(document.createElement('hr'), { className: 'saut-page' }));
        s.pageBreakBefore = ''; s.breakBefore = '';
      }
      if (/always|page/.test(s.pageBreakAfter + s.breakAfter) && n.tagName !== 'HR') {
        if (!n.textContent.trim() && !n.querySelector('img,video,audio')) n.replaceWith(Object.assign(document.createElement('hr'), { className: 'saut-page' }));
        else { n.after(Object.assign(document.createElement('hr'), { className: 'saut-page' })); s.pageBreakAfter = ''; s.breakAfter = ''; }
      }
      if (n.classList?.contains('saut-page') && n.tagName !== 'HR') n.replaceWith(Object.assign(document.createElement('hr'), { className: 'saut-page' }));
    }
    // <video><source src></video> → <video src> (une seule adresse, plus simple à enregistrer).
    for (const m of [...root.querySelectorAll('video, audio')]) {
      const s = m.querySelector('source[src]');
      if (!m.getAttribute('src') && s) m.setAttribute('src', s.getAttribute('src'));
      for (const x of [...m.querySelectorAll('source')]) x.remove();
      m.textContent = '';
      m.setAttribute('controls', '');
    }
    if (racine) {
      for (const m of [...root.querySelectorAll('img[src], video[src], audio[src]')]) {
        const src = m.getAttribute('src');
        if (src && !/^(data|blob|https?|file):/i.test(src)) {
          try { m.setAttribute('src', new URL(src.replace(/\\/g, '/'), racine).href); } catch { /* adresse illisible */ }
        }
      }
    }
    for (const m of [...root.querySelectorAll('img, video, audio')]) {
      m.classList.add('media');
      const w = m.getAttribute('width');
      if (w && !m.style.width) m.style.width = /%$/.test(w) ? w : `${parseFloat(w)}px`;
      m.removeAttribute('width');
      m.removeAttribute('height');
      if (m.style.height && m.tagName !== 'AUDIO') m.style.height = '';
    }
    fusionner(root);
    // Du texte ou une image posés directement dans la page, hors de tout paragraphe : on les range
    // dans un paragraphe (sinon l'alignement et les styles ne s'y appliquent pas).
    const BLOCS = /^(P|H[1-6]|BLOCKQUOTE|PRE|UL|OL|TABLE|HR|DIV|SECTION|ARTICLE|HEADER|FOOTER|MAIN|FIGURE|DL)$/;
    let p = null;
    for (const n of [...root.childNodes]) {
      if (n.nodeType === 1 && BLOCS.test(n.tagName)) { p = null; continue; }
      if (n.nodeType === 3 && !n.nodeValue.trim()) { if (p) p.append(n); else n.remove(); continue; }
      if (n.nodeType !== 1 && n.nodeType !== 3) continue;
      if (!p) { p = document.createElement('p'); n.before(p); }
      p.append(n);
    }
    // Liens : seulement vers le web, une adresse mail ou un endroit du document.
    for (const a of [...root.querySelectorAll('a[href]')]) {
      if (!/^(https?:|mailto:|#|file:)/i.test(a.getAttribute('href'))) a.removeAttribute('href');
    }
  }

  // Deux morceaux voisins avec la même mise en forme (<s>barr</s><s>é</s>, fréquent dans les fichiers
  // Word et RTF) n'en font plus qu'un : la page est plus légère et plus simple à modifier.
  const EN_LIGNE = new Set(['STRONG', 'B', 'EM', 'I', 'U', 'S', 'SUB', 'SUP', 'SPAN', 'A', 'MARK', 'CODE']);
  const memesAttributs = (a, b) => a.attributes.length === b.attributes.length && [...a.attributes].every((x) => b.getAttribute(x.name) === x.value);
  function fusionner(root) {
    for (const n of [...root.querySelectorAll('strong, b, em, i, u, s, sub, sup, span, a, mark, code')]) {
      if (!n.isConnected && !root.contains(n)) continue;
      if (n.classList.contains('tab')) continue;
      let suivant = n.nextSibling;
      while (suivant && EN_LIGNE.has(suivant.nodeName) && suivant.nodeName === n.nodeName && memesAttributs(n, suivant) && !suivant.classList.contains('tab')) {
        n.append(...suivant.childNodes);
        suivant.remove();
        suivant = n.nextSibling;
      }
    }
    // Le résultat peut créer de nouveaux voisins à l'intérieur (<strong>a</strong> puis <strong>b</strong> dans deux <em>) : un 2e passage suffit en pratique.
    for (const n of [...root.querySelectorAll('strong, b, em, i, u, s, sub, sup, span, a, mark, code')]) {
      let suivant = n.nextSibling;
      while (suivant && suivant.nodeName === n.nodeName && EN_LIGNE.has(n.nodeName) && memesAttributs(n, suivant) && !n.classList.contains('tab') && !suivant.classList.contains('tab')) {
        n.append(...suivant.childNodes);
        suivant.remove();
        suivant = n.nextSibling;
      }
    }
    // Un <span> sans rien : on garde seulement son contenu.
    for (const s of [...root.querySelectorAll('span:not([style]):not([class])')]) s.replaceWith(...s.childNodes);
  }

  return { html, normaliser };
})();

// --- Médias : d'un <img>/<video>/<audio> de la page vers des octets (pour les enregistrer) ---
const Medias = {
  type: (node) => ({ IMG: 'image', VIDEO: 'video', AUDIO: 'audio' }[node.tagName] || null),
  nom(node) {
    const src = node.getAttribute('src') || '';
    if (node.dataset.nom) return node.dataset.nom;
    if (/^data:/i.test(src)) return `image.${(src.match(/^data:image\/(\w+)/i)?.[1] || 'png').replace('jpeg', 'jpg').replace('svg+xml', 'svg')}`;
    try { return decodeURIComponent(new URL(src).pathname.split('/').pop()) || 'media'; } catch { return 'media'; }
  },
  // Les octets d'une adresse data:, file:// ou https:// ({ bytes, mime }).
  async octets(src) {
    if (/^data:/i.test(src)) {
      const [tete, donnees] = src.split(',', 2);
      const mime = tete.slice(5).split(';')[0];
      const bytes = /;base64/i.test(tete) ? Uint8Array.from(atob(donnees), (c) => c.charCodeAt(0)) : encoderTexte(decodeURIComponent(donnees));
      return { bytes, mime };
    }
    if (/^blob:/i.test(src)) {
      const blob = await (await fetch(src)).blob();
      return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: blob.type };
    }
    const r = await window.edda.lireMedia(src);
    return { bytes: new Uint8Array(r.bytes), mime: r.mime };
  },
  // Une image prête pour Word, LibreOffice ou le RTF : PNG ou JPEG (les autres formats, WebP, SVG,
  // AVIF…, sont convertis en PNG), avec sa taille en pixels.
  async imagePourBureautique(src, { formats = ['png', 'jpeg'] } = {}) {
    let { bytes, mime } = await Medias.octets(src);
    if (!mime) mime = Medias.mimeDe(bytes);
    let ext = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/gif': 'gif', 'image/bmp': 'bmp' }[mime];
    const blob = new Blob([bytes], { type: mime || 'image/png' });
    const bitmap = await Medias.decoder(blob);
    if (!ext || !formats.includes(ext)) {
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width; canvas.height = bitmap.height;
      canvas.getContext('2d').drawImage(bitmap, 0, 0);
      bytes = new Uint8Array(await (await new Promise((r) => canvas.toBlob(r, 'image/png'))).arrayBuffer());
      ext = 'png';
      mime = 'image/png';
    }
    return { bytes, mime, ext: ext === 'jpeg' ? 'jpg' : ext, largeur: bitmap.width, hauteur: bitmap.height };
  },
  async decoder(blob) {
    try {
      return await createImageBitmap(blob);
    } catch {
      // Le SVG ne passe pas par createImageBitmap : on le dessine avec une <img>.
      const url = URL.createObjectURL(blob);
      try {
        const img = new Image();
        img.src = url;
        await img.decode();
        const w = img.naturalWidth || 300, h = img.naturalHeight || 150;
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        return canvas;
      } finally {
        URL.revokeObjectURL(url);
      }
    }
  },
  mimeDe(bytes) {
    const b = bytes;
    if (b[0] === 0x89 && b[1] === 0x50) return 'image/png';
    if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
    if (b[0] === 0x47 && b[1] === 0x49) return 'image/gif';
    if (b[0] === 0x42 && b[1] === 0x4d) return 'image/bmp';
    if (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57) return 'image/webp';
    if (b[0] === 0x3c) return 'image/svg+xml';
    return '';
  },
  // Octets → adresse data: (pour une image venue d'un .docx, d'un .odt ou d'un RTF).
  dataUrl(bytes, mime) {
    let s = '';
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return `data:${mime || Medias.mimeDe(b) || 'application/octet-stream'};base64,${btoa(s)}`;
  },
  EXT_VIDEO: ['mp4', 'webm', 'ogv', 'mov', 'm4v'],
  EXT_AUDIO: ['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'opus'],
  // Un lien vers une vidéo ou un son (c'est ainsi qu'Edda les garde dans un .docx ou un .odt) ?
  typeDuLien(href) {
    const ext = extension(String(href || '').split(/[?#]/)[0]);
    return Medias.EXT_VIDEO.includes(ext) ? 'video' : Medias.EXT_AUDIO.includes(ext) ? 'audio' : null;
  },
};
