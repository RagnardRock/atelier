// Pont entre l'interface et le processus principal.
// Seules les fonctions listées ici existent côté interface, sous `window.atelier`.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('atelier', {
  openFolder: () => ipcRenderer.invoke('folder:open'),
  recentFolders: () => ipcRenderer.invoke('folder:recents'),
  openRecentFolder: (folder) => ipcRenderer.invoke('folder:openRecent', folder),
  setWindowTheme: (options) => ipcRenderer.invoke('window:theme', options),
  blurSupported: () => ipcRenderer.invoke('window:blurSupported'),
  relaunch: () => ipcRenderer.invoke('app:relaunch'),

  // Chat avec Claude
  claudeSend: (text) => ipcRenderer.invoke('claude:send', text),
  claudePermission: (answer) => ipcRenderer.invoke('claude:permission', answer),
  claudeInterrupt: () => ipcRenderer.invoke('claude:interrupt'),
  claudeReset: () => ipcRenderer.invoke('claude:reset'),
  onClaudeEvent: (callback) => ipcRenderer.on('claude:event', (_event, e) => callback(e)),
  platform: process.platform,
  readFolder: (dir) => ipcRenderer.invoke('folder:read', dir),
  readFile: (file) => ipcRenderer.invoke('file:read', file),
  writeFile: (file, content) => ipcRenderer.invoke('file:write', file, content),
  createFile: (file) => ipcRenderer.invoke('file:create', file),
  createFolder: (dir) => ipcRenderer.invoke('folder:create', dir),
  listFiles: () => ipcRenderer.invoke('files:list'),
  searchText: (options) => ipcRenderer.invoke('search:text', options),
  joinPath: (...parts) => ipcRenderer.invoke('path:join', ...parts),
  getConfig: () => ipcRenderer.invoke('config:get'),
  getConfigPath: () => ipcRenderer.invoke('config:path'),
  saveConfig: (changes) => ipcRenderer.invoke('config:save', changes),
  pauseShortcuts: (paused) => ipcRenderer.invoke('shortcuts:pause', paused),

  // Erreurs et raccourcis
  getLogPath: () => ipcRenderer.invoke('log:path'),
  log: (level, message) => ipcRenderer.send('log:write', level, message),
  onAppError: (callback) => ipcRenderer.on('app:error', (_event, message) => callback(message)),
  onShortcut: (callback) => ipcRenderer.on('shortcut', (_event, action) => callback(action)),

  // Mise à jour
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),

  // Terminaux
  createTerminal: (profileName, cols, rows, cwd) => ipcRenderer.invoke('term:create', profileName, cols, rows, cwd),
  writeTerminal: (id, data) => ipcRenderer.send('term:write', id, data),
  resizeTerminal: (id, cols, rows) => ipcRenderer.send('term:resize', id, cols, rows),
  killTerminal: (id) => ipcRenderer.send('term:kill', id),
  onTerminalData: (callback) => ipcRenderer.on('term:data', (_event, id, data) => callback(id, data)),
  onTerminalExit: (callback) => ipcRenderer.on('term:exit', (_event, id, code) => callback(id, code)),

  // Serveurs favoris
  listServers: () => ipcRenderer.invoke('servers:list'),
  saveServer: (server) => ipcRenderer.invoke('servers:save', server),
  deleteServer: (id) => ipcRenderer.invoke('servers:delete', id),
  pickKeyFile: () => ipcRenderer.invoke('dialog:pickKey'),
  connectServer: (id, cols, rows) => ipcRenderer.invoke('term:connect', id, cols, rows),
});
