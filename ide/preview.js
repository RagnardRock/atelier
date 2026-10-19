// Aperçu navigateur, côté Node : un petit serveur web local qui sert le dossier ouvert
// (http://127.0.0.1:<port>/), comme le ferait l'extension Live Server de VS Code.
//
// Rechargement automatique : le serveur surveille le dossier. Dès qu'un fichier change
// (enregistré dans l'IDE, modifié par Claude ou par un autre programme), il prévient les pages
// ouvertes par un canal "EventSource" (/__atelier/events). Un petit script, ajouté à la volée dans
// chaque page HTML servie, recharge alors la page ; si seul du CSS a changé, il recharge juste les
// feuilles de style, sans perdre la position dans la page. Tes fichiers ne sont jamais modifiés :
// le script n'existe que dans la réponse du serveur.
//
// Le serveur n'écoute que sur 127.0.0.1 : il n'est pas visible depuis les autres ordinateurs.

const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.map': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.mp4': 'video/mp4',
  '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.pdf': 'application/pdf', '.wasm': 'application/wasm',
};
const IGNORED = /(^|[\\/])(\.git|node_modules)([\\/]|$)/;

const RELOAD_SCRIPT = `<script>/* Atelier : rechargement automatique (ajouté par l'aperçu, absent de ton fichier) */
(() => {
  // L'IDE affiche l'adresse de la page, et son bouton Précédent passe par ici.
  const tell = () => parent !== window && parent.postMessage({ atelierPreview: location.pathname + location.search + location.hash }, '*');
  tell();
  addEventListener('hashchange', tell);
  addEventListener('message', (e) => { if (e.source === parent && e.data === 'atelier:back') history.back(); });
  const events = new EventSource('/__atelier/events');
  events.onmessage = (e) => {
    const change = JSON.parse(e.data);
    if (change.cssOnly) {
      for (const link of document.querySelectorAll('link[rel="stylesheet"]')) {
        const url = new URL(link.href);
        url.searchParams.set('atelier', Date.now());
        link.href = url.href;
      }
    } else {
      location.reload();
    }
  };
})();
</script>`;

let server = null;
let port = null;
let getRoot = () => null;
const clients = new Set();   // pages ouvertes, à prévenir quand un fichier change
let watcher = null;
let watchedRoot = null;
let pending = new Set();     // fichiers changés depuis le dernier signal
let timer = null;

function notifyChange(file) {
  pending.add(file);
  clearTimeout(timer);
  // On attend un court instant : un enregistrement déclenche souvent plusieurs événements.
  timer = setTimeout(() => {
    const files = [...pending];
    pending = new Set();
    const cssOnly = files.every((f) => f.toLowerCase().endsWith('.css'));
    const data = `data: ${JSON.stringify({ cssOnly, files })}\n\n`;
    for (const res of clients) res.write(data);
  }, 120);
}

function watch(root) {
  if (watchedRoot === root) return;
  watcher?.close();
  watcher = null;
  watchedRoot = root;
  if (!root) return;
  try {
    watcher = fs.watch(root, { recursive: true }, (_type, file) => {
      if (file && !IGNORED.test(file)) notifyChange(file);
    });
    watcher.on('error', () => {}); // dossier supprimé ou inaccessible : l'aperçu ne recharge plus, sans planter
  } catch {
    watcher = null;
  }
}

// Petite page d'erreur ou de liste, aux couleurs de l'IDE.
const page = (title, body) => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font:15px system-ui,sans-serif;background:#16161b;color:#ddd;padding:32px 40px}a{color:#e0a526;text-decoration:none}a:hover{text-decoration:underline}
li{margin:4px 0;list-style:none}h1{font-size:20px;font-weight:600;color:#fff}p{color:#999}</style></head><body>${body}${RELOAD_SCRIPT}</body></html>`;
const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function serve(req, res) {
  const root = getRoot();
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/__atelier/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write('retry: 1000\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  if (!root) {
    res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(page('Aperçu', '<h1>Aucun dossier ouvert</h1>'));
  }
  watch(root);
  let rel;
  try {
    rel = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400);
    return res.end();
  }
  // On reste dans le dossier ouvert, quoi que contienne l'adresse (../ etc.).
  const file = path.join(root, path.normalize(rel).replace(/^([\\/]*\.\.[\\/]*)+/, ''));
  if (file !== root && !file.startsWith(root + path.sep)) {
    res.writeHead(403);
    return res.end();
  }
  let stat = await fsp.stat(file).catch(() => null);
  let target = file;
  if (stat?.isDirectory()) {
    if (!url.pathname.endsWith('/')) {
      res.writeHead(301, { Location: `${url.pathname}/${url.search}` });
      return res.end();
    }
    const index = path.join(file, 'index.html');
    const indexStat = await fsp.stat(index).catch(() => null);
    if (indexStat?.isFile()) {
      target = index;
      stat = indexStat;
    } else {
      const entries = (await fsp.readdir(file, { withFileTypes: true }))
        .filter((e) => !e.name.startsWith('.') && e.name !== 'node_modules')
        .sort((a, b) => (b.isDirectory() - a.isDirectory()) || a.name.localeCompare(b.name));
      const items = entries.map((e) => `<li><a href="${encodeURIComponent(e.name)}${e.isDirectory() ? '/' : ''}">${e.isDirectory() ? '📁' : '📄'} ${escape(e.name)}</a></li>`).join('');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(page(rel, `<h1>${escape(rel)}</h1><p>Pas de index.html dans ce dossier.</p><ul>${url.pathname !== '/' ? '<li><a href="../">⬆ ..</a></li>' : ''}${items}</ul>`));
    }
  }
  if (!stat?.isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(page('Introuvable', `<h1>Fichier introuvable</h1><p>${escape(rel)} n'existe pas dans le dossier ouvert.</p><p><a href="/">Retour à l'accueil du site</a></p>`));
  }
  const type = TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream';
  const headers = { 'Content-Type': type, 'Cache-Control': 'no-store' }; // toujours la dernière version
  if (type.startsWith('text/html')) {
    let html = await fsp.readFile(target, 'utf8');
    html = /<\/body>/i.test(html) ? html.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${RELOAD_SCRIPT}</body>`) : html + RELOAD_SCRIPT;
    res.writeHead(200, headers);
    return res.end(html);
  }
  res.writeHead(200, { ...headers, 'Content-Length': stat.size });
  fs.createReadStream(target).pipe(res);
}

function start() {
  if (server) return Promise.resolve(port);
  return new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      serve(req, res).catch((err) => {
        if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`Erreur de l'aperçu : ${err.message}`);
      });
    });
    server.on('error', (err) => { server = null; reject(err); });
    server.listen(0, '127.0.0.1', () => { // port 0 = un port libre choisi par le système
      port = server.address().port;
      resolve(port);
    });
  });
}

function stop() {
  for (const res of clients) res.end();
  clients.clear();
  watcher?.close();
  watcher = null;
  watchedRoot = null;
  server?.close();
  server = null;
}

function register({ handle, getRoot: rootGetter, openExternal }) {
  getRoot = rootGetter;
  // Adresse de l'aperçu pour un fichier du projet (ou la racine du site).
  handle('preview:url', async (_event, file) => {
    const root = getRoot();
    if (!root) throw new Error("Ouvre d'abord un dossier.");
    const p = await start();
    watch(root);
    let rel = '';
    if (file) {
      const r = path.relative(root, file);
      if (!r.startsWith('..') && !path.isAbsolute(r)) rel = r.split(path.sep).map(encodeURIComponent).join('/');
    }
    return `http://127.0.0.1:${p}/${rel}`;
  });
  // Ouvrir la page dans ton navigateur habituel (Chrome, Firefox…). Seule l'adresse de l'aperçu est acceptée.
  handle('preview:external', async (_event, url) => {
    if (!port || !String(url).startsWith(`http://127.0.0.1:${port}/`)) throw new Error('Adresse refusée');
    await openExternal(url);
  });
}

module.exports = { register, stop };
