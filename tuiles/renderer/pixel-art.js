// Outils de pixel art pour Claude (Tafl 0.16) : de quoi dessiner des tuiles plus belles qu'à la main
// pixel par pixel. Utilisés par les actions rampe, peindre_tuile, animer_tuile et voir_tuile
// (renderer/claude-actions.js).
//
// - Rampes : à partir d'une couleur, une suite de teintes du plus sombre au plus clair, avec le
//   « décalage de teinte » des pixel artistes (les ombres tirent vers le bleu violet, les lumières
//   vers le jaune) au lieu d'un simple noircissement qui donne des couleurs ternes.
// - Opérations : formes, dégradés tramés, textures en amas qui se raccordent d'une tuile à l'autre,
//   contours, ombrage selon la lumière (en haut à gauche), ombre portée, symétrie…
// - Animations : défilement (eau qui coule), cycle de couleurs (reflets), balancement (herbes), scintillement.
// - Regard critique : couleurs utilisées, pixels isolés, raccords visibles, grands aplats.
//
// Tout travaille sur un tableau de pixels RGBA (4 octets par pixel) de w × h pixels.

const PixelArt = (() => {
  // --- Couleurs ---
  function hexToHsl(hex) {
    const [r, g, b] = hexToRgba(hex).map((v) => v / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s, l];
  }
  function hslToHex(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s = clamp(s, 0, 1);
    l = clamp(l, 0, 1);
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return rgbaToHex(Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255));
  }
  // Rapproche une teinte d'une autre par le chemin le plus court sur le cercle des couleurs.
  const versTeinte = (h, cible, force) => {
    const d = ((cible - h + 540) % 360) - 180;
    return h + d * clamp(force, 0, 1);
  };
  const luminance = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

  // Une rampe de n couleurs (3 à 8), de la plus sombre à la plus claire, autour de la couleur base.
  // ecart : de combien la lumière s'étale (0,1 à 0,8) ; decalage : force du décalage de teinte (0 à 1) ;
  // la couleur de base reste au milieu de la rampe.
  function rampe(base, n = 5, { ecart = 0.42, decalage = 0.5 } = {}) {
    const [h, s, l] = hexToHsl(base);
    n = clamp(Math.round(n), 3, 8);
    const milieu = (n - 1) / 2;
    const couleurs = [];
    for (let k = 0; k < n; k++) {
      const t = (k - milieu) / Math.max(1, milieu); // -1 (ombre) … 0 (base) … +1 (lumière)
      if (k === Math.round(milieu) && n % 2) { couleurs.push(normalizeHex(base)); continue; }
      // Les ombres vont vers 250° (bleu violet), les lumières vers 55° (jaune chaud).
      const teinte = t < 0 ? versTeinte(h, 250, -t * 0.28 * decalage * 2) : versTeinte(h, 55, t * 0.2 * decalage * 2);
      // La saturation monte un peu dans les ombres moyennes et baisse aux extrêmes (lumière presque blanche).
      const sat = s * (t < 0 ? 1 + 0.15 * -t - 0.35 * t * t : 1 - 0.3 * t);
      const lum = l + t * ecart * (t < 0 ? l * 1.6 : (1 - l) * 1.1);
      couleurs.push(hslToHex(teinte, sat, clamp(lum, 0.03, 0.97)));
    }
    return couleurs;
  }

  // --- Lire une couleur donnée par Claude : code de la palette, #rrggbb ou « . » (transparent) ---
  // nouvelles : les #rrggbb pas encore dans la palette (on les y ajoutera).
  function lireCouleur(doc, c, codes, nouvelles) {
    if (c === undefined || c === null || c === '') throw new Error('Il manque une couleur.');
    const s = String(c).trim();
    if (s === '.' || s.toLowerCase() === 'transparent') return [0, 0, 0, 0];
    const hex = normalizeHex(s);
    if (hex && (s.startsWith('#') || s.length > 1)) {
      if (!doc.palette.includes(hex)) nouvelles.add(hex);
      return hexToRgba(hex);
    }
    if (s.length === 1 && codes.indexOf(s) >= 0 && doc.palette[codes.indexOf(s)]) return hexToRgba(doc.palette[codes.indexOf(s)]);
    throw new Error(`Couleur « ${s} » : ni un code de la palette, ni #rrggbb, ni « . ».`);
  }

  // --- Outils sur un tableau de pixels ---
  function Toile(data, w, h) {
    const get = (x, y) => { const k = (y * w + x) * 4; return data.subarray(k, k + 4); };
    const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < w && y < h) data.set(c, (y * w + x) * 4); };
    const meme = (x, y, c) => { const p = get(x, y); return p[3] === 0 ? c[3] === 0 : p[0] === c[0] && p[1] === c[1] && p[2] === c[2] && p[3] === c[3]; };
    return { data, w, h, get, set, meme };
  }
  // Une graine donne toujours le même tirage : la même demande redonne la même tuile.
  function hasard(graine = 1) {
    let s = (Math.abs(Math.round(graine)) || 1) >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];

  // Les pixels de la « forme » : ceux des couleurs listées (codes de palette ou #rrggbb), sinon
  // tous les pixels non transparents.
  // zone : { x, y, l, h } pour ne prendre que les pixels de ce rectangle (quand l'objet partage des
  // couleurs avec le sol autour).
  function masque(t, forme, lire, zone = null) {
    const m = new Uint8Array(t.w * t.h);
    const couleurs = forme === undefined || forme === null || forme === '' ? null : (Array.isArray(forme) ? forme : [...String(forme)]).map(lire);
    for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) {
      if (zone && (x < zone.x || y < zone.y || x >= zone.x + zone.l || y >= zone.y + zone.h)) continue;
      if (couleurs ? couleurs.some((c) => t.meme(x, y, c)) : t.get(x, y)[3]) m[y * t.w + x] = 1;
    }
    return m;
  }
  const dans = (m, w, h, x, y, boucle) => {
    if (boucle) { x = (x + w) % w; y = (y + h) % h; } else if (x < 0 || y < 0 || x >= w || y >= h) return 0;
    return m[y * w + x];
  };
  // Les directions vers la lumière (en haut à gauche par défaut) et vers l'ombre.
  const LUMIERES = { haut_gauche: [-1, -1], haut: [0, -1], haut_droite: [1, -1], gauche: [-1, 0], droite: [1, 0] };

  function ligne(t, x0, y0, x1, y1, c) {
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    for (;;) {
      t.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * e;
      if (e2 >= dy) { e += dy; x0 += sx; }
      if (e2 <= dx) { e += dx; y0 += sy; }
    }
  }

  // Une opération de peindre_tuile. op.type : voir OPERATIONS plus bas.
  function operation(t, op, lire) {
    const n = (v, d = 0) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : d);
    const { w, h } = t;
    const zone = { x: n(op.x), y: n(op.y), l: n(op.largeur, w), h: n(op.hauteur, h) };
    const seul = op.seulement !== undefined ? masque(t, op.seulement, lire) : null;
    // contour, ombrage et ombre_portee : avec x, y, largeur ou hauteur, la forme se limite à ce rectangle.
    const zoneForme = ['x', 'y', 'largeur', 'hauteur'].some((k) => op[k] !== undefined) ? zone : null;
    const peut = (x, y) => x >= 0 && y >= 0 && x < w && y < h && (!seul || seul[y * w + x]);
    const poser = (x, y, c) => { if (peut(x, y)) t.set(x, y, c); };
    switch (op.type) {
      case 'remplir': {
        const c = lire(op.couleur);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) poser(x, y, c);
        break;
      }
      case 'rect': {
        const c = lire(op.couleur);
        for (let y = zone.y; y < zone.y + zone.h; y++) for (let x = zone.x; x < zone.x + zone.l; x++) {
          const bord = x === zone.x || y === zone.y || x === zone.x + zone.l - 1 || y === zone.y + zone.h - 1;
          if (!op.vide || bord) poser(x, y, c);
        }
        break;
      }
      case 'ellipse': {
        const c = lire(op.couleur);
        const rx = zone.l / 2, ry = zone.h / 2, cx = zone.x + rx, cy = zone.y + ry;
        const dedans = (x, y) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;
        for (let y = zone.y; y < zone.y + zone.h; y++) for (let x = zone.x; x < zone.x + zone.l; x++) {
          if (!dedans(x, y)) continue;
          if (op.vide && dedans(x - 1, y) && dedans(x + 1, y) && dedans(x, y - 1) && dedans(x, y + 1)) continue;
          poser(x, y, c);
        }
        break;
      }
      case 'ligne': {
        const c = lire(op.couleur);
        const tmp = Toile(new Uint8ClampedArray(w * h * 4), w, h);
        ligne(tmp, n(op.x1), n(op.y1), n(op.x2), n(op.y2), [1, 1, 1, 1]);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (tmp.get(x, y)[3]) poser(x, y, c);
        break;
      }
      case 'pot': {
        const c = lire(op.couleur);
        const x0 = n(op.x), y0 = n(op.y);
        if (!(x0 >= 0 && y0 >= 0 && x0 < w && y0 < h)) throw new Error('pot : x et y doivent être dans la tuile.');
        const cible = Array.from(t.get(x0, y0));
        if (t.meme(x0, y0, c)) break;
        const pile = [[x0, y0]], vu = new Uint8Array(w * h);
        while (pile.length) {
          const [x, y] = pile.pop();
          if (x < 0 || y < 0 || x >= w || y >= h || vu[y * w + x] || !t.meme(x, y, cible)) continue;
          vu[y * w + x] = 1;
          poser(x, y, c);
          pile.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
        }
        break;
      }
      case 'degrade': {
        const couleurs = (op.couleurs || []).map(lire);
        if (couleurs.length < 2) throw new Error('degrade : couleurs, au moins 2 (de la première à la dernière).');
        const dir = op.direction || 'bas';
        for (let y = zone.y; y < zone.y + zone.h; y++) for (let x = zone.x; x < zone.x + zone.l; x++) {
          const u = zone.l > 1 ? (x - zone.x) / (zone.l - 1) : 0, v = zone.h > 1 ? (y - zone.y) / (zone.h - 1) : 0;
          const p = { bas: v, haut: 1 - v, droite: u, gauche: 1 - u, diagonale: (u + v) / 2, radial: Math.min(1, Math.hypot(u - 0.5, v - 0.5) * 2) }[dir];
          if (p === undefined) throw new Error('degrade : direction bas, haut, droite, gauche, diagonale ou radial.');
          const pos = p * (couleurs.length - 1);
          let k = Math.floor(pos);
          // Trame (Bayer 4 × 4) : le passage d'une couleur à l'autre se fait par un damier régulier,
          // comme sur les consoles 16 bits, au lieu d'une marche d'escalier nette.
          if (op.trame !== false && k < couleurs.length - 1 && pos - k > (BAYER[y & 3][x & 3] + 0.5) / 16) k++;
          else if (op.trame === false) k = Math.round(pos);
          poser(x, y, couleurs[clamp(k, 0, couleurs.length - 1)]);
        }
        break;
      }
      case 'bruit': {
        // Une texture en petits amas (herbe, terre, pierre…), qui se raccorde d'un bord à l'autre de la
        // tuile (les amas qui dépassent reviennent de l'autre côté) : posée en mosaïque, on ne voit pas de couture.
        const couleurs = (op.couleurs || []).map(lire);
        if (!couleurs.length) throw new Error('bruit : couleurs, au moins une.');
        const r = hasard(op.graine ?? 7);
        const densite = clamp(Number(op.densite ?? 0.15), 0, 1);
        const taille = clamp(n(op.taille, 2), 1, 4);
        const forme = op.forme || 'amas';
        const nb = Math.round(zone.l * zone.h * densite / (forme === 'point' ? 1 : forme === 'touffe' ? 3 : taille));
        const boucle = op.raccord !== false;
        const poserB = (x, y, c) => {
          if (boucle) { x = zone.x + (((x - zone.x) % zone.l) + zone.l) % zone.l; y = zone.y + (((y - zone.y) % zone.h) + zone.h) % zone.h; }
          if (x >= zone.x && y >= zone.y && x < zone.x + zone.l && y < zone.y + zone.h) poser(x, y, c);
        };
        // espace : distance minimale entre deux marques (en boucle) ; des marques espacées font un motif
        // dessiné à la main, des marques serrées un camouflage.
        const espace = Math.max(0, Number(op.espace ?? (forme === 'touffe' ? 3 : 0)));
        const posees = [];
        const libre = (x, y) => !espace || posees.every(([px, py]) => {
          const dx = Math.min(Math.abs(px - x), zone.l - Math.abs(px - x)), dy = Math.min(Math.abs(py - y), zone.h - Math.abs(py - y));
          return Math.hypot(dx, dy) >= espace;
        });
        for (let i = 0, essais = 0; i < nb && essais < nb * 30; essais++) {
          const x = zone.x + Math.floor(r() * zone.l), y = zone.y + Math.floor(r() * zone.h);
          if (!libre(x, y)) continue;
          posees.push([x, y]);
          i++;
          // Touffes et brins : les couleurs vont par paires (base, pointe) ; les autres formes tirent dans toute la liste.
          const paires = (forme === 'touffe' || forme === 'brin') && couleurs.length > 1;
          const c = paires ? couleurs[2 * Math.floor(r() * Math.ceil(couleurs.length / 2))] : couleurs[Math.floor(r() * couleurs.length)];
          if (forme === 'point') poserB(x, y, c);
          else if (forme === 'touffe') {
            // Une touffe d'herbe en V (deux brins qui s'écartent), la couleur suivante en pointe si on l'a donnée.
            const k = couleurs.indexOf(c), pointe = couleurs[k + 1] || c;
            poserB(x, y, c);
            poserB(x - 1, y - 1, pointe);
            poserB(x + 1, y - 1, pointe);
            if (taille >= 3) { poserB(x - 1, y, c); poserB(x + 1, y - 2, pointe); }
          }
          else if (forme === 'brin') {
            // Un brin d'herbe : une petite verticale, avec la couleur suivante en pointe si on l'a donnée.
            const k = couleurs.indexOf(c);
            for (let j = 0; j < taille; j++) poserB(x, y - j, j === taille - 1 && couleurs[k + 1] ? couleurs[k + 1] : c);
          } else if (forme === 'trait') {
            for (let j = 0; j < taille; j++) poserB(x + j, y, c);
          } else {
            // Amas : quelques pixels voisins collés, jamais un pixel tout seul.
            let cx = x, cy = y;
            poserB(cx, cy, c);
            for (let j = 1; j < taille; j++) {
              const d = Math.floor(r() * 4);
              cx += [1, -1, 0, 0][d];
              cy += [0, 0, 1, -1][d];
              poserB(cx, cy, c);
            }
          }
        }
        break;
      }
      case 'taches': {
        // De grandes taches douces (bruit de valeur qui se raccorde d'un bord à l'autre) : les nuances
        // calmes d'une herbe, d'une terre ou d'une eau, au lieu de petits points partout. couleurs : une
        // par niveau (la première pour les taches, les suivantes pour leur cœur) ; densite : la part
        // couverte ; taille : la taille des taches en pixels ; bord tramé sauf trame: false.
        const couleurs = (op.couleurs || []).map(lire);
        if (!couleurs.length) throw new Error('taches : couleurs, au moins une.');
        const r = hasard(op.graine ?? 5);
        // Des bosses douces (gaussiennes) posées au hasard, de tailles variées ; la distance se compte en
        // boucle pour que les taches qui dépassent d'un bord reviennent de l'autre côté.
        const taille = clamp(Number(op.taille ?? 6), 2, 64);
        const nb = Math.max(2, Math.round((zone.l * zone.h) / (taille * taille) * 1.6));
        const bosses = Array.from({ length: nb }, () => ({ x: r() * zone.l, y: r() * zone.h, s: (taille / 2) * (0.55 + r() * 0.7), f: 0.6 + r() * 0.4 }));
        const valeur = (x, y) => {
          let v = 0;
          for (const b of bosses) {
            let dx = Math.abs(x + 0.5 - b.x), dy = Math.abs(y + 0.5 - b.y);
            if (op.raccord !== false) { dx = Math.min(dx, zone.l - dx); dy = Math.min(dy, zone.h - dy); }
            v += b.f * Math.exp(-(dx * dx + dy * dy) / (2 * b.s * b.s));
          }
          return v;
        };
        const densite = clamp(Number(op.densite ?? 0.35), 0, 1);
        // Le seuil qui couvre la part demandée, mesuré sur la tuile elle-même.
        const vals = [];
        for (let y = 0; y < zone.h; y++) for (let x = 0; x < zone.l; x++) vals.push(valeur(x, y));
        const tries = [...vals].sort((a, b) => b - a);
        const seuil = (k) => tries[clamp(Math.floor(tries.length * densite * (1 - k / couleurs.length)) - 1, 0, tries.length - 1)];
        const seuils = couleurs.map((_, k) => seuil(k));
        const bande = op.trame === false ? 0 : 0.035;
        for (let y = 0; y < zone.h; y++) for (let x = 0; x < zone.l; x++) {
          const v = vals[y * zone.l + x];
          const b = (BAYER[(zone.y + y) & 3][(zone.x + x) & 3] + 0.5) / 16 - 0.5;
          let c = null;
          seuils.forEach((s, k) => { if (v + b * bande * 2 >= s) c = couleurs[k]; });
          if (c) poser(zone.x + x, zone.y + y, c);
        }
        break;
      }
      case 'nettoyer': {
        // Le ménage du pixel artiste : chaque pixel qui n'a aucun voisin (haut, bas, gauche, droite) de sa
        // couleur prend la couleur la plus présente autour de lui. garder : les couleurs à laisser (fleurs, reflets…).
        const garder = op.garder ? [...String(op.garder)].map(lire) : [];
        const copie = Toile(new Uint8ClampedArray(t.data), w, h);
        const boucle = op.raccord !== false;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const p = Array.from(copie.get(x, y));
          if (!p[3] || garder.some((c) => copie.meme(x, y, c))) continue;
          const voisins = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [x + dx, y + dy]).map(([xx, yy]) => (boucle ? [(xx + w) % w, (yy + h) % h] : [xx, yy])).filter(([xx, yy]) => xx >= 0 && yy >= 0 && xx < w && yy < h);
          if (voisins.some(([xx, yy]) => copie.meme(xx, yy, p))) continue;
          const compte = new Map();
          for (const [xx, yy] of voisins) {
            const q = Array.from(copie.get(xx, yy));
            if (!q[3]) continue;
            const cle = q.join(',');
            compte.set(cle, (compte.get(cle) || 0) + 1);
          }
          const meilleur = [...compte.entries()].sort((a, b) => b[1] - a[1])[0];
          if (meilleur && meilleur[1] >= 2) poser(x, y, meilleur[0].split(',').map(Number));
        }
        break;
      }
      case 'contour': {
        // Un contour autour de la forme : à l'extérieur (sur les pixels hors de la forme), ou sur
        // le bord de la forme elle-même avec interieur: true (utile quand le fond est déjà peint).
        const c = lire(op.couleur);
        const m = masque(t, op.forme, lire, zoneForme);
        const cotes = op.cotes || 'tout';
        const voisins = { tout: [[1, 0], [-1, 0], [0, 1], [0, -1]], bas: [[0, -1]], bas_droite: [[-1, 0], [0, -1], [-1, -1]], haut: [[0, 1]] }[cotes];
        if (!voisins) throw new Error('contour : cotes tout, bas, bas_droite ou haut.');
        const a = [];
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          if (op.interieur) {
            if (m[y * w + x] && voisins.some(([dx, dy]) => !dans(m, w, h, x - dx, y - dy, op.raccord))) a.push([x, y]);
          } else if (!m[y * w + x] && voisins.some(([dx, dy]) => dans(m, w, h, x + dx, y + dy, op.raccord))) a.push([x, y]);
        }
        for (const [x, y] of a) poser(x, y, c);
        break;
      }
      case 'ombrage': {
        // Le volume : le bord de la forme tourné vers la lumière prend la couleur claire, le bord
        // opposé la sombre (epaisseur pixels). Lumière en haut à gauche par défaut.
        const m = masque(t, op.forme, lire, zoneForme);
        const [lx, ly] = LUMIERES[op.lumiere || 'haut_gauche'] || LUMIERES.haut_gauche;
        const clair = op.clair !== undefined ? lire(op.clair) : null;
        const sombre = op.sombre !== undefined ? lire(op.sombre) : null;
        const ep = clamp(n(op.epaisseur, 1), 1, 4);
        const a = [];
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          if (!m[y * w + x]) continue;
          let versLumiere = false, versOmbre = false;
          for (let k = 1; k <= ep; k++) {
            if (!dans(m, w, h, x + lx * k, y + ly * k, op.raccord)) versLumiere = true;
            if (!dans(m, w, h, x - lx * k, y - ly * k, op.raccord)) versOmbre = true;
          }
          if (versOmbre && sombre) a.push([x, y, sombre]);
          else if (versLumiere && clair) a.push([x, y, clair]);
        }
        for (const [x, y, c] of a) poser(x, y, c);
        break;
      }
      case 'ombre_portee': {
        // L'ombre que l'objet jette sur le sol, décalée de dx, dy (en bas à droite par défaut), seulement hors de l'objet.
        const c = lire(op.couleur);
        const m = masque(t, op.forme, lire, zoneForme);
        const dx = n(op.dx, 1), dy = n(op.dy, 1);
        const a = [];
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!m[y * w + x] && dans(m, w, h, x - dx, y - dy)) a.push([x, y]);
        for (const [x, y] of a) poser(x, y, c);
        break;
      }
      case 'pixels': {
        // Des pixels en texte (comme dessiner_tuile), posés à x, y ; « . » laisse le pixel tel quel.
        const lignes = Array.isArray(op.lignes) ? op.lignes.map(String) : [];
        lignes.forEach((l, j) => [...l].forEach((ch, i) => { if (ch !== '.' && ch !== ' ') poser(zone.x + i, zone.y + j, lire(ch)); }));
        break;
      }
      case 'symetrie': {
        // vertical : la moitié gauche recopiée en miroir à droite ; horizontal : le haut recopié en bas.
        const copie = new Uint8ClampedArray(t.data);
        const src = Toile(copie, w, h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          if (op.axe === 'horizontal' ? y >= h / 2 : x >= w / 2) {
            const p = op.axe === 'horizontal' ? src.get(x, h - 1 - y) : src.get(w - 1 - x, y);
            poser(x, y, Array.from(p));
          }
        }
        break;
      }
      case 'remplacer': {
        const de = lire(op.de), vers = lire(op.vers);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (t.meme(x, y, de)) poser(x, y, vers);
        break;
      }
      case 'decaler': {
        const copie = Toile(new Uint8ClampedArray(t.data), w, h);
        const dx = n(op.dx), dy = n(op.dy);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) t.set(x, y, copie.get(((x - dx) % w + w) % w, ((y - dy) % h + h) % h));
        break;
      }
      default:
        throw new Error(`Opération inconnue : ${op.type}. Possibles : ${OPERATIONS.join(', ')}.`);
    }
  }
  const OPERATIONS = ['remplir', 'rect', 'ellipse', 'ligne', 'pot', 'degrade', 'taches', 'bruit', 'nettoyer', 'contour', 'ombrage', 'ombre_portee', 'pixels', 'symetrie', 'remplacer', 'decaler'];

  // --- Animations : les images 1 à n-1 fabriquées à partir de l'image source ---
  function animer(src, w, h, mode, o, lire) {
    const n = clamp(Math.round(o.images || 4), 2, 16);
    const images = [];
    for (let k = 0; k < n; k++) {
      const data = new Uint8ClampedArray(src);
      const t = Toile(data, w, h);
      if (mode === 'defilement') {
        operation(t, { type: 'decaler', dx: Math.round((o.dx ?? 1) * k), dy: Math.round((o.dy ?? 0) * k) }, lire);
      } else if (mode === 'cycle') {
        // Chaque couleur de la liste prend la suivante, en boucle : les reflets de l'eau, une flamme, un néon…
        const couleurs = (o.couleurs || []).map(lire);
        if (couleurs.length < 2) throw new Error('cycle : couleurs, au moins 2 (dans l\'ordre du cycle).');
        const s = Toile(src, w, h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const j = couleurs.findIndex((c) => s.meme(x, y, c));
          if (j >= 0) t.set(x, y, couleurs[(j + k) % couleurs.length]);
        }
      } else if (mode === 'balancement') {
        // Les pixels de la forme penchent d'un côté puis de l'autre, plus en haut qu'en bas (herbes, fleurs, flammes).
        const s = Toile(src, w, h);
        const m = masque(s, o.forme, lire);
        const fond = o.fond !== undefined ? lire(o.fond) : [0, 0, 0, 0];
        const amp = clamp(Number(o.amplitude ?? 1), 0, 4);
        const bas = clamp(Math.round(o.pied ?? h), 1, h); // la rangée qui ne bouge pas
        const phase = Math.sin((2 * Math.PI * k) / n);
        for (let i = 0; i < w * h; i++) if (m[i]) t.set(i % w, Math.floor(i / w), fond);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          if (!m[y * w + x]) continue;
          const dx = Math.round(amp * phase * clamp((bas - 1 - y) / Math.max(1, bas - 1), 0, 1));
          if (x + dx >= 0 && x + dx < w) t.set(x + dx, y, Array.from(s.get(x, y)));
        }
      } else if (mode === 'scintillement') {
        // Quelques éclats qui apparaissent à des places différentes à chaque image.
        const c = lire(o.couleur);
        const s = Toile(src, w, h);
        const m = masque(s, o.forme, lire);
        const places = [];
        for (let i = 0; i < w * h; i++) if (m[i]) places.push(i);
        const r = hasard((o.graine ?? 3) * 31 + k);
        for (let j = 0; j < clamp(Math.round(o.nombre ?? 3), 1, 64) && places.length; j++) {
          const i = places[Math.floor(r() * places.length)];
          t.set(i % w, Math.floor(i / w), c);
          // Un éclat plus gros : une petite croix d'une autre couleur autour.
          if (o.couleur_croix !== undefined) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) t.set(i % w + dx, Math.floor(i / w) + dy, lire(o.couleur_croix));
        }
      } else throw new Error('mode : defilement, cycle, balancement ou scintillement.');
      images.push(data);
    }
    return images;
  }

  // --- Regard critique sur une image ---
  function analyse(data, w, h) {
    const t = Toile(data, w, h);
    const compte = new Map();
    let transparents = 0, isoles = [], lumMin = 255, lumMax = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = t.get(x, y);
      if (!p[3]) { transparents++; continue; }
      const cle = rgbaToHex(p[0], p[1], p[2]);
      compte.set(cle, (compte.get(cle) || 0) + 1);
      const lum = luminance(p[0], p[1], p[2]);
      lumMin = Math.min(lumMin, lum);
      lumMax = Math.max(lumMax, lum);
      // Isolé : aucun des 8 voisins n'a sa couleur, et il tranche nettement (le « bruit » qui salit une tuile).
      let pareil = false, ecart = 0, nb = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const xx = (x + dx + w) % w, yy = (y + dy + h) % h;
        const q = t.get(xx, yy);
        if (!q[3]) continue;
        if (q[0] === p[0] && q[1] === p[1] && q[2] === p[2]) pareil = true;
        ecart += Math.abs(luminance(q[0], q[1], q[2]) - lum);
        nb++;
      }
      if (!pareil && nb && ecart / nb > 40) isoles.push([x, y]);
    }
    const opaques = w * h - transparents;
    const remarques = [];
    const plusGros = [...compte.entries()].sort((a, b) => b[1] - a[1])[0];
    remarques.push(`${compte.size} couleur(s)${transparents ? `, ${Math.round((transparents / (w * h)) * 100)} % transparent` : ''}.`);
    if (compte.size > 12 && w <= 16) remarques.push('Beaucoup de couleurs pour une si petite tuile : 4 à 8 suffisent souvent, en rampes.');
    if (compte.size <= 2 && opaques > w * h * 0.5) remarques.push('Très peu de couleurs : ajoute une ombre et une lumière (rampe) pour le volume.');
    if (plusGros && plusGros[1] > opaques * 0.85 && opaques > 32) remarques.push(`Grand aplat : ${plusGros[0]} couvre ${Math.round((plusGros[1] / opaques) * 100)} % — une texture légère (bruit en amas, tramage) le rendrait plus vivant.`);
    if (isoles.length > Math.max(3, opaques * 0.06)) remarques.push(`${isoles.length} pixels isolés qui tranchent (ex. ${isoles.slice(0, 4).map(([x, y]) => `${x},${y}`).join(' ; ')}) : groupe-les en amas de 2 ou 3, ou adoucis leur couleur.`);
    // Agitation : la part des pixels voisins de couleurs différentes. Au-delà d'un tiers, l'œil voit du
    // bruit et la tuile paraît brouillonne, surtout un sol répété sur toute une carte.
    let paires = 0, differentes = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = t.get(x, y);
      if (!p[3]) continue;
      for (const [xx, yy] of [[x + 1, y], [x, y + 1]]) {
        if (xx >= w || yy >= h) continue;
        const q = t.get(xx, yy);
        if (!q[3]) continue;
        paires++;
        if (q[0] !== p[0] || q[1] !== p[1] || q[2] !== p[2]) differentes++;
      }
    }
    const agitation = paires ? differentes / paires : 0;
    remarques.push(`Agitation ${Math.round(agitation * 100)} % (un sol calme : moins de 25 % ; un objet détaillé : 30 à 45 %).`);
    if (agitation > 0.45 || (agitation > 0.3 && !transparents && plusGros && plusGros[1] > opaques * 0.5)) remarques.push('Trop chargé, ça fait brouillon : moins de marques, plus grandes et peu contrastées (taches), puis l\'opération nettoyer.');
    if (opaques && lumMax - lumMin < 40) remarques.push('Contraste faible : écarte davantage le plus clair et le plus sombre.');
    // Raccords (tuile pleine seulement) : le bord droit doit continuer le bord gauche, et le bas le haut.
    if (!transparents) {
      const diff = (a, b) => Math.abs(luminance(a[0], a[1], a[2]) - luminance(b[0], b[1], b[2]));
      let gd = 0, hb = 0, gdIn = 0, hbIn = 0;
      for (let i = 0; i < h; i++) { gd += diff(t.get(0, i), t.get(w - 1, i)); gdIn += diff(t.get(0, i), t.get(1, i)); }
      for (let i = 0; i < w; i++) { hb += diff(t.get(i, 0), t.get(i, h - 1)); hbIn += diff(t.get(i, 0), t.get(i, 1)); }
      if (gd / h > gdIn / h + 25) remarques.push('Raccord gauche / droite visible en mosaïque (les deux bords ne se continuent pas).');
      if (hb / w > hbIn / w + 25) remarques.push('Raccord haut / bas visible en mosaïque.');
    }
    return remarques;
  }

  // --- Ce que Claude regarde : la tuile, une mosaïque 3 × 3 et les images d'une animation ---
  function apercu(frames, w, h, { mosaique = true } = {}) {
    const n = frames.length;
    // Les images de 160 px de côté au plus, moins quand il y en a beaucoup (tout tient sur 1000 px).
    const k = Math.max(1, Math.floor(Math.min(160, 1000 / (n + 1.6)) / Math.max(w, h)));
    const marge = 8;
    const mos = mosaique ? 3 : 0;
    const kk = Math.max(1, Math.round(k / 2)); // la mosaïque, deux fois plus petite (et toujours en pixels entiers)
    const largeur = n * (w * k + marge) + (mos ? mos * w * kk : 0);
    const canvas = el('canvas', { width: largeur, height: Math.max(h * k, mos * h * kk) });
    canvas.pixelArt = true;
    const g = canvas.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#2b2b33';
    g.fillRect(0, 0, canvas.width, canvas.height);
    const petit = el('canvas', { width: w, height: h });
    const pg = petit.getContext('2d');
    frames.forEach((f, i) => {
      pg.putImageData(new ImageData(new Uint8ClampedArray(f), w, h), 0, 0);
      drawChecker(g, i * (w * k + marge), 0, w * k, h * k, Math.max(4, k * 2));
      g.drawImage(petit, i * (w * k + marge), 0, w * k, h * k);
    });
    if (mos) {
      pg.putImageData(new ImageData(new Uint8ClampedArray(frames[0]), w, h), 0, 0);
      const x0 = n * (w * k + marge);
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) g.drawImage(petit, x0 + i * w * kk, j * h * kk, w * kk, h * kk);
    }
    return canvas;
  }

  return { rampe, lireCouleur, Toile, operation, OPERATIONS, animer, analyse, apercu, hexToHsl };
})();
