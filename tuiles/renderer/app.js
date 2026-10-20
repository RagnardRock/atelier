// Le cœur de l'interface de Tafl : l'état (jeu de tuiles ouvert, mode, outil, couleurs),
// les menus, les raccourcis clavier, les réglages et l'écran d'accueil.

const App = (() => {
  const api = {
    doc: null,
    mode: 'tile',          // 'tile' (dessiner une tuile) ou 'map' (poser les tuiles sur la carte)
    tool: 'pencil',
    colors: { primary: '#38a048', secondary: null }, // null = transparent
    options: { mirrorH: false, mirrorV: false, mosaic: false, filled: true, layer: 0, dimOther: false, pixelGrid: true, tileGrid: true, onion: true },
    frame: 0,              // l'image de l'animation qu'on dessine (0 pour une tuile fixe)
    playing: true,         // les tuiles animées bougent dans l'aperçu, les vignettes et la carte
    config: null,
    configPath: '',
  };

  // --- Rafraîchir l'affichage ---
  function refresh() {
    const doc = api.doc;
    if (doc) api.frame = clamp(api.frame, 0, doc.tiles[doc.current].frames.length - 1);
    $('#welcome').hidden = Boolean(doc);
    $('#stage').hidden = !doc;
    $('#modes').hidden = !doc;
    document.body.classList.toggle('no-doc', !doc);
    const title = doc ? `${doc.dirty ? '● ' : ''}${doc.name} — Tafl` : 'Tafl';
    if (document.title !== title) document.title = title;
    $('#doc-name').textContent = doc ? `${doc.name}${doc.dirty ? ' ●' : ''}` : '';
    $('#btn-undo').disabled = !doc?.undo.length;
    $('#btn-redo').disabled = !doc?.redo.length;
    renderModes();
    renderToolbar();
    renderOptions();
    Panels.render();
    Stage.render();
  }
  // Pendant un geste (coup de crayon…) : seulement ce qui change à chaque pixel.
  function refreshLive() {
    Panels.renderLive();
    Stage.render();
  }

  // --- Modes ---
  function renderModes() {
    $$('#modes .mode').forEach((b) => b.classList.toggle('active', b.dataset.mode === api.mode));
  }
  function setMode(mode) {
    if (!api.doc) return;
    api.mode = mode;
    // Le Décalage n'existe qu'en mode Tuile.
    if (!TOOLS.find((t) => t.id === api.tool).modes.includes(mode)) api.tool = 'pencil';
    refresh();
  }
  $$('#modes .mode').forEach((b) => { b.onclick = () => setMode(b.dataset.mode); });

  // --- Outils ---
  function renderToolbar() {
    const box = $('#tool-buttons');
    box.innerHTML = '';
    for (const t of TOOLS) {
      const ok = t.modes.includes(api.mode);
      const b = el('button', { className: `tool${api.tool === t.id ? ' active' : ''}`, title: `${t.nom} (${t.key})${ok ? '' : ' : en mode Tuile seulement'}`, disabled: !ok }, [icon(t.icone)]);
      b.onclick = () => setTool(t.id);
      box.append(b);
    }
    Panels.renderColors();
  }
  function setTool(id) {
    const t = TOOLS.find((x) => x.id === id);
    if (!t || !t.modes.includes(api.mode)) return;
    api.tool = id;
    renderToolbar();
    renderOptions();
    Stage.render();
  }

  // Barre d'options : ce qui se règle pour l'outil et le mode en cours.
  function renderOptions() {
    const bar = $('#tool-options');
    bar.innerHTML = '';
    if (!api.doc) return;
    const t = TOOLS.find((x) => x.id === api.tool);
    bar.append(el('span', { className: 'tool-title' }, [icon(t.icone), el('span', { textContent: t.nom })]));
    const check = (label, key, title = '') => {
      const input = el('input', { type: 'checkbox', checked: Boolean(api.options[key]) });
      input.onchange = () => {
        api.options[key] = input.checked;
        if (key === 'mosaic') Stage.fit();
        if (key === 'pixelGrid' || key === 'tileGrid') window.tafl.writeConfig({ [key]: input.checked }).then((c) => { api.config = c; });
        Stage.render();
      };
      return el('label', { className: 'option option-checkbox', title }, [input, el('span', { textContent: label })]);
    };
    if (api.mode === 'tile') {
      if (['pencil', 'eraser', 'line', 'rect', 'fill'].includes(api.tool)) {
        bar.append(check('Miroir ↔', 'mirrorH', 'Ce que tu dessines à gauche se dessine aussi à droite'));
        bar.append(check('Miroir ↕', 'mirrorV', 'Ce que tu dessines en haut se dessine aussi en bas'));
      }
      if (api.tool === 'rect') bar.append(check('Plein', 'filled'));
      bar.append(el('span', { className: 'option-sep' }));
      if (Doc.animated(api.doc.tiles[api.doc.current])) bar.append(check('Pelure d\'oignon', 'onion', 'Montre l\'image précédente de l\'animation en transparence, pour dessiner la suivante'));
      bar.append(check('Mosaïque', 'mosaic', 'Répète la tuile tout autour pour voir et dessiner les raccords (Ctrl+M)'));
      bar.append(check('Grille', 'pixelGrid'));
    } else {
      if (api.tool === 'rect') bar.append(check('Plein', 'filled'));
      const select = el('select', { title: 'Le calque sur lequel tu poses les tuiles' });
      api.doc.map.layers.forEach((l, i) => select.add(new Option(l.name, i)));
      select.value = api.options.layer;
      select.onchange = () => { api.options.layer = Number(select.value); Stage.render(); };
      bar.append(el('label', { className: 'option' }, [el('span', { textContent: 'Calque' }), select]));
      api.doc.map.layers.forEach((l, i) => {
        const b = el('button', { className: 'icon-button', title: `${l.visible ? 'Masquer' : 'Afficher'} le calque ${l.name}` }, [icon(l.visible ? 'eye' : 'eye-closed')]);
        b.onclick = () => { api.doc.map.layers[i].visible = !l.visible; renderOptions(); Stage.render(); };
        bar.append(el('span', { className: 'option layer-eye' }, [b, el('span', { textContent: l.name })]));
      });
      bar.append(check('Atténuer l\'autre calque', 'dimOther'));
      bar.append(el('span', { className: 'option-sep' }));
      bar.append(check('Grille', 'tileGrid'));
      const size = el('button', { className: 'button small', textContent: `Carte ${api.doc.map.width} × ${api.doc.map.height}`, title: 'Changer la taille de la carte' });
      size.onclick = resizeMap;
      bar.append(size);
    }
  }

  // --- Couleurs ---
  function setColor(which, hex) {
    api.colors[which] = hex ? hex.toLowerCase() : null;
    Panels.renderColors();
  }
  function swapColors() {
    [api.colors.primary, api.colors.secondary] = [api.colors.secondary, api.colors.primary];
    Panels.renderColors();
  }

  // --- Tuiles ---
  function selectTile(i) {
    if (!api.doc) return;
    const changed = api.doc.current !== clamp(i, 0, api.doc.tiles.length - 1);
    api.doc.current = clamp(i, 0, api.doc.tiles.length - 1);
    if (changed) api.frame = 0;
    Panels.renderTiles();
    Panels.renderFrames();
    Panels.renderLive();
    renderOptions();
    Stage.render();
    const item = $('#tiles').children[api.doc.current];
    item?.scrollIntoView({ block: 'nearest' });
  }
  function newTile() {
    const doc = api.doc;
    Doc.change(doc, 'Nouvelle tuile', () => { doc.current = Doc.addTile(doc, null, null, doc.current + 1); });
  }
  function duplicateTile() {
    const doc = api.doc;
    const src = doc.tiles[doc.current];
    Doc.change(doc, 'Dupliquer la tuile', () => { doc.current = Doc.addTile(doc, src.frames.map((f) => f.slice()), Doc.uniqueName(doc, src.name.replace(/-\d+$/, '')), doc.current + 1, src.duration); });
    api.frame = 0;
  }
  async function deleteTile() {
    const doc = api.doc;
    const i = doc.current;
    const used = doc.map.layers.reduce((n, l) => n + l.cells.filter((c) => c === i).length, 0);
    if (used) {
      const go = await Dialogs.ask('Supprimer la tuile', `« ${doc.tiles[i].name} » est posée sur ${used} case(s) de la carte. Ces cases deviendront vides.\n\nCtrl+Z annule la suppression.`, [
        { label: 'Annuler', value: false },
        { label: 'Supprimer', value: true, primary: true },
      ]);
      if (!go) return;
    }
    Doc.change(doc, 'Supprimer la tuile', () => Doc.removeTile(doc, i));
  }
  async function renameTile(i) {
    const doc = api.doc;
    const v = await Dialogs.form({
      title: 'Renommer la tuile',
      okLabel: 'Renommer',
      fields: [
        { key: 'name', label: 'Nom', type: 'text', value: doc.tiles[i].name },
        { type: 'info', text: 'Le nom sert aux fichiers des tuiles séparées (herbe.png…) et à t\'y retrouver.' },
      ],
    });
    const name = v?.name.trim();
    if (!name || name === doc.tiles[i].name) return;
    Doc.change(doc, 'Renommer la tuile', () => { doc.tiles[i] = { ...doc.tiles[i], name }; });
  }
  function transform(kind, label) {
    const doc = api.doc;
    Doc.change(doc, label, () => Doc.transformTile(doc, doc.current, Doc.TRANSFORMS[kind]));
  }
  function clearTile() {
    const doc = api.doc;
    Doc.change(doc, Doc.animated(doc.tiles[doc.current]) ? 'Effacer l\'image' : 'Effacer la tuile', () => {
      Doc.pixelsForEdit(doc, doc.current, api.frame).fill(0);
      Doc.touch(doc.tiles[doc.current]);
    });
  }
  function tileMenuItems() {
    const doc = api.doc;
    return [
      { label: 'Nouvelle tuile', keys: 'Ctrl+Maj+N', run: newTile },
      { label: 'Dupliquer la tuile', keys: 'Ctrl+D', run: duplicateTile },
      { label: 'Renommer…', keys: 'F2', run: () => renameTile(doc.current) },
      { label: 'Supprimer la tuile', run: deleteTile },
      null,
      { label: 'Miroir horizontal', keys: 'Maj+H', run: () => transform('flipH', 'Miroir horizontal') },
      { label: 'Miroir vertical', keys: 'Maj+V', run: () => transform('flipV', 'Miroir vertical') },
      { label: 'Pivoter d\'un quart de tour', keys: 'Maj+R', run: () => transform('rotate', 'Pivoter') },
      { label: 'Décaler d\'une demi-tuile (voir les raccords)', keys: 'Maj+D', run: () => transform('half', 'Décaler d\'une demi-tuile') },
      { label: Doc.animated(doc.tiles[doc.current]) ? 'Effacer l\'image en cours' : 'Effacer la tuile', run: clearTile },
      null,
      { label: 'Ajouter une image d\'animation', keys: 'Ctrl+Maj+A', run: addFrame },
      { label: 'Supprimer l\'image d\'animation', disabled: !Doc.animated(doc.tiles[doc.current]), run: deleteFrame },
      { label: api.playing ? 'Arrêter l\'animation' : 'Lancer l\'animation', keys: 'P', run: togglePlay },
      null,
      { label: 'Taille des tuiles du jeu…', run: resizeTiles },
    ];
  }

  // --- Animation ---
  function selectFrame(k) {
    const tile = api.doc.tiles[api.doc.current];
    api.frame = clamp(k, 0, tile.frames.length - 1);
    Panels.renderFrames();
    Panels.renderLive();
    Stage.render();
  }
  // Nouvelle image : une copie de celle en cours, juste après (on la retouche ensuite).
  function addFrame() {
    const doc = api.doc;
    const tile = doc.tiles[doc.current];
    if (tile.frames.length >= 16) return notify('16 images au plus par tuile.', 'warning');
    const src = tile.frames[clamp(api.frame, 0, tile.frames.length - 1)].slice();
    Doc.change(doc, 'Ajouter une image', () => { api.frame = Doc.addFrame(doc, doc.current, api.frame + 1, src); });
  }
  function deleteFrame() {
    const doc = api.doc;
    if (doc.tiles[doc.current].frames.length < 2) return;
    Doc.change(doc, 'Supprimer l\'image', () => { api.frame = Doc.removeFrame(doc, doc.current, api.frame); });
  }
  function setDuration(ms) {
    const doc = api.doc;
    const value = clamp(Math.round(ms) || Doc.DEFAULT_DURATION, 30, 5000);
    const tile = doc.tiles[doc.current];
    if (tile.duration === value) return;
    Doc.change(doc, 'Vitesse de l\'animation', () => { Doc.tileForEdit(doc, doc.current).duration = value; });
  }
  function togglePlay() {
    api.playing = !api.playing;
    Panels.renderFrames();
    Panels.render();
    Stage.render();
  }
  $('#frame-add').onclick = () => { if (api.doc) addFrame(); };
  $('#frame-delete').onclick = () => { if (api.doc) deleteFrame(); };
  $('#anim-play').onclick = () => { if (api.doc) togglePlay(); };
  $('#frame-duration').onchange = (e) => { if (api.doc) setDuration(Number(e.target.value)); };

  // Horloge de l'animation : environ 30 fois par seconde, seulement s'il y a des tuiles animées.
  let lastTick = 0;
  function animate(now) {
    requestAnimationFrame(animate);
    if (!api.playing || !api.doc || now - lastTick < 33 || document.hidden) return;
    if (!api.doc.tiles.some(Doc.animated)) return;
    lastTick = now;
    Panels.tick();
    if (api.mode === 'map') Stage.render();
  }

  // --- Taille des tuiles ---
  async function resizeTiles() {
    const doc = api.doc;
    const old = doc.tileSize;
    const v = await Dialogs.form({
      title: 'Taille des tuiles',
      okLabel: 'Appliquer',
      width: 480,
      fields: [
        { type: 'info', text: `Les tuiles font aujourd'hui ${old} × ${old} pixels. La nouvelle taille s'applique à toutes les tuiles et à toutes leurs images (Ctrl+Z annule).` },
        { key: 'size', label: 'Nouvelle taille', type: 'select', value: String(old * 2 <= 64 ? old * 2 : old), choices: [['8', '8 × 8'], ['16', '16 × 16'], ['24', '24 × 24'], ['32', '32 × 32'], ['48', '48 × 48'], ['64', '64 × 64']] },
        { key: 'how', label: 'Méthode', type: 'select', value: 'scale', choices: [['scale', 'Agrandir ou réduire les pixels'], ['canvas', 'Ajouter ou couper des bords']] },
      ],
      onInput(values, f) {
        const size = Number(values.size);
        const ratio = size / old;
        f.card.querySelector('.modal-extra').textContent = values.how === 'scale'
          ? (Number.isInteger(ratio) ? `Chaque pixel devient un carré de ${ratio} × ${ratio}.` : ratio < 1 && Number.isInteger(1 / ratio) ? `Un pixel sur ${1 / ratio} est gardé.` : 'Rapport non entier : certains pixels seront doublés et d\'autres non.')
          : size > old ? `${Math.floor((size - old) / 2)} px de bord transparent autour.` : size < old ? `${Math.ceil((old - size) / 2)} px coupés de chaque côté.` : '';
      },
    });
    if (!v || Number(v.size) === old) return;
    Doc.change(doc, 'Taille des tuiles', () => Doc.resizeTiles(doc, Number(v.size), v.how));
    Stage.reset();
    notify(`Tuiles passées de ${old} × ${old} à ${v.size} × ${v.size} pixels.`, 'success', 3500);
  }

  // --- Carte ---
  async function resizeMap() {
    const doc = api.doc;
    const v = await Dialogs.form({
      title: 'Taille de la carte',
      okLabel: 'Appliquer',
      fields: [
        { type: 'info', text: 'En cases (tuiles). L\'écran d\'une Game Boy Advance montre 15 × 10 tuiles de 16 px. Agrandir ajoute des cases vides à droite et en bas ; réduire coupe à droite et en bas (Ctrl+Z annule).' },
        { key: 'width', label: 'Largeur', type: 'number', value: doc.map.width, min: 1, max: 256, unit: 'cases' },
        { key: 'height', label: 'Hauteur', type: 'number', value: doc.map.height, min: 1, max: 256, unit: 'cases' },
      ],
      onInput(values, f) {
        f.card.querySelector('.modal-extra').textContent = `${values.width * doc.tileSize} × ${values.height * doc.tileSize} px`;
      },
    });
    if (!v || (v.width === doc.map.width && v.height === doc.map.height)) return;
    Doc.change(doc, 'Taille de la carte', () => Doc.resizeMap(doc, clamp(Math.round(v.width), 1, 256), clamp(Math.round(v.height), 1, 256)));
    Stage.fit();
  }
  function clearLayer() {
    const doc = api.doc;
    const li = api.options.layer;
    Doc.change(doc, `Vider le calque ${doc.map.layers[li].name}`, () => Doc.layerForEdit(doc, li).cells.fill(-1));
  }
  function fillLayer() {
    const doc = api.doc;
    const li = api.options.layer;
    Doc.change(doc, `Remplir le calque ${doc.map.layers[li].name}`, () => Doc.layerForEdit(doc, li).cells.fill(doc.current));
  }

  // --- Historique ---
  function undo() {
    if (!api.doc) return;
    const label = Doc.undo(api.doc);
    if (label) setStatusHint(`Annulé : ${label}`);
    refresh();
  }
  function redo() {
    if (!api.doc) return;
    const label = Doc.redo(api.doc);
    if (label) setStatusHint(`Rétabli : ${label}`);
    refresh();
  }

  // --- Documents ---
  async function confirmDiscard() {
    const doc = api.doc;
    if (!doc?.dirty) return true;
    const choice = await Dialogs.ask('Jeu de tuiles non enregistré', `« ${doc.name} » a des modifications qui ne sont pas enregistrées.`, [
      { label: 'Annuler', value: 'cancel' },
      { label: 'Ne pas enregistrer', value: 'discard' },
      { label: 'Enregistrer', value: 'save', primary: true },
    ]);
    if (choice === 'save') return IO.save(doc);
    return choice === 'discard';
  }
  async function setDocument(doc) {
    if (api.doc && api.doc !== doc && !(await confirmDiscard())) return;
    api.doc = doc;
    api.options.layer = 0;
    api.frame = 0;
    if (!doc.tiles.length) Doc.addTile(doc);
    doc.current = clamp(doc.current, 0, doc.tiles.length - 1);
    // Couleur principale : la première de la palette qui n'est ni noire ni blanche, si possible.
    // (on garde la couleur en cours si elle fait partie de la palette du jeu)
    const first = doc.palette.find((c) => !/^#(000000|ffffff)$/i.test(c)) || doc.palette[0];
    if (first && !doc.palette.includes(api.colors.primary)) api.colors.primary = first;
    Stage.reset();
    refresh();
  }

  async function newDocument() {
    if (!(await confirmDiscard())) return;
    const v = await Dialogs.form({
      title: 'Nouveau jeu de tuiles',
      okLabel: 'Créer',
      width: 470,
      fields: [
        { key: 'name', label: 'Nom', type: 'text', value: 'mon-jeu' },
        { key: 'tileSize', label: 'Taille des tuiles', type: 'select', value: String(api.config.tileSize), choices: [['8', '8 × 8 (Game Boy)'], ['16', '16 × 16 (Pokémon GBA et DS, le plus courant)'], ['24', '24 × 24'], ['32', '32 × 32 (RPG Maker)'], ['48', '48 × 48'], ['64', '64 × 64']] },
        { key: 'palette', label: 'Palette', type: 'select', value: api.config.palette, choices: PALETTES.map((p) => [p.id, p.nom]) },
        { key: 'mapWidth', label: 'Carte : largeur', type: 'number', value: 20, min: 1, max: 256, unit: 'cases' },
        { key: 'mapHeight', label: 'Carte : hauteur', type: 'number', value: 15, min: 1, max: 256, unit: 'cases' },
        { key: 'samples', label: 'Commencer avec des tuiles d\'exemple (herbe, hautes herbes, chemin, eau, fleur) et une petite carte', type: 'checkbox', value: true },
      ],
    });
    if (!v) return;
    const tileSize = Number(v.tileSize);
    const doc = Doc.create({ name: v.name.trim() || 'mon-jeu', tileSize, palette: paletteById(v.palette).couleurs, mapWidth: clamp(Math.round(v.mapWidth), 1, 256), mapHeight: clamp(Math.round(v.mapHeight), 1, 256) });
    if (v.samples) Samples.fill(doc);
    api.doc = null; // déjà confirmé plus haut
    await setDocument(doc);
    // On retient la taille et la palette choisies pour la prochaine fois.
    api.config = await window.tafl.writeConfig({ tileSize, palette: v.palette });
  }

  async function run(fn) {
    try {
      await fn();
    } catch (err) {
      notify(cleanError(err), 'error');
    }
  }
  const needDoc = (fn) => () => { if (api.doc) run(() => fn(api.doc)); };

  // --- Menus de la barre de titre ---
  const MENUS = {
    Fichier: () => [
      { label: 'Nouveau jeu de tuiles…', keys: 'Ctrl+N', run: () => run(newDocument) },
      { label: 'Ouvrir…', keys: 'Ctrl+O', run: () => run(() => IO.open()) },
      { label: 'Importer une planche (PNG)…', keys: 'Ctrl+I', run: () => run(IO.importDialog) },
      null,
      { label: 'Enregistrer', keys: 'Ctrl+S', disabled: !api.doc, run: needDoc((d) => IO.save(d)) },
      { label: 'Enregistrer sous…', keys: 'Ctrl+Maj+S', disabled: !api.doc, run: needDoc((d) => IO.save(d, true)) },
      null,
      { label: 'Exporter la planche de tuiles (PNG)…', keys: 'Ctrl+E', disabled: !api.doc, run: needDoc(IO.exportSheet) },
      { label: 'Exporter les tuiles séparées…', disabled: !api.doc, run: needDoc(IO.exportTiles) },
      { label: 'Exporter la carte pour Tiled (.tmj)…', keys: 'Ctrl+Maj+E', disabled: !api.doc, run: needDoc(IO.exportMap) },
      { label: 'Exporter la carte en image…', disabled: !api.doc, run: needDoc(IO.exportMapImage) },
      null,
      { label: 'Réglages de Tafl…', keys: 'Ctrl+,', run: () => run(openSettings) },
    ],
    Tuile: () => (api.doc ? tileMenuItems() : [{ label: 'Ouvre ou crée d\'abord un jeu de tuiles', disabled: true, run() {} }]),
    Carte: () => (api.doc ? [
      { label: 'Taille de la carte…', run: resizeMap },
      { label: 'Remplir le calque avec la tuile choisie', run: fillLayer },
      { label: 'Vider le calque', run: clearLayer },
      null,
      { label: 'Exporter la carte pour Tiled (.tmj)…', keys: 'Ctrl+Maj+E', run: needDoc(IO.exportMap) },
      { label: 'Exporter la carte en image…', run: needDoc(IO.exportMapImage) },
    ] : [{ label: 'Ouvre ou crée d\'abord un jeu de tuiles', disabled: true, run() {} }]),
    Affichage: () => [
      { label: 'Mode Tuile', keys: 'Tab', checked: api.mode === 'tile', disabled: !api.doc, run: () => setMode('tile') },
      { label: 'Mode Carte', keys: 'Tab', checked: api.mode === 'map', disabled: !api.doc, run: () => setMode('map') },
      null,
      { label: 'Mosaïque (raccords)', keys: 'Ctrl+M', checked: api.options.mosaic, disabled: !api.doc, run: toggleMosaic },
      { label: 'Ajuster à la fenêtre', keys: 'Ctrl+0', disabled: !api.doc, run: () => Stage.fit() },
      { label: 'Zoom avant', keys: 'Ctrl++', disabled: !api.doc, run: () => Stage.zoomBy(1) },
      { label: 'Zoom arrière', keys: 'Ctrl+-', disabled: !api.doc, run: () => Stage.zoomBy(-1) },
    ],
  };
  const menuBar = $('#menus');
  for (const name of Object.keys(MENUS)) {
    const b = el('button', { textContent: name });
    b.onclick = () => {
      if (b.classList.contains('open')) return Menus.close();
      const r = b.getBoundingClientRect();
      Menus.open(MENUS[name](), r.left, r.bottom + 4, b);
    };
    // Survoler un autre menu pendant qu'un menu est ouvert l'ouvre à sa place.
    b.onmouseenter = () => { if (Menus.isOpen() && !b.classList.contains('open') && $('#menus .open')) b.click(); };
    menuBar.append(b);
  }

  function toggleMosaic() {
    api.options.mosaic = !api.options.mosaic;
    renderOptions();
    Stage.fit();
  }

  // --- Barre de titre et accueil ---
  $('#btn-undo').onclick = undo;
  $('#btn-redo').onclick = redo;
  $('#btn-save').onclick = needDoc((d) => IO.save(d));
  $('#btn-export').onclick = needDoc(IO.exportSheet);
  $('#btn-settings').onclick = () => run(openSettings);
  $('#welcome-new').onclick = () => run(newDocument);
  $('#welcome-open').onclick = () => run(() => IO.open());
  $('#welcome-import').onclick = () => run(IO.importDialog);
  $('#tile-add').onclick = needDoc(newTile);
  $('#tile-duplicate').onclick = needDoc(duplicateTile);
  $('#tile-delete').onclick = needDoc(deleteTile);
  $('#tile-more').onclick = (e) => { if (api.doc) Menus.open(tileMenuItems(), e.clientX, e.clientY); };

  async function renderWelcome() {
    const recents = await window.tafl.recentFiles();
    const list = $('#welcome-recents');
    list.innerHTML = '';
    $('#welcome-recents-title').hidden = !recents.length;
    for (const f of recents.slice(0, 8)) {
      const name = f.split(/[\\/]/).pop();
      const b = el('button', { className: 'recent', title: f }, [icon('symbol-color'), el('span', { className: 'recent-name', textContent: name }), el('span', { className: 'recent-path', textContent: f })]);
      b.onclick = () => run(() => IO.openPath(f));
      list.append(b);
    }
  }

  // --- Barre d'état ---
  let hintUntil = 0; // un message passager (« Annulé : … ») reste affiché un moment
  function setStatusHint(text) {
    $('#status-hint').textContent = text;
    hintUntil = Date.now() + 2500;
    setTimeout(() => updateStatus(null), 2600);
  }
  function updateStatus(hover) {
    const doc = api.doc;
    const t = TOOLS.find((x) => x.id === api.tool);
    if (Date.now() >= hintUntil) $('#status-hint').textContent = !doc ? '' : api.mode === 'map' ? (t.aideCarte || t.aide) : t.aide;
    let pos = '';
    if (doc && hover) {
      if (api.mode === 'tile') {
        const s = doc.tileSize;
        pos = `x ${((hover.x % s) + s) % s}  y ${((hover.y % s) + s) % s}`;
      } else if (hover.x >= 0 && hover.y >= 0 && hover.x < doc.map.width && hover.y < doc.map.height) {
        const c = doc.map.layers[api.options.layer].cells[hover.y * doc.map.width + hover.x];
        pos = `case ${hover.x}, ${hover.y}  ·  ${c >= 0 ? `${c}. ${doc.tiles[c]?.name}` : 'vide'}`;
      }
    }
    $('#status-pos').textContent = pos;
    $('#status-tile').textContent = doc ? `Tuile ${doc.current} : ${doc.tiles[doc.current]?.name}` : '';
    $('#status-zoom').textContent = doc ? `${Math.round(Stage.zoom * 100)} %` : '';
  }

  // --- Raccourcis clavier ---
  window.addEventListener('keydown', (e) => {
    if (Dialogs.isOpen()) {
      if (e.key === 'Escape') Dialogs.close(null);
      return;
    }
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
    const k = e.key.toLowerCase();
    const ctrl = e.ctrlKey || e.metaKey;
    const go = (fn) => { e.preventDefault(); fn(); };
    if (ctrl) {
      if (k === 'n' && e.shiftKey) return go(needDoc(newTile));
      if (k === 'n') return go(() => run(newDocument));
      if (k === 'o') return go(() => run(() => IO.open()));
      if (k === 'i') return go(() => run(IO.importDialog));
      if (k === 's') return go(needDoc((d) => IO.save(d, e.shiftKey)));
      if (k === 'e') return go(needDoc(e.shiftKey ? IO.exportMap : IO.exportSheet));
      if (k === 'z' && e.shiftKey) return go(redo);
      if (k === 'z') return go(undo);
      if (k === 'y') return go(redo);
      if (k === 'd') return go(needDoc(duplicateTile));
      if (k === 'm') return go(needDoc(toggleMosaic));
      if (k === 'a' && e.shiftKey) return go(needDoc(addFrame));
      if (k === ',') return go(() => run(openSettings));
      if (k === '0' || e.code === 'Digit0' || e.code === 'Numpad0') return go(() => Stage.fit());
      if (k === '+' || k === '=' || e.code === 'NumpadAdd') return go(() => Stage.zoomBy(1));
      if (k === '-' || e.code === 'NumpadSubtract' || e.code === 'Digit6') return go(() => Stage.zoomBy(-1));
      return;
    }
    if (!api.doc) return;
    if (e.key === 'Tab') return go(() => setMode(api.mode === 'tile' ? 'map' : 'tile'));
    if (e.key === 'F2') return go(() => renameTile(api.doc.current));
    if (e.shiftKey && !e.altKey) {
      const map = { h: ['flipH', 'Miroir horizontal'], v: ['flipV', 'Miroir vertical'], r: ['rotate', 'Pivoter'], d: ['half', 'Décaler d\'une demi-tuile'] };
      if (map[k]) return go(() => transform(...map[k]));
    }
    // Flèches : tuile précédente / suivante (haut et bas : une ligne du panneau Tuiles).
    const cols = api.doc.columns;
    if (e.key === 'ArrowLeft') return go(() => selectTile(api.doc.current - 1));
    if (e.key === 'ArrowRight') return go(() => selectTile(api.doc.current + 1));
    if (e.key === 'ArrowUp') return go(() => selectTile(api.doc.current - cols));
    if (e.key === 'ArrowDown') return go(() => selectTile(api.doc.current + cols));
    if (k === 'x') return go(swapColors);
    if (k === 'p') return go(togglePlay);
    // , et ; : image précédente / suivante de l'animation (touches voisines sur un clavier AZERTY).
    if (e.key === ',' || e.key === ';') return go(() => {
      const n = api.doc.tiles[api.doc.current].frames.length;
      selectFrame((api.frame + (e.key === ';' ? 1 : n - 1)) % n);
    });
    const tool = TOOLS.find((t) => t.key.toLowerCase() === k);
    if (tool && !e.altKey) return go(() => setTool(tool.id));
  });

  // Glisser un .tafl ou une image depuis l'Explorateur.
  window.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); });
  window.addEventListener('drop', async (e) => {
    if (!e.dataTransfer.files.length) return;
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    run(async () => {
      const path = window.tafl.pathOfDropped(file);
      await IO.openLoaded(path ? await window.tafl.openPath(path) : { path: null, name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
    });
  });

  // --- Réglages ---
  const ACCENTS = ['#7bd88f', '#5ec8ff', '#e0a526', '#b9a8ff', '#ff7aa8', '#ff8a4c', '#f5f5f5'];
  async function applyTheme(config) {
    document.documentElement.style.setProperty('--accent', config.accentColor);
    document.body.classList.toggle('glass', Boolean(config.glass));
    api.options.pixelGrid = config.pixelGrid !== false;
    api.options.tileGrid = config.tileGrid !== false;
    const { blur, needsRestart } = await window.tafl.setWindowTheme({ glass: config.glass, blur: config.windowBlur });
    document.body.classList.toggle('window-blur', blur);
    return needsRestart;
  }
  async function openSettings() {
    const blurOk = await window.tafl.blurSupported();
    const version = await window.tafl.version();
    const swatches = el('div', { className: 'accent-swatches' });
    const v = await Dialogs.form({
      title: 'Réglages de Tafl',
      okLabel: 'Enregistrer',
      width: 480,
      fields: [
        { key: 'accentColor', label: 'Couleur d\'accent', type: 'color', value: api.config.accentColor },
        { type: 'element', element: swatches },
        { key: 'glass', label: 'Verre dépoli (glassmorphism)', type: 'checkbox', value: api.config.glass },
        { key: 'windowBlur', label: blurOk ? 'Flou de Windows 11 derrière la fenêtre' : 'Flou de Windows 11 (non disponible ici)', type: 'checkbox', value: api.config.windowBlur },
        { key: 'tileSize', label: 'Taille des tuiles par défaut', type: 'select', value: String(api.config.tileSize), choices: [['8', '8 × 8'], ['16', '16 × 16'], ['24', '24 × 24'], ['32', '32 × 32'], ['48', '48 × 48'], ['64', '64 × 64']] },
        { key: 'palette', label: 'Palette par défaut', type: 'select', value: api.config.palette, choices: PALETTES.map((p) => [p.id, p.nom]) },
        { key: 'pixelGrid', label: 'Grille des pixels (mode Tuile)', type: 'checkbox', value: api.config.pixelGrid },
        { key: 'tileGrid', label: 'Grille des cases (mode Carte)', type: 'checkbox', value: api.config.tileGrid },
        { key: 'historySteps', label: 'Étapes d\'annulation gardées', type: 'number', value: api.config.historySteps, min: 5, max: 500 },
        { key: 'claudeModel', label: 'Modèle de Claude', type: 'select', value: api.config.claudeModel || '', choices: [['', 'Par défaut (celui de Claude Code)'], ['opus', 'Opus'], ['sonnet', 'Sonnet'], ['haiku', 'Haiku']] },
        { key: 'claudeCommand', label: 'Commande Claude Code', type: 'text', value: api.config.claudeCommand || 'claude' },
        { type: 'info', text: `Tafl ${version}. Réglages enregistrés dans ${api.configPath}.` },
      ],
      onInput(values, f) {
        if (!swatches.childElementCount) {
          for (const c of ACCENTS) {
            const b = el('button', { type: 'button', className: 'mini-swatch', style: { background: c } });
            b.onclick = () => f.setValue('accentColor', c);
            swatches.append(b);
          }
        }
        // Aperçu immédiat de la couleur et du verre.
        document.documentElement.style.setProperty('--accent', values.accentColor);
        document.body.classList.toggle('glass', values.glass);
      },
    });
    if (!v) return applyTheme(api.config);
    api.config = await window.tafl.writeConfig({ ...v, tileSize: Number(v.tileSize) });
    if (await applyTheme(api.config)) notify('Le flou de Windows 11 sera actif au prochain démarrage de Tafl.', 'info', 6000);
    refresh();
  }

  // --- Fermeture de la fenêtre avec un jeu de tuiles non enregistré ---
  let closing = false;
  async function prepareQuit() {
    if (!(await confirmDiscard())) return false;
    closing = true;
    return true;
  }
  window.addEventListener('beforeunload', (e) => {
    if (closing || !api.doc?.dirty) return;
    e.preventDefault();
    e.returnValue = false;
    setTimeout(async () => {
      if (!(await confirmDiscard())) return;
      closing = true;
      window.tafl.forceClose();
    });
  });

  // --- Démarrage ---
  let startFolder = null;
  async function init() {
    const { config, path } = await window.tafl.readConfig();
    api.config = config;
    api.configPath = path;
    await applyTheme(config);
    Stage.init();
    requestAnimationFrame(animate);
    refresh();
    await renderWelcome();
    // Un .tafl double-cliqué, ou un dossier passé par Atelier.
    const file = await window.tafl.startupFile();
    if (file) await run(() => IO.openPath(file));
    startFolder = await window.tafl.startupFolder();
    if (startFolder && !file) await run(() => IO.open(startFolder));
  }
  window.tafl.onExternalFile((file) => run(() => IO.openPath(file)));
  window.tafl.onExternalFolder((folder) => run(() => IO.open(folder)));

  Object.assign(api, { refresh, refreshLive, setMode, setTool, setColor, swapColors, selectTile, selectFrame, renameTile, tileMenuItems, setDocument, updateStatus, prepareQuit, init });
  return api;
})();

App.init();
