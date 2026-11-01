// Les données du module « roguelite » (Tafl 1.12, joué par Saga 1.14 : moteur/renderer/moteur/modules/roguelite/).
// Deux sortes : les perks (pendant une partie, perdus à la fin) et les améliorations (achetées au camp avec la
// monnaie du roguelite, gardées d'une partie à l'autre) ; ses réglages, dans Réglages › Règles du jeu ›
// Modules (reglages.modules_reglages.roguelite) ; et la « salle de donjon » d'une carte (carte.salle : son type,
// son poids, ses étages), réglée dans le menu des cartes. Le format est dans ../FORMAT.md › « Le module roguelite ».
//
// Comme donnees-gestion.js : ce fichier est lu avant donnees.js, qui prend ses sortes, ses normes et ses onglets.

const DonneesRoguelite = (() => {
  const SORTES = ['perks', 'ameliorations'];
  const MODULE = ['roguelite'];

  const str = (v, d = '') => (v === undefined || v === null || typeof v === 'object' ? d : String(v));
  const int = (v, d = 0, min = -Infinity, max = Infinity) => { const n = Math.round(Number(v)); return v !== '' && v !== null && Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : d; };
  const arr = (v) => (Array.isArray(v) ? v : []);
  const propre = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? JSON.parse(JSON.stringify(o)) : {});
  const ident = (v, d) => (typeof Doc !== 'undefined' ? Doc.slug(v, d) : String(v || d));

  const RARETES = [['commun', 'Commun'], ['rare', 'Rare'], ['epique', 'Épique'], ['legendaire', 'Légendaire']];
  const COULEURS_RARETE = { commun: '#c8c8d0', rare: '#5ab0ff', epique: '#c070ff', legendaire: '#ffb840' };
  const EFFETS_PERK = [['stat', 'Statistique (en %)'], ['soin', 'Soin complet quand on le prend'], ['vol_de_vie', 'Vol de vie (PV par ennemi vaincu, temps réel)'], ['monnaie', 'Plus de monnaie du roguelite (en %)'], ['script', 'Un script JS (moment « roguelite_perk »)']];
  const EFFETS_META = [['stat', 'Statistique pendant les parties (en % par niveau)'], ['objet', 'Objets au départ de chaque partie'], ['argent', 'Argent au départ de chaque partie'], ['perk', 'Débloquer un perk (il peut être tiré)'], ['monnaie', 'Plus de monnaie du roguelite (en % par niveau)']];
  const TYPES_SALLE = [['depart', 'Départ (le joueur arrive ici)'], ['combat', 'Combat'], ['tresor', 'Trésor (un cul-de-sac)'], ['boutique', 'Boutique (un cul-de-sac)'], ['repos', 'Repos (un cul-de-sac)'], ['boss', 'Boss (la fin de l\'étage)']];

  const normEffet = (e, perk) => {
    const types = perk ? EFFETS_PERK : EFFETS_META;
    const type = types.some(([k]) => k === e?.type) ? e.type : 'stat';
    const out = { type };
    if (type === 'stat') { out.stat = str(e?.stat).slice(0, 32); out.valeur = int(e?.valeur, 10, -90, 200); }
    if (type === 'vol_de_vie' || type === 'monnaie' || type === 'argent') out.valeur = int(e?.valeur, type === 'argent' ? 20 : type === 'monnaie' ? 10 : 1, type === 'monnaie' ? -90 : 0, 9999);
    if (type === 'objet') { out.objet = ident(e?.objet, ''); out.nombre = int(e?.nombre, 1, 1, 99); }
    if (type === 'perk') out.perk = ident(e?.perk, '');
    return out;
  };
  const NORMES = {
    perks: (p, i) => ({
      ...propre(p),
      id: ident(p?.id || p?.nom, `perk-${i + 1}`),
      nom: str(p?.nom || p?.id, `Perk ${i + 1}`).slice(0, 60),
      description: str(p?.description).slice(0, 300),
      icone: str(p?.icone),
      rarete: RARETES.some(([k]) => k === p?.rarete) ? p.rarete : 'commun',
      max: int(p?.max, 1, 1, 99),
      verrouille: Boolean(p?.verrouille),
      effets: arr(p?.effets).slice(0, 4).map((e) => normEffet(e, true)),
    }),
    ameliorations: (a, i) => ({
      ...propre(a),
      id: ident(a?.id || a?.nom, `amelioration-${i + 1}`),
      nom: str(a?.nom || a?.id, `Amélioration ${i + 1}`).slice(0, 60),
      description: str(a?.description).slice(0, 300),
      icone: str(a?.icone),
      cout: int(a?.cout, 10, 0, 999999),
      cout_niveau: int(a?.cout_niveau, 5, 0, 999999),
      niveau_max: int(a?.niveau_max, 1, 1, 99),
      effets: arr(a?.effets).slice(0, 4).map((e) => normEffet(e, false)),
    }),
  };

  // Les réglages du module (Saga les borne pareil : modules/roguelite/etages.js › reglages).
  const normReglages = (g) => ({
    ...propre(g),
    etages: int(g?.etages, 3, 1, 20),
    salles: int(g?.salles, 4, 1, 30),
    salles_par_etage: int(g?.salles_par_etage, 1, 0, 10),
    tresors: int(g?.tresors, 1, 0, 6),
    boutiques: int(g?.boutiques, 1, 0, 6),
    repos: int(g?.repos, 1, 0, 6),
    graine: int(g?.graine, 0, 0, 2147483647),
    monnaie: str(g?.monnaie).trim().slice(0, 30) || 'Éclats',
    monnaie_ennemi: int(g?.monnaie_ennemi, 1, 0, 9999),
    monnaie_etage: int(g?.monnaie_etage, 5, 0, 99999),
    monnaie_victoire: int(g?.monnaie_victoire, 20, 0, 99999),
    renfort: int(g?.renfort, 25, 0, 500),
    prix_perk: int(g?.prix_perk, 30, 0, 99999),
    carte_mini: g?.carte_mini !== false,
    tuile_mur: int(g?.tuile_mur, -1, -1, 99999),
  });
  // La salle de donjon d'une carte (null : une carte ordinaire).
  const normSalle = (s) => (s && typeof s === 'object' && TYPES_SALLE.some(([k]) => k === s.type)
    ? { type: s.type, poids: int(s.poids, 10, 1, 1000), etage_min: int(s.etage_min, 1, 1, 99), etage_max: int(s.etage_max, 0, 0, 99) } : null);
  // Les portes d'une salle : les cases libres de chaque bord (comme Saga). passageLibre(x, y) : la case est franchissable.
  function portes(map, passageLibre) {
    const w = map.width, h = map.height, out = { n: 0, s: 0, e: 0, o: 0 };
    for (let x = 1; x < w - 1; x++) { if (passageLibre(x, 0)) out.n++; if (passageLibre(x, h - 1)) out.s++; }
    for (let y = 1; y < h - 1; y++) { if (passageLibre(0, y)) out.o++; if (passageLibre(w - 1, y)) out.e++; }
    return out;
  }
  const nomsPortes = (p) => [['n', 'nord'], ['s', 'sud'], ['e', 'est'], ['o', 'ouest']].filter(([k]) => p[k]).map(([, n]) => n);

  const U = () => Donnees.ui;
  function listes(data) {
    U().datalist('tafl-perks', arr(data.perks).map((p) => [p.id, p.nom]));
  }
  const statsDuPack = (work) => (typeof Events !== 'undefined' ? Events.statsBonus({ data: work }) : []);

  // La table des effets d'un perk ou d'une amélioration : un type, et ce qu'il faut selon le type.
  function tableEffets(ctx, o, perk) {
    const { table, sel, nombreIn, refInfo, descNom } = U();
    if (!Array.isArray(o.effets)) o.effets = [];
    const stats = statsDuPack(ctx.work);
    Donnees.listes(ctx.work);
    const detail = (e) => {
      const choixStat = [...stats, ...(e.stat && !stats.some(([k]) => k === e.stat) ? [[e.stat, `${e.stat} (pas dans ce pack)`]] : [])];
      const unite = (t) => el('span', { className: 'unit', textContent: t });
      switch (e.type) {
        case 'stat': return el('span', { className: 'inline' }, [sel(choixStat.length ? choixStat : [['', 'Ce pack n\'a pas de statistique de bonus']], e.stat, (v) => { e.stat = v; }), nombreIn(e, 'valeur', -90, 200), unite(perk ? '%' : '% par niveau')]);
        case 'vol_de_vie': return el('span', { className: 'inline' }, [nombreIn(e, 'valeur', 0, 99), unite('PV par ennemi vaincu')]);
        case 'monnaie': return el('span', { className: 'inline' }, [nombreIn(e, 'valeur', -90, 9999), unite(perk ? '%' : '% par niveau')]);
        case 'argent': return el('span', { className: 'inline' }, [nombreIn(e, 'valeur', 0, 99999), unite(`${ctx.work.reglages?.monnaie || 'argent'} par niveau`)]);
        case 'objet': return el('span', { className: 'inline' }, [refInfo(e, 'objet', 'tafl-donnees-objets', 'potion', descNom(arr(ctx.work.objets))), nombreIn(e, 'nombre', 1, 99), unite('par niveau')]);
        case 'perk': return sel([['', '(choisis un perk verrouillé)'], ...arr(ctx.work.perks).filter((p) => p.verrouille || p.id === e.perk).map((p) => [p.id, p.nom])], e.perk || '', (v) => { e.perk = v; });
        case 'soin': return unite('PV au maximum, une fois');
        default: return unite('quand(\'roguelite_perk\', (saga, infos) => …) dans un script, avec infos.perk');
      }
    };
    return table(o.effets, [
      ['Effet', (e, k, rendre) => sel(perk ? EFFETS_PERK : EFFETS_META, e.type, (v) => { o.effets[k] = normEffet({ type: v, stat: stats[0]?.[0] || '' }, perk); rendre(); }), true],
      ['Réglage', (e) => detail(e), true],
    ], () => normEffet({ type: 'stat', stat: stats[0]?.[0] || '' }, perk), { ajouter: '+ Effet', max: 4, vide: perk ? 'Aucun effet (utile avec un script).' : 'Aucun effet.' });
  }

  function formPerk(p, ctx) {
    const { champ, info, nombreIn, sel, blocImage, section } = U();
    const idl = ctx.idLigne(p);
    ctx.form.append(
      champ('Nom', ctx.input(p, 'nom', 'Lame affûtée, Bottes de vent…', idl.maj)), idl.el,
      el('label', { className: 'field field-textarea' }, [el('span', { className: 'field-label', textContent: 'Description' }), ctx.zone(p, 'description', 2, 'Ce que lit le joueur : « Attaque +15 % ».')]),
      blocImage(ctx, p, 'icone', 'Icône'),
      champ('Rareté', sel(RARETES, p.rarete, (v) => { p.rarete = v; ctx.renderListe?.(); }), 'plus rare = moins souvent tiré'),
      champ('Au plus', nombreIn(p, 'max', 1, 99), 'fois par partie'),
      champ('Verrouillé', ctx.coche(p, 'verrouille'), 'il faut une amélioration « Débloquer un perk » pour qu\'il puisse être tiré'),
      el('div', { className: 'field field-block' }, [el('span', { className: 'field-label', textContent: 'Effets' }), tableEffets(ctx, p, true)]),
      info('Un perk se gagne pendant une partie : un coffre (commande « Donner un perk »), un choix d\'un parmi trois (après un boss), ou la boutique. Il est perdu quand la partie se termine. Plus il est rare, moins il sort et plus il coûte cher ; pris plusieurs fois, ses effets s\'additionnent. Les statistiques passent par les bonus du groupe : celles que le pack sait toucher.'),
      section('Utilisation'), ctx.usages('perk', p.id),
    );
  }
  function formAmelioration(a, ctx) {
    const { champ, info, nombreIn, blocImage, section } = U();
    const idl = ctx.idLigne(a);
    const monnaie = normReglages(ctx.work.reglages?.modules_reglages?.roguelite).monnaie;
    const prix = el('p', { className: 'field-help' });
    const majPrix = () => { prix.textContent = `Prix : ${Array.from({ length: Math.min(a.niveau_max, 6) }, (_v, n) => a.cout + a.cout_niveau * n).join(', ')}${a.niveau_max > 6 ? '…' : ''} ${monnaie}.`; };
    majPrix();
    const suivre = (input) => { input.addEventListener('input', majPrix); return input; };
    ctx.form.append(
      champ('Nom', ctx.input(a, 'nom', 'Cœur solide, Bourse du voyageur…', idl.maj)), idl.el,
      el('label', { className: 'field field-textarea' }, [el('span', { className: 'field-label', textContent: 'Description' }), ctx.zone(a, 'description', 2, 'Ce que lit le joueur au camp.')]),
      blocImage(ctx, a, 'icone', 'Icône'),
      el('div', { className: 'field-grid' }, [
        champ('Prix', suivre(nombreIn(a, 'cout', 0, 999999)), monnaie),
        champ('Puis', suivre(nombreIn(a, 'cout_niveau', 0, 999999)), `${monnaie} de plus par niveau`),
        champ('Niveaux', suivre(nombreIn(a, 'niveau_max', 1, 99))),
      ]),
      prix,
      el('div', { className: 'field field-block' }, [el('span', { className: 'field-label', textContent: 'Effets (multipliés par le niveau)' }), tableEffets(ctx, a, false)]),
      info('Le joueur l\'achète au camp (commande « Ouvrir les améliorations ») avec la monnaie du roguelite, qu\'il garde même après une défaite. Elle reste pour toutes les parties suivantes.'),
      section('Utilisation'), ctx.usages('amelioration', a.id),
    );
  }

  const leadImage = (src) => el('img', { className: 'row-portrait pixel', src, alt: '' });
  const dot = (c) => el('span', { className: 'row-dot', style: { background: c } });
  const ONGLETS = [
    { key: 'perks', modules: MODULE, groupe: 'Roguelite', label: 'Perks', icon: 'star', kind: 'perk', base: 'Nouveau perk',
      nouveau: (id) => NORMES.perks({ id, nom: 'Nouveau perk', effets: [{ type: 'stat', stat: 'attaque', valeur: 10 }] }, 0),
      meta: (p) => `${RARETES.find(([k]) => k === p.rarete)?.[1] || p.rarete}${p.max > 1 ? ` · ×${p.max}` : ''}${p.verrouille ? ' · verrouillé' : ''}`,
      lead: (p) => (p.icone ? leadImage(p.icone) : dot(COULEURS_RARETE[p.rarete])),
      vide: 'Aucun perk. Un perk se gagne pendant une partie (coffre, boutique, choix après un boss) et se perd à la fin : Attaque +15 %, vol de vie…', form: formPerk },
    { key: 'ameliorations', modules: MODULE, groupe: 'Roguelite', label: 'Améliorations', icon: 'arrow-up', kind: 'amelioration', base: 'Nouvelle amélioration',
      nouveau: (id) => NORMES.ameliorations({ id, nom: 'Nouvelle amélioration', effets: [{ type: 'stat', stat: 'attaque', valeur: 5 }] }, 0),
      meta: (a) => `${a.cout} · ${a.niveau_max} niveau${a.niveau_max > 1 ? 'x' : ''}`,
      lead: (a) => (a.icone ? leadImage(a.icone) : null),
      vide: 'Aucune amélioration. Achetées au camp avec la monnaie du roguelite, elles restent d\'une partie à l\'autre.', form: formAmelioration },
  ];

  // Les réglages du module, sous sa case dans Réglages › Règles du jeu › Modules.
  function formReglages(r, ctx) {
    const { champ, info, nombreIn, texteIn } = U();
    if (!r.modules_reglages || typeof r.modules_reglages !== 'object') r.modules_reglages = {};
    const g = r.modules_reglages.roguelite = normReglages(r.modules_reglages.roguelite);
    const salles = (ctx.doc?.maps || []).filter((m) => m.salle);
    const parType = TYPES_SALLE.map(([k, n]) => `${n.split(' (')[0]} ${salles.filter((m) => m.salle.type === k).length}`).join(' · ');
    return [
      el('div', { className: 'field-grid' }, [
        champ('Étages', nombreIn(g, 'etages', 1, 20), 'le boss du dernier étage vaincu : victoire'),
        champ('Salles de combat', nombreIn(g, 'salles', 1, 30), 'au premier étage, entre le départ et le boss'),
        champ('Puis', nombreIn(g, 'salles_par_etage', 0, 10), 'de plus à chaque étage'),
      ]),
      el('div', { className: 'field-grid' }, [
        champ('Trésors', nombreIn(g, 'tresors', 0, 6), 'par étage'),
        champ('Boutiques', nombreIn(g, 'boutiques', 0, 6), 'par étage'),
        champ('Repos', nombreIn(g, 'repos', 0, 6), 'par étage'),
      ]),
      el('div', { className: 'field-grid' }, [
        champ('Renfort', nombreIn(g, 'renfort', 0, 500), '% d\'ennemis en plus à chaque étage'),
        champ('Graine', nombreIn(g, 'graine', 0, 2147483647), '0 = une nouvelle à chaque partie ; un nombre : toujours le même donjon'),
      ]),
      el('div', { className: 'field-grid' }, [
        champ('Monnaie', Object.assign(texteIn(g, 'monnaie', 'Éclats'), { style: 'width: 9em' }), 'gardée même après une défaite'),
        champ('Par ennemi', nombreIn(g, 'monnaie_ennemi', 0, 9999)),
        champ('Par étage', nombreIn(g, 'monnaie_etage', 0, 99999)),
        champ('Victoire', nombreIn(g, 'monnaie_victoire', 0, 99999)),
      ]),
      el('div', { className: 'field-grid' }, [
        champ('Prix d\'un perk', nombreIn(g, 'prix_perk', 0, 99999), `${r.monnaie || 'argent'} (×2 rare, ×4 épique, ×8 légendaire)`),
        champ('Mini-carte', ctx.coche(g, 'carte_mini'), 'en haut à droite, pendant une partie'),
        champ('Tuile des portes murées', nombreIn(g, 'tuile_mur', -1, 99999), 'n° de tuile (−1 : un mur dessiné par Saga)'),
      ]),
      info(`Salles modèles du jeu : ${salles.length ? parType : 'aucune'}. Coche « Salle de donjon » dans le menu ⋯ d'une carte. Ses portes sont les ouvertures de son mur, au milieu des bords : Saga mure celles dont l'étage n'a pas besoin, et ferme les autres tant qu'il reste des ennemis.`),
      info('Au camp : un événement avec « Partir dans le donjon », un autre avec « Ouvrir les améliorations ». Dans la salle du boss : un escalier (condition « La salle est vidée ») avec « Descendre à l\'étage suivant ». Les perks et les améliorations sont dans Données › Perks et Améliorations (groupe Roguelite).'),
    ];
  }

  function resumer(doc, sorte, o) {
    const eff = (l) => l.map((e) => `${e.type}${e.stat ? ` ${e.stat}` : ''}${e.valeur !== undefined ? ` ${e.valeur}` : ''}${e.objet ? ` ${e.objet}×${e.nombre}` : ''}${e.perk ? ` ${e.perk}` : ''}`).join(', ') || 'aucun effet';
    if (sorte === 'perks') return `${o.id} « ${o.nom} » ${o.rarete}${o.max > 1 ? ` ×${o.max}` : ''}${o.verrouille ? ' verrouillé' : ''} : ${eff(o.effets)}`;
    if (sorte === 'ameliorations') return `${o.id} « ${o.nom} » prix ${o.cout} (+${o.cout_niveau}/niveau), ${o.niveau_max} niveau(x) : ${eff(o.effets)}`;
    return null;
  }
  function utilisations(doc, sorte, id, out) {
    if (sorte !== 'perk' && sorte !== 'amelioration') return;
    Events.parcourirJeu(doc, ({ commande, condition, ev, map, page }) => {
      const c = commande || condition;
      const ici = `${map.name} › ${ev.nom || ev.id}${ev.pages.length > 1 ? ` (page ${page + 1})` : ''}`;
      if (sorte === 'perk' && c.type === 'roguelite_perk' && c.perk === id) out.add(ici);
      if (sorte === 'amelioration' && c.type === 'roguelite_amelioration' && c.amelioration === id) out.add(ici);
    });
    if (sorte === 'perk') for (const a of doc.data.ameliorations || []) if (a.effets.some((e) => e.type === 'perk' && e.perk === id)) out.add(`Amélioration ${a.nom}`);
  }

  return { SORTES, NORMES, ONGLETS, MODULE, RARETES, TYPES_SALLE, normReglages, normSalle, portes, nomsPortes, listes, resumer, utilisations, formReglages };
})();
