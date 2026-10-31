// Pont entre l'interface et le processus principal.
// Seules les fonctions listées ici existent côté interface, sous `window.reikna`.

const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('reikna', {
  platform: process.platform,
  // Fichiers (classeurs)
  choisirFichier: (dossier) => ipcRenderer.invoke('fichier:choisir', dossier),
  lireFichier: (chemin) => ipcRenderer.invoke('fichier:lire', chemin),
  enregistrerSous: (nom, extension) => ipcRenderer.invoke('fichier:enregistrerSous', nom, extension),
  ecrireFichier: (chemin, bytes) => ipcRenderer.invoke('fichier:ecrire', chemin, bytes),
  fichiersRecents: () => ipcRenderer.invoke('fichier:recents'),
  oublierRecent: (chemin) => ipcRenderer.invoke('fichier:oublier', chemin),
  montrer: (chemin) => ipcRenderer.invoke('fichier:montrer', chemin),
  classeursDuDossier: (dossier) => ipcRenderer.invoke('dossier:classeurs', dossier),
  // Chemin d'un fichier glissé depuis l'Explorateur Windows sur la fenêtre.
  pathOfDropped: (file) => webUtils.getPathForFile(file),
  demarrage: () => ipcRenderer.invoke('startup'),
  onExterne: (callback) => ipcRenderer.on('externe', (_event, quoi) => callback(quoi)),
  ecrirePressePapiers: (contenu) => ipcRenderer.invoke('clipboard:write', contenu),
  lirePressePapiers: () => ipcRenderer.invoke('clipboard:read'),
  onError: (callback) => ipcRenderer.on('app:error', (_event, message) => callback(message)),
  // Fenêtre
  titre: (texte) => ipcRenderer.invoke('window:titre', texte),
  nonEnregistre: (valeur) => ipcRenderer.invoke('fenetre:nonEnregistre', valeur),
  fermer: () => ipcRenderer.invoke('fenetre:fermer'),
  onDemandeFermeture: (callback) => ipcRenderer.on('fenetre:fermer?', () => callback()),

  readConfig: () => ipcRenderer.invoke('config:read'),
  writeConfig: (changes) => ipcRenderer.invoke('config:write', changes),
  version: () => ipcRenderer.invoke('app:version'),
  setWindowTheme: (options) => ipcRenderer.invoke('window:theme', options),
  blurSupported: () => ipcRenderer.invoke('window:blurSupported'),
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
