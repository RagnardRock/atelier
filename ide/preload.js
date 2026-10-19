// Pont entre l'interface et le processus principal.
// Seules les fonctions listées ici existent côté interface, sous `window.atelier`.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('atelier', {
  openFolder: () => ipcRenderer.invoke('folder:open'),
  readFolder: (dir) => ipcRenderer.invoke('folder:read', dir),
  readFile: (file) => ipcRenderer.invoke('file:read', file),
  writeFile: (file, content) => ipcRenderer.invoke('file:write', file, content),
  getConfig: () => ipcRenderer.invoke('config:get'),
  getConfigPath: () => ipcRenderer.invoke('config:path'),
});
