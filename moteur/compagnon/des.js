// Saga 1.34 : le plateau de dés du compagnon (et plus tard de la table).
//
// Des dés en verre qui roulent sur un tapis, dessinés sur un canvas 2D. Ils ne décident de rien : le
// résultat vient de l'hôte (JdrDes, la graine de la partie). On lance l'animation tout de suite (la
// secousse, le glisser), puis poser() donne les valeurs, et chaque dé s'arrête sur la sienne.
//
//   const p = PlateauDes.creer(canvas, { accent: '#ffb347' });
//   p.lancer(['d20', 'd6'], { x, y, vx, vy });   // la main qui jette (en px/s), facultatif
//   p.poser([17, 4]);                            // les valeurs de l'hôte
//   p.anime = false;                             // sans animation : les dés apparaissent posés
// Au-delà de MAX_ANIMES dés, pas d'animation (trop long à regarder).

const PlateauDes = (() => {
  const MAX_ANIMES = 10;
  const FACES = { d4: 4, d6: 6, d8: 8, d10: 10, d12: 12, d20: 20, d100: 100 };

  // La silhouette de chaque dé (rayon 1), et les arêtes intérieures qui font croire au volume.
  function polygone(n, r = 1, depart = -Math.PI / 2) {
    return Array.from({ length: n }, (_, i) => [Math.cos(depart + (i * 2 * Math.PI) / n) * r, Math.sin(depart + (i * 2 * Math.PI) / n) * r]);
  }
  const FORMES = {
    d4: { bord: polygone(3, 1.08, -Math.PI / 2), interieur: [], liens: [], centre: 0.18 },
    d6: { bord: [[-0.78, -0.78], [0.78, -0.78], [0.78, 0.78], [-0.78, 0.78]], interieur: [[-0.56, -0.56], [0.56, -0.56], [0.56, 0.56], [-0.56, 0.56]], liens: [[0, 0], [1, 1], [2, 2], [3, 3]], coins: 0.22 },
    d8: { bord: polygone(4, 1.02, -Math.PI / 2), interieur: polygone(3, 0.52, -Math.PI / 2), liens: [[0, 0], [1, 1], [3, 2], [2, 1], [2, 2]] },
    d10: { bord: [[0, -1.02], [0.92, -0.18], [0.62, 0.62], [0, 0.98], [-0.62, 0.62], [-0.92, -0.18]], interieur: [[0, -0.3], [0.5, 0.18], [0, 0.6], [-0.5, 0.18]], liens: [[0, 0], [1, 1], [3, 2], [5, 3], [2, 2], [4, 2]] },
    d12: { bord: polygone(10, 1, -Math.PI / 2), interieur: polygone(5, 0.55, -Math.PI / 2), liens: [[0, 0], [2, 1], [4, 2], [6, 3], [8, 4]] },
    d20: { bord: polygone(6, 1.02, -Math.PI / 2), interieur: polygone(3, 0.58, Math.PI / 2), liens: [[0, 2], [1, 0], [2, 0], [3, 1], [4, 1], [5, 2]] },
  };
  FORMES.d100 = FORMES.d10;

  // Une couleur en rgba, éclaircie ou foncée.
  function rgb(hex) {
    const h = String(hex || '#ffb347').replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16) || 0xffb347;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgba = ([r, g, b], a, k = 0) => `rgba(${Math.round(r + (k > 0 ? (255 - r) * k : r * k))},${Math.round(g + (k > 0 ? (255 - g) * k : g * k))},${Math.round(b + (k > 0 ? (255 - b) * k : b * k))},${a})`;

  function creer(canvas, o = {}) {
    const ctx = canvas.getContext('2d');
    let des = [], couleur = rgb(o.accent), boucle = 0, derniere = 0, w = 0, h = 0, ratio = 1;
    const api = { anime: o.anime !== false, finir: o.finir || (() => {}) };

    function taille() {
      ratio = Math.min(2, window.devicePixelRatio || 1);
      const r = canvas.getBoundingClientRect();
      w = Math.max(1, r.width); h = Math.max(1, r.height);
      canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio);
    }
    const rayon = () => Math.max(22, Math.min(46, Math.min(w, h) / (des.length > 6 ? 9 : 6.5)));

    function lancer(types, main = {}) {
      taille();
      const anime = api.anime && types.length <= MAX_ANIMES;
      const r = rayon();
      des = types.slice(0, 40).map((t, i) => {
        const sorte = FACES[t] ? t : 'd6';
        // Sans animation : posés en ligne, au centre.
        if (!anime) {
          const par = Math.max(1, Math.floor((w - 20) / (r * 2.4)));
          return { sorte, x: 10 + r * 1.2 + (i % par) * r * 2.4, y: h / 2 - r * 1.2 * (Math.ceil(types.length / par) - 1) + Math.floor(i / par) * r * 2.4, vx: 0, vy: 0, a: 0, va: 0, valeur: null, affiche: '…', arret: true, bascule: 0 };
        }
        const x0 = main.x ?? w * (0.2 + Math.random() * 0.15), y0 = main.y ?? h * (0.75 + Math.random() * 0.1);
        const vit = Math.hypot(main.vx || 0, main.vy || 0);
        const ang = vit > 50 ? Math.atan2(main.vy, main.vx) + (Math.random() - 0.5) * 0.6 : -Math.PI / 4 + (Math.random() - 0.5) * 0.9;
        const v = Math.max(900, Math.min(2600, vit || 1500)) * (0.8 + Math.random() * 0.4);
        return { sorte, x: x0 + (i % 4) * r * 0.5, y: y0 - Math.floor(i / 4) * r * 0.5, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, a: Math.random() * 6, va: (Math.random() < 0.5 ? -1 : 1) * (14 + Math.random() * 10), valeur: null, affiche: String(1 + Math.floor(Math.random() * FACES[sorte])), arret: false, bascule: Math.random() * 6, tic: 0 };
      });
      if (!boucle) { derniere = performance.now(); boucle = requestAnimationFrame(image); }
      return api;
    }
    function poser(valeurs) {
      valeurs.forEach((v, i) => { if (des[i]) { des[i].valeur = v; if (des[i].arret) des[i].affiche = String(v); } });
      if (!boucle) { derniere = performance.now(); boucle = requestAnimationFrame(image); }
    }
    function vider() { des = []; dessiner(); }

    // --- Le mouvement ---
    function pas(dt) {
      const r = rayon();
      let bouge = false;
      for (const d of des) {
        if (d.arret) {
          // Posé : il se redresse doucement pour qu'on lise le chiffre.
          d.a += (Math.round(d.a / (Math.PI * 2)) * Math.PI * 2 - d.a) * Math.min(1, dt * 10);
          d.bascule *= Math.max(0, 1 - dt * 10);
          if (Math.abs(d.bascule) > 0.01) bouge = true;
          continue;
        }
        bouge = true;
        d.x += d.vx * dt; d.y += d.vy * dt; d.a += d.va * dt; d.bascule += Math.hypot(d.vx, d.vy) * dt / r;
        const f = Math.pow(0.18, dt); // le tapis freine
        d.vx *= f; d.vy *= f; d.va *= Math.pow(0.25, dt);
        // Les bords rebondissent.
        if (d.x < r) { d.x = r; d.vx = Math.abs(d.vx) * 0.62; d.va *= -0.8; }
        if (d.x > w - r) { d.x = w - r; d.vx = -Math.abs(d.vx) * 0.62; d.va *= -0.8; }
        if (d.y < r) { d.y = r; d.vy = Math.abs(d.vy) * 0.62; }
        if (d.y > h - r) { d.y = h - r; d.vy = -Math.abs(d.vy) * 0.62; }
        // Le chiffre change tant qu'il roule vite.
        d.tic -= dt;
        if (d.tic <= 0) { d.tic = 0.06 + 0.25 / (1 + Math.hypot(d.vx, d.vy) / 300); d.affiche = String(1 + Math.floor(Math.random() * FACES[d.sorte])); }
        const lent = Math.hypot(d.vx, d.vy) < 60;
        if (lent && d.valeur != null) { d.arret = true; d.vx = d.vy = 0; d.affiche = String(d.valeur); }
        else if (lent) { d.vx += (Math.random() - 0.5) * 80; d.vy += (Math.random() - 0.5) * 80; } // il hésite tant que l'hôte n'a pas répondu
      }
      // Les dés se cognent.
      for (let i = 0; i < des.length; i++) for (let j = i + 1; j < des.length; j++) {
        const a = des[i], b = des[j];
        const dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy) || 0.01, min = r * 1.9;
        if (dist >= min) continue;
        const nx = dx / dist, ny = dy / dist, rec = (min - dist) / 2;
        if (!a.arret) { a.x -= nx * rec; a.y -= ny * rec; }
        if (!b.arret) { b.x += nx * rec; b.y += ny * rec; }
        const vr = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (vr < 0 && !a.arret && !b.arret) { a.vx += vr * nx * 0.9; a.vy += vr * ny * 0.9; b.vx -= vr * nx * 0.9; b.vy -= vr * ny * 0.9; }
      }
      return bouge;
    }

    // --- Le dessin ---
    function chemin(points, cx, cy, r, a, sy) {
      const c = Math.cos(a), s = Math.sin(a);
      return points.map(([x, y]) => [cx + (x * c - y * s) * r, cy + (x * s + y * c) * r * sy]);
    }
    function trace(pts, coins = 0) {
      ctx.beginPath();
      if (!coins) { pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); return; }
      const n = pts.length;
      for (let i = 0; i < n; i++) {
        const p = pts[i], q = pts[(i + 1) % n], m = pts[(i + n - 1) % n];
        const a1 = [p[0] + (m[0] - p[0]) * coins, p[1] + (m[1] - p[1]) * coins], a2 = [p[0] + (q[0] - p[0]) * coins, p[1] + (q[1] - p[1]) * coins];
        if (i) ctx.lineTo(...a1); else ctx.moveTo(...a1);
        ctx.quadraticCurveTo(p[0], p[1], ...a2);
      }
      ctx.closePath();
    }
    function de(d, r) {
      const f = FORMES[d.sorte];
      // La bascule (le dé qui roule sur lui-même) écrase un peu la silhouette.
      const sy = 0.82 + 0.18 * Math.abs(Math.cos(d.bascule));
      const bord = chemin(f.bord, d.x, d.y, r, d.a, sy);
      // L'ombre sur le tapis.
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,.38)';
      ctx.filter = 'blur(6px)';
      trace(chemin(f.bord, d.x + r * 0.14, d.y + r * 0.22, r, d.a, sy), f.coins);
      ctx.fill();
      ctx.restore();
      // Le verre : teinté de l'accent, plus clair en haut à gauche.
      const g = ctx.createLinearGradient(d.x - r, d.y - r, d.x + r, d.y + r);
      g.addColorStop(0, rgba(couleur, 0.78, 0.45));
      g.addColorStop(0.5, rgba(couleur, 0.5, 0));
      g.addColorStop(1, rgba(couleur, 0.62, -0.55));
      trace(bord, f.coins);
      ctx.fillStyle = g;
      ctx.fill();
      // Les arêtes et les facettes.
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(255,255,255,.55)';
      ctx.lineWidth = Math.max(1.2, r * 0.05);
      ctx.stroke();
      if (f.interieur.length) {
        const int = chemin(f.interieur, d.x, d.y, r, d.a, sy);
        ctx.strokeStyle = 'rgba(255,255,255,.22)';
        ctx.lineWidth = Math.max(1, r * 0.035);
        trace(int, f.coins ? f.coins * 0.8 : 0);
        ctx.stroke();
        ctx.beginPath();
        for (const [b, i] of f.liens) { const q = bord[b], k = f.coins ? 0.2 : 0.06; ctx.moveTo(q[0] + (d.x - q[0]) * k, q[1] + (d.y - q[1]) * k); ctx.lineTo(...int[i]); }
        ctx.stroke();
        // La face du dessus, plus claire.
        trace(int, f.coins ? f.coins * 0.8 : 0);
        ctx.fillStyle = 'rgba(255,255,255,.08)';
        ctx.fill();
      }
      // Le reflet.
      const rf = ctx.createRadialGradient(d.x - r * 0.35, d.y - r * 0.45, 0, d.x - r * 0.35, d.y - r * 0.45, r * 0.8);
      rf.addColorStop(0, 'rgba(255,255,255,.45)');
      rf.addColorStop(1, 'rgba(255,255,255,0)');
      trace(bord, f.coins);
      ctx.fillStyle = rf;
      ctx.fill();
      // Le chiffre (toujours droit, pour qu'on le lise), plus vif une fois posé.
      const max = d.arret && Number(d.affiche) === FACES[d.sorte], min = d.arret && Number(d.affiche) === 1 && FACES[d.sorte] > 2;
      ctx.font = `800 ${Math.round(r * (d.affiche.length > 2 ? 0.48 : d.sorte === 'd4' ? 0.6 : 0.68))}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = max ? 'rgba(120,255,180,.9)' : min ? 'rgba(255,90,90,.9)' : 'rgba(0,0,0,.6)';
      ctx.shadowBlur = d.arret ? r * 0.4 : r * 0.15;
      ctx.fillStyle = max ? '#d8ffe9' : min ? '#ffd6d6' : d.arret ? '#ffffff' : 'rgba(255,255,255,.75)';
      ctx.fillText(d.affiche, d.x, d.y + (d.sorte === 'd4' ? r * 0.12 : 0) + r * 0.03);
      ctx.shadowBlur = 0;
      // Le type, petit, sous le chiffre.
      if (d.arret) {
        ctx.font = `600 ${Math.round(r * 0.22)}px Inter, system-ui, sans-serif`;
        ctx.fillStyle = 'rgba(255,255,255,.6)';
        ctx.fillText(d.sorte, d.x, d.y + r * (d.sorte === 'd4' ? 0.55 : 0.5));
      }
    }
    function dessiner() {
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const r = rayon();
      for (const d of des) de(d, r);
    }
    function image(t) {
      const dt = Math.min(0.033, (t - derniere) / 1000);
      derniere = t;
      const bouge = pas(dt);
      dessiner();
      if (bouge) boucle = requestAnimationFrame(image);
      else { boucle = 0; if (des.length && des.every((d) => d.arret && d.valeur != null)) api.finir(des.map((d) => d.valeur)); }
    }

    window.addEventListener('resize', () => { taille(); dessiner(); });
    taille();
    Object.assign(api, { lancer, poser, vider });
    // (Object.assign copierait la valeur d'un get une fois pour toutes : on les définit.)
    Object.defineProperties(api, {
      accent: { set(c) { couleur = rgb(c); dessiner(); } },
      des: { get() { return des.map((d) => ({ sorte: d.sorte, valeur: d.valeur, arret: d.arret })); } },
    });
    return api;
  }

  // Une formule (« 2d6+1d20+3 ») en liste de dés à animer (le d100 compte pour un dé).
  function types(formule) {
    const out = [];
    for (const m of String(formule || '').toLowerCase().matchAll(/(\d*)\s*d\s*(\d+|%)/g)) {
      const n = Math.min(40, Number(m[1]) || 1), f = m[2] === '%' ? 'd100' : `d${m[2]}`;
      for (let i = 0; i < n; i++) out.push(FACES[f] ? f : 'd6');
    }
    return out;
  }

  return { creer, types, FACES, MAX_ANIMES };
})();

if (typeof module !== 'undefined') module.exports = PlateauDes;
