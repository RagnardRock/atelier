// Les cinématiques (Saga 1.17) : la caméra qui se promène, les fondus, les secousses, les bulles au-dessus
// des personnages et les bandes noires de cinéma. Les déplacements des personnages sont dans moteur.js
// (ils connaissent la carte et les collisions) ; ce fichier ne garde que l'état de la mise en scène et
// la dessine par-dessus la carte.
//
// Générique : il ne connaît ni les cartes ni les scripts. Le moteur lui donne des points en pixels de carte,
// des durées en secondes, et l'appelle à chaque image (avancer, puis dessiner).

const Cinema = (() => {
  // Les bulles : un signe au-dessus de la tête (FORMAT.md › Commandes › bulle).
  const BULLES = {
    exclamation: { texte: '!', couleur: '#e0413a' },
    question: { texte: '?', couleur: '#2f6fd6' },
    coeur: { texte: '♥', couleur: '#e0417a' },
    points: { texte: '…', couleur: '#444' },
    note: { texte: '♪', couleur: '#2e9a5a' },
    colere: { texte: '#', couleur: '#d1452b' },
    sommeil: { texte: 'z', couleur: '#5a5fc9' },
    idee: { texte: '✦', couleur: '#d9a514' },
  };
  const COULEURS = { noir: [0, 0, 0], blanc: [255, 255, 255] };
  const lisse = (k) => k * k * (3 - 2 * k);

  function creer() {
    let camera = null;   // { de, vers, t, duree, retour, fini: bool, resoudre }
    let voile = null;    // { couleur, a, de, vers, t, duree, resoudre }
    let secousse = null; // { force, reste, resoudre }
    let bandes = { k: 0, de: 0, vers: 0, t: 0, duree: 0, resoudre: null };
    let bulles = [];     // { pos(), bulle, t, duree, resoudre }
    let decalage = { x: 0, y: 0 };

    // Le centre de la caméra : celui de la cinématique, sinon `defaut` (le joueur).
    function centre(defaut) {
      if (!camera) return defaut;
      const k = camera.duree > 0 ? lisse(Math.min(1, camera.t / camera.duree)) : 1;
      const vers = camera.retour ? defaut : camera.vers;
      return { x: camera.de.x + (vers.x - camera.de.x) * k, y: camera.de.y + (vers.y - camera.de.y) * k };
    }
    const actif = () => Boolean(camera);

    // La caméra va vers ce point (pixels de carte), depuis là où elle est (`depuis` : son centre actuel).
    function cameraVers(point, duree, depuis) {
      camera?.resoudre?.();
      const de = camera ? centre(depuis) : depuis;
      return new Promise((resoudre) => { camera = { de, vers: point, t: 0, duree: Math.max(0, duree), retour: false, resoudre }; });
    }
    // Elle revient sur le joueur, puis le suit de nouveau.
    function cameraRevenir(duree, depuis) {
      if (!camera) return Promise.resolve();
      camera.resoudre?.();
      const de = centre(depuis);
      return new Promise((resoudre) => { camera = { de, vers: null, t: 0, duree: Math.max(0, duree), retour: true, resoudre }; });
    }

    // Un fondu : sortir = l'écran se couvre de la couleur ; entrer = elle s'en va.
    function fondu(couleur, sortir, duree) {
      voile?.resoudre?.();
      const c = COULEURS[couleur] ? couleur : 'noir';
      const a = voile && voile.couleur === c ? voile.a : sortir ? 0 : 1;
      return new Promise((resoudre) => { voile = { couleur: c, a, de: a, vers: sortir ? 1 : 0, t: 0, duree: Math.max(0, duree), resoudre }; });
    }

    function secouer(force, duree) {
      secousse?.resoudre?.();
      return new Promise((resoudre) => { secousse = { force: Math.max(1, Math.min(10, force)), reste: Math.max(0, duree), duree: Math.max(0.01, duree), resoudre }; });
    }

    // Une bulle au-dessus de celui que pos() situe (le haut de sa case, en pixels de carte).
    function bulle(pos, nom, duree) {
      const b = BULLES[nom] || BULLES.exclamation;
      return new Promise((resoudre) => { bulles.push({ pos, bulle: b, t: 0, duree: Math.max(0.1, duree), resoudre }); });
    }

    function cinema(montrer, duree = 0.4) {
      bandes.resoudre?.();
      return new Promise((resoudre) => { bandes = { k: bandes.k, de: bandes.k, vers: montrer ? 1 : 0, t: 0, duree, resoudre }; });
    }

    function avancer(dt) {
      if (camera) {
        camera.t += dt;
        if (camera.t >= camera.duree && !camera.fini) {
          camera.fini = true;
          camera.resoudre?.();
          if (camera.retour) camera = null;
        }
      }
      if (voile) {
        voile.t += dt;
        const k = voile.duree > 0 ? Math.min(1, voile.t / voile.duree) : 1;
        voile.a = voile.de + (voile.vers - voile.de) * k;
        if (k >= 1) {
          const r = voile.resoudre;
          voile.resoudre = null;
          if (voile.a <= 0) voile = null;
          r?.();
        }
      }
      decalage = { x: 0, y: 0 };
      if (secousse) {
        secousse.reste -= dt;
        if (secousse.reste <= 0) { const r = secousse.resoudre; secousse = null; r?.(); } else {
          const f = secousse.force * Math.min(1, secousse.reste / Math.min(0.25, secousse.duree));
          decalage = { x: Math.round((Math.random() * 2 - 1) * f), y: Math.round((Math.random() * 2 - 1) * f * 0.6) };
        }
      }
      if (bandes.k !== bandes.vers || bandes.resoudre) {
        bandes.t += dt;
        const k = bandes.duree > 0 ? Math.min(1, bandes.t / bandes.duree) : 1;
        bandes.k = bandes.de + (bandes.vers - bandes.de) * lisse(k);
        if (k >= 1) { bandes.k = bandes.vers; const r = bandes.resoudre; bandes.resoudre = null; r?.(); }
      }
      for (const b of bulles) b.t += dt;
      for (const b of bulles.filter((x) => x.t >= x.duree)) b.resoudre?.();
      bulles = bulles.filter((x) => x.t < x.duree);
    }

    // Par-dessus la carte : les bulles (qui suivent les personnages), le voile, puis les bandes.
    function dessiner(ctx, W, H, cam, taille) {
      const u = Math.max(1, Math.round(taille / 16));
      for (const b of bulles) {
        const p = b.pos();
        if (!p) continue;
        const apparition = Math.min(1, b.t / 0.12), depart = Math.min(1, (b.duree - b.t) / 0.15);
        const s = Math.max(0, Math.min(apparition, depart));
        const w = 12 * u, h = 11 * u;
        const x = Math.round(p.x - cam.x + taille / 2 - w / 2), y = Math.round(p.y - cam.y - h - 2 * u - (1 - s) * 3 * u);
        ctx.globalAlpha = s;
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#222';
        ctx.lineWidth = u;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(x, y, w, h, 3 * u) : ctx.rect(x, y, w, h);
        ctx.moveTo(x + w / 2 - 2 * u, y + h);
        ctx.lineTo(x + w / 2, y + h + 3 * u);
        ctx.lineTo(x + w / 2 + 2 * u, y + h);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.fillRect(x + w / 2 - 2 * u + u / 2, y + h - u, 4 * u - u, u * 1.5);
        ctx.fillStyle = b.bulle.couleur;
        ctx.font = `bold ${9 * u}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(b.bulle.texte, x + w / 2, y + h / 2 + u / 2);
        ctx.globalAlpha = 1;
      }
      if (voile && voile.a > 0) {
        const [r, g, b] = COULEURS[voile.couleur];
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${voile.a})`;
        ctx.fillRect(0, 0, W, H);
      }
      if (bandes.k > 0) {
        const h = Math.round(H * 0.12 * bandes.k);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, h);
        ctx.fillRect(0, H - h, W, h);
      }
    }

    // La fin d'un script : la caméra revient d'un coup, le voile s'en va doucement, les bandes se retirent.
    function fin() {
      camera?.resoudre?.(); camera = null;
      secousse?.resoudre?.(); secousse = null;
      for (const b of bulles) b.resoudre?.();
      bulles = [];
      if (voile && voile.a > 0) fondu(voile.couleur, false, 0.3);
      if (bandes.k > 0 || bandes.vers > 0) cinema(false, 0.3);
    }

    // Une autre carte : la caméra et les bulles n'ont plus de sens ; le voile et les bandes restent.
    function changerCarte() {
      camera?.resoudre?.(); camera = null;
      for (const b of bulles) b.resoudre?.();
      bulles = [];
    }

    return { centre, actif, changerCarte, cameraVers, cameraRevenir, fondu, secouer, bulle, cinema, avancer, dessiner, fin, decalage: () => decalage, voile: () => (voile ? voile.a : 0) };
  }

  return { creer, BULLES };
})();
