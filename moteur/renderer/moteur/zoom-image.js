// Saga 1.37.1 : zoomer dans une image (les documents du MJ), au PC comme au téléphone.
//
//   molette : zoomer vers le pointeur · double-clic / double-toucher : ×2,5 ou revenir
//   pincer à deux doigts : zoomer · glisser (zoomé) : se déplacer
//
// L'image reste dans son cadre (overflow caché) : on la déplace et l'agrandit par une transformation.
// Utilisé par table/documents.js (Saga, la page d'un ami, l'écran des joueurs) et par le compagnon.

const ZoomImage = (() => {
  function brancher(cadre, img, { max = 6 } = {}) {
    let z = 1, x = 0, y = 0;
    const pts = new Map();
    let pince = null, dernierToucher = 0, bouge = 0;
    cadre.classList.add('zoom-cadre');
    img.draggable = false;
    img.style.transformOrigin = '0 0';

    // Les bornes : plus petite que le cadre, l'image reste au centre ; plus grande, elle couvre le cadre.
    function borner() {
      const lc = cadre.clientWidth, hc = cadre.clientHeight;
      const ox = img.offsetLeft, oy = img.offsetTop;
      const w = img.offsetWidth * z, h = img.offsetHeight * z;
      x = w <= lc ? (lc - w) / 2 - ox : Math.min(-ox, Math.max(lc - w - ox, x));
      y = h <= hc ? (hc - h) / 2 - oy : Math.min(-oy, Math.max(hc - h - oy, y));
    }
    function appliquer() {
      if (z <= 1.001) { z = 1; x = 0; y = 0; } else borner();
      img.style.transform = z === 1 ? '' : `translate(${x}px, ${y}px) scale(${z})`;
      cadre.classList.toggle('zoome', z > 1);
    }
    // Zoomer vers un point du cadre (px, py) : ce point de l'image reste sous le doigt.
    function zoomer(nz, px, py) {
      nz = Math.max(1, Math.min(max, nz));
      const qx = (px - img.offsetLeft - x) / z, qy = (py - img.offsetTop - y) / z;
      x = px - img.offsetLeft - qx * nz;
      y = py - img.offsetTop - qy * nz;
      z = nz;
      appliquer();
    }
    const point = (e) => { const r = cadre.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

    cadre.addEventListener('wheel', (e) => {
      e.preventDefault();
      const p = point(e);
      zoomer(z * (e.deltaY < 0 ? 1.18 : 1 / 1.18), p.x, p.y);
    }, { passive: false });
    cadre.addEventListener('dblclick', (e) => { const p = point(e); zoomer(z > 1 ? 1 : 2.5, p.x, p.y); });
    cadre.addEventListener('pointerdown', (e) => {
      pts.set(e.pointerId, point(e));
      try { cadre.setPointerCapture?.(e.pointerId); } catch { /* un pointeur déjà parti */ }
      bouge = 0;
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pince = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z };
      }
    });
    cadre.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      const avant = pts.get(e.pointerId), p = point(e);
      pts.set(e.pointerId, p);
      bouge += Math.abs(p.x - avant.x) + Math.abs(p.y - avant.y);
      if (pts.size === 2 && pince) {
        const [a, b] = [...pts.values()];
        zoomer(pince.z * (Math.hypot(a.x - b.x, a.y - b.y) / pince.d), (a.x + b.x) / 2, (a.y + b.y) / 2);
      } else if (pts.size === 1 && z > 1) {
        x += p.x - avant.x; y += p.y - avant.y;
        appliquer();
      }
    });
    const lacher = (e) => {
      if (!pts.has(e.pointerId)) return;
      const p = pts.get(e.pointerId);
      pts.delete(e.pointerId);
      if (pts.size < 2) pince = null;
      // Un double toucher (le double-clic n'arrive pas toujours au doigt).
      if (e.pointerType === 'touch' && !pts.size && bouge < 12) {
        const t = performance.now();
        if (t - dernierToucher < 450) { zoomer(z > 1 ? 1 : 2.5, p.x, p.y); dernierToucher = 0; } else dernierToucher = t;
      }
    };
    cadre.addEventListener('pointerup', lacher);
    cadre.addEventListener('pointercancel', lacher);
    window.addEventListener('resize', () => appliquer());
    return { zoomer, get z() { return z; }, revenir: () => { z = 1; appliquer(); } };
  }
  return { brancher };
})();
if (typeof module !== 'undefined') module.exports = ZoomImage;
