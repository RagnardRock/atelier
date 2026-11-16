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
// Les formules sont celles de la fiche du jeu (commun/fiche-perso.js) : elles lisent les champs de la
// fiche (couverture, armure…), les caractéristiques (dex, mod_dex), niveau, pv, pv_max, ca. Un monstre lit
// sa CA, ses PV et ses `champs` s'il en a ; une formule qu'il ne peut pas calculer lui laisse sa CA.
// Tout est pur à part le hasard (JdrDes) : l'état vit dans le membre (c.palier, c.blessures, c.jets).
const JdrMeca = (() => {
  const B = JdrBase, D = JdrDes;
  const JETS = { formule: '1d20', seuil: 10, reussites: 3, echecs: 3 };

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
        min: entier(l?.min, 1, 0, 1000), max: entier(l?.max ?? l?.min, 1, 0, 1000), texte: texte(l?.texte, 200), malus: entier(l?.malus, 0, -20, 20),
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
  function malus(jeu, c) {
    if (!meca(jeu) || !c) return 0;
    const p = palier(jeu, Number(c.pv) || 0, JdrPerso.pvMax(jeu, c));
    return (p?.malus || 0) + (Array.isArray(c.blessures) ? c.blessures.reduce((s, b) => s + (Number(b.malus) || 0), 0) : 0);
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

  return { JETS, de, meca, normaliser, varsHeros, varsMonstre, calculer, defense, absorption, degatMin, palier, malus, tirer, suivre, caler, jetRepete, doitJeter, touche, noms };
})();
