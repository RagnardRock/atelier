// Pont entre l'interface et le processus principal.
// Seules les fonctions listées ici existent côté interface, sous `window.saga`.

const { contextBridge, ipcRenderer } = require('electron');

// Le mode joueur (un jeu exporté en .exe) : main.js le passe en argument à la fenêtre.
const joueur = (() => {
  const a = process.argv.find((x) => x.startsWith('--saga-joueur='));
  try { return a ? JSON.parse(decodeURIComponent(a.slice('--saga-joueur='.length))) : null; } catch { return null; }
})();

// L'écran des joueurs du mode table (Saga 0.14) : main.js le passe en argument à cette fenêtre.
const ecranJoueurs = (() => {
  const a = process.argv.find((x) => x.startsWith('--saga-ecran-joueurs='));
  try { return a ? JSON.parse(decodeURIComponent(a.slice('--saga-ecran-joueurs='.length))) : null; } catch { return null; }
})();

contextBridge.exposeInMainWorld('saga', {
  platform: process.platform,
  joueur,
  ecranJoueurs,
  // Le mode table (Saga 0.14) : ouvrir ou fermer l'écran des joueurs, lui envoyer sa vue (fenêtre du MJ),
  // la recevoir et renvoyer ses demandes (fenêtre des joueurs). Les sons du jeu, pour le panneau Musique.
  tableOuvrir: () => ipcRenderer.invoke('table:ouvrir'),
  tableFermer: () => ipcRenderer.invoke('table:fermer'),
  tableEnvoyer: (json) => ipcRenderer.send('table:vue', json),
  onTableVue: (callback) => ipcRenderer.on('table:vue', (_event, json) => callback(json)),
  tableDemander: (a) => ipcRenderer.send('table:action', a),
  onTableAction: (callback) => ipcRenderer.on('table:action', (_event, a) => callback(a)),
  // Le multijoueur (Saga 1.0) : ouvrir la partie aux amis (sur le réseau local), leur envoyer leur vue,
  // recevoir leurs demandes et la liste de qui est là.
  // o : { mode: 'table' | 'monde', nom (celui de l'hôte), titre, port }.
  reseauOuvrir: (o) => ipcRenderer.invoke('reseau:ouvrir', o),
  reseauDire: (texte, pour) => ipcRenderer.send('reseau:dire', texte, pour),
  reseauBouger: (p) => ipcRenderer.send('reseau:bouger', p),
  reseauPair: (vers, donnees) => ipcRenderer.send('reseau:pair', vers, donnees),
  reseauFermer: () => ipcRenderer.invoke('reseau:fermer'),
  reseauInfos: () => ipcRenderer.invoke('reseau:infos'),
  reseauExpulser: (id) => ipcRenderer.invoke('reseau:expulser', id),
  reseauInternet: (voulu) => ipcRenderer.invoke('reseau:internet', voulu),
  reseauAccepter: (id, oui) => ipcRenderer.invoke('reseau:accepter', id, oui),
  reseauEnvoyer: (id, sorte, json) => ipcRenderer.send('reseau:envoyer', id, sorte, json),
  onReseauAction: (callback) => ipcRenderer.on('reseau:action', (_event, a) => callback(a)),
  onReseauClients: (callback) => ipcRenderer.on('reseau:clients', (_event, l) => callback(l)),
  listeSons: () => ipcRenderer.invoke('jeu:listeSons'),
  // Le jeu (un dossier écrit par Tafl) : renvoie { dossier, jeu, tuiles, cartes, donnees } en textes.
  choisirJeu: () => ipcRenderer.invoke('jeu:choisir'),
  ouvrirJeu: (dossier) => ipcRenderer.invoke('jeu:ouvrir', dossier),
  jeuxRecents: () => ipcRenderer.invoke('jeu:recents'),
  montrerJeu: (dossier) => ipcRenderer.invoke('jeu:montrer', dossier),
  // La sauvegarde de la partie d'un jeu (dans %APPDATA%\atelier-moteur\sauvegardes, jamais dans le jeu).
  // place : '' (la sauvegarde du joueur), 'test' (celle à part d'un test rapide de Tafl, Saga 0.10)
  // ou 'auto' (la sauvegarde auto, Saga 0.11).
  lireSauvegarde: (dossier, place = '') => ipcRenderer.invoke('sauvegarde:lire', dossier, place),
  ecrireSauvegarde: (dossier, donnees, place = '') => ipcRenderer.invoke('sauvegarde:ecrire', dossier, donnees, place),
  // Un son du dossier sons/ du jeu ouvert (Saga 0.11) : ses octets, que le moteur décode.
  lireSon: (chemin) => ipcRenderer.invoke('jeu:son', chemin),
  // Un jeu lancé par Tafl ou Atelier alors que Saga est déjà ouvert : { dossier, depart }.
  // Exporter le jeu en version web et/ou Windows (Saga 0.9) : formats = ['web', 'exe'].
  exporter: (dossier, formats) => ipcRenderer.invoke('jeu:exporter', dossier, formats),
  onExportProgres: (callback) => ipcRenderer.on('export:progres', (_event, texte) => callback(texte)),
  montrerExport: (chemin) => ipcRenderer.invoke('export:montrer', chemin),
  onJeuExterne: (callback) => ipcRenderer.on('jeu:externe', (_event, l) => callback(l)),
  demarrage: () => ipcRenderer.invoke('startup'),
  pleinEcran: (oui) => ipcRenderer.invoke('window:pleinEcran', oui),
  onPleinEcran: (callback) => ipcRenderer.on('window:pleinEcran', (_event, oui) => callback(oui)),
  onError: (callback) => ipcRenderer.on('app:error', (_event, message) => callback(message)),

  readConfig: () => ipcRenderer.invoke('config:read'),
  writeConfig: (changes) => ipcRenderer.invoke('config:write', changes),
  version: () => ipcRenderer.invoke('app:version'),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateProgress: (callback) => ipcRenderer.on('update:progress', (_event, percent) => callback(percent)),
});
