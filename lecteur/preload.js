// Pont entre l'interface et le processus principal.
// Seules les fonctions listées ici existent côté interface, sous `window.mimir`.

const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('mimir', {
  platform: process.platform,
  // Documents
  choisir: () => ipcRenderer.invoke('doc:choisir'),
  lire: (chemin) => ipcRenderer.invoke('doc:lire', chemin),
  recents: () => ipcRenderer.invoke('doc:recents'),
  oublier: (chemin) => ipcRenderer.invoke('doc:oublier', chemin),
  enregistrer: (chemin, bytes) => ipcRenderer.invoke('doc:enregistrer', chemin, bytes),
  enregistrerSous: (chemin, bytes, options) => ipcRenderer.invoke('doc:enregistrerSous', chemin, bytes, options),
  montrer: (chemin) => ipcRenderer.invoke('doc:montrer', chemin),
  ouvrirAilleurs: (chemin) => ipcRenderer.invoke('doc:ouvrirAilleurs', chemin),
  pagesRar: (chemin) => ipcRenderer.invoke('bd:rar', chemin),
  onDocumentsExternes: (callback) => ipcRenderer.on('doc:externe', (_event, files) => callback(files)),
  // Chemin d'un fichier glissé depuis l'Explorateur Windows sur la fenêtre.
  pathOfDropped: (file) => webUtils.getPathForFile(file),
  demarrage: () => ipcRenderer.invoke('startup'),
  copierTexte: (text) => ipcRenderer.invoke('clipboard:writeText', text),
  onError: (callback) => ipcRenderer.on('app:error', (_event, message) => callback(message)),
  // Fermeture avec des modifications pas encore enregistrées
  nonEnregistres: (n) => ipcRenderer.invoke('app:nonEnregistres', n),
  fermer: () => ipcRenderer.invoke('app:fermer'),
  onFermerDemande: (callback) => ipcRenderer.on('app:fermer-demande', () => callback()),

  readConfig: () => ipcRenderer.invoke('config:read'),
  writeConfig: (changes) => ipcRenderer.invoke('config:write', changes),
  position: (chemin, position) => ipcRenderer.invoke('config:position', chemin, position),
  version: () => ipcRenderer.invoke('app:version'),
  setWindowTheme: (options) => ipcRenderer.invoke('window:theme', options),
  blurSupported: () => ipcRenderer.invoke('window:blurSupported'),
  pleinEcran: (oui) => ipcRenderer.invoke('window:pleinEcran', oui),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateProgress: (callback) => ipcRenderer.on('update:progress', (_event, percent) => callback(percent)),
});

// Panneau Claude (../commun/claude-panneau.js), sous `window.claude`.
contextBridge.exposeInMainWorld('claude', {
  send: (text) => ipcRenderer.invoke('claude:send', text),
  permission: (answer) => ipcRenderer.invoke('claude:permission', answer),
  interrupt: () => ipcRenderer.invoke('claude:interrupt'),
  reset: () => ipcRenderer.invoke('claude:reset'),
  resume: (sessionId) => ipcRenderer.invoke('claude:resume', sessionId),
  projet: () => ipcRenderer.invoke('claude:projet'),
  history: () => ipcRenderer.invoke('claude:history'),
  historyGet: (id) => ipcRenderer.invoke('claude:history:get', id),
  historySave: (conversation) => ipcRenderer.invoke('claude:history:save', conversation),
  historyDelete: (id) => ipcRenderer.invoke('claude:history:delete', id),
  // Ce que Claude peut faire sans demander (bouclier du panneau, réglages)
  autorisations: () => ipcRenderer.invoke('claude:autorisations'),
  retirerAutorisation: (quoi) => ipcRenderer.invoke('claude:autorisations:retirer', quoi),
  moteur: (choix) => ipcRenderer.invoke('claude:moteur', choix), // Claude, local (Ollama) ou auto
  onEvent: (callback) => ipcRenderer.on('claude:event', (_event, e) => callback(e)),
  // Actions de l'outil (renderer/claude-actions.js)
  declarerActions: (liste) => ipcRenderer.invoke('claude:actions', liste),
  onAction: (callback) => ipcRenderer.on('claude:action', (_event, a) => callback(a)),
  actionFaite: (id, resultat) => ipcRenderer.invoke('claude:actionFaite', id, resultat),
  ecrireFichier: (chemin, bytes) => ipcRenderer.invoke('claude:ecrireFichier', chemin, bytes),
  lireFichier: (chemin) => ipcRenderer.invoke('claude:lireFichier', chemin),
});
