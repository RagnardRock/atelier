// Chef d'orchestre de l'interface : onglets des images ouvertes, menus, raccourcis clavier,
// panneaux (couleur, calques, historique), barre d'état, réglages de Skald.

const App = (() => {
  const docs = [];
  let current = null;
  const colors = { primary: '#000000', secondary: '#ffffff' };
  let recentColors = [];
  try { recentColors = JSON.parse(localStorage.getItem('skald.colors') || '[]'); } catch { recentColors = []; }

  const doc = () => current;

  // --- Documents (onglets) ---

  function openDocument(d) {
    docs.push(d);
    activate(d);
  }
  function activate(d) {
    if (current && Tools.current.deactivate) Tools.current.deactivate(current);
    current = d;
    if (current && Tools.current.activate) Tools.current.activate(current);
    refresh();
  }
  async function closeDocument(d = current) {
    if (!d) return true;
    if (d.dirty) {
      activate(d);
      const choice = await Dialogs.ask('Fermer', `« ${d.name} » a des modifications non enregistrées.`, [
        { label: 'Annuler', value: null },
        { label: 'Ne pas enregistrer', value: 'discard' },
        { label: 'Enregistrer', value: 'save', primary: true },
      ]);
      if (!choice) return false;
      if (choice === 'save' && !(await IO.save(d))) return false;
    }
    const index = docs.indexOf(d);
    docs.splice(index, 1);
    if (current === d) current = docs[Math.min(index, docs.length - 1)] || null;
    if (current) activate(current); else refresh();
    return true;
  }

  // Tout redessiner après un changement (image + panneaux).
  function refresh() {
    View.request(true);
    refreshPanels();
  }
  function refreshPanels() {
    renderTabs();
    renderLayers();
    renderHistory();
    updateStatus();
    $('#welcome').hidden = Boolean(current);
    $('#stage').hidden = !current;
    document.title = current ? `${current.dirty ? '● ' : ''}${current.name} · Skald` : 'Skald';
  }

  function renderTabs() {
    const bar = $('#tabs');
    bar.innerHTML = '';
    for (const d of docs) {
      const tab = document.createElement('div');
      tab.className = `tab${d === current ? ' active' : ''}${d.dirty ? ' dirty' : ''}`;
      tab.title = d.path || 'Pas encore enregistrée';
      tab.innerHTML = '<span class="tab-name"></span><button class="icon-button tab-close" title="Fermer (Ctrl+W)"><i class="codicon codicon-close"></i></button>';
      tab.querySelector('.tab-name').textContent = d.name;
      tab.onclick = () => activate(d);
      tab.onauxclick = (e) => { if (e.button === 1) closeDocument(d); };
      tab.querySelector('.tab-close').onclick = (e) => { e.stopPropagation(); closeDocument(d); };
      bar.appendChild(tab);
    }
  }

  // --- Panneau Calques ---

  const thumbChecker = (() => {
    const c = newCanvas(8, 8);
    const g = c.getContext('2d');
    g.fillStyle = '#3a3a42'; g.fillRect(0, 0, 8, 8);
    g.fillStyle = '#2e2e34'; g.fillRect(0, 0, 4, 4); g.fillRect(4, 4, 4, 4);
    return c;
  })();
  function thumbnail(d, layer) {
    const size = 34;
    const c = newCanvas(size * 2, size * 2); // ×2 pour rester net sur un écran à haute densité
    const g = c.getContext('2d');
    g.fillStyle = g.createPattern(thumbChecker, 'repeat');
    g.fillRect(0, 0, c.width, c.height);
    const scale = Math.min(c.width / d.width, c.height / d.height);
    const ox = (c.width - d.width * scale) / 2, oy = (c.height - d.height * scale) / 2;
    g.imageSmoothingQuality = 'high';
    if (Adjust.isSpecial(layer)) {
      // Calque de réglage ou de remplissage : on montre son masque, comme Photoshop (noir = caché, blanc = visible).
      g.fillStyle = '#000';
      g.fillRect(ox, oy, d.width * scale, d.height * scale);
      const white = newCanvas(c.width, c.height);
      const wg = white.getContext('2d');
      wg.drawImage(layer.canvas, ox + layer.x * scale, oy + layer.y * scale, layer.canvas.width * scale, layer.canvas.height * scale);
      wg.globalCompositeOperation = 'source-in';
      wg.fillStyle = '#fff';
      wg.fillRect(0, 0, white.width, white.height);
      g.drawImage(white, 0, 0);
    } else g.drawImage(layer.canvas, ox + layer.x * scale, oy + layer.y * scale, layer.canvas.width * scale, layer.canvas.height * scale);
    c.className = 'thumb';
    return c;
  }

  let dragLayer = null;
  let pendingSnap = null; // opacité en cours de réglage (un seul pas d'historique par geste)

  function renderLayers() {
    const list = $('#layer-list');
    list.innerHTML = '';
    const props = $('#layer-props');
    props.hidden = !current;
    $('#layers-actions').hidden = !current;
    if (!current) return;
    const active = activeLayer(current);
    $('#layer-blend').value = active?.blend || 'source-over';
    $('#layer-opacity').value = Math.round((active?.opacity ?? 1) * 100);
    $('#layer-opacity-value').textContent = `${Math.round((active?.opacity ?? 1) * 100)} %`;
    for (const layer of [...current.layers].reverse()) {
      const row = document.createElement('div');
      row.className = `layer${layer.id === current.activeId ? ' active' : ''}${layer.visible ? '' : ' hidden-layer'}`;
      row.draggable = true;
      row.innerHTML = `<button class="icon-button eye" title="Afficher / masquer"><i class="codicon codicon-${layer.visible ? 'eye' : 'eye-closed'}"></i></button>
        <span class="layer-name"></span>${layer.text ? '<span class="layer-badge" title="Texte modifiable avec l\'outil Texte">T</span>' : ''}`;
      row.insertBefore(thumbnail(current, layer), row.querySelector('.layer-name'));
      if (Adjust.isSpecial(layer)) {
        // Pastille devant le masque : la couleur du remplissage, ou l'icône des réglages.
        const kind = document.createElement('span');
        kind.className = 'layer-kind';
        kind.title = `${Adjust.definition(layer).name} : double-clic pour régler. Peins le masque en noir pour cacher l'effet, en blanc pour le montrer.`;
        if (layer.fill?.type === 'color') kind.style.background = layer.fill.values.color;
        else kind.innerHTML = `<i class="codicon codicon-${layer.fill ? 'symbol-color' : 'color-mode'}"></i>`;
        row.insertBefore(kind, row.querySelector('.thumb'));
      }
      row.querySelector('.layer-name').textContent = layer.name;
      row.onclick = (e) => {
        current.activeId = layer.id;
        // Ctrl + clic : sélectionner le contenu du calque, comme dans Photoshop.
        if (e.ctrlKey) return Ops.selectLayerPixels();
        refreshPanels();
        View.request();
      };
      row.querySelector('.eye').onclick = (e) => {
        e.stopPropagation();
        change(current, layer.visible ? 'Masquer le calque' : 'Afficher le calque', () => { layer.visible = !layer.visible; });
      };
      row.ondblclick = (e) => {
        if (e.target.closest('.eye')) return;
        // Double-clic sur la vignette d'un calque de réglage : ses réglages. Sur le nom : renommer.
        if (Adjust.isSpecial(layer) && e.target.closest('.thumb, .layer-kind')) return Adjust.edit(layer);
        renameLayer(row, layer);
      };
      row.ondragstart = (e) => { dragLayer = layer; e.dataTransfer.effectAllowed = 'move'; row.classList.add('dragging'); };
      row.ondragend = () => { dragLayer = null; row.classList.remove('dragging'); };
      row.ondragover = (e) => {
        if (!dragLayer) return;
        e.preventDefault();
        const above = e.offsetY < row.clientHeight / 2;
        row.classList.toggle('drop-above', above);
        row.classList.toggle('drop-below', !above);
      };
      row.ondragleave = () => row.classList.remove('drop-above', 'drop-below');
      row.ondrop = (e) => {
        e.preventDefault();
        row.classList.remove('drop-above', 'drop-below');
        if (!dragLayer || dragLayer === layer) return;
        const moving = dragLayer;
        const above = e.offsetY < row.clientHeight / 2;
        change(current, 'Réordonner les calques', (d) => {
          d.layers.splice(d.layers.indexOf(moving), 1);
          const target = d.layers.indexOf(layer);
          d.layers.splice(above ? target + 1 : target, 0, moving); // la liste est affichée du haut vers le bas
        });
      };
      list.appendChild(row);
    }
  }

  function renameLayer(row, layer) {
    const name = row.querySelector('.layer-name');
    const input = document.createElement('input');
    input.className = 'rename';
    input.value = layer.name;
    name.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      const value = input.value.trim();
      if (ok && value && value !== layer.name) change(current, 'Renommer le calque', () => { layer.name = value; });
      else renderLayers();
    };
    input.onkeydown = (e) => { if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); e.stopPropagation(); };
    input.onblur = () => finish(true);
  }

  // Modes de fusion et opacité du calque actif.
  const blendSelect = $('#layer-blend');
  for (const [value, label] of BLEND_MODES) blendSelect.add(new Option(label, value));
  blendSelect.onchange = () => {
    const layer = activeLayer(current);
    if (layer) change(current, 'Mode de fusion', () => { layer.blend = blendSelect.value; });
    blendSelect.blur();
  };
  const opacity = $('#layer-opacity');
  opacity.oninput = () => {
    const layer = activeLayer(current);
    if (!layer) return;
    if (!pendingSnap) pendingSnap = snapshot(current, 'Opacité du calque');
    layer.opacity = opacity.value / 100;
    $('#layer-opacity-value').textContent = `${opacity.value} %`;
    View.request(true);
  };
  opacity.onchange = () => {
    if (pendingSnap && current) commit(current, pendingSnap);
    pendingSnap = null;
    opacity.blur();
  };

  // --- Panneau Historique ---
  function renderHistory() {
    const list = $('#history-list');
    list.innerHTML = '';
    if (!current) return;
    const entries = [{ label: 'Ouverture', index: 0 }, ...current.undo.map((s, i) => ({ label: s.label, index: i + 1 }))];
    const future = [...current.redo].reverse().map((s, i) => ({ label: s.label, index: current.undo.length + 1 + i, future: true }));
    // Les noms d'étapes sont ceux de l'action faite (on les lit dans les instantanés suivants).
    const labels = [...current.undo.map((s) => s.label), ...[...current.redo].reverse().map((s) => s.label)];
    [...entries, ...future].forEach((e) => {
      const item = document.createElement('div');
      item.className = `history-item${e.index === current.undo.length ? ' active' : ''}${e.future ? ' future' : ''}`;
      item.textContent = e.index === 0 ? 'Ouverture' : labels[e.index - 1];
      item.onclick = () => {
        // Aller à cette étape : on annule ou rétablit autant de fois qu'il faut.
        while (current.undo.length > e.index) undo(current);
        while (current.undo.length < e.index && current.redo.length) redo(current);
      };
      list.appendChild(item);
    });
    list.scrollTop = list.scrollHeight;
  }

  // --- Couleurs ---
  function setColor(which, hex) {
    colors[which] = hex.toLowerCase();
    if (which === 'primary') {
      recentColors = [colors.primary, ...recentColors.filter((c) => c !== colors.primary)].slice(0, 16);
      try { localStorage.setItem('skald.colors', JSON.stringify(recentColors)); } catch { /* pas grave */ }
    }
    renderColors();
  }
  function renderColors() {
    $('#swatch-primary').style.background = colors.primary;
    $('#swatch-secondary').style.background = colors.secondary;
    $('#color-big').style.background = colors.primary;
    const hex = $('#color-hex');
    if (document.activeElement !== hex) hex.value = colors.primary;
    $('#color-native').value = colors.primary;
    const [r, g, b] = hexToRgb(colors.primary);
    $('#color-rgb').textContent = `R ${r}  V ${g}  B ${b}`;
    const recent = $('#color-recent');
    recent.innerHTML = '';
    for (const c of recentColors) {
      const s = document.createElement('button');
      s.className = 'mini-swatch';
      s.style.background = c;
      s.title = `${c} (clic droit : couleur secondaire)`;
      s.onclick = () => setColor('primary', c);
      s.oncontextmenu = (e) => { e.preventDefault(); setColor('secondary', c); };
      recent.appendChild(s);
    }
  }
  const swapColors = () => { [colors.primary, colors.secondary] = [colors.secondary, colors.primary]; renderColors(); };
  const resetColors = () => { colors.primary = '#000000'; colors.secondary = '#ffffff'; renderColors(); };
  $('#color-hex').addEventListener('change', (e) => {
    const v = e.target.value.trim();
    if (/^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(v)) setColor('primary', rgbToHex(...hexToRgb(v.startsWith('#') ? v : `#${v}`)));
    else renderColors();
  });
  $('#color-native').addEventListener('input', (e) => setColor('primary', e.target.value));
  $('#swatch-primary').onclick = () => $('#color-native').click();
  $('#color-big').onclick = () => $('#color-native').click();
  $('#swatch-secondary').onclick = async () => {
    const v = await Dialogs.form({ title: 'Couleur secondaire', fields: [{ key: 'color', label: 'Couleur', type: 'color', value: colors.secondary }] });
    if (v) setColor('secondary', v.color);
  };
  $('#swap-colors').onclick = swapColors;
  $('#reset-colors').onclick = resetColors;

  // --- Barre d'outils et barre d'options ---
  function renderToolbar() {
    const bar = $('#tool-buttons');
    bar.innerHTML = '';
    for (const tool of Tools.list) {
      if (tool.hidden) continue;
      const b = document.createElement('button');
      b.className = `tool${tool === Tools.current ? ' active' : ''}`;
      const shared = Tools.list.filter((t) => t.key === tool.key).length > 1;
      b.title = `${tool.name} (${tool.key.toUpperCase()}${shared ? ', Maj+' + tool.key.toUpperCase() + ' pour alterner' : ''})`;
      b.innerHTML = tool.icon;
      b.onclick = () => Tools.select(tool.id);
      bar.appendChild(b);
    }
  }
  function refreshTool() {
    renderToolbar();
    const tool = Tools.current;
    $('#stage').style.cursor = tool.cursor;
    const bar = $('#tool-options');
    bar.innerHTML = `<span class="tool-title">${tool.icon}<span></span></span>`;
    bar.querySelector('.tool-title span').textContent = tool.name;
    for (const o of tool.options) {
      const wrap = document.createElement('label');
      wrap.className = `option option-${o.type}`;
      if (o.type === 'button') {
        const b = document.createElement('button');
        b.className = 'button small';
        b.innerHTML = `<i class="codicon codicon-${o.icon}"></i><span></span>`;
        b.querySelector('span').textContent = o.label;
        b.onclick = o.run;
        bar.appendChild(b);
        continue;
      }
      const name = document.createElement('span');
      name.textContent = o.label;
      const value = Tools.settings[tool.id][o.key];
      let input;
      if (o.type === 'checkbox') {
        input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = value;
        input.onchange = () => { Tools.settings[tool.id][o.key] = input.checked; Tools.save(); input.blur(); };
        wrap.append(input, name);
      } else if (o.type === 'select') {
        input = document.createElement('select');
        for (const [v, l] of o.choices) input.add(new Option(l, v));
        input.value = value;
        input.onchange = () => { Tools.settings[tool.id][o.key] = input.value; Tools.save(); input.blur(); View.request(); };
        wrap.append(name, input);
      } else {
        input = document.createElement('input');
        input.type = 'range';
        Object.assign(input, { min: o.min, max: o.max, value });
        const number = document.createElement('input');
        number.type = 'number';
        number.className = 'range-number';
        Object.assign(number, { min: o.min, max: o.max, value });
        const set = (v) => { Tools.settings[tool.id][o.key] = Number(v); Tools.save(); View.request(); };
        input.oninput = () => { number.value = input.value; set(input.value); };
        input.onchange = () => input.blur();
        number.onchange = () => { input.value = number.value; set(number.value); };
        const unit = document.createElement('span');
        unit.className = 'unit';
        unit.textContent = o.unit || '';
        wrap.append(name, input, number, unit);
      }
      bar.appendChild(wrap);
    }
    updateStatus();
  }

  // --- Barre d'état ---
  function updateStatus(pointer = View.pointer) {
    $('#status-hint').textContent = Tools.current.hint || '';
    if (!current) {
      $('#status-doc').textContent = '';
      $('#status-pos').textContent = '';
      $('#status-zoom').textContent = '';
      return;
    }
    $('#status-doc').textContent = `${current.width} × ${current.height} px · ${current.layers.length} calque${current.layers.length > 1 ? 's' : ''}`;
    const s = current.selection;
    const pos = pointer ? `x ${Math.floor(pointer.x)}  y ${Math.floor(pointer.y)}` : '';
    $('#status-pos').textContent = s ? `${pos}   Sélection ${s.w} × ${s.h}` : pos;
    $('#status-zoom').textContent = current.view ? `${Math.round(current.view.zoom * 1000) / 10} %` : '';
  }

  // --- Menus ---
  // Chaque élément : [libellé, raccourci, action] ; '-' = séparateur.
  // Les raccourcis sont écrits comme sur le clavier (AZERTY compris : Ctrl+1 marche sans Maj).
  const menus = {
    Fichier: () => [
      ['Nouvelle image…', 'Ctrl+N', newImage],
      ['Ouvrir…', 'Ctrl+O', () => IO.openFiles()],
      '-',
      ['Enregistrer', 'Ctrl+S', () => IO.save()],
      ['Enregistrer sous (PSD)…', 'Ctrl+Maj+S', () => IO.save(current, true)],
      ['Exporter (PNG, WebP, JPEG, ICO)…', 'Ctrl+Maj+E', () => IO.exportImage()],
      ['Exporter un pack d\'icônes…', '', () => IO.exportIcons()],
      '-',
      ['Fermer l\'onglet', 'Ctrl+W', () => closeDocument()],
      ['Réglages de Skald…', 'Ctrl+,', openSettings],
      ...recentItems(),
    ],
    Édition: () => [
      ['Annuler', 'Ctrl+Z', () => undo(current)],
      ['Rétablir', 'Ctrl+Y', () => redo(current)],
      '-',
      ['Couper', 'Ctrl+X', () => Ops.copy(false, true)],
      ['Copier', 'Ctrl+C', () => Ops.copy()],
      ['Copier l\'image fusionnée', 'Ctrl+Maj+C', () => Ops.copy(true)],
      ['Coller', 'Ctrl+V', () => Ops.paste()],
      '-',
      ['Effacer la sélection', 'Suppr', Ops.clearSelection],
      ['Remplir avec la couleur principale', 'Alt+Retour', Ops.fillSelection],
    ],
    Sélection: () => [
      ['Tout sélectionner', 'Ctrl+A', Ops.selectAll],
      ['Désélectionner', 'Ctrl+D', Ops.deselect],
      ['Intervertir', 'Ctrl+Maj+I', Ops.invertSelection],
      ['Sélectionner le contenu du calque', '', Ops.selectLayerPixels],
      '-',
      ['Contour progressif…', 'Maj+F6', Ops.featherSelection],
      ['Étendre ou réduire…', '', Ops.growSelection],
      '-',
      ['Recadrer à la sélection', '', Ops.cropToSelection],
      ['Nouveau calque avec la sélection', 'Ctrl+J', Ops.layerFromSelection],
    ],
    Image: () => [
      ['Taille de l\'image…', 'Ctrl+Alt+I', Ops.imageSize],
      ['Taille de la zone de travail…', 'Ctrl+Alt+C', Ops.canvasSize],
      '-',
      ['Recadrer à la sélection', '', Ops.cropToSelection],
      ['Rogner le vide (bords transparents)', '', Ops.trim],
      '-',
      ['Rotation 90° horaire', '', () => Ops.rotateImage('cw')],
      ['Rotation 90° antihoraire', '', () => Ops.rotateImage('ccw')],
      ['Rotation 180°', '', () => Ops.rotateImage('180')],
      ['Miroir horizontal', '', () => Ops.rotateImage('h')],
      ['Miroir vertical', '', () => Ops.rotateImage('v')],
      '-',
      ['Aplatir l\'image', '', Ops.flattenImage],
    ],
    Calque: () => [
      ['Nouveau calque', 'Ctrl+Maj+N', Ops.newLayer],
      ['Dupliquer (ou copier la sélection)', 'Ctrl+J', Ops.layerFromSelection],
      ['Supprimer le calque', '', () => Ops.deleteLayer()],
      ['Fusionner avec le calque inférieur', 'Ctrl+E', Ops.mergeDown],
      ['Nouveau calque de remplissage ou de réglage…', '', () => showMenu($('#layer-special'), Adjust.menuItems())],
      ['Pixelliser le calque de remplissage', '', Ops.rasterizeLayer],
      '-',
      ['Transformation libre (poignées)', 'Ctrl+T', Ops.transformLayer],
      ['Transformer avec des valeurs…', '', Ops.transformNumeric],
      ['Centrer dans l\'image', '', () => Ops.centerLayer()],
      ['Centrer horizontalement', '', () => Ops.centerLayer('h')],
      ['Centrer verticalement', '', () => Ops.centerLayer('v')],
      ['Miroir horizontal du calque', '', () => Ops.flipLayer('h')],
      ['Miroir vertical du calque', '', () => Ops.flipLayer('v')],
      '-',
      ['Monter le calque', '', () => Ops.moveLayer(1)],
      ['Descendre le calque', '', () => Ops.moveLayer(-1)],
    ],
    Couleurs: () => [
      ['Luminosité, contraste et couleurs…', 'Ctrl+U', Ops.colors],
      ['Niveaux…', 'Ctrl+L', Ops.levels],
      ['Exposition et vibrance…', '', Ops.exposure],
      ['Noir et blanc', 'Ctrl+Maj+U', Ops.grayscale],
      ['Inverser', 'Ctrl+I', Ops.invert],
      '-',
      ['Flou…', '', Ops.blur],
      ['Netteté…', '', Ops.sharpen],
    ],
    Logo: () => [
      ['Rendre une couleur transparente…', '', Ops.removeColor],
      ['Teinte unie (recolorer)…', '', Ops.recolor],
      ['Contour…', '', Ops.outline],
      ['Ombre portée…', '', Ops.shadow],
      '-',
      ['Rogner le vide', '', Ops.trim],
      ['Centrer le calque dans l\'image', '', () => Ops.centerLayer()],
      ['Exporter un pack d\'icônes…', '', () => IO.exportIcons()],
    ],
    Affichage: () => [
      ['Zoom avant', 'Ctrl++', () => current && View.zoomStep(current, 1)],
      ['Zoom arrière', 'Ctrl+-', () => current && View.zoomStep(current, -1)],
      ['Ajuster à l\'écran', 'Ctrl+0', () => current && View.fit(current)],
      ['Taille réelle (100 %)', 'Ctrl+1', () => current && View.setZoom(current, 1, null, true)],
    ],
  };
  let recentFiles = [];
  function recentItems() {
    if (!recentFiles.length) return [];
    return ['-', ...recentFiles.slice(0, 8).map((f) => [f.split(/[\\/]/).pop(), '', () => IO.openPath(f), f])];
  }

  let openMenu = null;
  function closeMenu() {
    openMenu?.remove();
    openMenu = null;
    $$('#menus button').forEach((b) => b.classList.remove('open'));
  }
  // name : un menu de la barre (« Fichier »…), ou directement la liste de ses lignes.
  function showMenu(button, name) {
    closeMenu();
    button.classList.add('open');
    const menu = document.createElement('div');
    menu.className = 'menu';
    for (const item of Array.isArray(name) ? name : menus[name]()) {
      if (item === '-') { menu.appendChild(Object.assign(document.createElement('div'), { className: 'menu-sep' })); continue; }
      const [label, keys, run, title] = item;
      const row = document.createElement('button');
      row.className = 'menu-item';
      row.innerHTML = '<span class="menu-label"></span><span class="menu-keys"></span>';
      row.querySelector('.menu-label').textContent = label;
      row.querySelector('.menu-keys').textContent = keys;
      if (title) row.title = title;
      row.onclick = () => { closeMenu(); run(); };
      menu.appendChild(row);
    }
    const r = button.getBoundingClientRect();
    menu.style.left = `${r.left}px`;
    menu.style.top = `${r.bottom + 4}px`;
    document.body.appendChild(menu);
    // Ne pas déborder à droite de la fenêtre (menus ouverts depuis le panneau des calques).
    const overflow = menu.getBoundingClientRect().right - (window.innerWidth - 8);
    if (overflow > 0) menu.style.left = `${Math.max(8, r.left - overflow)}px`;
    openMenu = menu;
    openMenu.dataset.name = Array.isArray(name) ? '' : name;
  }
  for (const name of Object.keys(menus)) {
    const b = document.createElement('button');
    b.textContent = name;
    b.onclick = (e) => { e.stopPropagation(); if (openMenu?.dataset.name === name) closeMenu(); else showMenu(b, name); };
    // Menu déjà ouvert : survoler un autre titre l'ouvre directement (comme une vraie barre de menus).
    b.onmouseenter = () => { if (openMenu && openMenu.dataset.name !== name) showMenu(b, name); };
    $('#menus').appendChild(b);
  }
  document.addEventListener('pointerdown', (e) => { if (openMenu && !e.target.closest('.menu') && !e.target.closest('#menus')) closeMenu(); });

  // --- Raccourcis clavier ---
  // On compare l'événement au texte du raccourci écrit dans les menus.
  function matches(e, keys) {
    if (!keys) return false;
    const parts = keys.split('+');
    let key = parts.pop();
    if (key === '' && keys.endsWith('++')) key = '+';
    const ctrl = parts.includes('Ctrl'), shift = parts.includes('Maj'), alt = parts.includes('Alt');
    if (e.ctrlKey !== ctrl || e.altKey !== alt) return false;
    // Chiffres : on regarde la touche physique (en AZERTY, « 1 » demande Maj sinon).
    if (/^[0-9]$/.test(key)) return (e.code === `Digit${key}` || e.code === `Numpad${key}`) && e.shiftKey === shift;
    if (key === '+') return e.key === '+' || e.key === '=' || e.code === 'NumpadAdd';
    if (key === '-') return e.key === '-' || e.code === 'NumpadSubtract';
    if (e.shiftKey !== shift) return false;
    if (key === 'Suppr') return e.key === 'Delete' || e.key === 'Backspace';
    if (key === 'Retour') return e.key === 'Backspace';
    return e.key.toLowerCase() === key.toLowerCase();
  }

  const lastInGroup = {};
  window.addEventListener('keydown', (e) => {
    if (Dialogs.isOpen()) {
      if (e.key === 'Escape') Dialogs.close(null);
      return;
    }
    if (e.key === 'Escape' && openMenu) return closeMenu();
    if (isTyping(e)) return;
    // Un outil peut garder une touche pour lui (Retour arrière du lasso polygonal, par exemple).
    if (current && Tools.current.keydown?.(current, e)) return e.preventDefault();
    for (const name of Object.keys(menus)) {
      for (const item of menus[name]()) {
        if (item !== '-' && item[1] && matches(e, item[1])) {
          e.preventDefault();
          closeMenu();
          return item[2]();
        }
      }
    }
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const d = current;
    // Outils : une lettre, comme dans Photoshop. Plusieurs outils sur la même lettre (G : dégradé
    // et pot de peinture) : la lettre reprend le dernier utilisé, Maj + lettre passe au suivant.
    const group = Tools.list.filter((t) => t.key && t.key === e.key.toLowerCase());
    if (group.length) {
      const here = group.indexOf(Tools.current);
      const next = here >= 0 && e.shiftKey ? group[(here + 1) % group.length] : group.find((t) => t.id === lastInGroup[e.key.toLowerCase()]) || group[0];
      lastInGroup[e.key.toLowerCase()] = next.id;
      return Tools.select(next.id);
    }
    if (e.key.toLowerCase() === 'x') return swapColors();
    if (e.key.toLowerCase() === 'd') return resetColors();
    if (!d) return;
    if (e.key === 'Enter' && Tools.current.enter) return Tools.current.enter(d);
    if (e.key === 'Enter' && Tools.current.id === 'crop') return Tools.applyCrop(d);
    if (e.key === 'Escape') {
      if (Tools.current.escape) return Tools.current.escape(d);
      if (Tools.current.id === 'crop') { Tools.current.activate(d); return View.request(); }
      return Ops.deselect();
    }
    // Taille du pinceau : [ et ] (ou les touches ù et * à côté d'Entrée en AZERTY).
    if (['[', ']', 'ù', '*'].includes(e.key) && Tools.settings[Tools.current.id]?.size) {
      const s = Tools.settings[Tools.current.id];
      const up = e.key === ']' || e.key === '*';
      s.size = Math.max(1, Math.min(500, Math.round(s.size * (up ? 1.2 : 1 / 1.2)) + (up ? 1 : -1)));
      Tools.save();
      refreshTool();
      return View.request();
    }
    // Flèches : déplacer le calque actif d'un pixel (10 avec Maj).
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (arrows[e.key] && Tools.current.id === 'move') {
      e.preventDefault();
      const layer = activeLayer(d);
      if (!layer) return;
      const step = e.shiftKey ? 10 : 1;
      change(d, 'Déplacer', () => { layer.x += arrows[e.key][0] * step; layer.y += arrows[e.key][1] * step; });
    }
  });

  // --- Nouvelle image ---
  async function newImage() {
    const v = await Dialogs.newImage(await Ops.clipboardSize());
    if (!v) return;
    const canvas = newCanvas(v.width, v.height);
    if (v.background !== 'transparent') {
      const g = canvas.getContext('2d');
      g.fillStyle = v.background === 'secondary' ? colors.secondary : v.background;
      g.fillRect(0, 0, canvas.width, canvas.height);
    }
    openDocument(createDocument({ name: v.name || 'Sans titre', width: v.width, height: v.height, layers: [createLayer(v.background === 'transparent' ? 'Calque 1' : 'Fond', canvas)] }));
  }

  // --- Glisser-déposer depuis l'Explorateur ---
  // Lâché sur l'image : ajouté en calque. Lâché ailleurs (onglets, accueil) : ouvert à part.
  const workspace = $('#workspace');
  let dragDepth = 0;
  workspace.addEventListener('dragenter', (e) => { if (e.dataTransfer.types.includes('Files')) { dragDepth++; workspace.classList.add('drop-target'); $('#drop-hint').textContent = current ? 'Lâche sur l\'image pour l\'ajouter en calque, sur les onglets pour l\'ouvrir à part' : 'Lâche pour ouvrir'; } });
  workspace.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; workspace.classList.remove('drop-target'); } });
  workspace.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); });
  workspace.addEventListener('drop', async (e) => {
    e.preventDefault();
    dragDepth = 0;
    workspace.classList.remove('drop-target');
    const asLayer = current && !e.target.closest('#tabs');
    for (const file of e.dataTransfer.files) {
      try {
        const path = window.skald.pathOfDropped(file);
        const loaded = path ? await window.skald.openPath(path) : { path: null, name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
        const opened = await IO.decode(loaded);
        if (!asLayer) { openDocument(opened); continue; }
        const canvas = flatten(opened);
        const d = current;
        const layer = createLayer(opened.name.replace(/\.[^.]+$/, ''), canvas, { x: Math.round((d.width - canvas.width) / 2), y: Math.round((d.height - canvas.height) / 2) });
        change(d, 'Placer une image', () => {
          const index = d.layers.findIndex((l) => l.id === d.activeId);
          d.layers.splice(index + 1, 0, layer);
          d.activeId = layer.id;
        });
      } catch (err) {
        notify(cleanError(err), 'error');
      }
    }
  });
  // Rien ne doit remplacer la page si on lâche à côté.
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());

  // --- Réglages de Skald ---
  const ACCENTS = ['#e0a526', '#5ec8ff', '#b9a8ff', '#ff7aa8', '#4ade80', '#ff8a4c', '#f5f5f5'];
  async function applyTheme(config) {
    document.documentElement.style.setProperty('--accent', config.accentColor);
    document.body.classList.toggle('glass', Boolean(config.glass));
    const { blur, needsRestart } = await window.skald.setWindowTheme({ glass: config.glass, blur: config.windowBlur });
    document.body.classList.toggle('window-blur', blur);
    return needsRestart;
  }
  async function openSettings() {
    const blurOk = await window.skald.blurSupported();
    const version = await window.skald.version();
    const swatches = document.createElement('div');
    swatches.className = 'accent-swatches';
    const v = await Dialogs.form({
      title: 'Réglages de Skald',
      okLabel: 'Enregistrer',
      width: 460,
      fields: [
        { key: 'accentColor', label: 'Couleur d\'accent', type: 'color', value: api.config.accentColor },
        { type: 'element', element: swatches },
        { key: 'glass', label: 'Verre dépoli (glassmorphism)', type: 'checkbox', value: api.config.glass },
        { key: 'windowBlur', label: blurOk ? 'Flou de Windows 11 derrière la fenêtre' : 'Flou de Windows 11 (non disponible ici)', type: 'checkbox', value: api.config.windowBlur },
        { key: 'historySteps', label: 'Étapes d\'annulation gardées', type: 'number', value: api.config.historySteps, min: 5, max: 200 },
        { key: 'exportQuality', label: 'Qualité JPEG / WebP par défaut', type: 'range', value: api.config.exportQuality, min: 1, max: 100, unit: '%' },
        { key: 'claudeModel', label: 'Modèle de Claude', type: 'select', value: api.config.claudeModel || '', choices: [['', 'Par défaut (celui de Claude Code)'], ['opus', 'Opus'], ['sonnet', 'Sonnet'], ['haiku', 'Haiku']] },
        { key: 'claudeCommand', label: 'Commande Claude Code', type: 'text', value: api.config.claudeCommand || 'claude' },
        { key: 'claudeCommandes', label: 'Claude peut lancer des commandes (PowerShell, Python…) : plus lent, rarement utile', type: 'checkbox', value: Boolean(api.config.claudeCommandes) },
        { type: 'info', text: `Skald ${version}. Réglages enregistrés dans ${api.configPath}.` },
      ],
      onInput(values, f) {
        if (!swatches.childElementCount) {
          for (const c of ACCENTS) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'mini-swatch';
            b.style.background = c;
            b.onclick = () => f.setValue('accentColor', c);
            swatches.appendChild(b);
          }
        }
        // Aperçu immédiat de la couleur et du verre.
        document.documentElement.style.setProperty('--accent', values.accentColor);
        document.body.classList.toggle('glass', values.glass);
      },
    });
    if (!v) return applyTheme(api.config);
    api.config = await window.skald.writeConfig(v);
    if (await applyTheme(api.config)) {
      notify('Le flou de Windows 11 sera actif au prochain démarrage de Skald.', 'info', 6000);
    }
  }

  // --- Fermeture de la fenêtre avec des images non enregistrées ---
  let closing = false;
  // Avant une fermeture voulue (mise à jour) : propose d'enregistrer chaque image modifiée.
  // Renvoie false si tu as annulé.
  async function prepareQuit() {
    for (const d of [...docs]) if (d.dirty && !(await closeDocument(d))) return false;
    closing = true;
    return true;
  }

  window.addEventListener('beforeunload', (e) => {
    if (closing || !docs.some((d) => d.dirty)) return;
    e.preventDefault();
    e.returnValue = false;
    setTimeout(async () => {
      for (const d of [...docs]) if (d.dirty && !(await closeDocument(d))) return;
      closing = true;
      window.skald.forceClose();
    });
  });

  // --- Accueil ---
  async function renderWelcome() {
    recentFiles = await window.skald.recentFiles();
    const list = $('#welcome-recents');
    list.innerHTML = '';
    $('#welcome-recents-title').hidden = !recentFiles.length;
    for (const f of recentFiles.slice(0, 8)) {
      const b = document.createElement('button');
      b.className = 'recent';
      b.innerHTML = '<i class="codicon codicon-file-media"></i><span class="recent-name"></span><span class="recent-path"></span>';
      b.querySelector('.recent-name').textContent = f.split(/[\\/]/).pop();
      b.querySelector('.recent-path').textContent = f.replace(/[\\/][^\\/]+$/, '');
      b.onclick = () => IO.openPath(f);
      list.appendChild(b);
    }
  }
  $('#welcome-new').onclick = newImage;
  $('#welcome-open').onclick = () => IO.openFiles();
  $('#welcome-paste').onclick = () => Ops.paste();
  $('#btn-undo').onclick = () => undo(current);
  $('#btn-redo').onclick = () => redo(current);
  $('#btn-export').onclick = () => IO.exportImage();
  $('#btn-save').onclick = () => IO.save();
  $('#btn-settings').onclick = openSettings;
  $('#layer-new').onclick = Ops.newLayer;
  $('#layer-special').onclick = (e) => { e.stopPropagation(); showMenu(e.currentTarget, Adjust.menuItems()); };
  $('#layer-duplicate').onclick = Ops.duplicateLayer;
  $('#layer-merge').onclick = Ops.mergeDown;
  $('#layer-delete').onclick = () => Ops.deleteLayer();
  $('#layer-up').onclick = () => Ops.moveLayer(1);
  $('#layer-down').onclick = () => Ops.moveLayer(-1);

  // Largeur du panneau de droite : glisser la séparation (retenue d'une fois sur l'autre).
  const side = $('#sidepanel');
  try { const w = Number(localStorage.getItem('skald.side')); if (w) side.style.width = `${w}px`; } catch { /* pas grave */ }
  $('#side-resizer').addEventListener('pointerdown', (e) => {
    const resizer = e.currentTarget;
    resizer.setPointerCapture(e.pointerId);
    resizer.classList.add('dragging');
    const startX = e.clientX, startW = side.offsetWidth;
    resizer.onpointermove = (ev) => { side.style.width = `${Math.min(600, Math.max(220, startW - (ev.clientX - startX)))}px`; };
    resizer.onpointerup = () => {
      resizer.onpointermove = null;
      resizer.classList.remove('dragging');
      try { localStorage.setItem('skald.side', String(side.offsetWidth)); } catch { /* pas grave */ }
    };
  });

  const api = {
    config: null,
    configPath: '',
    colors,
    clipboardOrigin: null,
    doc,
    docs,
    openDocument,
    closeDocument,
    prepareQuit,
    refresh,
    refreshPanels,
    refreshTool,
    updateStatus,
    setColor,
    activate,
    menus,
    async start() {
      const { config, path } = await window.skald.readConfig();
      api.config = config;
      api.configPath = path;
      await applyTheme(config);
      View.init();
      renderColors();
      refreshTool();
      refresh();
      await renderWelcome();
      window.skald.onExternalFile((file) => IO.openPath(file));
      for (const file of await window.skald.startupFiles()) await IO.openPath(file);
      // Projet d'images ouvert depuis Atelier : la fenêtre « Ouvrir » s'ouvre dans son dossier.
      window.skald.onExternalFolder((folder) => IO.openFiles(folder));
      const folder = await window.skald.startupFolder();
      if (folder) IO.openFiles(folder);
    },
  };
  return api;
})();

App.start();
