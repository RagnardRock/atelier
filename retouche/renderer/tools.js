// Les outils de la barre de gauche. Chacun est un objet avec :
// - id, name, key (raccourci clavier), icon, cursor (curseur CSS) ;
// - options : les réglages affichés dans la barre d'options en haut (taille, dureté…) ;
// - down / move / up : ce qu'il fait quand on clique, glisse, relâche dans l'image ;
// - overlay : ce qu'il dessine par-dessus l'image (cercle du pinceau, cadre de recadrage…).
// Les réglages de chaque outil sont retenus d'une fois sur l'autre (localStorage).

const Tools = (() => {
  const SAVED = 'skald.tools';
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(SAVED) || '{}'); } catch { saved = {}; }
  const save = () => { try { localStorage.setItem(SAVED, JSON.stringify(settings)); } catch { /* pas grave */ } };

  const settings = {};
  const value = (tool, key) => settings[tool][key];

  // --- Pinceau et gomme ---
  // Le trait est d'abord peint dans un calque tampon (stroke.buffer) : il est ainsi posé d'un coup
  // avec son opacité à la fin, sans s'assombrir là où il repasse sur lui-même.

  function makeStamp(size, hardness, color) {
    const d = Math.max(1, size);
    const c = newCanvas(Math.ceil(d) + 2, Math.ceil(d) + 2);
    const g = c.getContext('2d');
    const r = d / 2, cx = c.width / 2;
    if (hardness >= 0.99) {
      g.fillStyle = color;
      g.beginPath();
      g.arc(cx, cx, r, 0, Math.PI * 2);
      g.fill();
    } else {
      const [cr, cg, cb] = hexToRgb(color);
      const grad = g.createRadialGradient(cx, cx, 0, cx, cx, r);
      grad.addColorStop(0, `rgba(${cr},${cg},${cb},1)`);
      grad.addColorStop(Math.max(0.01, hardness), `rgba(${cr},${cg},${cb},1)`);
      grad.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
      g.fillStyle = grad;
      g.fillRect(0, 0, c.width, c.height);
    }
    return c;
  }

  function paintTool(id, name, key, erase, clone = false) {
    const hints = {
      brush: 'Glisse pour peindre. Maj + clic : ligne droite. Alt + clic : prélever une couleur.',
      eraser: 'Glisse pour effacer. Maj + clic : ligne droite depuis le dernier point.',
      clone: 'Alt + clic : choisir l\'endroit à recopier. Puis peins ailleurs pour le reproduire.',
    };
    return {
      id, name, key, icon: ICONS[id], cursor: 'none', erase,
      hint: hints[id],
      options: [
        { key: 'size', label: 'Taille', type: 'range', min: 1, max: 500, value: erase ? 40 : clone ? 40 : 12, unit: 'px' },
        { key: 'hardness', label: 'Dureté', type: 'range', min: 0, max: 100, value: erase ? 100 : clone ? 50 : 80, unit: '%' },
        { key: 'opacity', label: 'Opacité', type: 'range', min: 1, max: 100, value: 100, unit: '%' },
        ...(clone ? [
          { key: 'aligned', label: 'Aligné', type: 'checkbox', value: true },
          { key: 'sampleAll', label: 'Tous les calques', type: 'checkbox', value: true },
        ] : []),
      ],
      down(doc, p, e) {
        if (clone && e.altKey) {
          doc.cloneSource = { x: p.x, y: p.y, fresh: true };
          return notify('Source choisie. Peins maintenant là où tu veux la recopier.', 'info', 2000);
        }
        if (!erase && !clone && e.altKey) return Tools.byId.eyedropper.down(doc, p, e);
        const layer = activeLayer(doc);
        if (!layer) return notify('Ajoute d\'abord un calque.', 'warning');
        if (!layer.visible) return notify('Le calque actif est masqué : affiche-le (œil) pour peindre dessus.', 'warning');
        const snap = snapshot(doc, name);
        editPixels(layer, doc, true);
        const s = settings[id];
        const sel = doc.selection;
        doc.stroke = {
          snap, layer, erase,
          buffer: newCanvas(layer.canvas.width, layer.canvas.height),
          temp: newCanvas(layer.canvas.width, layer.canvas.height),
          stamp: makeStamp(s.size, s.hardness / 100, erase || clone ? '#000000' : App.colors.primary),
          spacing: Math.max(0.5, s.size * 0.1),
          opacity: s.opacity / 100,
          sel,
          last: null,
        };
        if (clone) {
          // Tampon : on recopie une autre partie de l'image (l'image telle qu'au début du trait).
          if (!doc.cloneSource) { doc.stroke = null; return notify('Alt + clic d\'abord sur l\'endroit à recopier.', 'warning'); }
          if (!s.aligned || !doc.cloneOffset || doc.cloneSource.fresh) {
            doc.cloneOffset = { x: doc.cloneSource.x - p.x, y: doc.cloneSource.y - p.y };
            doc.cloneSource.fresh = false;
          }
          doc.stroke.source = s.sampleAll ? flatten(doc) : (() => { const c = newCanvas(doc.width, doc.height); c.getContext('2d').drawImage(layer.canvas, layer.x, layer.y); return c; })();
          doc.stroke.offset = doc.cloneOffset;
          doc.stroke.piece = newCanvas(doc.stroke.stamp.width, doc.stroke.stamp.height);
        }
        const from = e.shiftKey && doc.lastPaint && !clone ? doc.lastPaint : null;
        if (from) { doc.stroke.last = { x: from.x - layer.x, y: from.y - layer.y }; this.move(doc, p); } else this.move(doc, p);
      },
      move(doc, p) {
        const s = doc.stroke;
        if (!s) return;
        const x = p.x - s.layer.x, y = p.y - s.layer.y;
        const g = s.buffer.getContext('2d');
        const half = s.stamp.width / 2;
        const dab = s.source ? (px, py) => {
          // Un morceau de la source, découpé à la forme du pinceau.
          const pg = s.piece.getContext('2d');
          pg.globalCompositeOperation = 'source-over';
          pg.clearRect(0, 0, s.piece.width, s.piece.height);
          pg.drawImage(s.source, -(px + s.layer.x + s.offset.x - half), -(py + s.layer.y + s.offset.y - half));
          pg.globalCompositeOperation = 'destination-in';
          pg.drawImage(s.stamp, 0, 0);
          g.drawImage(s.piece, px - half, py - half);
        } : (px, py) => g.drawImage(s.stamp, px - half, py - half);
        if (!s.last) dab(x, y);
        else {
          const dist = Math.hypot(x - s.last.x, y - s.last.y);
          const steps = Math.floor(dist / s.spacing);
          for (let i = 1; i <= steps; i++) dab(s.last.x + ((x - s.last.x) * i) / steps, s.last.y + ((y - s.last.y) * i) / steps);
          if (steps === 0) return;
        }
        s.last = { x, y };
        View.request(true);
      },
      up(doc, p) {
        const s = doc.stroke;
        if (!s) return;
        applyStroke(s, s.layer.canvas.getContext('2d'));
        doc.lastPaint = { x: p.x, y: p.y };
        doc.stroke = null;
        commit(doc, s.snap);
      },
      overlay(ctx, doc, pointer) {
        if (!pointer) return;
        const r = (settings[id].size / 2) * doc.view.zoom;
        ctx.save();
        ctx.lineWidth = 1;
        for (const [color, offset] of [['rgba(0,0,0,0.7)', 1], ['rgba(255,255,255,0.9)', 0]]) {
          ctx.strokeStyle = color;
          ctx.beginPath();
          if (r < 3) {
            ctx.moveTo(pointer.sx - 6 + offset, pointer.sy + offset); ctx.lineTo(pointer.sx + 6 + offset, pointer.sy + offset);
            ctx.moveTo(pointer.sx + offset, pointer.sy - 6 + offset); ctx.lineTo(pointer.sx + offset, pointer.sy + 6 + offset);
          } else ctx.arc(pointer.sx, pointer.sy, r + offset, 0, Math.PI * 2);
          ctx.stroke();
        }
        // Tampon : une croix montre l'endroit recopié.
        const src = clone && (doc.stroke?.offset ? { x: pointer.x + doc.stroke.offset.x, y: pointer.y + doc.stroke.offset.y } : doc.cloneSource);
        if (src) {
          const c = View.toScreen(doc, src.x, src.y);
          ctx.strokeStyle = '#fff';
          ctx.beginPath();
          ctx.moveTo(c.sx - 7, c.sy); ctx.lineTo(c.sx + 7, c.sy);
          ctx.moveTo(c.sx, c.sy - 7); ctx.lineTo(c.sx, c.sy + 7);
          ctx.stroke();
        }
        ctx.restore();
      },
    };
  }

  // Pose le tampon du trait sur un canvas (le calque, ou sa copie d'aperçu).
  function applyStroke(s, g) {
    g.save();
    g.globalAlpha = s.opacity;
    g.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over';
    // Avec une sélection, seule la partie du trait qui tombe dedans est posée.
    g.drawImage(s.sel ? Sel.clip(s.buffer, s.sel, s.layer.x, s.layer.y) : s.buffer, 0, 0);
    g.restore();
  }
  function strokeAppearance(doc) {
    const s = doc.stroke;
    const g = s.temp.getContext('2d');
    g.clearRect(0, 0, s.temp.width, s.temp.height);
    g.drawImage(s.layer.canvas, 0, 0);
    applyStroke(s, g);
    return { canvas: s.temp, x: s.layer.x, y: s.layer.y };
  }

  // --- Pot de peinture ---
  function floodFill(doc, layer, p) {
    const s = settings.fill;
    const g = editPixels(layer, doc, true);
    const { width, height } = layer.canvas;
    const sx = Math.floor(p.x - layer.x), sy = Math.floor(p.y - layer.y);
    const img = g.getImageData(0, 0, width, height);
    const data = img.data;
    // Zone autorisée : la sélection, sinon tout le document (en coordonnées du calque).
    const area = doc.selection || { x: 0, y: 0, w: doc.width, h: doc.height };
    const ax0 = area.x - layer.x, ay0 = area.y - layer.y, ax1 = ax0 + area.w, ay1 = ay0 + area.h;
    if (sx < ax0 || sy < ay0 || sx >= ax1 || sy >= ay1) return false;
    const start = (sy * width + sx) * 4;
    const target = [data[start], data[start + 1], data[start + 2], data[start + 3]];
    const tol = (s.tolerance / 100) * 255;
    const matches = (i) => Math.abs(data[i] - target[0]) <= tol && Math.abs(data[i + 1] - target[1]) <= tol && Math.abs(data[i + 2] - target[2]) <= tol && Math.abs(data[i + 3] - target[3]) <= tol;
    const [r, gr, b] = hexToRgb(App.colors.primary);
    const alpha = Math.round((s.opacity / 100) * 255);
    const mask = new Uint8Array(width * height);
    // Sélection de forme quelconque : on ne remplit que ses pixels.
    let selData = null;
    if (doc.selection && !doc.selection.rect) selData = doc.selection.mask.getContext('2d').getImageData(0, 0, area.w, area.h).data;
    const allowed = (x, y) => !selData || selData[((y - ay0) * area.w + (x - ax0)) * 4 + 3] > 127;
    const paint = (i) => {
      // Mélange de la couleur avec ce qui est déjà là, selon l'opacité.
      const a = alpha / 255, under = data[i + 3] / 255, out = a + under * (1 - a);
      if (out > 0) {
        data[i] = (r * a + data[i] * under * (1 - a)) / out;
        data[i + 1] = (gr * a + data[i + 1] * under * (1 - a)) / out;
        data[i + 2] = (b * a + data[i + 2] * under * (1 - a)) / out;
      }
      data[i + 3] = out * 255;
    };
    if (s.contiguous) {
      // Remplissage par lignes : on part du point cliqué et on s'étend tant que la couleur ressemble.
      const stack = [[sx, sy]];
      while (stack.length) {
        const [x, y] = stack.pop();
        let left = x;
        while (left > ax0 && !mask[y * width + left - 1] && matches((y * width + left - 1) * 4)) left--;
        let right = x;
        while (right < ax1 - 1 && !mask[y * width + right + 1] && matches((y * width + right + 1) * 4)) right++;
        for (let i = left; i <= right; i++) {
          if (mask[y * width + i] || !matches((y * width + i) * 4)) continue;
          mask[y * width + i] = 1;
          if (y > ay0 && !mask[(y - 1) * width + i] && matches(((y - 1) * width + i) * 4)) stack.push([i, y - 1]);
          if (y < ay1 - 1 && !mask[(y + 1) * width + i] && matches(((y + 1) * width + i) * 4)) stack.push([i, y + 1]);
        }
      }
    } else {
      for (let y = Math.max(0, ay0); y < Math.min(height, ay1); y++) for (let x = Math.max(0, ax0); x < Math.min(width, ax1); x++) if (matches((y * width + x) * 4)) mask[y * width + x] = 1;
    }
    for (let i = 0; i < mask.length; i++) if (mask[i] && allowed(i % width, (i / width) | 0)) paint(i * 4);
    g.putImageData(img, 0, 0);
  }

  // --- Recadrage ---
  const HANDLE = 7; // demi-taille des poignées, en pixels d'écran
  function cropHandles(doc, r) {
    const a = View.toScreen(doc, r.x, r.y), b = View.toScreen(doc, r.x + r.w, r.y + r.h);
    const mx = (a.sx + b.sx) / 2, my = (a.sy + b.sy) / 2;
    return { nw: [a.sx, a.sy], n: [mx, a.sy], ne: [b.sx, a.sy], e: [b.sx, my], se: [b.sx, b.sy], s: [mx, b.sy], sw: [a.sx, b.sy], w: [a.sx, my] };
  }
  function cropRatio(doc) {
    const ratio = settings.crop.ratio;
    if (ratio === 'free') return null;
    if (ratio === 'original') return doc.width / doc.height;
    const [w, h] = ratio.split(':').map(Number);
    return w / h;
  }
  // Rectangle normalisé (largeur et hauteur positives), aux pixels entiers.
  const normRect = (r) => ({ x: Math.round(Math.min(r.x, r.x + r.w)), y: Math.round(Math.min(r.y, r.y + r.h)), w: Math.round(Math.abs(r.w)), h: Math.round(Math.abs(r.h)) });

  function applyCrop(doc) {
    const r = doc.crop && normRect(doc.crop);
    if (!r || r.w < 1 || r.h < 1) return;
    if (r.x === 0 && r.y === 0 && r.w === doc.width && r.h === doc.height) return;
    change(doc, 'Recadrer', (d) => {
      for (const layer of d.layers) cropLayerTo(layer, r);
      for (const layer of d.layers) { layer.x -= r.x; layer.y -= r.y; }
      d.width = r.w;
      d.height = r.h;
      d.selection = null;
    });
    doc.crop = null;
    View.fit(doc);
    Tools.select('move');
  }

  // --- Texte ---
  function renderText(t) {
    const font = `${t.italic ? 'italic ' : ''}${t.bold ? 'bold ' : ''}${t.size}px "${t.font}"`;
    const measure = newCanvas(1, 1).getContext('2d');
    measure.font = font;
    const lines = t.content.split('\n');
    const lineHeight = t.size * (t.lineHeight || 1.2);
    const pad = Math.ceil(t.size * 0.25);
    const width = Math.ceil(Math.max(...lines.map((l) => measure.measureText(l).width), 1)) + pad * 2;
    const height = Math.ceil(lineHeight * lines.length) + pad * 2;
    const canvas = newCanvas(width, height);
    const g = canvas.getContext('2d');
    g.font = font;
    g.fillStyle = t.color;
    g.textBaseline = 'middle';
    g.textAlign = t.align;
    if (t.letterSpacing) g.letterSpacing = `${t.letterSpacing}px`;
    const x = t.align === 'center' ? width / 2 : t.align === 'right' ? width - pad : pad;
    lines.forEach((line, i) => g.fillText(line, x, pad + lineHeight * (i + 0.5)));
    return { canvas, pad };
  }
  const textLayerAt = (doc, p) => [...doc.layers].reverse().find((l) => l.text && l.visible && p.x >= l.x && p.y >= l.y && p.x < l.x + l.canvas.width && p.y < l.y + l.canvas.height);

  async function editText(doc, layer, p) {
    const initial = layer?.text || { content: '', font: Tools.lastFont || 'Segoe UI', size: 64, color: App.colors.primary, bold: false, italic: false, align: 'left', lineHeight: 1.2, letterSpacing: 0 };
    const t = await Dialogs.text(initial, Boolean(layer));
    if (!t || !t.content.trim()) return;
    Tools.lastFont = t.font;
    const { canvas, pad } = renderText(t);
    if (layer) {
      change(doc, 'Modifier le texte', () => {
        layer.canvas = canvas;
        layer.text = t;
        layer.name = t.content.split('\n')[0].slice(0, 40);
      });
    } else {
      change(doc, 'Texte', (d) => {
        const created = createLayer(t.content.split('\n')[0].slice(0, 40), canvas, { x: Math.round(p.x - pad), y: Math.round(p.y - pad - t.size * 0.6), text: t });
        const index = d.layers.findIndex((l) => l.id === d.activeId);
        d.layers.splice(index + 1, 0, created);
        d.activeId = created.id;
      });
    }
  }

  // Calque visible le plus haut qui a un pixel non transparent sous la souris.
  function layerAt(doc, p) {
    for (const layer of [...doc.layers].reverse()) {
      if (!layer.visible) continue;
      const x = Math.floor(p.x - layer.x), y = Math.floor(p.y - layer.y);
      if (x < 0 || y < 0 || x >= layer.canvas.width || y >= layer.canvas.height) continue;
      if (layer.canvas.getContext('2d').getImageData(x, y, 1, 1).data[3] > 10) return layer;
    }
    return null;
  }

  const inside = (r, p) => r && p.x >= r.x && p.y >= r.y && p.x <= r.x + r.w && p.y <= r.y + r.h;

  // Réglage commun aux outils de sélection (les touches Maj / Alt au clic passent devant).
  const SELECT_MODE = { key: 'mode', label: 'Mode', type: 'select', value: 'new', choices: [['new', 'Nouvelle sélection'], ['add', 'Ajouter (Maj)'], ['subtract', 'Retirer (Alt)'], ['intersect', 'Intersection (Maj+Alt)']] };

  // Zone de couleur proche du pixel (sx, sy), pour la baguette magique : renvoie une sélection.
  function colorRegion(source, sx, sy, tolerance, contiguous) {
    const { width, height } = source;
    const data = source.getContext('2d').getImageData(0, 0, width, height).data;
    const start = (sy * width + sx) * 4;
    const target = [data[start], data[start + 1], data[start + 2], data[start + 3]];
    const tol = (tolerance / 100) * 255;
    const matches = (p) => {
      const i = p * 4;
      return Math.abs(data[i] - target[0]) <= tol && Math.abs(data[i + 1] - target[1]) <= tol && Math.abs(data[i + 2] - target[2]) <= tol && Math.abs(data[i + 3] - target[3]) <= tol;
    };
    const picked = new Uint8Array(width * height);
    if (contiguous) {
      const stack = [sy * width + sx];
      picked[stack[0]] = 1;
      while (stack.length) {
        const p = stack.pop(), x = p % width;
        for (const q of [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, p - width, p + width]) {
          if (q >= 0 && q < picked.length && !picked[q] && matches(q)) { picked[q] = 1; stack.push(q); }
        }
      }
    } else {
      for (let p = 0; p < picked.length; p++) if (matches(p)) picked[p] = 1;
    }
    const full = newCanvas(width, height);
    const g = full.getContext('2d');
    const img = g.createImageData(width, height);
    for (let p = 0; p < picked.length; p++) if (picked[p]) { const i = p * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0);
    return Sel.fromMask(full);
  }

  const list = [
    {
      id: 'move', name: 'Déplacement', key: 'v', icon: ICONS.move, cursor: 'move',
      hint: 'Glisse pour déplacer le calque actif (ou les pixels sélectionnés). Flèches : 1 px, Maj + flèches : 10 px.',
      options: [{ key: 'autoSelect', label: 'Choisir le calque sous la souris', type: 'checkbox', value: true }],
      down(doc, p, e) {
        if (settings.move.autoSelect || e.ctrlKey) {
          const hit = layerAt(doc, p);
          if (hit && hit.id !== doc.activeId) { doc.activeId = hit.id; App.refreshPanels(); }
        }
        const layer = activeLayer(doc);
        if (!layer) return;
        this.drag = { snap: snapshot(doc, 'Déplacer'), start: p, x: layer.x, y: layer.y, moved: false };
        // Une sélection autour du clic : on soulève ces pixels-là, pas tout le calque.
        if (doc.selection && Sel.contains(doc.selection, p)) {
          const sel = doc.selection;
          const g = editPixels(layer, doc, true);
          let piece = newCanvas(sel.w, sel.h);
          piece.getContext('2d').drawImage(layer.canvas, layer.x - sel.x, layer.y - sel.y);
          piece = Sel.clip(piece, sel, sel.x, sel.y);
          Sel.erase(g, sel, layer.x, layer.y);
          doc.float = { layerId: layer.id, canvas: piece, x: sel.x, y: sel.y };
          this.drag.x = sel.x;
          this.drag.y = sel.y;
        }
      },
      move(doc, p, e) {
        const drag = this.drag;
        if (!drag) return;
        let dx = Math.round(p.x - drag.start.x), dy = Math.round(p.y - drag.start.y);
        if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; } // Maj : droit à l'horizontale ou verticale
        drag.moved = drag.moved || dx !== 0 || dy !== 0;
        if (doc.float) {
          doc.float.x = drag.x + dx;
          doc.float.y = drag.y + dy;
          doc.selection = { ...doc.selection, x: doc.float.x, y: doc.float.y };
        } else {
          const layer = activeLayer(doc);
          layer.x = drag.x + dx;
          layer.y = drag.y + dy;
        }
        View.request(true);
      },
      up(doc) {
        const drag = this.drag;
        this.drag = null;
        if (!drag) return;
        if (doc.float) {
          // On repose les pixels soulevés dans le calque, agrandi au besoin.
          const f = doc.float;
          const layer = doc.layers.find((l) => l.id === f.layerId);
          const left = Math.min(layer.x, f.x), top = Math.min(layer.y, f.y);
          const right = Math.max(layer.x + layer.canvas.width, f.x + f.canvas.width), bottom = Math.max(layer.y + layer.canvas.height, f.y + f.canvas.height);
          const canvas = newCanvas(right - left, bottom - top);
          const g = canvas.getContext('2d');
          g.drawImage(layer.canvas, layer.x - left, layer.y - top);
          g.drawImage(f.canvas, f.x - left, f.y - top);
          layer.canvas = canvas;
          layer.x = left;
          layer.y = top;
          doc.float = null;
        }
        if (drag.moved) commit(doc, drag.snap); else if (doc.float === null) App.refresh();
      },
    },
    {
      id: 'select', name: 'Sélection rectangle / ellipse', key: 'm', icon: ICONS.select, cursor: 'crosshair',
      hint: 'Glisse pour sélectionner (Maj pendant le glisser : carré / cercle). Au clic : Maj ajoute, Alt retire. Glisse dans la sélection pour la déplacer.',
      options: [
        { key: 'shape', label: 'Forme', type: 'select', value: 'rect', choices: [['rect', 'Rectangle'], ['ellipse', 'Ellipse']] },
        SELECT_MODE,
      ],
      down(doc, p, e) {
        const mode = Sel.modeFrom(e, settings.select.mode);
        this.drag = {
          snap: snapshot(doc, 'Sélection'),
          start: { x: Math.round(p.x), y: Math.round(p.y) },
          moving: mode === 'new' && Sel.contains(doc.selection, p),
          before: doc.selection,
          mode,
          constrain: !e.shiftKey, // Maj tenu dès le clic = ajouter, pas « carré »
        };
      },
      move(doc, p, e) {
        const d = this.drag;
        if (!d) return;
        if (d.moving) {
          doc.selection = { ...d.before, x: d.before.x + Math.round(p.x - d.start.x), y: d.before.y + Math.round(p.y - d.start.y) };
        } else {
          let w = Math.round(p.x) - d.start.x, h = Math.round(p.y) - d.start.y;
          if (e.shiftKey && d.constrain) { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; }
          const r = clampRect(doc, { x: d.start.x, y: d.start.y, w, h });
          d.shape = r && (settings.select.shape === 'ellipse' ? Sel.ellipse(r.x, r.y, r.w, r.h) : Sel.rect(r.x, r.y, r.w, r.h));
          d.preview = d.shape;
          doc.selection = d.mode === 'new' ? d.shape : (d.shape ? d.shape : d.before);
        }
        App.updateStatus();
      },
      up(doc) {
        const d = this.drag;
        this.drag = null;
        if (!d) return;
        if (!d.moving) {
          const tiny = !d.shape || (d.shape.w < 2 && d.shape.h < 2);
          doc.selection = tiny ? (d.mode === 'new' ? null : d.before) : Sel.combine(doc, d.before, d.shape, d.mode);
        }
        if (doc.selection !== d.before) commit(doc, d.snap); else App.refresh();
      },
    },
    {
      id: 'lasso', name: 'Lasso', key: 'l', icon: ICONS.lasso, cursor: 'crosshair',
      hint: 'Dessine le contour à main levée ; il se ferme en relâchant. Au clic : Maj ajoute, Alt retire.',
      options: [SELECT_MODE],
      down(doc, p, e) {
        this.drag = { snap: snapshot(doc, 'Lasso'), before: doc.selection, mode: Sel.modeFrom(e, settings.lasso.mode), points: [{ x: p.x, y: p.y }] };
      },
      move(doc, p) {
        const d = this.drag;
        if (!d) return;
        const last = d.points[d.points.length - 1];
        if (Math.hypot(p.x - last.x, p.y - last.y) * doc.view.zoom >= 2) d.points.push({ x: p.x, y: p.y });
        View.request();
      },
      up(doc) {
        const d = this.drag;
        this.drag = null;
        if (!d) return;
        const shape = Sel.polygon(doc, d.points);
        doc.selection = shape ? Sel.combine(doc, d.before, shape, d.mode) : d.mode === 'new' ? null : d.before;
        if (doc.selection !== d.before) commit(doc, d.snap); else App.refresh();
      },
      overlay(ctx, doc) {
        const d = this.drag;
        if (!d || d.points.length < 2) return;
        ctx.save();
        ctx.beginPath();
        d.points.forEach((pt, i) => { const c = View.toScreen(doc, pt.x, pt.y); if (i) ctx.lineTo(c.sx, c.sy); else ctx.moveTo(c.sx, c.sy); });
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      },
    },
    {
      id: 'wand', name: 'Baguette magique', key: 'w', icon: ICONS.wand, cursor: 'crosshair',
      hint: 'Clique sur une couleur pour sélectionner la zone qui lui ressemble. Maj ajoute, Alt retire.',
      options: [
        { key: 'tolerance', label: 'Tolérance', type: 'range', min: 0, max: 100, value: 12, unit: '%' },
        { key: 'contiguous', label: 'Zone continue seulement', type: 'checkbox', value: true },
        { key: 'sampleAll', label: 'Tous les calques', type: 'checkbox', value: false },
        SELECT_MODE,
      ],
      down(doc, p, e) {
        if (p.x < 0 || p.y < 0 || p.x >= doc.width || p.y >= doc.height) return;
        const o = settings.wand;
        // Image analysée : tout ce qu'on voit, ou seulement le calque actif (posé dans le document).
        let source;
        if (o.sampleAll) source = flatten(doc);
        else {
          const layer = activeLayer(doc);
          if (!layer) return;
          source = newCanvas(doc.width, doc.height);
          source.getContext('2d').drawImage(layer.canvas, layer.x, layer.y);
        }
        const region = colorRegion(source, Math.floor(p.x), Math.floor(p.y), o.tolerance, o.contiguous);
        const before = doc.selection;
        change(doc, 'Baguette magique', (d) => {
          d.selection = Sel.combine(d, before, region, Sel.modeFrom(e, o.mode));
          return d.selection !== before;
        });
      },
    },
    {
      id: 'crop', name: 'Recadrage', key: 'c', icon: ICONS.crop, cursor: 'crosshair',
      hint: 'Ajuste le cadre avec ses poignées (il peut dépasser pour agrandir l\'image). Entrée : recadrer, Échap : annuler.',
      options: [
        { key: 'ratio', label: 'Proportions', type: 'select', value: 'free', choices: [['free', 'Libres'], ['original', 'Originales'], ['1:1', '1:1 (carré)'], ['4:3', '4:3'], ['3:2', '3:2'], ['16:9', '16:9'], ['9:16', '9:16'], ['4:5', '4:5']] },
        { key: 'apply', label: 'Recadrer', type: 'button', icon: 'check', run: () => applyCrop(App.doc()) },
        { key: 'reset', label: 'Annuler', type: 'button', icon: 'close', run: () => { const d = App.doc(); if (d) { d.crop = { x: 0, y: 0, w: d.width, h: d.height }; View.request(); } } },
      ],
      activate(doc) {
        if (doc) doc.crop = doc.selection ? { ...doc.selection } : { x: 0, y: 0, w: doc.width, h: doc.height };
      },
      deactivate(doc) { if (doc) doc.crop = null; },
      down(doc, p) {
        if (!doc.crop) this.activate(doc);
        const handles = cropHandles(doc, doc.crop);
        const hit = Object.entries(handles).find(([, [hx, hy]]) => Math.abs(p.sx - hx) <= HANDLE + 2 && Math.abs(p.sy - hy) <= HANDLE + 2);
        const r = normRect(doc.crop);
        if (hit) this.drag = { mode: hit[0], from: r, start: p };
        else if (inside(r, p)) this.drag = { mode: 'move', from: r, start: p };
        else { this.drag = { mode: 'new', start: p }; doc.crop = { x: Math.round(p.x), y: Math.round(p.y), w: 0, h: 0 }; }
      },
      move(doc, p, e) {
        const d = this.drag;
        if (!d) return;
        const dx = p.x - d.start.x, dy = p.y - d.start.y;
        const ratio = e.shiftKey && settings.crop.ratio === 'free' ? 1 : cropRatio(doc);
        let r;
        if (d.mode === 'new') {
          r = { x: d.start.x, y: d.start.y, w: dx, h: dy };
          if (ratio) r.h = Math.sign(dy || 1) * Math.abs(dx) / ratio;
        } else if (d.mode === 'move') r = { ...d.from, x: d.from.x + dx, y: d.from.y + dy };
        else {
          // On bouge seulement les bords de la poignée tirée ; le côté opposé reste fixe.
          const f = d.from;
          let x0 = f.x, y0 = f.y, x1 = f.x + f.w, y1 = f.y + f.h;
          if (d.mode.includes('w')) x0 += dx;
          if (d.mode.includes('e')) x1 += dx;
          if (d.mode.includes('n')) y0 += dy;
          if (d.mode.includes('s')) y1 += dy;
          if (ratio) {
            if (d.mode === 'n' || d.mode === 's') {
              const w = Math.abs(y1 - y0) * ratio, cx = f.x + f.w / 2;
              x0 = cx - w / 2; x1 = cx + w / 2;
            } else if (d.mode === 'e' || d.mode === 'w') {
              const h = Math.abs(x1 - x0) / ratio, cy = f.y + f.h / 2;
              y0 = cy - h / 2; y1 = cy + h / 2;
            } else {
              const h = Math.abs(x1 - x0) / ratio;
              if (d.mode.includes('n')) y0 = y1 - h; else y1 = y0 + h;
            }
          }
          r = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
        }
        doc.crop = r;
        App.updateStatus();
      },
      up(doc) {
        this.drag = null;
        if (doc.crop) doc.crop = normRect(doc.crop);
        if (!doc.crop || !doc.crop.w || !doc.crop.h) doc.crop = { x: 0, y: 0, w: doc.width, h: doc.height };
        App.updateStatus();
      },
      dblclick(doc) { applyCrop(doc); },
      overlay(ctx, doc) {
        if (!doc.crop) return;
        const r = normRect(doc.crop);
        const a = View.toScreen(doc, r.x, r.y);
        const w = r.w * doc.view.zoom, h = r.h * doc.view.zoom;
        const { width, height } = View.size;
        ctx.save();
        // Tout ce qui sera retiré est assombri.
        ctx.fillStyle = 'rgba(8, 8, 12, 0.62)';
        ctx.beginPath();
        ctx.rect(0, 0, width, height);
        ctx.rect(a.sx, a.sy, w, h);
        ctx.fill('evenodd');
        // Tiers (règle des tiers) et cadre.
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (const t of [1 / 3, 2 / 3]) {
          ctx.moveTo(a.sx + w * t, a.sy); ctx.lineTo(a.sx + w * t, a.sy + h);
          ctx.moveTo(a.sx, a.sy + h * t); ctx.lineTo(a.sx + w, a.sy + h * t);
        }
        ctx.stroke();
        ctx.strokeStyle = '#fff';
        ctx.strokeRect(Math.round(a.sx) + 0.5, Math.round(a.sy) + 0.5, Math.round(w), Math.round(h));
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        for (const [hx, hy] of Object.values(cropHandles(doc, r))) {
          ctx.fillRect(hx - HANDLE / 2 - 1, hy - HANDLE / 2 - 1, HANDLE + 2, HANDLE + 2);
          ctx.strokeRect(hx - HANDLE / 2 - 1.5, hy - HANDLE / 2 - 1.5, HANDLE + 3, HANDLE + 3);
        }
        // Dimensions du futur cadre.
        const label = `${r.w} × ${r.h} px`;
        ctx.font = '12px "Segoe UI", system-ui, sans-serif';
        const tw = ctx.measureText(label).width + 14;
        ctx.fillStyle = 'rgba(20,20,28,0.85)';
        ctx.fillRect(a.sx, a.sy + h + 8, tw, 22);
        ctx.fillStyle = '#fff';
        ctx.fillText(label, a.sx + 7, a.sy + h + 23);
        ctx.restore();
      },
    },
    paintTool('brush', 'Pinceau', 'b', false),
    paintTool('eraser', 'Gomme', 'e', true),
    paintTool('clone', 'Tampon de duplication', 's', false, true),
    {
      id: 'fill', name: 'Pot de peinture', key: 'g', icon: ICONS.fill, cursor: 'crosshair',
      hint: 'Clique pour remplir une zone de couleur proche avec la couleur principale (dans la sélection s\'il y en a une).',
      options: [
        { key: 'tolerance', label: 'Tolérance', type: 'range', min: 0, max: 100, value: 15, unit: '%' },
        { key: 'opacity', label: 'Opacité', type: 'range', min: 1, max: 100, value: 100, unit: '%' },
        { key: 'contiguous', label: 'Zone continue seulement', type: 'checkbox', value: true },
      ],
      down(doc, p) {
        const layer = activeLayer(doc);
        if (!layer) return notify('Ajoute d\'abord un calque.', 'warning');
        if (p.x < 0 || p.y < 0 || p.x >= doc.width || p.y >= doc.height) return;
        change(doc, 'Pot de peinture', () => floodFill(doc, layer, p));
      },
    },
    {
      id: 'eyedropper', name: 'Pipette', key: 'i', icon: ICONS.eyedropper, cursor: 'crosshair',
      hint: 'Clique pour prendre la couleur de l\'image comme couleur principale (Alt + clic : couleur secondaire).',
      options: [],
      down(doc, p, e) { this.pick(doc, p, e); },
      move(doc, p, e) { this.pick(doc, p, e); },
      pick(doc, p, e) {
        const x = Math.floor(p.x), y = Math.floor(p.y);
        if (x < 0 || y < 0 || x >= doc.width || y >= doc.height) return;
        const [r, g, b, a] = composite(doc).getContext('2d').getImageData(x, y, 1, 1).data;
        if (a === 0) return;
        App.setColor(e.altKey && Tools.current.id === 'eyedropper' ? 'secondary' : 'primary', rgbToHex(r, g, b));
      },
    },
    {
      id: 'text', name: 'Texte', key: 't', icon: ICONS.text, cursor: 'text',
      hint: 'Clique dans l\'image pour écrire. Clique sur un texte existant pour le modifier.',
      options: [],
      down(doc, p) {
        const active = activeLayer(doc);
        const target = active?.text && inside({ x: active.x, y: active.y, w: active.canvas.width, h: active.canvas.height }, p) ? active : textLayerAt(doc, p);
        if (target) doc.activeId = target.id;
        editText(doc, target, p);
      },
    },
    {
      id: 'hand', name: 'Main', key: 'h', icon: ICONS.hand, cursor: 'grab',
      hint: 'Glisse pour déplacer la vue. Astuce : la barre d\'espace maintenue ou le clic molette font pareil avec n\'importe quel outil.',
      options: [],
    },
    {
      id: 'zoom', name: 'Zoom', key: 'z', icon: ICONS.zoom, cursor: 'zoom-in',
      hint: 'Clique pour zoomer, Alt + clic pour dézoomer. La molette zoome aussi. Ctrl+0 : ajuster, Ctrl+1 : 100 %.',
      options: [],
      down(doc, p, e) { View.setZoom(doc, doc.view.zoom * (e.altKey ? 1 / 1.5 : 1.5), p); },
    },
  ];

  for (const tool of list) {
    settings[tool.id] = {};
    for (const o of tool.options) if (o.type !== 'button') settings[tool.id][o.key] = saved[tool.id]?.[o.key] ?? o.value;
  }
  const byId = Object.fromEntries(list.map((t) => [t.id, t]));

  const api = {
    list, byId, settings, value, save, applyCrop, renderText, editText, makeStamp, inside,
    // Ajoute un outil (défini dans un autre fichier), juste après l'outil « after ».
    register(tool, after) {
      const index = after ? list.findIndex((t) => t.id === after) + 1 : list.length;
      list.splice(index, 0, tool);
      byId[tool.id] = tool;
      settings[tool.id] = {};
      for (const o of tool.options) if (o.type !== 'button') settings[tool.id][o.key] = saved[tool.id]?.[o.key] ?? o.value;
    },
    current: byId.brush,
    strokeAppearance,
    select(id) {
      const tool = byId[id];
      if (!tool) return;
      const doc = App.doc();
      if (api.current !== tool) {
        api.current.deactivate?.(doc);
        api.current = tool;
        tool.activate?.(doc);
      }
      App.refreshTool();
      View.request();
    },
  };
  return api;
})();
