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
  const TOUCHES = {
    ArrowDown: 'bas', ArrowUp: 'haut', ArrowLeft: 'gauche', ArrowRight: 'droite',
    KeyS: 'bas', KeyW: 'haut', KeyA: 'gauche', KeyD: 'droite',
  };
  // Action (parler, ouvrir, passer un dialogue) : Espace, Entrée ou E. Retour : Retour arrière ou X.
  const ACTIONS = { Space: 'action', Enter: 'action', NumpadEnter: 'action', KeyE: 'action', Backspace: 'retour', KeyX: 'retour' };
  function creerEntrees() {
    const tenues = []; // directions tenues, la dernière appuyée à la fin
    let course = false;
    let appuis = [];   // les touches appuyées depuis la dernière image : 'action', 'retour', 'haut'…
    const lacher = (dir) => { const i = tenues.indexOf(dir); if (i >= 0) tenues.splice(i, 1); };
    window.addEventListener('keydown', (e) => {
      if (e.target.closest?.('input, select, textarea, button, .modal')) return;
      const dir = TOUCHES[e.code];
      if (dir) {
        e.preventDefault();
        appuis.push(dir);
        if (!e.repeat) { lacher(dir); tenues.push(dir); }
      }
      const action = ACTIONS[e.code];
      if (action && !e.ctrlKey && !e.altKey) { e.preventDefault(); if (!e.repeat) appuis.push(action); }
      if (e.key === 'Shift') course = true;
    });
    window.addEventListener('keyup', (e) => {
      const dir = TOUCHES[e.code];
      if (dir) lacher(dir);
      if (e.key === 'Shift') course = false;
    });
    // Fenêtre quittée (Alt+Tab) : on oublie tout, sinon le joueur continuerait de marcher tout seul.
    window.addEventListener('blur', () => { tenues.length = 0; course = false; appuis = []; });

    // Manette (Xbox, PlayStation, Switch Pro…) : croix directionnelle ou stick gauche, bouton B pour courir.
    // Bouton A : action, bouton B : retour (et courir, tenu).
    let padAvant = {};
    function manette() {
      for (const pad of navigator.getGamepads?.() || []) {
        if (!pad) continue;
        const b = (i) => pad.buttons[i]?.pressed;
        const [ax, ay] = [pad.axes[0] || 0, pad.axes[1] || 0];
        let dir = null;
        if (b(12) || ay < -0.5) dir = 'haut';
        else if (b(13) || ay > 0.5) dir = 'bas';
        else if (b(14) || ax < -0.5) dir = 'gauche';
        else if (b(15) || ax > 0.5) dir = 'droite';
        const etat = { dir, a: b(0), b: b(1) };
        if (etat.a && !padAvant.a) appuis.push('action');
        if (etat.b && !padAvant.b) appuis.push('retour');
        if (dir && dir !== padAvant.dir) appuis.push(dir);
        padAvant = etat;
        return { dir, course: b(1) || b(2) };
      }
      return null;
    }
    return {
      lire() {
        const pad = manette();
        return { dir: tenues[tenues.length - 1] || pad?.dir || null, course: course || Boolean(pad?.course) };
      },
      // Les appuis depuis la dernière fois (chacun n'est rendu qu'une fois).
      appuis() { const a = appuis; appuis = []; return a; },
      oublier() { tenues.length = 0; course = false; appuis = []; },
    };
  }

  function creer(canvas, rappels = {}) {
    const ctx = canvas.getContext('2d');
    const entrees = creerEntrees();
    const ambiance = Ambiance.creer();
    let options = { zoom: 0, casesVisibles: 11, courirParDefaut: false, meteo: true };
    let jeu = null, partie = null, carte = null, presents = [];
    let joueur = null;
    let cam = { x: 0, y: 0 };
    let W = 320, H = 180, zoom = 1;
    let fondu = null, noir = 0;
    let enPause = false, debug = false, boucle = 0, avant = 0;
    let fps = 0, images = 0, chrono = 0;
    // Les événements (Saga 0.2) : la boîte de dialogue, le script en cours, les pauses des scripts.
    const dialogue = Dialogue.creer(canvas.parentElement);
    let scripts = null, enScript = false, autoAFaire = false;
    let attentes = []; // [{ reste, resoudre }] : la commande « attendre »
    let actionDemandee = false;
    // Les combats (Saga 0.3) : leur écran, posé sur le jeu comme la boîte de dialogue.
    const ecranCombat = EcranCombat.creer(canvas.parentElement);
    let enCombat = false;

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
      carte = nouvelle;
      joueur = {
        x: Math.min(carte.largeur - 1, Math.max(0, Number(x) || 0)),
        y: Math.min(carte.hauteur - 1, Math.max(0, Number(y) || 0)),
        dir: DIRECTIONS[direction] ? direction : 'bas',
        mouvement: null, pas: 0, attente: 0, pietine: 0,
      };
      partie.position = { carte: carte.id, x: joueur.x, y: joueur.y, direction: joueur.dir };
      presents = Monde.evenementsPresents(jeu, carte, partie);
      ambiance.regler(carte.ambiance);
      placerCamera();
      if (change) rappels.carte?.(carte);
      // Les événements « auto » de cette carte se joueront dès la fin du fondu.
      autoAFaire = true;
      return true;
    }

    // partieGardee : une partie déjà commencée (une sauvegarde, ou F5 qui recharge le jeu sans
    // perdre ce que le joueur a fait). depart : où commencer, à la place de la position de la partie.
    function demarrer(nouveauJeu, depart, partieGardee = null) {
      jeu = nouveauJeu;
      partie = partieGardee ? { ...Monde.nouvellePartie(jeu), ...partieGardee } : Monde.nouvellePartie(jeu, depart || jeu.depart);
      if (partieGardee && depart) partie.position = { ...depart };
      // Les créatures d'une sauvegarde : complétées (une partie de Saga 0.2 n'avait que l'espèce et le niveau).
      partie.equipe = (partie.equipe || []).map((c) => Regles.completer(jeu, c)).filter(Boolean);
      partie.boite = (partie.boite || []).map((c) => Regles.completer(jeu, c)).filter(Boolean);
      enCombat = false;
      ecranCombat.fermer();
      carte = null;
      enScript = false;
      attentes = [];
      dialogue.fermer();
      scripts = Scripts.creer({
        jeu, dialogue,
        partie: () => partie,
        carte: () => carte,
        attendre: (ms) => new Promise((resoudre) => attentes.push({ reste: ms / 1000, resoudre })),
        teleporter: (c, x, y, d) => new Promise((resoudre) => { fondu = { phase: 'sortie', t: 0, vers: { carte: c, x, y, direction: d }, resoudre }; }),
        combattre,
        position: () => ({ carte: carte.id, x: joueur.x, y: joueur.y, direction: joueur.dir }),
      });
      redimensionner();
      const d = partie.position;
      if (!entrerSur(d.carte, d.x, d.y, d.direction)) entrerSur(jeu.depart.carte, jeu.depart.x, jeu.depart.y, jeu.depart.direction);
      noir = 1;
      fondu = { phase: 'entree', t: 0 };
      if (!boucle) { avant = performance.now(); boucle = requestAnimationFrame(tour); }
    }

    function arreter() {
      cancelAnimationFrame(boucle);
      boucle = 0;
      jeu = null;
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
        if (p && p.bloque && p.ev.declenchement === 'toucher' && joueur.pietine === 0) lancer(p);
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
      partie.position = { carte: carte.id, x: joueur.x, y: joueur.y, direction: joueur.dir };
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
      // Les chances des créatures sont des poids (ramenés à 100).
      const possibles = zone.rencontres.filter((r) => Regles.existe(jeu, r.creature));
      const total = possibles.reduce((s, r) => s + Math.max(0, Number(r.chance) || 0), 0);
      if (!possibles.length || total <= 0) return false;
      let tirage = Math.random() * total;
      const r = possibles.find((q) => (tirage -= Math.max(0, Number(q.chance) || 0)) < 0) || possibles[0];
      const min = Number(r.niveau_min) || 2, max = Math.max(min, Number(r.niveau_max) || min);
      const sauvage = Regles.creer(jeu, r.creature, min + Math.floor(Math.random() * (max - min + 1)));
      (async () => {
        enScript = true;
        await combattre({ sauvage });
        presents = Monde.evenementsPresents(jeu, carte, partie, presents);
        enScript = false;
        entrees.oublier();
      })();
      return true;
    }
    // Un combat (une rencontre, ou les commandes combat_sauvage et combat_dresseur des scripts).
    // Rend l'issue : 'victoire', 'defaite', 'fuite' ou 'capture'. Après une défaite, le joueur se
    // réveille au dernier endroit où il s'est soigné (sinon au départ du jeu), son équipe soignée.
    async function combattre({ sauvage = null, dresseur = null }) {
      enCombat = true;
      entrees.oublier();
      dialogue.fermer();
      let issue = 'fuite';
      try {
        ({ issue } = await Regles.combattre({ jeu, partie, ui: ecranCombat, sauvage, dresseur, fond: fondCombat() }));
      } catch (err) {
        ecranCombat.fermer();
        rappels.message?.(`Erreur pendant le combat : ${err.message}`);
      }
      enCombat = false;
      entrees.oublier();
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
      // Le script a pu changer des interrupteurs : chaque événement reprend sa bonne page.
      presents = Monde.evenementsPresents(jeu, carte, partie, presents);
      enScript = false;
      entrees.oublier();
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
        dessinerCorps({ perso: jeu.heros, couleur: '#d94a4a', direction: joueur.dir, pas, x, y, hy: y - pj.saut, ombre: pj.saut ? 0.8 : 1 }, maintenant);
      } });
      liste.sort((a, b) => a.y - b.y);
      for (const e of liste) e.dessiner();
    }

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
      // 4. l'ambiance : la teinte sur toute la carte, puis la météo.
      ambiance.dessinerTeinte(ctx);
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
      if (!enPause) {
        // Les appuis de cette image : à la boîte de dialogue s'il y en a une, sinon au joueur.
        for (const a of entrees.appuis()) {
          if (enCombat) ecranCombat.touche(a);
          else if (enScript) dialogue.touche(a);
          else if (a === 'action') actionDemandee = true;
        }
        avancerJoueur(dt);
        actionDemandee = false; // une action pendant un pas ne se garde pas pour plus tard
        avancerPNJ(dt);
        avancerFondu(dt);
        dialogue.avancer(dt);
        ecranCombat.avancer(dt);
        for (const a of attentes) a.reste -= dt;
        for (const a of attentes.filter((x) => x.reste <= 0)) a.resoudre();
        attentes = attentes.filter((x) => x.reste > 0);
        if (autoAFaire && !fondu && !enScript) lancerAuto();
      } else entrees.appuis();
      placerCamera();
      ambiance.avancer(enPause ? 0 : dt, cam, options.meteo);
      dessiner(maintenant);
    }

    return {
      demarrer,
      arreter,
      redimensionner,
      regler(o) { options = { ...options, ...o }; if (jeu) redimensionner(); },
      pause(oui) { enPause = oui; entrees.oublier(); },
      get enScript() { return enScript; },
      get enCombat() { return enCombat; },
      // La partie en cours, pour la sauvegarder (une copie : la sauvegarde ne bouge plus ensuite).
      partie() { return partie ? JSON.parse(JSON.stringify({ ...partie, position: this.position() || partie.position })) : null; },
      annoncer: (titre, detail) => dialogue.annoncer(titre, detail),
      basculerDebug() { debug = !debug; return debug; },
      get debug() { return debug; },
      // Pour la barre d'infos (F3) et pour « Recharger » (F5 garde la position du joueur).
      infos() {
        if (!jeu || !joueur) return null;
        return { carte: carte.id, nom: carte.nom, x: joueur.x, y: joueur.y, direction: joueur.dir, fps, zoom, W, H, meteo: carte.ambiance.meteo };
      },
      position() { return joueur ? { carte: carte.id, x: joueur.x, y: joueur.y, direction: joueur.dir } : null; },
    };
  }

  return { creer };
})();
