// Recherche dans le projet, côté Node : la liste de tous les fichiers (pour Ctrl+P) et la
// recherche d'un texte dans tous les fichiers (pour Ctrl+Maj+F), et son remplacement.
//
// On parcourt le dossier ouvert nous-mêmes, sans outil externe. Pour rester rapide, on saute
// les dossiers qui ne contiennent jamais ton code (.git, node_modules…), les fichiers binaires
// (images, PSD…) et les très gros fichiers.

const path = require('node:path');
const fs = require('node:fs/promises');

const SKIPPED_DIRS = new Set(['.git', 'node_modules', '.cache', '.next', '.nuxt', '.svelte-kit', '__pycache__', '.venv']);
const MAX_FILES = 20000;          // au-delà, la liste s'arrête (projet énorme)
const MAX_FILE_SIZE = 1024 * 1024; // on ne cherche pas dans les fichiers de plus de 1 Mo
const MAX_MATCHES = 2000;          // au-delà, on arrête et on le signale
const PREVIEW = 160;               // longueur maximale d'une ligne affichée dans les résultats

// Tous les fichiers du projet, avec leur chemin relatif ("css/style.css").
async function listFiles(root) {
  const files = [];
  let truncated = false;
  async function walk(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return; // dossier illisible (droits) : on passe
    }
    for (const e of entries) {
      if (files.length >= MAX_FILES) { truncated = true; return; }
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIPPED_DIRS.has(e.name)) await walk(full);
      } else if (e.isFile()) {
        files.push({ path: full, rel: path.relative(root, full).split(path.sep).join('/') });
      }
    }
  }
  await walk(root);
  return { files, truncated };
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function buildPattern({ query, caseSensitive, regex, wholeWord }) {
  let source = regex ? query : escapeRegExp(query);
  if (wholeWord) source = `\\b(?:${source})\\b`;
  try {
    return new RegExp(source, caseSensitive ? 'g' : 'gi');
  } catch (err) {
    throw new Error(`Expression régulière invalide : ${err.message.replace(/^Invalid regular expression: \/.*\/\w*: /, '')}`);
  }
}

// Un fichier est considéré comme binaire s'il contient un octet nul dans ses 8 premiers Ko.
const isBinary = (buffer) => buffer.subarray(0, 8192).includes(0);

// Une ligne trop longue (fichier minifié…) est coupée autour du résultat.
function preview(line, col, length) {
  if (line.length <= PREVIEW) return { text: line, start: col };
  const from = Math.max(0, col - 40);
  const text = (from > 0 ? '…' : '') + line.slice(from, from + PREVIEW);
  return { text, start: col - from + (from > 0 ? 1 : 0), length: Math.min(length, PREVIEW) };
}

// Texte de remplacement pour un résultat. Sans expression régulière, il est pris tel quel.
// Avec, comme dans VS Code et en JavaScript : $1, $2… (groupes), $<nom>, $& (tout le résultat), $$ ($).
function expand(replace, match, regex) {
  if (!regex) return replace;
  return replace.replace(/\$(\$|&|<([^>]+)>|(\d{1,2}))/g, (whole, token, name, num) => {
    if (token === '$') return '$';
    if (token === '&') return match[0];
    if (name !== undefined) return match.groups?.[name] ?? '';
    const n = Number(num);
    if (n > 0 && n < match.length) return match[n] ?? '';
    // "$12" avec seulement 1 groupe : $1 suivi de "2", comme en JavaScript
    if (num.length === 2 && Number(num[0]) > 0 && Number(num[0]) < match.length) return (match[Number(num[0])] ?? '') + num[1];
    return whole;
  });
}

// Remplace dans un texte, ligne par ligne (comme la recherche : un résultat ne déborde pas sur
// la ligne suivante). Les fins de ligne d'origine (\n ou \r\n) sont gardées.
function replaceInText(text, pattern, replace, regex) {
  let count = 0;
  const parts = text.split(/(\r?\n)/); // les séparateurs restent dans le tableau, aux indices impairs
  for (let i = 0; i < parts.length; i += 2) {
    pattern.lastIndex = 0;
    parts[i] = parts[i].replace(pattern, (...args) => {
      const hasGroups = typeof args[args.length - 1] === 'object';
      const match = args.slice(0, hasGroups ? -3 : -2);
      if (hasGroups) match.groups = args[args.length - 1];
      if (match[0].length === 0) return match[0]; // motif vide : on ne remplace rien
      count++;
      return expand(replace, match, regex);
    });
  }
  return { text: parts.join(''), count };
}

async function replaceText(root, options, replace, { only = null, texts = {} } = {}) {
  const pattern = buildPattern(options);
  const changed = [];
  const fromEditor = {};
  let count = 0;
  // Fichiers ouverts avec des modifications non enregistrées : l'interface envoie leur texte,
  // on renvoie le résultat, et c'est elle qui le met dans l'éditeur (rien n'est écrit sur le disque).
  for (const [file, text] of Object.entries(texts)) {
    if (only && !only.includes(file)) continue;
    const r = replaceInText(String(text), pattern, replace, options.regex);
    if (r.count) { fromEditor[file] = r.text; count += r.count; }
  }
  const { files } = await listFiles(root);
  for (const file of files) {
    if (only && !only.includes(file.path)) continue;
    if (Object.hasOwn(texts, file.path)) continue;
    let buffer;
    try {
      const stat = await fs.stat(file.path);
      if (stat.size > MAX_FILE_SIZE) continue;
      buffer = await fs.readFile(file.path);
    } catch {
      continue;
    }
    if (isBinary(buffer)) continue;
    const r = replaceInText(buffer.toString('utf8'), pattern, replace, options.regex);
    if (!r.count) continue;
    await fs.writeFile(file.path, r.text, 'utf8');
    changed.push(file.path);
    count += r.count;
  }
  return { count, changed, fromEditor };
}

// `texts` : le texte des fichiers ouverts non enregistrés, qui remplace celui du disque (on
// cherche dans ce que tu vois à l'écran).
async function searchText(root, options, texts = {}) {
  if (!options.query) return { results: [], count: 0, truncated: false };
  const pattern = buildPattern(options);
  const { files } = await listFiles(root);
  const results = [];
  let count = 0;
  for (const file of files) {
    let content;
    if (Object.hasOwn(texts, file.path)) {
      content = String(texts[file.path]);
    } else {
      let buffer;
      try {
        const stat = await fs.stat(file.path);
        if (stat.size > MAX_FILE_SIZE) continue;
        buffer = await fs.readFile(file.path);
      } catch {
        continue;
      }
      if (isBinary(buffer)) continue;
      content = buffer.toString('utf8');
    }
    const lines = content.split(/\r?\n/);
    const matches = [];
    for (let i = 0; i < lines.length; i++) {
      pattern.lastIndex = 0;
      let m;
      while ((m = pattern.exec(lines[i]))) {
        if (m[0].length === 0) { pattern.lastIndex++; continue; } // motif vide (ex. "a*") : on avance
        const p = preview(lines[i], m.index, m[0].length);
        const found = { line: i + 1, col: m.index + 1, length: m[0].length, text: p.text, start: p.start, previewLength: p.length ?? m[0].length };
        if (typeof options.replace === 'string') found.replacement = expand(options.replace, m, options.regex); // aperçu du remplacement
        matches.push(found);
        if (++count >= MAX_MATCHES) break;
      }
      if (count >= MAX_MATCHES) break;
    }
    if (matches.length) results.push({ path: file.path, rel: file.rel, matches });
    if (count >= MAX_MATCHES) return { results, count, truncated: true };
  }
  return { results, count, truncated: false };
}

function register({ handle, getRoot }) {
  const root = () => {
    const r = getRoot();
    if (!r) throw new Error("Ouvre d'abord un dossier.");
    return r;
  };
  handle('files:list', async () => listFiles(root()));
  const clean = (options) => ({
    query: String(options.query || ''),
    caseSensitive: Boolean(options.caseSensitive),
    regex: Boolean(options.regex),
    wholeWord: Boolean(options.wholeWord),
    replace: typeof options.replace === 'string' ? options.replace : undefined,
  });
  handle('search:text', async (_event, options, texts) => searchText(root(), clean(options), texts && typeof texts === 'object' ? texts : {}));
  // Remplacer : partout, ou seulement dans `only` (une liste de fichiers du projet).
  handle('search:replace', async (_event, options, replace, { only = null, texts = {} } = {}) => {
    const r = root();
    const opts = clean(options);
    if (!opts.query) throw new Error('Rien à rechercher.');
    const inside = (p) => { const rel = path.relative(r, path.resolve(p)); return rel && !rel.startsWith('..') && !path.isAbsolute(rel); };
    if (only && !only.every(inside)) throw new Error('Fichier hors du dossier ouvert.');
    if (!Object.keys(texts).every(inside)) throw new Error('Fichier hors du dossier ouvert.');
    return replaceText(r, opts, String(replace ?? ''), { only, texts });
  });
}

module.exports = { register, replaceInText, buildPattern };
