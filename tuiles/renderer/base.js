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
  // Tafl 1.32 : la liste à chercher (Choisir) compte comme un menu ouvert (Échap la ferme, elle seule).
  return { open, close, isOpen: () => Boolean(current) || Choisir.isOpen() };
})();

// --- Choisir dans une longue liste (Tafl 1.32) ---
// Une petite fenêtre flottante avec une case de recherche, des groupes titrés et, en haut, les
// derniers choisis. Sert à « + Ajouter une commande » et « + Condition » : on tape quelques
// lettres (« dorm », « bâtiment »…), les flèches choisissent, Entrée valide, Échap ferme.
// items : [{ label, value, icon, groupe, couleur, mots (mots de plus pour la recherche) }].
// options : { titre, recents (clé : les derniers choix sont retenus sous ce nom), max (5) }.
// Rend la valeur choisie, ou null si on ferme sans choisir.
const Choisir = (() => {
  let courant = null; // { fermer(valeur) }
  // « Bâtiment » se trouve en tapant « batiment » : on compare sans accents ni majuscules.
  const plat = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const CLE = (nom) => `tafl.recents.${nom}`;
  function lireRecents(nom) {
    try { const l = JSON.parse(localStorage.getItem(CLE(nom)) || '[]'); return Array.isArray(l) ? l.filter((v) => typeof v === 'string') : []; } catch { return []; }
  }
  function retenir(nom, valeur) {
    try { localStorage.setItem(CLE(nom), JSON.stringify([valeur, ...lireRecents(nom).filter((v) => v !== valeur)].slice(0, 12))); } catch { /* sans stockage, pas de récents */ }
  }

  function ouvrir(items, x, y, options = {}) {
    courant?.fermer(null);
    return new Promise((resolve) => {
      const tous = items.filter(Boolean).map((it) => ({ ...it, cle: plat(`${it.label} ${it.groupe || ''} ${it.value} ${it.mots || ''}`.replace(/_/g, ' ')) }));
      const recents = options.recents ? lireRecents(options.recents).map((v) => tous.find((it) => it.value === v)).filter(Boolean).slice(0, options.max ?? 5) : [];
      const boite = el('div', { className: 'choisir' });
      const champ = el('input', { type: 'search', className: 'choisir-champ', placeholder: `${options.titre || 'Chercher'} (${tous.length})…`, spellcheck: false });
      const liste = el('div', { className: 'choisir-liste' });
      const vide = el('div', { className: 'choisir-vide', textContent: 'Rien ne correspond.' });
      boite.append(champ, liste);
      let lignes = []; // [{ item, node }] dans l'ordre affiché
      let actif = 0;

      function marquer(i, defiler = true) {
        if (!lignes.length) return;
        actif = (i + lignes.length) % lignes.length;
        lignes.forEach((l, j) => l.node.classList.toggle('actif', j === actif));
        if (defiler) lignes[actif].node.scrollIntoView({ block: 'nearest' });
      }
      function ligne(it) {
        const node = el('button', { type: 'button', className: 'choisir-item', title: it.label, style: { '--bloc': it.couleur || 'var(--muted)' } }, [
          it.icon ? icon(it.icon) : el('span', { className: 'choisir-puce' }),
          el('span', { className: 'choisir-label', textContent: it.label }),
        ]);
        const n = lignes.length;
        node.onmouseenter = () => marquer(n, false);
        node.onmousedown = (e) => e.preventDefault(); // la case de recherche garde le clavier
        node.onclick = () => fermer(it.value);
        lignes.push({ item: it, node });
        return node;
      }
      function titreGroupe(nom, couleur) {
        return el('div', { className: 'choisir-groupe', textContent: nom, style: { color: couleur || '' } });
      }
      function remplir() {
        const mots = plat(champ.value).split(/\s+/).filter(Boolean);
        lignes = [];
        liste.replaceChildren();
        if (!mots.length && recents.length) {
          liste.append(titreGroupe('Derniers choisis'));
          for (const it of recents) liste.append(ligne(it));
        }
        const trouves = tous.filter((it) => mots.every((m) => it.cle.includes(m)));
        // Les groupes dans l'ordre de leur première apparition (une commande ajoutée plus loin
        // dans la liste rejoint quand même son groupe).
        const groupes = new Map();
        for (const it of trouves) {
          const g = it.groupe || '';
          if (!groupes.has(g)) groupes.set(g, []);
          groupes.get(g).push(it);
        }
        for (const [g, l] of groupes) {
          if (g) liste.append(titreGroupe(g, l[0].couleur));
          for (const it of l) liste.append(ligne(it));
        }
        if (!trouves.length) liste.append(vide);
        // Avec une recherche, la première trouvée est prête (Entrée) ; sans, le premier récent.
        marquer(mots.length && recents.length ? lignes.findIndex((l) => trouves.includes(l.item)) : 0);
        liste.scrollTop = 0;
      }

      function fermer(valeur) {
        if (courant !== moi) return;
        courant = null;
        boite.remove();
        window.removeEventListener('pointerdown', dehors, true);
        window.removeEventListener('blur', surFlou);
        if (valeur != null && options.recents) retenir(options.recents, valeur);
        resolve(valeur ?? null);
      }
      const moi = { fermer };
      const dehors = (e) => { if (!boite.contains(e.target)) fermer(null); };
      const surFlou = () => fermer(null);
      champ.addEventListener('input', remplir);
      champ.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); marquer(actif + 1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); marquer(actif - 1); }
        else if (e.key === 'PageDown') { e.preventDefault(); marquer(Math.min(lignes.length - 1, actif + 8)); }
        else if (e.key === 'PageUp') { e.preventDefault(); marquer(Math.max(0, actif - 8)); }
        else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (lignes[actif]) fermer(lignes[actif].item.value); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fermer(null); }
        else if (e.key === 'Tab') e.preventDefault();
      });

      courant = moi;
      Menus.close();
      document.body.append(boite);
      remplir();
      // Elle reste dans la fenêtre, même ouverte près du bord (en bas : elle monte au-dessus).
      const r = boite.getBoundingClientRect();
      boite.style.left = `${Math.max(8, Math.min(x, innerWidth - r.width - 8))}px`;
      boite.style.top = `${Math.max(8, y + r.height > innerHeight - 8 ? Math.max(8, innerHeight - r.height - 8) : y)}px`;
      champ.focus();
      // Le clic qui l'a ouverte ne la referme pas.
      setTimeout(() => { if (courant === moi) { window.addEventListener('pointerdown', dehors, true); window.addEventListener('blur', surFlou); } });
    });
  }

  return { ouvrir, isOpen: () => Boolean(courant), close: () => courant?.fermer(null) };
})();
