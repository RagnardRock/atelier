// Le cœur de Saga : la boucle du jeu. 60 fois par seconde, il lit les touches (ou la manette),
// fait avancer le joueur, place la caméra, puis dessine la carte, les personnages et l'ambiance.
//
// Le dessin se fait à la VRAIE résolution du jeu (en pixels de tuile : 16 px par case pour un jeu
// façon GBA), dans un petit canvas, que la fenêtre agrandit ensuite d'un nombre ENTIER de fois sans
// lissage. C'est ce qui garde le pixel art net : chaque pixel du jeu devient un carré de 3×3, 4×4…
// pixels de l'écran, jamais un flou.

const Moteur = (() => {
  const { DIRECTIONS } = Jeu;
  const DUREE_PAS = 0.24;        // secondes pour une case en marchant
  const DUREE_PAS_COURSE = 0.13; // en courant
  const DUREE_SAUT = 0.42;       // un rebord : deux cases, en sautant
  const ATTENTE_TOUR = 0.09;     // une touche à peine touchée tourne le joueur sans le faire avancer
  const DUREE_FONDU = 0.22;      // fondu au noir des téléporteurs

  // --- Les commandes : clavier (flèches, ZQSD sur AZERTY / WASD sur QWERTY) et manette ---
  // On utilise la position physique des touches (event.code) : la touche Z d'un clavier AZERTY
  // s'appelle « KeyW », comme le W d'un clavier QWERTY au même endroit.
  // Saga 0.11 : le joueur les change dans les réglages (Commandes). Pause et carnet sont lus par app.js.
  const TOUCHES_DEFAUT = {
    haut: ['ArrowUp', 'KeyW'], bas: ['ArrowDown', 'KeyS'], gauche: ['ArrowLeft', 'KeyA'], droite: ['ArrowRight', 'KeyD'],
    action: ['Space', 'Enter', 'NumpadEnter', 'KeyE'], retour: ['Backspace', 'KeyX'], courir: ['ShiftLeft', 'ShiftRight'],
    pause: ['Escape'], carnet: ['Tab'],
  };
  // Les boutons de la manette (numéros de la « manette standard » : 0 A, 1 B, 2 X, 3 Y, 8 Select, 9 Start).
  // La croix et le stick gauche déplacent toujours.
  const MANETTE_DEFAUT = { action: [0], retour: [1], courir: [1, 2], pause: [9], carnet: [8] };
  const COMMANDES = ['haut', 'bas', 'gauche', 'droite', 'action', 'retour', 'courir', 'pause', 'carnet'];
  const DIRS = ['haut', 'bas', 'gauche', 'droite'];
  const liste = (v, def) => (Array.isArray(v) ? v : def);
  function commandes(touches, manette) {
    touches = touches || {}; manette = manette || {};
    const t = Object.fromEntries(COMMANDES.map((c) => [c, liste(touches[c], TOUCHES_DEFAUT[c]).filter((x) => typeof x === 'string')]));
    const m = Object.fromEntries(Object.keys(MANETTE_DEFAUT).map((c) => [c, liste(manette[c], MANETTE_DEFAUT[c]).map(Number).filter((x) => Number.isInteger(x) && x >= 0 && x < 20)]));
    return { touches: t, manette: m };
  }
  // Quelle commande pour cette touche (event.code) ? Les directions d'abord, puis action, retour…
  const commandeDe = (cmd, code) => COMMANDES.filter((c) => cmd.touches[c].includes(code));

  function creerEntrees() {
    let cmd = commandes();
    const tenues = []; // directions tenues, la dernière appuyée à la fin
    let course = false;
    let appuis = [];   // les touches appuyées depuis la dernière image : 'action', 'retour', 'haut'…
    let pad = null;    // ce que la manette tient en ce moment : { dir, course }
    const lacher = (dir) => { const i = tenues.indexOf(dir); if (i >= 0) tenues.splice(i, 1); };
    window.addEventListener('keydown', (e) => {
      if (e.target.closest?.('input, select, textarea, button, .modal')) return;
      const quoi = commandeDe(cmd, e.code);
      const dir = quoi.find((c) => DIRS.includes(c));
      if (dir) {
        e.preventDefault();
        appuis.push(dir);
        if (!e.repeat) { lacher(dir); tenues.push(dir); }
      }
      for (const action of quoi.filter((c) => c === 'action' || c === 'retour')) {
        if (!e.ctrlKey && !e.altKey) { e.preventDefault(); if (!e.repeat) appuis.push(action); }
      }
      // La touche de pause (Échap) : la pause (dans app.js), mais en combat c'est un Retour comme les autres.
      if ((quoi.includes('pause') || e.code === 'Escape') && !e.repeat) appuis.push('echap');
      if (quoi.includes('courir')) course = true;
    });
    window.addEventListener('keyup', (e) => {
      const quoi = commandeDe(cmd, e.code);
      for (const dir of quoi.filter((c) => DIRS.includes(c))) lacher(dir);
      if (quoi.includes('courir')) course = false;
    });
    // Fenêtre quittée (Alt+Tab) : on oublie tout, sinon le joueur continuerait de marcher tout seul.
    window.addEventListener('blur', () => { tenues.length = 0; course = false; appuis = []; });

    // Manette (Xbox, PlayStation, Switch Pro…) : croix directionnelle ou stick gauche pour bouger.
    // Bouton A : action, bouton B : retour (et courir, tenu). Lue à chaque image (sonder), même pendant
    // un dialogue ou un combat.
    let padAvant = {};
    function sonder() {
      pad = null;
      for (const p of navigator.getGamepads?.() || []) {
        if (!p) continue;
        const b = (i) => p.buttons[i]?.pressed;
        const un = (liste) => liste.some(b);
        const [ax, ay] = [p.axes[0] || 0, p.axes[1] || 0];
        let dir = null;
        if (b(12) || ay < -0.5) dir = 'haut';
        else if (b(13) || ay > 0.5) dir = 'bas';
        else if (b(14) || ax < -0.5) dir = 'gauche';
        else if (b(15) || ax > 0.5) dir = 'droite';
        const etat = { dir, a: un(cmd.manette.action), b: un(cmd.manette.retour) };
        if (etat.a && !padAvant.a) appuis.push('action');
        if (etat.b && !padAvant.b) appuis.push('retour');
        if (dir && dir !== padAvant.dir) appuis.push(dir);
        padAvant = etat;
        pad = { dir, course: un(cmd.manette.courir) };
        return;
      }
      padAvant = {};
    }
    return {
      sonder,
      lire() {
        return { dir: tenues[tenues.length - 1] || pad?.dir || null, course: course || Boolean(pad?.course) };
      },
      // Les appuis depuis la dernière fois (chacun n'est rendu qu'une fois).
      appuis() { const a = appuis; appuis = []; return a; },
      oublier() { tenues.length = 0; course = false; appuis = []; },
      regler(touches, manette) { cmd = commandes(touches, manette); tenues.length = 0; course = false; },
    };
  }

  function creer(canvas, rappels = {}) {
    const ctx = canvas.getContext('2d');
    const entrees = creerEntrees();
    const ambiance = Ambiance.creer();
    let options = { zoom: 0, casesVisibles: 11, courirParDefaut: false, meteo: true, volumeMusique: 70, volumeSons: 80, vitesseTexte: 'normale' };
    // Le son (Saga 0.11) : la musique des cartes et des combats, les bruitages, la pluie et le tonnerre.
    const audio = Son.creer({ charger: (chemin) => rappels.chargerSon?.(chemin) ?? Promise.reject(new Error('pas de sons')) });
    audio.onErreur((m) => rappels.message?.(m));
    const reglagesAudio = () => jeu?.donnees.reglages?.reglages?.audio || {};
    const bruit = (nom) => audio.son(nom, reglagesAudio().sons?.[nom] || '');
    let jeu = null, partie = null, carte = null, presents = [];
    let joueur = null;
    let cam = { x: 0, y: 0 };
    let W = 320, H = 180, zoom = 1;
    let fondu = null, noir = 0;
    let enPause = false, debug = false, boucle = 0, avant = 0;
    let fps = 0, images = 0, chrono = 0;
    // Les événements (Saga 0.2) : la boîte de dialogue, le script en cours, les pauses des scripts.
    const dialogue = Dialogue.creer(canvas.parentElement, { sons: bruit });
    let scripts = null, enScript = false, autoAFaire = false;
    // Les scripts JS du jeu (Saga 0.12, scripts-js.js) et les moments qu'ils attendent de voir passer
    // (une carte, un combat fini…), joués dès que le joueur est libre.
    let scriptsJs = ScriptsJs.AUCUN, reactions = [];
    const signaler = (texte) => (rappels.erreurScript || rappels.message)?.(texte);
    const reagir = (moment, infos = {}) => { if (scriptsJs.actif) reactions.push({ moment, infos }); };
    let attentes = []; // [{ reste, resoudre }] : la commande « attendre »
    let actionDemandee = false;
    // Les combats (Saga 0.3) : leur écran, posé sur le jeu comme la boîte de dialogue.
    const ecranCombat = EcranCombat.creer(canvas.parentElement);
    // Saga 0.8 : l'écran des combats en groupe (pack JRPG). Le pack de règles du jeu choisit le sien.
    const ecranGroupe = EcranGroupe.creer(canvas.parentElement);
    const ecranDuJeu = () => (jeu && Regles.ecran(jeu) === 'groupe' ? ecranGroupe : ecranCombat);
    const ecranPerso = Personnaliser.creer(canvas.parentElement);
    const menus = Menus.creer(canvas.parentElement);
    // Saga 0.13 : le plateau de dés (pack JDR), au-dessus de tout le reste, prêté aux combats en groupe et
    // aux menus hors combat (ui.des).
    const ecranDes = EcranDes.creer(canvas.parentElement);
    ecranGroupe.des = (o) => ecranDes.montrer(o);
    let enCombat = false, debutAFaire = false;
    let ecrans = null; // l'équipe, le Pokédex, le PC (Saga 0.6, ecrans.js)

    // --- Taille : le plus grand zoom entier qui montre au moins `casesVisibles` cases en hauteur ---
    function redimensionner() {
      const parent = canvas.parentElement;
      const dpr = window.devicePixelRatio || 1;
      const lw = Math.max(1, Math.floor(parent.clientWidth * dpr)), lh = Math.max(1, Math.floor(parent.clientHeight * dpr));
      const taille = jeu?.taille || 16;
      zoom = options.zoom > 0 ? options.zoom : Math.max(1, Math.floor(lh / (options.casesVisibles * taille)));
      W = Math.ceil(lw / zoom);
      H = Math.ceil(lh / zoom);
      canvas.width = W;
      canvas.height = H;
      canvas.style.width = `${(W * zoom) / dpr}px`;
      canvas.style.height = `${(H * zoom) / dpr}px`;
      ambiance.taille(W, H);
    }

    // --- Cartes ---
    function entrerSur(idCarte, x, y, direction) {
      const nouvelle = jeu.cartes.get(idCarte);
      if (!nouvelle) {
        rappels.message?.(`Téléporteur vers une carte qui n'existe pas : « ${idCarte} »`);
        return false;
      }
      const change = nouvelle !== carte;
      const depuis = carte?.id || '';
      carte = nouvelle;
      // Un arbre qui « repousse » (Saga 0.7) est de nouveau là quand le joueur revient sur la carte.
      if (change) for (const ev of carte.evenements) if (Monde.obstacle(ev)?.repousse) delete partie.locaux[`${carte.id}/${ev.id}`];
      joueur = {
        x: Math.min(carte.largeur - 1, Math.max(0, Number(x) || 0)),
        y: Math.min(carte.hauteur - 1, Math.max(0, Number(y) || 0)),
        dir: DIRECTIONS[direction] ? direction : 'bas',
        mouvement: null, pas: 0, attente: 0, pietine: 0,
      };
      partie.position = { carte: carte.id, x: joueur.x, y: joueur.y, direction: joueur.dir };
      presents = Monde.evenementsPresents(jeu, carte, partie);
      ambiance.regler(carte.ambiance);
      lumieresCarte = null;
      placerCamera();
      if (change) {
        sonCarte();
        rappels.carte?.(carte);
        // La sauvegarde auto (Saga 0.11) : app.js la fait dès que le joueur est libre.
        rappels.carteChangee?.(carte);
        reagir('carte', { carte: carte.id, depuis });
      }
      // Les événements « auto » de cette carte se joueront dès la fin du fondu.
      autoAFaire = true;
      return true;
    }

    // partieGardee : une partie déjà commencée (une sauvegarde, ou F5 qui recharge le jeu sans
    // perdre ce que le joueur a fait). depart : où commencer, à la place de la position de la partie.
    // test : l'état de départ d'un test rapide de Tafl (Saga 0.10), posé sur une partie neuve.
    function demarrer(nouveauJeu, depart, partieGardee = null, test = null) {
      jeu = nouveauJeu;
      partie = partieGardee ? { ...Monde.nouvellePartie(jeu), ...partieGardee } : Monde.nouvellePartie(jeu, depart || jeu.depart);
      if (partieGardee && depart) partie.position = { ...depart };
      // Ce que le pack de règles lit du joueur (Saga 0.8) : son nom et sa tenue (le héros du groupe JRPG).
      Object.defineProperty(jeu, 'joueur', { configurable: true, get: () => ({ nom: partie?.nom || '', tenue: partie?.tenue || '' }) });
      // Une partie toute neuve : le pack la prépare (le héros principal rejoint le groupe JRPG).
      if (!partieGardee) Regles.nouvellePartie(jeu, partie);
      // Les créatures d'une sauvegarde : complétées (une partie de Saga 0.2 n'avait que l'espèce et le niveau).
      // Saga 0.6 : les boîtes du PC et le Pokédex (une partie de Saga 0.5 avait une seule « boite »).
      Collection.preparer(jeu, partie);
      if (!partieGardee && test) appliquerTest(test);
      // Saga 0.13 : les conditions du pack (jdr_perception…), la vitesse des dés, et ce que le pack fait au
      // début d'une nouvelle partie (la création des personnages du pack JDR), dès que le joueur est libre.
      Monde.brancherConditions((cond, p) => Regles.condition(jeu, cond, p));
      ecranDes.vitesse(jeu.donnees.reglages?.reglages?.jdr?.animation_des || 'normale');
      ecranDes.cacher();
      debutAFaire = !partieGardee;
      // Saga 0.12 : les variables du jeu, et la graine du hasard des scripts (gardée dans la sauvegarde :
      // mêmes jets de dés, même résultat).
      partie.variables = { ...Monde.variablesDeDepart(jeu), ...(partie.variables && typeof partie.variables === 'object' ? partie.variables : {}) };
      if (!Number.isInteger(partie.graine)) partie.graine = Math.floor(Math.random() * 2147483647);
      enCombat = false;
      ecranCombat.fermer();
      ecranGroupe.fermer();
      ecranPerso.fermer();
      menus.fermer();
      // L'horloge du jeu (Saga 0.11) : une partie d'avant Saga 0.11 part de l'heure de départ du jeu.
      Temps.utiliser(jeu);
      Temps.preparer(jeu, partie);
      if (nouveauJeu !== jeuSons) { audio.vider(); jeuSons = nouveauJeu; }
      for (const k of ['musique_combat', 'musique_dresseur', 'musique_victoire']) audio.precharger(reglagesAudio()[k]);
      // Les badges (Tafl 0.16) : le compteur vaut toujours le nombre de badges différents reçus.
      partie.badges = [...new Set(Array.isArray(partie.badges) ? partie.badges : [])];
      partie.partis = partie.partis && typeof partie.partis === 'object' ? partie.partis : {};
      partie.compteurs = { ...Monde.nouvellePartie(jeu).compteurs, ...partie.compteurs, badges: partie.badges.length };
      carte = null;
      enScript = false;
      attentes = [];
      dialogue.fermer();
      ecrans = Ecrans.creer({ jeu, partie: () => partie, menus, ui: () => scripts.ui });
      scripts = Scripts.creer({
        jeu, dialogue,
        partie: () => partie,
        carte: () => carte,
        attendre: (ms) => new Promise((resoudre) => attentes.push({ reste: ms / 1000, resoudre })),
        teleporter: (c, x, y, d) => new Promise((resoudre) => { fondu = { phase: 'sortie', t: 0, vers: { carte: c, x, y, direction: d }, resoudre }; }),
        combattre,
        // L'écran du nom et de la tenue (commande personnaliser, Tafl 0.16).
        personnaliser: (o) => ecranPerso.ouvrir(o),
        menus,
        ecrans,
        position: () => ({ carte: carte.id, x: joueur.x, y: joueur.y, direction: joueur.dir }),
        // Saga 0.11 : la musique, les bruitages et l'heure (commandes musique, son, heure).
        musique: (chemin) => changerMusique(chemin === '' ? carte.ambiance.musique || partie.musique : chemin),
        son: (chemin) => audio.fichier(chemin),
        heure: (o) => { const ok = Temps.regler(jeu, partie, o); momentsAvant = ''; return ok; },
        // Saga 0.12 : le bloc Script (une commande écrite en JavaScript par le jeu).
        scriptsJs: () => scriptsJs,
        // Saga 0.13 : le plateau de dés (pack JDR).
        des: (o) => ecranDes.montrer(o),
        signaler,
      });
      scriptsJs.fermer();
      reactions = [];
      momentPrincipal = '';
      scriptsJs = ScriptsJs.creer({
        jeu,
        partie: () => partie,
        lieu: () => ({
          carte: carte ? { id: carte.id, nom: carte.nom } : null,
          joueur: joueur ? { nom: partie.nom, x: joueur.x, y: joueur.y, direction: joueur.dir } : { nom: partie.nom },
        }),
        jouer: (c, ev, profondeur) => scripts.une(c, ev, profondeur),
        choisir: (options) => dialogue.choisir(options),
        annoncer: (titre, texte) => dialogue.annoncer(titre, texte),
        signaler,
      });
      if (!partieGardee) reagir('nouvelle_partie');
      redimensionner();
      const d = partie.position;
      if (!entrerSur(d.carte, d.x, d.y, d.direction)) entrerSur(jeu.depart.carte, jeu.depart.x, jeu.depart.y, jeu.depart.direction);
      noir = 1;
      fondu = { phase: 'entree', t: 0 };
      if (!boucle) { avant = performance.now(); boucle = requestAnimationFrame(tour); }
    }

    // Un test rapide (Tafl 0.27, FORMAT.md › Test rapide) : l'équipe, les objets, l'argent, les badges,
    // les interrupteurs et les quêtes choisis dans Tafl, sur une partie toute neuve. Ce qui n'est pas
    // donné reste comme dans une nouvelle partie (une équipe vide garde le héros du groupe JRPG).
    function appliquerTest(test) {
      const membres = (Array.isArray(test.equipe) ? test.equipe : []).filter((m) => m && typeof m.id === 'string' && m.id);
      if (membres.length) {
        partie.equipe = [];
        const groupe = Regles.capacites(jeu).groupe;
        for (const m of membres) {
          const niveau = Math.max(1, Math.round(Number(m.niveau) || 5));
          const c = groupe ? Regles.rejoindre(jeu, partie, m.id, niveau) : Regles.existe(jeu, m.id) ? Regles.creer(jeu, m.id, niveau) : null;
          if (c) Collection.ranger(jeu, partie, c);
          else rappels.message?.(`Test rapide : « ${m.id} » n'existe pas dans les données du jeu.`);
        }
      }
      if (test.objets && typeof test.objets === 'object') {
        for (const [id, n] of Object.entries(test.objets)) if (Number(n) > 0) partie.sac[id] = Math.round(Number(n));
      }
      if (Number.isFinite(Number(test.argent)) && test.argent !== null && test.argent !== '') partie.argent = Math.max(0, Math.round(Number(test.argent)));
      if (Array.isArray(test.badges)) partie.badges = test.badges.filter((b) => typeof b === 'string');
      // Saga 0.11 : l'heure de l'horloge du jeu (pour essayer une scène de nuit).
      if (test.heure !== null && test.heure !== undefined && Number.isFinite(Number(test.heure))) Temps.regler(jeu, partie, { heures: Number(test.heure) });
      if (Array.isArray(test.interrupteurs)) for (const id of test.interrupteurs) if (typeof id === 'string') partie.interrupteurs[id] = true;
      if (test.quetes && typeof test.quetes === 'object') {
        for (const [id, q] of Object.entries(test.quetes)) {
          if (q?.etat === 'finie') partie.quetes[id] = { etat: 'finie', etape: Math.max(0, Number(q.etape) || 0) };
          else if (q?.etat === 'en_cours') partie.quetes[id] = { etat: 'en_cours', etape: Math.max(1, Number(q.etape) || 1) };
        }
      }
    }

    function arreter() {
      cancelAnimationFrame(boucle);
      boucle = 0;
      scriptsJs.fermer();
      scriptsJs = ScriptsJs.AUCUN;
      reactions = [];
      jeu = null;
      ecranDes.cacher();
      audio.vider();
      jeuSons = null;
    }

    // --- Le son de la carte (Saga 0.11) ---
    let jeuSons = null;
    // La musique : 'aucune' = silence ; un fichier = ce morceau ; null = on ne change rien.
    function changerMusique(chemin) {
      if (!chemin) return;
      partie.musique = chemin === 'aucune' ? null : chemin;
      audio.musique(partie.musique);
    }
    function sonCarte() {
      const a = carte.ambiance;
      // Une carte sans musique choisie garde celle qui joue (ou celle de la partie chargée).
      changerMusique(a.musique || (audio.morceau ? '' : partie.musique));
      sonFond();
    }
    // Le fond sonore : celui de la carte, sinon la pluie intégrée s'il pleut (et si la météo est montrée).
    function sonFond() {
      const a = carte.ambiance;
      const pluie = options.meteo && (a.meteo === 'pluie' || a.meteo === 'orage') ? a.meteo : null;
      const cle = a.fond_sonore === 'aucun' ? null : a.fond_sonore || pluie;
      const force = (a.volume_fond / 100) * (cle === pluie && !a.fond_sonore ? 0.35 + 0.65 * a.intensite / 100 : 1);
      audio.fond(cle, force);
    }

    // --- Le joueur ---
    function pixelsJoueur() {
      const t = jeu.taille;
      const m = joueur.mouvement;
      if (!m) return { x: joueur.x * t, y: joueur.y * t, saut: 0 };
      const k = Math.min(1, m.t / m.duree);
      // Arrondi ICI, une seule fois : la caméra et le dessin partent du même pixel entier. Sinon les
      // deux arrondis (caméra, puis joueur) se contredisent d'un pixel d'une image à l'autre et le
      // joueur tremble pendant qu'il marche (surtout de côté, sur un écran de largeur impaire).
      const x = Math.round((m.de.x + (m.vers.x - m.de.x) * k) * t), y = Math.round((m.de.y + (m.vers.y - m.de.y) * k) * t);
      return { x, y, saut: m.saut ? Math.round(Math.sin(k * Math.PI) * t * 0.55) : 0 };
    }

    function essayerPas(dir, course) {
      joueur.dir = dir;
      const d = Monde.destination(carte, partie, presents, joueur.x, joueur.y, dir);
      if (!d) {
        // Se cogner contre un événement « toucher » qui bloque (un PNJ qui arrête le joueur) le lance.
        const [dx, dy] = DIRECTIONS[dir];
        const p = Monde.presentEn(presents, joueur.x + dx, joueur.y + dy);
        if (p && p.bloque && joueur.pietine === 0 && Monde.obstacle(p.ev)?.sorte === 'pousser') pousser(p, dir);
        else if (p && p.bloque && p.ev.declenchement === 'toucher' && joueur.pietine === 0) lancer(p);
        // Contre un mur : un petit « bonk », puis un toutes les demi-secondes tant qu'il pousse.
        else if (joueur.pietine === 0 || joueur.pietine >= joueur.prochainChoc) { bruit('choc'); joueur.prochainChoc = joueur.pietine + 0.5; }
        return false;
      }
      joueur.pietine = 0;
      joueur.pas++;
      joueur.mouvement = {
        de: { x: joueur.x, y: joueur.y }, vers: { x: d.x, y: d.y }, t: 0, saut: d.saut,
        duree: d.saut ? DUREE_SAUT : course ? DUREE_PAS_COURSE : DUREE_PAS,
      };
      return true;
    }

    function arrive() {
      const m = joueur.mouvement;
      joueur.x = m.vers.x;
      joueur.y = m.vers.y;
      joueur.mouvement = null;
      partie.compteurs.pas++;
      Regles.marcher(jeu, partie); // Saga 0.7 : l'amitié qui monte en marchant (pack Pokémon)
      partie.position = { carte: carte.id, x: joueur.x, y: joueur.y, direction: joueur.dir };
      if (scriptsJs.ecoute('pas')) reagir('pas', { x: joueur.x, y: joueur.y });
      // Un événement « toucher » sous les pieds (une case invisible qui lance une scène).
      const p = Monde.presentEn(presents, joueur.x, joueur.y);
      if (p && p.ev.declenchement === 'toucher' && !p.bloque) {
        lancer(p);
        return true;
      }
      // Un téléporteur sous les pieds : fondu au noir, puis la carte d'arrivée.
      const tp = Monde.teleporteur(carte, joueur.x, joueur.y);
      if (tp) {
        fondu = { phase: 'sortie', t: 0, vers: tp.vers };
        bruit('porte');
        return true;
      }
      // Les hautes herbes (ou l'eau, une grotte…) : une créature sauvage peut surgir.
      return rencontre();
    }

    // --- Les combats ---
    // Le décor du combat : celui de la zone où est le joueur (herbes, eau, grotte), ou de la carte.
    function fondCombat() {
      const z = Monde.zonesEn(carte, joueur.x, joueur.y).find((q) => ['herbes', 'eau', 'grotte'].includes(q.type));
      return z ? z.type : carte.interieur ? 'interieur' : 'herbes';
    }
    function rencontre() {
      const zone = Monde.zonesEn(carte, joueur.x, joueur.y).find((z) => z.rencontres.length);
      if (!zone || !partie.equipe.some((c) => c.pv > 0)) return false;
      if (partie.repousse > 0) {
        partie.repousse--;
        if (!partie.repousse) dialogue.annoncer('Repousse', 'Ses effets se dissipent.');
        return false;
      }
      if (Math.random() * 100 >= zone.taux) return false;
      // Ce qu'on rencontre : le pack de règles tire une créature (Pokémon) ou un groupe de monstres (JRPG).
      const adversaires = Regles.rencontre(jeu, zone, partie);
      if (!adversaires) return false;
      (async () => {
        enScript = true;
        await combattre(adversaires);
        presents = Monde.evenementsPresents(jeu, carte, partie, presents);
        enScript = false;
        entrees.oublier();
      })();
      return true;
    }
    // Un combat (une rencontre, ou les commandes combat_sauvage et combat_dresseur des scripts).
    // Rend l'issue : 'victoire', 'defaite', 'fuite' ou 'capture'. Après une défaite, le joueur se
    // réveille au dernier endroit où il s'est soigné (sinon au départ du jeu), son équipe soignée.
    async function combattre({ sauvage = null, dresseur = null, groupe = null }) {
      enCombat = true;
      entrees.oublier();
      dialogue.fermer();
      // La musique du combat (Saga 0.11) : celle des dresseurs pour un dresseur, sinon celle des combats.
      const ra = reglagesAudio(), avant = partie.musique;
      const morceau = Jeu.son(dresseur ? ra.musique_dresseur || ra.musique_combat : ra.musique_combat);
      if (morceau) audio.musique(morceau, { fondu: 0.4 });
      let issue = 'fuite';
      try {
        ({ issue } = await Regles.combattre({ jeu, partie, ui: ecranDuJeu(), sauvage, dresseur, groupe, fond: fondCombat() }));
      } catch (err) {
        ecranDuJeu().fermer();
        rappels.message?.(`Erreur pendant le combat : ${err.message}`);
      }
      enCombat = false;
      entrees.oublier();
      if (morceau) {
        // Gagné : la fanfare de victoire (jouée une fois), puis la musique de la carte revient.
        const fanfare = issue === 'victoire' || issue === 'capture' ? Jeu.son(ra.musique_victoire) : '';
        const retour = () => { if (jeu && enCombat === false && (audio.morceau === fanfare || audio.morceau === morceau)) audio.musique(partie.musique); };
        if (fanfare) audio.musique(fanfare, { fondu: 0.3, boucle: false }).then(retour);
        else audio.musique(avant, { fondu: 0.8 });
      }
      Collection.noterTout(partie); // une évolution en combat : une nouvelle espèce au Pokédex
      if (scriptsJs.ecoute('apres_combat')) reagir('apres_combat', { issue, sorte: dresseur ? 'dresseur' : groupe ? 'groupe' : 'sauvage' });
      if (sauvage && issue === 'victoire') partie.compteurs.sauvages_battus = (partie.compteurs.sauvages_battus || 0) + 1;
      if (issue === 'defaite') {
        for (const c of partie.equipe) Regles.soigner(jeu, c);
        const d = partie.dernierSoin && jeu.cartes.has(partie.dernierSoin.carte) ? partie.dernierSoin : jeu.depart;
        noir = 1;
        await new Promise((resoudre) => { fondu = { phase: 'sortie', t: DUREE_FONDU, vers: { ...d, direction: d.direction || 'bas' }, resoudre }; });
        dialogue.annoncer('Tu te réveilles…', 'Ton équipe est soignée.');
      }
      return issue;
    }

    function avancerJoueur(dt) {
      const libre = !enPause && !fondu && !enScript && !enCombat;
      const { dir, course: maj } = libre ? entrees.lire() : { dir: null, course: false };
      const course = options.courirParDefaut ? !maj : maj;
      if (joueur.mouvement) {
        joueur.mouvement.t += dt;
        if (joueur.mouvement.t < joueur.mouvement.duree) return;
        const reste = joueur.mouvement.t - joueur.mouvement.duree;
        if (arrive()) return;
        // La touche est toujours tenue : on enchaîne la case suivante sans s'arrêter.
        if (dir && essayerPas(dir, course)) joueur.mouvement.t = Math.min(reste, joueur.mouvement.duree * 0.5);
        return;
      }
      if (!dir) joueur.pietine = 0;
      // Action : parler à celui qui est devant, ouvrir le coffre, lire le panneau.
      if (libre && actionDemandee) {
        actionDemandee = false;
        const [dx, dy] = DIRECTIONS[joueur.dir];
        const p = Monde.presentEn(presents, joueur.x + dx, joueur.y + dy) || Monde.presentEn(presents, joueur.x, joueur.y);
        if (p && Monde.obstacle(p.ev)) { franchir(p); return; }
        if (p && p.ev.declenchement === 'parler') { lancer(p); return; }
      }
      if (!dir) { joueur.attente = 0; return; }
      if (dir !== joueur.dir && joueur.attente === 0) {
        joueur.dir = dir;
        joueur.attente = ATTENTE_TOUR;
        return;
      }
      if (joueur.attente > 0) {
        joueur.attente = Math.max(1e-6, joueur.attente - dt);
        if (joueur.attente > 1e-6) return;
      }
      if (!essayerPas(dir, course)) joueur.pietine += dt;
    }

    // --- Les événements ---
    // Jouer la page active d'un événement. Le joueur ne bouge plus jusqu'à la fin.
    async function lancer(p) {
      if (enScript || !p.page?.commandes?.length) return;
      enScript = true;
      entrees.oublier();
      // Celui à qui on parle se tourne vers le joueur (sauf s'il est « fixe »).
      if (p.ev.deplacement !== 'fixe' && p.ev.declenchement === 'parler') p.direction = Monde.directionVers(p.x, p.y, joueur.x, joueur.y);
      try {
        await scripts.executer(p.page.commandes, p.ev);
      } catch (err) {
        rappels.message?.(`Erreur dans le script de « ${p.ev.nom || p.ev.id} » : ${err.message}`);
      }
      Collection.noterTout(partie);
      // Le script a pu changer des interrupteurs : chaque événement reprend sa bonne page.
      presents = Monde.evenementsPresents(jeu, carte, partie, presents);
      enScript = false;
      entrees.oublier();
    }

    // --- Les obstacles (Saga 0.7) : les objets qui remplacent les CS ---
    const nomObjet = (id) => (jeu.donnees.objets?.objets || []).find((o) => o.id === id)?.nom || id;
    // Action devant un obstacle : couper l'arbre, briser le rocher (avec l'objet, après une question),
    // ou dire comment pousser le rocher. Après le passage, le script de sa page se joue (un objet caché…).
    async function franchir(p) {
      if (enScript) return;
      const o = Monde.obstacle(p.ev);
      const a = (o.objet && (partie.sac[o.objet] || 0) > 0);
      const nom = nomObjet(o.objet);
      const dire = (t) => dialogue.dire({}, t);
      enScript = true;
      entrees.oublier();
      try {
        const defaut = {
          couper: 'Ce petit arbre a l\'air fragile.', briser: 'Ce rocher est fissuré de partout.', pousser: 'Un gros rocher, bien lourd.',
        }[o.sorte];
        await dire(o.message || defaut);
        if (!o.objet) { /* rien à faire de plus : un obstacle sans objet ne s'ouvre pas */ }
        else if (!a) await dire(o.sorte === 'pousser' ? `Avec ${nom}, tu pourrais le pousser.` : `Avec ${nom}, tu pourrais ${o.sorte === 'couper' ? 'le couper' : 'le briser'}.`);
        else if (o.sorte === 'pousser') await dire(`Grâce à ${nom}, tu peux le pousser : marche contre lui.`);
        else if (await dialogue.choisir([`Utiliser ${nom}`, 'Laisser']) === 0) {
          await dire(o.sorte === 'couper' ? `Tu utilises ${nom} : l'arbre est coupé !` : `Tu utilises ${nom} : le rocher vole en éclats !`);
          partie.locaux[`${carte.id}/${p.ev.id}`] = true;
          dialogue.fermer();
          if (p.page?.commandes?.length) await scripts.executer(p.page.commandes, p.ev);
        }
      } catch (err) {
        rappels.message?.(`Erreur sur l'obstacle « ${p.ev.nom || p.ev.id} » : ${err.message}`);
      }
      dialogue.fermer();
      Collection.noterTout(partie);
      presents = Monde.evenementsPresents(jeu, carte, partie, presents);
      enScript = false;
      entrees.oublier();
    }
    // Pousser un rocher d'une case (le joueur marche contre lui en ayant l'objet). Il ne va pas sur une
    // case bloquée, un rebord, un téléporteur, ni sur quelqu'un. S'il s'arrête sur un déclencheur
    // (« toucher », traversable), celui-ci se lance : un interrupteur au sol pour une énigme.
    function pousser(p, dir) {
      const o = Monde.obstacle(p.ev);
      if (p.mouvement || !o.objet || !((partie.sac[o.objet] || 0) > 0)) return;
      const autres = presents.filter((q) => q !== p);
      const d = Monde.destination(carte, partie, autres, p.x, p.y, dir, [{ x: joueur.x, y: joueur.y }]);
      if (!d || d.saut || Monde.code(carte, d.x, d.y) === Jeu.PASSAGE.bloque || Monde.teleporteur(carte, d.x, d.y)) return;
      const t = jeu.taille;
      p.mouvement = { de: { x: p.x * t, y: p.y * t }, t: 0, duree: DUREE_PAS * 1.6 };
      p.x = d.x;
      p.y = d.y;
      const sous = autres.find((q) => q.x === d.x && q.y === d.y && !q.bloque && q.ev.declenchement === 'toucher');
      if (sous) setTimeout(() => { if (jeu && presents.includes(sous)) lancer(sous); }, DUREE_PAS * 1600);
    }

    // Les moments vus par les scripts JS (Saga 0.12), l'un après l'autre. Comme un script d'événement :
    // le joueur ne bouge pas pendant ce temps (c'est très court s'ils ne demandent rien).
    async function lancerReactions() {
      enScript = true;
      try {
        while (reactions.length && jeu) {
          const r = reactions.shift();
          await scriptsJs.quand(r.moment, r.infos);
        }
      } finally {
        dialogue.fermer();
        if (jeu && carte) {
          Collection.noterTout(partie);
          presents = Monde.evenementsPresents(jeu, carte, partie, presents);
        }
        enScript = false;
        entrees.oublier();
      }
    }

    // Saga 0.13 : le début d'une nouvelle partie selon le pack (pack JDR : créer ses personnages), avant
    // les scènes « auto » et les réactions des scripts.
    async function lancerDebut() {
      debutAFaire = false;
      enScript = true;
      entrees.oublier();
      try {
        await Regles.debut({ jeu, partie, ui: scripts.ui, ranger: (c) => Collection.ranger(jeu, partie, c) });
      } catch (err) {
        rappels.message?.(`Erreur au début de la partie : ${err.message}`);
      } finally {
        menus.fermer();
        dialogue.fermer();
        if (jeu && carte) {
          Collection.noterTout(partie);
          presents = Monde.evenementsPresents(jeu, carte, partie, presents);
        }
        enScript = false;
        entrees.oublier();
      }
    }

    // Les événements « auto » de la carte, l'un après l'autre (une scène d'arrivée).
    async function lancerAuto() {
      autoAFaire = false;
      for (const p of presents.filter((q) => q.ev.declenchement === 'auto')) {
        const actuel = presents.find((q) => q.ev === p.ev);
        if (actuel) await lancer(actuel);
        if (autoAFaire) return; // un script a changé de carte : la nouvelle carte a ses propres scènes
      }
    }

    // Les PNJ qui bougent : « aleatoire » marche au hasard à deux cases au plus de sa place,
    // « tourne » regarde autour de lui.
    function avancerPNJ(dt) {
      const t = jeu.taille;
      for (const p of presents) {
        if (p.mouvement) {
          p.mouvement.t += dt;
          if (p.mouvement.t >= p.mouvement.duree) p.mouvement = null;
          continue;
        }
        if (enScript || (p.ev.deplacement !== 'aleatoire' && p.ev.deplacement !== 'tourne')) continue;
        p.attente -= dt;
        if (p.attente > 0) continue;
        p.attente = 1.2 + Math.random() * 2.8;
        const dirs = Object.keys(DIRECTIONS);
        const dir = dirs[Math.floor(Math.random() * 4)];
        p.direction = dir;
        if (p.ev.deplacement !== 'aleatoire') continue;
        const [dx, dy] = DIRECTIONS[dir];
        if (Math.abs(p.x + dx - p.ev.x) > 2 || Math.abs(p.y + dy - p.ev.y) > 2) continue;
        const prises = [{ x: joueur.x, y: joueur.y }, ...(joueur.mouvement ? [joueur.mouvement.vers] : [])];
        const autres = presents.filter((q) => q !== p);
        const d = Monde.destination(carte, partie, autres, p.x, p.y, dir, prises);
        if (!d || d.saut || Monde.teleporteur(carte, d.x, d.y)) continue;
        // Il prend tout de suite sa nouvelle case (personne d'autre ne peut y entrer) et y glisse.
        p.pas++;
        p.mouvement = { de: { x: p.x * t, y: p.y * t }, t: 0, duree: DUREE_PAS * 1.4 };
        p.x = d.x;
        p.y = d.y;
      }
    }

    // --- La caméra suit le joueur, sans sortir de la carte (une petite carte est centrée) ---
    function placerCamera() {
      if (!joueur) return;
      const t = jeu.taille, p = pixelsJoueur();
      const lw = carte.largeur * t, lh = carte.hauteur * t;
      const cx = p.x + Math.floor(t / 2) - Math.floor(W / 2), cy = p.y + Math.floor(t / 2) - Math.floor(H / 2);
      cam.x = Math.round(lw <= W ? (lw - W) / 2 : Math.min(lw - W, Math.max(0, cx)));
      cam.y = Math.round(lh <= H ? (lh - H) / 2 : Math.min(lh - H, Math.max(0, cy)));
    }

    // --- Dessin ---
    function dessinerCalque(calque, maintenant) {
      const t = jeu.taille;
      // Parallaxe : un calque à 0,5 défile deux fois moins vite que la carte, un calque à 0 reste fixe.
      // Le point de référence est le coin de la carte : à parallaxe 1, tout tombe juste.
      const ox = Math.round(cam.x * calque.parallaxe.x), oy = Math.round(cam.y * calque.parallaxe.y);
      const x0 = Math.max(0, Math.floor(ox / t)), y0 = Math.max(0, Math.floor(oy / t));
      const x1 = Math.min(carte.largeur - 1, Math.floor((ox + W) / t)), y1 = Math.min(carte.hauteur - 1, Math.floor((oy + H) / t));
      ctx.globalAlpha = calque.opacite;
      ctx.globalCompositeOperation = calque.fusion;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const n = calque.cases[y * carte.largeur + x];
          if (n < 0) continue;
          const tuile = jeu.tuiles[n];
          if (!tuile) continue;
          // Tuile animée : toutes partagent la même horloge (toute l'eau ondule ensemble).
          const img = tuile.images.length > 1 ? tuile.images[Math.floor(maintenant / tuile.duree) % tuile.images.length] : tuile.images[0];
          ctx.drawImage(jeu.planche, img.sx, img.sy, t, t, x * t - ox, y * t - oy, t, t);
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    function dessinerTuile(n, x, y, maintenant) {
      const tuile = jeu.tuiles[n];
      if (!tuile) return;
      const img = tuile.images.length > 1 ? tuile.images[Math.floor(maintenant / tuile.duree) % tuile.images.length] : tuile.images[0];
      ctx.drawImage(jeu.planche, img.sx, img.sy, jeu.taille, jeu.taille, x, y, jeu.taille, jeu.taille);
    }

    // Un personnage sur sa case (x, y : le coin haut gauche, à l'écran) : la tuile de l'événement,
    // sinon le sprite du personnage, sinon sa tuile, sinon le petit bonhomme à sa couleur.
    // pas : 0 debout, sinon le n° du pas en cours (pour l'image de marche).
    function dessinerCorps({ tuile = -1, perso, couleur, direction, pas, x, y, hy = y, ombre = 1 }, maintenant) {
      const t = jeu.taille;
      if (tuile >= 0) { dessinerTuile(tuile, x, hy, maintenant); return; }
      Sprites.ombre(ctx, x, y, t, ombre);
      if (perso?.sprite) Sprites.dessinerSprite(ctx, perso.sprite, direction, pas, x, hy, t);
      else if (perso?.tuile >= 0) dessinerTuile(perso.tuile, x, hy, maintenant);
      else Sprites.dessiner(ctx, perso?.couleur || couleur, direction, pas ? (pas % 2 ? 1 : 2) : 0, x, hy, t);
    }

    function dessinerObstacle(sorte, x, y) {
      const t = jeu.taille, u = t / 16;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.fillRect(x + 3 * u, y + 13 * u, 10 * u, 2 * u);
      if (sorte === 'couper') {
        ctx.fillStyle = '#6b4a2b'; ctx.fillRect(x + 7 * u, y + 10 * u, 2 * u, 4 * u);
        ctx.fillStyle = '#2f6b3a'; ctx.fillRect(x + 3 * u, y + 3 * u, 10 * u, 8 * u);
        ctx.fillStyle = '#4b9150'; ctx.fillRect(x + 4 * u, y + 2 * u, 7 * u, 5 * u);
      } else {
        ctx.fillStyle = sorte === 'briser' ? '#7d7466' : '#6e6a64'; ctx.fillRect(x + 2 * u, y + 4 * u, 12 * u, 10 * u);
        ctx.fillStyle = sorte === 'briser' ? '#a39a89' : '#94908a'; ctx.fillRect(x + 3 * u, y + 3 * u, 9 * u, 5 * u);
        if (sorte === 'briser') { ctx.fillStyle = '#4a443b'; ctx.fillRect(x + 7 * u, y + 5 * u, u, 5 * u); ctx.fillRect(x + 8 * u, y + 9 * u, 2 * u, u); }
      }
    }

    // Les personnages (le joueur et les événements visibles), du plus haut au plus bas de l'écran :
    // celui qui est plus bas passe devant.
    function dessinerPersonnages(maintenant) {
      const t = jeu.taille;
      const liste = [];
      for (const p of presents) {
        if (!p.visible) continue;
        // Un PNJ qui marche glisse de son ancienne case à la nouvelle.
        const m = p.mouvement, k = m ? Math.min(1, m.t / m.duree) : 1;
        const px = m ? Math.round(m.de.x + (p.x * t - m.de.x) * k) : p.x * t;
        const py = m ? Math.round(m.de.y + (p.y * t - m.de.y) * k) : p.y * t;
        // Un obstacle sans tuile ni personnage (Saga 0.7) : un petit arbre ou un rocher dessiné.
        if (p.tuile < 0 && !p.perso && Monde.obstacle(p.ev)) { liste.push({ y: py, dessiner: () => dessinerObstacle(Monde.obstacle(p.ev).sorte, px - cam.x, py - cam.y) }); continue; }
        liste.push({ y: py, dessiner: () => dessinerCorps({
          tuile: p.tuile, perso: p.perso, couleur: '#5ec8ff', direction: p.direction,
          pas: m && k < 0.5 ? p.pas : 0, x: px - cam.x, y: py - cam.y,
        }, maintenant) });
      }
      const pj = pixelsJoueur();
      liste.push({ y: pj.y, dessiner: () => {
        const m = joueur.mouvement;
        // Les pieds : l'image du pas pendant la première moitié du pas, debout pendant la seconde.
        // Contre un mur, il piétine sur place (comme dans les jeux Pokémon).
        let pas = 0;
        if (m) pas = m.t / m.duree < 0.5 ? joueur.pas : 0;
        else if (joueur.pietine > 0) pas = Math.floor(joueur.pietine * 4) % 2 ? joueur.pas || 1 : 0;
        const x = pj.x - cam.x, y = pj.y - cam.y;
        // La tenue choisie (Tafl 0.16) remplace le sprite du héros ; sans sprite, sa tenue de base.
        const tenue = partie.tenue ? jeu.heros?.tenues?.find((t) => t.id === partie.tenue) : null;
        dessinerCorps({ perso: tenue?.sprite ? { sprite: tenue.sprite } : jeu.heros, couleur: '#d94a4a', direction: joueur.dir, pas, x, y, hy: y - pj.saut, ombre: pj.saut ? 0.8 : 1 }, maintenant);
      } });
      liste.sort((a, b) => a.y - b.y);
      for (const e of liste) e.dessiner();
    }

    // --- Les lumières (Saga 0.11) : les tuiles qui éclairent (une fois par carte) et les événements ---
    let lumieresCarte = null;
    function sourcesLumiere() {
      const t = jeu.taille;
      if (!lumieresCarte) {
        // Une case éclairée une seule fois, même si plusieurs calques y ont une tuile qui éclaire.
        const vues = new Map();
        for (const c of carte.calques) {
          if (!c.visible) continue;
          for (let i = 0; i < c.cases.length; i++) {
            const l = c.cases[i] >= 0 ? jeu.tuiles[c.cases[i]]?.lumiere : null;
            if (l) vues.set(i, l);
          }
        }
        lumieresCarte = [...vues].map(([i, l]) => ({ cx: (i % carte.largeur) * t + t / 2, cy: Math.floor(i / carte.largeur) * t + t / 2, l, graine: (i * 7.31) % 6.28 }));
      }
      const out = lumieresCarte.map((s) => ({ x: s.cx - cam.x, y: s.cy - cam.y, rayon: s.l.rayon * t, couleur: s.l.couleur, intensite: s.l.intensite, scintille: s.l.scintille, graine: s.graine }));
      for (const p of presents) {
        const l = p.visible && p.ev.lumiere ? (p.lumiere ??= Jeu.lumiere(p.ev.lumiere)) : null;
        if (!l) continue;
        const m = p.mouvement, k = m ? Math.min(1, m.t / m.duree) : 1;
        const px = m ? m.de.x + (p.x * t - m.de.x) * k : p.x * t, py = m ? m.de.y + (p.y * t - m.de.y) * k : p.y * t;
        out.push({ x: px + t / 2 - cam.x, y: py + t / 2 - cam.y, rayon: l.rayon * t, couleur: l.couleur, intensite: l.intensite, scintille: l.scintille, graine: p.x * 3.7 + p.y });
      }
      return out;
    }
    // La lumière du ciel à l'heure qu'il est (blanche dans un intérieur, ou sans horloge).
    const ciel = () => (carte.ambiance.jour_nuit ? Temps.lumiere(Temps.heure(jeu, partie)) : [255, 255, 255]);

    // F3 : la grille de passage, les zones, les téléporteurs et les événements, pour vérifier une carte.
    function dessinerDebug() {
      const t = jeu.taille;
      const x0 = Math.max(0, Math.floor(cam.x / t)), y0 = Math.max(0, Math.floor(cam.y / t));
      const x1 = Math.min(carte.largeur - 1, Math.floor((cam.x + W) / t)), y1 = Math.min(carte.hauteur - 1, Math.floor((cam.y + H) / t));
      ctx.save();
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const c = carte.collisions[y * carte.largeur + x];
          if (c === 2) ctx.fillStyle = 'rgba(255, 60, 60, 0.32)';
          else if (c >= 3) ctx.fillStyle = 'rgba(255, 208, 64, 0.4)';
          else continue;
          ctx.fillRect(x * t - cam.x, y * t - cam.y, t, t);
        }
      }
      ctx.lineWidth = 1;
      for (const z of carte.zones) {
        ctx.strokeStyle = z.type === 'eau' ? 'rgba(90, 170, 255, 0.9)' : z.type === 'herbes' ? 'rgba(120, 230, 120, 0.9)' : 'rgba(220, 220, 220, 0.8)';
        ctx.strokeRect(z.x * t - cam.x + 0.5, z.y * t - cam.y + 0.5, z.largeur * t - 1, z.hauteur * t - 1);
      }
      for (const tp of carte.teleporteurs) {
        ctx.fillStyle = 'rgba(80, 160, 255, 0.45)';
        ctx.fillRect(tp.x * t - cam.x, tp.y * t - cam.y, t, t);
      }
      for (const ev of carte.evenements) {
        ctx.strokeStyle = 'rgba(255, 110, 220, 0.95)';
        ctx.strokeRect(ev.x * t - cam.x + 1.5, ev.y * t - cam.y + 1.5, t - 3, t - 3);
      }
      ctx.restore();
    }

    function dessiner(maintenant) {
      ctx.imageSmoothingEnabled = false;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      // 1. les calques « dessous » et « joueur », dans l'ordre de la liste ;
      for (const c of carte.calques) if (c.visible && c.profondeur !== 'dessus') dessinerCalque(c, maintenant);
      // 2. les personnages ;
      dessinerPersonnages(maintenant);
      // 3. les calques « dessus » (toits, cimes des arbres), devant le joueur ;
      for (const c of carte.calques) if (c.visible && c.profondeur === 'dessus') dessinerCalque(c, maintenant);
      // 4. l'ambiance : la lumière (teinte de la carte, jour et nuit, lampes), puis la météo.
      ambiance.dessinerLumiere(ctx, ciel(), sourcesLumiere());
      if (options.meteo) ambiance.dessinerMeteo(ctx);
      if (debug) dessinerDebug();
      // 5. le fondu au noir des téléporteurs.
      if (noir > 0) {
        ctx.fillStyle = `rgba(0, 0, 0, ${noir})`;
        ctx.fillRect(0, 0, W, H);
      }
    }

    function avancerFondu(dt) {
      if (!fondu) return;
      fondu.t += dt;
      const k = Math.min(1, fondu.t / DUREE_FONDU);
      if (fondu.phase === 'sortie') {
        noir = k;
        if (k >= 1) {
          const v = fondu.vers;
          entrerSur(v.carte, v.x, v.y, v.direction || joueur.dir);
          fondu = { phase: 'entree', t: 0, resoudre: fondu.resoudre };
        }
      } else {
        noir = 1 - k;
        if (k >= 1) {
          const r = fondu.resoudre;
          fondu = null;
          noir = 0;
          r?.();
        }
      }
    }

    function tour(maintenant) {
      boucle = requestAnimationFrame(tour);
      if (!jeu) return;
      const dt = Math.min(0.05, (maintenant - avant) / 1000);
      avant = maintenant;
      images++;
      chrono += dt;
      if (chrono >= 0.5) { fps = Math.round(images / chrono); images = 0; chrono = 0; }
      entrees.sonder();
      if (!enPause) {
        // Les appuis de cette image : à la boîte de dialogue s'il y en a une, sinon au joueur.
        // Dans un menu ou un combat, chaque appui a son petit son (Saga 0.11).
        const sonMenu = (a) => bruit(DIRS.includes(a) ? 'curseur' : a === 'action' ? 'valider' : 'retour');
        for (const a of entrees.appuis()) {
          if (menus.ouvert) { sonMenu(a); menus.touche(a === 'echap' ? 'retour' : a); }
          else if (a === 'echap') { if (enCombat) { sonMenu('retour'); ecranDuJeu().touche('retour'); } }
          else if (enCombat) { sonMenu(a); ecranDuJeu().touche(a); }
          else if (enScript) dialogue.touche(a);
          else if (a === 'action') actionDemandee = true;
        }
        // L'horloge du jeu avance quand le joueur est sur la carte (pas en combat ni en pause).
        if (!enCombat) Temps.avancer(jeu, partie, dt);
        verifierMoments();
        avancerJoueur(dt);
        actionDemandee = false; // une action pendant un pas ne se garde pas pour plus tard
        avancerPNJ(dt);
        avancerFondu(dt);
        dialogue.avancer(dt);
        ecranCombat.avancer(dt);
        ecranGroupe.avancer(dt);
        for (const a of attentes) a.reste -= dt;
        for (const a of attentes.filter((x) => x.reste <= 0)) a.resoudre();
        attentes = attentes.filter((x) => x.reste > 0);
        if (debutAFaire && !fondu && !enScript && !enCombat) lancerDebut();
        else if (reactions.length && !fondu && !enScript && !enCombat) lancerReactions();
        else if (autoAFaire && !fondu && !enScript) lancerAuto();
      } else entrees.appuis();
      placerCamera();
      ambiance.avancer(enPause ? 0 : dt, cam, options.meteo);
      // L'orage : le tonnerre suit l'éclair (sauf si la carte a son propre fond sonore).
      if (ambiance.nouvelEclair && !carte.ambiance.fond_sonore && !enCombat) audio.tonnerre(0.4 + carte.ambiance.intensite / 160);
      dessiner(maintenant);
    }

    // Le matin devient le jour, le soir la nuit : les pages qui dépendent du moment (condition
    // « moment ») changent, sans attendre la fin d'un script.
    let momentsAvant = '', momentPrincipal = '';
    function verifierMoments() {
      const m = Object.keys(Temps.MOMENTS).filter((k) => Temps.moment(jeu, partie, k)).join();
      if (m === momentsAvant) return;
      const premier = !momentsAvant;
      momentsAvant = m;
      // Saga 0.12 : les scripts qui écoutent quand('moment') voient le moment principal changer.
      const principal = ['nuit', 'soir', 'matin'].find((k) => m.split(',').includes(k)) || 'jour';
      if (principal !== momentPrincipal) {
        if (momentPrincipal && scriptsJs.ecoute('moment')) reagir('moment', { moment: principal });
        momentPrincipal = principal;
      }
      if (!premier && !enScript && !enCombat) presents = Monde.evenementsPresents(jeu, carte, partie, presents);
      else if (!premier) momentsAvant = ''; // on réessaiera à la fin du script
    }

    // Un menu ouvert depuis le carnet (un objet du sac, l'équipe, le Pokédex…). Comme un script : le
    // joueur ne bouge pas pendant ce temps. Rend false si ce n'est pas le moment.
    async function horsScript(faire, erreur) {
      if (!jeu || enScript || enCombat || fondu) return false;
      enScript = true;
      entrees.oublier();
      try {
        await faire();
      } catch (err) {
        rappels.message?.(`${erreur} : ${err.message}`);
      } finally {
        menus.fermer();
        dialogue.fermer();
        Collection.noterTout(partie);
        presents = Monde.evenementsPresents(jeu, carte, partie, presents);
        enScript = false;
        entrees.oublier();
      }
      return true;
    }

    return {
      demarrer,
      arreter,
      redimensionner,
      regler(o) {
        const meteoAvant = options.meteo;
        options = { ...options, ...o };
        entrees.regler(options.touches, options.manette);
        audio.volumes({ musique: options.volumeMusique, sons: options.volumeSons });
        dialogue.regler({ vitesseTexte: options.vitesseTexte });
        if (jeu) redimensionner();
        if (jeu && carte && meteoAvant !== options.meteo) sonFond();
      },
      pause(oui) { enPause = oui; entrees.oublier(); audio.attenuer(oui); },
      // Un bruitage pour l'interface autour du jeu (le menu de pause, la sauvegarde).
      bruit,
      // Le joueur peut-il être sauvegardé sans risque ? (pas pendant un script, un combat, un fondu)
      get libre() { return Boolean(jeu && joueur && !enScript && !enCombat && !fondu && !joueur.mouvement); },
      // L'heure du jeu (Saga 0.11), pour le carnet : « 14 h 05 », ou '' sans horloge.
      heure() { return jeu ? Temps.texte(Temps.heure(jeu, partie)) : ''; },
      reveiller() { audio.reprendre(); },
      get enScript() { return enScript; },
      get enCombat() { return enCombat; },
      // La partie en cours, pour la sauvegarder (une copie : la sauvegarde ne bouge plus ensuite).
      partie() { return partie ? JSON.parse(JSON.stringify({ ...partie, position: this.position() || partie.position })) : null; },
      annoncer: (titre, detail) => dialogue.annoncer(titre, detail),
      // Utiliser un objet du sac sur la carte (depuis le carnet, Saga 0.5). Comme un script : le
      // joueur ne bouge pas pendant ce temps. Rend false si ce n'est pas le moment.
      utiliserObjet: (id) => horsScript(() => Regles.utiliserObjet({ jeu, partie, ui: scripts.ui, id }), 'Erreur avec cet objet'),
      // Saga 0.6 : ouvrir l'équipe (sur la créature n° i), le Pokédex ou le PC, depuis le carnet ou la pause.
      ouvrirEcran: (nom, ...a) => horsScript(() => ecrans[nom](...a), 'Erreur dans ce menu'),
      // Saga 0.13 : les choix du pack dans le menu de pause (Jets de dés, Se reposer pour le pack JDR).
      actionsPause: () => (jeu ? Regles.actionsPause(jeu) : []),
      agirPause: (id) => horsScript(() => Regles.agirPause({ jeu, partie, ui: scripts.ui, id }), 'Erreur dans ce menu'),
      // La forme des menus du jeu (leurs noms, le Pokédex montré ou non), pour la pause et le carnet.
      formeMenus: () => (jeu ? Regles.menus(jeu) : null),
      objetUtilisable: (id) => Boolean(jeu && Regles.utilisable(jeu, jeu.donnees.objets?.objets?.find((o) => o.id === id))),
      basculerDebug() { debug = !debug; return debug; },
      get debug() { return debug; },
      // Pour la barre d'infos (F3) et pour « Recharger » (F5 garde la position du joueur).
      infos() {
        if (!jeu || !joueur) return null;
        return { carte: carte.id, nom: carte.nom, x: joueur.x, y: joueur.y, direction: joueur.dir, fps, zoom, W, H, meteo: carte.ambiance.meteo, heure: Temps.texte(Temps.heure(jeu, partie)), musique: audio.morceau };
      },
      position() { return joueur ? { carte: carte.id, x: joueur.x, y: joueur.y, direction: joueur.dir } : null; },
    };
  }

  return { creer, TOUCHES_DEFAUT, MANETTE_DEFAUT, COMMANDES };
})();
