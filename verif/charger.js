// Charge des fichiers de l'interface d'un outil (des scripts classiques, sans fenêtre) dans un bac à
// sable Node, comme le ferait la page : ils se partagent leurs objets (Formules, JdrDes…).
// charger('tableur/renderer', ['fonctions.js', 'formules.js']) → { Formules, Fonctions, … }
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RACINE = path.join(__dirname, '..');

function charger(dossier, fichiers, globals = {}) {
  const ctx = vm.createContext({ console, structuredClone, setTimeout, clearTimeout, URL, TextEncoder, TextDecoder, ...globals });
  ctx.window = ctx; ctx.globalThis = ctx;
  for (const f of fichiers) {
    const fichier = path.join(RACINE, dossier, f);
    vm.runInContext(fs.readFileSync(fichier, 'utf8'), ctx, { filename: fichier });
  }
  // Les « const » tout en haut d'un script ne deviennent pas des propriétés de l'objet global :
  // on les demande par leur nom.
  return new Proxy({}, { get: (_, nom) => vm.runInContext(`typeof ${String(nom)} === 'undefined' ? undefined : ${String(nom)}`, ctx) });
}

module.exports = { charger, RACINE };
