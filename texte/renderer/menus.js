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
  // (Pas quand la fenêtre de couleur de Windows s'ouvre depuis le menu : on revient y choisir.)
  window.addEventListener('blur', () => { if (document.activeElement?.type !== 'color') fermer(); });
  window.addEventListener('resize', fermer);

  // Palette de couleurs : le sélecteur commun d'Edda (voir couleurs.js).
  const palette = (bouton, options) => Couleurs.ouvrir(bouton, options);

  return { ouvrir, sous, fermer, palette, estOuvert: () => Boolean(ouvert) };
})();
