// Les personnages sur la carte.
// Un personnage qui a un sprite dessiné dans Tafl (Tafl 0.12, FORMAT.md › personnages.json) est
// dessiné avec : voir dessinerSprite, plus bas. Sinon, Saga dessine un petit bonhomme en pixel art (16 × 16, agrandi à la taille des tuiles), avec une
// casquette et un haut à la couleur du personnage (sa `couleur` dans personnages.json) : 4 directions,
// 3 images chacune (debout, pied gauche, pied droit) pour la marche.
//
// Les modèles ci-dessous se lisent comme des images : une lettre = un pixel.
//   o contour   h casquette   H ombre de la casquette   w reflet   x cheveux
//   s peau      e œil         c haut                    C ombre du haut   p pantalon   P jambe du fond   b chaussures

const Sprites = (() => {
  const TETE_FACE = [
    '................',
    '.....oooooo.....',
    '....owwhhhho....',
    '...owhhhhhhho...',
    '...ohhhhhhhho...',
    '...oHHHHHHHHo...',
    '...oxssssssxo...',
    '...osesssseso...',
    '....osssssso....',
  ];
  const TETE_DOS = [
    '................',
    '.....oooooo.....',
    '....owwhhhho....',
    '...owhhhhhhho...',
    '...ohhhhhhhho...',
    '...oHHHHHHHHo...',
    '...oxxxxxxxxo...',
    '...oxxxxxxxxo...',
    '....oxxxxxxo....',
  ];
  const CORPS_FACE = [
    '...oCccccccCo...',
    '..osCccccccCso..',
    '..osoCccccCoso..',
    '...ooppppppoo...',
  ];
  const JAMBES_FACE = [
    ['....oppooppo....', '....obboobbo....'],
    ['....oppooppo....', '....ooo..obbo...'],
    ['....oppooppo....', '...obbo..ooo....'],
  ];
  const COTE = [
    '................',
    '.....ooooo......',
    '....owhhhhho....',
    '...owhhhhhhho...',
    '...ohhhhhhhhoo..',
    '...oHHHHHHHHHHo.',
    '...oxxxssssso...',
    '...oxxsssseso...',
    '....oxsssssso...',
    '....oCcccccCo...',
    '....oCcsscCo....',
    '....oCccccCo....',
    '....oopppoo.....',
  ];
  // De côté : debout, puis les deux pas, jambe avant et jambe arrière inversées (la jambe du fond
  // est plus sombre), pour que la marche se lise bien à chaque case.
  const JAMBES_COTE = [
    ['.....oppo.......', '.....obbo.......'],
    ['....oppopo......', '...obboobbo.....'],
    ['....opoppo......', '...oPPooobbo....'],
  ];
  const VIDE = '................';

  // Les 3 images d'une direction, chacune une liste de 16 lignes.
  function images(direction) {
    const out = [];
    for (let f = 0; f < 3; f++) {
      let lignes;
      if (direction === 'bas' || direction === 'haut') {
        lignes = [...(direction === 'bas' ? TETE_FACE : TETE_DOS), ...CORPS_FACE, ...JAMBES_FACE[f], VIDE];
      } else {
        lignes = [...COTE, ...JAMBES_COTE[f], VIDE];
      }
      if (direction === 'gauche') lignes = lignes.map((l) => [...l].reverse().join(''));
      out.push(lignes);
    }
    return out;
  }

  // Couleurs : la casquette à la couleur du personnage, le haut un peu plus sombre.
  const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const melange = (a, b, t) => `rgb(${hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * t)).join(',')})`;
  function palette(couleur) {
    const c = /^#[0-9a-f]{6}$/i.test(couleur || '') ? couleur : '#d94a4a';
    return {
      o: '#1b1822', h: c, H: melange(c, '#000000', 0.3), w: melange(c, '#ffffff', 0.45), x: '#4a3326',
      s: '#f2c9a0', e: '#1b1822', c: melange(c, '#2a3550', 0.55), C: melange(c, '#141826', 0.7), p: '#3b4763', P: '#2a3247', b: '#2a2230',
    };
  }

  // Une planche par couleur : 3 colonnes (images) × 4 rangées (bas, gauche, droite, haut), à 16 px.
  const ORDRE = ['bas', 'gauche', 'droite', 'haut'];
  const cache = new Map();
  function planche(couleur) {
    if (cache.has(couleur)) return cache.get(couleur);
    const pal = palette(couleur);
    const cv = document.createElement('canvas');
    cv.width = 48;
    cv.height = 64;
    const g = cv.getContext('2d');
    ORDRE.forEach((dir, r) => images(dir).forEach((lignes, f) => {
      lignes.forEach((ligne, y) => [...ligne].forEach((ch, x) => {
        if (ch === '.' || !pal[ch]) return;
        g.fillStyle = pal[ch];
        g.fillRect(f * 16 + x, r * 16 + y, 1, 1);
      }));
    }));
    cache.set(couleur, cv);
    return cv;
  }

  // L'ombre douce au sol, sous chaque personnage : c'est elle qui le « pose » sur la carte.
  function ombre(ctx, x, y, taille, echelle = 1) {
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(x + taille / 2, y + taille * 0.9, taille * 0.32 * echelle, taille * 0.12 * echelle, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Dessine le bonhomme en (x, y) (coin haut gauche de sa case, en pixels de jeu).
  // pas : 0 debout, 1 et 2 les deux pieds.
  function dessiner(ctx, couleur, direction, pas, x, y, taille) {
    const r = Math.max(0, ORDRE.indexOf(direction));
    ctx.drawImage(planche(couleur), pas * 16, r * 16, 16, 16, x, y, taille, taille);
  }

  // L'image d'un pas (FORMAT.md) : pendant le pas n° `pas` (1, 2, 3…), l'image de marche suivante
  // (1, 2, …, images - 1, puis on recommence) ; debout, l'image 0.
  const imageDeMarche = (images, pas) => (pas > 0 && images > 1 ? 1 + ((pas - 1) % (images - 1)) : 0);

  // Un sprite de Tafl : l'image de la direction, les pieds en bas de la case, centré. Un sprite plus
  // haut qu'une case (16 × 32) dépasse sur la case du dessus. pas : 0 debout, sinon le n° du pas.
  function dessinerSprite(ctx, sprite, direction, pas, x, y, taille) {
    const r = Math.max(0, ORDRE.indexOf(direction));
    const k = imageDeMarche(sprite.images, pas);
    ctx.drawImage(sprite.img, k * sprite.largeur, r * sprite.hauteur, sprite.largeur, sprite.hauteur,
      x + Math.floor((taille - sprite.largeur) / 2), y + taille - sprite.hauteur, sprite.largeur, sprite.hauteur);
  }

  return { dessiner, dessinerSprite, imageDeMarche, ombre, images };
})();
