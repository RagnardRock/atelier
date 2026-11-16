// Le mode table (Saga 0.14) : l'état de la table et ce que chacun a le droit d'en voir.
//
// C'est le cœur « hôte » du mode table : tout l'état vit ici (dans partie.table, gardé dans la
// sauvegarde), et chaque écran ne reçoit qu'une VUE filtrée pour son rôle. Aujourd'hui il y a deux
// écrans sur la même machine (celui du MJ et la fenêtre des joueurs) ; avec le multijoueur, chaque ami
// recevra sa vue de la même façon, et rien de caché ne sortira jamais de l'hôte.
//
// Un rôle : { mj: true } (tout voir), ou { mj: false, perso } : un joueur (perso : l'id du personnage
// qu'il joue, ou null pour l'écran partagé des joueurs, qui ne voit que ce qui est montré à tous).
//
// « Visible par » (Tafl 0.33, sur les événements, les zones-pièces et les rencontres) :
//   'tous'          tout le monde ;
//   'mj'            le MJ seulement ;
//   'perso:<id>'    le MJ et le joueur de ce personnage (personnages.json).
//
// partie.table :
//   { version, pions: [{ id, sorte: 'heros'|'monstre', carte, x, y, direction, nom, visible, ... }],
//     cartes: { <id>: { brouillard: true|false|null, pieces: { <zone>: visible }, cases: { <index>: 1|0 } } } }
// Les pions des héros suivent l'équipe (c.pion) ; ceux des monstres viennent d'une rencontre posée sur
// la table par le MJ, ou d'un combat lancé par un événement.

const TableEtat = (() => {
  const G = typeof TableGrille !== 'undefined' ? TableGrille : require('./grille.js');
  const O = typeof TableOutils !== 'undefined' ? TableOutils : require('./outils.js');

  // Les réglages du mode table, dans les règles maison du pack JDR (Tafl › Réglages › Règles du jeu).
  function reglages(jeu) {
    const r = jeu.donnees?.reglages?.reglages?.jdr || {};
    const caseM = Number(r.case_m);
    return {
      caseM: caseM > 0 && caseM <= 30 ? caseM : 1.5,
      diagonales: r.diagonales === 'alternees' ? 'alternees' : 'simple',
      jetsCaches: Boolean(r.jets_mj_caches),
      // Tafl 1.0 : ce qu'un joueur voit des PV des AUTRES héros ('exacts' ou 'etat').
      pvAutres: jeu.donnees?.reglages?.reglages?.multijoueur?.pv_autres === 'etat' ? 'etat' : 'exacts',
    };
  }

  const VISIBLES = ['tous', 'mj'];
  const normVisible = (v, def = 'tous') => (VISIBLES.includes(v) || /^perso:./.test(String(v || '')) ? v : def);
  function visiblePour(v, role) {
    if (role.mj) return true;
    v = normVisible(v);
    if (v === 'tous') return true;
    if (v === 'mj') return false;
    return Boolean(role.perso) && v === `perso:${role.perso}`;
  }
  // Ce héros est-il celui de ce rôle ? Saga 1.21.2 : par son pion quand on le connaît (deux héros créés
  // peuvent emprunter la même apparence), sinon par son personnage.
  const estMien = (role, c) => Boolean(c) && (role.heros ? c.pion === role.heros : Boolean(role.perso) && c.creature === role.perso);

  // Saga 1.42 : l'apparence d'un pion (son jeton) : une image importée par le MJ, ou un personnage du jeu
  // (son sprite de Tafl : directions, marche). Sans jeton : l'apparence du héros, l'image du monstre.
  const IMAGE_JETON = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
  const imageJetonValide = (v) => typeof v === 'string' && v.length <= 600000 && IMAGE_JETON.test(v);
  function idJeton(v) { let h = 2166136261; for (let i = 0; i < v.length; i += 7) h = Math.imul(h ^ v.charCodeAt(i), 16777619); return `jeton-${(h >>> 0).toString(36)}${v.length.toString(36)}`; }
  function preparer(jeu, partie) {
    const t = partie.table && typeof partie.table === 'object' ? partie.table : {};
    t.version = 1;
    t.pions = (Array.isArray(t.pions) ? t.pions : []).filter((p) => p && typeof p.id === 'string');
    t.cartes = t.cartes && typeof t.cartes === 'object' ? t.cartes : {};
    t.pause = Boolean(t.pause);
    // Saga 1.32 : les macros du MJ ([{ nom, formule }]).
    t.macros = Array.isArray(t.macros) ? t.macros.filter((m) => m && m.nom && m.formule) : [];
    // Saga 1.42 : les images des jetons ({ id: data: URL }), partagées par les pions qui les portent.
    t.jetons = Object.fromEntries(Object.entries(t.jetons && typeof t.jetons === 'object' ? t.jetons : {}).filter(([k, v]) => /^jeton-[a-z0-9]+$/.test(k) && imageJetonValide(v)).slice(0, 200));
    // Saga 1.43 : l'initiative tenue à la main par le MJ (hors des combats de Saga) : { liste, actif, tour }.
    t.initiative = normInitiative(t.initiative);
    for (const p of t.pions) if (p.jeton && !(p.jeton.personnage ? typeof p.jeton.personnage === 'string' : t.jetons[p.jeton.image])) delete p.jeton;
    // Saga 1.34 : la campagne ({ nom, fond }) : son nom et le fond des compagnons.
    // Saga 1.38 : et ce qui la fait durer d'une séance à l'autre (table/campagne.js) : son identité sur le relais
    // (id, secret, code), les téléphones reliés, les clés du coffre des joueurs, les changements proposés hors séance.
    const c = t.campagne && typeof t.campagne === 'object' ? t.campagne : {};
    t.campagne = {
      nom: String(c.nom || '').slice(0, 60),
      fond: /^data:image\/(png|jpeg|webp);base64,/.test(String(c.fond || '')) ? c.fond : '',
      id: /^[A-Za-z0-9_-]{16,32}$/.test(String(c.id || '')) ? c.id : '',
      secret: String(c.secret || '').length >= 20 ? String(c.secret).slice(0, 100) : '',
      code: /^[A-Z]{4}-[A-Z]{4}$/.test(String(c.code || '')) ? c.code : '',
      telephones: Array.isArray(c.telephones) ? c.telephones.filter((x) => x && typeof x.jeton === 'string').slice(0, 60) : [],
      cles: c.cles && typeof c.cles === 'object' && !Array.isArray(c.cles) ? c.cles : {},
      propositions: Array.isArray(c.propositions) ? c.propositions.filter((p) => p && p.nom && p.id).slice(-200) : [],
      auto: Boolean(c.auto),
      depot: Number(c.depot) || 0,
    };
    partie.table = t;
    return t;
  }
  function etatCarte(table, idCarte) {
    if (!table.cartes[idCarte]) table.cartes[idCarte] = { brouillard: null, pieces: {}, cases: {} };
    const c = table.cartes[idCarte];
    c.pieces = c.pieces || {};
    c.cases = c.cases || {};
    // Saga 1.32 : les gabarits de zone posés sur cette carte (vus de tous).
    if (!Array.isArray(c.gabarits)) c.gabarits = [];
    // Saga 1.43 : les dessins au feutre et les notes ; visible 'mj' : le calque du MJ (lui seul).
    if (!Array.isArray(c.dessins)) c.dessins = [];
    if (!Array.isArray(c.notes)) c.notes = [];
    return c;
  }

  // --- Les pièces et le brouillard ---
  const pieces = (carte) => carte.zones.filter((z) => z.piece);
  const dansZone = (z, x, y) => x >= z.x && y >= z.y && x < z.x + z.largeur && y < z.y + z.hauteur;
  // Le brouillard est mis sur une carte qui a des pièces ; le MJ peut l'ôter ou le mettre à la main.
  function brouillard(table, carte) {
    const b = etatCarte(table, carte.id).brouillard;
    return typeof b === 'boolean' ? b : pieces(carte).length > 0;
  }
  // Qui voit cette pièce maintenant : ce que le MJ a choisi, sinon ce qu'écrit Tafl (cachée par défaut).
  const visibilitePiece = (table, carte, z) => normVisible(etatCarte(table, carte.id).pieces[z.id], normVisible(z.visible_par, 'mj'));
  // Le masque d'un rôle : 1 = la case se voit, 0 = dans le brouillard. Le MJ reçoit celui des joueurs
  // (pour savoir ce qu'ils voient), mais lui voit tout.
  function masque(table, carte, role) {
    const n = carte.largeur * carte.hauteur;
    const out = new Uint8Array(n);
    if (!brouillard(table, carte)) { out.fill(1); return out; }
    const ec = etatCarte(table, carte.id);
    const ps = pieces(carte).filter((z) => visiblePour(visibilitePiece(table, carte, z), role));
    for (const z of ps) {
      for (let y = Math.max(0, z.y); y < Math.min(carte.hauteur, z.y + z.hauteur); y++) {
        for (let x = Math.max(0, z.x); x < Math.min(carte.largeur, z.x + z.largeur); x++) out[y * carte.largeur + x] = 1;
      }
    }
    for (const [i, v] of Object.entries(ec.cases)) if (Number(i) >= 0 && Number(i) < n) out[Number(i)] = v ? 1 : 0;
    // Là où se tient un héros, son joueur voit au moins sa case.
    for (const p of table.pions) if (p.sorte === 'heros' && p.carte === carte.id && G.libre(carte, p.x, p.y)) out[p.y * carte.largeur + p.x] = 1;
    return out;
  }

  // --- Les pions ---
  const pionsSur = (table, idCarte) => table.pions.filter((p) => p.carte === idCarte);
  const occupee = (table, idCarte, x, y, sauf = null) => table.pions.some((p) => p !== sauf && p.carte === idCarte && !p.vaincu && p.x === x && p.y === y);
  // La case libre la plus proche de (x, y) (en spirale), pour poser un pion.
  function caseLibre(table, carte, x, y, prises = [], presents = []) {
    const ok = (cx, cy) => G.libre(carte, cx, cy) && !occupee(table, carte.id, cx, cy) && !prises.some((c) => c.x === cx && c.y === cy) && !presents.some((p) => p.bloque && p.x === cx && p.y === cy);
    for (let r = 0; r < Math.max(carte.largeur, carte.hauteur); r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (ok(x + dx, y + dy)) return { x: x + dx, y: y + dy };
      }
    }
    return { x, y };
  }
  // Les héros de l'équipe sur la table : un pion chacun, autour de (x, y) s'il n'en a pas sur cette carte.
  // Les pions des héros partis du groupe s'en vont.
  function placerHeros(table, partie, carte, x, y, presents = []) {
    const membres = partie.equipe.filter((c) => c && c.jdr);
    let n = table.pions.filter((p) => p.sorte === 'heros').length;
    for (const c of membres) if (!c.pion) c.pion = `h-${Date.now().toString(36)}-${n++}`;
    const ids = new Set(membres.map((c) => c.pion));
    table.pions = table.pions.filter((p) => p.sorte !== 'heros' || ids.has(p.id));
    for (const c of membres) {
      let p = table.pions.find((q) => q.id === c.pion);
      if (p && p.carte === carte.id) continue;
      const pos = caseLibre(table, carte, x, y, [], presents);
      if (!p) { p = { id: c.pion, sorte: 'heros', direction: 'haut', visible: 'tous' }; table.pions.push(p); }
      Object.assign(p, { carte: carte.id, x: pos.x, y: pos.y });
    }
  }
  const membreDe = (partie, pion) => partie.equipe.find((c) => c.pion === pion.id) || null;

  // Une rencontre (groupes.json) posée sur la table : un pion par monstre, autour de (x, y).
  function poserGroupe(jeu, table, carte, groupe, x, y, presents = []) {
    const g = (jeu.donnees.groupes?.groupes || []).find((q) => q.id === groupe);
    if (!g) return [];
    const monstres = jeu.donnees.monstres_jdr?.monstres_jdr || [];
    const out = [];
    const marque = Date.now().toString(36);
    let k = 0;
    for (const x0 of g.monstres || []) {
      const m = monstres.find((q) => q.id === x0.monstre);
      if (!m) continue;
      for (let i = 0; i < Math.max(1, Math.min(9, Math.round(Number(x0.nombre) || 1))); i++) {
        const pos = caseLibre(table, carte, x, y, [], presents);
        const pv = Math.max(1, Number(m.pv) || 4);
        const p = { id: `m-${marque}-${k++}`, sorte: 'monstre', monstre: m.id, groupe: g.id, nom: m.nom || m.id, carte: carte.id, x: pos.x, y: pos.y, direction: 'bas', visible: normVisible(g.visible_par, 'tous'), pv, pvMax: pv };
        table.pions.push(p);
        out.push(p);
      }
    }
    return out;
  }

  // --- Ce que voit un rôle ---
  function sante(pv, pvMax) {
    if (pv <= 0) return 'vaincu';
    if (pv >= pvMax) return 'indemne';
    return pv > pvMax / 2 ? 'blessé' : 'en sang';
  }
  // ctx : { carte, presents (les événements de la carte), combat ({ ordre, actif, tour }), scene, journal }
  function vue(jeu, partie, role, ctx) {
    const table = partie.table, carte = ctx.carte;
    const mj = Boolean(role.mj);
    const pourJoueurs = { mj: false, perso: role.perso || null };
    const m = masque(table, carte, mj ? pourJoueurs : role);
    const voitCase = (x, y) => mj || m[y * carte.largeur + x] === 1;
    const pions = [];
    const dispo = O.marquesDispo(jeu);
    for (const p of pionsSur(table, carte.id)) {
      if (p.vaincu && p.sorte !== 'heros') continue;
      const montre = p.sorte === 'heros' || (visiblePour(p.visible, role) && voitCase(p.x, p.y));
      if (!montre) continue;
      const v = { id: p.id, sorte: p.sorte, x: p.x, y: p.y, direction: p.direction || 'bas', nom: p.nom || '' };
      if (p.jeton) v.jeton = p.jeton.personnage ? { personnage: p.jeton.personnage } : { image: p.jeton.image };
      // Saga 1.32 : les marques posées à la main, puis (pour un héros) ses états des règles.
      const ids = [...(Array.isArray(p.marques) ? p.marques : [])];
      if (p.sorte === 'heros') for (const e of membreDe(partie, p)?.etats || []) if (!ids.includes(e)) ids.push(e);
      if (ids.length) v.marques = ids.map((id) => dispo.find((m) => m.id === id)).filter(Boolean).map((m, i) => ({ id: m.id, nom: m.nom, couleur: O.couleurMarque(m, i) }));
      if (p.sorte === 'heros') {
        const c = membreDe(partie, p);
        if (!c) continue;
        const pvMax = ctx.pvMaxHeros?.(c) || c.pvMax || c.pv;
        Object.assign(v, { nom: ctx.nomHeros?.(c) || c.nom || c.creature, personnage: c.creature || '', pv: Math.max(0, c.pv), pvMax, ko: c.pv <= 0, joueur: c.joueur || '' });
        // Les PV des autres héros : exacts, ou seulement leur état, selon le réglage du jeu (Tafl 1.0).
        if (!mj && reglages(jeu).pvAutres === 'etat' && !estMien(role, c)) {
          delete v.pv; delete v.pvMax;
          v.sante = sante(Math.max(0, c.pv), Math.max(1, pvMax));
        }
      } else {
        Object.assign(v, { monstre: p.monstre, sante: sante(p.pv, p.pvMax), ko: p.pv <= 0 });
        if (mj) Object.assign(v, { pv: p.pv, pvMax: p.pvMax });
      }
      if (mj) { v.visible = normVisible(p.visible); v.cache = p.sorte !== 'heros' && !(visiblePour(p.visible, pourJoueurs) && m[p.y * carte.largeur + p.x] === 1); }
      pions.push(v);
    }
    const pnj = [];
    for (const q of ctx.presents || []) {
      if (!q.visible) continue;
      const vis = normVisible(q.ev.visible_par);
      if (!(visiblePour(vis, role) && voitCase(q.x, q.y))) continue;
      const v = { id: `ev:${q.ev.id}`, x: q.x, y: q.y, direction: q.direction, tuile: q.tuile, personnage: q.perso?.id || q.ev.apparence?.personnage || '', obstacle: q.ev.obstacle?.sorte || '' };
      if (mj) { v.nom = q.ev.nom || q.ev.id; v.visible = vis; v.cache = !(visiblePour(vis, pourJoueurs) && m[q.y * carte.largeur + q.x] === 1); }
      pnj.push(v);
    }
    const ids = new Set(pions.map((p) => p.id));
    const combat = ctx.combat ? {
      tour: ctx.combat.tour,
      // L'ordre du tour : ceux qu'on ne voit pas n'y sont pas (un monstre caché ne se trahit pas).
      // Saga 1.44 : fait : a déjà joué ce tour ; libre : le MJ choisit qui agit.
      ordre: ctx.combat.ordre.filter((o) => ids.has(o.id)).map((o) => ({ id: o.id, nom: o.nom, ...(mj ? { init: o.init } : {}), ...(Array.isArray(ctx.combat.attente) && ctx.combat.attente.length && !ctx.combat.attente.includes(o.id) && o.id !== ctx.combat.actif ? { fait: true } : {}) })),
      actif: ids.has(ctx.combat.actif) ? ctx.combat.actif : '',
      reste: ctx.combat.reste ?? null,
      libre: Boolean(ctx.combat.libre),
    } : null;
    // Un jet secret d'un joueur (/gr) : le MJ et lui seul le voient.
    const journal = (partie.jdr?.journal || []).filter((l) => mj || !l.cache || (l.voit && l.voit === role.heros)).slice(-30);
    const out = {
      v: 1, role: mj ? 'mj' : role.perso ? `perso:${role.perso}` : 'joueurs',
      carte: carte.id, nom: carte.nom, largeur: carte.largeur, hauteur: carte.hauteur,
      brouillard: brouillard(table, carte), masque: Array.from(m).join(''),
      pions, pnj, combat, journal, pause: Boolean(table.pause),
      initiative: combat ? null : vueInitiative(table, ids, mj),
      scene: ctx.scene && visiblePour(ctx.scene.visible || 'tous', role) ? { qui: ctx.scene.qui || '', texte: ctx.scene.texte || '', ...(Array.isArray(ctx.scene.choix) ? { choix: ctx.scene.choix.map(String) } : {}) } : null,
      caseM: reglages(jeu).caseM, diagonales: reglages(jeu).diagonales,
      // Saga 1.32 : les gabarits (tout le monde les voit), les pings récents.
      gabarits: etatCarte(table, carte.id).gabarits.map((g) => ({ ...g, mien: mj || g.auteur === auteur(role) })),
      dessins: etatCarte(table, carte.id).dessins.filter((d) => mj || d.visible === 'tous').map((d) => ({ id: d.id, points: d.points, couleur: d.couleur, visible: d.visible, mien: mj || d.auteur === auteur(role) })),
      notes: etatCarte(table, carte.id).notes.filter((n) => mj || n.visible === 'tous').map((n) => ({ id: n.id, x: n.x, y: n.y, texte: n.texte, couleur: n.couleur, visible: n.visible, mien: mj || n.auteur === auteur(role) })),
      pings: (ctx.pings || []).filter((q) => q.carte === carte.id).map(({ n, x, y, qui, couleur }) => ({ n, x, y, qui, couleur })),
      marques: dispo,
    };
    // Saga 1.32 : les macros (celles de mon héros, ou celles du MJ).
    if (mj) out.macros = table.macros;
    else {
      const c = partie.equipe.find((q) => q?.jdr && estMien(role, q));
      // Saga 1.34 : chaque macro du héros porte aussi sa formule calculée (« 1d20+@force » → « 1d20+3 »).
      if (c) {
        const refs = typeof TableOutils !== 'undefined' ? TableOutils.refsHeros(jeu, c) : null;
        out.macros = (Array.isArray(c.macros) ? c.macros : []).map((m) => {
          const r = refs && /@/.test(m.formule) ? TableOutils.remplacer(m.formule, refs) : null;
          return r?.formule ? { ...m, calcul: r.formule } : m;
        });
      }
    }
    // Saga 1.0 : le joueur d'un héros reçoit sa fiche (lui seul), pour la lire et lancer ses jets.
    if (!mj && role.perso && ctx.ficheDe) out.fiche = ctx.ficheDe(role);
    if (!mj && role.heros) out.moi = role.heros;
    if (mj) out.pieces = pieces(carte).map((z) => ({ id: z.id, nom: z.nom || z.id, x: z.x, y: z.y, largeur: z.largeur, hauteur: z.hauteur, visible: visibilitePiece(table, carte, z) }));
    return out;
  }

  // --- Les actions (ce qu'un écran demande ; l'hôte vérifie que ce rôle en a le droit) ---
  // Rend { ok: true } ou { ok: false, erreur }.
  // Saga 1.43 : les actions du MJ sur l'initiative à la main.
  //   init_ajouter { pion?, nom?, init } · init_retirer { id } · init_valeur { id, init } · init_monter { id, sens: -1|1 }
  //   init_trier · init_suivant · init_precedent · init_vider
  //   Saga 1.44 : init_placer { id, index } (glisser) · init_retarder { id } · init_agir { id } · init_libre { valeur }
  function agirInitiative(table, a, non) {
    const t = table.initiative = normInitiative(table.initiative);
    const l = t.liste;
    const i = l.findIndex((x) => x.id === a.id);
    const ordonner = () => l.sort((x, y) => y.init - x.init);
    switch (a.type) {
      case 'init_ajouter': {
        if (l.length >= 60) return non('L\'initiative est pleine.');
        const p = typeof a.pion === 'string' ? table.pions.find((q) => q.id === a.pion) : null;
        if (a.pion && !p) return non('Pion inconnu.');
        if (p && l.some((x) => x.pion === p.id)) return non('Ce pion est déjà dans l\'initiative.');
        const nom = String(a.nom || p?.nom || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 40);
        if (!nom) return non('Une ligne a un nom.');
        const init = Math.round(Number(a.init) || 0);
        const ligne = { id: `i-${Date.now().toString(36)}-${l.length}`, nom, init, ...(p ? { pion: p.id } : {}) };
        // À sa place : après ceux qui ont autant ou plus (l'ordre déjà réglé à la main ne bouge pas).
        const k = l.findIndex((x) => x.init < init);
        l.splice(k < 0 ? l.length : k, 0, ligne);
        if (!t.actif) t.actif = l[0].id;
        return { ok: true, ligne };
      }
      case 'init_retirer': {
        if (i < 0) return non('Ligne inconnue.');
        if (t.actif === l[i].id) t.actif = l.length > 1 ? l[(i + 1) % l.length].id : '';
        l.splice(i, 1);
        return { ok: true };
      }
      case 'init_valeur': {
        if (i < 0) return non('Ligne inconnue.');
        l[i].init = Math.round(Number(a.init) || 0);
        if (a.trier !== false) ordonner();
        return { ok: true };
      }
      case 'init_monter': {
        const j = i + (Number(a.sens) < 0 ? -1 : 1);
        if (i < 0 || j < 0 || j >= l.length) return non('Rien à déplacer.');
        [l[i], l[j]] = [l[j], l[i]];
        return { ok: true };
      }
      case 'init_trier': ordonner(); return { ok: true };
      case 'init_placer': {
        if (i < 0) return non('Ligne inconnue.');
        const [x] = l.splice(i, 1);
        l.splice(Math.max(0, Math.min(l.length, Math.round(Number(a.index) || 0))), 0, x);
        return { ok: true };
      }
      case 'init_retarder': {
        // Il attend : on passe sans lui ; « Agir maintenant » le remet dans l'ordre, là où il agit.
        if (i < 0) return non('Ligne inconnue.');
        l[i].attend = true;
        if (t.actif === l[i].id) return agirInitiative(table, { type: 'init_suivant' }, non);
        return { ok: true };
      }
      case 'init_agir': {
        // Il agit tout de suite : sa ligne se place là où l'on en est (en ordre libre, elle ne bouge pas).
        if (i < 0) return non('Ligne inconnue.');
        const x = l[i];
        delete x.attend;
        if (!t.libre) {
          const k = l.findIndex((q) => q.id === t.actif);
          if (k >= 0 && k !== i) { l.splice(i, 1); l.splice(l.findIndex((q) => q.id === t.actif), 0, x); }
        }
        t.actif = x.id;
        return { ok: true, tourDe: x };
      }
      case 'init_libre': t.libre = Boolean(a.valeur); return { ok: true };
      case 'init_suivant':
      case 'init_precedent': {
        if (!l.length) return non('L\'initiative est vide.');
        // Ceux qui attendent (retardés) sont passés ; s'ils attendent tous, on avance quand même.
        const pret = (x) => !x.attend || l.every((q) => q.attend);
        let k = l.findIndex((x) => x.id === t.actif);
        const pas = a.type === 'init_suivant' ? 1 : -1;
        for (let n = 0; n < l.length; n++) {
          k += pas;
          if (k >= l.length) { k = 0; t.tour += 1; }
          if (k < 0) { if (t.tour > 1) { t.tour -= 1; k = l.length - 1; } else { k = 0; break; } }
          if (pret(l[k])) break;
        }
        t.actif = l[k].id;
        const x = l.find((q) => q.id === t.actif);
        return { ok: true, tourDe: x };
      }
      case 'init_vider': table.initiative = { liste: [], actif: '', tour: 1 }; return { ok: true };
      default: return non('Action inconnue.');
    }
  }

  // Saga 1.43 : une ligne : { id, nom, init, pion? } (un pion de la table, ou une ligne libre : « Le piège »).
  function normInitiative(x) {
    const liste = (Array.isArray(x?.liste) ? x.liste : []).filter((l) => l && typeof l.id === 'string').slice(0, 60)
      .map((l) => ({ id: l.id, nom: String(l.nom || '?').slice(0, 40), init: Number.isFinite(Number(l.init)) ? Math.round(Number(l.init)) : 0, ...(typeof l.pion === 'string' && l.pion ? { pion: l.pion } : {}), ...(l.attend ? { attend: true } : {}) }));
    return { liste, actif: liste.some((l) => l.id === x?.actif) ? x.actif : '', tour: Math.max(1, Math.round(Number(x?.tour) || 1)), libre: Boolean(x?.libre) };
  }
  // Ce que voit un rôle de l'initiative à la main : les pions qu'il voit, et les lignes libres.
  function vueInitiative(table, ids, mj) {
    const t = table.initiative;
    if (!t?.liste?.length) return null;
    const l = t.liste.filter((x) => !x.pion || ids.has(x.pion));
    const actif = l.find((x) => x.id === t.actif);
    return { manuel: true, libre: t.libre, tour: t.tour, actif: actif ? actif.pion || actif.id : '', ordre: l.map((x) => ({ id: x.pion || x.id, ligne: x.id, nom: x.nom, ...(mj ? { init: x.init } : {}), ...(x.attend ? { attend: true } : {}) })) };
  }

  function agir(jeu, partie, role, a, ctx) {
    const table = partie.table, carte = ctx.carte;
    const non = (erreur) => ({ ok: false, erreur });
    const pion = typeof a.pion === 'string' ? table.pions.find((p) => p.id === a.pion) : null;
    switch (a.type) {
      // Un joueur lance un jet de SON personnage (caractéristique, sauvegarde ou compétence) : c'est
      // l'hôte qui lance, et la ligne va au journal, vue de tous.
      case 'jet': {
        if (!role.mj && !role.perso) return non('Les spectateurs ne lancent pas de dés.');
        return { ok: true, jet: { perso: role.mj ? String(a.perso || '') : role.perso, heros: role.mj ? '' : role.heros || '', quoi: String(a.quoi || ''), sorte: a.sorte === 'sauvegarde' ? 'sauvegarde' : 'test', id: String(a.id || '') } };
      }
      case 'deplacer': {
        if (!pion || pion.carte !== carte.id) return non('Ce pion n\'est pas sur cette carte.');
        if (!role.mj) {
          if (pion.sorte !== 'heros') return non('Un joueur ne déplace que son héros.');
          const c = membreDe(partie, pion);
          if (role.perso && !estMien(role, c)) return non('Ce n\'est pas ton héros.');
          if (ctx.combat) return non('Pendant un combat, on se déplace à son tour.');
          if (table.pause) return non('La partie est en pause.');
        }
        const x = Math.round(Number(a.x)), y = Math.round(Number(a.y));
        if (!G.libre(carte, x, y)) return non('Case bloquée.');
        if (occupee(table, carte.id, x, y, pion) || (ctx.presents || []).some((q) => q.bloque && q.x === x && q.y === y)) return non('Case occupée.');
        if (!role.mj || a.chemin) {
          const r = reglages(jeu);
          const ch = G.chemin(carte, pion, { x, y }, { diagonales: r.diagonales, occupe: (cx, cy) => occupee(table, carte.id, cx, cy, pion) || (ctx.presents || []).some((q) => q.bloque && q.x === cx && q.y === cy) });
          if (!ch) return non('Pas de chemin jusque-là.');
        }
        if (x !== pion.x || y !== pion.y) pion.direction = Math.abs(x - pion.x) >= Math.abs(y - pion.y) ? (x > pion.x ? 'droite' : 'gauche') : (y > pion.y ? 'bas' : 'haut');
        pion.x = x; pion.y = y;
        return { ok: true, pion };
      }
      // --- Saga 1.32 : les outils de la séance ---
      case 'ping': {
        const x = Math.round(Number(a.x)), y = Math.round(Number(a.y));
        if (!(x >= 0 && y >= 0 && x < carte.largeur && y < carte.hauteur)) return non('Hors de la carte.');
        return { ok: true, ping: { carte: carte.id, x, y } };
      }
      case 'gabarit': {
        if (role.spectateur) return non('Les spectateurs ne posent pas de gabarit.');
        const l = etatCarte(table, carte.id).gabarits;
        if (l.filter((g) => g.auteur === auteur(role)).length >= 12) return non('Pas plus de 12 gabarits chacun : efface les anciens.');
        const g = { id: `g-${Date.now().toString(36)}-${l.length}`, ...O.normGabarit(a, carte), auteur: auteur(role) };
        l.push(g);
        return { ok: true, gabarit: g };
      }
      case 'dessin':
      case 'note': {
        if (role.spectateur) return non('Les spectateurs ne dessinent pas.');
        const ec = etatCarte(table, carte.id);
        const l = a.type === 'dessin' ? ec.dessins : ec.notes;
        if (l.filter((d) => d.auteur === auteur(role)).length >= (a.type === 'dessin' ? 60 : 40)) return non('C\'est plein : efface tes anciens dessins ou notes.');
        const couleur = O.COULEURS.some(([c]) => c === a.couleur) ? a.couleur : 'jaune';
        const visible = role.mj && a.visible === 'mj' ? 'mj' : 'tous';
        const id = `${a.type === 'dessin' ? 'd' : 'n'}-${Date.now().toString(36)}-${l.length}`;
        if (a.type === 'dessin') {
          const pts = (Array.isArray(a.points) ? a.points : []).slice(0, 400)
            .map((p) => [Number(p?.[0]), Number(p?.[1])]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
            .map(([x, y]) => [Math.round(Math.max(0, Math.min(carte.largeur, x)) * 100) / 100, Math.round(Math.max(0, Math.min(carte.hauteur, y)) * 100) / 100]);
          if (!pts.length) return non('Un dessin vide.');
          l.push({ id, points: pts, couleur, visible, auteur: auteur(role) });
        } else {
          const texte = String(a.texte || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 120);
          const x = Math.round(Number(a.x)), y = Math.round(Number(a.y));
          if (!texte) return non('Une note a un texte.');
          if (!(x >= 0 && y >= 0 && x < carte.largeur && y < carte.hauteur)) return non('Hors de la carte.');
          l.push({ id, x, y, texte, couleur, visible, auteur: auteur(role) });
        }
        return { ok: true };
      }
      case 'dessin_retirer': {
        // Un dessin ou une note (id) ; sans id : tous les miens (le MJ : tous ceux de la carte, ou d'un calque).
        const ec = etatCarte(table, carte.id);
        const avant = ec.dessins.length + ec.notes.length;
        const peut = (d) => (role.mj || d.auteur === auteur(role)) && (!a.calque || d.visible === a.calque);
        ec.dessins = ec.dessins.filter((d) => !(peut(d) && (!a.id || d.id === a.id)));
        ec.notes = ec.notes.filter((d) => !(peut(d) && (!a.id || d.id === a.id)));
        return ec.dessins.length + ec.notes.length < avant ? { ok: true } : non('Rien à toi à effacer ici.');
      }
      case 'gabarit_retirer': {
        const ec = etatCarte(table, carte.id);
        const avant = ec.gabarits.length;
        // Sans id : tous les miens (le MJ : tous ceux de la carte).
        const peut = (g) => role.mj || g.auteur === auteur(role);
        ec.gabarits = ec.gabarits.filter((g) => !(peut(g) && (!a.id || g.id === a.id)));
        return ec.gabarits.length < avant ? { ok: true } : non('Aucun gabarit à toi ici.');
      }
      case 'marque': {
        if (!pion) return non('Pion inconnu.');
        if (!role.mj) {
          if (pion.sorte !== 'heros' || !estMien(role, membreDe(partie, pion))) return non('Tu ne marques que ton héros.');
        }
        const id = String(a.id || '');
        if (!O.marquesDispo(jeu).some((m) => m.id === id)) return non('Marque inconnue.');
        const l = Array.isArray(pion.marques) ? pion.marques : [];
        pion.marques = a.valeur === false || (a.valeur === undefined && l.includes(id)) ? l.filter((x) => x !== id) : [...new Set([...l, id])];
        return { ok: true };
      }
      case 'macro_ajouter':
      case 'macro_retirer': {
        const c = role.mj ? null : partie.equipe.find((q) => q?.jdr && estMien(role, q));
        if (!role.mj && !c) return non('Il te faut un héros pour garder des macros.');
        const l = role.mj ? table.macros : (c.macros = Array.isArray(c.macros) ? c.macros : []);
        if (a.type === 'macro_retirer') {
          const k = Math.round(Number(a.k));
          if (!(k >= 0 && k < l.length)) return non('Macro inconnue.');
          l.splice(k, 1);
          return { ok: true };
        }
        const nom = String(a.nom || '').trim().slice(0, 30), formule = String(a.formule || '').trim().slice(0, 80);
        if (!nom || !formule) return non('Une macro a un nom et une formule.');
        if (l.length >= 20) return non('Pas plus de 20 macros.');
        const k = l.findIndex((m) => m.nom.toLowerCase() === nom.toLowerCase());
        if (k >= 0) l[k] = { nom, formule }; else l.push({ nom, formule });
        return { ok: true };
      }
      default:
        break;
    }
    // Le reste est au MJ seulement.
    if (!role.mj) return non('Seul le MJ peut faire ça.');
    if (/^init_/.test(a.type)) return agirInitiative(table, a, non);
    switch (a.type) {
      case 'jeton': {
        if (!pion) return non('Pion inconnu.');
        if (a.personnage) {
          if (!jeu.personnages?.get?.(String(a.personnage))) return non('Personnage inconnu.');
          pion.jeton = { personnage: String(a.personnage) };
        } else if (a.image) {
          if (!imageJetonValide(a.image)) return non('Image trop grande ou illisible (PNG, JPEG ou WebP).');
          const id = idJeton(a.image);
          table.jetons[id] = a.image;
          pion.jeton = { image: id };
        } else delete pion.jeton;
        // Les images que plus aucun pion ne porte s'en vont.
        const portees = new Set(table.pions.map((q) => q.jeton?.image).filter(Boolean));
        for (const k of Object.keys(table.jetons)) if (!portees.has(k)) delete table.jetons[k];
        return { ok: true };
      }
      case 'visibilite': {
        const v = normVisible(a.visible, '');
        if (!v) return non('Visibilité inconnue.');
        if (pion) { pion.visible = v; return { ok: true }; }
        return non('Pion inconnu.');
      }
      case 'piece': {
        const z = pieces(carte).find((q) => q.id === a.piece);
        if (!z) return non('Pièce inconnue.');
        etatCarte(table, carte.id).pieces[z.id] = normVisible(a.visible, 'tous');
        return { ok: true };
      }
      case 'pinceau': {
        const ec = etatCarte(table, carte.id);
        for (const i of Array.isArray(a.cases) ? a.cases : []) {
          if (!(i >= 0 && i < carte.largeur * carte.hauteur)) continue;
          if (a.valeur === null) delete ec.cases[i]; else ec.cases[i] = a.valeur ? 1 : 0;
        }
        return { ok: true };
      }
      case 'brouillard':
        etatCarte(table, carte.id).brouillard = typeof a.valeur === 'boolean' ? a.valeur : null;
        return { ok: true };
      case 'tout_cacher':
        table.cartes[carte.id] = { brouillard: true, pieces: {}, cases: {} };
        return { ok: true };
      // Saga 1.44 : un pion de plus en pleine séance : un monstre du jeu (sa fiche), ou une image déposée sur le
      // plateau (un pion sans fiche : un nom, des PV, son image). Hors des rencontres : l'initiative à la main le compte.
      case 'pion_poser': {
        const x = Math.round(Number(a.x)), y = Math.round(Number(a.y));
        if (!(x >= 0 && y >= 0 && x < carte.largeur && y < carte.hauteur)) return non('Hors de la carte.');
        if (table.pions.length >= 300) return non('Trop de pions sur la table.');
        const m = a.monstre ? (jeu.donnees.monstres_jdr?.monstres_jdr || []).find((q) => q.id === a.monstre) : null;
        if (a.monstre && !m) return non('Monstre inconnu.');
        if (!m && !imageJetonValide(a.image)) return non('Image trop grande ou illisible (PNG, JPEG ou WebP).');
        const nom = String(a.nom || m?.nom || m?.id || 'Pion').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 40) || 'Pion';
        const pv = Math.max(1, Math.min(9999, Math.round(Number(a.pv) || Number(m?.pv) || 10)));
        const pos = caseLibre(table, carte, x, y, [], ctx.presents || []);
        const p = { id: `m-${Date.now().toString(36)}-${table.pions.length}`, sorte: 'monstre', monstre: m?.id || '', groupe: '', nom, carte: carte.id, x: pos.x, y: pos.y, direction: 'bas', visible: normVisible(a.visible, 'tous'), pv, pvMax: pv };
        if (a.image && imageJetonValide(a.image)) { const id = idJeton(a.image); table.jetons[id] = a.image; p.jeton = { image: id }; }
        table.pions.push(p);
        return { ok: true, pion: p };
      }
      case 'groupe': {
        const l = poserGroupe(jeu, table, carte, a.groupe, Math.round(Number(a.x) || 0), Math.round(Number(a.y) || 0), ctx.presents);
        return l.length ? { ok: true, pions: l } : non('Rencontre inconnue ou vide.');
      }
      case 'retirer':
        if (!pion || pion.sorte === 'heros') return non('On ne retire pas un héros.');
        table.pions = table.pions.filter((p) => p !== pion);
        return { ok: true };
      case 'pause':
        table.pause = Boolean(a.valeur);
        return { ok: true };
      default:
        return non(`Action inconnue : ${a.type}`);
    }
  }

  // Qui a posé un gabarit : 'mj', ou le pion du héros du joueur.
  const auteur = (role) => (role.mj ? 'mj' : role.heros || (role.perso ? `perso:${role.perso}` : 'joueurs'));

  return { auteur, reglages, normVisible, visiblePour, estMien, preparer, etatCarte, pieces, dansZone, brouillard, visibilitePiece, masque, pionsSur, occupee, caseLibre, placerHeros, membreDe, poserGroupe, sante, vue, agir };
})();

if (typeof module !== 'undefined') module.exports = TableEtat;
