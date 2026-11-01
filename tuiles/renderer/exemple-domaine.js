// Le petit domaine (Tafl 1.4.2, joué par Saga 1.6.1 ; Tafl 1.7 : habitants visibles et sentiers ; Tafl 1.8 : leur journée à l'horloge ;
// Tafl 1.9 : le sous-bois et ses combats, les bains et le potager ; Tafl 1.13 : des habitants nommés et le module relations) :
// le petit jeu modèle pour essayer le module gestion.
//
// Une clairière avec un pré constructible, une bâtisseuse qui explique, un lit de camp pour dormir, du bois
// et du blé à ramasser (ils repoussent après quelques nuits). Trois bâtiments : la maison (2 habitants,
// une copie de l'intérieur par maison posée), la ferme (du blé chaque nuit, avec un ouvrier) et le grenier
// (le même intérieur pour tous). Les habitants mangent du blé et partent après 3 nuits de faim.
// Tafl 1.9 : au sud, le sous-bois et ses monstres (pack JRPG), qui laissent des herbes des bois (au stock tout
// seuls) ; les bains chauds (on s'y repose : soin et bonus pour 3 combats) et le potager (Force chaque matin).
// Tafl 1.13 : les habitants ont un nom (Aldo, Mila, Pépin, Rosa), on leur parle quand ils se promènent, et on
// peut leur offrir des fleurs, des baies ou des galets ramassés en chemin ; Brune aussi. L'amitié débloque
// leurs confidences, et une scène chez Brune.
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
    K: '#3aa8a0', L: '#24706a',                          // toit des bains
    M: '#5cc4d0', N: '#d8f6f8', O: '#8a8a94',            // eau chaude, vapeur, pierre
    P: '#9a5ab8', Q: '#f4ead8', R: '#1e1e24',            // champignon : chapeau, pied, yeux
    S: '#b89a7a', T: '#e8d8c8', U: '#6a4a3a',            // lapin, sanglier
    V: '#e0782a', W: '#3a7a2a', X: '#6aa04a',            // carottes, fanes, hautes herbes
    Z: '#7a2e8a', 0: '#b85ac8', 1: '#c8c8d0', 2: '#9a9aa6', // baies, galet
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
    herbe_tassee: (x, y) => (bruit(x, y, 3) < 38 ? (bruit(x, y, 4) < 50 ? 'd' : 'e') : herbe(x, y)),
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
    // Tafl 1.9 : les bains (toit vert d'eau, bassin fumant), le potager, et le sous-bois aux herbes hautes.
    toit3_g: toit('K', 'L', 'g'), toit3_m: toit('K', 'L', 'm'), toit3_d: toit('K', 'L', 'd'),
    bassin: (x, y) => (x < 1 || x > 14 || y < 1 || y > 14 ? 'O' : (bruit(x, y, 5) < 12 ? 'N' : 'M')),
    potager: (x, y) => (y % 5 === 4 ? 'D' : y % 5 === 0 ? (x % 3 === 1 ? 'W' : 'C') : y % 5 === 1 ? (x % 3 === 1 ? 'V' : 'C') : 'C'),
    hautes_herbes: (x, y) => ((x + (y % 2) * 2) % 4 === 0 && y % 3 !== 2 ? (y % 3 === 0 ? 'X' : 'k') : herbe(x, y)),
    // Tafl 1.13 : de petits cadeaux à ramasser : un bouquet de fleurs, un buisson de baies, un joli galet.
    bouquet: (x, y) => (dans(x, y, 5, 6, 1.6) || dans(x, y, 10, 5, 1.6) ? 'g' : dans(x, y, 7.5, 3.5, 1.6) ? 'f' : x >= 7 && x <= 8 && y >= 7 && y <= 13 ? 'W' : '.'),
    buisson_baies: (x, y) => (dans(x, y, 7.5, 9, 6.5) ? ([[5, 7], [9, 6], [11, 10], [6, 11], [8, 9]].some(([cx, cy]) => dans(x, y, cx, cy, 1)) ? (bruit(x, y, 7) < 50 ? 'Z' : '0') : (bruit(x, y, 8) < 30 ? 'j' : 'k')) : '.'),
    galet: (x, y) => (dans(x, y, 7.5, 10, 4) && y >= 7 ? (dans(x, y, 6.5, 9, 1.4) ? '1' : y > 11 ? 'O' : '2') : '.'),
  };
  // Les monstres du sous-bois (des dessins 16 × 16, tournés vers la droite).
  const MONSTRES = {
    champignon: (x, y) => (y >= 3 && y <= 8 && dans(x, y, 7.5, 8, 6) ? (bruit(x, y, 6) < 15 ? 'Q' : 'P') : y > 8 && y <= 14 && x >= 5 && x <= 10 ? ((y === 10 && (x === 7 || x === 9)) ? 'R' : 'Q') : '.'),
    lapin: (x, y) => ((x >= 4 && x <= 5 && y >= 1 && y <= 6) || (x >= 7 && x <= 8 && y >= 1 && y <= 6) ? 'S' : dans(x, y, 7, 10, 4.2) ? ((x === 9 && y === 9) ? 'R' : y > 12 ? 'T' : 'S') : '.'),
    sanglier: (x, y) => (dans(x, y, 7, 9, 6.5) && y > 3 ? ((x === 11 && y === 7) ? 'R' : x >= 12 && y >= 9 && y <= 10 ? 'T' : 'U') : (y >= 14 && (x === 3 || x === 6 || x === 9 || x === 11) ? 'U' : '.')),
  };
  const PASSAGES = { eau: 'bloque', arbre_bas: 'bloque', mur_interieur: 'bloque', bassin: 'bloque' };

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

  // Une image PNG (en texte) d'un dessin : pour les monstres en combat.
  function image(f, taille = 48) {
    const c = document.createElement('canvas');
    c.width = c.height = taille;
    c.getContext('2d').putImageData(new ImageData(pixels(f, taille), taille, taille), 0, 0);
    return c.toDataURL('image/png');
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
  // Tafl 1.13 : un petit cadeau à cueillir : il va dans le sac (pas au stock), puis repousse.
  const cueillette = (id, nom, x, y, tuile, objet, nuits) => ev(id, nom, 'objet', x, y, [
    page([{ type: 'objet', action: 'donner', objet, nombre: 1 }, { type: 'local', valeur: true }]),
    page([], [fait], true),
  ], { apparence: { personnage: '', tuile }, repousse_nuits: nuits, traversable: false });
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
    // Tafl 1.9 : les bains (comme une maison, au toit vert d'eau) et le potager (3 × 2).
    doc.stamps.push(Doc.newStamp(doc, { name: 'bains', w: 4, h: 3, dessus: 1, cells: batisse(T.toit3_g, T.toit3_m, T.toit3_d) }));
    doc.stamps.push(Doc.newStamp(doc, { name: 'potager', w: 3, h: 2, dessus: 0, cells: [T.potager, T.potager, T.potager, T.potager, T.potager, T.potager] }));

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
    // Tafl 1.9 : une trouée dans les arbres du bas (x = 12) mène au sous-bois.
    for (let x = 0; x < W; x++) { arbre(x, 0); if (x !== 12) arbre(x, H - 2); }
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
          dire('Regarde-les aller et venir entre leur maison et la ferme : à force, leurs pas tracent des sentiers dans l\'herbe.', 'brune'),
          dire('Ils ont leurs habitudes : au travail de 8 h à 17 h, une promenade le soir, et au lit à 21 h.', 'brune'),
          dire('Au sud, le chemin mène au sous-bois. Des bestioles grincheuses y rôdent, mais elles laissent des herbes des bois : elles vont tout droit au stock.', 'brune'),
          dire('Avec du bois et des herbes, tu pourras bâtir des bains chauds pour te reposer avant d\'y retourner, et un potager qui donne des forces chaque matin.', 'brune'),
          dire('Pour que la nuit passe, va dormir au lit de camp, à droite du chemin. Bonne chance !', 'brune'),
          dire('Et passe me dire bonjour de temps en temps. Les habitants aussi aiment bien qu\'on vienne leur parler !', 'brune'),
          { type: 'relation_parler', qui: 'brune', dire: false },
          { type: 'local', valeur: true },
        ]),
        // Tafl 1.13 : ensuite, une conversation par jour (ses paroles changent avec l'amitié), et un cadeau.
        page([
          { type: 'relation_parler', qui: '@evenement', dire: true },
          { type: 'choix', options: [
            { texte: 'Lui offrir quelque chose', commandes: [{ type: 'relation_offrir', qui: '@evenement', objet: '', reussi: [], rate: [] }] },
            { texte: 'Comment ça marche, déjà ?', commandes: [dire('Le carnet (Tab) › Construire, puis va dormir : le chantier avance la nuit. Entre dans une maison finie par sa porte !', 'brune')] },
            { texte: 'À plus tard', commandes: [] },
          ] },
        ], [fait]),
        // Tafl 1.13 : une scène qui ne se débloque qu'avec son amitié (niveau Ami), une seule fois.
        page([
          dire('{joueur}… Tu passes me voir tous les jours. Ça me fait plus plaisir que tu ne crois.', 'brune'),
          dire('Tiens : du bois de mon ancienne réserve. Entre amis, on s\'entraide.', 'brune'),
          { type: 'gestion_stock', action: 'ajouter', ressource: 'bois', nombre: 8, annoncer: true },
          { type: 'interrupteur', id: 'cadeau-brune', valeur: true },
        ], [fait, { type: 'relation_niveau', personnage: 'brune', min: 2 }, { type: 'interrupteur', id: 'cadeau-brune', valeur: false }]),
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
      // Tafl 1.13 : de petits cadeaux à ramasser (ils vont dans le sac, et repoussent).
      cueillette('fleurs-1', 'Fleurs des prés', 2, 6, T.bouquet, 'fleur', 1),
      cueillette('fleurs-2', 'Fleurs des prés', 17, 4, T.bouquet, 'fleur', 1),
      cueillette('galet-1', 'Joli galet', 21, 6, T.galet, 'galet', 2),
      // Tafl 1.9 : la sortie vers le sous-bois.
      ev('vers-sous-bois', 'Vers le sous-bois', 'declencheur', 12, 17, [page([{ type: 'teleporter', carte: 'sous-bois', x: 9, y: 1, direction: 'bas' }])], { traversable: true, declenchement: 'toucher' }),
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

    // Tafl 1.9 : les bains (un seul intérieur pour tous) : un bassin chaud où l'on se repose.
    const bains = interieur(T, 'bains', 'Les bains', [
      ev('bassin', 'Bassin chaud', 'pnj', 2, 2, [
        page([dire('L\'eau fume doucement. Tu t\'y glisses jusqu\'au menton…'), { type: 'gestion_repos', batiment: '', annoncer: true, reussi: [], rate: [] }]),
      ], { apparence: { personnage: '', tuile: T.bassin } }),
      ev('bassin-2', 'Bassin chaud', 'pnj', 6, 2, [
        page([dire('L\'eau fume doucement. Tu t\'y glisses jusqu\'au menton…'), { type: 'gestion_repos', batiment: '', annoncer: true, reussi: [], rate: [] }]),
      ], { apparence: { personnage: '', tuile: T.bassin } }),
    ]);

    // --- Tafl 1.9 : le sous-bois, des herbes hautes où l'on croise des monstres (pack JRPG) ---
    const SW = 18, SH = 13;
    const sb = Doc.newMap({ id: 'sous-bois', name: 'Le sous-bois', width: SW, height: SH });
    const poserSb = (x, y, t, calque = 0) => { if (x >= 0 && y >= 0 && x < SW && y < SH) sb.layers[calque].cells[y * SW + x] = t; };
    const arbreSb = (x, y) => { poserSb(x, y, T.arbre_haut, 2); poserSb(x, y + 1, T.arbre_bas, 1); };
    for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) poserSb(x, y, T.herbe);
    for (let y = 3; y < 10; y++) for (let x = 3; x < 15; x++) poserSb(x, y, T.hautes_herbes);
    for (let y = 0; y < 3; y++) poserSb(9, y, T.chemin);
    for (let x = 0; x < SW; x++) { if (x !== 9) arbreSb(x, -1); arbreSb(x, SH - 2); }
    for (let y = 1; y < SH - 2; y += 2) { arbreSb(0, y); arbreSb(SW - 1, y); }
    for (const [x, y] of [[5, 5], [12, 7], [8, 9]]) arbreSb(x, y);
    sb.zones = [{ id: 'herbes-hautes', name: 'Les herbes hautes', type: 'herbes', x: 3, y: 3, w: 12, h: 7, objet: '', taux: 12,
      rencontres: [{ groupe: 'champignons', chance: 45 }, { groupe: 'lapins', chance: 40 }, { groupe: 'sanglier', chance: 15 }] }];
    sb.events = [
      ev('vers-clairiere', 'Vers la clairière', 'declencheur', 9, 0, [page([{ type: 'teleporter', carte: 'clairiere', x: 12, y: 16, direction: 'haut' }])], { traversable: true, declenchement: 'toucher' }),
      ev('panneau-sb', 'Panneau', 'panneau', 10, 1, [page([dire('Le sous-bois. Attention aux herbes hautes ! La clairière est au nord.')])]),
      // Tafl 1.13 : des baies, loin des herbes hautes.
      cueillette('baies-1', 'Buisson de baies', 2, 2, T.buisson_baies, 'baies', 1),
      cueillette('baies-2', 'Buisson de baies', 15, 10, T.buisson_baies, 'baies', 1),
    ];

    for (const c of [m, maison, grenier, bains, sb]) c.events = Events.normEvents(c.events, c.width, c.height, doc.tiles.length);
    doc.maps = [m, maison, grenier, bains, sb];
    doc.mapIndex = 0;
    doc.map = m;
    doc.depart = { carte: 'clairiere', x: 12, y: 16, direction: 'haut' };

    // --- Les données : le module gestion, ses ressources et ses bâtiments ---
    const data = doc.data;
    data.reglages.regles = 'jrpg';
    data.reglages.monnaie = 'écus';
    data.reglages.argent_depart = 0;
    data.reglages.modules = ['gestion', 'relations'];
    // Tafl 1.8 : une horloge, pour la journée des habitants (une journée dure 16 minutes ; on se réveille à 7 h).
    data.reglages.temps = { horloge: 'jeu', duree_jour: 16, heure_depart: 7 };
    data.reglages.modules_reglages = {
      ...(data.reglages.modules_reglages || {}),
      gestion: DonneesGestion.normReglages({
        nom: 'Domaine de la Clairière', capacite: 0, menu: true, construire_menu: true,
        stock_depart: [{ ressource: 'bois', nombre: 12 }, { ressource: 'ble', nombre: 4 }],
        habitants_depart: 0, repas: [{ ressource: 'ble', nombre: 1 }], arrivees: 1, faim: 'departs', faim_nuits: 3,
        // Tafl 1.7 : on voit les habitants, et leurs pas creusent des sentiers (herbe tassée, puis chemin).
        promeneurs: true, usure: true, tuile_usee: T.herbe_tassee, tuile_sentier: T.chemin, seuil_usee: 6, seuil_sentier: 18, usure_repousse: 2,
        // Tafl 1.8 : leur journée suit l'horloge du jeu.
        horaires: true, heure_lever: 7, heure_travail: 8, heure_fin: 17, heure_coucher: 21,
        // Tafl 1.9 : le butin des combats va tout seul au stock ; perdre un combat ne coûte rien (c'est cosy).
        butin_au_stock: true, perte_defaite: 0,
        // Tafl 1.13 : les quatre premiers habitants ont un nom (dans l'ordre d'arrivée).
        habitants_noms: ['aldo', 'mila', 'pepin', 'rosa'],
      }),
      // Tafl 1.13 : les relations. Des paliers rapides, pour voir l'amitié monter en quelques jours de jeu.
      relations: DonneesRelations.normReglages({
        nom: 'Relations', parler: 10, cadeaux: { adore: 30, aime: 15, neutre: 5, deteste: 0 }, cadeaux_jour: 1, oubli: 0,
        niveaux: [{ nom: 'Inconnu', points: 0 }, { nom: 'Connaissance', points: 10 }, { nom: 'Ami', points: 40 }, { nom: 'Bon ami', points: 90 }, { nom: 'Proche', points: 160 }, { nom: 'Inséparable', points: 250 }],
      }),
    };
    const N = DonneesGestion.NORMES;
    data.ressources = [
      N.ressources({ id: 'bois', nom: 'Bois', description: 'Pour bâtir. Les tas de bois repoussent après 2 nuits.' }, 0),
      N.ressources({ id: 'ble', nom: 'Blé', description: 'Ce que mangent les habitants, un par nuit.' }, 1),
      N.ressources({ id: 'herbes', nom: 'Herbes des bois', description: 'Laissées par les monstres du sous-bois. Pour les bains et le potager.', objet: 'herbes' }, 2),
    ];
    const porteMaison = ['libre', 'libre', 'libre', 'libre', 'bloque', 'bloque', 'bloque', 'libre', 'bloque', 'porte', 'bloque', 'libre'];
    data.batiments = [
      N.batiments({ id: 'maison', nom: 'Maison', description: 'Loge deux habitants. Chaque maison a son propre intérieur.', cout: [{ ressource: 'bois', nombre: 6 }], jours: 1,
        tampon: 'maison', passage: porteMaison, porte_vers: { carte: 'maison', x: 4, y: 5, direction: 'haut' }, interieur: 'propre', logement: 2 }, 0),
      N.batiments({ id: 'ferme', nom: 'Ferme', description: 'Donne 3 blé chaque nuit, s\'il y a un habitant pour y travailler.', cout: [{ ressource: 'bois', nombre: 4 }], jours: 1,
        tampon: 'ferme', production: [{ ressource: 'ble', nombre: 3 }], ouvriers: 1 }, 1),
      N.batiments({ id: 'grenier', nom: 'Grenier', description: 'Un grand grenier : tous les greniers mènent au même endroit.', cout: [{ ressource: 'bois', nombre: 8 }], jours: 2,
        tampon: 'grenier', passage: porteMaison, porte_vers: { carte: 'grenier', x: 4, y: 5, direction: 'haut' }, interieur: 'partage' }, 2),
      // Tafl 1.9 : les bâtiments de repos. Les bains : on vient s'y reposer (soin, Défense et Esprit +15 %
      // pour 3 combats, une herbe par bain). Le potager : chaque matin, Force +10 % pour la journée.
      N.batiments({ id: 'bains', nom: 'Bains chauds', description: 'On s\'y repose : le groupe est soigné, et protégé pour ses 3 prochains combats.', cout: [{ ressource: 'bois', nombre: 8 }, { ressource: 'herbes', nombre: 3 }], jours: 1,
        tampon: 'bains', passage: porteMaison, porte_vers: { carte: 'bains', x: 4, y: 5, direction: 'haut' }, interieur: 'partage', maximum: 1,
        repos: { quand: 'visite', nom: 'Les bains chauds', soigner: true, stats: [{ stat: 'defense', pourcent: 15 }, { stat: 'esprit', pourcent: 15 }], combats: 3, cout: [{ ressource: 'herbes', nombre: 1 }] } }, 3),
      N.batiments({ id: 'potager', nom: 'Potager', description: 'Des légumes frais chaque matin : Force +10 % pour la journée.', cout: [{ ressource: 'bois', nombre: 4 }, { ressource: 'herbes', nombre: 2 }], jours: 1,
        tampon: 'potager', maximum: 1, repos: { quand: 'matin', nom: 'Les légumes du potager', soigner: false, stats: [{ stat: 'force', pourcent: 10 }], combats: 0, cout: [] } }, 4),
    ];
    // Tafl 1.9 : de quoi se battre (pack JRPG) : une classe pour le héros, trois monstres, trois groupes.
    data.objets = [{ id: 'herbes', nom: 'Herbes des bois', categorie: 'autre', prix: 2, description: 'Des herbes qui sentent bon. Elles vont au stock du domaine.', effet: { type: 'aucun' } },
      // Tafl 1.13 : de petits cadeaux (le module relations).
      { id: 'fleur', nom: 'Fleurs des prés', categorie: 'autre', prix: 1, description: 'Un petit bouquet. Ça fait toujours plaisir… presque toujours.', effet: { type: 'aucun' } },
      { id: 'baies', nom: 'Baies sauvages', categorie: 'autre', prix: 1, description: 'Sucrées et un peu acides. On les trouve dans le sous-bois.', effet: { type: 'aucun' } },
      { id: 'galet', nom: 'Joli galet', categorie: 'autre', prix: 1, description: 'Tout lisse, trouvé au bord de la mare.', effet: { type: 'aucun' } }];
    const stats = (pv, force, defense, agilite, magie = 4, esprit = 4, chance = 4) => ({ pv, pm: 0, force, magie, defense, esprit, agilite, chance });
    data.classes = [{ id: 'jardinier', nom: 'Jardinier', description: 'Il bêche, il bâtit, et il sait se défendre.', couleur: '#5aa04a',
      stats: { pv: 36, pm: 6, force: 10, magie: 6, defense: 8, esprit: 7, agilite: 8, chance: 7 }, gains: { pv: 8, pm: 1, force: 2, magie: 1, defense: 1.6, esprit: 1.4, agilite: 1.4, chance: 1 }, competences: [] }];
    const monstre = (id, nom, numero, f, taille, st, xp, or, chance, description) => ({ id, nom, numero, description, image: image(f), taille, boss: false, niveau: 1, stats: st,
      faiblesses: [], resistances: [], immunites: [], statuts_immunises: [], poids_attaque: 50, competences: [], xp, or, butin: [{ objet: 'herbes', chance }] });
    data.monstres = [
      monstre('champignon', 'Champignon grincheux', 1, MONSTRES.champignon, 'petit', stats(16, 7, 4, 5), 4, 2, 70, 'Il boude sous les fougères. Il sent les herbes des bois.'),
      monstre('lapin', 'Lapin des ronces', 2, MONSTRES.lapin, 'petit', stats(12, 6, 3, 10), 3, 1, 45, 'Rapide, et pas très content qu\'on marche sur ses herbes.'),
      monstre('sanglier', 'Vieux sanglier', 3, MONSTRES.sanglier, 'grand', stats(30, 10, 8, 6), 12, 6, 100, 'Le doyen du sous-bois. Un bain chaud avant de l\'affronter ne serait pas de trop.'),
    ];
    data.groupes = [
      { id: 'champignons', nom: 'Deux champignons', monstres: [{ monstre: 'champignon', nombre: 2 }], fuite: true },
      { id: 'lapins', nom: 'Un lapin et un champignon', monstres: [{ monstre: 'lapin', nombre: 1 }, { monstre: 'champignon', nombre: 1 }], fuite: true },
      { id: 'sanglier', nom: 'Le vieux sanglier', monstres: [{ monstre: 'sanglier', nombre: 1 }], fuite: true },
    ];
    data.personnages.unshift({ id: 'fermier', nom: 'Fermier', description: 'L\'apparence du joueur.', heros: true, couleur: '#4a9ae0', tuile: -1, portraits: [], sprite: null, tenues: [], classe: 'jardinier', niveau: 1, equipement: {} });
    data.personnages.push({ id: 'brune', nom: 'Brune', description: 'La bâtisseuse de la clairière.', heros: false, couleur: '#c07a3a', tuile: -1, portraits: [], sprite: null, tenues: [] });
    // Tafl 1.13 : les habitants nommés (leur couleur est celle du petit bonhomme qui se promène).
    const habitant = (id, nom, couleur, description) => data.personnages.push({ id, nom, description, heros: false, couleur, tuile: -1, portraits: [], sprite: null, tenues: [] });
    habitant('aldo', 'Aldo', '#d8a040', 'Le premier habitant. Il collectionne les galets.');
    habitant('mila', 'Mila', '#e07aa8', 'Elle s\'occupe de tout ce qui pousse.');
    habitant('pepin', 'Pépin', '#7ab84a', 'Gourmand et blagueur.');
    habitant('rosa', 'Rosa', '#8a7ad8', 'Discrète, elle connaît les herbes du sous-bois.');
    data.interrupteurs.push({ id: 'cadeau-brune', nom: 'Brune a fait son cadeau d\'amitié', description: '' });
    const lien = (id, adore, aime, deteste, paroles, merci = {}) => DonneesRelations.NORMES.relations({ id, nom: data.personnages.find((x) => x.id === id)?.nom || id, adore, aime, deteste, merci,
      paroles: paroles.map(([niveau, texte]) => ({ niveau, texte, expression: '' })) }, 0);
    data.relations = [
      lien('brune', ['baies'], ['fleur'], [], [
        [0, 'Le pré est plus beau chaque jour. Tu as l\'œil, {joueur}.'],
        [0, 'Une maison, c\'est d\'abord une bonne charpente. Et des voisins qui se disent bonjour.'],
        [1, 'Tu sais, je n\'ai pas toujours bâti des maisons. Avant, je réparais des ponts, très loin d\'ici.'],
        [2, 'Ça faisait longtemps que je n\'avais pas eu d\'ami ici. Merci d\'être venu, {joueur}.'],
        [3, 'Un jour, je te montrerai le pont que j\'ai bâti toute seule. Il tient encore, paraît-il.'],
        [4, 'Quand le domaine sera grand, garde-moi une place près de la mare. J\'aime le bruit de l\'eau.'],
      ], { adore: 'Des baies ! Comment tu as deviné ? Je les mange par poignées.' }),
      lien('aldo', ['galet'], ['baies'], ['fleur'], [
        [0, 'Bonjour ! Moi, c\'est Aldo. Je cherche encore où ranger mes affaires.'],
        [0, 'Tu n\'aurais pas vu un joli galet, par hasard ? Je cherche toujours.'],
        [1, 'Je collectionne les galets. Chacun a sa forme et son histoire. Ça te paraît bête ?'],
        [2, 'Regarde celui-là : il a la forme du domaine. Je le garde pour toi, pour plus tard.'],
        [3, 'Avant de venir ici, je n\'avais pas vraiment de chez-moi. Maintenant, si.'],
      ], { adore: 'Oh ! Il est parfait. Il ira au milieu de ma collection.', deteste: 'Atchoum ! Désolé… les fleurs et moi, ça fait deux.' }),
      lien('mila', ['fleur'], ['baies', 'herbes'], ['galet'], [
        [0, 'Bonjour ! Mila. Je m\'occupe de tout ce qui pousse.'],
        [0, 'Le blé a bonne mine aujourd\'hui. Il faut lui parler, tu sais.'],
        [1, 'Je garde des graines de toutes les fleurs que je croise. Un jour, le pré sera un jardin.'],
        [2, 'Tu viens me voir chaque jour… Ça me touche. Je te garderai les plus belles fleurs.'],
        [3, 'Le soir, je compte les étoiles au bord de la mare. Viens, un de ces jours.'],
      ], { adore: 'Des fleurs des prés ! Je vais les faire sécher pour en garder les graines.' }),
      lien('pepin', ['baies'], ['fleur'], [], [
        [0, 'Salut ! Pépin, pour te servir. Tu n\'aurais pas quelque chose à grignoter ?'],
        [0, 'J\'ai rêvé d\'une tarte cette nuit. Une énorme tarte.'],
        [1, 'Mon rêve ? Une grande table, et tout le domaine autour. Avec une tarte aux baies.'],
        [2, 'Tu es le meilleur voisin du monde. Si, si. Je le dirai à tout le monde.'],
        [3, 'Le jour de la fête du domaine, c\'est moi qui cuisine. Promis.'],
      ], { adore: 'Des baies ! Tu es un ange. Je t\'en garde une part… peut-être.' }),
      lien('rosa', ['galet', 'herbes'], ['fleur'], ['baies'], [
        [0, 'Bonsoir. Rosa. Je ne parle pas beaucoup, mais j\'écoute.'],
        [1, 'Les herbes du sous-bois soignent presque tout. Il suffit de savoir les reconnaître.'],
        [2, 'Tu es patient avec moi. Peu de gens le sont. Merci.'],
        [3, 'Ma grand-mère disait qu\'un autre peuple vivait dans ces bois, autrefois. Je n\'y croyais pas.'],
      ], { deteste: 'Des baies… Je n\'en mange plus depuis que j\'en ai trop mangé, petite.' }),
    ];
  }

  return { remplir };
})();
