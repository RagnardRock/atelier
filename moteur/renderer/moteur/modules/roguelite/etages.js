// Les calculs du module « roguelite » (Saga 1.14) : des fonctions pures, sans écran ni partie à changer.
//
//   alea(graine)                         → un tirage pseudo-aléatoire de 0 à 1, toujours le même pour une graine
//   definitions(donnees, cartes, libre)  → { reglages, perks, ameliorations, salles } : ce que le jeu décrit
//   portesDe(carte, libre)               → { n, s, e, o } : les cases de porte de chaque côté (les ouvertures du
//                                          bord de la salle), [] s'il n'y en a pas
//   generer(d, etage, graine)            → { salles: [{ x, y, type, modele, liens: { n, s, e, o } }] } ou { erreur }
//   tirerPerks(d, etat, n, hasard)       → [id] : n perks différents, tirés selon leur rareté
//   effetsPerks(d, perks)                → { stats, volDeVie, monnaie } : ce que les perks de la partie font
//   effetsMeta(d, ameliorations)         → { stats, objets, argent, monnaie } : ce que les améliorations font
//
// Un étage est une grille de salles. Le chemin principal va de la salle de départ au boss ; les trésors, les
// boutiques et les salles de repos sont des culs-de-sac branchés dessus. Chaque salle est une copie d'une
// carte modèle de Tafl (une carte cochée « salle de donjon »), choisie parmi celles de son type qui ont une
// porte de chaque côté où l'étage en demande une. Une porte en trop est murée par le module.

const RogueliteCalcul = (() => {
  const COTES = ['n', 's', 'e', 'o'];
  const OPPOSE = { n: 's', s: 'n', e: 'o', o: 'e' };
  const PAS = { n: [0, -1], s: [0, 1], e: [1, 0], o: [-1, 0] };
  const TYPES = ['depart', 'combat', 'tresor', 'boutique', 'repos', 'boss'];
  const RARETES = { commun: 60, rare: 28, epique: 10, legendaire: 2 };
  const PRIX_RARETE = { commun: 1, rare: 2, epique: 4, legendaire: 8 };
  const ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;

  const tableau = (v) => (Array.isArray(v) ? v : []);
  const entier = (v, d, min, max) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };
  const texte = (v, max = 300) => (typeof v === 'string' ? v.slice(0, max) : '');

  // mulberry32 : rapide, assez bon pour tirer des salles, et le même partout pour une même graine.
  function alea(graine) {
    let a = (Number(graine) >>> 0) || 1;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const melange = (...n) => n.reduce((h, x) => (Math.imul(h ^ (Number(x) >>> 0), 2654435761) + 0x9e3779b9) >>> 0, 0x811c9dc5);

  // Les réglages du module (modules_reglages.roguelite), bornés.
  function reglages(r) {
    const g = r && typeof r === 'object' ? r : {};
    return {
      etages: entier(g.etages, 3, 1, 20),
      salles: entier(g.salles, 4, 1, 30),
      salles_par_etage: entier(g.salles_par_etage, 1, 0, 10),
      tresors: entier(g.tresors, 1, 0, 6),
      boutiques: entier(g.boutiques, 1, 0, 6),
      repos: entier(g.repos, 1, 0, 6),
      graine: entier(g.graine, 0, 0, 2147483647),
      monnaie: texte(g.monnaie, 30).trim() || 'Éclats',
      monnaie_ennemi: entier(g.monnaie_ennemi, 1, 0, 9999),
      monnaie_etage: entier(g.monnaie_etage, 5, 0, 99999),
      monnaie_victoire: entier(g.monnaie_victoire, 20, 0, 99999),
      renfort: entier(g.renfort, 25, 0, 500),
      prix_perk: entier(g.prix_perk, 30, 0, 99999),
      carte_mini: g.carte_mini !== false,
      tuile_mur: entier(g.tuile_mur, -1, -1, 99999),
    };
  }

  function effet(e, perk) {
    const types = perk ? ['stat', 'soin', 'vol_de_vie', 'monnaie', 'script'] : ['stat', 'objet', 'argent', 'perk', 'monnaie'];
    const t = types.includes(e?.type) ? e.type : types[0];
    return { type: t, stat: texte(e?.stat, 32), valeur: entier(e?.valeur, 10, -90, 9999), objet: texte(e?.objet, 64), nombre: entier(e?.nombre, 1, 1, 99), perk: texte(e?.perk, 64) };
  }

  // Ce que le jeu décrit : les perks, les améliorations, et les salles modèles (les cartes « salle de donjon »).
  function definitions(donnees, cartes, libre) {
    const perks = new Map();
    for (const p of tableau(donnees?.perks?.perks)) {
      if (!p || typeof p.id !== 'string' || !ID.test(p.id)) continue;
      perks.set(p.id, {
        id: p.id, nom: texte(p.nom, 60) || p.id, description: texte(p.description), icone: texte(p.icone, 2e6), couleur: /^#[0-9a-f]{6}$/i.test(p.couleur || '') ? p.couleur : '#f0c050',
        rarete: Object.prototype.hasOwnProperty.call(RARETES, p.rarete) ? p.rarete : 'commun', max: entier(p.max, 1, 1, 99), verrouille: Boolean(p.verrouille),
        effets: tableau(p.effets).slice(0, 4).map((e) => effet(e, true)),
      });
    }
    const ameliorations = new Map();
    for (const a of tableau(donnees?.ameliorations?.ameliorations)) {
      if (!a || typeof a.id !== 'string' || !ID.test(a.id)) continue;
      ameliorations.set(a.id, {
        id: a.id, nom: texte(a.nom, 60) || a.id, description: texte(a.description), icone: texte(a.icone, 2e6),
        cout: entier(a.cout, 10, 0, 999999), cout_niveau: entier(a.cout_niveau, 0, 0, 999999), niveau_max: entier(a.niveau_max, 1, 1, 99),
        effets: tableau(a.effets).slice(0, 4).map((e) => effet(e, false)),
      });
    }
    const salles = [];
    for (const c of cartes || []) {
      const s = c?.salle;
      if (!s || !TYPES.includes(s.type)) continue;
      salles.push({ id: c.id, nom: c.nom || c.id, type: s.type, poids: entier(s.poids, 10, 1, 1000), etage_min: entier(s.etage_min, 1, 1, 99), etage_max: entier(s.etage_max, 0, 0, 99), portes: portesDe(c, libre) });
    }
    return { reglages: reglages(donnees?.reglages?.reglages?.modules_reglages?.roguelite), perks, ameliorations, salles };
  }

  // Les portes d'une salle : les cases libres de chaque bord (sans les coins). Une salle sans ouverture au
  // nord n'a pas de porte au nord.
  function portesDe(carte, libre) {
    const w = carte.largeur, h = carte.hauteur, out = { n: [], s: [], e: [], o: [] };
    if (w < 3 || h < 3) return out;
    for (let x = 1; x < w - 1; x++) { if (libre(carte, x, 0)) out.n.push({ x, y: 0 }); if (libre(carte, x, h - 1)) out.s.push({ x, y: h - 1 }); }
    for (let y = 1; y < h - 1; y++) { if (libre(carte, 0, y)) out.o.push({ x: 0, y }); if (libre(carte, w - 1, y)) out.e.push({ x: w - 1, y }); }
    return out;
  }
  // La case d'arrivée par une porte : celle du milieu, un pas vers l'intérieur.
  function entree(portes, cote) {
    const l = portes[cote] || [];
    if (!l.length) return null;
    const m = l[Math.floor((l.length - 1) / 2)], [dx, dy] = PAS[cote];
    return { x: m.x - dx, y: m.y - dy };
  }

  function choisir(liste, poids, hasard) {
    const total = liste.reduce((s, x) => s + poids(x), 0);
    let r = hasard() * total;
    for (const x of liste) { r -= poids(x); if (r < 0) return x; }
    return liste[liste.length - 1];
  }

  // Un étage : le chemin principal (départ, combats, boss), puis les culs-de-sac, puis une salle modèle pour chacune.
  function generer(d, etage, graine) {
    const R = d.reglages;
    const nCombats = R.salles + (etage - 1) * R.salles_par_etage;
    const auPlus = (s) => s.etage_max === 0 || etage <= s.etage_max;
    const permis = d.salles.filter((s) => etage >= s.etage_min && auPlus(s));
    let manque = '';
    for (let essai = 0; essai < 40; essai++) {
      const hasard = alea(melange(graine, etage, essai));
      const cle = (x, y) => `${x},${y}`;
      const prises = new Map();
      const salles = [];
      const poser = (x, y, type) => { const i = salles.length; salles.push({ x, y, type, modele: '', liens: { n: -1, s: -1, e: -1, o: -1 } }); prises.set(cle(x, y), i); return i; };
      const lier = (i, j, cote) => { salles[i].liens[cote] = j; salles[j].liens[OPPOSE[cote]] = i; };
      const libresAutour = (x, y) => COTES.filter((c) => !prises.has(cle(x + PAS[c][0], y + PAS[c][1])));
      // Le chemin principal : une marche au hasard qui ne repasse pas par une salle.
      let ok = true;
      poser(0, 0, 'depart');
      for (let k = 1; k <= nCombats + 1; k++) {
        const p = salles[salles.length - 1];
        const cotes = libresAutour(p.x, p.y);
        if (!cotes.length) { ok = false; break; }
        const c = cotes[Math.floor(hasard() * cotes.length)];
        const j = poser(p.x + PAS[c][0], p.y + PAS[c][1], k === nCombats + 1 ? 'boss' : 'combat');
        lier(j - 1, j, c);
      }
      if (!ok) continue;
      const principal = salles.length;
      // Les culs-de-sac : une case libre à côté d'une salle de combat, sans autre voisine.
      const branches = [...Array(R.tresors).fill('tresor'), ...Array(R.boutiques).fill('boutique'), ...Array(R.repos).fill('repos')];
      for (const type of branches) {
        const options = [];
        for (let i = 1; i < principal - 1; i++) {
          const p = salles[i];
          for (const c of libresAutour(p.x, p.y)) {
            const x = p.x + PAS[c][0], y = p.y + PAS[c][1];
            if (COTES.filter((q) => prises.has(cle(x + PAS[q][0], y + PAS[q][1]))).length === 1) options.push([i, c, x, y]);
          }
        }
        if (!options.length) continue;
        const [i, c, x, y] = options[Math.floor(hasard() * options.length)];
        lier(i, poser(x, y, type), c);
      }
      // Une salle modèle par salle : son type (sinon une salle de combat), avec une porte partout où il en faut.
      const vus = new Map();
      for (const s of salles) {
        const besoin = COTES.filter((c) => s.liens[c] >= 0);
        const va = (m) => besoin.every((c) => m.portes[c].length);
        let cand = permis.filter((m) => m.type === s.type && va(m));
        if (!cand.length && !['depart', 'boss'].includes(s.type)) cand = permis.filter((m) => m.type === 'combat' && va(m));
        if (!cand.length) { manque = `il manque une salle « ${s.type} » avec une porte ${besoin.map((c) => ({ n: 'au nord', s: 'au sud', e: 'à l\'est', o: 'à l\'ouest' })[c]).join(', ') || '(n\'importe laquelle)'}${etage > 1 ? ` pour l'étage ${etage}` : ''}`; ok = false; break; }
        const m = choisir(cand, (x) => x.poids / (1 + 2 * (vus.get(x.id) || 0)), hasard);
        vus.set(m.id, (vus.get(m.id) || 0) + 1);
        s.modele = m.id;
      }
      if (!ok) continue;
      // La grille commence en (0, 0) en haut à gauche.
      const x0 = Math.min(...salles.map((s) => s.x)), y0 = Math.min(...salles.map((s) => s.y));
      for (const s of salles) { s.x -= x0; s.y -= y0; }
      return { salles };
    }
    if (!d.salles.length) return { erreur: 'Ce jeu n\'a aucune salle de donjon : dans Tafl, coche « Salle de donjon » sur des cartes (au moins un départ, un combat et un boss).' };
    return { erreur: `Impossible de bâtir l'étage : ${manque || 'pas assez de salles modèles'}.` };
  }

  // n perks différents, selon leur rareté : ni ceux déjà au maximum, ni ceux encore verrouillés.
  function tirerPerks(d, etat, n, hasard) {
    const debloques = new Set();
    for (const [id, niv] of Object.entries(etat.ameliorations || {})) for (const e of d.ameliorations.get(id)?.effets || []) if (niv > 0 && e.type === 'perk') debloques.add(e.perk);
    let pool = [...d.perks.values()].filter((p) => (!p.verrouille || debloques.has(p.id)) && (etat.run?.perks?.[p.id] || 0) < p.max);
    const out = [];
    while (out.length < n && pool.length) {
      const p = choisir(pool, (x) => RARETES[x.rarete], hasard);
      out.push(p.id);
      pool = pool.filter((x) => x !== p);
    }
    return out;
  }

  function ajouterStat(stats, s, v) { if (/^[a-z_]{1,32}$/.test(s) && v) stats[s] = Math.max(-90, Math.min(200, (stats[s] || 0) + v)); }
  function effetsPerks(d, perks) {
    const out = { stats: {}, volDeVie: 0, monnaie: 0 };
    for (const [id, n] of Object.entries(perks || {})) {
      for (const e of d.perks.get(id)?.effets || []) {
        if (e.type === 'stat') ajouterStat(out.stats, e.stat, e.valeur * n);
        if (e.type === 'vol_de_vie') out.volDeVie += Math.max(0, e.valeur) * n;
        if (e.type === 'monnaie') out.monnaie += e.valeur * n;
      }
    }
    return out;
  }
  function effetsMeta(d, ameliorations) {
    const out = { stats: {}, objets: [], argent: 0, monnaie: 0 };
    for (const [id, n] of Object.entries(ameliorations || {})) {
      const a = d.ameliorations.get(id);
      if (!a || n < 1) continue;
      for (const e of a.effets) {
        if (e.type === 'stat') ajouterStat(out.stats, e.stat, e.valeur * n);
        if (e.type === 'objet' && e.objet) out.objets.push({ objet: e.objet, nombre: e.nombre * n });
        if (e.type === 'argent') out.argent += Math.max(0, e.valeur) * n;
        if (e.type === 'monnaie') out.monnaie += e.valeur * n;
      }
    }
    return out;
  }
  const coutAmelioration = (a, niveau) => a.cout + a.cout_niveau * niveau;
  const prixPerk = (d, p) => d.reglages.prix_perk * (PRIX_RARETE[p.rarete] || 1);

  return { COTES, OPPOSE, PAS, TYPES, RARETES, alea, melange, reglages, definitions, portesDe, entree, generer, tirerPerks, effetsPerks, effetsMeta, coutAmelioration, prixPerk };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = RogueliteCalcul;
