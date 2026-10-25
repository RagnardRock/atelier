// Recopie les fichiers communs (le panneau Claude, son serveur MCP, la lecture des Releases GitHub)
// dans un outil de l'Atelier.
//
// Skald, Tafl et Brokk sont fabriqués chacun depuis leur dossier (retouche/, tuiles/, export/) :
// l'installeur ne peut emporter que ce qui s'y trouve. Ce script est lancé tout seul après chaque
// `npm install` ou `npm ci` de l'outil (« postinstall » dans son package.json) et copie le dossier
// commun/ dans <outil>/commun/ (ignoré par git : la seule vraie version est celle de commun/).

const fs = require('node:fs');
const path = require('node:path');

// On peut ne demander que certains fichiers : « node ../commun/copier.js github.js » (Atelier, qui a
// son propre Claude, ne prend que github.js).
// bac-a-sable.js : le bac à sable des scripts JS des jeux (Tafl et Saga, Tafl 0.31).
const TOUS = ['claude.js', 'mcp-commun.js', 'claude-panneau.js', 'claude-panneau.css', 'github.js', 'bac-a-sable.js'];
const FICHIERS = process.argv.length > 2 ? process.argv.slice(2).filter((f) => TOUS.includes(f)) : TOUS;
const cible = path.join(process.cwd(), 'commun');
fs.mkdirSync(cible, { recursive: true });
for (const f of FICHIERS) fs.copyFileSync(path.join(__dirname, f), path.join(cible, f));
console.log(`Fichiers communs copiés dans ${cible}`);
