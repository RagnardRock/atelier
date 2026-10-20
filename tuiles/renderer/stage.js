// La zone de dessin au centre, avec ses deux modes :
// - « Tuile » : la tuile choisie, très agrandie, pixel par pixel. Option Mosaïque : la tuile est
//   répétée tout autour, et dessiner sur une copie dessine sur la tuile (pour des raccords parfaits,
//   indispensable pour l'herbe, l'eau, les chemins…).
// - « Carte » : une petite carte où l'on pose les tuiles, pour voir ce qu'elles donnent ensemble,
//   avec deux calques (Sol, puis Décor par-dessus : arbres, panneaux, fleurs…).
//
// Les outils (crayon, gomme, pot, pipette, ligne, rectangle) marchent pareil dans les deux modes :
// ils travaillent sur une « grille » de cases. En mode Tuile, une case est un pixel et sa valeur
// une couleur ; en mode Carte, une case est un emplacement de la carte et sa valeur un numéro de tuile.

const TOOLS = [
  { id: 'pencil', nom: 'Crayon', key: 'B', icone: 'edit', modes: ['tile', 'map'], aide: 'Clic gauche : couleur principale, clic droit : couleur secondaire. Maj+clic : ligne droite depuis le dernier point. Alt+clic : pipette.', aideCarte: 'Clic gauche : pose la tuile choisie, clic droit : efface. Alt+clic : reprend la tuile de la case.' },
  { id: 'eraser', nom: 'Gomme', key: 'E', icone: 'circle-slash', modes: ['tile', 'map'], aide: 'Rend les pixels transparents.', aideCarte: 'Vide les cases du calque choisi.' },
  { id: 'fill', nom: 'Pot de peinture', key: 'G', icone: 'paintcan', modes: ['tile', 'map'], aide: 'Remplit la zone de même couleur. En mosaïque, le remplissage passe d\'un bord à l\'autre.', aideCarte: 'Remplit la zone de cases identiques avec la tuile choisie.' },
  { id: 'picker', nom: 'Pipette', key: 'I', icone: 'eye', modes: ['tile', 'map'], aide: 'Clic gauche : prend la couleur principale, clic droit : la secondaire.', aideCarte: 'Reprend la tuile d\'une case.' },
  { id: 'line', nom: 'Ligne', key: 'L', icone: 'dash', modes: ['tile', 'map'], aide: 'Glisser pour tracer une ligne droite.', aideCarte: 'Glisser pour poser une ligne de tuiles.' },
  { id: 'rect', nom: 'Rectangle', key: 'U', icone: 'primitive-square', modes: ['tile', 'map'], aide: 'Glisser pour tracer un rectangle (plein ou contour, dans la barre d\'options).', aideCarte: 'Glisser pour couvrir un rectangle de tuiles.' },
  { id: 'shift', nom: 'Décalage', key: 'M', icone: 'move', modes: ['tile'], aide: 'Glisser pour faire glisser toute la tuile en boucle : ce qui sort d\'un côté revient de l\'autre. Idéal pour vérifier et retoucher les raccords.' },
];

const Stage = (() => {
  const canvas = $('#stage');
  const ctx = canvas.getContext('2d');
  const wrap = $('#canvas-wrap');
  const views = { tile: { zoom: 24, x: 0, y: 0, fitted: false }, map: { zoom: 3, x: 0, y: 0, fitted: false } };
  let hover = null;      // case survolée { x, y }
  let action = null;     // geste en cours (outil ou déplacement de la vue)
  let preview = null;    // cases montrées pendant une ligne ou un rectangle { points, value }
  let lastPoint = null;  // dernier point du crayon (pour Maj+clic)
  let spaceDown = false;
  let frame = 0;

  const view = () => views[App.mode];
  const size = () => ({ w: wrap.clientWidth, h: wrap.clientHeight });

  // --- Grille de cases du mode en cours ---
  function grid() {
    const doc = App.doc;
    if (App.mode === 'tile') {
      const s = doc.tileSize;
      const index = doc.current;
      return {
        w: s, h: s, wrap: App.options.mosaic, empty: 0,
        get(x, y) {
          const tile = doc.tiles[index];
          const d = tile.frames[clamp(App.frame, 0, tile.frames.length - 1)], o = (y * s + x) * 4;
          return packRgba(d[o], d[o + 1], d[o + 2], d[o + 3]);
        },
        set(x, y, v) {
          const d = Doc.pixelsForEdit(doc, index, App.frame);
          const [r, g, b, a] = unpack(v), o = (y * s + x) * 4;
          d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = a;
          Doc.touch(doc.tiles[index]);
        },
      };
    }
    const { map } = doc, li = App.options.layer;
    return {
      w: map.width, h: map.height, wrap: false, empty: -1,
      get: (x, y) => map.layers[li].cells[y * map.width + x],
      set(x, y, v) { Doc.layerForEdit(doc, li).cells[y * map.width + x] = v; },
    };
  }

  // Ramène un point dans la grille (en boucle en mosaïque) ; null s'il est dehors.
  function inside(g, x, y) {
    if (g.wrap) return { x: ((x % g.w) + g.w) % g.w, y: ((y % g.h) + g.h) % g.h };
    return x >= 0 && y >= 0 && x < g.w && y < g.h ? { x, y } : null;
  }

  // Valeur posée par le bouton de la souris : gauche = principale, droit = secondaire.
  function valueFor(button, tool) {
    if (App.mode === 'map') return tool === 'eraser' || button === 2 ? -1 : App.doc.current;
    if (tool === 'eraser') return 0;
    return packHex(button === 2 ? App.colors.secondary : App.colors.primary);
  }

  // --- Géométrie ---
  function linePoints(x0, y0, x1, y1) {
    const points = [];
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      points.push([x0, y0]);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    return points;
  }
  function rectPoints(x0, y0, x1, y1, filled) {
    const points = [];
    const [ax, bx] = [Math.min(x0, x1), Math.max(x0, x1)], [ay, by] = [Math.min(y0, y1), Math.max(y0, y1)];
    for (let y = ay; y <= by; y++) {
      for (let x = ax; x <= bx; x++) if (filled || x === ax || x === bx || y === ay || y === by) points.push([x, y]);
    }
    return points;
  }
  // Symétrie (mode Tuile) : chaque point a ses reflets.
  function mirrored(g, points) {
    if (App.mode !== 'tile' || (!App.options.mirrorH && !App.options.mirrorV)) return points;
    const out = [];
    for (const [x, y] of points) {
      out.push([x, y]);
      if (App.options.mirrorH) out.push([g.w - 1 - x, y]);
      if (App.options.mirrorV) out.push([x, g.h - 1 - y]);
      if (App.options.mirrorH && App.options.mirrorV) out.push([g.w - 1 - x, g.h - 1 - y]);
    }
    return out;
  }
  function plot(g, points, value) {
    for (const [px, py] of mirrored(g, points)) {
      const p = inside(g, px, py);
      if (p) g.set(p.x, p.y, value);
    }
  }
  function flood(g, x, y, value) {
    const target = g.get(x, y);
    if (target === value) return;
    const seen = new Uint8Array(g.w * g.h);
    const stack = [[x, y]];
    while (stack.length) {
      const [cx, cy] = stack.pop();
      const p = inside(g, cx, cy);
      if (!p || seen[p.y * g.w + p.x] || g.get(p.x, p.y) !== target) continue;
      seen[p.y * g.w + p.x] = 1;
      g.set(p.x, p.y, value);
      stack.push([p.x + 1, p.y], [p.x - 1, p.y], [p.x, p.y + 1], [p.x, p.y - 1]);
    }
  }
  function pick(g, x, y, button) {
    const p = inside(g, x, y);
    if (!p) return;
    const v = g.get(p.x, p.y);
    if (App.mode === 'map') {
      if (v >= 0) App.selectTile(v);
      return;
    }
    App.setColor(button === 2 ? 'secondary' : 'primary', v === 0 ? null : rgbaToHex(...unpack(v)));
  }

  // --- Coordonnées ---
  // Taille d'une case à l'écran, et position écran → case.
  function cellPx() {
    return App.mode === 'tile' ? view().zoom : view().zoom * App.doc.tileSize;
  }
  function toCell(e) {
    const r = canvas.getBoundingClientRect();
    const c = cellPx();
    return { x: Math.floor((e.clientX - r.left - view().x) / c), y: Math.floor((e.clientY - r.top - view().y) / c) };
  }

  // Ajuster : la tuile (ou la carte) au centre, aussi grande que possible.
  function fit() {
    const doc = App.doc;
    if (!doc) return;
    const { w, h } = size();
    if (!w || !h) return;
    const v = view();
    if (App.mode === 'tile') {
      const s = doc.tileSize;
      v.zoom = Math.max(1, Math.floor((Math.min(w, h) * (App.options.mosaic ? 0.42 : 0.82)) / s));
      v.x = Math.round((w - s * v.zoom) / 2);
      v.y = Math.round((h - s * v.zoom) / 2);
    } else {
      const mw = doc.map.width * doc.tileSize, mh = doc.map.height * doc.tileSize;
      const z = Math.min((w - 40) / mw, (h - 40) / mh);
      v.zoom = z >= 1 ? Math.floor(z) : Math.max(0.25, Math.floor(z * 4) / 4);
      v.x = Math.round((w - mw * v.zoom) / 2);
      v.y = Math.round((h - mh * v.zoom) / 2);
    }
    v.fitted = true;
    render();
  }

  // Zoom autour d'un point de l'écran (la case sous la souris ne bouge pas).
  const MAP_ZOOMS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 16];
  function zoomBy(direction, cx = size().w / 2, cy = size().h / 2) {
    const v = view();
    let z;
    if (App.mode === 'tile') {
      z = direction > 0 ? Math.max(v.zoom + 1, Math.round(v.zoom * 1.2)) : Math.min(v.zoom - 1, Math.round(v.zoom / 1.2));
      z = clamp(z, 1, 128);
    } else {
      const i = MAP_ZOOMS.findIndex((m) => m >= v.zoom);
      z = MAP_ZOOMS[clamp((i < 0 ? MAP_ZOOMS.length - 1 : i) + (direction > 0 ? 1 : -1), 0, MAP_ZOOMS.length - 1)];
      if (direction > 0 && z <= v.zoom) z = MAP_ZOOMS.find((m) => m > v.zoom) ?? v.zoom;
    }
    v.x = Math.round(cx - ((cx - v.x) * z) / v.zoom);
    v.y = Math.round(cy - ((cy - v.y) * z) / v.zoom);
    v.zoom = z;
    render();
  }

  // --- Dessin ---
  function render() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      draw();
    });
  }

  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const { w, h } = size();
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
  }

  function draw() {
    const doc = App.doc;
    if (!doc) return;
    resizeCanvas();
    const { w, h } = size();
    ctx.clearRect(0, 0, w, h);
    if (!view().fitted) fit();
    if (App.mode === 'tile') drawTile(); else drawMap();
    App.updateStatus(hover);
  }

  const accent = () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#7bd88f';

  function drawTile() {
    const doc = App.doc, v = view(), s = doc.tileSize, z = v.zoom, side = s * z;
    const current = doc.tiles[doc.current];
    const frame = clamp(App.frame, 0, current.frames.length - 1);
    const tile = Doc.tileCanvas(current, s, frame);
    // Pelure d'oignon : l'image précédente de l'animation, en transparence, pour dessiner la suivante.
    const onion = App.options.onion && frame > 0 ? Doc.tileCanvas(current, s, frame - 1) : null;
    const copies = App.options.mosaic ? [-1, 0, 1] : [0];
    for (const j of copies) {
      for (const i of copies) {
        const x = v.x + i * side, y = v.y + j * side;
        drawChecker(ctx, x, y, side, side, Math.max(4, Math.round(z / 2) * 2 || 4));
        if (onion) {
          ctx.globalAlpha = 0.3;
          ctx.drawImage(onion, x, y, side, side);
        }
        ctx.globalAlpha = i || j ? 0.6 : 1;
        ctx.drawImage(tile, x, y, side, side);
        ctx.globalAlpha = 1;
      }
    }
    // Aperçu de la ligne ou du rectangle en cours.
    if (preview) {
      const g = grid();
      for (const [px, py] of mirrored(g, preview.points)) {
        const p = inside(g, px, py);
        if (!p) continue;
        ctx.fillStyle = preview.value === 0 ? 'rgba(255,255,255,0.35)' : rgbaToHex(...unpack(preview.value));
        ctx.fillRect(v.x + p.x * z, v.y + p.y * z, z, z);
      }
    }
    // Grille des pixels (à partir d'un zoom suffisant pour qu'elle ne brouille pas l'image).
    const start = App.options.mosaic ? -1 : 0, end = App.options.mosaic ? 2 : 1;
    if (App.options.pixelGrid && z >= 6) {
      ctx.strokeStyle = 'rgba(255,255,255,0.09)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = start * s; k <= end * s; k++) {
        ctx.moveTo(v.x + start * side, v.y + k * z + 0.5); ctx.lineTo(v.x + end * side, v.y + k * z + 0.5);
        ctx.moveTo(v.x + k * z + 0.5, v.y + start * side); ctx.lineTo(v.x + k * z + 0.5, v.y + end * side);
      }
      ctx.stroke();
      // Repères du milieu et des quarts : pratiques pour centrer un motif.
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      for (const f of [0.5]) {
        ctx.moveTo(v.x, v.y + side * f + 0.5); ctx.lineTo(v.x + side, v.y + side * f + 0.5);
        ctx.moveTo(v.x + side * f + 0.5, v.y); ctx.lineTo(v.x + side * f + 0.5, v.y + side);
      }
      ctx.stroke();
    }
    // Contour de la vraie tuile.
    ctx.strokeStyle = accent();
    ctx.lineWidth = 2;
    ctx.strokeRect(v.x - 1, v.y - 1, side + 2, side + 2);
    // Case survolée.
    if (hover && !action?.pan) {
      const g = grid();
      for (const [px, py] of mirrored(g, [[hover.x, hover.y]])) {
        const p = inside(g, px, py);
        if (!p) continue;
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 1;
        ctx.strokeRect(v.x + p.x * z + 0.5, v.y + p.y * z + 0.5, z - 1, z - 1);
      }
    }
  }

  function drawMap() {
    const doc = App.doc, v = view(), s = doc.tileSize, { map } = doc;
    const cell = s * v.zoom, mw = map.width * cell, mh = map.height * cell;
    drawChecker(ctx, v.x, v.y, mw, mh, 8);
    // Sur la carte, les tuiles animées bougent (si la lecture est en marche).
    const now = App.playing ? performance.now() : 0;
    const canvases = doc.tiles.map((t) => Doc.tileCanvas(t, s, Doc.frameAt(t, now)));
    map.layers.forEach((layer, li) => {
      if (!layer.visible) return;
      // Le calque qu'on ne modifie pas est un peu atténué quand on travaille sur le Décor.
      ctx.globalAlpha = App.options.dimOther && li !== App.options.layer ? 0.45 : 1;
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          const t = layer.cells[y * map.width + x];
          if (t >= 0 && canvases[t]) ctx.drawImage(canvases[t], v.x + x * cell, v.y + y * cell, cell, cell);
        }
      }
      ctx.globalAlpha = 1;
    });
    // Aperçu de la ligne ou du rectangle en cours, et de la tuile sous la souris.
    const ghost = (x, y, value) => {
      if (value >= 0 && canvases[value]) {
        ctx.globalAlpha = 0.7;
        ctx.drawImage(canvases[value], v.x + x * cell, v.y + y * cell, cell, cell);
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = 'rgba(241, 76, 76, 0.35)';
        ctx.fillRect(v.x + x * cell, v.y + y * cell, cell, cell);
      }
    };
    if (preview) for (const [x, y] of preview.points) if (x >= 0 && y >= 0 && x < map.width && y < map.height) ghost(x, y, preview.value);
    if (App.options.tileGrid && cell >= 6) {
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= map.width; x++) { ctx.moveTo(v.x + x * cell + 0.5, v.y); ctx.lineTo(v.x + x * cell + 0.5, v.y + mh); }
      for (let y = 0; y <= map.height; y++) { ctx.moveTo(v.x, v.y + y * cell + 0.5); ctx.lineTo(v.x + mw, v.y + y * cell + 0.5); }
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.strokeRect(v.x - 0.5, v.y - 0.5, mw + 1, mh + 1);
    if (hover && !action && !preview && hover.x >= 0 && hover.y >= 0 && hover.x < map.width && hover.y < map.height) {
      if (App.tool === 'pencil') ghost(hover.x, hover.y, doc.current);
      ctx.strokeStyle = accent();
      ctx.lineWidth = 2;
      ctx.strokeRect(v.x + hover.x * cell, v.y + hover.y * cell, cell, cell);
    }
  }

  // --- Souris ---
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('pointerdown', (e) => {
    const doc = App.doc;
    if (!doc || Dialogs.isOpen()) return;
    canvas.setPointerCapture(e.pointerId);
    // Molette enfoncée ou Espace : déplacer la vue.
    if (e.button === 1 || spaceDown) {
      action = { pan: true, sx: e.clientX, sy: e.clientY, vx: view().x, vy: view().y };
      canvas.classList.add('panning');
      return;
    }
    if (e.button !== 0 && e.button !== 2) return;
    const g = grid();
    const c = toCell(e);
    let tool = App.tool;
    if (e.altKey && (tool === 'pencil' || tool === 'fill')) tool = 'picker';
    if (tool === 'picker') { pick(g, c.x, c.y, e.button); action = { tool, button: e.button }; return; }

    const value = valueFor(e.button, tool);
    const label = App.mode === 'map' ? 'Modifier la carte' : `${TOOLS.find((t) => t.id === tool).nom}`;
    if (tool === 'pencil' || tool === 'eraser') {
      Doc.begin(doc, label);
      const from = e.shiftKey && lastPoint ? lastPoint : c;
      plot(g, linePoints(from.x, from.y, c.x, c.y), value);
      action = { tool, value, last: c };
      lastPoint = c;
    } else if (tool === 'fill') {
      const p = inside(g, c.x, c.y);
      if (!p || g.get(p.x, p.y) === value) return;
      Doc.begin(doc, label);
      flood(g, p.x, p.y, value);
      action = { tool };
    } else if (tool === 'line' || tool === 'rect') {
      action = { tool, value, start: c, label };
      preview = { points: [[c.x, c.y]], value };
    } else if (tool === 'shift') {
      Doc.begin(doc, label);
      const tile = doc.tiles[doc.current];
      action = { tool, start: c, original: tile.frames[clamp(App.frame, 0, tile.frames.length - 1)].slice() };
    }
    App.refreshLive();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!App.doc) return;
    const c = toCell(e);
    const changed = !hover || hover.x !== c.x || hover.y !== c.y;
    hover = c;
    if (action?.pan) {
      view().x = action.vx + e.clientX - action.sx;
      view().y = action.vy + e.clientY - action.sy;
      render();
      return;
    }
    if (!changed) return;
    if (!action) { render(); return; }
    const g = grid();
    if (action.tool === 'pencil' || action.tool === 'eraser') {
      plot(g, linePoints(action.last.x, action.last.y, c.x, c.y), action.value);
      action.last = c;
      lastPoint = c;
      App.refreshLive();
    } else if (action.tool === 'picker') {
      pick(g, c.x, c.y, action.button);
    } else if (action.tool === 'line') {
      preview.points = linePoints(action.start.x, action.start.y, c.x, c.y);
      render();
    } else if (action.tool === 'rect') {
      preview.points = rectPoints(action.start.x, action.start.y, c.x, c.y, App.options.filled);
      render();
    } else if (action.tool === 'shift') {
      // Toute la tuile glisse, en boucle.
      const s = App.doc.tileSize, dx = c.x - action.start.x, dy = c.y - action.start.y;
      const data = Doc.pixelsForEdit(App.doc, App.doc.current, App.frame);
      for (let y = 0; y < s; y++) {
        for (let x = 0; x < s; x++) {
          const sx = (((x - dx) % s) + s) % s, sy = (((y - dy) % s) + s) % s;
          const o = (y * s + x) * 4, so = (sy * s + sx) * 4;
          for (let k = 0; k < 4; k++) data[o + k] = action.original[so + k];
        }
      }
      Doc.touch(App.doc.tiles[App.doc.current]);
      App.refreshLive();
    }
  });

  function endAction() {
    if (!action) return;
    const done = action;
    action = null;
    canvas.classList.remove('panning');
    if (done.pan || done.tool === 'picker') { render(); return; }
    if ((done.tool === 'line' || done.tool === 'rect') && preview) {
      Doc.begin(App.doc, done.label);
      plot(grid(), preview.points, done.value);
      lastPoint = preview.points[preview.points.length - 1] && { x: preview.points[preview.points.length - 1][0], y: preview.points[preview.points.length - 1][1] };
    }
    preview = null;
    if (App.doc.editing) App.doc.editing = null; // fin de l'action : la prochaine recopiera les tableaux
    App.refresh();
  }
  canvas.addEventListener('pointerup', endAction);
  canvas.addEventListener('pointercancel', endAction);
  canvas.addEventListener('pointerleave', () => { hover = null; render(); });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    // Ctrl+molette ou molette seule : zoom ; Maj+molette : défilement horizontal.
    if (e.shiftKey && !e.ctrlKey) { view().x -= e.deltaY; render(); return; }
    zoomBy(e.deltaY < 0 ? 1 : -1, e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });

  // Espace maintenu : la main pour déplacer la vue (comme dans Skald et Photoshop).
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !e.repeat && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) {
      spaceDown = true;
      canvas.classList.add('space');
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') { spaceDown = false; canvas.classList.remove('space'); }
  });

  // Lancé par App.init() : au chargement des scripts, App n'existe pas encore.
  const init = () => new ResizeObserver(() => render()).observe(wrap);

  // Changement de mode ou de document : chaque mode garde son zoom, mais se réajuste si besoin.
  function reset() {
    views.tile.fitted = false;
    views.map.fitted = false;
    preview = null;
    action = null;
    lastPoint = null;
    render();
  }

  return { init, render, fit, zoomBy, reset, get zoom() { return view().zoom; } };
})();
