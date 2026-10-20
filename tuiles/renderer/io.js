// Ouvrir, enregistrer, importer et exporter.
//
// Le fichier .tafl est du JSON lisible : la taille des tuiles, la palette, chaque tuile en petite image
// PNG (encodée en texte, « data URL ») avec son nom (et, pour une tuile animée, ses autres images et
// leur durée), et la carte (un numéro de tuile par case, -1 = vide). Tu peux l'ouvrir dans Rune.
// « png » garde toujours la première image : un fichier enregistré par Tafl 0.2 s'ouvre aussi dans
// Tafl 0.1 (sans l'animation).
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

  // --- Cartes en JSON ---
  // Le même format sert dans le .tafl (champ maps) et dans les fichiers cartes/*.json d'un dossier de
  // jeu : c'est celui que lira le moteur du jeu. Il est décrit en détail dans ../FORMAT.md.
  function mapToJSON(doc, map) {
    return {
      format: 'tafl-carte',
      version: 1,
      id: map.id,
      nom: map.name,
      largeur: map.width,
      hauteur: map.height,
      tailleTuiles: doc.tileSize,
      calques: map.layers.map((l) => ({ nom: l.name, visible: l.visible, profondeur: l.profondeur, opacite: l.opacite, fusion: l.fusion, parallaxe: { ...l.parallaxe }, cases: [...l.cells] })),
      passage: [...map.passage],
      // Le passage final de chaque case, recalculé à chaque enregistrement (le moteur lit celui-ci).
      collisions: [...Doc.collisions(doc, map)],
      zones: map.zones.map((z) => ({ id: z.id, nom: z.name, type: z.type, x: z.x, y: z.y, largeur: z.w, hauteur: z.h, objetRequis: z.objet || null, taux: z.taux ?? 10, rencontres: z.rencontres || [] })),
      // Tafl 0.8 : la météo et la teinte de la carte.
      ambiance: map.ambiance,
      teleporteurs: map.warps.map((w) => ({ id: w.id, x: w.x, y: w.y, vers: { carte: w.carte, x: w.tx, y: w.ty, direction: w.direction } })),
      // Tafl 0.7 : personnages, panneaux, coffres… avec leur script (déjà au format du fichier, voir events.js).
      evenements: map.events,
    };
  }
  const oneOf = (v, list, fallback) => (list.some(([k]) => k === v) ? v : fallback);
  const int = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : fallback);
  function mapFromJSON(data, tileCount, fallbackId) {
    const width = clamp(int(data.largeur, 20), 1, 256), height = clamp(int(data.hauteur, 15), 1, 256), n = width * height;
    const cells = (list) => Int32Array.from({ length: n }, (_v, i) => (Number.isInteger(list?.[i]) && list[i] >= 0 && list[i] < tileCount ? list[i] : -1));
    const map = Doc.newMap({ id: Doc.slug(data.id || fallbackId), name: String(data.nom || data.id || fallbackId), width, height });
    if (Array.isArray(data.calques)) {
      map.layers = data.calques.map((l, i) => Doc.newLayer(String(l.nom || `Calque ${i + 1}`), width, height, {
        visible: l.visible !== false,
        cells: cells(l.cases),
        profondeur: oneOf(l.profondeur, Doc.PROFONDEURS, 'dessous'),
        opacite: clamp(Number(l.opacite ?? 1) || 0, 0, 1),
        fusion: oneOf(l.fusion, Doc.FUSIONS, 'normal'),
        parallaxe: { x: Number(l.parallaxe?.x ?? 1) || 0, y: Number(l.parallaxe?.y ?? 1) || 0 },
      }));
    }
    map.passage = Uint8Array.from({ length: n }, (_v, i) => clamp(int(data.passage?.[i]), 0, 6));
    map.zones = (Array.isArray(data.zones) ? data.zones : []).map((z, i) => ({
      id: String(z.id || `zone-${i + 1}`), name: String(z.nom || ''), type: oneOf(z.type, Doc.ZONES, 'autre'),
      x: clamp(int(z.x), 0, width - 1), y: clamp(int(z.y), 0, height - 1), w: Math.max(1, int(z.largeur, 1)), h: Math.max(1, int(z.hauteur, 1)), objet: z.objetRequis ? String(z.objetRequis) : '',
      taux: clamp(int(z.taux, 10), 0, 100), rencontres: Donnees.normRencontres(z.rencontres),
    }));
    map.ambiance = Donnees.normAmbiance(data.ambiance);
    map.warps = (Array.isArray(data.teleporteurs) ? data.teleporteurs : []).filter((w) => w?.vers?.carte).map((w, i) => ({
      id: String(w.id || `tp-${i + 1}`), x: clamp(int(w.x), 0, width - 1), y: clamp(int(w.y), 0, height - 1),
      carte: String(w.vers.carte), tx: int(w.vers.x), ty: int(w.vers.y), direction: oneOf(w.vers.direction, Doc.DIRECTIONS, 'bas'),
    }));
    map.events = Events.normEvents(data.evenements, width, height, tileCount);
    return map;
  }

  // --- Fichier .tafl ---
  // tilesOnly : seulement les tuiles et la palette (le tuiles.tafl d'un dossier de jeu, les cartes étant à part).
  function serialize(doc, { tilesOnly = false } = {}) {
    const s = doc.tileSize;
    const data = {
      format: 'tafl',
      version: 1,
      name: doc.name,
      tileSize: s,
      columns: doc.columns,
      palette: doc.palette,
      tiles: doc.tiles.map((t) => {
        const pngs = t.frames.map((_f, k) => Doc.tileCanvas(t, s, k).toDataURL('image/png'));
        const tile = Doc.animated(t) ? { name: t.name, png: pngs[0], frames: pngs, duration: t.duration } : { name: t.name, png: pngs[0] };
        if (t.passage && t.passage !== 'auto') tile.passage = t.passage;
        return tile;
      }),
    };
    if (tilesOnly) return JSON.stringify(data);
    // « map » : la première carte, comme avant (Tafl 0.5 et plus ancien ne lisent que celle-là).
    const first = doc.maps[0];
    data.map = { width: first.width, height: first.height, layers: first.layers.map((l) => ({ name: l.name, visible: l.visible, cells: [...l.cells] })) };
    data.maps = doc.maps.map((m) => mapToJSON(doc, m));
    data.depart = doc.depart;
    data.donnees = doc.data;
    return JSON.stringify(data);
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
    const c = el('canvas', { width: s, height: s });
    const g = c.getContext('2d', { willReadFrequently: true });
    const pixels = async (src) => {
      g.clearRect(0, 0, s, s);
      g.drawImage(await loadImage(src), 0, 0);
      return g.getImageData(0, 0, s, s).data;
    };
    for (const t of data.tiles || []) {
      const sources = Array.isArray(t.frames) && t.frames.length ? t.frames.slice(0, 16) : [t.png];
      const frames = [];
      for (const src of sources) frames.push(await pixels(src));
      doc.tiles.push({ id: Doc.newId(), name: t.name || Doc.uniqueName(doc, 'tuile'), frames, duration: Number(t.duration) || Doc.DEFAULT_DURATION, passage: ['libre', 'bloque'].includes(t.passage) ? t.passage : 'auto' });
    }
    if (!doc.tiles.length) Doc.addTile(doc);
    if (Array.isArray(data.maps) && data.maps.length) {
      setMaps(doc, data.maps.map((m, i) => mapFromJSON(m, doc.tiles.length, `carte-${i + 1}`)));
      doc.depart = cleanDepart(doc, data.depart);
    } else if (Array.isArray(data.map?.layers)) {
      // Fichier d'avant Tafl 0.6 : une seule carte, avec ses calques (le 2e et les suivants au niveau du joueur).
      const { map } = doc;
      map.layers = data.map.layers.map((l, i) => Doc.newLayer(l.name || 'Calque', map.width, map.height, {
        visible: l.visible !== false,
        profondeur: i ? 'joueur' : 'dessous',
        cells: Int32Array.from({ length: map.width * map.height }, (_v, k) => (Number.isInteger(l.cells?.[k]) && l.cells[k] < doc.tiles.length ? l.cells[k] : -1)),
      }));
    }
    doc.data = Events.normData(data.donnees, doc.tiles.length);
    doc.path = file.path;
    return doc;
  }
  // Les cartes lues, avec des identifiants uniques.
  function setMaps(doc, maps) {
    const seen = new Set();
    for (const m of maps) {
      let id = m.id, n = 2;
      while (seen.has(id)) id = `${m.id}-${n++}`;
      m.id = id;
      seen.add(id);
    }
    doc.maps = maps;
    Doc.selectMap(doc, 0);
  }
  function cleanDepart(doc, d) {
    const map = d && Doc.mapById(doc, String(d.carte));
    if (!map) return null;
    return { carte: map.id, x: clamp(int(d.x), 0, map.width - 1), y: clamp(int(d.y), 0, map.height - 1), direction: oneOf(d.direction, Doc.DIRECTIONS, 'bas') };
  }

  // Ouvre un fichier choisi (ou glissé) : un .tafl s'ouvre, le jeu.json d'un dossier de jeu ouvre tout
  // le jeu, une image propose l'import.
  async function openLoaded(file) {
    if (/^jeu\.json$/i.test(file.name)) return openGame(file.path);
    if (/\.tafl$/i.test(file.name)) return App.setDocument(await deserialize(new TextDecoder().decode(file.bytes), file));
    return importSheet(file);
  }

  async function open(dossier) {
    const file = await window.tafl.openFile({ kind: 'tafl', dossier });
    if (file) await openLoaded(file);
  }
  async function openPath(path) {
    if (/(^|[\\/])jeu\.json$/i.test(path)) return openGame(path);
    await openLoaded(await window.tafl.openPath(path));
  }

  // --- Dossier de jeu (Tafl 0.6) ---
  // MonJeu/
  //   jeu.json        le titre, la liste des cartes, le départ du joueur
  //   tuiles.tafl     les tuiles, partagées par toutes les cartes
  //   cartes/*.json   une carte par fichier
  //   donnees/*.json  personnages, quêtes, interrupteurs (Tafl 0.7), types, attaques, créatures,
  //                   objets, dresseurs, boutiques, réglages… (Tafl 0.8)
  //   FORMAT.md       la description de ces fichiers (copiée par Tafl à chaque enregistrement)
  async function openGame(path) {
    if (!path) throw new Error('Ce jeu.json n\'a pas de chemin sur le disque : ouvre-le avec Fichier › Ouvrir.');
    const g = await window.tafl.openGame(path);
    let jeu;
    try {
      jeu = JSON.parse(g.jeu);
    } catch {
      throw new Error(`${g.folder}\\jeu.json n'est pas lisible (JSON abîmé)`);
    }
    if (jeu.format !== 'tafl-jeu') throw new Error('Ce jeu.json n\'est pas un dossier de jeu Tafl.');
    if (jeu.version > 1) throw new Error('Ce jeu vient d\'une version plus récente de Tafl : mets Tafl à jour pour l\'ouvrir');
    const doc = g.tuiles
      ? await deserialize(g.tuiles, { name: jeu.tuiles || 'tuiles.tafl', path: null })
      : Doc.create({ tileSize: int(jeu.tailleTuiles, 16), tiles: 1 });
    const maps = (jeu.cartes || []).filter((c) => g.cartes[c.fichier]).map((c, i) => {
      let data;
      try {
        data = JSON.parse(g.cartes[c.fichier]);
      } catch {
        throw new Error(`La carte ${c.fichier} n'est pas lisible (JSON abîmé).`);
      }
      return mapFromJSON({ id: c.id, nom: c.nom, ...data }, doc.tiles.length, c.id || `carte-${i + 1}`);
    });
    if (maps.length) setMaps(doc, maps);
    doc.depart = cleanDepart(doc, jeu.depart);
    // Les données du jeu : un fichier par sorte (donnees/personnages.json…).
    const donnees = {};
    for (const [kind, fichier] of Object.entries(jeu.donnees || {})) {
      if (!DATA_KINDS.includes(kind) || typeof g.donnees?.[fichier] !== 'string') continue;
      try {
        donnees[kind] = JSON.parse(g.donnees[fichier])[kind];
      } catch {
        throw new Error(`${fichier} n'est pas lisible (JSON abîmé).`);
      }
    }
    doc.data = Events.normData(donnees, doc.tiles.length);
    doc.name = String(jeu.titre || g.folder.split(/[\\/]/).pop());
    doc.path = g.path;
    doc.game = { folder: g.folder, fichiers: Object.keys(g.cartes) };
    await App.setDocument(doc);
  }

  const mapFile = (m) => `cartes/${m.id}.json`;
  const DATA_KINDS = ['personnages', 'quetes', 'interrupteurs', ...Donnees.SORTES];
  const dataFile = (kind) => `donnees/${kind}.json`;
  function gameFiles(doc) {
    const jeu = {
      format: 'tafl-jeu',
      version: 1,
      titre: doc.name,
      tailleTuiles: doc.tileSize,
      tuiles: 'tuiles.tafl',
      cartes: doc.maps.map((m) => ({ id: m.id, nom: m.name, fichier: mapFile(m) })),
      depart: doc.depart,
      donnees: Object.fromEntries(DATA_KINDS.map((k) => [k, dataFile(k)])),
    };
    return [
      ['tuiles.tafl', textBytes(serialize(doc, { tilesOnly: true }))],
      ...doc.maps.map((m) => [mapFile(m), textBytes(JSON.stringify(mapToJSON(doc, m)))]),
      ...DATA_KINDS.map((k) => [dataFile(k), textBytes(JSON.stringify({ format: `tafl-${k}`, version: 1, [k]: doc.data[k] }, null, 1))]),
      // jeu.json en dernier : s'il manque, le jeu ne s'ouvre pas à moitié.
      ['jeu.json', textBytes(JSON.stringify(jeu, null, 2))],
    ];
  }
  async function saveGame(doc, as) {
    let folder = doc.game.folder;
    if (!folder || as) {
      const picked = await window.tafl.pickGameFolder();
      if (!picked) return false;
      if (picked.exists && picked.folder !== doc.game.folder) {
        const go = await Dialogs.ask('Ce dossier contient déjà un jeu', `${picked.folder} a déjà un jeu.json. L'enregistrer ici remplace ce jeu par celui-ci.`, [
          { label: 'Annuler', value: false },
          { label: 'Remplacer', value: true, primary: true },
        ]);
        if (!go) return false;
      }
      folder = picked.folder;
      if (folder !== doc.game.folder) doc.game = { folder, fichiers: picked.fichiers || [] };
    }
    const files = gameFiles(doc);
    const kept = new Set(files.map(([f]) => f));
    const saved = await window.tafl.writeGame(folder, files, doc.game.fichiers.filter((f) => !kept.has(f)));
    doc.game.fichiers = files.map(([f]) => f).filter((f) => f.startsWith('cartes/'));
    doc.path = saved.path;
    doc.dirty = false;
    App.refresh();
    notify(`Jeu enregistré : ${doc.maps.length} carte(s) dans ${folder}`, 'success', 3000, [{ label: 'Afficher', run: () => window.tafl.revealFile(saved.path) }]);
    return true;
  }
  // Fichier › Enregistrer comme dossier de jeu… : un simple jeu de tuiles devient un dossier de jeu.
  async function saveAsGame(doc) {
    const before = doc.game;
    doc.game = { folder: null, fichiers: [] };
    const ok = await saveGame(doc, true);
    if (!ok) doc.game = before;
    return ok;
  }

  async function save(doc, as = false) {
    if (doc.game) return saveGame(doc, as);
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
      if (v.dedupe) target.tiles.forEach((t, i) => { if (!Doc.animated(t)) known.set(t.frames[0].join(','), i); });
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
  // Les cases de la planche : d'abord chaque tuile (sa première image), dans l'ordre ; puis, si on les
  // inclut, les autres images des tuiles animées. Ainsi le numéro d'une tuile dans la planche reste
  // celui de la carte, et Tiled retrouve les images de chaque animation par leur numéro.
  function sheetCells(doc, withFrames) {
    const cells = doc.tiles.map((t) => ({ tile: t, frame: 0 }));
    const anims = [];
    if (withFrames) {
      doc.tiles.forEach((t, i) => {
        if (!Doc.animated(t)) return;
        const ids = [i];
        for (let k = 1; k < t.frames.length; k++) { ids.push(cells.length); cells.push({ tile: t, frame: k }); }
        anims.push({ id: i, ids, duration: t.duration });
      });
    }
    return { cells, anims };
  }

  function sheetCanvas(doc, columns, scale, spacing = 0, withFrames = true) {
    const s = doc.tileSize;
    const { cells } = sheetCells(doc, withFrames);
    const n = cells.length;
    const cols = Math.max(1, Math.min(columns, n)), rows = Math.ceil(n / cols);
    const step = s * scale + spacing;
    const c = el('canvas', { width: cols * step - spacing, height: rows * step - spacing });
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    cells.forEach(({ tile, frame }, i) => g.drawImage(Doc.tileCanvas(tile, s, frame), (i % cols) * step, Math.floor(i / cols) * step, s * scale, s * scale));
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
      // Opacité et mode de fusion du calque : comme dans le jeu.
      g.globalAlpha = layer.opacite ?? 1;
      g.globalCompositeOperation = layer.fusion && layer.fusion !== 'normal' ? layer.fusion : 'source-over';
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          const t = layer.cells[y * map.width + x];
          if (t >= 0) g.drawImage(canvases[t], x * s * scale, y * s * scale, s * scale, s * scale);
        }
      }
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
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
        { key: 'frames', label: 'Ajouter les images des tuiles animées (après les tuiles)', type: 'checkbox', value: true, hidden: !doc.tiles.some(Doc.animated) },
      ],
      onInput(values, f) {
        const c = sheetCanvas(doc, values.columns, Number(values.scale), values.spacing, values.frames);
        f.card.querySelector('.modal-extra').textContent = `${c.width} × ${c.height} px, ${sheetCells(doc, values.frames).cells.length} case(s)`;
      },
    });
    if (!v) return;
    const path = await window.tafl.saveDialog({ defaultName: `${safeName(doc.name)}.png`, format: 'png' });
    if (!path) return;
    const saved = await window.tafl.writeFile(path, await canvasBytes(sheetCanvas(doc, v.columns, Number(v.scale), v.spacing, v.frames)));
    if (v.columns !== doc.columns) { doc.columns = v.columns; doc.dirty = true; App.refresh(); }
    window.tafl.writeConfig({ exportScale: Number(v.scale) }).then((c) => { App.config = c; });
    notify(`Planche exportée : ${saved.name}`, 'success', 6000, [{ label: 'Afficher', run: () => window.tafl.revealFile(saved.path) }]);
  }

  // Un PNG par tuile : [[nom du fichier, octets], …] (aussi pour Claude, qui écrit dans le projet).
  async function tileFiles(doc, scale = 1) {
    const s = doc.tileSize, files = [];
    const digits = String(doc.tiles.length - 1).length;
    for (const [i, t] of doc.tiles.entries()) {
      // Une tuile animée donne un fichier par image : 03-eau-1.png, 03-eau-2.png…
      for (let k = 0; k < t.frames.length; k++) {
        const c = el('canvas', { width: s * scale, height: s * scale });
        const g = c.getContext('2d');
        g.imageSmoothingEnabled = false;
        g.drawImage(Doc.tileCanvas(t, s, k), 0, 0, s * scale, s * scale);
        const suffix = Doc.animated(t) ? `-${k + 1}` : '';
        files.push([`${String(i).padStart(Math.max(2, digits), '0')}-${safeName(t.name)}${suffix}.png`, await canvasBytes(c)]);
      }
    }
    return files;
  }

  async function exportTiles(doc) {
    const v = await Dialogs.form({
      title: 'Exporter les tuiles séparées',
      okLabel: 'Choisir le dossier…',
      fields: [
        { type: 'info', text: 'Un fichier PNG par tuile, nommé avec son numéro et son nom (00-herbe.png, 01-chemin.png…). Une tuile animée donne un fichier par image (03-eau-1.png, 03-eau-2.png…).' },
        { key: 'scale', label: 'Agrandissement', type: 'select', value: String(App.config.exportScale || 1), choices: [['1', '×1'], ['2', '×2'], ['3', '×3'], ['4', '×4'], ['8', '×8']] },
      ],
    });
    if (!v) return;
    const folder = await window.tafl.pickFolder('Dossier où exporter les tuiles');
    if (!folder) return;
    const sep = window.tafl.platform === 'win32' ? '\\' : '/';
    for (const [name, bytes] of await tileFiles(doc, Number(v.scale))) await window.tafl.writeFile(`${folder}${sep}${name}`, bytes);
    notify(`${doc.tiles.length} tuile(s) exportée(s) dans ${folder}`, 'success', 6000, [{ label: 'Afficher', run: () => window.tafl.revealFile(folder) }]);
  }

  // Les fichiers de l'export pour Tiled : [[nom, octets], …].
  // Avec plusieurs cartes, le nom de la carte affichée s'ajoute au nom des fichiers (mon-jeu-route-1.tmj).
  const mapBase = (doc) => `${safeName(doc.name)}${doc.maps.length > 1 ? `-${doc.map.id}` : ''}`;
  async function mapFiles(doc) {
    const base = mapBase(doc);
    const s = doc.tileSize, { map } = doc;
    const sheet = sheetCanvas(doc, doc.columns, 1);
    const { cells, anims } = sheetCells(doc, true);
    const cols = Math.max(1, Math.min(doc.columns, cells.length));
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
      layers: map.layers.map((l, i) => ({ id: i + 1, name: l.name, type: 'tilelayer', x: 0, y: 0, width: map.width, height: map.height, opacity: l.opacite ?? 1, visible: l.visible, parallaxx: l.parallaxe?.x ?? 1, parallaxy: l.parallaxe?.y ?? 1, properties: [{ name: 'profondeur', type: 'string', value: l.profondeur || 'dessous' }, { name: 'fusion', type: 'string', value: l.fusion || 'normal' }], data: [...l.cells].map((c) => c + 1) })),
      tilesets: [{
        firstgid: 1, name: base, image: `${base}-tuiles.png`, imagewidth: sheet.width, imageheight: sheet.height, tilewidth: s, tileheight: s, tilecount: cells.length, columns: cols, margin: 0, spacing: 0,
        // Les tuiles animées : la suite de leurs images dans la planche, avec la durée de chacune (format de Tiled).
        ...(anims.length ? { tiles: anims.map((a) => ({ id: a.id, animation: a.ids.map((tileid) => ({ tileid, duration: a.duration })) })) } : {}),
      }],
    };
    return [
      [`${base}-tuiles.png`, await canvasBytes(sheet)],
      [`${base}.tmj`, textBytes(JSON.stringify(tmj, null, 2))],
      [`${base}-carte.png`, await canvasBytes(mapCanvas(doc, 1))],
    ];
  }

  // La carte au format de Tiled (https://www.mapeditor.org) : un fichier .tmj (JSON) qui pointe vers
  // la planche PNG posée à côté. Phaser et Godot savent le charger directement.
  async function exportMap(doc) {
    const folder = await window.tafl.pickFolder('Dossier où exporter la carte');
    if (!folder) return;
    const sep = window.tafl.platform === 'win32' ? '\\' : '/';
    const base = mapBase(doc);
    for (const [name, bytes] of await mapFiles(doc)) await window.tafl.writeFile(`${folder}${sep}${name}`, bytes);
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
    const path = await window.tafl.saveDialog({ defaultName: `${mapBase(doc)}-carte.png`, format: 'png' });
    if (!path) return;
    const saved = await window.tafl.writeFile(path, await canvasBytes(mapCanvas(doc, Number(v.scale))));
    notify(`Carte exportée : ${saved.name}`, 'success', 6000, [{ label: 'Afficher', run: () => window.tafl.revealFile(saved.path) }]);
  }

  return { open, openPath, openLoaded, openGame, save, saveAsGame, gameFiles, mapToJSON, importDialog, importSheet, exportSheet, exportTiles, exportMap, exportMapImage, serialize, deserialize, sheetCanvas, mapCanvas, canvasBytes, tileFiles, mapFiles, textBytes };
})();
