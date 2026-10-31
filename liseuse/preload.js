// Pont entre l'interface et le processus principal.
// Seules les fonctions listées ici existent côté interface, sous `window.kenning`.

const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('kenning', {
  platform: process.platform,
  // Bibliothèque
  biblio: () => ipcRenderer.invoke('biblio:lire'),
  majLivres: (changements) => ipcRenderer.invoke('biblio:livres', changements),
  majCollections: (collections) => ipcRenderer.invoke('biblio:collections', collections),
  ecrireCouverture: (id, bytes) => ipcRenderer.invoke('biblio:couverture', id, bytes),
  // Livres et dossiers
  choisirLivres: () => ipcRenderer.invoke('livres:choisir'),
  choisirDossier: () => ipcRenderer.invoke('dossier:choisir'),
  scanner: (dossiers) => ipcRenderer.invoke('dossiers:scanner', dossiers),
  surveiller: (dossiers) => ipcRenderer.invoke('dossiers:surveiller', dossiers),
  dossierExiste: (dossier) => ipcRenderer.invoke('dossier:existe', dossier),
  existent: (chemins) => ipcRenderer.invoke('fichiers:existent', chemins),
  infosFichier: (chemin) => ipcRenderer.invoke('fichier:infos', chemin),
  lireLivre: (chemin) => ipcRenderer.invoke('livre:lire', chemin),
  montrer: (chemin) => ipcRenderer.invoke('livre:montrer', chemin),
  enregistrerTexte: (nom, texte) => ipcRenderer.invoke('texte:enregistrerSous', nom, texte),
  onDossiersChanges: (callback) => ipcRenderer.on('biblio:dossiers-changes', () => callback()),
  onLivresExternes: (callback) => ipcRenderer.on('livres:externes', (_event, files) => callback(files)),
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
  pleinEcran: (oui) => ipcRenderer.invoke('window:pleinEcran', oui),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateProgress: (callback) => ipcRenderer.on('update:progress', (_event, percent) => callback(percent)),
});

// Panneau Loki (../commun/claude-panneau.js), sous `window.claude`.
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
  // Ce que Loki peut faire sans demander (bouclier du panneau, réglages)
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
