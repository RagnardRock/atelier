// Les graphiques : posés sur la feuille au-dessus des cellules, dessinés avec Chart.js, et mis à jour
// dès que les données changent.
//
// Un graphique (dans Classeur.meta(feuille).graphiques) :
//   { id, type, donnees: { feuille, plage }, series: 'colonnes' | 'lignes' | null (deviné),
//     titre, legende: 'bas' | 'droite' | 'haut' | 'aucune', empile, ancre: { r, c, dx, dy },
//     largeur, hauteur }   (positions et tailles en pixels à 100 %)
// Les données : la première ligne et la première colonne servent de titres quand elles contiennent du
// texte (comme Excel) ; sinon les séries s'appellent « Série 1 »… et les catégories 1, 2, 3…

const Graphiques = (() => {
  const TYPES = {
    colonnes: { nom: 'Histogramme', icone: 'graph' },
    barres: { nom: 'Barres', icone: 'graph-left' },
    lignes: { nom: 'Courbes', icone: 'graph-line' },
    aires: { nom: 'Aires', icone: 'graph-line' },
    secteurs: { nom: 'Secteurs', icone: 'pie-chart' },
    anneau: { nom: 'Anneau', icone: 'pie-chart' },
    nuage: { nom: 'Nuage de points', icone: 'graph-scatter' },
  };
  const PALETTE = ['#4e9af1', '#34d399', '#f59e0b', '#f472b6', '#a78bfa', '#f87171', '#22d3ee', '#a3e635', '#fb923c', '#94a3b8'];
  const LARGEUR = 480, HAUTEUR = 288;

  let calque = null;            // le div qui contient les graphiques (au-dessus de la grille)
  const vues = new Map();       // id → { el, chart, version, cle }
  let choisi = null;            // id du graphique sélectionné
  let feuilleAffichee = null;

  // --- Les données d'un graphique ---
  function lire(g) {
    const f = g.donnees.feuille;
    if (!Classeur.feuilles().some((x) => x.id === f)) return { erreur: 'La feuille des données n\'existe plus.' };
    const { width, height } = Classeur.dimensions(f);
    const p = { ...g.donnees.plage, r2: Math.min(g.donnees.plage.r2, height - 1), c2: Math.min(g.donnees.plage.c2, width - 1) };
    if (p.r2 < p.r1 || p.c2 < p.c1) return { erreur: 'Pas de données dans la plage.' };
    const M = [];
    for (let r = p.r1; r <= p.r2; r++) {
      const l = [];
      for (let c = p.c1; c <= p.c2; c++) {
        const v = Classeur.valeur(f, r, c);
        l.push({ v: v && typeof v === 'object' ? null : v, t: Classeur.texte(f, r, c) });
      }
      M.push(l);
    }
    const nl = M.length, nc = M[0].length;
    const texte = (x) => typeof x.v === 'string';
    const pasNombre = (x) => typeof x.v !== 'number';
    // Titres : la première ligne (sans le coin) n'a pas de nombre et au moins un texte ; pareil pour la colonne.
    const ligneTitres = nl > 1 && M[0].slice(nc > 1 ? 1 : 0).every(pasNombre) && M[0].some(texte);
    const colonneTitres = nc > 1 && M.slice(ligneTitres ? 1 : 0).every((l) => pasNombre(l[0])) && M.some((l, i) => (i || !ligneTitres) && texte(l[0]));
    const r0 = ligneTitres ? 1 : 0, c0 = colonneTitres ? 1 : 0;
    // Séries en colonnes si le tableau est plus haut que large (comme Excel), sauf choix contraire.
    const enColonnes = g.series ? g.series === 'colonnes' : (nl - r0) >= (nc - c0);
    const series = [];
    let categories = [];
    if (g.type === 'nuage') {
      // Nuage de points : la première colonne (ou ligne) donne les x, les suivantes les y.
      const x = enColonnes ? M.slice(r0).map((l) => l[0].v) : M[0].slice(c0).map((m) => m.v);
      const nb = enColonnes ? nc : nl;
      for (let k = 1; k < nb; k++) {
        const ys = enColonnes ? M.slice(r0).map((l) => l[k].v) : M[k].slice(c0).map((m) => m.v);
        const nom = enColonnes ? (ligneTitres ? M[0][k].t : `Série ${k}`) : (colonneTitres ? M[k][0].t : `Série ${k}`);
        series.push({ nom, points: ys.map((y, i) => ({ x: typeof x[i] === 'number' ? x[i] : i + 1, y: typeof y === 'number' ? y : null })).filter((pt) => pt.y !== null) });
      }
      if (nb === 1) series.push({ nom: 'Série 1', points: x.map((y, i) => ({ x: i + 1, y })).filter((pt) => typeof pt.y === 'number') });
      return { series, categories: [], ligneTitres, colonneTitres, enColonnes, plage: p, r0, c0 };
    }
    if (enColonnes) {
      categories = M.slice(r0).map((l, i) => (colonneTitres ? l[0].t : String(i + 1)));
      for (let k = c0; k < nc; k++) series.push({ nom: ligneTitres ? M[0][k].t : `Série ${k - c0 + 1}`, valeurs: M.slice(r0).map((l) => (typeof l[k].v === 'number' ? l[k].v : null)) });
    } else {
      categories = M[0].slice(c0).map((m, i) => (ligneTitres ? m.t : String(i + 1)));
      for (let k = r0; k < nl; k++) series.push({ nom: colonneTitres ? M[k][0].t : `Série ${k - r0 + 1}`, valeurs: M[k].slice(c0).map((m) => (typeof m.v === 'number' ? m.v : null)) });
    }
    // Une colonne de texte au milieu (ex. « Catégorie ») n'est pas une série : on l'écarte.
    const gardees = series.map((x, i) => ({ ...x, k: i })).filter((x) => x.valeurs.some((v) => typeof v === 'number'));
    if (!gardees.length) return { erreur: 'Pas de nombres dans les données.' };
    return { series: gardees, categories, ligneTitres, colonneTitres, enColonnes, plage: p, r0, c0 };
  }

  // --- La configuration Chart.js ---
  function couleursTheme() {
    const cs = getComputedStyle(document.body);
    const clair = document.body.classList.contains('grille-claire');
    return {
      texte: clair ? '#33343a' : (cs.getPropertyValue('--grille-texte').trim() || '#e6e6ea'),
      grille: clair ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)',
      fond: clair ? '#ffffff' : '#1b1c23',
    };
  }
  function config(g, d, { apercu = false } = {}) {
    const th = couleursTheme();
    const police = { family: '"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif', size: apercu ? 11 : 12 };
    const rond = ['secteurs', 'anneau'].includes(g.type);
    const nombre = (v) => (typeof v === 'number' ? v.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : v);
    let datasets;
    if (g.type === 'nuage') {
      datasets = d.series.map((s, i) => ({ label: s.nom, data: s.points, backgroundColor: PALETTE[i % PALETTE.length], borderColor: PALETTE[i % PALETTE.length], pointRadius: 4 }));
    } else if (rond) {
      // Secteurs et anneau : la première série, une couleur par catégorie.
      const s = d.series[0] || { nom: '', valeurs: [] };
      datasets = [{ label: s.nom, data: s.valeurs, backgroundColor: s.valeurs.map((_, i) => PALETTE[i % PALETTE.length]), borderColor: th.fond, borderWidth: 2 }];
    } else {
      datasets = d.series.map((s, i) => {
        const c = PALETTE[i % PALETTE.length];
        const base = { label: s.nom, data: s.valeurs, backgroundColor: c, borderColor: c };
        if (g.type === 'lignes') return { ...base, borderWidth: 2.5, pointRadius: 3, tension: 0, spanGaps: true };
        if (g.type === 'aires') return { ...base, backgroundColor: `${c}66`, borderWidth: 2, pointRadius: 0, fill: g.empile ? (i ? '-1' : 'origin') : 'origin', tension: 0 };
        return { ...base, borderRadius: 3, maxBarThickness: 64 };
      });
    }
    const type = { colonnes: 'bar', barres: 'bar', lignes: 'line', aires: 'line', secteurs: 'pie', anneau: 'doughnut', nuage: 'scatter' }[g.type] || 'bar';
    const legende = g.legende || (rond || d.series.length > 1 ? 'bas' : 'aucune');
    const axes = rond ? {} : {
      x: { stacked: Boolean(g.empile) && g.type !== 'nuage', offset: g.type !== 'nuage' && g.type !== 'aires', ticks: { color: th.texte, font: police, ...(g.type === 'barres' ? { callback: function cb(v) { return nombre(v); } } : {}) }, grid: { color: th.grille, display: g.type === 'barres' || g.type === 'nuage' } },
      y: { stacked: Boolean(g.empile) && g.type !== 'nuage', beginAtZero: g.type !== 'nuage', ticks: { color: th.texte, font: police, ...(g.type !== 'barres' ? { callback: function cb(v) { return nombre(v); } } : {}) }, grid: { color: th.grille, display: g.type !== 'barres' } },
    };
    return {
      type,
      data: { labels: g.type === 'nuage' ? undefined : d.categories, datasets },
      options: {
        responsive: false,
        maintainAspectRatio: false,
        animation: apercu ? false : { duration: 250 },
        indexAxis: g.type === 'barres' ? 'y' : 'x',
        scales: axes,
        cutout: g.type === 'anneau' ? '55%' : undefined,
        plugins: {
          title: { display: Boolean(g.titre), text: g.titre || '', color: th.texte, font: { ...police, size: police.size + 3, weight: '600' }, padding: { bottom: 8 } },
          legend: { display: legende !== 'aucune', position: { bas: 'bottom', droite: 'right', haut: 'top' }[legende] || 'bottom', labels: { color: th.texte, font: police, boxWidth: 12, boxHeight: 12 } },
          tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label ? `${ctx.dataset.label} : ` : ''}${nombre(ctx.parsed?.y ?? ctx.parsed)}` } },
        },
        layout: { padding: { left: 10, right: 16, top: 10, bottom: 8 } },
      },
    };
  }

  // --- L'affichage sur la feuille ---
  function init() {
    calque = el('div', { id: 'graphiques' });
    $('#grille').append(calque);
    Classeur.ecouter(() => rafraichir());
    // Un clic dans la grille désélectionne le graphique.
    $('#defil').addEventListener('pointerdown', () => choisir(null), true);
    document.addEventListener('keydown', (e) => {
      if (!choisi || e.target.closest?.('input, textarea, select, .modal, .claude-panneau')) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); e.stopPropagation(); supprimer(choisi); }
      if (e.key === 'Escape') { e.stopPropagation(); choisir(null); }
    }, true);
  }

  const graphiquesDe = (f) => Classeur.meta(f)?.graphiques || [];
  const trouver = (id) => { for (const f of Classeur.feuilles()) { const g = graphiquesDe(f.id).find((x) => x.id === id); if (g) return { g, feuille: f.id }; } return null; };

  // Crée, met à jour ou retire les graphiques de la feuille affichée.
  function rafraichir() {
    if (!calque) return;
    const f = Grille.feuille();
    if (f !== feuilleAffichee) { feuilleAffichee = f; choisi = null; }
    const liste = graphiquesDe(f);
    const ids = new Set(liste.map((g) => g.id));
    for (const [id, v] of vues) if (!ids.has(id)) { v.chart?.destroy(); v.el.remove(); vues.delete(id); }
    for (const g of liste) {
      let v = vues.get(g.id);
      if (!v) {
        v = creerVue(g);
        vues.set(g.id, v);
      }
      // On ne redessine que si le graphique ou ses données ont changé.
      const cle = JSON.stringify(g) + (document.body.classList.contains('grille-claire') ? 'c' : 's');
      if (v.version !== Classeur.version() || v.cle !== cle) {
        v.version = Classeur.version();
        dessinerVue(v, g, v.cle !== cle);
        v.cle = cle;
      }
    }
    positionner();
  }

  function creerVue(g) {
    const e = el('div', { className: 'graphique' });
    const canvas = el('canvas');
    const poignee = el('div', { className: 'graphique-poignee', title: 'Glisser pour changer la taille' });
    const message = el('div', { className: 'graphique-message' });
    e.append(canvas, message, poignee);
    calque.append(e);
    const v = { el: e, canvas, message, chart: null, id: g.id };
    e.addEventListener('pointerdown', (ev) => commencerGlisser(ev, v, ev.target === poignee ? 'taille' : 'bouger'));
    e.addEventListener('dblclick', () => modifier(v.id));
    e.addEventListener('contextmenu', (ev) => { ev.preventDefault(); choisir(v.id); menu(v.id, { x: ev.clientX, y: ev.clientY }); });
    return v;
  }

  function dessinerVue(v, g, refaire) {
    const d = lire(g);
    v.message.textContent = d.erreur || '';
    v.message.hidden = !d.erreur;
    const z = Grille.zoom();
    const w = Math.round(g.largeur * z), h = Math.round(g.hauteur * z);
    if (d.erreur) { v.chart?.destroy(); v.chart = null; return; }
    const cfg = config(g, d);
    if (v.chart && !refaire && v.w === w && v.h === h) {
      // Seules les valeurs ont changé : on garde le graphique et on anime vers les nouvelles.
      v.chart.data = cfg.data;
      v.chart.update();
      return;
    }
    v.chart?.destroy();
    v.canvas.width = w;
    v.canvas.height = h;
    v.canvas.style.width = `${w}px`;
    v.canvas.style.height = `${h}px`;
    v.w = w; v.h = h;
    if (!refaire) cfg.options.animation = false;
    v.chart = new Chart(v.canvas, cfg);
  }

  // Place chaque graphique selon sa cellule d'ancrage (et le défilement de la grille).
  function positionner() {
    if (!calque) return;
    const z = Grille.zoom();
    const zone = Grille.zoneCellules();
    calque.style.left = `${zone.x}px`;
    calque.style.top = `${zone.y}px`;
    for (const g of graphiquesDe(Grille.feuille())) {
      const v = vues.get(g.id);
      if (!v) continue;
      const rc = Grille.rectCellule(g.ancre.r, g.ancre.c);
      const w = Math.round(g.largeur * z), h = Math.round(g.hauteur * z);
      v.el.style.left = `${rc.x - zone.x + (g.ancre.dx || 0) * z}px`;
      v.el.style.top = `${rc.y - zone.y + (g.ancre.dy || 0) * z}px`;
      v.el.style.width = `${w}px`;
      v.el.style.height = `${h}px`;
      v.el.classList.toggle('choisi', choisi === g.id);
      if (v.chart && (v.w !== w || v.h !== h)) dessinerVue(v, g, true);
    }
  }

  function choisir(id) {
    if (choisi === id) return;
    choisi = id;
    for (const v of vues.values()) v.el.classList.toggle('choisi', v.id === id);
  }

  // Déplacer (glisser le graphique) ou changer la taille (glisser la poignée).
  function commencerGlisser(ev, v, mode) {
    if (ev.button !== 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    choisir(v.id);
    const t = trouver(v.id);
    if (!t) return;
    const { g, feuille } = t;
    const z = Grille.zoom();
    const x0 = ev.clientX, y0 = ev.clientY;
    const gauche = parseFloat(v.el.style.left), haut = parseFloat(v.el.style.top);
    const w0 = parseFloat(v.el.style.width), h0 = parseFloat(v.el.style.height);
    let bouge = false;
    v.el.setPointerCapture(ev.pointerId);
    const surBouger = (e) => {
      const dx = e.clientX - x0, dy = e.clientY - y0;
      if (!bouge && Math.abs(dx) + Math.abs(dy) < 3) return;
      bouge = true;
      if (mode === 'bouger') { v.el.style.left = `${gauche + dx}px`; v.el.style.top = `${haut + dy}px`; }
      else { v.el.style.width = `${Math.max(160, w0 + dx)}px`; v.el.style.height = `${Math.max(110, h0 + dy)}px`; }
    };
    const surFin = () => {
      v.el.removeEventListener('pointermove', surBouger);
      v.el.removeEventListener('pointerup', surFin);
      v.el.removeEventListener('pointercancel', surFin);
      if (!bouge) return;
      const zone = Grille.zoneCellules();
      if (mode === 'bouger') {
        const a = Grille.celluleA(parseFloat(v.el.style.left) + zone.x, parseFloat(v.el.style.top) + zone.y);
        changer(feuille, g.id, { ancre: { r: Math.max(0, a.r), c: Math.max(0, a.c), dx: Math.max(0, Math.round(a.dx)), dy: Math.max(0, Math.round(a.dy)) } }, 'déplacer le graphique');
      } else {
        changer(feuille, g.id, { largeur: Math.round(parseFloat(v.el.style.width) / z), hauteur: Math.round(parseFloat(v.el.style.height) / z) }, 'taille du graphique');
      }
    };
    v.el.addEventListener('pointermove', surBouger);
    v.el.addEventListener('pointerup', surFin);
    v.el.addEventListener('pointercancel', surFin);
  }

  // --- Les modifications (annulables) ---
  function ajouter(feuille, g) {
    const n = { type: 'colonnes', legende: null, titre: '', empile: false, series: null, largeur: LARGEUR, hauteur: HAUTEUR, ...g, id: MFC.nouvelId() };
    n.donnees = { feuille: g.donnees.feuille, plage: { ...g.donnees.plage } };
    n.ancre = { dx: 0, dy: 0, ...g.ancre };
    Classeur.faire('insérer un graphique', { feuilles: [feuille], meta: () => { Classeur.meta(feuille).graphiques.push(n); } });
    choisir(n.id);
    rafraichir();
    return n;
  }
  function changer(feuille, id, patch, nom = 'modifier le graphique') {
    Classeur.faire(nom, {
      feuilles: [feuille],
      meta: () => {
        const g = Classeur.meta(feuille).graphiques.find((x) => x.id === id);
        if (g) Object.assign(g, JSON.parse(JSON.stringify(patch)));
      },
    });
  }
  function supprimer(id) {
    const t = trouver(id);
    if (!t) return;
    Classeur.faire('supprimer le graphique', { feuilles: [t.feuille], meta: () => { const m = Classeur.meta(t.feuille); m.graphiques = m.graphiques.filter((x) => x.id !== id); } });
    if (choisi === id) choisi = null;
  }

  // --- La fenêtre « Graphique » (créer ou modifier), avec un aperçu en direct ---
  function fenetre(depart, { titreFenetre, ok }) {
    const zoneApercu = el('div', { className: 'graphique-apercu' });
    const canvasApercu = el('canvas', { width: 440, height: 250 });
    zoneApercu.append(canvasApercu);
    let chartApercu = null;
    const tuiles = el('div', { className: 'graphique-types' });
    let type = depart.type || 'colonnes';
    let api = null;
    for (const [k, t] of Object.entries(TYPES)) {
      const b = el('button', { type: 'button', className: `graphique-type${k === type ? ' actif' : ''}`, title: t.nom }, el('i', { className: `codicon codicon-${t.icone}${k === 'barres' ? '' : ''}` }), el('span', { textContent: t.nom }));
      b.onclick = () => { type = k; $$('.graphique-type', tuiles).forEach((x) => x.classList.toggle('actif', x === b)); majApercu(api.values()); };
      tuiles.append(b);
    }
    const lireForm = (v) => {
      const plage = lirePlage(String(v.plage).replace(/^.*!/, ''));
      const nomF = String(v.plage).includes('!') ? String(v.plage).split('!')[0].replace(/^'|'$/g, '') : null;
      const feuilleDonnees = nomF ? Classeur.idFeuille(nomF) : depart.donnees.feuille;
      return {
        type,
        donnees: { feuille: feuilleDonnees ?? depart.donnees.feuille, plage: plage || depart.donnees.plage },
        titre: v.titre,
        legende: v.legende === 'auto' ? null : v.legende,
        series: v.series === 'auto' ? null : v.series,
        empile: v.empile,
      };
    };
    function majApercu(v) {
      const g = { ...depart, ...lireForm(v) };
      const d = lire(g);
      chartApercu?.destroy();
      chartApercu = null;
      if (d.erreur) return;
      const cfg = config(g, d, { apercu: true });
      chartApercu = new Chart(canvasApercu, cfg);
      api.inputs.empile.row.hidden = !['colonnes', 'barres', 'aires'].includes(type);
    }
    const nomPlage = (g) => `${g.donnees.feuille !== Grille.feuille() ? `'${Classeur.nomFeuille(g.donnees.feuille)}'!` : ''}${adressePlage(g.donnees.plage)}`;
    return Dialogs.form({
      title: titreFenetre,
      okLabel: ok,
      width: 720,
      fields: [
        { type: 'element', element: tuiles },
        { type: 'element', element: zoneApercu },
        { key: 'plage', label: 'Données', type: 'text', value: nomPlage(depart) },
        { key: 'titre', label: 'Titre', type: 'text', value: depart.titre || '', placeholder: 'Sans titre' },
        { key: 'series', label: 'Séries', type: 'select', value: depart.series || 'auto', choices: [['auto', 'Deviner'], ['colonnes', 'Une série par colonne'], ['lignes', 'Une série par ligne']] },
        { key: 'legende', label: 'Légende', type: 'select', value: depart.legende || 'auto', choices: [['auto', 'Automatique'], ['bas', 'En bas'], ['droite', 'À droite'], ['haut', 'En haut'], ['aucune', 'Aucune']] },
        { key: 'empile', label: 'Empiler les séries', type: 'checkbox', value: Boolean(depart.empile) },
      ],
      onInput: (v, a) => { api = a; majApercu(v); },
    }).then((v) => {
      chartApercu?.destroy();
      return v ? lireForm(v) : null;
    });
  }

  // Insertion › Graphique : sur la sélection (ou le tableau autour de la cellule active).
  async function inserer(plageDonnees) {
    const f = Grille.feuille();
    const plage = plageDonnees;
    const g0 = { type: 'colonnes', donnees: { feuille: f, plage } };
    const r = await fenetre(g0, { titreFenetre: 'Insérer un graphique', ok: 'Insérer' });
    if (!r) return null;
    // À droite des données, en haut du tableau.
    const ancre = { r: r.donnees.plage.r1, c: Math.min(MAX_COLONNES - 8, r.donnees.plage.c2 + 2), dx: 0, dy: 0 };
    return ajouter(f, { ...r, ancre });
  }
  async function modifier(id) {
    const t = trouver(id);
    if (!t) return;
    const r = await fenetre(t.g, { titreFenetre: 'Modifier le graphique', ok: 'Enregistrer' });
    if (r) changer(t.feuille, id, r);
  }
  function menu(id, point) {
    const t = trouver(id);
    if (!t) return;
    Fenetres.menu(point, [
      ['Modifier…', () => modifier(id), 'double-clic', { icone: 'edit' }],
      ['Type', null, null, { icone: 'graph', sous: Object.entries(TYPES).map(([k, x]) => [x.nom, () => changer(t.feuille, id, { type: k }), null, { coche: t.g.type === k }]) }],
      ['Sélectionner les données', () => { if (t.g.donnees.feuille !== Grille.feuille()) App.claude.changerFeuille(t.g.donnees.feuille); Grille.selectionner(t.g.donnees.plage); }, null, { icone: 'table' }],
      null,
      ['Supprimer', () => supprimer(id), 'Suppr', { icone: 'trash' }],
    ]);
  }

  // Une image du graphique (pour Claude).
  function image(id) {
    const v = vues.get(id);
    return v?.chart ? v.canvas : null;
  }

  return { TYPES, PALETTE, LARGEUR, HAUTEUR, init, rafraichir, positionner, lire, ajouter, changer, supprimer, inserer, modifier, image, choisi: () => choisi, trouver };
})();
