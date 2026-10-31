// Pont entre l'interface et le processus principal.
// Seules les fonctions listées ici existent côté interface, sous `window.edda`.

const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('edda', {
  platform: process.platform,
  // Documents
  choisirDocuments: () => ipcRenderer.invoke('document:choisir'),
  lireDocument: (chemin) => ipcRenderer.invoke('document:lire', chemin),
  choisirDestination: (options) => ipcRenderer.invoke('document:choisirDestination', options),
  ecrireDocument: (chemin, bytes) => ipcRenderer.invoke('document:ecrire', chemin, bytes),
  dateModif: (chemin) => ipcRenderer.invoke('document:dateModif', chemin),
  montrer: (chemin) => ipcRenderer.invoke('document:montrer', chemin),
  adopter: (chemin) => ipcRenderer.invoke('document:adopter', chemin),
  recents: () => ipcRenderer.invoke('document:recents'),
  oublierRecent: (chemin) => ipcRenderer.invoke('document:oublierRecent', chemin),
  documentsDuDossier: (dossier) => ipcRenderer.invoke('dossier:documents', dossier),
  onDocumentsExternes: (callback) => ipcRenderer.on('document:externe', (_event, fichiers) => callback(fichiers)),
  onDossierExterne: (callback) => ipcRenderer.on('dossier:externe', (_event, dossier) => callback(dossier)),
  // Médias insérés dans la page
  choisirMedias: (type) => ipcRenderer.invoke('media:choisir', type),
  decrireMedia: (chemin) => ipcRenderer.invoke('media:decrire', chemin),
  lireMedia: (src) => ipcRenderer.invoke('media:lire', src),
  rangerMedia: (document, src) => ipcRenderer.invoke('media:ranger', document, src),
  ouvrirMedia: (src) => ipcRenderer.invoke('media:ouvrir', src),
  ouvrirLien: (url) => ipcRenderer.invoke('lien:ouvrir', url),
  // PDF et impression
  exporterPdf: (options) => ipcRenderer.invoke('pdf:exporter', options),
  ouvrirPdf: (chemin) => ipcRenderer.invoke('pdf:ouvrir', chemin),
  imprimer: (options) => ipcRenderer.invoke('impression:imprimer', options),
  // Clic droit et orthographe
  onMenuContexte: (callback) => ipcRenderer.on('menu:contexte', (_event, infos) => callback(infos)),
  commandeEdition: (commande, mot) => ipcRenderer.invoke('edition:commande', commande, mot),
  // Chemin d'un fichier glissé depuis l'Explorateur Windows sur la fenêtre.
  pathOfDropped: (file) => webUtils.getPathForFile(file),
  demarrage: () => ipcRenderer.invoke('startup'),
  copierTexte: (text) => ipcRenderer.invoke('clipboard:writeText', text),
  onError: (callback) => ipcRenderer.on('app:error', (_event, message) => callback(message)),
  // Fermeture avec des documents pas enregistrés
  signalerModifies: (n) => ipcRenderer.invoke('app:modifies', n),
  onFermerDemande: (callback) => ipcRenderer.on('app:fermer-demande', () => callback()),
  fermer: () => ipcRenderer.invoke('app:fermer'),
  titre: (texte) => ipcRenderer.invoke('window:titre', texte),

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
