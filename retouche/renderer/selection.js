// Les sélections de toutes formes (rectangle, ellipse, lasso, baguette magique…).
//
// Une sélection = { x, y, w, h, mask } : son rectangle englobant, en pixels du document, et un
// masque (un canvas de w × h) dont les pixels opaques sont sélectionnés. Le masque peut être
// progressif (bords adoucis). Une sélection n'est jamais modifiée : on en crée une nouvelle,
// ce qui permet à l'historique de garder les anciennes telles quelles.

const Sel = (() => {
  function fromMask(full, offsetX = 0, offsetY = 0) {
    const b = opaqueBounds(full);
    if (!b) return null;
    const mask = newCanvas(b.w, b.h);
    mask.getContext('2d').drawImage(full, -b.x, -b.y);
    return { x: b.x + offsetX, y: b.y + offsetY, w: b.w, h: b.h, mask };
  }

  function rect(x, y, w, h) {
    const mask = newCanvas(w, h);
    const g = mask.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, w, h);
    return { x, y, w, h, mask, rect: true };
  }

  function ellipse(x, y, w, h) {
    const mask = newCanvas(w, h);
    const g = mask.getContext('2d');
    g.fillStyle = '#fff';
    g.beginPath();
    g.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    g.fill();
    return { x, y, w, h, mask };
  }

  // Polygone (lasso) : liste de points en pixels du document.
  function polygon(doc, points) {
    if (points.length < 3) return null;
    const full = newCanvas(doc.width, doc.height);
    const g = full.getContext('2d');
    g.fillStyle = '#fff';
    g.beginPath();
    points.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    g.closePath();
    g.fill();
    return fromMask(full);
  }

  // La sélection dessinée sur un canvas de la taille du document.
  function toFull(doc, sel) {
    const full = newCanvas(doc.width, doc.height);
    if (sel) full.getContext('2d').drawImage(sel.mask, sel.x, sel.y);
    return full;
  }

  // Combine l'ancienne sélection et la nouvelle : remplacer, ajouter (Maj), retirer (Alt),
  // ou garder seulement l'intersection (Maj + Alt).
  function combine(doc, before, added, mode) {
    if (mode === 'new' || !before) return mode === 'subtract' || mode === 'intersect' ? before : added;
    if (!added) return mode === 'intersect' ? null : before;
    const full = toFull(doc, before);
    const g = full.getContext('2d');
    g.globalCompositeOperation = { add: 'source-over', subtract: 'destination-out', intersect: 'destination-in' }[mode];
    g.drawImage(added.mask, added.x, added.y);
    return fromMask(full);
  }

  function invert(doc, sel) {
    const full = newCanvas(doc.width, doc.height);
    const g = full.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, full.width, full.height);
    if (sel) {
      g.globalCompositeOperation = 'destination-out';
      g.drawImage(sel.mask, sel.x, sel.y);
    }
    return fromMask(full);
  }

  // Contour progressif : les bords de la sélection deviennent doux sur « radius » pixels.
  function feather(doc, sel, radius) {
    const m = Math.ceil(radius * 2);
    const full = newCanvas(sel.w + m * 2, sel.h + m * 2);
    const g = full.getContext('2d');
    g.filter = `blur(${radius}px)`;
    g.drawImage(sel.mask, m, m);
    const out = fromMask(full, sel.x - m, sel.y - m);
    if (!out) return null;
    // On ne déborde pas du document.
    const clip = clampRect(doc, out);
    if (!clip) return null;
    const mask = newCanvas(clip.w, clip.h);
    mask.getContext('2d').drawImage(out.mask, out.x - clip.x, out.y - clip.y);
    return { ...clip, mask };
  }

  // Grossir (pixels > 0) ou réduire (pixels < 0) la sélection.
  function grow(doc, sel, pixels) {
    const r = Math.abs(Math.round(pixels));
    if (!r) return sel;
    const full = newCanvas(doc.width, doc.height);
    const g = full.getContext('2d');
    if (pixels > 0) {
      for (let i = 0; i < 32; i++) {
        const a = (i / 32) * Math.PI * 2;
        g.drawImage(sel.mask, sel.x + Math.cos(a) * r, sel.y + Math.sin(a) * r);
      }
      g.drawImage(sel.mask, sel.x, sel.y);
    } else {
      // Réduire = grossir l'extérieur, puis l'enlever.
      g.drawImage(sel.mask, sel.x, sel.y);
      const outside = invert(doc, sel);
      if (outside) {
        g.globalCompositeOperation = 'destination-out';
        for (let i = 0; i < 32; i++) {
          const a = (i / 32) * Math.PI * 2;
          g.drawImage(outside.mask, outside.x + Math.cos(a) * r, outside.y + Math.sin(a) * r);
        }
      }
    }
    return fromMask(full);
  }

  // Le point (en pixels du document) est-il dans la sélection ?
  function contains(sel, p) {
    if (!sel || p.x < sel.x || p.y < sel.y || p.x >= sel.x + sel.w || p.y >= sel.y + sel.h) return false;
    if (sel.rect) return true;
    return sel.mask.getContext('2d').getImageData(Math.floor(p.x - sel.x), Math.floor(p.y - sel.y), 1, 1).data[3] > 127;
  }

  // Copie de « canvas » (posé en ox, oy dans le document) où seul l'intérieur de la sélection reste.
  function clip(canvas, sel, ox, oy) {
    const out = cloneCanvas(canvas);
    const g = out.getContext('2d');
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(sel.mask, sel.x - ox, sel.y - oy);
    return out;
  }
  // « original » hors de la sélection, « result » dedans (même taille, même position ox, oy).
  function within(original, result, sel, ox, oy) {
    const out = cloneCanvas(original);
    const g = out.getContext('2d');
    g.globalCompositeOperation = 'destination-out';
    g.drawImage(sel.mask, sel.x - ox, sel.y - oy);
    g.globalCompositeOperation = 'source-over';
    g.drawImage(clip(result, sel, ox, oy), 0, 0);
    return out;
  }
  // Efface l'intérieur de la sélection sur ce contexte (canvas posé en ox, oy).
  function erase(g, sel, ox, oy) {
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.drawImage(sel.mask, sel.x - ox, sel.y - oy);
    g.restore();
  }

  // Contour de la sélection (dans les coordonnées du masque), pour les « fourmis » : des segments le long des bords
  // du masque, regroupés en lignes. Calculé une seule fois par masque.
  const outlines = new WeakMap();
  function outline(sel) {
    let path = outlines.get(sel.mask);
    if (path) return path;
    path = new Path2D();
    const { width: w, height: h } = sel.mask;
    const data = sel.mask.getContext('2d').getImageData(0, 0, w, h).data;
    const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && data[(y * w + x) * 4 + 3] > 127;
    // Bords horizontaux (entre la ligne y-1 et y), puis verticaux.
    for (let y = 0; y <= h; y++) {
      let start = -1;
      for (let x = 0; x <= w; x++) {
        const edge = x < w && on(x, y) !== on(x, y - 1);
        if (edge && start < 0) start = x;
        if (!edge && start >= 0) { path.moveTo(start, y); path.lineTo(x, y); start = -1; }
      }
    }
    for (let x = 0; x <= w; x++) {
      let start = -1;
      for (let y = 0; y <= h; y++) {
        const edge = y < h && on(x, y) !== on(x - 1, y);
        if (edge && start < 0) start = y;
        if (!edge && start >= 0) { path.moveTo(x, start); path.lineTo(x, y); start = -1; }
      }
    }
    outlines.set(sel.mask, path);
    return path;
  }

  // Mode choisi par les touches tenues au moment du clic (comme Photoshop).
  const modeFrom = (e, fallback) => (e.shiftKey && e.altKey ? 'intersect' : e.shiftKey ? 'add' : e.altKey ? 'subtract' : fallback);

  return { rect, ellipse, polygon, fromMask, toFull, combine, invert, feather, grow, contains, clip, within, erase, outline, modeFrom };
})();
