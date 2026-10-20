// Le jeu de tuiles ouvert (le « document ») et son historique d'annulation.
//
// doc = {
//   name, path,              nom affiché, fichier .tafl (null tant qu'il n'est pas enregistré)
//   tileSize,                taille d'une tuile en pixels (16 pour un jeu façon Pokémon GBA)
//   columns,                 nombre de colonnes de la planche exportée (et du panneau Tuiles)
//   palette: ['#rrggbb'],    les couleurs du panneau Palette
//   tiles: [{ id, name, frames, duration }],
//                            frames = les images de la tuile : une seule pour une tuile fixe,
//                            plusieurs pour une tuile animée (eau, fleurs…). Chaque image est un
//                            tableau de pixels (Uint8ClampedArray, 4 octets par pixel).
//                            duration = durée d'une image de l'animation, en millisecondes.
//   map: { width, height, layers: [{ name, visible, cells }] },  cells = numéro de tuile par case (-1 = vide)
//   current,                 la tuile choisie (celle qu'on dessine, ou qu'on pose sur la carte)
//   dirty,                   modifié depuis le dernier enregistrement
// }
//
// Règle importante (la même que dans Skald) : on ne modifie JAMAIS un tableau de pixels, la liste
// des images d'une tuile ou les cases d'un calque directement. On passe par Doc.pixelsForEdit(),
// Doc.tileForEdit() ou Doc.layerForEdit(), qui en font une copie au début de chaque action. Ainsi,
// l'historique garde les anciens tableaux tels quels, sans recopier tout le jeu de tuiles à chaque
// coup de crayon : annuler revient juste à remettre l'ancien tableau.

const Doc = (() => {
  let nextId = 1;
  const newId = () => nextId++;
  const DEFAULT_DURATION = 250;

  function emptyTile(size, name) {
    return { id: newId(), name, frames: [new Uint8ClampedArray(size * size * 4)], duration: DEFAULT_DURATION };
  }

  function create({ name = 'Sans titre', tileSize = 16, palette = PALETTES[0].couleurs, tiles = 1, columns = 8, mapWidth = 20, mapHeight = 15 } = {}) {
    const doc = {
      name,
      path: null,
      tileSize,
      columns,
      palette: [...palette],
      tiles: [],
      map: { width: mapWidth, height: mapHeight, layers: [] },
      current: 0,
      dirty: false,
      undo: [],
      redo: [],
      editing: null,
    };
    for (let i = 0; i < tiles; i++) doc.tiles.push(emptyTile(tileSize, `tuile-${i + 1}`));
    doc.map.layers = [
      { name: 'Sol', visible: true, cells: new Int32Array(mapWidth * mapHeight).fill(-1) },
      { name: 'Décor', visible: true, cells: new Int32Array(mapWidth * mapHeight).fill(-1) },
    ];
    return doc;
  }

  // --- Historique ---
  // Une photo de l'état : les références vers les tableaux (pas de copie, voir la règle plus haut).
  function snapshot(doc, label) {
    return {
      label,
      tileSize: doc.tileSize,
      columns: doc.columns,
      palette: [...doc.palette],
      tiles: doc.tiles.map((t) => ({ ...t })),
      map: { width: doc.map.width, height: doc.map.height, layers: doc.map.layers.map((l) => ({ ...l })) },
      current: doc.current,
    };
  }
  function restore(doc, s) {
    doc.tileSize = s.tileSize;
    doc.columns = s.columns;
    doc.palette = [...s.palette];
    doc.tiles = s.tiles.map((t) => ({ ...t }));
    doc.map = { width: s.map.width, height: s.map.height, layers: s.map.layers.map((l) => ({ ...l })) };
    doc.current = clamp(s.current, 0, Math.max(0, doc.tiles.length - 1));
  }

  // Début d'une action (un coup de crayon, un miroir, une suppression…) : on garde l'état d'avant.
  function begin(doc, label) {
    doc.undo.push(snapshot(doc, label));
    const max = App.config?.historySteps || 60;
    while (doc.undo.length > max) doc.undo.shift();
    doc.redo = [];
    doc.editing = { tiles: new Set(), frames: new Set(), layers: new Set() };
    doc.dirty = true;
  }
  // Action faite d'un bloc : begin + la modification + rafraîchir.
  function change(doc, label, fn) {
    begin(doc, label);
    try {
      fn();
    } finally {
      doc.editing = null; // action finie : la suivante recopiera de nouveau les tableaux qu'elle touche
      App.refresh();
    }
  }

  function undo(doc) {
    const s = doc.undo.pop();
    if (!s) return null;
    doc.redo.push(snapshot(doc, s.label));
    restore(doc, s);
    doc.dirty = true;
    doc.editing = null;
    return s.label;
  }
  function redo(doc) {
    const s = doc.redo.pop();
    if (!s) return null;
    doc.undo.push(snapshot(doc, s.label));
    restore(doc, s);
    doc.dirty = true;
    doc.editing = null;
    return s.label;
  }

  // La tuile n° index, avec sa liste d'images prête à être modifiée (ajouter, retirer une image…).
  function tileForEdit(doc, index) {
    const tile = doc.tiles[index];
    if (!doc.editing) begin(doc, 'Modifier la tuile');
    if (!doc.editing.tiles.has(tile.id)) {
      tile.frames = tile.frames.slice();
      doc.editing.tiles.add(tile.id);
    }
    return tile;
  }
  // Les pixels de l'image n° frame de la tuile n° index, prêts à être modifiés (copiés une seule fois par action).
  function pixelsForEdit(doc, index, frame) {
    const tile = tileForEdit(doc, index);
    const k = clamp(frame, 0, tile.frames.length - 1);
    const key = `${tile.id}:${k}`;
    if (!doc.editing.frames.has(key)) {
      tile.frames[k] = tile.frames[k].slice();
      doc.editing.frames.add(key);
    }
    return tile.frames[k];
  }
  function layerForEdit(doc, index) {
    const layer = doc.map.layers[index];
    if (!doc.editing) begin(doc, 'Modifier la carte');
    if (!doc.editing.layers.has(index)) {
      layer.cells = layer.cells.slice();
      doc.editing.layers.add(index);
    }
    return layer;
  }

  // --- Animation ---
  const frameCount = (tile) => tile.frames.length;
  const animated = (tile) => tile.frames.length > 1;
  // L'image à montrer à l'instant « time » (en ms) : toutes les tuiles animées partagent la même horloge,
  // comme dans un jeu, pour que l'eau de toute la carte ondule en même temps.
  const frameAt = (tile, time) => (tile.frames.length > 1 ? Math.floor(time / Math.max(16, tile.duration || DEFAULT_DURATION)) % tile.frames.length : 0);

  // --- Image d'une tuile ---
  // Chaque image de chaque tuile garde un petit canvas à sa taille réelle, refait seulement quand ses
  // pixels changent. C'est lui qu'on dessine (agrandi, sans lissage) dans l'éditeur, les panneaux et la carte.
  const canvases = new WeakMap(); // tableau de pixels → { canvas, version }
  function tileCanvas(tile, size, frame = 0) {
    const data = tile.frames[clamp(frame, 0, tile.frames.length - 1)];
    let entry = canvases.get(data);
    if (!entry || entry.canvas.width !== size) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      entry = { canvas, version: -1 };
      canvases.set(data, entry);
    }
    if (entry.version !== (tile.version || 0)) {
      entry.canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data), size, size), 0, 0);
      entry.version = tile.version || 0;
    }
    return entry.canvas;
  }
  // Appelé après avoir changé des pixels pendant une action (les canvas de la tuile seront refaits).
  const touch = (tile) => { tile.version = (tile.version || 0) + 1; };

  // --- Opérations sur les tuiles ---
  function addTile(doc, frames = null, name = null, at = doc.tiles.length, duration = DEFAULT_DURATION) {
    const tile = emptyTile(doc.tileSize, name || uniqueName(doc, 'tuile'));
    if (frames) tile.frames = Array.isArray(frames) ? frames : [frames];
    tile.duration = duration;
    doc.tiles.splice(at, 0, tile);
    // Insérée au milieu : les cases de la carte qui pointent après elle se décalent d'un cran.
    if (at < doc.tiles.length - 1) remapCells(doc, (i) => (i >= at ? i + 1 : i));
    return at;
  }
  function uniqueName(doc, base) {
    const names = new Set(doc.tiles.map((t) => t.name));
    let n = doc.tiles.length + 1;
    while (names.has(`${base}-${n}`)) n++;
    return `${base}-${n}`;
  }
  function removeTile(doc, index) {
    doc.tiles.splice(index, 1);
    // Les cases qui utilisaient cette tuile deviennent vides ; les suivantes reculent d'un cran.
    remapCells(doc, (i) => (i === index ? -1 : i > index ? i - 1 : i));
    if (!doc.tiles.length) doc.tiles.push(emptyTile(doc.tileSize, 'tuile-1'));
    doc.current = clamp(doc.current, 0, doc.tiles.length - 1);
  }
  function moveTile(doc, from, to) {
    const [tile] = doc.tiles.splice(from, 1);
    doc.tiles.splice(to, 0, tile);
    remapCells(doc, (i) => {
      if (i === from) return to;
      if (from < to && i > from && i <= to) return i - 1;
      if (from > to && i >= to && i < from) return i + 1;
      return i;
    });
    doc.current = to;
  }
  function remapCells(doc, fn) {
    doc.map.layers.forEach((layer, li) => {
      if (!layer.cells.some((c) => c >= 0)) return;
      const cells = layerForEdit(doc, li).cells;
      for (let i = 0; i < cells.length; i++) if (cells[i] >= 0) cells[i] = fn(cells[i]);
    });
  }

  // Images d'une tuile animée.
  function addFrame(doc, index, at, data) {
    const tile = tileForEdit(doc, index);
    tile.frames.splice(at, 0, data);
    touch(tile);
    return at;
  }
  function removeFrame(doc, index, k) {
    const tile = tileForEdit(doc, index);
    if (tile.frames.length <= 1) return 0;
    tile.frames.splice(k, 1);
    touch(tile);
    return clamp(k, 0, tile.frames.length - 1);
  }
  function moveFrame(doc, index, from, to) {
    const tile = tileForEdit(doc, index);
    const [f] = tile.frames.splice(from, 1);
    tile.frames.splice(to, 0, f);
    touch(tile);
  }

  // Transformations d'une tuile (toutes ses images) : chaque pixel (x, y) prend la valeur du pixel source(x, y).
  function transformTile(doc, index, source) {
    const s = doc.tileSize;
    const tile = doc.tiles[index];
    for (let k = 0; k < tile.frames.length; k++) {
      const data = pixelsForEdit(doc, index, k);
      const old = data.slice();
      for (let y = 0; y < s; y++) {
        for (let x = 0; x < s; x++) {
          const [sx, sy] = source(x, y, s);
          const o = (y * s + x) * 4, so = (sy * s + sx) * 4;
          data[o] = old[so]; data[o + 1] = old[so + 1]; data[o + 2] = old[so + 2]; data[o + 3] = old[so + 3];
        }
      }
    }
    touch(tile);
  }
  const TRANSFORMS = {
    flipH: (x, y, s) => [s - 1 - x, y],
    flipV: (x, y, s) => [x, s - 1 - y],
    rotate: (x, y, s) => [y, s - 1 - x], // quart de tour dans le sens des aiguilles d'une montre
    // Décalage d'une demi-tuile, en boucle : les bords se retrouvent au milieu, pour vérifier les raccords.
    half: (x, y, s) => [(x + Math.floor(s / 2)) % s, (y + Math.floor(s / 2)) % s],
  };

  // Changer la taille des tuiles du jeu (toutes les tuiles, toutes leurs images).
  // - 'scale' : chaque pixel est agrandi ou réduit (16 → 32 : chaque pixel devient un carré de 2 × 2) ;
  // - 'canvas' : les pixels gardent leur taille ; la tuile est recadrée ou entourée de transparent, centrée.
  function resizeTiles(doc, size, how) {
    const old = doc.tileSize;
    const off = Math.floor((size - old) / 2);
    doc.tiles.forEach((t, i) => {
      const tile = tileForEdit(doc, i);
      tile.frames = t.frames.map((src) => {
        const data = new Uint8ClampedArray(size * size * 4);
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            const sx = how === 'scale' ? Math.floor((x * old) / size) : x - off;
            const sy = how === 'scale' ? Math.floor((y * old) / size) : y - off;
            if (sx < 0 || sy < 0 || sx >= old || sy >= old) continue;
            const o = (y * size + x) * 4, so = (sy * old + sx) * 4;
            data[o] = src[so]; data[o + 1] = src[so + 1]; data[o + 2] = src[so + 2]; data[o + 3] = src[so + 3];
          }
        }
        return data;
      });
      touch(tile);
    });
    doc.tileSize = size;
  }

  // Changer la taille de la carte (le contenu reste en haut à gauche).
  function resizeMap(doc, width, height) {
    const { map } = doc;
    map.layers = map.layers.map((layer) => {
      const cells = new Int32Array(width * height).fill(-1);
      for (let y = 0; y < Math.min(height, map.height); y++) {
        for (let x = 0; x < Math.min(width, map.width); x++) cells[y * width + x] = layer.cells[y * map.width + x];
      }
      return { ...layer, cells };
    });
    map.width = width;
    map.height = height;
    // Les calques viennent d'être remplacés : ils sont déjà des copies pour cette action.
    if (doc.editing) map.layers.forEach((_l, i) => doc.editing.layers.add(i));
  }

  // Remplacer une couleur par une autre dans toutes les tuiles (modifier une couleur de la palette).
  function replaceColor(doc, fromHex, toHex) {
    const from = packHex(fromHex);
    const [r, g, b] = hexToRgba(toHex);
    doc.tiles.forEach((t, i) => {
      let changed = false;
      t.frames.forEach((frame, k) => {
        let data = null;
        for (let o = 0; o < frame.length; o += 4) {
          if (packRgba(frame[o], frame[o + 1], frame[o + 2], frame[o + 3]) !== from) continue;
          data ||= pixelsForEdit(doc, i, k);
          data[o] = r; data[o + 1] = g; data[o + 2] = b;
        }
        if (data) changed = true;
      });
      if (changed) touch(doc.tiles[i]);
    });
  }

  return { create, begin, change, undo, redo, tileForEdit, pixelsForEdit, layerForEdit, tileCanvas, touch, addTile, removeTile, moveTile, addFrame, removeFrame, moveFrame, frameCount, animated, frameAt, transformTile, TRANSFORMS, resizeTiles, resizeMap, replaceColor, uniqueName, newId, DEFAULT_DURATION };
})();
