// La horde du module « survivor » (Saga 1.30) : des centaines d'ennemis à l'écran sans ralentir.
//
// Le temps réel du pack action (action/temps-reel.js) fait réfléchir chaque ennemi et lui cherche un chemin
// (A*) : parfait pour une dizaine d'ennemis, beaucoup trop cher pour trois cents. Ici, tout est fait pour le
// nombre :
//   - un seul « champ de flux » pour toute la horde : la distance de chaque case au héros (un parcours en
//     largeur de la grille de passage de Tafl, refait quand le héros change de case). Chaque ennemi descend
//     simplement vers la case voisine la plus proche du héros : il contourne les murs sans A*.
//   - une grille de voisinage (des listes chaînées dans des tableaux typés, refaites à chaque image) : un
//     ennemi ne regarde que ses voisins pour ne pas se marcher dessus, une arme ne cherche que dans les cases
//     qu'elle touche.
//   - des objets réutilisés (ennemis, projectiles, gemmes) : pas de déchets à ramasser pendant la partie.
//
// Ce fichier ne dessine rien et ne connaît ni le jeu ni la partie : survivor.js lui donne la carte (sa taille,
// ses cases bloquées), la position du héros, et l'appelle à chaque image. Tout est en pixels de la carte.

const SurvivorHorde = (() => {
  const INFINI = 0xffff;
  const VOISINS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

  // monde : { t (taille d'une case), largeur, hauteur (en cases), bloque(cx, cy) }
  function creer(monde) {
    const t = monde.t, L = monde.largeur, H = monde.hauteur;
    // La grille de passage, lue une fois (bloque est appelé pour chaque case : c'est le moteur qui répond).
    const mur = new Uint8Array(L * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < L; x++) mur[y * L + x] = monde.bloque(x, y) ? 1 : 0;
    const bloquee = (cx, cy) => cx < 0 || cy < 0 || cx >= L || cy >= H || mur[cy * L + cx] === 1;

    // --- Le champ de flux : la distance (en pas) de chaque case au héros ---
    const distance = new Uint16Array(L * H).fill(INFINI);
    const file = new Int32Array(L * H);
    let sourceFlux = -1, ageFlux = 99;
    function refaireFlux(cx, cy) {
      distance.fill(INFINI);
      if (bloquee(cx, cy)) return;
      let tete = 0, queue = 0;
      distance[cy * L + cx] = 0;
      file[queue++] = cy * L + cx;
      while (tete < queue) {
        const i = file[tete++], x = i % L, y = (i - x) / L, d = distance[i] + 1;
        for (const [dx, dy] of VOISINS) {
          const nx = x + dx, ny = y + dy;
          if (bloquee(nx, ny)) continue;
          // En diagonale : pas à travers un coin de mur.
          if (dx && dy && (bloquee(x + dx, y) || bloquee(x, y + dy))) continue;
          const j = ny * L + nx;
          if (distance[j] !== INFINI) continue;
          distance[j] = d;
          file[queue++] = j;
        }
      }
    }
    const dist = (cx, cy) => (cx < 0 || cy < 0 || cx >= L || cy >= H ? INFINI : distance[cy * L + cx]);

    // --- Les ennemis ---
    const ennemis = [];   // objets réutilisés ; actif = false : libre
    let vivants = 0;
    const heros = { x: 0, y: 0, l: t * 0.6, h: t * 0.7 }; // le centre du corps du héros et sa taille
    function ajouter(def, pv, x, y, plus = {}) {
      let e = ennemis.find((q) => !q.actif);
      if (!e) { e = {}; ennemis.push(e); }
      Object.assign(e, {
        actif: true, def, pv, pvMax: pv, x, y, vx: 0, vy: 0, rx: 0, ry: 0,
        r: t * (def.boss ? 0.55 : 0.32) * (plus.echelle || 1), vitesse: def.vitesse * t,
        flash: 0, mort: 0, dir: 'bas', marche: Math.random(), bouge: false, contact: 0, frappe: 0, id: Math.random(),
        boss: Boolean(def.boss || plus.boss), echelle: plus.echelle || (def.boss ? 1.6 : 1),
      });
      vivants++;
      return e;
    }

    // --- La grille de voisinage (cases de 2 × t) ---
    const G = t * 2, GL = Math.ceil((L * t) / G) + 1, GH = Math.ceil((H * t) / G) + 1;
    const tetes = new Int32Array(GL * GH), suivants = new Int32Array(4096);
    function rangerGrille() {
      tetes.fill(-1);
      if (suivants.length < ennemis.length) throw new Error('trop d\'ennemis');
      for (let i = 0; i < ennemis.length; i++) {
        const e = ennemis[i];
        if (!e.actif || e.mort) continue;
        const g = Math.max(0, Math.min(GH - 1, Math.floor(e.y / G))) * GL + Math.max(0, Math.min(GL - 1, Math.floor(e.x / G)));
        suivants[i] = tetes[g];
        tetes[g] = i;
      }
    }
    // Chaque ennemi vivant dont le centre est à moins de r (+ son rayon) de (x, y).
    function autour(x, y, r, faire) {
      const gx0 = Math.max(0, Math.floor((x - r - t) / G)), gx1 = Math.min(GL - 1, Math.floor((x + r + t) / G));
      const gy0 = Math.max(0, Math.floor((y - r - t) / G)), gy1 = Math.min(GH - 1, Math.floor((y + r + t) / G));
      for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
        for (let i = tetes[gy * GL + gx]; i >= 0; i = suivants[i]) {
          const e = ennemis[i];
          if (!e.actif || e.mort) continue;
          const dx = e.x - x, dy = e.y - y, rr = r + e.r;
          if (dx * dx + dy * dy <= rr * rr) { if (faire(e) === false) return; }
        }
      }
    }
    function plusProche(x, y, max) {
      let meilleur = null, md = max * max;
      for (const e of ennemis) {
        if (!e.actif || e.mort) continue;
        const d = (e.x - x) ** 2 + (e.y - y) ** 2;
        if (d < md) { md = d; meilleur = e; }
      }
      return meilleur;
    }
    // n ennemis différents au hasard dans un rectangle (l'écran).
    function auHasard(n, r, hasard = Math.random) {
      const l = ennemis.filter((e) => e.actif && !e.mort && e.x >= r.x && e.y >= r.y && e.x <= r.x + r.l && e.y <= r.y + r.h);
      const out = [];
      while (out.length < n && l.length) out.push(l.splice(Math.floor(hasard() * l.length), 1)[0]);
      return out;
    }

    // Un ennemi touché : ses PV, son flash, un petit recul. Rend true s'il en meurt.
    function blesser(e, n, depuisX, depuisY, recul = 1) {
      if (!e.actif || e.mort) return false;
      e.pv -= n;
      e.flash = 0.12;
      const dx = e.x - depuisX, dy = e.y - depuisY, d = Math.hypot(dx, dy) || 1, k = (recul * t * 4) / Math.max(1, e.def.poids * (e.boss ? 3 : 1));
      e.rx += (dx / d) * k; e.ry += (dy / d) * k;
      if (e.pv <= 0) { e.mort = 0.0001; vivants--; return true; }
      return false;
    }

    // Une case libre juste hors de l'écran (vue : { x, y, l, h } en pixels), où le héros est joignable à pied.
    function pointApparition(vue, hasard = Math.random) {
      if (sourceFlux < 0) { const hx = Math.floor(heros.x / t), hy = Math.floor(heros.y / t); refaireFlux(hx, hy); sourceFlux = hy * L + hx; ageFlux = 0; }
      const cx = vue.x + vue.l / 2, cy = vue.y + vue.h / 2, rayon = Math.hypot(vue.l, vue.h) / 2 + t;
      for (let essai = 0; essai < 14; essai++) {
        const a = hasard() * Math.PI * 2, r = rayon * (1 + hasard() * 0.25);
        let x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        // Une petite arène : on apparaît au bord de la carte plutôt que nulle part.
        x = Math.max(t * 0.5, Math.min(L * t - t * 0.5, x)); y = Math.max(t * 0.5, Math.min(H * t - t * 0.5, y));
        const gx = Math.floor(x / t), gy = Math.floor(y / t);
        if (bloquee(gx, gy) || dist(gx, gy) === INFINI) continue;
        if (Math.hypot(x - heros.x, y - heros.y) < t * 3.5) continue;
        return { x: gx * t + t / 2, y: gy * t + t / 2 };
      }
      return null;
    }

    // Avancer sans entrer dans un mur : le centre et les quatre côtés du cercle restent hors des cases bloquées.
    function libreEn(x, y, r) {
      const k = r * 0.7;
      return !bloquee(Math.floor(x / t), Math.floor(y / t)) && !bloquee(Math.floor((x - k) / t), Math.floor(y / t)) && !bloquee(Math.floor((x + k) / t), Math.floor(y / t))
        && !bloquee(Math.floor(x / t), Math.floor((y - k) / t)) && !bloquee(Math.floor(x / t), Math.floor((y + k) / t));
    }
    function bouger(e, dx, dy) {
      let bouge = false;
      if (dx && libreEn(e.x + dx, e.y, e.r)) { e.x += dx; bouge = true; }
      if (dy && libreEn(e.x, e.y + dy, e.r)) { e.y += dy; bouge = true; }
      e.x = Math.max(e.r, Math.min(L * t - e.r, e.x)); e.y = Math.max(e.r, Math.min(H * t - e.r, e.y));
      return bouge;
    }

    // --- Les projectiles (dagues, couteaux) ---
    const projectiles = [];
    function tirer(p) {
      let q = projectiles.find((x) => !x.actif);
      if (!q) { q = {}; projectiles.push(q); }
      Object.assign(q, { actif: true, x: p.x, y: p.y, vx: p.vx, vy: p.vy, vie: p.vie, rayon: p.rayon, degats: p.degats, percee: p.percee, recul: p.recul ?? 1, couleur: p.couleur, arme: p.arme, touches: [], age: 0 });
      return q;
    }

    // --- Les gemmes d'expérience (et les cœurs, les coffres) au sol ---
    const gemmes = [];
    let nGemmes = 0;
    const MAX_GEMMES = 400;
    function poser(x, y, valeur, sorte = 'xp') {
      if (sorte === 'xp' && nGemmes >= MAX_GEMMES) {
        // Trop de gemmes : la valeur va dans la plus proche (une grosse gemme rouge, comme dans le genre).
        let g = null, md = Infinity;
        for (const q of gemmes) if (q.actif && q.sorte === 'xp') { const d = (q.x - x) ** 2 + (q.y - y) ** 2; if (d < md) { md = d; g = q; } }
        if (g) { g.valeur += valeur; return g; }
      }
      let g = gemmes.find((q) => !q.actif);
      if (!g) { g = {}; gemmes.push(g); }
      Object.assign(g, { actif: true, x, y, valeur, sorte, attire: false, v: 0, age: 0 });
      if (sorte === 'xp') nGemmes++;
      return g;
    }
    let aimant = t * 1.5;
    // Toutes les gemmes d'expérience volent vers le héros (un aimant ramassé).
    const toutAttirer = () => { for (const g of gemmes) if (g.actif && g.sorte === 'xp') g.attire = true; };

    // --- Une image ---
    // rappels : { contact(e) (un ennemi touche le héros), mort(e) (un ennemi vient de mourir), ramasse(g) }
    function avancer(dt, rappels) {
      const hcx = Math.floor(heros.x / t), hcy = Math.floor(heros.y / t), source = hcy * L + hcx;
      ageFlux += dt;
      if (source !== sourceFlux && ageFlux > 0.12) { refaireFlux(hcx, hcy); sourceFlux = source; ageFlux = 0; }
      rangerGrille();
      // Les ennemis : descendre le champ de flux, s'écarter des voisins, toucher le héros.
      for (let i = 0; i < ennemis.length; i++) {
        const e = ennemis[i];
        if (!e.actif) continue;
        if (e.mort) { e.mort += dt; if (e.mort > 0.3) e.actif = false; continue; }
        e.flash = Math.max(0, e.flash - dt);
        e.contact = Math.max(0, e.contact - dt);
        let dx = heros.x - e.x, dy = heros.y - e.y;
        const dh = Math.hypot(dx, dy) || 1;
        const cx = Math.floor(e.x / t), cy = Math.floor(e.y / t), ici = dist(cx, cy);
        if (ici !== INFINI && ici > 1 && dh > t * 1.5) {
          // La case voisine la plus proche du héros (en diagonale seulement si les deux côtés sont libres).
          let meilleur = ici, bx = 0, by = 0;
          for (const [vx, vy] of VOISINS) {
            const d = dist(cx + vx, cy + vy);
            if (d >= meilleur) continue;
            if (vx && vy && (bloquee(cx + vx, cy) || bloquee(cx, cy + vy))) continue;
            meilleur = d; bx = vx; by = vy;
          }
          if (bx || by) { dx = (cx + bx) * t + t / 2 - e.x; dy = (cy + by) * t + t / 2 - e.y; }
        }
        const n = Math.hypot(dx, dy) || 1;
        let mx = (dx / n) * e.vitesse * dt, my = (dy / n) * e.vitesse * dt;
        // S'écarter des voisins trop proches (sans les pousser fort : la horde reste compacte).
        let sx = 0, sy = 0;
        autour(e.x, e.y, e.r, (o) => {
          if (o === e) return;
          const ox = e.x - o.x, oy = e.y - o.y, d = Math.hypot(ox, oy) || 0.01, chev = e.r + o.r - d;
          if (chev > 0) { sx += (ox / d) * chev; sy += (oy / d) * chev; }
        });
        mx += sx * Math.min(1, dt * 10); my += sy * Math.min(1, dt * 10);
        // Le recul des coups.
        if (e.rx || e.ry) { mx += e.rx * dt * 6; my += e.ry * dt * 6; e.rx *= Math.max(0, 1 - dt * 6); e.ry *= Math.max(0, 1 - dt * 6); if (Math.abs(e.rx) + Math.abs(e.ry) < 0.5) e.rx = e.ry = 0; }
        e.bouge = bouger(e, mx, my);
        if (e.bouge) { e.marche += dt; e.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'gauche' : 'droite') : (dy < 0 ? 'haut' : 'bas'); }
        // Le contact avec le corps du héros.
        if (Math.abs(e.x - heros.x) < heros.l / 2 + e.r * 0.8 && Math.abs(e.y - heros.y) < heros.h / 2 + e.r * 0.8 && e.contact <= 0) {
          e.contact = 0.5;
          rappels.contact?.(e);
        }
      }
      // Les projectiles.
      for (const p of projectiles) {
        if (!p.actif) continue;
        p.age += dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.age >= p.vie || bloquee(Math.floor(p.x / t), Math.floor(p.y / t))) { p.actif = false; continue; }
        autour(p.x, p.y, p.rayon, (e) => {
          if (p.touches.includes(e.id)) return;
          p.touches.push(e.id);
          rappels.frappe?.(e, p.degats, p.x - p.vx * 0.05, p.y - p.vy * 0.05, p.recul, p.arme);
          if (p.touches.length > p.percee) { p.actif = false; return false; }
        });
      }
      // Les gemmes : l'aimant les attire, le héros les ramasse.
      for (const g of gemmes) {
        if (!g.actif) continue;
        g.age += dt;
        const dx = heros.x - g.x, dy = heros.y - g.y, d = Math.hypot(dx, dy);
        if (!g.attire && g.sorte !== 'coffre' && d < aimant) g.attire = true;
        if (g.attire) {
          g.v = Math.min(t * 18, g.v + t * 30 * dt);
          const k = Math.min(1, (g.v * dt) / Math.max(1, d));
          g.x += dx * k; g.y += dy * k;
        }
        if (d < t * 0.55) {
          g.actif = false;
          if (g.sorte === 'xp') nGemmes--;
          rappels.ramasse?.(g);
        }
      }
    }

    return {
      t, L, H, ennemis, projectiles, gemmes, heros,
      get vivants() { return vivants; },
      get nGemmes() { return nGemmes; },
      set aimant(v) { aimant = Math.max(t * 0.3, v); },
      get aimant() { return aimant; },
      bloquee, dist, ajouter, autour, plusProche, auHasard, blesser, pointApparition, tirer, poser, toutAttirer, avancer,
      // Pour les essais : refaire le champ de flux tout de suite.
      _flux: (cx, cy) => { refaireFlux(cx, cy); sourceFlux = cy * L + cx; ageFlux = 0; },
      vider() { for (const e of ennemis) e.actif = false; for (const p of projectiles) p.actif = false; for (const g of gemmes) g.actif = false; vivants = 0; nGemmes = 0; },
    };
  }

  return { creer, INFINI };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SurvivorHorde;
