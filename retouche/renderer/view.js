// La zone de travail : affiche l'image (zoom, déplacement de la vue) et transmet la souris aux outils.
//
// L'écran est un seul <canvas> (#stage) de la taille de la zone. On y dessine, dans l'ordre :
// le damier (= transparence), la composition des calques, puis par-dessus la sélection,
// le cadre de recadrage et le cercle du pinceau.
// Chaque document garde son propre zoom (view.zoom) et sa position (view.x, view.y = où se trouve
// le coin haut-gauche de l'image dans la zone, en pixels d'écran).

const View = (() => {
  const stage = $('#stage');
  const ctx = stage.getContext('2d');
  let dpr = window.devicePixelRatio || 1;
  let width = 0, height = 0;
  let pending = false, recompose = false;
  let pointer = null;          // dernière position de la souris { sx, sy, x, y }
  let drag = null;             // glisser en cours : { mode: 'tool' | 'pan', ... }
  let spaceDown = false;
  let antsOffset = 0;

  // Damier gris foncé : la transparence, discrète en mode sombre.
  const checker = (() => {
    const tile = newCanvas(16, 16);
    const t = tile.getContext('2d');
    t.fillStyle = '#2e2e34'; t.fillRect(0, 0, 16, 16);
    t.fillStyle = '#3a3a42'; t.fillRect(0, 0, 8, 8); t.fillRect(8, 8, 8, 8);
    return ctx.createPattern(tile, 'repeat');
  })();

  function resize() {
    dpr = window.devicePixelRatio || 1;
    width = stage.clientWidth;
    height = stage.clientHeight;
    stage.width = Math.round(width * dpr);
    stage.height = Math.round(height * dpr);
    const doc = App.doc();
    if (doc?.view?.fitted) fit(doc);
    request();
  }

  // Demande un nouvel affichage (au prochain rafraîchissement de l'écran, une seule fois).
  function request(withComposite = false) {
    recompose = recompose || withComposite;
    if (pending) return;
    pending = true;
    requestAnimationFrame(draw);
  }

  function fit(doc) {
    const margin = 48;
    const zoom = Math.min((width - margin * 2) / doc.width, (height - margin * 2) / doc.height, 1);
    setZoom(doc, Math.max(zoom, 0.01), null, true);
    doc.view.fitted = true;
  }
  function setZoom(doc, zoom, around = null, center = false) {
    zoom = Math.min(Math.max(zoom, 0.01), 64);
    const v = doc.view || (doc.view = { zoom: 1, x: 0, y: 0 });
    if (center) {
      v.x = Math.round((width - doc.width * zoom) / 2);
      v.y = Math.round((height - doc.height * zoom) / 2);
    } else {
      const ax = around ? around.sx : width / 2;
      const ay = around ? around.sy : height / 2;
      const px = (ax - v.x) / v.zoom, py = (ay - v.y) / v.zoom;
      v.x = ax - px * zoom;
      v.y = ay - py * zoom;
    }
    v.zoom = zoom;
    v.fitted = false;
    request();
    App.updateStatus();
  }
  // Paliers de zoom « ronds » pour Ctrl + / Ctrl −.
  const STEPS = [0.05, 0.0833, 0.125, 0.1667, 0.25, 0.3333, 0.5, 0.6667, 1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64];
  function zoomStep(doc, direction) {
    const current = doc.view.zoom;
    const next = direction > 0 ? STEPS.find((s) => s > current * 1.001) : [...STEPS].reverse().find((s) => s < current * 0.999);
    if (next) setZoom(doc, next);
  }

  const toDoc = (doc, sx, sy) => ({ x: (sx - doc.view.x) / doc.view.zoom, y: (sy - doc.view.y) / doc.view.zoom });
  const toScreen = (doc, x, y) => ({ sx: doc.view.x + x * doc.view.zoom, sy: doc.view.y + y * doc.view.zoom });

  function eventPoint(doc, e) {
    const r = stage.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    if (doc && !doc.view) fit(doc); // image tout juste ouverte, pas encore affichée
    return { sx, sy, ...(doc ? toDoc(doc, sx, sy) : { x: 0, y: 0 }) };
  }

  function draw() {
    pending = false;
    const doc = App.doc();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, stage.width, stage.height);
    if (!doc) return;
    if (!doc.view) fit(doc);
    if (recompose || !doc.comp) composite(doc);
    recompose = false;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { zoom, x, y } = doc.view;
    const w = doc.width * zoom, h = doc.height * zoom;

    // Ombre portée de la feuille, puis damier, puis l'image.
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 24;
    ctx.fillStyle = checker;
    ctx.translate(Math.round(x), Math.round(y));
    ctx.fillRect(0, 0, Math.round(w), Math.round(h));
    ctx.restore();
    ctx.imageSmoothingEnabled = zoom < 2; // gros zoom : pixels nets, comme Photoshop
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(doc.comp, Math.round(x), Math.round(y), Math.round(w), Math.round(h));

    // Grille des pixels à très fort zoom.
    if (zoom >= 12) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.strokeStyle = 'rgba(128,128,128,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const x0 = Math.max(0, Math.floor(-x / zoom)), x1 = Math.min(doc.width, Math.ceil((width - x) / zoom));
      const y0 = Math.max(0, Math.floor(-y / zoom)), y1 = Math.min(doc.height, Math.ceil((height - y) / zoom));
      for (let i = x0; i <= x1; i++) { ctx.moveTo(Math.round(x + i * zoom) + 0.5, y); ctx.lineTo(Math.round(x + i * zoom) + 0.5, y + h); }
      for (let j = y0; j <= y1; j++) { ctx.moveTo(x, Math.round(y + j * zoom) + 0.5); ctx.lineTo(x + w, Math.round(y + j * zoom) + 0.5); }
      ctx.stroke();
      ctx.restore();
    }

    // Contour du calque actif quand l'outil Déplacement est choisi.
    const layer = activeLayer(doc);
    if (layer && Tools.current.id === 'move' && !doc.float) {
      const a = toScreen(doc, layer.x, layer.y);
      ctx.strokeStyle = 'rgba(94, 200, 255, 0.55)';
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(Math.round(a.sx) + 0.5, Math.round(a.sy) + 0.5, Math.round(layer.canvas.width * zoom), Math.round(layer.canvas.height * zoom));
      ctx.setLineDash([]);
    }

    if (doc.selection) drawAnts(doc, doc.selection);
    Tools.current.overlay?.(ctx, doc, pointer);
  }

  // « Fourmis » de la sélection : pointillés noir et blanc qui défilent le long de son contour.
  function drawAnts(doc, sel) {
    const { zoom } = doc.view;
    const a = toScreen(doc, sel.x, sel.y);
    ctx.save();
    ctx.lineWidth = 1;
    const passes = [['#000', []], ['#fff', [5, 5]]];
    if (sel.rect) {
      const rect = [Math.round(a.sx) + 0.5, Math.round(a.sy) + 0.5, Math.round(sel.w * zoom), Math.round(sel.h * zoom)];
      for (const [color, dash] of passes) { ctx.strokeStyle = color; ctx.setLineDash(dash); ctx.lineDashOffset = -antsOffset; ctx.strokeRect(...rect); }
    } else {
      // Contour quelconque : on le trace à l'échelle du zoom, avec un trait d'un pixel d'écran.
      ctx.translate(Math.round(a.sx) + 0.5, Math.round(a.sy) + 0.5);
      ctx.scale(zoom, zoom);
      ctx.lineWidth = 1 / zoom;
      const path = Sel.outline(sel);
      for (const [color, dash] of passes) { ctx.strokeStyle = color; ctx.setLineDash(dash.map((d) => d / zoom)); ctx.lineDashOffset = -antsOffset / zoom; ctx.stroke(path); }
    }
    ctx.restore();
  }

  // Démarré par App.start, une fois que toute l'interface est chargée.
  function init() {
    new ResizeObserver(resize).observe(stage);
    setInterval(() => {
      if (!App.doc()?.selection) return;
      antsOffset = (antsOffset + 1) % 10;
      request();
    }, 90);
  }

  // --- Souris ---
  const panning = (e) => e.button === 1 || spaceDown || Tools.current.id === 'hand';

  stage.addEventListener('pointerdown', (e) => {
    const doc = App.doc();
    if (!doc || (e.button !== 0 && e.button !== 1)) return;
    stage.setPointerCapture(e.pointerId);
    const p = eventPoint(doc, e);
    pointer = p;
    if (panning(e)) {
      drag = { mode: 'pan', sx: p.sx, sy: p.sy, x: doc.view.x, y: doc.view.y };
      stage.classList.add('panning');
      return;
    }
    drag = { mode: 'tool' };
    Tools.current.down?.(doc, p, e);
  });
  stage.addEventListener('pointermove', (e) => {
    const doc = App.doc();
    if (!doc) return;
    const p = eventPoint(doc, e);
    pointer = p;
    if (drag?.mode === 'pan') {
      doc.view.x = drag.x + p.sx - drag.sx;
      doc.view.y = drag.y + p.sy - drag.sy;
      doc.view.fitted = false;
    } else if (drag?.mode === 'tool') {
      // Les mouvements rapides arrivent groupés : on les traite tous pour un trait bien lisse.
      const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of events.length ? events : [e]) Tools.current.move?.(doc, eventPoint(doc, ev), ev);
    } else {
      Tools.current.hover?.(doc, p, e);
    }
    App.updateStatus(p);
    request();
  });
  const end = (e) => {
    const doc = App.doc();
    if (!drag || !doc) return;
    const p = eventPoint(doc, e);
    if (drag.mode === 'tool') Tools.current.up?.(doc, p, e);
    drag = null;
    stage.classList.remove('panning');
    request(true);
  };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
  stage.addEventListener('pointerleave', () => { if (!drag) { pointer = null; request(); App.updateStatus(); } });
  stage.addEventListener('dblclick', (e) => {
    const doc = App.doc();
    if (doc) Tools.current.dblclick?.(doc, eventPoint(doc, e), e);
  });

  // Molette = zoom autour de la souris (Maj + molette = défiler sur le côté, Ctrl + molette = défiler en hauteur).
  stage.addEventListener('wheel', (e) => {
    const doc = App.doc();
    if (!doc) return;
    e.preventDefault();
    if (e.shiftKey || e.ctrlKey) {
      const delta = e.deltaY || e.deltaX;
      if (e.shiftKey) doc.view.x -= delta; else doc.view.y -= delta;
      doc.view.fitted = false;
      return request();
    }
    setZoom(doc, doc.view.zoom * Math.pow(1.0015, -e.deltaY), eventPoint(doc, e));
  }, { passive: false });

  // Barre d'espace maintenue = main temporaire (comme Photoshop).
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !e.repeat && !isTyping(e)) { spaceDown = true; stage.classList.add('space'); e.preventDefault(); }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') { spaceDown = false; stage.classList.remove('space'); }
  });

  return { init, request, fit, setZoom, zoomStep, toScreen, toDoc, get pointer() { return pointer; }, get size() { return { width, height }; }, get dragging() { return Boolean(drag); } };
})();

// Vrai si on est en train d'écrire dans un champ (les raccourcis ne doivent pas s'y déclencher).
const isTyping = (e) => {
  const el = e.target;
  if (!el) return false;
  if (el.tagName === 'INPUT') return !['range', 'checkbox', 'radio', 'color', 'button'].includes(el.type);
  return el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
};
