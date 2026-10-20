// Outils ajoutés en v0.2 : dégradé, formes, et transformation libre à la souris (Ctrl+T).
// Ils s'insèrent dans la barre d'outils grâce à Tools.register (tools.js).

(() => {
  const S = Tools.settings;

  // Canvas qui couvre à la fois le calque et tout le document (pour pouvoir dessiner partout).
  function covering(doc, layer) {
    const left = Math.min(layer.x, 0), top = Math.min(layer.y, 0);
    const right = Math.max(layer.x + layer.canvas.width, doc.width), bottom = Math.max(layer.y + layer.canvas.height, doc.height);
    const canvas = newCanvas(right - left, bottom - top);
    canvas.getContext('2d').drawImage(layer.canvas, layer.x - left, layer.y - top);
    return { canvas, x: left, y: top };
  }

  // --- Dégradé ---
  Tools.register({
    id: 'gradient', name: 'Dégradé', key: 'g', icon: ICONS.gradient, cursor: 'crosshair',
    hint: 'Glisse pour tracer le dégradé, du début à la fin (Maj : droit ou à 45°). Dans la sélection s\'il y en a une. Maj+G : pot de peinture.',
    options: [
      { key: 'type', label: 'Type', type: 'select', value: 'linear', choices: [['linear', 'Linéaire'], ['radial', 'Radial']] },
      { key: 'colors', label: 'Couleurs', type: 'select', value: 'ps', choices: [['ps', 'Principale → secondaire'], ['pt', 'Principale → transparent']] },
      { key: 'opacity', label: 'Opacité', type: 'range', min: 1, max: 100, value: 100, unit: '%' },
      { key: 'reverse', label: 'Inverser', type: 'checkbox', value: false },
    ],
    down(doc, p) {
      const layer = activeLayer(doc);
      if (!layer) return notify('Ajoute d\'abord un calque.', 'warning');
      if (!layer.visible) return notify('Le calque actif est masqué : affiche-le (œil) pour y dessiner.', 'warning');
      this.drag = { snap: snapshot(doc, 'Dégradé'), layer, base: covering(doc, layer), start: { x: p.x, y: p.y }, end: { x: p.x, y: p.y } };
    },
    move(doc, p, e) {
      const d = this.drag;
      if (!d) return;
      let { x, y } = p;
      if (e.shiftKey) {
        // Maj : angle arrondi à 45°.
        const a = Math.round(Math.atan2(y - d.start.y, x - d.start.x) / (Math.PI / 4)) * (Math.PI / 4);
        const len = Math.hypot(x - d.start.x, y - d.start.y);
        x = d.start.x + Math.cos(a) * len;
        y = d.start.y + Math.sin(a) * len;
      }
      d.end = { x, y };
      doc.preview = { layerId: d.layer.id, canvas: this.render(doc, d), x: d.base.x, y: d.base.y };
      View.request(true);
    },
    up(doc) {
      const d = this.drag;
      this.drag = null;
      if (!d) return;
      doc.preview = null;
      if (Math.hypot(d.end.x - d.start.x, d.end.y - d.start.y) < 2) return View.request(true);
      replacePixels(d.layer, this.render(doc, d), d.base.x, d.base.y);
      commit(doc, d.snap);
    },
    render(doc, d) {
      const o = S.gradient;
      const { canvas: base, x: bx, y: by } = d.base;
      const [r1, g1, b1] = hexToRgb(App.colors.primary);
      const [r2, g2, b2] = hexToRgb(App.colors.secondary);
      let stops = [`rgba(${r1},${g1},${b1},1)`, o.colors === 'pt' ? `rgba(${r1},${g1},${b1},0)` : `rgba(${r2},${g2},${b2},1)`];
      if (o.reverse) stops = stops.reverse();
      const fill = newCanvas(base.width, base.height);
      const g = fill.getContext('2d');
      const sx = d.start.x - bx, sy = d.start.y - by, ex = d.end.x - bx, ey = d.end.y - by;
      const grad = o.type === 'radial' ? g.createRadialGradient(sx, sy, 0, sx, sy, Math.hypot(ex - sx, ey - sy)) : g.createLinearGradient(sx, sy, ex, ey);
      grad.addColorStop(0, stops[0]);
      grad.addColorStop(1, stops[1]);
      g.fillStyle = grad;
      g.fillRect(0, 0, fill.width, fill.height);
      const layerArea = doc.selection ? Sel.clip(fill, doc.selection, bx, by) : fill;
      const out = cloneCanvas(base);
      const og = out.getContext('2d');
      og.globalAlpha = o.opacity / 100;
      og.drawImage(layerArea, 0, 0);
      return out;
    },
    overlay(ctx, doc) {
      const d = this.drag;
      if (!d) return;
      const a = View.toScreen(doc, d.start.x, d.start.y), b = View.toScreen(doc, d.end.x, d.end.y);
      ctx.save();
      for (const [color, width] of [['rgba(0,0,0,0.6)', 3], ['#fff', 1]]) {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(b.sx, b.sy);
        ctx.stroke();
      }
      ctx.fillStyle = '#fff';
      for (const c of [a, b]) { ctx.beginPath(); ctx.arc(c.sx, c.sy, 4, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    },
  }, 'clone');

  // --- Formes ---
  // Chaque forme est dessinée dans un nouveau calque, rogné à sa taille.
  Tools.register({
    id: 'shape', name: 'Formes', key: 'u', icon: ICONS.shape, cursor: 'crosshair',
    hint: 'Glisse pour dessiner la forme dans un nouveau calque. Maj : carré, cercle ou ligne à 45°. Alt : depuis le centre.',
    options: [
      { key: 'shape', label: 'Forme', type: 'select', value: 'rect', choices: [['rect', 'Rectangle'], ['rounded', 'Rectangle arrondi'], ['ellipse', 'Ellipse'], ['line', 'Ligne'], ['arrow', 'Flèche'], ['polygon', 'Polygone'], ['star', 'Étoile']] },
      { key: 'fill', label: 'Remplir (couleur principale)', type: 'checkbox', value: true },
      { key: 'stroke', label: 'Contour (secondaire)', type: 'checkbox', value: false },
      { key: 'width', label: 'Épaisseur', type: 'range', min: 1, max: 100, value: 4, unit: 'px' },
      { key: 'radius', label: 'Arrondi', type: 'range', min: 0, max: 200, value: 24, unit: 'px' },
      { key: 'sides', label: 'Côtés / branches', type: 'range', min: 3, max: 24, value: 5 },
    ],
    down(doc, p) {
      const snap = snapshot(doc, 'Forme');
      const layer = createLayer(this.label(), newCanvas(doc.width, doc.height));
      const index = doc.layers.findIndex((l) => l.id === doc.activeId);
      doc.layers.splice(index + 1, 0, layer);
      doc.activeId = layer.id;
      this.drag = { snap, layer, start: { x: p.x, y: p.y } };
      App.refreshPanels();
    },
    label() {
      return { rect: 'Rectangle', rounded: 'Rectangle arrondi', ellipse: 'Ellipse', line: 'Ligne', arrow: 'Flèche', polygon: 'Polygone', star: 'Étoile' }[S.shape.shape];
    },
    move(doc, p, e) {
      const d = this.drag;
      if (!d) return;
      const o = S.shape;
      let w = p.x - d.start.x, h = p.y - d.start.y;
      const lineLike = o.shape === 'line' || o.shape === 'arrow';
      if (e.shiftKey) {
        if (lineLike) {
          const a = Math.round(Math.atan2(h, w) / (Math.PI / 4)) * (Math.PI / 4), len = Math.hypot(w, h);
          w = Math.cos(a) * len; h = Math.sin(a) * len;
        } else { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; }
      }
      let x = d.start.x, y = d.start.y;
      if (e.altKey && !lineLike) { x -= w; y -= h; w *= 2; h *= 2; }
      const g = d.layer.canvas.getContext('2d');
      g.clearRect(0, 0, d.layer.canvas.width, d.layer.canvas.height);
      this.draw(g, o, x, y, w, h);
      d.moved = Math.abs(w) > 1 || Math.abs(h) > 1;
      View.request(true);
    },
    draw(g, o, x, y, w, h) {
      g.save();
      g.lineWidth = o.width;
      g.lineJoin = 'round';
      g.lineCap = 'round';
      g.fillStyle = App.colors.primary;
      g.strokeStyle = o.shape === 'line' || o.shape === 'arrow' ? App.colors.primary : App.colors.secondary;
      const rx = Math.min(x, x + w), ry = Math.min(y, y + h), rw = Math.abs(w), rh = Math.abs(h);
      g.beginPath();
      if (o.shape === 'line' || o.shape === 'arrow') {
        g.moveTo(x, y);
        g.lineTo(x + w, y + h);
        g.stroke();
        if (o.shape === 'arrow') {
          const a = Math.atan2(h, w), size = Math.max(8, o.width * 3.5);
          g.beginPath();
          g.moveTo(x + w, y + h);
          g.lineTo(x + w - size * Math.cos(a - 0.45), y + h - size * Math.sin(a - 0.45));
          g.lineTo(x + w - size * Math.cos(a + 0.45), y + h - size * Math.sin(a + 0.45));
          g.closePath();
          g.fill();
        }
        return g.restore();
      }
      if (o.shape === 'rect') g.rect(rx, ry, rw, rh);
      else if (o.shape === 'rounded') g.roundRect(rx, ry, rw, rh, Math.min(o.radius, rw / 2, rh / 2));
      else if (o.shape === 'ellipse') g.ellipse(rx + rw / 2, ry + rh / 2, rw / 2, rh / 2, 0, 0, Math.PI * 2);
      else {
        // Polygone ou étoile : « Côtés / branches » donne le nombre de côtés ou de branches.
        const n = Math.max(3, Math.min(24, Math.round(o.sides) || 5));
        const pts = o.shape === 'star' ? n * 2 : n;
        for (let i = 0; i < pts; i++) {
          const a = -Math.PI / 2 + (i / pts) * Math.PI * 2;
          const k = o.shape === 'star' && i % 2 ? 0.45 : 1;
          const px = rx + rw / 2 + Math.cos(a) * (rw / 2) * k, py = ry + rh / 2 + Math.sin(a) * (rh / 2) * k;
          if (i) g.lineTo(px, py); else g.moveTo(px, py);
        }
        g.closePath();
      }
      if (o.fill) g.fill();
      if (o.stroke) g.stroke();
      g.restore();
    },
    up(doc) {
      const d = this.drag;
      this.drag = null;
      if (!d) return;
      if (!d.moved || !opaqueBounds(d.layer.canvas)) {
        restore(doc, d.snap); // rien de dessiné : on retire le calque vide
        return App.refresh();
      }
      const b = opaqueBounds(d.layer.canvas);
      cropLayerTo(d.layer, b);
      commit(doc, d.snap);
    },
  }, 'text');

  // --- Transformation libre (Ctrl+T) ---
  // Poignées aux coins et au milieu des côtés : agrandir / réduire (proportions gardées aux coins,
  // Maj pour les libérer). Glisser à l'intérieur : déplacer. Glisser à l'extérieur : tourner
  // (Maj : par pas de 15°). Entrée pour valider, Échap pour annuler.
  const HANDLE = 6;
  const rot = (x, y, a) => ({ x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) });

  Tools.register({
    id: 'transform', name: 'Transformation libre', key: '', hidden: true, icon: ICONS.move, cursor: 'default',
    hint: 'Coins : redimensionner (Maj : proportions libres). Intérieur : déplacer. Extérieur : tourner (Maj : par 15°). Entrée : valider, Échap : annuler.',
    options: [
      { key: 'apply', label: 'Valider', type: 'button', icon: 'check', run: () => Tools.byId.transform.enter(App.doc()) },
      { key: 'cancel', label: 'Annuler', type: 'button', icon: 'close', run: () => Tools.byId.transform.escape(App.doc()) },
    ],
    start(doc, previous) {
      const layer = activeLayer(doc);
      if (!layer) return notify('Choisis d\'abord un calque.', 'warning');
      const b = opaqueBounds(layer.canvas);
      if (!b) return notify('Ce calque est vide : rien à transformer.', 'warning');
      // On travaille sur la partie visible du calque (pas son cadre vide).
      const src = newCanvas(b.w, b.h);
      src.getContext('2d').drawImage(layer.canvas, -b.x, -b.y);
      this.t = { doc, layer, src, previous, cx: layer.x + b.x + b.w / 2, cy: layer.y + b.y + b.h / 2, sx: 1, sy: 1, angle: 0 };
      Tools.select('transform');
      this.preview(true);
    },
    deactivate(doc) {
      if (this.t && !this.leaving) this.escape(doc, true);
    },
    corners(t) {
      const w = (t.src.width * t.sx) / 2, h = (t.src.height * t.sy) / 2;
      return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => { const r = rot(i * w, j * h, t.angle); return { x: t.cx + r.x, y: t.cy + r.y }; });
    },
    render(t, quality) {
      const pts = this.corners(t);
      const minX = Math.floor(Math.min(...pts.map((p) => p.x))), minY = Math.floor(Math.min(...pts.map((p) => p.y)));
      const maxX = Math.ceil(Math.max(...pts.map((p) => p.x))), maxY = Math.ceil(Math.max(...pts.map((p) => p.y)));
      const out = newCanvas(maxX - minX, maxY - minY);
      const g = out.getContext('2d');
      g.imageSmoothingQuality = 'high';
      let src = t.src, sx = t.sx, sy = t.sy;
      // Pour le résultat final, une réduction passe par le redimensionnement de qualité.
      if (quality && (sx < 1 || sy < 1)) { src = Ops.resample(t.src, t.src.width * sx, t.src.height * sy); sx = (t.src.width * t.sx) / src.width; sy = (t.src.height * t.sy) / src.height; }
      g.translate(t.cx - minX, t.cy - minY);
      g.rotate(t.angle);
      g.scale(sx, sy);
      g.drawImage(src, -src.width / 2, -src.height / 2);
      return { canvas: out, x: minX, y: minY };
    },
    preview(quality = false) {
      const t = this.t;
      const r = this.render(t, quality);
      // Aperçu : le calque sans la partie transformée, puis la partie transformée par-dessus.
      const b = opaqueBounds(t.layer.canvas);
      const cover = covering(t.doc, { ...t.layer, canvas: t.layer.canvas });
      const base = cover.canvas;
      const bg = base.getContext('2d');
      bg.clearRect(t.layer.x + b.x - cover.x, t.layer.y + b.y - cover.y, b.w, b.h);
      const left = Math.min(cover.x, r.x), top = Math.min(cover.y, r.y);
      const right = Math.max(cover.x + base.width, r.x + r.canvas.width), bottom = Math.max(cover.y + base.height, r.y + r.canvas.height);
      const out = newCanvas(right - left, bottom - top);
      const og = out.getContext('2d');
      og.drawImage(base, cover.x - left, cover.y - top);
      og.drawImage(r.canvas, r.x - left, r.y - top);
      t.doc.preview = { layerId: t.layer.id, canvas: out, x: left, y: top };
      View.request(true);
      App.updateStatus();
    },
    handles(doc, t) {
      const w = (t.src.width * t.sx) / 2, h = (t.src.height * t.sy) / 2;
      const list = [];
      for (const i of [-1, 0, 1]) for (const j of [-1, 0, 1]) {
        if (!i && !j) continue;
        const r = rot(i * w, j * h, t.angle);
        list.push({ i, j, ...View.toScreen(doc, t.cx + r.x, t.cy + r.y) });
      }
      return list;
    },
    down(doc, p, e) {
      const t = this.t;
      if (!t) return Tools.select('move'); // transformation annulée entre-temps (changement d'onglet)
      const hit = this.handles(doc, t).find((h) => Math.abs(h.sx - p.sx) <= HANDLE + 3 && Math.abs(h.sy - p.sy) <= HANDLE + 3);
      const local = rot(p.x - t.cx, p.y - t.cy, -t.angle);
      const insideBox = Math.abs(local.x) <= (t.src.width * t.sx) / 2 && Math.abs(local.y) <= (t.src.height * t.sy) / 2;
      const mode = hit ? 'scale' : insideBox ? 'move' : 'rotate';
      this.drag = { mode, hit, start: { ...p }, from: { ...t } };
    },
    move(doc, p, e) {
      const d = this.drag, t = this.t;
      if (!d || !t) return;
      const f = d.from;
      if (d.mode === 'move') {
        t.cx = f.cx + Math.round(p.x - d.start.x);
        t.cy = f.cy + Math.round(p.y - d.start.y);
      } else if (d.mode === 'rotate') {
        let a = f.angle + Math.atan2(p.y - f.cy, p.x - f.cx) - Math.atan2(d.start.y - f.cy, d.start.x - f.cx);
        if (e.shiftKey) a = Math.round(a / (Math.PI / 12)) * (Math.PI / 12);
        t.angle = a;
      } else {
        // Le côté (ou coin) opposé reste fixe.
        const { i, j } = d.hit;
        const W = f.src.width * f.sx, H = f.src.height * f.sy;
        const lp = rot(p.x - f.cx, p.y - f.cy, -f.angle);
        const ax = -i * W / 2, ay = -j * H / 2;
        let nw = i ? Math.max(1, Math.abs(lp.x - ax)) : W;
        let nh = j ? Math.max(1, Math.abs(lp.y - ay)) : H;
        if (i && j && !e.shiftKey) {
          const k = Math.max(nw / W, nh / H);
          nw = W * k; nh = H * k;
        }
        const shift = rot(i ? ax + (i * nw) / 2 : 0, j ? ay + (j * nh) / 2 : 0, f.angle);
        t.cx = f.cx + shift.x;
        t.cy = f.cy + shift.y;
        t.sx = nw / f.src.width;
        t.sy = nh / f.src.height;
      }
      t.changed = true;
      this.preview();
    },
    up() { this.drag = null; },
    enter(doc) {
      const t = this.t;
      if (!t || t.doc !== doc) return;
      this.preview(true);
      const p = doc.preview;
      doc.preview = null;
      this.t = null;
      if (!t.changed) {
        this.leave(t);
        return View.request(true);
      }
      change(doc, 'Transformer', () => replacePixels(t.layer, p.canvas, p.x, p.y));
      this.leave(t);
    },
    escape(doc, silent = false) {
      const t = this.t;
      if (!t) return;
      t.doc.preview = null;
      this.t = null;
      View.request(true);
      if (!silent) this.leave(t);
    },
    leave(t) {
      this.leaving = true;
      Tools.select(t.previous || 'move');
      this.leaving = false;
    },
    overlay(ctx, doc) {
      const t = this.t;
      if (!t || t.doc !== doc) return;
      const pts = this.corners(t).map((p) => View.toScreen(doc, p.x, p.y));
      ctx.save();
      ctx.strokeStyle = 'rgba(94, 200, 255, 0.95)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy)));
      ctx.closePath();
      ctx.stroke();
      for (const h of this.handles(doc, t)) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(h.sx - HANDLE, h.sy - HANDLE, HANDLE * 2, HANDLE * 2);
        ctx.strokeRect(h.sx - HANDLE + 0.5, h.sy - HANDLE + 0.5, HANDLE * 2 - 1, HANDLE * 2 - 1);
      }
      const label = `${Math.round(t.src.width * t.sx)} × ${Math.round(t.src.height * t.sy)} px · ${Math.round((t.sx * 1000)) / 10} % · ${Math.round((t.angle * 180) / Math.PI * 10) / 10}°`;
      ctx.font = '12px "Segoe UI", system-ui, sans-serif';
      const bottom = pts.reduce((a, b) => (b.sy > a.sy ? b : a));
      const tw = ctx.measureText(label).width + 14;
      ctx.fillStyle = 'rgba(20,20,28,0.85)';
      ctx.fillRect(bottom.sx - tw / 2, bottom.sy + 14, tw, 22);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, bottom.sx - tw / 2 + 7, bottom.sy + 29);
      ctx.restore();
    },
  });
})();
