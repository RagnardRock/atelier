// Les calculs du module « survivor » (Saga 1.30) : des fonctions pures, sans écran ni partie à changer.
//
//   definitions(donnees)            → { reglages, armes, passifs, arenes, ennemis } : ce que le jeu décrit (bornés),
//                                     avec les armes et passifs d'exemple si le jeu n'en a pas
//   arenePour(d, idCarte)           → l'arène jouée sur cette carte, ou null
//   xpPour(d, niveau)               → l'expérience qu'il faut pour passer de `niveau` à `niveau + 1`
//   gagnerXp(d, run, n)             → combien de niveaux sont gagnés (run.xp, run.niveau changent)
//   effetsPassifs(d, passifs)       → { puissance, recharge, zone, vitesse_proj, duree, nombre, aimant, vitesse,
//                                       armure, regen, croissance } : ce que font les passifs pris
//   statsArme(d, id, niveau, eff)   → les statistiques d'une arme à ce niveau, avec les passifs
//   tirerChoix(d, run, hasard)      → [choix] : ce que le joueur peut prendre en montant de niveau
//   prendre(d, run, choix)          → la partie en cours prend ce choix (une arme, un niveau, un passif)
//   vagues(arene, temps)            → [{ ennemi, par_minute, max, k }] : ce qui apparaît à cette seconde
//   bossA(arene, avant, apres)      → [{ ennemi, nombre }] : les boss dont la minute tombe entre les deux
//   pvEnnemi(arene, def, temps)     → ses PV, renforcés avec le temps
//   degats(n, defense)              → les dégâts d'une arme sur un ennemi (au moins 1)
//
// Une partie (run) : { arene, temps, niveau, xp, armes: { id: niveau }, passifs: { id: niveau }, tues, fin }.
// Elle n'est pas sauvegardée : une partie de survivor dure quelques minutes, sur une seule carte.

const SurvivorCalcul = (() => {
  const tableau = (v) => (Array.isArray(v) ? v : []);
  const nombre = (v, d, min = -Infinity, max = Infinity) => { const n = Number(v); return v !== '' && v !== null && v !== undefined && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };
  const entier = (v, d, min, max) => Math.round(nombre(v, d, min, max));
  const texte = (v, max = 300) => (typeof v === 'string' ? v.slice(0, max) : '');
  const couleur = (v, d) => (/^#[0-9a-f]{6}$/i.test(v || '') ? v : d);
  const ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;

  // Les sortes d'armes : comment elles frappent. Le reste (dégâts, nombre, recharge…) est réglé dans Tafl.
  const SORTES = ['projectile', 'direction', 'orbite', 'aura', 'eclair', 'fouet', 'onde'];
  // Ce qu'un passif peut faire (valeur : par niveau).
  const EFFETS = ['puissance', 'recharge', 'zone', 'vitesse_proj', 'duree', 'nombre', 'aimant', 'vitesse', 'armure', 'regen', 'croissance'];
  // Ce qu'un niveau d'arme peut ajouter.
  const GAINS = ['degats', 'nombre', 'recharge', 'taille', 'percee', 'duree', 'vitesse', 'portee'];

  // Les armes et passifs d'exemple : le module marche tout de suite, même sans rien créer dans Tafl.
  const ARMES_EXEMPLE = [
    { id: 'dague', nom: 'Dague', description: 'Lancée vers l\'ennemi le plus proche.', sorte: 'projectile', couleur: '#e8eef8', degats: 6, recharge: 1, nombre: 1, vitesse: 10, portee: 9, taille: 1, percee: 1, duree: 0,
      niveaux: [{ texte: 'Une dague de plus.', nombre: 1 }, { texte: 'Dégâts +3.', degats: 3 }, { texte: 'Une dague de plus.', nombre: 1 }, { texte: 'Traverse un ennemi de plus.', percee: 1 }, { texte: 'Recharge −20 %.', recharge: 20 }, { texte: 'Deux dagues de plus.', nombre: 2 }, { texte: 'Dégâts +5.', degats: 5 }] },
    { id: 'hache', nom: 'Hache tournoyante', description: 'Tourne autour de toi.', sorte: 'orbite', couleur: '#d0a050', degats: 8, recharge: 3, nombre: 1, vitesse: 3, portee: 1.8, taille: 1, percee: 0, duree: 3,
      niveaux: [{ texte: 'Une hache de plus.', nombre: 1 }, { texte: 'Dure 1 s de plus.', duree: 1 }, { texte: 'Dégâts +4.', degats: 4 }, { texte: 'Une hache de plus.', nombre: 1 }, { texte: 'Plus grande (+25 %).', taille: 25 }, { texte: 'Tourne plus vite (+30 %).', vitesse: 30 }, { texte: 'Une hache de plus, dégâts +4.', nombre: 1, degats: 4 }] },
    { id: 'ail', nom: 'Aura d\'ail', description: 'Blesse les ennemis tout près de toi.', sorte: 'aura', couleur: '#b8f0a0', degats: 3, recharge: 0.8, nombre: 1, vitesse: 0, portee: 1.6, taille: 1, percee: 0, duree: 0,
      niveaux: [{ texte: 'Plus large (+20 %).', taille: 20 }, { texte: 'Dégâts +2.', degats: 2 }, { texte: 'Frappe plus souvent (−15 %).', recharge: 15 }, { texte: 'Plus large (+20 %).', taille: 20 }, { texte: 'Dégâts +2.', degats: 2 }, { texte: 'Plus large (+20 %), dégâts +2.', taille: 20, degats: 2 }] },
    { id: 'foudre', nom: 'Foudre', description: 'Frappe des ennemis au hasard, à l\'écran.', sorte: 'eclair', couleur: '#9ad8ff', degats: 12, recharge: 3, nombre: 2, vitesse: 0, portee: 0.8, taille: 1, percee: 0, duree: 0,
      niveaux: [{ texte: 'Un éclair de plus.', nombre: 1 }, { texte: 'Dégâts +6.', degats: 6 }, { texte: 'Un éclair de plus.', nombre: 1 }, { texte: 'Plus large (+30 %).', taille: 30 }, { texte: 'Recharge −20 %.', recharge: 20 }, { texte: 'Deux éclairs de plus.', nombre: 2 }] },
    { id: 'fouet', nom: 'Fouet', description: 'Claque à gauche et à droite.', sorte: 'fouet', couleur: '#f0f0f0', degats: 10, recharge: 1.4, nombre: 1, vitesse: 0, portee: 2.6, taille: 1, percee: 0, duree: 0,
      niveaux: [{ texte: 'Claque des deux côtés.', nombre: 1 }, { texte: 'Dégâts +5.', degats: 5 }, { texte: 'Plus long (+20 %).', taille: 20 }, { texte: 'Recharge −15 %.', recharge: 15 }, { texte: 'Dégâts +5.', degats: 5 }, { texte: 'Plus long (+20 %), dégâts +5.', taille: 20, degats: 5 }] },
  ];
  const PASSIFS_EXEMPLE = [
    { id: 'epinard', nom: 'Épinard', description: 'Dégâts +10 % par niveau.', effet: 'puissance', valeur: 10, niveau_max: 5 },
    { id: 'tome', nom: 'Grimoire', description: 'Recharge −8 % par niveau.', effet: 'recharge', valeur: 8, niveau_max: 5 },
    { id: 'chandelle', nom: 'Chandelle', description: 'Zone +10 % par niveau.', effet: 'zone', valeur: 10, niveau_max: 5 },
    { id: 'aile', nom: 'Aile', description: 'Vitesse +10 % par niveau.', effet: 'vitesse', valeur: 10, niveau_max: 5 },
    { id: 'aimant', nom: 'Aimant', description: 'Ramasse de plus loin (+30 % par niveau).', effet: 'aimant', valeur: 30, niveau_max: 5 },
    { id: 'armure', nom: 'Armure', description: '1 dégât de moins par coup reçu, par niveau.', effet: 'armure', valeur: 1, niveau_max: 3 },
    { id: 'duplicateur', nom: 'Duplicateur', description: 'Un projectile de plus par arme, par niveau.', effet: 'nombre', valeur: 1, niveau_max: 2 },
    { id: 'couronne', nom: 'Couronne', description: 'Expérience +8 % par niveau.', effet: 'croissance', valeur: 8, niveau_max: 5 },
  ];

  // --- Les réglages du module (modules_reglages.survivor), bornés ---
  function reglages(r) {
    const g = r && typeof r === 'object' ? r : {};
    return {
      arme_depart: ID.test(g.arme_depart || '') ? g.arme_depart : '',
      choix: entier(g.choix, 3, 1, 5),
      armes_max: entier(g.armes_max, 6, 1, 12),
      passifs_max: entier(g.passifs_max, 6, 0, 12),
      xp_base: entier(g.xp_base, 5, 1, 100000),
      xp_pas: entier(g.xp_pas, 8, 0, 100000),
      aimant: nombre(g.aimant, 1.5, 0.3, 20),           // cases
      ennemis_max: entier(g.ennemis_max, 300, 10, 1500),
      soin_choix: entier(g.soin_choix, 4, 0, 999),        // PV quand il n'y a plus rien à prendre
      coeur_chance: nombre(g.coeur_chance, 1, 0, 100),   // % par ennemi vaincu
      degats_visibles: g.degats_visibles !== false,
      texte_victoire: texte(g.texte_victoire, 120) || 'Tu as survécu !',
      texte_defaite: texte(g.texte_defaite, 120) || 'Tu es tombé…',
    };
  }

  const gains = (n) => {
    const o = { texte: texte(n?.texte, 120) };
    for (const k of GAINS) { const v = nombre(n?.[k], 0, -999, 9999); if (v) o[k] = v; }
    return o;
  };
  function arme(a, i) {
    return {
      id: ID.test(a?.id || '') ? a.id : `arme-${i + 1}`,
      nom: texte(a?.nom, 60) || a?.id || `Arme ${i + 1}`,
      description: texte(a?.description),
      icone: texte(a?.icone, 100000),
      sorte: SORTES.includes(a?.sorte) ? a.sorte : 'projectile',
      couleur: couleur(a?.couleur, '#e8eef8'),
      degats: nombre(a?.degats, 5, 0, 99999),
      recharge: nombre(a?.recharge, 1, 0.1, 60),
      nombre: entier(a?.nombre, 1, 1, 30),
      vitesse: nombre(a?.vitesse, 8, 0, 60),
      portee: nombre(a?.portee, 8, 0.2, 40),
      taille: nombre(a?.taille, 1, 0.2, 10),
      percee: entier(a?.percee, 1, 0, 99),
      duree: nombre(a?.duree, 0, 0, 60),
      poids: entier(a?.poids, 10, 1, 1000),
      verrouillee: Boolean(a?.verrouillee),
      niveaux: tableau(a?.niveaux).slice(0, 15).map(gains),
    };
  }
  function passif(p, i) {
    return {
      id: ID.test(p?.id || '') ? p.id : `passif-${i + 1}`,
      nom: texte(p?.nom, 60) || p?.id || `Passif ${i + 1}`,
      description: texte(p?.description),
      icone: texte(p?.icone, 100000),
      effet: EFFETS.includes(p?.effet) ? p.effet : 'puissance',
      valeur: nombre(p?.valeur, 10, -90, 9999),
      niveau_max: entier(p?.niveau_max, 5, 1, 15),
      poids: entier(p?.poids, 10, 1, 1000),
    };
  }
  // Une arène : une carte où une partie de survivor se joue, ses vagues et ses boss.
  function arene(a, i) {
    return {
      id: ID.test(a?.id || '') ? a.id : `arene-${i + 1}`,
      nom: texte(a?.nom, 60) || a?.id || `Arène ${i + 1}`,
      carte: texte(a?.carte, 100),
      duree: entier(a?.duree, 10, 1, 120),                  // minutes
      fin: a?.fin === 'boss' ? 'boss' : 'temps',            // 'temps' : survivre ; 'boss' : vaincre le boss final
      boss_final: texte(a?.boss_final, 64),
      renfort: nombre(a?.renfort, 10, 0, 1000),             // % de PV en plus par minute
      depart: a?.depart && Number.isFinite(Number(a.depart.x)) ? { x: entier(a.depart.x, 0, 0, 255), y: entier(a.depart.y, 0, 0, 255) } : null,
      retour: a?.retour && typeof a.retour.carte === 'string' && a.retour.carte ? { carte: a.retour.carte, x: entier(a.retour.x, 0, 0, 255), y: entier(a.retour.y, 0, 0, 255), direction: texte(a.retour.direction, 10) || 'bas' } : null,
      vagues: tableau(a?.vagues).slice(0, 60).filter((v) => v && v.ennemi).map((v) => ({
        ennemi: String(v.ennemi), de: nombre(v.de, 0, 0, 120), a: nombre(v.a, 0, 0, 120),
        par_minute: nombre(v.par_minute, 30, 0, 3000), max: entier(v.max, 0, 0, 1500), groupe: entier(v.groupe, 1, 1, 50),
      })),
      boss: tableau(a?.boss).slice(0, 30).filter((b) => b && b.ennemi).map((b) => ({ ennemi: String(b.ennemi), minute: nombre(b.minute, 5, 0, 120), nombre: entier(b.nombre, 1, 1, 20) })),
    };
  }
  // Un ennemi des données du pack action (ennemis.json), seulement ce dont la horde a besoin.
  function ennemi(e) {
    return {
      id: String(e.id), nom: texte(e.nom, 60) || String(e.id), personnage: texte(e.personnage, 100), couleur: couleur(e.couleur, '#9b59d0'),
      pv: nombre(e.pv, 3, 1, 999999), defense: nombre(e.defense, 0, 0, 9999), vitesse: nombre(e.vitesse, 2.5, 0, 20),
      xp: nombre(e.xp, 1, 0, 999999), poids: nombre(e.poids, 1, 0.1, 10), boss: Boolean(e.boss),
    };
  }

  function definitions(donnees) {
    const R = donnees?.reglages?.reglages || {};
    const reg = reglages(R.modules_reglages?.survivor);
    const listeArmes = tableau(donnees?.armes?.armes);
    const listePassifs = tableau(donnees?.passifs?.passifs);
    const armes = new Map((listeArmes.length ? listeArmes : ARMES_EXEMPLE).map((a, i) => arme(a, i)).map((a) => [a.id, a]));
    const passifs = new Map((listeArmes.length ? listePassifs : PASSIFS_EXEMPLE).map((p, i) => passif(p, i)).map((p) => [p.id, p]));
    const arenes = new Map(tableau(donnees?.arenes?.arenes).map((a, i) => arene(a, i)).map((a) => [a.id, a]));
    const ennemis = new Map(tableau(donnees?.ennemis?.ennemis).filter((e) => e && e.id).map((e) => [String(e.id), ennemi(e)]));
    if (!armes.has(reg.arme_depart)) reg.arme_depart = [...armes.values()].find((a) => !a.verrouillee)?.id || [...armes.keys()][0] || '';
    return { reglages: reg, armes, passifs, arenes, ennemis };
  }
  const arenePour = (d, idCarte) => [...d.arenes.values()].find((a) => a.carte === idCarte) || null;

  // --- L'expérience ---
  const xpPour = (d, niveau) => d.reglages.xp_base + d.reglages.xp_pas * Math.max(0, niveau - 1);
  function gagnerXp(d, run, n) {
    run.xp += Math.max(0, n);
    let gagnes = 0;
    while (run.xp >= xpPour(d, run.niveau) && gagnes < 50) { run.xp -= xpPour(d, run.niveau); run.niveau++; gagnes++; }
    return gagnes;
  }

  // --- Les passifs et les armes ---
  function effetsPassifs(d, passifs = {}) {
    const e = Object.fromEntries(EFFETS.map((k) => [k, 0]));
    for (const [id, n] of Object.entries(passifs || {})) {
      const p = d.passifs.get(id);
      if (p && n > 0) e[p.effet] += p.valeur * Math.min(n, p.niveau_max);
    }
    return e;
  }
  function statsArme(d, id, niveau, eff = effetsPassifs(d)) {
    const a = d.armes.get(id);
    if (!a) return null;
    const s = { id: a.id, nom: a.nom, sorte: a.sorte, couleur: a.couleur, degats: a.degats, recharge: a.recharge, nombre: a.nombre, vitesse: a.vitesse, portee: a.portee, taille: a.taille, percee: a.percee, duree: a.duree };
    let accel = 0, grand = 0, rapide = 0;
    for (const g of a.niveaux.slice(0, Math.max(0, niveau - 1))) {
      s.degats += g.degats || 0; s.nombre += g.nombre || 0; s.percee += g.percee || 0; s.duree += g.duree || 0; s.portee += g.portee || 0;
      accel += g.recharge || 0; grand += g.taille || 0; rapide += g.vitesse || 0;
    }
    s.degats *= 1 + eff.puissance / 100;
    s.recharge = Math.max(0.08, s.recharge * Math.max(0.15, 1 - accel / 100) * Math.max(0.2, 1 - eff.recharge / 100));
    s.taille *= Math.max(0.2, 1 + (grand + eff.zone) / 100);
    s.vitesse *= Math.max(0.2, 1 + (rapide + eff.vitesse_proj) / 100);
    s.duree *= Math.max(0.2, 1 + eff.duree / 100);
    // Un passif « nombre » ajoute un projectile (ou une hache, un éclair) ; l'aura reste une seule zone.
    if (a.sorte !== 'aura') s.nombre = Math.min(40, s.nombre + Math.round(eff.nombre));
    s.niveau = niveau;
    s.niveauMax = a.niveaux.length + 1;
    return s;
  }
  const niveauMaxArme = (a) => a.niveaux.length + 1;

  // Les choix d'une montée de niveau : les armes et passifs déjà pris à monter, et de nouveaux s'il reste de
  // la place. Tirés selon leur poids, sans doublon. Plus rien à prendre : un soin.
  function tirerChoix(d, run, hasard = Math.random) {
    const r = d.reglages, out = [];
    const nArmes = Object.keys(run.armes).length, nPassifs = Object.keys(run.passifs).length;
    for (const a of d.armes.values()) {
      const n = run.armes[a.id] || 0;
      if (n && n < niveauMaxArme(a)) out.push({ sorte: 'arme', id: a.id, niveau: n + 1, poids: a.poids * 1.3 });
      else if (!n && !a.verrouillee && nArmes < r.armes_max) out.push({ sorte: 'arme', id: a.id, niveau: 1, nouveau: true, poids: a.poids });
    }
    for (const p of d.passifs.values()) {
      const n = run.passifs[p.id] || 0;
      if (n && n < p.niveau_max) out.push({ sorte: 'passif', id: p.id, niveau: n + 1, poids: p.poids });
      else if (!n && nPassifs < r.passifs_max) out.push({ sorte: 'passif', id: p.id, niveau: 1, nouveau: true, poids: p.poids * 0.8 });
    }
    const tires = [];
    while (tires.length < r.choix && out.length) {
      const total = out.reduce((s, c) => s + c.poids, 0);
      let x = hasard() * total, k = 0;
      while (k < out.length - 1 && x >= out[k].poids) { x -= out[k].poids; k++; }
      const [c] = out.splice(k, 1);
      delete c.poids;
      tires.push(c);
    }
    if (!tires.length) tires.push({ sorte: 'soin', pv: r.soin_choix });
    return tires;
  }
  // Ce qu'un choix dit au joueur : { texte, detail, etiquette, icone }.
  function decrire(d, c) {
    if (c.sorte === 'soin') return { texte: 'Repas chaud', detail: `Rend ${c.pv} PV.`, etiquette: '', icone: '' };
    const def = c.sorte === 'arme' ? d.armes.get(c.id) : d.passifs.get(c.id);
    if (!def) return { texte: c.id, detail: '', etiquette: '', icone: '' };
    const gain = c.sorte === 'arme' && c.niveau > 1 ? def.niveaux[c.niveau - 2]?.texte : '';
    return { texte: def.nom, detail: c.nouveau ? def.description || (c.sorte === 'arme' ? 'Nouvelle arme.' : 'Nouveau passif.') : gain || def.description, etiquette: c.nouveau ? 'Nouveau !' : `Niv. ${c.niveau}`, icone: def.icone };
  }
  function prendre(d, run, c) {
    if (!c) return false;
    if (c.sorte === 'arme' && d.armes.has(c.id)) { run.armes[c.id] = Math.min(niveauMaxArme(d.armes.get(c.id)), c.niveau || (run.armes[c.id] || 0) + 1); return true; }
    if (c.sorte === 'passif' && d.passifs.has(c.id)) { run.passifs[c.id] = Math.min(d.passifs.get(c.id).niveau_max, c.niveau || (run.passifs[c.id] || 0) + 1); return true; }
    return c.sorte === 'soin';
  }
  function nouvelleRun(d, a) {
    const run = { arene: a.id, temps: 0, niveau: 1, xp: 0, armes: {}, passifs: {}, tues: 0, fin: null, bossFinal: false };
    if (d.reglages.arme_depart) run.armes[d.reglages.arme_depart] = 1;
    return run;
  }

  // --- Les vagues ---
  // Les lignes de vague actives à `temps` (secondes). « a » 0 : jusqu'à la fin de l'arène.
  function vagues(a, temps) {
    const m = temps / 60;
    return a.vagues.map((v, k) => ({ ...v, k })).filter((v) => m >= v.de && (v.a <= 0 || m < v.a));
  }
  function bossA(a, avant, apres) {
    return a.boss.filter((b) => b.minute * 60 > avant - 1e-9 && b.minute * 60 <= apres + 1e-9 && !(b.minute === 0 && avant > 0));
  }
  const pvEnnemi = (a, def, temps) => Math.max(1, Math.round(def.pv * (1 + (a.renfort / 100) * (temps / 60))));
  const degats = (n, defense) => Math.max(1, Math.round(n - (defense || 0)));
  const chrono = (s) => { const t = Math.max(0, Math.floor(s)); return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };

  return { SORTES, EFFETS, GAINS, ARMES_EXEMPLE, PASSIFS_EXEMPLE, reglages, arme, passif, arene, definitions, arenePour, xpPour, gagnerXp, effetsPassifs, statsArme, niveauMaxArme, tirerChoix, decrire, prendre, nouvelleRun, vagues, bossA, pvEnnemi, degats, chrono };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SurvivorCalcul;
