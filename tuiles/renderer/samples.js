// Tuiles d'exemple proposées à la création d'un jeu de tuiles (Tafl 1.14) : toutes les recettes de
// recettes.js (sols, eau animée, murs, falaises, toits, intérieurs, petits objets, hautes herbes), leurs
// jeux de bords (chemin, eau, sable), une maison et une boutique (avec leurs tampons), rangées par
// catégorie, avec une petite carte de village qui les utilise. De quoi voir tout de suite comment Tafl
// marche, puis les retoucher ou les effacer. Elles se fabriquent à la taille des tuiles du jeu.

const Samples = (() => {
  // [recette, nom, catégorie, passage, graine]
  const LISTE = [
    ['herbe', 'herbe', 'Sols', 'auto', 1], ['herbe', 'herbe 2', 'Sols', 'auto', 102], ['fleurs', 'fleurs', 'Sols', 'auto', 1],
    ['terre', 'terre', 'Sols', 'auto', 1], ['chemin', 'chemin', 'Sols', 'auto', 1], ['paves', 'pavés', 'Sols', 'auto', 1],
    ['sable', 'sable', 'Sols', 'auto', 1], ['roche', 'roche', 'Sols', 'auto', 1], ['neige', 'neige', 'Sols', 'auto', 1],
    ['glace', 'glace', 'Sols', 'auto', 1], ['boue', 'boue', 'Sols', 'auto', 1],
    ['hautes_herbes', 'hautes herbes', 'Herbes et eau', 'auto', 1], ['eau_animee', 'eau', 'Herbes et eau', 'bloque', 1], ['eau', 'eau calme', 'Herbes et eau', 'bloque', 1],
    ['mur_pierre', 'mur de pierre', 'Murs et falaises', 'bloque', 1], ['mur_bois', 'mur de bois', 'Murs et falaises', 'bloque', 1],
    ['falaise', 'falaise', 'Murs et falaises', 'bloque', 1], ['falaise_haut', 'haut de falaise', 'Murs et falaises', 'bloque', 1], ['toit', 'toit', 'Murs et falaises', 'bloque', 1],
    ['parquet', 'parquet', 'Intérieurs', 'auto', 1], ['carrelage', 'carrelage', 'Intérieurs', 'auto', 1], ['tapis', 'tapis', 'Intérieurs', 'auto', 1], ['grotte', 'sol de grotte', 'Intérieurs', 'auto', 1],
    ['rocher', 'rocher', 'Objets', 'bloque', 1], ['buisson', 'buisson', 'Objets', 'bloque', 1], ['souche', 'souche', 'Objets', 'bloque', 1],
    ['cloture', 'clôture', 'Objets', 'bloque', 1], ['panneau', 'panneau', 'Objets', 'bloque', 1], ['pot_fleurs', 'pot de fleurs', 'Objets', 'bloque', 1],
    ['transition_chemin', 'chemin', 'Bords du chemin', 'auto', 1],
    ['transition_eau', 'rive', 'Bords de l\'eau', 'bloque', 1],
    ['transition_sable', 'sable', 'Bords du sable', 'auto', 1],
    ['maison', 'maison', 'Bâtiments', null, 1],
    ['boutique', 'boutique', 'Bâtiments', null, 1],
  ];

  // Remplit un jeu de tuiles neuf avec les tuiles d'exemple et une petite carte de village.
  function fill(doc) {
    const s = doc.tileSize, lire = (c) => PixelArt.lireCouleur(doc, c, '', new Set());
    const tiles = [], idx = {}, stamps = [];
    for (const [recette, nom, categorie, passage, graine] of LISTE) {
      const pieces = Recettes.fabriquer(recette, { taille: s, graine, lire });
      const bat = Recettes.batiment(recette), jeu = Recettes.jeu(recette);
      const indices = [];
      for (const p of pieces) {
        const name = jeu ? `${nom} ${p.suffixe.replace(/_/g, ' ')}` : bat ? `${nom} ${p.suffixe}` : nom;
        idx[jeu && !bat ? `${recette}:${p.suffixe}` : bat ? `${recette}:${p.suffixe}` : nom] = tiles.length;
        indices.push(tiles.length);
        tiles.push({ id: Doc.newId(), name, frames: p.frames, duration: p.duree || Doc.DEFAULT_DURATION, passage: p.passage || passage || 'auto', categorie });
      }
      if (bat) stamps.push(Doc.newStamp({ stamps }, { name: nom, w: bat.l, h: bat.h, cells: indices, dessus: bat.dessus }));
    }
    doc.tiles = tiles;
    doc.stamps = stamps;

    const { width: W, height: H } = doc.map;
    const [sol, decor] = doc.map.layers;
    const dans = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
    const set = (cells, x, y, v) => { if (dans(x, y)) cells[y * W + x] = v; };
    // L'herbe, avec sa variante semée un peu partout, et quelques touffes de fleurs.
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const h = ((x * 374761393 + y * 668265263) >>> 0) % 100;
      set(sol.cells, x, y, h < 12 ? idx.fleurs : h < 45 ? idx['herbe 2'] : idx.herbe);
    }
    // Une plaque (chemin, eau…) dessinée avec son jeu de bords : chaque case choisit sa pièce d'après
    // ses voisines (le bord de la carte compte comme la plaque, pour que la route continue au-delà).
    const plaque = (recette, dedans, centre) => {
      const P = (x, y) => !dans(x, y) || dedans(x, y);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (!dedans(x, y)) continue;
        const h = !P(x, y - 1), b = !P(x, y + 1), g = !P(x - 1, y), d = !P(x + 1, y);
        let p = 'centre';
        if (h && g) p = 'coin_haut_gauche'; else if (h && d) p = 'coin_haut_droite';
        else if (b && g) p = 'coin_bas_gauche'; else if (b && d) p = 'coin_bas_droite';
        else if (h) p = 'haut'; else if (b) p = 'bas'; else if (g) p = 'gauche'; else if (d) p = 'droite';
        else if (!P(x - 1, y - 1)) p = 'interieur_haut_gauche'; else if (!P(x + 1, y - 1)) p = 'interieur_haut_droite';
        else if (!P(x - 1, y + 1)) p = 'interieur_bas_gauche'; else if (!P(x + 1, y + 1)) p = 'interieur_bas_droite';
        set(sol.cells, x, y, p === 'centre' && centre !== undefined ? centre : idx[`${recette}:${p}`]);
      }
    };
    // La grand-route (2 cases de large) et la rue qui monte vers le nord entre les deux bâtiments.
    const midY = Math.floor(H / 2), midX = Math.floor(W / 2) - 1;
    plaque('transition_chemin', (x, y) => (y >= midY && y <= midY + 1) || (x >= midX && x <= midX + 1 && y < midY));
    // La mare au sud-est (l'intérieur est animé) et les hautes herbes au sud-ouest.
    const mare = { x: W - 7, y: midY + 3, w: 5, h: 4 };
    plaque('transition_eau', (x, y) => x >= mare.x && x < mare.x + mare.w && y >= mare.y && y < mare.y + mare.h, idx.eau);
    const herbes = { x: 2, y: midY + 4, w: 5, h: 3 };
    for (let y = herbes.y; y < herbes.y + herbes.h; y++) for (let x = herbes.x; x < herbes.x + herbes.w; x++) set(sol.cells, x, y, idx['hautes herbes']);
    // Les bâtiments posés juste au-dessus de la route (leur porte donne dessus), avec leurs tampons.
    const li = doc.map.layers.indexOf(decor);
    const poser = (nom, x, y) => { const st = stamps.find((t) => t.name === nom); if (st && x >= 0 && y >= 0 && x + st.w <= W && y + st.h <= H) Doc.placeStamp(doc, st, x, y, li); };
    poser('maison', midX - 6, midY - 4);
    poser('boutique', midX + 3, midY - 4);
    // Le décor : une clôture devant les hautes herbes, des buissons, un rocher, une souche, des pots
    // de fleurs devant la boutique, le panneau au croisement.
    for (let x = herbes.x; x < herbes.x + herbes.w; x++) set(decor.cells, x, herbes.y - 1, idx['clôture']);
    for (const [x, y] of [[1, 1], [2, 1], [W - 2, 1], [W - 3, 2], [1, midY - 2], [W - 2, midY + 3]]) set(decor.cells, x, y, idx.buisson);
    set(decor.cells, 8, H - 2, idx.rocher);
    set(decor.cells, W - 9, H - 2, idx.souche);
    set(decor.cells, midX + 8, midY - 1, idx['pot de fleurs']);
    set(decor.cells, midX + 2, midY - 1, idx.panneau);
    // Pour essayer l'éditeur de jeu : l'eau et les murs bloquent le joueur, les hautes herbes et la mare
    // sont des zones, et le joueur part du croisement des chemins.
    const zone = (id, name, type, z, objet = '') => ({ id, name, type, x: clamp(z.x, 0, W - 1), y: clamp(z.y, 0, H - 1), w: Math.max(1, Math.min(z.w, W - z.x)), h: Math.max(1, Math.min(z.h, H - z.y)), objet });
    if (herbes.y + herbes.h <= H && mare.x >= 0 && W >= 9) doc.map.zones = [zone('zone-1', 'Herbes hautes', 'herbes', herbes), zone('zone-2', 'Mare', 'eau', mare, 'planche-de-surf')];
    doc.depart = { carte: doc.map.id, x: clamp(midX, 0, W - 1), y: clamp(midY, 0, H - 1), direction: 'bas' };
    // Deux événements pour essayer les scripts (Tafl 0.7) : le panneau au croisement, et un habitant.
    if (W >= 6 && midY >= 1) {
      const sign = Events.create(doc, 'panneau', clamp(midX + 2, 0, W - 1), midY - 1, 'ev-1');
      const pnj = Events.create(doc, 'pnj', clamp(midX - 3, 0, W - 1), clamp(midY + 2, 0, H - 1), 'ev-2');
      doc.map.events = [sign, { ...pnj, pages: [{ conditions: [], cache: false, commandes: [
        { type: 'dire', qui: '@evenement', expression: 'normal', texte: 'Bonjour ! Les hautes herbes, au sud, sont pleines de créatures sauvages.' },
        { type: 'choix', options: [
          { texte: 'Merci !', commandes: [{ type: 'dire', qui: '@evenement', expression: 'normal', texte: 'Bonne route, {joueur} !' }] },
          { texte: 'Même pas peur.', commandes: [{ type: 'dire', qui: '@evenement', expression: 'normal', texte: 'Ha ! On verra bien.' }] },
        ] },
      ] }] }];
    }
    doc.current = 0;
  }

  return { fill };
})();
