// Les couleurs d'Edda : le sélecteur de couleur (le même partout : ruban, fenêtre des styles, fond
// d'une case), ses palettes toutes faites et celles de l'utilisateur, et l'adaptation automatique du
// noir et du blanc quand la page passe en sombre (ou en claire).
//
// Palettes de l'utilisateur : config.palettes = [{ id, nom, couleurs: ['rrggbb', …] }], la palette
// montrée en dernier : config.paletteActive (« classique », « pastel »… ou « perso:<id> »), les
// couleurs choisies récemment : config.couleursRecentes. Edda les donne avec Couleurs.configurer.
//
// Adaptation (Couleurs.adapter) : une couleur trop proche du fond de la page (du noir sur la page
// sombre, du blanc sur la page blanche) est montrée avec la luminosité inversée (le bleu nuit devient
// bleu clair, le noir devient blanc). Seulement à l'écran : le fichier garde la vraie couleur, comme
// le mode sombre de Word. Une couleur déjà lisible ne bouge pas.

const Couleurs = (() => {
  const PALETTES = [
    { id: 'classique', nom: 'Classique (comme Word)', couleurs: [
      '000000', '434343', '666666', '999999', 'b7b7b7', 'cccccc', 'd9d9d9', 'efefef', 'f3f3f3', 'ffffff',
      '980000', 'ff0000', 'ff9900', 'ffff00', '00ff00', '00ffff', '4a86e8', '0000ff', '9900ff', 'ff00ff',
      'e6b8af', 'f4cccc', 'fce5cd', 'fff2cc', 'd9ead3', 'd0e0e3', 'c9daf8', 'cfe2f3', 'd9d2e9', 'ead1dc',
      'cc4125', 'e06666', 'f6b26b', 'ffd966', '93c47d', '76a5af', '6d9eeb', '6fa8dc', '8e7cc3', 'c27ba0',
      'a61c00', 'cc0000', 'e69138', 'f1c232', '6aa84f', '45818e', '3c78d8', '3d85c6', '674ea7', 'a64d79',
      '5b0f00', '660000', '783f04', '7f6000', '274e13', '0c343d', '1c4587', '073763', '20124d', '4c1130'] },
    { id: 'bureau', nom: 'Bureau (titres, sobre)', couleurs: [
      '1a1a1a', '404040', '595959', '7f7f7f', 'a6a6a6', '1f3864', '2f5496', '4472c4', '8eaadb', 'd9e2f3',
      '833c0b', 'c55a11', 'ed7d31', 'f4b183', 'fbe5d6', '375623', '548235', '70ad47', 'a9d18e', 'e2efd9',
      '7f6000', 'bf8f00', 'ffc000', 'ffd966', 'fff2cc', '1f4e79', '2e75b6', '5b9bd5', '9dc3e6', 'deebf7'] },
    { id: 'pastel', nom: 'Pastel', couleurs: [
      'ffd1dc', 'ffb3c6', 'fbc4ab', 'ffdab9', 'fff1a8', 'fdfd96', 'd4f0c0', 'b5ead7', 'c7ceea', 'e2c2ff',
      'f7a8b8', 'f4978e', 'f8ad9d', 'ffcf9f', 'ffe5a0', 'cce6a0', '9fd8cb', 'a0c4ff', 'bdb2ff', 'ffc6ff'] },
    { id: 'vives', nom: 'Vives', couleurs: [
      'e6194b', 'f58231', 'ffe119', 'bfef45', '3cb44b', '42d4f4', '4363d8', '911eb4', 'f032e6', 'a9a9a9',
      'ff1744', 'ff9100', 'ffea00', '76ff03', '00e676', '1de9b6', '00b0ff', '2979ff', 'd500f9', 'ff4081'] },
    { id: 'terre', nom: 'Terre et bois', couleurs: [
      '3e2723', '5d4037', '795548', '8d6e63', 'a1887f', 'bcaaa4', 'd7ccc8', 'efebe9', '6b4f2a', '8b5a2b',
      'a0522d', 'b5651d', 'cd853f', 'deb887', '556b2f', '6b8e23', '808000', 'bdb76b', '8f9779', 'c2b280'] },
    { id: 'fjord', nom: 'Fjord (nordique)', couleurs: [
      '2e3440', '3b4252', '434c5e', '4c566a', 'd8dee9', 'e5e9f0', 'eceff4', '8fbcbb', '88c0d0', '81a1c1',
      '5e81ac', 'bf616a', 'd08770', 'ebcb8b', 'a3be8c', 'b48ead', '1b3a4b', '3f6e73', '9ab8c2', 'c9d6df'] },
    { id: 'atelier', nom: 'Atelier', couleurs: [
      '7cc4ff', 'b18cff', 'ff7aa8', 'ff7a3d', 'e0a526', '4ade80', 'f5f5f5', '1d1e25', '2b6fd6', '34d399',
      'ffb454', 'ff5d73', 'c084fc', '38bdf8', 'fbbf24', 'a3e635', 'f472b6', '94a3b8', '0f172a', 'e4e4e8'] },
  ];
  const MAX_RECENTES = 10;

  let lireConfig = () => ({});
  let ecrireConfig = async () => {};
  function configurer({ lire, ecrire }) { lireConfig = lire; ecrireConfig = ecrire; }
  const mesPalettes = () => (Array.isArray(lireConfig().palettes) ? lireConfig().palettes : []);

  // --- Calculs ---
  const propre = (c) => {
    if (!c) return null;
    const s = String(c).trim().toLowerCase();
    let m = s.match(/^#?([0-9a-f]{6})$/);
    if (m) return m[1];
    m = s.match(/^#?([0-9a-f])([0-9a-f])([0-9a-f])$/);
    if (m) return m[1] + m[1] + m[2] + m[2] + m[3] + m[3];
    m = s.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+%?))?\s*\)$/);
    if (m) {
      if (m[4] !== undefined && (m[4] === '0' || Number(m[4]) === 0)) return null; // transparent
      return [m[1], m[2], m[3]].map((x) => Math.min(255, Number(x)).toString(16).padStart(2, '0')).join('');
    }
    const noms = { black: '000000', white: 'ffffff', red: 'ff0000', blue: '0000ff', green: '008000', yellow: 'ffff00', gray: '808080', grey: '808080', navy: '000080' };
    return noms[s] || null;
  };
  const rgb = (h) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  const versHex = (r, g, b) => [r, g, b].map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('');
  function luminance(h) {
    const [r, g, b] = rgb(h).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function contraste(a, b) {
    const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  }
  function versHsl(h) {
    const [r, g, b] = rgb(h).map((v) => v / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    const t = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [t / 6, s, l];
  }
  function depuisHsl(t, s, l) {
    if (!s) return versHex(l * 255, l * 255, l * 255);
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = (x) => { x = (x + 1) % 1; return x < 1 / 6 ? p + (q - p) * 6 * x : x < 1 / 2 ? q : x < 2 / 3 ? p + (q - p) * (2 / 3 - x) * 6 : p; };
    return versHex(f(t + 1 / 3) * 255, f(t) * 255, f(t - 1 / 3) * 255);
  }

  // Les fonds et textes des deux pages (les mêmes que dans style.css).
  const PAGE = { claire: { fond: 'ffffff', texte: '1a1a1a' }, sombre: { fond: '1d1e25', texte: 'e4e4e8' } };
  // La couleur à montrer à la place de hex sur ce fond, ou null si hex est déjà lisible.
  function adapter(hex, fond, texte) {
    const h = propre(hex);
    if (!h || contraste(h, fond) >= 3) return null;
    const [t, s, l] = versHsl(h);
    // Un gris (noir, blanc…) : la couleur du texte de la page.
    if (s < 0.12) return texte;
    const fondSombre = luminance(fond) < 0.2;
    let l2 = 1 - l;
    let c = depuisHsl(t, s, l2);
    for (let i = 0; i < 12 && contraste(c, fond) < 4.5; i++) { l2 += fondSombre ? 0.04 : -0.04; c = depuisHsl(t, s, Math.max(0, Math.min(1, l2))); }
    return c;
  }
  const adapterPour = (hex, sombre) => adapter(hex, PAGE[sombre ? 'sombre' : 'claire'].fond, PAGE[sombre ? 'sombre' : 'claire'].texte);

  // --- La page : les couleurs posées à la main, adaptées au fond (une feuille CSS par document) ---
  const attrCss = (v) => `"${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\a ')}"`;
  function adapterPage(d) {
    if (!d?.page?.id) return;
    const page = d.page;
    const sombre = page.classList.contains('sombre');
    const ici = PAGE[sombre ? 'sombre' : 'claire'];
    const portee = `#${CSS.escape(page.id)}.feuille`;
    const regles = new Map();
    for (const n of page.querySelectorAll('[style*="color"], font[color]')) {
      const st = n.getAttribute('style');
      const sel = st ? `[style=${attrCss(st)}]` : `font[color=${attrCss(n.getAttribute('color'))}]`;
      if (regles.has(sel)) continue;
      // Un surlignage ou un fond de case : le texte « automatique » dessus prend le noir ou le blanc lisible.
      const fond = propre(n.style?.backgroundColor);
      const couleur = propre(n.style?.color) || (n.tagName === 'FONT' ? propre(n.getAttribute('color')) : null);
      if (fond) {
        if (!couleur && contraste(ici.texte, fond) < 3) regles.set(sel, `${portee} ${sel} { color: #${contraste('1a1a1a', fond) >= contraste('f5f5f5', fond) ? '1a1a1a' : 'f5f5f5'}; }`);
        continue;
      }
      if (!couleur) continue;
      const a = adapter(couleur, ici.fond, ici.texte);
      // Sur un surlignage, la couleur reste celle choisie (elle a été pensée pour ce fond).
      if (a) regles.set(sel, `${portee} ${sel}:not([style*="background"] *):not(td[style] *):not(th[style] *) { color: #${a} !important; }`);
    }
    let st = document.getElementById(`couleurs-${d.id}`);
    if (!st) { st = el('style', { id: `couleurs-${d.id}` }); document.head.append(st); }
    const css = [...regles.values()].join('\n');
    if (st.textContent !== css) st.textContent = css;
  }
  function retirerPage(d) { document.getElementById(`couleurs-${d.id}`)?.remove(); }

  // --- Le sélecteur ---
  const ID_PERSO = 'perso:';
  function paletteActive() {
    const id = lireConfig().paletteActive || 'classique';
    if (id.startsWith(ID_PERSO)) {
      const p = mesPalettes().find((x) => ID_PERSO + x.id === id);
      if (p) return { ...p, id, perso: true, idPerso: p.id };
    }
    return PALETTES.find((p) => p.id === id) || PALETTES[0];
  }
  async function enregistrer(changes) { await ecrireConfig(changes); }
  function retenir(c) {
    const r = [c, ...(lireConfig().couleursRecentes || []).filter((x) => x !== c)].slice(0, MAX_RECENTES);
    enregistrer({ couleursRecentes: r });
  }

  // Ouvre le sélecteur sous un bouton. choisir(c) reçoit « rrggbb » ou null (le choix « aucune »).
  // valeur : la couleur actuelle (cochée dans la grille). aucune : le libellé du choix sans couleur.
  function ouvrir(bouton, { titre, aucune, valeur = null, choisir }) {
    const actuelle = propre(valeur);
    const conteneur = el('div', { className: 'couleurs' });
    const prendre = (c) => { Menus.fermer(); if (c) retenir(c); choisir(c); };

    const pastille = (c, { retirer } = {}) => {
      const b = el('button', { type: 'button', className: `pastille${c === actuelle ? ' actuelle' : ''}`, title: `#${c}${retirer ? ' (clic droit : retirer de la palette)' : ''}`, style: `background:#${c}` });
      b.onclick = () => prendre(c);
      if (retirer) b.oncontextmenu = (e) => { e.preventDefault(); retirer(c); };
      return b;
    };

    function dessiner(mode = null) {
      const p = paletteActive();
      const choix = el('select', { className: 'couleurs-choix', title: 'Palette' });
      const g1 = el('optgroup', { label: 'Toutes faites' });
      for (const x of PALETTES) g1.append(new Option(x.nom, x.id));
      choix.append(g1);
      if (mesPalettes().length) {
        const g2 = el('optgroup', { label: 'Mes palettes' });
        for (const x of mesPalettes()) g2.append(new Option(x.nom, ID_PERSO + x.id));
        choix.append(g2);
      }
      choix.value = p.id;
      choix.onchange = async () => { await enregistrer({ paletteActive: choix.value }); dessiner(); };
      const outils = el('div', { className: 'couleurs-outils' }, choix);
      const icone = (nom, aide, run) => { const b = el('button', { type: 'button', className: 'icon-button', title: aide }, el('i', { className: `codicon codicon-${nom}` })); b.onclick = run; return b; };
      outils.append(icone('add', 'Nouvelle palette', () => dessiner('nouvelle')));
      if (p.perso) {
        outils.append(icone('edit', 'Renommer cette palette', () => dessiner('renommer')));
        outils.append(icone('trash', 'Supprimer cette palette', () => dessiner('supprimer')));
      }

      const contenu = [el('div', { className: 'menu-titre', textContent: titre }), outils];

      // Nommer une palette (nouvelle ou renommée), ou confirmer sa suppression, dans le sélecteur même.
      if (mode === 'nouvelle' || mode === 'renommer') {
        const nom = el('input', { type: 'text', className: 'couleurs-nom', placeholder: 'Nom de la palette', value: mode === 'renommer' ? p.nom : '', spellcheck: false });
        const depart = el('label', { className: 'couleurs-depart' });
        const avecRecentes = el('input', { type: 'checkbox' });
        if (mode === 'nouvelle' && (lireConfig().couleursRecentes || []).length) depart.append(avecRecentes, el('span', { textContent: 'Commencer avec mes couleurs récentes' }));
        const valider = async () => {
          const n = nom.value.trim() || 'Ma palette';
          const liste = mesPalettes().map((x) => ({ ...x }));
          if (mode === 'renommer') { const x = liste.find((y) => y.id === p.idPerso); if (x) x.nom = n; await enregistrer({ palettes: liste }); } else {
            const id = Date.now().toString(36);
            liste.push({ id, nom: n, couleurs: avecRecentes.checked ? [...(lireConfig().couleursRecentes || [])] : (actuelle ? [actuelle] : []) });
            await enregistrer({ palettes: liste, paletteActive: ID_PERSO + id });
          }
          dessiner();
        };
        nom.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); valider(); } };
        const ok = el('button', { type: 'button', className: 'button primary', textContent: mode === 'renommer' ? 'Renommer' : 'Créer' });
        ok.onclick = valider;
        const annuler = el('button', { type: 'button', className: 'button', textContent: 'Annuler' });
        annuler.onclick = () => dessiner();
        contenu.push(el('div', { className: 'couleurs-formulaire' }, nom, depart, el('div', { className: 'couleurs-boutons' }, annuler, ok)));
        conteneur.replaceChildren(...contenu);
        setTimeout(() => nom.focus(), 0);
        return;
      }
      if (mode === 'supprimer') {
        const oui = el('button', { type: 'button', className: 'button primary', textContent: 'Supprimer' });
        oui.onclick = async () => { await enregistrer({ palettes: mesPalettes().filter((x) => x.id !== p.idPerso), paletteActive: 'classique' }); dessiner(); };
        const non = el('button', { type: 'button', className: 'button', textContent: 'Garder' });
        non.onclick = () => dessiner();
        contenu.push(el('div', { className: 'couleurs-formulaire' }, el('p', { className: 'couleurs-aide', textContent: `Supprimer la palette « ${p.nom} » ? Le texte déjà coloré garde ses couleurs.` }), el('div', { className: 'couleurs-boutons' }, non, oui)));
        conteneur.replaceChildren(...contenu);
        return;
      }

      // La grille de la palette. Dans une palette à moi : « + » ajoute une couleur, clic droit la retire.
      const grille = el('div', { className: 'palette' });
      const retirer = p.perso ? async (c) => {
        await enregistrer({ palettes: mesPalettes().map((x) => (x.id === p.idPerso ? { ...x, couleurs: x.couleurs.filter((y) => y !== c) } : x)) });
        dessiner();
      } : null;
      for (const c of p.couleurs) grille.append(pastille(c, { retirer }));
      if (p.perso) {
        const ajout = el('label', { className: 'pastille ajout', title: 'Ajouter une couleur à cette palette' }, el('i', { className: 'codicon codicon-add' }));
        const entree = el('input', { type: 'color', value: `#${actuelle || '2b6fd6'}` });
        // La couleur reste dans la palette même si la fenêtre de Windows a fermé le sélecteur.
        entree.onchange = async () => {
          const c = propre(entree.value);
          await enregistrer({ palettes: mesPalettes().map((x) => (x.id === p.idPerso && !x.couleurs.includes(c) ? { ...x, couleurs: [...x.couleurs, c] } : x)) });
          if (conteneur.isConnected) dessiner();
        };
        ajout.append(entree);
        grille.append(ajout);
      }
      contenu.push(grille);
      if (p.perso && !p.couleurs.length) contenu.push(el('p', { className: 'couleurs-aide', textContent: 'Palette vide : « + » ajoute une couleur.' }));
      if (p.perso && actuelle && !p.couleurs.includes(actuelle)) {
        const b = el('button', { type: 'button', className: 'lien-couleur' }, el('span', { className: 'pastille-mini', style: `background:#${actuelle}` }), el('span', { textContent: 'Ajouter la couleur actuelle à cette palette' }));
        b.onclick = async () => { await enregistrer({ palettes: mesPalettes().map((x) => (x.id === p.idPerso ? { ...x, couleurs: [...x.couleurs, actuelle] } : x)) }); dessiner(); };
        contenu.push(b);
      }

      const recentes = (lireConfig().couleursRecentes || []).filter(Boolean);
      if (recentes.length) {
        contenu.push(el('div', { className: 'menu-titre', textContent: 'Récentes' }));
        const g = el('div', { className: 'palette' });
        for (const c of recentes) g.append(pastille(c));
        contenu.push(g);
      }

      const autre = el('input', { type: 'color', value: `#${actuelle || '2b6fd6'}`, title: 'Autre couleur' });
      autre.onchange = () => prendre(propre(autre.value));
      contenu.push(el('label', { className: 'palette-ligne' }, autre, el('span', { textContent: 'Autre couleur…' })));
      if (aucune) {
        const sans = el('button', { type: 'button', className: `menu-item${actuelle === null ? ' choisi' : ''}` }, el('i', { className: 'codicon codicon-circle-slash' }), el('span', { className: 'menu-label', textContent: aucune }));
        sans.onclick = () => prendre(null);
        contenu.push(el('div', { className: 'menu-sep' }), sans);
      }
      conteneur.replaceChildren(...contenu);
    }
    dessiner();
    return Menus.sous(bouton, [{ element: conteneur }]);
  }

  return { PALETTES, PAGE, propre, contraste, luminance, adapter, adapterPour, adapterPage, retirerPage, configurer, ouvrir };
})();
