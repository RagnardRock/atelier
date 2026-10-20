// Widget « Presse-papiers et couleurs ».
// - En haut, ta palette : des pastilles de couleur gardées entre Skald, Rune et le navigateur
//   (couleurs.json). Clic = copier en HEX ; clic droit = copier en RGB ou HSL, ou retirer.
//   La pipette prend une couleur n'importe où sur l'écran ; le bouton ⊕ en ajoute une au choix.
// - En dessous, l'historique de ce que tu as copié (texte seulement). Clic = le recopier.
//   Une couleur copiée (#e0a526, rgb(…), hsl(…)) s'affiche avec sa pastille et peut rejoindre la palette.

const PressePapiers = (() => {
  const liste = $('#presse-liste');
  const palette = $('#palette');
  let historique = [];
  let couleurs = [];

  // --- Couleurs ---
  // Le navigateur sait lire toutes les écritures CSS d'une couleur : on s'en sert pour reconnaître
  // une couleur et la convertir en #rrggbb.
  const ctx = document.createElement('canvas').getContext('2d');
  const RE_COULEUR = /^(#[0-9a-f]{3,4}|#[0-9a-f]{6}|#[0-9a-f]{8}|rgba?\([^)]*\)|hsla?\([^)]*\))$/i;
  function versHex(texte) {
    const t = texte.trim();
    if (!RE_COULEUR.test(t)) return null;
    ctx.fillStyle = '#000001';
    ctx.fillStyle = t;
    const v = ctx.fillStyle; // « #rrggbb » ou « rgba(r, g, b, a) » si transparente
    if (v === '#000001' && t.toLowerCase() !== '#000001') return null;
    if (v.startsWith('#')) return v;
    const [r, g, b] = v.match(/[\d.]+/g).map(Number);
    return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
  }
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  function hsl(hex) {
    const [r, g, b] = rgb(hex).map((n) => n / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
    let h = 0, s = 0;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h *= 60;
    }
    return `hsl(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
  }
  const formats = (hex) => ({ HEX: hex, RGB: `rgb(${rgb(hex).join(', ')})`, HSL: hsl(hex) });

  async function copier(texte, message) {
    await window.atelier.copier(texte);
    notify(message || 'Copié.', 'success', 1800);
  }

  const enregistrerCouleurs = () => window.atelier.ecrireDonnees('couleurs', couleurs).catch((err) => notify(cleanError(err), 'error'));
  function ajouterCouleur(hex) {
    if (couleurs.includes(hex)) return notify(`${hex} est déjà dans la palette.`, 'info', 2000);
    couleurs = [hex, ...couleurs].slice(0, 48);
    renderPalette();
    enregistrerCouleurs();
  }

  // Petit menu au clic droit sur une pastille.
  let menu = null;
  function fermerMenu() { menu?.remove(); menu = null; }
  function ouvrirMenu(x, y, items) {
    fermerMenu();
    menu = el('div', { className: 'menu' });
    for (const [label, run] of items) {
      const b = el('button', { className: 'menu-item', textContent: label });
      b.onclick = () => { fermerMenu(); run(); };
      menu.append(b);
    }
    document.body.append(menu);
    menu.style.left = `${Math.min(x, innerWidth - menu.offsetWidth - 8)}px`;
    menu.style.top = `${Math.min(y, innerHeight - menu.offsetHeight - 8)}px`;
  }
  document.addEventListener('pointerdown', (e) => { if (menu && !menu.contains(e.target)) fermerMenu(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fermerMenu(); });

  function renderPalette() {
    palette.replaceChildren(...couleurs.map((hex) => {
      const b = el('button', { className: 'pastille-couleur', title: `${hex} : clic pour copier, clic droit pour plus` });
      b.style.background = hex;
      b.onclick = () => copier(hex, `${hex} copié.`);
      b.oncontextmenu = (e) => {
        e.preventDefault();
        const f = formats(hex);
        ouvrirMenu(e.clientX, e.clientY, [
          ...Object.entries(f).map(([nom, v]) => [`Copier ${v}`, () => copier(v, `${v} copié.`)]),
          ['Retirer de la palette', () => { couleurs = couleurs.filter((c) => c !== hex); renderPalette(); enregistrerCouleurs(); }],
        ]);
      };
      return b;
    }));
    if (!couleurs.length) palette.append(el('span', { className: 'discret', textContent: 'Ta palette est vide : prends une couleur à la pipette, ou copie un code couleur.' }));
  }

  // --- Historique ---
  function renderHistorique() {
    liste.replaceChildren(...historique.map((h) => {
      const hex = versHex(h.texte);
      const supprimer = el('button', { className: 'icon-button', title: 'Retirer de l\'historique' }, el('i', { className: 'codicon codicon-close' }));
      supprimer.onclick = (e) => { e.stopPropagation(); window.atelier.supprimerDuPressePapiers(h.texte); };
      const actions = el('span', { className: 'presse-actions' });
      if (hex && !couleurs.includes(hex)) {
        const garder = el('button', { className: 'icon-button', title: 'Garder dans la palette' }, el('i', { className: 'codicon codicon-add' }));
        garder.onclick = (e) => { e.stopPropagation(); ajouterCouleur(hex); renderHistorique(); };
        actions.append(garder);
      }
      actions.append(supprimer);
      const apercu = el('span', { className: 'presse-texte', textContent: h.texte.length > 400 ? `${h.texte.slice(0, 400)}…` : h.texte });
      const li = el('li', { className: 'presse-item', title: 'Clic pour recopier' },
        hex ? el('span', { className: 'pastille-mini', style: `background:${hex}` }) : null,
        apercu,
        el('span', { className: 'discret presse-quand', textContent: dateRelative(h.quand) }),
        actions);
      li.onclick = () => copier(h.texte, 'Recopié dans le presse-papiers.');
      return li;
    }));
    if (!historique.length) liste.append(el('li', { className: 'vide', textContent: 'Ce que tu copies (Ctrl+C) apparaîtra ici.' }));
  }

  $('#couleur-ajout').addEventListener('change', (e) => ajouterCouleur(e.target.value));
  // La pipette du navigateur (EyeDropper) marche sous Windows et macOS.
  if ('EyeDropper' in window) {
    $('#btn-pipette').onclick = async () => {
      try {
        const { sRGBHex } = await new EyeDropper().open();
        const hex = versHex(sRGBHex) || sRGBHex;
        ajouterCouleur(hex);
        await copier(hex, `${hex} ajouté à la palette et copié.`);
      } catch { /* Échap : rien à faire */ }
    };
  } else {
    $('#btn-pipette').hidden = true;
  }
  $('#btn-vider-presse').onclick = async () => {
    if (!historique.length) return;
    const ok = await Dialogs.ask('Vider l\'historique', 'Effacer tout l\'historique du presse-papiers ? Ta palette de couleurs reste.', [
      { label: 'Annuler', value: false },
      { label: 'Vider', value: true, primary: true },
    ]);
    if (ok) window.atelier.viderPressePapiers();
  };
  window.atelier.onPressePapiers((h) => { historique = h; renderHistorique(); });
  setInterval(renderHistorique, 60_000); // « il y a 5 min » vieillit

  async function start() {
    couleurs = await window.atelier.lireDonnees('couleurs', []);
    historique = await window.atelier.historiquePressePapiers();
    renderPalette();
    renderHistorique();
  }

  return { start };
})();
