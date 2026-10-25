// Le pack JDR (Saga 0.13) : les personnages joueurs, leur fiche et tout ce qui s'en calcule.
//
// Un personnage dans la partie (partie.equipe, les boîtes de la Réserve) :
//   { creature, heros: true, jdr: true, nom, surnom, joueur, origine, classe, niveau, xp,
//     carac: { for: 15, … },            les valeurs choisies à la création, plus les augmentations
//     competences: [ids], expertises: [ids],
//     pv, pv_temp, pv_niveaux: [gains],  les PV gagnés à chaque niveau après le 1er (sans la Con)
//     des_vie,                           les dés de vie qui restent (repos court)
//     equipement: { arme, seconde, armure }, sorts: [ids], emplacements: { 1: utilisés, … }, pacte: utilisés,
//     ressources: { id: utilisées },     second souffle, rage… (voir RESSOURCES)
//     etats: [id], mort: { succes, echecs }, stable, mort_definitive, inspiration, notes }
// `creature` est le personnage de personnages.json qui lui prête son apparence (son sprite, ses
// portraits) ; un pré-tiré y a aussi sa fiche (personnage.jdr). `nom` est celui choisi par le joueur.
// `joueur` dira plus tard à quel ami appartient la fiche (multijoueur) : vide pour l'instant.
//
// Rien de calculé n'est gardé : la CA, les bonus, les PV max se relisent dans les données du jeu à
// chaque fois, pour qu'un changement fait dans Tafl se voie aussitôt dans les parties en cours.

const JdrPerso = (() => {
  const B = JdrBase;
  const PLACES = [['arme', 'Arme'], ['seconde', 'Main gauche'], ['armure', 'Armure']];

  const perso = (jeu, c) => jeu.personnages.get(c.creature) || null;
  const classe = (jeu, c) => B.trouver(jeu, 'classes_jdr', c.classe);
  const origine = (jeu, c) => B.trouver(jeu, 'origines', c.origine);
  const objet = (jeu, id) => B.trouver(jeu, 'objets', id);
  const niveauMax = (jeu) => B.borne(Math.round(Number(jeu.donnees.reglages?.reglages?.niveau_max) || 20), 1, 20);
  const xpPour = (n) => B.XP[B.borne(n, 1, 20)] || 0;

  function nom(jeu, c) {
    if (c.surnom) return c.surnom;
    if (c.nom) return c.nom;
    const p = perso(jeu, c);
    if (p?.heros && jeu.joueur?.nom) return jeu.joueur.nom;
    return p?.nom || c.creature;
  }
  function apparence(jeu, c) {
    const p = perso(jeu, c);
    if (!p) return jeu.heros || null;
    const tenue = p.heros && jeu.joueur?.tenue ? (p.tenues || []).find((t) => t.id === jeu.joueur.tenue) : null;
    return tenue?.sprite ? { sprite: tenue.sprite, couleur: p.couleur } : p;
  }
  function portrait(jeu, c) {
    const l = (perso(jeu, c) || jeu.heros)?.portraits || [];
    return (l.find((x) => x.expression === 'normal') || l[0])?.png || '';
  }

  // --- Les caractéristiques ---
  function carac(jeu, c, id) {
    const base = Number(c.carac?.[id]);
    const bonus = Number(origine(jeu, c)?.bonus?.[id]) || 0;
    return B.borne((Number.isFinite(base) ? base : 10) + bonus, 1, 30);
  }
  const modCarac = (jeu, c, id) => B.mod(carac(jeu, c, id));
  const pb = (c) => B.maitrise(c.niveau);
  const sauvegardes = (jeu, c) => classe(jeu, c)?.sauvegardes || [];
  const maitriseSauvegarde = (jeu, c, id) => sauvegardes(jeu, c).includes(id);
  const bonusSauvegarde = (jeu, c, id) => modCarac(jeu, c, id) + (maitriseSauvegarde(jeu, c, id) ? pb(c) : 0);
  const caracDe = (jeu, idComp) => B.trouver(jeu, 'competences', idComp)?.carac || (B.trouver(jeu, 'caracteristiques', idComp) ? idComp : 'for');
  const estCompetence = (jeu, id) => Boolean(B.trouver(jeu, 'competences', id));
  // Les compétences maîtrisées : celles choisies, plus celles de l'origine.
  const competencesMaitrisees = (jeu, c) => [...new Set([...(c.competences || []), ...(origine(jeu, c)?.maitrises?.competences || [])])];
  function bonusCompetence(jeu, c, id) {
    if (!estCompetence(jeu, id)) return modCarac(jeu, c, id); // un test de caractéristique pur
    const m = competencesMaitrisees(jeu, c).includes(id), e = (c.expertises || []).includes(id);
    return modCarac(jeu, c, caracDe(jeu, id)) + (m ? pb(c) : 0) + (m && e ? pb(c) : 0);
  }
  const perceptionPassive = (jeu, c) => 10 + bonusCompetence(jeu, c, 'perception');

  // --- Les aptitudes (de classe jusqu'au niveau du personnage, puis les traits de son origine) ---
  function aptitudes(jeu, c) {
    const k = classe(jeu, c), o = origine(jeu, c);
    const deClasse = (k?.niveaux || []).filter((x) => Number(x.niveau) <= c.niveau).sort((a, b) => a.niveau - b.niveau)
      .flatMap((x) => (x.aptitudes || []).map((a) => ({ ...a, niveau: x.niveau, source: k.nom })));
    return [...deClasse, ...(o?.traits || []).map((t) => ({ ...t, source: o.nom }))];
  }
  const a = (jeu, c, effet) => aptitudes(jeu, c).some((x) => x.effet === effet);
  // Ce que l'aptitude `effet` vaut au niveau du personnage (le dernier palier atteint), ou null.
  function palier(jeu, c, effet) {
    const l = aptitudes(jeu, c).filter((x) => x.effet === effet);
    return l.length ? l[l.length - 1] : null;
  }

  // --- Les PV ---
  const deVie = (jeu, c) => B.borne(Number(classe(jeu, c)?.de_vie) || 8, 4, 12);
  function pvMax(jeu, c) {
    const de = deVie(jeu, c), con = modCarac(jeu, c, 'con');
    let total = de + con;
    for (let n = 2; n <= c.niveau; n++) {
      const g = Number(c.pv_niveaux?.[n - 2]);
      total += Math.max(1, (Number.isFinite(g) && g > 0 ? g : Math.floor(de / 2) + 1) + con);
    }
    total += (Number(origine(jeu, c)?.pv_bonus_niveau) || 0) * c.niveau;
    return Math.max(1, total);
  }

  // --- L'équipement ---
  const arme = (o) => o?.jdr?.arme || null;
  const armure = (o) => o?.jdr?.armure || null;
  const maitrises = (jeu, c) => {
    const k = classe(jeu, c)?.maitrises || {}, o = origine(jeu, c)?.maitrises || {};
    return { armes: [...(k.armes || []), ...(o.armes || [])], armures: [...(k.armures || []), ...(o.armures || [])] };
  };
  const maitriseArme = (jeu, c, o) => { const m = maitrises(jeu, c).armes, w = arme(o); return Boolean(w && (m.includes(w.categorie) || m.includes(o.id))); };
  // La CA : l'armure portée (légère : + Dex ; intermédiaire : + Dex jusqu'à 2 ; lourde : rien), le
  // bouclier (+2), la défense sans armure (barbare : + Con ; moine : + Sag, sans bouclier), le style Défense.
  function ca(jeu, c) {
    const dex = modCarac(jeu, c, 'dex');
    const ar = armure(objet(jeu, c.equipement?.armure)), bo = armure(objet(jeu, c.equipement?.seconde));
    const bouclier = bo?.type === 'bouclier' ? bo : null;
    let total;
    if (ar && ar.type !== 'bouclier') {
      const base = Number(ar.ca) || 10;
      const max = ar.type === 'lourde' ? 0 : ar.type === 'intermediaire' ? Math.min(dex, Number.isFinite(Number(ar.dex_max)) && ar.dex_max !== null ? Number(ar.dex_max) : 2) : dex;
      total = base + max + (Number(ar.magie) || 0);
      if (a(jeu, c, 'style_defense')) total += 1;
    } else if (a(jeu, c, 'defense_sans_armure_barbare')) total = 10 + dex + modCarac(jeu, c, 'con');
    else if (a(jeu, c, 'defense_sans_armure_moine') && !bouclier) total = 10 + dex + modCarac(jeu, c, 'sag');
    else total = 10 + dex;
    if (bouclier) total += (Number(bouclier.ca) || 2) + (Number(bouclier.magie) || 0);
    return total;
  }
  const initiative = (jeu, c) => modCarac(jeu, c, 'dex');
  const vitesse = (jeu, c) => Number(origine(jeu, c)?.vitesse) || 9;

  // Les attaques que le personnage sait faire : son arme (et celle de la main gauche si elle est
  // légère), sinon un coup à mains nues. { id, nom, bonus, degats, type, carac, distance, objet, seconde }
  function attaques(jeu, c) {
    const out = [];
    const fo = modCarac(jeu, c, 'for'), dx = modCarac(jeu, c, 'dex');
    const ajouter = (o, seconde = false) => {
      const w = arme(o);
      if (!w) return;
      const finesse = (w.proprietes || []).includes('finesse');
      const k = w.distance ? (finesse ? Math.max(fo, dx) : dx) : finesse ? Math.max(fo, dx) : fo;
      const carac = k === dx && (w.distance || finesse) ? 'dex' : 'for';
      const magie = Number(w.magie) || 0;
      const deuxMains = (w.proprietes || []).includes('polyvalente') && w.polyvalente && !c.equipement?.seconde;
      let mod = k;
      // Une attaque avec l'arme de la main gauche n'ajoute pas le modificateur aux dégâts (sauf s'il est négatif).
      if (seconde && mod > 0 && !a(jeu, c, 'style_deux_armes')) mod = 0;
      const duel = !seconde && !w.distance && a(jeu, c, 'style_duel') && !(w.proprietes || []).includes('deux_mains') && !arme(objet(jeu, c.equipement?.seconde)) ? 2 : 0;
      const archer = w.distance && a(jeu, c, 'style_archerie') ? 2 : 0;
      out.push({
        id: seconde ? 'seconde' : 'arme', nom: o.nom, objet: o.id, seconde, distance: Boolean(w.distance), carac,
        bonus: k + (maitriseArme(jeu, c, o) ? pb(c) : 0) + magie + archer,
        des: deuxMains ? w.polyvalente : w.degats || '1d4', mod: mod + magie + duel, type: w.type || 'contondant',
        finesse, legere: (w.proprietes || []).includes('legere'),
        // Saga 0.14 (mode table) : la portée en mètres d'une arme à distance, l'allonge (3 m au contact).
        portee: Number(w.portee) || 0, portee_longue: Number(w.portee_longue) || 0, allonge: (w.proprietes || []).includes('allonge'),
      });
    };
    ajouter(objet(jeu, c.equipement?.arme));
    const s = objet(jeu, c.equipement?.seconde);
    if (arme(s) && (arme(s).proprietes || []).includes('legere') && out[0]?.legere) ajouter(s, true);
    if (!out.length) {
      // À mains nues : 1 + For (le moine : son dé d'arts martiaux, avec la Dex s'il le veut).
      const moine = palier(jeu, c, 'arts_martiaux');
      const k = moine ? Math.max(fo, dx) : fo;
      out.push({ id: 'mains', nom: 'Mains nues', objet: '', seconde: false, distance: false, carac: k === dx && moine ? 'dex' : 'for', bonus: k + pb(c), des: moine ? moine.valeur || '1d4' : '1', mod: k, type: 'contondant', finesse: Boolean(moine), legere: false });
    }
    return out;
  }
  // Les places d'équipement : arme (main droite), seconde (bouclier ou arme légère), armure.
  const placeDe = (o) => (armure(o)?.type === 'bouclier' ? 'seconde' : armure(o) ? 'armure' : arme(o) ? 'arme' : '');
  function peutMettre(jeu, c, o, place) {
    if (!o) return false;
    if (place === 'armure') return Boolean(armure(o) && armure(o).type !== 'bouclier');
    if (place === 'arme') return Boolean(arme(o));
    if (place === 'seconde') {
      const principale = arme(objet(jeu, c.equipement?.arme));
      if (principale && (principale.proprietes || []).includes('deux_mains')) return false;
      return armure(o)?.type === 'bouclier' || Boolean(arme(o) && (arme(o).proprietes || []).includes('legere'));
    }
    return false;
  }
  function equiper(jeu, partie, c, place, id) {
    if (id) {
      const o = objet(jeu, id);
      if (!peutMettre(jeu, c, o, place) || !(partie.sac[id] > 0)) return false;
      partie.sac[id]--;
      if (partie.sac[id] <= 0) delete partie.sac[id];
    }
    const ancien = c.equipement[place];
    if (ancien) partie.sac[ancien] = (partie.sac[ancien] || 0) + 1;
    c.equipement[place] = id || '';
    // Une arme à deux mains libère la main gauche.
    if (place === 'arme' && id && (arme(objet(jeu, id))?.proprietes || []).includes('deux_mains') && c.equipement.seconde) {
      partie.sac[c.equipement.seconde] = (partie.sac[c.equipement.seconde] || 0) + 1;
      c.equipement.seconde = '';
    }
    c.pv = Math.min(c.pv, pvMax(jeu, c));
    return true;
  }

  // --- La magie ---
  const lanceur = (jeu, c) => { const l = classe(jeu, c)?.lanceur; return l && l.type && l.type !== 'aucun' ? l : null; };
  const caracMagie = (jeu, c) => lanceur(jeu, c)?.carac || 'int';
  const ddSorts = (jeu, c) => 8 + pb(c) + modCarac(jeu, c, caracMagie(jeu, c));
  const attaqueSorts = (jeu, c) => pb(c) + modCarac(jeu, c, caracMagie(jeu, c));
  // Les emplacements de sorts au niveau du personnage : [niv. 1, niv. 2, …] (l'occultiste : son pacte).
  function emplacements(jeu, c) {
    const l = lanceur(jeu, c);
    if (!l) return [];
    if (l.type === 'occultiste') { const [n, niv] = B.PACTE[c.niveau] || [0, 0]; return Array.from({ length: niv }, (_, i) => (i === niv - 1 ? n : 0)); }
    if (l.type === 'demi') return [...B.emplacementsDemi(c.niveau)];
    if (l.type === 'tiers') return c.niveau < 3 ? [] : [...B.EMPLACEMENTS_COMPLET[Math.ceil(c.niveau / 3)]];
    return [...(B.EMPLACEMENTS_COMPLET[c.niveau] || [])];
  }
  const restants = (jeu, c, niveau) => Math.max(0, (emplacements(jeu, c)[niveau - 1] || 0) - (Number(c.emplacements?.[niveau]) || 0));
  const niveauSortMax = (jeu, c) => emplacements(jeu, c).reduce((m, n, i) => (n > 0 ? i + 1 : m), 0);
  // Combien de tours de magie et de sorts il connaît (ou prépare) à son niveau.
  function nombreSorts(jeu, c) {
    const l = lanceur(jeu, c);
    if (!l) return { tours: 0, sorts: 0 };
    const tours = Array.isArray(l.tours) ? Number(l.tours[c.niveau - 1]) || 0 : B.toursConnus(Number(l.tours) || 0, c.niveau);
    let sorts;
    if (l.prepare) sorts = Math.max(1, modCarac(jeu, c, l.carac) + (l.type === 'demi' ? Math.floor(c.niveau / 2) : c.niveau));
    else sorts = Array.isArray(l.connus) ? Number(l.connus[c.niveau - 1]) || 0 : Number(l.connus) || c.niveau + 1;
    if (l.type === 'demi' && c.niveau < 2) sorts = 0;
    return { tours, sorts };
  }
  const sort = (jeu, id) => B.trouver(jeu, 'sorts', id);
  // Les sorts qu'il peut apprendre : ceux de sa classe, jusqu'au niveau qu'il peut lancer.
  const sortsDeClasse = (jeu, c, niveauMax = niveauSortMax(jeu, c)) => B.liste(jeu, 'sorts').filter((s) => (s.classes || []).includes(c.classe) && Number(s.niveau) <= niveauMax);
  const sortsConnus = (jeu, c) => (c.sorts || []).map((id) => sort(jeu, id)).filter(Boolean);

  // --- Les ressources des aptitudes (utilisées, rendues par un repos) ---
  const RESSOURCES = {
    second_souffle: { nom: 'Second souffle', max: () => 1, repos: 'court' },
    sursaut: { nom: 'Fougue', max: (jeu, c) => (c.niveau >= 17 ? 2 : 1), repos: 'court' },
    rage: { nom: 'Rage', max: (jeu, c) => (c.niveau >= 20 ? 99 : c.niveau >= 17 ? 6 : c.niveau >= 12 ? 5 : c.niveau >= 6 ? 4 : c.niveau >= 3 ? 3 : 2), repos: 'long' },
    imposition_des_mains: { nom: 'Imposition des mains', max: (jeu, c) => 5 * c.niveau, repos: 'long' },
    inspiration_bardique: { nom: 'Inspiration bardique', max: (jeu, c) => Math.max(1, modCarac(jeu, c, 'cha')), repos: 'long' },
    canalisation: { nom: 'Conduit divin', max: (jeu, c) => (c.niveau >= 18 ? 3 : c.niveau >= 6 ? 2 : 1), repos: 'court' },
    recuperation_arcanique: { nom: 'Restauration arcanique', max: () => 1, repos: 'long' },
    ki: { nom: 'Points de ki', max: (jeu, c) => (c.niveau >= 2 ? c.niveau : 0), repos: 'court' },
    sorcellerie: { nom: 'Points de sorcellerie', max: (jeu, c) => (c.niveau >= 2 ? c.niveau : 0), repos: 'long' },
  };
  // Les ressources qu'il a : les aptitudes qui en déclarent une (effet = l'id de la ressource).
  const ressources = (jeu, c) => Object.keys(RESSOURCES).filter((id) => a(jeu, c, id) && RESSOURCES[id].max(jeu, c) > 0);
  const resteRessource = (jeu, c, id) => Math.max(0, RESSOURCES[id].max(jeu, c) - (Number(c.ressources?.[id]) || 0));
  function depenser(c, id, n = 1) { c.ressources = c.ressources || {}; c.ressources[id] = (Number(c.ressources[id]) || 0) + n; }

  // --- Créer et remettre en état ---
  // Un personnage : les choix de la création (ou la fiche d'un pré-tiré).
  //   { creature, nom, origine, classe, niveau, carac, competences, expertises, sorts, equipement, pv_niveaux }
  function depuis(jeu, f) {
    const c = {
      creature: f.creature, heros: true, jdr: true, nom: String(f.nom || ''), surnom: '', joueur: String(f.joueur || ''),
      origine: f.origine || '', classe: f.classe || '', niveau: B.borne(Math.round(Number(f.niveau) || 1), 1, niveauMax(jeu)), xp: 0,
      carac: Object.fromEntries(B.caracteristiques(jeu).map((k) => [k.id, B.borne(Math.round(Number(f.carac?.[k.id]) || 10), 1, 30)])),
      competences: [...new Set((f.competences || []).filter((x) => typeof x === 'string'))],
      expertises: [...new Set((f.expertises || []).filter((x) => typeof x === 'string'))],
      pv: 0, pv_temp: 0, pv_niveaux: Array.isArray(f.pv_niveaux) ? f.pv_niveaux.map((x) => Number(x) || 0) : [], des_vie: 0,
      equipement: { arme: '', seconde: '', armure: '' }, sorts: [...new Set((f.sorts || []).filter((x) => typeof x === 'string'))],
      emplacements: {}, pacte: 0, ressources: {}, etats: [], mort: { succes: 0, echecs: 0 }, stable: false, mort_definitive: false, inspiration: false, notes: '',
    };
    for (const [place] of PLACES) {
      const o = objet(jeu, f.equipement?.[place]);
      if (o && (placeDe(o) === place || (place === 'seconde' && arme(o)))) c.equipement[place] = o.id;
    }
    c.xp = xpPour(c.niveau);
    c.pv = pvMax(jeu, c);
    c.des_vie = c.niveau;
    return c;
  }
  // Un pré-tiré : le personnage `id` de personnages.json et sa fiche (personnage.jdr).
  function creer(jeu, id, niveau = 0) {
    const p = jeu.personnages.get(id);
    if (!p) return null;
    const f = p.jdr || {};
    return depuis(jeu, { ...f, creature: id, nom: p.heros ? '' : p.nom, niveau: Number(niveau) || Number(f.niveau) || Number(B.regles(jeu).creation.niveau_depart) || 1 });
  }
  // Un personnage lu d'une sauvegarde : complété, remis dans ses bornes. Une apparence supprimée dans
  // Tafl prend celle du héros (la fiche du joueur ne doit jamais disparaître).
  function completer(jeu, c) {
    if (!c || typeof c !== 'object') return null;
    if (!c.jdr) return c.creature && jeu.personnages.has(c.creature) ? creer(jeu, c.creature, c.niveau) : null;
    if (!jeu.personnages.has(c.creature)) c.creature = jeu.heros?.id || [...jeu.personnages.keys()][0] || c.creature;
    const n = depuis(jeu, c);
    Object.assign(c, {
      ...n, ...c,
      niveau: n.niveau, carac: n.carac, competences: n.competences, expertises: n.expertises, sorts: n.sorts,
      equipement: { ...n.equipement, ...Object.fromEntries(PLACES.map(([p]) => [p, typeof c.equipement?.[p] === 'string' ? c.equipement[p] : ''])) },
      emplacements: c.emplacements && typeof c.emplacements === 'object' ? c.emplacements : {},
      ressources: c.ressources && typeof c.ressources === 'object' ? c.ressources : {},
      etats: Array.isArray(c.etats) ? c.etats.filter((x) => typeof x === 'string') : [],
      mort: { succes: B.borne(Number(c.mort?.succes) || 0, 0, 3), echecs: B.borne(Number(c.mort?.echecs) || 0, 0, 3) },
      pv_niveaux: n.pv_niveaux,
    });
    c.xp = Math.max(Number(c.xp) || 0, xpPour(c.niveau));
    c.pv = B.borne(Math.round(Number(c.pv) || 0), 0, pvMax(jeu, c));
    c.pv_temp = Math.max(0, Math.round(Number(c.pv_temp) || 0));
    c.des_vie = B.borne(Math.round(Number(c.des_vie ?? c.niveau)), 0, c.niveau);
    c.pacte = Math.max(0, Number(c.pacte) || 0);
    return c;
  }
  // Repos long (et soin complet : auberge, défaite) : tout revient.
  function reposLong(jeu, c) {
    c.pv = pvMax(jeu, c);
    c.pv_temp = 0;
    c.des_vie = Math.min(c.niveau, (Number(c.des_vie) || 0) + Math.max(1, Math.floor(c.niveau / 2)));
    c.emplacements = {};
    c.pacte = 0;
    c.ressources = {};
    c.etats = (c.etats || []).filter((e) => e === 'epuisement');
    c.mort = { succes: 0, echecs: 0 };
    c.stable = false;
    c.mort_definitive = false;
  }
  function soigner(jeu, c) { reposLong(jeu, c); c.des_vie = c.niveau; }
  // Repos court : les ressources « court » et le pacte de l'occultiste reviennent ; les dés de vie se
  // dépensent ailleurs (hors-combat.js, avec les dés à l'écran).
  function reposCourt(jeu, c) {
    for (const id of Object.keys(c.ressources || {})) if (RESSOURCES[id]?.repos === 'court') delete c.ressources[id];
    if (lanceur(jeu, c)?.type === 'occultiste') c.pacte = 0;
  }

  // --- Monter de niveau ---
  const peutMonter = (jeu, c) => c.niveau < niveauMax(jeu) && c.xp >= xpPour(c.niveau + 1);
  // Le niveau suivant, avec les PV gagnés (sans la Con). Rend les aptitudes nouvelles.
  function monter(jeu, c, gainPv) {
    const avant = aptitudes(jeu, c).map((x) => x.nom);
    const pvAvant = pvMax(jeu, c);
    c.niveau++;
    c.pv_niveaux = [...(c.pv_niveaux || []).slice(0, c.niveau - 2), Math.max(1, Math.round(gainPv))];
    c.xp = Math.max(c.xp, xpPour(c.niveau));
    if (c.pv > 0) c.pv += pvMax(jeu, c) - pvAvant;
    c.des_vie = Math.min(c.niveau, (Number(c.des_vie) || 0) + 1);
    return aptitudes(jeu, c).filter((x) => !avant.includes(x.nom));
  }

  // Les états d'un personnage hors combat (empoisonné…) et ceux qui le rendent incapable.
  const effetsEtats = (jeu, ids) => new Set(ids.flatMap((id) => B.trouver(jeu, 'etats', id)?.effets || []));

  return {
    PLACES, RESSOURCES, perso, classe, origine, objet, niveauMax, xpPour, nom, apparence, portrait,
    carac, modCarac, pb, sauvegardes, maitriseSauvegarde, bonusSauvegarde, caracDe, estCompetence, competencesMaitrisees, bonusCompetence, perceptionPassive,
    aptitudes, a, palier, deVie, pvMax, arme, armure, maitrises, maitriseArme, ca, initiative, vitesse, attaques, placeDe, peutMettre, equiper,
    lanceur, caracMagie, ddSorts, attaqueSorts, emplacements, restants, niveauSortMax, nombreSorts, sort, sortsDeClasse, sortsConnus,
    ressources, resteRessource, depenser, depuis, creer, completer, reposLong, reposCourt, soigner, peutMonter, monter, effetsEtats,
  };
})();
