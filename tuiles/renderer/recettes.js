// Recettes de tuiles (Tafl 1.14) : des tuiles propres en un seul appel, pour Loki (surtout en local,
// où un petit modèle n'arrive pas à composer du pixel art opération par opération) et pour Ragna.
//
// Une recette donne la liste des opérations de peindre_tuile (renderer/pixel-art.js) pour une matière :
// herbe, terre, chemin, pavés, eau, sable, roche, rocher, falaise, mur de pierre, mur de bois, toit,
// fleurs. Elle suit les règles de style de Ragna (Tafl 0.17) : un fond calme, quelques marques
// seulement, des rampes de couleurs (ombres vers le violet, lumières vers le jaune), la lumière en haut
// à gauche, et des tuiles de sol qui se raccordent en mosaïque. La graine change le tirage : même
// recette, autre graine = une variante qui se pose à côté sans répétition visible.
//
// Couleurs par défaut : les rampes de la palette « Brume » (sombre et feutrée). Avec une couleur de
// base, la rampe est calculée autour d'elle (PixelArt.rampe).

const Recettes = (() => {
  // Rampes de 5 couleurs, de la plus sombre à la plus claire.
  const RAMPES = {
    herbe: ['#2c3f3a', '#3f5a4f', '#567563', '#739281', '#9bb5a0'],
    terre: ['#3b3036', '#57484a', '#776560', '#998676', '#b8a690'],
    pierre: ['#24222f', '#383747', '#524f62', '#706c7e', '#9590a0'],
    bois: ['#2e1f26', '#4a3238', '#6b4a47', '#8e6a5a', '#b08c72'],
    eau: ['#172338', '#23395a', '#345a7e', '#4f86a8', '#8bc0d4'],
    sable: ['#5e4a46', '#8a7461', '#ad9677', '#c9b48f', '#e0d2b0'],
    ardoise: ['#1d1d2b', '#2c2d40', '#3f4259', '#5a5f78', '#7f86a0'],
    feuillage: ['#1d2a2e', '#2a3d40', '#3d5655', '#587470', '#7f9a8c'],
    neige: ['#5d6a85', '#8593ad', '#b9c4d6', '#dfe6ee', '#f5f8fb'],
    glace: ['#2a4a66', '#3f6f8f', '#6aa0bd', '#a9d2e3', '#e4f4fa'],
    boue: ['#2b2125', '#3d2e2c', '#55413a', '#6e5848', '#8a7360'],
    grotte: ['#14111c', '#1f1b2a', '#2d2839', '#3f394d', '#58516a'],
    carreau: ['#3a3640', '#5a5563', '#8a8494', '#b3adbb', '#d8d2dd'],
    tapis: ['#3a1a24', '#5a2632', '#7a2f3a', '#9c4a48', '#c27a62'],
    terre_cuite: ['#3e2228', '#64352f', '#8e5038', '#b27448', '#d29c6a'],
    toit_bleu: ['#181d33', '#223155', '#2f4a7e', '#4a6fa6', '#7e9fca'],
    crepi: ['#6e6464', '#a39686', '#cfc1a8', '#e3d8c2', '#f2ebdc'],
  };
  const FLEURS = ['#d8d0c0', '#e6b45a', '#c8503e', '#7fb3e0'];

  // Un petit tirage reproductible (le même que PixelArt, pour qu'une graine redonne la même tuile).
  function hasard(graine) {
    let s = (Math.abs(Math.round(graine)) || 1) >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Un rectangle qui revient de l'autre côté quand il dépasse (pour les motifs qui se raccordent).
  function rectBoucle(s, x, y, l, h, couleur) {
    const ops = [];
    for (const dx of [0, -s]) for (const dy of [0, -s]) {
      const xx = x + dx, yy = y + dy;
      if (xx + l <= 0 || yy + h <= 0 || xx >= s || yy >= s) continue;
      ops.push({ type: 'rect', x: xx, y: yy, largeur: l, hauteur: h, couleur });
    }
    return ops;
  }
  const point = (x, y, couleur) => ({ type: 'rect', x, y, largeur: 1, hauteur: 1, couleur });
  // Le mélange de deux couleurs #rrggbb (t = 0 : a, 1 : b) : une nuance à mi-chemin, pour des taches douces.
  function melange(a, b, t = 0.5) {
    const v = (h, i) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
    return `#${[0, 1, 2].map((i) => Math.round(v(a, i) * (1 - t) + v(b, i) * t).toString(16).padStart(2, '0')).join('')}`;
  }

  // Le fond calme d'un sol : un aplat, de grandes taches à peine plus sombres (une nuance à mi-chemin
  // de la couleur d'ombre), quelques taches plus claires, puis le ménage.
  const fond = (r, s, g, { sombre = 0.32, clair = 0.12, taille = 9 } = {}) => [
    { type: 'remplir', couleur: r[2] },
    { type: 'taches', couleurs: [melange(r[2], r[1], 0.55)], densite: sombre, taille: taille * s / 16, graine: g },
    { type: 'taches', couleurs: [melange(r[2], r[3], 0.6)], densite: clair, taille: (taille - 3) * s / 16, graine: g + 17 },
    { type: 'nettoyer' },
  ];

  // Des pierres posées en rangées décalées (pavés, mur) : joints sombres, pierres éclairées sur leur
  // rangée du haut et dans l'ombre sur celle du bas (lumière en haut à gauche), coins arrondis.
  function pierres(r, s, g, { l, h, decalage, coins }) {
    const rnd = hasard(g);
    const ops = [{ type: 'remplir', couleur: r[1] }];
    for (let y = 0, j = 0; y < s; y += h, j++) {
      const ox = (j % 2) * decalage;
      // Des largeurs tirées au hasard (pavés) ou toutes égales (mur) ; chaque rangée fait toute la tuile.
      const largeurs = [];
      if (Array.isArray(l)) {
        const min = Math.min(...l), max = Math.max(...l);
        let reste = s;
        while (reste > 0) {
          let v = reste <= max ? reste : l[Math.floor(rnd() * l.length)];
          if (reste - v > 0 && reste - v < min) v = reste - min;
          largeurs.push(v);
          reste -= v;
        }
      } else for (let x = 0; x < s; x += l) largeurs.push(l);
      let x = 0;
      for (const lp of largeurs) {
        const x0 = x + ox, l = lp;
        x += lp;
        // Pas toutes de la même teinte : moins mécanique.
        const c = rnd() < 0.3 ? melange(r[2], r[3], 0.35) : r[2];
        ops.push(...rectBoucle(s, x0, y, l - 1, h - 1, c));
        ops.push(...rectBoucle(s, x0, y, l - 1, 1, r[3]));            // le haut éclairé
        ops.push(...rectBoucle(s, x0, y, 1, h - 1, melange(c, r[3], 0.5))); // le côté gauche, un peu éclairé
        ops.push(...rectBoucle(s, (x0 + l - 2) % s, y + 1, 1, h - 2, melange(c, r[1], 0.5))); // le côté droit dans l'ombre
        if (coins) ops.push(point(x0 % s, y, r[1]), point((x0 + l - 2) % s, y + h - 2, r[0]));
      }
      ops.push({ type: 'rect', x: 0, y: y + h - 1, largeur: s, hauteur: 1, couleur: r[0] }); // le joint du bas, plus profond
    }
    ops.push({ type: 'bruit', couleurs: [r[4]], forme: 'point', densite: 0.02, espace: 5, graine: g + 9, seulement: [r[3]] });
    return ops;
  }

  // Un objet en volume sur fond transparent (rocher, buisson…) : la forme est une union d'ellipses
  // au bord irrégulier ; la lumière vient d'en haut à gauche, en 4 bandes de la rampe ; un contour
  // sélectif (sombre en bas à droite, plus doux en haut à gauche). marques : des creux sombres
  // (pierre) ; feuilles : des touffes claires et sombres (feuillage).
  function volume(r, s, g, ellipses, { arete = false, marques = 0, feuilles = false, seuils = [0.78, 0.56, 0.22] } = {}) {
    const rnd = hasard(g + 101);
    const bosses = Array.from({ length: 5 }, () => ({ a: rnd() * Math.PI * 2, f: 0.08 + rnd() * 0.12 }));
    const forme = new Uint8Array(s * s), teinte = new Float32Array(s * s).fill(-9);
    for (const k of ellipses) {
      const fond = k.plat ? k.cy + k.ry * k.plat : Infinity;
      for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
        const dx = (x + 0.5 - k.cx) / k.rx, dy = (y + 0.5 - k.cy) / k.ry;
        const ang = Math.atan2(dy, dx);
        let rayon = 1;
        for (const b of bosses) rayon -= b.f * Math.max(0, Math.cos(ang - b.a)) ** 6;
        const d = Math.hypot(dx, dy);
        if (d > rayon || y + 0.5 > fond) continue;
        const nz = Math.sqrt(Math.max(0, 1 - Math.min(1, d / rayon) ** 2));
        let l = (-dx * 0.55 - dy * 0.75 + nz * 0.9) / 1.4;
        if (arete && dx * 0.6 + dy * 0.4 > 0.15) l -= 0.35;
        forme[y * s + x] = 1;
        teinte[y * s + x] = Math.max(teinte[y * s + x], l);
      }
    }
    const dans = (x, y) => x >= 0 && y >= 0 && x < s && y < s && forme[y * s + x];
    const ops = [];
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      if (!dans(x, y)) continue;
      const l = teinte[y * s + x];
      ops.push(point(x, y, l > seuils[0] ? r[4] : l > seuils[1] ? r[3] : l > seuils[2] ? r[2] : r[1]));
    }
    for (let k = 0; k < marques; k++) {
      const x = Math.floor(rnd() * s), y = Math.floor(rnd() * s);
      if (dans(x, y) && dans(x + 1, y) && dans(x, y - 1) && teinte[y * s + x] > seuils[2]) ops.push(point(x, y, r[1]), point(x + 1, y, r[1]), point(x, y - 1, r[3]));
    }
    // Feuillage : des petites touffes (un pixel clair au-dessus d'un sombre) sur toute la forme.
    if (feuilles) for (let y = 1; y < s; y += 3) for (let x = (y % 2) * 2; x < s; x += 4) {
      const xx = x + Math.floor(rnd() * 2);
      if (!dans(xx, y) || !dans(xx, y - 1)) continue;
      const l = teinte[y * s + xx];
      ops.push(point(xx, y, l > seuils[1] ? r[2] : r[1]), point(xx, y - 1, l > seuils[2] ? r[4] : r[3]));
    }
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      if (dans(x, y)) continue;
      if (dans(x, y - 1) || dans(x - 1, y) || dans(x - 1, y - 1)) ops.push(point(x, y, r[0]));
      else if (dans(x, y + 1) || dans(x + 1, y)) ops.push(point(x, y, melange(r[0], r[1], 0.6)));
    }
    return ops;
  }

  const RECETTES = {
    herbe: {
      rampe: 'herbe', libelle: 'Herbe rase, calme, avec quelques touffes',
      ops: (r, s, g) => [
        ...fond(r, s, g),
        { type: 'bruit', couleurs: [r[1], r[3]], forme: 'touffe', densite: 0.055, espace: 5 * s / 16, graine: g + 5 },
        { type: 'bruit', couleurs: [r[4]], forme: 'point', densite: 0.008, espace: 6, graine: g + 7, seulement: [r[2], r[3]] },
      ],
    },
    fleurs: {
      rampe: 'herbe', libelle: 'Herbe avec quelques fleurs',
      ops: (r, s, g) => [
        ...RECETTES.herbe.ops(r, s, g),
        { type: 'bruit', couleurs: [FLEURS[g % 3], FLEURS[(g + 1) % 3]], forme: 'point', densite: 0.022, espace: 4 * s / 16, graine: g + 23 },
      ],
    },
    terre: {
      rampe: 'terre', libelle: 'Terre battue, quelques cailloux',
      ops: (r, s, g) => [
        ...fond(r, s, g, { sombre: 0.32, clair: 0.14, taille: 6 }),
        { type: 'bruit', couleurs: [r[1]], forme: 'amas', taille: 2, densite: 0.035, espace: 4 * s / 16, graine: g + 5 },
        { type: 'bruit', couleurs: [r[4]], forme: 'point', densite: 0.012, espace: 5, graine: g + 7 },
      ],
    },
    chemin: {
      rampe: 'terre', libelle: 'Chemin de terre tassée (plus clair, des graviers)',
      ops: (r, s, g) => [
        { type: 'remplir', couleur: r[3] },
        { type: 'taches', couleurs: [r[2]], densite: 0.35, taille: 6 * s / 16, graine: g },
        { type: 'taches', couleurs: [r[4]], densite: 0.1, taille: 4 * s / 16, graine: g + 17 },
        { type: 'nettoyer' },
        // Des graviers : un point clair avec son ombre dessous.
        ...(() => {
          const rnd = hasard(g + 31), ops = [];
          for (let k = 0; k < 4; k++) {
            const x = Math.floor(rnd() * s), y = Math.floor(rnd() * (s - 1));
            ops.push(point(x, y, r[4]), point(x, (y + 1) % s, r[1]));
          }
          return ops;
        })(),
      ],
    },
    paves: {
      rampe: 'pierre', libelle: 'Pavés en rangées décalées',
      ops: (r, s, g) => pierres(r, s, g, { l: [4, 5, 6].map((v) => Math.round(v * s / 16)), h: 4 * s / 16, decalage: 2 * s / 16, coins: true }),
    },
    mur_pierre: {
      rampe: 'pierre', libelle: 'Mur de pierres taillées',
      ops: (r, s, g) => pierres(r, s, g, { l: 8 * s / 16, h: 4 * s / 16, decalage: 4 * s / 16, coins: false }),
    },
    eau: {
      rampe: 'eau', libelle: 'Eau calme : petites vagues en arc, reflets',
      ops: (r, s, g) => {
        const rnd = hasard(g + 3);
        const ops = [
          { type: 'remplir', couleur: r[2] },
          // De larges nuances à peine plus sombres (la profondeur), sans contour net.
          { type: 'taches', couleurs: [melange(r[2], r[1], 0.45)], densite: 0.35, taille: 10 * s / 16, graine: g },
        ];
        // Des vagues en arc (⌒) en quinconce : la crête claire, un pixel plus clair au sommet, et
        // l'ombre du creux juste dessous. Une rangée sur deux est décalée de moitié.
        const pasX = 8 * s / 16, pasY = 4 * s / 16;
        for (let y = 1, j = 0; y < s; y += pasY, j++) {
          for (let x = (j % 2) * (pasX / 2) + Math.floor(rnd() * 2); x < s + pasX; x += pasX) {
            const X = (k) => ((Math.round(x + k) % s) + s) % s, Y = (k) => ((y + k) % s + s) % s;
            ops.push(point(X(0), Y(1), r[3]), point(X(1), Y(0), r[3]), point(X(2), Y(0), r[4]), point(X(3), Y(1), r[3]));
            ops.push(point(X(1), Y(1), melange(r[2], r[1], 0.6)), point(X(2), Y(1), melange(r[2], r[1], 0.6)));
          }
        }
        return ops;
      },
    },
    sable: {
      rampe: 'sable', libelle: 'Sable clair, quelques ondulations',
      ops: (r, s, g) => [
        ...fond(r, s, g, { sombre: 0.14, clair: 0.32, taille: 7 }),
        { type: 'bruit', couleurs: [r[1]], forme: 'trait', taille: 2, densite: 0.03, espace: 4 * s / 16, graine: g + 5 },
        { type: 'bruit', couleurs: [r[4]], forme: 'point', densite: 0.015, espace: 4, graine: g + 7 },
      ],
    },
    roche: {
      rampe: 'pierre', libelle: 'Sol rocheux (dalle de pierre irrégulière)',
      ops: (r, s, g) => {
        const rnd = hasard(g + 41), ops = [...fond(r, s, g, { sombre: 0.35, clair: 0.22, taille: 5 })];
        // Deux ou trois fissures courtes, sombres, avec un liseré clair au-dessus.
        for (let k = 0; k < 3; k++) {
          const x = Math.floor(rnd() * s), y = 1 + Math.floor(rnd() * (s - 2)), l = 2 + Math.floor(rnd() * 3), d = rnd() < 0.5 ? 1 : -1;
          ops.push({ type: 'ligne', x1: x, y1: y, x2: x + l, y2: y + d, couleur: r[0] });
          ops.push({ type: 'ligne', x1: x, y1: y - 1, x2: x + l - 1, y2: y + d - 1, couleur: r[3] });
        }
        ops.push({ type: 'bruit', couleurs: [r[4]], forme: 'point', densite: 0.01, espace: 5, graine: g + 7 });
        return ops;
      },
    },
    rocher: {
      rampe: 'pierre', libelle: 'Un rocher seul (parfois avec un caillou), sur fond transparent : à poser sur un calque de décor', objet: true,
      ops: (r, s, g) => {
        const rnd = hasard(g + 13);
        const e = [{ cx: s * (0.45 + rnd() * 0.1), cy: s * 0.6, rx: s * (0.3 + rnd() * 0.1), ry: s * (0.24 + rnd() * 0.06), plat: 0.55 }];
        if (rnd() < 0.6) e.push({ cx: rnd() < 0.5 ? s * 0.8 : s * 0.18, cy: s * 0.78, rx: s * 0.12, ry: s * 0.09, plat: 0.55 });
        return volume(r, s, g, e, { arete: true, marques: 3 });
      },
    },
    falaise: {
      rampe: 'pierre', libelle: 'Paroi de falaise en colonnes (se répète en hauteur et en largeur)',
      ops: (r, s, g) => {
        const rnd = hasard(g + 51), ops = [{ type: 'remplir', couleur: r[2] }];
        // Des colonnes de roche de largeurs variées : bord gauche éclairé, bord droit dans l'ombre,
        // un joint sombre entre deux colonnes, et quelques cassures horizontales.
        const larg = [];
        let reste = s;
        while (reste > 0) { const l = Math.min(reste, reste < 7 ? reste : 3 + Math.floor(rnd() * 3)); larg.push(l); reste -= l; }
        let x = 0;
        for (const l of larg) {
          const c = rnd() < 0.4 ? melange(r[2], r[1], 0.4) : r[2];
          ops.push({ type: 'rect', x, y: 0, largeur: l, hauteur: s, couleur: c });
          ops.push({ type: 'rect', x, y: 0, largeur: 1, hauteur: s, couleur: r[0] });
          ops.push({ type: 'rect', x: x + 1, y: 0, largeur: 1, hauteur: s, couleur: r[3] });
          if (l > 3) ops.push({ type: 'rect', x: x + l - 1, y: 0, largeur: 1, hauteur: s, couleur: r[1] });
          const y = Math.floor(rnd() * s);
          ops.push({ type: 'rect', x: x + 1, y, largeur: l - 1, hauteur: 1, couleur: r[0] }, { type: 'rect', x: x + 1, y: (y + 1) % s, largeur: l - 1, hauteur: 1, couleur: r[3] });
          x += l;
        }
        ops.push({ type: 'bruit', couleurs: [r[1]], forme: 'point', densite: 0.02, espace: 4, graine: g + 3, seulement: [r[2]] });
        return ops;
      },
    },
    falaise_haut: {
      rampe: 'pierre', libelle: 'Haut de falaise : un rebord d\'herbe puis la paroi',
      ops: (r, s, g) => {
        const h = RAMPES.herbe, rnd = hasard(g + 61);
        const ops = [...RECETTES.falaise.ops(r, s, g)];
        const bord = Math.round(s * 0.3);
        ops.push({ type: 'rect', x: 0, y: 0, largeur: s, hauteur: bord, couleur: h[2] });
        ops.push({ type: 'taches', couleurs: [h[3]], densite: 0.3, taille: 4, graine: g, y: 0, hauteur: bord });
        // L'herbe déborde sur la paroi, puis une ombre sous le rebord.
        for (let x = 0; x < s; x++) {
          const d = rnd() < 0.35 ? 1 : 0;
          ops.push(point(x, bord, d ? h[1] : r[0]));
          if (d) ops.push(point(x, bord + 1, r[0]));
        }
        ops.push({ type: 'rect', x: 0, y: 0, largeur: s, hauteur: 1, couleur: h[4] });
        return ops;
      },
    },
    mur_bois: {
      rampe: 'bois', libelle: 'Planches verticales (mur ou palissade)',
      ops: (r, s, g) => {
        const rnd = hasard(g + 71), l = 4 * s / 16, ops = [{ type: 'remplir', couleur: r[2] }];
        for (let x = 0; x < s; x += l) {
          ops.push({ type: 'rect', x, y: 0, largeur: 1, hauteur: s, couleur: r[0] });
          ops.push({ type: 'rect', x: x + 1, y: 0, largeur: 1, hauteur: s, couleur: r[3] });
          // Une fin de planche par endroits.
          if (rnd() < 0.5) { const y = Math.floor(rnd() * s); ops.push({ type: 'rect', x: x + 1, y, largeur: l - 1, hauteur: 1, couleur: r[0] }, { type: 'rect', x: x + 1, y: (y + 1) % s, largeur: l - 1, hauteur: 1, couleur: r[3] }); }
        }
        ops.push({ type: 'bruit', couleurs: [r[1]], forme: 'brin', taille: 3, densite: 0.06, espace: 3, graine: g + 3, seulement: [r[2]] });
        ops.push({ type: 'bruit', couleurs: [r[0]], forme: 'point', densite: 0.006, espace: 6, graine: g + 9, seulement: [r[2]] });
        return ops;
      },
    },
    toit: {
      rampe: 'ardoise', libelle: 'Toit en tuiles ou ardoises, en rangées décalées',
      ops: (r, s, g) => {
        const h = 4 * s / 16, l = 4 * s / 16, ops = [{ type: 'remplir', couleur: r[2] }];
        for (let y = 0, j = 0; y < s; y += h, j++) {
          const ox = (j % 2) * (l / 2);
          ops.push({ type: 'rect', x: 0, y: y + h - 1, largeur: s, hauteur: 1, couleur: r[0] });
          ops.push({ type: 'rect', x: 0, y, largeur: s, hauteur: 1, couleur: r[3] });
          // Les séparations entre deux tuiles du toit.
          for (let x = 0; x < s; x += l) ops.push({ type: 'rect', x: (x + ox) % s, y, largeur: 1, hauteur: h - 1, couleur: r[1] });
        }
        ops.push({ type: 'bruit', couleurs: [r[4]], forme: 'point', densite: 0.015, espace: 4, graine: g + 9, seulement: [r[3]] });
        ops.push({ type: 'bruit', couleurs: [r[1]], forme: 'point', densite: 0.02, espace: 4, graine: g + 3, seulement: [r[2]] });
        return ops;
      },
    },
    // --- Sols de terrain ---
    neige: {
      rampe: 'neige', libelle: 'Neige tassée, quelques creux et éclats',
      ops: (r, s, g) => [
        ...fond(r, s, g, { sombre: 0.22, clair: 0.22, taille: 9 }),
        { type: 'bruit', couleurs: [r[1]], forme: 'trait', taille: 2, densite: 0.025, espace: 5 * s / 16, graine: g + 5 },
        { type: 'bruit', couleurs: [r[4]], forme: 'point', densite: 0.02, espace: 4, graine: g + 7 },
      ],
    },
    glace: {
      rampe: 'glace', libelle: 'Glace lisse, reflets en diagonale',
      ops: (r, s, g) => {
        const rnd = hasard(g + 81), ops = [...fond(r, s, g, { sombre: 0.25, clair: 0.25, taille: 10 })];
        for (let k = 0; k < 3; k++) {
          const x = Math.floor(rnd() * s), y = Math.floor(rnd() * s), l = 2 + Math.floor(rnd() * 3);
          for (let i = 0; i < l; i++) ops.push(point((x + i) % s, (y - i + s) % s, r[4]));
        }
        ops.push({ type: 'bruit', couleurs: [r[1]], forme: 'trait', taille: 3, densite: 0.02, espace: 6, graine: g + 5 });
        return ops;
      },
    },
    boue: {
      rampe: 'boue', libelle: 'Boue, flaques sombres et reflets mouillés',
      ops: (r, s, g) => [
        ...fond(r, s, g, { sombre: 0.3, clair: 0.12, taille: 7 }),
        { type: 'taches', couleurs: [r[1]], densite: 0.12, taille: 4 * s / 16, graine: g + 29 },
        { type: 'bruit', couleurs: [r[4]], forme: 'point', densite: 0.02, espace: 4, graine: g + 7, seulement: [r[1]] },
      ],
    },
    grotte: {
      rampe: 'grotte', libelle: 'Sol de grotte sombre, cailloux et fissures',
      ops: (r, s, g) => [
        ...RECETTES.roche.ops(r, s, g),
        { type: 'bruit', couleurs: [r[1]], forme: 'amas', taille: 2, densite: 0.03, espace: 4, graine: g + 11 },
      ],
    },
    // --- Sols d'intérieur ---
    parquet: {
      rampe: 'bois', libelle: 'Parquet en lames horizontales décalées',
      ops: (r, s, g) => {
        const rnd = hasard(g + 91), h = 4 * s / 16, ops = [{ type: 'remplir', couleur: r[2] }];
        for (let y = 0, j = 0; y < s; y += h, j++) {
          const c = j % 2 ? melange(r[2], r[3], 0.35) : r[2];
          ops.push({ type: 'rect', x: 0, y, largeur: s, hauteur: h, couleur: c });
          ops.push({ type: 'rect', x: 0, y, largeur: s, hauteur: 1, couleur: r[3] });
          ops.push({ type: 'rect', x: 0, y: y + h - 1, largeur: s, hauteur: 1, couleur: r[1] });
          const joint = (Math.floor(rnd() * 4) * 4 + j * 6) % s;
          ops.push({ type: 'rect', x: joint, y, largeur: 1, hauteur: h, couleur: r[1] });
        }
        ops.push({ type: 'bruit', couleurs: [melange(r[2], r[1], 0.5)], forme: 'trait', taille: 3, densite: 0.03, espace: 4, graine: g + 3, seulement: [r[2]] });
        return ops;
      },
    },
    carrelage: {
      rampe: 'carreau', libelle: 'Carrelage en damier de 8 pixels',
      ops: (r, s, g) => {
        const c = 8 * s / 16, ops = [{ type: 'remplir', couleur: r[2] }];
        for (let y = 0; y < s; y += c) for (let x = 0; x < s; x += c) {
          ops.push({ type: 'rect', x, y, largeur: c, hauteur: c, couleur: ((x + y) / c) % 2 ? r[2] : r[3] });
          ops.push({ type: 'rect', x, y, largeur: c, hauteur: 1, couleur: r[1] }, { type: 'rect', x, y, largeur: 1, hauteur: c, couleur: r[1] });
          ops.push({ type: 'rect', x: x + 1, y: y + 1, largeur: 2, hauteur: 1, couleur: r[4] });
        }
        return ops;
      },
    },
    tapis: {
      rampe: 'tapis', libelle: 'Tapis tissé à motif de losanges',
      ops: (r, s, g) => {
        const ops = [{ type: 'remplir', couleur: r[2] }];
        const m = s / 2;
        for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
          const d = Math.abs((x % m) - m / 2 + 0.5) + Math.abs((y % m) - m / 2 + 0.5);
          if (Math.round(d) === Math.round(m / 2) - 1) ops.push(point(x, y, r[3]));
          else if (Math.round(d) <= 1) ops.push(point(x, y, r[1]));
        }
        ops.push({ type: 'rect', x: 0, y: 0, largeur: s, hauteur: 1, couleur: melange(r[2], r[1], 0.5) });
        return ops;
      },
    },
    // --- Petits objets (fond transparent) ---
    buisson: {
      rampe: 'feuillage', libelle: 'Un buisson rond, sur fond transparent', objet: true,
      ops: (r, s, g) => {
        const rnd = hasard(g + 17);
        const e = [
          { cx: s * 0.5, cy: s * 0.58, rx: s * 0.4, ry: s * 0.32, plat: 0.75 },
          { cx: s * (0.35 + rnd() * 0.1), cy: s * 0.42, rx: s * 0.24, ry: s * 0.22 },
          { cx: s * (0.6 + rnd() * 0.08), cy: s * 0.4, rx: s * 0.22, ry: s * 0.2 },
        ];
        return volume(r, s, g, e, { feuilles: true, seuils: [0.8, 0.5, 0.15] });
      },
    },
    souche: {
      rampe: 'bois', libelle: 'Une souche coupée, sur fond transparent', objet: true,
      ops: (r, s, g) => {
        const x0 = Math.round(s * 0.22), x1 = Math.round(s * 0.78), yh = Math.round(s * 0.3), yb = Math.round(s * 0.84), w = x1 - x0;
        const ops = [
          { type: 'rect', x: x0, y: yh + 2, largeur: w, hauteur: yb - yh - 2, couleur: r[2] },
          { type: 'rect', x: x0, y: yh + 2, largeur: 2, hauteur: yb - yh - 2, couleur: r[3] },
          { type: 'rect', x: x1 - 2, y: yh + 2, largeur: 2, hauteur: yb - yh - 2, couleur: r[1] },
          { type: 'rect', x: x0 - 1, y: yb - 2, largeur: 2, hauteur: 2, couleur: r[2] },
          { type: 'rect', x: x1 - 1, y: yb - 2, largeur: 2, hauteur: 2, couleur: r[1] },
        ];
        for (let x = x0 + 3; x < x1 - 2; x += 3) ops.push({ type: 'rect', x, y: yh + 4, largeur: 1, hauteur: yb - yh - 5, couleur: r[1] });
        ops.push({ type: 'ellipse', x: x0, y: yh - 1, largeur: w, hauteur: 5 * s / 16, couleur: r[4] });
        ops.push({ type: 'ellipse', x: x0 + 2, y: yh, largeur: w - 4, hauteur: 3 * s / 16, couleur: r[3], vide: true });
        ops.push(point(Math.round(s / 2) - 1, yh + 1, r[2]), point(Math.round(s / 2), yh + 1, r[2]));
        ops.push({ type: 'contour', couleur: r[0], forme: [r[1], r[2], r[3], r[4]], cotes: 'tout' });
        return ops;
      },
    },
    cloture: {
      rampe: 'bois', libelle: 'Une clôture en bois (se répète en largeur), fond transparent', objet: true,
      ops: (r, s, g) => {
        const u = s / 16, ops = [];
        for (const y of [Math.round(5 * u), Math.round(10 * u)]) ops.push({ type: 'rect', x: 0, y, largeur: s, hauteur: 2 * u, couleur: r[2] }, { type: 'rect', x: 0, y, largeur: s, hauteur: 1, couleur: r[3] });
        const px = Math.round(6 * u), pw = Math.round(4 * u);
        ops.push({ type: 'rect', x: px, y: Math.round(2 * u), largeur: pw, hauteur: s - Math.round(3 * u), couleur: r[2] });
        ops.push({ type: 'rect', x: px, y: Math.round(2 * u), largeur: 1, hauteur: s - Math.round(3 * u), couleur: r[3] });
        ops.push({ type: 'rect', x: px + pw - 1, y: Math.round(2 * u), largeur: 1, hauteur: s - Math.round(3 * u), couleur: r[1] });
        ops.push({ type: 'rect', x: px, y: Math.round(2 * u), largeur: pw, hauteur: 1, couleur: r[4] });
        ops.push({ type: 'contour', couleur: r[0], forme: [r[1], r[2], r[3], r[4]], cotes: 'tout', raccord: true });
        return ops;
      },
    },
    panneau: {
      rampe: 'bois', libelle: 'Un panneau en bois sur son poteau, fond transparent', objet: true,
      ops: (r, s, g) => {
        const u = s / 16;
        const ops = [
          { type: 'rect', x: Math.round(7 * u), y: Math.round(9 * u), largeur: Math.round(2 * u), hauteur: Math.round(6 * u), couleur: r[1] },
          { type: 'rect', x: Math.round(2 * u), y: Math.round(2 * u), largeur: Math.round(12 * u), hauteur: Math.round(8 * u), couleur: r[2] },
          { type: 'rect', x: Math.round(2 * u), y: Math.round(2 * u), largeur: Math.round(12 * u), hauteur: 1, couleur: r[4] },
          { type: 'rect', x: Math.round(2 * u), y: Math.round(9 * u), largeur: Math.round(12 * u), hauteur: 1, couleur: r[1] },
          { type: 'rect', x: Math.round(4 * u), y: Math.round(4 * u), largeur: Math.round(8 * u), hauteur: 1, couleur: r[1] },
          { type: 'rect', x: Math.round(4 * u), y: Math.round(6 * u), largeur: Math.round(6 * u), hauteur: 1, couleur: r[1] },
        ];
        ops.push({ type: 'contour', couleur: r[0], forme: [r[1], r[2], r[4]], cotes: 'tout' });
        return ops;
      },
    },
    pot_fleurs: {
      rampe: 'terre_cuite', libelle: 'Un pot de fleurs, fond transparent', objet: true,
      ops: (r, s, g) => {
        const u = s / 16, f = RAMPES.feuillage, rnd = hasard(g + 37);
        const ops = [
          { type: 'polygone', points: [[4 * u, 9 * u], [12 * u, 9 * u], [11 * u, 15 * u], [5 * u, 15 * u]], couleur: r[2] },
          { type: 'rect', x: Math.round(3 * u), y: Math.round(8 * u), largeur: Math.round(10 * u), hauteur: Math.round(2 * u), couleur: r[3] },
          { type: 'rect', x: Math.round(3 * u), y: Math.round(8 * u), largeur: Math.round(10 * u), hauteur: 1, couleur: r[4] },
          { type: 'rect', x: Math.round(10 * u), y: Math.round(10 * u), largeur: Math.round(2 * u), hauteur: Math.round(4 * u), couleur: r[1] },
          ...volume(f, s, g, [{ cx: s * 0.5, cy: s * 0.4, rx: s * 0.3, ry: s * 0.24, plat: 0.9 }], { feuilles: true, seuils: [0.8, 0.5, 0.15] }).filter((o) => o.couleur !== f[0] && o.couleur !== melange(f[0], f[1], 0.6)),
        ];
        const fl = [FLEURS[g % 3], FLEURS[(g + 1) % 3]];
        for (let k = 0; k < 4; k++) {
          const x = Math.round(s * (0.3 + rnd() * 0.4)), y = Math.round(s * (0.25 + rnd() * 0.2));
          ops.push(point(x, y, fl[k % 2]), point(x + 1, y, fl[k % 2]), point(x, y + 1, fl[k % 2]), point(x + 1, y + 1, melange(fl[k % 2], '#3a2c40', 0.4)));
        }
        ops.push({ type: 'contour', couleur: '#120c1e', cotes: 'tout' });
        return ops;
      },
    },
    // --- Animées ---
    hautes_herbes: {
      rampe: 'herbe', libelle: 'Hautes herbes (celles des rencontres), qui se balancent (animée)',
      ops: (r, s, g) => {
        const ops = [{ type: 'remplir', couleur: r[1] }, { type: 'taches', couleurs: [melange(r[1], r[0], 0.5)], densite: 0.3, taille: 5, graine: g }];
        // Des touffes de brins pointus (8 × 7 px, chiffres = rang dans la rampe), en deux rangées
        // décalées : la rangée du bas recouvre le pied de celle du haut, ce qui donne la profondeur.
        const touffe = [
          '.4...4..',
          '.3.4.3..',
          '33.3.33.',
          '32333230',
          '22323220',
          '2222222.',
          '0111110.',
        ];
        const u = s / 16;
        for (const [ox, oy] of [[0, 1], [8, 1], [4, 9], [12, 9]]) {
          touffe.forEach((ligne, j) => [...ligne].forEach((c, i) => {
            if (c === '.') return;
            const x = Math.round((ox + i) * u) % s, y = Math.round((oy + j) * u) % s;
            ops.push({ type: 'rect', x, y, largeur: Math.max(1, Math.round(u)), hauteur: Math.max(1, Math.round(u)), couleur: r[Number(c)] });
          }));
        }
        return ops;
      },
      animation: (r) => ({ mode: 'balancement', forme: [r[3], r[4]], fond: r[2], amplitude: 1, images: 4, duree: 260 }),
    },
    eau_animee: {
      rampe: 'eau', libelle: 'Eau dont les vagues défilent doucement (animée, 8 images)',
      ops: (r, s, g) => RECETTES.eau.ops(r, s, g),
      animation: (r, s) => ({ mode: 'defilement', dx: 2 * s / 16, dy: 0, images: 8, duree: 180 }),
    },
  };
  // --- Bords et transitions (Tafl 1.14) ---
  // Un jeu de 13 tuiles pour une plaque de « dessus » (chemin, eau, sable) posée dans « dessous »
  // (l'herbe) : le centre, 4 bords, 4 coins extérieurs et 4 coins intérieurs. Les bords ondulent un peu,
  // et deux pièces voisines se raccordent (les ondulations reviennent tous les s pixels).
  const BORDS = {
    transition_chemin: { libelle: 'Bords herbe → chemin de terre (13 tuiles)', dessous: 'herbe', dessus: 'chemin', style: 'chemin' },
    transition_eau: { libelle: 'Rives herbe → eau (13 tuiles)', dessous: 'herbe', dessus: 'eau', style: 'eau' },
    transition_sable: { libelle: 'Bords herbe → sable (13 tuiles)', dessous: 'herbe', dessus: 'sable', style: 'sable' },
  };
  const PIECES = [
    ['centre', []], ['haut', ['h']], ['bas', ['b']], ['gauche', ['g']], ['droite', ['d']],
    ['coin_haut_gauche', ['h', 'g']], ['coin_haut_droite', ['h', 'd']], ['coin_bas_gauche', ['b', 'g']], ['coin_bas_droite', ['b', 'd']],
    ['interieur_haut_gauche', ['h', 'g'], true], ['interieur_haut_droite', ['h', 'd'], true], ['interieur_bas_gauche', ['b', 'g'], true], ['interieur_bas_droite', ['b', 'd'], true],
  ];
  function bords(nom, s, g, lire) {
    const b = BORDS[nom];
    const rnd = hasard(g + 7);
    const prof = Math.round(s * 0.375); // à quelle distance du bord passe la limite
    const onde = () => { const p1 = rnd() * 6.28, p2 = rnd() * 6.28; return (t) => prof + Math.round(0.9 * Math.sin((2 * Math.PI * t) / s + p1) + 0.6 * Math.sin((4 * Math.PI * t) / s + p2)); };
    const f = { h: onde(), b: onde(), g: onde(), d: onde() };
    // marge(cote, x, y) > 0 : du côté « dessus » de cette limite.
    const marge = { h: (x, y) => y - f.h(x), b: (x, y) => (s - 1 - y) - f.b(x), g: (x, y) => x - f.g(y), d: (x, y) => (s - 1 - x) - f.d(y) };
    const rayon = Math.round(s * 0.3);
    // zone : du côté voulu de toutes les limites (sens 1 : « dessus », -1 : « dessous »), coin arrondi.
    const zone = (cotes, x, y, sens) => {
      const m = cotes.map((c) => sens * marge[c](x, y) + (sens > 0 ? 0.5 : -0.5));
      if (m.some((v) => v <= 0)) return false;
      if (m.length === 2 && m[0] < rayon && m[1] < rayon) return Math.hypot(rayon - m[0], rayon - m[1]) <= rayon;
      return true;
    };
    const peindre = (rec) => {
      const data = new Uint8ClampedArray(s * s * 4);
      const t = PixelArt.Toile(data, s, s);
      for (const op of RECETTES[rec].ops(RAMPES[RECETTES[rec].rampe], s, g)) PixelArt.operation(t, op, lire);
      return t;
    };
    const A = peindre(b.dessous), B = peindre(b.dessus);
    const ra = RAMPES[RECETTES[b.dessous].rampe], rb = RAMPES[RECETTES[b.dessus].rampe];
    return PIECES.map(([suffixe, cotes, interieur]) => {
      // estBInt(x, y) : ce pixel (même hors de la tuile, pour les bords) est-il « dessus » ?
      const estBInt = (x, y) => !cotes.length || (interieur ? !zone(cotes, x, y, -1) : zone(cotes, x, y, 1));
      const data = new Uint8ClampedArray(s * s * 4);
      const t = PixelArt.Toile(data, s, s);
      const hex = (h) => lire(h);
      for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
        const surB = estBInt(x, y);
        t.set(x, y, Array.from((surB ? B : A).get(x, y)));
        const voisinA = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !estBInt(x + dx, y + dy));
        const voisinB = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => estBInt(x + dx, y + dy));
        if (surB && voisinA) {
          // Le bord côté « dessus » : l'ombre sous la berge (eau), une terre plus sombre (chemin), un sable tassé.
          // (et quelques brins d'herbe qui débordent sur le chemin ou le sable, toujours aux mêmes places
          // pour que deux pièces voisines se raccordent)
          const brin = b.style !== 'eau' && ((x * 7 + y * 13 + g) % 9) < 2;
          if (b.style === 'eau') t.set(x, y, hex(rb[0]));
          else if (brin) t.set(x, y, hex(ra[2]));
          else if (b.style === 'chemin') t.set(x, y, hex(rb[1]));
          else if ((x + y) % 2 === 0) t.set(x, y, hex(rb[1]));
        } else if (!surB && voisinB) {
          // Le bord côté herbe : une lèvre éclairée au-dessus de l'eau, une herbe plus sombre ailleurs.
          t.set(x, y, hex(b.style === 'eau' ? ra[3] : ra[1]));
        }
        // La deuxième rangée sous la berge, encore un peu sombre.
        if (b.style === 'eau' && surB && !voisinA && [[2, 0], [-2, 0], [0, 2], [0, -2], [1, 1], [-1, -1], [1, -1], [-1, 1]].some(([dx, dy]) => !estBInt(x + dx, y + dy))) t.set(x, y, hex(rb[1]));
      }
      return { suffixe, frames: [data] };
    });
  }

  // --- Bâtiments (Tafl 1.14) ---
  // Une maison ou une boutique d'un seul tenant, dessinée en 16 px par tuile puis découpée en tuiles
  // (et agrandie ou réduite pixel par pixel pour une autre taille). La lumière vient d'en haut à gauche ;
  // les rangées du haut (le toit) passent devant le joueur ; la tuile du bas de la porte laisse passer.
  const BATIMENTS = {
    maison: { libelle: 'Une maison (4 × 4 tuiles) : toit de tuiles rouges, murs crépis à colombages, porte, une fenêtre et sa jardinière, cheminée ; donne aussi un tampon', l: 4, h: 4, dessus: 1, toit: 'terre_cuite', mur: 'crepi', style: 'maison' },
    boutique: { libelle: 'Une boutique (5 × 4 tuiles) : toit bleu, murs de pierre claire, auvent rayé, vitrine et enseigne ; donne aussi un tampon', l: 5, h: 4, dessus: 1, toit: 'toit_bleu', mur: 'carreau', style: 'boutique' },
  };
  function batiment(nom, s, g) {
    const B = BATIMENTS[nom];
    const W = B.l * 16, H = B.h * 16, px = new Array(W * H).fill(null);
    const T = RAMPES[B.toit], M = RAMPES[B.mur], Bo = RAMPES.bois, V = RAMPES.eau, P = RAMPES.pierre, F = RAMPES.feuillage;
    const rnd = hasard(g + 211);
    const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H) px[y * W + x] = c; };
    const rect = (x, y, l, h, c) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + l; i++) set(i, j, c); };
    const get = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? px[y * W + x] : null);
    const eave = 31, murG = 4, murD = W - 5, sol = H - 2;
    // Les murs.
    if (B.style === 'maison') {
      rect(murG, eave, murD - murG + 1, sol - eave, M[3]);
      for (let k = 0; k < 40; k++) { const x = murG + Math.floor(rnd() * (murD - murG)), y = eave + 3 + Math.floor(rnd() * (sol - eave - 6)); set(x, y, M[2]); }
      // Les colombages : poteaux aux coins et au milieu, une poutre en haut.
      for (const x of [murG, murD - 2, Math.round((murG + murD) / 2) - 1]) { rect(x, eave, 3, sol - eave, Bo[2]); rect(x, eave, 1, sol - eave, Bo[3]); rect(x + 2, eave, 1, sol - eave, Bo[1]); }
      rect(murG, eave + 2, murD - murG + 1, 2, Bo[2]); rect(murG, eave + 2, murD - murG + 1, 1, Bo[3]);
    } else {
      rect(murG, eave, murD - murG + 1, sol - eave, M[1]);
      for (let y = eave, j = 0; y < sol; y += 5, j++) for (let x = murG - (j % 2) * 4; x <= murD; x += 8) {
        const x0 = Math.max(murG, x), x1 = Math.min(murD, x + 6), c = rnd() < 0.3 ? melange(M[3], M[2], 0.4) : M[3];
        rect(x0, y, x1 - x0 + 1, 4, c); rect(x0, y, x1 - x0 + 1, 1, M[4]); rect(x1, y + 1, 1, 3, M[2]);
      }
    }
    // Le soubassement de pierre.
    rect(murG, sol - 3, murD - murG + 1, 3, P[2]); rect(murG, sol - 3, murD - murG + 1, 1, P[3]);
    for (let x = murG + 2; x < murD; x += 5) rect(x, sol - 2, 1, 2, P[1]);
    // L'ombre du toit sur le haut du mur.
    for (let x = murG; x <= murD; x++) for (const [dy, t] of [[0, 0.55], [1, 0.3]]) { const c = get(x, eave + dy); if (c) set(x, eave + dy, melange(c, '#1a1424', t)); }
    // Une fenêtre (l × h) : cadre de bois, vitre et reflet, croisillon, appui.
    const fenetre = (x, y, l, h, croix = true) => {
      rect(x - 1, y - 1, l + 2, h + 2, Bo[1]);
      rect(x, y, l, h, V[2]);
      rect(x, y, l, 2, V[3]);
      for (let k = 0; k < Math.min(l, h) - 2; k++) set(x + 1 + k, y + h - 2 - k, V[3]);
      set(x + 1, y + 1, V[4]); set(x + 2, y + 1, V[4]); set(x + 1, y + 2, V[4]);
      if (croix) { rect(x + Math.floor(l / 2), y, 1, h, Bo[1]); rect(x, y + Math.floor(h / 2), l, 1, Bo[1]); }
      rect(x - 2, y + h + 1, l + 4, 1, Bo[3]); rect(x - 2, y + h + 2, l + 4, 1, Bo[1]);
    };
    const porte = (x, y, l) => {
      const h = sol - y;
      rect(x - 1, y - 1, l + 2, h + 1, Bo[0]);
      rect(x, y, l, h, Bo[2]);
      for (let i = x + 2; i < x + l - 1; i += 3) rect(i, y + 1, 1, h - 1, Bo[1]);
      rect(x, y, l, 1, Bo[3]); rect(x, y, 1, h, Bo[3]);
      rect(x + l - 3, y + Math.floor(h / 2), 2, 2, FLEURS[1]);
      // La marche devant la porte.
      rect(x - 2, sol, l + 4, 2, P[3]); rect(x - 2, sol + 1, l + 4, 1, P[2]);
    };
    let porteX;
    if (B.style === 'maison') {
      porteX = Math.round(W / 2) + 2;
      porte(porteX, 42, 10);
      fenetre(10, 39, 10, 9);
      // La jardinière sous la fenêtre.
      rect(9, 50, 12, 3, Bo[2]); rect(9, 50, 12, 1, Bo[3]);
      for (let i = 9; i < 21; i++) set(i, 49, rnd() < 0.6 ? F[3] : F[2]);
      for (let i = 10; i < 21; i += 3) { set(i, 48, FLEURS[2]); set(i, 49, FLEURS[(i >> 1) % 2 ? 1 : 2]); }
    } else {
      porteX = 12;
      porte(porteX, 42, 12);
      // L'auvent rayé au-dessus de la porte, au bord festonné.
      const ax = porteX - 3, al = 18;
      for (let i = 0; i < al; i++) { const c = Math.floor(i / 3) % 2 ? '#e8e0d0' : '#b84a44'; rect(ax + i, 36, 1, 4, c); if (i % 3 !== 1) set(ax + i, 40, c); }
      rect(ax, 36, al, 1, melange('#b84a44', '#f0e0c8', 0.5));
      for (let i = 0; i < al; i++) set(ax + i, 41, get(ax + i, 41) ? melange(get(ax + i, 41), '#1a1424', 0.35) : null);
      // La vitrine : une grande fenêtre avec des objets posés derrière.
      const vx = 36, vy = 39, vl = W - 47, vh = 12;
      fenetre(vx, vy, vl, vh, false);
      rect(vx, vy + vh - 3, vl, 3, Bo[2]); rect(vx, vy + vh - 3, vl, 1, Bo[3]);
      for (let i = vx + 3; i < vx + vl - 3; i += 6) { rect(i, vy + vh - 6, 3, 3, i % 4 ? '#c8503e' : '#7fb3e0'); set(i, vy + vh - 6, '#f0e8d8'); }
      rect(vx + Math.floor(vl / 2), vy, 1, vh - 3, Bo[1]);
      // L'enseigne au-dessus de la vitrine : un panneau avec une pièce.
      const ex = vx + Math.floor(vl / 2) - 7;
      rect(ex, 33, 14, 4, Bo[1]); rect(ex + 1, 33, 12, 3, Bo[3]); rect(ex + 1, 33, 12, 1, Bo[4]);
      rect(ex + 5, 34, 4, 1, FLEURS[1]); set(ex + 6, 33, FLEURS[1]); set(ex + 7, 35, melange(FLEURS[1], '#3a2c40', 0.4));
    }
    // Le toit : en croupe vu de face (il s'élargit vers le bas), rangées de tuiles décalées, faîtage
    // clair, côté droit dans l'ombre, bord du bas (l'égout) qui déborde des murs.
    const haut = 5, gauche = 1, droite = W - 2;
    for (let y = haut; y < eave; y++) {
      const t = (y - haut) / (eave - 1 - haut), retrait = Math.round(8 * (1 - t));
      const x0 = gauche + retrait, x1 = droite - retrait, j = Math.floor((y - haut - 2) / 4), ry = (y - haut - 2) % 4;
      for (let x = x0; x <= x1; x++) {
        let c = T[2];
        if (y < haut + 2) c = y === haut ? T[4] : T[3];
        else if (ry === 3) c = T[0];
        else if (ry === 0) c = T[3];
        else if ((x + (j % 2) * 3) % 6 === 0) c = T[1];
        // Les pans de côté (les croupes), plus sombres à droite, plus clairs à gauche.
        if (x < x0 + 3 && y >= haut + 2) c = ry === 3 ? T[1] : T[3];
        if (x > x1 - 4 && y >= haut + 2) c = ry === 3 ? T[0] : T[1];
        set(x, y, c);
      }
    }
    rect(gauche, eave - 2, droite - gauche + 1, 1, T[1]); rect(gauche, eave - 1, droite - gauche + 1, 1, T[0]);
    for (let k = 0; k < 8; k++) { const x = gauche + 6 + Math.floor(rnd() * (droite - gauche - 12)), y = haut + 3 + Math.floor(rnd() * (eave - haut - 8)); if (get(x, y) === T[2]) set(x, y, T[4]); }
    // La cheminée.
    if (B.style === 'maison') {
      const cx = W - 20;
      rect(cx, 1, 6, 12, P[2]); rect(cx, 1, 1, 12, P[3]); rect(cx + 5, 1, 1, 12, P[1]);
      for (let y = 4; y < 13; y += 3) rect(cx + 1, y, 4, 1, P[1]);
      rect(cx - 1, 0, 8, 2, P[3]); rect(cx - 1, 1, 8, 1, P[1]);
    }
    // Le contour : sombre en bas et à droite, plus doux en haut et à gauche.
    const plein = px.map((c) => c !== null);
    const dans = (x, y) => x >= 0 && y >= 0 && x < W && y < H && plein[y * W + x];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (dans(x, y)) continue;
      if (dans(x, y - 1) || dans(x - 1, y)) set(x, y, '#120c1e');
      else if (dans(x, y + 1) || dans(x + 1, y)) set(x, y, melange('#120c1e', T[1], 0.5));
    }
    return { W, H, px, porte: Math.floor((porteX + 3) / 16) };
  }
  function fabriquerBatiment(nom, s, g, lire) {
    const B = BATIMENTS[nom], { W, px, porte } = batiment(nom, s, g);
    const cache = new Map(), couleur = (c) => { if (!cache.has(c)) cache.set(c, Array.from(lire(c))); return cache.get(c); };
    const pieces = [];
    for (let j = 0; j < B.h; j++) for (let i = 0; i < B.l; i++) {
      const data = new Uint8ClampedArray(s * s * 4);
      for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
        const c = px[(j * 16 + Math.floor((y * 16) / s)) * W + i * 16 + Math.floor((x * 16) / s)];
        if (c) data.set(couleur(c), (y * s + x) * 4);
      }
      pieces.push({ suffixe: `${j + 1}-${i + 1}`, frames: [data], col: i, ligne: j, passage: j < B.dessus ? 'auto' : j === B.h - 1 && i === porte ? 'libre' : 'bloque' });
    }
    return pieces;
  }

  const NOMS = [...Object.keys(RECETTES), ...Object.keys(BORDS), ...Object.keys(BATIMENTS)];

  // Les opérations d'une recette simple. couleur : une couleur de base (#rrggbb) pour une autre teinte.
  function operations(nom, { taille = 16, graine = 1, couleur = null } = {}) {
    const rec = RECETTES[nom];
    if (!rec) throw new Error(`Recette inconnue : ${nom}. Possibles : ${NOMS.join(', ')}.`);
    const r = couleur ? PixelArt.rampe(couleur, 5) : RAMPES[rec.rampe];
    return rec.ops(r, Math.max(8, Math.round(taille)), Math.max(1, Math.round(graine)));
  }

  // Les tuiles d'une recette : [{ suffixe, frames: [pixels…], duree? }]. Une recette simple en donne
  // une (animée ou non), une transition en donne 13. lire : PixelArt.lireCouleur pour ce jeu.
  function fabriquer(nom, { taille = 16, graine = 1, couleur = null, lire }) {
    const s = Math.max(8, Math.round(taille)), g = Math.max(1, Math.round(graine));
    if (BORDS[nom]) return bords(nom, s, g, lire);
    if (BATIMENTS[nom]) return fabriquerBatiment(nom, s, g, lire);
    const rec = RECETTES[nom];
    if (!rec) throw new Error(`Recette inconnue : ${nom}. Possibles : ${NOMS.join(', ')}.`);
    const r = couleur ? PixelArt.rampe(couleur, 5) : RAMPES[rec.rampe];
    const data = new Uint8ClampedArray(s * s * 4);
    const t = PixelArt.Toile(data, s, s);
    for (const op of rec.ops(r, s, g)) PixelArt.operation(t, op, lire);
    if (!rec.animation) return [{ suffixe: '', frames: [data] }];
    const a = rec.animation(r, s);
    return [{ suffixe: '', frames: PixelArt.animer(data, s, s, a.mode, a, lire), duree: a.duree }];
  }

  const libelle = (n) => (RECETTES[n] || BORDS[n] || BATIMENTS[n]).libelle;
  return {
    operations, fabriquer, NOMS,
    liste: () => NOMS.map((n) => `${n} (${libelle(n)})`),
    objet: (n) => Boolean(RECETTES[n]?.objet),
    jeu: (n) => Boolean(BORDS[n]),
    // Un bâtiment : { l, h, dessus } (en tuiles), sinon null.
    batiment: (n) => (BATIMENTS[n] ? { l: BATIMENTS[n].l, h: BATIMENTS[n].h, dessus: BATIMENTS[n].dessus } : null),
  };
})();
