// Ouvrir et enregistrer : PSD (avec ses calques, grâce à la librairie ag-psd), PNG, JPEG, WebP,
// SVG, ICO… et l'export (formats web, tailles multiples, pack d'icônes pour un site).

const IO = (() => {
  const ext = (name) => (name.match(/\.([^.]+)$/)?.[1] || '').toLowerCase();
  const baseName = (name) => name.replace(/\.[^.]+$/, '');

  // --- Lire un PSD ---
  // Photoshop range les calques dans des groupes : on les met à plat, en gardant le nom du groupe
  // (« Logo / Texte »). La visibilité et l'opacité des groupes sont reportées sur leurs calques.
  // Les masques de fusion et les masques d'écrêtage sont appliqués aux pixels.
  // Les calques de réglage et de remplissage que Skald connaît restent modifiables (adjustments.js) ;
  // les autres (courbes, mélangeur de couches…) n'ont pas de pixels : ils sont ignorés.
  const PSD_BLENDS = { normal: 'source-over', multiply: 'multiply', screen: 'screen', overlay: 'overlay', darken: 'darken', lighten: 'lighten', 'color dodge': 'color-dodge', 'color burn': 'color-burn', 'hard light': 'hard-light', 'soft light': 'soft-light', difference: 'difference', exclusion: 'exclusion', hue: 'hue', saturation: 'saturation', color: 'color', luminosity: 'luminosity', 'linear dodge': 'lighter' };
  const toPsdBlend = (blend) => Object.entries(PSD_BLENDS).find(([, v]) => v === blend)?.[0] || 'normal';

  function applyMask(canvas, layer) {
    const m = layer.mask;
    if (!m || !m.canvas || m.disabled) return canvas;
    const alpha = newCanvas(canvas.width, canvas.height);
    const g = alpha.getContext('2d');
    // Hors du rectangle du masque, Photoshop utilise sa « couleur par défaut » (0 = caché, 255 = visible).
    g.fillStyle = `rgba(0,0,0,${(m.defaultColor ?? 0) / 255})`;
    g.fillRect(0, 0, alpha.width, alpha.height);
    const mw = m.canvas.width, mh = m.canvas.height;
    const data = m.canvas.getContext('2d').getImageData(0, 0, mw, mh);
    for (let i = 0; i < data.data.length; i += 4) { data.data[i + 3] = data.data[i]; data.data[i] = data.data[i + 1] = data.data[i + 2] = 0; }
    const piece = newCanvas(mw, mh);
    piece.getContext('2d').putImageData(data, 0, 0);
    const mx = (m.left ?? 0) - (layer.left ?? 0), my = (m.top ?? 0) - (layer.top ?? 0);
    g.clearRect(mx, my, mw, mh);
    g.drawImage(piece, mx, my);
    const out = cloneCanvas(canvas);
    const o = out.getContext('2d');
    o.globalCompositeOperation = 'destination-in';
    o.drawImage(alpha, 0, 0);
    return out;
  }

  // Calque de réglage ou de remplissage de Photoshop → { adjust } ou { fill } pour Skald, sinon null.
  // (Un calque de forme a aussi un remplissage, mais avec un tracé : on le garde en pixels.)
  const colorHex = (c) => (c && 'r' in c ? rgbToHex(Math.round(c.r), Math.round(c.g), Math.round(c.b)) : '#000000');
  function specialFromPsd(child) {
    if (child.adjustment) {
      const adjust = Adjust.fromPsd(child.adjustment);
      return adjust ? { adjust } : null;
    }
    const f = child.vectorFill;
    if (!f || child.vectorMask || child.vectorStroke) return null;
    if (f.type === 'color') return { fill: { type: 'color', values: { color: colorHex(f.color) } } };
    if (f.type === 'solid' && f.colorStops?.length >= 2 && ['linear', 'radial'].includes(f.style || 'linear')) {
      const stops = f.colorStops, alpha = f.opacityStops || [];
      return {
        fill: {
          type: 'gradient',
          values: {
            from: colorHex(stops[0].color), to: colorHex(stops[stops.length - 1].color),
            transparent: alpha.length >= 2 && alpha[alpha.length - 1].opacity < 0.5,
            style: f.style || 'linear', angle: Math.round(f.angle ?? 90), scale: Math.round(f.scale ?? 100), reverse: !!f.reverse,
          },
        },
      };
    }
    return null;
  }

  function fromPsd(bytes, name, path) {
    const psd = agPsd.readPsd(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), { skipThumbnail: true, skipLinkedFilesData: true });
    const layers = [];
    let ignored = 0;
    const walk = (children, visible, opacity, prefix) => {
      let base = null; // calque sur lequel s'écrêtent les suivants
      for (const child of children || []) {
        if (child.children) {
          walk(child.children, visible && !child.hidden, opacity * (child.opacity ?? 1), `${prefix}${child.name} / `);
          base = null;
          continue;
        }
        const common = { visible: visible && !child.hidden, opacity: opacity * (child.opacity ?? 1), blend: PSD_BLENDS[child.blendMode] || 'source-over' };
        const special = specialFromPsd(child);
        if (special) {
          layers.push(createLayer(`${prefix}${child.name || 'Réglage'}`, Adjust.maskFromPsd(psd, child.mask), { ...common, ...special }));
          base = null;
          continue;
        }
        if (!child.canvas || !child.canvas.width) { ignored++; continue; }
        let canvas = applyMask(child.canvas, child);
        const layer = createLayer(`${prefix}${child.name || 'Calque'}`, canvas, {
          x: child.left ?? 0,
          y: child.top ?? 0,
          ...common,
        });
        if (child.clipping && base) {
          canvas = cloneCanvas(canvas);
          const g = canvas.getContext('2d');
          g.globalCompositeOperation = 'destination-in';
          g.drawImage(base.canvas, base.x - layer.x, base.y - layer.y);
          layer.canvas = canvas;
        } else base = layer;
        layers.push(layer);
      }
    };
    walk(psd.children, true, 1, '');
    if (!layers.length && psd.canvas) layers.push(createLayer('Fond', psd.canvas));
    if (ignored) notify(`${ignored} calque(s) sans pixels (réglages, formes vides…) n'ont pas été repris.`, 'info', 6000);
    return createDocument({ name, path, width: psd.width, height: psd.height, layers });
  }

  // --- Lire une image ordinaire ---
  async function fromImage(bytes, name, path) {
    const type = ext(name) === 'svg' ? 'image/svg+xml' : '';
    const blob = new Blob([bytes], type ? { type } : {});
    let canvas;
    if (type) {
      // SVG : c'est du vectoriel, on le dessine assez grand pour qu'il reste net (au moins 1024 px).
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.src = url;
      await img.decode();
      URL.revokeObjectURL(url);
      let w = img.naturalWidth || 512, h = img.naturalHeight || 512;
      const scale = Math.max(1, 1024 / Math.max(w, h));
      w = Math.round(w * scale); h = Math.round(h * scale);
      canvas = newCanvas(w, h);
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      if (scale > 1) notify(`SVG dessiné en ${w} × ${h} px pour rester net.`, 'info');
    } else {
      const bitmap = await createImageBitmap(blob);
      canvas = newCanvas(bitmap.width, bitmap.height);
      canvas.getContext('2d').drawImage(bitmap, 0, 0);
    }
    return createDocument({ name, path, width: canvas.width, height: canvas.height, layers: [createLayer('Fond', canvas)] });
  }

  async function decode({ path, name, bytes }) {
    try {
      return ext(name) === 'psd' ? fromPsd(bytes, name, path) : await fromImage(bytes, name, path);
    } catch (err) {
      throw new Error(`Impossible d'ouvrir ${name} : ${err.message || err}`);
    }
  }

  // dossier (facultatif) : où ouvrir la fenêtre « Ouvrir ».
  async function openFiles(dossier) {
    const files = await window.skald.openFiles(dossier);
    for (const f of files) App.openDocument(await decode(f));
  }
  async function openPath(file) {
    try {
      App.openDocument(await decode(await window.skald.openPath(file)));
    } catch (err) {
      notify(cleanError(err), 'error');
    }
  }

  // --- Encoder ---
  const MIME = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };
  function encode(canvas, format, quality = 90, background = '#ffffff') {
    let source = canvas;
    if (format === 'jpeg') {
      // Le JPEG n'a pas de transparence : on pose l'image sur un fond.
      source = newCanvas(canvas.width, canvas.height);
      const g = source.getContext('2d');
      g.fillStyle = background;
      g.fillRect(0, 0, source.width, source.height);
      g.drawImage(canvas, 0, 0);
    }
    if (format === 'ico') return Promise.resolve(makeIco(canvas, [16, 24, 32, 48, 64, 128, 256]));
    return new Promise((resolve, reject) => source.toBlob(async (blob) => {
      if (!blob) return reject(new Error('Image trop grande pour être encodée.'));
      resolve(new Uint8Array(await blob.arrayBuffer()));
    }, MIME[format], quality / 100));
  }

  // Image carrée de la taille demandée, l'original centré dedans (pour les icônes).
  function squareAt(canvas, size) {
    const out = newCanvas(size, size);
    const scale = size / Math.max(canvas.width, canvas.height);
    const w = Math.round(canvas.width * scale), h = Math.round(canvas.height * scale);
    out.getContext('2d').drawImage(Ops.resample(canvas, w, h), Math.round((size - w) / 2), Math.round((size - h) / 2));
    return out;
  }

  // Fichier .ico : un petit en-tête, puis une image PNG par taille.
  async function makeIco(canvas, sizes) {
    const images = [];
    for (const size of sizes) {
      const png = await encode(squareAt(canvas, size), 'png');
      images.push({ size, png });
    }
    const headerSize = 6 + 16 * images.length;
    const total = headerSize + images.reduce((n, i) => n + i.png.length, 0);
    const out = new Uint8Array(total);
    const view = new DataView(out.buffer);
    view.setUint16(0, 0, true);
    view.setUint16(2, 1, true); // 1 = icône
    view.setUint16(4, images.length, true);
    let offset = headerSize;
    images.forEach((img, n) => {
      const e = 6 + n * 16;
      out[e] = img.size >= 256 ? 0 : img.size; // 0 veut dire 256
      out[e + 1] = img.size >= 256 ? 0 : img.size;
      view.setUint16(e + 4, 1, true);   // plans de couleur
      view.setUint16(e + 6, 32, true);  // bits par pixel
      view.setUint32(e + 8, img.png.length, true);
      view.setUint32(e + 12, offset, true);
      out.set(img.png, offset);
      offset += img.png.length;
    });
    return out;
  }

  const rgb = (hex) => { const [r, g, b] = hexToRgb(hex); return { r, g, b }; };
  function psdFill(fill) {
    const v = fill.values;
    if (fill.type === 'color') return { type: 'color', color: rgb(v.color) };
    return {
      type: 'solid', name: 'Skald', style: v.style, angle: v.angle, scale: v.scale, reverse: v.reverse, align: true,
      colorStops: [{ color: rgb(v.from), location: 0, midpoint: 0.5 }, { color: rgb(v.to), location: 1, midpoint: 0.5 }],
      opacityStops: [{ opacity: 1, location: 0, midpoint: 0.5 }, { opacity: v.transparent ? 0 : 1, location: 1, midpoint: 0.5 }],
    };
  }

  function writePsd(doc) {
    const psd = {
      width: doc.width,
      height: doc.height,
      canvas: flatten(doc), // l'image fusionnée, pour les logiciels qui ne lisent pas les calques
      children: doc.layers.map((l) => {
        const common = { name: l.name, hidden: !l.visible, opacity: l.opacity, blendMode: toPsdBlend(l.blend) };
        // Calque de réglage : pas de pixels, seulement ses réglages et son masque.
        if (l.adjust) return { ...common, adjustment: Adjust.toPsd(l.adjust), mask: Adjust.psdMask(l) };
        // Calque de remplissage : ses réglages, son masque, et le remplissage en pixels pour les autres logiciels.
        if (l.fill) return { ...common, left: 0, top: 0, canvas: Adjust.fillCanvas(doc, l.fill), vectorFill: psdFill(l.fill), mask: Adjust.psdMask(l) };
        return { ...common, left: l.x, top: l.y, canvas: l.canvas };
      }),
    };
    return new Uint8Array(agPsd.writePsd(psd, { generateThumbnail: true }));
  }

  // --- Enregistrer ---
  async function writeTo(doc, file) {
    const format = ext(file);
    const bytes = format === 'psd' ? writePsd(doc) : await encode(flatten(doc), format === 'jpg' ? 'jpeg' : format, App.config.exportQuality);
    const saved = await window.skald.writeFile(file, bytes);
    doc.path = saved.path;
    doc.name = saved.name;
    doc.dirty = false;
    App.refresh();
    notify(`Enregistré : ${saved.name} (${formatSize(saved.size)})`, 'success');
  }

  async function save(doc = App.doc(), saveAs = false) {
    if (!doc) return false;
    const format = doc.path ? ext(doc.path) : null;
    try {
      if (!saveAs && format === 'psd') { await writeTo(doc, doc.path); return true; }
      if (!saveAs && ['png', 'jpg', 'jpeg', 'webp'].includes(format)) {
        // Un PNG/JPEG ne garde pas les calques : on prévient avant de les fusionner.
        if (doc.layers.length > 1) {
          const choice = await Dialogs.ask('Enregistrer', `« ${doc.name} » est un ${format.toUpperCase()}, qui ne garde pas les calques. Que veux-tu faire ?`, [
            { label: 'Annuler', value: null },
            { label: `Fusionner dans le ${format.toUpperCase()}`, value: 'flat' },
            { label: 'Enregistrer en PSD (garde les calques)', value: 'psd', primary: true },
          ]);
          if (!choice) return false;
          if (choice === 'flat') { await writeTo(doc, doc.path); return true; }
        } else { await writeTo(doc, doc.path); return true; }
      }
      const file = await window.skald.saveDialog({ defaultName: `${baseName(doc.name)}.psd`, format: 'psd' });
      if (!file) return false;
      await writeTo(doc, file);
      return true;
    } catch (err) {
      notify(`Échec de l'enregistrement : ${cleanError(err)}`, 'error');
      return false;
    }
  }

  // --- Exporter ---
  const formatSize = (n) => (n < 1024 ? `${n} o` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} Ko` : `${(n / 1024 / 1024).toFixed(2)} Mo`);

  function prepareExport(doc, v) {
    let canvas = flatten(doc);
    if (v.trim) {
      const b = opaqueBounds(canvas);
      if (b) { const piece = newCanvas(b.w, b.h); piece.getContext('2d').drawImage(canvas, -b.x, -b.y); canvas = piece; }
    }
    if (v.scale !== 100) canvas = Ops.resample(canvas, (canvas.width * v.scale) / 100, (canvas.height * v.scale) / 100);
    return canvas;
  }

  async function exportImage() {
    const doc = App.doc();
    if (!doc) return notify('Ouvre ou crée d\'abord une image.', 'warning');
    const sizeInfo = document.createElement('span');
    sizeInfo.className = 'export-info';
    let timer = null;
    const v = await Dialogs.form({
      title: 'Exporter',
      okLabel: 'Exporter…',
      width: 460,
      extra: sizeInfo,
      fields: [
        { key: 'format', label: 'Format', type: 'select', value: App.config.exportFormat || 'png', choices: [['png', 'PNG (transparence, sans perte)'], ['webp', 'WebP (léger, pour le web)'], ['jpeg', 'JPEG (photos, sans transparence)'], ['ico', 'ICO (icône Windows / favicon)']] },
        { key: 'quality', label: 'Qualité', type: 'range', min: 1, max: 100, value: App.config.exportQuality || 90, unit: '%' },
        { key: 'scale', label: 'Échelle', type: 'number', min: 1, max: 1000, step: 'any', value: 100, unit: '%' },
        { key: 'width', label: 'Largeur', type: 'number', min: 1, max: 30000, value: doc.width, unit: 'px' },
        { key: 'background', label: 'Fond (JPEG)', type: 'color', value: '#ffffff' },
        { key: 'trim', label: 'Rogner les bords transparents', type: 'checkbox', value: false },
      ],
      onInput(values, f) {
        const changed = document.activeElement?.name;
        const lossy = values.format === 'jpeg' || values.format === 'webp';
        f.inputs.quality.row.hidden = !lossy;
        f.inputs.background.row.hidden = values.format !== 'jpeg';
        if (changed === 'width') f.inputs.scale.input.value = Math.round((values.width / doc.width) * 10000) / 100;
        else f.inputs.width.input.value = Math.round((doc.width * values.scale) / 100);
        // Poids estimé du fichier, recalculé un instant après le dernier changement.
        clearTimeout(timer);
        sizeInfo.textContent = 'Calcul du poids…';
        timer = setTimeout(async () => {
          const now = f.values();
          const canvas = prepareExport(doc, now);
          const bytes = await encode(canvas, now.format, now.quality, now.background);
          sizeInfo.textContent = `${canvas.width} × ${canvas.height} px · ${formatSize(bytes.length)}`;
        }, 250);
      },
    });
    clearTimeout(timer);
    if (!v) return;
    window.skald.writeConfig({ exportFormat: v.format, exportQuality: v.quality }).then((c) => { App.config = c; });
    const extension = { png: 'png', webp: 'webp', jpeg: 'jpg', ico: 'ico' }[v.format];
    const file = await window.skald.saveDialog({ defaultName: `${baseName(doc.name)}.${extension}`, format: v.format });
    if (!file) return;
    try {
      const bytes = await encode(prepareExport(doc, v), v.format, v.quality, v.background);
      const saved = await window.skald.writeFile(file, bytes);
      notify(`Exporté : ${saved.name} (${formatSize(saved.size)})`, 'success');
    } catch (err) {
      notify(`Échec de l'export : ${cleanError(err)}`, 'error');
    }
  }

  // Pack d'icônes pour un site ou une appli : favicon.ico + PNG aux tailles habituelles.
  async function exportIcons() {
    const doc = App.doc();
    if (!doc) return notify('Ouvre ou crée d\'abord une image.', 'warning');
    const v = await Dialogs.form({
      title: 'Exporter un pack d\'icônes',
      okLabel: 'Choisir le dossier…',
      fields: [
        { key: 'info', type: 'info', text: 'Crée dans un dossier : favicon.ico (16, 32, 48 px), favicon-16.png, favicon-32.png, apple-touch-icon.png (180 px), icon-192.png et icon-512.png. Une image non carrée est centrée sur fond transparent.' },
        { key: 'trim', label: 'Rogner les bords transparents d\'abord', type: 'checkbox', value: true },
        { key: 'extra', label: 'Autres tailles (px, séparées par des virgules)', type: 'text', value: '', placeholder: 'ex. 64, 128, 1024' },
        { key: 'prefix', label: 'Préfixe des noms (facultatif)', type: 'text', value: '', placeholder: 'ex. logo-' },
      ],
    });
    if (!v) return;
    const folder = await window.skald.pickFolder('Dossier où créer les icônes');
    if (!folder) return;
    const source = prepareExport(doc, { trim: v.trim, scale: 100 });
    const sep = window.skald.platform === 'win32' ? '\\' : '/';
    const files = [
      ['favicon.ico', () => makeIco(source, [16, 32, 48])],
      ['favicon-16.png', () => encode(squareAt(source, 16), 'png')],
      ['favicon-32.png', () => encode(squareAt(source, 32), 'png')],
      ['apple-touch-icon.png', () => encode(squareAt(source, 180), 'png')],
      ['icon-192.png', () => encode(squareAt(source, 192), 'png')],
      ['icon-512.png', () => encode(squareAt(source, 512), 'png')],
      ...v.extra.split(/[,; ]+/).map(Number).filter((n) => n > 0 && n <= 8192).map((n) => [`icon-${n}.png`, () => encode(squareAt(source, n), 'png')]),
    ];
    try {
      for (const [name, make] of files) await window.skald.writeFile(`${folder}${sep}${v.prefix}${name}`, await make());
      notify(`${files.length} icônes créées dans ${folder}`, 'success', 6000);
    } catch (err) {
      notify(`Échec de l'export : ${cleanError(err)}`, 'error');
    }
  }

  return { decode, openFiles, openPath, save, exportImage, exportIcons, encode, makeIco, writePsd, fromPsd, formatSize, prepareExport, squareAt };
})();
