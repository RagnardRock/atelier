// Le petit domaine (Tafl 1.4.2, joué par Saga 1.6.1) : le petit jeu modèle pour essayer le module gestion.
//
// Une clairière avec un pré constructible, une bâtisseuse qui explique, un lit de camp pour dormir, du bois
// et du blé à ramasser (ils repoussent après quelques nuits). Trois bâtiments : la maison (2 habitants,
// une copie de l'intérieur par maison posée), la ferme (du blé chaque nuit, avec un ouvrier) et le grenier
// (le même intérieur pour tous). Les habitants mangent du blé et partent après 3 nuits de faim.
//
// Proposé dans Fichier › Nouveau jeu. Les tuiles sont dessinées ici en 16 × 16, comme pour l'arène.

const ExempleDomaine = (() => {
  // Une couleur, ou [couleur, opacité] (l'ombre).
  const COULEURS = {
    a: '#5aa04a', b: '#4a8c3e', c: '#74b85a',            // herbe
    d: '#c9a46a', e: '#b08850',                          // chemin
    f: '#f2d84a', g: '#e86a8a',                          // fleurs
    h: '#3d8ad0', i: '#6ab0e8',                          // eau
    j: '#2f6b34', k: '#3f8a40', l: '#6b4a2a', m: '#4e3520', // arbre
    n: '#c04a3a', o: '#8a2e24', p: '#3a6ab0', q: '#25467a', // toits rouge et bleu
    r: '#e8dcc0', s: '#bfae8a', t: '#7a5232', u: '#a8d8f0', v: '#5a3a20', // murs, porte, fenêtre
    w: '#a8783e', x: '#8a6030', y: '#d0c8b0', Y: '#a89e86', // plancher, mur intérieur
    z: ['#000000', 0.3],                                 // ombre
    A: '#f2e6a0', B: '#d8b84a', C: '#7a5a3a', D: '#5e4228', // blé, terre
    E: '#eeeef4', F: '#d04a4a', G: '#8a6a4a', H: '#c89a62', // lit, bûches
    I: '#b84a6a', J: '#e0b070',                          // tapis, sac
  };
  const bruit = (x, y, n = 0) => { let h = (x * 374761393 + y * 668265263 + n * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) % 100; };
  const herbe = (x, y) => (bruit(x, y) < 10 ? 'b' : bruit(x, y, 1) < 8 ? 'c' : 'a');
  const dans = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  // Un toit : des rangées de tuiles, plus sombres au bord (g : gauche, m : milieu, d : droite).
  const toit = (clair, sombre, cote) => (x, y) => {
    if ((cote === 'g' && x < 1) || (cote === 'd' && x > 14)) return sombre;
    if (y % 4 === 3) return sombre;
    return (x + (Math.floor(y / 4) % 2) * 2) % 4 === 0 ? sombre : clair;
  };
  const mur = (x, y) => (y === 15 ? 's' : x % 8 === 0 ? 's' : 'r');
  const TUILES = {
    herbe,
    fleurs: (x, y) => (dans(x, y, 4, 4, 1) || dans(x, y, 11, 10, 1) ? 'f' : dans(x, y, 11, 3, 1) || dans(x, y, 4, 12, 1) ? 'g' : herbe(x, y)),
    chemin: (x, y) => (bruit(x, y) < 14 ? 'e' : 'd'),
    eau: (x, y) => ((y % 6 === 2 && (x + y) % 8 < 4) ? 'i' : 'h'),
    arbre_haut: (x, y) => (dans(x, y, 7.5, 12, 8) ? (bruit(x, y) < 25 ? 'j' : 'k') : '.'),
    arbre_bas: (x, y) => (y < 7 && dans(x, y, 7.5, -1, 8) ? (bruit(x, y, 2) < 25 ? 'j' : 'k') : x >= 6 && x <= 9 ? (x === 6 ? 'm' : 'l') : herbe(x, y)),
    toit_g: toit('n', 'o', 'g'), toit_m: toit('n', 'o', 'm'), toit_d: toit('n', 'o', 'd'),
    toit2_g: toit('p', 'q', 'g'), toit2_m: toit('p', 'q', 'm'), toit2_d: toit('p', 'q', 'd'),
    mur,
    fenetre: (x, y) => (x >= 4 && x <= 11 && y >= 4 && y <= 10 ? (x === 4 || x === 11 || y === 4 || y === 10 || x === 7 || y === 7 ? 'v' : 'u') : mur(x, y)),
    porte: (x, y) => (x >= 4 && x <= 11 && y >= 3 ? (x === 4 || x === 11 || y === 3 ? 'v' : x === 9 && y === 9 ? 'f' : 't') : mur(x, y)),
    ombre: () => 'z',
    champ: (x, y) => (y % 4 === 0 ? 'D' : 'C'),
    ble: (x, y) => (y % 4 === 0 ? 'D' : x % 3 === 0 ? (y < 6 ? 'A' : 'B') : y % 4 === 3 ? 'C' : 'B'),
    tas_bois: (x, y) => {
      const buche = (cx, cy) => (dans(x, y, cx, cy, 2.5) ? (dans(x, y, cx, cy, 1.2) ? 'G' : 'H') : null);
      return buche(4, 11) || buche(10, 11) || buche(7, 6) || '.';
    },
    gerbe: (x, y) => (x >= 5 && x <= 10 && y >= 2 && y <= 14 ? (y === 9 ? 'D' : (x + y) % 3 === 0 ? 'A' : 'B') : '.'),
    lit: (x, y) => (x < 2 || x > 13 || y < 1 || y > 15 ? '.' : y < 4 ? 'G' : y < 7 ? 'E' : x === 2 || x === 13 ? 'o' : 'F'),
    plancher: (x, y) => (y % 4 === 3 ? 'x' : (x + Math.floor(y / 4) * 5) % 16 === 0 ? 'x' : 'w'),
    mur_interieur: (x, y) => (y > 12 ? 'Y' : x % 8 === 0 ? 'Y' : 'y'),
    tapis: (x, y) => ((x + y) % 6 === 0 || (x - y + 16) % 6 === 0 ? 'f' : 'I'),
    paillasson: (x, y) => (x < 2 || x > 13 || y < 4 || y > 12 ? (y % 4 === 3 ? 'x' : 'w') : (x + y) % 2 ? 'G' : 'H'),
    sac: (x, y) => (dans(x, y, 7.5, 9.5, 5.5) || (x >= 5 && x <= 10 && y >= 2 && y <= 5) ? (y === 4 ? 'v' : 'J') : '.'),
  };
  const PASSAGES = { eau: 'bloque', arbre_bas: 'bloque', mur_interieur: 'bloque' };

  function pixels(f, taille) {
    const data = new Uint8ClampedArray(taille * taille * 4);
    for (let y = 0; y < taille; y++) {
      for (let x = 0; x < taille; x++) {
        const ch = f(Math.floor((x * 16) / taille), Math.floor((y * 16) / taille));
        const c = COULEURS[ch];
        if (ch === '.' || !c) continue;
        const [hex, opacite] = Array.isArray(c) ? c : [c, 1];
        const [r, g, b] = hexToRgba(hex);
        data.set([r, g, b, Math.round(opacite * 255)], (y * taille + x) * 4);
      }
    }
    return data;
  }

  const dire = (texte, qui = '') => ({ type: 'dire', qui, expression: 'normal', texte });
  const page = (commandes, conditions = [], cache = false) => ({ conditions, cache, commandes });
  const ev = (id, nom, type, x, y, pages, autres = {}) => ({ id, nom, type, x, y, apparence: { personnage: '', tuile: -1 }, direction: 'bas', deplacement: 'fixe', traversable: false, declenchement: 'parler', pages, ...autres });
  const fait = { type: 'local', valeur: true };
  // Une chose à ramasser : elle s'ajoute au stock du domaine, puis disparaît (et repousse si nuits > 0).
  const ramassage = (id, nom, x, y, tuile, ressource, nombre, nuits) => ev(id, nom, 'objet', x, y, [
    page([{ type: 'gestion_stock', action: 'ajouter', ressource, nombre, annoncer: true }, { type: 'local', valeur: true }]),
    page([], [fait], true),
  ], { apparence: { personnage: '', tuile }, ...(nuits ? { repousse_nuits: nuits } : {}) });
  const lit = (id, x, y, T) => ev(id, 'Lit', 'pnj', x, y, [
    page([dire('Une bonne nuit de sommeil : le domaine travaille pendant que tu dors.'), { type: 'dormir', texte: '', soigner: true, heure: '' }]),
  ], { apparence: { personnage: '', tuile: T.lit } });

  // Un intérieur : murs en haut et sur les côtés, plancher, un paillasson pour sortir.
  function interieur(T, id, nom, objets) {
    const m = Doc.newMap({ id, name: nom, width: 9, height: 7, interieur: true });
    const poser = (x, y, t, calque = 0) => { m.layers[calque].cells[y * m.width + x] = t; };
    for (let y = 0; y < 7; y++) for (let x = 0; x < 9; x++) poser(x, y, T.plancher);
    for (let x = 0; x < 9; x++) { poser(x, 0, T.mur_interieur, 1); poser(x, 1, T.mur_interieur, 1); }
    for (let y = 2; y < 7; y++) { poser(0, y, T.mur_interieur, 1); poser(8, y, T.mur_interieur, 1); }
    for (let x = 3; x <= 5; x++) for (let y = 3; y <= 4; y++) poser(x, y, T.tapis);
    poser(4, 6, T.paillasson);
    m.events = [
      ev(`${id}-sortie`, 'Sortie', 'declencheur', 4, 6, [page([{ type: 'gestion_sortir' }])], { traversable: true, declenchement: 'toucher' }),
      ...objets,
    ];
    return m;
  }

  // Remplit un jeu neuf (Doc.create) : les tuiles, les tampons, les trois cartes et les données du domaine.
  function remplir(doc) {
    const noms = Object.keys(TUILES);
    doc.tiles = noms.map((nom) => ({ id: Doc.newId(), name: nom, frames: [pixels(TUILES[nom], doc.tileSize)], duration: Doc.DEFAULT_DURATION, passage: PASSAGES[nom] || 'auto' }));
    const T = Object.fromEntries(noms.map((n, i) => [n, i]));
    for (const c of Object.values(COULEURS)) { const hex = Array.isArray(c) ? c[0] : c; if (!doc.palette.includes(hex)) doc.palette.push(hex); }

    // Les tampons : la maison et le grenier (4 × 3 : le toit, le mur avec sa porte, l'ombre à droite),
    // la ferme (3 × 2 : du blé sur la terre).
    const batisse = (g, m, d) => [g, m, d, -1, g, m, d, -1, T.fenetre, T.porte, T.mur, T.ombre];
    doc.stamps = [];
    doc.stamps.push(Doc.newStamp(doc, { name: 'maison', w: 4, h: 3, dessus: 1, cells: batisse(T.toit_g, T.toit_m, T.toit_d) }));
    doc.stamps.push(Doc.newStamp(doc, { name: 'grenier', w: 4, h: 3, dessus: 1, cells: batisse(T.toit2_g, T.toit2_m, T.toit2_d) }));
    doc.stamps.push(Doc.newStamp(doc, { name: 'ferme', w: 3, h: 2, dessus: 0, cells: [T.ble, T.ble, T.ble, T.champ, T.champ, T.champ] }));

    // --- La clairière : des arbres autour, une mare, un chemin et le pré constructible ---
    const W = 26, H = 18;
    const m = Doc.newMap({ id: 'clairiere', name: 'La clairière', width: W, height: H });
    const poser = (x, y, t, calque = 0) => { if (x >= 0 && y >= 0 && x < W && y < H) m.layers[calque].cells[y * W + x] = t; };
    const rect = (x0, y0, w, h, t, calque = 0) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) poser(x, y, t, calque); };
    const arbre = (x, y) => { poser(x, y, T.arbre_haut, 2); poser(x, y + 1, T.arbre_bas, 1); };
    rect(0, 0, W, H, T.herbe);
    for (let k = 0; k < 18; k++) poser(1 + ((k * 7) % 24), 2 + ((k * 5) % 15), T.fleurs);
    rect(3, 14, 18, 1, T.chemin);
    rect(12, 15, 1, 3, T.chemin);
    rect(19, 2, 5, 4, T.eau);
    for (let x = 0; x < W; x++) { arbre(x, 0); arbre(x, H - 2); }
    for (let y = 2; y < H - 2; y += 2) { arbre(0, y); arbre(W - 1, y); }
    for (const [x, y] of [[18, 7], [23, 7], [2, 15], [22, 15]]) arbre(x, y);
    m.zones = [{ id: 'pre', name: 'Le pré', type: 'constructible', x: 3, y: 3, w: 14, h: 10, objet: '', taux: 0, rencontres: [] }];
    m.events = [
      ev('brune', 'Brune la bâtisseuse', 'pnj', 10, 15, [
        page([
          dire('Bienvenue dans la clairière ! Ici, on bâtit un domaine, une nuit après l\'autre.', 'brune'),
          dire('Ouvre ton carnet (Tab) : le bouton Domaine montre le stock, et Construire te laisse poser un bâtiment dans le pré, avec les flèches.', 'brune'),
          dire('Une maison coûte 6 bois et loge deux habitants. Une ferme coûte 4 bois : avec un ouvrier, elle donne 3 blé chaque nuit.', 'brune'),
          dire('Les habitants mangent un blé par nuit. Après trois nuits de faim, ils s\'en vont. Le bois et les gerbes repoussent : ramasse-les !', 'brune'),
          dire('Pour que la nuit passe, va dormir au lit de camp, à droite du chemin. Bonne chance !', 'brune'),
          { type: 'local', valeur: true },
        ]),
        page([
          dire('Le carnet (Tab) › Construire, puis va dormir : le chantier avance la nuit. Entre dans une maison finie par sa porte !', 'brune'),
        ], [fait]),
      ], { apparence: { personnage: 'brune', tuile: -1 }, deplacement: 'regarde', direction: 'bas' }),
      lit('lit-de-camp', 16, 15, T),
      ev('panneau', 'Panneau', 'panneau', 13, 13, [
        page([dire('Domaine de la Clairière. Le pré, au nord, est à bâtir. Le carnet (Tab) › Construire.')]),
      ]),
      ramassage('bois-1', 'Tas de bois', 19, 9, T.tas_bois, 'bois', 3, 2),
      ramassage('bois-2', 'Tas de bois', 22, 10, T.tas_bois, 'bois', 3, 2),
      ramassage('bois-3', 'Tas de bois', 20, 12, T.tas_bois, 'bois', 3, 2),
      ramassage('bois-4', 'Tas de bois', 4, 15, T.tas_bois, 'bois', 3, 2),
      ramassage('gerbe-1', 'Gerbe sauvage', 22, 13, T.gerbe, 'ble', 2, 3),
      ramassage('gerbe-2', 'Gerbe sauvage', 7, 15, T.gerbe, 'ble', 2, 3),
    ];

    // --- Les intérieurs : celui de la maison (une copie par maison posée) et le grenier (partagé) ---
    const maison = interieur(T, 'maison', 'Intérieur de la maison', [
      lit('maison-lit', 2, 2, T),
      ramassage('maison-buches', 'Panier de bûches', 6, 2, T.tas_bois, 'bois', 2, 0),
    ]);
    const grenier = interieur(T, 'grenier', 'Le grenier', [
      ramassage('grenier-sac', 'Sac de grain', 2, 2, T.sac, 'ble', 3, 0),
      ramassage('grenier-sac-2', 'Sac de grain', 6, 2, T.sac, 'ble', 3, 0),
    ]);

    for (const c of [m, maison, grenier]) c.events = Events.normEvents(c.events, c.width, c.height, doc.tiles.length);
    doc.maps = [m, maison, grenier];
    doc.mapIndex = 0;
    doc.map = m;
    doc.depart = { carte: 'clairiere', x: 12, y: 16, direction: 'haut' };

    // --- Les données : le module gestion, ses ressources et ses bâtiments ---
    const data = doc.data;
    data.reglages.regles = 'jrpg';
    data.reglages.modules = ['gestion'];
    data.reglages.modules_reglages = {
      ...(data.reglages.modules_reglages || {}),
      gestion: DonneesGestion.normReglages({
        nom: 'Domaine de la Clairière', capacite: 0, menu: true, construire_menu: true,
        stock_depart: [{ ressource: 'bois', nombre: 12 }, { ressource: 'ble', nombre: 4 }],
        habitants_depart: 0, repas: [{ ressource: 'ble', nombre: 1 }], arrivees: 1, faim: 'departs', faim_nuits: 3,
      }),
    };
    const N = DonneesGestion.NORMES;
    data.ressources = [
      N.ressources({ id: 'bois', nom: 'Bois', description: 'Pour bâtir. Les tas de bois repoussent après 2 nuits.' }, 0),
      N.ressources({ id: 'ble', nom: 'Blé', description: 'Ce que mangent les habitants, un par nuit.' }, 1),
    ];
    const porteMaison = ['libre', 'libre', 'libre', 'libre', 'bloque', 'bloque', 'bloque', 'libre', 'bloque', 'porte', 'bloque', 'libre'];
    data.batiments = [
      N.batiments({ id: 'maison', nom: 'Maison', description: 'Loge deux habitants. Chaque maison a son propre intérieur.', cout: [{ ressource: 'bois', nombre: 6 }], jours: 1,
        tampon: 'maison', passage: porteMaison, porte_vers: { carte: 'maison', x: 4, y: 5, direction: 'haut' }, interieur: 'propre', logement: 2 }, 0),
      N.batiments({ id: 'ferme', nom: 'Ferme', description: 'Donne 3 blé chaque nuit, s\'il y a un habitant pour y travailler.', cout: [{ ressource: 'bois', nombre: 4 }], jours: 1,
        tampon: 'ferme', production: [{ ressource: 'ble', nombre: 3 }], ouvriers: 1 }, 1),
      N.batiments({ id: 'grenier', nom: 'Grenier', description: 'Un grand grenier : tous les greniers mènent au même endroit.', cout: [{ ressource: 'bois', nombre: 8 }], jours: 2,
        tampon: 'grenier', passage: porteMaison, porte_vers: { carte: 'grenier', x: 4, y: 5, direction: 'haut' }, interieur: 'partage' }, 2),
    ];
    data.personnages.unshift({ id: 'fermier', nom: 'Fermier', description: 'L\'apparence du joueur.', heros: true, couleur: '#4a9ae0', tuile: -1, portraits: [], sprite: null, tenues: [] });
    data.personnages.push({ id: 'brune', nom: 'Brune', description: 'La bâtisseuse de la clairière.', heros: false, couleur: '#c07a3a', tuile: -1, portraits: [], sprite: null, tenues: [] });
  }

  return { remplir };
})();
