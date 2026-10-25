// L'aventure d'exemple du pack JDR (Tafl 0.32, jouée par Saga 0.13) : « La crypte de Brumeval ». Un
// village, une crypte sous la colline et trois rencontres, avec le modèle D&D 5e (modele-dnd5e.js) et
// des événements qui montrent les blocs du pack : test, test opposé, sauvegarde, repos, XP, états.
// Proposée dans Fichier › Nouveau jeu ; tout se modifie ou s'efface ensuite.
//
// Les tuiles sont dessinées ici en 16 × 16 par une petite fonction par tuile (x, y → une lettre de
// COULEURS, « . » = transparent), agrandies ou réduites pour une autre taille de tuile.

const ExempleJdr = (() => {
  const COULEURS = {
    a: '#4f8a3c', b: '#6aa84a', c: '#3a6a2e', // herbe
    e: '#b8955e', f: '#d2b27a', g: '#8c6c40', // chemin
    t: '#2f5a2a', u: '#3f7a34', v: '#5c3a22', // arbre
    m: '#9a7a5a', n: '#7a5c40', o: '#5a422e', // bois des maisons
    r: '#a8443a', s: '#80302a', // toit
    p: '#6e6e78', q: '#8a8a94', k: '#4a4a54', l: '#34343c', // pierre
    d: '#5a5a62', h: '#46464e', // dalles de la crypte
    w: '#e8e0cc', x: '#1a1a20', y: '#f0b040', z: '#ff7030', // os, noir, flamme
    i: '#3a78b8', j: '#7ab8e8', // eau du puits
    A: '#f0c8a0', B: '#c0392b', C: '#e8e8e8', D: '#7a4a9a', E: '#b0b0b8', F: '#3a2a1a', // les deux habitantes
  };
  // Une habitante vue de face : cheveux, visage, robe, tablier (assez pour la reconnaître sur la carte).
  const habitante = (cheveux, robe, tablier) => (x, y) => {
    const dx = Math.abs(x - 7.5);
    if (y >= 1 && y <= 3 && dx < 3.5) return cheveux;
    if (y >= 4 && y <= 6 && dx < 3) return (y === 5 && (x === 6 || x === 9)) ? 'x' : (dx > 2.4 ? cheveux : 'A');
    if (y >= 7 && y <= 13 && dx < 2.5 + (y - 7) / 3) return tablier && dx < 1.6 && y >= 9 ? tablier : robe;
    if (y === 14 && (x === 6 || x === 9)) return 'F';
    return '.';
  };
  // Un petit bruit déterministe : les mêmes taches à chaque fois.
  const bruit = (x, y, n = 0) => { let h = (x * 374761393 + y * 668265263 + n * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) % 100; };
  const TUILES = {
    herbe: (x, y) => (bruit(x, y) < 8 ? 'b' : bruit(x, y, 1) < 6 ? 'c' : 'a'),
    chemin: (x, y) => (bruit(x, y) < 10 ? 'f' : bruit(x, y, 2) < 7 ? 'g' : 'e'),
    arbre: (x, y) => {
      const dx = x - 7.5, dy = y - 6;
      if (dx * dx + dy * dy < 36) return dx + dy < -3 ? 'u' : bruit(x, y) < 15 ? 'u' : 't';
      if (y >= 11 && x >= 6 && x <= 9) return 'v';
      return '.';
    },
    mur: (x, y) => (y % 4 === 3 ? 'o' : x % 8 === (y % 8 < 4 ? 0 : 4) ? 'o' : bruit(x, y) < 12 ? 'n' : 'm'),
    fenetre: (x, y) => (x >= 4 && x <= 11 && y >= 4 && y <= 11 ? (x === 4 || x === 11 || y === 4 || y === 11 || x === 7 || y === 7 ? 'o' : 'j') : TUILES.mur(x, y)),
    porte: (x, y) => (x >= 3 && x <= 12 && y >= 2 ? (x === 3 || x === 12 || y === 2 ? 'o' : x === 10 && y === 9 ? 'y' : 'v') : TUILES.mur(x, y)),
    toit: (x, y) => (y % 4 === 0 ? 's' : (x + (y >> 2) * 2) % 4 === 0 ? 's' : 'r'),
    puits: (x, y) => {
      const dx = x - 7.5, dy = y - 7.5, r = dx * dx + dy * dy;
      if (r < 16) return bruit(x, y) < 20 ? 'j' : 'i';
      if (r < 49) return (x + y) % 3 === 0 ? 'k' : 'q';
      return '.';
    },
    pierre: (x, y) => (y % 5 === 4 ? 'l' : x % 6 === (Math.floor(y / 5) % 2 ? 0 : 3) ? 'l' : bruit(x, y) < 15 ? 'q' : 'p'),
    entree: (x, y) => {
      const dx = x - 7.5;
      if (y >= 3 && Math.abs(dx) < 5 && (y > 6 || dx * dx + (y - 7) * (y - 7) < 25)) return 'x';
      return TUILES.pierre(x, y);
    },
    dalle: (x, y) => (x % 8 === 0 || y % 8 === 0 ? 'h' : bruit(x, y) < 8 ? 'k' : 'd'),
    tombe: (x, y) => {
      if (x >= 4 && x <= 11 && y >= 3 && y <= 13) {
        if (y === 3 && (x === 4 || x === 11)) return '.';
        if (x === 4 || x === 11 || y === 3 || y === 13) return 'l';
        return (x === 7 || x === 8) && y >= 5 && y <= 10 ? 'l' : (y === 7 && x >= 6 && x <= 9 ? 'l' : 'q');
      }
      return '.';
    },
    os: (x, y) => ((y === 9 && x >= 4 && x <= 11) || ((x === 4 || x === 11) && (y === 8 || y === 10)) || (x >= 9 && x <= 12 && y >= 3 && y <= 6 && !(x === 12 && y === 6)) ? 'w' : (x === 10 && y === 4) || (x === 11 && y === 4) ? 'x' : '.'),
    grille: (x, y) => (y === 2 || y === 13 ? 'l' : x % 4 === 1 && y > 2 && y < 13 ? 'k' : x % 4 === 2 && y > 2 && y < 13 ? 'q' : '.'),
    hilda: habitante('y', 'B', 'C'),
    maelis: habitante('E', 'D', null),
    torche: (x, y) => (x >= 7 && x <= 8 && y >= 7 && y <= 13 ? 'v' : y >= 3 && y <= 6 && Math.abs(x - 7.5) < (y - 1) / 2 ? (y < 5 ? 'y' : 'z') : '.'),
  };
  const PASSAGES = { grille: 'bloque', arbre: 'bloque', mur: 'bloque', fenetre: 'bloque', porte: 'bloque', toit: 'bloque', puits: 'bloque', pierre: 'bloque', tombe: 'bloque', torche: 'bloque' };

  function pixels(f, taille) {
    const data = new Uint8ClampedArray(taille * taille * 4);
    for (let y = 0; y < taille; y++) {
      for (let x = 0; x < taille; x++) {
        const ch = f(Math.floor((x * 16) / taille), Math.floor((y * 16) / taille));
        if (ch === '.') continue;
        const [r, g, b] = hexToRgba(COULEURS[ch]);
        data.set([r, g, b, 255], (y * taille + x) * 4);
      }
    }
    return data;
  }

  const dire = (texte, qui = '@evenement') => ({ type: 'dire', qui, expression: 'normal', texte });
  const page = (commandes, conditions = [], cache = false) => ({ conditions, cache, commandes });
  const ev = (id, nom, type, x, y, pages, autres = {}) => ({ id, nom, type, x, y, apparence: { personnage: '', tuile: -1 }, direction: 'bas', deplacement: 'fixe', traversable: false, declenchement: 'parler', pages, ...autres });
  const fait = { type: 'local', valeur: true };

  // Remplit un jeu neuf (Doc.create) : tuiles, deux cartes, événements, données du modèle D&D 5e.
  function remplir(doc) {
    const noms = Object.keys(TUILES);
    doc.tiles = noms.map((nom) => ({ id: Doc.newId(), name: nom, frames: [pixels(TUILES[nom], doc.tileSize)], duration: Doc.DEFAULT_DURATION, passage: PASSAGES[nom] || 'auto' }));
    const T = Object.fromEntries(noms.map((n, i) => [n, i]));
    for (const hex of Object.values(COULEURS)) if (!doc.palette.includes(hex)) doc.palette.push(hex);

    // --- Le village de Brumeval (20 × 15) ---
    const village = Doc.newMap({ id: 'brumeval', name: 'Brumeval', width: 20, height: 15 });
    const crypte = Doc.newMap({ id: 'crypte', name: 'Crypte de Brumeval', width: 16, height: 12, interieur: true });
    const poser = (m, calque, x, y, t) => { if (x >= 0 && y >= 0 && x < m.width && y < m.height) m.layers[calque].cells[y * m.width + x] = t; };
    const rect = (m, calque, x0, y0, w, h, t) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) poser(m, calque, x, y, t); };
    rect(village, 0, 0, 0, 20, 15, T.herbe);
    rect(village, 0, 0, 8, 20, 2, T.chemin); // la grand-route, d'ouest en est
    rect(village, 0, 9, 2, 2, 6, T.chemin); // vers la colline et la crypte
    rect(village, 0, 9, 10, 2, 5, T.chemin);
    // La colline au nord, et l'entrée de la crypte.
    rect(village, 1, 5, 0, 10, 2, T.pierre);
    poser(village, 1, 9, 1, T.entree); poser(village, 1, 10, 1, T.entree);
    // L'auberge (à l'ouest) et la maison de la vieille Maëlis (à l'est).
    rect(village, 1, 2, 3, 5, 2, T.toit); rect(village, 1, 2, 5, 5, 2, T.mur);
    poser(village, 1, 3, 6, T.fenetre); poser(village, 1, 4, 6, T.porte); poser(village, 1, 5, 6, T.fenetre);
    rect(village, 1, 14, 3, 4, 2, T.toit); rect(village, 1, 14, 5, 4, 2, T.mur);
    poser(village, 1, 15, 6, T.porte); poser(village, 1, 16, 6, T.fenetre);
    poser(village, 1, 12, 11, T.puits);
    for (const [x, y] of [[0, 2], [1, 4], [0, 12], [2, 13], [4, 12], [17, 12], [19, 11], [18, 14], [19, 2], [7, 13], [15, 13]]) poser(village, 1, x, y, T.arbre);
    village.warps = [
      { id: 'w-1', x: 9, y: 2, carte: 'crypte', tx: 7, ty: 10, direction: 'haut' },
      { id: 'w-2', x: 10, y: 2, carte: 'crypte', tx: 8, ty: 10, direction: 'haut' },
    ];
    village.ambiance = { ...village.ambiance, meteo: 'feuilles', intensite: 25 };

    // --- La crypte (16 × 12) ---
    rect(crypte, 0, 0, 0, 16, 12, T.dalle);
    rect(crypte, 1, 0, 0, 16, 1, T.pierre); rect(crypte, 1, 0, 0, 1, 12, T.pierre); rect(crypte, 1, 15, 0, 1, 12, T.pierre); rect(crypte, 1, 0, 11, 16, 1, T.pierre);
    poser(crypte, 1, 7, 11, -1); poser(crypte, 1, 8, 11, -1); poser(crypte, 0, 7, 11, T.chemin); poser(crypte, 0, 8, 11, T.chemin);
    rect(crypte, 1, 1, 6, 6, 1, T.pierre); rect(crypte, 1, 9, 6, 6, 1, T.pierre); // un mur coupe la crypte en deux ; la grille ferme le passage
    for (const x of [2, 4, 11, 13]) poser(crypte, 1, x, 8, T.tombe);
    for (const x of [2, 5, 10, 13]) poser(crypte, 1, x, 2, T.tombe);
    for (const [x, y] of [[3, 9], [12, 4], [6, 3]]) poser(crypte, 1, x, y, T.os);
    for (const [x, y] of [[1, 1], [14, 1], [1, 7], [14, 7]]) poser(crypte, 2, x, y, T.torche);
    crypte.warps = [
      { id: 'w-1', x: 7, y: 11, carte: 'brumeval', tx: 9, ty: 3, direction: 'bas' },
      { id: 'w-2', x: 8, y: 11, carte: 'brumeval', tx: 10, ty: 3, direction: 'bas' },
    ];
    crypte.ambiance = { ...crypte.ambiance, teinte: '#1c2440', force: 45, jour_nuit: false };

    // --- Les événements du village ---
    village.events = [
      ev('panneau', 'Panneau', 'panneau', 8, 7, [page([dire('Brumeval. Au nord : la vieille crypte (entrée interdite depuis que les morts s\'y réveillent).', '')])]),
      ev('aubergiste', 'Hilda l\'aubergiste', 'pnj', 4, 7, [
        page([
          dire('Bienvenue au Sanglier Gris ! Vous avez l\'air de vrais aventuriers… Depuis une semaine, des morts sortent de la crypte, sur la colline. Ramenez-nous la paix, et vous serez nourris à vie !'),
          { type: 'quete', quete: 'crypte', action: 'commencer', etape: 1 },
          { type: 'local', valeur: true },
        ]),
        page([
          dire('Une chambre pour la nuit ? C\'est la maison qui offre.'),
          { type: 'choix', options: [
            { texte: 'Oui, dormir (repos long)', commandes: [dire('Vous dormez comme des souches. Au matin, tout le monde est en pleine forme.'), { type: 'repos', sorte: 'long' }] },
            { texte: 'Non merci', commandes: [dire('Comme vous voudrez. Revenez quand vous voulez !')] },
          ] },
        ], [fait]),
      ], { deplacement: 'regarde', apparence: { personnage: '', tuile: T.hilda } }),
      ev('maelis', 'La vieille Maëlis', 'pnj', 15, 7, [
        page([
          dire('Hmpf. Encore des héros qui vont se faire dévorer. Pourquoi je vous aiderais, moi ?'),
          { type: 'test_oppose', competence: 'persuasion', qui: 'choix', nom_adverse: 'Maëlis', monstre: '', competence_adverse: 'intuition', contre: 1, reussi: [
            dire('… Bon. Vous avez l\'air sincères. Prenez ça : ma potion du dimanche. Et méfiez-vous des dalles qui sonnent creux, dans la crypte.'),
            { type: 'objet', action: 'donner', objet: 'potion-de-soins', nombre: 2 },
            { type: 'local', valeur: true },
          ], rate: [dire('Allez, ouste ! Revenez quand vous saurez parler aux anciens.')] },
        ]),
        page([dire('Les dalles qui sonnent creux, je vous dis !')], [fait]),
      ], { deplacement: 'regarde', apparence: { personnage: '', tuile: T.maelis } }),
      // Sur la route de l'est : une embuscade, une seule fois (deux cases, un interrupteur commun).
      ...[8, 9].map((y, k) => ev(`embuscade-${k + 1}`, 'Embuscade', 'declencheur', 17, y, [
        page([dire('Des buissons jaillissent deux gobelins, couteaux tirés !', ''), { type: 'combat_groupe', groupe: 'gobelins-de-la-route' }, { type: 'interrupteur', id: 'gobelins-battus', valeur: true }]),
        page([], [{ type: 'interrupteur', id: 'gobelins-battus', valeur: true }], true),
      ], { traversable: true, declenchement: 'toucher' })),
    ];

    // --- Les événements de la crypte ---
    crypte.events = [
      // Une dalle piégée : la Perception passive du groupe la voit, sinon une sauvegarde de Dextérité.
      ev('piege', 'Dalle piégée', 'declencheur', 7, 9, [
        page([
          { type: 'si', condition: { type: 'jdr_perception', min: 13 }, alors: [
            dire('Une dalle sonne creux sous la botte : un piège ! Vous l\'enjambez prudemment.', ''),
          ], sinon: [
            { type: 'sauvegarde', carac: 'dex', dd: 12, qui: 'tous', quoi: 'Des fléchettes jaillissent des murs !', degats: '2d4', type_degats: 'perforant', moitie: true, etat: '', reussi: [], rate: [] },
          ] },
          { type: 'local', valeur: true },
        ]),
        page([], [fait], true),
      ], { traversable: true, declenchement: 'toucher' }),
      // La grille rouillée qui ferme le passage (deux cases) : la forcer (Athlétisme) ou crocheter son cadenas.
      ...[7, 8].map((x) => ev(x === 7 ? 'grille' : 'grille-2', 'Grille rouillée', 'panneau', x, 6, [
        page([
          dire('Une grille rouillée ferme le passage. Un vieux cadenas pend à la serrure.', ''),
          { type: 'choix', options: [
            { texte: 'La forcer (Athlétisme)', commandes: [{ type: 'test', competence: 'athletisme', dd: 13, qui: 'choix', avantage: false, desavantage: false, quoi: 'Forcer la grille', variable: '', reussi: [dire('Dans un grincement atroce, la grille cède !', ''), { type: 'interrupteur', id: 'grille-ouverte', valeur: true }], rate: [dire('La grille ne bouge pas d\'un pouce.', '')] }] },
            { texte: 'Crocheter le cadenas', commandes: [{ type: 'test', competence: 'dex', dd: 12, qui: 'meilleur', avantage: false, desavantage: false, quoi: 'Crocheter le cadenas', variable: '', reussi: [dire('Clic. Le cadenas s\'ouvre.', ''), { type: 'interrupteur', id: 'grille-ouverte', valeur: true }], rate: [dire('Le crochet glisse… le cadenas résiste.', '')] }] },
            { texte: 'Laisser tomber', commandes: [] },
          ] },
        ]),
        page([], [{ type: 'interrupteur', id: 'grille-ouverte', valeur: true }], true),
      ])),
      // Deux rencontres, chacune sur toute la largeur du passage (un interrupteur les cache une fois jouées).
      ...[7, 8].map((x) => ev(`morts-${x}`, 'Les morts se lèvent', 'declencheur', x, 5, [
        page([dire('Les tombes se fendent… Un squelette et un zombi se dressent devant vous !', ''), { type: 'combat_groupe', groupe: 'morts-reveilles' }, { type: 'interrupteur', id: 'morts-vaincus', valeur: true }, { type: 'quete', quete: 'crypte', action: 'etape', etape: 2 }]),
        page([], [{ type: 'interrupteur', id: 'morts-vaincus', valeur: true }], true),
      ], { traversable: true, declenchement: 'toucher' })),
      ...Array.from({ length: 14 }, (_, k) => k + 1).map((x) => ev(`gardien-${x}`, 'Le gardien de la crypte', 'declencheur', x, 3, [
        page([
          dire('Au fond de la crypte, une goule affamée lève la tête. Ses griffes luisent d\'un venin paralysant.', ''),
          { type: 'combat_groupe', groupe: 'gardien-de-la-crypte' },
          { type: 'interrupteur', id: 'gardien-vaincu', valeur: true },
          { type: 'etat', action: 'retirer', etat: 'paralyse', qui: 'tous' },
          dire('La goule s\'effondre. Le silence revient enfin dans la crypte.', ''),
          { type: 'xp', montant: 200, jalon: false },
          { type: 'quete', quete: 'crypte', action: 'finir', etape: 1 },
        ]),
        page([], [{ type: 'interrupteur', id: 'gardien-vaincu', valeur: true }], true),
      ], { traversable: true, declenchement: 'toucher' })),
      ev('coffre', 'Coffre du gardien', 'coffre', 8, 1, [
        page([dire('Dans le coffre : 50 pièces d\'or et une potion de soins supérieurs.', ''), { type: 'argent', action: 'donner', montant: 50 }, { type: 'objet', action: 'donner', objet: 'potion-de-soins-superieurs', nombre: 1 }, { type: 'local', valeur: true }]),
        page([dire('Le coffre est vide.', '')], [fait]),
      ]),
    ];
    for (const e of crypte.events) if (e.id.startsWith('grille')) e.apparence = { personnage: '', tuile: T.grille };

    doc.maps = [village, crypte];
    doc.mapIndex = 0;
    doc.map = village;
    doc.depart = { carte: 'brumeval', x: 9, y: 9, direction: 'haut' };

    // --- Les données : le modèle D&D 5e, une rencontre en plus, la quête ---
    const data = doc.data;
    data.reglages.regles = 'jdr';
    data.reglages.monnaie = 'po';
    data.reglages.argent_depart = 0; // chaque personnage arrive avec l'or de sa classe
    data.reglages.equipe_max = 4;
    DonneesJdr.chargerModele(data);
    // Les trois rencontres, à la mesure de trois personnages de niveau 1 (moyenne, moyenne, difficile).
    for (const g of [
      { id: 'gobelins-de-la-route', nom: 'Gobelins de la route', monstres: [{ monstre: 'gobelin', nombre: 2 }] },
      { id: 'morts-reveilles', nom: 'Les morts réveillés', monstres: [{ monstre: 'squelette', nombre: 1 }, { monstre: 'zombi', nombre: 1 }] },
      { id: 'gardien-de-la-crypte', nom: 'Le gardien de la crypte', monstres: [{ monstre: 'goule', nombre: 1 }], fuite: false },
    ]) data.groupes.push(Donnees.normElement('groupes', g, data.groupes.length));
    // Le héros : seulement son apparence (les personnages créés par le joueur la prennent) ; sa fiche se crée dans Saga.
    data.personnages.unshift({ id: 'aventurier', nom: 'Aventurier', description: 'L\'apparence des personnages que le joueur crée.', heros: true, couleur: '#ffb347', tuile: -1, portraits: [], sprite: null, tenues: [], classe: '', niveau: 1, equipement: {} });
    data.quetes.push({ id: 'crypte', titre: 'La crypte de Brumeval', description: 'Les morts sortent de la vieille crypte, sur la colline. Hilda, l\'aubergiste, compte sur nous.', secondaire: false, suivante: '', personnages: [], etapes: [{ texte: 'Descendre dans la crypte, au nord du village' }, { texte: 'Trouver ce qui réveille les morts' }] });
    data.interrupteurs.push({ id: 'gobelins-battus', nom: 'Gobelins de la route battus', description: '' }, { id: 'grille-ouverte', nom: 'Grille de la crypte ouverte', description: '' }, { id: 'morts-vaincus', nom: 'Morts de la crypte vaincus', description: '' }, { id: 'gardien-vaincu', nom: 'Gardien de la crypte vaincu', description: '' });
    // Les règles maison : on crée trois personnages (ou on prend des pré-tirés).
    data.reglages.jdr.creation.nombre = 3;
  }

  return { remplir };
})();
