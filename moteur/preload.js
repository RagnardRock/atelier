// Pont entre l'interface et le processus principal.
// Seules les fonctions listées ici existent côté interface, sous `window.saga`.

const { contextBridge, ipcRenderer } = require('electron');

// Le mode joueur (un jeu exporté en .exe) : main.js le passe en argument à la fenêtre.
const joueur = (() => {
  const a = process.argv.find((x) => x.startsWith('--saga-joueur='));
  try { return a ? JSON.parse(decodeURIComponent(a.slice('--saga-joueur='.length))) : null; } catch { return null; }
})();

contextBridge.exposeInMainWorld('saga', {
  platform: process.platform,
  joueur,
  // Le jeu (un dossier écrit par Tafl) : renvoie { dossier, jeu, tuiles, cartes, donnees } en textes.
  choisirJeu: () => ipcRenderer.invoke('jeu:choisir'),
  ouvrirJeu: (dossier) => ipcRenderer.invoke('jeu:ouvrir', dossier),
  jeuxRecents: () => ipcRenderer.invoke('jeu:recents'),
  montrerJeu: (dossier) => ipcRenderer.invoke('jeu:montrer', dossier),
  // La sauvegarde de la partie d'un jeu (dans %APPDATA%\atelier-moteur\sauvegardes, jamais dans le jeu).
  lireSauvegarde: (dossier) => ipcRenderer.invoke('sauvegarde:lire', dossier),
  ecrireSauvegarde: (dossier, donnees) => ipcRenderer.invoke('sauvegarde:ecrire', dossier, donnees),
  // Un jeu lancé par Tafl ou Atelier alors que Saga est déjà ouvert : { dossier, depart }.
  // Exporter le jeu en version web et/ou Windows (Saga 0.9) : formats = ['web', 'exe'].
  exporter: (dossier, formats) => ipcRenderer.invoke('jeu:exporter', dossier, formats),
  onExportProgres: (callback) => ipcRenderer.on('export:progres', (_event, texte) => callback(texte)),
  montrerExport: (chemin) => ipcRenderer.invoke('export:montrer', chemin),
  onJeuExterne: (callback) => ipcRenderer.on('jeu:externe', (_event, l) => callback(l)),
  demarrage: () => ipcRenderer.invoke('startup'),
  pleinEcran: (oui) => ipcRenderer.invoke('window:pleinEcran', oui),
  onPleinEcran: (callback) => ipcRenderer.on('window:pleinEcran', (_event, oui) => callback(oui)),
  onError: (callback) => ipcRenderer.on('app:error', (_event, message) => callback(message)),

  readConfig: () => ipcRenderer.invoke('config:read'),
  writeConfig: (changes) => ipcRenderer.invoke('config:write', changes),
  version: () => ipcRenderer.invoke('app:version'),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateProgress: (callback) => ipcRenderer.on('update:progress', (_event, percent) => callback(percent)),
});
