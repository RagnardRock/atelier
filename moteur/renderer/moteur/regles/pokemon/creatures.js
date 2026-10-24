// Les créatures du joueur et des adversaires (Saga 0.3) : ce qu'on garde d'une créature dans la
// partie, et ce qu'on en calcule (statistiques, expérience, attaques apprises, évolutions).
//
// Une créature dans la partie (partie.equipe, partie.boite, et l'adversaire d'un combat) :
//   { creature, surnom, niveau, xp, pv, statut, sommeil, nature, talent, sexe, chromatique,
//     ivs: { pv, attaque, defense, att_spe, def_spe, vitesse }, evs: { … },
//     attaques: [{ id, pp, ppMax }] }
// `creature` est l'id dans creatures.json ; le reste (nom, types, statistiques de base, sprites) se lit
// dans les données du jeu, pour qu'un changement fait dans Tafl se voie aussitôt dans la partie.
//
// Les formules sont celles des jeux officiels (3e génération et suivantes), pour que les données
// importées de Tafl donnent les mêmes combats.

const Creatures = (() => {
  const STATS = ['pv', 'attaque', 'defense', 'att_spe', 'def_spe', 'vitesse'];
  const NOMS_STATS = { pv: 'PV', attaque: 'Attaque', defense: 'Défense', att_spe: 'Att. Spé.', def_spe: 'Déf. Spé.', vitesse: 'Vitesse', precision: 'Précision', esquive: 'Esquive' };
  // Les natures : [stat augmentée, stat baissée] (+10 % / −10 %), null pour les cinq neutres.
  const NATURES = {
    hardi: null, solo: ['attaque', 'defense'], brave: ['attaque', 'vitesse'], rigide: ['attaque', 'att_spe'], mauvais: ['attaque', 'def_spe'],
    assure: ['defense', 'attaque'], docile: null, relax: ['defense', 'vitesse'], malin: ['defense', 'att_spe'], lache: ['defense', 'def_spe'],
    timide: ['vitesse', 'attaque'], presse: ['vitesse', 'defense'], serieux: null, jovial: ['vitesse', 'att_spe'], naif: ['vitesse', 'def_spe'],
    modeste: ['att_spe', 'attaque'], doux: ['att_spe', 'defense'], discret: ['att_spe', 'vitesse'], pudique: null, foufou: ['att_spe', 'def_spe'],
    calme: ['def_spe', 'attaque'], gentil: ['def_spe', 'defense'], malpoli: ['def_spe', 'vitesse'], prudent: ['def_spe', 'att_spe'], bizarre: null,
  };
  const hasard = (n) => Math.floor(Math.random() * n);
  const liste = (jeu, sorte) => jeu.donnees[sorte]?.[sorte] || [];
  // Les données d'une créature, d'une attaque… (avec un index, construit une fois par jeu).
  const index = new WeakMap();
  function trouver(jeu, sorte, id) {
    let parJeu = index.get(jeu);
    if (!parJeu) { parJeu = {}; index.set(jeu, parJeu); }
    if (!parJeu[sorte]) parJeu[sorte] = new Map(liste(jeu, sorte).map((o) => [o.id, o]));
    return parJeu[sorte].get(id) || null;
  }
  const espece = (jeu, c) => trouver(jeu, 'creatures', c.creature);
  const nom = (jeu, c) => c.surnom || espece(jeu, c)?.nom || c.creature;
  const reglages = (jeu) => jeu.donnees.reglages?.reglages || {};

  // --- L'expérience : le total qu'il faut pour être au niveau n, selon la courbe de l'espèce ---
  function xpPour(croissance, n) {
    if (n <= 1) return 0;
    const n3 = n ** 3;
    switch (croissance) {
      case 'rapide': return Math.floor(4 * n3 / 5);
      case 'lente': return Math.floor(5 * n3 / 4);
      case 'parabolique': return Math.max(0, Math.floor(6 / 5 * n3 - 15 * n * n + 100 * n - 140));
      case 'erratique':
        if (n <= 50) return Math.floor(n3 * (100 - n) / 50);
        if (n <= 68) return Math.floor(n3 * (150 - n) / 100);
        if (n <= 98) return Math.floor(n3 * Math.floor((1911 - 10 * n) / 3) / 500);
        return Math.floor(n3 * (160 - n) / 100);
      case 'fluctuante':
        if (n <= 15) return Math.floor(n3 * (Math.floor((n + 1) / 3) + 24) / 50);
        if (n <= 36) return Math.floor(n3 * (n + 14) / 50);
        return Math.floor(n3 * (Math.floor(n / 2) + 32) / 50);
      default: return n3; // moyenne
    }
  }

  // --- Les statistiques réelles d'une créature (pas les étages de combat, voir combat.js) ---
  function stats(jeu, c) {
    const e = espece(jeu, c);
    const base = e?.stats || {};
    // Une menthe (Saga 0.5) remplace l'effet de la nature sur les stats ; la nature, elle, reste.
    const nat = NATURES[c.menthe || c.nature] || null;
    const out = {};
    for (const s of STATS) {
      const b = Number(base[s]) || 50, iv = c.ivs?.[s] || 0, ev = c.evs?.[s] || 0;
      const brut = Math.floor((2 * b + iv + Math.floor(ev / 4)) * c.niveau / 100);
      if (s === 'pv') out.pv = brut + c.niveau + 10;
      else out[s] = Math.floor((brut + 5) * (nat?.[0] === s ? 1.1 : nat?.[1] === s ? 0.9 : 1));
    }
    return out;
  }
  const pvMax = (jeu, c) => stats(jeu, c).pv;

  // Les attaques qu'elle connaît à un niveau : les 4 dernières apprises.
  function attaquesAuNiveau(jeu, e, niveau) {
    const apprises = (e?.attaques || []).filter((a) => a.niveau <= niveau && trouver(jeu, 'attaques', a.attaque)).sort((a, b) => a.niveau - b.niveau);
    const ids = [];
    for (const a of apprises) {
      if (ids.includes(a.attaque)) continue;
      ids.push(a.attaque);
      if (ids.length > 4) ids.shift();
    }
    return ids;
  }
  const attaque = (jeu, id) => {
    const a = trouver(jeu, 'attaques', id);
    return { id, pp: Number(a?.pp) || 10, ppMax: Number(a?.pp) || 10 };
  };

  // Une nouvelle créature. o : { nature, attaques: [ids], chromatique, sexe } (facultatif).
  function creer(jeu, id, niveau, o = {}) {
    const e = trouver(jeu, 'creatures', id);
    niveau = Math.max(1, Math.min(100, Math.round(Number(niveau) || 5)));
    const natures = Object.keys(NATURES);
    const r = reglages(jeu);
    const chance = Number(r.chance_chromatique ?? 4096);
    const c = {
      creature: id,
      surnom: '',
      niveau,
      xp: xpPour(e?.croissance, niveau),
      pv: 0,
      statut: '',
      sommeil: 0,
      nature: NATURES[o.nature] !== undefined ? o.nature : natures[hasard(natures.length)],
      talent: (() => { const t = e?.talents || []; return t.length ? t[hasard(t.length)] : ''; })(),
      sexe: o.sexe || (!e || Number(e.male) < 0 ? '' : Math.random() * 100 < Number(e.male ?? 50) ? 'm' : 'f'),
      chromatique: o.chromatique ?? (chance > 0 && hasard(chance) === 0),
      ivs: Object.fromEntries(STATS.map((s) => [s, hasard(32)])),
      evs: Object.fromEntries(STATS.map((s) => [s, 0])),
      attaques: (o.attaques?.length ? o.attaques.filter((a) => trouver(jeu, 'attaques', a)).slice(0, 4) : attaquesAuNiveau(jeu, e, niveau)).map((a) => attaque(jeu, a)),
    };
    c.pv = pvMax(jeu, c);
    return c;
  }

  // Une créature lue d'une sauvegarde (ou écrite par Saga 0.2 : juste { creature, niveau }) :
  // tout ce qui manque est complété, sans rien perdre.
  function completer(jeu, c) {
    if (!c || typeof c !== 'object' || !c.creature) return null;
    if (c.ivs && Array.isArray(c.attaques)) {
      c.pv = Math.max(0, Math.min(pvMax(jeu, c), Number(c.pv) || 0));
      return c;
    }
    return creer(jeu, c.creature, c.niveau);
  }

  // Remise en forme (centre, lit, commande « soigner ») : PV, statut et PP.
  function soigner(jeu, c) {
    c.pv = pvMax(jeu, c);
    c.statut = '';
    c.sommeil = 0;
    for (const a of c.attaques) a.pp = a.ppMax;
  }

  // Le niveau maximum de l'équipe du joueur (Tafl › Réglages › plafonds, selon ses badges).
  function plafond(jeu, partie) {
    const p = reglages(jeu).plafonds;
    if (!Array.isArray(p) || !p.length) return 100;
    const badges = partie.compteurs?.badges || 0;
    const ok = p.filter((x) => (Number(x.badges) || 0) <= badges).sort((a, b) => b.badges - a.badges)[0];
    return Math.max(1, Math.min(100, Number(ok?.niveau) || 100));
  }

  // La Pierre Stase (Saga 0.7) : tenue, elle empêche d'évoluer (effet « stase » dans Tafl, ou l'objet
  // officiel Everstone importé).
  function stase(jeu, c) {
    const o = c.objet ? trouver(jeu, 'objets', c.objet) : null;
    return Boolean(o && (o.effet?.type === 'stase' || o.officiel === 'everstone'));
  }

  // L'évolution qu'une créature peut faire tout de suite, sans objet ni échange : au niveau, ou quand
  // sa quête est finie (Saga 0.7). null s'il n'y en a pas (ou si elle tient une Pierre Stase).
  function evolutionPrete(jeu, partie, c) {
    if (stase(jeu, c)) return null;
    return (espece(jeu, c)?.evolutions || []).find((v) => trouver(jeu, 'creatures', v.vers) && (
      (v.mode === 'niveau' && Number(v.niveau) > 0 && Number(v.niveau) <= c.niveau)
      || (v.mode === 'quete' && v.quete && partie?.quetes?.[v.quete]?.etat === 'finie'))) || null;
  }

  // La forme d'une espèce à un niveau (Saga 0.7) : un Bulbizarre de dresseur monté au niveau 40 par
  // l'ajustement devient Florizarre. On suit seulement les évolutions au niveau.
  function formeAuNiveau(jeu, id, niveau) {
    const vus = new Set([id]);
    for (;;) {
      const e = trouver(jeu, 'creatures', id);
      const v = (e?.evolutions || []).find((x) => x.mode === 'niveau' && Number(x.niveau) > 0 && Number(x.niveau) <= niveau && trouver(jeu, 'creatures', x.vers) && !vus.has(x.vers));
      if (!v) return id;
      id = v.vers;
      vus.add(id);
    }
  }

  // Le niveau qui sert de référence aux adversaires qui s'ajustent (Saga 0.7) : « equipe » (le meilleur
  // niveau de l'équipe), « badges » (le plafond des badges), sinon 0 (pas d'ajustement).
  function reference(jeu, partie, ajustement) {
    if (ajustement === 'equipe') return Math.max(0, ...partie.equipe.map((c) => c.niveau));
    if (ajustement === 'badges') return plafond(jeu, partie);
    return 0;
  }

  // Une créature sauvage (Saga 0.7) : niveau tiré entre min et max dans sa zone. Si les sauvages
  // s'ajustent (Tafl › Réglages), toute la fourchette monte pour que son haut vaille la référence plus
  // l'écart, sans jamais descendre sous ce que la zone dit ; l'espèce prend alors la forme de ce niveau.
  function sauvage(jeu, partie, id, niveau, { min = niveau, max = niveau } = {}) {
    const r = reglages(jeu);
    const ref = reference(jeu, partie, r.ajustement_sauvages);
    const decalage = ref ? Math.max(0, ref + (Number(r.ecart_sauvages) || 0) - max) : 0;
    const n = Math.max(1, Math.min(100, Math.max(min, niveau) + decalage));
    return creer(jeu, decalage && r.evolution_ajustee !== false ? formeAuNiveau(jeu, id, n) : id, n);
  }

  // Gagner de l'expérience. Rend la liste de ce qui arrive, dans l'ordre, pour l'écran de combat :
  // [{ type: 'niveau', niveau, avant, apres }, { type: 'apprend', attaque }, { type: 'oublier', attaque },
  //  { type: 'evolue', vers }, { type: 'plafond', niveau }]
  // (« oublier » : elle connaît déjà 4 attaques, le joueur choisit ; voir combat.js. « plafond » : elle
  // vient d'atteindre le niveau maximum des badges, Saga 0.7).
  function gagnerXp(jeu, partie, c, xp) {
    const e = espece(jeu, c);
    const max = plafond(jeu, partie);
    const evenements = [];
    if (c.niveau >= max) return evenements;
    c.xp += xp;
    while (c.niveau < max && c.xp >= xpPour(espece(jeu, c)?.croissance, c.niveau + 1)) {
      const avant = stats(jeu, c);
      c.niveau++;
      const apres = stats(jeu, c);
      // Les PV gagnés s'ajoutent aux PV actuels (une créature blessée le reste).
      if (c.pv > 0) c.pv = Math.min(apres.pv, c.pv + apres.pv - avant.pv);
      evenements.push({ type: 'niveau', niveau: c.niveau, avant, apres });
      for (const a of (espece(jeu, c)?.attaques || []).filter((x) => x.niveau === c.niveau)) {
        if (!trouver(jeu, 'attaques', a.attaque) || c.attaques.some((x) => x.id === a.attaque)) continue;
        evenements.push({ type: c.attaques.length < 4 ? 'apprend' : 'oublier', attaque: a.attaque });
        if (c.attaques.length < 4) c.attaques.push(attaque(jeu, a.attaque));
      }
      // L'évolution au niveau (ou de quête finie) : tout de suite, même en plein combat.
      const evo = evolutionPrete(jeu, partie, c);
      if (evo && !evenements.some((x) => x.type === 'evolue')) evenements.push({ type: 'evolue', vers: evo.vers });
    }
    if (c.niveau >= max) c.xp = Math.min(c.xp, xpPour(e?.croissance, max));
    if (c.niveau >= max && max < 100 && evenements.length) evenements.push({ type: 'plafond', niveau: max });
    return evenements;
  }

  // Faire évoluer : la créature change d'espèce, garde son niveau, ses IV, EV et attaques ; ses PV
  // gagnés s'ajoutent. Rend les attaques qu'elle apprend en évoluant (niveau 0 dans Tafl).
  function evoluer(jeu, c, vers) {
    const avant = pvMax(jeu, c);
    c.creature = vers;
    const apres = pvMax(jeu, c);
    if (c.pv > 0) c.pv = Math.min(apres, c.pv + apres - avant);
    const nouvelles = (espece(jeu, c)?.attaques || []).filter((a) => a.niveau === 0 && trouver(jeu, 'attaques', a.attaque) && !c.attaques.some((x) => x.id === a.attaque)).map((a) => a.attaque);
    return nouvelles;
  }

  // Les EV gagnés en battant une créature (510 au total au plus, 252 par stat).
  function gagnerEv(jeu, c, battue) {
    const dons = espece(jeu, battue)?.ev_donnes || {};
    let total = STATS.reduce((s, k) => s + (c.evs[k] || 0), 0);
    for (const s of STATS) {
      const n = Math.min(Number(dons[s]) || 0, 252 - (c.evs[s] || 0), 510 - total);
      if (n > 0) { c.evs[s] = (c.evs[s] || 0) + n; total += n; }
    }
  }

  return { STATS, NOMS_STATS, NATURES, trouver, espece, nom, stats, pvMax, xpPour, creer, completer, soigner, plafond, stase, evolutionPrete, formeAuNiveau, reference, sauvage, gagnerXp, evoluer, gagnerEv, attaque, attaquesAuNiveau };
})();
