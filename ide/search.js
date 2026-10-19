// Recherche dans le projet, côté Node : la liste de tous les fichiers (pour Ctrl+P) et la
// recherche d'un texte dans tous les fichiers (pour Ctrl+Maj+F).
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

async function searchText(root, options) {
  if (!options.query) return { results: [], count: 0, truncated: false };
  const pattern = buildPattern(options);
  const { files } = await listFiles(root);
  const results = [];
  let count = 0;
  for (const file of files) {
    let buffer;
    try {
      const stat = await fs.stat(file.path);
      if (stat.size > MAX_FILE_SIZE) continue;
      buffer = await fs.readFile(file.path);
    } catch {
      continue;
    }
    if (isBinary(buffer)) continue;
    const lines = buffer.toString('utf8').split(/\r?\n/);
    const matches = [];
    for (let i = 0; i < lines.length; i++) {
      pattern.lastIndex = 0;
      let m;
      while ((m = pattern.exec(lines[i]))) {
        if (m[0].length === 0) { pattern.lastIndex++; continue; } // motif vide (ex. "a*") : on avance
        const p = preview(lines[i], m.index, m[0].length);
        matches.push({ line: i + 1, col: m.index + 1, length: m[0].length, text: p.text, start: p.start, previewLength: p.length ?? m[0].length });
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
  handle('search:text', async (_event, options) => searchText(root(), {
    query: String(options.query || ''),
    caseSensitive: Boolean(options.caseSensitive),
    regex: Boolean(options.regex),
    wholeWord: Boolean(options.wholeWord),
  }));
}

module.exports = { register };
