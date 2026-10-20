// Calques de remplissage et calques de réglage, comme dans Photoshop.
//
// - Un calque de remplissage (couleur unie, dégradé) peint toute l'image avec ses réglages.
// - Un calque de réglage (niveaux, teinte/saturation…) modifie l'image formée par les calques
//   du dessous, sans toucher à leurs pixels : on peut le régler à nouveau, le masquer, le supprimer.
//
// Les deux ont un masque : c'est le canvas du calque. Là où il est opaque, l'effet s'applique ;
// là où il est transparent, il ne s'applique pas. Au départ le masque couvre toute l'image, ou
// seulement la sélection s'il y en a une. On le retouche au pinceau, comme dans Photoshop :
// noir = cacher l'effet, blanc = le montrer (la gomme cache aussi).
//
// Les réglages sont rangés dans layer.fill = { type, values } ou layer.adjust = { type, values }.
// On ne modifie jamais ces objets : on en crée un nouveau, pour que l'historique garde l'ancien.

const Adjust = (() => {
  // --- Outils de calcul ---

  function filtered(src, filter) {
    const out = newCanvas(src.width, src.height);
    const g = out.getContext('2d');
    g.filter = filter;
    g.drawImage(src, 0, 0);
    return out;
  }

  // Applique fn(r, g, b) → [r, g, b] à chaque pixel (la transparence ne change pas).
  function perPixel(src, fn) {
    const out = cloneCanvas(src);
    const g = out.getContext('2d');
    const img = g.getImageData(0, 0, out.width, out.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      const c = fn(d[i], d[i + 1], d[i + 2]);
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
    }
    g.putImageData(img, 0, 0);
    return out;
  }
  // Même chose avec une table : la même transformation pour les trois canaux (bien plus rapide).
  function withTable(src, table) {
    const out = cloneCanvas(src);
    const g = out.getContext('2d');
    const img = g.getImageData(0, 0, out.width, out.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) { d[i] = table[d[i]]; d[i + 1] = table[d[i + 1]]; d[i + 2] = table[d[i + 2]]; }
    g.putImageData(img, 0, 0);
    return out;
  }
  const table = (fn) => { const t = new Uint8ClampedArray(256); for (let i = 0; i < 256; i++) t[i] = fn(i); return t; };
  const toRgb = (hex) => { const [r, g, b] = hexToRgb(hex); return { r, g, b }; };
  const fromRgb = (c) => (c && 'r' in c ? rgbToHex(c.r, c.g, c.b) : null);

  // --- Les réglages ---
  // name : nom affiché ; fields : la fenêtre de réglage (voir dialogs.js) ; apply(canvas, v) ;
  // psd : correspondance avec les calques de réglage de Photoshop (lecture et écriture des PSD).

  const TYPES = {
    brightness: {
      name: 'Luminosité / Contraste',
      fields: [
        { key: 'brightness', label: 'Luminosité', type: 'range', min: -150, max: 150, value: 0 },
        { key: 'contrast', label: 'Contraste', type: 'range', min: -50, max: 100, value: 0 },
      ],
      apply: (src, v) => filtered(src, `brightness(${100 + v.brightness / 1.5}%) contrast(${100 + v.contrast}%)`),
      psd: {
        type: 'brightness/contrast',
        to: (v) => ({ brightness: v.brightness, contrast: v.contrast, meanValue: 127, useLegacy: false }),
        from: (a) => ({ brightness: a.brightness ?? 0, contrast: a.contrast ?? 0 }),
      },
    },
    levels: {
      name: 'Niveaux',
      fields: [
        { type: 'info', text: 'Noir et blanc d\'entrée : les tons plus sombres / plus clairs deviennent du noir / blanc pur. Gamma : éclaircit (> 1) ou assombrit (< 1) les tons moyens.' },
        { key: 'inBlack', label: 'Noir d\'entrée', type: 'range', min: 0, max: 253, value: 0 },
        { key: 'gamma', label: 'Gamma', type: 'range', min: 0.1, max: 9.99, step: 0.01, value: 1 },
        { key: 'inWhite', label: 'Blanc d\'entrée', type: 'range', min: 2, max: 255, value: 255 },
        { key: 'outBlack', label: 'Noir de sortie', type: 'range', min: 0, max: 255, value: 0 },
        { key: 'outWhite', label: 'Blanc de sortie', type: 'range', min: 0, max: 255, value: 255 },
      ],
      apply(src, v) {
        const lo = Math.min(v.inBlack, v.inWhite - 1), hi = Math.max(v.inWhite, lo + 1);
        return withTable(src, table((i) => v.outBlack + Math.pow(Math.min(1, Math.max(0, (i - lo) / (hi - lo))), 1 / v.gamma) * (v.outWhite - v.outBlack)));
      },
      psd: {
        type: 'levels',
        to: (v) => ({ rgb: { shadowInput: v.inBlack, highlightInput: v.inWhite, shadowOutput: v.outBlack, highlightOutput: v.outWhite, midtoneInput: v.gamma } }),
        from: (a) => {
          const c = a.rgb || {};
          return { inBlack: c.shadowInput ?? 0, inWhite: c.highlightInput ?? 255, outBlack: c.shadowOutput ?? 0, outWhite: c.highlightOutput ?? 255, gamma: c.midtoneInput ?? 1 };
        },
      },
    },
    hueSat: {
      name: 'Teinte / Saturation',
      fields: [
        { key: 'hue', label: 'Teinte', type: 'range', min: -180, max: 180, value: 0, unit: '°' },
        { key: 'saturation', label: 'Saturation', type: 'range', min: -100, max: 100, value: 0 },
        { key: 'lightness', label: 'Luminosité', type: 'range', min: -100, max: 100, value: 0 },
      ],
      apply(src, v) {
        const out = filtered(src, `hue-rotate(${v.hue}deg) saturate(${100 + v.saturation}%)`);
        if (v.lightness) {
          // Éclaircir = mélanger avec du blanc, assombrir = avec du noir (seulement là où il y a des pixels).
          const g = out.getContext('2d');
          g.globalCompositeOperation = 'source-atop';
          g.globalAlpha = Math.abs(v.lightness) / 100;
          g.fillStyle = v.lightness > 0 ? '#fff' : '#000';
          g.fillRect(0, 0, out.width, out.height);
        }
        return out;
      },
      psd: {
        type: 'hue/saturation',
        to: (v) => {
          // Photoshop range aussi six gammes de couleurs, chacune avec ses bornes ; on les laisse neutres.
          const ranges = { reds: [315, 345, 15, 45], yellows: [15, 45, 75, 105], greens: [75, 105, 135, 165], cyans: [135, 165, 195, 225], blues: [195, 225, 255, 285], magentas: [255, 285, 315, 345] };
          const out = { master: { a: 0, b: 0, c: 0, d: 0, hue: v.hue, saturation: v.saturation, lightness: v.lightness } };
          for (const [k, [a, b, c, d]] of Object.entries(ranges)) out[k] = { a, b, c, d, hue: 0, saturation: 0, lightness: 0 };
          return out;
        },
        from: (a) => ({ hue: a.master?.hue ?? 0, saturation: a.master?.saturation ?? 0, lightness: a.master?.lightness ?? 0 }),
      },
    },
    exposure: {
      name: 'Exposition',
      fields: [
        { key: 'exposure', label: 'Exposition', type: 'range', min: -5, max: 5, step: 0.05, value: 0, unit: 'IL' },
        { key: 'offset', label: 'Décalage', type: 'range', min: -0.5, max: 0.5, step: 0.01, value: 0 },
        { key: 'gamma', label: 'Gamma', type: 'range', min: 0.1, max: 9.99, step: 0.01, value: 1 },
      ],
      apply(src, v) {
        const k = Math.pow(2, v.exposure);
        return withTable(src, table((i) => { const y = (i / 255) * k + v.offset; return y <= 0 ? 0 : Math.pow(y, 1 / v.gamma) * 255; }));
      },
      psd: {
        type: 'exposure',
        to: (v) => ({ exposure: v.exposure, offset: v.offset, gamma: v.gamma }),
        from: (a) => ({ exposure: a.exposure ?? 0, offset: a.offset ?? 0, gamma: a.gamma ?? 1 }),
      },
    },
    vibrance: {
      name: 'Vibrance',
      fields: [
        { type: 'info', text: 'La vibrance sature davantage les couleurs ternes que celles déjà vives (les tons chair restent naturels).' },
        { key: 'vibrance', label: 'Vibrance', type: 'range', min: -100, max: 100, value: 0 },
        { key: 'saturation', label: 'Saturation', type: 'range', min: -100, max: 100, value: 0 },
      ],
      apply(src, v) {
        const vib = v.vibrance / 100, sat = v.saturation / 100;
        return perPixel(src, (r, g, b) => {
          const max = Math.max(r, g, b), avg = (r + g + b) / 3;
          const amount = vib * (1 - (max - Math.min(r, g, b)) / 255) + sat;
          return [r + (r - avg) * amount, g + (g - avg) * amount, b + (b - avg) * amount];
        });
      },
      psd: {
        type: 'vibrance',
        to: (v) => ({ vibrance: v.vibrance, saturation: v.saturation }),
        from: (a) => ({ vibrance: a.vibrance ?? 0, saturation: a.saturation ?? 0 }),
      },
    },
    blackWhite: {
      name: 'Noir et blanc',
      fields: [],
      apply: (src) => filtered(src, 'grayscale(100%)'),
      psd: {
        type: 'black & white',
        to: () => ({ reds: 40, yellows: 60, greens: 40, cyans: 60, blues: 20, magentas: 80, useTint: false }),
        from: () => ({}),
      },
    },
    photoFilter: {
      name: 'Filtre photo',
      fields: [
        { key: 'color', label: 'Couleur du filtre', type: 'color', value: '#ec8a00' },
        { key: 'density', label: 'Densité', type: 'range', min: 1, max: 100, value: 25, unit: '%' },
        { key: 'preserve', label: 'Garder la luminosité', type: 'checkbox', value: true },
      ],
      apply(src, v) {
        // Comme un filtre coloré devant l'objectif : on multiplie par la couleur…
        const out = cloneCanvas(src);
        const g = out.getContext('2d');
        g.globalAlpha = v.density / 100;
        g.globalCompositeOperation = 'multiply';
        g.fillStyle = v.color;
        g.fillRect(0, 0, out.width, out.height);
        // … puis on remet la luminosité d'origine si demandé.
        if (v.preserve) { g.globalAlpha = 1; g.globalCompositeOperation = 'luminosity'; g.drawImage(src, 0, 0); }
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'destination-in';
        g.drawImage(src, 0, 0);
        return out;
      },
      psd: {
        type: 'photo filter',
        to: (v) => ({ color: toRgb(v.color), density: v.density, preserveLuminosity: v.preserve }),
        from: (a) => ({ color: fromRgb(a.color) || '#ec8a00', density: a.density ?? 25, preserve: a.preserveLuminosity ?? true }),
      },
    },
    invert: {
      name: 'Négatif (inverser)',
      fields: [],
      apply: (src) => filtered(src, 'invert(100%)'),
      psd: { type: 'invert', to: () => ({}), from: () => ({}) },
    },
    threshold: {
      name: 'Seuil',
      fields: [{ key: 'level', label: 'Seuil', type: 'range', min: 1, max: 255, value: 128 }],
      apply: (src, v) => perPixel(src, (r, g, b) => { const y = 0.299 * r + 0.587 * g + 0.114 * b >= v.level ? 255 : 0; return [y, y, y]; }),
      psd: { type: 'threshold', to: (v) => ({ level: v.level }), from: (a) => ({ level: a.level ?? 128 }) },
    },
    posterize: {
      name: 'Isohélie (postériser)',
      fields: [{ key: 'levels', label: 'Niveaux', type: 'range', min: 2, max: 64, value: 4 }],
      apply(src, v) {
        const n = Math.max(2, v.levels) - 1;
        return withTable(src, table((i) => Math.round(Math.round((i / 255) * n) / n * 255)));
      },
      psd: { type: 'posterize', to: (v) => ({ levels: v.levels }), from: (a) => ({ levels: a.levels ?? 4 }) },
    },
  };

  // --- Les remplissages ---

  const FILLS = {
    color: {
      name: 'Couleur unie',
      fields: () => [{ key: 'color', label: 'Couleur', type: 'color', value: App.colors.primary }],
      render(g, w, h, v) { g.fillStyle = v.color; g.fillRect(0, 0, w, h); },
    },
    gradient: {
      name: 'Dégradé',
      fields: () => [
        { key: 'from', label: 'Couleur de départ', type: 'color', value: App.colors.primary },
        { key: 'to', label: 'Couleur d\'arrivée', type: 'color', value: App.colors.secondary },
        { key: 'transparent', label: 'Arrivée transparente', type: 'checkbox', value: false },
        { key: 'style', label: 'Style', type: 'select', value: 'linear', choices: [['linear', 'Linéaire'], ['radial', 'Radial']] },
        { key: 'angle', label: 'Angle', type: 'range', min: -180, max: 180, value: 90, unit: '°' },
        { key: 'scale', label: 'Échelle', type: 'range', min: 10, max: 150, value: 100, unit: '%' },
        { key: 'reverse', label: 'Inverser', type: 'checkbox', value: false },
      ],
      render(g, w, h, v) {
        // Comme Photoshop : 90° = du bas vers le haut, 0° = de gauche à droite.
        const a = (v.angle * Math.PI) / 180, k = v.scale / 100;
        const cx = w / 2, cy = h / 2;
        let grad;
        if (v.style === 'radial') grad = g.createRadialGradient(cx, cy, 0, cx, cy, (Math.hypot(w, h) / 2) * k);
        else {
          const half = ((Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a))) / 2) * k;
          const dx = Math.cos(a) * half, dy = -Math.sin(a) * half;
          grad = g.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
        }
        const [r, gg, b] = hexToRgb(v.to);
        let stops = [v.from, v.transparent ? `rgba(${r},${gg},${b},0)` : v.to];
        if (v.transparent && v.reverse) { const [r0, g0, b0] = hexToRgb(v.from); stops = [`rgba(${r0},${g0},${b0},0)`, v.to]; } else if (v.reverse) stops.reverse();
        grad.addColorStop(0, stops[0]);
        grad.addColorStop(1, stops[1]);
        g.fillStyle = grad;
        g.fillRect(0, 0, w, h);
      },
    },
  };

  const isSpecial = (layer) => !!(layer && (layer.fill || layer.adjust));
  const definition = (layer) => (layer.fill ? FILLS[layer.fill.type] : TYPES[layer.adjust.type]);
  const fieldsOf = (def) => (typeof def.fields === 'function' ? def.fields() : def.fields);
  const defaults = (fields) => Object.fromEntries(fields.filter((f) => f.key).map((f) => [f.key, f.value]));

  // Le remplissage, à la taille du document (gardé en cache tant que ses réglages ne changent pas).
  const fillCache = new WeakMap();
  function fillCanvas(doc, fill) {
    const cached = fillCache.get(fill);
    if (cached && cached.width === doc.width && cached.height === doc.height) return cached;
    const c = newCanvas(doc.width, doc.height);
    FILLS[fill.type].render(c.getContext('2d'), c.width, c.height, fill.values);
    fillCache.set(fill, c);
    return c;
  }

  // Appelé par composite() (doc.js) pour un calque spécial. « below » = l'image des calques du dessous.
  // ctx a déjà l'opacité et le mode de fusion du calque.
  function drawLayer(doc, ctx, below, layer, look) {
    let piece;
    if (layer.fill) piece = cloneCanvas(fillCanvas(doc, layer.fill));
    else piece = TYPES[layer.adjust.type].apply(below, layer.adjust.values);
    // Le masque : l'effet ne reste que là où le canvas du calque est opaque.
    const g = piece.getContext('2d');
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(look.canvas, look.x, look.y);
    ctx.drawImage(piece, 0, 0);
  }

  // Masque blanc de départ : toute l'image, ou la sélection.
  function startMask(doc) {
    if (doc.selection) return Sel.toFull(doc, doc.selection);
    const mask = newCanvas(doc.width, doc.height);
    const g = mask.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, mask.width, mask.height);
    return mask;
  }

  // La fenêtre de réglage, avec aperçu en direct. Renvoie true si on a validé.
  async function settingsDialog(doc, layer, kind, type, def) {
    let frame = null;
    const set = (v) => {
      layer[kind] = { type, values: v };
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => View.request(true));
    };
    const fields = fieldsOf(def).map((f) => (f.key && layer[kind].values[f.key] !== undefined ? { ...f, value: layer[kind].values[f.key] } : f));
    if (!fields.some((f) => f.key)) return true; // rien à régler (noir et blanc, négatif)
    const values = await Dialogs.form({
      title: def.name,
      fields,
      okLabel: 'OK',
      onInput: (v) => set(v),
    });
    cancelAnimationFrame(frame);
    if (!values) return false;
    layer[kind] = { type, values };
    return true;
  }

  // Ajoute un calque de remplissage (kind = 'fill') ou de réglage ('adjust') au-dessus du calque actif.
  async function add(kind, type) {
    const doc = App.doc();
    if (!doc) return notify('Ouvre ou crée d\'abord une image.', 'warning');
    const def = kind === 'fill' ? FILLS[type] : TYPES[type];
    const snap = snapshot(doc, def.name);
    const layer = createLayer(def.name, startMask(doc), { [kind]: { type, values: defaults(fieldsOf(def)) } });
    const index = doc.layers.findIndex((l) => l.id === doc.activeId);
    doc.layers.splice(index + 1, 0, layer);
    doc.activeId = layer.id;
    App.refresh();
    if (!(await settingsDialog(doc, layer, kind, type, def))) {
      restore(doc, snap);
      return App.refresh();
    }
    commit(doc, snap);
  }

  // Double-clic sur la vignette : régler à nouveau.
  async function edit(layer) {
    const doc = App.doc();
    if (!doc || !isSpecial(layer)) return;
    const kind = layer.fill ? 'fill' : 'adjust';
    const { type } = layer[kind];
    const def = definition(layer);
    const snap = snapshot(doc, `Modifier : ${def.name}`);
    const before = layer[kind];
    if (!(await settingsDialog(doc, layer, kind, type, def))) {
      layer[kind] = before;
      return View.request(true);
    }
    if (JSON.stringify(layer[kind].values) !== JSON.stringify(before.values)) commit(doc, snap);
    else View.request(true);
  }

  // Transforme le calque en calque de pixels ordinaire (le remplissage, découpé par son masque).
  function rasterize(doc, layer) {
    if (!layer.fill) return;
    const c = cloneCanvas(fillCanvas(doc, layer.fill));
    const g = c.getContext('2d');
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(layer.canvas, layer.x, layer.y);
    layer.fill = null;
    replacePixels(layer, c, 0, 0);
  }

  // --- PSD ---
  // Un calque de réglage de Photoshop → réglage de Skald (ou null si Skald ne le connaît pas).
  function fromPsd(adjustment) {
    const entry = Object.entries(TYPES).find(([, t]) => t.psd.type === adjustment?.type);
    if (!entry) return null;
    const [type, t] = entry;
    return { type, values: { ...defaults(t.fields), ...t.psd.from(adjustment) } };
  }
  const toPsd = (adjust) => { const t = TYPES[adjust.type]; return { type: t.psd.type, ...t.psd.to(adjust.values) }; };

  // Masque au format Photoshop : niveaux de gris (blanc = visible), à partir de l'opacité du canvas.
  function psdMask(layer) {
    const { width, height } = layer.canvas;
    const img = layer.canvas.getContext('2d').getImageData(0, 0, width, height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) { d[i] = d[i + 1] = d[i + 2] = d[i + 3]; d[i + 3] = 255; }
    const c = newCanvas(width, height);
    c.getContext('2d').putImageData(img, 0, 0);
    return { canvas: c, left: layer.x, top: layer.y, right: layer.x + width, bottom: layer.y + height, defaultColor: 0 };
  }
  // Et l'inverse : un masque Photoshop (gris) → canvas dont l'opacité vaut le gris.
  function maskFromPsd(doc, mask) {
    const full = newCanvas(doc.width, doc.height);
    const g = full.getContext('2d');
    g.fillStyle = `rgba(255,255,255,${(mask?.defaultColor ?? 255) / 255})`;
    g.fillRect(0, 0, full.width, full.height);
    if (mask?.canvas) {
      const { width, height } = mask.canvas;
      const img = mask.canvas.getContext('2d').getImageData(0, 0, width, height);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) { d[i + 3] = d[i]; d[i] = d[i + 1] = d[i + 2] = 255; }
      const piece = newCanvas(width, height);
      piece.getContext('2d').putImageData(img, 0, 0);
      g.clearRect(mask.left ?? 0, mask.top ?? 0, width, height);
      g.drawImage(piece, mask.left ?? 0, mask.top ?? 0);
    }
    return full;
  }

  // Les menus « Nouveau calque de remplissage / de réglage ».
  const menuItems = () => [
    ...Object.entries(FILLS).map(([type, f]) => [`Remplissage : ${f.name}…`, '', () => add('fill', type)]),
    '-',
    ...Object.entries(TYPES).map(([type, t]) => [`${t.name}${t.fields.some((f) => f.key) ? '…' : ''}`, '', () => add('adjust', type)]),
  ];

  return { TYPES, FILLS, isSpecial, definition, drawLayer, fillCanvas, add, edit, rasterize, fromPsd, toPsd, psdMask, maskFromPsd, menuItems };
})();
