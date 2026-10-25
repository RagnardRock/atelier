// Petites fonctions utilisées partout dans l'interface de Tafl.

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

// el('button', { className: 'tool', title: '…', onclick }, [enfants]) : crée un élément en une ligne.
function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node[k] = v;
  }
  for (const c of [].concat(children)) if (c != null) node.append(c);
  return node;
}
const icon = (name) => el('i', { className: `codicon codicon-${name}` });

// --- Couleurs ---
// Dans une tuile, un pixel est 4 octets (rouge, vert, bleu, opacité). Pour comparer deux pixels
// d'un coup (pot de peinture, pipette), on les range dans un seul nombre : 0 = transparent.
function hexToRgba(hex) {
  if (!hex) return [0, 0, 0, 0];
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h.slice(0, 6), 16);
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) : 255;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
}
const toHex2 = (v) => v.toString(16).padStart(2, '0');
function rgbaToHex(r, g, b, a = 255) {
  if (a === 0) return null; // transparent
  return `#${toHex2(r)}${toHex2(g)}${toHex2(b)}${a < 255 ? toHex2(a) : ''}`;
}
function packRgba(r, g, b, a) {
  return a === 0 ? 0 : ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;
}
const packHex = (hex) => packRgba(...hexToRgba(hex));
function unpack(v) {
  return [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
}
const normalizeHex = (value) => {
  const m = String(value || '').trim().match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/i);
  return m ? `#${m[1].length === 3 ? m[1].replace(/./g, '$&$&') : m[1]}`.toLowerCase() : null;
};

// Damier qui montre la transparence, dessiné dans un canvas.
function drawChecker(ctx, x, y, w, h, cell = 8) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = '#2e2e34';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#3a3a42';
  for (let j = 0; j * cell < h; j++) {
    for (let i = (j % 2); i * cell < w; i += 2) ctx.fillRect(x + i * cell, y + j * cell, cell, cell);
  }
  ctx.restore();
}

// --- Menus déroulants et menus du clic droit ---
// items : [{ label, keys, run, disabled, checked }] ; null = séparateur.
const Menus = (() => {
  let current = null;
  // Tafl 0.30 : un élément peut ouvrir un sous-menu (submenu : la liste, ou une fonction qui la rend),
  // affiché à droite au survol. C'est ainsi que le bouton ☰ range Fichier, Édition, Tuile…
  function fermerSous() {
    current?.sous?.el.remove();
    current?.sous?.item?.classList.remove('open');
    if (current) current.sous = null;
  }
  function close() {
    fermerSous();
    current?.el.remove();
    current?.button?.classList.remove('open');
    current = null;
  }
  function remplir(menu, items, sous = false) {
    for (const item of items) {
      if (!item) { menu.append(el('div', { className: 'menu-sep' })); continue; }
      const b = el('button', { className: `menu-item${item.className ? ` ${item.className}` : ''}${item.submenu ? ' has-submenu' : ''}`, disabled: Boolean(item.disabled), title: item.title || '' }, [
        el('span', { className: 'menu-check' }, item.checked ? [icon('check')] : item.icon ? [icon(item.icon)] : []),
        el('span', { className: 'menu-label', textContent: item.label }),
        item.keys ? el('span', { className: 'menu-keys', textContent: item.keys }) : null,
        item.submenu ? el('span', { className: 'menu-arrow' }, [icon('chevron-right')]) : null,
      ]);
      if (item.submenu) {
        const ouvrir = () => {
          if (current?.sous?.item === b) return;
          fermerSous();
          const liste = typeof item.submenu === 'function' ? item.submenu() : item.submenu;
          const m = el('div', { className: 'menu submenu' });
          remplir(m, liste, true);
          document.body.append(m);
          const r = b.getBoundingClientRect(), rm = m.getBoundingClientRect();
          const x = r.right + 4 + rm.width > innerWidth - 8 ? r.left - rm.width - 4 : r.right + 4;
          m.style.left = `${Math.max(8, x)}px`;
          m.style.top = `${Math.max(8, Math.min(r.top - 6, innerHeight - rm.height - 8))}px`;
          b.classList.add('open');
          current.sous = { el: m, item: b };
        };
        b.onmouseenter = ouvrir;
        b.onclick = ouvrir;
      } else {
        if (!sous) b.onmouseenter = fermerSous;
        b.onclick = () => { close(); item.run(); };
      }
      menu.append(b);
    }
  }
  function open(items, x, y, button = null, className = '') {
    close();
    const menu = el('div', { className: `menu${className ? ` ${className}` : ''}` });
    current = { el: menu, button, sous: null };
    remplir(menu, items);
    document.body.append(menu);
    // Le menu reste dans la fenêtre, même ouvert près du bord.
    const r = menu.getBoundingClientRect();
    menu.style.left = `${Math.min(x, innerWidth - r.width - 8)}px`;
    menu.style.top = `${Math.min(y, innerHeight - r.height - 8)}px`;
    button?.classList.add('open');
  }
  const dedans = (t) => current && (current.el.contains(t) || current.sous?.el.contains(t));
  window.addEventListener('pointerdown', (e) => { if (current && !dedans(e.target) && e.target !== current.button && !current.button?.contains(e.target)) close(); }, true);
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  window.addEventListener('blur', close);
  return { open, close, isOpen: () => Boolean(current) };
})();
