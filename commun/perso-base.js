// Le personnage de base (Saga 1.31, Tafl 1.34) : celui que Saga dessine quand un personnage n'a ni
// sprite ni tuile, et que Tafl propose comme point de départ d'un sprite (« Partir du personnage de base »).
//
// Dans le style des tuiles « val » : couleurs vives, un contour sombre fin (teinté par la couleur
// qu'il borde), la lumière en haut à gauche. Une image fait 16 × 24 px : la tête dépasse sur la case
// du dessus, les pieds sont en bas de la case (comme un sprite de Tafl en 16 × 24).
//
// Tout se fabrique ici à partir de petits modèles qui se lisent comme des images (une lettre = un pixel),
// posés les uns sur les autres selon la pose (debout, pas, repos, coup d'épée, coup reçu, chute).
// Rien ne dépend du navigateur sauf `toile()` : Tafl et Saga en tirent leurs planches PNG.
//
//   C couvre-chef   L sa lumière   K son ombre (et la visière)   W blanc (logo, col)
//   H cheveux       h leur ombre   l leur reflet
//   S peau          s son ombre    R joues   E œil   Y reflet de l'œil
//   T haut          U sa lumière   t son ombre   A manche (le bras)
//   G ceinture      P pantalon     p son ombre (jambe du fond)
//   B chaussures    b leur semelle claire
//   Q sac           q son ombre

const PersoBase = (() => {
  const L = 16, H = 24;          // une image de marche
  const LA = 24, HA = 24;        // une image d'animation (le coup d'épée dépasse sur les côtés)
  const ORDRE = ['bas', 'gauche', 'droite', 'haut'];

  // ---------- Les têtes (11 rangées, de la rangée 3 à 13) ----------
  // Trois coiffures : casquette (le héros), courts, longs. Face, dos, profil (vers la droite).
  const TETES = {
    casquette: {
      bas: [
        '.....CCCCCC.....',
        '....CLLCCCCC....',
        '...CLCCWWCCCK...',
        '...CCCCWWCCCK...',
        '..KKKKKKKKKKKK..',
        '..HHssssssssHH..',
        '..HSSSSSSSSSSh..',
        '..HSSESSSSESSh..',
        '..hSSESSSSESSh..',
        '...SRSSSSSSRS...',
        '....sSSSSSSs....',
      ],
      haut: [
        '.....CCCCCC.....',
        '....CLLCCCCC....',
        '...CLCCCCCCCK...',
        '...CCCCCCCCCK...',
        '..HKCCWWWWCCKH..',
        '..HHlHHHHHHHHh..',
        '..HlHHHHHHHHHh..',
        '..HHHHHHHHHHHh..',
        '..hHHHHHHHHHhh..',
        '...hHHHHHHHHh...',
        '....hsssssh.....',
      ],
      droite: [
        '....CCCCCC......',
        '...CLLCCCCC.....',
        '...LCCCCWWCK....',
        '...CCCCCCWWCK...',
        '...KKKKKKKKKKKK.',
        '...HHHHssssss...',
        '...HlHHSSSSSS...',
        '...HHHSSSSSES...',
        '...hHHsSSSSESS..',
        '....hHSSSSRSS...',
        '.....hsSSSSs....',
      ],
    },
    courts: {
      bas: [
        '................',
        '.....HHHHHH.....',
        '....HllHHHHH....',
        '...HlHHHHHHHh...',
        '..HHHHHHHHHHHh..',
        '..HHhSHHHHShHh..',
        '..HSSSSSSSSSSh..',
        '..hSSESSSSESSh..',
        '..hSSESSSSESSh..',
        '...SRSSSSSSRS...',
        '....sSSSSSSs....',
      ],
      haut: [
        '................',
        '.....HHHHHH.....',
        '....HllHHHHH....',
        '...HlHHHHHHHh...',
        '..HlHHHHHHHHHh..',
        '..HHHHHHHHHHHh..',
        '..HHHHHHHHHHHh..',
        '..HHHHHHHHHHHh..',
        '..hHHHHHHHHHhh..',
        '...hHHHHHHHHh...',
        '....hsssssh.....',
      ],
      droite: [
        '................',
        '.....HHHHHH.....',
        '....HllHHHHH....',
        '...HlHHHHHHHH...',
        '...HHHHHHHHHHh..',
        '...HHHHHHSSShh..',
        '...HlHHSSSSSS...',
        '...HHHSSSSSES...',
        '...hHHsSSSSESS..',
        '....hHSSSSRSS...',
        '.....hsSSSSs....',
      ],
    },
    longs: {
      bas: [
        '................',
        '.....HHHHHH.....',
        '....HllHHHHH....',
        '...HlHHHHHHHh...',
        '..HHHHHHHHHHHh..',
        '..HHHSHHHHSHHh..',
        '..HSSSSSSSSSSh..',
        '..HSSESSSSESSh..',
        '..HSSESSSSESSh..',
        '..hSRSSSSSSRSh..',
        '..hhsSSSSSSshh..',
      ],
      haut: [
        '................',
        '.....HHHHHH.....',
        '....HllHHHHH....',
        '...HlHHHHHHHh...',
        '..HlHHHHHHHHHh..',
        '..HHHHHHHHHHHh..',
        '..HHHHHHHHHHHh..',
        '..HHHHHHHHHHHh..',
        '..HHHHHHHHHHHh..',
        '..hHHHHHHHHHhh..',
        '..hhHHHHHHHhhh..',
      ],
      droite: [
        '................',
        '.....HHHHHH.....',
        '....HllHHHHH....',
        '...HlHHHHHHHH...',
        '...HHHHHHHHHHh..',
        '...HHHHHHSSShh..',
        '...HlHHSSSSSS...',
        '...HHHHSSSSES...',
        '...HHHhSSSSESS..',
        '...hHHHSSSRSS...',
        '...hhhhsSSSs....',
      ],
    },
  };

  // ---------- Les corps ----------
  // Le buste (rangées 14 à 17), sans les bras ; puis les hanches (rangée 18).
  const BUSTE = {
    bas: [
      '...UTTTWWTTTt...',
      '.....UTTTTt.....',
      '.....UTTTTt.....',
      '.....GGGGGG.....',
    ],
    haut: [
      '...UTTTTTTTTt...',
      '....QQQQQQQq....',
      '....QQqqqqQq....',
      '....qQQQQQQq....',
    ],
    droite: [
      '....QUTTTTt.....',
      '...QqUTTTTt.....',
      '...QqUTTTtt.....',
      '....qGGGGGG.....',
    ],
  };
  const HANCHES = { bas: '....PPPPPPPP....', haut: '....PPPPPPPP....', droite: '.....PPPPPP.....' };

  // Les bras, de face/dos : [gauche de l'écran, droite de l'écran], chacun 2 px de large, rangées 15 à 18.
  // d = de combien le bras avance (+1 : la main descend, il est devant ; -1 : elle remonte, il est derrière).
  function brasFace(lignes, col, d) {
    const n = d > 0 ? 3 : d < 0 ? 1 : 2;   // rangées de manche
    for (let k = 0; k < n; k++) poser(lignes, 15 + k, col, 'AA');
    poser(lignes, 15 + n, col, 'SS');
  }

  // Les jambes, de face/dos (rangées 19 à 22) : la jambe levée est plus courte d'une rangée.
  function jambesFace(lignes, leveeG, leveeD, dos) {
    const jambe = (col, levee, fond) => {
      const P = fond ? 'p' : 'P';
      poser(lignes, 19, col, P + P + P);
      poser(lignes, 20, col, P + P + 'p');
      if (!levee) poser(lignes, 21, col, P + P + 'p');
      poser(lignes, levee ? 21 : 22, col, dos ? 'BBB' : 'BBb');
    };
    jambe(4, leveeG, false);
    jambe(9, leveeD, false);
    poser(lignes, 19, 7, 'pp');
  }

  // De profil (vers la droite) : écart 0 debout, 1/-1 les deux pas (jambe avant / arrière inversées).
  function jambesCote(lignes, ecart) {
    if (!ecart) {
      poser(lignes, 19, 6, 'PPPP');
      poser(lignes, 20, 6, 'PPPp');
      poser(lignes, 21, 6, 'PPPp');
      poser(lignes, 22, 6, 'BBBBb');
      return;
    }
    // La jambe du fond (plus sombre) d'abord, puis celle de devant par-dessus.
    const fond = ecart > 0 ? -1 : 1;
    const jambe = (sens, sombre) => {
      const P = sombre ? 'p' : 'P', B = sombre ? 'q' : 'B';
      if (sens > 0) {
        poser(lignes, 19, 7, P + P + P);
        poser(lignes, 20, 8, P + P + P);
        poser(lignes, 21, 9, P + P);
        poser(lignes, 22, 9, B + B + 'b');
      } else {
        poser(lignes, 19, 5, P + P + P);
        poser(lignes, 20, 4, P + P + P);
        poser(lignes, 21, 4, P + P);
        poser(lignes, 22, 3, B + B + B);
      }
    };
    jambe(fond, true);
    jambe(-fond, false);
  }
  // Le bras de profil, devant le buste : avance de -1 (en arrière) à +1 (en avant).
  function brasCote(lignes, avance) {
    const col = 7 + avance;
    poser(lignes, 15, 7, 'AA');
    poser(lignes, 16, col, 'AA');
    poser(lignes, 17, col + (avance > 0 ? 1 : 0), 'SS');
  }

  // Écrit un bout de rangée (les '.' ne remplacent rien).
  function poser(lignes, r, c, s) {
    if (r < 0 || r >= lignes.length) return;
    const ligne = [...lignes[r]];
    [...s].forEach((ch, k) => { if (ch !== '.' && c + k >= 0 && c + k < ligne.length) ligne[c + k] = ch; });
    lignes[r] = ligne.join('');
  }
  const vide = (w, h) => Array.from({ length: h }, () => '.'.repeat(w));
  const miroir = (lignes) => lignes.map((l) => [...l].reverse().join(''));
  // Décale tout ce qui est au-dessus de la rangée `jusque` (exclue) de dy rangées (le haut du corps qui respire).
  function decaler(lignes, dy, jusque = 19) {
    if (!dy) return lignes;
    const haut = lignes.slice(0, jusque), bas = lignes.slice(jusque);
    const w = lignes[0].length;
    const out = dy > 0 ? [...Array.from({ length: dy }, () => '.'.repeat(w)), ...haut.slice(0, haut.length - dy)] : [...haut.slice(-dy), ...Array.from({ length: -dy }, () => '.'.repeat(w))];
    return [...out, ...bas];
  }

  // ---------- Une pose ----------
  // o : { dir, coiffure, pas: 0 | 1 | 2, respire: 0 | 1, cligne, sac }
  function pose(o) {
    const dir = o.dir === 'gauche' ? 'droite' : o.dir;
    const lignes = vide(L, H);
    const tete = TETES[o.coiffure]?.[dir] || TETES.casquette[dir];
    if (dir === 'droite') {
      const ecart = o.pas === 1 ? 1 : o.pas === 2 ? -1 : 0;
      jambesCote(lignes, ecart);
      BUSTE.droite.forEach((s, k) => poser(lignes, 14 + k, 0, s));
      poser(lignes, 18, 0, HANCHES.droite);
      brasCote(lignes, ecart);
    } else {
      const dos = dir === 'haut';
      jambesFace(lignes, o.pas === 2, o.pas === 1, dos);
      poser(lignes, 18, 0, HANCHES[dir]);
      // Les bras balancent à l'opposé des jambes.
      const g = o.pas === 1 ? -1 : o.pas === 2 ? 1 : 0;
      brasFace(lignes, 3, dos ? -g : g);
      brasFace(lignes, 11, dos ? g : -g);
      BUSTE[dir].forEach((s, k) => poser(lignes, 14 + k, 0, s));
    }
    tete.forEach((s, k) => poser(lignes, 3 + k, 0, s));
    if (o.cligne && dir !== 'haut') {
      // Les yeux fermés : une ligne de peau sombre à la place.
      for (const r of [10, 11]) lignes[r] = lignes[r].replace(/E/g, r === 10 ? 'S' : 's');
    }
    // Sur les pas, le haut du corps descend d'un pixel (le poids sur la jambe) ; au repos, il respire.
    let out = decaler(lignes, (o.pas ? 1 : 0) + (o.respire || 0));
    if (o.dir === 'gauche') out = miroir(out);
    return out;
  }

  // ---------- Les couleurs ----------
  const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const versHex = (v) => `#${v.map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('')}`;
  const melange = (a, b, t) => versHex(hex(a).map((v, i) => v + (hex(b)[i] - v) * t));
  // Teinte (0-360), saturation et luminosité (0-1) d'une couleur, et l'inverse.
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
  // Une rampe comme les tuiles « val » : l'ombre tire vers le bleu-violet, la lumière vers le jaune.
  function rampe(c) {
    const [h, s, l] = tsl(c);
    const vers = (cible, t) => h + ((((cible - h) % 360) + 540) % 360 - 180) * t;
    return {
      base: c,
      lumiere: depuisTsl(vers(50, 0.15), Math.min(1, s * 1.02), Math.min(0.92, l + 0.16)),
      ombre: depuisTsl(vers(250, 0.18), Math.min(1, s * 1.05), Math.max(0.08, l - 0.17)),
    };
  }

  // Une couleur valide (sinon le rouge du héros).
  const couleurOk = (c) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c.toLowerCase() : '#d94a4a');
  // Un petit nombre tiré de la couleur : chaque personnage garde toujours la même coiffure et les mêmes
  // cheveux, sans qu'on ait rien à choisir.
  function graine(c) { let n = 7; for (const ch of c) n = (n * 31 + ch.charCodeAt(0)) >>> 0; return n; }
  const CHEVEUX = ['#5b3a28', '#2e2630', '#c98a3a', '#8a4a2a', '#e8d080', '#4a3a5a'];
  const PEAUX = ['#f6cfa6', '#eab88e', '#c98a5e', '#f8dcc0'];

  // Les réglages d'un personnage de base : couleur (son haut, sa casquette), et ce qu'on peut forcer.
  function reglages(couleur, o = {}) {
    const c = couleurOk(couleur), n = graine(c);
    return {
      couleur: c,
      coiffure: o.coiffure || ['casquette', 'courts', 'longs'][n % 3],
      cheveux: couleurOk(o.cheveux || CHEVEUX[(n >>> 3) % CHEVEUX.length]),
      peau: couleurOk(o.peau || PEAUX[(n >>> 6) % PEAUX.length]),
    };
  }
  function palette(r) {
    const haut = rampe(r.couleur), cheveux = rampe(r.cheveux), peau = rampe(r.peau);
    // Le pantalon : un bleu-gris sombre ; le sac : la couleur opposée du haut, plus douce.
    const [h] = tsl(r.couleur);
    const sac = rampe(depuisTsl((h + 180) % 360, 0.5, 0.55));
    const pant = rampe('#3e4a72');
    return {
      C: haut.base, L: haut.lumiere, K: haut.ombre, W: '#f6f4ee',
      H: cheveux.base, h: cheveux.ombre, l: cheveux.lumiere,
      S: peau.base, s: peau.ombre, R: melange(peau.base, '#ff6a6a', 0.3), E: '#241c30', Y: '#ffffff',
      T: haut.base, U: haut.lumiere, t: haut.ombre, A: melange(haut.base, haut.ombre, 0.45),
      G: '#3a2c34', P: pant.base, p: pant.ombre,
      B: '#4a3036', b: '#8a6a6a',
      Q: sac.base, q: sac.ombre,
    };
  }

  // ---------- Le contour ----------
  // Chaque case vide qui touche le personnage (en haut, en bas, à gauche, à droite) devient un contour :
  // la couleur voisine, très assombrie (comme les tuiles « val »).
  function contour(pixels, w, h) {
    const out = pixels.slice();
    const sombre = '#1a1424';
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (pixels[y * w + x]) continue;
      const voisins = [[x, y - 1], [x, y + 1], [x - 1, y], [x + 1, y]]
        .filter(([a, b]) => a >= 0 && b >= 0 && a < w && b < h && pixels[b * w + a]).map(([a, b]) => pixels[b * w + a]);
      if (voisins.length) out[y * w + x] = melange(voisins[0], sombre, 0.82);
    }
    return out;
  }

  // Une pose → ses pixels (couleurs '#rrggbb' ou null), contour compris, dans une image w × h
  // (centrée en largeur, les pieds en bas).
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
  // Le coup d'épée : 0 l'élan (le bras en arrière, le corps recule), 1 la frappe (le bras tendu, le corps
  // avance), 2 la fin du geste, 3 le retour. Rend [lignes, dx, dy] (le décalage du corps dans l'image).
  function poseCoup(o, k) {
    const dir = o.dir === 'gauche' ? 'droite' : o.dir;
    let lignes = pose({ ...o, dir, pas: 0 });
    const d = { bas: [0, 1], haut: [0, -1], droite: [1, 0] }[dir];
    const recul = k === 0 ? -1 : k === 1 || k === 2 ? 1 : 0;
    if (dir === 'droite') {
      // Le bras : en arrière (main derrière le dos), puis tendu devant.
      const efface = (r, c, n) => { const l = [...lignes[r]]; for (let i = 0; i < n; i++) if ('AS'.includes(l[c + i])) l[c + i] = 'T'; lignes[r] = l.join(''); };
      efface(16, 6, 4); efface(17, 6, 4);
      if (k === 0) { poser(lignes, 15, 5, 'AA'); poser(lignes, 16, 4, 'SS'); }
      else if (k === 1) { poser(lignes, 15, 8, 'AAAA'); poser(lignes, 15, 12, 'SS'); }
      else if (k === 2) { poser(lignes, 16, 8, 'AAA'); poser(lignes, 17, 11, 'SS'); }
      else { poser(lignes, 16, 7, 'AA'); poser(lignes, 17, 8, 'SS'); }
      lignes = jambesFente(lignes, k);
    } else {
      // De face : le bras droit du personnage (à gauche de l'écran) ; de dos, à droite de l'écran.
      const col = dir === 'bas' ? 3 : 11;
      for (let r = 15; r <= 18; r++) poser(lignes, r, col, dir === 'bas' ? 'UT' : 'Tt');
      // On efface le bras debout (on remet le buste), puis on le redessine dans la pose.
      lignes = lignes.map((l, r) => (r >= 15 && r <= 18 ? [...l].map((ch, c) => (c === col || c === col + 1 ? '.' : ch)).join('') : l));
      if (k === 0) { poser(lignes, 13, col, 'SS'); poser(lignes, 14, col, 'AA'); poser(lignes, 15, col, 'AA'); }
      else if (k === 1) { for (let r = 15; r <= 18; r++) poser(lignes, r, col, 'AA'); poser(lignes, 19, col, 'SS'); }
      else if (k === 2) { for (let r = 15; r <= 17; r++) poser(lignes, r, col, 'AA'); poser(lignes, 18, col, 'SS'); }
      else { for (let r = 15; r <= 16; r++) poser(lignes, r, col, 'AA'); poser(lignes, 17, col, 'SS'); }
    }
    if (o.dir === 'gauche') lignes = miroir(lignes);
    const sens = o.dir === 'gauche' ? -1 : 1;
    return [lignes, d[0] * recul * sens, d[1] * recul];
  }
  // De profil, pendant la frappe, les pieds s'écartent (une petite fente).
  function jambesFente(lignes, k) {
    if (k !== 1 && k !== 2) return lignes;
    const out = lignes.slice();
    for (let r = 19; r <= 22; r++) out[r] = '.'.repeat(L);
    jambesCote(out, 1);
    return out;
  }

  // Le coup reçu : 0 tout blanc (l'éclair), 1 et 2 le corps rejeté en arrière, les yeux plissés.
  function poseTouche(o, k) {
    const dir = o.dir === 'gauche' ? 'droite' : o.dir;
    let lignes = pose({ ...o, dir, pas: 0, cligne: k > 0 });
    lignes = decaler(lignes, k === 1 ? -1 : 0);
    if (o.dir === 'gauche') lignes = miroir(lignes);
    const d = { bas: [0, -1], haut: [0, 1], droite: [-1, 0] }[dir];
    const sens = o.dir === 'gauche' ? -1 : 1;
    return [lignes, k ? d[0] * sens : 0, k ? d[1] : 0, k === 0];
  }

  // La chute : il fléchit, tombe sur le côté, reste allongé puis s'efface.
  function poseChute(o, k) {
    if (k <= 1) {
      let lignes = pose({ ...o, dir: o.dir, pas: 0, cligne: true });
      // Fléchir : les pieds restent, une rangée des jambes disparaît (deux à l'image suivante) et le haut descend.
      const vide1 = '.'.repeat(L);
      lignes = k === 0 ? [vide1, ...lignes.slice(0, 20), ...lignes.slice(21)] : [vide1, vide1, ...lignes.slice(0, 19), ...lignes.slice(21)];
      return [lignes, 0, 0, false, 1];
    }
    // Allongé, face contre terre : le personnage de dos, tourné d'un quart de tour (les cheveux, le sac, les
    // jambes), la tête du côté où il regardait (à droite pour la face et le dos).
    const dos = pose({ ...o, dir: 'haut', pas: 0 });
    const corps = dos.slice(dos.findIndex((l) => /[^.]/.test(l)));
    const h = corps.length;
    let couche = Array.from({ length: L }, (_, x) => Array.from({ length: h }, (_, y) => corps[h - 1 - y][x]).join(''));
    if (o.dir === 'gauche') couche = couche.map((l) => [...l].reverse().join(''));
    const alpha = [1, 1, 0.6, 0.3][k - 2] ?? 0.2;
    return [couche, 0, 3, false, alpha];
  }

  // Les animations du personnage de base : [nom, nombre d'images, durée d'une image (ms), boucle].
  const ANIMATIONS = {
    repos: { images: 4, duree: 260 },
    attaque: { images: 4, duree: 65 },
    coup: { images: 3, duree: 55 },
    mort: { images: 6, duree: 80 },
  };
  // Une image d'une animation : { lignes, dx, dy, blanc, alpha }.
  function imageAnimation(nom, o, k) {
    if (nom === 'repos') {
      // Il respire (le haut du corps descend d'un pixel), et cligne des yeux de temps en temps.
      const lignes = pose({ ...o, pas: 0, respire: k === 1 || k === 2 ? 1 : 0, cligne: k === 3 });
      return { lignes, dx: 0, dy: 0 };
    }
    if (nom === 'attaque') { const [lignes, dx, dy] = poseCoup(o, k); return { lignes, dx, dy }; }
    if (nom === 'coup') { const [lignes, dx, dy, blanc] = poseTouche(o, k); return { lignes, dx, dy, blanc }; }
    const [lignes, dx, dy, , alpha] = poseChute(o, k);
    return { lignes, dx, dy, alpha };
  }

  // ---------- Les planches (navigateur) ----------
  // Une planche : 4 rangées (bas, gauche, droite, haut) × n images de w × h, agrandie `echelle` fois.
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
  // couleur : celle du personnage ; o : { coiffure, cheveux, peau } (sinon tirés de la couleur) ; echelle : 1, 2…
  // Rend { reglages, marche: { toile, largeur, hauteur, images }, animations: { repos, attaque, coup, mort } }
  // (largeur et hauteur d'UNE image, agrandie ; les animations ont aussi `duree`).
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
          const w = Math.max(LA, im.lignes[0].length);
          peindre(g, pixels(im.lignes, pal, LA, HA, im.dx, im.dy), LA, k * LA * e, ri * HA * e, e, im.alpha ?? 1, im.blanc);
          void w;
        }
      });
      animations[nom] = { toile: cv, largeur: LA * e, hauteur: HA * e, images: a.images, duree: a.duree };
    }
    return { reglages: r, marche: { toile: marche, largeur: L * e, hauteur: H * e, images: 3 }, animations };
  }

  return { L, H, LA, HA, ORDRE, ANIMATIONS, pose, imageAnimation, reglages, palette, pixels, contour, melange, rampe, poser, miroir, vide, planches };
})();

if (typeof module !== 'undefined') module.exports = PersoBase;
