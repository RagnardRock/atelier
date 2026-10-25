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

  function preparer(jeu, partie) {
    const t = partie.table && typeof partie.table === 'object' ? partie.table : {};
    t.version = 1;
    t.pions = (Array.isArray(t.pions) ? t.pions : []).filter((p) => p && typeof p.id === 'string');
    t.cartes = t.cartes && typeof t.cartes === 'object' ? t.cartes : {};
    t.pause = Boolean(t.pause);
    partie.table = t;
    return t;
  }
  function etatCarte(table, idCarte) {
    if (!table.cartes[idCarte]) table.cartes[idCarte] = { brouillard: null, pieces: {}, cases: {} };
    const c = table.cartes[idCarte];
    c.pieces = c.pieces || {};
    c.cases = c.cases || {};
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
    for (const p of pionsSur(table, carte.id)) {
      if (p.vaincu && p.sorte !== 'heros') continue;
      const montre = p.sorte === 'heros' || (visiblePour(p.visible, role) && voitCase(p.x, p.y));
      if (!montre) continue;
      const v = { id: p.id, sorte: p.sorte, x: p.x, y: p.y, direction: p.direction || 'bas', nom: p.nom || '' };
      if (p.sorte === 'heros') {
        const c = membreDe(partie, p);
        if (!c) continue;
        const pvMax = ctx.pvMaxHeros?.(c) || c.pvMax || c.pv;
        Object.assign(v, { nom: ctx.nomHeros?.(c) || c.nom || c.creature, personnage: c.creature || '', pv: Math.max(0, c.pv), pvMax, ko: c.pv <= 0, joueur: c.joueur || '' });
        // Les PV des autres héros : exacts, ou seulement leur état, selon le réglage du jeu (Tafl 1.0).
        if (!mj && reglages(jeu).pvAutres === 'etat' && (!role.perso || role.perso !== c.creature)) {
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
      ordre: ctx.combat.ordre.filter((o) => ids.has(o.id)).map((o) => ({ id: o.id, nom: o.nom, ...(mj ? { init: o.init } : {}) })),
      actif: ids.has(ctx.combat.actif) ? ctx.combat.actif : '',
      reste: ctx.combat.reste ?? null,
    } : null;
    const journal = (partie.jdr?.journal || []).filter((l) => mj || !l.cache).slice(-30);
    const out = {
      v: 1, role: mj ? 'mj' : role.perso ? `perso:${role.perso}` : 'joueurs',
      carte: carte.id, nom: carte.nom, largeur: carte.largeur, hauteur: carte.hauteur,
      brouillard: brouillard(table, carte), masque: Array.from(m).join(''),
      pions, pnj, combat, journal, pause: Boolean(table.pause),
      scene: ctx.scene && visiblePour(ctx.scene.visible || 'tous', role) ? { qui: ctx.scene.qui || '', texte: ctx.scene.texte || '' } : null,
      caseM: reglages(jeu).caseM,
    };
    // Saga 1.0 : le joueur d'un héros reçoit sa fiche (lui seul), pour la lire et lancer ses jets.
    if (!mj && role.perso && ctx.ficheDe) out.fiche = ctx.ficheDe(role.perso);
    if (mj) out.pieces = pieces(carte).map((z) => ({ id: z.id, nom: z.nom || z.id, x: z.x, y: z.y, largeur: z.largeur, hauteur: z.hauteur, visible: visibilitePiece(table, carte, z) }));
    return out;
  }

  // --- Les actions (ce qu'un écran demande ; l'hôte vérifie que ce rôle en a le droit) ---
  // Rend { ok: true } ou { ok: false, erreur }.
  function agir(jeu, partie, role, a, ctx) {
    const table = partie.table, carte = ctx.carte;
    const non = (erreur) => ({ ok: false, erreur });
    const pion = typeof a.pion === 'string' ? table.pions.find((p) => p.id === a.pion) : null;
    switch (a.type) {
      // Un joueur lance un jet de SON personnage (caractéristique, sauvegarde ou compétence) : c'est
      // l'hôte qui lance, et la ligne va au journal, vue de tous.
      case 'jet': {
        if (!role.mj && !role.perso) return non('Les spectateurs ne lancent pas de dés.');
        return { ok: true, jet: { perso: role.mj ? String(a.perso || '') : role.perso, quoi: String(a.quoi || ''), sorte: a.sorte === 'sauvegarde' ? 'sauvegarde' : 'test', id: String(a.id || '') } };
      }
      case 'deplacer': {
        if (!pion || pion.carte !== carte.id) return non('Ce pion n\'est pas sur cette carte.');
        if (!role.mj) {
          if (pion.sorte !== 'heros') return non('Un joueur ne déplace que son héros.');
          const c = membreDe(partie, pion);
          if (role.perso && c?.creature !== role.perso) return non('Ce n\'est pas ton héros.');
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
      default:
        break;
    }
    // Le reste est au MJ seulement.
    if (!role.mj) return non('Seul le MJ peut faire ça.');
    switch (a.type) {
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

  return { reglages, normVisible, visiblePour, preparer, etatCarte, pieces, dansZone, brouillard, visibilitePiece, masque, pionsSur, occupee, caseLibre, placerHeros, membreDe, poserGroupe, sante, vue, agir };
})();

if (typeof module !== 'undefined') module.exports = TableEtat;
