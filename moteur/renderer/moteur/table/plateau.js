// Le mode table (Saga 0.14) : le dessin du plateau. La carte de Tafl, la grille (une case = une tuile),
// les pions, le brouillard et ce qu'on montre en surbrillance (les cases où l'on peut aller, les cibles).
//
// Il ne dessine qu'une VUE (table/etat.js › vue) : l'écran du MJ et la fenêtre des joueurs l'utilisent
// tous les deux, chacun avec la sienne. Un seul canvas, à la résolution de l'écran : les tuiles y sont
// agrandies d'un nombre entier de fois (le pixel art reste net), les traits et les textes sont fins.
//
//   creer(canvas) → { taille(), dessiner(o), cadrer(carte, jeu), zoomer(k, px, py), glisser(dx, dy),
//                     caseSous(px, py, jeu), pionSous(px, py, jeu, vue), flotter(id, texte, sorte), eclat(id, couleur),
//                     secouer(id), camera }
//   o : { jeu, carte, vue, maintenant, mj, apercu (le MJ voit le brouillard comme les joueurs),
//         cases: Map index → 'aller' | 'zone', cibles: Set d'ids, selection, survol: { x, y } }

const Plateau = (() => {
  const COULEURS = { indemne: '#7ddc8a', 'blessé': '#f0b44c', 'en sang': '#ef5b5b', vaincu: '#777' };
  const images = new Map(); // data: URL → Image (les images des monstres)
  function image(src) {
    if (!src) return null;
    let im = images.get(src);
    if (!im) { im = new Image(); im.src = src; images.set(src, im); }
    return im.complete && im.naturalWidth ? im : null;
  }

  function creer(canvas) {
    const ctx = canvas.getContext('2d');
    const camera = { x: 0, y: 0, z: 2 }; // x, y : le coin haut gauche, en pixels de jeu ; z : pixels d'écran par pixel de jeu
    let dpr = 1, L = 1, H = 1, cadree = '';
    const ambiance = { toile: document.createElement('canvas'), pret: false, carte: '', t: 0 };
    const flottants = []; // { id, texte, sorte, t0 }
    const pingsVus = new Map(); // n → l'heure où ce ping est arrivé ici
    const eclats = [];    // { id, couleur, t0, secousse }

    function taille() {
      dpr = window.devicePixelRatio || 1;
      const r = canvas.parentElement.getBoundingClientRect();
      L = Math.max(1, Math.floor(r.width * dpr));
      H = Math.max(1, Math.floor(r.height * dpr));
      if (canvas.width !== L || canvas.height !== H) { canvas.width = L; canvas.height = H; }
      canvas.style.width = `${r.width}px`;
      canvas.style.height = `${r.height}px`;
    }
    // Le plus grand zoom entier qui montre toute la carte (au moins 1), centrée.
    // Saga 1.35 : le plateau passe sous des panneaux en verre ; api.marges() dit la place qu'ils prennent
    // (en px CSS : { g, d, h, b }), et la carte se cadre dans ce qui reste.
    function cadrer(carte, jeu) {
      taille();
      const t = jeu.taille;
      const m = api.marges?.() || {};
      const g = (m.g || 0) * dpr, d = (m.d || 0) * dpr, hh = (m.h || 0) * dpr, b = (m.b || 0) * dpr;
      const LL = Math.max(1, L - g - d), HH = Math.max(1, H - hh - b);
      camera.z = Math.max(1, Math.min(8, Math.floor(Math.min(LL / (carte.largeur * t), HH / (carte.hauteur * t)))));
      // Une place « souple » à droite (l'encart du tour, en combat) : on l'évite si la carte y tient sans dézoomer.
      const souple = (m.souple || 0) * dpr;
      const LS = souple && carte.largeur * t * camera.z <= LL - souple ? LL - souple : LL;
      camera.x = (carte.largeur * t - LS / camera.z) / 2 - g / camera.z;
      camera.y = (carte.hauteur * t - HH / camera.z) / 2 - hh / camera.z;
      cadree = carte.id;
    }
    function zoomer(k, px, py) {
      const avant = camera.z;
      camera.z = Math.max(1, Math.min(10, camera.z + k));
      if (camera.z === avant) return;
      const gx = camera.x + (px * dpr) / avant, gy = camera.y + (py * dpr) / avant;
      camera.x = gx - (px * dpr) / camera.z;
      camera.y = gy - (py * dpr) / camera.z;
    }
    function glisser(dx, dy) { camera.x -= (dx * dpr) / camera.z; camera.y -= (dy * dpr) / camera.z; }
    // px, py : en pixels CSS dans le canvas.
    function caseSous(px, py, jeu) {
      const t = jeu.taille;
      const fx = (camera.x + (px * dpr) / camera.z) / t, fy = (camera.y + (py * dpr) / camera.z) / t;
      return { x: Math.floor(fx), y: Math.floor(fy), fx, fy }; // fx, fy : la position fine (Saga 1.43 : le feutre)
    }
    // Le centre d'une case, en pixels CSS dans le canvas (pour les tests, et poser un menu).
    const pointDe = (x, y, jeu) => ({ px: ((x + 0.5) * jeu.taille - camera.x) * camera.z / dpr, py: ((y + 0.5) * jeu.taille - camera.y) * camera.z / dpr });
    function pionSous(px, py, jeu, vue) {
      const c = caseSous(px, py, jeu);
      return [...(vue?.pions || [])].reverse().find((p) => p.x === c.x && p.y === c.y)?.id
        || (vue?.pnj || []).find((p) => p.x === c.x && p.y === c.y)?.id || null;
    }
    function flotter(id, texte, sorte = 'info') { flottants.push({ id, texte: String(texte), sorte, t0: performance.now() }); }
    function eclat(id, couleur = '#fff') { eclats.push({ id, couleur, t0: performance.now() }); }
    function secouer(id) { eclats.push({ id, couleur: '', secousse: true, t0: performance.now() }); }

    // --- Le dessin, en pixels de jeu (la transformation fait l'agrandissement) ---
    const ecranX = (gx) => Math.round((gx - camera.x) * camera.z);
    const ecranY = (gy) => Math.round((gy - camera.y) * camera.z);
    function enJeu() { ctx.setTransform(camera.z, 0, 0, camera.z, -Math.round(camera.x * camera.z), -Math.round(camera.y * camera.z)); }
    function enEcran() { ctx.setTransform(1, 0, 0, 1, 0, 0); }

    function calque(jeu, carte, c, maintenant) {
      const t = jeu.taille;
      const x0 = Math.max(0, Math.floor(camera.x / t)), y0 = Math.max(0, Math.floor(camera.y / t));
      const x1 = Math.min(carte.largeur - 1, Math.floor((camera.x + L / camera.z) / t)), y1 = Math.min(carte.hauteur - 1, Math.floor((camera.y + H / camera.z) / t));
      ctx.globalAlpha = c.opacite;
      ctx.globalCompositeOperation = c.fusion;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const n = c.cases[y * carte.largeur + x];
          const tuile = n >= 0 ? jeu.tuiles[n] : null;
          if (!tuile) continue;
          const im = tuile.images.length > 1 ? tuile.images[Math.floor(maintenant / tuile.duree) % tuile.images.length] : tuile.images[0];
          ctx.drawImage(jeu.planche, im.sx, im.sy, t, t, x * t, y * t, t, t);
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    function tuile(jeu, n, x, y, maintenant) {
      const tu = jeu.tuiles[n];
      if (!tu) return;
      const im = tu.images.length > 1 ? tu.images[Math.floor(maintenant / tu.duree) % tu.images.length] : tu.images[0];
      ctx.drawImage(jeu.planche, im.sx, im.sy, jeu.taille, jeu.taille, x, y, jeu.taille, jeu.taille);
    }
    // Un pion : le sprite du personnage, sa tuile, l'image du monstre dans un rond, ou une pastille.
    // Un jeton rond : une image (celle d'un monstre, ou importée par le MJ), recadrée dans le cercle.
    function rond(src, x, y, t, couleur = '#3a1d22', lisse = false) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x + t / 2, y + t / 2, t * 0.46, 0, Math.PI * 2);
      ctx.fillStyle = couleur;
      ctx.fill();
      ctx.clip();
      const im = image(src);
      if (im) {
        const k = Math.min(t / im.naturalWidth, t / im.naturalHeight);
        ctx.imageSmoothingEnabled = lisse && im.naturalWidth > t * 2; // une photo importée se lisse, le pixel art reste net
        ctx.drawImage(im, x + (t - im.naturalWidth * k) / 2, y + (t - im.naturalHeight * k) / 2, im.naturalWidth * k, im.naturalHeight * k);
        ctx.imageSmoothingEnabled = false;
      }
      ctx.restore();
    }
    let jetonSrc = () => '';
    function corps(jeu, p, x, y, maintenant) {
      const t = jeu.taille;
      if (p.tuile >= 0) { tuile(jeu, p.tuile, x, y, maintenant); return; }
      // Saga 1.42 : le jeton choisi par le MJ (une image, ou un personnage du jeu et son sprite).
      if (p.jeton?.image) {
        const src = jetonSrc(p.jeton.image);
        rond(src, x, y, t, p.sorte === 'heros' ? '#1d2a3a' : '#3a1d22', true);
        ctx.save();
        ctx.beginPath();
        ctx.arc(x + t / 2, y + t / 2, t * 0.46, 0, Math.PI * 2);
        ctx.lineWidth = Math.max(1, t / 16);
        ctx.strokeStyle = p.sorte === 'heros' ? 'rgba(125,190,255,.9)' : 'rgba(255,120,120,.9)';
        ctx.stroke();
        ctx.restore();
        return;
      }
      const mDeJeton = !p.jeton && p.monstre ? (jeu.donnees.monstres_jdr?.monstres_jdr || []).find((q) => q.id === p.monstre) : null;
      const idPerso = p.jeton?.personnage || (mDeJeton?.apparence) || p.personnage;
      const perso = idPerso ? jeu.personnages.get(idPerso) : null;
      if (perso && (p.jeton?.personnage || mDeJeton?.apparence)) {
        Sprites.ombre(ctx, x, y, t);
        if (perso.sprite) Sprites.dessinerSprite(ctx, perso.sprite, p.direction, 0, x, y, t);
        else if (perso.tuile >= 0) tuile(jeu, perso.tuile, x, y, maintenant);
        else Sprites.dessiner(ctx, perso.couleur || '#5ec8ff', p.direction, 0, x, y, t);
        return;
      }
      if (perso || p.sorte === 'heros' || (!p.monstre && !p.obstacle)) {
        const a = perso || jeu.heros;
        Sprites.ombre(ctx, x, y, t);
        if (a?.sprite) Sprites.dessinerSprite(ctx, a.sprite, p.direction, 0, x, y, t);
        else if (a?.tuile >= 0) tuile(jeu, a.tuile, x, y, maintenant);
        else Sprites.dessiner(ctx, a?.couleur || (p.sorte === 'heros' ? '#d94a4a' : '#5ec8ff'), p.direction, 0, x, y, t);
        return;
      }
      if (p.obstacle) {
        ctx.fillStyle = p.obstacle === 'couper' ? '#2f6b3a' : '#7d7466';
        ctx.fillRect(x + t * 0.15, y + t * 0.2, t * 0.7, t * 0.7);
        return;
      }
      const m = (jeu.donnees.monstres_jdr?.monstres_jdr || []).find((q) => q.id === p.monstre);
      rond(m?.image, x, y, t);
    }

    function dessiner(o) {
      const { jeu, carte, vue, maintenant } = o;
      jetonSrc = o.jeton || (() => '');
      taille();
      if (cadree !== carte.id) cadrer(carte, jeu);
      const t = jeu.taille, z = camera.z;
      enEcran();
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#07080c';
      ctx.fillRect(0, 0, L, H);
      // Saga 1.35 : autour de la carte, son reflet flou (les panneaux en verre ont quelque chose à laisser voir).
      if (ambiance.pret && ambiance.carte === carte.id && document.body.classList.contains('table-verre')) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        const k = Math.max(L / ambiance.toile.width, H / ambiance.toile.height) * 1.15;
        ctx.globalAlpha = 0.55;
        ctx.drawImage(ambiance.toile, (L - ambiance.toile.width * k) / 2, (H - ambiance.toile.height * k) / 2, ambiance.toile.width * k, ambiance.toile.height * k);
        ctx.globalAlpha = 1;
      }
      enJeu();
      // Tafl 1.37 : une scène image (une battlemap, un lieu), étirée sous les calques. Lissée : c'est une photo.
      if (carte.fond?.img.complete && carte.fond.img.naturalWidth) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(carte.fond.img, 0, 0, carte.largeur * t, carte.hauteur * t);
      }
      ctx.imageSmoothingEnabled = false;
      for (const c of carte.calques) if (c.visible && c.profondeur !== 'dessus') calque(jeu, carte, c, maintenant);
      // Les pions et les PNJ, du haut vers le bas (celui qui est plus bas passe devant).
      const secousses = new Map();
      for (const e of eclats) if (e.secousse && maintenant - e.t0 < 300) secousses.set(e.id, Math.round(Math.sin((maintenant - e.t0) / 22) * 2));
      const tous = [...(vue.pnj || []).map((p) => ({ ...p, sorte: 'pnj' })), ...vue.pions].sort((a, b) => a.y - b.y);
      for (const p of tous) {
        ctx.globalAlpha = p.cache ? 0.45 : p.ko ? 0.55 : 1;
        corps(jeu, p, p.x * t + (secousses.get(p.id) || 0), p.y * t, maintenant);
      }
      ctx.globalAlpha = 1;
      for (const c of carte.calques) if (c.visible && c.profondeur === 'dessus') calque(jeu, carte, c, maintenant);

      // --- Par-dessus, à la résolution de l'écran ---
      enEcran();
      const cx = (x) => ecranX(x * t), cy = (y) => ecranY(y * t), s = t * z;
      // Le reflet de la carte (ce qu'on en voit à l'écran, en tout petit), repris toutes les 2 secondes.
      if (!ambiance.pret || ambiance.carte !== carte.id || maintenant - ambiance.t > 2000) {
        const x0 = Math.max(0, cx(0)), y0 = Math.max(0, cy(0)), x1 = Math.min(L, cx(carte.largeur)), y1 = Math.min(H, cy(carte.hauteur));
        if (x1 - x0 > 8 && y1 - y0 > 8) {
          const a = ambiance.toile, ac = a.getContext('2d');
          a.width = 24; a.height = Math.max(8, Math.min(48, Math.round(24 * (y1 - y0) / (x1 - x0))));
          ac.imageSmoothingEnabled = true;
          ac.drawImage(canvas, x0, y0, x1 - x0, y1 - y0, 0, 0, a.width, a.height);
          Object.assign(ambiance, { pret: true, carte: carte.id, t: maintenant });
        }
      }
      // La grille.
      if (s >= 10) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x <= carte.largeur; x++) { ctx.moveTo(cx(x) + 0.5, cy(0)); ctx.lineTo(cx(x) + 0.5, cy(carte.hauteur)); }
        for (let y = 0; y <= carte.hauteur; y++) { ctx.moveTo(cx(0), cy(y) + 0.5); ctx.lineTo(cx(carte.largeur), cy(y) + 0.5); }
        ctx.stroke();
      }
      // Le brouillard : noir pour les joueurs (et l'aperçu du MJ), voilé pour le MJ.
      if (vue.brouillard) {
        const plein = !o.mj || o.apercu;
        ctx.fillStyle = plein ? '#05060a' : 'rgba(5, 6, 14, 0.58)';
        for (let y = 0; y < vue.hauteur; y++) {
          for (let x = 0; x < vue.largeur; x++) if (vue.masque[y * vue.largeur + x] === '0') ctx.fillRect(cx(x), cy(y), s + 1, s + 1);
        }
        // Saga 1.45 : déjà vu, plus en vue (vision dynamique) : le décor, voilé.
        ctx.fillStyle = plein ? 'rgba(5, 6, 14, 0.62)' : 'rgba(5, 6, 14, 0.28)';
        for (let y = 0; y < vue.hauteur; y++) {
          for (let x = 0; x < vue.largeur; x++) if (vue.masque[y * vue.largeur + x] === '2') ctx.fillRect(cx(x), cy(y), s + 1, s + 1);
        }
      }
      // Les pièces, pour le MJ : leur contour, plein si les joueurs la voient.
      if (o.mj && !o.apercu) {
        for (const pc of vue.pieces || []) {
          ctx.strokeStyle = pc.visible === 'tous' ? 'rgba(125, 220, 138, 0.7)' : pc.visible === 'mj' ? 'rgba(170, 140, 255, 0.7)' : 'rgba(240, 180, 76, 0.7)';
          ctx.setLineDash(pc.visible === 'tous' ? [] : [6, 4]);
          ctx.lineWidth = 2;
          ctx.strokeRect(cx(pc.x) + 1, cy(pc.y) + 1, pc.largeur * s - 2, pc.hauteur * s - 2);
          ctx.setLineDash([]);
        }
      }
      // Saga 1.32 : les gabarits de zone (de tous), puis l'aperçu de celui qu'on pose.
      const gabarit = (g, apercu) => {
        const coul = TableOutils.couleur(g.couleur);
        ctx.fillStyle = coul;
        ctx.globalAlpha = apercu ? 0.22 : 0.3;
        for (const i of TableOutils.casesGabarit(carte, g, vue.diagonales)) ctx.fillRect(cx(i % carte.largeur), cy(Math.floor(i / carte.largeur)), s, s);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = coul;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx(g.x) + s / 2, cy(g.y) + s / 2, Math.max(3, s * 0.12), 0, Math.PI * 2); ctx.stroke();
        if (g.forme === 'cone' || g.forme === 'ligne') {
          ctx.setLineDash([5, 4]);
          ctx.beginPath(); ctx.moveTo(cx(g.x) + s / 2, cy(g.y) + s / 2); ctx.lineTo(cx(g.vx) + s / 2, cy(g.vy) + s / 2); ctx.stroke();
          ctx.setLineDash([]);
        }
      };
      for (const g of vue.gabarits || []) gabarit(g, false);
      if (o.outil?.gabarit) gabarit(o.outil.gabarit, true);
      // Saga 1.43 : les dessins au feutre et les notes (celles du calque du MJ : en pointillés, chez lui seul).
      const trace = (d, apercu) => {
        if (!d.points?.length) return;
        ctx.strokeStyle = TableOutils.couleur(d.couleur);
        ctx.globalAlpha = apercu ? 0.7 : 0.9;
        ctx.lineWidth = Math.max(2, s * 0.08);
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.setLineDash(d.visible === 'mj' ? [Math.max(4, s * 0.2), Math.max(3, s * 0.14)] : []);
        ctx.beginPath();
        d.points.forEach(([x, y], k) => { if (k) ctx.lineTo(ecranX(x * t), ecranY(y * t)); else ctx.moveTo(ecranX(x * t), ecranY(y * t)); });
        if (d.points.length === 1) ctx.lineTo(ecranX(d.points[0][0] * t) + 0.1, ecranY(d.points[0][1] * t));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      };
      for (const d of vue.dessins || []) trace(d, false);
      if (o.outil?.trace) trace(o.outil.trace, true);
      for (const n of vue.notes || []) {
        const x0 = cx(n.x) + s * 0.5, y0 = cy(n.y) + s * 0.5;
        const coul = TableOutils.couleur(n.couleur);
        ctx.font = `600 ${Math.max(11, Math.round(s * 0.32))}px system-ui, sans-serif`;
        const texte = `${n.visible === 'mj' ? '🔒 ' : ''}${n.texte}`;
        const l = Math.min(ctx.measureText(texte).width, s * 8) + 12, h = Math.max(18, Math.round(s * 0.5));
        ctx.fillStyle = 'rgba(12,14,20,.82)';
        ctx.strokeStyle = coul;
        ctx.lineWidth = 2;
        ctx.setLineDash(n.visible === 'mj' ? [5, 3] : []);
        ctx.beginPath(); ctx.roundRect(x0 - l / 2, y0 - h / 2, l, h, 6); ctx.fill(); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(texte, x0, y0 + 1, s * 8);
        ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
      }
      // Les cases en surbrillance (où l'on peut aller, la zone d'un sort).
      if (o.cases) {
        for (const [i, sorte] of o.cases) {
          const x = i % carte.largeur, y = Math.floor(i / carte.largeur);
          ctx.fillStyle = sorte === 'zone' ? 'rgba(255, 120, 80, 0.28)' : 'rgba(110, 190, 255, 0.24)';
          ctx.fillRect(cx(x) + 1, cy(y) + 1, s - 1, s - 1);
        }
      }
      if (o.survol && o.survol.x >= 0 && o.survol.y >= 0 && o.survol.x < carte.largeur && o.survol.y < carte.hauteur) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.lineWidth = 1;
        ctx.strokeRect(cx(o.survol.x) + 0.5, cy(o.survol.y) + 0.5, s - 1, s - 1);
      }
      // Les anneaux : la cible possible, le pion actif (son tour), le pion choisi.
      const pulse = 0.55 + 0.45 * Math.sin(maintenant / 180);
      for (const p of vue.pions) {
        const x = cx(p.x), y = cy(p.y);
        if (o.cibles?.has(p.id)) { ctx.strokeStyle = `rgba(255, 96, 96, ${pulse})`; ctx.lineWidth = Math.max(2, z); ctx.strokeRect(x + 1, y + 1, s - 2, s - 2); }
        if (vue.combat?.actif === p.id) { ctx.strokeStyle = '#ffd36b'; ctx.lineWidth = Math.max(2, z * 0.75); ctx.beginPath(); ctx.ellipse(x + s / 2, y + s * 0.9, s * 0.42, s * 0.16, 0, 0, Math.PI * 2); ctx.stroke(); }
        if (o.selection === p.id) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.setLineDash([4, 3]); ctx.strokeRect(x + 2, y + 2, s - 4, s - 4); ctx.setLineDash([]); }
      }
      for (const p of vue.pnj || []) if (o.cibles?.has(p.id)) { ctx.strokeStyle = `rgba(255, 210, 110, ${pulse})`; ctx.lineWidth = 2; ctx.strokeRect(cx(p.x) + 1, cy(p.y) + 1, s - 2, s - 2); }
      // Les PV (barre), l'état d'un monstre pour les joueurs (une pastille), les noms.
      const police = Math.max(10, Math.min(15, Math.round(s * 0.24)));
      ctx.font = `600 ${police}px "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      for (const p of vue.pions) {
        const x = cx(p.x), y = cy(p.y);
        if (Number.isFinite(p.pv) && p.pvMax > 0) {
          const k = Math.max(0, Math.min(1, p.pv / p.pvMax));
          ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
          ctx.fillRect(x + s * 0.1, y + s - 4, s * 0.8, 4);
          ctx.fillStyle = k > 0.5 ? '#6fd17d' : k > 0.25 ? '#f0b44c' : '#ef5b5b';
          ctx.fillRect(x + s * 0.1, y + s - 4, s * 0.8 * k, 4);
        } else if (p.sante) {
          ctx.fillStyle = COULEURS[p.sante] || '#ccc';
          ctx.beginPath(); ctx.arc(x + s - 6, y + 6, 4, 0, Math.PI * 2); ctx.fill();
        }
        // Saga 1.32 : les marques, de petites pastilles en haut à gauche (l'initiale du nom dedans).
        if (p.marques?.length && s >= 14) {
          const r0 = Math.max(4, Math.min(8, s * 0.13));
          p.marques.slice(0, 6).forEach((m, k) => {
            const mx = x + r0 + 2 + (k % 3) * (r0 * 2 + 1), my = y + s - r0 - 7 - Math.floor(k / 3) * (r0 * 2 + 1);
            ctx.fillStyle = m.couleur;
            ctx.beginPath(); ctx.arc(mx, my, r0, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)'; ctx.lineWidth = 1; ctx.stroke();
            if (r0 >= 6) { ctx.save(); ctx.font = `700 ${Math.round(r0 * 1.2)}px "Segoe UI", system-ui, sans-serif`; ctx.fillStyle = '#10121a'; ctx.fillText(m.nom.replace(/^Marque /, '')[0].toUpperCase(), mx, my + r0 * 0.42); ctx.restore(); }
          });
        }
        if (p.cache) {
          ctx.fillStyle = 'rgba(150, 120, 255, 0.95)';
          ctx.fillRect(x + 2, y + 2, police * 1.9, police + 3);
          ctx.fillStyle = '#fff';
          ctx.fillText('MJ', x + 2 + police * 0.95, y + police + 1);
        }
        const montrerNom = p.sorte === 'heros' || (o.survol && o.survol.x === p.x && o.survol.y === p.y);
        if (montrerNom && s >= 18 && p.nom) {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.62)';
          const w = ctx.measureText(p.nom).width + 8;
          ctx.fillRect(x + s / 2 - w / 2, y + s + 1, w, police + 4);
          ctx.fillStyle = p.ko ? '#aaa' : '#f4f4f6';
          ctx.fillText(p.nom, x + s / 2, y + s + police + 1);
        }
      }
      // Saga 1.32 : les pings (des ondes qui s'élargissent, avec le nom de qui a pingé).
      for (const q of vue.pings || []) {
        if (!pingsVus.has(q.n)) pingsVus.set(q.n, maintenant);
        const dt = maintenant - pingsVus.get(q.n);
        if (dt > 2400) continue;
        const px = cx(q.x) + s / 2, py = cy(q.y) + s / 2;
        ctx.strokeStyle = q.couleur || '#ffd36b';
        for (let k = 0; k < 3; k++) {
          const f = ((dt / 900) + k / 3) % 1;
          ctx.globalAlpha = (1 - f) * Math.max(0, 1 - dt / 2400) * 1.4;
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(px, py, s * (0.3 + f * 1.6), 0, Math.PI * 2); ctx.stroke();
        }
        ctx.globalAlpha = Math.max(0, 1 - dt / 2400);
        ctx.fillStyle = q.couleur || '#ffd36b';
        ctx.fillText(q.qui || '', px, py - s * 0.7);
        ctx.globalAlpha = 1;
      }
      if (pingsVus.size > 40) for (const k of [...pingsVus.keys()].slice(0, 20)) pingsVus.delete(k);
      // La règle (seulement chez celui qui mesure).
      const rg = o.outil?.regle;
      if (rg) {
        const ax = cx(rg.de.x) + s / 2, ay = cy(rg.de.y) + s / 2, bx = cx(rg.a.x) + s / 2, by = cy(rg.a.y) + s / 2;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        ctx.strokeStyle = '#8fd6ff'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        ctx.fillStyle = '#8fd6ff';
        ctx.beginPath(); ctx.arc(ax, ay, 4, 0, Math.PI * 2); ctx.arc(bx, by, 4, 0, Math.PI * 2); ctx.fill();
        const w = ctx.measureText(rg.texte).width + 12;
        ctx.fillStyle = 'rgba(8, 10, 18, 0.85)';
        ctx.fillRect(bx - w / 2, by - s * 0.6 - police - 6, w, police + 8);
        ctx.fillStyle = '#e8f6ff';
        ctx.fillText(rg.texte, bx, by - s * 0.6 - 4);
      }
      // Les nombres qui montent (dégâts, soins) et les éclats d'un sort.
      const tous2 = [...vue.pions, ...(vue.pnj || [])];
      for (let i = eclats.length - 1; i >= 0; i--) {
        const e = eclats[i], dt = maintenant - e.t0;
        if (dt > 600) { eclats.splice(i, 1); continue; }
        const p = tous2.find((q) => q.id === e.id);
        if (!p || e.secousse) continue;
        ctx.fillStyle = e.couleur;
        ctx.globalAlpha = 0.5 * (1 - dt / 600);
        ctx.beginPath(); ctx.arc(cx(p.x) + s / 2, cy(p.y) + s / 2, s * (0.3 + dt / 900), 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.font = `800 ${Math.max(13, Math.round(s * 0.32))}px "Segoe UI", system-ui, sans-serif`;
      for (let i = flottants.length - 1; i >= 0; i--) {
        const f = flottants[i], dt = maintenant - f.t0;
        if (dt > 1300) { flottants.splice(i, 1); continue; }
        const p = tous2.find((q) => q.id === f.id);
        if (!p) continue;
        const couleur = { degats: '#ff6b6b', critique: '#ffd36b', soin: '#7dffb0', rate: '#cfd3dc', hausse: '#8fd6ff', baisse: '#c9a0ff' }[f.sorte] || '#ffffff';
        ctx.globalAlpha = Math.min(1, 2 - dt / 650);
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
        const fy = cy(p.y) - dt / 28;
        ctx.strokeText(f.texte, cx(p.x) + s / 2, fy);
        ctx.fillStyle = couleur;
        ctx.fillText(f.texte, cx(p.x) + s / 2, fy);
        ctx.globalAlpha = 1;
      }
    }

    const api = { taille, dessiner, cadrer, zoomer, glisser, caseSous, pointDe, pionSous, flotter, eclat, secouer, camera, oublier() { cadree = ''; }, marges: null };
    return api;
  }

  return { creer };
})();
