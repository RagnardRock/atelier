// Découper une planche de tuiles (Tafl 0.10), pour Fichier › Importer une planche (io.js).
//
// Une planche trouvée sur Internet ou extraite d'un jeu n'est pas toujours propre :
// - le fond est souvent un damier ou une couleur unie peinte dans l'image (pas de vraie transparence).
//   Tafl sait le reconnaître et le rendre transparent ; seuls les grands morceaux de ces couleurs sont
//   retirés, pour garder un reflet de la même couleur au milieu d'un objet ;
// - les tuiles peuvent être séparées par une marge (autour de la planche) et un espacement (entre
//   deux tuiles), souvent 1 px ;
// - on ne veut parfois qu'une partie de l'image (la zone), par exemple sans les maquettes de pièces ;
// - les gros objets (arbres, maisons, fontaines) font plusieurs tuiles : chaque tache de pixels qui
//   se touchent devient un tampon, qu'on pose ensuite d'un clic sur la carte.
//
// Tout se calcule sur les pixels d'origine (ImageData) ; l'aperçu de la fenêtre d'import montre le
// résultat en direct.

const Planche = (() => {
  const rgb = (d, o) => (d[o] << 16) | (d[o + 1] << 8) | d[o + 2];
  const hexDe = (n) => `#${n.toString(16).padStart(6, '0')}`;
  const SEUIL = 24; // un morceau de couleur de fond plus petit (en pixels) est gardé avec « garder les petits »

  // Combien de tuiles tiennent dans l'image, avec la taille s, la marge m et l'espacement e.
  function grille(W, H, s, m = 0, e = 0) {
    const pas = s + e;
    return { cols: Math.max(0, Math.floor((W - m + e) / pas)), rows: Math.max(0, Math.floor((H - m + e) / pas)), pas };
  }

  // Le fond peint dans l'image : on compte les petits carrés de 4 × 4 pixels d'une seule couleur.
  // Une ou deux couleurs qui en couvrent une bonne part sont le fond (deux couleurs : un damier).
  // Si l'image a déjà de la vraie transparence, il n'y a rien à faire.
  function detecterFond(img) {
    const { data, width: W, height: H } = img;
    let transparents = 0;
    for (let o = 3; o < data.length; o += 16) if (data[o] === 0) transparents++;
    if (transparents / (data.length / 16) > 0.01) return { couleurs: [], sorte: 'transparent' };
    const compte = new Map();
    let blocs = 0;
    for (let by = 0; by + 4 <= H; by += 4) {
      for (let bx = 0; bx + 4 <= W; bx += 4) {
        blocs++;
        const c = rgb(data, (by * W + bx) * 4);
        let uni = true;
        for (let y = 0; y < 4 && uni; y++) for (let x = 0; x < 4; x++) if (rgb(data, ((by + y) * W + bx + x) * 4) !== c) { uni = false; break; }
        if (uni) compte.set(c, (compte.get(c) || 0) + 1);
      }
    }
    const tri = [...compte.entries()].sort((a, b) => b[1] - a[1]);
    if (!tri.length || tri[0][1] < blocs * 0.03) return { couleurs: [], sorte: 'aucun' };
    if (tri[1] && tri[1][1] >= Math.max(tri[0][1] * 0.25, blocs * 0.03)) return { couleurs: [hexDe(tri[0][0]), hexDe(tri[1][0])], sorte: 'damier' };
    return { couleurs: [hexDe(tri[0][0])], sorte: 'uni' };
  }

  // Une copie des pixels où les couleurs données deviennent transparentes. garderPetits : seuls les
  // morceaux d'au moins SEUIL pixels qui se touchent sont retirés (le fond), pas un reflet isolé.
  function rendreTransparent(img, couleurs, garderPetits = true) {
    const { width: W, height: H } = img;
    const out = new Uint8ClampedArray(img.data);
    const cibles = new Set(couleurs.map((h) => parseInt(String(h).slice(1, 7), 16)));
    if (!cibles.size) return out;
    const n = W * H;
    const marque = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (out[i * 4 + 3] && cibles.has(rgb(out, i * 4))) marque[i] = 1;
    if (!garderPetits) {
      for (let i = 0; i < n; i++) if (marque[i]) out[i * 4 + 3] = 0;
      return out;
    }
    // Les morceaux qui se touchent (haut, bas, gauche, droite), un par un.
    const pile = new Int32Array(n), morceau = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      if (marque[i] !== 1) continue;
      let haut = 0, taille = 0;
      pile[haut++] = i;
      marque[i] = 2;
      while (haut) {
        const p = pile[--haut];
        morceau[taille++] = p;
        const x = p % W;
        if (x > 0 && marque[p - 1] === 1) { marque[p - 1] = 2; pile[haut++] = p - 1; }
        if (x < W - 1 && marque[p + 1] === 1) { marque[p + 1] = 2; pile[haut++] = p + 1; }
        if (p >= W && marque[p - W] === 1) { marque[p - W] = 2; pile[haut++] = p - W; }
        if (p + W < n && marque[p + W] === 1) { marque[p + W] = 2; pile[haut++] = p + W; }
      }
      if (taille >= SEUIL) for (let k = 0; k < taille; k++) out[morceau[k] * 4 + 3] = 0;
    }
    return out;
  }

  // Les cases de la zone, de gauche à droite puis de haut en bas : { cx, cy, data, vide }
  // (cx, cy : la place dans la zone, à partir de 0).
  function decouper(data, W, { s, m = 0, e = 0, zone }) {
    const pas = s + e, cases = [];
    for (let cy = 0; cy < zone.h; cy++) {
      for (let cx = 0; cx < zone.w; cx++) {
        const ox = m + (zone.x + cx) * pas, oy = m + (zone.y + cy) * pas;
        const tuile = new Uint8ClampedArray(s * s * 4);
        for (let y = 0; y < s; y++) {
          const from = ((oy + y) * W + ox) * 4;
          tuile.set(data.subarray(from, from + s * 4), y * s * 4);
        }
        let vide = true;
        for (let o = 3; o < tuile.length; o += 4) if (tuile[o]) { vide = false; break; }
        cases.push({ cx, cy, data: tuile, vide });
      }
    }
    return cases;
  }

  // Les objets : on cherche les taches de pixels pleins qui se touchent (un arbre, un lampadaire…),
  // pas les cases : sur une planche bien remplie, les cases de deux objets voisins se touchent, mais
  // il reste toujours un peu de fond entre eux. Chaque tache donne le rectangle des cases qu'elle
  // couvre ; un rectangle presque entièrement (aux trois quarts) dans un autre (l'ombre détachée d'un
  // objet, un reflet) s'y ajoute. On garde ceux d'au moins 2 cases et d'au plus 16 × 16 cases (au-delà, c'est un
  // morceau de sol, pas un objet). Renvoie [{ x, y, w, h }] en cases de la zone.
  function objets(data, W, { s, m = 0, e = 0, zone }) {
    // On travaille sur les tuiles de la zone mises bout à bout, sans la marge ni l'espacement : un objet
    // coupé par l'espacement reste d'un seul tenant.
    const pas = s + e;
    const w = zone.w * s, h = zone.h * s;
    const vu = new Uint8Array(w * h), pile = new Int32Array(w * h);
    const plein = (x, y) => data[((m + (zone.y + Math.floor(y / s)) * pas + (y % s)) * W + m + (zone.x + Math.floor(x / s)) * pas + (x % s)) * 4 + 3] > 0;
    const caseX = (x) => Math.floor(x / s), caseY = (y) => Math.floor(y / s);
    let boites = [];
    for (let i = 0; i < w * h; i++) {
      if (vu[i] || !plein(i % w, Math.floor(i / w))) continue;
      let haut = 0, taille = 0, ax = w, ay = h, bx = 0, by = 0;
      pile[haut++] = i;
      vu[i] = 1;
      while (haut) {
        const p = pile[--haut];
        const x = p % w, y = (p - x) / w;
        taille++;
        if (x < ax) ax = x; if (x > bx) bx = x; if (y < ay) ay = y; if (y > by) by = y;
        if (x > 0 && !vu[p - 1] && plein(x - 1, y)) { vu[p - 1] = 1; pile[haut++] = p - 1; }
        if (x < w - 1 && !vu[p + 1] && plein(x + 1, y)) { vu[p + 1] = 1; pile[haut++] = p + 1; }
        if (y > 0 && !vu[p - w] && plein(x, y - 1)) { vu[p - w] = 1; pile[haut++] = p - w; }
        if (y < h - 1 && !vu[p + w] && plein(x, y + 1)) { vu[p + w] = 1; pile[haut++] = p + w; }
      }
      // Quelques pixels isolés (une poussière) ne font pas un objet.
      if (taille >= 4) boites.push({ ax: caseX(ax), ay: caseY(ay), bx: caseX(bx), by: caseY(by) });
    }
    const aire = (b) => (b.bx - b.ax + 1) * (b.by - b.ay + 1);
    for (let change = true; change;) {
      change = false;
      const fusion = [];
      for (const b of boites) {
        const o = fusion.find((f) => {
          const ix = Math.min(b.bx, f.bx) - Math.max(b.ax, f.ax) + 1, iy = Math.min(b.by, f.by) - Math.max(b.ay, f.ay) + 1;
          return ix > 0 && iy > 0 && ix * iy * 4 >= Math.min(aire(b), aire(f)) * 3;
        });
        if (o) {
          Object.assign(o, { ax: Math.min(o.ax, b.ax), ay: Math.min(o.ay, b.ay), bx: Math.max(o.bx, b.bx), by: Math.max(o.by, b.by) });
          change = true;
        } else fusion.push({ ...b });
      }
      boites = fusion;
    }
    return boites
      .filter((b) => aire(b) >= 2 && b.bx - b.ax < 16 && b.by - b.ay < 16)
      .sort((a, b) => a.ay - b.ay || a.ax - b.ax)
      .map((b) => ({ x: b.ax, y: b.ay, w: b.bx - b.ax + 1, h: b.by - b.ay + 1 }));
  }

  // --- L'aperçu de la fenêtre d'import ---
  // L'image (avec le fond déjà retiré), la grille des tuiles, la zone choisie (le reste est assombri)
  // et le contour des tampons. Glisser dessus choisit la zone ; Alt+clic prend la couleur du fond.
  function apercu(img, { onZone, onCouleur }) {
    const W = img.width, H = img.height;
    const maxW = Math.min(700, innerWidth - 480), maxH = Math.min(600, innerHeight - 260);
    let k = Math.min(maxW / W, maxH / H);
    k = k >= 1 ? Math.min(4, Math.floor(k)) : k;
    const cw = Math.round(W * k), ch = Math.round(H * k);
    const dpr = window.devicePixelRatio || 1;
    const canvas = el('canvas', { width: Math.round(cw * dpr), height: Math.round(ch * dpr), className: 'import-canvas', title: 'Glisse pour choisir la zone à découper.\nAlt+clic : cette couleur devient le fond (transparent).' });
    canvas.style.width = `${cw}px`;
    canvas.style.height = `${ch}px`;
    const box = el('div', { className: 'import-preview' }, [canvas, el('p', { className: 'import-hint', textContent: 'Glisse sur l\'image pour choisir la zone. Alt+clic sur le fond : cette couleur devient transparente. Pointillés : les tampons (objets de plusieurs tuiles).' })]);
    const g = canvas.getContext('2d');
    const source = el('canvas', { width: W, height: H });
    const sg = source.getContext('2d');
    let etat = null, glisse = null, dernier = null;

    function dessiner(e) {
      etat = e;
      if (e.pixels !== dernier) {
        sg.putImageData(new ImageData(e.pixels, W, H), 0, 0);
        dernier = e.pixels;
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, cw, ch);
      drawChecker(g, 0, 0, cw, ch, 8);
      g.drawImage(source, 0, 0, cw, ch);
      const { s, m, e: esp, zone } = e;
      const pas = (s + esp) * k;
      const X = (cx) => (m + cx * (s + esp)) * k, Y = (cy) => (m + cy * (s + esp)) * k;
      // Hors de la zone : assombri.
      const zx = X(zone.x), zy = Y(zone.y), zw = zone.w * pas - esp * k, zh = zone.h * pas - esp * k;
      g.fillStyle = 'rgba(8, 8, 12, 0.62)';
      g.beginPath();
      g.rect(0, 0, cw, ch);
      g.rect(zx, zy, zw, zh);
      g.fill('evenodd');
      // La grille des tuiles (si les cases ne sont pas minuscules à l'écran).
      if (s * k >= 5) {
        g.strokeStyle = 'rgba(255, 255, 255, 0.22)';
        g.lineWidth = 1;
        g.beginPath();
        if (esp) {
          // Avec un espacement : le contour de chaque tuile.
          for (let cy = 0; cy < e.rows; cy++) for (let cx = 0; cx < e.cols; cx++) g.rect(Math.round(X(cx)) + 0.5, Math.round(Y(cy)) + 0.5, Math.round(s * k) - 1, Math.round(s * k) - 1);
        } else {
          for (let cx = 0; cx <= e.cols; cx++) { const x = Math.round(X(cx)) + 0.5; g.moveTo(x, Y(0)); g.lineTo(x, Y(e.rows)); }
          for (let cy = 0; cy <= e.rows; cy++) { const y = Math.round(Y(cy)) + 0.5; g.moveTo(X(0), y); g.lineTo(X(e.cols), y); }
        }
        g.stroke();
      }
      // Les tampons trouvés.
      if (e.objets) {
        g.setLineDash([4, 3]);
        g.strokeStyle = 'rgba(255, 208, 64, 0.95)';
        g.lineWidth = 1.5;
        for (const o of e.objets) g.strokeRect(X(zone.x + o.x) + 1, Y(zone.y + o.y) + 1, o.w * pas - esp * k - 2, o.h * pas - esp * k - 2);
        g.setLineDash([]);
      }
      g.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#7bd88f';
      g.lineWidth = 2;
      g.strokeRect(zx - 1, zy - 1, zw + 2, zh + 2);
    }

    const pixel = (ev) => {
      const r = canvas.getBoundingClientRect();
      return { x: clamp(Math.floor((ev.clientX - r.left) / k), 0, W - 1), y: clamp(Math.floor((ev.clientY - r.top) / k), 0, H - 1) };
    };
    const caseDe = (p) => ({
      x: clamp(Math.floor((p.x - etat.m) / (etat.s + etat.e)), 0, etat.cols - 1),
      y: clamp(Math.floor((p.y - etat.m) / (etat.s + etat.e)), 0, etat.rows - 1),
    });
    canvas.addEventListener('pointerdown', (ev) => {
      if (!etat || !etat.cols || !etat.rows) return;
      const p = pixel(ev);
      if (ev.altKey) {
        const o = (p.y * W + p.x) * 4;
        onCouleur(hexDe(rgb(img.data, o)));
        return;
      }
      canvas.setPointerCapture(ev.pointerId);
      glisse = caseDe(p);
      onZone({ x: glisse.x, y: glisse.y, w: 1, h: 1 });
    });
    canvas.addEventListener('pointermove', (ev) => {
      if (!glisse) return;
      const c = caseDe(pixel(ev));
      onZone({ x: Math.min(glisse.x, c.x), y: Math.min(glisse.y, c.y), w: Math.abs(c.x - glisse.x) + 1, h: Math.abs(c.y - glisse.y) + 1 });
    });
    const fin = () => { glisse = null; };
    canvas.addEventListener('pointerup', fin);
    canvas.addEventListener('pointercancel', fin);
    // Un double-clic reprend toute l'image.
    canvas.addEventListener('dblclick', () => { if (etat) onZone({ x: 0, y: 0, w: etat.cols, h: etat.rows }); });
    return { element: box, dessiner };
  }

  return { grille, detecterFond, rendreTransparent, decouper, objets, apercu };
})();
