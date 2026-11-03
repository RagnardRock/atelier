// Saga 1.20 : les effets au passage (FORMAT.md › tiles.json › effet). Une tuile peut dire ce qui arrive à
// celui qui marche dessus : son corps se cache (les jambes dans les hautes herbes, le corps dans l'eau), la
// touffe frémit, des particules partent (feuilles, gouttes, poussière, flocons, bulles), des ondes
// s'élargissent, des traces de pas restent puis s'effacent, un bruit de pas, une vitesse. Rien n'est propre
// à un jeu : ce sont des briques que Tafl règle tuile par tuile.
//
// L'effet d'une case : la tuile la plus haute de la case (calques « dessous » et « joueur », pas « dessus »).
// Une tuile sans effet posée par-dessus (un pont sur l'eau) n'en a donc pas.
//
// Chaque personnage qui se dessine a une clé (le joueur : 'joueur'). Quand sa case change, il « entre »
// dans la nouvelle : c'est là que partent particules, traces, ondes et frémissement (et le son, pour le joueur).
//
//   const fx = EffetsSol.creer({ son: (nom) => … })
//   fx.en(carte, jeu, x, y)                       l'effet de la case (ou null)
//   fx.sous(carte, jeu, cle, px, py, dir, now)    suivre un personnage (pixels de la carte) → { ef, i } ou null
//   fx.dessinerSol(ctx, o)                        traces, ondes, touffes qui frémissent (sous les personnages)
//   fx.devant(ctx, o, px, py)                     la tuile repasse devant le bas du corps (herbes, rive d'eau à masque)
//   fx.surface(ctx, ef, x, ligne, t, now)         la ligne d'eau autour du corps (corps « eau »)
//   fx.dessinerParticules(ctx, o)                 les particules (devant les personnages)
//   o = { carte, jeu, cam, maintenant, tuile(n, x, y), devant(n, x, y) → true si la tuile a un masque }

const EffetsSol = (() => {
  const FRISSON = 380;     // ms : une touffe qui frémit
  const ONDE = 900;        // ms : une onde qui s'élargit
  const ONDE_REPOS = 750;  // ms entre deux ondes d'un personnage dans l'eau
  const MAX = { particules: 300, ondes: 80, traces: 400 };

  // Les particules : vitesse de départ (en seizièmes de tuile par seconde), gravité, durée de vie (ms).
  const SORTES = {
    feuilles: { vy: [-70, -40], vx: 30, g: 190, vie: 480, taille: [2, 1] },
    gouttes: { vy: [-80, -50], vx: 24, g: 260, vie: 420, taille: [1, 1] },
    poussiere: { vy: [-14, -6], vx: 14, g: 0, vie: 520, taille: [1, 3], rond: true },
    flocons: { vy: [-45, -25], vx: 18, g: 110, vie: 620, taille: [1, 1] },
    bulles: { vy: [-18, -10], vx: 6, g: 0, vie: 760, taille: [1, 2], rond: true, anneau: true },
  };

  const hasard = (a, b) => a + Math.random() * (b - a);
  const rgba = (hex, a) => {
    const n = parseInt(String(hex || '#ffffff').slice(1), 16) || 0;
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.max(0, Math.min(1, a))})`;
  };

  function creer({ son = () => {} } = {}) {
    let carteVue = null;
    let grille = null;   // grille[i] : l'effet de la case (ou null)
    let tuiles = null;   // tuiles[i] : le numéro de la tuile qui le donne
    const suivis = new Map();   // clé → { i, vu, onde }
    const frissons = new Map(); // case → début
    let particules = [], ondes = [], traces = [];

    // L'effet de chaque case de la carte, calculé une fois par carte.
    function preparer(carte, jeu) {
      if (carteVue === carte) return;
      carteVue = carte;
      const n = carte.largeur * carte.hauteur;
      grille = new Array(n).fill(null);
      tuiles = new Int32Array(n).fill(-1);
      const calques = carte.calques.filter((c) => c.profondeur !== 'dessus');
      for (let i = 0; i < n; i++) {
        for (let k = calques.length - 1; k >= 0; k--) {
          const v = calques[k].cases[i];
          if (v < 0 || !jeu.tuiles[v]) continue;
          grille[i] = jeu.tuiles[v].effet || null;
          tuiles[i] = v;
          break;
        }
      }
      suivis.clear(); frissons.clear();
      particules = []; ondes = []; traces = [];
    }

    function en(carte, jeu, x, y) {
      if (!carte || x < 0 || y < 0 || x >= carte.largeur || y >= carte.hauteur) return null;
      preparer(carte, jeu);
      return grille[y * carte.largeur + x];
    }

    // Les pieds d'un personnage sur sa case (pixels de la carte).
    const pieds = (cx, cy, t) => ({ x: cx * t + t / 2, y: cy * t + t * 0.86 });

    function entrer(ef, i, cx, cy, dir, cle, t, now) {
      // La touffe frémit (herbes, ou un bord d'herbes qui ne cache rien) ; dans l'eau, c'est le corps qui tangue.
      if (ef.remous && ef.corps !== 'eau') frissons.set(i, now);
      const p = pieds(cx, cy, t), u = t / 16;
      const s = SORTES[ef.particules];
      if (s) {
        for (let k = 0; k < ef.nombre && particules.length < MAX.particules; k++) {
          particules.push({
            x: p.x + hasard(-4, 4) * u, y: p.y - hasard(0, 3) * u,
            vx: hasard(-s.vx, s.vx) * u, vy: hasard(s.vy[0], s.vy[1]) * u, g: s.g * u,
            vie: s.vie * hasard(0.75, 1.15), t0: now, sorte: ef.particules, couleur: ef.couleur,
            taille: s.taille.map((v) => Math.max(1, Math.round(v * u))),
          });
        }
      }
      if (ef.ondes && ondes.length < MAX.ondes) ondes.push({ x: p.x, y: ef.corps === 'eau' ? cy * t + Math.round(t * (1 - ef.cache)) : p.y, t0: now, couleur: ef.couleur_ondes });
      if (ef.traces > 0) {
        traces.push({ x: p.x, y: cy * t + t * 0.72, dir, t0: now, duree: ef.traces * 1000, couleur: ef.couleur_traces });
        if (traces.length > MAX.traces) traces.shift();
      }
      if (cle === 'joueur' && ef.son) son(ef.son);
    }

    // Un personnage se dessine en (px, py) (pixels de la carte, coin haut gauche de sa case).
    function sous(carte, jeu, cle, px, py, dir, now) {
      preparer(carte, jeu);
      const t = jeu.taille;
      const cx = Math.floor((px + t / 2) / t), cy = Math.floor((py + t / 2) / t);
      if (cx < 0 || cy < 0 || cx >= carte.largeur || cy >= carte.hauteur) return null;
      const i = cy * carte.largeur + cx, ef = grille[i];
      const s = suivis.get(cle);
      if (!s) suivis.set(cle, { i, vu: now, onde: now });
      else {
        if (s.i !== i) { s.i = i; if (ef) entrer(ef, i, cx, cy, dir, cle, t, now); s.onde = now; }
        else if (ef?.ondes && ef.corps === 'eau' && now - s.onde > ONDE_REPOS && ondes.length < MAX.ondes) {
          // Dans l'eau, une onde de temps en temps autour de lui, à la surface (là où il est vraiment).
          ondes.push({ x: px + t / 2, y: py + Math.round(t * (1 - ef.cache)), t0: now, couleur: ef.couleur_ondes });
          s.onde = now;
        }
        s.vu = now;
      }
      return ef ? { ef, i, cx, cy, n: tuiles[i] } : null;
    }

    // Le décalage d'une touffe qui frémit (en pixels), 0 sinon.
    function frisson(i, now, t) {
      const d = frissons.get(i);
      if (d === undefined) return 0;
      const k = (now - d) / FRISSON;
      if (k >= 1 || k < 0) { frissons.delete(i); return 0; }
      return Math.round(Math.sin(k * Math.PI * 4) * (1 - k) * Math.max(1, t / 16));
    }

    function dessinerSol(ctx, { carte, jeu, cam, maintenant: now, devant: dessus }) {
      preparer(carte, jeu);
      const t = jeu.taille, u = t / 16;
      // Les personnages qu'on ne voit plus depuis 2 s sont oubliés (un PNJ parti, un joueur déconnecté).
      for (const [k, s] of suivis) if (now - s.vu > 2000) suivis.delete(k);
      // Les traces de pas : deux petites empreintes, dans le sens de la marche, qui s'effacent.
      traces = traces.filter((p) => now - p.t0 < p.duree);
      for (const p of traces) {
        const k = (now - p.t0) / p.duree;
        ctx.fillStyle = rgba(p.couleur, 0.32 * (1 - k * k));
        const x = Math.round(p.x - cam.x), y = Math.round(p.y - cam.y);
        const debout = p.dir === 'haut' || p.dir === 'bas';
        const [l, h] = debout ? [Math.max(1, Math.round(2 * u)), Math.max(1, Math.round(3 * u))] : [Math.max(1, Math.round(3 * u)), Math.max(1, Math.round(2 * u))];
        const e = Math.round(2.5 * u);
        if (debout) { ctx.fillRect(x - e - l + Math.round(u), y, l, h); ctx.fillRect(x + e - Math.round(u), y + Math.round(u), l, h); }
        else { ctx.fillRect(x - Math.round(l / 2), y - e + Math.round(u), l, h); ctx.fillRect(x - Math.round(l / 2) + (p.dir === 'gauche' ? -2 : 2) * Math.round(u), y + e - Math.round(u), l, h); }
      }
      // Les ondes : des ellipses qui s'élargissent et pâlissent.
      ondes = ondes.filter((o) => now - o.t0 < ONDE);
      ctx.save();
      ctx.lineWidth = Math.max(1, Math.round(u));
      for (const o of ondes) {
        const k = (now - o.t0) / ONDE;
        const rx = t * (0.28 + k * 0.45), ry = rx * 0.38;
        ctx.strokeStyle = rgba(o.couleur, 0.7 * (1 - k));
        ctx.beginPath();
        ctx.ellipse(Math.round(o.x - cam.x), Math.round(o.y - cam.y), rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
      // Les touffes qui frémissent : la tuile redessinée, décalée de quelques pixels.
      for (const i of [...frissons.keys()]) {
        const dx = frisson(i, now, t);
        if (!dx || tuiles[i] < 0) continue;
        const cx = i % carte.largeur, cy = Math.floor(i / carte.largeur);
        const x = cx * t - cam.x, y = cy * t - cam.y;
        ctx.save();
        ctx.beginPath(); ctx.rect(x, y, t, t); ctx.clip();
        // Une tuile à masque (un bord) : seules ses hautes herbes bougent ; sinon toute la tuile, et le vide
        // laissé d'un côté est comblé par elle-même (elle se raccorde).
        if (!dessus(tuiles[i], x + dx, y)) dessus(tuiles[i], x + dx - Math.sign(dx) * t, y);
        ctx.restore();
      }
    }

    // Corps « herbes » : la tuile de chaque case que touchent ses pieds repasse devant le bas du corps.
    function devant(ctx, { carte, jeu, cam, maintenant: now, devant: dessus }, px, py) {
      const t = jeu.taille;
      const x0 = Math.floor(px / t), x1 = Math.floor((px + t - 1) / t);
      const y0 = Math.floor((py + t * 0.1) / t), y1 = Math.floor((py + t - 1) / t);
      for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
        if (cx < 0 || cy < 0 || cx >= carte.largeur || cy >= carte.hauteur) continue;
        const i = cy * carte.largeur + cx, ef = grille[i];
        if (!ef || ef.corps === 'aucun' || ef.cache <= 0 || tuiles[i] < 0) continue;
        // La bande cachée : le bas de son corps (cache × la hauteur d'une case), dans cette case.
        const haut = Math.max(py + Math.round(t * (1 - ef.cache)), cy * t), bas = Math.min(py + t, cy * t + t);
        const gauche = Math.max(px, cx * t), droite = Math.min(px + t, cx * t + t);
        if (bas <= haut || droite <= gauche) continue;
        ctx.save();
        ctx.beginPath(); ctx.rect(gauche - cam.x, haut - cam.y, droite - gauche, bas - haut); ctx.clip();
        const dx = frisson(i, now, t);
        // Seulement ses hautes herbes si elle a un masque (une tuile de bord) ; sinon toute la tuile, et décalée
        // elle laisse un vide d'un côté, comblé avec elle-même (elle se raccorde).
        const masque = dessus(tuiles[i], cx * t - cam.x + dx, cy * t - cam.y);
        if (dx && !masque) dessus(tuiles[i], cx * t - cam.x + dx - Math.sign(dx) * t, cy * t - cam.y);
        ctx.restore();
      }
    }

    // Corps « eau » : une ligne claire à la surface, autour du corps.
    function surface(ctx, ef, x, ligne, t, now) {
      const u = t / 16;
      ctx.save();
      ctx.lineWidth = Math.max(1, Math.round(u));
      ctx.strokeStyle = rgba(ef.couleur_ondes, 0.75);
      const rx = t * (0.36 + 0.03 * Math.sin(now / 260)), ry = t * 0.11;
      ctx.beginPath();
      ctx.ellipse(x + t / 2, ligne, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    function dessinerParticules(ctx, { cam, maintenant: now }) {
      particules = particules.filter((p) => now - p.t0 < p.vie);
      for (const p of particules) {
        const a = (now - p.t0) / 1000, k = (now - p.t0) / p.vie;
        const s = SORTES[p.sorte];
        let x = p.x + p.vx * a, y = p.y + p.vy * a + 0.5 * p.g * a * a;
        if (p.sorte === 'bulles') x += Math.sin(a * 14) * p.taille[0];
        const alpha = k > 0.6 ? (1 - k) / 0.4 : 1;
        const sx = Math.round(x - cam.x), sy = Math.round(y - cam.y);
        if (s.rond) {
          const r = p.taille[0] + (p.taille[1] - p.taille[0]) * k;
          ctx.beginPath();
          ctx.arc(sx, sy, Math.max(0.5, r), 0, Math.PI * 2);
          if (s.anneau) { ctx.strokeStyle = rgba(p.couleur, 0.8 * alpha); ctx.lineWidth = 1; ctx.stroke(); }
          else { ctx.fillStyle = rgba(p.couleur, 0.55 * alpha); ctx.fill(); }
        } else {
          ctx.fillStyle = rgba(p.couleur, alpha);
          // Une feuille tourne : tantôt couchée, tantôt debout.
          const [l, h] = p.sorte === 'feuilles' && Math.floor(a * 12) % 2 ? [p.taille[1], p.taille[0]] : p.taille;
          ctx.fillRect(sx, sy, l, h);
        }
      }
    }

    return { en, sous, dessinerSol, devant, surface, dessinerParticules, oublier: () => { carteVue = null; } };
  }

  return { creer, SORTES: Object.keys(SORTES) };
})();
