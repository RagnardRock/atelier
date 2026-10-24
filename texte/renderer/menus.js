// Menus déroulants (barre de titre, clic droit, palettes de couleurs), avec le style de verre d'Edda.
//
// Menus.ouvrir(x, y, elements) : chaque élément est
//   { label, keys, icone, run, coche, desactive } (une commande),
//   null (un trait), 'Texte' (un petit titre), ou { element } (un contenu libre : palette, grille…).
// Le menu se ferme au clic ailleurs, à Échap, ou après une commande.

const Menus = (() => {
  let ouvert = null;

  function fermer() {
    if (!ouvert) return;
    ouvert.menu.remove();
    ouvert.bouton?.classList.remove('open');
    ouvert = null;
  }

  function ouvrir(x, y, elements, { bouton = null, largeurMin } = {}) {
    fermer();
    const menu = el('div', { className: 'menu' });
    if (largeurMin) menu.style.minWidth = `${largeurMin}px`;
    for (const e of elements) {
      if (e === null) { menu.append(el('div', { className: 'menu-sep' })); continue; }
      if (typeof e === 'string') { menu.append(el('div', { className: 'menu-titre', textContent: e })); continue; }
      if (e.element) { menu.append(e.element); continue; }
      const item = el('button', { className: `menu-item${e.coche ? ' coche' : ''}${e.desactive ? ' desactive' : ''}` });
      item.append(el('i', { className: `codicon ${e.icone ? `codicon-${e.icone}` : ''}` }), el('span', { className: 'menu-label', textContent: e.label }));
      if (e.keys) item.append(el('span', { className: 'menu-keys', textContent: e.keys }));
      // mousedown + preventDefault : le clic ne retire pas la sélection du texte de la page.
      item.addEventListener('mousedown', (ev) => ev.preventDefault());
      item.onclick = () => { fermer(); e.run?.(); };
      menu.append(item);
    }
    menu.addEventListener('mousedown', (ev) => { if (!['INPUT', 'SELECT'].includes(ev.target.tagName)) ev.preventDefault(); });
    document.body.append(menu);
    // Le menu reste dans la fenêtre.
    const r = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(4, Math.min(x, window.innerWidth - r.width - 6))}px`;
    menu.style.top = `${Math.max(4, Math.min(y, window.innerHeight - r.height - 6))}px`;
    ouvert = { menu, bouton };
    bouton?.classList.add('open');
    return menu;
  }

  // Sous un bouton (menus de la barre de titre, flèches des couleurs).
  function sous(bouton, elements, options) {
    if (ouvert?.bouton === bouton) { fermer(); return null; }
    const r = bouton.getBoundingClientRect();
    return ouvrir(r.left, r.bottom + 4, elements, { ...options, bouton });
  }

  document.addEventListener('mousedown', (e) => { if (ouvert && !ouvert.menu.contains(e.target) && e.target !== ouvert.bouton && !ouvert.bouton?.contains(e.target)) fermer(); }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ouvert) { e.preventDefault(); e.stopPropagation(); fermer(); } }, true);
  window.addEventListener('blur', fermer);
  window.addEventListener('resize', fermer);

  // Palette de couleurs : celles de Word (thème + nuances), « Automatique » et « Autre couleur… ».
  const COULEURS = [
    '000000', '434343', '666666', '999999', 'b7b7b7', 'cccccc', 'd9d9d9', 'efefef', 'f3f3f3', 'ffffff',
    '980000', 'ff0000', 'ff9900', 'ffff00', '00ff00', '00ffff', '4a86e8', '0000ff', '9900ff', 'ff00ff',
    'e6b8af', 'f4cccc', 'fce5cd', 'fff2cc', 'd9ead3', 'd0e0e3', 'c9daf8', 'cfe2f3', 'd9d2e9', 'ead1dc',
    'cc4125', 'e06666', 'f6b26b', 'ffd966', '93c47d', '76a5af', '6d9eeb', '6fa8dc', '8e7cc3', 'c27ba0',
    'a61c00', 'cc0000', 'e69138', 'f1c232', '6aa84f', '45818e', '3c78d8', '3d85c6', '674ea7', 'a64d79',
    '5b0f00', '660000', '783f04', '7f6000', '274e13', '0c343d', '1c4587', '073763', '20124d', '4c1130',
  ];
  function palette(bouton, { titre, aucune, choisir }) {
    const grille = el('div', { className: 'palette' });
    for (const c of COULEURS) {
      const b = el('button', { title: `#${c}`, style: `background:#${c}` });
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.onclick = () => { fermer(); choisir(c); };
      grille.append(b);
    }
    const autre = el('input', { type: 'color', value: '#2b6fd6', title: 'Autre couleur' });
    autre.onchange = () => { fermer(); choisir(autre.value.slice(1)); };
    const ligne = el('div', { className: 'palette-ligne' }, autre, el('span', { textContent: 'Autre couleur…' }));
    sous(bouton, [titre, { element: grille }, { element: ligne }, null, { label: aucune, icone: 'circle-slash', run: () => choisir(null) }]);
  }

  return { ouvrir, sous, fermer, palette, estOuvert: () => Boolean(ouvert) };
})();
