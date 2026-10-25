// Le bac à sable des scripts JS d'un jeu (Tafl 0.31, Saga 0.12), commun à Tafl et à Saga.
//
// Un jeu peut avoir ses propres fichiers JavaScript (scripts/*.js, voir SCRIPTS.md dans moteur/).
// Ils ne tournent jamais dans la page de Tafl ou de Saga : ils tournent dans un « worker », un petit
// fil d'exécution à part, fabriqué ici à partir de leur texte. Dans ce worker :
//   - ni fichiers, ni réseau, ni fenêtre : on enlève fetch, XMLHttpRequest, WebSocket, importScripts,
//     le stockage, les autres workers… avant que le premier script ne tourne ;
//   - pas d'eval ni de new Function (la politique de sécurité de la page s'applique au worker) ;
//   - le hasard passe par `des` (une graine gardée dans la partie : mêmes jets, même résultat), et
//     Math.random utilise la même graine ;
//   - un script ne change jamais la partie lui-même : il demande des commandes (saga.donner…),
//     que l'hôte (Saga, ou Tafl pour « Essayer ») vérifie puis applique, et il reçoit une copie gelée
//     de la partie. C'est ce qui permettra au multijoueur de tout faire passer par l'hôte.
//   - s'il calcule trop longtemps sans rendre la main (une boucle sans fin), l'hôte arrête le worker
//     et en recharge un neuf : le jeu continue.
//
// Ce fichier est recopié dans tuiles/commun/ et moteur/commun/ par commun/copier.js (npm install),
// et dans l'export web de Saga. Il ne dépend de rien d'autre.

const BacASable = (() => {
  // Sans réponse du worker pendant ce temps (il calcule sans rendre la main), on l'arrête.
  const LIMITE_MS = 600;
  const LIMITE_CHARGEMENT_MS = 2000;
  const PING_MS = 100;
  const NOM_FICHIER = /^scripts\/[a-z0-9][a-z0-9-]{0,59}\.js$/;

  // --- Ce que les scripts peuvent remplacer ou écouter ---
  // Les formules de chaque pack de règles (Saga les appelle avec ces valeurs ; `normal` est toujours
  // le résultat de la formule du pack, pour une règle maison qui ne fait que l'ajuster). `exemple` sert
  // au bouton Essayer de Tafl et à l'aide de l'éditeur.
  const FORMULES = {
    jrpg: {
      degats: {
        nom: 'Dégâts d\'un coup', rend: 'Les PV perdus par la cible (au moins 1, sauf immunité).',
        valeurs: { A: 'Force (physique) ou Magie (sort) de l\'attaquant', D: 'Défense ou Esprit de la cible', puissance: 'Puissance de la compétence (100 pour Attaquer)', element: 'Multiplicateur d\'élément (2 = faiblesse, 0,5 = résistance, 0 = immunité)', critique: 'true si c\'est un coup critique', defend: 'true si la cible se défend', physique: 'true pour un coup physique, false pour un sort', normal: 'Les dégâts selon la formule du pack' },
        exemple: { A: 24, D: 12, puissance: 100, element: 1, critique: false, defend: false, physique: true, normal: 26 },
      },
      soin: {
        nom: 'Soin d\'une compétence', rend: 'Les PV rendus.',
        valeurs: { soin: 'Puissance de soin de la compétence', magie: 'Magie du lanceur', normal: 'Le soin selon la formule du pack' },
        exemple: { soin: 30, magie: 18, normal: 48 },
      },
      touche: {
        nom: 'Chance de toucher', rend: 'Une chance en % (0 à 100).',
        valeurs: { precision: 'Précision de la compétence', agiliteA: 'Agilité de l\'attaquant', agiliteD: 'Agilité de la cible', aveugle: 'true si l\'attaquant est aveuglé', normal: 'La chance selon la formule du pack' },
        exemple: { precision: 95, agiliteA: 10, agiliteD: 14, aveugle: false, normal: 93 },
      },
      critique: {
        nom: 'Chance de coup critique', rend: 'Une chance en % (0 à 100).',
        valeurs: { chance: 'Chance de l\'attaquant', paliers: 'Paliers de critique de la compétence', normal: 'La chance selon la formule du pack' },
        exemple: { chance: 8, paliers: 0, normal: 5 },
      },
      fuite: {
        nom: 'Chance de fuir', rend: 'Une chance en % (0 à 100).',
        valeurs: { agiliteHeros: 'Agilité moyenne des héros debout', agiliteMonstres: 'Agilité moyenne des monstres debout', essais: 'Essais ratés dans ce combat', normal: 'La chance selon la formule du pack' },
        exemple: { agiliteHeros: 12, agiliteMonstres: 9, essais: 0, normal: 56 },
      },
      experience: {
        nom: 'Expérience gagnée', rend: 'L\'expérience que reçoit chaque héros debout (le pack la donne entière à chacun).',
        valeurs: { total: 'L\'expérience de tous les monstres vaincus', heros: 'Le nombre de héros debout', normal: 'L\'expérience selon la formule du pack' },
        exemple: { total: 120, heros: 3, normal: 120 },
      },
    },
    // Le pack JDR (Saga 0.13) : D&D 5e. Les jets passent par des d20 : une formule rend le total (ou le bonus).
    jdr: {
      attaque: {
        nom: 'Bonus d\'attaque', rend: 'Le bonus ajouté au d20 d\'une attaque (arme ou sort), avant les bonus de sorts (Bénédiction).',
        valeurs: { naturel: 'Le d20 (1 à 20)', bonus: 'Le bonus de la fiche (modificateur + maîtrise + magie de l\'arme)', magie: 'Le bonus magique de l\'arme', sort: 'true pour une attaque de sort', distance: 'true pour une attaque à distance', normal: 'Le bonus selon les règles' },
        exemple: { naturel: 14, bonus: 5, magie: 0, sort: false, distance: false, normal: 5 },
      },
      degats: {
        nom: 'Dégâts d\'une attaque', rend: 'Les PV perdus par la cible, avant ses résistances (au moins 1 pour une arme).',
        valeurs: { des: 'Le total des dés (déjà doublés sur un critique)', mod: 'Ce qui s\'ajoute (modificateur, rage, style de combat)', critique: 'true sur un coup critique', type: 'Le type de dégâts (tranchant, feu…)', sort: 'true pour un sort', normal: 'Les dégâts selon les règles (des + mod)' },
        exemple: { des: 6, mod: 3, critique: false, type: 'tranchant', sort: false, normal: 9 },
      },
      critique: {
        nom: 'Coup critique à partir de…', rend: 'Le d20 naturel à partir duquel une attaque est critique (20 ; 19 pour un champion).',
        valeurs: { niveau: 'Le niveau de l\'attaquant (0 pour un monstre)', classe: 'L\'id de sa classe (\'\' pour un monstre)', normal: 'Le seuil selon les règles' },
        exemple: { niveau: 3, classe: 'guerrier', normal: 20 },
      },
      test: {
        nom: 'Test de compétence', rend: 'Le total d\'un test (d20 + bonus), comparé au DD.',
        valeurs: { naturel: 'Le d20 (1 à 20)', bonus: 'Le bonus de la fiche', dd: 'Le DD (0 : pas de DD)', competence: 'L\'id de la compétence (ou de la caractéristique)', carac: 'Sa caractéristique', maitrise: 'true si elle est maîtrisée', normal: 'Le total selon les règles (naturel + bonus)' },
        exemple: { naturel: 12, bonus: 5, dd: 15, competence: 'discretion', carac: 'dex', maitrise: true, normal: 17 },
      },
      sauvegarde: {
        nom: 'Jet de sauvegarde', rend: 'Le total d\'une sauvegarde (d20 + bonus), comparé au DD.',
        valeurs: { naturel: 'Le d20 (1 à 20)', bonus: 'Le bonus de sauvegarde', dd: 'Le DD', carac: 'La caractéristique', maitrise: 'true si elle est maîtrisée', normal: 'Le total selon les règles' },
        exemple: { naturel: 9, bonus: 4, dd: 13, carac: 'con', maitrise: true, normal: 13 },
      },
      initiative: {
        nom: 'Initiative', rend: 'Le total d\'initiative d\'un combattant (le plus grand joue en premier).',
        valeurs: { naturel: 'Le d20 (1 à 20)', dex: 'Son modificateur de Dextérité', normal: 'Le total selon les règles' },
        exemple: { naturel: 11, dex: 3, normal: 14 },
      },
      pv_niveau: {
        nom: 'PV gagnés en montant de niveau', rend: 'Les PV gagnés, sans la Constitution (ajoutée ensuite, au moins 1 en tout).',
        valeurs: { de: 'Le dé de vie de la classe (6, 8, 10, 12)', con: 'Le modificateur de Constitution', jet: 'Le jet du dé (0 si on prend la moyenne)', niveau: 'Le nouveau niveau', normal: 'Les PV selon les règles (la moyenne ou le jet)' },
        exemple: { de: 10, con: 2, jet: 0, niveau: 2, normal: 6 },
      },
      soin: {
        nom: 'Soin d\'un sort', rend: 'Les PV rendus.',
        valeurs: { des: 'Le total des dés du sort', mod: 'Le modificateur de la caractéristique de magie', sort: 'L\'id du sort', normal: 'Le soin selon les règles (des + mod)' },
        exemple: { des: 5, mod: 3, sort: 'soins', normal: 8 },
      },
      experience: {
        nom: 'Expérience gagnée', rend: 'L\'XP que reçoit chaque héros après une victoire.',
        valeurs: { total: 'L\'XP de tous les monstres vaincus', heros: 'Le nombre de héros (pas morts)', normal: 'L\'XP selon les règles (partagée)' },
        exemple: { total: 200, heros: 4, normal: 50 },
      },
    },
    pokemon: {
      degats: {
        nom: 'Dégâts d\'une attaque', rend: 'Les PV perdus par la cible (au moins 1).',
        valeurs: { niveau: 'Niveau de l\'attaquant', A: 'Attaque ou Attaque Spé. de l\'attaquant', D: 'Défense ou Défense Spé. de la cible', puissance: 'Puissance de l\'attaque', multiplicateur: 'Efficacité × bonus de type (STAB) × critique × brûlure', critique: 'true si c\'est un coup critique', normal: 'Les dégâts selon la formule officielle' },
        exemple: { niveau: 12, A: 30, D: 22, puissance: 40, multiplicateur: 1.5, critique: false, normal: 14 },
      },
      capture: {
        nom: 'Chance de capture', rend: 'Une chance en % (0 à 100) que la créature reste dans la balle.',
        valeurs: { pv: 'PV de la créature', pvMax: 'PV max de la créature', taux: 'Taux de capture de l\'espèce (3 à 255)', balle: 'Bonus de la balle (1 Poké Ball, 1,5 Super Ball, 2 Hyper Ball)', statut: 'Statut de la créature (\'\' si aucun)', normal: 'La chance selon la formule officielle' },
        exemple: { pv: 8, pvMax: 30, taux: 45, balle: 1, statut: '', normal: 32 },
      },
      fuite: {
        nom: 'Chance de fuir', rend: 'Une chance en % (0 à 100).',
        valeurs: { vitesse: 'Vitesse de ta créature', vitesseAdverse: 'Vitesse de la créature sauvage', essais: 'Essais dans ce combat (1 au premier)', normal: 'La chance selon la formule officielle' },
        exemple: { vitesse: 20, vitesseAdverse: 25, essais: 1, normal: 52 },
      },
      experience: {
        nom: 'Expérience gagnée', rend: 'L\'expérience que reçoit chaque créature qui a combattu.',
        valeurs: { base: 'Expérience de base de l\'espèce battue', niveau: 'Niveau de la créature battue', dresseur: 'true contre un dresseur', participants: 'Le nombre de créatures qui ont combattu', normal: 'L\'expérience selon la formule officielle' },
        exemple: { base: 64, niveau: 8, dresseur: false, participants: 1, normal: 73 },
      },
    },
  };
  const formulesDuPack = (pack) => FORMULES[pack] || FORMULES.pokemon;

  // Les moments du jeu qu'un script peut écouter avec quand(moment, fn).
  const MOMENTS = {
    nouvelle_partie: { nom: 'Une nouvelle partie commence', infos: {} },
    carte: { nom: 'Le joueur arrive sur une carte', infos: { carte: 'L\'id de la carte', depuis: 'L\'id de la carte d\'avant (\'\' au début)' } },
    apres_combat: { nom: 'Après un combat', infos: { issue: '\'victoire\', \'defaite\', \'fuite\' ou \'capture\'', sorte: '\'sauvage\', \'dresseur\' ou \'groupe\'' } },
    moment: { nom: 'Le moment de la journée change', infos: { moment: '\'matin\', \'jour\', \'soir\' ou \'nuit\'' } },
    pas: { nom: 'Le joueur fait un pas (souvent : reste court)', infos: { x: 'Sa case', y: 'Sa case' } },
  };

  // Les réglages qu'une commande de script peut demander dans Tafl (bloc Script).
  const TYPES_PARAM = ['nombre', 'texte', 'oui_non', 'liste', 'objet', 'personnage', 'carte', 'interrupteur', 'variable', 'quete', 'creature'];

  // =====================================================================================
  // Ce qui tourne DANS le worker. Cette fonction n'est jamais appelée ici : son texte devient le
  // début du script du worker (voir fabriquer). Elle ne doit donc rien utiliser d'extérieur.
  // =====================================================================================
  function prelude() {
    'use strict';
    const envoyer = self.postMessage.bind(self);
    const ecouter = self.addEventListener.bind(self);
    const geler = (o) => {
      if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const k of Object.keys(o)) geler(o[k]); }
      return o;
    };
    // 1. On ferme la boîte : tout ce qui sort du worker disparaît, pour de bon.
    const INTERDITS = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'WebTransport', 'importScripts', 'indexedDB', 'caches',
      'BroadcastChannel', 'MessageChannel', 'Worker', 'SharedWorker', 'RTCPeerConnection', 'navigator', 'location', 'close',
      'postMessage', 'addEventListener', 'removeEventListener', 'dispatchEvent', 'onmessage', 'onmessageerror', 'onerror',
      'FileReader', 'FileReaderSync', 'Request', 'Response', 'Headers', 'Notification', 'setTimeout', 'setInterval',
      'clearTimeout', 'clearInterval', 'requestAnimationFrame', 'OffscreenCanvas', 'WebAssembly', 'storageFoundation',
      'cookieStore', 'createImageBitmap', 'reportError', 'webkitRequestFileSystem', 'webkitRequestFileSystemSync', 'webkitResolveLocalFileSystemURL', 'webkitResolveLocalFileSystemSyncURL'];
    for (const nom of INTERDITS) {
      for (let o = self; o; o = Object.getPrototypeOf(o)) { try { delete o[nom]; } catch { /* rien */ } }
      try { Object.defineProperty(self, nom, { value: undefined, writable: false, configurable: false }); } catch { /* rien */ }
    }

    // 2. Le hasard : une graine (32 bits), avancée à chaque tirage (mulberry32).
    let graine = 1;
    function aleatoire() {
      graine = (graine + 0x6D2B79F5) | 0;
      let t = graine;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    Object.defineProperty(Math, 'random', { value: aleatoire, writable: false, configurable: false });
    const entier = (v, defaut) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : defaut);
    // « 2d6+3 », « d20 », « 1d8-1 », « 3d6 + 1d4 + 2 ».
    function jet(formule) {
      const texte = String(formule ?? '').replace(/\s+/g, '').toLowerCase();
      if (!/^[+-]?(\d*d\d+|\d+)([+-](\d*d\d+|\d+))*$/.test(texte)) throw new Error(`Jet de dés illisible : « ${formule} » (exemples : d20, 2d6+3)`);
      const resultat = { formule: texte, des: [], bonus: 0, total: 0 };
      for (const [, signe, n, faces, nombre] of texte.matchAll(/([+-]?)(?:(\d*)d(\d+)|(\d+))/g)) {
        const s = signe === '-' ? -1 : 1;
        if (nombre !== undefined) { resultat.bonus += s * Number(nombre); continue; }
        const combien = Math.min(100, n === '' ? 1 : Number(n)), f = Math.max(1, Math.min(1000, Number(faces)));
        for (let i = 0; i < combien; i++) { const d = 1 + Math.floor(aleatoire() * f); resultat.des.push({ faces: f, valeur: d, signe: s }); }
      }
      resultat.total = resultat.bonus + resultat.des.reduce((t, d) => t + d.signe * d.valeur, 0);
      return geler(resultat);
    }
    const des = Object.freeze({
      d: (faces) => 1 + Math.floor(aleatoire() * Math.max(1, entier(faces, 6))),
      lancer: (formule) => jet(formule).total,
      jet,
      hasard: (min, max) => { const a = entier(min, 0), b = entier(max, a); return a + Math.floor(aleatoire() * (Math.max(a, b) - a + 1)); },
      chance: (pourcent) => aleatoire() * 100 < Number(pourcent),
      choisir: (liste) => (Array.isArray(liste) && liste.length ? liste[Math.floor(aleatoire() * liste.length)] : undefined),
      aleatoire,
    });

    // 3. Ce que les scripts déclarent.
    const commandes = new Map(), formules = new Map(), reactions = new Map();
    let fichier = null, erreursChargement = [];
    const texteDe = (v) => {
      if (typeof v === 'string') return v;
      try { return JSON.stringify(v); } catch { return String(v); }
    };
    function noter(niveau, args) {
      envoyer({ t: 'console', niveau, texte: args.map(texteDe).join(' '), pile: new Error().stack || '' });
    }
    const console = Object.freeze({
      log: (...a) => noter('log', a), info: (...a) => noter('log', a), warn: (...a) => noter('avertissement', a), error: (...a) => noter('erreur', a),
    });
    const NOM = /^[a-z0-9_][a-z0-9_-]{0,59}$/;
    const verifierNom = (quoi, nom) => { if (typeof nom !== 'string' || !NOM.test(nom)) throw new Error(`${quoi} : le nom « ${nom} » doit être en minuscules, chiffres, - ou _ (exemple : coffre_piege)`); };
    function commande(nom, params, fn) {
      if (typeof params === 'function') { fn = params; params = {}; }
      verifierNom('commande()', nom);
      if (typeof fn !== 'function') throw new Error(`commande('${nom}') : il manque la fonction (async (saga, params) => { … })`);
      if (commandes.has(nom)) throw new Error(`commande('${nom}') existe déjà (dans ${commandes.get(nom).fichier})`);
      const p = {};
      for (const [cle, def] of Object.entries(params && typeof params === 'object' ? params : {})) {
        verifierNom(`commande('${nom}'), réglage`, cle);
        const d = def && typeof def === 'object' ? def : { defaut: def };
        p[cle] = {
          type: typeof d.type === 'string' ? d.type : typeof d.defaut === 'number' ? 'nombre' : typeof d.defaut === 'boolean' ? 'oui_non' : 'texte',
          nom: typeof d.nom === 'string' ? d.nom : cle,
          defaut: d.defaut ?? null,
          ...(Array.isArray(d.choix) ? { choix: d.choix.map(String).slice(0, 50) } : {}),
          ...(Number.isFinite(d.min) ? { min: d.min } : {}), ...(Number.isFinite(d.max) ? { max: d.max } : {}),
          ...(typeof d.aide === 'string' ? { aide: d.aide } : {}),
        };
      }
      commandes.set(nom, { fn, params: p, fichier, aide: typeof params?.aide === 'string' ? params.aide : '' });
    }
    function formule(nom, fn) {
      verifierNom('formule()', nom);
      if (typeof fn !== 'function') throw new Error(`formule('${nom}') : il manque la fonction ((valeurs, des) => …)`);
      if (formules.has(nom)) throw new Error(`formule('${nom}') est déjà remplacée (dans ${formules.get(nom).fichier})`);
      formules.set(nom, { fn, fichier });
    }
    function quand(moment, fn) {
      verifierNom('quand()', moment);
      if (typeof fn !== 'function') throw new Error(`quand('${moment}') : il manque la fonction (async (saga, infos) => { … })`);
      if (!reactions.has(moment)) reactions.set(moment, []);
      reactions.get(moment).push({ fn, fichier });
    }
    // Les données du jeu arrivent juste après le chargement : les fichiers gardent ce même objet.
    const donnees = {};
    self.__fichier = (nom, fabrique) => {
      fichier = nom;
      try { fabrique(commande, formule, quand, des, donnees, console); } catch (err) { erreursChargement.push({ fichier: nom, message: err?.message || String(err), pile: err?.stack || '' }); }
      fichier = null;
    };

    // 4. Les appels de l'hôte.
    class Fin { constructor() { this.fin = true; } }
    let demandes = 0;
    const attente = new Map(); // n° de demande → { resoudre, rejeter }
    function creerSaga(appel, etat) {
      let courant = geler(etat || {});
      const demander = (action, args) => new Promise((resoudre, rejeter) => {
        const n = ++demandes;
        attente.set(n, { resoudre, rejeter, majEtat: (e) => { if (e) courant = geler(e); } });
        envoyer({ t: 'demande', id: appel, n, action, args });
      });
      const cmd = (c) => demander('commande', c);
      const p = () => courant.partie || {};
      const saga = {
        get partie() { return p(); },
        get carte() { return courant.carte || null; },
        get evenement() { return courant.evenement || null; },
        get joueur() { return courant.joueur || null; },
        // Parler au joueur.
        dire: (texte, qui = '', expression = 'normal') => cmd({ type: 'dire', texte: String(texte ?? ''), qui: String(qui ?? ''), expression: String(expression || 'normal') }),
        choisir: (options) => demander('choisir', { options: (Array.isArray(options) ? options : []).map(String).slice(0, 4) }),
        annoncer: (titre, texte = '') => demander('annoncer', { titre: String(titre ?? ''), texte: String(texte ?? '') }),
        attendre: (ms) => cmd({ type: 'attendre', ms: Number(ms) || 0 }),
        // Le monde.
        interrupteur(id, valeur) {
          if (valeur === undefined) return Boolean(p().interrupteurs?.[id]);
          return cmd({ type: 'interrupteur', id: String(id), valeur: Boolean(valeur) });
        },
        local(valeur) {
          const ev = courant.evenement, c = courant.carte;
          if (valeur === undefined) return Boolean(ev && c && p().locaux?.[`${c.id}/${ev.id}`]);
          return cmd({ type: 'local', valeur: Boolean(valeur) });
        },
        variable(id, valeur) {
          if (valeur === undefined) { const v = p().variables?.[id]; return v === undefined ? 0 : v; }
          return cmd({ type: 'variable', id: String(id), action: 'regler', valeur });
        },
        ajouter: (id, n = 1) => cmd({ type: 'variable', id: String(id), action: 'ajouter', valeur: Number(n) || 0 }),
        combien: (objet) => Number(p().sac?.[objet]) || 0,
        donner: (objet, nombre = 1) => cmd({ type: 'objet', action: 'donner', objet: String(objet), nombre: Number(nombre) || 1 }),
        retirer: (objet, nombre = 1) => cmd({ type: 'objet', action: 'retirer', objet: String(objet), nombre: Number(nombre) || 1 }),
        argent(montant) {
          if (montant === undefined) return Number(p().argent) || 0;
          const m = Math.round(Number(montant) || 0);
          return cmd({ type: 'argent', action: m < 0 ? 'retirer' : 'donner', montant: Math.abs(m) });
        },
        quete: (quete, action = 'commencer', etape = 1) => cmd({ type: 'quete', quete: String(quete), action, etape: Number(etape) || 1 }),
        etatQuete: (quete) => p().quetes?.[quete]?.etat || 'pas_commencee',
        badge: (badge) => cmd({ type: 'badge', badge: String(badge) }),
        soigner: () => cmd({ type: 'soigner' }),
        teleporter: (carte, x, y, direction = 'bas') => cmd({ type: 'teleporter', carte: String(carte), x: Number(x) || 0, y: Number(y) || 0, direction }),
        creature: (creature, niveau = 5) => cmd({ type: 'creature', creature: String(creature), niveau: Number(niveau) || 5 }),
        groupe: (personnage, action = 'rejoindre', niveau = 0) => cmd({ type: 'groupe', personnage: String(personnage), action, niveau: Number(niveau) || 0 }),
        // Le pack JDR (Saga 0.13) : les tests et les jets se font chez Saga (le script demande, Saga lance).
        test: (o = {}) => cmd({ ...(o && typeof o === 'object' ? o : {}), type: 'test', reussi: [], rate: [] }),
        sauvegarde: (o = {}) => cmd({ ...(o && typeof o === 'object' ? o : {}), type: 'sauvegarde', reussi: [], rate: [] }),
        oppose: (o = {}) => cmd({ ...(o && typeof o === 'object' ? o : {}), type: 'test_oppose', reussi: [], rate: [] }),
        jet: (formule = 'd20', quoi = '') => cmd({ type: 'jet', formule: String(formule), quoi: String(quoi || '') }),
        repos: (sorte = 'long') => cmd({ type: 'repos', sorte: sorte === 'court' ? 'court' : 'long' }),
        xp: (montant) => cmd({ type: 'xp', montant: Number(montant) || 0 }),
        etat: (etat, action = 'ajouter', qui = 'tous') => cmd({ type: 'etat', etat: String(etat), action, qui }),
        fiche: (i = 0) => (courant.fiches || [])[Number(i) || 0] || null,
        get fiches() { return courant.fiches || []; },
        combattre(o = {}) {
          if (o.dresseur) return cmd({ type: 'combat_dresseur', dresseur: String(o.dresseur) });
          if (o.groupe) return cmd({ type: 'combat_groupe', groupe: String(o.groupe) });
          return cmd({ type: 'combat_sauvage', creature: String(o.creature || ''), niveau: Number(o.niveau) || 5 });
        },
        boutique: (boutique) => cmd({ type: 'boutique', boutique: String(boutique) }),
        musique: (fichier) => cmd({ type: 'musique', fichier: String(fichier ?? '') }),
        son: (fichier) => cmd({ type: 'son', fichier: String(fichier ?? '') }),
        heure: (heures, action = 'regler') => cmd({ type: 'heure', action, heures: Number(heures) || 0 }),
        // N'importe quelle commande des scripts en blocs (FORMAT.md › Commandes).
        commande: (c) => cmd(c && typeof c === 'object' ? { ...c } : {}),
        // Arrêter le script de l'événement ici (comme le bloc « Arrêter le script ici »).
        fin() { throw new Fin(); },
      };
      return Object.freeze(saga);
    }
    const nombreOk = (v) => (typeof v === 'number' && Number.isFinite(v)) || typeof v === 'boolean';
    async function appeler({ id, sorte, nom, args, etat }) {
      if (sorte === 'commande') {
        const c = commandes.get(nom);
        if (!c) throw new Error(`La commande de script « ${nom} » n'existe pas (ou son fichier a une erreur)`);
        const params = {};
        for (const [cle, d] of Object.entries(c.params)) params[cle] = args?.params?.[cle] ?? d.defaut;
        return await c.fn(creerSaga(id, etat), geler(params));
      }
      if (sorte === 'formule') {
        const f = formules.get(nom);
        if (!f) return { absente: true };
        const v = await f.fn(geler({ ...(args || {}) }), des);
        if (!nombreOk(v)) throw new Error(`La formule « ${nom} » doit rendre un nombre (elle a rendu ${texteDe(v)})`);
        return Number(v);
      }
      if (sorte === 'quand') {
        for (const r of reactions.get(nom) || []) await r.fn(creerSaga(id, etat), geler({ ...(args || {}) }));
        return null;
      }
      throw new Error(`Appel inconnu : ${sorte}`);
    }

    ecouter('message', async (e) => {
      const m = e.data || {};
      if (m.t === 'ping') { envoyer({ t: 'pong' }); return; }
      if (m.t === 'graine') { graine = m.graine | 0; return; }
      if (m.t === 'donnees') {
        if (!Object.isFrozen(donnees)) { Object.assign(donnees, m.donnees || {}); geler(donnees); }
        return;
      }
      if (m.t === 'reponse') {
        const a = attente.get(m.n);
        if (!a) return;
        attente.delete(m.n);
        a.majEtat(m.etat);
        if (m.fin) a.rejeter(new Fin());
        else if (m.erreur) a.rejeter(new Error(m.erreur));
        else a.resoudre(m.valeur);
        return;
      }
      if (m.t === 'appel') {
        try {
          const valeur = await appeler(m);
          envoyer({ t: 'fin', id: m.id, valeur: valeur === undefined ? null : JSON.parse(JSON.stringify(valeur ?? null)), graine });
        } catch (err) {
          if (err instanceof Fin) envoyer({ t: 'fin', id: m.id, valeur: null, finScript: true, graine });
          else envoyer({ t: 'erreur', id: m.id, message: err?.message || String(err), pile: err?.stack || '', graine });
        }
      }
    });

    // Une fois tous les fichiers lus : ce qu'ils déclarent, et leurs erreurs.
    self.__fini = () => {
      delete self.__fichier;
      delete self.__fini;
      envoyer({
        t: 'charge',
        commandes: [...commandes].map(([nom, c]) => ({ nom, params: c.params, fichier: c.fichier, aide: c.aide })),
        formules: [...formules].map(([nom, f]) => ({ nom, fichier: f.fichier })),
        quand: [...reactions].flatMap(([moment, l]) => l.map((r) => ({ moment, fichier: r.fichier }))),
        erreurs: erreursChargement,
      });
    };
  }

  // =====================================================================================
  // Côté hôte (la page de Tafl ou de Saga).
  // =====================================================================================

  // Le texte du worker : le prélude, puis chaque fichier dans sa propre fonction. On note la ligne où
  // commence chaque fichier, pour dire « combat.js, ligne 12 » au lieu d'un numéro dans le tout.
  function fabriquer(fichiers) {
    const lignes = [`(${prelude.toString()})();`];
    const debuts = [];
    let n = lignes[0].split('\n').length;
    for (const f of fichiers) {
      const entete = `__fichier(${JSON.stringify(f.fichier)}, function (commande, formule, quand, des, donnees, console) { 'use strict';`;
      lignes.push(entete);
      n += 1;
      debuts.push({ fichier: f.fichier, debut: n + 1, fin: n + String(f.code).split('\n').length });
      lignes.push(String(f.code));
      n += String(f.code).split('\n').length;
      lignes.push('\n});');
      n += 2;
    }
    lignes.push('__fini();');
    return { source: lignes.join('\n'), debuts };
  }

  // Une ligne du worker → { fichier, ligne }.
  function situer(debuts, ligne) {
    const d = debuts.find((x) => ligne >= x.debut && ligne <= x.fin);
    return d ? { fichier: d.fichier, ligne: ligne - d.debut + 1 } : null;
  }
  // La première position d'un fichier de script dans une pile d'erreur.
  function lieuDansPile(debuts, pile) {
    for (const m of String(pile || '').matchAll(/blob:[^\s)]*?:(\d+):(\d+)/g)) {
      const s = situer(debuts, Number(m[1]));
      if (s) return { ...s, colonne: Number(m[2]) };
    }
    return null;
  }
  const lieuTexte = (l) => (l ? `${l.fichier.replace(/^scripts\//, '')}, ligne ${l.ligne}` : '');

  // Les données du jeu pour les scripts, sans les images (portraits, sprites : beaucoup de texte inutile).
  function sansImages(v, profondeur = 0) {
    if (profondeur > 12) return null;
    if (typeof v === 'string') return v.startsWith('data:') ? '' : v;
    if (Array.isArray(v)) return v.map((x) => sansImages(x, profondeur + 1));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, sansImages(x, profondeur + 1)]));
    return v;
  }

  // Un bac à sable : charge les fichiers, appelle leurs fonctions, répond à leurs demandes.
  //   fichiers : [{ fichier: 'scripts/x.js', code }]
  //   donnees  : les données du jeu (jeu.donnees de Saga, doc.data de Tafl)
  //   graine   : la graine du hasard de départ
  //   hote     : { demande(action, args, appel) → valeur (peut être async ; lancer BacASable.FIN pour
  //                arrêter le script), etat(appel) → { partie, carte, evenement, joueur },
  //                console({ niveau, texte, lieu }) , graine(n) }
  function creer({ fichiers = [], donnees = {}, graine = 1, hote = {} } = {}) {
    let worker = null, debuts = [], inventaire = { commandes: [], formules: [], quand: [], erreurs: [] };
    let pret = null, appels = new Map(), compteur = 0, graineCourante = graine | 0;
    let ping = null, dernierPong = 0, fini = false, resoudrePret = null;
    const fichiersOk = fichiers.filter((f) => NOM_FICHIER.test(f.fichier));
    let exclus = new Map(); // fichier → erreur de syntaxe

    function arreterPing() { if (ping) { clearInterval(ping); ping = null; } }
    function surveiller() {
      if (ping || fini) return;
      dernierPong = performance.now();
      ping = setInterval(() => {
        if (!worker) return;
        if (!appels.size && pret?.fait) { arreterPing(); return; }
        if (performance.now() - dernierPong > (pret?.fait ? LIMITE_MS : LIMITE_CHARGEMENT_MS)) { trop(); return; }
        worker.postMessage({ t: 'ping' });
      }, PING_MS);
    }
    // Le worker ne répond plus : on l'arrête, on rejette ce qui attendait, et on en recharge un neuf.
    function trop() {
      arreterPing();
      worker?.terminate();
      worker = null;
      // Pendant le chargement : un fichier boucle en dehors de toute fonction. On ne sait pas lequel,
      // alors on les coupe tous (le jeu tourne sans scripts) et on le dit.
      if (!pret.fait) {
        for (const f of fichiersOk) {
          if (!exclus.has(f.fichier)) exclus.set(f.fichier, { fichier: f.fichier, ligne: 0, message: 'Le chargement des scripts a pris trop de temps (une boucle sans fin en dehors d\'une fonction ?) : tous les scripts sont coupés' });
        }
        const r = resoudrePret;
        if (!fini) demarrer().then(r);
        return;
      }
      const err = new Error('il a calculé trop longtemps sans rendre la main (une boucle sans fin ?) : il a été arrêté');
      err.trop = true;
      for (const a of appels.values()) a.rejeter(err);
      appels.clear();
      if (!fini) demarrer();
    }

    function demarrer() {
      const actifs = fichiersOk.filter((f) => !exclus.has(f.fichier));
      const { source, debuts: d } = fabriquer(actifs);
      debuts = d;
      const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
      const w = new Worker(url);
      worker = w;
      let resoudre;
      pret = new Promise((r) => { resoudre = r; });
      resoudrePret = resoudre;
      pret.fait = false;
      w.onerror = (e) => {
        e.preventDefault?.();
        // Une erreur de syntaxe : on exclut ce fichier et on recharge les autres.
        const lieu = situer(debuts, Number(e.lineno) || 0);
        if (w !== worker) return;
        if (lieu && !exclus.has(lieu.fichier)) {
          exclus.set(lieu.fichier, { fichier: lieu.fichier, ligne: lieu.ligne, colonne: e.colno, message: String(e.message || 'Erreur de syntaxe').replace(/^Uncaught /, '') });
          w.terminate();
          URL.revokeObjectURL(url);
          worker = null;
          demarrer().then(resoudre);
          return;
        }
        hote.console?.({ niveau: 'erreur', texte: String(e.message || 'Erreur dans le bac à sable'), lieu });
      };
      w.onmessage = (e) => {
        if (w !== worker) return;
        dernierPong = performance.now();
        const m = e.data || {};
        if (m.t === 'pong') return;
        if (m.t === 'charge') {
          URL.revokeObjectURL(url);
          inventaire = {
            commandes: m.commandes || [], formules: m.formules || [], quand: m.quand || [],
            erreurs: [
              ...[...exclus.values()],
              ...(m.erreurs || []).map((x) => ({ ...x, ...(lieuDansPile(debuts, x.pile) || { fichier: x.fichier }) })),
            ],
          };
          pret.fait = true;
          resoudre(inventaire);
          return;
        }
        if (m.t === 'console') {
          hote.console?.({ niveau: m.niveau, texte: m.texte, lieu: lieuDansPile(debuts, m.pile) });
          return;
        }
        const a = appels.get(m.id);
        if (m.t === 'demande') {
          if (!a) return;
          // Les demandes d'un même appel se font dans l'ordre, l'une après l'autre.
          a.file = a.file.then(async () => {
            let valeur = null, erreur = null, finScript = false;
            try {
              valeur = await hote.demande?.(m.action, m.args, a);
            } catch (err) {
              if (err === FIN || err?.finScript) finScript = true;
              else erreur = err?.message || String(err);
            }
            if (finScript) a.finScript = true;
            if (worker !== w || !appels.has(m.id)) return;
            w.postMessage({ t: 'reponse', n: m.n, valeur: valeur === undefined ? null : valeur, erreur, fin: finScript, etat: hote.etat?.(a) || null });
            surveiller();
          });
          return;
        }
        if (!a) return;
        if (Number.isInteger(m.graine)) { graineCourante = m.graine; hote.graine?.(m.graine); }
        appels.delete(m.id);
        if (m.t === 'fin') a.resoudre({ valeur: m.valeur, finScript: Boolean(m.finScript || a.finScript) });
        else {
          const lieu = lieuDansPile(debuts, m.pile);
          const err = new Error(m.message);
          err.lieu = lieu;
          err.script = true;
          a.rejeter(err);
        }
      };
      w.postMessage({ t: 'graine', graine: graineCourante });
      w.postMessage({ t: 'donnees', donnees: sansImages(donnees) });
      surveiller();
      return pret;
    }

    // sorte : 'commande' | 'formule' | 'quand' ; contexte : ce que hote.demande et hote.etat recevront.
    async function appeler(sorte, nom, args = {}, contexte = {}) {
      if (fini) throw new Error('Le bac à sable est fermé');
      if (!worker) demarrer();
      await pret;
      const id = ++compteur;
      return new Promise((resoudre, rejeter) => {
        const a = { id, sorte, nom, contexte, resoudre, rejeter, file: Promise.resolve(), finScript: false };
        appels.set(id, a);
        let etat = null;
        try { etat = sorte === 'formule' ? null : hote.etat?.(a) || null; } catch { etat = null; }
        worker.postMessage({ t: 'appel', id, sorte, nom, args: JSON.parse(JSON.stringify(args ?? {})), etat });
        surveiller();
      });
    }

    demarrer();
    return {
      pret: () => pret,
      inventaire: () => inventaire,
      a: (sorte, nom) => (sorte === 'commande' ? inventaire.commandes : sorte === 'formule' ? inventaire.formules : inventaire.quand.map((q) => ({ nom: q.moment })))
        .some((x) => x.nom === nom),
      appeler,
      graine: () => graineCourante,
      regraine(n) { graineCourante = n | 0; worker?.postMessage({ t: 'graine', graine: graineCourante }); },
      fermer() { fini = true; arreterPing(); worker?.terminate(); worker = null; for (const a of appels.values()) a.rejeter(new Error('Le bac à sable est fermé')); appels.clear(); },
    };
  }

  // Lancer FIN depuis hote.demande : le script s'arrête là (un combat perdu, la commande « fin »).
  const FIN = Object.freeze({ finScript: true });

  return { creer, fabriquer, FIN, FORMULES, formulesDuPack, MOMENTS, TYPES_PARAM, NOM_FICHIER, lieuTexte, LIMITE_MS };
})();

if (typeof module !== 'undefined') module.exports = BacASable;
