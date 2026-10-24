// Tafl 0.22 : rendre une image de ComfyUI utilisable comme tuiles.
//
// ComfyUI rend une grande image (environ 1024 × 1024) floue à l'échelle d'une tuile : ce n'est pas
// encore une tuile. Ces fonctions, sans rien d'autre que des tableaux de pixels, la transforment :
//   1. objet : retirer le fond uni autour (remplissage depuis les bords), recadrer sur l'objet ;
//   2. réduire à la taille voulue (w × h tuiles) : moyenne des pixels (styles peints, réalistes…)
//      ou couleur dominante de chaque bloc (pixel art : des aplats nets, pas de flou) ;
//   3. sol : raccorder les bords pour que la tuile se répète sans couture ;
//   4. pixel art seulement : réduire les couleurs (palette du jeu, ou N couleurs choisies),
//      transparence franche, et retirer les pixels isolés.
// Une image = { data: Uint8ClampedArray RGBA, width, height }.
// Le même fichier sert dans Tafl et dans les tests (node), d'où le module.exports en bas.

const PostTraitement = (() => {
  const image = (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) });
  const hexVersRgb = (h) => {
    const m = /^#?([0-9a-f]{6})/i.exec(String(h));
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const rgbVersHex = ([r, g, b]) => `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
  const dist2 = (r, g, b, c) => (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2;

  // --- 1. Le fond d'un objet ---
  // La couleur du fond : la plus fréquente sur le tour de l'image (le modèle a dessiné l'objet
  // « sur un fond uni »). Puis on rend transparent tout ce qui touche le bord et lui ressemble.
  function couleurDuBord(img) {
    const { data, width: W, height: H } = img;
    const compte = new Map();
    const ajouter = (x, y) => {
      const k = (y * W + x) * 4;
      const cle = ((data[k] >> 3) << 10) | ((data[k + 1] >> 3) << 5) | (data[k + 2] >> 3);
      const c = compte.get(cle) || { n: 0, r: 0, g: 0, b: 0 };
      c.n++; c.r += data[k]; c.g += data[k + 1]; c.b += data[k + 2];
      compte.set(cle, c);
    };
    for (let x = 0; x < W; x++) { ajouter(x, 0); ajouter(x, H - 1); }
    for (let y = 1; y < H - 1; y++) { ajouter(0, y); ajouter(W - 1, y); }
    let best = null;
    for (const c of compte.values()) if (!best || c.n > best.n) best = c;
    return [Math.round(best.r / best.n), Math.round(best.g / best.n), Math.round(best.b / best.n)];
  }
  function retirerFond(img, tolerance = 48) {
    const { data, width: W, height: H } = img;
    const fond = couleurDuBord(img);
    const t2 = tolerance * tolerance;
    const vu = new Uint8Array(W * H);
    const pile = [];
    const essayer = (i) => {
      if (vu[i]) return;
      const k = i * 4;
      if (data[k + 3] === 0 || dist2(data[k], data[k + 1], data[k + 2], fond) <= t2) { vu[i] = 1; pile.push(i); }
    };
    for (let x = 0; x < W; x++) { essayer(x); essayer((H - 1) * W + x); }
    for (let y = 0; y < H; y++) { essayer(y * W); essayer(y * W + W - 1); }
    while (pile.length) {
      const i = pile.pop();
      data[i * 4 + 3] = 0;
      const x = i % W, y = (i / W) | 0;
      if (x > 0) essayer(i - 1);
      if (x < W - 1) essayer(i + 1);
      if (y > 0) essayer(i - W);
      if (y < H - 1) essayer(i + W);
    }
    // Le liseré de couleur du fond qui reste autour de l'objet (anti-crénelage) : à moitié transparent.
    const lisere = (tolerance * 1.8) ** 2;
    for (let i = 0; i < W * H; i++) {
      const k = i * 4;
      if (!data[k + 3]) continue;
      const x = i % W, y = (i / W) | 0;
      const voisinVide = (x > 0 && !data[k - 1]) || (x < W - 1 && !data[k + 7]) || (y > 0 && !data[k - W * 4 + 3]) || (y < H - 1 && !data[k + W * 4 + 3]);
      if (voisinVide && dist2(data[k], data[k + 1], data[k + 2], fond) <= lisere) data[k + 3] = 96;
    }
    return { img, fond: rgbVersHex(fond) };
  }
  // Le rectangle des pixels visibles (null : image vide).
  function cadre(img, seuil = 32) {
    const { data, width: W, height: H } = img;
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (data[(y * W + x) * 4 + 3] > seuil) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }
  function couper(img, r) {
    const out = image(r.w, r.h);
    for (let y = 0; y < r.h; y++) out.data.set(img.data.subarray(((r.y + y) * img.width + r.x) * 4, ((r.y + y) * img.width + r.x + r.w) * 4), y * r.w * 4);
    return out;
  }
  // Pose src dans une image w × h, à la position (x, y).
  function poser(src, w, h, x, y) {
    const out = image(w, h);
    for (let sy = 0; sy < src.height; sy++) {
      const ty = y + sy;
      if (ty < 0 || ty >= h) continue;
      for (let sx = 0; sx < src.width; sx++) {
        const tx = x + sx;
        if (tx < 0 || tx >= w) continue;
        const a = (sy * src.width + sx) * 4, b = (ty * w + tx) * 4;
        for (let c = 0; c < 4; c++) out.data[b + c] = src.data[a + c];
      }
    }
    return out;
  }

  // --- 2. Réduire ---
  // Chaque pixel d'arrivée couvre un bloc de l'image de départ (bornes fractionnaires).
  function blocs(W, H, w, h, fn) {
    for (let y = 0; y < h; y++) {
      const sy0 = Math.floor((y * H) / h), sy1 = Math.max(sy0 + 1, Math.floor(((y + 1) * H) / h));
      for (let x = 0; x < w; x++) {
        const sx0 = Math.floor((x * W) / w), sx1 = Math.max(sx0 + 1, Math.floor(((x + 1) * W) / w));
        fn(x, y, sx0, sy0, sx1, sy1);
      }
    }
  }
  // Moyenne (pondérée par la transparence) : doux, pour les styles peints ou réalistes.
  function reduireMoyenne(img, w, h) {
    const out = image(w, h);
    const { data, width: W } = img;
    blocs(img.width, img.height, w, h, (x, y, x0, y0, x1, y1) => {
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = y0; sy < y1; sy++) for (let sx = x0; sx < x1; sx++) {
        const k = (sy * W + sx) * 4, al = data[k + 3];
        r += data[k] * al; g += data[k + 1] * al; b += data[k + 2] * al; a += al; n++;
      }
      const o = (y * w + x) * 4;
      if (a) { out.data[o] = r / a; out.data[o + 1] = g / a; out.data[o + 2] = b / a; }
      out.data[o + 3] = a / n;
    });
    return out;
  }
  // Couleur dominante : dans chaque bloc, les pixels sont rangés par couleur proche (5 bits par
  // canal) et le groupe le plus nombreux donne sa couleur moyenne. Un bloc à moitié vide devient vide.
  function reduireDominante(img, w, h) {
    const out = image(w, h);
    const { data, width: W } = img;
    blocs(img.width, img.height, w, h, (x, y, x0, y0, x1, y1) => {
      const groupes = new Map();
      let vides = 0, n = 0;
      for (let sy = y0; sy < y1; sy++) for (let sx = x0; sx < x1; sx++) {
        const k = (sy * W + sx) * 4;
        n++;
        if (data[k + 3] < 128) { vides++; continue; }
        const cle = ((data[k] >> 3) << 10) | ((data[k + 1] >> 3) << 5) | (data[k + 2] >> 3);
        const gr = groupes.get(cle) || { n: 0, r: 0, g: 0, b: 0 };
        gr.n++; gr.r += data[k]; gr.g += data[k + 1]; gr.b += data[k + 2];
        groupes.set(cle, gr);
      }
      const o = (y * w + x) * 4;
      if (vides * 2 > n || !groupes.size) return;
      let best = null;
      for (const gr of groupes.values()) if (!best || gr.n > best.n) best = gr;
      out.data[o] = best.r / best.n; out.data[o + 1] = best.g / best.n; out.data[o + 2] = best.b / best.n; out.data[o + 3] = 255;
    });
    return out;
  }
  const reduire = (img, w, h, mode) => (mode === 'dominante' ? reduireDominante(img, w, h) : reduireMoyenne(img, w, h));

  // --- 3. Sans couture ---
  // src fait (w + mx) × (h + my). La bande de droite (après w) est fondue dans le début de l'image :
  // ainsi le pixel 0 continue le pixel w - 1, et la tuile se répète sans trait visible. Pareil en
  // hauteur. En pixel art, le fondu est une trame (chaque pixel prend l'un ou l'autre côté) pour
  // ne pas créer de couleurs intermédiaires floues.
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  function raccorder(src, w, h, trame = false) {
    const mx = src.width - w, my = src.height - h;
    const lire = (x, y) => (y * src.width + x) * 4;
    // D'abord en largeur : une image w × (h + my).
    const etape = image(w, src.height);
    for (let y = 0; y < src.height; y++) for (let x = 0; x < w; x++) {
      let k = lire(x, y);
      const o = (y * w + x) * 4;
      if (x < mx) {
        const t = (x + 0.5) / mx; // 0 : côté « suite de la droite », 1 : l'image elle-même
        const k2 = lire(w + x, y);
        if (trame) { if (t < BAYER[(y & 3) * 4 + (x & 3)]) k = k2; } else {
          for (let c = 0; c < 4; c++) etape.data[o + c] = src.data[k2 + c] * (1 - t) + src.data[k + c] * t;
          continue;
        }
      }
      for (let c = 0; c < 4; c++) etape.data[o + c] = src.data[k + c];
    }
    // Puis en hauteur.
    const out = image(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let k = (y * w + x) * 4;
      const o = k;
      if (y < my) {
        const t = (y + 0.5) / my;
        const k2 = ((h + y) * w + x) * 4;
        if (trame) { if (t < BAYER[(y & 3) * 4 + ((x + 2) & 3)]) k = k2; } else {
          for (let c = 0; c < 4; c++) out.data[o + c] = etape.data[k2 + c] * (1 - t) + etape.data[k + c] * t;
          continue;
        }
      }
      for (let c = 0; c < 4; c++) out.data[o + c] = etape.data[k + c];
    }
    return out;
  }

  // --- 4. Pixel art ---
  // Coupe médiane : la boîte de couleurs la plus étendue est coupée en deux, jusqu'à n boîtes.
  function palette(img, n) {
    const { data } = img;
    const px = [];
    for (let k = 0; k < data.length; k += 4) if (data[k + 3] >= 128) px.push([data[k], data[k + 1], data[k + 2]]);
    if (!px.length) return [];
    let boites = [px];
    while (boites.length < n) {
      let bi = -1, etendue = -1, canal = 0;
      boites.forEach((b, i) => {
        if (b.length < 2) return;
        for (let c = 0; c < 3; c++) {
          let lo = 255, hi = 0;
          for (const p of b) { if (p[c] < lo) lo = p[c]; if (p[c] > hi) hi = p[c]; }
          if (hi - lo > etendue) { etendue = hi - lo; bi = i; canal = c; }
        }
      });
      if (bi < 0 || etendue <= 0) break;
      const b = boites[bi].sort((p, q) => p[canal] - q[canal]);
      const m = b.length >> 1;
      boites.splice(bi, 1, b.slice(0, m), b.slice(m));
    }
    return boites.map((b) => {
      const s = [0, 0, 0];
      for (const p of b) for (let c = 0; c < 3; c++) s[c] += p[c];
      return s.map((v) => Math.round(v / b.length));
    });
  }
  // Chaque pixel prend la couleur la plus proche de la palette ; transparence franche.
  function versPalette(img, couleurs) {
    const { data } = img;
    const cache = new Map();
    for (let k = 0; k < data.length; k += 4) {
      if (data[k + 3] < 128) { data[k] = data[k + 1] = data[k + 2] = data[k + 3] = 0; continue; }
      const cle = (data[k] << 16) | (data[k + 1] << 8) | data[k + 2];
      let c = cache.get(cle);
      if (!c) {
        let best = Infinity;
        for (const p of couleurs) { const d = dist2(data[k], data[k + 1], data[k + 2], p); if (d < best) { best = d; c = p; } }
        cache.set(cle, c);
      }
      data[k] = c[0]; data[k + 1] = c[1]; data[k + 2] = c[2]; data[k + 3] = 255;
    }
    return img;
  }
  // Un pixel seul de sa couleur, entouré de quatre voisins identiques, prend leur couleur
  // (le « bruit » que laissent les modèles). boucle : les voisins passent de l'autre côté (sol).
  function nettoyer(img, boucle = false) {
    const { data, width: W, height: H } = img;
    const copie = Uint8ClampedArray.from(data);
    const at = (x, y) => {
      if (boucle) { x = (x + W) % W; y = (y + H) % H; } else if (x < 0 || y < 0 || x >= W || y >= H) return -1;
      return (y * W + x) * 4;
    };
    const meme = (a, b) => a >= 0 && b >= 0 && copie[a] === copie[b] && copie[a + 1] === copie[b + 1] && copie[a + 2] === copie[b + 2] && copie[a + 3] === copie[b + 3];
    let changes = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = at(x, y), v = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)];
      if (v.some((i) => i < 0) || !meme(v[0], v[1]) || !meme(v[0], v[2]) || !meme(v[0], v[3]) || meme(k, v[0])) continue;
      for (let c = 0; c < 4; c++) data[k + c] = copie[v[0] + c];
      changes++;
    }
    return changes;
  }

  // Lissage (pixel art) : un pixel prend la couleur majoritaire autour de lui (5 voisins sur 9 au
  // moins). Les petits grains disparaissent, les formes et les aplats restent.
  function lisser(img, boucle = false) {
    const { data, width: W, height: H } = img;
    const copie = Uint32Array.from(new Uint32Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)));
    const sortie = new Uint32Array(data.buffer, data.byteOffset, W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const compte = new Map();
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        let nx = x + dx, ny = y + dy;
        if (boucle) { nx = (nx + W) % W; ny = (ny + H) % H; } else if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const c = copie[ny * W + nx];
        compte.set(c, (compte.get(c) || 0) + 1);
      }
      for (const [c, n] of compte) if (n >= 5) { sortie[y * W + x] = c; break; }
    }
    return img;
  }
  // Le milieu d'une image, w × h (ou toute l'image si elle est plus petite).
  function milieu(img, w, h) {
    const cw = Math.min(w, img.width), ch = Math.min(h, img.height);
    return couper(img, { x: Math.floor((img.width - cw) / 2), y: Math.floor((img.height - ch) / 2), w: cw, h: ch });
  }

  // --- Tout ---
  // o = { largeur, hauteur (en pixels), sorte: 'sol' | 'objet', pixel: bool,
  //       couleurs: nombre (0 = garder), palette: ['#rrggbb'] (pixel art : celle du jeu),
  //       tolerance (fond), marge (sol : part de l'image fondue dans les bords, 0.1 à 0.5),
  //       echelle (pixel art : taille d'un pixel dans l'image de ComfyUI, 8 avec Pixel Art XL),
  //       lissage (pixel art : 0 à 3 passes) }
  //
  // Pixel art : l'image de ComfyUI est d'abord ramenée à SON échelle (1024 px / 8 = 128 pixels de
  // pixel art), puis on y prend la taille voulue, sans la tasser. Tasser toute l'image dans
  // 4 × 4 tuiles mettait un pré entier dans 64 pixels : du bruit au lieu d'herbe.
  function traiter(source, o) {
    const w = Math.max(1, Math.round(o.largeur)), h = Math.max(1, Math.round(o.hauteur));
    let img = { width: source.width, height: source.height, data: Uint8ClampedArray.from(source.data) };
    const mode = o.pixel ? 'dominante' : 'moyenne';
    const e = o.pixel ? Math.max(1, Math.round(o.echelle || 8)) : 0;
    const infos = {};
    if (o.sorte === 'objet') {
      infos.fond = retirerFond(img, o.tolerance ?? 48).fond;
      const r = cadre(img);
      if (!r) return { img: image(w, h), infos: { ...infos, vide: true } };
      img = couper(img, r);
      // À l'échelle du pixel art d'abord ; puis l'objet garde ses proportions s'il faut le réduire.
      if (e) img = reduire(img, Math.max(1, Math.round(img.width / e)), Math.max(1, Math.round(img.height / e)), mode);
      const echelle = Math.min(w / img.width, h / img.height, e ? 1 : Infinity);
      const ow = Math.max(1, Math.round(img.width * echelle)), oh = Math.max(1, Math.round(img.height * echelle));
      // Centré, posé en bas (il se tient sur le sol).
      img = poser(ow === img.width && oh === img.height ? img : reduire(img, ow, oh, mode), w, h, Math.floor((w - ow) / 2), h - oh);
    } else {
      const marge = Math.min(0.5, Math.max(0.05, o.marge ?? 0.25));
      const mx = Math.max(1, Math.round(w * marge)), my = Math.max(1, Math.round(h * marge));
      if (e) {
        img = reduire(img, Math.max(1, Math.round(img.width / e)), Math.max(1, Math.round(img.height / e)), mode);
        img = milieu(img, w + mx, h + my);
      }
      if (img.width !== w + mx || img.height !== h + my) img = reduire(img, w + mx, h + my, mode);
      img = raccorder(img, w, h, Boolean(o.pixel));
      // Un sol est plein : aucune transparence.
      for (let k = 3; k < img.data.length; k += 4) img.data[k] = 255;
    }
    if (o.pixel) {
      const jeu = (o.palette || []).map(hexVersRgb).filter(Boolean);
      const couleurs = o.couleurs > 0 ? palette(img, o.couleurs) : jeu.length ? jeu : palette(img, 16);
      versPalette(img, couleurs);
      for (let n = 0; n < (o.lissage ?? 1); n++) lisser(img, o.sorte !== 'objet');
      infos.nettoyes = nettoyer(img, o.sorte !== 'objet');
      infos.couleurs = couleurs.map(rgbVersHex);
    }
    return { img, infos };
  }

  return { image, traiter, lisser, milieu, retirerFond, cadre, couper, poser, reduire, reduireMoyenne, reduireDominante, raccorder, palette, versPalette, nettoyer, couleurDuBord, hexVersRgb, rgbVersHex };
})();

if (typeof module !== 'undefined') module.exports = PostTraitement;
