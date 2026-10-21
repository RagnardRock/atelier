// Tafl 0.14 : la disposition du panneau de droite, pour qu'il reste lisible sur un grand écran.
// - La largeur se règle en glissant le bord gauche du panneau (double-clic : largeur par défaut).
// - Large, il passe sur deux colonnes : à gauche cartes, calques, événements ; à droite tampons et tuiles.
// - Un clic sur le titre d'un panneau le replie ; la poignée en bas d'un panneau change sa hauteur.
// - Taille des panneaux (texte, boutons) et taille des vignettes : dans les réglages,
//   ou Ctrl+molette sur le panneau (sur les tuiles et les tampons : les vignettes).
// Largeur, panneaux repliés et hauteurs sont gardés dans le localStorage (une affaire d'écran,
// pas de jeu) ; les tailles et le nombre de colonnes, dans les réglages de Tafl.
const Disposition = (() => {
  const MEMOIRE = 'tafl.disposition';
  const side = $('#sidepanel');
  const resizer = $('#side-resizer');
  // Les panneaux dont on peut régler la hauteur. Les tuiles, elles, prennent la place qui reste.
  const REGLABLES = ['maps-panel', 'layers-panel', 'stamps-panel', 'events-panel', 'color-panel'];
  const VIGNETTE = { min: 28, max: 128, defaut: 44 };
  const ZOOM = { min: 80, max: 160, defaut: 100 };
  const SEUIL_DEUX_COLONNES = 540; // largeur (px, avant zoom) à partir de laquelle « Automatique » passe sur deux colonnes

  let etat = { largeur: 0, plies: [], hauteurs: {} };
  try { etat = { ...etat, ...JSON.parse(localStorage.getItem(MEMOIRE) || '{}') }; } catch { /* sans mémoire, tant pis */ }
  const garder = () => { try { localStorage.setItem(MEMOIRE, JSON.stringify(etat)); } catch { /* sans mémoire, tant pis */ } };

  let reglages = { panelZoom: ZOOM.defaut, vignette: VIGNETTE.defaut, colonnes: 'auto' };
  const zoom = () => reglages.panelZoom / 100;
  const borne = (v, b) => Math.min(b.max, Math.max(b.min, Math.round(Number(v) || b.defaut)));

  // Sur un très grand écran, le panneau démarre assez large pour deux colonnes.
  const largeurDefaut = () => (window.innerWidth >= 1800 ? 560 : 320);
  const largeurMax = () => Math.max(260, window.innerWidth - 420);
  function appliquerLargeur() {
    const px = Math.min(largeurMax(), Math.max(240, etat.largeur || largeurDefaut())); // px à l'écran
    side.style.width = `${Math.round(px / zoom())}px`;
    colonnes();
  }
  function colonnes() {
    const large = side.getBoundingClientRect().width / zoom() >= SEUIL_DEUX_COLONNES;
    side.classList.toggle('deux-colonnes', reglages.colonnes === '2' || (reglages.colonnes === 'auto' && large));
  }

  // --- Largeur : glisser la séparation entre la carte et le panneau ---
  resizer.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    resizer.setPointerCapture(e.pointerId);
    resizer.classList.add('dragging');
    document.body.classList.add('resizing', 'resizing-col');
    const x0 = e.clientX;
    const w0 = side.getBoundingClientRect().width;
    const move = (ev) => {
      etat.largeur = Math.min(largeurMax(), Math.max(240, w0 + x0 - ev.clientX));
      appliquerLargeur();
    };
    const fin = () => {
      resizer.removeEventListener('pointermove', move);
      resizer.classList.remove('dragging');
      document.body.classList.remove('resizing', 'resizing-col');
      garder();
    };
    resizer.addEventListener('pointermove', move);
    resizer.addEventListener('pointerup', fin, { once: true });
    resizer.addEventListener('pointercancel', fin, { once: true });
  });
  resizer.ondblclick = () => { etat.largeur = 0; appliquerLargeur(); garder(); };
  window.addEventListener('resize', appliquerLargeur);

  // --- Replier un panneau : clic sur son en-tête (pas sur ses boutons) ---
  function appliquerPlis() {
    for (const p of $$('#sidepanel .panel')) p.classList.toggle('folded', etat.plies.includes(p.id));
  }
  function plier(id, plie = !etat.plies.includes(id)) {
    etat.plies = etat.plies.filter((x) => x !== id);
    if (plie) etat.plies.push(id);
    appliquerPlis();
    garder();
  }
  for (const p of $$('#sidepanel .panel')) {
    const head = p.querySelector('.panel-header');
    head.prepend(el('i', { className: 'codicon codicon-chevron-down panel-fold' }));
    head.title = 'Clic : replier ou déplier le panneau';
    head.addEventListener('click', (e) => { if (!e.target.closest('.panel-actions')) plier(p.id); });
  }

  // --- Hauteur d'un panneau : la poignée en bas (double-clic : hauteur automatique) ---
  function appliquerHauteurs() {
    for (const id of REGLABLES) {
      const p = document.getElementById(id);
      const h = etat.hauteurs[id];
      p.classList.toggle('sized', Boolean(h));
      p.style.flex = h ? `0 1 ${h}px` : '';
    }
  }
  for (const id of REGLABLES) {
    const p = document.getElementById(id);
    const grip = el('div', { className: 'panel-grip', title: 'Glisser : hauteur du panneau · double-clic : hauteur automatique' });
    p.append(grip);
    grip.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      grip.setPointerCapture(e.pointerId);
      grip.classList.add('dragging');
      document.body.classList.add('resizing', 'resizing-row');
      const y0 = e.clientY;
      const h0 = p.getBoundingClientRect().height;
      const move = (ev) => {
        etat.hauteurs[id] = Math.max(70, Math.round((h0 + ev.clientY - y0) / zoom()));
        appliquerHauteurs();
      };
      const fin = () => {
        grip.removeEventListener('pointermove', move);
        grip.classList.remove('dragging');
        document.body.classList.remove('resizing', 'resizing-row');
        garder();
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', fin, { once: true });
      grip.addEventListener('pointercancel', fin, { once: true });
    });
    grip.ondblclick = () => { delete etat.hauteurs[id]; appliquerHauteurs(); garder(); };
  }

  // --- Taille des panneaux et des vignettes ---
  function appliquerTailles() {
    side.style.zoom = zoom();
    side.style.setProperty('--vignette', `${reglages.vignette}px`);
    appliquerLargeur();
  }
  // Ctrl+molette : sur les tuiles ou les tampons, la taille des vignettes ; ailleurs dans le
  // panneau, la taille du texte et des boutons. Enregistré dans les réglages après un instant.
  let aEcrire = null;
  function enregistrer(changes) {
    Object.assign(reglages, changes);
    appliquerTailles();
    if (changes.vignette !== undefined) Panels.renderStamps();
    clearTimeout(aEcrire);
    aEcrire = setTimeout(async () => { App.config = await window.tafl.writeConfig(changes.vignette !== undefined ? { vignette: reglages.vignette } : { panelZoom: reglages.panelZoom }); }, 400);
  }
  side.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const sens = e.deltaY < 0 ? 1 : -1;
    if (e.target.closest('#tiles, #stamps')) enregistrer({ vignette: borne(reglages.vignette + sens * 4, VIGNETTE) });
    else enregistrer({ panelZoom: borne(reglages.panelZoom + sens * 10, ZOOM) });
  }, { passive: false });

  // Appelé au démarrage et après les réglages.
  function appliquer(config) {
    reglages = {
      panelZoom: borne(config.panelZoom, ZOOM),
      vignette: borne(config.vignette, VIGNETTE),
      colonnes: ['1', '2'].includes(config.colonnes) ? config.colonnes : 'auto',
    };
    appliquerTailles();
  }
  // Affichage › Disposition des panneaux par défaut.
  function reinitialiser() {
    etat = { largeur: 0, plies: [], hauteurs: {} };
    garder();
    appliquerPlis();
    appliquerHauteurs();
    appliquerLargeur();
  }

  // Le panneau peut aussi changer de taille sans nous (fenêtre, jeu ouvert ou fermé).
  new ResizeObserver(colonnes).observe(side);
  appliquerPlis();
  appliquerHauteurs();
  appliquerLargeur();

  return { appliquer, reinitialiser, plier, vignette: () => reglages.vignette, ZOOM, VIGNETTE };
})();
