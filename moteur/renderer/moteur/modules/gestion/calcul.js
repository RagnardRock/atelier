// Le module « gestion » (Saga 1.5) : les calculs, sans écran ni moteur. Tout ici est pur : chaque fonction
// reçoit les définitions du jeu et l'état du module, et rend un état NEUF (jamais changé sur place). C'est
// ce qui permet de tester la fin de journée sans Saga, et de ne jamais laisser une journée à moitié calculée.
//
// Les définitions viennent du dossier du jeu (FORMAT.md › Le module gestion) :
//   donnees/ressources.json  { ressources: [{ id, nom, description, icone, objet }] }
//   donnees/batiments.json   { batiments: [{ id, nom, description, cout, jours, production, consommation, maximum }] }
//   reglages.modules_reglages.gestion  { nom, stock_depart, capacite, menu, construire_menu,
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
    }
    const g = donnees?.reglages?.reglages?.modules_reglages?.gestion || {};
    const reglages = { nom: texte(g.nom, 40) || 'Domaine', stock_depart: quantites(g.stock_depart), capacite: entier(g.capacite, 0), menu: g.menu !== false, construire_menu: g.construire_menu !== false,
      // Saga 1.6 : les habitants. repas : ce que chacun mange par nuit ; arrivees : combien en arrivent au
      // plus par nuit quand il reste de la place (0 : ils ne viennent que par la commande).
      habitants_depart: entier(g.habitants_depart, 0, 0, 9999), repas: quantites(g.repas), arrivees: entier(g.arrivees, 1, 0, 99),
      // Saga 1.6.1 : ce que fait la faim (choisi par le jeu). 'arrivees' : personne n'arrive tant que
      // quelqu'un a faim ; 'rien' : seulement le rapport ; 'departs' : de plus, après faim_nuits nuits de
      // faim de suite, un habitant part chaque nuit tant qu'elle dure. Dans tous les cas, ils travaillent.
      faim: ['arrivees', 'rien', 'departs'].includes(g.faim) ? g.faim : 'arrivees', faim_nuits: entier(g.faim_nuits, 3, 1, 99) };
    return { ressources, batiments, reglages };
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
      prochain: Math.max(entier(etat.prochain, 1, 1), batiments.length + 1), resolu: entier(etat.resolu, 0) };
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
  // Rend { etat, lignes, termines, arrives } (lignes : le rapport du matin). Le même jour une deuxième fois : rien.
  function finDeJournee(d, e, jour) {
    const n = entier(jour, 0);
    if (n <= e.resolu) return { etat: e, lignes: [], termines: [], arrives: 0, partis: 0 };
    const etat = copie(e);
    etat.habitants = entier(etat.habitants, 0, 0, 9999);
    const lignes = [];
    const retirer = (q) => { for (const [r, k] of Object.entries(q)) { etat.stock[r] -= k; if (!etat.stock[r]) delete etat.stock[r]; } };
    // 1. Les repas : autant d'habitants que le stock peut en nourrir.
    let nourris = etat.habitants;
    const repas = d.reglages.repas;
    if (etat.habitants && Object.keys(repas).length) {
      nourris = Math.min(etat.habitants, ...Object.entries(repas).map(([r, k]) => Math.floor((etat.stock[r] || 0) / k)));
      const mange = Object.fromEntries(Object.entries(repas).map(([r, k]) => [r, k * nourris]).filter(([, k]) => k > 0));
      retirer(mange);
      if (nourris < etat.habitants) {
        const suite = { arrivees: ' Personne ne s\'installera tant que tout le monde n\'a pas mangé.', rien: '', departs: ' Personne ne s\'installera tant que tout le monde n\'a pas mangé, et au bout de quelques nuits, des habitants partiront.' }[d.reglages.faim];
        lignes.push(`${etat.habitants - nourris} habitant${etat.habitants - nourris > 1 ? 's' : ''} sur ${etat.habitants} n'${etat.habitants - nourris > 1 ? 'ont' : 'a'} pas mangé : il manque ${dire(d, Object.fromEntries(Object.entries(repas).map(([r, k]) => [r, k * etat.habitants - (mange[r] || 0)]).filter(([, k]) => k > 0)))}.${suite}`);
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
      if (m.length) { lignes.push(`${def.nom} n'a rien produit : il manque ${dire(d, Object.fromEntries(m))}.`); continue; }
      libres -= def.ouvriers;
      retirer(def.consommation);
      for (const [r, q] of Object.entries(def.production)) produit[r] = (produit[r] || 0) + q;
    }
    if (sansOuvriers.length) lignes.push(`Pas assez d'habitants pour faire tourner : ${sansOuvriers.join(', ')}.`);
    for (const [r, q] of Object.entries(produit)) etat.stock[r] = (etat.stock[r] || 0) + q;
    if (Object.keys(produit).length) lignes.unshift(`Production : ${dire(d, produit)}.`);
    // 4. Les chantiers.
    const termines = [];
    for (const b of etat.batiments) {
      if (b.etat !== 'chantier') continue;
      b.reste = Math.max(0, b.reste - 1);
      if (b.reste === 0) { b.etat = 'fini'; termines.push(b.type); lignes.push(`Chantier terminé : ${nomBatiment(d, b.type)}.`); }
    }
    // 5. Les départs (faim 'departs') puis les arrivées (pas de faim, ou faim 'rien').
    let partis = 0;
    if (faim && d.reglages.faim === 'departs' && etat.faim >= d.reglages.faim_nuits && etat.habitants > 0) {
      partis = 1;
      etat.habitants -= 1;
      lignes.push(`Un habitant a eu faim ${etat.faim} nuits de suite : il quitte le domaine.`);
    }
    let arrives = 0;
    if ((!faim || d.reglages.faim === 'rien') && d.reglages.arrivees > 0) {
      arrives = Math.max(0, Math.min(d.reglages.arrivees, logement(d, etat) - etat.habitants));
      if (arrives) { etat.habitants += arrives; lignes.push(arrives > 1 ? `${arrives} nouveaux habitants s'installent.` : 'Un nouvel habitant s\'installe.'); }
    }
    // 6. La capacité du stock.
    const cap = capacite(d);
    if (cap > 0) {
      const perdu = {};
      for (const [r, q] of Object.entries(etat.stock)) if (q > cap) { perdu[r] = q - cap; etat.stock[r] = cap; }
      if (Object.keys(perdu).length) lignes.push(`Le stock est plein : ${dire(d, perdu)} perdus.`);
    }
    etat.resolu = n;
    return { etat, lignes, termines, arrives, partis };
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

  return { definitions, etatNeuf, normaliser, capacite, combien, ajouter, construire, habitants, logement, emplois, cases, placement, deposer, finDeJournee, nomRessource, nomBatiment, dire, quantites };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = GestionCalcul;
