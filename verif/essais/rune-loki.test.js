// Rune : ce que Loki sait de Rune et ses actions (loki-rune.js, renderer/loki-actions.js), et leur
// passage par le serveur MCP commun (commun/mcp-commun.js) jusqu'à la fenêtre.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { charger, RACINE } = require('../charger');

const lokiRune = require(path.join(RACINE, 'ide', 'loki-rune.js'));

test('Rune : chaque action est décrite, nommée une fois et expliquée dans les consignes', () => {
  const noms = lokiRune.ACTIONS.map((a) => a.name);
  assert.equal(new Set(noms).size, noms.length);
  for (const a of lokiRune.ACTIONS) {
    assert.match(a.name, /^[a-z_]+$/);
    assert.ok(a.description.length > 20, a.name);
    assert.equal(a.inputSchema.type, 'object', a.name);
    assert.ok(lokiRune.CONSIGNES.includes(a.name), `${a.name} absent des consignes`);
    assert.ok(lokiRune.CONSIGNES_COURTES.includes(a.name), `${a.name} absent des consignes courtes`);
  }
  // Seul le rapatriement change des fichiers : il passe par la carte (famille bifrost).
  assert.deepEqual(lokiRune.ACTIONS.filter((a) => !a.lecture).map((a) => a.name), ['rapatrier_client']);
  assert.equal(lokiRune.ACTIONS.find((a) => a.name === 'rapatrier_client').famille, 'bifrost');
});

test('Rune : les consignes parlent des nouveautés (Bifrost, mode visuel, Go Live, TOML)', () => {
  for (const mot of ['data-bf', 'data-bf-liste', 'Mode visuel', 'Go Live', '5500', 'TOML', 'Insérer un bloc', 'bf-theme.css', '.bifrost.json', 'Rapatrier']) {
    assert.ok(lokiRune.CONSIGNES.includes(mot), mot);
  }
});

test('Rune : le prénom remplace « Ragna »', () => {
  assert.equal(lokiRune.personnaliser('Seul Ragna le fait. Ragna valide.', 'Alex'), 'Seul Alex le fait. Alex valide.');
  assert.equal(lokiRune.personnaliser('Ragna valide. Pour Ragna.', ''), 'L\'utilisateur valide. Pour l\'utilisateur.');
  assert.ok(!lokiRune.pourMcp('Alex').some((a) => a.description.includes('Ragna')));
});

test('Rune : le panneau sait afficher chaque action, et la fenêtre sait la faire', () => {
  const atelier = { onClaudeAction() {}, claudeActionReponse() {}, bifrost() {} };
  const { lokiActions } = charger('ide/renderer', ['loki-actions.js'], { atelier });
  for (const a of lokiRune.ACTIONS) {
    assert.ok(Array.isArray(lokiActions.decrire(a.name, {})), a.name);
    assert.equal(typeof lokiActions.ACTIONS[a.name], 'function', a.name);
  }
  assert.equal(lokiActions.decrire('inconnue', {}), null);
});

test('Rune : une action passe par mcp-commun.js et le canal jusqu\'à Rune', async () => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'rune-loki-'));
  const actions = path.join(dossier, 'actions.json');
  fs.writeFileSync(actions, JSON.stringify(lokiRune.pourMcp('Alex')));
  const canal = process.platform === 'win32' ? `\\\\.\\pipe\\rune-loki-essai-${process.pid}` : path.join(dossier, 'canal.sock');
  const recues = [];
  const serveur = net.createServer((s) => {
    s.setEncoding('utf8');
    let r = '';
    s.on('data', (c) => {
      r += c;
      if (!r.includes('\n')) return;
      const d = JSON.parse(r);
      recues.push(d);
      s.end(`${JSON.stringify(d.jeton === 'secret' ? { texte: `fait : ${d.outil}` } : { erreur: 'Jeton refusé' })}\n`);
    });
  });
  await new Promise((ok) => serveur.listen(canal, ok));
  const mcp = spawn(process.execPath, [path.join(RACINE, 'commun', 'mcp-commun.js')], {
    env: { ...process.env, ATELIER_COMMUN: dossier, ATELIER_PROJET: 'site', ATELIER_ACTIONS: actions, ATELIER_CANAL: canal, ATELIER_JETON: 'secret' },
  });
  const reponses = new Map();
  let tampon = '';
  mcp.stdout.setEncoding('utf8');
  mcp.stdout.on('data', (c) => {
    tampon += c;
    let i;
    while ((i = tampon.indexOf('\n')) >= 0) { const m = JSON.parse(tampon.slice(0, i)); tampon = tampon.slice(i + 1); reponses.get(m.id)?.(m); }
  });
  const demander = (id, method, params) => new Promise((ok) => { reponses.set(id, ok); mcp.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`); });
  try {
    const liste = await demander(1, 'tools/list', {});
    const noms = liste.result.tools.map((t) => t.name);
    for (const a of lokiRune.ACTIONS) assert.ok(noms.includes(a.name), a.name);
    assert.ok(noms.includes('lire_contexte'));
    const r = await demander(2, 'tools/call', { name: 'verifier_flags', arguments: { page: 'index.html' } });
    assert.equal(r.result.content[0].text, 'fait : verifier_flags');
    assert.deepEqual(recues[0].args, { page: 'index.html' });
  } finally {
    mcp.stdin.end();
    serveur.close();
    fs.rmSync(dossier, { recursive: true, force: true });
  }
});
