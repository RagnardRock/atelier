// Le panneau de droite : couleurs, palette, tuiles du jeu et aperçu en mosaïque.

const Panels = (() => {
  // --- Couleurs principale / secondaire ---
  const primaryEl = $('#color-primary');
  const secondaryEl = $('#color-secondary');
  const hexInput = $('#color-hex');
  const native = $('#color-native');

  function paintSwatch(node, hex) {
    node.classList.toggle('transparent', !hex);
    node.style.background = hex || '';
    node.title = hex ? hex : 'Transparent';
  }
  function renderColors() {
    paintSwatch(primaryEl, App.colors.primary);
    paintSwatch(secondaryEl, App.colors.secondary);
    if (document.activeElement !== hexInput) hexInput.value = App.colors.primary || 'transparent';
    $$('#palette .pal-swatch').forEach((b) => {
      b.classList.toggle('primary', (b.dataset.color || null) === App.colors.primary);
      b.classList.toggle('secondary', (b.dataset.color || null) === App.colors.secondary);
    });
  }
  primaryEl.onclick = () => { native.value = App.colors.primary || '#000000'; native.dataset.target = 'primary'; native.click(); };
  secondaryEl.onclick = () => { native.value = App.colors.secondary || '#000000'; native.dataset.target = 'secondary'; native.click(); };
  $('#color-pick').onclick = () => primaryEl.click();
  native.oninput = () => App.setColor(native.dataset.target || 'primary', native.value);
  hexInput.onchange = () => {
    const v = hexInput.value.trim().toLowerCase();
    const hex = v === 'transparent' || v === '' ? null : normalizeHex(v);
    if (hex === null && v !== 'transparent' && v !== '') { notify('Écris une couleur comme #38a048 (ou « transparent »).', 'warning'); return renderColors(); }
    App.setColor('primary', hex);
  };
  hexInput.onkeydown = (e) => { if (e.key === 'Enter') hexInput.blur(); };
  $('#swap-colors').onclick = () => App.swapColors();

  // --- Palette ---
  const paletteEl = $('#palette');
  const presetSelect = $('#palette-preset');
  for (const p of PALETTES) presetSelect.add(new Option(p.nom, p.id));
  presetSelect.add(new Option('Couleurs utilisées dans les tuiles', 'used'));

  presetSelect.onchange = async () => {
    const doc = App.doc;
    const id = presetSelect.value;
    presetSelect.value = '';
    if (!doc || !id) return;
    const couleurs = id === 'used' ? usedColors(doc) : paletteById(id).couleurs;
    Doc.change(doc, 'Changer de palette', () => { doc.palette = [...couleurs]; });
    notify(id === 'used' ? `Palette : les ${couleurs.length} couleurs utilisées dans tes tuiles.` : `Palette « ${paletteById(id).nom} ». Tes tuiles ne changent pas.`, 'success', 3000);
  };

  function usedColors(doc) {
    const seen = new Set();
    for (const t of doc.tiles) {
      for (const d of t.frames) {
        for (let o = 0; o < d.length; o += 4) {
          if (d[o + 3] === 0) continue;
          seen.add(rgbaToHex(d[o], d[o + 1], d[o + 2], d[o + 3]));
          if (seen.size >= 256) return [...seen];
        }
      }
    }
    return [...seen];
  }

  function renderPalette() {
    const doc = App.doc;
    paletteEl.innerHTML = '';
    if (!doc) return;
    const swatch = (hex, index) => {
      const b = el('button', { className: `pal-swatch${hex ? '' : ' transparent'}`, title: hex ? `${hex}\nClic : principale · clic droit : secondaire\nDouble-clic : modifier (dans toutes les tuiles) · Ctrl+clic : retirer` : 'Transparent (clic : principale, clic droit : secondaire)' });
      b.dataset.color = hex || '';
      if (hex) b.style.background = hex;
      b.onclick = (e) => {
        if (e.ctrlKey && index >= 0) {
          Doc.change(doc, 'Retirer une couleur', () => doc.palette.splice(index, 1));
          return;
        }
        App.setColor('primary', hex);
      };
      b.oncontextmenu = (e) => { e.preventDefault(); App.setColor('secondary', hex); };
      if (index >= 0) b.ondblclick = () => editPaletteColor(index);
      return b;
    };
    paletteEl.append(swatch(null, -1));
    doc.palette.forEach((hex, i) => paletteEl.append(swatch(hex, i)));
    const add = el('button', { className: 'pal-swatch pal-add', title: 'Ajouter la couleur principale à la palette' }, [icon('add')]);
    add.onclick = () => {
      const hex = App.colors.primary;
      if (!hex) return notify('Choisis d\'abord une couleur (pas la transparence).', 'warning');
      if (doc.palette.includes(hex)) return notify(`${hex} est déjà dans la palette.`, 'info', 2500);
      Doc.change(doc, 'Ajouter une couleur', () => doc.palette.push(hex));
    };
    paletteEl.append(add);
    renderColors();
  }

  // Modifier une couleur de la palette la remplace aussi dans toutes les tuiles (une seule annulation).
  // C'est le principe des palettes des vieux jeux : changer le vert de l'herbe change toute l'herbe.
  function editPaletteColor(index) {
    const doc = App.doc;
    const old = doc.palette[index];
    const picker = el('input', { type: 'color', value: old.slice(0, 7) });
    picker.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.append(picker);
    picker.onchange = () => {
      const hex = picker.value.toLowerCase();
      picker.remove();
      if (hex === old) return;
      Doc.change(doc, 'Modifier une couleur', () => {
        doc.palette[index] = hex;
        Doc.replaceColor(doc, old, hex);
      });
      if (App.colors.primary === old) App.setColor('primary', hex);
      notify(`${old} → ${hex}, dans la palette et dans toutes les tuiles.`, 'success', 3500);
    };
    picker.click();
  }

  // --- Tuiles du jeu ---
  const tilesEl = $('#tiles');
  let dragFrom = null;

  // Image montrée dans les vignettes : celle de l'horloge d'animation (ou la première, à l'arrêt).
  const shownFrame = (tile) => Doc.frameAt(tile, App.playing ? performance.now() : 0);
  function thumb(tile, size) {
    const c = el('canvas', { width: size, height: size, className: 'tile-canvas' });
    c.getContext('2d').drawImage(Doc.tileCanvas(tile, size, shownFrame(tile)), 0, 0);
    return c;
  }

  function renderTiles() {
    const doc = App.doc;
    tilesEl.innerHTML = '';
    if (!doc) return;
    tilesEl.style.setProperty('--cols', doc.columns);
    doc.tiles.forEach((tile, i) => {
      const item = el('button', { className: `tile-item${i === doc.current ? ' active' : ''}`, title: `${i}. ${tile.name}${Doc.animated(tile) ? ` (animée, ${tile.frames.length} images)` : ''}\nClic : choisir · double-clic : renommer · glisser : changer l'ordre`, draggable: true }, [thumb(tile, doc.tileSize), Doc.animated(tile) ? el('span', { className: 'tile-anim', textContent: tile.frames.length }) : null]);
      item.dataset.index = i;
      item.onclick = () => App.selectTile(i);
      item.ondblclick = () => App.renameTile(i);
      item.oncontextmenu = (e) => {
        e.preventDefault();
        App.selectTile(i);
        Menus.open(App.tileMenuItems(), e.clientX, e.clientY);
      };
      item.ondragstart = (e) => { dragFrom = i; e.dataTransfer.effectAllowed = 'move'; item.classList.add('dragging'); };
      item.ondragend = () => { dragFrom = null; item.classList.remove('dragging'); $$('.tile-item.drop').forEach((n) => n.classList.remove('drop')); };
      item.ondragover = (e) => { if (dragFrom === null) return; e.preventDefault(); item.classList.add('drop'); };
      item.ondragleave = () => item.classList.remove('drop');
      item.ondrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const to = i;
        if (dragFrom === null || dragFrom === to) return;
        const from = dragFrom;
        Doc.change(doc, 'Déplacer une tuile', () => Doc.moveTile(doc, from, to));
      };
      tilesEl.append(item);
    });
    $('#tiles-count').textContent = `${doc.tiles.length} · ${doc.tileSize}×${doc.tileSize}`;
  }

  // Pendant un coup de crayon (ou à chaque image de l'animation) : seule une vignette est refaite.
  function refreshThumb(i, frame) {
    const doc = App.doc;
    const item = tilesEl.children[i];
    if (!item || !doc.tiles[i]) return;
    const c = item.querySelector('canvas');
    const g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    g.drawImage(Doc.tileCanvas(doc.tiles[i], doc.tileSize, frame), 0, 0);
  }
  const refreshCurrentThumb = () => refreshThumb(App.doc.current, App.playing ? shownFrame(App.doc.tiles[App.doc.current]) : App.frame);

  // --- Aperçu : la tuile répétée en 3 × 3, à taille ×2 ou ×3 (comme dans le jeu) ---
  const previewCanvas = $('#preview');
  function renderPreview() {
    const doc = App.doc;
    if (!doc) return;
    const s = doc.tileSize;
    const scale = Math.max(1, Math.floor(240 / (s * 3)));
    previewCanvas.width = previewCanvas.height = s * 3 * scale;
    const g = previewCanvas.getContext('2d');
    g.imageSmoothingEnabled = false;
    drawChecker(g, 0, 0, previewCanvas.width, previewCanvas.height, 6);
    const t = doc.tiles[doc.current];
    const tile = Doc.tileCanvas(t, s, App.playing ? shownFrame(t) : App.frame);
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) g.drawImage(tile, i * s * scale, j * s * scale, s * scale, s * scale);
    $('#preview-scale').textContent = `×${scale}`;
  }

  // --- Animation : les images de la tuile choisie ---
  const framesEl = $('#frames');
  function renderFrames() {
    const doc = App.doc;
    framesEl.innerHTML = '';
    if (!doc) return;
    const tile = doc.tiles[doc.current];
    const s = doc.tileSize;
    tile.frames.forEach((_f, k) => {
      const c = el('canvas', { width: s, height: s, className: 'tile-canvas' });
      c.getContext('2d').drawImage(Doc.tileCanvas(tile, s, k), 0, 0);
      const b = el('button', { className: `frame-item${k === App.frame ? ' active' : ''}`, title: `Image ${k + 1} sur ${tile.frames.length}\nClic : la dessiner · glisser : changer l'ordre`, draggable: true }, [c, el('span', { className: 'frame-num', textContent: k + 1 })]);
      b.onclick = () => App.selectFrame(k);
      b.ondragstart = (e) => { e.dataTransfer.effectAllowed = 'move'; b.dataset.dragging = '1'; framesEl.dataset.from = k; };
      b.ondragover = (e) => { if (framesEl.dataset.from !== undefined) e.preventDefault(); };
      b.ondrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const from = Number(framesEl.dataset.from);
        delete framesEl.dataset.from;
        if (Number.isNaN(from) || from === k) return;
        Doc.change(doc, 'Déplacer une image', () => Doc.moveFrame(doc, doc.current, from, k));
        App.selectFrame(k);
      };
      b.ondragend = () => { delete framesEl.dataset.from; };
      framesEl.append(b);
    });
    const duration = $('#frame-duration');
    if (document.activeElement !== duration) duration.value = tile.duration;
    duration.disabled = tile.frames.length < 2;
    $('#frame-delete').disabled = tile.frames.length < 2;
    $('#anim-play').classList.toggle('active', App.playing);
    $('#anim-play').innerHTML = '';
    $('#anim-play').append(icon(App.playing ? 'debug-pause' : 'play'));
    $('#anim-play').title = App.playing ? 'Arrêter l\'animation (P)' : 'Lancer l\'animation dans l\'aperçu, les vignettes et la carte (P)';
    $('#frames-count').textContent = tile.frames.length > 1 ? `${tile.frames.length} images` : 'fixe';
  }

  // À chaque instant de l'animation : les vignettes des tuiles animées et l'aperçu.
  function tick() {
    const doc = App.doc;
    if (!doc) return;
    doc.tiles.forEach((t, i) => { if (Doc.animated(t)) refreshThumb(i, shownFrame(t)); });
    renderPreview();
  }

  function render() {
    renderPalette();
    renderTiles();
    renderFrames();
    renderPreview();
  }
  function renderLive() {
    refreshCurrentThumb();
    renderPreview();
    const c = framesEl.children[App.frame]?.querySelector('canvas');
    if (c) {
      const g = c.getContext('2d');
      g.clearRect(0, 0, c.width, c.height);
      g.drawImage(Doc.tileCanvas(App.doc.tiles[App.doc.current], App.doc.tileSize, App.frame), 0, 0);
    }
  }

  return { render, renderLive, renderColors, renderTiles, renderFrames, tick, usedColors };
})();
