// Les fiches Pokémon (Saga 0.6) : le résumé d'une créature du joueur (infos, statistiques avec IV et
// EV, attaques) et les pages du Pokédex. Ce fichier dit QUOI montrer ; menus.js › fiche le dessine,
// sans rien savoir des règles. Une fiche :
//   { titre, sousTitre, image, etiquettes: [{ texte, couleur }],
//     pages: [{ id, nom, texte, lignes: [{ nom, valeur, detail, barre (0 à 1), couleur }] }] }

const Fiches = (() => {
  const C = Creatures;
  const NOMS_NATURES = {
    hardi: 'Hardi', solo: 'Solo', brave: 'Brave', rigide: 'Rigide', mauvais: 'Mauvais', assure: 'Assuré', docile: 'Docile', relax: 'Relax',
    malin: 'Malin', lache: 'Lâche', timide: 'Timide', presse: 'Pressé', serieux: 'Sérieux', jovial: 'Jovial', naif: 'Naïf', modeste: 'Modeste',
    doux: 'Doux', discret: 'Discret', pudique: 'Pudique', foufou: 'Foufou', calme: 'Calme', gentil: 'Gentil', malpoli: 'Malpoli',
    prudent: 'Prudent', bizarre: 'Bizarre',
  };
  const NOMS_STATUTS = { brulure: 'Brûlé', paralysie: 'Paralysé', poison: 'Empoisonné', poison_grave: 'Gravement empoisonné', sommeil: 'Endormi', gel: 'Gelé' };
  const CATEGORIES = { physique: 'Physique', speciale: 'Spéciale', statut: 'Statut' };
  const numero = (e) => `N° ${String(Number(e?.numero) || 0).padStart(3, '0')}`;
  const types = (jeu, e) => (e?.types || []).map((t) => {
    const d = C.trouver(jeu, 'types', t);
    return { texte: d?.nom || t, couleur: d?.couleur || '' };
  });
  const effetNature = (n) => {
    const x = C.NATURES[n];
    return x ? `+${C.NOMS_STATS[x[0]]}, −${C.NOMS_STATS[x[1]]}` : 'neutre';
  };

  // --- Le résumé d'une créature du joueur (menu Équipe, PC) ---
  // partie (Saga 0.7, facultatif) : pour dire quand le plafond des badges bloque l'expérience.
  function fiche(jeu, c, partie = null) {
    const e = C.espece(jeu, c);
    const plafond = partie ? C.plafond(jeu, partie) : 100;
    const s = C.stats(jeu, c), max = s.pv;
    const nature = c.menthe || c.nature;
    const talent = C.trouver(jeu, 'talents', c.talent);
    const xpAvant = C.xpPour(e?.croissance, c.niveau), xpApres = C.xpPour(e?.croissance, c.niveau + 1);
    const auMax = c.niveau >= 100, bloque = !auMax && c.niveau >= plafond;
    const sexe = c.sexe === 'm' ? ' ♂' : c.sexe === 'f' ? ' ♀' : '';
    const infos = [
      { nom: 'Espèce', valeur: e?.nom || c.creature, detail: e ? numero(e) : '' },
      { nom: 'PV', valeur: c.pv > 0 ? `${c.pv} / ${max}` : `K.O. (0 / ${max})`, barre: c.pv / Math.max(1, max), couleur: c.pv / max > 0.5 ? '#4cd964' : c.pv / max > 0.2 ? '#f2c230' : '#f0503c' },
      { nom: 'Statut', valeur: NOMS_STATUTS[c.statut] || 'En forme' },
      { nom: 'Nature', valeur: NOMS_NATURES[c.nature] || c.nature, detail: c.menthe && c.menthe !== c.nature ? `menthe ${NOMS_NATURES[c.menthe]} : ${effetNature(nature)}` : effetNature(nature) },
      { nom: 'Talent', valeur: talent?.nom || c.talent || '—', detail: talent?.description || '' },
      { nom: 'Expérience', valeur: `${c.xp}`, detail: auMax ? 'niveau maximum' : bloque ? `niveau maximum des badges (${plafond}) : un nouveau badge pour progresser` : `encore ${Math.max(0, xpApres - c.xp)} pour le niveau ${c.niveau + 1}`, barre: auMax ? 1 : (c.xp - xpAvant) / Math.max(1, xpApres - xpAvant), couleur: '#4aa8ff' },
    ];
    // L'amitié (Saga 0.7) : une barre et une phrase, sans le chiffre (comme dans les jeux officiels).
    const amitie = Number.isFinite(c.amitie) ? c.amitie : 70;
    infos.push({ nom: 'Amitié', valeur: C.motAmitie(amitie), barre: amitie / 255, couleur: '#ff7aa8' });
    if (c.objet) infos.push({ nom: 'Objet tenu', valeur: C.trouver(jeu, 'objets', c.objet)?.nom || c.objet });
    const nat = C.NATURES[nature];
    const totalEv = C.STATS.reduce((n, k) => n + (c.evs?.[k] || 0), 0);
    const stats = C.STATS.map((k) => ({
      nom: `${C.NOMS_STATS[k]}${nat?.[0] === k ? ' ▲' : nat?.[1] === k ? ' ▼' : ''}`,
      valeur: String(s[k]),
      detail: `IV ${c.ivs?.[k] ?? 0} · EV ${c.evs?.[k] || 0}`,
      barre: (c.evs?.[k] || 0) / 252, couleur: nat?.[0] === k ? '#f0806a' : nat?.[1] === k ? '#6aa8f0' : '',
    }));
    stats.push({ nom: 'EV en tout', valeur: `${totalEv} / 510`, barre: totalEv / 510 });
    const attaques = c.attaques.map((a) => {
      const d = C.trouver(jeu, 'attaques', a.id), t = C.trouver(jeu, 'types', d?.type);
      return {
        nom: d?.nom || a.id, valeur: `PP ${a.pp} / ${a.ppMax}`, couleur: t?.couleur || '',
        detail: [t?.nom, CATEGORIES[d?.categorie], d?.puissance ? `puissance ${d.puissance}` : '', d?.precision ? `précision ${d.precision}` : ''].filter(Boolean).join(' · '),
      };
    });
    return {
      titre: `${C.nom(jeu, c)}${sexe}${c.chromatique ? ' ★' : ''}`,
      sousTitre: `N.${c.niveau}${c.surnom && e ? ` · ${e.nom}` : ''}`,
      image: e?.sprites?.face || '',
      etiquettes: types(jeu, e),
      pages: [
        { id: 'infos', nom: 'Infos', lignes: infos },
        { id: 'stats', nom: 'Statistiques', lignes: stats, texte: '▲ ▼ : ce que sa nature augmente et baisse. La barre montre ses EV (252 au plus).' },
        { id: 'attaques', nom: 'Attaques', lignes: attaques, texte: attaques.length ? '' : 'Aucune attaque.' },
      ],
    };
  }

  // --- Le Pokédex ---
  // Toutes les espèces du jeu, dans l'ordre de leur numéro.
  function especes(jeu) {
    return [...(jeu.donnees.creatures?.creatures || [])]
      .sort((a, b) => (Number(a.numero) || 0) - (Number(b.numero) || 0) || String(a.nom).localeCompare(String(b.nom)))
      .map((e) => ({ id: e.id, numero: numero(e), nom: e.nom || e.id, image: e.sprites?.face || '' }));
  }

  // La page d'une espèce. Seulement vue : son nom, son image, ses types. Attrapée : tout.
  function ficheEspece(jeu, id, { pris = false, vus = {} } = {}) {
    const e = C.trouver(jeu, 'creatures', id);
    if (!e) return null;
    const pages = [];
    if (pris) {
      const lignes = [];
      if (Number(e.taille) > 0) lignes.push({ nom: 'Taille', valeur: `${String(e.taille).replace('.', ',')} m` });
      if (Number(e.poids) > 0) lignes.push({ nom: 'Poids', valeur: `${String(e.poids).replace('.', ',')} kg` });
      const talents = (e.talents || []).map((t) => C.trouver(jeu, 'talents', t)?.nom || t);
      if (talents.length) lignes.push({ nom: 'Talents', valeur: talents.join(', ') });
      pages.push({ nom: 'Description', texte: e.description || '', lignes });
      pages.push({ nom: 'Stats de base', lignes: C.STATS.map((k) => ({ nom: C.NOMS_STATS[k], valeur: String(Number(e.stats?.[k]) || 0), barre: (Number(e.stats?.[k]) || 0) / 180 })) });
      // Ses évolutions (le nom d'une espèce jamais vue reste caché).
      const evos = (e.evolutions || []).filter((v) => C.trouver(jeu, 'creatures', v.vers)).map((v) => {
        const vers = C.trouver(jeu, 'creatures', v.vers);
        const comment = v.mode === 'niveau' ? `au niveau ${v.niveau}` : v.mode === 'objet' ? `avec ${C.trouver(jeu, 'objets', v.objet)?.nom || v.objet}` : v.mode === 'echange' ? 'par échange' : v.mode === 'amitie' ? 'par amitié' : v.condition || 'en certaines circonstances';
        return { nom: vus[v.vers] ? vers.nom : '???', valeur: comment };
      });
      if (evos.length) pages.push({ nom: 'Évolutions', lignes: evos });
    } else {
      pages.push({ nom: 'Description', texte: 'Tu l\'as vu, mais pas encore attrapé. Attrape-le pour en savoir plus.', lignes: [] });
    }
    return {
      titre: e.nom || e.id,
      sousTitre: `${numero(e)}${e.espece ? ` · ${e.espece}` : ''}`,
      image: e.sprites?.face || '',
      etiquettes: types(jeu, e),
      pages,
    };
  }

  return { fiche, especes, ficheEspece };
})();
