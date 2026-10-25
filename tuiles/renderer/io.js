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
      // Tafl 0.11 : le groupe dans la liste des cartes, intérieur ou non, et la place sur la carte monde.
      groupe: map.groupe || '',
      interieur: Boolean(map.interieur),
      monde: map.monde ? { x: map.monde.x, y: map.monde.y } : null,
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
    map.groupe = String(data.groupe || '').trim().slice(0, 60);
    map.interieur = data.interieur === true;
    map.monde = Number.isFinite(Number(data.monde?.x)) && Number.isFinite(Number(data.monde?.y)) ? { x: int(data.monde.x), y: int(data.monde.y) } : null;
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
        if (t.categorie) tile.categorie = t.categorie;
        if (t.lumiere) tile.lumiere = t.lumiere; // Tafl 0.29 : la tuile éclaire (Saga 0.11)
        return tile;
      }),
    };
    // Tafl 0.10 : les tampons (objets de plusieurs tuiles), avec les tuiles (donc aussi dans tuiles.tafl).
    if (doc.stamps.length) data.tampons = doc.stamps.map((st) => ({ nom: st.name, largeur: st.w, hauteur: st.h, dessus: st.dessus, cases: st.cells }));
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
      doc.tiles.push({ id: Doc.newId(), name: t.name || Doc.uniqueName(doc, 'tuile'), frames, duration: Number(t.duration) || Doc.DEFAULT_DURATION, passage: ['libre', 'bloque'].includes(t.passage) ? t.passage : 'auto', categorie: String(t.categorie || '').slice(0, 60), ...(t.lumiere ? { lumiere: Donnees.normLumiere(t.lumiere) } : {}) });
    }
    if (!doc.tiles.length) Doc.addTile(doc);
    doc.stamps = (Array.isArray(data.tampons) ? data.tampons : []).map((t) => {
      const w = clamp(int(t?.largeur, 1), 1, 64), h = clamp(int(t?.hauteur, 1), 1, 64);
      const cells = Array.from({ length: w * h }, (_v, i) => (Number.isInteger(t.cases?.[i]) && t.cases[i] >= 0 && t.cases[i] < doc.tiles.length ? t.cases[i] : -1));
      return Doc.newStamp(doc, { name: String(t.nom || 'tampon'), w, h, cells, dessus: int(t.dessus) });
    }).filter((st) => st.cells.some((c) => c >= 0));
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
    doc.tests = Array.isArray(jeu.tests) ? jeu.tests.filter((t) => t && typeof t === 'object' && !Array.isArray(t)) : [];
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
      // Tafl 0.27 : les états de départ enregistrés du test rapide (Saga n'en a pas besoin pour jouer).
      tests: doc.tests || [],
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
    // Tafl 0.30 : ce qui est en cours dans une page (Données, Événements) s'applique d'abord.
    if (!(await Espaces.appliquer())) return false;
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
  // Découpe l'image en tuiles (le calcul est dans planche.js). Options : la taille des tuiles, la marge
  // et l'espacement, la zone de l'image, le fond à rendre transparent (damier ou couleur unie peints
  // dans l'image), sauter les cases vides, ne garder qu'un exemplaire des tuiles identiques, faire un
  // tampon de chaque objet de plusieurs tuiles, et refaire l'image sous forme de carte.
  // --- Planche nommée (Tafl 0.20) ---
  // Exporter la planche nommée écrit planche.png (les tuiles en grille, taille réelle, sans espace) et
  // planche.tuiles.json : pour chaque case de la grille, le nom, le passage, la catégorie et les autres
  // images d'une tuile animée ; et les tampons, en cases de la grille. Importer planche.png relit le
  // .tuiles.json : les tuiles arrivent nommées dans n'importe quel jeu (même celles déjà présentes,
  // grâce à « une seule fois chaque tuile identique »). Le travail de nommer n'est fait qu'une fois.
  const NOMS_FORMAT = 'tafl-planche-nommee';
  const sansNom = (t) => /^tuile-\d+$/.test(t.name);

  function plancheNommee(doc, { categorie = null, colonnes = doc.columns } = {}) {
    const s = doc.tileSize;
    const liste = doc.tiles.map((t, i) => [t, i]).filter(([t]) => categorie === null || (t.categorie || '') === categorie);
    if (!liste.length) throw new Error(categorie === null ? 'Aucune tuile à exporter.' : `Aucune tuile dans la catégorie « ${categorie} ».`);
    const cols = clamp(Math.round(colonnes) || 8, 1, 64);
    const c = el('canvas', { width: Math.min(cols, liste.length) * s, height: Math.ceil(liste.length / cols) * s });
    const g = c.getContext('2d');
    const position = new Map(); // numéro de tuile -> case de la grille
    liste.forEach(([t, i], n) => { position.set(i, n); g.drawImage(Doc.tileCanvas(t, s, 0), (n % cols) * s, Math.floor(n / cols) * s); });
    const tuiles = liste.map(([t]) => ({
      ...(sansNom(t) ? {} : { nom: t.name }),
      ...(t.passage && t.passage !== 'auto' ? { passage: t.passage } : {}),
      ...(t.categorie ? { categorie: t.categorie } : {}),
      ...(t.lumiere ? { lumiere: t.lumiere } : {}),
      ...(Doc.animated(t) ? { images: t.frames.slice(1).map((_f, k) => Doc.tileCanvas(t, s, k + 1).toDataURL('image/png')), duree: t.duration } : {}),
    }));
    // Un tampon part avec la planche si toutes ses tuiles y sont.
    const tampons = doc.stamps.filter((st) => st.cells.every((k) => k < 0 || position.has(k)))
      .map((st) => ({ nom: st.name, largeur: st.w, hauteur: st.h, dessus: st.dessus, cases: st.cells.map((k) => (k < 0 ? -1 : position.get(k))) }));
    const json = { format: NOMS_FORMAT, version: 1, outil: 'Tafl', taille: s, colonnes: cols, tuiles, tampons };
    return { canvas: c, json, nombre: liste.length, nommees: tuiles.filter((t) => t.nom).length };
  }

  async function lireNoms(file, doc) {
    if (!file.path || !window.tafl.nomsPlanche) return null;
    const d = await window.tafl.nomsPlanche(file.path);
    if (!d || d.format !== NOMS_FORMAT || !Array.isArray(d.tuiles)) return null;
    const taille = clamp(Math.round(d.taille) || 16, 4, 128);
    if (doc && doc.tileSize !== taille) {
      notify(`${file.name} est une planche nommée en tuiles de ${taille} px, mais le jeu ouvert est en ${doc.tileSize} px : les noms ne pourront pas être repris.`, 'warning', 8000);
    }
    // Les autres images des tuiles animées, décodées d'avance (l'import, lui, ne peut pas attendre).
    const toile = el('canvas', { width: taille, height: taille });
    const g = toile.getContext('2d', { willReadFrequently: true });
    const tuiles = [];
    for (const t of d.tuiles.slice(0, 65536)) {
      const images = [];
      for (const src of (Array.isArray(t?.images) ? t.images.slice(0, 15) : [])) {
        try {
          g.clearRect(0, 0, taille, taille);
          g.drawImage(await loadImage(String(src)), 0, 0);
          images.push(g.getImageData(0, 0, taille, taille).data);
        } catch { /* image illisible : la tuile reste fixe */ }
      }
      tuiles.push({
        nom: typeof t?.nom === 'string' ? t.nom.trim().slice(0, 80) : '',
        passage: ['libre', 'bloque'].includes(t?.passage) ? t.passage : null,
        categorie: typeof t?.categorie === 'string' ? t.categorie.trim().slice(0, 60) : '',
        lumiere: Donnees.normLumiere(t?.lumiere),
        images,
        duree: clamp(Math.round(t?.duree) || Doc.DEFAULT_DURATION, 30, 5000),
      });
    }
    const tampons = (Array.isArray(d.tampons) ? d.tampons : []).slice(0, 2000).map((t) => ({
      nom: String(t?.nom || 'tampon').slice(0, 80),
      w: clamp(Math.round(t?.largeur) || 1, 1, 64),
      h: clamp(Math.round(t?.hauteur) || 1, 1, 64),
      dessus: Math.max(0, Math.round(t?.dessus) || 0),
      cases: Array.isArray(t?.cases) ? t.cases : [],
    }));
    return { taille, colonnes: clamp(Math.round(d.colonnes) || 1, 1, 4096), tuiles, tampons };
  }

  // Après le découpage : la case (cx, cy) de la zone est la case n de la planche nommée, et index[…]
  // le numéro de tuile qu'elle a donné (nouvelle, ou déjà dans le jeu). Les noms ne remplacent pas
  // ceux que Ragna a déjà donnés.
  function appliquerNoms(target, noms, c, index, taille) {
    const { zone } = c;
    if (Math.round(taille) !== noms.taille || c.m || c.e) return { tuiles: 0, tampons: 0, erreur: 'taille, marge ou espace différents de la planche exportée' };
    const numeroDeCase = new Map(); // case de la planche -> numéro de tuile
    c.cases.forEach(({ cx, cy }, k) => {
      if (index[k] >= 0) numeroDeCase.set((zone.y + cy) * noms.colonnes + zone.x + cx, index[k]);
    });
    const faites = new Set();
    let tuiles = 0;
    for (const [n, i] of numeroDeCase) {
      const e = noms.tuiles[n];
      const t = target.tiles[i];
      if (!e || !t || faites.has(i)) continue;
      faites.add(i);
      const maj = { ...t };
      if (e.nom && sansNom(t)) { maj.name = e.nom; tuiles++; }
      if (e.passage && (t.passage || 'auto') === 'auto') maj.passage = e.passage;
      if (e.categorie) maj.categorie = e.categorie;
      if (e.lumiere && !t.lumiere) maj.lumiere = e.lumiere;
      if (e.images.length && t.frames.length === 1) { maj.frames = [t.frames[0], ...e.images.filter((f) => f.length === t.frames[0].length)]; maj.duration = e.duree; }
      target.tiles[i] = maj;
    }
    const nouveaux = [];
    for (const st of noms.tampons) {
      const cells = Array.from({ length: st.w * st.h }, (_v, k) => (Number.isInteger(st.cases[k]) && numeroDeCase.has(st.cases[k]) ? numeroDeCase.get(st.cases[k]) : -1));
      if (!cells.some((k) => k >= 0)) continue;
      const deja = [...target.stamps, ...nouveaux].some((o) => o.w === st.w && o.h === st.h && o.cells.every((k, j) => k === cells[j]));
      if (!deja) nouveaux.push(Doc.newStamp({ stamps: [...target.stamps, ...nouveaux] }, { name: st.nom, w: st.w, h: st.h, cells, dessus: Math.min(st.dessus, st.h) }));
    }
    target.stamps = [...target.stamps, ...nouveaux];
    return { tuiles, tampons: nouveaux.length };
  }

  async function exportNamedSheet(doc) {
    const categories = [...new Set(doc.tiles.map((t) => t.categorie || ''))];
    const v = await Dialogs.form({
      title: 'Exporter la planche nommée',
      okLabel: 'Exporter',
      width: 480,
      fields: [
        { type: 'info', text: 'Les tuiles en PNG, et à côté un fichier .tuiles.json avec leurs noms, leur passage, leur catégorie, leurs animations et les tampons. En important ce PNG dans un autre jeu, Tafl reprend tout : il n\'y a plus à les nommer.' },
        { key: 'categorie', label: 'Tuiles', type: 'select', value: '*', choices: [['*', `Toutes (${doc.tiles.length})`], ...categories.map((k) => [k, `${k || 'Sans catégorie'} (${doc.tiles.filter((t) => (t.categorie || '') === k).length})`])] },
        { key: 'colonnes', label: 'Colonnes', type: 'number', value: doc.columns, min: 1, max: 64 },
      ],
    });
    if (!v) return;
    const categorie = v.categorie === '*' ? null : v.categorie;
    const p = plancheNommee(doc, { categorie, colonnes: v.colonnes });
    const chemin = await window.tafl.saveDialog({ defaultName: `${safeName(categorie || doc.name)}.png`, format: 'png' });
    if (!chemin) return;
    const saved = await window.tafl.writeFile(chemin, await canvasBytes(p.canvas));
    await window.tafl.writeFile(chemin.replace(/\.png$/i, '') + '.tuiles.json', textBytes(JSON.stringify(p.json)));
    notify(`Planche nommée exportée : ${saved.name} (${p.nombre} tuiles dont ${p.nommees} nommées, ${p.json.tampons.length} tampons) et ses noms à côté.`, 'success', 7000, [{ label: 'Afficher', run: () => window.tafl.revealFile(saved.path) }]);
  }

  // L'empreinte des pixels d'une tuile, pour reconnaître une tuile identique. Un pixel transparent
  // compte pour transparent quelle que soit sa couleur (un PNG réenregistré la met à 0).
  function empreinte(data) {
    const d = Uint8ClampedArray.from(data);
    for (let k = 3; k < d.length; k += 4) if (d[k] === 0) { d[k - 3] = 0; d[k - 2] = 0; d[k - 1] = 0; }
    return d.join(',');
  }

  // defauts : les premières valeurs de la fenêtre (Tafl 0.22 : un sol généré garde son fond, par exemple).
  async function importSheet(file, defauts = {}) {
    const img = await decodeBytes(file.bytes);
    const W = img.naturalWidth, H = img.naturalHeight;
    const doc = App.doc;
    // Tafl 0.20 : une planche nommée (exportée par Tafl) a ses noms à côté, dans planche.tuiles.json.
    const noms = await lireNoms(file, doc);
    const source = pixelsOf(img);
    const fond = Planche.detecterFond(source);
    const FONDS = [['auto', fond.couleurs.length ? (fond.sorte === 'damier' ? 'Le damier détecté' : 'La couleur unie détectée') : fond.sorte === 'transparent' ? 'Déjà transparent' : 'Aucun fond détecté'], ['couleur', 'Une couleur choisie'], ['aucun', 'Garder l\'image telle quelle']];
    const fondTexte = fond.sorte === 'damier' ? ` Son fond est un damier peint (${fond.couleurs.join(' et ')}) : Tafl le rend transparent.` : fond.sorte === 'uni' ? ` Son fond est une couleur unie (${fond.couleurs[0]}) : Tafl la rend transparente.` : fond.sorte === 'transparent' ? ' Son fond est déjà transparent.' : '';
    const size0 = doc ? doc.tileSize : noms ? noms.taille : App.config.tileSize;
    const g0 = Planche.grille(W, H, size0);

    // Le travail est refait seulement quand ses réglages changent (le fond ne dépend pas de la zone…).
    let cache = {};
    const memo = (nom, cle, fn) => {
      if (cache[nom]?.cle !== cle) cache[nom] = { cle, valeur: fn() };
      return cache[nom].valeur;
    };
    const couleursFond = (v) => (v.fond === 'auto' ? fond.couleurs : v.fond === 'couleur' ? [normalizeHex(v.couleur) || '#ff00ff'] : []);
    const calcul = (v) => {
      const s = clamp(Math.round(v.size) || 16, 4, 128), m = clamp(Math.round(v.marge) || 0, 0, 256), e = clamp(Math.round(v.espacement) || 0, 0, 64);
      const { cols, rows } = Planche.grille(W, H, s, m, e);
      const zone = { x: clamp(Math.round(v.zx) || 0, 0, Math.max(0, cols - 1)), y: clamp(Math.round(v.zy) || 0, 0, Math.max(0, rows - 1)) };
      zone.w = clamp(Math.round(v.zw) || cols, 1, Math.max(1, cols - zone.x));
      zone.h = clamp(Math.round(v.zh) || rows, 1, Math.max(1, rows - zone.y));
      const couleurs = couleursFond(v);
      const pixels = memo('fond', `${couleurs}|${v.petits}`, () => Planche.rendreTransparent(source, couleurs, v.petits));
      const ok = cols > 0 && rows > 0;
      const cases = ok ? memo('cases', `${couleurs}|${v.petits}|${s}|${m}|${e}|${zone.x},${zone.y},${zone.w},${zone.h}`, () => Planche.decouper(pixels, W, { s, m, e, zone })) : [];
      const objets = ok && v.tampons ? memo('objets', cache.cases?.cle, () => Planche.objets(pixels, W, { s, m, e, zone })) : null;
      return { s, m, e, cols, rows, zone, pixels, cases, objets };
    };

    let dessinerApercu = null, form = null;
    const apercu = Planche.apercu(source, {
      onZone: (z) => { for (const [k, val] of [['zx', z.x], ['zy', z.y], ['zw', z.w], ['zh', z.h]]) form.inputs[k].input.value = val; form.inputs.zh.input.dispatchEvent(new Event('input', { bubbles: true })); },
      onCouleur: (hex) => { form.inputs.couleur.input.value = hex; form.setValue('fond', 'couleur'); },
    });
    dessinerApercu = apercu.dessiner;
    let avant = null;
    const v = await Dialogs.form({
      title: `Importer ${file.name}`,
      okLabel: 'Importer',
      width: Math.min(1120, innerWidth - 60),
      fields: [
        { type: 'element', element: apercu.element },
        { type: 'info', text: `Image de ${W} × ${H} pixels, découpée en tuiles carrées de gauche à droite puis de haut en bas.${fondTexte}` },
        ...(noms ? [{ type: 'info', text: `Planche nommée : ${noms.tuiles.filter((t) => t?.nom).length} tuile(s) et ${noms.tampons.length} tampon(s) décrits dans ${file.name.replace(/\.png$/i, '')}.tuiles.json. Tafl reprend leurs noms, passages, catégories, animations et tampons (tuiles de ${noms.taille} px, sans marge ni espace).` }] : []),
        { key: 'size', label: 'Taille des tuiles', type: 'number', value: size0, min: 4, max: 128, unit: 'px' },
        { key: 'marge', label: 'Marge autour', type: 'number', value: 0, min: 0, max: 256, unit: 'px' },
        { key: 'espacement', label: 'Espace entre tuiles', type: 'number', value: 0, min: 0, max: 64, unit: 'px' },
        { key: 'zx', label: 'Zone : colonne', type: 'number', value: 0, min: 0 },
        { key: 'zy', label: 'Zone : rangée', type: 'number', value: 0, min: 0 },
        { key: 'zw', label: 'Zone : largeur', type: 'number', value: g0.cols, min: 1, unit: 'tuiles' },
        { key: 'zh', label: 'Zone : hauteur', type: 'number', value: g0.rows, min: 1, unit: 'tuiles' },
        { key: 'fond', label: 'Fond à rendre transparent', type: 'select', value: defauts.fond ?? (fond.couleurs.length ? 'auto' : 'aucun'), choices: FONDS },
        { key: 'couleur', label: 'Couleur du fond', type: 'color', value: fond.couleurs[0] || '#ff00ff' },
        { key: 'petits', label: 'Garder les petits morceaux de cette couleur au milieu des objets', type: 'checkbox', value: true },
        { key: 'target', label: 'Destination', type: 'select', value: doc ? 'add' : 'new', choices: doc ? [['add', `Ajouter au jeu ouvert (${doc.name})`], ['new', 'Nouveau jeu de tuiles']] : [['new', 'Nouveau jeu de tuiles']] },
        { key: 'skipEmpty', label: 'Ignorer les cases entièrement transparentes', type: 'checkbox', value: true },
        { key: 'dedupe', label: 'Une seule fois chaque tuile identique', type: 'checkbox', value: true },
        { key: 'tampons', label: noms ? 'Chercher en plus les objets de plusieurs tuiles (la planche nommée a déjà ses tampons)' : 'Un tampon pour chaque objet de plusieurs tuiles (arbre, maison…)', type: 'checkbox', value: defauts.tampons ?? !noms },
        { key: 'asMap', label: 'Refaire l\'image en carte (nouveau jeu seulement)', type: 'checkbox', value: false },
      ],
      onInput(values, f) {
        form = f;
        f.card.classList.add('import-sheet');
        if (doc && values.target === 'add' && values.size !== doc.tileSize) return f.setValue('size', doc.tileSize);
        // La taille, la marge ou l'espacement changent la grille : la zone reprend toute l'image si elle
        // la prenait déjà (sinon elle est seulement recoupée).
        const g = Planche.grille(W, H, clamp(Math.round(values.size) || 16, 4, 128), clamp(Math.round(values.marge) || 0, 0, 256), clamp(Math.round(values.espacement) || 0, 0, 64));
        if (avant && (avant.cols !== g.cols || avant.rows !== g.rows)) {
          const plein = values.zx === 0 && values.zy === 0 && values.zw === avant.cols && values.zh === avant.rows;
          for (const [k, val] of plein ? [['zx', 0], ['zy', 0], ['zw', g.cols], ['zh', g.rows]] : [['zw', Math.min(values.zw, g.cols)], ['zh', Math.min(values.zh, g.rows)]]) f.inputs[k].input.value = val;
          values = f.values();
        }
        avant = g;
        f.inputs.asMap.row.hidden = values.target !== 'new';
        f.inputs.couleur.row.hidden = values.fond !== 'couleur';
        f.inputs.petits.row.hidden = values.fond === 'aucun' || (values.fond === 'auto' && !fond.couleurs.length);
        const c = calcul(values);
        dessinerApercu({ ...c, objets: c.objets });
        const extra = f.card.querySelector('.modal-extra');
        if (!c.cols || !c.rows) { extra.textContent = 'Image plus petite qu\'une tuile'; return; }
        const vides = c.cases.filter((k) => k.vide).length;
        const uniques = values.dedupe ? memo('uniques', cache.cases?.cle, () => new Set(c.cases.filter((k) => !k.vide).map((k) => k.data.join(','))).size) : c.cases.length - vides;
        extra.textContent = `${c.zone.w} × ${c.zone.h} = ${c.cases.length} cases, ${vides} vide(s) · ${uniques} tuile(s)${values.dedupe ? ' différente(s)' : ''}${c.objets ? ` · ${c.objets.length} tampon(s)` : ''}`;
      },
    });
    if (!v) return;
    const c = calcul(v);
    if (!c.cols || !c.rows) return notify('L\'image est plus petite qu\'une tuile.', 'warning');
    cache = {};
    const { s, zone } = c;

    const target = v.target === 'new' || !doc
      ? Doc.create({ name: file.name.replace(/\.[^.]+$/, ''), tileSize: s, tiles: 0, palette: paletteById(App.config.palette).couleurs, mapWidth: v.asMap ? zone.w : 20, mapHeight: v.asMap ? zone.h : 15 })
      : doc;
    const base = Doc.slug(file.name.replace(/\.[^.]+$/, ''), 'objet');
    const categorie = file.name.replace(/\.[^.]+$/, '').slice(0, 60);
    const add = () => {
      const known = new Map(); // empreinte des pixels → numéro de tuile (pour les doublons)
      if (v.dedupe) target.tiles.forEach((t, i) => { if (!Doc.animated(t) || noms) known.set(empreinte(t.frames[0]), i); });
      let added = 0;
      const index = c.cases.map(({ cx, cy, data, vide }) => {
        let i = -1;
        if (!(vide && v.skipEmpty)) {
          const key = v.dedupe ? empreinte(data) : null;
          if (key && known.has(key)) i = known.get(key);
          else {
            i = Doc.addTile(target, data, Doc.uniqueName(target, 'tuile'));
            // Tafl 0.13 : les tuiles d'une planche sont rangées dans une catégorie à son nom.
            target.tiles[i].categorie = categorie;
            added++;
            if (key) known.set(key, i);
          }
        }
        if (v.asMap && target !== doc) target.map.layers[0].cells[cy * zone.w + cx] = i;
        return i;
      });
      // Un tampon par objet : ses cases, à leur place, les autres vides.
      let stamps = 0;
      if (c.objets?.length) {
        const nouveaux = [];
        c.objets.forEach((o, n) => {
          const cells = [];
          for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) cells.push(index[y * zone.w + x]);
          // Les noms déjà pris (par d'autres tampons du jeu) reçoivent un numéro.
          if (cells.some((t) => t >= 0)) nouveaux.push(Doc.newStamp({ stamps: [...target.stamps, ...nouveaux] }, { name: `${base}-${n + 1}`, w: o.w, h: o.h, cells }));
        });
        target.stamps = [...target.stamps, ...nouveaux];
        stamps = nouveaux.length;
      }
      const nommees = noms ? appliquerNoms(target, noms, c, index, v.size) : null;
      if (nommees) stamps += nommees.tampons;
      return { added, stamps, nommees };
    };
    const bilan = (r) => `${r.added} tuile(s)${r.stamps ? ` et ${r.stamps} tampon(s)` : ''}${r.nommees ? ` (${r.nommees.tuiles} tuile(s) nommée(s) d'après la planche${r.nommees.erreur ? `, ${r.nommees.erreur}` : ''})` : ''}`;

    if (target === doc) {
      let r;
      Doc.change(doc, `Importer ${file.name}`, () => { r = add(); });
      notify(`${bilan(r)} ajouté(s) depuis ${file.name}.${r.stamps ? ' Les tampons sont dans le panneau Tampons (mode Carte).' : ''}`, 'success', 5000);
    } else {
      const r = add();
      if (!target.tiles.length) Doc.addTile(target);
      // Peu de couleurs : la palette devient celle de l'image.
      const used = Panels.usedColors(target);
      if (used.length && used.length <= 64) target.palette = used;
      target.dirty = true;
      App.setDocument(target);
      if (v.asMap || r.stamps) App.setMode('map');
      notify(`${bilan(r)} importé(s) depuis ${file.name}${v.asMap ? ', et la carte refaite à partir de l\'image' : ''}.`, 'success', 5000);
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

  // map : la carte affichée, ou une autre (la carte monde les dessine toutes) ; canvases : les tuiles déjà dessinées.
  function mapCanvas(doc, scale = 1, map = doc.map, canvases = doc.tiles.map((t) => Doc.tileCanvas(t, doc.tileSize))) {
    const s = doc.tileSize;
    const c = el('canvas', { width: map.width * s * scale, height: map.height * s * scale });
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
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
        // Tafl 0.20 : avec le nom (classe de la tuile dans Tiled) et le passage des tuiles nommées.
        ...(() => {
          const tiles = new Map();
          doc.tiles.forEach((t, i) => {
            if (sansNom(t) && (t.passage || 'auto') === 'auto') return;
            tiles.set(i, { id: i, ...(sansNom(t) ? {} : { type: t.name }), properties: [...(sansNom(t) ? [] : [{ name: 'nom', type: 'string', value: t.name }]), ...(t.passage && t.passage !== 'auto' ? [{ name: 'passage', type: 'string', value: t.passage }] : [])] });
          });
          for (const a of anims) tiles.set(a.id, { ...(tiles.get(a.id) || { id: a.id }), animation: a.ids.map((tileid) => ({ tileid, duration: a.duration })) });
          return tiles.size ? { tiles: [...tiles.values()].sort((x, y) => x.id - y.id) } : {};
        })(),
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

  return { decodeBytes, pixelsOf, open, openPath, openLoaded, openGame, save, saveAsGame, gameFiles, mapToJSON, importDialog, importSheet, exportSheet, exportNamedSheet, plancheNommee, exportTiles, exportMap, exportMapImage, serialize, deserialize, sheetCanvas, mapCanvas, canvasBytes, tileFiles, mapFiles, textBytes };
})();
