// Les données du module « survivor » (Tafl 1.33, joué par Saga 1.30 : moteur/renderer/moteur/modules/survivor/).
// Trois sortes : les arènes (une carte, un chrono, des vagues d'ennemis et des boss), les armes (qui frappent
// toutes seules) et les passifs (ce qu'on gagne aussi en montant de niveau) ; ses réglages, dans Réglages ›
// Règles du jeu › Modules (reglages.modules_reglages.survivor). Le format est dans ../FORMAT.md › « Le module
// survivor ». Les ennemis sont ceux du pack action (Données › Ennemis).
//
// Comme donnees-roguelite.js : ce fichier est lu avant donnees.js, qui prend ses sortes, ses normes et ses onglets.
// Saga borne tout pareil (modules/survivor/calcul.js).

const DonneesSurvivor = (() => {
  const SORTES = ['arenes', 'armes', 'passifs'];
  const MODULE = ['survivor'];

  const str = (v, d = '') => (v === undefined || v === null || typeof v === 'object' ? d : String(v));
  const num = (v, d = 0, min = -Infinity, max = Infinity) => { const n = Number(v); return v !== '' && v !== null && v !== undefined && Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : d; };
  const int = (v, d = 0, min = -Infinity, max = Infinity) => Math.round(num(v, d, min, max));
  const arr = (v) => (Array.isArray(v) ? v : []);
  const propre = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? JSON.parse(JSON.stringify(o)) : {});
  const ident = (v, d) => (typeof Doc !== 'undefined' ? Doc.slug(v, d) : String(v || d));
  const couleur = (v, d) => (/^#[0-9a-f]{6}$/i.test(v || '') ? v : d);

  const SORTES_ARME = [
    ['projectile', 'Projectile vers l\'ennemi le plus proche (dague)'],
    ['direction', 'Projectile droit devant le héros (couteaux)'],
    ['orbite', 'Tourne autour du héros (hache, livre)'],
    ['aura', 'Aura autour du héros (ail)'],
    ['eclair', 'Frappe des ennemis au hasard à l\'écran (foudre)'],
    ['fouet', 'Claque sur le côté (fouet)'],
    ['onde', 'Onde qui part du héros'],
  ];
  // Ce que chaque sorte lit (les autres champs ne servent pas).
  const CHAMPS_SORTE = {
    projectile: ['degats', 'recharge', 'nombre', 'vitesse', 'portee', 'taille', 'percee'],
    direction: ['degats', 'recharge', 'nombre', 'vitesse', 'portee', 'taille', 'percee'],
    orbite: ['degats', 'recharge', 'nombre', 'vitesse', 'portee', 'taille', 'duree'],
    aura: ['degats', 'recharge', 'portee', 'taille'],
    eclair: ['degats', 'recharge', 'nombre', 'portee', 'taille'],
    fouet: ['degats', 'recharge', 'nombre', 'portee', 'taille'],
    onde: ['degats', 'recharge', 'portee', 'taille'],
  };
  const EFFETS = [
    ['puissance', 'Dégâts de toutes les armes (+ %)'],
    ['recharge', 'Recharge des armes (− %)'],
    ['zone', 'Taille des armes (+ %)'],
    ['vitesse_proj', 'Vitesse des projectiles (+ %)'],
    ['duree', 'Durée des armes (+ %)'],
    ['nombre', 'Projectiles en plus par arme'],
    ['aimant', 'Rayon de ramassage (+ %)'],
    ['vitesse', 'Vitesse du héros (+ %)'],
    ['armure', 'Dégâts reçus en moins (par coup)'],
    ['regen', 'PV rendus toutes les 10 secondes'],
    ['croissance', 'Expérience gagnée (+ %)'],
  ];
  const GAINS = ['degats', 'nombre', 'recharge', 'taille', 'percee', 'duree', 'vitesse', 'portee'];

  const normGain = (n) => {
    const o = { texte: str(n?.texte).slice(0, 120) };
    for (const k of GAINS) { const v = num(n?.[k], 0, -999, 9999); if (v) o[k] = v; }
    return o;
  };
  const normVague = (v) => ({ ennemi: ident(v?.ennemi, ''), de: num(v?.de, 0, 0, 120), a: num(v?.a, 0, 0, 120), par_minute: num(v?.par_minute, 30, 0, 3000), groupe: int(v?.groupe, 1, 1, 50), max: int(v?.max, 0, 0, 1500) });
  const normBoss = (b) => ({ ennemi: ident(b?.ennemi, ''), minute: num(b?.minute, 5, 0, 120), nombre: int(b?.nombre, 1, 1, 20) });
  const NORMES = {
    arenes: (a, i) => ({
      ...propre(a),
      id: ident(a?.id || a?.nom, `arene-${i + 1}`),
      nom: str(a?.nom || a?.id, `Arène ${i + 1}`).slice(0, 60),
      description: str(a?.description).slice(0, 300),
      carte: str(a?.carte).slice(0, 100),
      duree: int(a?.duree, 10, 1, 120),
      fin: a?.fin === 'boss' ? 'boss' : 'temps',
      boss_final: ident(a?.boss_final, ''),
      renfort: num(a?.renfort, 10, 0, 1000),
      depart: a?.depart && Number.isFinite(Number(a.depart.x)) ? { x: int(a.depart.x, 0, 0, 255), y: int(a.depart.y, 0, 0, 255) } : null,
      retour: a?.retour && typeof a.retour.carte === 'string' && a.retour.carte ? { carte: a.retour.carte, x: int(a.retour.x, 0, 0, 255), y: int(a.retour.y, 0, 0, 255), direction: ['haut', 'bas', 'gauche', 'droite'].includes(a.retour.direction) ? a.retour.direction : 'bas' } : null,
      vagues: arr(a?.vagues).slice(0, 60).map(normVague),
      boss: arr(a?.boss).slice(0, 30).map(normBoss),
    }),
    armes: (a, i) => ({
      ...propre(a),
      id: ident(a?.id || a?.nom, `arme-${i + 1}`),
      nom: str(a?.nom || a?.id, `Arme ${i + 1}`).slice(0, 60),
      description: str(a?.description).slice(0, 300),
      icone: str(a?.icone),
      sorte: SORTES_ARME.some(([k]) => k === a?.sorte) ? a.sorte : 'projectile',
      couleur: couleur(a?.couleur, '#e8eef8'),
      degats: num(a?.degats, 5, 0, 99999),
      recharge: num(a?.recharge, 1, 0.1, 60),
      nombre: int(a?.nombre, 1, 1, 30),
      vitesse: num(a?.vitesse, 8, 0, 60),
      portee: num(a?.portee, 8, 0.2, 40),
      taille: num(a?.taille, 1, 0.2, 10),
      percee: int(a?.percee, 1, 0, 99),
      duree: num(a?.duree, 0, 0, 60),
      poids: int(a?.poids, 10, 1, 1000),
      verrouillee: Boolean(a?.verrouillee),
      niveaux: arr(a?.niveaux).slice(0, 15).map(normGain),
    }),
    passifs: (p, i) => ({
      ...propre(p),
      id: ident(p?.id || p?.nom, `passif-${i + 1}`),
      nom: str(p?.nom || p?.id, `Passif ${i + 1}`).slice(0, 60),
      description: str(p?.description).slice(0, 300),
      icone: str(p?.icone),
      effet: EFFETS.some(([k]) => k === p?.effet) ? p.effet : 'puissance',
      valeur: num(p?.valeur, 10, -90, 9999),
      niveau_max: int(p?.niveau_max, 5, 1, 15),
      poids: int(p?.poids, 10, 1, 1000),
    }),
  };

  // Les réglages du module (Saga les borne pareil : modules/survivor/calcul.js › reglages).
  const normReglages = (g) => ({
    ...propre(g),
    arme_depart: ident(g?.arme_depart, ''),
    choix: int(g?.choix, 3, 1, 5),
    armes_max: int(g?.armes_max, 6, 1, 12),
    passifs_max: int(g?.passifs_max, 6, 0, 12),
    xp_base: int(g?.xp_base, 5, 1, 100000),
    xp_pas: int(g?.xp_pas, 8, 0, 100000),
    aimant: num(g?.aimant, 1.5, 0.3, 20),
    ennemis_max: int(g?.ennemis_max, 300, 10, 1500),
    soin_choix: int(g?.soin_choix, 4, 0, 999),
    coeur_chance: num(g?.coeur_chance, 1, 0, 100),
    degats_visibles: g?.degats_visibles !== false,
    texte_victoire: str(g?.texte_victoire).slice(0, 120),
    texte_defaite: str(g?.texte_defaite).slice(0, 120),
  });

  const U = () => Donnees.ui;
  function listes(data) {
    U().datalist('tafl-armes', arr(data.armes).map((a) => [a.id, a.nom]));
    U().datalist('tafl-arenes', arr(data.arenes).map((a) => [a.id, a.nom]));
  }
  const choixCartes = (doc, vide) => [...(vide ? [['', vide]] : []), ...(doc?.maps || []).map((m) => [m.id, m.name])];
  const descEnnemi = (work) => (id) => { const e = arr(work.ennemis).find((x) => x.id === id); return e ? el('span', { textContent: `${e.nom} · ${e.pv} PV${e.boss ? ' · boss' : ''}` }) : null; };

  function formArene(a, ctx) {
    const { champ, info, nombreIn, sel, section, table, refInfo } = U();
    const idl = ctx.idLigne(a);
    Donnees.listes(ctx.work);
    const departCase = ctx.coche({ get v() { return Boolean(a.depart); }, set v(x) { a.depart = x ? a.depart || { x: 0, y: 0 } : null; ctx.render?.(); } }, 'v');
    const retourCase = ctx.coche({ get v() { return Boolean(a.retour); }, set v(x) { a.retour = x ? a.retour || { carte: ctx.doc?.maps?.[0]?.id || '', x: 0, y: 0, direction: 'bas' } : null; ctx.render?.(); } }, 'v');
    const rythme = el('p', { className: 'field-help' });
    const majRythme = () => {
      const m = Math.max(1, a.duree);
      const pic = [0, Math.floor(m / 2), m - 0.01].map((x) => a.vagues.filter((v) => x >= v.de && (v.a <= 0 || x < v.a)).reduce((s, v) => s + v.par_minute, 0));
      rythme.textContent = `Ennemis par minute : ${pic[0]} au début, ${pic[1]} à mi-chemin, ${pic[2]} à la fin. Boss : ${a.boss.length ? a.boss.map((b) => `min ${b.minute}`).join(', ') : 'aucun'}.`;
    };
    majRythme();
    ctx.form.append(
      champ('Nom', ctx.input(a, 'nom', 'Le champ maudit, La crypte…', idl.maj)), idl.el,
      champ('Carte', sel(choixCartes(ctx.doc, '(choisis la carte de l\'arène)'), a.carte, (v) => { a.carte = v; })),
      el('div', { className: 'field-grid' }, [
        champ('Durée', nombreIn(a, 'duree', 1, 120, 1, majRythme), 'minutes'),
        champ('Pour gagner', sel([['temps', 'Tenir le chrono'], ['boss', 'Chrono + boss']], a.fin, (v) => { a.fin = v; ctx.render?.(); })),
      ]),
      ...(a.fin === 'boss' ? [champ('Boss final', refInfo(a, 'boss_final', 'tafl-ennemis', 'gardien', descEnnemi(ctx.work)), 'vide : le premier ennemi coché « boss »')] : []),
      champ('Renfort', nombreIn(a, 'renfort', 0, 1000), '% de PV en plus pour les ennemis, à chaque minute'),
      section('Vagues'),
      table(a.vagues, [
        ['Ennemi', (v) => refInfo(v, 'ennemi', 'tafl-ennemis', 'slime', descEnnemi(ctx.work)), true],
        ['De', (v) => nombreIn(v, 'de', 0, 120, 0.5, majRythme)],
        ['À', (v) => nombreIn(v, 'a', 0, 120, 0.5, majRythme)],
        ['Par min.', (v) => nombreIn(v, 'par_minute', 0, 3000, 1, majRythme)],
        ['Groupe', (v) => nombreIn(v, 'groupe', 1, 50)],
        ['Au plus', (v) => nombreIn(v, 'max', 0, 1500)],
      ], () => normVague({ ennemi: a.vagues.at(-1)?.ennemi || arr(ctx.work.ennemis)[0]?.id || '', de: a.vagues.at(-1)?.a || 0, a: 0, par_minute: 30 }), { ajouter: '+ Vague', max: 60, vide: 'Aucune vague : rien n\'apparaît.', change: majRythme }),
      rythme,
      info('De et À : les minutes du chrono (À 0 : jusqu\'à la fin). Par min. : combien en arrivent chaque minute, juste hors de l\'écran ; Groupe : ils arrivent par paquets de tant. Au plus : jamais plus de tant à la fois pour cette ligne (0 : seulement la limite des réglages du module). Plusieurs lignes à la fois s\'additionnent.'),
      section('Boss'),
      table(a.boss, [
        ['Minute', (b) => nombreIn(b, 'minute', 0, 120, 0.5, majRythme)],
        ['Ennemi', (b) => refInfo(b, 'ennemi', 'tafl-ennemis', 'gardien', descEnnemi(ctx.work)), true],
        ['Nombre', (b) => nombreIn(b, 'nombre', 1, 20)],
      ], () => normBoss({ ennemi: arr(ctx.work.ennemis).find((e) => e.boss)?.id || '', minute: Math.max(1, Math.round(a.duree / 2)) }), { ajouter: '+ Boss', max: 30, vide: 'Aucun boss.', change: majRythme }),
      info('Un boss est plus grand, a une barre de vie, et laisse un coffre : un choix de plus, comme une montée de niveau. Un ennemi ordinaire mis ici devient un champion (10 fois ses PV et son expérience).'),
      section('Entrée et sortie'),
      champ('Case de départ', departCase, 'pour la commande « Aller dans une arène » ; sinon le milieu de la carte'),
      ...(a.depart ? [el('div', { className: 'field-grid' }, [champ('X', nombreIn(a.depart, 'x', 0, 255)), champ('Y', nombreIn(a.depart, 'y', 0, 255))])] : []),
      champ('Lieu de retour', retourCase, 'sinon là d\'où vient le joueur'),
      ...(a.retour ? [el('div', { className: 'field-grid' }, [
        champ('Carte', sel(choixCartes(ctx.doc), a.retour.carte, (v) => { a.retour.carte = v; })),
        champ('X', nombreIn(a.retour, 'x', 0, 255)), champ('Y', nombreIn(a.retour, 'y', 0, 255)),
        champ('Regard', sel([['bas', 'Bas'], ['haut', 'Haut'], ['gauche', 'Gauche'], ['droite', 'Droite']], a.retour.direction, (v) => { a.retour.direction = v; })),
      ])] : []),
      info('Une partie commence dès que le joueur arrive sur la carte de l\'arène (un téléporteur, ou la commande « Aller dans une arène »). Victoire ou défaite, il revient ensuite au lieu de retour. Il faut le pack action (le temps réel).'),
      section('Utilisation'), ctx.usages('arene', a.id),
    );
  }

  const NOMS_CHAMPS = { degats: 'Dégâts', recharge: 'Recharge', nombre: 'Nombre', vitesse: 'Vitesse', portee: 'Portée', taille: 'Taille', percee: 'Traverse', duree: 'Durée' };
  const UNITES = { degats: '', recharge: 's', nombre: '', vitesse: 'cases/s', portee: 'cases', taille: '×', percee: 'ennemis', duree: 's' };
  const COURTS = { projectile: 'Projectile', direction: 'Tir droit', orbite: 'Orbite', aura: 'Aura', eclair: 'Éclair', fouet: 'Fouet', onde: 'Onde' };
  const PAS = { recharge: 0.1, vitesse: 0.5, portee: 0.1, taille: 0.1, duree: 0.5 };
  const MAX = { degats: 99999, recharge: 60, nombre: 30, vitesse: 60, portee: 40, taille: 10, percee: 99, duree: 60 };
  const MIN = { recharge: 0.1, portee: 0.2, taille: 0.2, nombre: 1 };
  function formArme(a, ctx) {
    const { champ, info, nombreIn, sel, blocImage, section, table } = U();
    const idl = ctx.idLigne(a);
    const teinte = el('input', { type: 'color', value: a.couleur });
    teinte.oninput = () => { a.couleur = teinte.value; };
    const utiles = CHAMPS_SORTE[a.sorte] || GAINS;
    const champs = utiles.map((k) => champ(NOMS_CHAMPS[k], nombreIn(a, k, MIN[k] ?? 0, MAX[k], PAS[k] || 1), UNITES[k]));
    ctx.form.append(
      champ('Nom', ctx.input(a, 'nom', 'Dague, Hache tournoyante…', idl.maj)), idl.el,
      el('label', { className: 'field field-textarea' }, [el('span', { className: 'field-label', textContent: 'Description' }), ctx.zone(a, 'description', 2, 'Ce que lit le joueur quand il la découvre.')]),
      blocImage(ctx, a, 'icone', 'Icône'),
      champ('Comment elle frappe', sel(SORTES_ARME, a.sorte, (v) => { a.sorte = v; ctx.render?.(); })),
      champ('Couleur', teinte, 'la lame, l\'aura, l\'éclair (sans icône : la pastille)'),
      el('div', { className: 'field-grid' }, champs.slice(0, 4)),
      el('div', { className: 'field-grid' }, champs.slice(4)),
      info('Recharge : les secondes entre deux attaques. Nombre : les projectiles, haches ou éclairs. Taille : 1 = normale. Traverse : les ennemis en plus qu\'un projectile traverse avant de disparaître. Vitesse de l\'orbite : sa rotation. Durée : combien de secondes l\'orbite tourne avant sa recharge.'),
      el('div', { className: 'field-grid' }, [
        champ('Fréquence', nombreIn(a, 'poids', 1, 1000), 'plus grand = plus souvent'),
        champ('Verrouillée', ctx.coche(a, 'verrouillee'), 'jamais proposée'),
      ]),
      section('Niveaux'),
      table(a.niveaux, [
        ['Dégâts', (n) => { if (n.degats === undefined) n.degats = 0; return nombreIn(n, 'degats', -999, 9999, 0.5); }],
        ['Nombre', (n) => { if (n.nombre === undefined) n.nombre = 0; return nombreIn(n, 'nombre', -9, 20); }],
        ['Recharge −%', (n) => { if (n.recharge === undefined) n.recharge = 0; return nombreIn(n, 'recharge', -90, 90); }],
        ['Taille +%', (n) => { if (n.taille === undefined) n.taille = 0; return nombreIn(n, 'taille', -90, 500); }],
        ['Traverse', (n) => { if (n.percee === undefined) n.percee = 0; return nombreIn(n, 'percee', -9, 20); }],
        ['Durée', (n) => { if (n.duree === undefined) n.duree = 0; return nombreIn(n, 'duree', -9, 30, 0.5); }],
        ['Ce que lit le joueur', (n) => ctx.input(n, 'texte', 'Une dague de plus.'), true, true],
      ], () => ({ texte: '', degats: 0, nombre: 0, recharge: 0, taille: 0, percee: 0, duree: 0 }), { ajouter: '+ Niveau', max: 15, vide: 'Une seule version : elle ne monte pas de niveau.' }),
      info(`Le niveau 1 est l'arme ci-dessus ; chaque ligne est le niveau suivant (2, 3…) et ajoute ce qu'elle dit. Niveau maximum : ${a.niveaux.length + 1}. Les passifs (Données › Passifs) s'y ajoutent pour toutes les armes.`),
      section('Utilisation'), ctx.usages('arme', a.id),
    );
  }
  function formPassif(p, ctx) {
    const { champ, info, nombreIn, sel, blocImage, section } = U();
    const idl = ctx.idLigne(p);
    ctx.form.append(
      champ('Nom', ctx.input(p, 'nom', 'Épinard, Aimant…', idl.maj)), idl.el,
      el('label', { className: 'field field-textarea' }, [el('span', { className: 'field-label', textContent: 'Description' }), ctx.zone(p, 'description', 2, 'Dégâts +10 % par niveau.')]),
      blocImage(ctx, p, 'icone', 'Icône'),
      champ('Effet', sel(EFFETS, p.effet, (v) => { p.effet = v; })),
      el('div', { className: 'field-grid' }, [
        champ('Par niveau', nombreIn(p, 'valeur', -90, 9999, 0.5)),
        champ('Niveaux', nombreIn(p, 'niveau_max', 1, 15)),
        champ('Fréquence', nombreIn(p, 'poids', 1, 1000), 'plus grand = proposé plus souvent'),
      ]),
      info('Un passif se prend en montant de niveau, comme une arme, et ses niveaux s\'additionnent. La vitesse du héros passe par les bonus du groupe (le pack action) ; le reste touche toutes les armes de la partie.'),
      section('Utilisation'), ctx.usages('passif', p.id),
    );
  }

  const leadImage = (src) => el('img', { className: 'row-portrait pixel', src, alt: '' });
  const dot = (c) => el('span', { className: 'row-dot', style: { background: c } });
  const ONGLETS = [
    { key: 'arenes', modules: MODULE, groupe: 'Survivor', label: 'Arènes', icon: 'flame', kind: 'arene', base: 'Nouvelle arène',
      nouveau: (id, work) => NORMES.arenes({ id, nom: 'Nouvelle arène', vagues: arr(work?.ennemis).length ? [{ ennemi: work.ennemis[0].id, de: 0, a: 0, par_minute: 40 }] : [] }, 0),
      meta: (a) => `${a.duree} min`,
      lead: () => null,
      vide: 'Aucune arène. Une arène est une carte où survivre à des vagues d\'ennemis pendant quelques minutes : choisis la carte, la durée, les vagues et les boss.', form: formArene },
    { key: 'armes', modules: MODULE, groupe: 'Survivor', label: 'Armes', icon: 'zap', kind: 'arme', base: 'Nouvelle arme',
      nouveau: (id) => NORMES.armes({ id, nom: 'Nouvelle arme', niveaux: [{ texte: 'Dégâts +3.', degats: 3 }] }, 0),
      meta: (a) => `${COURTS[a.sorte] || a.sorte} · ${a.niveaux.length + 1} niv.`,
      lead: (a) => (a.icone ? leadImage(a.icone) : dot(a.couleur)),
      vide: 'Aucune arme : Saga prend les cinq armes et les huit passifs d\'exemple (dague, hache, aura, foudre, fouet). Crée la tienne pour les remplacer.', form: formArme },
    { key: 'passifs', modules: MODULE, groupe: 'Survivor', label: 'Passifs', icon: 'sparkle', kind: 'passif', base: 'Nouveau passif',
      nouveau: (id) => NORMES.passifs({ id, nom: 'Nouveau passif', effet: 'puissance', valeur: 10 }, 0),
      meta: (p) => `${p.niveau_max} niv.`,
      lead: (p) => (p.icone ? leadImage(p.icone) : null),
      vide: 'Aucun passif. Un passif renforce toutes les armes (dégâts, recharge, taille) ou le héros (vitesse, armure, aimant).', form: formPassif },
  ];

  // Les réglages du module, sous sa case dans Réglages › Règles du jeu › Modules.
  function formReglages(r, ctx) {
    const { champ, info, nombreIn, texteIn, sel } = U();
    if (!r.modules_reglages || typeof r.modules_reglages !== 'object') r.modules_reglages = {};
    const g = r.modules_reglages.survivor = normReglages(r.modules_reglages.survivor);
    const armes = arr(ctx.work?.armes);
    const out = [];
    if (r.regles !== 'action') out.push(info('⚠ Le mode survivor a besoin du temps réel : choisis le pack de règles « action » (ci-dessus). Sans lui, les arènes restent des cartes ordinaires.'));
    out.push(
      el('div', { className: 'field-grid' }, [
        champ('Arme de départ', sel([['', armes.length ? '(la première arme)' : '(la dague d\'exemple)'], ...armes.map((a) => [a.id, a.nom])], g.arme_depart, (v) => { g.arme_depart = v; })),
        champ('Choix', nombreIn(g, 'choix', 1, 5), 'proposés à chaque niveau'),
      ]),
      el('div', { className: 'field-grid' }, [
        champ('Armes', nombreIn(g, 'armes_max', 1, 12), 'au plus, en même temps'),
        champ('Passifs', nombreIn(g, 'passifs_max', 0, 12), 'au plus'),
        champ('Ennemis', nombreIn(g, 'ennemis_max', 10, 1500), 'au plus à l\'écran (300 : fluide sur un PC ordinaire)'),
      ]),
      el('div', { className: 'field-grid' }, [
        champ('Expérience', nombreIn(g, 'xp_base', 1, 100000), 'pour le niveau 2'),
        champ('Puis', nombreIn(g, 'xp_pas', 0, 100000), 'de plus à chaque niveau'),
        champ('Aimant', nombreIn(g, 'aimant', 0.3, 20, 0.1), 'cases : les gemmes viennent d\'aussi loin'),
      ]),
      el('div', { className: 'field-grid' }, [
        champ('Cœurs', nombreIn(g, 'coeur_chance', 0, 100, 0.5), '% de chance par ennemi vaincu'),
        champ('Soin', nombreIn(g, 'soin_choix', 0, 999), 'PV d\'un cœur ramassé (ou du repas quand il n\'y a plus rien à prendre)'),
        champ('Dégâts affichés', ctx.coche(g, 'degats_visibles')),
      ]),
      el('div', { className: 'field-grid' }, [
        champ('Victoire', Object.assign(texteIn(g, 'texte_victoire', 'Tu as survécu !'), { style: 'width: 14em' })),
        champ('Défaite', Object.assign(texteIn(g, 'texte_defaite', 'Tu es tombé…'), { style: 'width: 14em' })),
      ]),
      info('Le héros ne fait que bouger : ses armes frappent toutes seules. Chaque ennemi vaincu laisse une gemme ; à chaque niveau, le joueur choisit une arme ou un passif. Les arènes, les armes et les passifs sont dans Données › Arènes, Armes et Passifs (groupe Survivor) ; les ennemis sont ceux de Données › Ennemis. Astuce : mets le recul du héros à 0 (Réglages › Règles du jeu, le héros) pour ne pas être ballotté par la horde.'),
    );
    return out;
  }

  function resumer(doc, sorte, o) {
    if (sorte === 'arenes') return `${o.id} « ${o.nom} » carte ${o.carte || '?'}, ${o.duree} min (${o.fin}), vagues : ${o.vagues.map((v) => `${v.ennemi} ${v.de}-${v.a || 'fin'} min ${v.par_minute}/min`).join(', ') || 'aucune'} ; boss : ${o.boss.map((b) => `${b.ennemi} à ${b.minute} min`).join(', ') || 'aucun'}`;
    if (sorte === 'armes') return `${o.id} « ${o.nom} » ${o.sorte} : ${o.degats} dégâts, recharge ${o.recharge} s, ×${o.nombre}, ${o.niveaux.length + 1} niveaux`;
    if (sorte === 'passifs') return `${o.id} « ${o.nom} » ${o.effet} ${o.valeur}/niveau, ${o.niveau_max} niveaux`;
    return null;
  }
  function utilisations(doc, sorte, id, out) {
    if (sorte === 'arene') {
      Events.parcourirJeu(doc, ({ commande, condition, ev, map, page }) => {
        const c = commande || condition;
        if ((c.type === 'survivor_lancer' || c.type === 'survivor_record' || c.type === 'survivor_victoires') && c.arene === id) out.add(`${map.name} › ${ev.nom || ev.id}${ev.pages.length > 1 ? ` (page ${page + 1})` : ''}`);
      });
    }
    if (sorte === 'arme' && doc.data.reglages?.modules_reglages?.survivor?.arme_depart === id) out.add('Arme de départ (réglages du module)');
    if (sorte === 'ennemi') for (const a of doc.data.arenes || []) if (a.vagues.some((v) => v.ennemi === id) || a.boss.some((b) => b.ennemi === id) || a.boss_final === id) out.add(`Arène ${a.nom}`);
  }

  return { SORTES, NORMES, ONGLETS, MODULE, SORTES_ARME, EFFETS, normReglages, listes, resumer, utilisations, formReglages };
})();
