// Pont entre l'interface et le processus principal.
// Seules les fonctions listées ici existent côté interface, sous `window.tafl`.

const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('tafl', {
  platform: process.platform,
  openFile: (options) => ipcRenderer.invoke('file:open', options),
  openPath: (file) => ipcRenderer.invoke('file:openPath', file),
  recentFiles: () => ipcRenderer.invoke('file:recents'),
  saveDialog: (options) => ipcRenderer.invoke('file:saveDialog', options),
  pickFolder: (title) => ipcRenderer.invoke('folder:pick', title),
  writeFile: (file, bytes) => ipcRenderer.invoke('file:write', file, bytes),
  revealFile: (file) => ipcRenderer.invoke('file:reveal', file),
  // Lancer le jeu dans Saga (le moteur) ; depart = { carte, x, y, direction } pour « Jouer ici ».
  jouer: (dossier, depart) => ipcRenderer.invoke('jeu:jouer', dossier, depart),
  // Dossier de jeu (jeu.json, tuiles.tafl, cartes/*.json : voir FORMAT.md)
  pickGameFolder: () => ipcRenderer.invoke('game:pick'),
  openGame: (target) => ipcRenderer.invoke('game:open', target),
  findGame: (folder) => ipcRenderer.invoke('game:find', folder),
  registerGame: (file) => ipcRenderer.invoke('game:register', file),
  writeGame: (folder, files, remove) => ipcRenderer.invoke('game:write', folder, files, remove),
  // Données officielles Pokémon (Tafl 0.8, officiel.js)
  importerOfficiel: (options) => ipcRenderer.invoke('officiel:importer', options),
  onImportProgres: (callback) => ipcRenderer.on('officiel:progres', (_event, p) => callback(p)),
  // Chemin d'un fichier glissé depuis l'Explorateur Windows sur la fenêtre.
  pathOfDropped: (file) => webUtils.getPathForFile(file),
  startupFile: () => ipcRenderer.invoke('file:startup'),
  startupFolder: () => ipcRenderer.invoke('folder:startup'),
  onExternalFile: (callback) => ipcRenderer.on('file:external', (_event, file) => callback(file)),
  onExternalFolder: (callback) => ipcRenderer.on('folder:external', (_event, folder) => callback(folder)),
  onError: (callback) => ipcRenderer.on('app:error', (_event, message) => callback(message)),

  readConfig: () => ipcRenderer.invoke('config:read'),
  writeConfig: (changes) => ipcRenderer.invoke('config:write', changes),
  version: () => ipcRenderer.invoke('app:version'),
  setWindowTheme: (options) => ipcRenderer.invoke('window:theme', options),
  blurSupported: () => ipcRenderer.invoke('window:blurSupported'),
  relaunch: () => ipcRenderer.invoke('app:relaunch'),
  forceClose: () => ipcRenderer.invoke('window:forceClose'),
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
  onEvent: (callback) => ipcRenderer.on('claude:event', (_event, e) => callback(e)),
  // Actions de l'outil (renderer/claude-actions.js)
  declarerActions: (liste) => ipcRenderer.invoke('claude:actions', liste),
  onAction: (callback) => ipcRenderer.on('claude:action', (_event, a) => callback(a)),
  actionFaite: (id, resultat) => ipcRenderer.invoke('claude:actionFaite', id, resultat),
  ecrireFichier: (chemin, bytes) => ipcRenderer.invoke('claude:ecrireFichier', chemin, bytes),
  lireFichier: (chemin) => ipcRenderer.invoke('claude:lireFichier', chemin),
});
