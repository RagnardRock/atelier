// Le jeu de tuiles ouvert (le « document ») et son historique d'annulation.
//
// doc = {
//   name, path,              nom affiché, fichier .tafl (null tant qu'il n'est pas enregistré)
//   tileSize,                taille d'une tuile en pixels (16 pour un jeu façon Pokémon GBA)
//   columns,                 nombre de colonnes de la planche exportée (et du panneau Tuiles)
//   palette: ['#rrggbb'],    les couleurs du panneau Palette
//   tiles: [{ id, name, data }],  data = les pixels (Uint8ClampedArray, 4 octets par pixel)
//   map: { width, height, layers: [{ name, visible, cells }] },  cells = numéro de tuile par case (-1 = vide)
//   current,                 la tuile choisie (celle qu'on dessine, ou qu'on pose sur la carte)
//   dirty,                   modifié depuis le dernier enregistrement
// }
//
// Règle importante (la même que dans Skald) : on ne modifie JAMAIS un tableau data ou cells
// directement. On passe par Doc.tileForEdit() / Doc.layerForEdit(), qui en font une copie au début
// de chaque action. Ainsi, l'historique garde les anciens tableaux tels quels, sans recopier
// tout le jeu de tuiles à chaque coup de crayon : annuler revient juste à remettre l'ancien tableau.

const Doc = (() => {
  let nextId = 1;
  const newId = () => nextId++;

  function emptyTile(size, name) {
    return { id: newId(), name, data: new Uint8ClampedArray(size * size * 4) };
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
      tiles: doc.tiles.map((t) => ({ id: t.id, name: t.name, data: t.data })),
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
    doc.editing = { tiles: new Set(), layers: new Set() };
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

  // La tuile n° index, prête à être modifiée (copiée une seule fois par action).
  function tileForEdit(doc, index) {
    const tile = doc.tiles[index];
    if (!doc.editing) begin(doc, 'Modifier la tuile');
    if (!doc.editing.tiles.has(tile.id)) {
      tile.data = tile.data.slice();
      doc.editing.tiles.add(tile.id);
    }
    return tile;
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

  // --- Image d'une tuile ---
  // Chaque tuile garde un petit canvas à sa taille réelle, refait seulement quand ses pixels changent.
  // C'est lui qu'on dessine (agrandi, sans lissage) dans l'éditeur, le panneau Tuiles et la carte.
  const canvases = new WeakMap();
  function tileCanvas(tile, size) {
    let entry = canvases.get(tile);
    if (!entry || entry.canvas.width !== size) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      entry = { canvas, data: null, version: -1 };
      canvases.set(tile, entry);
    }
    if (entry.data !== tile.data || entry.version !== (tile.version || 0)) {
      entry.canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(tile.data), size, size), 0, 0);
      entry.data = tile.data;
      entry.version = tile.version || 0;
    }
    return entry.canvas;
  }
  // Appelé après avoir changé des pixels pendant une action (le canvas sera refait).
  const touch = (tile) => { tile.version = (tile.version || 0) + 1; };

  // --- Opérations sur les tuiles ---
  function addTile(doc, data = null, name = null, at = doc.tiles.length) {
    const tile = emptyTile(doc.tileSize, name || uniqueName(doc, 'tuile'));
    if (data) tile.data = data;
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

  // Transformations d'une tuile : chaque pixel (x, y) prend la valeur du pixel source(x, y).
  function transformTile(doc, index, source) {
    const s = doc.tileSize;
    const tile = tileForEdit(doc, index);
    const old = tile.data.slice();
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const [sx, sy] = source(x, y, s);
        const o = (y * s + x) * 4, so = (sy * s + sx) * 4;
        tile.data[o] = old[so]; tile.data[o + 1] = old[so + 1]; tile.data[o + 2] = old[so + 2]; tile.data[o + 3] = old[so + 3];
      }
    }
    touch(tile);
  }
  const TRANSFORMS = {
    flipH: (x, y, s) => [s - 1 - x, y],
    flipV: (x, y, s) => [x, s - 1 - y],
    rotate: (x, y, s) => [y, s - 1 - x], // quart de tour dans le sens des aiguilles d'une montre
    // Décalage d'une demi-tuile, en boucle : les bords se retrouvent au milieu, pour vérifier les raccords.
    half: (x, y, s) => [(x + s / 2) % s, (y + s / 2) % s],
  };

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
      let tile = null;
      for (let o = 0; o < t.data.length; o += 4) {
        if (packRgba(t.data[o], t.data[o + 1], t.data[o + 2], t.data[o + 3]) !== from) continue;
        tile ||= tileForEdit(doc, i);
        tile.data[o] = r; tile.data[o + 1] = g; tile.data[o + 2] = b;
      }
      if (tile) touch(tile);
    });
  }

  return { create, begin, change, undo, redo, tileForEdit, layerForEdit, tileCanvas, touch, addTile, removeTile, moveTile, transformTile, TRANSFORMS, resizeMap, replaceColor, uniqueName, newId };
})();
