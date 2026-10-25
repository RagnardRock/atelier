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
    const flottants = []; // { id, texte, sorte, t0 }
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
    function cadrer(carte, jeu) {
      taille();
      const t = jeu.taille;
      camera.z = Math.max(1, Math.min(8, Math.floor(Math.min(L / (carte.largeur * t), H / (carte.hauteur * t)))));
      camera.x = (carte.largeur * t - L / camera.z) / 2;
      camera.y = (carte.hauteur * t - H / camera.z) / 2;
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
      return { x: Math.floor((camera.x + (px * dpr) / camera.z) / t), y: Math.floor((camera.y + (py * dpr) / camera.z) / t) };
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
    function corps(jeu, p, x, y, maintenant) {
      const t = jeu.taille;
      if (p.tuile >= 0) { tuile(jeu, p.tuile, x, y, maintenant); return; }
      const perso = p.personnage ? jeu.personnages.get(p.personnage) : null;
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
      ctx.save();
      ctx.beginPath();
      ctx.arc(x + t / 2, y + t / 2, t * 0.46, 0, Math.PI * 2);
      ctx.fillStyle = '#3a1d22';
      ctx.fill();
      ctx.clip();
      const im = image(m?.image);
      if (im) {
        const k = Math.min(t / im.naturalWidth, t / im.naturalHeight);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(im, x + (t - im.naturalWidth * k) / 2, y + (t - im.naturalHeight * k) / 2, im.naturalWidth * k, im.naturalHeight * k);
      }
      ctx.restore();
    }

    function dessiner(o) {
      const { jeu, carte, vue, maintenant } = o;
      taille();
      if (cadree !== carte.id) cadrer(carte, jeu);
      const t = jeu.taille, z = camera.z;
      enEcran();
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#07080c';
      ctx.fillRect(0, 0, L, H);
      enJeu();
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

    return { taille, dessiner, cadrer, zoomer, glisser, caseSous, pointDe, pionSous, flotter, eclat, secouer, camera, oublier() { cadree = ''; } };
  }

  return { creer };
})();
