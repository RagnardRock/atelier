// Pont entre l'interface et le processus principal.
// Seules les fonctions listées ici existent côté interface, sous `window.skald`.

const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('skald', {
  platform: process.platform,
  openFiles: (dossier) => ipcRenderer.invoke('file:open', dossier),
  openPath: (file) => ipcRenderer.invoke('file:openPath', file),
  recentFiles: () => ipcRenderer.invoke('file:recents'),
  saveDialog: (options) => ipcRenderer.invoke('file:saveDialog', options),
  pickFolder: (title) => ipcRenderer.invoke('folder:pick', title),
  writeFile: (file, bytes) => ipcRenderer.invoke('file:write', file, bytes),
  clipboardReadImage: () => ipcRenderer.invoke('clipboard:readImage'),
  clipboardWriteImage: (bytes) => ipcRenderer.invoke('clipboard:writeImage', bytes),
  revealFile: (file) => ipcRenderer.invoke('file:reveal', file),
  // Chemin d'un fichier glissé depuis l'Explorateur Windows sur la fenêtre.
  pathOfDropped: (file) => webUtils.getPathForFile(file),
  startupFiles: () => ipcRenderer.invoke('file:startup'),
  startupFolder: () => ipcRenderer.invoke('folder:startup'),
  onExternalFolder: (callback) => ipcRenderer.on('folder:external', (_event, folder) => callback(folder)),
  onExternalFile: (callback) => ipcRenderer.on('file:external', (_event, file) => callback(file)),
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
