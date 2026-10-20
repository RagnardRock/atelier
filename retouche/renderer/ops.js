// Les opérations des menus : réglages de couleur, effets pour logos, taille de l'image,
// rotation, opérations sur les calques, presse-papiers.
// Chacune passe par change() (doc.js) pour pouvoir être annulée avec Ctrl+Z.

const Ops = (() => {
  const needDoc = () => {
    const doc = App.doc();
    if (!doc) notify('Ouvre ou crée d\'abord une image.', 'warning');
    return doc;
  };
  const needLayer = () => {
    const doc = needDoc();
    const layer = doc && activeLayer(doc);
    if (doc && !layer) notify('Choisis d\'abord un calque.', 'warning');
    return layer ? { doc, layer } : {};
  };
  // Pour les opérations qui retouchent des pixels : pas sur un calque de remplissage ou de réglage.
  const needPixels = () => {
    const found = needLayer();
    if (Adjust.isSpecial(found.layer)) {
      notify('Ce calque est un calque de réglage ou de remplissage : il n\'a pas de pixels à retoucher. Double-clique sur sa vignette pour changer ses réglages, ou choisis un autre calque.', 'warning', 6000);
      return {};
    }
    return found;
  };

  // Canvas passé au travers d'un filtre CSS (luminosité, flou…), même taille.
  function filtered(src, filter) {
    const out = newCanvas(src.width, src.height);
    const g = out.getContext('2d');
    g.filter = filter;
    g.drawImage(src, 0, 0);
    return out;
  }

  // Si une sélection existe, le réglage ne touche que l'intérieur de la sélection.
  function limitToSelection(doc, layer, src, result) {
    if (!doc.selection || result.dx || result.dy || result.canvas.width !== src.width || result.canvas.height !== src.height) return result;
    return { canvas: Sel.within(src, result.canvas, doc.selection, layer.x, layer.y) };
  }

  // Réglage avec aperçu en direct : la fenêtre s'ouvre, chaque curseur bougé recalcule l'aperçu,
  // « Appliquer » le rend définitif (et annulable), « Annuler » remet tout comme avant.
  async function adjust(title, fields, apply) {
    const { doc, layer } = needPixels();
    if (!layer) return;
    const src = layer.canvas;
    let timer = null;
    const run = (v) => limitToSelection(doc, layer, src, apply(src, v, layer));
    const values = await Dialogs.form({
      title,
      fields,
      okLabel: 'Appliquer',
      onInput(v) {
        clearTimeout(timer);
        timer = setTimeout(() => {
          const r = run(v);
          doc.preview = { layerId: layer.id, canvas: r.canvas, x: layer.x + (r.dx || 0), y: layer.y + (r.dy || 0) };
          View.request(true);
        }, 25);
      },
    });
    clearTimeout(timer);
    doc.preview = null;
    if (!values) return View.request(true);
    change(doc, title, () => {
      const r = run(values);
      replacePixels(layer, r.canvas, layer.x + (r.dx || 0), layer.y + (r.dy || 0));
    });
  }

  // Réglage sans fenêtre (noir et blanc, inverser…).
  function instant(title, apply) {
    const { doc, layer } = needPixels();
    if (!layer) return;
    change(doc, title, () => {
      const r = limitToSelection(doc, layer, layer.canvas, apply(layer.canvas));
      replacePixels(layer, r.canvas);
    });
  }

  // --- Réglages ---

  const colors = () => adjust('Luminosité, contraste et couleurs', [
    { key: 'brightness', label: 'Luminosité', type: 'range', min: -100, max: 100, value: 0 },
    { key: 'contrast', label: 'Contraste', type: 'range', min: -100, max: 100, value: 0 },
    { key: 'saturation', label: 'Saturation', type: 'range', min: -100, max: 100, value: 0 },
    { key: 'hue', label: 'Teinte', type: 'range', min: -180, max: 180, value: 0, unit: '°' },
  ], (src, v) => ({ canvas: filtered(src, `brightness(${100 + v.brightness}%) contrast(${100 + v.contrast}%) saturate(${100 + v.saturation}%) hue-rotate(${v.hue}deg)`) }));

  // Niveaux, exposition, vibrance : les mêmes calculs que les calques de réglage (adjustments.js),
  // mais appliqués directement aux pixels du calque.
  const levels = () => adjust('Niveaux', Adjust.TYPES.levels.fields, (src, v) => ({ canvas: Adjust.TYPES.levels.apply(src, v) }));
  const exposure = () => adjust('Exposition et vibrance', [
    ...Adjust.TYPES.exposure.fields,
    ...Adjust.TYPES.vibrance.fields.filter((f) => f.key),
  ], (src, v) => ({ canvas: Adjust.TYPES.vibrance.apply(Adjust.TYPES.exposure.apply(src, v), v) }));

  const blur = () => adjust('Flou', [
    { key: 'radius', label: 'Rayon', type: 'range', min: 0, max: 100, step: 0.5, value: 4, unit: 'px' },
  ], (src, v) => ({ canvas: filtered(src, `blur(${v.radius}px)`) }));

  // Netteté (« masque flou ») : on accentue la différence entre l'image et sa version floue.
  const sharpen = () => adjust('Netteté', [
    { key: 'amount', label: 'Intensité', type: 'range', min: 0, max: 300, value: 80, unit: '%' },
    { key: 'radius', label: 'Rayon', type: 'range', min: 0.5, max: 10, step: 0.5, value: 1.5, unit: 'px' },
  ], (src, v) => {
    const { width, height } = src;
    const base = src.getContext('2d').getImageData(0, 0, width, height);
    const soft = filtered(src, `blur(${v.radius}px)`).getContext('2d').getImageData(0, 0, width, height).data;
    const d = base.data, k = v.amount / 100;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = d[i] + (d[i] - soft[i]) * k;
      d[i + 1] = d[i + 1] + (d[i + 1] - soft[i + 1]) * k;
      d[i + 2] = d[i + 2] + (d[i + 2] - soft[i + 2]) * k;
    }
    const out = newCanvas(width, height);
    out.getContext('2d').putImageData(base, 0, 0);
    return { canvas: out };
  });

  const grayscale = () => instant('Noir et blanc', (src) => ({ canvas: filtered(src, 'grayscale(100%)') }));
  const invert = () => instant('Inverser les couleurs', (src) => ({ canvas: filtered(src, 'invert(100%)') }));

  // --- Pour les logos ---

  // Rend transparente une couleur de fond (souvent le blanc d'un logo en JPG).
  // « Adoucir » donne un bord progressif ; les pixels à moitié transparents sont « décontaminés »
  // (on leur retire la couleur du fond) pour éviter le liseré blanc sur fond sombre.
  function removeColor() {
    const { layer } = needLayer();
    if (!layer) return;
    const [r0, g0, b0] = layer.canvas.getContext('2d').getImageData(0, 0, 1, 1).data;
    return adjust('Rendre une couleur transparente', [
      { key: 'info', type: 'info', text: 'Par défaut, la couleur du coin en haut à gauche. Clique sur la pastille pour en choisir une autre.' },
      { key: 'color', label: 'Couleur à retirer', type: 'color', value: rgbToHex(r0, g0, b0) },
      { key: 'tolerance', label: 'Tolérance', type: 'range', min: 0, max: 100, value: 12, unit: '%' },
      { key: 'softness', label: 'Adoucir le bord', type: 'range', min: 0, max: 100, value: 10, unit: '%' },
      { key: 'edges', label: 'Seulement le fond relié aux bords (garde l\'intérieur du logo)', type: 'checkbox', value: true },
    ], (src, v) => {
      const { width, height } = src;
      const img = src.getContext('2d').getImageData(0, 0, width, height);
      const d = img.data;
      const [br, bg, bb] = hexToRgb(v.color);
      const tol = (v.tolerance / 100) * 255, soft = Math.max(1, (v.softness / 100) * 255);
      const dist = (i) => Math.max(Math.abs(d[i] - br), Math.abs(d[i + 1] - bg), Math.abs(d[i + 2] - bb));
      let touched = null;
      if (v.edges) {
        // On part de tous les pixels du bord et on avance tant que la couleur est proche.
        touched = new Uint8Array(width * height);
        const stack = [];
        const push = (x, y) => { const p = y * width + x; if (!touched[p] && dist(p * 4) < tol + soft) { touched[p] = 1; stack.push(p); } };
        for (let x = 0; x < width; x++) { push(x, 0); push(x, height - 1); }
        for (let y = 0; y < height; y++) { push(0, y); push(width - 1, y); }
        while (stack.length) {
          const p = stack.pop(), x = p % width, y = (p / width) | 0;
          if (x > 0) push(x - 1, y);
          if (x < width - 1) push(x + 1, y);
          if (y > 0) push(x, y - 1);
          if (y < height - 1) push(x, y + 1);
        }
      }
      for (let p = 0; p < width * height; p++) {
        if (touched && !touched[p]) continue;
        const i = p * 4;
        const dd = dist(i);
        if (dd >= tol + soft) continue;
        const keep = dd <= tol ? 0 : (dd - tol) / soft; // part de la couleur gardée (0 = transparent)
        if (keep > 0) {
          d[i] = Math.min(255, Math.max(0, (d[i] - br * (1 - keep)) / keep));
          d[i + 1] = Math.min(255, Math.max(0, (d[i + 1] - bg * (1 - keep)) / keep));
          d[i + 2] = Math.min(255, Math.max(0, (d[i + 2] - bb * (1 - keep)) / keep));
        }
        d[i + 3] = d[i + 3] * keep;
      }
      const out = newCanvas(width, height);
      out.getContext('2d').putImageData(img, 0, 0);
      return { canvas: out };
    });
  }

  // Une seule couleur en gardant la forme : pratique pour décliner un logo en blanc, noir…
  const recolor = () => adjust('Teinte unie (recolorer)', [
    { key: 'color', label: 'Couleur', type: 'color', value: App.colors.primary },
    { key: 'strength', label: 'Intensité', type: 'range', min: 0, max: 100, value: 100, unit: '%' },
  ], (src, v) => {
    const out = cloneCanvas(src);
    const g = out.getContext('2d');
    g.globalAlpha = v.strength / 100;
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = v.color;
    g.fillRect(0, 0, out.width, out.height);
    return { canvas: out };
  });

  // Contour autour de la forme : on dessine la forme décalée tout autour, en une couleur, dessous.
  const outline = () => adjust('Contour', [
    { key: 'color', label: 'Couleur', type: 'color', value: App.colors.secondary },
    { key: 'width', label: 'Épaisseur', type: 'range', min: 1, max: 100, value: 6, unit: 'px' },
    { key: 'opacity', label: 'Opacité', type: 'range', min: 1, max: 100, value: 100, unit: '%' },
  ], (src, v) => {
    const w = Math.round(v.width);
    const ring = newCanvas(src.width + w * 2, src.height + w * 2);
    const g = ring.getContext('2d');
    const steps = Math.max(16, Math.ceil(w * 3));
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      g.drawImage(src, w + Math.cos(a) * w, w + Math.sin(a) * w);
    }
    g.drawImage(src, w, w);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = v.color;
    g.fillRect(0, 0, ring.width, ring.height);
    const out = newCanvas(ring.width, ring.height);
    const o = out.getContext('2d');
    o.globalAlpha = v.opacity / 100;
    o.drawImage(ring, 0, 0);
    o.globalAlpha = 1;
    o.drawImage(src, w, w);
    return { canvas: out, dx: -w, dy: -w };
  });

  const shadow = () => adjust('Ombre portée', [
    { key: 'color', label: 'Couleur', type: 'color', value: '#000000' },
    { key: 'opacity', label: 'Opacité', type: 'range', min: 0, max: 100, value: 55, unit: '%' },
    { key: 'distance', label: 'Distance', type: 'range', min: 0, max: 200, value: 12, unit: 'px' },
    { key: 'angle', label: 'Angle', type: 'range', min: -180, max: 180, value: 120, unit: '°' },
    { key: 'blur', label: 'Flou', type: 'range', min: 0, max: 150, value: 18, unit: 'px' },
  ], (src, v) => {
    // Angle à la Photoshop : la lumière vient de cet angle, l'ombre part à l'opposé.
    const a = (v.angle * Math.PI) / 180;
    const ox = Math.round(-Math.cos(a) * v.distance), oy = Math.round(Math.sin(a) * v.distance);
    const m = Math.ceil(v.blur * 2 + v.distance);
    const out = newCanvas(src.width + m * 2, src.height + m * 2);
    const g = out.getContext('2d');
    const [r, gr, b] = hexToRgb(v.color);
    g.shadowColor = `rgba(${r},${gr},${b},${v.opacity / 100})`;
    g.shadowBlur = v.blur;
    g.shadowOffsetX = ox;
    g.shadowOffsetY = oy;
    g.drawImage(src, m, m);
    return { canvas: out, dx: -m, dy: -m };
  });

  // --- Image entière ---

  // Redimensionnement de bonne qualité : pour une forte réduction, on divise par deux
  // plusieurs fois de suite (sinon l'image devient granuleuse).
  function resample(src, width, height) {
    let current = src;
    width = Math.max(1, Math.round(width));
    height = Math.max(1, Math.round(height));
    while (current.width / 2 >= width && current.height / 2 >= height) {
      const half = newCanvas(current.width / 2, current.height / 2);
      const g = half.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(current, 0, 0, half.width, half.height);
      current = half;
    }
    const out = newCanvas(width, height);
    const g = out.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(current, 0, 0, width, height);
    return out;
  }

  function scaleDocument(doc, width, height) {
    const sx = width / doc.width, sy = height / doc.height;
    for (const layer of doc.layers) {
      const text = layer.text;
      replacePixels(layer, resample(layer.canvas, layer.canvas.width * sx, layer.canvas.height * sy), layer.x * sx, layer.y * sy);
      // Un texte agrandi uniformément reste modifiable, avec sa nouvelle taille.
      if (text && Math.abs(sx - sy) < 0.001) layer.text = { ...text, size: Math.round(text.size * sx * 10) / 10, letterSpacing: (text.letterSpacing || 0) * sx };
    }
    doc.width = Math.round(width);
    doc.height = Math.round(height);
    doc.selection = null;
  }

  async function imageSize() {
    const doc = needDoc();
    if (!doc) return;
    const ratio = doc.width / doc.height;
    const v = await Dialogs.form({
      title: 'Taille de l\'image',
      okLabel: 'Redimensionner',
      fields: [
        { key: 'info', type: 'info', text: `Taille actuelle : ${doc.width} × ${doc.height} px. Tous les calques sont redimensionnés.` },
        { key: 'percent', label: 'Échelle', type: 'number', value: 100, min: 1, max: 1000, step: 'any', unit: '%' },
        { key: 'width', label: 'Largeur', type: 'number', value: doc.width, min: 1, max: 30000, unit: 'px' },
        { key: 'height', label: 'Hauteur', type: 'number', value: doc.height, min: 1, max: 30000, unit: 'px' },
        { key: 'lock', label: 'Garder les proportions', type: 'checkbox', value: true },
      ],
      onInput(values, f) {
        // Les trois champs restent cohérents : on recalcule les autres à partir de celui modifié.
        const changed = document.activeElement?.name;
        if (changed === 'percent') {
          f.inputs.width.input.value = Math.round((doc.width * values.percent) / 100);
          f.inputs.height.input.value = Math.round((doc.height * values.percent) / 100);
        } else if (values.lock && changed === 'width') {
          f.inputs.height.input.value = Math.round(values.width / ratio);
          f.inputs.percent.input.value = Math.round((values.width / doc.width) * 1000) / 10;
        } else if (values.lock && changed === 'height') {
          f.inputs.width.input.value = Math.round(values.height * ratio);
          f.inputs.percent.input.value = Math.round((values.height / doc.height) * 1000) / 10;
        }
      },
    });
    if (!v || (v.width === doc.width && v.height === doc.height)) return;
    change(doc, 'Taille de l\'image', (d) => scaleDocument(d, v.width, v.height));
    View.fit(doc);
  }

  // Ancres de « Taille de la zone de travail » : où reste l'image quand on agrandit.
  const ANCHORS = [['tl', 'En haut à gauche'], ['t', 'En haut'], ['tr', 'En haut à droite'], ['l', 'À gauche'], ['c', 'Au centre'], ['r', 'À droite'], ['bl', 'En bas à gauche'], ['b', 'En bas'], ['br', 'En bas à droite']];
  async function canvasSize() {
    const doc = needDoc();
    if (!doc) return;
    const v = await Dialogs.form({
      title: 'Taille de la zone de travail',
      okLabel: 'Appliquer',
      fields: [
        { key: 'info', type: 'info', text: `Ajoute ou retire de l'espace autour de l'image, sans la redimensionner. Actuellement ${doc.width} × ${doc.height} px.` },
        { key: 'width', label: 'Largeur', type: 'number', value: doc.width, min: 1, max: 30000, unit: 'px' },
        { key: 'height', label: 'Hauteur', type: 'number', value: doc.height, min: 1, max: 30000, unit: 'px' },
        { key: 'anchor', label: 'Image placée', type: 'select', value: 'c', choices: ANCHORS },
      ],
    });
    if (!v || (v.width === doc.width && v.height === doc.height)) return;
    const dx = v.anchor.includes('l') ? 0 : v.anchor.includes('r') ? v.width - doc.width : Math.round((v.width - doc.width) / 2);
    const dy = v.anchor.startsWith('t') ? 0 : v.anchor.startsWith('b') ? v.height - doc.height : Math.round((v.height - doc.height) / 2);
    change(doc, 'Taille de la zone de travail', (d) => {
      for (const layer of d.layers) { layer.x += dx; layer.y += dy; }
      d.width = v.width;
      d.height = v.height;
      d.selection = null;
    });
    View.fit(doc);
  }

  function transformCanvas(src, kind) {
    const turn = kind === 'cw' || kind === 'ccw';
    const out = newCanvas(turn ? src.height : src.width, turn ? src.width : src.height);
    const g = out.getContext('2d');
    if (kind === 'cw') { g.translate(out.width, 0); g.rotate(Math.PI / 2); }
    if (kind === 'ccw') { g.translate(0, out.height); g.rotate(-Math.PI / 2); }
    if (kind === '180') { g.translate(out.width, out.height); g.rotate(Math.PI); }
    if (kind === 'h') { g.translate(out.width, 0); g.scale(-1, 1); }
    if (kind === 'v') { g.translate(0, out.height); g.scale(1, -1); }
    g.drawImage(src, 0, 0);
    return out;
  }
  const LABELS = { cw: 'Rotation 90° horaire', ccw: 'Rotation 90° antihoraire', '180': 'Rotation 180°', h: 'Miroir horizontal', v: 'Miroir vertical' };

  // Tourner ou retourner toute l'image : chaque calque tourne, et sa position aussi.
  function rotateImage(kind) {
    const doc = needDoc();
    if (!doc) return;
    change(doc, LABELS[kind], (d) => {
      const W = d.width, H = d.height;
      for (const layer of d.layers) {
        const { x, y } = layer, w = layer.canvas.width, h = layer.canvas.height;
        const pos = { cw: [H - (y + h), x], ccw: [y, W - (x + w)], '180': [W - (x + w), H - (y + h)], h: [W - (x + w), y], v: [x, H - (y + h)] }[kind];
        replacePixels(layer, transformCanvas(layer.canvas, kind), pos[0], pos[1]);
      }
      if (kind === 'cw' || kind === 'ccw') { d.width = H; d.height = W; }
      d.selection = null;
    });
    View.fit(doc);
  }

  // Retourner seulement le calque actif, sur place.
  function flipLayer(kind) {
    const { doc, layer } = needLayer();
    if (!layer) return;
    change(doc, `${LABELS[kind]} du calque`, () => replacePixels(layer, transformCanvas(layer.canvas, kind)));
  }

  // Recadrer au plus juste autour de ce qui n'est pas transparent (idéal pour un logo).
  function trim() {
    const doc = needDoc();
    if (!doc) return;
    const b = opaqueBounds(flatten(doc));
    if (!b) return notify('L\'image est entièrement transparente : rien à garder.', 'warning');
    if (b.x === 0 && b.y === 0 && b.w === doc.width && b.h === doc.height) return notify('Il n\'y a pas de bord transparent à retirer.');
    change(doc, 'Rogner le vide', (d) => {
      for (const layer of d.layers) { cropLayerTo(layer, b); layer.x -= b.x; layer.y -= b.y; }
      d.width = b.w;
      d.height = b.h;
      d.selection = null;
    });
    View.fit(doc);
    notify(`Image rognée à ${b.w} × ${b.h} px.`, 'success');
  }

  function cropToSelection() {
    const doc = needDoc();
    if (!doc) return;
    if (!doc.selection) return notify('Fais d\'abord une sélection (outil Sélection, M).', 'warning');
    doc.crop = { ...doc.selection };
    Tools.applyCrop(doc);
  }

  // --- Calques ---

  function insertLayer(doc, layer, label) {
    change(doc, label, (d) => {
      const index = d.layers.findIndex((l) => l.id === d.activeId);
      d.layers.splice(index + 1, 0, layer);
      d.activeId = layer.id;
    });
  }

  function newLayer() {
    const doc = needDoc();
    if (!doc) return;
    const count = doc.layers.length + 1;
    insertLayer(doc, createLayer(`Calque ${count}`, newCanvas(doc.width, doc.height)), 'Nouveau calque');
  }

  function duplicateLayer() {
    const { doc, layer } = needLayer();
    if (!layer) return;
    insertLayer(doc, { ...layer, id: uid(), name: `${layer.name} copie`, text: layer.text && { ...layer.text } }, 'Dupliquer le calque');
  }

  function deleteLayer(id) {
    const doc = needDoc();
    const layer = doc && doc.layers.find((l) => l.id === (id ?? doc.activeId));
    if (!layer) return;
    if (doc.layers.length === 1) return notify('C\'est le dernier calque : une image en garde au moins un.', 'warning');
    change(doc, 'Supprimer le calque', (d) => {
      const index = d.layers.indexOf(layer);
      d.layers.splice(index, 1);
      if (d.activeId === layer.id) d.activeId = d.layers[Math.max(0, index - 1)].id;
    });
  }

  function moveLayer(direction) {
    const { doc, layer } = needLayer();
    if (!layer) return;
    const index = doc.layers.indexOf(layer), target = index + direction;
    if (target < 0 || target >= doc.layers.length) return;
    change(doc, direction > 0 ? 'Monter le calque' : 'Descendre le calque', (d) => {
      d.layers.splice(index, 1);
      d.layers.splice(target, 0, layer);
    });
  }

  // Fusionne deux calques (le haut posé sur le bas, avec son opacité et son mode).
  function mergeInto(lower, upper) {
    const left = Math.min(lower.x, upper.x), top = Math.min(lower.y, upper.y);
    const right = Math.max(lower.x + lower.canvas.width, upper.x + upper.canvas.width);
    const bottom = Math.max(lower.y + lower.canvas.height, upper.y + upper.canvas.height);
    const out = newCanvas(right - left, bottom - top);
    const g = out.getContext('2d');
    if (lower.visible) g.drawImage(lower.canvas, lower.x - left, lower.y - top);
    if (upper.visible) {
      g.globalAlpha = upper.opacity;
      g.globalCompositeOperation = upper.blend;
      g.drawImage(upper.canvas, upper.x - left, upper.y - top);
    }
    replacePixels(lower, out, left, top);
  }

  function mergeDown() {
    const { doc, layer } = needLayer();
    if (!layer) return;
    const index = doc.layers.indexOf(layer);
    if (index === 0) return notify('Il n\'y a pas de calque en dessous.', 'warning');
    const lower = doc.layers[index - 1];
    if (Adjust.isSpecial(lower)) return notify('Le calque du dessous est un calque de réglage ou de remplissage : on ne peut pas fusionner dedans.', 'warning', 5000);
    change(doc, 'Fusionner avec le calque inférieur', (d) => {
      // Un calque de réglage ou de remplissage s'applique pour de bon au calque du dessous.
      if (Adjust.isSpecial(layer)) {
        const merged = composite({ ...d, layers: [{ ...lower, opacity: 1, blend: 'source-over' }, layer], preview: null, stroke: null, float: null, live: null }, newCanvas(d.width, d.height));
        replacePixels(lower, merged, 0, 0);
      } else mergeInto(lower, layer);
      d.layers.splice(index, 1);
      d.activeId = lower.id;
    });
  }

  // Calque de remplissage → calque de pixels ordinaire (pour le retoucher au pinceau, aux filtres…).
  function rasterizeLayer() {
    const { doc, layer } = needLayer();
    if (!layer) return;
    if (!layer.fill) return notify(layer.adjust ? 'Un calque de réglage n\'a pas de pixels : fusionne-le plutôt avec le calque du dessous (Ctrl+E).' : 'Ce calque est déjà un calque de pixels.', 'info', 5000);
    change(doc, 'Pixelliser le calque', () => Adjust.rasterize(doc, layer));
  }

  function flattenImage() {
    const doc = needDoc();
    if (!doc || doc.layers.length < 2) return;
    change(doc, 'Aplatir l\'image', (d) => {
      const merged = createLayer('Fond', flatten(d));
      d.layers = [merged];
      d.activeId = merged.id;
    });
  }

  // Centrer le calque dans l'image (sur sa partie visible, pas son cadre vide).
  function centerLayer(axis) {
    const { doc, layer } = needLayer();
    if (!layer) return;
    const b = opaqueBounds(layer.canvas);
    if (!b) return;
    change(doc, 'Centrer le calque', () => {
      if (axis !== 'v') layer.x = Math.round((doc.width - b.w) / 2 - b.x);
      if (axis !== 'h') layer.y = Math.round((doc.height - b.h) / 2 - b.y);
    });
  }

  // Transformer le calque : échelle et rotation libres, avec aperçu.
  // Ctrl+T : poignées à la souris sur le calque (tools-extra.js).
  function transformLayer() {
    const doc = needDoc();
    if (doc && Tools.current.id !== 'transform') Tools.byId.transform.start(doc, Tools.current.id);
  }
  // La même chose avec des valeurs précises, dans une fenêtre.
  function transformNumeric() {
    const { layer } = needLayer();
    if (!layer) return;
    return adjust('Transformer le calque', [
      { key: 'scale', label: 'Échelle', type: 'range', min: 1, max: 400, step: 0.5, value: 100, unit: '%' },
      { key: 'rotation', label: 'Rotation', type: 'range', min: -180, max: 180, step: 0.5, value: 0, unit: '°' },
    ], (src, v) => {
      const s = v.scale / 100, a = (v.rotation * Math.PI) / 180;
      const w = src.width * s, h = src.height * s;
      const bw = Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a)), bh = Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a));
      const scaled = Math.abs(s - 1) < 0.001 ? src : resample(src, w, h);
      const out = newCanvas(bw, bh);
      const g = out.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.translate(out.width / 2, out.height / 2);
      g.rotate(a);
      g.drawImage(scaled, -scaled.width / 2, -scaled.height / 2);
      // Le centre du calque ne bouge pas.
      return { canvas: out, dx: Math.round((src.width - out.width) / 2), dy: Math.round((src.height - out.height) / 2) };
    });
  }

  // --- Sélection ---

  function selectAll() {
    const doc = needDoc();
    if (doc) change(doc, 'Tout sélectionner', (d) => { d.selection = Sel.rect(0, 0, d.width, d.height); });
  }
  function invertSelection() {
    const doc = needDoc();
    if (doc) change(doc, 'Intervertir la sélection', (d) => { d.selection = Sel.invert(d, d.selection); });
  }
  // Sélectionner les pixels non transparents du calque actif (Ctrl + clic sur la vignette dans Photoshop).
  function selectLayerPixels() {
    const { doc, layer } = needLayer();
    if (!layer) return;
    const full = newCanvas(doc.width, doc.height);
    full.getContext('2d').drawImage(layer.canvas, layer.x, layer.y);
    change(doc, 'Sélectionner le calque', (d) => { d.selection = Sel.fromMask(full); });
  }
  async function featherSelection() {
    const doc = needDoc();
    if (!doc) return;
    if (!doc.selection) return notify('Fais d\'abord une sélection.', 'warning');
    const v = await Dialogs.form({ title: 'Contour progressif', okLabel: 'Appliquer', fields: [
      { type: 'info', text: 'Adoucit les bords de la sélection : ce que tu peins, effaces ou règles dedans se fond progressivement.' },
      { key: 'radius', label: 'Rayon', type: 'range', min: 0.5, max: 100, step: 0.5, value: 8, unit: 'px' },
    ] });
    if (v) change(doc, 'Contour progressif', (d) => { d.selection = Sel.feather(d, d.selection, v.radius); });
  }
  async function growSelection() {
    const doc = needDoc();
    if (!doc) return;
    if (!doc.selection) return notify('Fais d\'abord une sélection.', 'warning');
    const v = await Dialogs.form({ title: 'Étendre ou réduire la sélection', okLabel: 'Appliquer', fields: [
      { type: 'info', text: 'Un nombre positif agrandit la sélection, un nombre négatif la rétrécit.' },
      { key: 'pixels', label: 'De', type: 'number', min: -200, max: 200, value: 4, unit: 'px' },
    ] });
    if (v && v.pixels) change(doc, v.pixels > 0 ? 'Étendre la sélection' : 'Réduire la sélection', (d) => { d.selection = Sel.grow(d, d.selection, v.pixels); });
  }
  function deselect() {
    const doc = App.doc();
    if (doc?.selection) change(doc, 'Désélectionner', (d) => { d.selection = null; });
  }
  function clearSelection() {
    const { doc, layer } = needLayer();
    if (!layer) return;
    if (!doc.selection) return notify('Rien n\'est sélectionné. Pour supprimer le calque entier, utilise la corbeille du panneau Calques.', 'info');
    change(doc, 'Effacer la sélection', () => Sel.erase(editPixels(layer, doc), doc.selection, layer.x, layer.y));
  }
  function fillSelection() {
    const { doc, layer } = needLayer();
    if (!layer) return;
    const s = doc.selection || Sel.rect(0, 0, doc.width, doc.height);
    change(doc, 'Remplir', () => {
      const g = editPixels(layer, doc, true);
      const color = newCanvas(layer.canvas.width, layer.canvas.height);
      const cg = color.getContext('2d');
      cg.fillStyle = App.colors.primary;
      cg.fillRect(0, 0, color.width, color.height);
      g.drawImage(Sel.clip(color, s, layer.x, layer.y), 0, 0);
    });
  }

  // Pixels de la sélection (ou du calque entier) du calque actif, ou de l'image fusionnée.
  function selectedPixels(doc, merged) {
    const s = doc.selection;
    if (merged) {
      const flat = flatten(doc);
      if (!s) return { canvas: flat, x: 0, y: 0 };
      const piece = newCanvas(s.w, s.h);
      piece.getContext('2d').drawImage(flat, -s.x, -s.y);
      return { canvas: Sel.clip(piece, s, s.x, s.y), x: s.x, y: s.y };
    }
    const layer = activeLayer(doc);
    if (!s) return { canvas: cloneCanvas(layer.canvas), x: layer.x, y: layer.y };
    const piece = newCanvas(s.w, s.h);
    piece.getContext('2d').drawImage(layer.canvas, layer.x - s.x, layer.y - s.y);
    return { canvas: Sel.clip(piece, s, s.x, s.y), x: s.x, y: s.y };
  }

  // Ctrl+J : la sélection devient un nouveau calque (sans sélection : duplique le calque).
  function layerFromSelection() {
    const { doc, layer } = needLayer();
    if (!layer) return;
    if (!doc.selection) return duplicateLayer();
    const piece = selectedPixels(doc, false);
    insertLayer(doc, createLayer(`${layer.name} (extrait)`, piece.canvas, { x: piece.x, y: piece.y }), 'Calque par copie');
  }

  // --- Presse-papiers (celui de Windows : on peut coller dans Photoshop, Discord, Word…) ---

  const canvasToPng = (canvas) => new Promise((resolve) => canvas.toBlob(async (blob) => resolve(new Uint8Array(await blob.arrayBuffer())), 'image/png'));

  async function copy(merged = false, cut = false) {
    const doc = needDoc();
    if (!doc || (!merged && !activeLayer(doc))) return;
    const piece = selectedPixels(doc, merged);
    await window.skald.clipboardWriteImage(await canvasToPng(piece.canvas));
    App.clipboardOrigin = { x: piece.x, y: piece.y, width: piece.canvas.width, height: piece.canvas.height };
    if (cut && !merged) {
      if (doc.selection) clearSelection(); else deleteLayer();
    }
    notify(merged ? 'Image fusionnée copiée.' : cut ? 'Coupé.' : 'Copié.', 'success', 1500);
  }

  async function paste() {
    const bytes = await window.skald.clipboardReadImage();
    if (!bytes) return notify('Le presse-papiers ne contient pas d\'image.', 'warning');
    const image = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = newCanvas(image.width, image.height);
    canvas.getContext('2d').drawImage(image, 0, 0);
    const doc = App.doc();
    if (!doc) return App.openDocument(createDocument({ name: 'Collé', width: canvas.width, height: canvas.height, layers: [createLayer('Collé', canvas)] }));
    // Collé à l'endroit d'où il a été copié s'il a la même taille, sinon au centre.
    const o = App.clipboardOrigin;
    const same = o && o.width === canvas.width && o.height === canvas.height;
    const x = same ? o.x : Math.round((doc.width - canvas.width) / 2);
    const y = same ? o.y : Math.round((doc.height - canvas.height) / 2);
    insertLayer(doc, createLayer('Collé', canvas, { x, y }), 'Coller');
    Tools.select('move');
  }

  async function clipboardSize() {
    try {
      const bytes = await window.skald.clipboardReadImage();
      if (!bytes) return null;
      const image = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      return { width: image.width, height: image.height };
    } catch { return null; }
  }

  return {
    colors, levels, exposure, blur, sharpen, invertSelection, selectLayerPixels, featherSelection, growSelection, transformNumeric, grayscale, invert, removeColor, recolor, outline, shadow,
    imageSize, canvasSize, rotateImage, flipLayer, trim, cropToSelection, resample, scaleDocument,
    newLayer, duplicateLayer, deleteLayer, moveLayer, mergeDown, flattenImage, rasterizeLayer, centerLayer, transformLayer,
    selectAll, deselect, clearSelection, fillSelection, layerFromSelection, copy, paste, clipboardSize, canvasToPng,
  };
})();
