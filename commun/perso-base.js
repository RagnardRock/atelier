// Le personnage de base (Saga 1.31, Tafl 1.34) : celui que Saga dessine quand un personnage n'a ni
// sprite ni tuile, et que Tafl propose comme point de départ d'un sprite (« Partir du personnage de base »).
//
// Dans un style à la RPG Maker (le choix de Ragna) : une image de 32 × 32 px, une grosse tête aux grands
// yeux, des cheveux en mèches ombrées, un contour doux (la couleur voisine très assombrie, pas du noir).
// Planche de marche au format habituel de Saga : 4 rangées (face, gauche, droite, dos) × 3 images
// (debout, pas, autre pas).
//
// Tout se fabrique ici à partir de petits modèles qui se lisent comme des images (une lettre = un pixel),
// posés les uns sur les autres selon la pose (debout, pas, repos, coup d'épée, coup reçu, chute).
// Rien ne dépend du navigateur sauf `toile()` : Tafl et Saga en tirent leurs planches.
//
//   H cheveux (ombrés tout seuls : l lumière, w reflet, h ombre et séparation des mèches)
//   S peau  s son ombre  K cils et contour de l'œil  I iris  Y reflet de l'œil  m bouche
//   T veste  U sa lumière  t son ombre  A manche  x pli entre le bras et le buste  W chemise
//   G ceinture  g boucle  P pantalon  p son ombre (jambe du fond)  B chaussures  b semelle  q chaussure du fond

const PersoBase = (() => {
  const L = 32, H = 32;          // une image (marche et animations)
  const LA = 32, HA = 32;
  const ORDRE = ['bas', 'gauche', 'droite', 'haut'];
  const COIFFURES = ['courts', 'longs'];

  // ---------- Outils ----------
  const sym = (g) => g + [...g].reverse().join('');
  const vide = (w = L, h = H) => Array.from({ length: h }, () => '.'.repeat(w));
  const miroir = (lignes) => lignes.map((l) => [...l].reverse().join(''));
  // Écrit un bout de rangée (les '.' ne remplacent rien).
  function poser(lignes, r, c, s) {
    if (r < 0 || r >= lignes.length) return;
    const a = [...lignes[r]];
    [...s].forEach((ch, k) => { if (ch !== '.' && c + k >= 0 && c + k < a.length) a[c + k] = ch; });
    lignes[r] = a.join('');
  }
  // Décale de dy rangées tout ce qui est au-dessus de la rangée `jusque` (le haut du corps qui respire).
  function decaler(lignes, dy, jusque = 25) {
    if (!dy) return lignes;
    const haut = lignes.slice(0, jusque), bas = lignes.slice(jusque), w = lignes[0].length;
    const blanc = () => '.'.repeat(w);
    const out = dy > 0 ? [...Array.from({ length: dy }, blanc), ...haut.slice(0, haut.length - dy)] : [...haut.slice(-dy), ...Array.from({ length: -dy }, blanc)];
    return [...out, ...bas];
  }

  // ---------- Les têtes (rangées 1 à 18) ----------
  // Face et dos : la moitié gauche, recopiée en miroir. Les retouches cassent un peu la symétrie.
  const FACE = [
    '..........h.....',
    '.........hH..h..',
    '.......h.HHhhHh.',
    '......hHhHHHhHHH',
    '.....hHHHHHhHHHH',
    '.....HHHHHhHHHHH',
    '....hHHHHhHHHHhH',
    '....HHHHhHHHHhHH',
    '....HHHhHHHHhHHH',
    '....HHhHHHHhHHhH',
    '....hHHHHhSHHhSH',
    '....HHHhSSSSHSSS',
    '....HhSSKKKKSSSS',
    '....h.SSKIIYSSSS',
    '......SSKIIISSSS',
    '......sSSSSSSSSS',
    '.......sSSSSSSSS',
    '.........ssSSSSS',
  ].map(sym);
  const DOS = [
    '..........h.....',
    '.........hH..h..',
    '.......h.HHhhHh.',
    '......hHhHHHhHHH',
    '.....hHHHHHhHHHH',
    '.....HHHHHhHHHHH',
    '....hHHHHhHHHHhH',
    '....HHHHhHHHHhHH',
    '....HHHhHHHHhHHH',
    '....HHhHHHHhHHHH',
    '....hHhHHHHhHHHH',
    '....HhHHHHhHHHHH',
    '....HhHHHHhHHHHh',
    '....hHHHHhHHHHhH',
    '.....HHHhHHHHhHH',
    '......sHhHHHHhHH',
    '.......shHHHhHHh',
    '.........sssssss',
  ].map(sym);
  // De profil (vers la droite).
  const PROFIL = [
    '...........h....................',
    '..........hH..h..h..............',
    '........h.HHhhHhHH..............',
    '.......hHhHHHHHHHHHh............',
    '......hHHHHHHHHHHHHHH...........',
    '.....hHHHHHHHHHHHHHHHH..........',
    '.....HHHHHHHHHHHHHHHHHh.........',
    '....hHHHHHHHHHHHHHhHHHHh........',
    '....HHHHHHHHHHHHHhHHHhHH........',
    '....HHHHHHHHHHHHhHSShSSh........',
    '....hHHHHHHHHHHHSSSSSSSS........',
    '.....HHHHHHHHHHSSSSSSSSSS.......',
    '.....HHHHHHHHHSSSSSKKKSSS.......',
    '.....hHHHHsSHHSSSSSKIYSSSS......',
    '......HHHssSHSSSSSSKIISSSS......',
    '......hHHHHHSSSSSSSSSSSSs.......',
    '.......hHHhSSSSSSSSSSSs.........',
    '.........hssSSSSSSSss...........',
  ];
  // Les retouches de chaque coiffure : [rangée, colonne, texte], par direction ('.' seul : effacer).
  const RETOUCHES = {
    courts: {
      bas: [[16, 15, 'mm'], [2, 17, 'H'], [1, 18, '.']],
      haut: [[2, 17, 'H'], [1, 18, '.']],
      droite: [],
    },
    // Les longs : des mèches qui tombent sur les épaules (de face) et dans le dos.
    longs: {
      bas: [[16, 15, 'mm'], [2, 17, 'H'], [1, 18, '.'],
        [14, 4, 'HH'], [15, 4, 'HHh'], [16, 4, 'HHh'], [17, 5, 'HHh'], [18, 5, 'HHh'], [19, 6, 'Hh'], [20, 6, 'Hh'],
        [14, 26, 'HH'], [15, 25, 'hHH'], [16, 25, 'hHH'], [17, 24, 'hHH'], [18, 24, 'hHH'], [19, 24, 'hH'], [20, 24, 'hH']],
      haut: [[2, 17, 'H'], [1, 18, '.'], [15, 5, 'HHHHHHHHHHHHHHHHHHHHHH'], [16, 6, 'HHHhHHHHHHHHHHHHhHHH'], [17, 7, 'HHHhHHHHHHHHHhHHH'],
        [18, 7, 'hHHHHhHHHHHhHHHHh'], [19, 8, 'HHHHhHHHHhHHHHH'], [20, 9, 'hHHHHHhHHHHHh'], [21, 10, 'hhHHHHHHHhh']],
      droite: [[14, 6, 'HHH'], [15, 5, 'HHHHH'], [16, 5, 'HHHHHH'], [17, 6, 'HHHHH'], [18, 7, 'HHHH'], [19, 8, 'HHh'], [20, 9, 'Hh']],
    },
  };

  // ---------- Les corps (rangées 19 à 24 ; jambes 25 à 30) ----------
  const BUSTE_FACE = [
    '..........xUTTWW',
    '..........xUTTTW',
    '..........xUTTTW',
    '..........xtTTTW',
    '..........xttTTW',
    '..........GGGGgG',
  ].map(sym);
  const BUSTE_DOS = [
    '..........xUTTTT',
    '..........xUTTTT',
    '..........xUTTTT',
    '..........xtTTTT',
    '..........xttTTT',
    '..........GGGGGG',
  ].map(sym);
  const BUSTE_PROFIL = [
    '...........UTTTTTTTt............',
    '..........UTTTTTTTTTt...........',
    '..........UTTTTTTTTTt...........',
    '..........tTTTTTTTTtt...........',
    '..........ttTTTTTTTtt...........',
    '...........GGGGGGGGG............',
  ];

  // Un bras de face/dos (2 px de large) à la colonne col : d = -1 en arrière (plus court), 0, +1 en avant.
  function brasFace(l, col, d, dos) {
    const n = 4 + d;
    poser(l, 19, col, 'UA');
    for (let k = 1; k < n; k++) poser(l, 19 + k, col, 'AA');
    poser(l, 19 + n, col, dos ? 'Ss' : 'SS');
    if (d >= 0) poser(l, 20 + n, col, 'ss');
  }
  // Les jambes de face/dos : la jambe levée est plus courte de deux rangées.
  function jambesFace(l, leveeG, leveeD, dos) {
    const jambe = (c, levee) => {
      const n = levee ? 2 : 4;
      for (let k = 0; k < n; k++) poser(l, 25 + k, c, k === n - 1 ? 'PPPp' : 'PPPP');
      const cb = c - (c < 16 ? 1 : 0);
      poser(l, 25 + n, cb, dos ? 'BBBBB' : 'BBBBb');
      if (!levee) poser(l, 30, cb, 'bbbbb');
    };
    jambe(11, leveeG);
    jambe(17, leveeD);
    poser(l, 25, 15, 'pp');
  }
  // De profil : écart 0 debout, 1/-1 les deux pas (la jambe du fond est plus sombre).
  function jambesProfil(l, ecart) {
    if (!ecart) {
      for (let r = 25; r <= 28; r++) poser(l, r, 13, 'PPPPPp');
      poser(l, 29, 13, 'BBBBBBB');
      poser(l, 30, 13, 'bbbbbbbb');
      return;
    }
    const jambe = (sens, sombre) => {
      const P = sombre ? 'p' : 'P', B = sombre ? 'q' : 'B';
      if (sens > 0) {
        poser(l, 25, 14, P.repeat(5)); poser(l, 26, 15, P.repeat(5)); poser(l, 27, 16, P.repeat(4)); poser(l, 28, 17, P.repeat(4));
        poser(l, 29, 17, B.repeat(6)); poser(l, 30, 17, 'b'.repeat(6));
      } else {
        poser(l, 25, 12, P.repeat(5)); poser(l, 26, 11, P.repeat(5)); poser(l, 27, 10, P.repeat(4)); poser(l, 28, 9, P.repeat(4));
        poser(l, 29, 8, B.repeat(5)); poser(l, 30, 8, 'b'.repeat(5));
      }
    };
    const fond = ecart > 0 ? -1 : 1;
    jambe(fond, true);
    jambe(-fond, false);
  }
  // Le bras de profil, devant le buste : avance de -1 (en arrière) à +1 (en avant).
  function brasProfil(l, avance) {
    poser(l, 19, 14, 'AAA');
    poser(l, 20, 14 + avance, 'AAA');
    poser(l, 21, 14 + avance, 'AAA');
    poser(l, 22, 14 + 2 * avance, 'AAA');
    poser(l, 23, 14 + 2 * avance, 'SSs');
  }

  // Ombre les cheveux (H) : ombre en bas et à droite, lumière sur le bord du haut, un reflet en bande
  // sur le dessus de la tête.
  function ombrer(l, dir) {
    const n = l.length, w = l[0].length, at = (r, c) => (r >= 0 && r < n && c >= 0 && c < w ? l[r][c] : '.');
    const est = (ch) => 'Hhlw'.includes(ch);
    const out = l.map((s) => [...s]);
    for (let r = 0; r < n; r++) for (let c = 0; c < w; c++) {
      if (l[r][c] !== 'H') continue;
      const haut = !est(at(r - 1, c)), bas = !est(at(r + 1, c)) || !est(at(r + 2, c)), droite = !est(at(r, c + 1));
      if (bas || droite) out[r][c] = 'h';
      else if (haut && r < 9) out[r][c] = 'l';
      else if (r >= 3 && r <= 5 && c >= 9 && c <= 14 && dir !== 'haut') out[r][c] = r === 4 && c >= 10 && c <= 12 ? 'w' : 'l';
    }
    return out.map((a) => a.join(''));
  }

  // ---------- Une pose ----------
  // o : { dir, coiffure, pas: 0 | 1 | 2, respire: 0 | 1, cligne }
  function pose(o) {
    const dir = o.dir === 'gauche' ? 'droite' : o.dir;
    const coiffure = RETOUCHES[o.coiffure] ? o.coiffure : 'courts';
    const l = vide();
    if (dir === 'droite') {
      const e = o.pas === 1 ? 1 : o.pas === 2 ? -1 : 0;
      jambesProfil(l, e);
      BUSTE_PROFIL.forEach((s, k) => poser(l, 19 + k, 0, s));
      brasProfil(l, e);
      PROFIL.forEach((s, k) => poser(l, 1 + k, 0, s));
    } else {
      const dos = dir === 'haut';
      jambesFace(l, o.pas === 2, o.pas === 1, dos);
      const g = o.pas === 1 ? -1 : o.pas === 2 ? 1 : 0;
      (dos ? BUSTE_DOS : BUSTE_FACE).forEach((s, k) => poser(l, 19 + k, 0, s));
      brasFace(l, 8, dos ? -g : g, dos);
      brasFace(l, 22, dos ? g : -g, dos);
      (dos ? DOS : FACE).forEach((s, k) => poser(l, 1 + k, 0, s));
    }
    for (const [r, c, s] of RETOUCHES[coiffure][dir]) {
      if (s === '.') { const a = [...l[r]]; a[c] = '.'; l[r] = a.join(''); } else poser(l, r, c, s);
    }
    let out = ombrer(l, dir);
    if (o.cligne && dir !== 'haut') {
      // Les yeux fermés : la peau à la place de l'œil, et un trait de cils en bas.
      out = out.map((s, r) => (r === 13 ? s.replace(/K/g, 'S') : r === 14 ? s.replace(/[IYK]/g, 'S') : r === 15 ? s.replace(/[IYK]/g, 'K') : s));
    }
    out = decaler(out, o.respire || 0);
    return o.dir === 'gauche' ? miroir(out) : out;
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
  const CHEVEUX = ['#7a5c4a', '#3a3038', '#c48a48', '#8a4a32', '#d8c078', '#5a4a6a'];
  const PEAUX = ['#f8d4b0', '#efc29a', '#c8926a', '#f9dfc6'];
  const YEUX = ['#7a4a2a', '#3a6aa0', '#4a7a3a', '#6a4a8a'];

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
      H: cheveux, h: melange(cheveux, '#2a1a2a', 0.35), l: melange(cheveux, '#fff0d0', 0.3), w: melange(cheveux, '#ffffff', 0.55),
      S: peau, s: melange(peau, '#b05a4a', 0.28), K: '#3a2a28', I: r.yeux, Y: '#ffffff', m: melange(peau, '#c0504a', 0.45),
      T: veste.base, U: veste.lumiere, t: veste.ombre, A: melange(veste.base, veste.ombre, 0.6), x: melange(veste.base, '#1a1020', 0.6), W: '#f2efe6',
      G: '#4a3630', g: '#d8b050', P: pant.base, p: pant.ombre,
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
  // Le coup d'épée : 0 l'élan (le bras levé, le corps recule), 1 la frappe (le bras tendu, le corps avance),
  // 2 la fin du geste, 3 le retour. Rend { lignes, dx, dy }.
  function poseCoup(o, k) {
    const dir = o.dir === 'gauche' ? 'droite' : o.dir;
    const l = pose({ ...o, dir, pas: 0 });
    // On efface le bras qui frappe (la veste reprend sa place), puis on le redessine dans la pose.
    const efface = (r, c, n, par) => { const a = [...l[r]]; for (let i = 0; i < n; i++) if ('AUSs'.includes(a[c + i])) a[c + i] = par; l[r] = a.join(''); };
    if (dir === 'droite') {
      for (let r = 19; r <= 23; r++) efface(r, 12, 6, 'T');
      if (k === 0) { poser(l, 19, 11, 'AAA'); poser(l, 20, 10, 'AAA'); poser(l, 21, 9, 'SS'); }
      else if (k === 1) { poser(l, 19, 15, 'AAAAAA'); poser(l, 20, 15, 'AAAAAA'); poser(l, 19, 21, 'SS'); poser(l, 20, 21, 'Ss'); }
      else if (k === 2) { poser(l, 20, 15, 'AAAAA'); poser(l, 21, 16, 'AAAA'); poser(l, 21, 20, 'SS'); poser(l, 22, 20, 'ss'); }
      else { poser(l, 19, 14, 'AAA'); poser(l, 20, 15, 'AAA'); poser(l, 21, 15, 'AAA'); poser(l, 22, 16, 'SS'); }
      // Pendant la frappe, les pieds s'écartent (une petite fente).
      if (k === 1 || k === 2) { for (let r = 25; r <= 30; r++) l[r] = '.'.repeat(L); jambesProfil(l, 1); }
    } else {
      // De face : le bras droit du personnage (à gauche de l'écran) ; de dos, à droite de l'écran.
      const col = dir === 'bas' ? 8 : 22;
      for (let r = 19; r <= 25; r++) { const a = [...l[r]]; if ('AUSs'.includes(a[col])) a[col] = '.'; if ('AUSs'.includes(a[col + 1])) a[col + 1] = '.'; l[r] = a.join(''); }
      if (k === 0) { poser(l, 14, col, 'SS'); for (let r = 15; r <= 18; r++) poser(l, r, col, 'AA'); poser(l, 19, col, 'UA'); }
      else if (k === 1) { for (let r = 19; r <= 24; r++) poser(l, r, col, 'AA'); poser(l, 25, col, 'SS'); poser(l, 26, col, 'ss'); }
      else if (k === 2) { for (let r = 19; r <= 23; r++) poser(l, r, col, 'AA'); poser(l, 24, col, 'SS'); poser(l, 25, col, 'ss'); }
      else { poser(l, 19, col, 'UA'); for (let r = 20; r <= 22; r++) poser(l, r, col, 'AA'); poser(l, 23, col, 'SS'); poser(l, 24, col, 'ss'); }
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
      const lignes = k === 0 ? [blanc, blanc, ...l.slice(0, 25), ...l.slice(27)] : [blanc, blanc, blanc, blanc, ...l.slice(0, 25), ...l.slice(29)];
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
