// Les actions de Claude dans Atelier : un tout petit serveur MCP.
//
// MCP (Model Context Protocol) est la façon standard de donner des outils à Claude Code : Claude Code
// lance ce script, lui demande la liste de ses outils (ajouter une note, un évènement…), puis
// l'appelle quand il veut en utiliser un. Les messages sont du JSON, un par ligne (JSON-RPC 2.0).
//
// Ce script ne fait rien lui-même : il transmet chaque action à Atelier par un canal local
// (un « named pipe » de Windows), avec un jeton secret pour que rien d'autre ne puisse s'en servir.
// C'est Atelier qui l'exécute dans ses widgets, pour qu'ils se mettent à jour sous tes yeux.
// Avant chaque action, Claude Code demande la permission à Atelier, qui te montre une carte
// Autoriser / Refuser dans le widget Claude (voir claude.js).
//
// Il est lancé par Electron en mode Node (ELECTRON_RUN_AS_NODE=1), donc sans rien installer de plus.

const net = require('node:net');

const CANAL = process.env.ATELIER_CANAL;
const JETON = process.env.ATELIER_JETON;

const date = { type: 'string', description: 'Date au format AAAA-MM-JJ' };
const heure = { type: 'string', description: 'Heure au format HH:MM (24 h), ou chaîne vide pour toute la journée' };
const OUTILS = [
  {
    name: 'ajouter_note',
    description: 'Ajoute une note dans le widget Notes. La première ligne du texte devient son titre.',
    inputSchema: { type: 'object', properties: { texte: { type: 'string' }, epinglee: { type: 'boolean', description: 'Garder la note en haut de la liste' } }, required: ['texte'] },
  },
  {
    name: 'modifier_note',
    description: 'Remplace le texte d\'une note existante (son id est dans notes.md), et/ou l\'épingle. Renvoie le texte complet, pas seulement l\'ajout.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, texte: { type: 'string' }, epinglee: { type: 'boolean' } }, required: ['id'] },
  },
  {
    name: 'supprimer_note',
    description: 'Supprime une note (son id est dans notes.md).',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'ajouter_evenement',
    description: 'Ajoute un évènement au calendrier d\'Atelier.',
    inputSchema: { type: 'object', properties: { titre: { type: 'string' }, date, heure, note: { type: 'string' } }, required: ['titre', 'date'] },
  },
  {
    name: 'modifier_evenement',
    description: 'Modifie un évènement du calendrier (son id est dans calendrier.md). Seuls les champs donnés changent.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, titre: { type: 'string' }, date, heure, note: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'supprimer_evenement',
    description: 'Supprime un évènement du calendrier (son id est dans calendrier.md).',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'lancer_minuteur',
    description: 'Lance un minuteur dans le widget Minuteurs.',
    inputSchema: { type: 'object', properties: { nom: { type: 'string' }, minutes: { type: 'number', description: 'Durée en minutes (peut avoir des décimales)' } }, required: ['minutes'] },
  },
  {
    name: 'ouvrir_projet',
    description: 'Ouvre un projet du dossier des projets (nom du dossier, voir projets.md) dans Rune, Skald ou l\'Explorateur. Sans outil : celui choisi pour ce projet.',
    inputSchema: { type: 'object', properties: { nom: { type: 'string' }, outil: { type: 'string', enum: ['rune', 'skald', 'explorateur'] } }, required: ['nom'] },
  },
  {
    name: 'lancer_outil',
    description: 'Lance un des outils de Ragna : rune (l\'IDE) ou skald (retouche d\'images).',
    inputSchema: { type: 'object', properties: { outil: { type: 'string', enum: ['rune', 'skald'] } }, required: ['outil'] },
  },
];

// Envoie une action à Atelier et attend sa réponse ({ ok, texte } ou { erreur }).
function demanderAtelier(outil, args) {
  return new Promise((resolve) => {
    const socket = net.connect(CANAL);
    let recu = '';
    socket.setEncoding('utf8');
    socket.on('connect', () => socket.write(`${JSON.stringify({ jeton: JETON, outil, args })}\n`));
    socket.on('data', (chunk) => {
      recu += chunk;
      const i = recu.indexOf('\n');
      if (i >= 0) {
        socket.end();
        try { resolve(JSON.parse(recu.slice(0, i))); } catch { resolve({ erreur: 'Réponse illisible d\'Atelier' }); }
      }
    });
    socket.on('error', (err) => resolve({ erreur: `Atelier ne répond pas (${err.code || err.message}). Est-il toujours ouvert ?` }));
  });
}

const envoyer = (message) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);

async function recevoir(m) {
  const { id, method, params = {} } = m;
  if (method === 'initialize') {
    return envoyer({ id, result: { protocolVersion: params.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'atelier', version: '1.0.0' } } });
  }
  if (id === undefined) return; // notification (notifications/initialized…) : rien à répondre
  if (method === 'ping') return envoyer({ id, result: {} });
  if (method === 'tools/list') return envoyer({ id, result: { tools: OUTILS } });
  if (method === 'tools/call') {
    if (!OUTILS.some((o) => o.name === params.name)) return envoyer({ id, result: { content: [{ type: 'text', text: `Outil inconnu : ${params.name}` }], isError: true } });
    const r = await demanderAtelier(params.name, params.arguments || {});
    return envoyer({ id, result: { content: [{ type: 'text', text: r.erreur || r.texte || 'Fait.' }], isError: Boolean(r.erreur) } });
  }
  envoyer({ id, error: { code: -32601, message: `Méthode inconnue : ${method}` } });
}

let tampon = '';
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
    recevoir(message).catch((err) => message.id !== undefined && envoyer({ id: message.id, error: { code: -32603, message: err.message } }));
  }
});
process.stdin.on('end', () => process.exit(0));
