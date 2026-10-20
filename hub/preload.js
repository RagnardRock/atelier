// Pont entre l'interface et le processus principal.
// Seules les fonctions listées ici existent côté interface, sous `window.atelier`.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('atelier', {
  platform: process.platform,
  onError: (callback) => ipcRenderer.on('app:error', (_event, message) => callback(message)),

  // Outils (Rune, Skald…)
  etatOutils: (options) => ipcRenderer.invoke('outils:etat', options),
  lancer: (id) => ipcRenderer.invoke('outils:lancer', id),
  installer: (id) => ipcRenderer.invoke('outils:installer', id),
  estOuvert: (id) => ipcRenderer.invoke('outils:ouvert', id),
  ouvrirDossier: (id) => ipcRenderer.invoke('outils:ouvrirDossier', id),
  onProgression: (callback) => ipcRenderer.on('outils:progression', (_event, data) => callback(data)),

  // Notes
  lireNotes: () => ipcRenderer.invoke('notes:read'),
  ecrireNotes: (notes) => ipcRenderer.invoke('notes:write', notes),
  montrerNotes: () => ipcRenderer.invoke('notes:reveal'),

  // Réglages, fenêtre, mise à jour d'Atelier
  readConfig: () => ipcRenderer.invoke('config:read'),
  writeConfig: (changes) => ipcRenderer.invoke('config:write', changes),
  version: () => ipcRenderer.invoke('app:version'),
  setWindowTheme: (options) => ipcRenderer.invoke('window:theme', options),
  blurSupported: () => ipcRenderer.invoke('window:blurSupported'),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateProgress: (callback) => ipcRenderer.on('update:progress', (_event, percent) => callback(percent)),
});
