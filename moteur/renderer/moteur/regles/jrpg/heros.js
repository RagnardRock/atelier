// Le pack JRPG classique (Saga 0.8) : les héros du groupe, leurs classes, leurs statistiques, leur
// équipement et leur expérience. Voir REGLES.md › « Le pack JRPG » et tuiles/FORMAT.md.
//
// Un héros dans la partie (partie.equipe, les boîtes de la Réserve) :
//   { creature, heros: true, surnom, classe, niveau, xp, pv, pm, statut,
//     equipement: { arme, bouclier, casque, armure, accessoire }, competences: [ids en plus] }
// `creature` est l'id du personnage (personnages.json) : son nom, son sprite et ses portraits se
// lisent dans les données du jeu, comme sa classe (classes.json). Le statut gardé hors combat est
// seulement 'poison' (les autres s'effacent à la fin du combat).

const JrpgHeros = (() => {
  const STATS = ['pv', 'pm', 'force', 'magie', 'defense', 'esprit', 'agilite', 'chance'];
  const NOMS_STATS = { pv: 'PV', pm: 'PM', force: 'Force', magie: 'Magie', defense: 'Défense', esprit: 'Esprit', agilite: 'Agilité', chance: 'Chance' };
  // Une classe sans statistiques (ou un héros sans classe) : un aventurier moyen.
  const DEFAUTS = { pv: 30, pm: 6, force: 9, magie: 7, defense: 7, esprit: 7, agilite: 8, chance: 6 };
  const GAINS = { pv: 8, pm: 2, force: 2, magie: 2, defense: 1.5, esprit: 1.5, agilite: 1.5, chance: 1 };
  const PLACES = [['arme', 'Arme'], ['bouclier', 'Bouclier'], ['casque', 'Casque'], ['armure', 'Armure'], ['accessoire', 'Accessoire']];
  const STATUTS = { poison: 'Poison', sommeil: 'Sommeil', paralysie: 'Paralysie', silence: 'Silence', cecite: 'Cécité' };
  const COURTS = { poison: 'PSN', sommeil: 'SOM', paralysie: 'PAR', silence: 'SIL', cecite: 'AVG' };
  const COURBES = { rapide: 0.7, normale: 1, lente: 1.4 };
  const borne = (v, min, max) => Math.max(min, Math.min(max, v));

  // Les données du jeu, par sorte et par id (un index construit une fois par jeu).
  const liste = (jeu, sorte) => jeu.donnees[sorte]?.[sorte] || [];
  const index = new WeakMap();
  function trouver(jeu, sorte, id) {
    let parJeu = index.get(jeu);
    if (!parJeu) { parJeu = {}; index.set(jeu, parJeu); }
    if (!parJeu[sorte]) parJeu[sorte] = new Map(liste(jeu, sorte).map((o) => [o.id, o]));
    return parJeu[sorte].get(id) || null;
  }
  const reglages = (jeu) => jeu.donnees.reglages?.reglages || {};
  const perso = (jeu, c) => jeu.personnages.get(c.creature) || null;
  const classe = (jeu, c) => trouver(jeu, 'classes', c.classe);
  const niveauMax = (jeu) => borne(Math.round(Number(reglages(jeu).niveau_max) || 99), 1, 999);

  // L'expérience totale qu'il faut pour être au niveau n : 10 × (n − 1)², fois la courbe du jeu.
  function xpPour(jeu, n) {
    if (n <= 1) return 0;
    return Math.round((COURBES[reglages(jeu).courbe_xp] || 1) * 10 * (n - 1) ** 2);
  }

  // Le nom : son surnom, sinon le nom choisi par le joueur pour le héros principal, sinon celui du personnage.
  function nom(jeu, c) {
    if (c.surnom) return c.surnom;
    const p = perso(jeu, c);
    if (p?.heros && jeu.joueur?.nom) return jeu.joueur.nom;
    return p?.nom || c.creature;
  }
  // Ce qui le dessine : son sprite (le héros principal porte sa tenue), sinon sa tuile, sinon sa couleur.
  function apparence(jeu, c) {
    const p = perso(jeu, c);
    if (!p) return null;
    const tenue = p.heros && jeu.joueur?.tenue ? (p.tenues || []).find((t) => t.id === jeu.joueur.tenue) : null;
    return tenue?.sprite ? { sprite: tenue.sprite, couleur: p.couleur } : p;
  }
  // Son visage pour les menus : le portrait « normal » (sinon le premier), sinon rien (le sprite servira).
  function portrait(jeu, c) {
    const l = perso(jeu, c)?.portraits || [];
    return (l.find((x) => x.expression === 'normal') || l[0])?.png || '';
  }

  // --- Les statistiques ---
  // Celles de sa classe et de son niveau : la valeur au niveau 1, plus le gain de chaque niveau.
  function statsBase(jeu, c) {
    const k = classe(jeu, c);
    const out = {};
    for (const s of STATS) {
      const base = Number.isFinite(Number(k?.stats?.[s])) ? Number(k.stats[s]) : DEFAUTS[s];
      const gain = Number.isFinite(Number(k?.gains?.[s])) ? Number(k.gains[s]) : GAINS[s];
      out[s] = Math.floor(base + gain * (c.niveau - 1));
    }
    return out;
  }
  // Ce que son équipement ajoute (et l'élément de son arme).
  function bonus(jeu, c) {
    const out = Object.fromEntries(STATS.map((s) => [s, 0]));
    let element = '';
    for (const [place] of PLACES) {
      const o = trouver(jeu, 'objets', c.equipement?.[place]);
      const e = o?.equipement;
      if (!e) continue;
      for (const s of STATS) out[s] += Number(e.bonus?.[s]) || 0;
      if (place === 'arme' && e.element) element = e.element;
    }
    return { stats: out, element };
  }
  function stats(jeu, c) {
    const b = statsBase(jeu, c), plus = bonus(jeu, c).stats;
    const out = {};
    for (const s of STATS) out[s] = Math.max(s === 'pv' || s === 'force' || s === 'magie' ? 1 : 0, b[s] + plus[s]);
    return out;
  }
  const pvMax = (jeu, c) => stats(jeu, c).pv;
  const pmMax = (jeu, c) => stats(jeu, c).pm;

  // --- L'équipement ---
  // Un objet d'équipement : objets.json, avec { equipement: { place, bonus, element, classes } }.
  const placeDe = (o) => o?.equipement?.place || '';
  const peutPorter = (jeu, c, o) => Boolean(o?.equipement && PLACES.some(([p]) => p === o.equipement.place)
    && (!o.equipement.classes?.length || o.equipement.classes.includes(c.classe)));
  // Mettre l'objet `id` (pris dans le sac) à sa place ; ce qu'il y avait retourne dans le sac. id '' :
  // retirer ce qu'il y a à `place`. Rend false si ce n'est pas possible.
  function equiper(jeu, partie, c, place, id) {
    const avantPv = pvMax(jeu, c), avantPm = pmMax(jeu, c);
    if (id) {
      const o = trouver(jeu, 'objets', id);
      if (!peutPorter(jeu, c, o) || placeDe(o) !== place || !(partie.sac[id] > 0)) return false;
      partie.sac[id]--;
      if (partie.sac[id] <= 0) delete partie.sac[id];
    }
    const ancien = c.equipement[place];
    if (ancien) partie.sac[ancien] = (partie.sac[ancien] || 0) + 1;
    c.equipement[place] = id || '';
    // Les PV et PM gagnés ou perdus suivent (sans tuer un héros debout).
    if (c.pv > 0) c.pv = borne(c.pv + pvMax(jeu, c) - avantPv, 1, pvMax(jeu, c));
    c.pm = borne(c.pm + pmMax(jeu, c) - avantPm, 0, pmMax(jeu, c));
    return true;
  }

  // --- Les compétences ---
  // Celles de sa classe jusqu'à son niveau, puis celles apprises autrement (c.competences).
  function competences(jeu, c) {
    const k = classe(jeu, c);
    const ids = (k?.competences || []).filter((x) => Number(x.niveau) <= c.niveau).sort((a, b) => a.niveau - b.niveau).map((x) => x.competence);
    return [...new Set([...ids, ...(c.competences || [])])].filter((id) => trouver(jeu, 'attaques', id));
  }

  // --- Un héros ---
  // Le personnage `id` de personnages.json, avec sa classe, au niveau donné (0 : son niveau de départ)
  // et avec son équipement de départ (porté, pas dans le sac).
  function creer(jeu, id, niveau = 0) {
    const p = jeu.personnages.get(id);
    if (!p) return null;
    const n = borne(Math.round(Number(niveau) || Number(p.niveau) || 1), 1, niveauMax(jeu));
    const equipement = {};
    for (const [place] of PLACES) {
      const o = trouver(jeu, 'objets', p.equipement?.[place]);
      equipement[place] = o && placeDe(o) === place ? o.id : '';
    }
    const c = { creature: id, heros: true, surnom: '', classe: p.classe || '', niveau: n, xp: xpPour(jeu, n), pv: 0, pm: 0, statut: '', equipement, competences: [] };
    c.pv = pvMax(jeu, c);
    c.pm = pmMax(jeu, c);
    return c;
  }
  // Un héros lu d'une sauvegarde : ce qui manque est complété. Un personnage supprimé dans Tafl disparaît.
  function completer(jeu, c) {
    if (!c || typeof c !== 'object' || !c.creature || !jeu.personnages.has(c.creature)) return null;
    if (!c.heros) return creer(jeu, c.creature, c.niveau);
    c.niveau = borne(Math.round(Number(c.niveau) || 1), 1, niveauMax(jeu));
    c.xp = Math.max(Number(c.xp) || 0, xpPour(jeu, c.niveau));
    c.equipement = Object.fromEntries(PLACES.map(([place]) => [place, typeof c.equipement?.[place] === 'string' ? c.equipement[place] : '']));
    c.competences = Array.isArray(c.competences) ? c.competences.filter((x) => typeof x === 'string') : [];
    c.statut = c.statut === 'poison' ? 'poison' : '';
    c.pv = borne(Math.round(Number(c.pv) || 0), 0, pvMax(jeu, c));
    c.pm = borne(Math.round(Number(c.pm) || 0), 0, pmMax(jeu, c));
    return c;
  }
  function soigner(jeu, c) {
    c.pv = pvMax(jeu, c);
    c.pm = pmMax(jeu, c);
    c.statut = '';
  }

  // Gagner de l'expérience. Rend ce qui arrive, dans l'ordre :
  // [{ type: 'niveau', niveau, avant, apres }, { type: 'apprend', competence }]
  function gagnerXp(jeu, c, xp) {
    const max = niveauMax(jeu);
    const evenements = [];
    if (c.niveau >= max) return evenements;
    c.xp += Math.max(0, Math.round(xp));
    while (c.niveau < max && c.xp >= xpPour(jeu, c.niveau + 1)) {
      const connues = competences(jeu, c);
      const avant = stats(jeu, c);
      c.niveau++;
      const apres = stats(jeu, c);
      // Les PV et PM gagnés s'ajoutent (un héros K.O. le reste).
      if (c.pv > 0) c.pv = Math.min(apres.pv, c.pv + apres.pv - avant.pv);
      c.pm = Math.min(apres.pm, c.pm + apres.pm - avant.pm);
      evenements.push({ type: 'niveau', niveau: c.niveau, avant, apres });
      for (const id of competences(jeu, c)) if (!connues.includes(id)) evenements.push({ type: 'apprend', competence: id });
    }
    if (c.niveau >= max) c.xp = Math.min(c.xp, xpPour(jeu, max));
    return evenements;
  }

  return {
    STATS, NOMS_STATS, PLACES, STATUTS, COURTS, trouver, liste, reglages, perso, classe, niveauMax, xpPour, nom, apparence, portrait,
    statsBase, bonus, stats, pvMax, pmMax, placeDe, peutPorter, equiper, competences, creer, completer, soigner, gagnerXp,
  };
})();
