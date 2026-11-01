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
  // Rampes de 5 couleurs, de la plus sombre à la plus claire. Deux styles (Tafl 1.15) : « val »
  // (par défaut, vif et contrasté, façon jeux 16 bits de la génération DS) et « brume » (sombre et
  // feutré). RAMPES est le style en cours, changé le temps d'une fabrication.
  const BRUME = {
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
    vitre: ['#1c2a44', '#2c4a72', '#4a78a6', '#7eaed2', '#c8e4f2'],
  };
  const VAL = {
    ...BRUME,
    herbe: ['#2c5634', '#3c763c', '#56964a', '#74b05a', '#a2cc7a'],
    terre: ['#4e3426', '#76523a', '#9c7650', '#bf9a6c', '#dcbf92'],
    pierre: ['#4e463e', '#7c7262', '#aca088', '#cbc2a6', '#e8e1c8'],
    bois: ['#341a14', '#5a2c1e', '#80402a', '#a45c3a', '#c47e52'],
    eau: ['#183a7a', '#2458b0', '#3a82d6', '#64aaf0', '#b4e0ff'],
    sable: ['#9a7a4c', '#c4a46c', '#ddc48c', '#eedaa6', '#fff2d2'],
    ardoise: ['#15161d', '#22252f', '#333847', '#4a5163', '#6c7588'],
    feuillage: ['#183c22', '#26602c', '#3c8634', '#62a83e', '#a2d266'],
    neige: ['#6a7ea6', '#98aed0', '#c8d8ec', '#e8f0f8', '#ffffff'],
    glace: ['#2a5a8a', '#4282b8', '#72b2dc', '#aee0f4', '#eefaff'],
    boue: ['#3a2820', '#57402e', '#74583c', '#92744e', '#b09266'],
    grotte: ['#1c1824', '#2c2634', '#3e3848', '#56505e', '#746e7a'],
    carreau: ['#5c5a66', '#8a8896', '#b8b6c2', '#d8d6e0', '#f2f0f8'],
    tapis: ['#4a1420', '#78202e', '#a8303c', '#cc4e4a', '#ea8466'],
    terre_cuite: ['#4a2220', '#7a3628', '#a84e32', '#cc7444', '#eaa068'],
    toit_bleu: ['#121a3a', '#1c2e66', '#284696', '#3c66c0', '#6a94e0'],
    crepi: ['#8a8072', '#c6bca8', '#e6decc', '#f4eee2', '#fffcf4'],
    vitre: ['#1c2c70', '#2c4cb0', '#4c74e0', '#88a8f8', '#d4e2ff'],
  };
  const STYLES = { val: VAL, brume: BRUME };
  let RAMPES = VAL;
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

  // --- Grands objets : bâtiments et arbres (Tafl 1.15) ---
  // Dessinés d'un seul tenant en 16 px par tuile, puis découpés en tuiles (agrandis ou réduits pixel
  // par pixel pour une autre taille). Style des jeux 16 bits vus de 3/4 : contour sombre, lumière en
  // haut à gauche sur 4 ou 5 teintes, ombre portée grise et transparente vers le bas à droite.
  // Une couleur suivie de « @n » est posée avec une opacité de n % (l'ombre portée).
  const OMBRE = '#1c1830@45';
  const CONTOUR = '#17121f';

  // Une feuille de dessin W × H : set, rect, get, et les finitions communes (contour, ombre portée).
  function feuille(W, H) {
    const px = new Array(W * H).fill(null);
    const dans = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
    const f = {
      W, H, px,
      set: (x, y, c) => { x = Math.round(x); y = Math.round(y); if (dans(x, y) && c) px[y * W + x] = c; },
      get: (x, y) => { x = Math.round(x); y = Math.round(y); return dans(x, y) ? px[y * W + x] : null; },
      rect: (x, y, l, h, c) => { x = Math.round(x); y = Math.round(y); for (let j = y; j < y + h; j++) for (let i = x; i < x + l; i++) f.set(i, j, c); },
      // Le contour sombre autour de la forme, puis l'ombre portée (la forme décalée de dx, dy).
      finir: ({ contour = CONTOUR, dx = 5, dy = 3, ombre = true, sol = null } = {}) => {
        const plein = px.map((c) => c !== null);
        const p = (x, y) => dans(x, y) && plein[y * W + x];
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!p(x, y) && (p(x + 1, y) || p(x - 1, y) || p(x, y + 1) || p(x, y - 1))) px[y * W + x] = contour;
        if (!ombre) return;
        const bord = px.map((c) => c !== null);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          if (bord[y * W + x]) continue;
          // L'ombre d'un bâtiment : la forme décalée ; celle d'un arbre : une ellipse au pied (sol).
          const o = sol ? ((x + 0.5 - sol.cx) / sol.rx) ** 2 + ((y + 0.5 - sol.cy) / sol.ry) ** 2 <= 1 : p(x - dx, y - dy);
          if (o) px[y * W + x] = OMBRE;
        }
      },
    };
    return f;
  }

  // Ardoises en écailles : rangées de 5 px, écailles de 8 px, décalées d'une rangée à l'autre.
  function ecaille(T, x, y, haut, cote) {
    const v = (y - haut) % 5, j = Math.floor((y - haut) / 5), u = (x + (j % 2) * 4) % 8;
    const [fonce, base, clair] = cote < 0 ? [T[1], T[3], T[4]] : [T[0], T[2], T[3]];
    // Une écaille arrondie : le bas en arc sombre, un reflet en haut à gauche.
    if (v === 4) return u >= 2 && u <= 5 ? fonce : melange(base, fonce, 0.6);
    if (v === 3 && (u === 0 || u === 7)) return fonce;
    if (u === 0 && v >= 1) return melange(base, fonce, 0.6);
    if (v === 0 && u >= 1 && u <= 4) return clair;
    if (v === 1 && u === 1) return clair;
    return base;
  }

  // Un point (centre du pixel x, y) est-il dans le polygone pts ?
  function dansPoly(pts, x, y) {
    const px = x + 0.5, py = y + 0.5;
    let dedans = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) dedans = !dedans;
    }
    return dedans;
  }
  // Les coordonnées (s, t) d'un point dans le parallélogramme o + s·a + t·b.
  function local(o, a, b, x, y) {
    const px = x + 0.5 - o[0], py = y + 0.5 - o[1], det = a[0] * b[1] - a[1] * b[0];
    return [(px * b[1] - py * b[0]) / det, (a[0] * py - a[1] * px) / det];
  }

  // Une maison à toit en pignon vue de 3/4 : le toit pointu (pan gauche éclairé, pan droit à l'ombre,
  // faîtage au milieu), le pignon de face à colombages, puis les murs (crépi en haut, planches en bas),
  // la porte, les fenêtres et le soubassement.
  function maisonPignon(B, g) {
    const W = B.l * 16, H = B.h * 16, f = feuille(W, H);
    const T = RAMPES[B.toit], M = RAMPES[B.mur], Bo = RAMPES.bois, V = RAMPES.vitre, P = RAMPES.pierre, Fe = RAMPES.feuillage;
    const rnd = hasard(g + 307);
    const sombre = (c, t) => melange(c, '#141024', t), clairci = (c, t) => melange(c, '#fff8e8', t);
    const xl = 1, xr = W - 8, cx = Math.floor((xl + xr) / 2);
    const haut = 1, epaule = 18, egout = 46, base = H - 4;
    const demi = (y) => (y < epaule ? Math.round(((y - haut) / (epaule - haut)) * (cx - xl)) + 1 : cx - xl + 1);
    // Le pignon de face : un triangle sous le faîtage.
    const ga = 24, gl = Math.min(20, cx - xl - 6);
    const dansPignon = (x, y) => y >= ga && y <= egout && Math.abs(x + 0.5 - (cx + 0.5)) <= ((y - ga) / (egout - ga)) * gl;
    // Les murs (d'abord, le toit déborde par-dessus).
    const ml = xl + 2, mr = xr - 2, mh = egout + 1, mid = egout + 12;
    f.rect(ml, mh, mr - ml + 1, mid - mh, M[3]);
    for (let k = 0; k < 30; k++) f.set(ml + Math.floor(rnd() * (mr - ml)), mh + 2 + Math.floor(rnd() * (mid - mh - 3)), M[2]);
    for (let y = mid; y < base - 2; y++) for (let x = ml; x <= mr; x++) f.set(x, y, (x - ml) % 4 === 0 ? Bo[1] : (x - ml) % 4 === 1 ? Bo[3] : Bo[2]);
    f.rect(ml, mid, mr - ml + 1, 2, Bo[1]); f.rect(ml, mid, mr - ml + 1, 1, Bo[3]);
    for (const x of [ml, mr - 2]) { f.rect(x, mh, 3, base - mh, Bo[2]); f.rect(x, mh, 1, base - mh, Bo[3]); f.rect(x + 2, mh, 1, base - mh, Bo[0]); }
    // Soubassement de pierre sombre.
    f.rect(ml, base - 2, mr - ml + 1, 3, RAMPES.ardoise[2]); f.rect(ml, base - 2, mr - ml + 1, 1, RAMPES.ardoise[3]);
    for (let x = ml + 3; x < mr; x += 6) f.set(x, base - 1, RAMPES.ardoise[1]);
    // L'ombre du toit sur le haut des murs.
    for (let x = ml; x <= mr; x++) for (const [dy, t] of [[0, 0.6], [1, 0.45], [2, 0.3], [3, 0.12]]) { const c = f.get(x, mh + dy); if (c) f.set(x, mh + dy, melange(c, '#1a1424', t)); }
    // Une fenêtre : cadre blanc, vitre bleue avec reflet, croisillon, et une jardinière fleurie dessous.
    const blanc = M[4];
    const fenetre = (x, y, l, h, { jardiniere = false, croix = true } = {}) => {
      // Enfoncée : l'ombre du linteau et du côté gauche sur la vitre, un appui qui dépasse.
      f.rect(x - 1, y - 1, l + 2, h + 2, blanc);
      f.rect(x + l + 1, y, 1, h + 1, M[1]);
      f.rect(x, y, l, h, V[2]);
      f.rect(x, y, l, 2, V[0]); f.rect(x, y, 1, h, V[1]);
      for (let k = 0; k < Math.min(l, h) - 3; k++) f.set(x + l - 2 - k, y + 2 + k, V[3]);
      f.set(x + 1, y + 2, V[4]); f.set(x + 2, y + 2, V[4]);
      if (croix) { f.rect(x + Math.floor(l / 2), y, 1, h, blanc); }
      f.rect(x - 2, y + h + 1, l + 4, 1, blanc); f.rect(x - 2, y + h + 2, l + 4, 1, M[1]);
      if (jardiniere) {
        f.rect(x - 1, y + h + 2, l + 2, 3, Bo[2]); f.rect(x - 1, y + h + 2, l + 2, 1, Bo[3]); f.rect(x - 1, y + h + 4, l + 2, 1, Bo[0]);
        for (let i = x - 1; i < x + l + 1; i++) f.set(i, y + h + 1, rnd() < 0.5 ? Fe[3] : Fe[2]);
        for (let i = x; i < x + l; i += 2) f.set(i, y + h, FLEURS[2 + ((i >> 1) % 2)] || FLEURS[2]);
      }
    };
    const porte = (x, l) => {
      const y = mid - 4, h = base - y;
      f.rect(x - 2, y - 2, l + 4, h + 2, blanc); f.rect(x - 1, y - 1, l + 2, h + 1, Bo[0]);
      for (let i = x; i < x + l; i++) for (let j = y; j < base; j++) f.set(i, j, (i - x) % 3 === 2 ? Bo[1] : Bo[2]);
      f.rect(x, y, l, 2, Bo[0]); f.rect(x, y, 1, h, Bo[1]); f.rect(x + l - 1, y + 2, 1, h - 2, Bo[3]);
      f.rect(x + 1, y + 2, l - 2, 3, V[2]); f.rect(x + 1, y + 2, l - 2, 1, V[3]);
      f.rect(x + l - 3, y + Math.floor(h / 2) + 1, 2, 2, FLEURS[1]);
      f.rect(x - 2, base, l + 4, 2, P[3]); f.rect(x - 2, base + 1, l + 4, 1, P[2]);
    };
    const porteX = B.porte * 16 + 3;
    porte(porteX, 10);
    if (B.vitrine) {
      // La vitrine, l'auvent rayé au-dessus, et l'enseigne.
      const vx = porteX + 15, vl = mr - 4 - vx;
      fenetre(vx, mh + 6, vl, 11, { croix: false });
      f.rect(vx, mh + 14, vl, 3, Bo[2]); f.rect(vx, mh + 14, vl, 1, Bo[3]);
      for (let i = vx + 2; i < vx + vl - 3; i += 5) { f.rect(i, mh + 11, 3, 3, i % 2 ? '#d84a3a' : '#f0c040'); f.set(i, mh + 11, '#fff4e0'); }
      const ax = vx - 2, al = vl + 4;
      for (let i = 0; i < al; i++) { const c = Math.floor(i / 3) % 2 ? '#f4efe6' : B.auvent; f.rect(ax + i, mh + 1, 1, 4, c); if (i % 3 !== 1) f.set(ax + i, mh + 5, c); }
      f.rect(ax, mh + 1, al, 1, melange(B.auvent, '#ffffff', 0.4));
      for (let i = 0; i < al; i++) { const c = f.get(ax + i, mh + 6); if (c) f.set(ax + i, mh + 6, melange(c, '#1a1424', 0.3)); }
      f.rect(ml + 3, mh + 4, porteX - ml - 6, 6, Bo[1]); f.rect(ml + 4, mh + 5, porteX - ml - 8, 4, Bo[3]);
      f.rect(ml + 4 + Math.floor((porteX - ml - 8) / 2) - 1, mh + 6, 3, 2, FLEURS[1]);
    } else {
      fenetre(ml + 4, mh + 4, 6, 6);
      const fx = porteX + 15;
      for (let x = fx; x + 8 <= mr - 3; x += 12) fenetre(x, mh + 3, 8, 6, { jardiniere: true });
    }
    // Le toit.
    for (let y = haut; y <= egout; y++) {
      const d = demi(y);
      for (let x = cx - d + 1; x <= cx + d; x++) {
        if (dansPignon(x, y)) continue;
        const cote = x <= cx ? -1 : 1;
        let c = ecaille(T, x, y, haut, cote);
        // Le modelé : le pan gauche plus clair près du faîtage et plus sombre vers son bord, le pan
        // droit de plus en plus sombre en s'éloignant du faîtage ; le bas du toit un peu plus sombre.
        const t = Math.abs(x + 0.5 - (cx + 1)) / (cx - xl + 1), bas = Math.max(0, (y - (egout - 8)) / 8);
        c = cote < 0 ? (t < 0.35 ? clairci(c, 0.18 * (1 - t / 0.35)) : sombre(c, 0.25 * (t - 0.35))) : sombre(c, 0.12 + 0.3 * t);
        if (bas > 0) c = sombre(c, 0.2 * bas);
        f.set(x, y, c);
      }
    }
    // Le faîtage, de la pointe au pignon.
    for (let y = haut; y < ga; y++) { f.set(cx, y, T[4]); f.set(cx + 1, y, T[0]); }
    // Le pignon : crépi, colombages en croix, une petite fenêtre, et les planches de rive.
    for (let y = ga; y <= egout; y++) for (let x = cx - gl; x <= cx + gl + 1; x++) if (dansPignon(x, y)) f.set(x, y, M[3]);
    for (let y = ga + 4; y < egout - 1; y++) { f.set(cx, y, Bo[2]); f.set(cx + 1, y, Bo[1]); }
    fenetre(cx - 2, ga + 9, 6, 5, { croix: false });
    for (let y = egout - 5; y <= egout - 4; y++) for (let x = cx - gl; x <= cx + gl + 1; x++) if (dansPignon(x, y)) f.set(x, y, y === egout - 5 ? Bo[3] : Bo[1]);
    for (let y = ga; y <= egout; y++) {
      const d = Math.round(((y - ga) / (egout - ga)) * gl);
      for (const [x, c] of [[cx - d, Bo[3]], [cx - d - 1, Bo[1]], [cx + 1 + d, Bo[1]], [cx + 2 + d, Bo[0]]]) f.set(x, y, c);
    }
    // L'ombre des planches de rive sur le pignon (plus forte à droite).
    for (let y = ga; y <= egout - 6; y++) for (let x = cx - gl; x <= cx + gl + 1; x++) {
      if (!dansPignon(x, y)) continue;
      const g1 = !dansPignon(x - 2, y - 1) || !dansPignon(x - 1, y - 2), d1 = !dansPignon(x + 3, y - 1) || !dansPignon(x + 1, y - 3);
      if (g1 || d1) f.set(x, y, sombre(f.get(x, y), d1 ? 0.45 : 0.3));
    }
    // L'égout : le bas du toit, plus sombre, de part et d'autre du pignon.
    for (let x = xl; x <= xr; x++) for (const [y, c] of [[egout - 1, x <= cx ? T[1] : T[0]], [egout, T[0]]]) if (!dansPignon(x, y)) f.set(x, y, c);
    for (let x = cx - gl - 1; x <= cx + gl + 2; x++) { f.set(x, egout, Bo[0]); f.set(x, egout - 1, Bo[2]); }
    // La cheminée de pierre claire, sur le pan droit.
    if (B.cheminee) {
      const kx = cx + Math.round((xr - cx) * 0.45), ky = 6;
      f.rect(kx, ky, 6, 11, P[3]); f.rect(kx, ky, 1, 11, P[4]); f.rect(kx + 5, ky, 1, 11, P[1]);
      for (let y = ky + 3; y < ky + 11; y += 3) f.rect(kx + 1, y, 4, 1, P[2]);
      f.rect(kx - 1, ky - 2, 8, 2, P[4]); f.rect(kx - 1, ky - 1, 8, 1, P[2]);
      for (let y = ky + 2; y < ky + 13; y++) for (const dx of [6, 7]) { const c = f.get(kx + dx, y); if (c && c !== P[1]) f.set(kx + dx, y, sombre(c, dx === 6 ? 0.5 : 0.3)); }
    }
    // Le volume des murs : le bord droit de la façade dans l'ombre, le pied plus sombre (le sol).
    for (let y = mh; y < base + 1; y++) for (let k = 0; k < 4; k++) { const x = mr - k, c = f.get(x, y); if (c) f.set(x, y, sombre(c, 0.3 - k * 0.07)); }
    for (let y = mh; y < base + 1; y++) { const c = f.get(ml, y); if (c) f.set(ml, y, clairci(c, 0.15)); }
    for (let x = ml; x <= mr; x++) { const c = f.get(x, base - 3); if (c) f.set(x, base - 3, sombre(c, 0.25)); }
    f.finir({ dx: 5, dy: 3 });
    return f;
  }

  // Le feuillage d'un arbre, touffe par touffe : chaque touffe est éclairée à la fois comme une petite
  // boule (sa propre lumière en haut à gauche) et comme une partie de la grosse boule de l'arbre (tout
  // le côté droit plus sombre) ; un liseré sombre la détache de celles qu'elle recouvre.
  function touffes(f, Fe, liste, globe, rnd) {
    for (const t of liste) {
      for (let y = Math.floor(t.y - t.r - 1); y <= t.y + t.r + 1; y++) for (let x = Math.floor(t.x - t.r - 1); x <= t.x + t.r + 1; x++) {
        const dx = (x + 0.5 - t.x) / t.r, dy = (y + 0.5 - t.y) / t.r, d = Math.hypot(dx, dy);
        const bord = 1 + 0.12 * Math.sin(Math.atan2(dy, dx) * (t.festons || 5) + t.x * 1.7);
        if (d > bord) continue;
        const nz = Math.sqrt(Math.max(0, 1 - Math.min(1, d / bord) ** 2));
        const gx = (x + 0.5 - globe.x) / globe.r, gy = (y + 0.5 - globe.y) / globe.r;
        const l = 0.55 * (-dx * 0.6 - dy * 0.8 + nz * 0.5) + 0.65 * (-gx * 0.7 - gy * 0.6) + (rnd() - 0.5) * 0.12;
        let c = l > 0.62 ? Fe[4] : l > 0.22 ? Fe[3] : l > -0.2 ? Fe[2] : l > -0.6 ? Fe[1] : Fe[0];
        // Le liseré du bas : la touffe fait de l'ombre sur ce qu'il y a dessous.
        if (d > bord - 0.22 && dy > 0.05 && dx > -0.6) c = d > bord - 0.11 ? Fe[0] : (c === Fe[4] || c === Fe[3] ? Fe[2] : Fe[1]);
        f.set(x, y, c);
      }
    }
    // Quelques feuilles : un éclat clair sur le clair, un creux sombre dans l'ombre.
    for (let k = 0; k < 40; k++) {
      const x = Math.floor(globe.x - globe.r + rnd() * 2 * globe.r), y = Math.floor(globe.y - globe.r + rnd() * 2 * globe.r);
      const c = f.get(x, y);
      if (c === Fe[3] && f.get(x + 1, y) === Fe[3]) { f.set(x, y, Fe[4]); }
      else if (c === Fe[2] && f.get(x, y + 1) === Fe[2]) { f.set(x, y, Fe[1]); f.set(x + 1, y + 1, Fe[1]); }
    }
  }
  function tronc(f, Bo, cx, pied, h) {
    f.rect(cx - 2.5, pied - h, 6, h, Bo[2]); f.rect(cx - 2.5, pied - h, 2, h, Bo[3]); f.rect(cx + 1.5, pied - h, 2, h, Bo[1]); f.rect(cx + 2.5, pied - h, 1, h, Bo[0]);
    f.set(cx - 0.5, pied - h + 3, Bo[1]); f.set(cx + 0.5, pied - 3, Bo[1]);
    f.set(cx - 3.5, pied - 1, Bo[2]); f.set(cx - 4.5, pied - 1, Bo[1]); f.set(cx + 3.5, pied - 1, Bo[1]); f.set(cx + 4.5, pied - 1, Bo[0]);
    // L'ombre du feuillage sur le haut du tronc.
    f.rect(cx - 2.5, pied - h, 6, 2, Bo[0]);
  }

  // Un sapin : une colonne de touffes en étages, de plus en plus larges vers le bas, chaque étage
  // posé sur le précédent avec un bord festonné, l'ombre au pied.
  function sapin(B, g) {
    const W = B.l * 16, H = B.h * 16, f = feuille(W, H), Fe = RAMPES.feuillage, Bo = RAMPES.bois;
    const rnd = hasard(g + 401), cx = W / 2 - 0.5, pied = H - 6;
    tronc(f, Bo, cx, pied, 8);
    const liste = [];
    const etages = [[5, 3.6, 1], [10, 5.2, 1], [15.5, 6.8, 2], [21, 8.4, 2], [26.5, 10, 3], [32, 11.4, 3]];
    // Du bas vers le haut : l'étage du dessus recouvre celui du dessous.
    for (let k = etages.length - 1; k >= 0; k--) {
      const [y, larg, n] = etages[k];
      if (n === 1) liste.push({ x: cx + (rnd() - 0.5), y, r: larg, festons: 7 });
      else for (let i = 0; i < n; i++) liste.push({ x: cx + (i - (n - 1) / 2) * (larg * 1.25 / n) + (rnd() - 0.5), y: y + (i === 0 || i === n - 1 ? 1 : 0), r: larg * (n === 2 ? 0.72 : 0.62), festons: 7 });
    }
    touffes(f, Fe, liste, { x: cx - 1, y: 20, r: 16 }, rnd);
    f.set(cx, 1, Fe[4]); f.set(cx, 2, Fe[3]);
    f.finir({ contour: melange(Fe[0], '#000000', 0.5), sol: { cx: cx + 3, cy: pied, rx: W * 0.36, ry: 4 } });
    return f;
  }

  // Un arbre feuillu : une grosse boule faite de touffes rondes, le tronc, l'ombre au pied.
  function feuillu(B, g) {
    const W = B.l * 16, H = B.h * 16, f = feuille(W, H), Fe = RAMPES.feuillage, Bo = RAMPES.bois;
    const rnd = hasard(g + 503), cx = W / 2 - 0.5, pied = H - 6;
    tronc(f, Bo, cx, pied, 10);
    const cy0 = 17, R = 12.5;
    const liste = [[-0.55, 0.55, 0.5], [0.55, 0.55, 0.5], [0, 0.65, 0.5], [-0.7, 0, 0.5], [0.7, 0.05, 0.5], [0, 0.1, 0.55], [-0.35, -0.5, 0.5], [0.4, -0.45, 0.5], [0, -0.75, 0.45]]
      .map(([dx, dy, r]) => ({ x: cx + dx * R + (rnd() - 0.5) * 1.5, y: cy0 + dy * R + (rnd() - 0.5) * 1.5, r: r * R, festons: 6 }));
    touffes(f, Fe, liste, { x: cx - 1, y: cy0 - 1, r: R + 2 }, rnd);
    f.finir({ contour: melange(Fe[0], '#000000', 0.5), sol: { cx: cx + 3, cy: pied, rx: W * 0.4, ry: 4 } });
    return f;
  }

  const GRANDS = {
    maison: { libelle: 'Une maison (4 × 5 tuiles) : toit d\'ardoises en pignon, colombages, porte, fenêtres fleuries, cheminée, ombre portée ; donne aussi un tampon', l: 4, h: 5, dessus: 2, porte: 1, toit: 'ardoise', mur: 'crepi', cheminee: true, dessin: maisonPignon },
    boutique: { libelle: 'Une boutique (5 × 5 tuiles) : toit bleu en pignon, vitrine, auvent rayé, enseigne, ombre portée ; donne aussi un tampon', l: 5, h: 5, dessus: 2, porte: 1, toit: 'toit_bleu', mur: 'crepi', vitrine: true, auvent: '#c8463c', dessin: maisonPignon },
    sapin: { libelle: 'Un sapin (2 × 3 tuiles) : étages de branches, tronc, ombre au pied ; donne aussi un tampon', l: 2, h: 3, dessus: 2, arbre: true, dessin: sapin },
    arbre: { libelle: 'Un arbre feuillu (2 × 3 tuiles) : touffes rondes, tronc, ombre au pied ; donne aussi un tampon', l: 2, h: 3, dessus: 2, arbre: true, dessin: feuillu },
  };
  function fabriquerGrand(nom, s, g, lire) {
    const B = GRANDS[nom], { W, px } = B.dessin(B, g);
    const cache = new Map();
    const couleur = (c) => {
      if (!cache.has(c)) { const [hex, a] = c.split('@'); const v = Array.from(lire(hex)); if (a) v[3] = Math.round(2.55 * Number(a)); cache.set(c, v); }
      return cache.get(c);
    };
    const pieces = [];
    for (let j = 0; j < B.h; j++) for (let i = 0; i < B.l; i++) {
      const data = new Uint8ClampedArray(s * s * 4);
      for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
        const c = px[(j * 16 + Math.floor((y * 16) / s)) * W + i * 16 + Math.floor((x * 16) / s)];
        if (c) data.set(couleur(c), (y * s + x) * 4);
      }
      const passage = j < B.dessus ? 'auto' : B.arbre ? (j === B.h - 1 ? 'bloque' : 'auto') : j === B.h - 1 && i === B.porte ? 'libre' : 'bloque';
      pieces.push({ suffixe: `${j + 1}-${i + 1}`, frames: [data], col: i, ligne: j, passage });
    }
    return pieces;
  }

  const NOMS = [...Object.keys(RECETTES), ...Object.keys(BORDS), ...Object.keys(GRANDS)];

  // Les opérations d'une recette simple. couleur : une couleur de base (#rrggbb) pour une autre teinte.
  function operations(nom, { taille = 16, graine = 1, couleur = null, style = 'val' } = {}) {
    RAMPES = STYLES[style] || VAL;
    const rec = RECETTES[nom];
    if (!rec) throw new Error(`Recette inconnue : ${nom}. Possibles : ${NOMS.join(', ')}.`);
    const r = couleur ? PixelArt.rampe(couleur, 5) : RAMPES[rec.rampe];
    return rec.ops(r, Math.max(8, Math.round(taille)), Math.max(1, Math.round(graine)));
  }

  // Les tuiles d'une recette : [{ suffixe, frames: [pixels…], duree? }]. Une recette simple en donne
  // une (animée ou non), une transition en donne 13. lire : PixelArt.lireCouleur pour ce jeu.
  function fabriquer(nom, { taille = 16, graine = 1, couleur = null, lire, style = 'val' }) {
    RAMPES = STYLES[style] || VAL;
    const s = Math.max(8, Math.round(taille)), g = Math.max(1, Math.round(graine));
    if (BORDS[nom]) return bords(nom, s, g, lire);
    if (GRANDS[nom]) return fabriquerGrand(nom, s, g, lire);
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

  const libelle = (n) => (RECETTES[n] || BORDS[n] || GRANDS[n]).libelle;
  return {
    operations, fabriquer, NOMS,
    liste: () => NOMS.map((n) => `${n} (${libelle(n)})`),
    objet: (n) => Boolean(RECETTES[n]?.objet),
    jeu: (n) => Boolean(BORDS[n]),
    // Un grand objet (bâtiment, arbre) : { l, h, dessus } (en tuiles), sinon null.
    batiment: (n) => (GRANDS[n] ? { l: GRANDS[n].l, h: GRANDS[n].h, dessus: GRANDS[n].dessus } : null),
    STYLES: Object.keys(STYLES),
  };
})();
