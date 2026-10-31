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
      // Tafl 1.4 (Saga 1.6) : les habitants qu'il loge, et les ouvriers qu'il lui faut pour produire.
      logement: int(b?.logement, 0, 0, 999),
      ouvriers: int(b?.ouvriers, 0, 0, 999),
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
    // Tafl 1.4 (Saga 1.6) : les habitants.
    habitants_depart: int(g?.habitants_depart, 0, 0, 9999),
    repas: normQuantites(g?.repas),
    arrivees: int(g?.arrivees, 1, 0, 99),
  });

  const U = () => Donnees.ui;
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
      section('Sur la carte'), ...placeChamps(b, ctx),
      info('Chaque nuit (commande Dormir), les bâtiments finis produisent s\'il y a dans le stock ce qu\'ils consomment, puis les chantiers avancent d\'une nuit : un bâtiment fini cette nuit produit à partir de la suivante. La commande « Construire un bâtiment » le paie et lance son chantier ; une page avec la condition « Un bâtiment est construit » le montre sur la carte.'),
      section('Utilisation'), ctx.usages('batiment', b.id),
    );
  }

  // Où et comment le bâtiment se pose (placement libre, dans une zone « Constructible ») : son tampon (sa
  // taille vient de lui), celui du chantier, sa taille sans tampon, et la case de la porte qu'on traverse.
  function placeChamps(b, ctx) {
    const { champ, info, nombreIn, sel } = U();
    const noms = arr(ctx.doc?.stamps).map((st) => st.name);
    const choix = (vide) => [['', vide], ...noms.map((n) => [n, n]), ...[b.tampon, b.tampon_chantier].filter((n) => n && !noms.includes(n)).map((n) => [n, `${n} (inconnu)`])];
    const taille = el('div', { className: 'field-grid' });
    const majTaille = () => {
      const st = arr(ctx.doc?.stamps).find((x) => x.name === b.tampon);
      taille.replaceChildren(...(st
        ? [info(`Taille : ${st.w} × ${st.h} cases (celle du tampon).`)]
        : [champ('Largeur', nombreIn(b, 'largeur', 1, 32), 'cases'), champ('Hauteur', nombreIn(b, 'hauteur', 1, 32), 'cases')]));
    };
    majTaille();
    const porte = el('input', { type: 'checkbox', checked: Boolean(b.porte) });
    const casePorte = el('div', { className: 'field-grid' });
    const majPorte = () => {
      casePorte.replaceChildren(...(b.porte ? [champ('Porte : colonne', nombreIn(b.porte, 'x', 0, 31), 'depuis la gauche, 0 = la première'), champ('Porte : rangée', nombreIn(b.porte, 'y', 0, 31), 'depuis le haut')] : []));
    };
    porte.onchange = () => { b.porte = porte.checked ? { x: 0, y: 0 } : null; majPorte(); };
    majPorte();
    return [
      el('div', { className: 'field-grid' }, [
        champ('Tampon', sel(choix('Aucun (un rectangle)'), b.tampon, (v) => { b.tampon = v; majTaille(); })),
        champ('Tampon du chantier', sel(choix('Le bâtiment, en transparence'), b.tampon_chantier, (v) => { b.tampon_chantier = v; })),
      ]),
      taille,
      champ('Une porte', porte, 'une case de l\'emprise qu\'on traverse'),
      casePorte,
      info('Le joueur pose le bâtiment où il veut dans une zone de type « Constructible » de la carte (menu de pause › Construire, ou la commande « Placer un bâtiment »). Son emprise bloque le passage, sauf la porte. Les tampons se créent dans l\'éditeur de cartes.'),
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

  // Les réglages du module, sous sa case dans Réglages › Règles du jeu › Modules.
  function formReglages(r, ctx) {
    const { champ, info, nombreIn, texteIn } = U();
    if (!r.modules_reglages || typeof r.modules_reglages !== 'object') r.modules_reglages = {};
    const g = r.modules_reglages.gestion = normReglages(r.modules_reglages.gestion);
    const menu = el('input', { type: 'checkbox', checked: g.menu });
    menu.onchange = () => { g.menu = menu.checked; };
    const construire = el('input', { type: 'checkbox', checked: g.construire_menu });
    construire.onchange = () => { g.construire_menu = construire.checked; };
    return [
      el('div', { className: 'field-grid' }, [
        champ('Nom du domaine', texteIn(g, 'nom', 'Domaine')),
        champ('Capacité du stock', nombreIn(g, 'capacite', 0, 99999), 'par ressource (0 = sans limite)'),
      ]),
      champ('Dans le menu de pause', menu, 'l\'écran du domaine'),
      champ('Construire depuis le menu de pause', construire, 'sur une carte qui a une zone Constructible'),
      tableQuantites(ctx, g, 'stock_depart', 'Stock de départ', 'Le stock commence vide.'),
      el('div', { className: 'field-grid' }, [
        champ('Habitants au départ', nombreIn(g, 'habitants_depart', 0, 9999)),
        champ('Arrivées par nuit', nombreIn(g, 'arrivees', 0, 99), 'au plus, s\'il reste un logement (0 = seulement par la commande)'),
      ]),
      tableQuantites(ctx, g, 'repas', 'Repas d\'un habitant, chaque nuit', 'Les habitants ne mangent rien.'),
      info('Les habitants logent dans les bâtiments finis (leur champ Logement). Chaque nuit, ils mangent dans le stock ; ceux qui n\'ont pas mangé ne travaillent pas, et personne n\'arrive cette nuit-là. Un bâtiment qui demande des ouvriers ne produit que s\'il les a tous.'),
      info('Les ressources et les bâtiments se créent dans Données › Ressources et Bâtiments (groupe Gestion). Le temps passe quand le joueur dort (commande Dormir).'),
    ];
  }

  function resumer(doc, sorte, o) {
    if (sorte === 'ressources') return `${o.id} « ${o.nom} »${o.objet ? `, objet du sac ${o.objet}` : ''}${o.description ? ` : ${o.description}` : ''}`;
    if (sorte === 'batiments') return `${o.id} « ${o.nom} » coût [${dire(doc.data, o.cout) || 'gratuit'}], chantier ${o.jours} nuit(s)${o.maximum ? `, au plus ${o.maximum}` : ''}${o.tampon ? `, tampon ${o.tampon}` : `, ${o.largeur}×${o.hauteur} cases`}${o.porte ? `, porte (${o.porte.x}, ${o.porte.y})` : ''}${o.logement ? `, loge ${o.logement}` : ''}${o.ouvriers ? `, ${o.ouvriers} ouvrier(s)` : ''}, produit [${dire(doc.data, o.production) || 'rien'}]${o.consommation.length ? `, consomme [${dire(doc.data, o.consommation)}]` : ''}`;
    return null;
  }
  // Où une ressource ou un bâtiment est utilisé (Donnees.utilisations).
  function utilisations(doc, sorte, id, out) {
    if (sorte !== 'ressource' && sorte !== 'batiment') return;
    Events.parcourirJeu(doc, ({ commande, condition, ev, map, page }) => {
      const c = commande || condition;
      const ici = `${map.name} › ${ev.nom || ev.id}${ev.pages.length > 1 ? ` (page ${page + 1})` : ''}`;
      if (sorte === 'ressource' && c.type === 'gestion_stock' && c.ressource === id) out.add(ici);
      if (sorte === 'batiment' && ['gestion_construire', 'gestion_placer', 'gestion_batiment', 'gestion_chantier'].includes(c.type) && c.batiment === id) out.add(ici);
    });
    if (sorte === 'ressource') {
      for (const b of doc.data.batiments || []) if ([...b.cout, ...b.production, ...b.consommation].some((q) => q.ressource === id)) out.add(`Bâtiment ${b.nom}`);
      if ((doc.data.reglages?.modules_reglages?.gestion?.stock_depart || []).some((q) => q.ressource === id)) out.add('Réglages (stock de départ)');
    }
  }

  return { SORTES, NORMES, ONGLETS, MODULE, normReglages, normQuantites, listes, resumer, utilisations, formReglages };
})();
