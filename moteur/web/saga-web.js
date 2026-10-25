// Le pont de Saga dans un navigateur (export web, Saga 0.9) : il remplace preload.js d'Electron.
// L'interface (app.js) et le moteur (moteur/) appellent window.saga comme dans Saga ; ici, le jeu vient
// de jeu.js (window.SAGA_JEU, écrit par l'export) et les réglages et la sauvegarde restent dans le
// navigateur du joueur (localStorage), rangés sous le nom du jeu.

(() => {
  const J = window.SAGA_JEU;
  const cle = `saga:${J.cle}`;
  const lire = (k) => { try { return JSON.parse(localStorage.getItem(`${cle}:${k}`)); } catch { return null; } };
  const ecrire = (k, v) => localStorage.setItem(`${cle}:${k}`, JSON.stringify(v));
  const rien = () => {};

  window.saga = {
    platform: 'web',
    // Le mode joueur : le jeu direct, sans les menus de Saga (ouvrir un autre jeu, recharger, mise à jour…).
    joueur: { titre: J.titre, web: true },
    choisirJeu: async () => null,
    ouvrirJeu: async () => J.textes,
    jeuxRecents: async () => [],
    montrerJeu: async () => {},
    // place : '' (la sauvegarde du joueur) ou 'auto' (la sauvegarde auto, Saga 0.11), rangées à part.
    lireSauvegarde: async (_dossier, place = '') => lire(place === 'auto' ? 'sauvegarde-auto' : 'sauvegarde'),
    ecrireSauvegarde: async (_dossier, donnees, place = '') => {
      try { ecrire(place === 'auto' ? 'sauvegarde-auto' : 'sauvegarde', donnees); } catch { throw new Error('le navigateur refuse de garder la sauvegarde (navigation privée ou plus de place)'); }
    },
    // Les sons du jeu (Saga 0.11) : emballés en base64 dans sons.js par l'export.
    lireSon: async (chemin) => {
      const b64 = window.SAGA_SONS?.[chemin];
      if (!b64) throw new Error('introuvable dans l\'export');
      const bin = atob(b64);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    },
    onJeuExterne: rien,
    demarrage: async () => ({ dossier: J.textes.dossier, depart: null }),
    pleinEcran: async (oui) => {
      const veut = oui === undefined ? !document.fullscreenElement : Boolean(oui);
      if (veut && !document.fullscreenElement) await document.documentElement.requestFullscreen?.().catch(rien);
      else if (!veut && document.fullscreenElement) await document.exitFullscreen().catch(rien);
      return Boolean(document.fullscreenElement);
    },
    onPleinEcran: (callback) => document.addEventListener('fullscreenchange', () => callback(Boolean(document.fullscreenElement))),
    onError: rien, // notify.js écoute déjà les erreurs de la page

    readConfig: async () => ({ config: { ...J.config, ...(lire('reglages') || {}) }, path: '' }),
    writeConfig: async (changes) => {
      const config = { ...J.config, ...(lire('reglages') || {}), ...changes };
      try { ecrire('reglages', config); } catch { /* navigation privée : les réglages valent pour cette fois */ }
      return config;
    },
    version: async () => J.saga,
    checkUpdate: async () => ({ mode: 'web', changes: [] }),
    installUpdate: async () => {},
    onUpdateProgress: rien,
  };
})();
