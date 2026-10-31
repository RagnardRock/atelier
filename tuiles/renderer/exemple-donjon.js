// Le petit donjon (Tafl 1.10, joué par Saga 1.12) : le petit jeu modèle pour essayer le temps réel (pack action).
//
// Une forêt avec la cabane du vieil Arne (il explique les touches et donne deux potions), des slimes dans
// les hautes herbes, des chauves-souris qui papillonnent (leur comportement est un script JS : on voit
// comment en écrire un), et l'entrée d'une crypte. Dans la crypte : des squelettes qui frappent à l'épée,
// et le Gardien, un boss qui garde le coffre du fond.
//
// Proposé dans Fichier › Nouveau jeu. Les tuiles et les sprites des ennemis sont dessinés ici, en 16 × 16.

const ExempleDonjon = (() => {
  const COULEURS = {
    a: '#4f9a45', b: '#3f8438', c: '#6db45a',            // herbe
    d: '#c9a46a', e: '#b08850',                          // chemin
    f: '#2f6b34', g: '#3f8a40', h: '#6b4a2a', i: '#4e3520', // arbre
    j: '#2e7a3a', k: '#43a04c',                          // hautes herbes
    l: '#6e6a72', m: '#57535c', n: '#8a8690', o: '#3a3740', // pierre de la crypte
    p: '#2c2a33', q: '#1b1a20',                          // dalle sombre, entrée
    r: '#e8dcc0', s: '#bfae8a', t: '#7a5232', u: '#a8d8f0', // murs, porte, fenêtre
    v: '#c04a3a', w: '#8a2e24',                          // toit
    x: '#ffb84a', y: '#ff7a2a',                          // flamme de torche
    z: ['#000000', 0.3],                                 // ombre
    A: '#a87a3a', B: '#7a5420', C: '#ffd84a',            // coffre
    D: '#3d8ad0', E: '#6ab0e8',                          // eau
  };
  const bruit = (x, y, n = 0) => { let h = (x * 374761393 + y * 668265263 + n * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) % 100; };
  const herbe = (x, y) => (bruit(x, y) < 10 ? 'b' : bruit(x, y, 1) < 8 ? 'c' : 'a');
  const dans = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  const toit = (x, y) => (y % 4 === 3 ? 'w' : (x + (Math.floor(y / 4) % 2) * 2) % 4 === 0 ? 'w' : 'v');
  const mur = (x, y) => (y === 15 ? 's' : x % 8 === 0 ? 's' : 'r');
  const pierre = (x, y) => (y % 5 === 4 ? 'o' : (x + (Math.floor(y / 5) % 2) * 4) % 8 === 0 ? 'o' : bruit(x, y) < 15 ? 'n' : bruit(x, y, 2) < 15 ? 'm' : 'l');
  const TUILES = {
    herbe,
    chemin: (x, y) => (bruit(x, y) < 14 ? 'e' : 'd'),
    hautes_herbes: (x, y) => ((x + (y % 2) * 2) % 4 < 2 && y % 4 < 3 ? (y % 4 === 0 ? 'k' : 'j') : herbe(x, y)),
    arbre_haut: (x, y) => (dans(x, y, 7.5, 12, 8) ? (bruit(x, y) < 25 ? 'f' : 'g') : '.'),
    arbre_bas: (x, y) => (y < 7 && dans(x, y, 7.5, -1, 8) ? (bruit(x, y, 2) < 25 ? 'f' : 'g') : x >= 6 && x <= 9 ? (x === 6 ? 'i' : 'h') : herbe(x, y)),
    eau: (x, y) => ((y % 6 === 2 && (x + y) % 8 < 4) ? 'E' : 'D'),
    toit, mur,
    fenetre: (x, y) => (x >= 4 && x <= 11 && y >= 4 && y <= 10 ? (x === 4 || x === 11 || y === 4 || y === 10 || x === 7 || y === 7 ? 't' : 'u') : mur(x, y)),
    porte: (x, y) => (x >= 4 && x <= 11 && y >= 3 ? (x === 4 || x === 11 || y === 3 ? 't' : 't') : mur(x, y)),
    pierre,
    entree: (x, y) => (y > 3 && x > 2 && x < 13 && dans(x, y, 7.5, 9, 6.5) ? 'q' : pierre(x, y)),
    dalle: (x, y) => (x % 8 === 0 || y % 8 === 0 ? 'q' : bruit(x, y) < 10 ? 'o' : 'p'),
    torche: (x, y) => (x >= 7 && x <= 8 && y >= 7 && y <= 13 ? 'h' : dans(x, y, 7.5, 5, 2.6) ? (dans(x, y, 7.5, 5.6, 1.4) ? 'x' : 'y') : '.'),
    coffre: (x, y) => (x < 2 || x > 13 || y < 4 || y > 14 ? '.' : y === 8 ? 'B' : (x === 7 || x === 8) && (y === 9 || y === 10) ? 'C' : x === 2 || x === 13 || y === 4 || y === 14 ? 'B' : 'A'),
    ombre: () => 'z',
  };
  const PASSAGES = { arbre_bas: 'bloque', eau: 'bloque', pierre: 'bloque', mur: 'bloque', fenetre: 'bloque', toit: 'bloque', torche: 'bloque' };

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

  // --- Les sprites des ennemis : une planche (4 rangées : face, gauche, droite, dos), en data: URL ---
  // dessin(g, direction, image) dessine une image de 16 × 16 dans le contexte g (déjà décalé).
  function planche(images, dessin) {
    const c = document.createElement('canvas');
    c.width = 16 * images; c.height = 16 * 4;
    const g = c.getContext('2d');
    ['bas', 'gauche', 'droite', 'haut'].forEach((dir, r) => {
      for (let k = 0; k < images; k++) { g.save(); g.translate(k * 16, r * 16); dessin(g, dir, k); g.restore(); }
    });
    return c.toDataURL('image/png');
  }
  const px = (g, couleur, x, y, l = 1, h = 1) => { g.fillStyle = couleur; g.fillRect(x, y, l, h); };
  // Le slime : une goutte verte qui s'écrase et s'étire en avançant.
  function slime(g, dir, k, ecrase = 0) {
    const h = [8, 6, 9][k % 3] - ecrase, l = [12, 14, 11][k % 3] + ecrase;
    const x0 = 8 - Math.floor(l / 2), y0 = 15 - h;
    px(g, '#1f5a24', x0, y0 + 1, l, h - 1); px(g, '#1f5a24', x0 + 1, y0, l - 2, h);
    px(g, '#4cc35a', x0 + 1, y0 + 1, l - 2, h - 2);
    px(g, '#9df0a0', x0 + 2, y0 + 1, 2, 1);
    if (dir !== 'haut') {
      const ox = dir === 'gauche' ? -2 : dir === 'droite' ? 2 : 0;
      px(g, '#10301a', 8 + ox - 3, y0 + Math.floor(h / 2), 1, 2); px(g, '#10301a', 8 + ox + 2, y0 + Math.floor(h / 2), 1, 2);
    }
  }
  // La chauve-souris : des ailes qui battent (2 images).
  function chauveSouris(g, dir, k) {
    const haut = k % 2 === 0;
    px(g, '#3a2a4a', 6, 6, 4, 5); px(g, '#5a4270', 7, 7, 2, 3);
    if (dir !== 'haut') { px(g, '#ff5a5a', 6, 7, 1, 1); px(g, '#ff5a5a', 9, 7, 1, 1); }
    px(g, '#3a2a4a', 6, 5, 1, 1); px(g, '#3a2a4a', 9, 5, 1, 1);
    const aile = (s) => {
      if (haut) { for (let i = 0; i < 5; i++) px(g, '#2a1e38', s > 0 ? 10 + i : 5 - i, 6 - Math.floor(i / 2), 1, 2 + (i % 2)); }
      else { for (let i = 0; i < 5; i++) px(g, '#2a1e38', s > 0 ? 10 + i : 5 - i, 8 + Math.floor(i / 2), 1, 2); }
    };
    aile(1); aile(-1);
  }

  const dire = (texte, qui = '') => ({ type: 'dire', qui, expression: 'normal', texte });
  const page = (commandes, conditions = [], cache = false) => ({ conditions, cache, commandes });
  const ev = (id, nom, type, x, y, pages, autres = {}) => ({ id, nom, type, x, y, apparence: { personnage: '', tuile: -1 }, direction: 'bas', deplacement: 'fixe', traversable: false, declenchement: 'parler', pages, ...autres });
  const fait = { type: 'local', valeur: true };

  // Le comportement « papillonner » des chauves-souris : un exemple de script (SCRIPTS.md › Les ennemis du temps réel).
  const SCRIPT = `// Les chauves-souris du petit donjon : elles papillonnent autour du joueur au lieu de foncer droit sur lui.
// Saga appelle ce comportement quelques fois par seconde pour chaque ennemi qui le suit (Tafl › Ennemis ›
// Comportement : Script, nom « papillonner »). Il rend sa décision : un but { x, y } (une case), fuir, frapper.
comportement('papillonner', (e) => {
  if (e.distance > e.vue) {
    // Trop loin : elle tourne autour de son nid.
    const a = e.hasard * Math.PI * 2;
    return { etat: 'vol', but: { x: e.depart.x + Math.round(Math.cos(a) * 2), y: e.depart.y + Math.round(Math.sin(a) * 2) } };
  }
  // Tout près : une case à côté du joueur, au hasard, pour arriver de biais.
  const cote = e.hasard < 0.5 ? 1 : -1;
  return { etat: 'chasse', but: { x: Math.round(e.joueur.x + cote), y: Math.round(e.joueur.y + (e.hasard < 0.25 || e.hasard > 0.75 ? 1 : -1)) } };
});
`;

  // Remplit un jeu neuf (Doc.create) : les tuiles, les deux cartes, les ennemis, le héros.
  function remplir(doc) {
    const noms = Object.keys(TUILES);
    doc.tiles = noms.map((nom) => ({ id: Doc.newId(), name: nom, frames: [pixels(TUILES[nom], doc.tileSize)], duration: Doc.DEFAULT_DURATION, passage: PASSAGES[nom] || 'auto' }));
    const T = Object.fromEntries(noms.map((n, i) => [n, i]));
    for (const c of Object.values(COULEURS)) { const hex = Array.isArray(c) ? c[0] : c; if (!doc.palette.includes(hex)) doc.palette.push(hex); }

    // --- La forêt (24 × 18) ---
    const W = 24, H = 18;
    const foret = Doc.newMap({ id: 'foret', name: 'La forêt', width: W, height: H });
    const poser = (m, x, y, t, calque = 0) => { if (x >= 0 && y >= 0 && x < m.width && y < m.height) m.layers[calque].cells[y * m.width + x] = t; };
    const rect = (m, x0, y0, w, h, t, calque = 0) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) poser(m, x, y, t, calque); };
    const arbre = (x, y) => { poser(foret, x, y, T.arbre_haut, 2); poser(foret, x, y + 1, T.arbre_bas, 1); };
    rect(foret, 0, 0, W, H, T.herbe);
    rect(foret, 3, 13, 16, 1, T.chemin); rect(foret, 11, 3, 1, 10, T.chemin);
    rect(foret, 13, 8, 7, 4, T.hautes_herbes);
    rect(foret, 2, 6, 5, 4, T.hautes_herbes);
    rect(foret, 16, 2, 3, 3, T.eau);
    for (let x = 0; x < W; x++) { arbre(x, 0); arbre(x, H - 2); }
    for (let y = 2; y < H - 2; y += 2) { arbre(0, y); arbre(W - 1, y); }
    for (const [x, y] of [[7, 4], [8, 8], [5, 11], [20, 12], [14, 5]]) arbre(x, y);
    // La cabane du vieil Arne (en bas à gauche) et l'entrée de la crypte (en haut, au bout du chemin).
    rect(foret, 2, 11, 3, 1, T.toit, 1); rect(foret, 2, 12, 3, 1, T.mur, 1);
    poser(foret, 2, 12, T.fenetre, 1); poser(foret, 4, 12, T.fenetre, 1);
    rect(foret, 9, 1, 5, 2, T.pierre, 1); poser(foret, 11, 2, T.entree, 1);
    poser(foret, 10, 3, T.torche, 1); poser(foret, 12, 3, T.torche, 1);
    foret.warps = [{ id: 'w-1', x: 11, y: 2, carte: 'crypte', tx: 7, ty: 10, direction: 'haut' }];
    foret.zones = [
      { id: 'herbes-est', name: 'Les herbes de l\'est', type: 'herbes', x: 13, y: 8, w: 7, h: 4, objet: '', taux: 0, rencontres: [{ ennemi: 'slime', nombre: 3 }] },
      { id: 'herbes-ouest', name: 'Les herbes de l\'ouest', type: 'herbes', x: 2, y: 6, w: 5, h: 4, objet: '', taux: 0, rencontres: [{ ennemi: 'slime', nombre: 1 }, { ennemi: 'chauve-souris', nombre: 1 }] },
      { id: 'nid', name: 'Le nid', type: 'autre', x: 14, y: 3, w: 5, h: 3, objet: '', taux: 0, rencontres: [{ ennemi: 'chauve-souris', nombre: 2 }] },
    ];
    foret.events = [
      ev('arne', 'Le vieil Arne', 'pnj', 3, 14, [
        page([
          dire('Ah, un aventurier ! La forêt grouille de bestioles depuis que la crypte s\'est réveillée.', 'arne'),
          dire('Bouge avec les flèches (deux à la fois pour aller en biais). Espace ou E : un coup d\'épée. Devant quelqu\'un, la même touche lui parle.', 'arne'),
          dire('Quand tu es touché, tu clignotes un instant : profites-en pour t\'éloigner. Les ennemis laissent parfois un cœur : marche dessus.', 'arne'),
          dire('Tiens, deux potions (Tab, puis le sac). Et au fond de la crypte, il y a le Gardien… Bonne chance !', 'arne'),
          { type: 'objet', action: 'donner', objet: 'potion', nombre: 2 },
          { type: 'soigner' },
          { type: 'local', valeur: true },
        ]),
        page([dire('Reviens me voir quand tu veux : je soigne tes blessures.', 'arne'), { type: 'soigner' }], [fait]),
      ], { apparence: { personnage: 'arne', tuile: -1 }, direction: 'droite' }),
      ev('panneau', 'Panneau', 'panneau', 12, 12, [page([dire('Au nord : la crypte. Danger ! (Signé : Arne.)')])]),
    ];

    // --- La crypte (16 × 12) ---
    const crypte = Doc.newMap({ id: 'crypte', name: 'La crypte', width: 16, height: 12, interieur: true });
    rect(crypte, 0, 0, 16, 12, T.dalle);
    rect(crypte, 0, 0, 16, 1, T.pierre, 1); rect(crypte, 0, 0, 1, 12, T.pierre, 1); rect(crypte, 15, 0, 1, 12, T.pierre, 1); rect(crypte, 0, 11, 16, 1, T.pierre, 1);
    poser(crypte, 7, 11, -1, 1); poser(crypte, 7, 11, T.chemin);
    rect(crypte, 1, 6, 5, 1, T.pierre, 1); rect(crypte, 10, 6, 5, 1, T.pierre, 1); // un mur, ouvert au milieu
    for (const [x, y] of [[3, 3], [12, 3], [3, 8], [12, 8]]) poser(crypte, x, y, T.pierre, 1);
    for (const [x, y] of [[1, 1], [14, 1], [1, 7], [14, 7]]) poser(crypte, x, y, T.torche, 1);
    crypte.warps = [{ id: 'w-1', x: 7, y: 11, carte: 'foret', tx: 11, ty: 3, direction: 'bas' }];
    crypte.ambiance = { ...crypte.ambiance, teinte: '#1c2440', force: 40, jour_nuit: false };
    crypte.zones = [
      { id: 'entree', name: 'L\'entrée', type: 'grotte', x: 2, y: 7, w: 12, h: 3, objet: '', taux: 0, rencontres: [{ ennemi: 'squelette', nombre: 2 }] },
      { id: 'salle', name: 'La salle du Gardien', type: 'grotte', x: 6, y: 2, w: 4, h: 3, objet: '', taux: 0, rencontres: [{ ennemi: 'gardien', nombre: 1 }] },
    ];
    crypte.events = [
      ev('coffre', 'Coffre', 'objet', 8, 1, [
        page([dire('Dans le coffre : 30 pièces et une Grande potion !'), { type: 'argent', action: 'donner', montant: 30 }, { type: 'objet', action: 'donner', objet: 'grande-potion', nombre: 1 }, { type: 'local', valeur: true }]),
        page([dire('Le coffre est vide.')], [fait]),
      ], { apparence: { personnage: '', tuile: T.coffre } }),
    ];

    for (const c of [foret, crypte]) c.events = Events.normEvents(c.events, c.width, c.height, doc.tiles.length);
    doc.maps = [foret, crypte];
    doc.mapIndex = 0;
    doc.map = foret;
    doc.depart = { carte: 'foret', x: 6, y: 14, direction: 'droite' };
    doc.scripts = [{ nom: 'chauves-souris', code: SCRIPT, actif: true }];

    // --- Les données : le pack action, le héros, les ennemis, deux potions ---
    const data = doc.data;
    data.reglages.regles = 'action';
    data.reglages.monnaie = 'Pièces';
    data.reglages.argent_depart = 0;
    data.reglages.niveau_max = 20;
    data.reglages.action = DonneesAction.normRegles({ coeurs: 3, pv_coeur: 4, attaque: 2, defense: 0, vitesse: 5, invincibilite: 1, recul: 1.5 });
    const objet = (o, i) => Donnees.normElement('objets', o, i);
    data.objets.push(
      objet({ id: 'potion', nom: 'Potion', description: 'Rend 4 PV (un cœur).', categorie: 'soin', prix: 20, effet: { type: 'soin', valeur: 4 } }, data.objets.length),
      objet({ id: 'grande-potion', nom: 'Grande potion', description: 'Rend tous les cœurs.', categorie: 'soin', prix: 80, effet: { type: 'soin', valeur: 999 } }, data.objets.length + 1),
    );
    const N = DonneesAction.NORMES.ennemis;
    data.ennemis = [
      N({ id: 'slime', nom: 'Slime', numero: 1, description: 'Une goutte de gelée qui sautille vers toi. Lent, mais il ne lâche rien.', personnage: 'slime', couleur: '#4cc35a', pv: 4, attaque: 1, defense: 0, vitesse: 1.6, vue: 4, comportement: 'patrouiller', contact: true, xp: 3, argent: 1, coeur: 30, butin: [{ objet: 'potion', chance: 5 }] }, 0),
      N({ id: 'chauve-souris', nom: 'Chauve-souris', numero: 2, description: 'Elle arrive de biais en battant des ailes : son comportement est écrit en JavaScript (script « chauves-souris »).', personnage: 'chauve-souris', couleur: '#5a4270', pv: 2, attaque: 1, defense: 0, vitesse: 3.4, vue: 5, comportement: 'script', script: 'papillonner', contact: true, poids: 0.6, xp: 4, argent: 2, coeur: 20 }, 1),
      N({ id: 'squelette', nom: 'Squelette', numero: 3, description: 'Un vieux soldat de la crypte. Il s\'arrête, lève son épée… et frappe : recule à temps !', couleur: '#d8d4c8', pv: 8, attaque: 2, defense: 1, vitesse: 2.2, vue: 6, comportement: 'suivre', portee: 1, recharge: 1.4, contact: false, xp: 8, argent: 4, coeur: 35 }, 2),
      N({ id: 'gardien', nom: 'Le Gardien', numero: 4, description: 'Il garde le coffre de la crypte depuis des siècles. Lourd, il recule à peine.', couleur: '#8a4ad0', pv: 24, attaque: 3, defense: 1, vitesse: 1.8, vue: 4, comportement: 'garde', portee: 1.3, recharge: 1.1, contact: true, poids: 4, xp: 40, argent: 20, coeur: 100, boss: true }, 3),
    ];
    // Le héros (sans sprite : le petit bonhomme de Saga, avec une lame dessinée par Saga) ; Arne ; les
    // personnages des ennemis (leur sprite, et l'animation de mort du slime).
    const animMort = { largeur: 16, hauteur: 16, images: 4, duree: 110, planche: planche(4, (g, dir, k) => { g.globalAlpha = 1 - k * 0.22; slime(g, dir, 1, k * 2); }) };
    data.personnages.unshift({ id: 'heros', nom: 'Héros', description: 'Le joueur.', heros: true, couleur: '#3a9ad9', tuile: -1, portraits: [], sprite: null, tenues: [] });
    data.personnages.push(
      { id: 'arne', nom: 'Arne', description: 'Le vieil homme de la cabane. Il soigne.', heros: false, couleur: '#a07a4a', tuile: -1, portraits: [], sprite: null, tenues: [] },
      { id: 'slime', nom: 'Slime', description: 'Le sprite des slimes.', heros: false, couleur: '#4cc35a', tuile: -1, portraits: [], tenues: [],
        sprite: { largeur: 16, hauteur: 16, images: 3, planche: planche(3, slime) },
        animations: { mort: animMort }, hitbox: { x: 2, y: 7, largeur: 12, hauteur: 9 } },
      { id: 'chauve-souris', nom: 'Chauve-souris', description: 'Le sprite des chauves-souris.', heros: false, couleur: '#5a4270', tuile: -1, portraits: [], tenues: [],
        sprite: { largeur: 16, hauteur: 16, images: 3, planche: planche(3, (g, dir, k) => chauveSouris(g, dir, k)) },
        animations: { repos: { largeur: 16, hauteur: 16, images: 2, duree: 140, planche: planche(2, chauveSouris) } }, hitbox: { x: 3, y: 4, largeur: 10, hauteur: 8 } },
    );
  }

  return { remplir };
})();
