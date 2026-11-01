// Le module « gestion » (Saga 1.5) : les calculs, sans écran ni moteur. Tout ici est pur : chaque fonction
// reçoit les définitions du jeu et l'état du module, et rend un état NEUF (jamais changé sur place). C'est
// ce qui permet de tester la fin de journée sans Saga, et de ne jamais laisser une journée à moitié calculée.
//
// Les définitions viennent du dossier du jeu (FORMAT.md › Le module gestion) :
//   donnees/ressources.json  { ressources: [{ id, nom, description, icone, objet }] }
//   donnees/batiments.json   { batiments: [{ id, nom, description, cout, jours, production, consommation, maximum }] }
//   reglages.modules_reglages.gestion  { nom, stock_depart, capacite, menu, construire_menu, rapport_bilan, prevision, carnet_resume,
//                                        habitants_depart, repas, arrivees }
// cout, production, consommation et stock_depart sont des listes [{ ressource, nombre }].
//
// L'état (partie.modules.gestion) :
//   { stock: { ressource: nombre }, batiments: [{ id, type, etat: 'chantier' | 'fini', reste, carte, x, y }], habitants, prochain, resolu }
//   habitants (Saga 1.6) = combien de gens vivent au domaine (ils logent dans les bâtiments finis)
//   faim (Saga 1.6.1)    = combien de nuits de suite quelqu'un n'a pas mangé
//   retour (Saga 1.6.1)  = { carte, x, y, direction } : devant la porte du dernier bâtiment où le joueur est entré
//   carte, x, y : où il est posé (Saga 1.5 ; absent pour un bâtiment construit sans place, par un événement)
//   reste   = les nuits qu'il faut encore à un chantier
//   resolu  = le dernier jour dont la fin a été calculée : la recalculer ne fait rien

const GestionCalcul = (() => {
  const ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;
  const PASSAGES = ['auto', 'libre', 'bloque', 'porte'];
  const entier = (v, d = 0, min = 0, max = 1e9) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };
  const texte = (v, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '');
  const tableau = (v) => (Array.isArray(v) ? v : []);
  const copie = (o) => JSON.parse(JSON.stringify(o));

  // Une liste [{ ressource, nombre }] → { ressource: nombre } (les ressources inconnues sont gardées : le
  // vérificateur de Tafl les signale, Saga ne plante pas).
  function quantites(liste) {
    const out = {};
    for (const q of tableau(liste)) {
      if (!q || typeof q.ressource !== 'string' || !ID.test(q.ressource)) continue;
      const n = entier(q.nombre, 0);
      if (n > 0) out[q.ressource] = (out[q.ressource] || 0) + n;
    }
    return out;
  }

  // Les définitions du jeu, lues une fois (jeu.donnees : les fichiers de donnees/, déjà lus par Saga).
  // tampons : les tampons du jeu (jeu.tampons, une Map nom → { largeur, hauteur, dessus, cases }), pour la
  // taille d'un bâtiment qui en a un.
  function definitions(donnees, tampons = new Map()) {
    const tailleTampon = (nom, cle) => (typeof nom === 'string' && tampons.get(nom)?.[cle]) || 0;
    const ressources = new Map();
    for (const r of tableau(donnees?.ressources?.ressources)) {
      if (r && typeof r.id === 'string' && ID.test(r.id)) ressources.set(r.id, { id: r.id, nom: texte(r.nom, 60) || r.id, description: texte(r.description), icone: texte(r.icone, 2e6), objet: typeof r.objet === 'string' ? r.objet : '' });
    }
    const batiments = new Map();
    for (const b of tableau(donnees?.batiments?.batiments)) {
      if (!b || typeof b.id !== 'string' || !ID.test(b.id)) continue;
      batiments.set(b.id, {
        id: b.id, nom: texte(b.nom, 60) || b.id, description: texte(b.description),
        cout: quantites(b.cout), jours: entier(b.jours, 0, 0, 999), production: quantites(b.production), consommation: quantites(b.consommation),
        maximum: entier(b.maximum, 0, 0, 999),
        // Saga 1.5 : posé sur la carte. Son apparence : un tampon de Tafl (par son nom), et sa taille avec ;
        // sans tampon, largeur × hauteur cases. porte : la case de l'emprise qu'on peut traverser.
        tampon: texte(b.tampon, 80), tampon_chantier: texte(b.tampon_chantier, 80),
        largeur: Math.max(1, tailleTampon(b.tampon, 'largeur') || entier(b.largeur, 1, 1, 32)),
        hauteur: Math.max(1, tailleTampon(b.tampon, 'hauteur') || entier(b.hauteur, 1, 1, 32)),
        porte: b.porte && typeof b.porte === 'object' && Number.isFinite(Number(b.porte.x)) && Number.isFinite(Number(b.porte.y)) ? { x: entier(b.porte.x, 0, 0, 31), y: entier(b.porte.y, 0, 0, 31) } : null,
        // Saga 1.6 : les habitants. logement : combien il en loge une fois fini ; ouvriers : combien il en
        // faut pour qu'il produise (0 : il produit seul).
        logement: entier(b.logement, 0, 0, 999), ouvriers: entier(b.ouvriers, 0, 0, 999),
      });
      // Saga 1.6.1 : le passage case par case (Tafl le règle à la souris), rangée par rangée :
      // 'auto' (selon la tuile du tampon), 'libre', 'bloque' ou 'porte' (on la traverse, et elle mène à
      // porte_vers). Une case 'porte' remplace le champ porte.
      const def = batiments.get(b.id);
      const n = def.largeur * def.hauteur;
      def.passage = Array.isArray(b.passage) ? Array.from({ length: n }, (_, k) => (PASSAGES.includes(b.passage[k]) ? b.passage[k] : 'auto')) : null;
      const kp = def.passage ? def.passage.indexOf('porte') : -1;
      if (kp >= 0) def.porte = { x: kp % def.largeur, y: Math.floor(kp / def.largeur) };
      const v = b.porte_vers;
      def.porte_vers = v && typeof v === 'object' && typeof v.carte === 'string' && v.carte ? { carte: v.carte, x: entier(v.x, 0, 0, 9999), y: entier(v.y, 0, 0, 9999), direction: ['haut', 'bas', 'gauche', 'droite'].includes(v.direction) ? v.direction : 'haut' } : null;
      // Saga 1.6.1 : 'propre' (défaut) : chaque bâtiment posé a sa copie de l'intérieur (la carte
      // « porte_vers.carte@id du bâtiment ») ; 'partage' : tous ceux de ce type mènent à la même carte.
      def.interieur = b.interieur === 'partage' ? 'partage' : 'propre';
      // Saga 1.11 : un bâtiment de repos (un spa, des bains, une cuisine). quand : 'visite' (le joueur vient
      // s'y reposer, commande gestion_repos) ou 'matin' (chaque matin, tant qu'il est fini). Il soigne le
      // groupe (soigner) et lui donne un bonus (stats en %, voir moteur/bonus.js) pour `combats` combats
      // (0 : sans limite), jusqu'à la nuit. Une visite peut coûter des ressources du stock (cout).
      def.repos = repos(b.repos, def.nom);
    }
    const g = donnees?.reglages?.reglages?.modules_reglages?.gestion || {};
    const reglages = { nom: texte(g.nom, 40) || 'Domaine', stock_depart: quantites(g.stock_depart), capacite: entier(g.capacite, 0), menu: g.menu !== false, construire_menu: g.construire_menu !== false,
      // Saga 1.6 : les habitants. repas : ce que chacun mange par nuit ; arrivees : combien en arrivent au
      // plus par nuit quand il reste de la place (0 : ils ne viennent que par la commande).
      habitants_depart: entier(g.habitants_depart, 0, 0, 9999), repas: quantites(g.repas), arrivees: entier(g.arrivees, 1, 0, 99),
      // Saga 1.6.1 : ce que fait la faim (choisi par le jeu). 'arrivees' : personne n'arrive tant que
      // quelqu'un a faim ; 'rien' : seulement le rapport ; 'departs' : de plus, après faim_nuits nuits de
      // faim de suite, un habitant part chaque nuit tant qu'elle dure. Dans tous les cas, ils travaillent.
      faim: ['arrivees', 'rien', 'departs'].includes(g.faim) ? g.faim : 'arrivees', faim_nuits: entier(g.faim_nuits, 3, 1, 99),
      // Saga 1.9 : les habitants qu'on voit aller et venir (promeneurs, false : on ne les voit pas), avec
      // l'apparence d'un personnage du jeu (vide : un petit bonhomme), au plus promeneurs_max à la fois.
      promeneurs: g.promeneurs !== false, promeneur_perso: texte(g.promeneur_perso, 64), promeneurs_max: entier(g.promeneurs_max, 12, 1, 40),
      // Saga 1.9 : les sentiers qui se creusent (usure, false : rien). Chaque pas d'un habitant use la case ;
      // à seuil_usee pas, elle prend la tuile_usee (de l'herbe tassée), à seuil_sentier, la tuile_sentier
      // (-1 : un sentier dessiné par Saga). Chaque nuit, une case perd usure_repousse pas (l'herbe repousse).
      usure: g.usure !== false, tuile_usee: entier(g.tuile_usee, -1, -1, 99999), tuile_sentier: entier(g.tuile_sentier, -1, -1, 99999),
      seuil_usee: entier(g.seuil_usee, 6, 1, 9999), seuil_sentier: entier(g.seuil_sentier, 20, 1, 9999), usure_repousse: entier(g.usure_repousse, 2, 0, 9999),
      // Saga 1.10 : l'emploi du temps des habitants, quand le jeu a une horloge (horaires, false : ils vont et
      // viennent sans regarder l'heure, comme sans horloge). Ils se lèvent à heure_lever, travaillent de
      // heure_travail à heure_fin, flânent avant et après, et dorment chez eux de heure_coucher au lever.
      horaires: g.horaires !== false, heure_lever: entier(g.heure_lever, 7, 0, 23), heure_travail: entier(g.heure_travail, 8, 0, 23),
      heure_fin: entier(g.heure_fin, 17, 0, 23), heure_coucher: entier(g.heure_coucher, 21, 0, 23),
      // Saga 1.11 : le lien avec les sorties. butin_au_stock : après un combat gagné, les objets du sac qui
      // représentent une ressource (ressource.objet) vont tout seuls au stock ; perte_defaite : le % de
      // chaque ressource du stock perdu quand le groupe est vaincu (0 : rien, le défaut).
      butin_au_stock: g.butin_au_stock === true, perte_defaite: entier(g.perte_defaite, 0, 0, 100),
      // Saga 1.13 : les écrans. rapport_bilan : le rapport du matin commence par ce qui a bougé dans le stock
      // (et pourquoi) ; prevision : l'écran du domaine dit ce que la nuit va changer ; carnet_resume : le
      // stock et les habitants en résumé dans le carnet (Tab). Tous à true par défaut.
      rapport_bilan: g.rapport_bilan !== false, prevision: g.prevision !== false, carnet_resume: g.carnet_resume !== false,
      // pastilles (true) : une ressource sans icône a une pastille de couleur avec son initiale ; textes : les
      // mots des écrans (le catalogue commun/modules.js donne les clés et les défauts ; vide : le défaut).
      pastilles: g.pastilles !== false, textes: lesTextes(g.textes) };
    reglages.seuil_sentier = Math.max(reglages.seuil_sentier, reglages.seuil_usee);
    return { ressources, batiments, reglages };
  }

  // Saga 1.13 : les mots des écrans, ceux du jeu par-dessus les défauts du catalogue.
  function lesTextes(t) {
    let cat = typeof ModulesJeu !== 'undefined' ? ModulesJeu : null;
    if (!cat && typeof require === 'function') try { cat = require('../../../../../commun/modules.js'); } catch { /* hors du dépôt */ }
    const defauts = cat?.CATALOGUE?.gestion?.textes || {};
    return Object.fromEntries(Object.entries(defauts).map(([k, [defaut]]) => [k, texte(t?.[k], 60).trim() || defaut]));
  }

  function repos(r, nom) {
    if (!r || typeof r !== 'object' || !['visite', 'matin'].includes(r.quand)) return null;
    const stats = {};
    for (const q of tableau(r.stats)) {
      if (!q || typeof q.stat !== 'string' || !/^[a-z_]{1,32}$/.test(q.stat)) continue;
      const n = entier(q.pourcent, 0, -90, 200);
      if (n) stats[q.stat] = n;
    }
    return { quand: r.quand, soigner: r.soigner !== false, stats, combats: entier(r.combats, 0, 0, 99), cout: quantites(r.cout), nom: texte(r.nom, 60) || nom };
  }

  const nomRessource = (d, id) => d.ressources.get(id)?.nom || id;
  const nomBatiment = (d, id) => d.batiments.get(id)?.nom || id;
  // « 4 Bois, 2 Pierre »
  const dire = (d, q) => Object.entries(q).map(([r, n]) => `${n} ${nomRessource(d, r)}`).join(', ');

  // L'état d'une partie neuve : le stock de départ.
  const etatNeuf = (d) => ({ stock: { ...d.reglages.stock_depart }, batiments: [], habitants: d.reglages.habitants_depart, faim: 0, prochain: 1, resolu: 0 });

  // Un état lu dans une sauvegarde (ou écrit à la main) remis en forme. Les bâtiments d'un type que le jeu
  // n'a plus sont gardés (le jeu peut le remettre) mais ne produisent rien.
  function normaliser(d, e) {
    const etat = e && typeof e === 'object' ? e : {};
    const stock = {};
    for (const [r, n] of Object.entries(etat.stock && typeof etat.stock === 'object' ? etat.stock : {})) if (ID.test(r) && entier(n) > 0) stock[r] = entier(n);
    const vus = new Set();
    const batiments = [];
    for (const b of tableau(etat.batiments)) {
      if (!b || typeof b.type !== 'string' || !ID.test(b.type)) continue;
      const id = typeof b.id === 'string' && b.id && !vus.has(b.id) ? b.id : `b${batiments.length + 1}-${b.type}`;
      vus.add(id);
      const fini = b.etat === 'fini' || entier(b.reste) <= 0;
      const lieu = typeof b.carte === 'string' && b.carte ? { carte: b.carte, x: entier(b.x, 0, 0, 9999), y: entier(b.y, 0, 0, 9999) } : {};
      batiments.push({ id, type: b.type, etat: fini ? 'fini' : 'chantier', reste: fini ? 0 : entier(b.reste, 1, 1, 999), ...lieu });
    }
    return { stock, batiments, habitants: entier(etat.habitants, 0, 0, 9999), faim: entier(etat.faim, 0, 0, 999),
      // Saga 1.6.1 : par où ressortir de l'intérieur d'un bâtiment (la case devant sa porte).
      ...(etat.retour && typeof etat.retour === 'object' && typeof etat.retour.carte === 'string' ? { retour: { carte: etat.retour.carte, x: entier(etat.retour.x, 0, 0, 9999), y: entier(etat.retour.y, 0, 0, 9999), direction: typeof etat.retour.direction === 'string' ? etat.retour.direction : 'bas' } } : {}),
      prochain: Math.max(entier(etat.prochain, 1, 1), batiments.length + 1), resolu: entier(etat.resolu, 0),
      // Saga 1.9 : l'usure des cases, par carte : { carte: { « indice de la case » : pas } }.
      ...(etat.usure && typeof etat.usure === 'object' ? { usure: normUsure(etat.usure) } : {}) };
  }
  function normUsure(u) {
    const out = {};
    for (const [c, cases] of Object.entries(u)) {
      if (typeof c !== 'string' || !c || !cases || typeof cases !== 'object') continue;
      const m = {};
      for (const [i, n] of Object.entries(cases)) if (/^\d{1,6}$/.test(i) && entier(n) > 0) m[i] = entier(n, 0, 0, 99999);
      if (Object.keys(m).length) out[c] = m;
    }
    return out;
  }

  // Saga 1.9 : un pas de plus sur la case i de la carte (sur place, appelé à chaque pas : rapide). Le compte
  // s'arrête un peu au-dessus du seuil du sentier, pour qu'un sentier délaissé repousse en quelques nuits.
  function user(d, e, carte, i) {
    if (!d.reglages.usure) return 0;
    const u = (e.usure ??= {});
    const m = (u[carte] ??= {});
    const n = Math.min((m[i] || 0) + 1, d.reglages.seuil_sentier + Math.max(1, d.reglages.usure_repousse) * 3);
    m[i] = n;
    return n;
  }
  // Ce que montre une case : 0 rien, 1 usée, 2 sentier.
  // Saga 1.10 : ce que font les habitants à l'heure h (de 0 à 24) : 'nuit' (chez eux), 'travail' ou 'libre'
  // (ils flânent). null : pas d'emploi du temps (le jeu n'a pas d'horloge, ou horaires est coupé). Les plages
  // peuvent passer minuit (coucher à 1 h, travail de nuit de 22 h à 6 h).
  const dans = (h, a, b) => (a === b ? false : a < b ? h >= a && h < b : h >= a || h < b);
  function periode(d, h) {
    const r = d.reglages;
    if (!r.horaires || h === null || h === undefined || !Number.isFinite(Number(h))) return null;
    const x = ((Number(h) % 24) + 24) % 24;
    if (dans(x, r.heure_travail, r.heure_fin)) return 'travail';
    if (dans(x, r.heure_coucher, r.heure_lever)) return 'nuit';
    return 'libre';
  }
  const niveauUsure = (d, n) => (n >= d.reglages.seuil_sentier ? 2 : n >= d.reglages.seuil_usee ? 1 : 0);
  // La nuit, l'herbe repousse un peu partout.
  function repousserUsure(d, etat) {
    if (!etat.usure) return;
    const k = d.reglages.usure_repousse;
    if (!k) return;
    for (const [c, m] of Object.entries(etat.usure)) {
      for (const [i, n] of Object.entries(m)) { if (n - k > 0) m[i] = n - k; else delete m[i]; }
      if (!Object.keys(m).length) delete etat.usure[c];
    }
  }

  // La place pour chaque ressource (0 = sans limite).
  const capacite = (d) => d.reglages.capacite;
  // Saga 1.6 : la place pour loger des habitants (les bâtiments finis).
  const logement = (d, e) => e.batiments.reduce((t, b) => t + (b.etat === 'fini' ? d.batiments.get(b.type)?.logement || 0 : 0), 0);
  // Combien de bâtiments de ce type (chantiers compris, ou seulement les finis).
  const combien = (e, type, finis = false) => e.batiments.filter((b) => b.type === type && (!finis || b.etat === 'fini')).length;

  // Ajouter (n > 0) ou retirer (n < 0) une ressource. Le stock ne passe jamais sous 0 ni au-dessus de la
  // capacité. Rend { etat, change } : ce qui a vraiment changé.
  function ajouter(d, e, ressource, n) {
    const etat = copie(e);
    const avant = etat.stock[ressource] || 0;
    let apres = Math.max(0, avant + entier(n, 0, -1e9));
    const cap = capacite(d);
    if (cap > 0 && n > 0) apres = Math.min(apres, Math.max(cap, avant));
    if (apres) etat.stock[ressource] = apres; else delete etat.stock[ressource];
    return { etat, change: apres - avant };
  }

  const manque = (stock, q) => Object.entries(q).filter(([r, n]) => (stock[r] || 0) < n).map(([r, n]) => [r, n - (stock[r] || 0)]);

  // Les cases qu'un bâtiment posé occupe sur sa carte ; bloquantes : toutes sauf sa porte.
  function cases(d, b, bloquantes = false) {
    const def = d.batiments.get(b.type);
    if (!b.carte || !def) return [];
    const out = [];
    for (let j = 0; j < def.hauteur; j++) for (let i = 0; i < def.largeur; i++) {
      if (bloquantes && def.porte && def.porte.x === i && def.porte.y === j) continue;
      out.push([b.x + i, b.y + j]);
    }
    return out;
  }
  // Peut-on poser ce bâtiment en (x, y) sur cette carte ? lieu : { carte, constructible(x, y), libre(x, y) }
  // (ce que le moteur sait de la carte : zone constructible, case sans obstacle ni événement ni joueur).
  // Rend { ok, raison }.
  function placement(d, e, type, lieu, x, y) {
    const def = d.batiments.get(type);
    if (!def) return { ok: false, raison: 'Ce bâtiment n\'existe pas.' };
    const prises = new Set();
    for (const b of e.batiments) if (b.carte === lieu.carte) for (const [cx, cy] of cases(d, b)) prises.add(`${cx},${cy}`);
    for (let j = 0; j < def.hauteur; j++) for (let i = 0; i < def.largeur; i++) {
      const cx = x + i, cy = y + j;
      if (!lieu.constructible(cx, cy)) return { ok: false, raison: 'On ne peut construire que dans la zone prévue.' };
      if (prises.has(`${cx},${cy}`)) return { ok: false, raison: 'Il y a déjà un bâtiment ici.' };
      if (!lieu.libre(cx, cy)) return { ok: false, raison: 'La place n\'est pas libre.' };
    }
    return { ok: true };
  }

  // Lancer la construction d'un bâtiment : il faut de quoi le payer, et ne pas dépasser son maximum.
  // lieu (Saga 1.5) : { carte, x, y } s'il est posé sur une carte (vérifié avant par placement()).
  // Rend { ok, etat, raison, batiment } (raison : une phrase pour le joueur).
  function construire(d, e, type, lieu = null) {
    const def = d.batiments.get(type);
    if (!def) return { ok: false, etat: e, raison: `Ce bâtiment n'existe pas (${type}).` };
    if (def.maximum && combien(e, type) >= def.maximum) return { ok: false, etat: e, raison: def.maximum === 1 ? `${def.nom} : il y en a déjà un.` : `${def.nom} : il y en a déjà ${def.maximum}.` };
    const m = manque(e.stock, def.cout);
    if (m.length) return { ok: false, etat: e, raison: `Pour ${def.nom}, il manque ${dire(d, Object.fromEntries(m))}.` };
    const etat = copie(e);
    for (const [r, n] of Object.entries(def.cout)) { etat.stock[r] -= n; if (!etat.stock[r]) delete etat.stock[r]; }
    const batiment = { id: `b${etat.prochain}`, type, etat: def.jours > 0 ? 'chantier' : 'fini', reste: def.jours, ...(lieu ? { carte: lieu.carte, x: lieu.x, y: lieu.y } : {}) };
    while (etat.batiments.some((b) => b.id === batiment.id)) batiment.id = `b${++etat.prochain}`;
    etat.prochain += 1;
    etat.batiments.push(batiment);
    return { ok: true, etat, batiment };
  }

  // Saga 1.6 : des habitants arrivent (n > 0) ou partent (n < 0). Ils ne dépassent pas le logement, sauf
  // forcer (une histoire qui amène quelqu'un même sans maison). Rend { etat, change }.
  function habitants(d, e, n, forcer = false) {
    const etat = copie(e);
    const avant = etat.habitants || 0;
    let apres = Math.max(0, avant + entier(n, 0, -1e9));
    if (n > 0 && !forcer) apres = Math.min(apres, Math.max(avant, logement(d, etat)));
    etat.habitants = apres;
    return { etat, change: apres - avant };
  }

  // Le sac du joueur vers le stock : chaque objet qui représente une ressource (ressource.objet). Rend
  // { etat, sac, depose } ; ce qui ne tient pas dans le stock reste dans le sac.
  function deposer(d, e, sacAvant) {
    let etat = copie(e);
    const sac = { ...(sacAvant || {}) };
    const depose = {};
    for (const r of d.ressources.values()) {
      if (!r.objet || !(sac[r.objet] > 0)) continue;
      const res = ajouter(d, etat, r.id, sac[r.objet]);
      etat = res.etat;
      if (res.change > 0) {
        depose[r.id] = res.change;
        sac[r.objet] -= res.change;
        if (!sac[r.objet]) delete sac[r.objet];
      }
    }
    return { etat, sac, depose };
  }

  // Saga 1.11 : perdre `pourcent` % de chaque ressource du stock (arrondi au-dessous ; au moins 1 d'une
  // ressource qu'on a, si le % n'est pas nul). Rend { etat, perdu }.
  function perdre(d, e, pourcent) {
    const etat = copie(e);
    const perdu = {};
    const p = entier(pourcent, 0, 0, 100);
    if (!p) return { etat, perdu };
    for (const [r, q] of Object.entries(etat.stock)) {
      const n = Math.min(q, Math.max(1, Math.floor((q * p) / 100)));
      if (n <= 0) continue;
      perdu[r] = n;
      etat.stock[r] = q - n;
      if (!etat.stock[r]) delete etat.stock[r];
    }
    return { etat, perdu };
  }

  // Saga 1.11 : les bâtiments de repos finis, d'une sorte ('visite' ou 'matin'), un par type (deux bains
  // ne donnent pas deux fois le même bonus). → [{ batiment, def }]
  function reposFinis(d, e, quand) {
    const vus = new Set(), out = [];
    for (const b of e.batiments) {
      const def = d.batiments.get(b.type);
      if (b.etat !== 'fini' || def?.repos?.quand !== quand || vus.has(b.type)) continue;
      vus.add(b.type);
      out.push({ batiment: b, def });
    }
    return out;
  }

  // Saga 1.11 : se reposer dans un bâtiment de type `type` : il faut qu'il y en ait un de fini, et payer le
  // coût d'une visite. Rend { ok, raison, etat, repos } (repos : ce qu'il donne, à appliquer par le moteur).
  function sereposer(d, e, type) {
    const def = d.batiments.get(type);
    if (!def?.repos) return { ok: false, raison: `${def?.nom || type} n'est pas un lieu de repos.`, etat: e };
    if (!e.batiments.some((b) => b.type === type && b.etat === 'fini')) return { ok: false, raison: `${def.nom} n'est pas encore construit.`, etat: e };
    const m = manque(e.stock, def.repos.cout);
    if (m.length) return { ok: false, raison: `Pour se reposer à ${def.nom}, il manque ${dire(d, Object.fromEntries(m))}.`, etat: e };
    const etat = copie(e);
    for (const [r, k] of Object.entries(def.repos.cout)) { etat.stock[r] -= k; if (!etat.stock[r]) delete etat.stock[r]; }
    return { ok: true, raison: '', etat, repos: def.repos };
  }

  // La fin du jour `jour`, dans un ordre fixe :
  //   1. les habitants mangent (repas, dans le stock du coucher). Ceux qui n'ont pas mangé travaillent quand
  //      même (Saga 1.6.1) : sinon une ferme sans blé n'aurait plus d'ouvriers pour en produire, pour toujours.
  //      Ce que fait la faim dépend du réglage faim (étape 5) ;
  //   2. les habitants vont aux bâtiments finis qui demandent des ouvriers, dans l'ordre de
  //      construction ; un bâtiment qui n'a pas tous ses ouvriers ne produit pas ;
  //   3. les bâtiments finis produisent, s'ils ont ce qu'ils consomment dans le stock du coucher (s'ils sont
  //      plusieurs à vouloir la même ressource, le premier bâti passe d'abord) ;
  //   4. les chantiers avancent d'une nuit (un bâtiment fini cette nuit produira la nuit suivante) ;
  //   5. faim 'departs' : après faim_nuits nuits de faim de suite, un habitant part. Puis, s'il reste de la
  //      place pour loger et que tous ont mangé (ou faim 'rien'), des habitants arrivent (ils travaillent à
  //      partir de la nuit suivante) ;
  //   6. le stock est ramené à sa capacité.
  // Rend { etat, lignes, termines, arrives, partis, bilan, evenements } (lignes : le rapport du matin, en texte).
  // Saga 1.13 : bilan = { ressource: { avant, apres, produit, mange, consomme, perdu } } (ce qui a bougé dans
  // le stock, et pourquoi) ; evenements = [{ texte, ton }] : le reste du rapport (ton 'alerte' : un souci).
  // Le même jour une deuxième fois : rien.
  function finDeJournee(d, e, jour) {
    const n = entier(jour, 0);
    if (n <= e.resolu) return { etat: e, lignes: [], termines: [], arrives: 0, partis: 0, bilan: {}, evenements: [] };
    const etat = copie(e);
    etat.habitants = entier(etat.habitants, 0, 0, 9999);
    const avant = { ...etat.stock };
    const bilan = {};
    const noter = (sorte, q) => { for (const [r, k] of Object.entries(q)) { if (!k) continue; bilan[r] = bilan[r] || { produit: 0, mange: 0, consomme: 0, perdu: 0 }; bilan[r][sorte] += k; } };
    const evenements = [];
    const raconter = (texte, ton = '') => evenements.push({ texte, ton });
    const retirer = (q) => { for (const [r, k] of Object.entries(q)) { etat.stock[r] -= k; if (!etat.stock[r]) delete etat.stock[r]; } };
    // 1. Les repas : autant d'habitants que le stock peut en nourrir.
    let nourris = etat.habitants;
    const repas = d.reglages.repas;
    if (etat.habitants && Object.keys(repas).length) {
      nourris = Math.min(etat.habitants, ...Object.entries(repas).map(([r, k]) => Math.floor((etat.stock[r] || 0) / k)));
      const mange = Object.fromEntries(Object.entries(repas).map(([r, k]) => [r, k * nourris]).filter(([, k]) => k > 0));
      retirer(mange);
      noter('mange', mange);
      if (nourris < etat.habitants) {
        const suite = { arrivees: ' Personne ne s\'installera tant que tout le monde n\'a pas mangé.', rien: '', departs: ' Personne ne s\'installera tant que tout le monde n\'a pas mangé, et au bout de quelques nuits, des habitants partiront.' }[d.reglages.faim];
        raconter(`${etat.habitants - nourris} habitant${etat.habitants - nourris > 1 ? 's' : ''} sur ${etat.habitants} n'${etat.habitants - nourris > 1 ? 'ont' : 'a'} pas mangé : il manque ${dire(d, Object.fromEntries(Object.entries(repas).map(([r, k]) => [r, k * etat.habitants - (mange[r] || 0)]).filter(([, k]) => k > 0)))}.${suite}`, 'alerte');
      }
    }
    const faim = nourris < etat.habitants;
    etat.faim = faim ? entier(etat.faim, 0) + 1 : 0;
    // 2 et 3. Le travail et la production. Ce qui est produit cette nuit n'arrive au stock qu'à la fin : un
    // bâtiment ne consomme que ce qu'il y avait au coucher, quel que soit l'ordre des bâtiments.
    let libres = etat.habitants;
    const sansOuvriers = [];
    const produit = {};
    for (const b of etat.batiments) {
      const def = d.batiments.get(b.type);
      if (b.etat !== 'fini' || !def || !Object.keys(def.production).length) continue;
      if (def.ouvriers > libres) { sansOuvriers.push(def.nom); continue; }
      const m = manque(etat.stock, def.consommation);
      if (m.length) { raconter(`${def.nom} n'a rien produit : il manque ${dire(d, Object.fromEntries(m))}.`, 'alerte'); continue; }
      libres -= def.ouvriers;
      retirer(def.consommation);
      noter('consomme', def.consommation);
      for (const [r, q] of Object.entries(def.production)) produit[r] = (produit[r] || 0) + q;
    }
    if (sansOuvriers.length) raconter(`Pas assez d'habitants pour faire tourner : ${grouper(sansOuvriers)}.`, 'alerte');
    for (const [r, q] of Object.entries(produit)) etat.stock[r] = (etat.stock[r] || 0) + q;
    noter('produit', produit);
    // 4. Les chantiers. Saga 1.13 : une ligne pour tous ceux du même jour (« Maison ×2 »).
    const termines = [];
    for (const b of etat.batiments) {
      if (b.etat !== 'chantier') continue;
      b.reste = Math.max(0, b.reste - 1);
      if (b.reste === 0) { b.etat = 'fini'; termines.push(b.type); }
    }
    if (termines.length) raconter(`${termines.length > 1 ? 'Chantiers terminés' : 'Chantier terminé'} : ${grouper(termines.map((t) => nomBatiment(d, t)))}.`);
    // 5. Les départs (faim 'departs') puis les arrivées (pas de faim, ou faim 'rien').
    let partis = 0;
    if (faim && d.reglages.faim === 'departs' && etat.faim >= d.reglages.faim_nuits && etat.habitants > 0) {
      partis = 1;
      etat.habitants -= 1;
      raconter(`Un habitant a eu faim ${etat.faim} nuits de suite : il quitte le domaine.`, 'alerte');
    }
    let arrives = 0;
    if ((!faim || d.reglages.faim === 'rien') && d.reglages.arrivees > 0) {
      arrives = Math.max(0, Math.min(d.reglages.arrivees, logement(d, etat) - etat.habitants));
      if (arrives) { etat.habitants += arrives; raconter(arrives > 1 ? `${arrives} nouveaux habitants s'installent.` : 'Un nouvel habitant s\'installe.'); }
    }
    // 6. La capacité du stock.
    const cap = capacite(d);
    if (cap > 0) {
      const perdu = {};
      for (const [r, q] of Object.entries(etat.stock)) if (q > cap) { perdu[r] = q - cap; etat.stock[r] = cap; }
      if (Object.keys(perdu).length) raconter(`Le stock est plein : ${dire(d, perdu)} perdu${Object.values(perdu).reduce((x, y) => x + y, 0) > 1 ? 's' : ''}.`, 'alerte');
      noter('perdu', perdu);
    }
    // 7. (Saga 1.9) Les sentiers délaissés repoussent un peu.
    repousserUsure(d, etat);
    etat.resolu = n;
    for (const [r, b] of Object.entries(bilan)) { b.avant = avant[r] || 0; b.apres = etat.stock[r] || 0; }
    const lignes = [...(Object.keys(produit).length ? [`Production : ${dire(d, produit)}.`] : []), ...evenements.map((x) => x.texte)];
    return { etat, lignes, termines, arrives, partis, bilan, evenements };
  }

  // Saga 1.13 : des noms regroupés : ['Maison', 'Maison', 'Ferme'] → « Maison ×2, Ferme ».
  function grouper(noms) {
    const n = new Map();
    for (const x of noms) n.set(x, (n.get(x) || 0) + 1);
    return [...n].map(([x, k]) => (k > 1 ? `${x} ×${k}` : x)).join(', ');
  }

  // Saga 1.6 : qui travaille où, ce soir (pour l'écran du domaine et les scripts) : les ouvriers que
  // demandent les bâtiments finis, et combien d'habitants sont libres.
  function emplois(d, e) {
    let libres = entier(e.habitants, 0);
    let demandes = 0;
    for (const b of e.batiments) {
      const def = d.batiments.get(b.type);
      if (b.etat !== 'fini' || !def?.ouvriers || !Object.keys(def.production).length) continue;
      demandes += def.ouvriers;
      if (def.ouvriers <= libres) libres -= def.ouvriers;
    }
    return { habitants: entier(e.habitants, 0), logement: logement(d, e), demandes, libres };
  }

  return { definitions, perdre, reposFinis, sereposer, etatNeuf, normaliser, user, niveauUsure, periode, repousserUsure, capacite, combien, ajouter, construire, habitants, logement, emplois, cases, placement, deposer, finDeJournee, grouper, nomRessource, nomBatiment, dire, quantites };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = GestionCalcul;
