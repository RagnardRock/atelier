// Le module « gestion » (Saga 1.5) : les calculs, sans écran ni moteur. Tout ici est pur : chaque fonction
// reçoit les définitions du jeu et l'état du module, et rend un état NEUF (jamais changé sur place). C'est
// ce qui permet de tester la fin de journée sans Saga, et de ne jamais laisser une journée à moitié calculée.
//
// Les définitions viennent du dossier du jeu (FORMAT.md › Le module gestion) :
//   donnees/ressources.json  { ressources: [{ id, nom, description, icone, objet }] }
//   donnees/batiments.json   { batiments: [{ id, nom, description, cout, jours, production, consommation, maximum }] }
//   reglages.modules_reglages.gestion  { nom, stock_depart, capacite, menu }
// cout, production, consommation et stock_depart sont des listes [{ ressource, nombre }].
//
// L'état (partie.modules.gestion) :
//   { stock: { ressource: nombre }, batiments: [{ id, type, etat: 'chantier' | 'fini', reste }], prochain, resolu }
//   reste   = les nuits qu'il faut encore à un chantier
//   resolu  = le dernier jour dont la fin a été calculée : la recalculer ne fait rien

const GestionCalcul = (() => {
  const ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;
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
  function definitions(donnees) {
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
      });
    }
    const g = donnees?.reglages?.reglages?.modules_reglages?.gestion || {};
    const reglages = { nom: texte(g.nom, 40) || 'Domaine', stock_depart: quantites(g.stock_depart), capacite: entier(g.capacite, 0), menu: g.menu !== false };
    return { ressources, batiments, reglages };
  }

  const nomRessource = (d, id) => d.ressources.get(id)?.nom || id;
  const nomBatiment = (d, id) => d.batiments.get(id)?.nom || id;
  // « 4 Bois, 2 Pierre »
  const dire = (d, q) => Object.entries(q).map(([r, n]) => `${n} ${nomRessource(d, r)}`).join(', ');

  // L'état d'une partie neuve : le stock de départ.
  const etatNeuf = (d) => ({ stock: { ...d.reglages.stock_depart }, batiments: [], prochain: 1, resolu: 0 });

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
      batiments.push({ id, type: b.type, etat: fini ? 'fini' : 'chantier', reste: fini ? 0 : entier(b.reste, 1, 1, 999) });
    }
    return { stock, batiments, prochain: Math.max(entier(etat.prochain, 1, 1), batiments.length + 1), resolu: entier(etat.resolu, 0) };
  }

  // La place pour chaque ressource (0 = sans limite).
  const capacite = (d) => d.reglages.capacite;
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

  // Lancer la construction d'un bâtiment : il faut de quoi le payer, et ne pas dépasser son maximum.
  // Rend { ok, etat, raison, batiment } (raison : une phrase pour le joueur).
  function construire(d, e, type) {
    const def = d.batiments.get(type);
    if (!def) return { ok: false, etat: e, raison: `Ce bâtiment n'existe pas (${type}).` };
    if (def.maximum && combien(e, type) >= def.maximum) return { ok: false, etat: e, raison: def.maximum === 1 ? `${def.nom} : il y en a déjà un.` : `${def.nom} : il y en a déjà ${def.maximum}.` };
    const m = manque(e.stock, def.cout);
    if (m.length) return { ok: false, etat: e, raison: `Pour ${def.nom}, il manque ${dire(d, Object.fromEntries(m))}.` };
    const etat = copie(e);
    for (const [r, n] of Object.entries(def.cout)) { etat.stock[r] -= n; if (!etat.stock[r]) delete etat.stock[r]; }
    const batiment = { id: `b${etat.prochain}`, type, etat: def.jours > 0 ? 'chantier' : 'fini', reste: def.jours };
    while (etat.batiments.some((b) => b.id === batiment.id)) batiment.id = `b${++etat.prochain}`;
    etat.prochain += 1;
    etat.batiments.push(batiment);
    return { ok: true, etat, batiment };
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
  //   1. les bâtiments finis produisent, s'ils ont ce qu'ils consomment dans le stock du coucher (s'ils sont
  //      plusieurs à vouloir la même ressource, le premier bâti passe d'abord) ;
  //   2. les chantiers avancent d'une nuit (un bâtiment fini cette nuit produira la nuit suivante) ;
  //   3. le stock est ramené à sa capacité.
  // Rend { etat, lignes, termines } (lignes : le rapport du matin). Le même jour une deuxième fois : rien.
  function finDeJournee(d, e, jour) {
    const n = entier(jour, 0);
    if (n <= e.resolu) return { etat: e, lignes: [], termines: [] };
    const etat = copie(e);
    const lignes = [];
    const produit = {};
    // Ce qui est produit cette nuit n'arrive au stock qu'à la fin : un bâtiment ne consomme que ce qu'il y
    // avait au coucher, quel que soit l'ordre des bâtiments (sinon le résultat dépendrait de cet ordre).
    for (const b of etat.batiments) {
      const def = d.batiments.get(b.type);
      if (b.etat !== 'fini' || !def || !Object.keys(def.production).length) continue;
      const m = manque(etat.stock, def.consommation);
      if (m.length) { lignes.push(`${def.nom} n'a rien produit : il manque ${dire(d, Object.fromEntries(m))}.`); continue; }
      for (const [r, q] of Object.entries(def.consommation)) { etat.stock[r] -= q; if (!etat.stock[r]) delete etat.stock[r]; }
      for (const [r, q] of Object.entries(def.production)) produit[r] = (produit[r] || 0) + q;
    }
    for (const [r, q] of Object.entries(produit)) etat.stock[r] = (etat.stock[r] || 0) + q;
    if (Object.keys(produit).length) lignes.unshift(`Production : ${dire(d, produit)}.`);
    const termines = [];
    for (const b of etat.batiments) {
      if (b.etat !== 'chantier') continue;
      b.reste = Math.max(0, b.reste - 1);
      if (b.reste === 0) { b.etat = 'fini'; termines.push(b.type); lignes.push(`Chantier terminé : ${nomBatiment(d, b.type)}.`); }
    }
    const cap = capacite(d);
    if (cap > 0) {
      const perdu = {};
      for (const [r, q] of Object.entries(etat.stock)) if (q > cap) { perdu[r] = q - cap; etat.stock[r] = cap; }
      if (Object.keys(perdu).length) lignes.push(`Le stock est plein : ${dire(d, perdu)} perdus.`);
    }
    etat.resolu = n;
    return { etat, lignes, termines };
  }

  return { definitions, etatNeuf, normaliser, capacite, combien, ajouter, construire, deposer, finDeJournee, nomRessource, nomBatiment, dire, quantites };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = GestionCalcul;
