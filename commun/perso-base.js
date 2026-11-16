// Le personnage de base (Saga 1.31, Tafl 1.34) : celui que Saga dessine quand un personnage n'a ni
// sprite ni tuile, et que Tafl propose comme point de départ d'un sprite (« Partir du personnage de base »).
//
// Dans un style à la RPG Maker (le choix de Ragna, d'après une planche libre de droits qu'il aime) : une
// image de 32 × 32 px, une grosse tête aux cheveux en mèches, des yeux de 3 × 5 px (cils, pupille, iris en
// bas) écartés de 5 px, ni bouche ni nez, un contour doux (la couleur voisine très assombrie, pas du noir).
// Planche de marche au format de Saga : 4 rangées (face, gauche, droite, dos) × 3 images (debout, pas,
// autre pas). Pendant un pas, tout le corps monte d'un pixel, une jambe avance et l'autre recule.
//
// Tout se fabrique ici à partir de modèles qui se lisent comme des images (une lettre = un pixel), retouchés
// selon la pose (debout, pas, repos, coup d'épée, coup reçu, chute). Rien ne dépend du navigateur sauf
// `toile()` : Tafl et Saga en tirent leurs planches.
//
//   H cheveux  h leur ombre  l leur lumière  o les traits entre les mèches
//   S peau  s son ombre  r ombre profonde (oreille, menton)  e trait brun  K cils et traits du visage
//   Y blanc de l'œil  J pupille  N blanc de l'œil dans l'ombre  W reflet  I iris  i bas de l'iris
//   T veste  U sa lumière  t son ombre  A manche  x pli entre le bras et le buste  W col de chemise
//   G ceinture  P pantalon  p son ombre (jambe du fond)  B chaussures  b semelle  q chaussure du fond

const PersoBase = (() => {
  const L = 32, H = 32;          // une image (marche et animations)
  const LA = 32, HA = 32;
  const ORDRE = ['bas', 'gauche', 'droite', 'haut'];
  const COIFFURES = ['courts', 'longs', 'queue', 'couettes', 'chignon', 'herisses'];

  // ---------- Outils ----------
  const vide = (w = L, h = H) => Array.from({ length: h }, () => '.'.repeat(w));
  const miroir = (lignes) => lignes.map((l) => [...l].reverse().join(''));
  // Écrit un bout de rangée (les '.' ne remplacent rien).
  function poser(lignes, r, c, s) {
    if (r < 0 || r >= lignes.length) return;
    const a = [...lignes[r]];
    [...s].forEach((ch, k) => { if (ch !== '.' && c + k >= 0 && c + k < a.length) a[c + k] = ch; });
    lignes[r] = a.join('');
  }
  // Remplace, dans un rectangle, les lettres de `quoi` par `par` ('.' : effacer).
  function remplacer(lignes, r0, r1, c0, c1, quoi, par) {
    for (let r = r0; r <= r1; r++) {
      const a = [...lignes[r]];
      for (let c = c0; c <= c1; c++) if (quoi.includes(a[c])) a[c] = par;
      lignes[r] = a.join('');
    }
  }
  // Décale de dy rangées tout ce qui est au-dessus de la rangée `jusque` (exclue) : dy < 0 monte.
  function decaler(lignes, dy, jusque = lignes.length) {
    if (!dy) return lignes;
    const haut = lignes.slice(0, jusque), bas = lignes.slice(jusque), w = lignes[0].length;
    const blanc = () => '.'.repeat(w);
    const out = dy > 0 ? [...Array.from({ length: dy }, blanc), ...haut.slice(0, haut.length - dy)] : [...haut.slice(-dy), ...Array.from({ length: -dy }, blanc)];
    return [...out, ...bas];
  }

  // ---------- Le haut du corps, debout (la tête et le buste ; les jambes se dessinent selon la pose) ----------
  const FACE = [
    '................................', // 0
    '...........hh..hHh..............',
    '.........hhHHhhHHHh..hh.........',
    '........hHHHlHHHllHhhHHh........',
    '.......hHHllHHHlllHHHHHHh.......',
    '......hHHlllHHHHHHHHHHHHHh......', // 5
    '.....hHHHHHHHHHHHHHHHHHHHh......',
    '.....hHHHHHHHHoHHHHHHHHHHHh.....',
    '....hHHHoHHHHHHoHHHHHHoHHHh.....',
    '....hHHoHHHHHHHoHHHHHHHoHHHh....',
    '....hHHHHHHHHHHHHHHHHHHHHHHh....', // 10
    '....hHHHHHHHhsHHHHsHHHHhHHHh....',
    '....hHHHHHhsssHHsssHhssHHHHh....',
    '....hhHHHhsKKKSSSSKKKs..hHHh....',
    '.....hHHHrsYJYSSSSYJYsrHrHHh....',
    '......hKHrsYJNSSSSNJYsrHK.h.....', // 15
    '........KrsWIISSSSIIWsrK........',
    '..........rsiiSSSSiisr..........',
    '.........TKrsSSSSSSsrKT.........',
    '........UUxTWssssssWTxUU........',
    '........UAxTTWWWWWWTTxAU........', // 20
    '........AAxTTTWWWWTTTxAA........',
    '........AAxtTTTTTTTTtxAA........',
    '.......SSxGGGGGGGGGGGGxSS.......',
    '.......ss.tTTTTTTTTTTt.ss.......',
    '..........tTTTTTTTTTTt..........', // 25
    '................................',
    '................................',
    '................................',
    '................................',
    '................................', // 30
    '................................',
  ];
  const DOS = [
    '................................', // 0
    '..............hHh..hh...........',
    '.........hh..hHHHhhHHh..........',
    '........hHHhhHHllHHHHhh.........',
    '.......hHHHHHHlllHHHHHHh........',
    '......hHHHHHHHHHHHHHHHHHh.......', // 5
    '.....hHHHHHHHHHHHHHHHHHHHh......',
    '.....hHHHHHHHHoHHHHHHHHHHh......',
    '....hHHHHHHHHoHHHHHHoHHHHHh.....',
    '....hHHoHHHHHoHHHHHHoHHHHHh.....',
    '....hHHoHHHHHHHHHHHHHoHHHHHh....', // 10
    '....hHHHHHHHHHHHHHHHHHHHHHHh....',
    '....hHHHHHHoHHHHHoHHHHHHHHHh....',
    '....hHHoHHHHoHHHHoHHHHHoHHHh....',
    '.....hHHHHHHHHHHHHHHHHHHHHh.....',
    '.....hHHHHHHHHHHHHHHHHHHHh......', // 15
    '......hhHHHHHHHHHHHHHHHhh.......',
    '........hhhHHHHHHHHHHhh.........',
    '.........TTssssssssssTT.........',
    '........UUxTTTTTTTTTTxUU........',
    '........UAxTTTTTTTTTTxAU........', // 20
    '........AAxTTTTTTTTTTxAA........',
    '........AAxtTTTTTTTTtxAA........',
    '.......SSxGGGGGGGGGGGGxSS.......',
    '.......ss.tTTTTTTTTTTt.ss.......',
    '..........tTTTTTTTTTTt..........', // 25
    '................................',
    '................................',
    '................................',
    '................................',
    '................................', // 30
    '................................',
  ];
  const PROFIL = [
    '................................', // 0
    '..............hh.hHh............',
    '...........hhHHHhHHHHh..........',
    '.........hHHHHlllHHHHHhh........',
    '........hHHHHllllHHHHHHHh.......',
    '.......hHHHHHHHHHHHHHHHHHh......', // 5
    '......hHHHHHHHHHHHHHHHHHHHh.....',
    '.....hHHHHHHHHHHHHHHHHHoHHh.....',
    '.....hHHoHHHHHHHHHHHHHoHHHHh....',
    '....hHHHHoHHHHHHHHHHHorHHHh.....',
    '....hHHHHHoHHHHHHHHHhHHrHHh.....', // 10
    '....hHHHHHHHHHHHHHHHHsHHHh......',
    '.....hHHHHHHHHHHHhSHSssH........',
    '.....hHHoHHHKK...SKHKSss........',
    '.....hHHHoHKSsK.SSYJYSSs........',
    '......hHHHHKSes.SSWJNSSs........', // 15
    '......hHHHHKseS.SSWIISSr........',
    '.......hHHHhKrsSSSSiiSse........',
    '........hHh..rrsSSSSSsr.........',
    '.........h..eerrsssrre..........',
    '.............xxxxxxx............', // 20
    '............UTTTTWWTt...........',
    '............UTTTTTTTt...........',
    '............tTTTTTTtt...........',
    '............GGGGGGGG............',
    '............tTTTTTTt............', // 25
    '................................',
    '................................',
    '................................',
    '................................',
    '................................', // 30
    '................................',
  ];

  // Les cheveux longs : des mèches en plus, sur les épaules (de face), dans le dos, derrière l'oreille.
  // Les coupes : des mèches ajoutées par-dessus la tête de base (« courts »), par direction (gauche = miroir
  // de droite). [rangée, colonne, pixels].
  const sym = (liste) => [...liste, ...liste.map(([r, c, t]) => [r, L - c - t.length, [...t].reverse().join('')])];
  const COUETTE = [[8, 1, 'hHh'], [9, 0, 'hHHh'], [10, 0, 'hHHHh'], [11, 0, 'hHHHh'], [12, 0, 'hHoHh'], [13, 0, 'hHHHh'], [14, 1, 'hHHh'], [15, 1, 'hHHh'], [16, 1, 'hHh'], [17, 2, 'hh']];
  const HERISSES = [[0, 8, 'h'], [0, 14, 'hh'], [0, 21, 'h'], [1, 7, 'hH'], [1, 13, 'hHHh'], [1, 20, 'hHh'], [2, 6, 'hHH'], [3, 5, 'hHH'], [4, 4, 'hH'], [2, 24, 'Hh'], [3, 25, 'Hh'], [4, 26, 'Hh'], [7, 3, 'hH'], [8, 2, 'hHH'], [7, 27, 'Hh'], [8, 27, 'HHh']];
  const CHIGNON = [[0, 12, 'hHHHHh'], [1, 11, 'hHHlHHHh'], [2, 11, 'hKKKKKKh']];
  const COUPES = {
    courts: { bas: [], haut: [], droite: [] },
    longs: {
      bas: sym([[11, 3, 'hH'], [12, 3, 'hHH'], [13, 3, 'hHH'], [14, 3, 'hHHH'], [15, 3, 'hHHHh'], [16, 4, 'hHHHh'], [17, 4, 'hHHHh'], [18, 5, 'hHHh'], [19, 5, 'hHHh'], [20, 6, 'hHh'], [21, 6, 'hh']]),
      haut: [[17, 7, 'hHHHHHHHHHHHHHHHHh'], [18, 7, 'hHHoHHHHHHHHoHHHHh'], [19, 8, 'hHHHHHHHHHHHHHHh'], [20, 8, 'hHHHoHHHHoHHHHHh'], [21, 9, 'hhHHHHHHHHHHhh'], [22, 11, 'hhhhhhhhhh']],
      droite: [[16, 6, 'HHHHHh'], [17, 6, 'hHHHHh'], [18, 7, 'hHHHh'], [19, 7, 'hHHh'], [20, 8, 'hHh'], [21, 8, 'hh']],
    },
    queue: {
      bas: [[12, 26, 'hH'], [13, 26, 'hHh'], [14, 26, 'hHh'], [15, 27, 'Hh'], [16, 27, 'hh']],
      haut: [[13, 13, 'hKKKKh'], [14, 13, 'hHHHHh'], [15, 13, 'hHHHHh'], [16, 14, 'hHHh'], [17, 14, 'hHoh'], [18, 14, 'hHHh'], [19, 14, 'hHHh'], [20, 15, 'hh']],
      droite: [[7, 4, 'K'], [7, 2, 'hH'], [8, 1, 'hHHh'], [9, 1, 'hHHh'], [10, 1, 'hHoh'], [11, 1, 'hHHh'], [12, 1, 'hHHh'], [13, 2, 'hHh'], [14, 2, 'hHh'], [15, 3, 'hh']],
    },
    couettes: {
      bas: sym(COUETTE),
      haut: sym(COUETTE),
      droite: [[10, 2, 'hHh'], [11, 1, 'hHHh'], [12, 1, 'hHHHh'], [13, 1, 'hHoHh'], [14, 1, 'hHHh'], [15, 2, 'hHHh'], [16, 2, 'hHh'], [17, 3, 'hh']],
    },
    chignon: {
      bas: CHIGNON,
      haut: CHIGNON,
      droite: [[0, 7, 'hHHHh'], [1, 6, 'hHHlHHh'], [2, 6, 'hHHHHHh'], [3, 7, 'KKKKK']],
    },
    herisses: {
      bas: HERISSES,
      haut: HERISSES,
      droite: [[0, 10, 'h'], [0, 16, 'h'], [0, 20, 'h'], [1, 9, 'hH'], [1, 15, 'hHh'], [1, 19, 'hH'], [2, 7, 'hHH'], [3, 6, 'hH'], [4, 5, 'hH'], [6, 3, 'hH'], [7, 2, 'hHH']],
    },
  };

  // ---------- Les jambes et les bras selon la pose ----------
  // De face/dos : chaque jambe a une longueur (3 debout) à partir de la rangée `haut`, puis le pied (une
  // rangée, aussi large que la jambe). Sur un pas, le corps descend d'un pixel (les genoux plient) : la jambe
  // qui avance garde sa longueur (son pied descend, plus près de nous), celle qui reste derrière se plie.
  function jambesFace(l, haut, gauche, droite, dos) {
    const jambe = (c, n, fond) => {
      for (let k = 0; k < n; k++) poser(l, haut + k, c, fond ? 'pPP' : 'PPp');
      poser(l, haut + n, c, dos ? 'BBB' : fond ? 'bBB' : 'BBb');
    };
    // Un pixel vide entre les deux jambes (entre leurs contours), comme sur le modèle.
    jambe(12, gauche, false);
    jambe(18, droite, true);
  }
  // De profil (vers la droite) : écart 0 debout, 1/-1 les deux pas. Sur un pas, la jambe qui avance est en
  // diagonale jusqu'au sol, celle de derrière se lève (pied plus haut, plus sombre).
  function jambesProfil(l, haut, ecart) {
    // Le pied a la même largeur que la jambe, juste en dessous.
    if (!ecart) {
      for (let k = 0; k < 4; k++) poser(l, haut + k, 14, 'PPPp');
      poser(l, haut + 4, 14, 'BBBB');
      return;
    }
    // Sur un pas, les jambes s'ouvrent en V (en diagonale), les deux pieds au sol. ecart 1 : la jambe proche de
    // la caméra (claire) devant, celle du fond (sombre, plus fine) derrière ; ecart -1 : l'inverse.
    const jambe = (sens, proche) => {
      const P = proche ? 'PPPp' : 'ppp', c0 = sens > 0 ? 15 : proche ? 13 : 14;
      // La jambe du fond a la même forme, levée d'un pixel : son haut passe derrière la tunique.
      const h0 = proche ? haut : haut - 1;
      const mettre = (r, c, t) => { if (proche) poser(l, r, c, t); else [...t].forEach((ch, i) => { if (l[r][c + i] === '.') poser(l, r, c + i, ch); }); };
      for (let k = 0; k < 3; k++) mettre(h0 + k, c0 + sens * k, P);
      mettre(h0 + 3, c0 + sens * 3, proche ? 'BBBB' : 'qqq');
    };
    jambe(-ecart, false);
    jambe(ecart, true);
  }
  // Le bras de profil, sur la moitié arrière du buste (l'épaule n'avance pas), séparé du buste par un trait
  // sombre devant lui. haut : la rangée de l'épaule. dx : le balancement de la main (+ en avant) ; le coude
  // suit à moitié. La main fait 3 × 2 px.
  function brasProfil(l, haut, dx) {
    const a = Math.sign(dx) * Math.min(1, Math.abs(dx));
    // L'épaule commence sous le col (une rangée plus bas) et plus en arrière.
    poser(l, haut + 1, 12, 'UUA'); poser(l, haut + 1, 15, 'x');
    poser(l, haut + 2, 12 + a, 'UAAA'); poser(l, haut + 2, 16 + a, 'x');
    poser(l, haut + 3, 12 + dx, 'AAA');
    poser(l, haut + 4, 12 + dx, 'SSS');
    poser(l, haut + 5, 12 + dx, 'sss');
  }

  // De face/dos, la main qui avance descend d'un pixel (la manche s'allonge), celle qui recule remonte.
  // haut : la rangée des épaules (19 debout) ; la main est 4 rangées plus bas.
  function mains(l, haut, avanceG, avanceD) {
    const main = (cBras, cMain, d) => {
      if (!d) return;
      remplacer(l, haut + 4, haut + 5, cMain, cMain + 1, 'Ss', '.');
      if (d > 0) poser(l, haut + 4, cBras, 'AA');
      poser(l, haut + 4 + d, cMain, 'SS');
      poser(l, haut + 5 + d, cMain, 'ss');
    };
    main(8, 7, avanceG);
    main(22, 23, avanceD);
  }

  // Ombre les cheveux (H) : ombre en bas et à droite, lumière sur le bord du haut.
  function ombrer(l) {
    const n = l.length, w = l[0].length, at = (r, c) => (r >= 0 && r < n && c >= 0 && c < w ? l[r][c] : '.');
    const est = (ch) => 'Hhlo'.includes(ch);
    const out = l.map((s) => [...s]);
    for (let r = 0; r < n; r++) for (let c = 0; c < w; c++) {
      if (l[r][c] !== 'H') continue;
      if (!est(at(r + 1, c)) && r > 6) out[r][c] = 'h';
      else if (!est(at(r - 1, c)) && r < 8) out[r][c] = 'l';
    }
    return out.map((a) => a.join(''));
  }

  // ---------- Une pose ----------
  // o : { dir, coiffure, pas: 0 | 1 | 2, respire: 0 | 1, cligne }
  function pose(o) {
    const dir = o.dir === 'gauche' ? 'droite' : o.dir;
    // Pendant un pas, tout le haut du corps descend d'un pixel (les genoux plient).
    const plie = o.pas ? 1 : 0, dy = plie + (o.respire || 0);
    let l = (dir === 'droite' ? PROFIL : dir === 'haut' ? DOS : FACE).slice();
    for (const [r, c, s] of COUPES[o.coiffure]?.[dir] || []) poser(l, r, c, s);
    l = ombrer(l);
    if (o.cligne && dir !== 'haut') {
      // Les yeux fermés : la peau à la place de l'œil, et un trait de cils en bas.
      l = l.map((s, r) => (r === 13 || r === 14 || r === 15 ? s.replace(/[KYJNWI]/g, (ch, c) => (dir === 'bas' && (c < 9 || c > 22) ? ch : r === 15 ? 'K' : 'S')) : r === 16 ? s.replace(/[YJNWI]/g, 'S') : r === 17 ? s.replace(/i/g, 'S') : s));
    }
    l = decaler(l, dy);
    if (dir === 'droite') {
      const e = o.pas === 1 ? 1 : o.pas === 2 ? -1 : 0;
      if (!o.sansBras) brasProfil(l, 20 + dy, e * 2);
      jambesProfil(l, 26 + plie, e);
    } else {
      const dos = dir === 'haut';
      // Le pas 1 avance la jambe gauche de l'écran, le pas 2 la droite ; l'autre se plie.
      const g = o.pas === 2 ? 2 : 4, d = o.pas === 1 ? 2 : 4;
      jambesFace(l, 26 + plie, g, d, dos);
      // Les bras balancent à l'opposé des jambes.
      const a = o.pas === 1 ? 1 : o.pas === 2 ? -1 : 0;
      mains(l, 19 + dy, dos ? a : -a, dos ? -a : a);
    }
    return o.dir === 'gauche' ? miroir(l) : l;
  }

  // ---------- Les couleurs ----------
  const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const versHex = (v) => `#${v.map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('')}`;
  const melange = (a, b, t) => versHex(hex(a).map((v, i) => v + (hex(b)[i] - v) * t));
  function tsl(c) {
    const [r, g, b] = hex(c).map((v) => v / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s, l];
  }
  function depuisTsl(h, s, l) {
    const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
    return versHex([f(0), f(8), f(4)].map((v) => v * 255));
  }
  // Une rampe douce : l'ombre tire vers le violet, la lumière vers le jaune.
  function rampe(c) {
    const [h, s, l] = tsl(c);
    const vers = (cible, t) => h + ((((cible - h) % 360) + 540) % 360 - 180) * t;
    return {
      base: c,
      lumiere: depuisTsl(vers(50, 0.12), s, Math.min(0.9, l + 0.13)),
      ombre: depuisTsl(vers(260, 0.15), Math.min(1, s * 1.05), Math.max(0.08, l - 0.15)),
    };
  }

  const couleurOk = (c, defaut = '#d94a4a') => (/^#[0-9a-f]{6}$/i.test(c || '') ? c.toLowerCase() : defaut);
  // Un petit nombre tiré de la couleur : chaque personnage garde toujours la même coiffure, les mêmes
  // cheveux et les mêmes yeux, sans qu'on ait rien à choisir.
  function graine(c) { let n = 7; for (const ch of c) n = (n * 31 + ch.charCodeAt(0)) >>> 0; return n; }
  const CHEVEUX = ['#8f7772', '#4a3c44', '#c89050', '#9a5236', '#dcc480', '#6a5a7a'];
  const PEAUX = ['#ffe1af', '#f6cc9a', '#cf9a6c', '#ffe8cc'];
  const YEUX = ['#964f00', '#2e6ab0', '#3e7a30', '#6a3e8a'];

  // Les réglages d'un personnage de base : couleur (sa veste), et ce qu'on peut forcer.
  function reglages(couleur, o = {}) {
    const c = couleurOk(couleur), n = graine(c);
    return {
      couleur: c,
      coiffure: COIFFURES.includes(o.coiffure) ? o.coiffure : COIFFURES[n % COIFFURES.length],
      cheveux: couleurOk(o.cheveux, CHEVEUX[(n >>> 3) % CHEVEUX.length]),
      peau: couleurOk(o.peau, PEAUX[(n >>> 6) % PEAUX.length]),
      yeux: couleurOk(o.yeux, YEUX[(n >>> 9) % YEUX.length]),
    };
  }
  function palette(r) {
    const veste = rampe(r.couleur), cheveux = r.cheveux, peau = r.peau;
    const pant = rampe('#3e4660');
    return {
      H: cheveux, h: melange(cheveux, '#24141c', 0.28), o: melange(cheveux, '#1a0e14', 0.5), l: melange(cheveux, '#fff4e0', 0.32),
      S: peau, s: melange(peau, '#c8763c', 0.22), r: melange(peau, '#a8482a', 0.38), e: melange(peau, '#5a3010', 0.5), K: '#4a3a24',
      Y: '#dcdcdc', J: '#2e1e22', N: '#928a8c', W: '#ffffff', I: melange(r.yeux, '#000000', 0.25), i: r.yeux,
      T: veste.base, U: veste.lumiere, t: veste.ombre, A: melange(veste.base, veste.ombre, 0.6), x: melange(veste.base, '#1a1020', 0.6),
      G: '#4a3630', P: pant.base, p: pant.ombre,
      B: '#5a3a30', b: '#3a2620', q: '#3a2a26',
    };
  }

  // ---------- Le contour ----------
  // Chaque case vide qui touche le personnage (en haut, en bas, à gauche, à droite) devient un contour :
  // la couleur voisine très assombrie (un contour doux, brun ou bleu nuit, jamais noir).
  function contour(pixels, w, h) {
    const out = pixels.slice();
    const sombre = '#1e1418';
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (pixels[y * w + x]) continue;
      const voisins = [[x, y - 1], [x, y + 1], [x - 1, y], [x + 1, y]]
        .filter(([a, b]) => a >= 0 && b >= 0 && a < w && b < h && pixels[b * w + a]).map(([a, b]) => pixels[b * w + a]);
      if (voisins.length) out[y * w + x] = melange(voisins[0], sombre, 0.72);
    }
    return out;
  }

  // Une pose → ses pixels (couleurs '#rrggbb' ou null), contour compris, dans une image w × h
  // (centrée en largeur, les pieds en bas), décalée de (dx, dy).
  function pixels(lignes, pal, w = L, h = H, dx = 0, dy = 0) {
    const out = new Array(w * h).fill(null);
    const ox = Math.floor((w - lignes[0].length) / 2) + dx, oy = h - lignes.length + dy;
    lignes.forEach((ligne, y) => [...ligne].forEach((ch, x) => {
      const X = ox + x, Y = oy + y;
      if (ch !== '.' && pal[ch] && X >= 0 && Y >= 0 && X < w && Y < h) out[Y * w + X] = pal[ch];
    }));
    return contour(out, w, h);
  }

  // ---------- Les animations ----------
  // Le coup d'épée : 0 l'élan (le bras ramené, le corps recule), 1 la frappe (le bras tendu, le corps avance),
  // 2 la fin du geste, 3 le retour. Rend { lignes, dx, dy }.
  function poseCoup(o, k) {
    const dir = o.dir === 'gauche' ? 'droite' : o.dir;
    const l = pose({ ...o, dir, pas: 0, sansBras: dir === 'droite' });
    if (dir === 'droite') {
      // Le bras : ramené en arrière, puis tendu devant (à hauteur de poitrine), puis qui retombe.
      poser(l, 21, 12, 'UUA');
      if (k === 0) { poser(l, 21, 12, 'AAAA'); poser(l, 22, 10, 'AAAA'); poser(l, 23, 8, 'AAA'); poser(l, 23, 6, 'SS'); poser(l, 24, 6, 'ss'); }
      else if (k === 1) { poser(l, 21, 14, 'AAAAAAA'); poser(l, 22, 14, 'AAAAAAA'); poser(l, 21, 21, 'SSS'); poser(l, 22, 21, 'sss'); }
      else if (k === 2) { poser(l, 21, 13, 'AAAA'); poser(l, 22, 15, 'AAAAA'); poser(l, 23, 17, 'AAA'); poser(l, 23, 20, 'SSS'); poser(l, 24, 20, 'sss'); }
      else { poser(l, 21, 13, 'UAAA'); poser(l, 22, 14, 'AAAA'); poser(l, 23, 15, 'AAA'); poser(l, 24, 15, 'SSS'); poser(l, 25, 15, 'sss'); }
      // Pendant la frappe, les pieds s'écartent (une petite fente).
      if (k === 1 || k === 2) { remplacer(l, 26, 31, 0, L - 1, 'PpBbq', '.'); jambesProfil(l, 27, 1); }
    } else {
      // De face : le bras droit du personnage (à gauche de l'écran) ; de dos, celui de droite.
      const cb = dir === 'bas' ? 8 : 22, cm = dir === 'bas' ? 7 : 23;
      remplacer(l, 19, 24, Math.min(cb, cm), Math.max(cb, cm) + 1, 'AUSs', '.');
      if (dir === 'bas') remplacer(l, 19, 22, 10, 10, 'x', 'T'); else remplacer(l, 19, 22, 21, 21, 'x', 'T');
      if (k === 0) { poser(l, 19, cb, 'UA'); poser(l, 18, cm, 'AA'); poser(l, 17, cm, 'SS'); }
      else if (k === 1) { for (let r = 19; r <= 24; r++) poser(l, r, cb, 'AA'); poser(l, 25, cm, 'SS'); poser(l, 26, cm, 'ss'); }
      else if (k === 2) { for (let r = 19; r <= 23; r++) poser(l, r, cb, 'AA'); poser(l, 24, cm, 'SS'); poser(l, 25, cm, 'ss'); }
      else { poser(l, 19, cb, 'UA'); for (let r = 20; r <= 22; r++) poser(l, r, cb, 'AA'); poser(l, 23, cm, 'SS'); poser(l, 24, cm, 'ss'); }
    }
    const d = { bas: [0, 1], haut: [0, -1], droite: [1, 0] }[dir];
    const recul = k === 0 ? -1 : k === 1 || k === 2 ? 1 : 0;
    const sens = o.dir === 'gauche' ? -1 : 1;
    return { lignes: o.dir === 'gauche' ? miroir(l) : l, dx: d[0] * recul * sens, dy: d[1] * recul };
  }

  // Le coup reçu : 0 tout blanc (l'éclair), 1 et 2 le corps rejeté en arrière, les yeux fermés.
  function poseTouche(o, k) {
    const dir = o.dir === 'gauche' ? 'droite' : o.dir;
    let l = pose({ ...o, dir, pas: 0, cligne: k > 0 });
    l = decaler(l, k === 1 ? -1 : 0);
    const d = { bas: [0, -1], haut: [0, 1], droite: [-1, 0] }[dir];
    const sens = o.dir === 'gauche' ? -1 : 1;
    return { lignes: o.dir === 'gauche' ? miroir(l) : l, dx: k ? d[0] * sens * 2 : 0, dy: k ? d[1] : 0, blanc: k === 0 };
  }

  // La chute : il fléchit, tombe face contre terre, puis s'efface.
  function poseChute(o, k) {
    if (k <= 1) {
      const l = pose({ ...o, pas: 0, cligne: true });
      const blanc = '.'.repeat(L);
      // Fléchir : les pieds restent, des rangées des jambes disparaissent et le haut descend.
      const lignes = k === 0 ? [blanc, ...l.slice(0, 26), ...l.slice(27)] : [blanc, blanc, ...l.slice(0, 26), ...l.slice(28)];
      return { lignes, dx: 0, dy: 0 };
    }
    // Allongé : le personnage de dos (les cheveux, le dos, les jambes), tourné d'un quart de tour, la tête
    // du côté où il regardait (à droite pour la face et le dos).
    const dos = pose({ ...o, dir: 'haut', pas: 0 });
    const corps = dos.slice(dos.findIndex((s) => /[^.]/.test(s)));
    const n = corps.length;
    let couche = Array.from({ length: L }, (_, x) => Array.from({ length: n }, (_, y) => corps[n - 1 - y][x]).join(''));
    couche = couche.slice(couche.findIndex((s) => /[^.]/.test(s)));
    while (couche.length && !/[^.]/.test(couche[couche.length - 1])) couche.pop();
    if (o.dir === 'gauche') couche = miroir(couche);
    return { lignes: couche, dx: 0, dy: -3, alpha: [1, 1, 0.6, 0.3][k - 2] ?? 0.2 };
  }

  // Les animations du personnage de base : nombre d'images et durée d'une image (ms).
  const ANIMATIONS = {
    repos: { images: 4, duree: 300 },
    attaque: { images: 4, duree: 65 },
    coup: { images: 3, duree: 55 },
    mort: { images: 6, duree: 80 },
  };
  // Une image d'une animation : { lignes, dx, dy, blanc, alpha }.
  function imageAnimation(nom, o, k) {
    if (nom === 'repos') return { lignes: pose({ ...o, pas: 0, respire: k === 1 || k === 2 ? 1 : 0, cligne: k === 3 }), dx: 0, dy: 0 };
    if (nom === 'attaque') return poseCoup(o, k);
    if (nom === 'coup') return poseTouche(o, k);
    return poseChute(o, k);
  }

  // ---------- Les planches (navigateur) ----------
  function toile(w, h) {
    if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
    return new OffscreenCanvas(w, h);
  }
  function peindre(g, px, w, x0, y0, e, alpha = 1, blanc = false) {
    g.globalAlpha = alpha;
    px.forEach((c, i) => {
      if (!c) return;
      g.fillStyle = blanc ? '#ffffff' : c;
      g.fillRect(x0 + (i % w) * e, y0 + Math.floor(i / w) * e, e, e);
    });
    g.globalAlpha = 1;
  }
  // couleur : celle du personnage ; o : { coiffure, cheveux, peau, yeux } (sinon tirés de la couleur) ;
  // echelle : 1, 2… Rend { reglages, marche: { toile, largeur, hauteur, images }, animations: { repos,
  // attaque, coup, mort } } (largeur et hauteur d'UNE image, agrandie ; les animations ont aussi `duree`).
  function planches(couleur, o = {}, echelle = 1) {
    const r = reglages(couleur, o), pal = palette(r), e = Math.max(1, Math.round(echelle));
    const marche = toile(3 * L * e, 4 * H * e);
    const gm = marche.getContext('2d');
    ORDRE.forEach((dir, ri) => [0, 1, 2].forEach((pas) => {
      peindre(gm, pixels(pose({ dir, coiffure: r.coiffure, pas }), pal), L, pas * L * e, ri * H * e, e);
    }));
    const animations = {};
    for (const [nom, a] of Object.entries(ANIMATIONS)) {
      const cv = toile(a.images * LA * e, 4 * HA * e), g = cv.getContext('2d');
      ORDRE.forEach((dir, ri) => {
        for (let k = 0; k < a.images; k++) {
          const im = imageAnimation(nom, { dir, coiffure: r.coiffure }, k);
          peindre(g, pixels(im.lignes, pal, LA, HA, im.dx, im.dy), LA, k * LA * e, ri * HA * e, e, im.alpha ?? 1, im.blanc);
        }
      });
      animations[nom] = { toile: cv, largeur: LA * e, hauteur: HA * e, images: a.images, duree: a.duree };
    }
    return { reglages: r, marche: { toile: marche, largeur: L * e, hauteur: H * e, images: 3 }, animations };
  }

  return { L, H, LA, HA, ORDRE, COIFFURES, ANIMATIONS, pose, imageAnimation, reglages, palette, pixels, contour, melange, rampe, poser, miroir, vide, planches };
})();

if (typeof module !== 'undefined') module.exports = PersoBase;
