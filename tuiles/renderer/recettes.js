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
      rampe: 'eau', libelle: 'Eau calme, quelques rides et reflets',
      ops: (r, s, g) => [
        ...fond(r, s, g, { sombre: 0.38, clair: 0.1, taille: 8 }),
        { type: 'bruit', couleurs: [r[3]], forme: 'trait', taille: 3 * s / 16, densite: 0.035, espace: 5 * s / 16, graine: g + 5 },
        { type: 'bruit', couleurs: [r[4]], forme: 'point', densite: 0.008, espace: 6, graine: g + 7, seulement: [r[3]] },
      ],
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
        // Chaque rocher : une ellipse au bas aplati, au bord irrégulier (rayon modulé par graine),
        // éclairée comme un volume (lumière en haut à gauche) en 4 bandes de la rampe, avec une arête
        // qui sépare la face éclairée du flanc, puis un contour sélectif : sombre en bas à droite,
        // plus doux en haut à gauche.
        const rochers = [{ cx: s * (0.45 + rnd() * 0.1), cy: s * 0.6, rx: s * (0.3 + rnd() * 0.1), ry: s * (0.24 + rnd() * 0.06) }];
        if (rnd() < 0.6) {
          const droite = rnd() < 0.5;
          rochers.push({ cx: droite ? s * 0.8 : s * 0.18, cy: s * 0.78, rx: s * 0.12, ry: s * 0.09 });
        }
        const bosses = Array.from({ length: 5 }, () => ({ a: rnd() * Math.PI * 2, f: 0.1 + rnd() * 0.12 }));
        const forme = new Uint8Array(s * s), teinte = new Float32Array(s * s);
        for (const k of rochers) {
          const fond = k.cy + k.ry * 0.55; // le bas, posé à plat
          for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
            const dx = (x + 0.5 - k.cx) / k.rx, dy = (y + 0.5 - k.cy) / k.ry;
            const ang = Math.atan2(dy, dx);
            let rayon = 1;
            for (const b of bosses) rayon -= b.f * Math.max(0, Math.cos(ang - b.a)) ** 6;
            const d = Math.hypot(dx, dy);
            if (d > rayon || y + 0.5 > fond) continue;
            // La normale d'une demi-sphère aplatie, et la lumière en haut à gauche.
            const nz = Math.sqrt(Math.max(0, 1 - Math.min(1, d / rayon) ** 2));
            let l = (-dx * 0.55 - dy * 0.75 + nz * 0.9) / 1.4;
            // Une arête : au-delà de la diagonale, le flanc tourne le dos à la lumière.
            if (dx * 0.6 + dy * 0.4 > 0.15) l -= 0.35;
            forme[y * s + x] = 1;
            teinte[y * s + x] = l;
          }
        }
        const ops = [];
        const dans = (x, y) => x >= 0 && y >= 0 && x < s && y < s && forme[y * s + x];
        for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
          if (!dans(x, y)) continue;
          const l = teinte[y * s + x];
          const c = l > 0.78 ? r[4] : l > 0.56 ? r[3] : l > 0.22 ? r[2] : r[1];
          ops.push(point(x, y, c));
        }
        // Quelques marques sur la pierre (des creux sombres et leur bord éclairé au-dessus).
        for (let k = 0; k < 3; k++) {
          const x = Math.floor(rnd() * s), y = Math.floor(rnd() * s);
          if (dans(x, y) && dans(x + 1, y) && dans(x, y - 1) && teinte[y * s + x] > 0.22) ops.push(point(x, y, r[1]), point(x + 1, y, r[1]), point(x, y - 1, r[3]));
        }
        // Contour sélectif, puis un liseré sombre au pied (le contact avec le sol).
        for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
          if (dans(x, y)) continue;
          const bas = dans(x, y - 1) || dans(x - 1, y) || dans(x - 1, y - 1);
          const haut = dans(x, y + 1) || dans(x + 1, y);
          if (bas) ops.push(point(x, y, r[0]));
          else if (haut) ops.push(point(x, y, melange(r[0], r[1], 0.6)));
        }
        return ops;
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
  };
  const NOMS = Object.keys(RECETTES);

  // Les opérations d'une recette. couleur : une couleur de base (#rrggbb) pour une autre teinte.
  function operations(nom, { taille = 16, graine = 1, couleur = null } = {}) {
    const rec = RECETTES[nom];
    if (!rec) throw new Error(`Recette inconnue : ${nom}. Possibles : ${NOMS.join(', ')}.`);
    const r = couleur ? PixelArt.rampe(couleur, 5) : RAMPES[rec.rampe];
    return rec.ops(r, Math.max(8, Math.round(taille)), Math.max(1, Math.round(graine)));
  }

  return { operations, NOMS, liste: () => NOMS.map((n) => `${n} (${RECETTES[n].libelle})`), objet: (n) => Boolean(RECETTES[n]?.objet) };
})();
