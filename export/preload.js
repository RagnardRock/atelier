// Pont entre l'interface et le processus principal.
// Seules les fonctions listées ici existent côté interface, sous `window.brokk`.

const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('brokk', {
  platform: process.platform,
  // Projet (le dossier où les fichiers sont écrits)
  choisirProjet: () => ipcRenderer.invoke('projet:choisir'),
  ouvrirProjet: (dossier) => ipcRenderer.invoke('projet:ouvrir', dossier),
  projetsRecents: () => ipcRenderer.invoke('projet:recents'),
  ecrire: (projet, rel, bytes) => ipcRenderer.invoke('projet:ecrire', projet, rel, bytes),
  existe: (projet, rel) => ipcRenderer.invoke('projet:existe', projet, rel),
  baliserIndex: (projet, rel, balises) => ipcRenderer.invoke('projet:baliserIndex', projet, rel, balises),
  montrer: (projet, rel) => ipcRenderer.invoke('projet:montrer', projet, rel),
  onProjetExterne: (callback) => ipcRenderer.on('projet:externe', (_event, dossier) => callback(dossier)),
  // Sources (les images à exporter)
  choisirSources: (projet) => ipcRenderer.invoke('source:choisir', projet),
  lireSource: (file) => ipcRenderer.invoke('source:lire', file),
  surveiller: (fichiers) => ipcRenderer.invoke('source:surveiller', fichiers),
  onSourceModifiee: (callback) => ipcRenderer.on('source:modifiee', (_event, file) => callback(file)),
  onSourcesExternes: (callback) => ipcRenderer.on('source:externe', (_event, files) => callback(files)),
  // Chemin d'un fichier glissé depuis l'Explorateur Windows sur la fenêtre.
  pathOfDropped: (file) => webUtils.getPathForFile(file),
  demarrage: () => ipcRenderer.invoke('startup'),
  copierTexte: (text) => ipcRenderer.invoke('clipboard:writeText', text),
  onError: (callback) => ipcRenderer.on('app:error', (_event, message) => callback(message)),

  readConfig: () => ipcRenderer.invoke('config:read'),
  writeConfig: (changes) => ipcRenderer.invoke('config:write', changes),
  version: () => ipcRenderer.invoke('app:version'),
  setWindowTheme: (options) => ipcRenderer.invoke('window:theme', options),
  blurSupported: () => ipcRenderer.invoke('window:blurSupported'),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateProgress: (callback) => ipcRenderer.on('update:progress', (_event, percent) => callback(percent)),
});
