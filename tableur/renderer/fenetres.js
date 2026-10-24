// Les menus et les fenêtres de Reikna : menus déroulants, palette de couleurs, liste de toutes les
// fonctions, format de cellule, tri, filtre, rechercher / remplacer.
// Les petites fenêtres de réglages simples passent par Dialogs.form (dialogs.js).

const Fenetres = (() => {
  // --- Menu déroulant ---
  // items : [libellé, action, raccourci, { coche, desactive, icone }] ou null (séparateur).
  // ancre : un élément (le menu s'ouvre dessous) ou { x, y } (clic droit).
  function menu(ancre, items) {
    fermerMenus();
    const m = el('div', { className: 'menu' });
    for (const item of items) {
      if (!item) { m.append(el('div', { className: 'menu-sep' })); continue; }
      const [label, run, keys, opts = {}] = item;
      const b = el('button', { className: 'menu-item' },
        el('i', { className: `codicon codicon-${opts.coche ? 'check' : opts.icone || 'blank'} menu-icone` }),
        el('span', { className: 'menu-label', textContent: label }),
        keys ? el('span', { className: 'menu-keys', textContent: keys }) : null);
      if (opts.desactive) { b.disabled = true; b.classList.add('desactive'); } else b.onclick = () => { m.remove(); run(); };
      b.onmousedown = (e) => e.preventDefault(); // la grille garde le clavier
      m.append(b);
    }
    document.body.append(m);
    placer(m, ancre);
    setTimeout(() => document.addEventListener('pointerdown', function fermer(e) {
      if (!m.contains(e.target)) { m.remove(); document.removeEventListener('pointerdown', fermer); }
    }));
    return m;
  }
  const fermerMenus = () => $$('.menu').forEach((x) => x.remove());

  function placer(m, ancre) {
    let x, y;
    if (ancre instanceof Element) { const r = ancre.getBoundingClientRect(); x = r.left; y = r.bottom + 4; } else ({ x, y } = ancre);
    m.style.left = `${x}px`;
    m.style.top = `${y}px`;
    const r = m.getBoundingClientRect();
    if (r.right > window.innerWidth - 6) m.style.left = `${Math.max(6, window.innerWidth - r.width - 6)}px`;
    if (r.bottom > window.innerHeight - 6) m.style.top = `${Math.max(6, (ancre instanceof Element ? ancre.getBoundingClientRect().top - 4 : y) - r.height)}px`;
  }

  // --- Palette de couleurs (celle d'Excel : thème + couleurs standard) ---
  const PALETTE = [
    '#FFFFFF', '#000000', '#E7E6E6', '#44546A', '#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5', '#70AD47',
    '#F2F2F2', '#7F7F7F', '#D0CECE', '#D6DCE4', '#D9E1F2', '#FCE4D6', '#EDEDED', '#FFF2CC', '#DDEBF7', '#E2EFDA',
    '#D9D9D9', '#595959', '#AEAAAA', '#ACB9CA', '#B4C6E7', '#F8CBAD', '#DBDBDB', '#FFE699', '#BDD7EE', '#C6E0B4',
    '#BFBFBF', '#404040', '#757171', '#8497B0', '#8EA9DB', '#F4B084', '#C9C9C9', '#FFD966', '#9BC2E6', '#A9D08E',
    '#A6A6A6', '#262626', '#3A3838', '#333F4F', '#305496', '#C65911', '#7B7B7B', '#BF8F00', '#2F75B5', '#548235',
    '#C00000', '#FF0000', '#FFC000', '#FFFF00', '#92D050', '#00B050', '#00B0F0', '#0070C0', '#002060', '#7030A0',
  ];
  function palette(ancre, { libelleAuto = 'Automatique' } = {}) {
    fermerMenus();
    return new Promise((resolve) => {
      const m = el('div', { className: 'menu' });
      const grille = el('div', { className: 'palette' });
      let fini = false;
      const finir = (v) => { if (fini) return; fini = true; m.remove(); resolve(v); };
      for (const c of PALETTE) {
        const b = el('button', { title: c, style: `background:${c}` });
        b.onmousedown = (e) => e.preventDefault();
        b.onclick = () => finir(c);
        grille.append(b);
      }
      const auto = el('button', { className: 'button small', textContent: libelleAuto, onclick: () => finir('auto') });
      const choix = el('input', { type: 'color', value: '#34d399', title: 'Autre couleur' });
      choix.onchange = () => finir(choix.value.toUpperCase());
      m.append(el('div', { className: 'palette-pied' }, auto, el('span', { className: 'spacer' }), el('span', { className: 'modal-extra', textContent: 'Autre' }), choix), grille);
      document.body.append(m);
      placer(m, ancre);
      setTimeout(() => document.addEventListener('pointerdown', function fermer(e) {
        if (!m.contains(e.target)) { document.removeEventListener('pointerdown', fermer); finir(null); }
      }));
    });
  }

  // --- Toutes les fonctions ---
  function fonctions({ langue, surInserer }) {
    const toutes = Fonctions.toutes();
    let rubrique = 'Toutes';
    let choisie = null;
    const recherche = el('input', { type: 'text', placeholder: 'Chercher une fonction (nom ou description)…', style: 'width:100%' });
    const rubriques = el('div', { className: 'fonctions-rubriques' });
    const liste = el('div', { className: 'fonctions-liste' });
    const bloc = el('div', {}, recherche, el('div', { className: 'fonctions', style: 'margin-top:10px' }, rubriques, liste));
    const sansAccents = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

    function rendreRubriques() {
      rubriques.innerHTML = '';
      for (const r of ['Toutes', ...Fonctions.RUBRIQUES, 'Autres']) {
        const n = r === 'Toutes' ? toutes.length : toutes.filter((f) => f.rubrique === r).length;
        if (!n) continue;
        const b = el('button', { className: r === rubrique ? 'actif' : '' }, el('span', { textContent: r }), el('small', { textContent: String(n) }));
        b.type = 'button';
        b.onclick = () => { rubrique = r; rendreRubriques(); rendreListe(); };
        rubriques.append(b);
      }
    }
    function rendreListe() {
      const q = sansAccents(recherche.value.trim());
      liste.innerHTML = '';
      const visibles = toutes
        .filter((f) => rubrique === 'Toutes' || f.rubrique === rubrique)
        .filter((f) => !q || sansAccents(`${f.fr} ${f.en} ${f.description}`).includes(q))
        .sort((a, b) => (q ? a.rang - b.rang : 0) || Fonctions.nom(a, langue).localeCompare(Fonctions.nom(b, langue)));
      for (const f of visibles.slice(0, 500)) {
        const autre = langue === 'en' ? f.fr : f.en;
        const item = el('div', { className: `fonction${f === choisie ? ' actif' : ''}` },
          el('div', { className: 'syntaxe' }, Fonctions.syntaxe(f, langue), autre !== Fonctions.nom(f, langue) ? el('span', { className: 'autre-nom', textContent: `${langue === 'en' ? 'en français' : 'en anglais'} : ${autre}` }) : null),
          el('div', { className: 'desc', textContent: f.description || '(pas encore de description)' }));
        item.onclick = () => { choisie = f; $$('.fonction.actif', liste).forEach((x) => x.classList.remove('actif')); item.classList.add('actif'); };
        item.ondblclick = () => { choisie = f; Dialogs.close({}); };
        liste.append(item);
      }
      if (!visibles.length) liste.append(el('p', { className: 'modal-info', textContent: 'Aucune fonction ne correspond.' }));
    }
    recherche.addEventListener('input', () => { rubrique = 'Toutes'; rendreRubriques(); rendreListe(); });
    rendreRubriques();
    rendreListe();
    return Dialogs.form({
      title: `Toutes les fonctions (${toutes.length})`,
      okLabel: 'Insérer',
      width: 760,
      fields: [{ type: 'element', element: bloc }, { type: 'info', text: 'Double-clic pour insérer. Les arguments entre crochets sont facultatifs. Dans une cellule, tape = puis les premières lettres : la liste apparaît toute seule.' }],
    }).then((v) => { if (v && choisie) surInserer(choisie); });
  }

  // --- Format de cellule (Ctrl+1) ---
  const CATEGORIES = [
    ['standard', 'Standard'], ['nombre', 'Nombre'], ['monetaire', 'Monétaire'], ['pourcentage', 'Pourcentage'], ['date', 'Date'],
    ['heure', 'Heure'], ['fraction', 'Fraction'], ['scientifique', 'Scientifique'], ['texte', 'Texte'], ['perso', 'Personnalisé'],
  ];
  const DATES = [['dd/mm/yyyy', '24/10/2026'], ['dd/mm/yy', '24/10/26'], ['d mmmm yyyy', '24 octobre 2026'], ['dddd d mmmm yyyy', 'samedi 24 octobre 2026'], ['mmmm yyyy', 'octobre 2026'], ['dd/mm', '24/10'], ['yyyy-mm-dd', '2026-10-24'], ['dd/mm/yyyy hh:mm', '24/10/2026 14:30']];
  const HEURES = [['hh:mm', '14:30'], ['hh:mm:ss', '14:30:05'], ['[h]:mm', '38:30 (durée)'], ['mm:ss', '30:05']];
  function codeFormat(v) {
    const dec = Math.max(0, Math.min(10, Number(v.decimales) || 0));
    const partieDec = dec ? `.${'0'.repeat(dec)}` : '';
    const base = `${v.milliers ? '#,##0' : '0'}${partieDec}`;
    switch (v.categorie) {
      case 'standard': return '';
      case 'nombre': return v.negatifRouge ? `${base};[Red]-${base}` : base;
      case 'monetaire': {
        const sym = v.symbole === 'aucun' ? '' : v.symbole;
        const m = sym === '€' ? `#,##0${partieDec} "€"` : sym ? `"${sym}"#,##0${partieDec}` : `#,##0${partieDec}`;
        return v.negatifRouge ? `${m};[Red]-${m}` : m;
      }
      case 'pourcentage': return `0${partieDec}%`;
      case 'date': return v.date;
      case 'heure': return v.heure;
      case 'fraction': return '# ?/?';
      case 'scientifique': return `0${partieDec}E+00`;
      case 'texte': return '@';
      default: return v.perso;
    }
  }
  function categorieDe(fmt) {
    if (!fmt) return 'standard';
    if (fmt === '@') return 'texte';
    if (/%/.test(fmt)) return 'pourcentage';
    if (/E\+/i.test(fmt)) return 'scientifique';
    if (/[€$£]/.test(fmt)) return 'monetaire';
    if (Formules.estDate(fmt)) return /[dy]/i.test(fmt) ? 'date' : 'heure';
    if (/\?\/\?/.test(fmt)) return 'fraction';
    if (/^[#0,.]+(;\[Red\]-[#0,.]+)?$/.test(fmt)) return 'nombre';
    return 'perso';
  }
  function formatCellule(fmtActuel, exemple) {
    const dec = (fmtActuel?.match(/\.(0+)/)?.[1] || '').length;
    const apercu = el('div', { className: 'apercu-format' });
    const valeurs = {
      categorie: categorieDe(fmtActuel), decimales: fmtActuel ? dec : 2, milliers: /#,##/.test(fmtActuel || '#,##'), negatifRouge: /\[Red\]/i.test(fmtActuel || ''),
      symbole: /\$/.test(fmtActuel || '') ? '$' : /£/.test(fmtActuel || '') ? '£' : '€', date: DATES.some(([d]) => d === fmtActuel) ? fmtActuel : 'dd/mm/yyyy',
      heure: HEURES.some(([h]) => h === fmtActuel) ? fmtActuel : 'hh:mm', perso: fmtActuel || '0.00',
    };
    const montrer = (v, api) => {
      const c = v.categorie;
      const voir = (k, oui) => { if (api.inputs[k]) api.inputs[k].row.hidden = !oui; };
      voir('decimales', ['nombre', 'monetaire', 'pourcentage', 'scientifique'].includes(c));
      voir('milliers', c === 'nombre');
      voir('negatifRouge', ['nombre', 'monetaire'].includes(c));
      voir('symbole', c === 'monetaire');
      voir('date', c === 'date');
      voir('heure', c === 'heure');
      voir('perso', c === 'perso');
      const code = codeFormat(v);
      let texte;
      const n = typeof exemple === 'number' ? exemple : c === 'date' || c === 'heure' ? 46319.6042 : -1234.5678;
      try { texte = Formules.texteValeur(n, code); } catch { texte = '(format invalide)'; }
      apercu.textContent = texte;
      apercu.style.color = /\[Red\]/i.test(code) && n < 0 ? '#ff6b6b' : '';
      if (c !== 'perso' && api.inputs.perso) api.inputs.perso.input.value = code;
    };
    return Dialogs.form({
      title: 'Format des nombres',
      okLabel: 'Appliquer',
      width: 480,
      fields: [
        { key: 'categorie', label: 'Catégorie', type: 'select', value: valeurs.categorie, choices: CATEGORIES },
        { key: 'decimales', label: 'Décimales', type: 'number', value: valeurs.decimales, min: 0, max: 10 },
        { key: 'milliers', label: 'Séparer les milliers (1 234)', type: 'checkbox', value: valeurs.milliers },
        { key: 'negatifRouge', label: 'Nombres négatifs en rouge', type: 'checkbox', value: valeurs.negatifRouge },
        { key: 'symbole', label: 'Symbole', type: 'select', value: valeurs.symbole, choices: [['€', '€ (euro)'], ['$', '$ (dollar)'], ['£', '£ (livre)'], ['aucun', 'Aucun']] },
        { key: 'date', label: 'Date', type: 'select', value: valeurs.date, choices: DATES },
        { key: 'heure', label: 'Heure', type: 'select', value: valeurs.heure, choices: HEURES },
        { key: 'perso', label: 'Code du format', type: 'text', value: valeurs.perso, placeholder: '#,##0.00 "€"' },
        { type: 'element', element: apercu },
        { type: 'info', text: 'Les codes sont ceux d\'Excel : 0 = chiffre obligatoire, # = chiffre facultatif, « , » = milliers, « . » = décimales, dd/mm/yyyy = date, "texte" entre guillemets.' },
      ],
      onInput: montrer,
    }).then((v) => (v ? codeFormat(v) : null));
  }

  // --- Trier sur plusieurs colonnes ---
  function trier(colonnes, enteteProbable) {
    const choix = colonnes.map((c) => [String(c.index), c.nom]);
    const champs = [];
    for (let i = 0; i < 3; i++) {
      champs.push({ key: `col${i}`, label: i === 0 ? 'Trier par' : 'Puis par', type: 'select', value: i === 0 ? choix[0][0] : '', choices: [...(i ? [['', '—']] : []), ...choix] });
      champs.push({ key: `ordre${i}`, label: 'Ordre', type: 'select', value: 'asc', choices: [['asc', 'Croissant (A → Z, 1 → 9)'], ['desc', 'Décroissant (Z → A, 9 → 1)']] });
    }
    return Dialogs.form({
      title: 'Trier',
      okLabel: 'Trier',
      width: 460,
      fields: [{ key: 'entete', label: 'La première ligne contient des titres (elle ne bouge pas)', type: 'checkbox', value: enteteProbable }, ...champs],
    }).then((v) => {
      if (!v) return null;
      const cles = [];
      for (let i = 0; i < 3; i++) if (v[`col${i}`] !== '') cles.push({ colonne: Number(v[`col${i}`]), croissant: v[`ordre${i}`] === 'asc' });
      return { entete: v.entete, cles };
    });
  }

  // --- Le menu d'un bouton de filtre ---
  function filtre(point, { valeurs, cachees, surTrier }) {
    fermerMenus();
    return new Promise((resolve) => {
      const m = el('div', { className: 'menu filtre-menu' });
      const chercher = el('input', { type: 'text', placeholder: 'Chercher…' });
      const liste = el('div', { className: 'liste' });
      const coches = new Map(valeurs.map((v) => [v, !cachees.includes(v)]));
      const tout = el('input', { type: 'checkbox' });
      const rendre = () => {
        const q = chercher.value.toLowerCase();
        liste.innerHTML = '';
        const visibles = valeurs.filter((v) => v.toLowerCase().includes(q));
        tout.checked = visibles.every((v) => coches.get(v));
        liste.append(el('label', {}, tout, el('span', { textContent: '(Tout sélectionner)' })));
        for (const v of visibles.slice(0, 1000)) {
          const cb = el('input', { type: 'checkbox', checked: coches.get(v) });
          cb.onchange = () => { coches.set(v, cb.checked); tout.checked = visibles.every((x) => coches.get(x)); };
          liste.append(el('label', { title: v || '(vides)' }, cb, el('span', { textContent: v === '' ? '(vides)' : v })));
        }
        tout.onchange = () => { for (const v of visibles) coches.set(v, tout.checked); rendre(); };
      };
      chercher.oninput = rendre;
      let fini = false;
      const finir = (val) => { if (fini) return; fini = true; m.remove(); resolve(val); };
      const ok = el('button', { className: 'button primary small', type: 'button', textContent: 'OK', onclick: () => finir([...coches].filter(([, c]) => !c).map(([v]) => v)) });
      const annuler = el('button', { className: 'button small', type: 'button', textContent: 'Annuler', onclick: () => finir(null) });
      const az = el('button', { className: 'menu-item', type: 'button' }, el('i', { className: 'codicon codicon-arrow-down menu-icone' }), el('span', { className: 'menu-label', textContent: 'Trier de A à Z' }));
      const za = el('button', { className: 'menu-item', type: 'button' }, el('i', { className: 'codicon codicon-arrow-up menu-icone' }), el('span', { className: 'menu-label', textContent: 'Trier de Z à A' }));
      az.onclick = () => { finir(null); surTrier(true); };
      za.onclick = () => { finir(null); surTrier(false); };
      m.append(az, za, el('div', { className: 'menu-sep' }), chercher, liste, el('div', { className: 'boutons' }, annuler, ok));
      rendre();
      document.body.append(m);
      placer(m, point);
      chercher.focus();
      m.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') finir(null); if (e.key === 'Enter') ok.click(); });
      setTimeout(() => document.addEventListener('pointerdown', function fermer(e) {
        if (!m.contains(e.target)) { document.removeEventListener('pointerdown', fermer); finir(null); }
      }));
    });
  }

  return { menu, fermerMenus, palette, fonctions, formatCellule, trier, filtre };
})();
