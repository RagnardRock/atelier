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

  // Projets récents
  projets: () => ipcRenderer.invoke('projets:liste'),
  ouvrirProjet: (dossier, outil) => ipcRenderer.invoke('projets:ouvrir', dossier, outil),
  choisirOutilProjet: (nom, outil) => ipcRenderer.invoke('projets:choisirOutil', nom, outil),
  choisirDossierProjets: () => ipcRenderer.invoke('projets:choisirDossier'),

  // Données des widgets (couleurs, calendrier…)
  lireDonnees: (nom, defaut) => ipcRenderer.invoke('donnees:lire', nom, defaut),
  ecrireDonnees: (nom, data) => ipcRenderer.invoke('donnees:ecrire', nom, data),

  // Presse-papiers
  historiquePressePapiers: () => ipcRenderer.invoke('presse:historique'),
  copier: (texte) => ipcRenderer.invoke('presse:copier', texte),
  supprimerDuPressePapiers: (texte) => ipcRenderer.invoke('presse:supprimer', texte),
  viderPressePapiers: () => ipcRenderer.invoke('presse:vider'),
  reglagesPressePapiers: () => ipcRenderer.invoke('presse:reglages'),
  onPressePapiers: (callback) => ipcRenderer.on('presse:change', (_event, historique) => callback(historique)),

  // Widget Claude
  claudeEnvoyer: (texte) => ipcRenderer.invoke('claude:send', texte),
  claudeInterrompre: () => ipcRenderer.invoke('claude:interrupt'),
  claudeNouvelle: () => ipcRenderer.invoke('claude:reset'),
  claudeReprendre: (sessionId) => ipcRenderer.invoke('claude:reprendre', sessionId),
  claudeOuvrirDossier: () => ipcRenderer.invoke('claude:ouvrirDossier'),
  onClaude: (callback) => ipcRenderer.on('claude:event', (_event, data) => callback(data)),

  // Réglages, fenêtre, mise à jour d'Atelier
  readConfig: () => ipcRenderer.invoke('config:read'),
  writeConfig: (changes) => ipcRenderer.invoke('config:write', changes),
  version: () => ipcRenderer.invoke('app:version'),
  setWindowTheme: (options) => ipcRenderer.invoke('window:theme', options),
  blurSupported: () => ipcRenderer.invoke('window:blurSupported'),
  attention: () => ipcRenderer.invoke('window:attention'),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateProgress: (callback) => ipcRenderer.on('update:progress', (_event, percent) => callback(percent)),
});
