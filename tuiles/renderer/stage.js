// La zone de dessin au centre, avec ses deux modes :
// - « Tuile » : la tuile choisie, très agrandie, pixel par pixel. Option Mosaïque : la tuile est
//   répétée tout autour, et dessiner sur une copie dessine sur la tuile (pour des raccords parfaits,
//   indispensable pour l'herbe, l'eau, les chemins…).
// - « Carte » : les cartes du jeu, où l'on pose les tuiles sur autant de calques qu'on veut (Sol, Décor,
//   Au-dessus du joueur…). On y peint aussi le passage (où le joueur peut marcher), et on y place les
//   zones (herbes hautes, eau…), les téléporteurs (portes, sorties), le départ du joueur, et les
//   événements (personnages, panneaux, coffres… avec leur script, voir events.js).
//
// Les outils (crayon, gomme, pot, pipette, ligne, rectangle) marchent pareil dans les deux modes :
// ils travaillent sur une « grille » de cases. En mode Tuile, une case est un pixel et sa valeur
// une couleur ; en mode Carte, une case est un emplacement de la carte et sa valeur un numéro de tuile
// (ou, sur la ligne Passage du panneau Calques, un code de passage : libre, bloqué, rebord…).

const TOOLS = [
  { id: 'pencil', nom: 'Crayon', key: 'B', icone: 'edit', modes: ['tile', 'map'], aide: 'Clic gauche : couleur principale, clic droit : couleur secondaire. Maj+clic : ligne droite depuis le dernier point. Alt+clic : pipette.', aideCarte: 'Clic gauche : pose la tuile choisie, clic droit : efface. Alt+clic : reprend la tuile de la case.' },
  { id: 'eraser', nom: 'Gomme', key: 'E', icone: 'circle-slash', modes: ['tile', 'map'], aide: 'Rend les pixels transparents.', aideCarte: 'Vide les cases du calque choisi.' },
  { id: 'fill', nom: 'Pot de peinture', key: 'G', icone: 'paintcan', modes: ['tile', 'map'], aide: 'Remplit la zone de même couleur. En mosaïque, le remplissage passe d\'un bord à l\'autre.', aideCarte: 'Remplit la zone de cases identiques avec la tuile choisie.' },
  { id: 'picker', nom: 'Pipette', key: 'I', icone: 'eye', modes: ['tile', 'map'], aide: 'Clic gauche : prend la couleur principale, clic droit : la secondaire.', aideCarte: 'Reprend la tuile d\'une case.' },
  { id: 'line', nom: 'Ligne', key: 'L', icone: 'dash', modes: ['tile', 'map'], aide: 'Glisser pour tracer une ligne droite.', aideCarte: 'Glisser pour poser une ligne de tuiles.' },
  { id: 'rect', nom: 'Rectangle', key: 'U', icone: 'primitive-square', modes: ['tile', 'map'], aide: 'Glisser pour tracer un rectangle (plein ou contour, dans la barre d\'options).', aideCarte: 'Glisser pour couvrir un rectangle de tuiles.' },
  { id: 'zone', nom: 'Zone', key: 'Z', icone: 'symbol-namespace', modes: ['map'], aideCarte: 'Glisser pour tracer une zone (herbes hautes, eau, grotte…). Clic sur une zone : la modifier ou la supprimer.' },
  { id: 'warp', nom: 'Téléporteur', key: 'T', icone: 'debug-step-into', modes: ['map'], aideCarte: 'Clic sur une case : elle mène vers une autre carte (porte, escalier, sortie de route). Clic sur un téléporteur : le modifier.' },
  { id: 'event', nom: 'Événement', key: 'N', icone: 'person', modes: ['map'], aideCarte: 'Clic sur une case vide : nouveau personnage, panneau, coffre, objet ou déclencheur. Clic sur un événement : modifier son script. Glisser : le déplacer. Clic droit : dupliquer, supprimer.' },
  { id: 'start', nom: 'Départ du joueur', key: 'J', icone: 'location', modes: ['map'], aideCarte: 'Clic : le joueur commence le jeu sur cette case, tourné dans la direction choisie.' },
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
    // La ligne Passage du panneau Calques : on peint des codes de passage (0 = auto).
    if (li < 0) {
      return {
        w: map.width, h: map.height, wrap: false, empty: 0,
        get: (x, y) => map.passage[y * map.width + x],
        set(x, y, v) { Doc.passageForEdit(doc)[y * map.width + x] = v; },
      };
    }
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
    if (App.mode === 'map' && App.options.layer < 0) return tool === 'eraser' || button === 2 ? 0 : App.options.passage;
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
    if (App.mode === 'map' && App.options.layer < 0) {
      if (v > 0) App.setPassageValue(v);
      return;
    }
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
      // Opacité et mode de fusion du calque (comme dans le jeu). Les autres calques sont un peu
      // atténués quand l'option « Atténuer les autres calques » est cochée.
      ctx.globalAlpha = (layer.opacite ?? 1) * (App.options.dimOther && App.options.layer >= 0 && li !== App.options.layer ? 0.45 : 1);
      ctx.globalCompositeOperation = layer.fusion && layer.fusion !== 'normal' ? layer.fusion : 'source-over';
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          const t = layer.cells[y * map.width + x];
          if (t >= 0 && canvases[t]) ctx.drawImage(canvases[t], v.x + x * cell, v.y + y * cell, cell, cell);
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
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
    if (App.options.showAmbiance && map.ambiance) drawAmbiance(map.ambiance, mw, mh, cell, now);
    const passageMode = App.options.layer < 0;
    if (passageMode || App.options.showPassage) drawPassage(cell);
    if (preview?.points) {
      for (const [x, y] of preview.points) {
        if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
        if (passageMode) passageCell(x, y, preview.value, cell, true);
        else ghost(x, y, preview.value);
      }
    }
    if (App.options.showObjects || ['zone', 'warp', 'start', 'event'].includes(App.tool)) {
      drawObjects(cell);
      drawEvents(cell, canvases);
    }
    if (preview?.rect) {
      const r = preview.rect;
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(v.x + r.x * cell + 1, v.y + r.y * cell + 1, r.w * cell - 2, r.h * cell - 2);
      ctx.setLineDash([]);
    }
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
      if (App.tool === 'pencil' && passageMode) passageCell(hover.x, hover.y, App.options.passage, cell, true);
      else if (App.tool === 'pencil') ghost(hover.x, hover.y, doc.current);
      ctx.strokeStyle = accent();
      ctx.lineWidth = 2;
      ctx.strokeRect(v.x + hover.x * cell, v.y + hover.y * cell, cell, cell);
    }
  }

  // --- Passage, zones, téléporteurs et départ, dessinés par-dessus la carte ---
  const ZONE_COLORS = { herbes: '#3fb950', eau: '#4aa8ff', grotte: '#c08a50', autre: '#b9a8ff' };
  const WARP_COLOR = '#d27bff';
  const START_COLOR = '#ffd040';
  // Une case de passage : rouge = bloqué, vert = libre, flèche jaune = rebord (on saute dans ce sens).
  // painted : passage peint à la main (plus marqué que celui qui vient des tuiles).
  function passageCell(x, y, code, cell, painted) {
    const v = view();
    const px = v.x + x * cell, py = v.y + y * cell;
    if (code === Doc.PASSAGE.bloque) {
      ctx.fillStyle = painted ? 'rgba(241, 76, 76, 0.5)' : 'rgba(241, 76, 76, 0.28)';
      ctx.fillRect(px, py, cell, cell);
      if (painted && cell >= 10) {
        ctx.strokeStyle = 'rgba(255, 140, 140, 0.9)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px + cell * 0.3, py + cell * 0.3); ctx.lineTo(px + cell * 0.7, py + cell * 0.7);
        ctx.moveTo(px + cell * 0.7, py + cell * 0.3); ctx.lineTo(px + cell * 0.3, py + cell * 0.7);
        ctx.stroke();
      }
    } else if (code === Doc.PASSAGE.libre) {
      if (!painted) return;
      ctx.fillStyle = 'rgba(63, 185, 80, 0.35)';
      ctx.fillRect(px, py, cell, cell);
    } else if (code >= Doc.PASSAGE.rebord_bas) {
      ctx.fillStyle = 'rgba(255, 208, 64, 0.22)';
      ctx.fillRect(px, py, cell, cell);
      // La flèche du rebord.
      const [dx, dy] = [[0, 1], [0, -1], [-1, 0], [1, 0]][code - Doc.PASSAGE.rebord_bas];
      const cx = px + cell / 2, cy = py + cell / 2, r = cell * 0.3;
      ctx.fillStyle = 'rgba(255, 208, 64, 0.95)';
      ctx.beginPath();
      ctx.moveTo(cx + dx * r, cy + dy * r);
      ctx.lineTo(cx - dx * r * 0.6 - dy * r, cy - dy * r * 0.6 - dx * r);
      ctx.lineTo(cx - dx * r * 0.6 + dy * r, cy - dy * r * 0.6 + dx * r);
      ctx.closePath();
      ctx.fill();
    }
  }
  // L'ambiance de la carte (Tafl 0.8) : la teinte en « produit », puis la météo, qui bouge quand
  // l'animation est en marche. C'est un aperçu : le moteur du jeu fera la sienne.
  const hasard = (n) => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); };
  function drawAmbiance(a, mw, mh, cell, now) {
    const v = view();
    ctx.save();
    ctx.beginPath();
    ctx.rect(v.x, v.y, mw, mh);
    ctx.clip();
    if (a.teinte && a.force) {
      ctx.globalAlpha = a.force / 100;
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = a.teinte;
      ctx.fillRect(v.x, v.y, mw, mh);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    const t = now / 1000;
    const surface = (mw / cell) * (mh / cell);
    const n = Math.round(surface * (a.intensite / 100) * (a.meteo === 'brouillard' ? 0.04 : a.meteo === 'lucioles' ? 0.08 : 0.5));
    for (let i = 0; i < n && a.meteo !== 'aucune'; i++) {
      const bx = hasard(i + 1), by = hasard(i + 101), vit = 0.6 + hasard(i + 201) * 0.6;
      if (a.meteo === 'pluie' || a.meteo === 'orage') {
        const y = ((by + t * vit * 1.6) % 1) * (mh + cell * 2) - cell;
        const x = ((bx - t * vit * 0.25) % 1 + 1) % 1 * mw;
        ctx.strokeStyle = 'rgba(200, 220, 255, 0.45)';
        ctx.lineWidth = Math.max(1, cell / 16);
        ctx.beginPath();
        ctx.moveTo(v.x + x, v.y + y);
        ctx.lineTo(v.x + x - cell * 0.18, v.y + y + cell * 0.75);
        ctx.stroke();
      } else if (a.meteo === 'neige') {
        const y = ((by + t * vit * 0.25) % 1) * mh;
        const x = (((bx + Math.sin(t * vit + i) * 0.01) % 1) + 1) % 1 * mw;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.fillRect(v.x + x, v.y + y, Math.max(1, cell / 8), Math.max(1, cell / 8));
      } else if (a.meteo === 'feuilles') {
        const y = ((by + t * vit * 0.12) % 1) * mh;
        const x = (((bx + Math.sin(t * vit * 1.5 + i) * 0.02) % 1) + 1) % 1 * mw;
        ctx.fillStyle = hasard(i + 301) > 0.5 ? 'rgba(214, 120, 52, 0.9)' : 'rgba(186, 150, 60, 0.9)';
        ctx.fillRect(v.x + x, v.y + y, Math.max(2, cell / 5), Math.max(1, cell / 8));
      } else if (a.meteo === 'lucioles') {
        const x = (bx + Math.sin(t * 0.3 * vit + i) * 0.01) * mw, y = (by + Math.cos(t * 0.25 * vit + i) * 0.01) * mh;
        const r = Math.max(2, cell / 6);
        const g = ctx.createRadialGradient(v.x + x, v.y + y, 0, v.x + x, v.y + y, r * 2);
        g.addColorStop(0, `rgba(230, 255, 150, ${0.5 + 0.5 * Math.sin(t * 2 + i)})`);
        g.addColorStop(1, 'rgba(230, 255, 150, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(v.x + x - r * 2, v.y + y - r * 2, r * 4, r * 4);
      } else if (a.meteo === 'brouillard') {
        const x = ((bx + t * 0.01 * vit) % 1) * mw, y = by * mh, r = cell * (3 + hasard(i + 401) * 4);
        const g = ctx.createRadialGradient(v.x + x, v.y + y, 0, v.x + x, v.y + y, r);
        g.addColorStop(0, 'rgba(220, 226, 235, 0.28)');
        g.addColorStop(1, 'rgba(220, 226, 235, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(v.x + x - r, v.y + y - r, r * 2, r * 2);
      }
    }
    // L'orage : un éclair de temps en temps.
    if (a.meteo === 'orage' && now && (t % 7) < 0.12) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.fillRect(v.x, v.y, mw, mh);
    }
    ctx.restore();
  }

  function drawPassage(cell) {
    const doc = App.doc, { map } = doc;
    const final = Doc.collisions(doc, map);
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const i = y * map.width + x;
        passageCell(x, y, final[i], cell, map.passage[i] > 0);
      }
    }
  }
  function label(text, x, y, color, cell) {
    if (cell < 12) return;
    ctx.font = `600 ${clamp(Math.round(cell * 0.32), 10, 14)}px "Segoe UI", system-ui, sans-serif`;
    const w = ctx.measureText(text).width + 8;
    ctx.fillStyle = 'rgba(10, 10, 14, 0.78)';
    ctx.fillRect(x, y, w, 18);
    ctx.fillStyle = color;
    ctx.fillText(text, x + 4, y + 13);
  }
  function drawObjects(cell) {
    const doc = App.doc, { map } = doc, v = view();
    for (const z of map.zones) {
      const color = ZONE_COLORS[z.type] || ZONE_COLORS.autre;
      const px = v.x + z.x * cell, py = v.y + z.y * cell;
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = color;
      ctx.fillRect(px, py, z.w * cell, z.h * cell);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 1, py + 1, z.w * cell - 2, z.h * cell - 2);
      label(z.name || Doc.ZONES.find(([k]) => k === z.type)?.[1] || z.type, px + 3, py + 3, color, cell);
    }
    for (const w of map.warps) {
      const px = v.x + w.x * cell, py = v.y + w.y * cell, m = Math.max(1, cell * 0.12);
      ctx.fillStyle = 'rgba(210, 123, 255, 0.28)';
      ctx.fillRect(px + m, py + m, cell - 2 * m, cell - 2 * m);
      ctx.strokeStyle = WARP_COLOR;
      ctx.lineWidth = 2;
      ctx.strokeRect(px + m, py + m, cell - 2 * m, cell - 2 * m);
      // Une petite flèche « on entre ici ».
      ctx.fillStyle = WARP_COLOR;
      ctx.beginPath();
      ctx.moveTo(px + cell * 0.35, py + cell * 0.3);
      ctx.lineTo(px + cell * 0.7, py + cell * 0.5);
      ctx.lineTo(px + cell * 0.35, py + cell * 0.7);
      ctx.closePath();
      ctx.fill();
      if (hover && hover.x === w.x && hover.y === w.y) label(`→ ${Doc.mapById(doc, w.carte)?.name || w.carte} (${w.tx}, ${w.ty})`, px, py - 20, WARP_COLOR, Math.max(cell, 12));
    }
    if (doc.depart && doc.depart.carte === map.id) {
      const { x, y, direction } = doc.depart;
      const cx = v.x + (x + 0.5) * cell, cy = v.y + (y + 0.5) * cell, r = cell * 0.34;
      ctx.fillStyle = START_COLOR;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      const [dx, dy] = { bas: [0, 1], haut: [0, -1], gauche: [-1, 0], droite: [1, 0] }[direction] || [0, 1];
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath();
      ctx.moveTo(cx + dx * r * 0.75, cy + dy * r * 0.75);
      ctx.lineTo(cx - dy * r * 0.45, cy - dx * r * 0.45);
      ctx.lineTo(cx + dy * r * 0.45, cy + dx * r * 0.45);
      ctx.closePath();
      ctx.fill();
    }
  }
  // Les événements : leur tuile (ou celle de leur personnage), sinon un petit symbole par type.
  const EVENT_COLORS = { pnj: '#ff9e4a', panneau: '#d8b27a', coffre: '#ffd040', objet: '#ff6b6b', declencheur: '#b9a8ff' };
  function drawEvents(cell, canvases) {
    const doc = App.doc, { map } = doc, v = view();
    for (const ev of map.events) {
      const moving = preview?.event === ev.id;
      const x = moving ? preview.x : ev.x, y = moving ? preview.y : ev.y;
      const px = v.x + x * cell, py = v.y + y * cell;
      const color = EVENT_COLORS[ev.type] || EVENT_COLORS.pnj;
      const tile = ev.apparence.tuile >= 0 ? ev.apparence.tuile : Events.perso(doc, ev.apparence.personnage)?.tuile ?? -1;
      ctx.globalAlpha = moving ? 0.7 : 1;
      if (tile >= 0 && canvases[tile]) ctx.drawImage(canvases[tile], px, py, cell, cell);
      else eventSymbol(ev.type, px, py, cell, color);
      ctx.globalAlpha = 1;
      // Un liseré de la couleur du type ; pointillé pour une case invisible (déclencheur).
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      if (ev.type === 'declencheur') ctx.setLineDash([4, 3]);
      ctx.strokeRect(px + 1, py + 1, cell - 2, cell - 2);
      ctx.setLineDash([]);
      // Où il regarde (pour un personnage).
      if (ev.type === 'pnj' && cell >= 12) {
        const [dx, dy] = { bas: [0, 1], haut: [0, -1], gauche: [-1, 0], droite: [1, 0] }[ev.direction] || [0, 1];
        const cx = px + cell / 2 + dx * cell * 0.42, cy = py + cell / 2 + dy * cell * 0.42, r = cell * 0.09;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(cx + dx * r * 1.4, cy + dy * r * 1.4);
        ctx.lineTo(cx - dy * r * 1.6, cy - dx * r * 1.6);
        ctx.lineTo(cx + dy * r * 1.6, cy + dx * r * 1.6);
        ctx.closePath();
        ctx.fill();
      }
      if ((hover && hover.x === x && hover.y === y) || moving) label(ev.nom || Events.TYPES.find(([k]) => k === ev.type)?.[1], px, py - 20, color, Math.max(cell, 12));
    }
  }
  function eventSymbol(type, px, py, cell, color) {
    const c = cell, cx = px + c / 2;
    ctx.fillStyle = 'rgba(10, 10, 14, 0.55)';
    ctx.fillRect(px + 2, py + 2, c - 4, c - 4);
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, c * 0.06);
    ctx.beginPath();
    if (type === 'pnj') {
      // Une tête et des épaules.
      ctx.arc(cx, py + c * 0.36, c * 0.14, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx, py + c * 0.8, c * 0.26, c * 0.2, 0, Math.PI, 0);
      ctx.fill();
    } else if (type === 'panneau') {
      ctx.fillRect(px + c * 0.2, py + c * 0.24, c * 0.6, c * 0.34);
      ctx.fillRect(cx - c * 0.05, py + c * 0.58, c * 0.1, c * 0.24);
    } else if (type === 'coffre') {
      ctx.fillRect(px + c * 0.2, py + c * 0.34, c * 0.6, c * 0.42);
      ctx.fillStyle = 'rgba(10, 10, 14, 0.7)';
      ctx.fillRect(px + c * 0.2, py + c * 0.48, c * 0.6, c * 0.05);
      ctx.fillRect(cx - c * 0.05, py + c * 0.46, c * 0.1, c * 0.12);
    } else if (type === 'objet') {
      // Une balle : rouge en haut, blanche en bas.
      ctx.arc(cx, py + c / 2, c * 0.24, Math.PI, 0);
      ctx.fill();
      ctx.beginPath();
      ctx.fillStyle = '#f0f0f0';
      ctx.arc(cx, py + c / 2, c * 0.24, 0, Math.PI);
      ctx.fill();
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(cx - c * 0.24, py + c / 2 - c * 0.025, c * 0.48, c * 0.05);
    } else {
      // Un éclair : la case déclenche une scène.
      ctx.moveTo(px + c * 0.56, py + c * 0.18);
      ctx.lineTo(px + c * 0.3, py + c * 0.54);
      ctx.lineTo(px + c * 0.5, py + c * 0.54);
      ctx.lineTo(px + c * 0.42, py + c * 0.84);
      ctx.lineTo(px + c * 0.72, py + c * 0.44);
      ctx.lineTo(px + c * 0.52, py + c * 0.44);
      ctx.closePath();
      ctx.fill();
    }
  }
  const zoneAt = (map, x, y) => [...map.zones].reverse().find((z) => x >= z.x && y >= z.y && x < z.x + z.w && y < z.y + z.h) || null;
  const normRect = (a, b) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x) + 1, h: Math.abs(a.y - b.y) + 1 });

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
    const map = doc.map;
    const onMap = (p) => p.x >= 0 && p.y >= 0 && p.x < map.width && p.y < map.height;
    if (tool === 'zone') {
      const p = { x: clamp(c.x, 0, map.width - 1), y: clamp(c.y, 0, map.height - 1) };
      action = { tool, start: p, button: e.button };
      preview = { rect: normRect(p, p) };
      render();
      return;
    }
    if (tool === 'event') {
      if (!onMap(c)) return;
      if (e.button === 2) { App.eventMenu(c.x, c.y, e.clientX, e.clientY); return; }
      const ev = Doc.eventAt(map, c.x, c.y);
      // Un événement se déplace en le glissant ; un simple clic l'ouvre (ou en crée un sur une case vide).
      action = { tool, id: ev?.id || null, start: c, cx: e.clientX, cy: e.clientY };
      if (ev) preview = { event: ev.id, x: c.x, y: c.y };
      return;
    }
    if (tool === 'warp' || tool === 'start') {
      if (onMap(c)) {
        if (tool === 'warp') App.editWarpAt(c.x, c.y);
        else App.setStart(c.x, c.y);
      }
      return;
    }

    const value = valueFor(e.button, tool);
    const label = App.mode === 'map' ? (App.options.layer < 0 ? 'Peindre le passage' : 'Modifier la carte') : `${TOOLS.find((t) => t.id === tool).nom}`;
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
    } else if (action.tool === 'event') {
      if (!action.id) return;
      const { map } = App.doc;
      preview = { event: action.id, x: clamp(c.x, 0, map.width - 1), y: clamp(c.y, 0, map.height - 1) };
      render();
    } else if (action.tool === 'zone') {
      const { map } = App.doc;
      preview.rect = normRect(action.start, { x: clamp(c.x, 0, map.width - 1), y: clamp(c.y, 0, map.height - 1) });
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
    if (done.tool === 'event') {
      const p = preview;
      preview = null;
      render();
      if (!done.id) return App.eventMenu(done.start.x, done.start.y, done.cx, done.cy);
      if (p && (p.x !== done.start.x || p.y !== done.start.y)) return App.moveEvent(done.id, p.x, p.y);
      return App.editEvent(done.id);
    }
    if (done.tool === 'zone') {
      const r = preview?.rect;
      preview = null;
      render();
      if (!r) return;
      // Un simple clic sur une zone existante l'ouvre ; sinon on crée la zone tracée.
      const existing = r.w === 1 && r.h === 1 ? zoneAt(App.doc.map, r.x, r.y) : null;
      if (existing) App.editZone(existing.id);
      else App.createZone(r);
      return;
    }
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

  return { init, render, fit, zoomBy, reset, zoneAt, get zoom() { return view().zoom; }, get hover() { return hover; } };
})();
