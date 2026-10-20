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
  function creerEntrees() {
    const tenues = []; // directions tenues, la dernière appuyée à la fin
    let course = false;
    const lacher = (dir) => { const i = tenues.indexOf(dir); if (i >= 0) tenues.splice(i, 1); };
    window.addEventListener('keydown', (e) => {
      if (e.target.closest?.('input, select, textarea')) return;
      const dir = TOUCHES[e.code];
      if (dir) { e.preventDefault(); lacher(dir); tenues.push(dir); }
      if (e.key === 'Shift') course = true;
    });
    window.addEventListener('keyup', (e) => {
      const dir = TOUCHES[e.code];
      if (dir) lacher(dir);
      if (e.key === 'Shift') course = false;
    });
    // Fenêtre quittée (Alt+Tab) : on oublie tout, sinon le joueur continuerait de marcher tout seul.
    window.addEventListener('blur', () => { tenues.length = 0; course = false; });

    // Manette (Xbox, PlayStation, Switch Pro…) : croix directionnelle ou stick gauche, bouton B pour courir.
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
        return { dir, course: b(1) || b(2) };
      }
      return null;
    }
    return {
      lire() {
        const pad = manette();
        return { dir: tenues[tenues.length - 1] || pad?.dir || null, course: course || Boolean(pad?.course) };
      },
      oublier() { tenues.length = 0; course = false; },
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
        mouvement: null, pied: 1, attente: 0, pietine: 0,
      };
      partie.position = { carte: carte.id, x: joueur.x, y: joueur.y, direction: joueur.dir };
      presents = Monde.evenementsPresents(jeu, carte, partie);
      ambiance.regler(carte.ambiance);
      placerCamera();
      if (change) rappels.carte?.(carte);
      return true;
    }

    function demarrer(nouveauJeu, depart) {
      jeu = nouveauJeu;
      partie = Monde.nouvellePartie(jeu, depart || jeu.depart);
      carte = null;
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
      const x = (m.de.x + (m.vers.x - m.de.x) * k) * t, y = (m.de.y + (m.vers.y - m.de.y) * k) * t;
      return { x, y, saut: m.saut ? Math.sin(k * Math.PI) * t * 0.55 : 0 };
    }

    function essayerPas(dir, course) {
      joueur.dir = dir;
      const d = Monde.destination(carte, partie, presents, joueur.x, joueur.y, dir);
      if (!d) return false;
      joueur.pietine = 0;
      joueur.pied = joueur.pied === 1 ? 2 : 1;
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
      // Un téléporteur sous les pieds : fondu au noir, puis la carte d'arrivée.
      const tp = Monde.teleporteur(carte, joueur.x, joueur.y);
      if (tp) {
        fondu = { phase: 'sortie', t: 0, vers: tp.vers };
        return true;
      }
      return false;
    }

    function avancerJoueur(dt) {
      const { dir, course: maj } = enPause || fondu ? { dir: null, course: false } : entrees.lire();
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
      if (!dir) { joueur.attente = 0; joueur.pietine = 0; return; }
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

    // --- La caméra suit le joueur, sans sortir de la carte (une petite carte est centrée) ---
    function placerCamera() {
      if (!joueur) return;
      const t = jeu.taille, p = pixelsJoueur();
      const lw = carte.largeur * t, lh = carte.hauteur * t;
      const cx = p.x + t / 2 - W / 2, cy = p.y + t / 2 - H / 2;
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

    // Les personnages (le joueur et les événements visibles), du plus haut au plus bas de l'écran :
    // celui qui est plus bas passe devant.
    function dessinerPersonnages(maintenant) {
      const t = jeu.taille;
      const liste = [];
      for (const p of presents) {
        if (!p.visible) continue;
        liste.push({ y: p.y * t, dessiner: () => {
          const x = p.x * t - cam.x, y = p.y * t - cam.y;
          if (p.tuile >= 0) dessinerTuile(p.tuile, x, y, maintenant);
          else {
            Sprites.ombre(ctx, x, y, t);
            Sprites.dessiner(ctx, p.perso?.couleur || '#5ec8ff', p.direction, 0, x, y, t);
          }
        } });
      }
      const pj = pixelsJoueur();
      liste.push({ y: pj.y, dessiner: () => {
        const x = Math.round(pj.x - cam.x), y = Math.round(pj.y - cam.y);
        const m = joueur.mouvement;
        // Les pieds : un pied pendant la première moitié du pas, debout pendant la seconde.
        // Contre un mur, il piétine sur place (comme dans les jeux Pokémon).
        let pas = 0;
        if (m) pas = m.t / m.duree < 0.5 ? joueur.pied : 0;
        else if (joueur.pietine > 0) pas = Math.floor(joueur.pietine * 4) % 2 ? joueur.pied : 0;
        Sprites.ombre(ctx, x, y, t, pj.saut ? 0.8 : 1);
        const hy = y - Math.round(pj.saut);
        if (jeu.heros?.tuile >= 0) dessinerTuile(jeu.heros.tuile, x, hy, maintenant);
        else Sprites.dessiner(ctx, jeu.heros?.couleur || '#d94a4a', joueur.dir, pas, x, hy, t);
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
          fondu = { phase: 'entree', t: 0 };
        }
      } else {
        noir = 1 - k;
        if (k >= 1) { fondu = null; noir = 0; }
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
        avancerJoueur(dt);
        avancerFondu(dt);
      }
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
