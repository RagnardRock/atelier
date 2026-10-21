// Les règles Pokémon hors combat (Saga 0.5) : utiliser un objet du sac sur la carte (soins, vitamines,
// Super Bonbon, capsules d'IV, menthes, pierres d'évolution, Repousse), l'écran des EV du centre, et
// le prix d'une créature vendue en boutique.
//
// ui (prêté par le moteur) : dire(texte) attend que le joueur lise ; liste({ titre, items, … }) rend
// l'index choisi ou null ; ev({ … }) rend les nouveaux EV ou null (voir menus.js).

const HorsCombat = (() => {
  const C = Creatures;
  const STATS_IV = [['pv', 'PV'], ['attaque', 'Attaque'], ['defense', 'Défense'], ['att_spe', 'Att. Spé.'], ['def_spe', 'Déf. Spé.'], ['vitesse', 'Vitesse']];
  const nomStat = (s) => STATS_IV.find(([k]) => k === s)?.[1] || s;
  const UTILES = ['soin', 'soin_statut', 'rappel', 'pp', 'pp_toutes', 'pp_max', 'ev', 'niveau', 'ivs', 'menthe', 'evolution', 'repousse'];

  const utilisable = (o) => Boolean(o && UTILES.includes(o.effet?.type));
  const retirer = (partie, id) => { partie.sac[id] = (partie.sac[id] || 0) - 1; if (partie.sac[id] <= 0) delete partie.sac[id]; };

  // L'équipe en liste, avec les PV ; desactive(c) grise celles sur qui l'objet ne fait rien.
  const lignesEquipe = (jeu, partie, desactive = () => false, detail = null) => partie.equipe.map((c) => {
    const max = C.pvMax(jeu, c);
    return {
      texte: C.nom(jeu, c), image: C.espece(jeu, c)?.sprites?.face || '', pv: c.pv / Math.max(1, max),
      detail: detail ? detail(c) : `N.${c.niveau} · ${c.pv > 0 ? `${c.pv}/${max}` : 'K.O.'}`, desactive: desactive(c),
    };
  });

  // Elle connaît déjà 4 attaques : laquelle oublier (ou ne pas apprendre).
  async function apprendre(jeu, ui, c, id) {
    const nom = C.nom(jeu, c), nomA = C.trouver(jeu, 'attaques', id)?.nom || id;
    if (c.attaques.length < 4) { c.attaques.push(C.attaque(jeu, id)); await ui.dire(`${nom} apprend ${nomA} !`); return; }
    await ui.dire(`${nom} veut apprendre ${nomA}, mais il connaît déjà quatre attaques.`);
    const i = await ui.liste({ titre: `Oublier quelle attaque pour ${nomA} ?`, items: [
      ...c.attaques.map((a) => ({ texte: C.trouver(jeu, 'attaques', a.id)?.nom || a.id, detail: `PP ${a.pp}/${a.ppMax}` })),
      { texte: `Ne pas apprendre ${nomA}` },
    ] });
    if (i == null || i >= c.attaques.length) { await ui.dire(`${nom} n'apprend pas ${nomA}.`); return; }
    const oubliee = C.trouver(jeu, 'attaques', c.attaques[i].id)?.nom || c.attaques[i].id;
    c.attaques[i] = C.attaque(jeu, id);
    await ui.dire(`1, 2 et… Tadaa ! ${nom} oublie ${oubliee} et apprend ${nomA} !`);
  }

  async function evoluer(jeu, partie, ui, c, vers) {
    const avant = C.nom(jeu, c);
    await ui.dire(`Quoi ? ${avant} évolue !`);
    const nouvelles = C.evoluer(jeu, c, vers);
    partie.compteurs.evolutions = (partie.compteurs.evolutions || 0) + 1;
    await ui.dire(`${avant} devient ${C.nom(jeu, c)} !`);
    for (const a of nouvelles) await apprendre(jeu, ui, c, a);
  }

  // Ce qui suit une montée de niveau (Super Bonbon) : les mêmes événements qu'en combat.
  async function suites(jeu, partie, ui, c, evenements) {
    for (const ev of evenements) {
      if (ev.type === 'niveau') await ui.dire(`${C.nom(jeu, c)} monte au niveau ${ev.niveau} !`);
      else if (ev.type === 'apprend') await ui.dire(`${C.nom(jeu, c)} apprend ${C.trouver(jeu, 'attaques', ev.attaque)?.nom || ev.attaque} !`);
      else if (ev.type === 'oublier') await apprendre(jeu, ui, c, ev.attaque);
      else if (ev.type === 'evolue') await evoluer(jeu, partie, ui, c, ev.vers);
    }
  }

  // Utiliser l'objet `id` du sac. Rend true s'il a servi (il est alors retiré du sac).
  async function utiliserObjet({ jeu, partie, ui, id }) {
    const o = C.trouver(jeu, 'objets', id);
    const e = o?.effet || {};
    if (!o || !(partie.sac[id] > 0)) return false;
    if (!utilisable(o)) { await ui.dire(`${o.nom} ne s'utilise pas comme ça.`); return false; }
    const v = Number(e.valeur) || 0;

    if (e.type === 'repousse') {
      retirer(partie, id);
      partie.repousse = Math.max(partie.repousse || 0, v || 100);
      await ui.dire(`Tu utilises ${o.nom}. Les créatures sauvages t'éviteront pendant ${partie.repousse} pas.`);
      return true;
    }
    if (!partie.equipe.length) { await ui.dire('Tu n\'as aucune créature.'); return false; }

    // Sur qui ? (une pierre : seulement celles qu'elle fait évoluer)
    const evo = (c) => (C.espece(jeu, c)?.evolutions || []).find((x) => x.mode === 'objet' && x.objet === id && C.trouver(jeu, 'creatures', x.vers));
    const i = await ui.liste({
      titre: `${o.nom} : sur qui ?`,
      items: lignesEquipe(jeu, partie, e.type === 'evolution' ? (c) => !evo(c) : () => false, e.type === 'evolution' ? (c) => (evo(c) ? 'Compatible' : 'Pas compatible') : null),
    });
    if (i == null) return false;
    const c = partie.equipe[i], nom = C.nom(jeu, c), max = C.pvMax(jeu, c);
    const sansEffet = async () => { await ui.dire('Ça n\'aura aucun effet.'); return false; };

    switch (e.type) {
      case 'evolution': {
        const x = evo(c);
        if (!x) return sansEffet();
        retirer(partie, id);
        await evoluer(jeu, partie, ui, c, x.vers);
        return true;
      }
      case 'rappel':
        if (c.pv > 0) return sansEffet();
        retirer(partie, id);
        c.pv = Math.max(1, Math.floor(max * (v || 50) / 100));
        await ui.dire(`${nom} reprend connaissance !`);
        return true;
      case 'soin': {
        const statut = e.statut && c.statut && (e.statut === 'tous' || e.statut === c.statut);
        if (c.pv <= 0 || (c.pv >= max && !statut)) return sansEffet();
        retirer(partie, id);
        const avant = c.pv;
        if (v > 0) c.pv = Math.min(max, c.pv + v);
        if (statut) { c.statut = ''; c.sommeil = 0; }
        await ui.dire(c.pv > avant ? `${nom} récupère ${c.pv - avant} PV.` : `${nom} va mieux.`);
        return true;
      }
      case 'soin_statut':
        if (c.pv <= 0 || !c.statut || !(e.statut === 'tous' || e.statut === c.statut || (e.statut === 'poison' && c.statut === 'poison_grave'))) return sansEffet();
        retirer(partie, id);
        c.statut = ''; c.sommeil = 0;
        await ui.dire(`${nom} va mieux.`);
        return true;
      case 'pp':
      case 'pp_toutes': {
        // Une attaque (au choix) ou toutes.
        let cibles = c.attaques;
        if (e.type === 'pp') {
          const j = await ui.liste({ titre: `${o.nom} : quelle attaque ?`, items: c.attaques.map((a) => ({ texte: C.trouver(jeu, 'attaques', a.id)?.nom || a.id, detail: `PP ${a.pp}/${a.ppMax}`, desactive: a.pp >= a.ppMax })) });
          if (j == null) return false;
          cibles = [c.attaques[j]];
        }
        if (!cibles.some((a) => a.pp < a.ppMax)) return sansEffet();
        retirer(partie, id);
        for (const a of cibles) a.pp = Math.min(a.ppMax, a.pp + (v >= 99 || !v ? a.ppMax : v));
        await ui.dire(`Les PP de ${nom} sont restaurés.`);
        return true;
      }
      case 'pp_max': {
        // PP Plus : +20 % des PP de base par palier, 3 paliers au plus.
        const j = await ui.liste({ titre: `${o.nom} : quelle attaque ?`, items: c.attaques.map((a) => ({ texte: C.trouver(jeu, 'attaques', a.id)?.nom || a.id, detail: `PP max ${a.ppMax}${(a.paliers || 0) >= 3 ? ' (au maximum)' : ''}`, desactive: (a.paliers || 0) >= 3 })) });
        if (j == null) return false;
        const a = c.attaques[j], base = Number(C.trouver(jeu, 'attaques', a.id)?.pp) || a.ppMax;
        if ((a.paliers || 0) >= 3) return sansEffet();
        retirer(partie, id);
        a.paliers = Math.min(3, (a.paliers || 0) + Math.max(1, v || 1));
        const avant = a.ppMax;
        a.ppMax = base + Math.floor(base * a.paliers / 5);
        a.pp += a.ppMax - avant;
        await ui.dire(`Les PP max de ${C.trouver(jeu, 'attaques', a.id)?.nom || a.id} passent à ${a.ppMax}.`);
        return true;
      }
      case 'ev': {
        // Vitamine : 252 au plus par stat, 510 en tout.
        const s = e.stat, total = C.STATS.reduce((n, k) => n + (c.evs[k] || 0), 0);
        const gain = Math.min(v || 10, 252 - (c.evs[s] || 0), 510 - total);
        if (!C.STATS.includes(s) || gain <= 0) return sansEffet();
        retirer(partie, id);
        c.evs[s] = (c.evs[s] || 0) + gain;
        if (s === 'pv' && c.pv > 0) c.pv += C.pvMax(jeu, c) - max;
        await ui.dire(`${nom} gagne ${gain} points d'effort en ${nomStat(s)}.`);
        return true;
      }
      case 'niveau': {
        // Super Bonbon : jusqu'au plafond des badges.
        if (c.niveau >= C.plafond(jeu, partie)) return sansEffet();
        retirer(partie, id);
        for (let k = 0; k < Math.max(1, v || 1) && c.niveau < C.plafond(jeu, partie); k++) {
          c.xp = Math.max(c.xp, C.xpPour(C.espece(jeu, c)?.croissance, c.niveau + 1));
          await suites(jeu, partie, ui, c, C.gagnerXp(jeu, partie, c, 0));
        }
        return true;
      }
      case 'ivs': {
        // Capsule : une stat au choix, une stat donnée, ou toutes.
        let stats = e.stat === 'tous' ? C.STATS : [e.stat];
        if (e.stat === 'choix') {
          const j = await ui.liste({ titre: `${o.nom} : quelle statistique ?`, items: STATS_IV.map(([k, n]) => ({ texte: n, detail: `IV ${c.ivs[k] ?? 0}/31`, desactive: (c.ivs[k] ?? 0) >= (v || 31) })) });
          if (j == null) return false;
          stats = [STATS_IV[j][0]];
        }
        stats = stats.filter((k) => C.STATS.includes(k) && (c.ivs[k] ?? 0) < (v || 31));
        if (!stats.length) return sansEffet();
        retirer(partie, id);
        for (const k of stats) c.ivs[k] = Math.min(31, v || 31);
        if (c.pv > 0) c.pv += C.pvMax(jeu, c) - max;
        await ui.dire(stats.length > 1 ? `Toutes les statistiques de ${nom} sont au mieux !` : `${nomStat(stats[0])} de ${nom} est au mieux !`);
        return true;
      }
      case 'menthe': {
        if (!(e.nature in C.NATURES) || (c.menthe || c.nature) === e.nature) return sansEffet();
        retirer(partie, id);
        c.menthe = e.nature;
        if (c.pv > 0) c.pv = Math.min(C.pvMax(jeu, c), c.pv);
        await ui.dire(`L'effet de la nature de ${nom} change.`);
        return true;
      }
      default:
        return sansEffet();
    }
  }

  // L'écran des EV (commande ecran_ev, au centre) : le joueur répartit les points d'effort de ses
  // créatures, 252 au plus par stat et 510 en tout. Les PV perdus le restent.
  async function ecranEv({ jeu, partie, ui }) {
    if (!partie.equipe.length) { await ui.dire('Tu n\'as aucune créature.'); return; }
    for (;;) {
      const i = await ui.liste({ titre: 'Points d\'effort : quelle créature ?', items: lignesEquipe(jeu, partie, () => false, (c) => `${C.STATS.reduce((n, k) => n + (c.evs[k] || 0), 0)}/510 EV`) });
      if (i == null) return;
      const c = partie.equipe[i];
      const r = await ui.ev({
        titre: `EV de ${C.nom(jeu, c)} (N.${c.niveau})`,
        stats: STATS_IV.map(([id, nom]) => ({ id, nom })),
        evs: { ...c.evs },
        apercu: (evs) => {
          const s = C.stats(jeu, { ...c, evs });
          return Object.fromEntries(C.STATS.map((k) => [k, String(s[k])]));
        },
      });
      if (!r) continue;
      const avant = C.pvMax(jeu, c);
      c.evs = Object.fromEntries(C.STATS.map((k) => [k, r[k] || 0]));
      const apres = C.pvMax(jeu, c);
      if (c.pv > 0) c.pv = Math.max(1, Math.min(apres, c.pv + apres - avant));
      await ui.dire(`Les points d'effort de ${C.nom(jeu, c)} sont répartis.`);
    }
  }

  // Ce qu'une boutique paie pour une créature : 100 par niveau, ×5 pour une légendaire.
  const prixCreature = (jeu, c) => Math.max(100, c.niveau * 100 * (C.espece(jeu, c)?.legendaire ? 5 : 1));

  return { utilisable, utiliserObjet, ecranEv, prixCreature };
})();
