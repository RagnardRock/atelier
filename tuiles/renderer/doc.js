// Le jeu de tuiles ouvert (le « document ») et son historique d'annulation.
//
// doc = {
//   name, path,              nom affiché, fichier .tafl (null tant qu'il n'est pas enregistré)
//   game,                    null pour un simple jeu de tuiles ; pour un dossier de jeu (Tafl 0.6) :
//                            { folder, fichiers } = le dossier, et les fichiers de cartes lus à l'ouverture
//                            (pour retirer ceux des cartes supprimées). Voir ../FORMAT.md.
//   tileSize,                taille d'une tuile en pixels (16 pour un jeu façon Pokémon GBA)
//   columns,                 nombre de colonnes de la planche exportée (et du panneau Tuiles)
//   palette: ['#rrggbb'],    les couleurs du panneau Palette
//   tiles: [{ id, name, frames, duration, passage }],
//                            frames = les images de la tuile : une seule pour une tuile fixe,
//                            plusieurs pour une tuile animée (eau, fleurs…). Chaque image est un
//                            tableau de pixels (Uint8ClampedArray, 4 octets par pixel).
//                            duration = durée d'une image de l'animation, en millisecondes.
//                            passage = 'auto' | 'libre' | 'bloque' : si la tuile laisse passer le joueur.
//   maps: [carte],           les cartes du jeu (une ville, une route, l'intérieur d'une maison…)
//   mapIndex, map,           la carte affichée (map = maps[mapIndex], toujours tenu à jour)
//   depart,                  { carte, x, y, direction } : où le joueur commence le jeu (ou null)
//   data,                    les données du jeu (Tafl 0.7) : { personnages, quetes, interrupteurs },
//                            utilisées par les scripts des événements (voir events.js)
//   current,                 la tuile choisie (celle qu'on dessine, ou qu'on pose sur la carte)
//   dirty,                   modifié depuis le dernier enregistrement
// }
//
// carte = {
//   id, name, width, height,
//   layers: [{ name, visible, cells, profondeur, opacite, fusion, parallaxe }],
//            cells = numéro de tuile par case (-1 = vide) ; profondeur = 'dessous' | 'joueur' | 'dessus'
//            (sous le joueur, à sa hauteur, ou devant lui comme un toit) ; opacite de 0 à 1 ;
//            fusion = mode de fusion du canvas ('normal', 'multiply'…) ; parallaxe = { x, y } (1 = suit la carte)
//   passage,  Uint8Array, un code par case (PASSAGE plus bas) ; 0 = « auto » : la case suit ses tuiles
//   zones: [{ id, name, type, x, y, w, h, objet }],   herbes hautes, eau, grotte… (objet = objet requis)
//   warps: [{ id, x, y, carte, tx, ty, direction }],  téléporteurs : la case (x, y) mène à (tx, ty) de la carte « carte »
//   events: [événement],  personnages, panneaux, coffres… avec leur script (Tafl 0.7, voir events.js)
// }
//
// Règle importante (la même que dans Skald) : on ne modifie JAMAIS un tableau de pixels, la liste
// des images d'une tuile ou les cases d'un calque directement. On passe par Doc.pixelsForEdit(),
// Doc.tileForEdit(), Doc.layerForEdit() ou Doc.passageForEdit(), qui en font une copie au début de
// chaque action. Ainsi, l'historique garde les anciens tableaux tels quels, sans recopier tout le jeu
// à chaque coup de crayon : annuler revient juste à remettre l'ancien tableau. Les zones, les
// téléporteurs, les événements et les données du jeu, eux, sont remplacés en entier
// (map.zones = [...], doc.data = {...}), jamais modifiés sur place.

const Doc = (() => {
  let nextId = 1;
  const newId = () => nextId++;
  const DEFAULT_DURATION = 250;

  // Codes du passage, case par case (les mêmes dans les fichiers de cartes, voir ../FORMAT.md).
  const PASSAGE = { auto: 0, libre: 1, bloque: 2, rebord_bas: 3, rebord_haut: 4, rebord_gauche: 5, rebord_droite: 6 };
  const PASSAGE_NOMS = ['Auto (selon les tuiles)', 'Libre', 'Bloqué', 'Rebord ↓', 'Rebord ↑', 'Rebord ←', 'Rebord →'];
  const PROFONDEURS = [['dessous', 'Sous le joueur'], ['joueur', 'Au niveau du joueur'], ['dessus', 'Au-dessus du joueur']];
  const FUSIONS = [['normal', 'Normal'], ['multiply', 'Produit (ombres)'], ['screen', 'Superposition claire (lumières)'], ['overlay', 'Incrustation'], ['soft-light', 'Lumière douce'], ['lighter', 'Addition (lueurs)'], ['color', 'Couleur (teinte)']];
  const ZONES = [['herbes', 'Herbes hautes'], ['eau', 'Eau'], ['grotte', 'Grotte'], ['autre', 'Autre']];
  const DIRECTIONS = [['bas', 'Vers le bas'], ['haut', 'Vers le haut'], ['gauche', 'Vers la gauche'], ['droite', 'Vers la droite']];

  function emptyTile(size, name) {
    return { id: newId(), name, frames: [new Uint8ClampedArray(size * size * 4)], duration: DEFAULT_DURATION, passage: 'auto' };
  }

  function newLayer(name, width, height, props = {}) {
    return { name, visible: true, cells: new Int32Array(width * height).fill(-1), profondeur: 'dessous', opacite: 1, fusion: 'normal', parallaxe: { x: 1, y: 1 }, ...props };
  }
  // Une carte neuve : Sol et Décor sous le joueur, et un calque devant lui (haut des arbres, toits).
  function newMap({ id, name = 'Carte', width = 20, height = 15 } = {}) {
    return {
      id: id || 'carte',
      name,
      width,
      height,
      layers: [
        newLayer('Sol', width, height),
        newLayer('Décor', width, height, { profondeur: 'joueur' }),
        newLayer('Au-dessus', width, height, { profondeur: 'dessus' }),
      ],
      passage: new Uint8Array(width * height),
      zones: [],
      warps: [],
      events: [],
      // Tafl 0.8 : météo et teinte de la carte ({ meteo, intensite, teinte, force }, voir donnees.js).
      ambiance: { meteo: 'aucune', intensite: 50, teinte: '', force: 30 },
    };
  }
  // Identifiant d'une carte : son nom en minuscules sans accents (« Bourg Palette » → bourg-palette).
  // Il sert de nom de fichier (cartes/bourg-palette.json) et ne change plus ensuite.
  const slug = (name, fallback = 'carte') => String(name || '').replace(/œ/g, 'oe').replace(/Œ/g, 'Oe').replace(/æ/g, 'ae').replace(/Æ/g, 'Ae').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || fallback;
  function uniqueMapId(doc, name) {
    const base = slug(name);
    const ids = new Set(doc.maps.map((m) => m.id));
    if (!ids.has(base)) return base;
    let n = 2;
    while (ids.has(`${base}-${n}`)) n++;
    return `${base}-${n}`;
  }

  function create({ name = 'Sans titre', tileSize = 16, palette = PALETTES[0].couleurs, tiles = 1, columns = 8, mapWidth = 20, mapHeight = 15, mapName = 'Carte 1', maps = null } = {}) {
    const doc = {
      name,
      path: null,
      game: null,
      tileSize,
      columns,
      palette: [...palette],
      tiles: [],
      maps: maps || [newMap({ id: slug(mapName), name: mapName, width: mapWidth, height: mapHeight })],
      mapIndex: 0,
      map: null,
      depart: null,
      data: Events.emptyData(),
      current: 0,
      dirty: false,
      undo: [],
      redo: [],
      editing: null,
    };
    doc.map = doc.maps[0];
    for (let i = 0; i < tiles; i++) doc.tiles.push(emptyTile(tileSize, `tuile-${i + 1}`));
    return doc;
  }

  // --- Cartes ---
  function selectMap(doc, index) {
    doc.mapIndex = clamp(index, 0, doc.maps.length - 1);
    doc.map = doc.maps[doc.mapIndex];
  }
  const mapById = (doc, id) => doc.maps.find((m) => m.id === id) || null;
  const eventAt = (map, x, y) => map.events.find((e) => e.x === x && e.y === y) || null;

  // --- Historique ---
  // Une photo de l'état : les références vers les tableaux (pas de copie, voir la règle plus haut).
  const copyMap = (m) => ({ ...m, layers: m.layers.map((l) => ({ ...l })) });
  function snapshot(doc, label) {
    return {
      label,
      tileSize: doc.tileSize,
      columns: doc.columns,
      palette: [...doc.palette],
      tiles: doc.tiles.map((t) => ({ ...t })),
      maps: doc.maps.map(copyMap),
      mapIndex: doc.mapIndex,
      depart: doc.depart,
      data: doc.data,
      current: doc.current,
    };
  }
  function restore(doc, s) {
    doc.tileSize = s.tileSize;
    doc.columns = s.columns;
    doc.palette = [...s.palette];
    doc.tiles = s.tiles.map((t) => ({ ...t }));
    doc.maps = s.maps.map(copyMap);
    selectMap(doc, s.mapIndex);
    doc.depart = s.depart;
    doc.data = s.data;
    doc.current = clamp(s.current, 0, Math.max(0, doc.tiles.length - 1));
  }

  // Début d'une action (un coup de crayon, un miroir, une suppression…) : on garde l'état d'avant.
  function begin(doc, label) {
    doc.undo.push(snapshot(doc, label));
    const max = App.config?.historySteps || 60;
    while (doc.undo.length > max) doc.undo.shift();
    doc.redo = [];
    doc.editing = { tiles: new Set(), frames: new Set(), layers: new Set(), passages: new Set() };
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
  // Le calque n° index d'une carte (la carte affichée, sinon), avec ses cases prêtes à être modifiées.
  function layerForEdit(doc, index, map = doc.map) {
    if (!doc.editing) begin(doc, 'Modifier la carte');
    const key = `${map.id}:${index}`;
    const layer = map.layers[index];
    if (!doc.editing.layers.has(key)) {
      layer.cells = layer.cells.slice();
      doc.editing.layers.add(key);
    }
    return layer;
  }
  // Le passage d'une carte, prêt à être modifié.
  function passageForEdit(doc, map = doc.map) {
    if (!doc.editing) begin(doc, 'Modifier le passage');
    if (!doc.editing.passages.has(map.id)) {
      map.passage = map.passage.slice();
      doc.editing.passages.add(map.id);
    }
    return map.passage;
  }

  // Le passage final de chaque case (ce que le moteur du jeu utilise) : un code de 1 à 6, jamais « auto ».
  // - si la case a un passage peint (pinceau Passage), c'est lui ;
  // - sinon, on regarde ses tuiles du calque le plus haut au plus bas, en sautant les calques au-dessus
  //   du joueur (un toit ne bloque pas) : la première tuile qui dit « libre » ou « bloque » décide ;
  // - sinon la case est libre.
  function collisions(doc, map = doc.map) {
    const out = new Uint8Array(map.width * map.height);
    const layers = map.layers.filter((l) => l.profondeur !== 'dessus').reverse();
    for (let i = 0; i < out.length; i++) {
      let v = map.passage[i];
      if (!v) {
        for (const l of layers) {
          const t = doc.tiles[l.cells[i]];
          if (t && t.passage && t.passage !== 'auto') { v = PASSAGE[t.passage]; break; }
        }
      }
      out[i] = v || PASSAGE.libre;
    }
    return out;
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
    for (const map of doc.maps) {
      map.layers.forEach((layer, li) => {
        if (!layer.cells.some((c) => c >= 0)) return;
        const cells = layerForEdit(doc, li, map).cells;
        for (let i = 0; i < cells.length; i++) if (cells[i] >= 0) cells[i] = fn(cells[i]);
      });
      // L'apparence des événements montre aussi une tuile.
      if (map.events.some((e) => e.apparence.tuile >= 0)) map.events = map.events.map((e) => (e.apparence.tuile >= 0 ? { ...e, apparence: { ...e.apparence, tuile: fn(e.apparence.tuile) } } : e));
    }
    if (doc.data.personnages.some((p) => p.tuile >= 0)) doc.data = { ...doc.data, personnages: doc.data.personnages.map((p) => (p.tuile >= 0 ? { ...p, tuile: fn(p.tuile) } : p)) };
  }
  // Combien de cases (toutes cartes confondues) utilisent la tuile n° index.
  const tileUses = (doc, index) => doc.maps.reduce((n, m) => n + m.layers.reduce((k, l) => k + l.cells.filter((c) => c === index).length, 0), 0);

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

  // Changer la taille de la carte (le contenu reste en haut à gauche). Les zones sont recoupées, les
  // téléporteurs et les événements sortis de la carte retirés.
  function resizeMap(doc, width, height, map = doc.map) {
    const copy = (src, Type, empty) => {
      const out = new Type(width * height).fill(empty);
      for (let y = 0; y < Math.min(height, map.height); y++) {
        for (let x = 0; x < Math.min(width, map.width); x++) out[y * width + x] = src[y * map.width + x];
      }
      return out;
    };
    map.layers = map.layers.map((layer) => ({ ...layer, cells: copy(layer.cells, Int32Array, -1) }));
    map.passage = copy(map.passage, Uint8Array, 0);
    map.zones = map.zones
      .map((z) => ({ ...z, w: Math.min(z.w, width - z.x), h: Math.min(z.h, height - z.y) }))
      .filter((z) => z.x < width && z.y < height && z.w > 0 && z.h > 0);
    map.warps = map.warps.filter((w) => w.x < width && w.y < height);
    map.events = map.events.filter((e) => e.x < width && e.y < height);
    map.width = width;
    map.height = height;
    // Les calques et le passage viennent d'être remplacés : ils sont déjà des copies pour cette action.
    if (doc.editing) {
      map.layers.forEach((_l, i) => doc.editing.layers.add(`${map.id}:${i}`));
      doc.editing.passages.add(map.id);
    }
  }

  // Ajouter une carte (vide, ou la copie d'une autre) juste après la carte affichée ; elle devient la carte affichée.
  function addMap(doc, { name, width = doc.map.width, height = doc.map.height, copyOf = null } = {}) {
    const id = uniqueMapId(doc, name);
    const map = copyOf
      ? { ...copyOf, id, name, layers: copyOf.layers.map((l) => ({ ...l, parallaxe: { ...l.parallaxe } })), zones: copyOf.zones.map((z) => ({ ...z, rencontres: (z.rencontres || []).map((r) => ({ ...r })) })), ambiance: { ...copyOf.ambiance }, warps: copyOf.warps.map((w) => ({ ...w })), events: structuredClone(copyOf.events) }
      : newMap({ id, name, width, height });
    doc.maps.splice(doc.mapIndex + 1, 0, map);
    selectMap(doc, doc.mapIndex + 1);
    return map;
  }
  // Supprimer une carte : les téléporteurs qui y menaient sont retirés, le départ aussi s'il y était.
  function removeMap(doc, index) {
    const [gone] = doc.maps.splice(index, 1);
    for (const m of doc.maps) if (m.warps.some((w) => w.carte === gone.id)) m.warps = m.warps.filter((w) => w.carte !== gone.id);
    if (doc.depart?.carte === gone.id) doc.depart = null;
    selectMap(doc, Math.min(index, doc.maps.length - 1));
  }
  function moveMap(doc, from, to) {
    const [m] = doc.maps.splice(from, 1);
    doc.maps.splice(to, 0, m);
    selectMap(doc, to);
  }

  // Calques de la carte affichée. at = place dans la liste (0 = tout en dessous).
  function addLayer(doc, at, props = {}) {
    const map = doc.map;
    map.layers = [...map.layers];
    map.layers.splice(at, 0, newLayer(props.name || `Calque ${map.layers.length + 1}`, map.width, map.height, props));
    return at;
  }
  function removeLayer(doc, index) {
    const map = doc.map;
    map.layers = map.layers.filter((_l, i) => i !== index);
  }
  function moveLayer(doc, from, to) {
    const map = doc.map;
    map.layers = [...map.layers];
    const [l] = map.layers.splice(from, 1);
    map.layers.splice(to, 0, l);
  }
  function setLayer(doc, index, props) {
    const map = doc.map;
    map.layers = [...map.layers];
    map.layers[index] = { ...map.layers[index], ...props };
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

  return { create, newMap, newLayer, slug, uniqueMapId, selectMap, mapById, eventAt, addMap, removeMap, moveMap, addLayer, removeLayer, moveLayer, setLayer, passageForEdit, collisions, tileUses, PASSAGE, PASSAGE_NOMS, PROFONDEURS, FUSIONS, ZONES, DIRECTIONS, begin, change, undo, redo, tileForEdit, pixelsForEdit, layerForEdit, tileCanvas, touch, addTile, removeTile, moveTile, addFrame, removeFrame, moveFrame, frameCount, animated, frameAt, transformTile, TRANSFORMS, resizeTiles, resizeMap, replaceColor, uniqueName, newId, DEFAULT_DURATION };
})();
