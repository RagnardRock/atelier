// Les données du module « relations » (Tafl 1.13, joué par Saga 1.15 : moteur/renderer/moteur/modules/relations/).
// Une sorte : les relations, une par personnage (ce qu'il adore, aime ou n'aime pas, et ses paroles à chaque
// niveau d'affinité) ; et ses réglages, dans Réglages › Règles du jeu › Modules (reglages.modules_reglages.relations).
// Le format est dans ../FORMAT.md › « Le module relations ».
//
// Comme donnees-gestion.js : ce fichier est lu avant donnees.js, qui prend ses sortes, ses normes et ses
// onglets. Son onglet ne se montre que si le jeu active le module. Les normes gardent les champs qu'elles ne
// connaissent pas.

const DonneesRelations = (() => {
  const SORTES = ['relations'];
  const MODULE = ['relations'];

  const str = (v, d = '') => (v === undefined || v === null || typeof v === 'object' ? d : String(v));
  const int = (v, d = 0, min = -Infinity, max = Infinity) => { const n = Math.round(Number(v)); return v !== '' && v !== null && Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : d; };
  const arr = (v) => (Array.isArray(v) ? v : []);
  const propre = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? JSON.parse(JSON.stringify(o)) : {});
  const ident = (v, d) => (typeof Doc !== 'undefined' ? Doc.slug(v, d) : String(v || d));
  const objets = (l) => [...new Set(arr(l).map((x) => ident(x, '')).filter(Boolean))].slice(0, 60);
  const GOUTS = [['adore', 'Il adore'], ['aime', 'Il aime'], ['deteste', 'Il n\'aime pas']];
  const MERCIS = [['adore', 'Un cadeau qu\'il adore'], ['aime', 'Un cadeau qu\'il aime'], ['neutre', 'Un cadeau qui lui est égal'], ['deteste', 'Un cadeau qu\'il n\'aime pas']];
  // Les niveaux par défaut (les mêmes que Saga : RelationsCalcul.NIVEAUX).
  const NIVEAUX = [
    { nom: 'Inconnu', points: 0 }, { nom: 'Connaissance', points: 20 }, { nom: 'Ami', points: 60 },
    { nom: 'Bon ami', points: 120 }, { nom: 'Proche', points: 200 }, { nom: 'Inséparable', points: 300 },
  ];
  const CADEAUX = { adore: 30, aime: 15, neutre: 5, deteste: 0 };

  const NORMES = {
    // Une relation : son id est celui du personnage.
    relations: (r, i) => ({
      ...propre(r),
      id: ident(r?.id || r?.personnage, `personnage-${i + 1}`),
      nom: str(r?.nom).slice(0, 60),
      depart: int(r?.depart, 0, 0, 99999),
      adore: objets(r?.adore), aime: objets(r?.aime), deteste: objets(r?.deteste),
      paroles: arr(r?.paroles).filter((p) => p && typeof p === 'object').slice(0, 100)
        .map((p) => ({ niveau: int(p.niveau, 0, 0, 99), texte: str(p.texte).slice(0, 2000), expression: str(p.expression).slice(0, 40) })),
      merci: Object.fromEntries(MERCIS.map(([k]) => [k, str(r?.merci?.[k]).slice(0, 500)]).filter(([, v]) => v)),
    }),
  };

  // Les niveaux d'un jeu (reglages entiers) : ceux de modules_reglages.relations, sinon ceux par défaut.
  function niveaux(reglages) {
    const l = arr(reglages?.modules_reglages?.relations?.niveaux).filter((n) => n && str(n.nom).trim());
    return l.length >= 2 ? l : NIVEAUX;
  }

  // Tafl 1.13 : les mots des écrans et des réactions, { cle: [défaut, libellé] } (le catalogue commun à Saga).
  const TEXTES = () => (typeof ModulesJeu !== 'undefined' && ModulesJeu.CATALOGUE.relations?.textes) || {};

  // Les réglages du module : reglages.modules_reglages.relations.
  const normReglages = (g) => {
    let nv = arr(g?.niveaux).filter((n) => n && str(n.nom).trim()).slice(0, 20).map((n) => ({ nom: str(n.nom).slice(0, 40), points: int(n.points, 0, 0, 99999) }));
    if (nv.length < 2) nv = NIVEAUX.map((n) => ({ ...n }));
    return {
      ...propre(g),
      nom: str(g?.nom).slice(0, 40) || 'Relations',
      niveaux: nv,
      parler: int(g?.parler, 5, 0, 999),
      cadeaux: Object.fromEntries(Object.keys(CADEAUX).map((k) => [k, int(g?.cadeaux?.[k], CADEAUX[k], -999, 999)])),
      cadeaux_jour: int(g?.cadeaux_jour, 1, 0, 99),
      oubli: int(g?.oubli, 0, 0, 999),
      menu: g?.menu !== false,
      carnet: g?.carnet !== false,
      visibles: g?.visibles === 'tous' ? 'tous' : 'rencontres',
      gouts: ['tous', 'caches'].includes(g?.gouts) ? g.gouts : 'decouverts',
      annoncer: g?.annoncer !== false,
      symbole: str(g?.symbole).slice(0, 4) || '♥',
      symbole_vide: g?.symbole_vide === undefined ? '♡' : str(g.symbole_vide).slice(0, 4),
      textes: Object.fromEntries(Object.keys(TEXTES()).map((k) => [k, str(g?.textes?.[k]).slice(0, 200)]).filter(([, v]) => v)),
    };
  };

  const U = () => Donnees.ui;
  const nomPerso = (work, id) => arr(work.personnages).find((p) => p.id === id)?.nom || id;
  const nomObjet = (work, id) => arr(work.objets).find((o) => o.id === id)?.nom || id;
  function listes(data) {
    U().datalist('tafl-relations', arr(data.relations).map((r) => [r.id, nomPerso(data, r.id)]));
  }

  // Une liste d'objets en petites pastilles : un champ pour en ajouter (avec la liste des objets du jeu),
  // une croix pour en retirer.
  function listeObjets(r, cle, work) {
    if (!Array.isArray(r[cle])) r[cle] = [];
    const box = el('div', { className: 'chips' });
    const rendre = () => {
      const i = el('input', { type: 'text', list: 'tafl-donnees-objets', placeholder: '+ un objet', className: 'ref-input' });
      const ajouter = () => { const v = ident(i.value, ''); if (v && !r[cle].includes(v)) r[cle].push(v); rendre(); box.querySelector('input')?.focus(); };
      i.onchange = ajouter;
      i.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); ajouter(); } };
      box.replaceChildren(...r[cle].map((id, k) => el('span', { className: 'chip' }, [
        el('span', { textContent: nomObjet(work, id) }),
        U().petitBouton('close', 'Retirer', () => { r[cle].splice(k, 1); rendre(); }),
      ])), i);
    };
    rendre();
    return box;
  }

  function formRelation(r, ctx) {
    const { champ, info, nombreIn, sel, section, table } = U();
    const work = ctx.work;
    Donnees.listes(work);
    // Le nom montré dans la liste : celui du personnage (gardé à jour).
    const nom = nomPerso(work, r.id);
    if (r.nom !== nom) { r.nom = nom; ctx.renderListe?.(); }
    // Le personnage : son id devient celui de la relation (un seul lien par personnage).
    const pris = new Set(arr(work.relations).filter((x) => x !== r).map((x) => x.id));
    const persos = arr(work.personnages).filter((p) => !p.heros && (!pris.has(p.id) || p.id === r.id)).map((p) => [p.id, p.nom || p.id]);
    if (!persos.some(([k]) => k === r.id)) persos.unshift([r.id, `${r.id} (pas un personnage du jeu)`]);
    const qui = sel(persos, r.id, (v) => { r.id = v; r.nom = nomPerso(work, v); ctx.render(); });
    const lv = niveaux(work.reglages).map((n, i) => [String(i), n.nom]);
    if (!Array.isArray(r.paroles)) r.paroles = [];
    if (!r.merci || typeof r.merci !== 'object') r.merci = {};
    const tParoles = table(r.paroles, [
      ['À partir de', (p) => sel(lv, String(p.niveau), (v) => { p.niveau = Number(v); })],
      ['Expression', (p) => { const i = el('input', { type: 'text', value: p.expression || '', list: 'tafl-expressions', placeholder: 'normal' }); i.oninput = () => { p.expression = i.value.trim(); }; return i; }],
      ['Ce qu\'il dit', (p) => { const t = el('textarea', { rows: 2, style: 'width: 100%; resize: vertical', value: p.texte || '', placeholder: 'Une ligne vide coupe en plusieurs boîtes. {joueur} : le nom du joueur.' }); t.oninput = () => { p.texte = t.value; }; return t; }, true, true],
    ], () => ({ niveau: Math.min(1, lv.length - 1), texte: '', expression: '' }), { ajouter: '+ Parole', max: 100, vide: 'Pas de paroles : il dit seulement « Bonjour, {joueur} ! » (Réglages › Modules › Relations).' });
    const mercis = MERCIS.map(([k, libelle]) => {
      const i = el('input', { type: 'text', value: r.merci[k] || '', placeholder: TEXTES()[`merci_${k}`]?.[0] || '' });
      i.oninput = () => { if (i.value.trim()) r.merci[k] = i.value; else delete r.merci[k]; };
      return champ(libelle, i);
    });
    ctx.form.append(
      champ('Personnage', qui),
      champ('Affinité au départ', nombreIn(r, 'depart', 0, 99999), 'points (0 : il ne connaît pas encore le joueur)'),
      section('Ses goûts'),
      ...GOUTS.map(([k, libelle]) => el('div', { className: 'field field-block' }, [el('span', { className: 'field-label', textContent: libelle }), listeObjets(r, k, work)])),
      info('Un objet qui n\'est dans aucune liste lui fait un petit plaisir (un cadeau « neutre »). Les points de chaque goût sont dans Réglages › Règles du jeu › Modules › Relations.'),
      section('Ses paroles'),
      tParoles,
      info('Quand le joueur lui parle (commande « Parler à un personnage », ou en allant vers un habitant qui se promène), il dit d\'abord, une fois, les paroles d\'un niveau qu\'il vient d\'atteindre : une confidence débloquée. Ensuite, chaque jour, l\'une des paroles des niveaux atteints. Pour une scène plus longue, mets la condition « L\'affinité avec un personnage » sur une page de son événement.'),
      el('details', { className: 'reglages-details' }, el('summary', { textContent: 'Ce qu\'il répond à un cadeau (vide : les mots du jeu)' }), el('div', { className: 'field-grid' }, mercis)),
      section('Utilisation'), ctx.usages('relation', r.id),
    );
  }

  const leadImage = (src) => el('img', { className: 'row-portrait pixel', src, alt: '' });
  const ONGLETS = [
    { key: 'relations', modules: MODULE, groupe: 'Relations', label: 'Relations', icon: 'heart', kind: 'relation', base: 'personnage',
      nouveau: (id, work) => {
        const pris = new Set(arr(work?.relations).map((x) => x.id));
        const p = arr(work?.personnages).find((x) => !x.heros && !pris.has(x.id));
        return NORMES.relations({ id: p?.id || id, nom: p?.nom || '' });
      },
      meta: (r) => [r.adore.length || r.aime.length ? `${r.adore.length + r.aime.length} goût(s)` : '', r.paroles.length ? `${r.paroles.length} parole(s)` : ''].filter(Boolean).join(' · '),
      vide: 'Aucune relation. Ajoute les personnages dont le joueur peut devenir l\'ami : leurs goûts et leurs paroles.', form: formRelation },
  ];

  // Les mots des écrans et des réactions, repliés (vide : le mot de Saga, montré en gris).
  function motsDesEcrans(g) {
    const { champ } = U();
    g.textes = g.textes && typeof g.textes === 'object' ? g.textes : {};
    const champs = Object.entries(TEXTES()).map(([k, [defaut, libelle]]) => {
      const i = el('input', { type: 'text', value: g.textes[k] || '', placeholder: defaut, maxLength: 200 });
      i.oninput = () => { if (i.value.trim()) g.textes[k] = i.value; else delete g.textes[k]; };
      return champ(libelle, i);
    });
    return el('details', { className: 'reglages-details' }, el('summary', { textContent: 'Les mots des relations (réactions, écran) : {nom}, {niveau}, {joueur}' }), el('div', { className: 'field-grid' }, champs));
  }

  // Les réglages du module, sous sa case dans Réglages › Règles du jeu › Modules.
  function formReglages(r, ctx) {
    const { champ, info, nombreIn, texteIn, sel, table } = U();
    if (!r.modules_reglages || typeof r.modules_reglages !== 'object') r.modules_reglages = {};
    const g = r.modules_reglages.relations = normReglages(r.modules_reglages.relations);
    const caseA = (cle) => { const c = el('input', { type: 'checkbox', checked: g[cle] }); c.onchange = () => { g[cle] = c.checked; }; return c; };
    const tNiveaux = table(g.niveaux, [
      ['Nom du niveau', (n) => texteIn(n, 'nom', 'Ami'), true],
      ['À partir de', (n, k) => (k === 0 ? el('span', { className: 'unit', textContent: '0 point' }) : nombreIn(n, 'points', 1, 99999))],
    ], () => ({ nom: '', points: (g.niveaux[g.niveaux.length - 1]?.points || 0) + 100 }), { ajouter: '+ Niveau', max: 20 });
    return [
      champ('Nom de l\'écran', texteIn(g, 'nom', 'Relations')),
      el('div', { className: 'field field-block' }, [el('span', { className: 'field-label', textContent: 'Les niveaux d\'affinité (dans l\'ordre, le premier à 0)' }), tNiveaux]),
      el('div', { className: 'field-grid' }, [
        champ('Parler', nombreIn(g, 'parler', 0, 999), 'points, la première fois de la journée'),
        champ('Cadeaux par jour', nombreIn(g, 'cadeaux_jour', 0, 99), 'à chaque personnage (0 : sans limite)'),
      ]),
      el('div', { className: 'field-grid' }, [
        champ('Cadeau adoré', nombreIn(g.cadeaux, 'adore', -999, 999), 'points'),
        champ('Cadeau aimé', nombreIn(g.cadeaux, 'aime', -999, 999), 'points'),
      ]),
      el('div', { className: 'field-grid' }, [
        champ('Cadeau égal', nombreIn(g.cadeaux, 'neutre', -999, 999), 'points'),
        champ('Cadeau pas aimé', nombreIn(g.cadeaux, 'deteste', -999, 999), 'points (0 : rien ne se perd)'),
      ]),
      champ('L\'oubli', nombreIn(g, 'oubli', 0, 999), 'points perdus par nuit sans le voir (0 : rien ; jamais sous le niveau atteint)'),
      champ('Dans le carnet (Tab)', caseA('menu'), 'l\'écran des relations'),
      champ('Résumé dans le carnet (Tab)', caseA('carnet'), 'chaque personnage rencontré et ses cœurs'),
      champ('Dire quand un niveau monte', caseA('annoncer'), '« Brune et toi : Ami ! »'),
      el('div', { className: 'field-grid' }, [
        champ('On voit', sel([['rencontres', 'Ceux à qui le joueur a parlé'], ['tous', 'Tous, dès le début']], g.visibles, (v) => { g.visibles = v; })),
        champ('Leurs goûts', sel([['decouverts', 'Ce que le joueur a appris en offrant'], ['tous', 'Tout, dès le début'], ['caches', 'Rien (à deviner)']], g.gouts, (v) => { g.gouts = v; })),
      ]),
      el('div', { className: 'field-grid' }, [
        champ('Symbole', texteIn(g, 'symbole', '♥'), 'un par niveau atteint'),
        champ('Symbole vide', texteIn(g, 'symbole_vide', '♡'), 'pour les niveaux qui restent'),
      ]),
      motsDesEcrans(g),
      info('Les personnages et leurs goûts se règlent dans Données › Relations. Avec le module Gestion et des habitants nommés, le joueur parle aux habitants qui se promènent (et peut leur offrir quelque chose) ; ailleurs, mets les commandes « Parler à un personnage » et « Offrir un objet » dans leurs événements.'),
    ];
  }

  function resumer(doc, sorte, o) {
    if (sorte !== 'relations') return null;
    const n = (l) => l.map((id) => nomObjet(doc.data, id)).join(', ');
    return `${o.id} « ${nomPerso(doc.data, o.id)} » départ ${o.depart} point(s)${o.adore.length ? `, adore [${n(o.adore)}]` : ''}${o.aime.length ? `, aime [${n(o.aime)}]` : ''}${o.deteste.length ? `, n'aime pas [${n(o.deteste)}]` : ''}, ${o.paroles.length} parole(s)${o.paroles.length ? ` (niveaux ${[...new Set(o.paroles.map((p) => p.niveau))].join(', ')})` : ''}`;
  }
  // Où un personnage ou un objet sert aux relations (Donnees.utilisations).
  function utilisations(doc, sorte, id, out) {
    if (sorte === 'objet') for (const r of doc.data.relations || []) if ([...r.adore, ...r.aime, ...r.deteste].includes(id)) out.add(`Relation avec ${nomPerso(doc.data, r.id)}`);
    if (sorte === 'relation') {
      Events.parcourirJeu(doc, ({ commande, condition, ev, map, page }) => {
        const c = commande || condition;
        const ici = `${map.name} › ${ev.nom || ev.id}${ev.pages.length > 1 ? ` (page ${page + 1})` : ''}`;
        if (['relation_parler', 'relation_offrir', 'relation_points'].includes(c.type) && (c.qui === id || (c.qui === '@evenement' && ev.apparence?.personnage === id))) out.add(ici);
        if (['relation_niveau', 'relation_parle'].includes(c.type) && c.personnage === id) out.add(ici);
      });
      if ((doc.data.reglages?.modules_reglages?.gestion?.habitants_noms || []).includes(id)) out.add('Réglages (habitants nommés du domaine)');
    }
  }

  return { SORTES, NORMES, ONGLETS, MODULE, NIVEAUX, niveaux, normReglages, listes, resumer, utilisations, formReglages };
})();
