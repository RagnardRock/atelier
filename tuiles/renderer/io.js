// Ouvrir, enregistrer, importer et exporter.
//
// Le fichier .tafl est du JSON lisible : la taille des tuiles, la palette, chaque tuile en petite image
// PNG (encodée en texte, « data URL ») avec son nom, et la carte (un numéro de tuile par case,
// -1 = vide). Tu peux l'ouvrir dans Rune pour voir ce qu'il contient.
//
// Les exports sont faits pour un jeu :
// - la planche de tuiles (tileset) : toutes les tuiles dans une seule image PNG, en grille,
//   le format que lisent Tiled, Godot, Phaser, Unity, RPG Maker… ;
// - les tuiles séparées : un PNG par tuile, dans un dossier ;
// - la carte au format de Tiled (.tmj, du JSON) avec sa planche, plus une image PNG de la carte.

const IO = (() => {
  // --- Images ---
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Image illisible'));
      img.src = src;
    });
  }
  async function decodeBytes(bytes, type = 'image/png') {
    const url = URL.createObjectURL(new Blob([bytes], { type }));
    try {
      return await loadImage(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  function pixelsOf(img) {
    const c = el('canvas', { width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    return g.getImageData(0, 0, c.width, c.height);
  }
  const canvasBytes = (canvas) => new Promise((resolve, reject) => canvas.toBlob(async (blob) => {
    if (!blob) return reject(new Error('Image trop grande pour être exportée'));
    resolve(new Uint8Array(await blob.arrayBuffer()));
  }, 'image/png'));
  const textBytes = (text) => new TextEncoder().encode(text);
  const safeName = (name) => String(name || 'tuiles').replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').trim() || 'tuiles';

  // --- Fichier .tafl ---
  function serialize(doc) {
    const s = doc.tileSize;
    return JSON.stringify({
      format: 'tafl',
      version: 1,
      name: doc.name,
      tileSize: s,
      columns: doc.columns,
      palette: doc.palette,
      tiles: doc.tiles.map((t) => ({ name: t.name, png: Doc.tileCanvas(t, s).toDataURL('image/png') })),
      map: { width: doc.map.width, height: doc.map.height, layers: doc.map.layers.map((l) => ({ name: l.name, visible: l.visible, cells: [...l.cells] })) },
    });
  }

  async function deserialize(text, file) {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`${file.name} n'est pas un fichier Tafl valide (JSON illisible)`);
    }
    if (data.format !== 'tafl') throw new Error(`${file.name} n'est pas un jeu de tuiles Tafl`);
    if (data.version > 1) throw new Error(`${file.name} vient d'une version plus récente de Tafl : mets Tafl à jour pour l'ouvrir`);
    const s = Number(data.tileSize) || 16;
    const doc = Doc.create({ name: data.name || file.name.replace(/\.tafl$/i, ''), tileSize: s, palette: data.palette || [], tiles: 0, columns: data.columns || 8, mapWidth: data.map?.width || 20, mapHeight: data.map?.height || 15 });
    for (const t of data.tiles || []) {
      const img = await loadImage(t.png);
      const c = el('canvas', { width: s, height: s });
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      doc.tiles.push({ id: Doc.newId(), name: t.name || Doc.uniqueName(doc, 'tuile'), data: g.getImageData(0, 0, s, s).data });
    }
    if (!doc.tiles.length) Doc.addTile(doc);
    if (Array.isArray(data.map?.layers)) {
      doc.map.layers = data.map.layers.map((l) => ({ name: l.name || 'Calque', visible: l.visible !== false, cells: Int32Array.from({ length: doc.map.width * doc.map.height }, (_v, i) => (Number.isInteger(l.cells?.[i]) && l.cells[i] < doc.tiles.length ? l.cells[i] : -1)) }));
    }
    doc.path = file.path;
    return doc;
  }

  // Ouvre un fichier choisi (ou glissé) : un .tafl s'ouvre, une image propose l'import.
  async function openLoaded(file) {
    if (/\.tafl$/i.test(file.name)) return App.setDocument(await deserialize(new TextDecoder().decode(file.bytes), file));
    return importSheet(file);
  }

  async function open(dossier) {
    const file = await window.tafl.openFile({ kind: 'tafl', dossier });
    if (file) await openLoaded(file);
  }
  async function openPath(path) {
    await openLoaded(await window.tafl.openPath(path));
  }

  async function save(doc, as = false) {
    let path = doc.path;
    if (!path || as) {
      path = await window.tafl.saveDialog({ defaultName: `${safeName(doc.name)}.tafl`, format: 'tafl' });
      if (!path) return false;
    }
    const saved = await window.tafl.writeFile(path, textBytes(serialize(doc)));
    doc.path = saved.path;
    doc.name = saved.name.replace(/\.tafl$/i, '');
    doc.dirty = false;
    App.refresh();
    notify(`Enregistré : ${saved.name}`, 'success', 2500);
    return true;
  }

  // --- Importer une planche de tuiles (PNG) ---
  // Découpe l'image en tuiles. Options : sauter les cases vides, ne garder qu'un exemplaire des tuiles
  // identiques, et refaire l'image sous forme de carte (pratique pour reprendre une capture d'écran).
  async function importSheet(file) {
    const img = await decodeBytes(file.bytes);
    const W = img.naturalWidth, H = img.naturalHeight;
    const doc = App.doc;
    const v = await Dialogs.form({
      title: `Importer ${file.name}`,
      okLabel: 'Importer',
      width: 470,
      fields: [
        { type: 'info', text: `Image de ${W} × ${H} pixels. Elle est découpée en tuiles carrées, de gauche à droite puis de haut en bas.` },
        { key: 'size', label: 'Taille des tuiles', type: 'number', value: doc ? doc.tileSize : App.config.tileSize, min: 4, max: 128, unit: 'px' },
        { key: 'target', label: 'Destination', type: 'select', value: doc ? 'add' : 'new', choices: doc ? [['add', `Ajouter au jeu ouvert (${doc.name})`], ['new', 'Nouveau jeu de tuiles']] : [['new', 'Nouveau jeu de tuiles']] },
        { key: 'skipEmpty', label: 'Ignorer les cases entièrement transparentes', type: 'checkbox', value: true },
        { key: 'dedupe', label: 'Une seule fois chaque tuile identique', type: 'checkbox', value: true },
        { key: 'asMap', label: 'Refaire l\'image en carte (nouveau jeu seulement)', type: 'checkbox', value: false },
      ],
      onInput(values, f) {
        const cols = Math.floor(W / values.size), rows = Math.floor(H / values.size);
        f.card.querySelector('.modal-extra').textContent = cols && rows ? `${cols} × ${rows} = ${cols * rows} cases${W % values.size || H % values.size ? ' (les bords en trop sont ignorés)' : ''}` : 'Image plus petite qu\'une tuile';
        f.inputs.asMap.row.hidden = values.target !== 'new';
        if (doc && values.target === 'add' && values.size !== doc.tileSize) f.setValue('size', doc.tileSize);
      },
    });
    if (!v) return;
    const s = v.size, cols = Math.floor(W / s), rows = Math.floor(H / s);
    if (!cols || !rows) return notify('L\'image est plus petite qu\'une tuile.', 'warning');
    const pixels = pixelsOf(img);
    const cut = (cx, cy) => {
      const data = new Uint8ClampedArray(s * s * 4);
      let empty = true;
      for (let y = 0; y < s; y++) {
        const from = ((cy * s + y) * W + cx * s) * 4;
        data.set(pixels.data.subarray(from, from + s * 4), y * s * 4);
      }
      for (let o = 3; o < data.length; o += 4) if (data[o]) { empty = false; break; }
      return { data, empty };
    };

    const target = v.target === 'new' || !doc
      ? Doc.create({ name: file.name.replace(/\.[^.]+$/, ''), tileSize: s, tiles: 0, palette: paletteById(App.config.palette).couleurs, mapWidth: v.asMap ? cols : 20, mapHeight: v.asMap ? rows : 15 })
      : doc;
    const add = () => {
      const known = new Map(); // empreinte des pixels → numéro de tuile (pour les doublons)
      if (v.dedupe) target.tiles.forEach((t, i) => known.set(t.data.join(','), i));
      let added = 0;
      for (let cy = 0; cy < rows; cy++) {
        for (let cx = 0; cx < cols; cx++) {
          const { data, empty } = cut(cx, cy);
          let index = -1;
          if (!(empty && v.skipEmpty)) {
            const key = v.dedupe ? data.join(',') : null;
            if (key && known.has(key)) index = known.get(key);
            else {
              index = Doc.addTile(target, data, Doc.uniqueName(target, 'tuile'));
              added++;
              if (key) known.set(key, index);
            }
          }
          if (v.asMap && target !== doc) target.map.layers[0].cells[cy * cols + cx] = index;
        }
      }
      return added;
    };

    if (target === doc) {
      let added = 0;
      Doc.change(doc, `Importer ${file.name}`, () => { added = add(); });
      notify(`${added} tuile(s) ajoutée(s) depuis ${file.name}.`, 'success');
    } else {
      const added = add();
      if (!target.tiles.length) Doc.addTile(target);
      // Peu de couleurs : la palette devient celle de l'image.
      const used = Panels.usedColors(target);
      if (used.length && used.length <= 64) target.palette = used;
      target.dirty = true;
      App.setDocument(target);
      if (v.asMap) App.setMode('map');
      notify(`${added} tuile(s) importée(s) depuis ${file.name}${v.asMap ? ', et la carte refaite à partir de l\'image' : ''}.`, 'success');
    }
  }

  async function importDialog() {
    const file = await window.tafl.openFile({ kind: 'image' });
    if (file) await importSheet(file);
  }

  // --- Exports ---
  function sheetCanvas(doc, columns, scale, spacing = 0) {
    const s = doc.tileSize, n = doc.tiles.length;
    const cols = Math.max(1, Math.min(columns, n)), rows = Math.ceil(n / cols);
    const step = s * scale + spacing;
    const c = el('canvas', { width: cols * step - spacing, height: rows * step - spacing });
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    doc.tiles.forEach((t, i) => g.drawImage(Doc.tileCanvas(t, s), (i % cols) * step, Math.floor(i / cols) * step, s * scale, s * scale));
    return c;
  }

  function mapCanvas(doc, scale = 1) {
    const s = doc.tileSize, { map } = doc;
    const c = el('canvas', { width: map.width * s * scale, height: map.height * s * scale });
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    const canvases = doc.tiles.map((t) => Doc.tileCanvas(t, s));
    for (const layer of map.layers) {
      if (!layer.visible) continue;
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          const t = layer.cells[y * map.width + x];
          if (t >= 0) g.drawImage(canvases[t], x * s * scale, y * s * scale, s * scale, s * scale);
        }
      }
    }
    return c;
  }

  async function exportSheet(doc) {
    const v = await Dialogs.form({
      title: 'Exporter la planche de tuiles',
      okLabel: 'Exporter',
      width: 440,
      fields: [
        { type: 'info', text: 'Toutes les tuiles dans une seule image PNG, en grille : c\'est ce que lisent Tiled, Godot, Phaser, RPG Maker…' },
        { key: 'columns', label: 'Colonnes', type: 'number', value: doc.columns, min: 1, max: 64 },
        { key: 'scale', label: 'Agrandissement', type: 'select', value: String(App.config.exportScale || 1), choices: [['1', '×1 (taille réelle, pour un moteur de jeu)'], ['2', '×2'], ['3', '×3'], ['4', '×4'], ['8', '×8 (pour montrer)']] },
        { key: 'spacing', label: 'Espace entre tuiles', type: 'number', value: 0, min: 0, max: 8, unit: 'px' },
      ],
      onInput(values, f) {
        const c = sheetCanvas(doc, values.columns, Number(values.scale), values.spacing);
        f.card.querySelector('.modal-extra').textContent = `${c.width} × ${c.height} px, ${doc.tiles.length} tuile(s)`;
      },
    });
    if (!v) return;
    const path = await window.tafl.saveDialog({ defaultName: `${safeName(doc.name)}.png`, format: 'png' });
    if (!path) return;
    const saved = await window.tafl.writeFile(path, await canvasBytes(sheetCanvas(doc, v.columns, Number(v.scale), v.spacing)));
    if (v.columns !== doc.columns) { doc.columns = v.columns; doc.dirty = true; App.refresh(); }
    window.tafl.writeConfig({ exportScale: Number(v.scale) }).then((c) => { App.config = c; });
    notify(`Planche exportée : ${saved.name}`, 'success', 6000, [{ label: 'Afficher', run: () => window.tafl.revealFile(saved.path) }]);
  }

  async function exportTiles(doc) {
    const v = await Dialogs.form({
      title: 'Exporter les tuiles séparées',
      okLabel: 'Choisir le dossier…',
      fields: [
        { type: 'info', text: 'Un fichier PNG par tuile, nommé avec son numéro et son nom (00-herbe.png, 01-chemin.png…).' },
        { key: 'scale', label: 'Agrandissement', type: 'select', value: String(App.config.exportScale || 1), choices: [['1', '×1'], ['2', '×2'], ['3', '×3'], ['4', '×4'], ['8', '×8']] },
      ],
    });
    if (!v) return;
    const folder = await window.tafl.pickFolder('Dossier où exporter les tuiles');
    if (!folder) return;
    const scale = Number(v.scale), s = doc.tileSize, sep = window.tafl.platform === 'win32' ? '\\' : '/';
    const digits = String(doc.tiles.length - 1).length;
    for (const [i, t] of doc.tiles.entries()) {
      const c = el('canvas', { width: s * scale, height: s * scale });
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.drawImage(Doc.tileCanvas(t, s), 0, 0, s * scale, s * scale);
      await window.tafl.writeFile(`${folder}${sep}${String(i).padStart(Math.max(2, digits), '0')}-${safeName(t.name)}.png`, await canvasBytes(c));
    }
    notify(`${doc.tiles.length} tuile(s) exportée(s) dans ${folder}`, 'success', 6000, [{ label: 'Afficher', run: () => window.tafl.revealFile(folder) }]);
  }

  // La carte au format de Tiled (https://www.mapeditor.org) : un fichier .tmj (JSON) qui pointe vers
  // la planche PNG posée à côté. Phaser et Godot savent le charger directement.
  async function exportMap(doc) {
    const folder = await window.tafl.pickFolder('Dossier où exporter la carte');
    if (!folder) return;
    const sep = window.tafl.platform === 'win32' ? '\\' : '/';
    const base = safeName(doc.name);
    const s = doc.tileSize, { map } = doc;
    const sheet = sheetCanvas(doc, doc.columns, 1);
    const cols = Math.max(1, Math.min(doc.columns, doc.tiles.length));
    const tmj = {
      compressionlevel: -1,
      type: 'map',
      version: '1.10',
      tiledversion: '1.10.2',
      orientation: 'orthogonal',
      renderorder: 'right-down',
      infinite: false,
      width: map.width,
      height: map.height,
      tilewidth: s,
      tileheight: s,
      nextlayerid: map.layers.length + 1,
      nextobjectid: 1,
      // Dans Tiled, 0 = case vide et la première tuile vaut 1 (d'où le +1).
      layers: map.layers.map((l, i) => ({ id: i + 1, name: l.name, type: 'tilelayer', x: 0, y: 0, width: map.width, height: map.height, opacity: 1, visible: l.visible, data: [...l.cells].map((c) => c + 1) })),
      tilesets: [{ firstgid: 1, name: base, image: `${base}-tuiles.png`, imagewidth: sheet.width, imageheight: sheet.height, tilewidth: s, tileheight: s, tilecount: doc.tiles.length, columns: cols, margin: 0, spacing: 0 }],
    };
    await window.tafl.writeFile(`${folder}${sep}${base}-tuiles.png`, await canvasBytes(sheet));
    await window.tafl.writeFile(`${folder}${sep}${base}.tmj`, textBytes(JSON.stringify(tmj, null, 2)));
    await window.tafl.writeFile(`${folder}${sep}${base}-carte.png`, await canvasBytes(mapCanvas(doc, 1)));
    notify(`Carte exportée : ${base}.tmj (Tiled), ${base}-tuiles.png et ${base}-carte.png`, 'success', 8000, [{ label: 'Afficher', run: () => window.tafl.revealFile(`${folder}${sep}${base}.tmj`) }]);
  }

  async function exportMapImage(doc) {
    const v = await Dialogs.form({
      title: 'Exporter la carte en image',
      okLabel: 'Exporter',
      fields: [{ key: 'scale', label: 'Agrandissement', type: 'select', value: '2', choices: [['1', '×1'], ['2', '×2'], ['3', '×3'], ['4', '×4']] }],
      onInput(values, f) {
        const s = doc.tileSize * Number(values.scale);
        f.card.querySelector('.modal-extra').textContent = `${doc.map.width * s} × ${doc.map.height * s} px`;
      },
    });
    if (!v) return;
    const path = await window.tafl.saveDialog({ defaultName: `${safeName(doc.name)}-carte.png`, format: 'png' });
    if (!path) return;
    const saved = await window.tafl.writeFile(path, await canvasBytes(mapCanvas(doc, Number(v.scale))));
    notify(`Carte exportée : ${saved.name}`, 'success', 6000, [{ label: 'Afficher', run: () => window.tafl.revealFile(saved.path) }]);
  }

  return { open, openPath, openLoaded, save, importDialog, importSheet, exportSheet, exportTiles, exportMap, exportMapImage, serialize, deserialize };
})();
