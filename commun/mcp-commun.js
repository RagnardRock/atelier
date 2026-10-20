// Le dossier partagé de l'Atelier, pour le Claude de Skald, Tafl et Brokk : un tout petit serveur MCP.
//
// Atelier (le hub) tient à jour %APPDATA%\atelier-commun : la mémoire de chaque projet (ce que
// Claude retient : client, hébergement, décisions…), une copie des notes et le dernier projet
// ouvert. Ce script donne à Claude quatre outils pour s'en servir depuis l'outil :
// - lire_contexte : la mémoire du projet en cours et le dernier projet ouvert depuis Atelier ;
// - lire_notes : les notes du widget Notes d'Atelier ;
// - retenir_projet / oublier_projet : ajouter ou retirer une info de la mémoire du projet en cours.
//
// Il lit et écrit directement les fichiers du dossier : Atelier n'a pas besoin d'être ouvert,
// et il voit tout de suite ce que Claude a retenu (il surveille le dossier).
// Avant retenir/oublier, l'outil te montre la carte Autoriser / Refuser.
//
// (Rune a sa propre copie de ce fichier, ide/mcp-commun.js.)
//
// En plus, les actions propres à l'outil (voir l'image, redimensionner, poser des tuiles…) : leur
// liste est dans le fichier ATELIER_ACTIONS, et chaque appel est transmis à l'outil par le canal
// local ATELIER_CANAL (avec le jeton ATELIER_JETON). C'est l'outil qui les fait, dans sa fenêtre.
//
// MCP (Model Context Protocol) : Claude Code lance ce script, lui demande la liste de ses outils,
// puis l'appelle quand il veut en utiliser un. Du JSON, un message par ligne (JSON-RPC 2.0).
// Il est lancé par Electron en mode Node (ELECTRON_RUN_AS_NODE=1), donc sans rien installer de plus.

const crypto = require('node:crypto');
const fsSync = require('node:fs');
const net = require('node:net');
const fs = require('node:fs/promises');
const path = require('node:path');

const COMMUN = process.env.ATELIER_COMMUN;
const PROJET = process.env.ATELIER_PROJET || ''; // nom du dossier du projet, celui qu'utilise Atelier ; vide : aucun projet
const NOM = PROJET || 'en cours (aucun pour l\'instant)';
const memoirePath = () => path.join(COMMUN, 'memoire-projets.json');

const OUTILS = [
  {
    name: 'lire_contexte',
    description: `Relit la mémoire du projet ${NOM} (gardée par Atelier, partagée avec tous les outils) et le projet ouvert en dernier depuis Atelier.`,
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'lire_notes',
    description: 'Lit les notes de Ragna (widget Notes d\'Atelier), en Markdown.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'retenir_projet',
    description: `Retient une info sur le projet ${NOM}, gardée d'une conversation à l'autre et visible dans Atelier et les autres outils.`,
    inputSchema: { type: 'object', properties: { texte: { type: 'string', description: 'Une info courte' } }, required: ['texte'] },
  },
  {
    name: 'oublier_projet',
    description: `Oublie une info retenue sur le projet ${NOM} (son id est donné par lire_contexte).`,
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
];

// Les actions de l'outil : [{ name, description, inputSchema }].
let ACTIONS = [];
try { ACTIONS = process.env.ATELIER_ACTIONS ? JSON.parse(fsSync.readFileSync(process.env.ATELIER_ACTIONS, 'utf8')) : []; } catch { ACTIONS = []; }
const TOUS = [...OUTILS, ...ACTIONS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }))];

// Envoie une action à l'outil et attend sa réponse ({ texte, image } ou { erreur }).
function demanderOutil(outil, args) {
  return new Promise((resolve) => {
    const socket = net.connect(process.env.ATELIER_CANAL);
    let recu = '';
    socket.setEncoding('utf8');
    socket.on('connect', () => socket.write(`${JSON.stringify({ jeton: process.env.ATELIER_JETON, outil, args })}\n`));
    socket.on('data', (chunk) => {
      recu += chunk;
      const i = recu.indexOf('\n');
      if (i >= 0) {
        socket.end();
        try { resolve(JSON.parse(recu.slice(0, i))); } catch { resolve({ erreur: 'Réponse illisible de l\'outil' }); }
      }
    });
    socket.on('error', (err) => resolve({ erreur: `L'outil ne répond pas (${err.code || err.message}). Est-il toujours ouvert ?` }));
  });
}

async function lireJson(fichier, defaut) {
  try { return JSON.parse(await fs.readFile(fichier, 'utf8')); } catch { return defaut; }
}
// Fichier temporaire puis renommage : jamais à moitié écrit, même si Atelier le lit en même temps.
async function ecrireJson(fichier, data) {
  await fs.mkdir(path.dirname(fichier), { recursive: true });
  await fs.writeFile(`${fichier}.tmp`, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(`${fichier}.tmp`, fichier);
}

const date = (ms) => new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

async function contexte() {
  if (!PROJET) {
    const enCours = await lireJson(path.join(COMMUN, 'projet-en-cours.json'), null);
    return enCours?.nom ? `Aucun projet ouvert dans cet outil. Dernier projet ouvert depuis Atelier : ${enCours.nom}.` : 'Aucun projet ouvert dans cet outil, et aucun projet ouvert depuis Atelier.';
  }
  const memoire = await lireJson(memoirePath(), {});
  const infos = Array.isArray(memoire[PROJET]) ? memoire[PROJET] : [];
  const enCours = await lireJson(path.join(COMMUN, 'projet-en-cours.json'), null);
  const lignes = [`# Mémoire du projet ${PROJET}`, ''];
  if (infos.length) for (const m of infos) lignes.push(`- ${m.texte} (${date(m.quand)}, id : ${m.id})`);
  else lignes.push('(rien de retenu pour l\'instant)');
  if (enCours?.nom) lignes.push('', `Dernier projet ouvert depuis Atelier : ${enCours.nom}, dans ${enCours.outil}, le ${date(enCours.quand)}.`);
  const autres = Object.keys(memoire).filter((n) => n !== PROJET && memoire[n]?.length);
  if (autres.length) lignes.push('', `Autres projets avec une mémoire : ${autres.join(', ')}.`);
  return lignes.join('\n');
}

async function appeler(nom, args) {
  if (nom === 'lire_contexte') return contexte();
  if (nom === 'lire_notes') {
    try { return await fs.readFile(path.join(COMMUN, 'notes.md'), 'utf8'); } catch { return 'Aucune note partagée : Atelier 0.8 ou plus doit avoir été ouvert au moins une fois.'; }
  }
  if ((nom === 'retenir_projet' || nom === 'oublier_projet') && !PROJET) throw new Error('Aucun projet en cours : ouvre ce projet depuis Atelier pour que je puisse retenir des infos dessus.');
  if (nom === 'retenir_projet') {
    const texte = String(args.texte || '').trim();
    if (!texte) throw new Error('Rien à retenir');
    const memoire = await lireJson(memoirePath(), {}); // relu juste avant d'écrire
    const info = { id: crypto.randomUUID().slice(0, 8), texte, quand: Date.now() };
    memoire[PROJET] = [...(Array.isArray(memoire[PROJET]) ? memoire[PROJET] : []), info];
    await ecrireJson(memoirePath(), memoire);
    return `Retenu sur ${PROJET} (id : ${info.id}).`;
  }
  if (nom === 'oublier_projet') {
    const memoire = await lireJson(memoirePath(), {});
    const info = (memoire[PROJET] || []).find((m) => m.id === args.id);
    if (!info) throw new Error(`Aucune info ${args.id} retenue sur ${PROJET}`);
    memoire[PROJET] = memoire[PROJET].filter((m) => m !== info);
    if (!memoire[PROJET].length) delete memoire[PROJET];
    await ecrireJson(memoirePath(), memoire);
    return `Oublié sur ${PROJET} : ${info.texte}`;
  }
  throw new Error(`Outil inconnu : ${nom}`);
}

const envoyer = (message) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);

async function recevoir(m) {
  const { id, method, params = {} } = m;
  if (method === 'initialize') {
    return envoyer({ id, result: { protocolVersion: params.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'atelier', version: '1.0.0' } } });
  }
  if (id === undefined) return; // notification (notifications/initialized…) : rien à répondre
  if (method === 'ping') return envoyer({ id, result: {} });
  if (method === 'tools/list') return envoyer({ id, result: { tools: TOUS } });
  if (method === 'tools/call' && ACTIONS.some((a) => a.name === params.name)) {
    const r = await demanderOutil(params.name, params.arguments || {});
    const content = [{ type: 'text', text: r.erreur || r.texte || 'Fait.' }];
    // Une capture (l'image, la carte…) : Claude la voit comme une image.
    if (!r.erreur && r.image?.data) content.push({ type: 'image', data: r.image.data, mimeType: r.image.mimeType || 'image/png' });
    return envoyer({ id, result: { content, isError: Boolean(r.erreur) } });
  }
  if (method === 'tools/call') {
    try {
      const texte = await appeler(params.name, params.arguments || {});
      return envoyer({ id, result: { content: [{ type: 'text', text: texte }] } });
    } catch (err) {
      return envoyer({ id, result: { content: [{ type: 'text', text: err.message }], isError: true } });
    }
  }
  envoyer({ id, error: { code: -32601, message: `Méthode inconnue : ${method}` } });
}

let tampon = '';
const enCours = new Set(); // appels pas encore terminés : on les laisse finir avant de quitter
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  tampon += chunk;
  let i;
  while ((i = tampon.indexOf('\n')) >= 0) {
    const ligne = tampon.slice(0, i).trim();
    tampon = tampon.slice(i + 1);
    if (!ligne) continue;
    let message;
    try { message = JSON.parse(ligne); } catch { continue; }
    const appel = recevoir(message).catch((err) => message.id !== undefined && envoyer({ id: message.id, error: { code: -32603, message: err.message } }));
    enCours.add(appel);
    appel.finally(() => enCours.delete(appel));
  }
});
process.stdin.on('end', () => Promise.allSettled([...enCours]).then(() => process.exit(0)));
