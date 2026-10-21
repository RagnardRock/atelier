// Pont entre l'interface et le processus principal.
// Seules les fonctions listées ici existent côté interface, sous `window.saga`.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('saga', {
  platform: process.platform,
  // Le jeu (un dossier écrit par Tafl) : renvoie { dossier, jeu, tuiles, cartes, donnees } en textes.
  choisirJeu: () => ipcRenderer.invoke('jeu:choisir'),
  ouvrirJeu: (dossier) => ipcRenderer.invoke('jeu:ouvrir', dossier),
  jeuxRecents: () => ipcRenderer.invoke('jeu:recents'),
  montrerJeu: (dossier) => ipcRenderer.invoke('jeu:montrer', dossier),
  // Un jeu lancé par Tafl ou Atelier alors que Saga est déjà ouvert : { dossier, depart }.
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
