// Ouvre l'interface de Tafl dans Chromium, sans Electron : les fonctions que Tafl demande à son
// processus principal (window.tafl, window.claude) sont simulées et ne font rien (ni disque, ni Loki).
const path = require('node:path');
const { chromium } = require('playwright');

const RACINE = path.resolve(__dirname, '..', '..');
const INDEX = path.join(RACINE, 'tuiles', 'renderer', 'index.html');

// La configuration par défaut de Tafl (tuiles/main.js, DEFAULT_CONFIG).
const CONFIG = {
  claudeCommand: 'claude', claudeModel: '', claudeCommandes: false, claudeSansDemander: {}, accentColor: '#7bd88f',
  glass: true, windowBlur: false, tileSize: 16, palette: 'nature', pixelGrid: true, tileGrid: true, exportScale: 1,
  historySteps: 60, panelZoom: 100, vignette: 44, colonnes: 'auto', recentFiles: [], lastFolder: '',
  comfy: { dossier: '', code: '', python: '', modeles: '', port: 8189 }, comfyDerniers: {},
};

function simuler(config) {
  // Un objet qui répond à tout : chaque propriété est une fonction (async, rend null) qui a elle-même
  // des propriétés (window.tafl.comfy.onProgres…). Les onXxx rendent une fonction pour se désabonner.
  const reponses = {
    readConfig: () => ({ config, path: 'tafl-config.json' }),
    writeConfig: (c) => Object.assign(config, c || {}),
    setWindowTheme: () => ({ blur: false }),
    version: () => '0.0.0-test',
    recentFiles: () => [],
  };
  const proxy = (nom) => new Proxy(function () {}, {
    get: (_t, k) => {
      if (k === 'then' || typeof k !== 'string') return undefined;
      if (/^on[A-Z]/.test(k)) return () => () => {};
      if (k === 'platform') return 'win32';
      return proxy(k);
    },
    apply: (_t, _this, args) => Promise.resolve(reponses[nom] ? reponses[nom](...args) : null),
  });
  window.tafl = proxy('tafl');
  window.claude = proxy('claude');
}

// ctx (facultatif) : celui de l'essai (lancer.js), qui ferme la page à la fin et la capture si l'essai rate.
async function ouvrirTafl(navigateur, ctx) {
  const page = await navigateur.newPage({ viewport: { width: 1400, height: 900 } });
  ctx?.pages.push(page);
  const erreurs = suivreErreurs(page);
  await page.addInitScript(simuler, CONFIG);
  await page.goto(`file://${INDEX}`);
  await page.waitForFunction(() => typeof App !== 'undefined' && App.config);
  return { page, erreurs };
}

// Les erreurs de la page (exceptions, console.error). Les fichiers absents (icônes) ne comptent pas.
function suivreErreurs(page) {
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(`${e.message}${e.stack ? ` (${String(e.stack).split('\n')[1]?.trim()})` : ''}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND|Failed to load resource/.test(m.text())) erreurs.push(m.text()); });
  return erreurs;
}

// Les modèles de jeu de Fichier › Nouveau jeu › Partir de (app.js newDocument).
const MODELES = {
  domaine: 'ExempleDomaine', jdr: 'ExempleJdr', arene: 'ExempleArene', donjon: 'ExempleDonjon', roguelite: 'ExempleRoguelite',
};

// Crée dans Tafl un jeu à partir d'un modèle, comme Fichier › Nouveau jeu (sans l'enregistrer).
async function nouveauJeu(page, modele, { modules } = {}) {
  await page.evaluate(async ({ global, modules }) => {
    const doc = Doc.create({ name: 'Essai', tileSize: 16, palette: [], mapWidth: 20, mapHeight: 15, mapName: 'Bourg' });
    // Les modèles sont des const du script de Tafl (pas des propriétés de window).
    const modeles = { ExempleDomaine, ExempleJdr, ExempleArene, ExempleDonjon, ExempleRoguelite };
    if (global) modeles[global].remplir(doc); else Samples.fill(doc);
    if (modules) doc.data.reglages.modules = modules;
    doc.game = { folder: null, fichiers: [] };
    App.doc = null; // comme Fichier › Nouveau jeu : l'ancien jeu (un essai) est laissé sans demander
    await App.setDocument(doc);
  }, { global: MODELES[modele] || null, modules });
}

// Les fichiers du jeu ouvert, tels que Tafl les écrirait (IO.gameFiles) : { chemin: texte }.
// Ce que dit le vérificateur (Jeu › Vérifier le jeu) sur le jeu ouvert : [{ gravite, categorie, message }].
async function verifier(page) {
  return page.evaluate(async () => {
    await ScriptsTafl.rafraichir(App.doc);
    return Verificateur.verifier(OutilsJeu.jeuDe(App.doc)).problemes;
  });
}

async function fichiersDuJeu(page) {
  return page.evaluate(() => {
    const dec = new TextDecoder();
    return Object.fromEntries(IO.gameFiles(App.doc).map(([chemin, octets]) => [chemin, dec.decode(octets)]));
  });
}

module.exports = { chromium, ouvrirTafl, suivreErreurs, nouveauJeu, fichiersDuJeu, verifier, MODELES, RACINE };
