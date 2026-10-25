// L'arène de duel (Tafl 1.0, jouée par Saga 1.0) : le petit jeu modèle pour essayer le multijoueur.
//
// Une seule carte : deux vestiaires, deux bornes « Compose ton équipe » (6 créatures au choix, niveau 50)
// et un terrain au milieu. Deux amis se rejoignent dessus (Jouer à plusieurs), prennent leur équipe,
// puis se défient en se mettant face à face (touche Action › Défier).
//
// Proposée dans Fichier › Nouveau jeu. Les créatures viennent des données officielles : à importer une
// fois (Loki › « Importe les données officielles Pokémon »), ce que le panneau de l'arène rappelle.
//
// Les tuiles sont dessinées ici en 16 × 16, comme pour l'aventure d'exemple (exemple-jdr.js).

const ExempleArene = (() => {
  const COULEURS = {
    a: '#2f6f4a', b: '#3c8a5c', c: '#255c3d',       // gazon du terrain
    d: '#d9d2c4', e: '#eae4d8', f: '#b9b1a1',       // lignes et sol clair
    g: '#8a5b3a', h: '#6e4729', i: '#a9743f',       // bois des gradins
    j: '#3a3f55', k: '#4b5272', l: '#2b2f41',       // mur de l'arène
    m: '#c9a227', n: '#f2d14b',                      // or des bannières
    o: '#2a6cb0', p: '#4a9ae0', q: '#b03a3a', r: '#e06a6a', // bleu et rouge des deux camps
    s: '#5a6070', t: '#808898',                      // métal de la borne
    u: '#1b1d26',                                    // noir
    v: '#7fd8ff',                                    // écran de la borne
  };
  const bruit = (x, y, n = 0) => { let h = (x * 374761393 + y * 668265263 + n * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) % 100; };
  const TUILES = {
    gazon: (x, y) => (bruit(x, y) < 10 ? 'b' : bruit(x, y, 1) < 8 ? 'c' : 'a'),
    ligne: (x, y) => (x >= 7 && x <= 8 ? 'e' : TUILES.gazon(x, y)),
    centre: (x, y) => {
      const dx = x - 7.5, dy = y - 7.5, r = Math.hypot(dx, dy);
      return r > 7 ? TUILES.gazon(x, y) : r > 5.5 ? 'e' : TUILES.gazon(x, y);
    },
    sol: (x, y) => (x % 8 === 0 || y % 8 === 0 ? 'f' : bruit(x, y) < 8 ? 'e' : 'd'),
    mur: (x, y) => (y % 4 === 3 ? 'l' : x % 8 === (y % 8 < 4 ? 0 : 4) ? 'l' : bruit(x, y) < 12 ? 'k' : 'j'),
    gradins: (x, y) => (y % 5 < 2 ? 'h' : y % 5 === 2 ? 'i' : 'g'),
    banniere: (x, y) => (y < 3 ? 'l' : x >= 3 && x <= 12 ? ((x + y) % 5 === 0 ? 'n' : 'm') : 'l'),
    camp_bleu: (x, y) => (x >= 2 && x <= 13 && y >= 2 && y <= 13 ? ((x + y) % 6 === 0 ? 'p' : 'o') : 'd'),
    camp_rouge: (x, y) => (x >= 2 && x <= 13 && y >= 2 && y <= 13 ? ((x + y) % 6 === 0 ? 'r' : 'q') : 'd'),
    borne: (x, y) => {
      if (y >= 13 && x >= 4 && x <= 11) return 'u';
      if (x < 3 || x > 12 || y < 2) return '.';
      if (y >= 4 && y <= 8 && x >= 5 && x <= 10) return 'v';
      return y % 3 === 0 ? 't' : 's';
    },
  };
  const PASSAGES = { mur: 'bloque', gradins: 'bloque', banniere: 'bloque', borne: 'bloque' };

  function pixels(f, taille) {
    const data = new Uint8ClampedArray(taille * taille * 4);
    for (let y = 0; y < taille; y++) {
      for (let x = 0; x < taille; x++) {
        const ch = f(Math.floor((x * 16) / taille), Math.floor((y * 16) / taille));
        if (ch === '.' || !COULEURS[ch]) continue;
        const [r, g, b] = hexToRgba(COULEURS[ch]);
        data.set([r, g, b, 255], (y * taille + x) * 4);
      }
    }
    return data;
  }

  const dire = (texte, qui = '') => ({ type: 'dire', qui, expression: 'normal', texte });
  const page = (commandes, conditions = [], cache = false) => ({ conditions, cache, commandes });
  const ev = (id, nom, type, x, y, pages, autres = {}) => ({ id, nom, type, x, y, apparence: { personnage: '', tuile: -1 }, direction: 'bas', deplacement: 'fixe', traversable: false, declenchement: 'parler', pages, ...autres });

  // Remplit un jeu neuf (Doc.create) : les tuiles, l'arène, ses bornes et ses réglages.
  function remplir(doc) {
    const noms = Object.keys(TUILES);
    doc.tiles = noms.map((nom) => ({ id: Doc.newId(), name: nom, frames: [pixels(TUILES[nom], doc.tileSize)], duration: Doc.DEFAULT_DURATION, passage: PASSAGES[nom] || 'auto' }));
    const T = Object.fromEntries(noms.map((n, i) => [n, i]));
    for (const hex of Object.values(COULEURS)) if (!doc.palette.includes(hex)) doc.palette.push(hex);

    const m = Doc.newMap({ id: 'arene', name: 'Arène', width: 21, height: 17, interieur: true });
    const poser = (x, y, t, calque = 0) => { if (x >= 0 && y >= 0 && x < m.width && y < m.height) m.layers[calque].cells[y * m.width + x] = t; };
    const rect = (x0, y0, w, h, t, calque = 0) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) poser(x, y, t, calque); };

    // Le sol, le terrain au milieu, les deux camps et les murs autour.
    rect(0, 0, 21, 17, T.sol);
    rect(2, 4, 17, 11, T.gazon);
    for (let y = 4; y < 15; y++) poser(10, y, T.ligne);
    poser(10, 9, T.centre);
    rect(0, 0, 21, 2, T.mur, 1);
    rect(0, 2, 21, 1, T.gradins, 1);
    rect(7, 0, 7, 2, T.banniere, 1);
    for (let y = 4; y < 15; y++) { poser(0, y, T.mur, 1); poser(20, y, T.mur, 1); }
    rect(0, 15, 21, 2, T.gradins, 1);
    // Les deux camps : un tapis bleu à gauche, un rouge à droite.
    rect(3, 8, 2, 3, T.camp_bleu);
    rect(16, 8, 2, 3, T.camp_rouge);
    // Les deux bornes « Compose ton équipe », une par camp.
    poser(3, 6, T.borne, 1);
    poser(17, 6, T.borne, 1);

    const borne = (id, x, y) => ev(id, 'Borne d\'équipe', 'pnj', x, y, [
      page([
        dire('Borne d\'équipe. Choisis six créatures, niveau 50 : elles seront ton équipe pour l\'arène.'),
        { type: 'composer_equipe', nombre: 6, niveau: 50, titre: 'Ton équipe pour l\'arène', garder: true },
        dire('Bonne chance ! Pour te battre contre un ami, mets-toi face à lui et appuie sur Action.'),
      ]),
    ], { apparence: { personnage: '', tuile: T.borne }, obstacle: null });

    m.events = [
      borne('borne-bleue', 3, 7),
      borne('borne-rouge', 17, 7),
      ev('panneau', 'Panneau de l\'arène', 'panneau', 10, 15, [
        page([
          dire('Arène de duel. À deux (ou plus) : l\'un ouvre la partie dans Saga (menu de pause › Jouer à plusieurs), les autres ouvrent l\'adresse affichée dans leur navigateur et entrent le code.'),
          dire('Chacun prend son équipe à une borne, puis vous vous mettez face à face et vous appuyez sur Action : Défier. Rien n\'est perdu ni gagné, les équipes reviennent comme avant.'),
          dire('S\'il n\'y a aucune créature à choisir, importe d\'abord les données officielles dans Tafl (Loki › « Importe les données officielles Pokémon »).'),
        ]),
      ]),
    ];
    m.zones = [];
    doc.maps = [m];
    doc.mapIndex = 0;
    doc.map = m;
    doc.depart = { carte: 'arene', x: 10, y: 13, direction: 'haut' };

    // --- Les données : les règles Pokémon, une équipe de 6, et rien d'autre à préparer ---
    const data = doc.data;
    data.reglages.regles = 'pokemon';
    data.reglages.equipe_max = 6;
    data.reglages.argent_depart = 0;
    data.reglages.multijoueur = { echanges: true, duels: true, pv_autres: 'exacts' };
    data.personnages.unshift({ id: 'challenger', nom: 'Challenger', description: 'L\'apparence du joueur (et des autres joueurs en multijoueur).', heros: true, couleur: '#4a9ae0', tuile: -1, portraits: [], sprite: null, tenues: [] });
    data.personnages.push({ id: 'rivale', nom: 'Rivale', description: 'Une deuxième apparence, pour le joueur en face.', heros: false, couleur: '#e06a6a', tuile: -1, portraits: [], sprite: null, tenues: [] });
  }

  return { remplir };
})();
