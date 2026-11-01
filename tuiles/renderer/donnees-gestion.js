// Les données du module « gestion » (Tafl 1.3, joué par Saga 1.5 : moteur/renderer/moteur/modules/gestion/).
// Deux sortes : les ressources (bois, pierre, blé…) et les bâtiments (ce qu'ils coûtent, combien de nuits de
// chantier, ce qu'ils produisent et consomment chaque nuit) ; et ses réglages, dans Réglages › Règles du
// jeu › Modules (reglages.modules_reglages.gestion). Le format est dans ../FORMAT.md › « Le module gestion ».
//
// Comme donnees-jdr.js : ce fichier est lu avant donnees.js, qui prend ses sortes, ses normes et ses
// onglets. Ses onglets ne se montrent que si le jeu active le module (onglet.modules). Les normes gardent
// les champs qu'elles ne connaissent pas : un jeu écrit à la main ou par un Tafl plus récent ne perd rien.

const DonneesGestion = (() => {
  const SORTES = ['ressources', 'batiments'];
  const MODULE = ['gestion'];

  const str = (v, d = '') => (v === undefined || v === null || typeof v === 'object' ? d : String(v));
  const int = (v, d = 0, min = -Infinity, max = Infinity) => { const n = Math.round(Number(v)); return v !== '' && v !== null && Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : d; };
  const arr = (v) => (Array.isArray(v) ? v : []);
  const propre = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? JSON.parse(JSON.stringify(o)) : {});
  const ident = (v, d) => (typeof Doc !== 'undefined' ? Doc.slug(v, d) : String(v || d));
  // Une liste [{ ressource, nombre }] (coût, production, consommation, stock de départ).
  const normQuantites = (l) => arr(l).filter((q) => q && q.ressource).slice(0, 20).map((q) => ({ ressource: ident(q.ressource, ''), nombre: int(q.nombre, 1, 1, 99999) })).filter((q) => q.ressource);

  // Ce que fait la faim des habitants (Saga 1.6.1). Dans tous les cas, ils travaillent quand même.
  const FAIMS = [['arrivees', 'Personne n\'arrive tant que quelqu\'un a faim'], ['rien', 'Rien (seulement le rapport du matin)'], ['departs', 'Personne n\'arrive, et après plusieurs nuits de faim, des habitants partent']];

  // Tafl 1.9 (Saga 1.11) : le repos d'un bâtiment. quand : 'visite' (on vient s'y reposer, commande « Se
  // reposer ») ou 'matin' (chaque matin, tant qu'il est debout) ; soigner, un bonus (stats en %) pour
  // `combats` combats (0 : toute la journée), et le coût d'une visite.
  const QUANDS = [['', 'Pas un lieu de repos'], ['visite', 'Quand on vient s\'y reposer (commande « Se reposer »)'], ['matin', 'Chaque matin, tant qu\'il est debout']];
  const normRepos = (r) => (r && typeof r === 'object' && ['visite', 'matin'].includes(r.quand) ? {
    ...propre(r), quand: r.quand, nom: str(r.nom).slice(0, 60), soigner: r.soigner !== false,
    stats: arr(r.stats).filter((q) => q && q.stat).slice(0, 6).map((q) => ({ stat: str(q.stat).slice(0, 32), pourcent: int(q.pourcent, 10, -90, 200) })),
    combats: int(r.combats, 0, 0, 99), cout: normQuantites(r.cout),
  } : null);

  const NORMES = {
    ressources: (r, i) => ({
      ...propre(r),
      id: ident(r?.id || r?.nom, `ressource-${i + 1}`),
      nom: str(r?.nom || r?.id, `Ressource ${i + 1}`).slice(0, 60),
      description: str(r?.description).slice(0, 200),
      icone: str(r?.icone),
      objet: ident(r?.objet, ''),
    }),
    batiments: (b, i) => ({
      ...propre(b),
      id: ident(b?.id || b?.nom, `batiment-${i + 1}`),
      nom: str(b?.nom || b?.id, `Bâtiment ${i + 1}`).slice(0, 60),
      description: str(b?.description).slice(0, 200),
      cout: normQuantites(b?.cout),
      jours: int(b?.jours, 1, 0, 999),
      production: normQuantites(b?.production),
      consommation: normQuantites(b?.consommation),
      maximum: int(b?.maximum, 0, 0, 999),
      // Tafl 1.3 (placement libre) : l'apparence (un tampon, par son nom), la taille sans tampon, la porte.
      tampon: str(b?.tampon).slice(0, 80),
      tampon_chantier: str(b?.tampon_chantier).slice(0, 80),
      largeur: int(b?.largeur, 1, 1, 32),
      hauteur: int(b?.hauteur, 1, 1, 32),
      porte: b?.porte && typeof b.porte === 'object' ? { x: int(b.porte.x, 0, 0, 31), y: int(b.porte.y, 0, 0, 31) } : null,
      // Tafl 1.4.1 : le passage case par case ('bloque', 'libre', 'porte', 'auto') et où mène la porte.
      passage: Array.isArray(b?.passage) ? b.passage.slice(0, 1024).map((v) => (['bloque', 'libre', 'porte', 'auto'].includes(v) ? v : 'auto')) : null,
      porte_vers: b?.porte_vers && typeof b.porte_vers === 'object' && b.porte_vers.carte ? { carte: str(b.porte_vers.carte), x: int(b.porte_vers.x, 0, 0, 9999), y: int(b.porte_vers.y, 0, 0, 9999), direction: ['haut', 'bas', 'gauche', 'droite'].includes(b.porte_vers.direction) ? b.porte_vers.direction : 'haut' } : null,
      interieur: b?.interieur === 'partage' ? 'partage' : 'propre',
      // Tafl 1.4 (Saga 1.6) : les habitants qu'il loge, et les ouvriers qu'il lui faut pour produire.
      logement: int(b?.logement, 0, 0, 999),
      ouvriers: int(b?.ouvriers, 0, 0, 999),
      // Tafl 1.9 (Saga 1.11) : un bâtiment de repos (spa, bains, cuisine), ou null.
      repos: normRepos(b?.repos),
    }),
  };
  // Les réglages du module : reglages.modules_reglages.gestion.
  const normReglages = (g) => ({
    ...propre(g),
    nom: str(g?.nom).slice(0, 40) || 'Domaine',
    stock_depart: normQuantites(g?.stock_depart),
    capacite: int(g?.capacite, 0, 0, 99999),
    menu: g?.menu !== false,
    construire_menu: g?.construire_menu !== false,
    // Tafl 1.11 (Saga 1.13) : les écrans du domaine.
    rapport_bilan: g?.rapport_bilan !== false,
    prevision: g?.prevision !== false,
    carnet_resume: g?.carnet_resume !== false,
    // Tafl 1.11 : les pastilles des ressources sans icône, et les mots des écrans (vide : celui de Saga).
    pastilles: g?.pastilles !== false,
    textes: Object.fromEntries(Object.keys(TEXTES()).map((k) => [k, str(g?.textes?.[k]).slice(0, 60)]).filter(([, v]) => v)),
    // Tafl 1.4 (Saga 1.6) : les habitants.
    habitants_depart: int(g?.habitants_depart, 0, 0, 9999),
    repas: normQuantites(g?.repas),
    arrivees: int(g?.arrivees, 1, 0, 99),
    // Tafl 1.13 (Saga 1.15) : les habitants nommés, dans l'ordre d'arrivée (des ids de personnages).
    habitants_noms: [...new Set(arr(g?.habitants_noms).map((x) => str(x)).filter(Boolean))].slice(0, 200),
    // Tafl 1.4.1 : ce que fait la faim (voir FAIMS).
    faim: FAIMS.some(([k]) => k === g?.faim) ? g.faim : 'arrivees',
    faim_nuits: int(g?.faim_nuits, 3, 1, 99),
    // Tafl 1.7 (Saga 1.9) : les habitants qu'on voit marcher, et les sentiers qu'ils creusent.
    promeneurs: g?.promeneurs !== false,
    promeneur_perso: str(g?.promeneur_perso).slice(0, 64),
    promeneurs_max: int(g?.promeneurs_max, 12, 1, 40),
    usure: g?.usure !== false,
    tuile_usee: int(g?.tuile_usee, -1, -1, 99999),
    tuile_sentier: int(g?.tuile_sentier, -1, -1, 99999),
    // Tafl 1.8 (Saga 1.10) : l'emploi du temps des habitants, quand le jeu a une horloge.
    horaires: g?.horaires !== false,
    heure_lever: int(g?.heure_lever, 7, 0, 23),
    heure_travail: int(g?.heure_travail, 8, 0, 23),
    heure_fin: int(g?.heure_fin, 17, 0, 23),
    heure_coucher: int(g?.heure_coucher, 21, 0, 23),
    seuil_usee: int(g?.seuil_usee, 6, 1, 9999),
    seuil_sentier: int(g?.seuil_sentier, 20, 1, 9999),
    usure_repousse: int(g?.usure_repousse, 2, 0, 9999),
    // Tafl 1.9 (Saga 1.11) : le lien avec les sorties.
    butin_au_stock: g?.butin_au_stock === true,
    perte_defaite: int(g?.perte_defaite, 0, 0, 100),
  });

  const U = () => Donnees.ui;
  // Tafl 1.11 : les mots des écrans du domaine, { cle: [défaut, libellé] } (le catalogue commun à Saga).
  const TEXTES = () => (typeof ModulesJeu !== 'undefined' && ModulesJeu.CATALOGUE.gestion.textes) || {};
  const datalist = (id, valeurs) => U().datalist(id, valeurs);
  function listes(data) {
    datalist('tafl-ressources', arr(data.ressources).map((r) => [r.id, r.nom]));
    datalist('tafl-batiments', arr(data.batiments).map((b) => [b.id, b.nom]));
  }
  const dire = (work, l) => l.map((q) => `${q.nombre} ${arr(work.ressources).find((r) => r.id === q.ressource)?.nom || q.ressource}`).join(', ');

  // Une table de quantités : une ressource et un nombre par ligne.
  function tableQuantites(ctx, o, cle, titre, aide) {
    const { table, refInfo, nombreIn, descNom } = U();
    if (!Array.isArray(o[cle])) o[cle] = [];
    listes(ctx.work);
    const box = table(o[cle], [
      ['Ressource', (q) => refInfo(q, 'ressource', 'tafl-ressources', 'bois', descNom(arr(ctx.work.ressources))), true],
      ['Nombre', (q) => nombreIn(q, 'nombre', 1, 99999)],
    ], () => ({ ressource: '', nombre: 1 }), { ajouter: '+ Ressource', max: 20, vide: aide });
    return el('div', { className: 'field field-block' }, [el('span', { className: 'field-label', textContent: titre }), box]);
  }

  function formRessource(r, ctx) {
    const { champ, info, blocImage, refInfo, descNom, section } = U();
    const idl = ctx.idLigne(r);
    Donnees.listes(ctx.work);
    ctx.form.append(
      champ('Nom', ctx.input(r, 'nom', 'Bois, Pierre, Blé…', idl.maj)), idl.el,
      el('label', { className: 'field field-textarea' }, [el('span', { className: 'field-label', textContent: 'Description' }), ctx.zone(r, 'description', 2, 'facultatif')]),
      blocImage(ctx, r, 'icone', 'Icône'),
      champ('Objet du sac', refInfo(r, 'objet', 'tafl-donnees-objets', 'facultatif : buche', descNom(arr(ctx.work.objets)))),
      info('L\'objet du sac est ce que le joueur rapporte d\'une récolte ou d\'un combat (donné par la commande Objet, ou le butin) : la commande « Déposer le sac au stock » le change en cette ressource. Sans objet, la ressource ne vient que des bâtiments et des commandes du stock.'),
      section('Utilisation'), ctx.usages('ressource', r.id),
    );
  }
  function formBatiment(b, ctx) {
    const { champ, info, nombreIn, section } = U();
    const idl = ctx.idLigne(b);
    ctx.form.append(
      champ('Nom', ctx.input(b, 'nom', 'La ferme, La scierie…', idl.maj)), idl.el,
      el('label', { className: 'field field-textarea' }, [el('span', { className: 'field-label', textContent: 'Description' }), ctx.zone(b, 'description', 2, 'facultatif')]),
      el('div', { className: 'field-grid' }, [
        champ('Chantier', nombreIn(b, 'jours', 0, 999), 'nuits (0 = construit tout de suite)'),
        champ('Au plus', nombreIn(b, 'maximum', 0, 999), 'bâtiments de ce type (0 = sans limite)'),
      ]),
      el('div', { className: 'field-grid' }, [
        champ('Logement', nombreIn(b, 'logement', 0, 999), 'habitants qu\'il loge une fois fini'),
        champ('Ouvriers', nombreIn(b, 'ouvriers', 0, 999), 'habitants qu\'il lui faut pour produire (0 = il produit seul)'),
      ]),
      tableQuantites(ctx, b, 'cout', 'Coût (pris dans le stock)', 'Gratuit.'),
      tableQuantites(ctx, b, 'production', 'Produit chaque nuit', 'Ne produit rien (un entrepôt, une maison…).'),
      tableQuantites(ctx, b, 'consommation', 'Consomme chaque nuit pour produire', 'Ne consomme rien.'),
      section('Repos'), ...reposChamps(b, ctx),
      section('Sur la carte'), ...placeChamps(b, ctx),
      info('Chaque nuit (commande Dormir), les bâtiments finis produisent s\'il y a dans le stock ce qu\'ils consomment, puis les chantiers avancent d\'une nuit : un bâtiment fini cette nuit produit à partir de la suivante. La commande « Construire un bâtiment » le paie et lance son chantier ; une page avec la condition « Un bâtiment est construit » le montre sur la carte.'),
      section('Utilisation'), ctx.usages('batiment', b.id),
    );
  }

  // Tafl 1.9 (Saga 1.11) : le repos (un spa : soin et Défense +10 % pour 3 combats).
  function reposChamps(b, ctx) {
    const { champ, info, nombreIn, sel, texteIn, table } = U();
    const stats = typeof Events !== 'undefined' ? Events.statsBonus({ data: ctx.work }) : [];
    const box = el('div');
    const maj = () => {
      const r = b.repos;
      if (!r) { box.replaceChildren(); return; }
      if (!Array.isArray(r.stats)) r.stats = [];
      if (!Array.isArray(r.cout)) r.cout = [];
      const soin = el('input', { type: 'checkbox', checked: r.soigner !== false });
      soin.onchange = () => { r.soigner = soin.checked; };
      const choix = (q) => [...stats, ...(q.stat && !stats.some(([k]) => k === q.stat) ? [[q.stat, `${q.stat} (pas dans ce pack)`]] : [])];
      const tStats = table(r.stats, [
        ['Statistique', (q) => sel(choix(q), q.stat, (v) => { q.stat = v; }), true],
        ['En %', (q) => nombreIn(q, 'pourcent', -90, 200)],
      ], () => ({ stat: stats[0]?.[0] || '', pourcent: 10 }), { ajouter: '+ Statistique', max: 6, vide: 'Pas de bonus (seulement le soin).' });
      box.replaceChildren(
        el('div', { className: 'field-grid' }, [
          champ('Nom du repos', texteIn(r, 'nom', b.nom || 'Les bains')),
          champ('Soigne le groupe', soin, 'PV et PM au maximum'),
        ]),
        el('div', { className: 'field field-block' }, [el('span', { className: 'field-label', textContent: 'Bonus pour tout le groupe, en combat' }), tStats]),
        champ('Pendant', nombreIn(r, 'combats', 0, 99), 'combats (0 = toute la journée), et au plus jusqu\'à la nuit'),
        ...(r.quand === 'visite' ? [tableQuantites(ctx, r, 'cout', 'Coût d\'une visite (pris dans le stock)', 'Gratuit.')] : []),
        info(r.quand === 'visite'
          ? 'Dans l\'intérieur du bâtiment (ou devant lui), mets un événement avec la commande « Se reposer » : un bassin, un lit, un comptoir. Le joueur y est soigné et son groupe reçoit le bonus, jusqu\'à la nuit ou pour le nombre de combats choisi.'
          : 'Chaque matin, tant que ce bâtiment est fini, le groupe reçoit son bonus pour la journée (le rapport du matin le dit). Deux bâtiments du même type ne le donnent qu\'une fois.'),
      );
    };
    const quand = sel(QUANDS, b.repos?.quand || '', (v) => {
      b.repos = v ? { ...(b.repos || { nom: '', soigner: true, stats: [{ stat: stats[0]?.[0] || 'defense', pourcent: 10 }], combats: 3, cout: [] }), quand: v } : null;
      maj();
    });
    maj();
    return [champ('Lieu de repos', quand), box];
  }

  // Où et comment le bâtiment se pose (placement libre, dans une zone « Constructible ») : son tampon (sa
  // taille vient de lui), celui du chantier, sa taille sans tampon, et (Tafl 1.4.1) son passage case par
  // case, réglé à la souris sur l'image du tampon : bloque, libre ou porte, et où mène la porte.
  const PASSAGES = [['bloque', 'Bloque', '#e5484d'], ['libre', 'Libre', '#46a758'], ['porte', 'Porte', '#3e9eff']];
  // Le passage proposé d'office : les rangées « dessus » (le toit) et les cases vides sont libres ; sinon la
  // tuile décide (son passage), et une tuile « auto » surtout transparente (une ombre) est libre.
  function passageDefaut(doc, b, st, w, h) {
    const out = [];
    for (let k = 0; k < w * h; k++) {
      const j = Math.floor(k / w);
      const n = st ? st.cells[k] : 0;
      const t = st && n >= 0 ? doc.tiles?.[n] : null;
      if (!st) { out.push('bloque'); continue; }
      if (j < (st.dessus || 0) || n < 0 || !t) { out.push('libre'); continue; }
      if (t.passage === 'libre' || t.passage === 'bloque') { out.push(t.passage); continue; }
      const px = t.frames?.[0];
      let pleins = 0;
      if (px) for (let a = 3; a < px.length; a += 4) if (px[a] > 128) pleins++;
      out.push(px && pleins >= px.length / 8 ? 'bloque' : 'libre'); // au moins la moitié des pixels
    }
    if (b.porte && b.porte.x < w && b.porte.y < h) out[b.porte.y * w + b.porte.x] = 'porte';
    return out;
  }
  function placeChamps(b, ctx) {
    const { champ, info, nombreIn, sel } = U();
    const doc = ctx.doc || {};
    const noms = arr(doc.stamps).map((st) => st.name);
    const choix = (vide) => [['', vide], ...noms.map((n) => [n, n]), ...[b.tampon, b.tampon_chantier].filter((n) => n && !noms.includes(n)).map((n) => [n, `${n} (inconnu)`])];
    const tampon = () => arr(doc.stamps).find((x) => x.name === b.tampon) || null;
    const taille = () => { const st = tampon(); return st ? [st.w, st.h] : [b.largeur || 1, b.hauteur || 1]; };
    // La grille du passage : l'image du tampon, une couleur par case. Un clic peint avec le pinceau choisi.
    let pinceau = 'bloque';
    const grille = el('canvas', { className: 'gestion-passage pixel' });
    const pinceaux = el('div', { className: 'gestion-pinceaux' });
    const vers = el('div');
    const majPorte = () => {
      const [w] = taille();
      const k = arr(b.passage).indexOf('porte');
      b.porte = k >= 0 ? { x: k % w, y: Math.floor(k / w) } : null;
      vers.replaceChildren(...(b.porte ? champsVers() : []));
    };
    const assurer = (refaire = false) => {
      const [w, h] = taille();
      if (refaire || !Array.isArray(b.passage) || b.passage.length !== w * h) b.passage = passageDefaut(doc, b, tampon(), w, h);
      majPorte();
    };
    const dessiner = () => {
      const [w, h] = taille();
      const st = tampon();
      const c = 32;
      grille.width = w * c; grille.height = h * c;
      const g = grille.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, grille.width, grille.height);
      for (let k = 0; k < w * h; k++) {
        const x = (k % w) * c, y = Math.floor(k / w) * c;
        const n = st ? st.cells[k] : -1;
        if (n >= 0 && doc.tiles?.[n] && typeof Doc !== 'undefined') g.drawImage(Doc.tileCanvas(doc.tiles[n], doc.tileSize), x, y, c, c);
        const coul = PASSAGES.find(([v]) => v === b.passage[k])?.[2] || '#888';
        g.fillStyle = `${coul}55`; g.fillRect(x, y, c, c);
        g.strokeStyle = coul; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, c - 2, c - 2);
        if (b.passage[k] === 'porte') { g.fillStyle = '#fff'; g.font = 'bold 14px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('P', x + c / 2, y + c / 2); }
      }
    };
    grille.onclick = (e) => {
      const [w, h] = taille();
      const r = grille.getBoundingClientRect();
      const i = Math.floor(((e.clientX - r.left) / r.width) * w), j = Math.floor(((e.clientY - r.top) / r.height) * h);
      if (i < 0 || j < 0 || i >= w || j >= h) return;
      const k = j * w + i;
      // Une seule porte : en poser une ailleurs rend l'ancienne libre.
      if (pinceau === 'porte') b.passage = b.passage.map((v) => (v === 'porte' ? 'libre' : v));
      b.passage[k] = pinceau;
      majPorte(); dessiner();
    };
    const majPinceaux = () => pinceaux.replaceChildren(...PASSAGES.map(([v, nom, coul]) => {
      const bt = el('button', { className: `chip${pinceau === v ? ' on' : ''}`, textContent: nom, style: `border-color: ${coul}` });
      bt.onclick = (e) => { e.preventDefault(); pinceau = v; majPinceaux(); };
      return bt;
    }), (() => { const bt = el('button', { className: 'chip', textContent: 'Recalculer', title: 'Le passage proposé d\'après les tuiles du tampon (toit et ombres libres)' }); bt.onclick = (e) => { e.preventDefault(); assurer(true); dessiner(); }; return bt; })());
    // Où mène la porte : une carte, une case, une direction (vide : nulle part, on la traverse simplement).
    function champsVers() {
      if (!b.porte_vers || typeof b.porte_vers !== 'object') b.porte_vers = { carte: '', x: 0, y: 0, direction: 'haut' };
      const cartes = [['', 'Nulle part (on la traverse)'], ...arr(doc.maps).map((m) => [m.id, m.name || m.id])];
      return [
        champ('La porte mène à', sel(cartes, b.porte_vers.carte, (v) => { b.porte_vers.carte = v; })),
        el('div', { className: 'field-grid' }, [
          champ('Colonne (x)', nombreIn(b.porte_vers, 'x', 0, 9999)),
          champ('Rangée (y)', nombreIn(b.porte_vers, 'y', 0, 9999)),
          champ('Regarde', sel([['haut', 'Vers le haut'], ['bas', 'Vers le bas'], ['gauche', 'Vers la gauche'], ['droite', 'Vers la droite']], b.porte_vers.direction, (v) => { b.porte_vers.direction = v; })),
        ]),
        champ('Intérieur', sel([['propre', 'Un intérieur à chaque bâtiment posé'], ['partage', 'Le même pour tous (une boutique, une grange commune)']], b.interieur === 'partage' ? 'partage' : 'propre', (v) => { b.interieur = v; })),
        info('« Un intérieur à chaque bâtiment » : chaque maison posée a sa propre copie de cette carte (ce qu\'on y ramasse ou y fait ne vaut que pour elle). Pour en ressortir : dans l\'intérieur, un déclencheur avec la commande « Ressortir du bâtiment » ramène le joueur devant la porte par laquelle il est entré.'),
      ];
    }
    const tailleBox = el('div', { className: 'field-grid' });
    const majTaille = () => {
      const st = tampon();
      tailleBox.replaceChildren(...(st
        ? [info(`Taille : ${st.w} × ${st.h} cases (celle du tampon).`)]
        : [champ('Largeur', nombreIn(b, 'largeur', 1, 32, 1, () => { assurer(true); dessiner(); }), 'cases'), champ('Hauteur', nombreIn(b, 'hauteur', 1, 32, 1, () => { assurer(true); dessiner(); }), 'cases')]));
    };
    assurer(); majTaille(); majPinceaux(); dessiner();
    return [
      el('div', { className: 'field-grid' }, [
        champ('Tampon', sel(choix('Aucun (un rectangle)'), b.tampon, (v) => { b.tampon = v; majTaille(); assurer(true); dessiner(); })),
        champ('Tampon du chantier', sel(choix('Le bâtiment, en transparence'), b.tampon_chantier, (v) => { b.tampon_chantier = v; })),
      ]),
      tailleBox,
      el('div', { className: 'field field-block' }, [el('span', { className: 'field-label', textContent: 'Passage : choisis un pinceau, puis clique sur les cases' }), pinceaux, grille]),
      vers,
      info('Le joueur pose le bâtiment où il veut dans une zone de type « Constructible » de la carte (carnet › Construire, ou la commande « Placer un bâtiment »). Les cases rouges bloquent, les vertes laissent passer (une ombre, le toit), la bleue est la porte. Les tampons se créent dans l\'éditeur de cartes.'),
    ];
  }

  const leadImage = (src) => el('img', { className: 'row-portrait pixel', src, alt: '' });
  const ONGLETS = [
    { key: 'ressources', modules: MODULE, groupe: 'Gestion', label: 'Ressources', icon: 'archive', kind: 'ressource', base: 'Nouvelle ressource',
      nouveau: (id) => NORMES.ressources({ id, nom: 'Nouvelle ressource' }), meta: (r) => (r.objet ? `objet ${r.objet}` : ''), lead: (r) => (r.icone ? leadImage(r.icone) : null),
      vide: 'Aucune ressource. Bois, pierre, blé, outils… : ce que le domaine garde dans son stock.', form: formRessource },
    { key: 'batiments', modules: MODULE, groupe: 'Gestion', label: 'Bâtiments', icon: 'tools', kind: 'batiment', base: 'Nouveau bâtiment',
      nouveau: (id) => NORMES.batiments({ id, nom: 'Nouveau bâtiment' }), meta: (b, work) => (b.production.length ? `produit ${dire(work, b.production)}` : `${b.jours} nuit(s)`),
      vide: 'Aucun bâtiment. Une ferme, une scierie, un entrepôt : ce qu\'ils coûtent et ce qu\'ils produisent chaque nuit.', form: formBatiment },
  ];

  // Tafl 1.11 : les mots des écrans du domaine, repliés (vide : le mot de Saga, montré en gris).
  function motsDesEcrans(g) {
    const { champ } = U();
    g.textes = g.textes && typeof g.textes === 'object' ? g.textes : {};
    const champs = Object.entries(TEXTES()).map(([k, [defaut, libelle]]) => {
      const i = el('input', { type: 'text', value: g.textes[k] || '', placeholder: defaut || '(le nom du domaine)', maxLength: 60 });
      i.oninput = () => { if (i.value.trim()) g.textes[k] = i.value; else delete g.textes[k]; };
      return champ(libelle, i);
    });
    return el('details', { className: 'reglages-details' }, el('summary', { textContent: 'Les mots des écrans du domaine (titres, libellés, bilan)' }), el('div', { className: 'field-grid' }, champs));
  }

  // Les réglages du module, sous sa case dans Réglages › Règles du jeu › Modules.
  function formReglages(r, ctx) {
    const { champ, info, nombreIn, texteIn } = U();
    if (!r.modules_reglages || typeof r.modules_reglages !== 'object') r.modules_reglages = {};
    const g = r.modules_reglages.gestion = normReglages(r.modules_reglages.gestion);
    const menu = el('input', { type: 'checkbox', checked: g.menu });
    menu.onchange = () => { g.menu = menu.checked; };
    const construire = el('input', { type: 'checkbox', checked: g.construire_menu });
    // Les nuits de faim avant un départ : seulement pour « des habitants partent ».
    const nuits = el('span');
    const majNuits = () => nuits.replaceChildren(...(g.faim === 'departs' ? [champ('Départ après', nombreIn(g, 'faim_nuits', 1, 99), 'nuits de faim de suite (un habitant par nuit ensuite)')] : []));
    majNuits();
    construire.onchange = () => { g.construire_menu = construire.checked; };
    // Tafl 1.11 : les écrans (le résumé dans le carnet, la prévision de la nuit, le bilan du matin).
    const caseA = (cle) => { const c = el('input', { type: 'checkbox', checked: g[cle] }); c.onchange = () => { g[cle] = c.checked; }; return c; };
    return [
      el('div', { className: 'field-grid' }, [
        champ('Nom du domaine', texteIn(g, 'nom', 'Domaine')),
        champ('Capacité du stock', nombreIn(g, 'capacite', 0, 99999), 'par ressource (0 = sans limite)'),
      ]),
      champ('Dans le carnet (Tab)', menu, 'l\'écran du domaine'),
      champ('Construire depuis le carnet (Tab)', construire, 'sur une carte qui a une zone Constructible'),
      champ('Résumé dans le carnet (Tab)', caseA('carnet_resume'), 'le stock en petites icônes, les habitants et les chantiers'),
      champ('Prévoir la nuit', caseA('prevision'), 'l\'écran du domaine dit ce que la nuit va changer au stock'),
      champ('Bilan du matin', caseA('rapport_bilan'), 'le rapport du matin commence par ce qui a bougé dans le stock, et pourquoi'),
      champ('Pastilles de couleur', caseA('pastilles'), 'une ressource sans icône montre une pastille avec son initiale'),
      motsDesEcrans(g),
      tableQuantites(ctx, g, 'stock_depart', 'Stock de départ', 'Le stock commence vide.'),
      el('div', { className: 'field-grid' }, [
        champ('Habitants au départ', nombreIn(g, 'habitants_depart', 0, 9999)),
        champ('Arrivées par nuit', nombreIn(g, 'arrivees', 0, 99), 'au plus, s\'il reste un logement (0 = seulement par la commande)'),
      ]),
      habitantsNommes(g, ctx, r),
      tableQuantites(ctx, g, 'repas', 'Repas d\'un habitant, chaque nuit', 'Les habitants ne mangent rien.'),
      el('div', { className: 'field-grid' }, [
        champ('Quand ils ont faim', U().sel(FAIMS, g.faim, (v) => { g.faim = v; majNuits(); })),
        nuits,
      ]),
      ...champsSorties(g),
      ...champsPromeneurs(g, ctx, r),
      info('Les habitants logent dans les bâtiments finis (leur champ Logement). Chaque nuit, ils mangent dans le stock ; s\'il en manque, ils travaillent quand même ; « Quand ils ont faim » dit ce qui se passe alors. Un bâtiment qui demande des ouvriers ne produit que s\'il les a tous.'),
      info('Les ressources et les bâtiments se créent dans Données › Ressources et Bâtiments (groupe Gestion). Le temps passe quand le joueur dort (commande Dormir).'),
    ];
  }

  // Tafl 1.13 (Saga 1.15) : les habitants nommés. Le premier arrivé est le premier de la liste, et ainsi de
  // suite ; au-delà, des habitants sans nom. Une pastille par personnage, dans l'ordre, et un choix pour en
  // ajouter.
  function habitantsNommes(g, ctx, r = {}) {
    const { info, petitBouton } = U();
    const persos = arr(ctx.work?.personnages).filter((p) => !p.heros);
    const nom = (id) => persos.find((p) => p.id === id)?.nom || `${id} (inconnu)`;
    const box = el('div', { className: 'chips' });
    const rendre = () => {
      const libres = persos.filter((p) => !g.habitants_noms.includes(p.id));
      const ajout = el('select');
      ajout.add(new Option(libres.length ? '+ un personnage' : 'Tous les personnages sont déjà là', ''));
      for (const p of libres) ajout.add(new Option(p.nom || p.id, p.id));
      ajout.onchange = () => { if (ajout.value) g.habitants_noms.push(ajout.value); rendre(); };
      box.replaceChildren(...g.habitants_noms.map((id, k) => el('span', { className: 'chip' }, [
        el('span', { textContent: `${k + 1}. ${nom(id)}` }),
        petitBouton('close', 'Retirer', () => { g.habitants_noms.splice(k, 1); rendre(); }),
      ])), ajout);
    };
    rendre();
    const relations = (r.modules || []).includes('relations');
    return el('div', { className: 'field field-block' }, [
      el('span', { className: 'field-label', textContent: 'Habitants nommés, dans l\'ordre d\'arrivée' }), box,
      info(`Le premier habitant qui arrive est le premier de la liste, avec son nom et son apparence ; au-delà, des habitants sans nom. ${relations ? 'Le joueur leur parle quand ils se promènent (module Relations : ajoute-les dans Données › Relations).' : 'Active aussi le module Relations pour que le joueur puisse leur parler quand ils se promènent.'}`),
    ]);
  }

  // Tafl 1.9 (Saga 1.11) : ce que les sorties (les combats) rapportent au domaine, ou lui coûtent.
  function champsSorties(g) {
    const { champ, info, nombreIn } = U();
    const butin = el('input', { type: 'checkbox', checked: g.butin_au_stock });
    butin.onchange = () => { g.butin_au_stock = butin.checked; };
    return [
      champ('Le butin va au stock', butin, 'après un combat gagné, les objets des ressources (leur « objet du sac ») vont tout seuls au stock'),
      champ('Défaite : le stock perd', nombreIn(g, 'perte_defaite', 0, 100), '% de chaque ressource (0 = rien)'),
      info('Sans « le butin va au stock », le joueur dépose son sac lui-même (commande « Déposer le sac au stock », sur un coffre ou un entrepôt). Les bâtiments de repos (Données › Bâtiments › Repos) donnent, eux, un soin et un bonus au groupe pour ses combats.'),
    ];
  }

  // Tafl 1.7 (Saga 1.9) : les habitants qu'on voit marcher, et les sentiers qui se creusent sous leurs pas.
  function champsPromeneurs(g, ctx, r = {}) {
    const { champ, info, nombreIn, sel } = U();
    const tuiles = [['-1', 'Dessinée par Saga'], ...arr(ctx.doc?.tiles).map((t, i) => [String(i), `${i}. ${t.name}`])];
    const persos = [['', 'Un petit bonhomme (une couleur chacun)'], ...arr(ctx.work?.personnages).map((p) => [p.id, p.nom || p.id])];
    const voir = el('input', { type: 'checkbox', checked: g.promeneurs });
    const user = el('input', { type: 'checkbox', checked: g.usure });
    const horaires = el('input', { type: 'checkbox', checked: g.horaires });
    const sansHorloge = (r.temps?.horloge || 'aucune') === 'aucune';
    const detailsVoir = el('div');
    const detailsUsure = el('div');
    const maj = () => {
      detailsVoir.replaceChildren(...(g.promeneurs ? [el('div', { className: 'field-grid' }, [
        champ('Leur apparence', sel(persos, g.promeneur_perso, (v) => { g.promeneur_perso = v; })),
        champ('Au plus', nombreIn(g, 'promeneurs_max', 1, 40), 'à la fois sur la carte'),
      ]),
      // Tafl 1.8 (Saga 1.10) : leur journée, à l'horloge du jeu.
      champ('Ils suivent l\'heure', horaires, sansHorloge ? 'le jeu n\'a pas d\'horloge (Réglages › Ambiance) : ils vont et viennent sans regarder l\'heure' : 'travail le jour, flânerie avant et après, chez eux la nuit'),
      ...(g.horaires ? [
        el('div', { className: 'field-grid' }, [
          champ('Lever', nombreIn(g, 'heure_lever', 0, 23), 'h'),
          champ('Coucher', nombreIn(g, 'heure_coucher', 0, 23), 'h'),
        ]),
        el('div', { className: 'field-grid' }, [
          champ('Travail de', nombreIn(g, 'heure_travail', 0, 23), 'h'),
          champ('à', nombreIn(g, 'heure_fin', 0, 23), 'h'),
        ]),
      ] : [])] : []));
      detailsUsure.replaceChildren(...(g.usure ? [
        el('div', { className: 'field-grid' }, [
          champ('Herbe tassée', sel(tuiles, String(g.tuile_usee), (v) => { g.tuile_usee = Number(v); })),
          champ('Après', nombreIn(g, 'seuil_usee', 1, 9999), 'passages'),
        ]),
        el('div', { className: 'field-grid' }, [
          champ('Sentier', sel(tuiles, String(g.tuile_sentier), (v) => { g.tuile_sentier = Number(v); })),
          champ('Après', nombreIn(g, 'seuil_sentier', 1, 9999), 'passages'),
        ]),
        champ('L\'herbe repousse de', nombreIn(g, 'usure_repousse', 0, 9999), 'passages par nuit (0 : jamais)'),
      ] : []));
    };
    voir.onchange = () => { g.promeneurs = voir.checked; maj(); };
    user.onchange = () => { g.usure = user.checked; maj(); };
    horaires.onchange = () => { g.horaires = horaires.checked; maj(); };
    maj();
    return [
      champ('On voit les habitants', voir, 'ils vont de chez eux au travail, flânent et rentrent'),
      detailsVoir,
      champ('Leurs pas creusent des sentiers', user, 'l\'herbe se tasse, puis un sentier se dessine là où ils passent souvent'),
      detailsUsure,
      info('Les habitants prennent le plus court chemin, mais préfèrent les cases déjà usées : les sentiers se renforcent d\'eux-mêmes. Une tuile « Dessinée par Saga » : une terre battue posée sur la carte. Un sentier qu\'on ne prend plus repousse, nuit après nuit.'),
    ];
  }

  function resumer(doc, sorte, o) {
    if (sorte === 'ressources') return `${o.id} « ${o.nom} »${o.objet ? `, objet du sac ${o.objet}` : ''}${o.description ? ` : ${o.description}` : ''}`;
    if (sorte === 'batiments') return `${o.id} « ${o.nom} » coût [${dire(doc.data, o.cout) || 'gratuit'}], chantier ${o.jours} nuit(s)${o.maximum ? `, au plus ${o.maximum}` : ''}${o.tampon ? `, tampon ${o.tampon}` : `, ${o.largeur}×${o.hauteur} cases`}${o.porte ? `, porte (${o.porte.x}, ${o.porte.y})` : ''}${o.logement ? `, loge ${o.logement}` : ''}${o.ouvriers ? `, ${o.ouvriers} ouvrier(s)` : ''}${o.repos ? `, repos ${o.repos.quand === 'matin' ? 'chaque matin' : 'en visite'} (${o.repos.soigner ? 'soigne, ' : ''}${o.repos.stats.map((q) => `${q.stat} ${q.pourcent > 0 ? '+' : ''}${q.pourcent} %`).join(', ') || 'sans bonus'}${o.repos.combats ? `, ${o.repos.combats} combat(s)` : ''})` : ''}, produit [${dire(doc.data, o.production) || 'rien'}]${o.consommation.length ? `, consomme [${dire(doc.data, o.consommation)}]` : ''}`;
    return null;
  }
  // Où une ressource ou un bâtiment est utilisé (Donnees.utilisations).
  function utilisations(doc, sorte, id, out) {
    if (sorte !== 'ressource' && sorte !== 'batiment') return;
    Events.parcourirJeu(doc, ({ commande, condition, ev, map, page }) => {
      const c = commande || condition;
      const ici = `${map.name} › ${ev.nom || ev.id}${ev.pages.length > 1 ? ` (page ${page + 1})` : ''}`;
      if (sorte === 'ressource' && c.type === 'gestion_stock' && c.ressource === id) out.add(ici);
      if (sorte === 'batiment' && ['gestion_construire', 'gestion_placer', 'gestion_batiment', 'gestion_chantier', 'gestion_repos'].includes(c.type) && c.batiment === id) out.add(ici);
    });
    if (sorte === 'ressource') {
      for (const b of doc.data.batiments || []) if ([...b.cout, ...b.production, ...b.consommation, ...(b.repos?.cout || [])].some((q) => q.ressource === id)) out.add(`Bâtiment ${b.nom}`);
      if ((doc.data.reglages?.modules_reglages?.gestion?.stock_depart || []).some((q) => q.ressource === id)) out.add('Réglages (stock de départ)');
    }
  }

  return { SORTES, NORMES, ONGLETS, MODULE, normReglages, normQuantites, listes, resumer, utilisations, formReglages };
})();
