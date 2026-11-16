// Saga 1.41 : les mécaniques d'un jeu JDR, réglées dans Tafl sans code (Réglages › Mécaniques).
//
// Elles vivent dans reglages.jdr.mecaniques et remplacent, quand elles sont actives, des morceaux des
// règles D&D 5e du pack :
//   defense     une formule qui remplace la CA comme seuil à atteindre (« couverture + esquive ») ;
//   absorption  une formule retirée des dégâts d'une attaque (« armure »), jamais sous degat_min ;
//   paliers     des seuils de santé en % des PV max : [{ nom, sous, malus, table, jets }]. Un héros est dans le
//               palier le plus bas dont il est sous le seuil ; malus s'ajoute à ses jets (attaques, tests,
//               sauvegardes) ; table : tirée une fois en y entrant (une blessure qui reste) ; jets : il fait
//               ses jets répétés à chaque tour de combat ;
//   tables      [{ id, nom, de, lignes: [{ min, max, texte, malus }] }] : des tables aléatoires ;
//   jets        { formule, seuil, reussites, echecs } : les jets répétés (assez de réussites : stabilisé ;
//               assez d'échecs : mort).
// Saga 1.41, la suite (l'éditeur de règles complet) :
//   resolution  { type, score, des, face, reussites, plein, partiel } : comment un jet réussit (tests,
//               sauvegardes, attaques). type 'd20' (la 5e, par défaut) ; 'd100' (réussi si le d100 fait au
//               plus le score : formule score) ; 'reserve' (une réserve de d6 : formule des, chaque dé à face
//               ou plus est une réussite, il en faut la formule reussites) ; '2d6' (2d6 + bonus : plein ou
//               plus, réussite ; partiel ou plus, réussite partielle). Les formules lisent bonus et dd en plus ;
//   parade      une formule : la cible d'un coup qui touche tente de le parer (un jet du système du jeu,
//               en d20 contre le total de l'attaque, sinon contre parade_dd) ;
//   localisation l'id d'une table tirée à chaque coup (la tête, le bras…) ; ses lignes ont un mult (% des dégâts) ;
//   initiative  { mode, de, bonus } : mode '' (la 5e), 'jet' (de + formule bonus), 'heros' ou 'monstres'
//               (un camp joue d'abord, sans jet) ;
//   repos       { court, long } : des formules, les PV rendus à chacun (long vide : tout revient) ;
//   niveau_pv   une formule : les PV gagnés à un niveau (elle lit de, jet, moyenne en plus) ;
//   etats       [{ id, malus, degats, soin, fin_de, fin_seuil }] : ce que fait un état du jeu en plus (un
//               malus aux jets, des dés de dégâts ou de soin à la fin de chaque tour, un jet pour en sortir).
// Les formules sont celles de la fiche du jeu (commun/fiche-perso.js) : elles lisent les champs de la
// fiche (couverture, armure…), les caractéristiques (dex, mod_dex), niveau, pv, pv_max, ca. Un monstre lit
// sa CA, ses PV et ses `champs` s'il en a ; une formule qu'il ne peut pas calculer lui laisse sa CA.
// Tout est pur à part le hasard (JdrDes) : l'état vit dans le membre (c.palier, c.blessures, c.jets).
const JdrMeca = (() => {
  const B = JdrBase, D = JdrDes;
  const JETS = { formule: '1d20', seuil: 10, reussites: 3, echecs: 3 };
  const TYPES = ['d20', 'd100', 'reserve', '2d6'];
  // Les formules par défaut d'un système : elles traduisent le bonus et le DD de la 5e (les données du pack
  // marchent tout de suite) ; un jeu les change pour lire ses propres champs (« competence », « reflexes »…).
  const RESOLUTION = { score: '(21 + bonus - dd) * 5', des: 'max(1, bonus)', face: 5, reussites: 'max(1, floor(dd / 5))', plein: '10', partiel: '7' };

  function de(jeu) {
    const m = jeu?.donnees?.reglages?.reglages?.jdr?.mecaniques;
    return m && m.active ? m : null;
  }
  const texte = (v, n = 200) => String(v ?? '').trim().slice(0, n);
  const entier = (v, d, min, max) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : d; };

  // Ce que Tafl enregistre (et ce que Saga lit) : toujours propre.
  function normaliser(m) {
    const x = m && typeof m === 'object' ? m : {};
    const tables = (Array.isArray(x.tables) ? x.tables : []).slice(0, 20).map((t, i) => ({
      id: texte(t?.id, 40) || `table_${i + 1}`, nom: texte(t?.nom, 60) || `Table ${i + 1}`, de: texte(t?.de, 20) || '1d6',
      lignes: (Array.isArray(t?.lignes) ? t.lignes : []).slice(0, 100).map((l) => ({
        min: entier(l?.min, 1, 0, 1000), max: entier(l?.max ?? l?.min, 1, 0, 1000), texte: texte(l?.texte, 200), malus: entier(l?.malus, 0, -20, 20), mult: entier(l?.mult, 100, 0, 500),
      })),
    }));
    return {
      active: x.active !== false,
      defense: texte(x.defense), absorption: texte(x.absorption), degat_min: entier(x.degat_min, 0, 0, 10),
      paliers: (Array.isArray(x.paliers) ? x.paliers : []).slice(0, 10).map((p) => ({
        nom: texte(p?.nom, 40) || 'Palier', sous: entier(p?.sous, 50, 0, 100), malus: entier(p?.malus, 0, -20, 20),
        table: texte(p?.table, 40), jets: Boolean(p?.jets),
      })).sort((a, b) => b.sous - a.sous),
      tables,
      jets: { formule: texte(x.jets?.formule, 40) || JETS.formule, seuil: entier(x.jets?.seuil, JETS.seuil, 0, 100), reussites: entier(x.jets?.reussites, JETS.reussites, 1, 10), echecs: entier(x.jets?.echecs, JETS.echecs, 1, 10) },
      resolution: {
        type: TYPES.includes(x.resolution?.type) ? x.resolution.type : 'd20',
        score: texte(x.resolution?.score) || RESOLUTION.score, des: texte(x.resolution?.des) || RESOLUTION.des,
        face: entier(x.resolution?.face, RESOLUTION.face, 2, 6), reussites: texte(x.resolution?.reussites) || RESOLUTION.reussites,
        plein: texte(x.resolution?.plein) || RESOLUTION.plein, partiel: texte(x.resolution?.partiel) || RESOLUTION.partiel,
      },
      parade: texte(x.parade), parade_dd: entier(x.parade_dd, 10, 0, 100), localisation: texte(x.localisation, 40),
      initiative: { mode: ['', 'jet', 'heros', 'monstres'].includes(x.initiative?.mode) ? x.initiative.mode : '', de: texte(x.initiative?.de, 20) || '1d20', bonus: texte(x.initiative?.bonus) },
      repos: { court: texte(x.repos?.court), long: texte(x.repos?.long) },
      niveau_pv: texte(x.niveau_pv),
      etats: (Array.isArray(x.etats) ? x.etats : []).filter((e) => e && texte(e.id, 40)).slice(0, 40).map((e) => ({
        id: texte(e.id, 40), malus: entier(e.malus, 0, -20, 20), degats: texte(e.degats, 20), soin: texte(e.soin, 20), fin_de: texte(e.fin_de, 20), fin_seuil: entier(e.fin_seuil, 0, 0, 100),
      })),
    };
  }
  const memo = new WeakMap();
  function meca(jeu) {
    const m = de(jeu);
    if (!m) return null;
    if (!memo.has(m)) memo.set(m, normaliser(m));
    return memo.get(m);
  }

  // Les noms que lisent les formules : ceux de la fiche du jeu pour un héros, sa CA et ses PV pour un monstre.
  function varsHeros(jeu, c) {
    const v = { niveau: Number(c.niveau) || 1, maitrise: JdrPerso.pb(c), pv: Math.max(0, Number(c.pv) || 0), pv_max: JdrPerso.pvMax(jeu, c), ca: JdrPerso.ca(jeu, c) };
    for (const k of B.caracteristiques(jeu)) { const n = JdrPerso.carac(jeu, c, k.id); v[k.id] = n; v[`mod_${k.id}`] = Math.floor((n - 10) / 2); }
    for (const x of JdrFiches.champs(jeu, c)) if (x.type !== 'texte') { v[x.id] = Number(x.valeur) || 0; if (x.max != null) v[`${x.id}_max`] = Number(x.max) || 0; }
    return v;
  }
  function varsMonstre(m, pv, pvMax) {
    const v = { niveau: Number(m.fp) || 0, maitrise: 2, pv: Math.max(0, Number(pv) || 0), pv_max: Number(pvMax) || 0, ca: Number(m.ca) || 10 };
    for (const [k, n] of Object.entries(m.carac || {})) { v[k] = Number(n) || 10; v[`mod_${k}`] = Math.floor(((Number(n) || 10) - 10) / 2); }
    for (const [k, n] of Object.entries(m.champs || {})) if (/^[a-z_][a-z0-9_]*$/i.test(k)) v[k] = Number(n) || 0;
    return v;
  }
  // Une formule : son résultat, ou null si elle est vide ou ne se calcule pas avec ces noms.
  function calculer(formule, vars) {
    if (!formule || typeof FichePerso === 'undefined') return null;
    try { return FichePerso.calculer(formule, vars); } catch { return null; }
  }

  // La défense d'une cible (à la place de sa CA) et ce que son armure retire.
  const defense = (jeu, vars, ca) => { const m = meca(jeu); const v = m ? calculer(m.defense, vars) : null; return v == null ? ca : v; };
  const absorption = (jeu, vars) => { const m = meca(jeu); return Math.max(0, (m ? calculer(m.absorption, vars) : 0) || 0); };
  const degatMin = (jeu) => meca(jeu)?.degat_min || 0;

  // Le palier de santé d'un héros (ou null : en forme).
  function palier(jeu, pv, pvMax) {
    const m = meca(jeu);
    if (!m?.paliers.length || !(pvMax > 0)) return null;
    const pc = (Math.max(0, pv) / pvMax) * 100;
    let p = null;
    for (const x of m.paliers) if (pc < x.sous || (x.sous === 0 && pc <= 0)) p = x;
    return p;
  }
  // Le malus d'un héros à ses jets : son palier et ses blessures qui restent.
  // etats : ses états du combat (ids) ; hors combat, ceux qu'il garde (c.etats).
  function malus(jeu, c, etats = null) {
    if (!meca(jeu) || !c) return 0;
    const p = palier(jeu, Number(c.pv) || 0, JdrPerso.pvMax(jeu, c));
    const ids = etats || (Array.isArray(c.etats) ? c.etats : []);
    return (p?.malus || 0) + (Array.isArray(c.blessures) ? c.blessures.reduce((s, b) => s + (Number(b.malus) || 0), 0) : 0) + malusEtats(jeu, ids);
  }
  // Le malus des états (Mécaniques › États) : un monstre empoisonné vise moins bien, lui aussi.
  const etat = (jeu, id) => meca(jeu)?.etats.find((e) => e.id === id) || null;
  const malusEtats = (jeu, ids) => (meca(jeu) ? (ids || []).reduce((s, id) => s + (etat(jeu, id)?.malus || 0), 0) : 0);

  // --- Le système de résolution ---
  // Un jet du système du jeu, ou null en d20 (le pack garde alors ses jets de la 5e : avantage, 20 naturel,
  // règles maison). Rend { reussi, partiel, critique, fumble, des, total, bonus, formule, contre, mode }.
  const borne = (n, a, b) => Math.max(a, Math.min(b, n));
  function resoudre(jeu, partie, { bonus = 0, dd = 0, avantage = false, desavantage = false, vars = {} } = {}) {
    const r = meca(jeu)?.resolution;
    if (!r || r.type === 'd20') return null;
    const v = { ...vars, bonus: Number(bonus) || 0, dd: Number(dd) || 0 };
    const f = (formule, d) => { const n = calculer(formule, v); return n == null ? d : n; };
    const deux = avantage !== desavantage;
    const mode = deux ? (avantage ? 'avantage' : 'desavantage') : '';
    if (r.type === 'd100') {
      // Réussi si le d100 fait au plus le score ; avantage : deux d100, le plus bas compte.
      const score = borne(f(r.score, (21 + v.bonus - v.dd) * 5), 0, 100);
      const a = D.d(partie, 100), b = deux ? D.d(partie, 100) : null;
      const garde = b == null ? a : avantage ? Math.min(a, b) : Math.max(a, b);
      const des = [{ faces: 100, valeur: a, garde: a === garde }, ...(b == null ? [] : [{ faces: 100, valeur: b, garde: a !== garde }])];
      const reussi = garde <= score;
      return { reussi, partiel: false, critique: reussi && garde <= Math.max(1, Math.floor(score / 10)), fumble: !reussi && garde >= 96, des, total: garde, bonus: 0, formule: 'd100', contre: `≤ ${score}`, mode };
    }
    if (r.type === 'reserve') {
      // Une réserve de d6 : chaque dé à « face » ou plus est une réussite. Avantage : un dé de plus.
      const n = borne(f(r.des, Math.max(1, v.bonus)) + (avantage ? 1 : 0) - (desavantage ? 1 : 0), 1, 30);
      const besoin = Math.max(0, f(r.reussites, Math.max(1, Math.floor(v.dd / 5))));
      const des = Array.from({ length: n }, () => { const x = D.d(partie, 6); return { faces: 6, valeur: x, garde: x >= r.face }; });
      const succes = des.filter((x) => x.garde).length;
      const reussi = succes >= besoin;
      return { reussi, partiel: false, critique: reussi && besoin > 0 && succes >= besoin * 2, fumble: !succes && des.filter((x) => x.valeur === 1).length * 2 > n, des, total: succes, bonus: 0, formule: `${n}d6`, contre: `${besoin} réussite${besoin > 1 ? 's' : ''}`, mode };
    }
    // 2d6 + bonus, à paliers. Avantage : 3d6, les deux meilleurs comptent.
    const l = Array.from({ length: deux ? 3 : 2 }, () => D.d(partie, 6));
    const tries = [...l].map((x, i) => ({ x, i })).sort((a, b) => (avantage ? b.x - a.x : a.x - b.x));
    const gardes = new Set(tries.slice(0, 2).map((t) => t.i));
    const des = l.map((x, i) => ({ faces: 6, valeur: x, garde: gardes.has(i) }));
    const somme = des.filter((x) => x.garde).reduce((s, x) => s + x.valeur, 0);
    const total = somme + v.bonus;
    const plein = f(r.plein, 10), partiel = f(r.partiel, 7);
    const reussi = total >= Math.min(plein, partiel);
    const gv = des.filter((x) => x.garde).map((x) => x.valeur);
    return { reussi, partiel: reussi && total < plein, critique: gv.every((x) => x === 6), fumble: gv.every((x) => x === 1), des, total, bonus: v.bonus, formule: '2d6', contre: `${partiel} / ${plein}`, mode };
  }
  // Le résultat d'un jet pour le journal.
  const resultat = (j, { attaque = false } = {}) => (j.critique ? 'critique' : j.fumble && !j.reussi ? 'echec_critique' : j.partiel ? 'partiel' : j.reussi ? (attaque ? 'touche' : 'reussi') : (attaque ? 'manque' : 'rate'));

  // --- La parade, la localisation, l'initiative, les repos, les niveaux, les états ---
  const parade = (jeu, vars) => { const m = meca(jeu); return m?.parade ? calculer(m.parade, vars) : null; };
  // Le coup touche : où ? { texte, mult, jet } ou null.
  function localiser(jeu, partie) {
    const m = meca(jeu);
    if (!m?.localisation) return null;
    const t = tirer(jeu, partie, m.localisation);
    return t?.ligne ? { texte: t.ligne.texte, mult: t.ligne.mult ?? 100, jet: t.jet, table: t.table.nom } : null;
  }
  // L'initiative d'un combattant : { total, ligne } (mode 'jet'), ou null (la 5e, ou un camp d'abord).
  function initiative(jeu, partie, vars, dex) {
    const i = meca(jeu)?.initiative;
    if (!i || i.mode !== 'jet') return null;
    const r = D.lancer(partie, i.de);
    const b = i.bonus ? calculer(i.bonus, vars) : null;
    const bonus = b == null ? dex : b;
    return { total: r.total + bonus, des: r.des, formule: r.formule, bonus: r.bonus + bonus };
  }
  const ordreCamps = (jeu) => { const i = meca(jeu)?.initiative; return i?.mode === 'heros' || i?.mode === 'monstres' ? i.mode : ''; };
  // Les PV rendus par un repos (null : la règle du pack) ; ceux gagnés à un niveau.
  function pvRepos(jeu, c, sorte) {
    const m = meca(jeu), f = m?.repos?.[sorte];
    if (!f) return null;
    const n = calculer(f, varsHeros(jeu, c));
    return n == null ? null : Math.max(0, n);
  }
  function pvNiveau(jeu, c, { de, jet, moyenne }) {
    const m = meca(jeu);
    if (!m?.niveau_pv) return null;
    const n = calculer(m.niveau_pv, { ...varsHeros(jeu, c), de, jet, moyenne });
    return n == null ? null : Math.max(1, n);
  }
  // Tirer sur une table : { table, jet, ligne } (ligne : null si aucune ne couvre le résultat).
  function tirer(jeu, partie, id) {
    const t = meca(jeu)?.tables.find((x) => x.id === id);
    if (!t) return null;
    const r = D.lancer(partie, t.de);
    return { table: t, jet: r, ligne: t.lignes.find((l) => r.total >= l.min && r.total <= l.max) || null };
  }
  // Ce qui change quand la santé d'un héros bouge : { entre: palier | null, sort: bool, blessure } (le palier
  // où il entre en descendant, ce qu'il a tiré sur sa table). Le membre garde son palier (c.palier).
  function suivre(jeu, partie, c) {
    const m = meca(jeu);
    if (!m || !c) return null;
    const p = palier(jeu, Number(c.pv) || 0, JdrPerso.pvMax(jeu, c));
    const avant = c.palier || '';
    const maintenant = p?.nom || '';
    if (avant === maintenant) return null;
    const ordre = (nom) => (nom ? m.paliers.findIndex((x) => x.nom === nom) : -1);
    const descend = ordre(maintenant) > ordre(avant);
    c.palier = maintenant;
    if (!p?.jets) delete c.jets;
    if (!descend) return { entre: null, sort: true, palier: p };
    let blessure = null;
    if (p.table) {
      const t = tirer(jeu, partie, p.table);
      if (t?.ligne) {
        blessure = { nom: t.table.nom, texte: t.ligne.texte, malus: t.ligne.malus, jet: t.jet.total };
        c.blessures = [...(Array.isArray(c.blessures) ? c.blessures : []), { nom: t.table.nom, texte: t.ligne.texte, malus: t.ligne.malus }].slice(-20);
      } else if (t) blessure = { nom: t.table.nom, texte: '', malus: 0, jet: t.jet.total };
    }
    return { entre: p, sort: false, blessure };
  }
  // Au début d'un combat : le palier du héros, sans rien tirer (ses PV ont pu bouger hors combat : repos, soins).
  function caler(jeu, c) {
    if (!meca(jeu) || !c) return;
    const p = palier(jeu, Number(c.pv) || 0, JdrPerso.pvMax(jeu, c));
    c.palier = p?.nom || '';
    if (!p?.jets) delete c.jets;
  }
  // Le jet répété d'un héros (au début de son tour, dans un palier à jets) : { fini: 'stable' | 'mort' | '', ligne }.
  function jetRepete(jeu, partie, c, qui) {
    const m = meca(jeu);
    const j = m.jets;
    c.jets = c.jets && typeof c.jets === 'object' ? c.jets : { succes: 0, echecs: 0, stable: false };
    const r = D.lancer(partie, j.formule);
    const ok = r.total >= j.seuil;
    if (ok) c.jets.succes++; else c.jets.echecs++;
    const ligne = D.noter(partie, { qui, quoi: 'Jet pour tenir', formule: r.formule, des: r.des, bonus: r.bonus, total: r.total, contre: `${j.seuil}`, resultat: ok ? 'reussi' : 'rate' });
    let fini = '';
    if (c.jets.echecs >= j.echecs) fini = 'mort';
    else if (c.jets.succes >= j.reussites) { fini = 'stable'; c.jets.stable = true; }
    return { fini, ligne, succes: c.jets.succes, echecs: c.jets.echecs };
  }
  const doitJeter = (jeu, c) => { const p = palier(jeu, Number(c.pv) || 0, JdrPerso.pvMax(jeu, c)); return Boolean(p?.jets && !c.jets?.stable && !c.mort_definitive && (Number(c.pv) || 0) > 0); };
  // Un coup reçu remet les jets à zéro (il faut se stabiliser de nouveau).
  const touche = (c) => { if (c?.jets) c.jets = { succes: 0, echecs: 0, stable: false }; };

  // Les noms qu'une formule de mécanique peut lire (pour Tafl : vérifier les formules).
  function noms(jeu) {
    const n = new Set(['niveau', 'maitrise', 'pv', 'pv_max', 'ca']);
    for (const k of B.caracteristiques(jeu)) { n.add(k.id); n.add(`mod_${k.id}`); }
    for (const c of B.fiche(jeu)?.champs || []) if (c.type !== 'texte') { n.add(c.id); if (c.type === 'jauge') n.add(`${c.id}_max`); }
    return n;
  }

  return { JETS, TYPES, RESOLUTION, resoudre, resultat, parade, localiser, initiative, ordreCamps, pvRepos, pvNiveau, etat, malusEtats, de, meca, normaliser, varsHeros, varsMonstre, calculer, defense, absorption, degatMin, palier, malus, tirer, suivre, caler, jetRepete, doitJeter, touche, noms };
})();
