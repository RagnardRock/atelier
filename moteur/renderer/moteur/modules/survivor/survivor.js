// Le module « survivor » (Saga 1.30, Tafl 1.33) : survivre à des vagues d'ennemis, façon « bullet heaven ».
//
// Une arène est une carte de Tafl (Données › Arènes) : quand le joueur y entre, une partie commence. Le héros
// ne fait que se déplacer : ses armes frappent toutes seules (une dague vers l'ennemi le plus proche, une hache
// qui tourne autour de lui, une aura, la foudre, un fouet, une onde). Les ennemis arrivent par vagues réglées
// sur un chrono, de plus en plus nombreux et solides. Chaque ennemi vaincu laisse une gemme d'expérience ; à
// chaque niveau, le joueur choisit une arme ou un passif parmi trois. Il gagne s'il tient jusqu'au bout du
// chrono (ou s'il bat le boss final) ; il perd quand il n'a plus de vie.
//
// Il lui faut le temps réel (le pack action) : le héros, ses cœurs, ses coups reçus et sa défaite sont ceux du
// temps réel ; la horde (horde.js) est simulée à part, pour en mettre des centaines à l'écran. Les ennemis sont
// ceux du pack action (Données › Ennemis) ; les armes et les passifs sont des données du jeu (Données › Armes,
// Passifs), sinon ceux d'exemple de calcul.js.
//
// L'état sauvegardé (partie.modules.survivor) : { parties, victoires: { arene: n }, record: { arene: secondes },
// tues, niveau_max, retour }. La partie en cours, elle, n'est pas sauvegardée (elle dure quelques minutes).

(() => {
  const C = SurvivorCalcul;
  const cache = new WeakMap();
  const defs = (jeu) => { if (!cache.has(jeu)) cache.set(jeu, C.definitions(jeu.donnees)); return cache.get(jeu); };
  const PAS_D_ACTION = 'Le mode survivor a besoin du temps réel : choisis le pack de règles « action » (Réglages › Règles du jeu).';

  // La partie en cours (rien n'est sauvegardé) : run (calcul.js), horde (horde.js), les armes et ce qui se voit.
  let run = null, horde = null, arene = null, carteRun = null;
  let armes = {};          // id → { t, actif, angle, cote, touches: Map(id ennemi → temps) }
  let effets = [];          // ce qui se dessine un instant : { sorte, x, y, ..., t, duree }
  let textes = [];          // les dégâts qui s'envolent
  let attente = { niveaux: 0, coffres: 0 }, enScene = false, finEnCours = false;
  let accumules = [];       // une fraction d'ennemi par ligne de vague
  let vue = null;           // ce que montre l'écran (en pixels de la carte), su au premier dessin
  let regen = 0, signale = false, bonusVitesse = 0;
  let hoteVu = null;        // le dernier hote reçu (dessiner n'en a pas)

  function preparer(o) {
    const e = o.etat;
    e.parties = Math.max(0, Math.round(Number(e.parties) || 0));
    e.tues = Math.max(0, Math.round(Number(e.tues) || 0));
    e.niveau_max = Math.max(0, Math.round(Number(e.niveau_max) || 0));
    for (const k of ['victoires', 'record']) {
      if (!e[k] || typeof e[k] !== 'object' || Array.isArray(e[k])) e[k] = {};
      for (const [id, v] of Object.entries(e[k])) { const n = Math.round(Number(v) || 0); if (n > 0) e[k][id] = n; else delete e[k][id]; }
    }
    if (e.retour && !(typeof e.retour.carte === 'string' && o.jeu.cartes.has(e.retour.carte))) e.retour = null;
  }

  // --- Commencer et finir une partie ---
  function demarrer(o, a) {
    const d = defs(o.jeu), t = o.jeu.taille, c = o.carte;
    if (!o.hote.tempsReel) { if (!signale) { signale = true; o.hote.message?.(PAS_D_ACTION); } return; }
    arene = a; carteRun = c;
    run = C.nouvelleRun(d, a);
    horde = SurvivorHorde.creer({ t, largeur: c.largeur, hauteur: c.hauteur, bloque: (x, y) => !libreSansJoueur(o, c, x, y) });
    armes = {}; effets = []; textes = []; accumules = a.vagues.map(() => 0);
    attente = { niveaux: 0, coffres: 0 }; regen = 0; finEnCours = false; bonusVitesse = -1; vue = null;
    horde.aimant = d.reglages.aimant * t;
    o.etat.parties += 1;
    appliquerBonus(o);
    o.hote.annoncer?.(a.nom, a.fin === 'boss' ? `Tiens ${a.duree} min, puis bats le boss.` : `Survis ${a.duree} minutes !`);
    o.hote.reagir('survivor_debut', { arene: a.id });
  }
  // Une case où l'on marche (hote.libre dit aussi « pas sur le joueur » : on ne veut pas de ça ici).
  function libreSansJoueur(o, c, x, y) {
    if (!Monde.dansCarte(c, x, y)) return false;
    const k = Monde.code(c, x, y);
    return k !== Jeu.PASSAGE.bloque && !Jeu.REBORDS[k] && !Monde.bloqueParModule(c, x, y);
  }
  function arreter(o) {
    run = null; horde = null; arene = null; carteRun = null; armes = {}; effets = []; textes = [];
    o?.hote?.retirerBonus?.('survivor');
  }
  function retourDe(o) {
    const r = arene?.retour || o.etat.retour;
    if (r && o.jeu.cartes.has(r.carte)) return r;
    return o.jeu.depart ? { carte: o.jeu.depart.carte, x: o.jeu.depart.x, y: o.jeu.depart.y, direction: o.jeu.depart.direction || 'bas' } : null;
  }
  function noter(o, issue) {
    const e = o.etat, s = Math.floor(run.temps);
    if (s > (e.record[arene.id] || 0)) e.record[arene.id] = s;
    if (issue === 'victoire') e.victoires[arene.id] = (e.victoires[arene.id] || 0) + 1;
    e.tues += run.tues;
    e.niveau_max = Math.max(e.niveau_max, run.niveau);
    o.hote.reagir('survivor_fin', { arene: arene.id, issue, temps: s, niveau: run.niveau, tues: run.tues });
  }
  const bilan = (o) => [`Temps : ${C.chrono(run.temps)}`, `Ennemis vaincus : ${run.tues}`, `Niveau ${run.niveau}`];
  async function gagner(o) {
    if (finEnCours) return;
    finEnCours = true;
    run.fin = 'victoire';
    noter(o, 'victoire');
    const d = defs(o.jeu), r = retourDe(o);
    const ok = await o.hote.scene?.(async (ui) => {
      await ui.liste({ titre: d.reglages.texte_victoire, lecture: true, items: [...bilan(o).map((texte) => ({ texte })), ...lignesArmes(o)] });
    });
    if (ok === false) { finEnCours = false; run.fin = null; return; } // un script tournait : on réessaie à l'image suivante
    arreter(o);
    if (r) await o.hote.teleporter?.(r.carte, r.x, r.y, r.direction);
  }
  function lignesArmes(o) {
    const d = defs(o.jeu);
    return [
      ...Object.entries(run.armes).map(([id, n]) => ({ texte: d.armes.get(id)?.nom || id, detail: `niveau ${n}`, image: d.armes.get(id)?.icone || '', pastille: d.armes.get(id)?.icone ? '' : (d.armes.get(id)?.nom || id)[0] })),
      ...Object.entries(run.passifs).map(([id, n]) => ({ texte: d.passifs.get(id)?.nom || id, detail: `niveau ${n}`, image: d.passifs.get(id)?.icone || '', pastille: d.passifs.get(id)?.icone ? '' : (d.passifs.get(id)?.nom || id)[0] })),
    ];
  }

  // Les passifs qui passent par le pack : la vitesse du héros (un bonus du groupe).
  function appliquerBonus(o) {
    const eff = C.effetsPassifs(defs(o.jeu), run?.passifs);
    if (eff.vitesse === bonusVitesse) return;
    bonusVitesse = eff.vitesse;
    if (run && eff.vitesse) o.hote.bonus?.({ id: 'survivor', nom: 'Survivor', stats: { vitesse: Math.max(-90, Math.min(200, Math.round(eff.vitesse))) }, combats: 0, nuit: false });
    else o.hote.retirerBonus?.('survivor');
  }

  // --- Monter de niveau : choisir parmi trois (le monde s'arrête) ---
  async function choisir(o) {
    if (enScene) return;
    enScene = true;
    try {
      await o.hote.scene?.(async (ui) => {
        const d = defs(o.jeu);
        while (run && (attente.niveaux > 0 || attente.coffres > 0)) {
          const coffre = attente.niveaux <= 0;
          const choix = C.tirerChoix(d, run);
          const items = choix.map((c) => { const x = C.decrire(d, c); return { texte: x.texte, detail: x.detail, etiquette: x.etiquette, image: x.icone, pastille: x.icone ? '' : x.texte[0] }; });
          const k = await ui.liste({ titre: coffre ? 'Un coffre ! Choisis ton trésor' : `Niveau ${run.niveau - attente.niveaux + 1} !`, entete: `${C.chrono(run.temps)} · ${run.tues} vaincus`, annulable: false, large: true, items });
          const c = choix[Math.max(0, Math.min(choix.length - 1, Number(k) || 0))];
          C.prendre(d, run, c);
          if (c.sorte === 'soin') o.hote.soigner?.(c.pv);
          if (coffre) attente.coffres--; else attente.niveaux--;
          if (c.sorte !== 'soin') o.hote.reagir('survivor_choix', { sorte: c.sorte, id: c.id, niveau: c.niveau });
        }
      });
    } finally { enScene = false; }
    if (run) appliquerBonus(o);
  }

  // --- Les vagues ---
  function faireApparaitre(o, idEnnemi, nombre, plus = {}) {
    const d = defs(o.jeu), def = d.ennemis.get(idEnnemi);
    if (!def) return 0;
    let n = 0;
    // Un groupe arrive ensemble, serré autour d'un même point juste hors de l'écran.
    const centre = vue ? horde.pointApparition(vue) : null;
    if (!centre) return 0;
    for (let i = 0; i < nombre && horde.vivants < d.reglages.ennemis_max + (plus.boss ? 50 : 0); i++) {
      const p = i === 0 ? centre : { x: centre.x + (Math.random() - 0.5) * horde.t * 2, y: centre.y + (Math.random() - 0.5) * horde.t * 2 };
      if (!p || horde.bloquee(Math.floor(p.x / horde.t), Math.floor(p.y / horde.t))) continue;
      const e = horde.ajouter(def, C.pvEnnemi(arene, def, run.temps) * (plus.boss && !def.boss ? 10 : 1), p.x, p.y, plus);
      e.ligne = plus.ligne ?? -1;
      e.final = Boolean(plus.final);
      n++;
    }
    return n;
  }
  function avancerVagues(o, dt, avant) {
    const parLigne = new Map();
    for (const e of horde.ennemis) if (e.actif && !e.mort && e.ligne >= 0) parLigne.set(e.ligne, (parLigne.get(e.ligne) || 0) + 1);
    for (const v of C.vagues(arene, run.temps)) {
      accumules[v.k] = (accumules[v.k] || 0) + (v.par_minute / 60) * dt;
      while (accumules[v.k] >= v.groupe) {
        accumules[v.k] -= v.groupe;
        if (v.max && (parLigne.get(v.k) || 0) >= v.max) { accumules[v.k] = 0; break; }
        const n = faireApparaitre(o, v.ennemi, v.groupe, { ligne: v.k });
        parLigne.set(v.k, (parLigne.get(v.k) || 0) + n);
        if (!n) { accumules[v.k] = 0; break; }
      }
    }
    for (const b of C.bossA(arene, avant, run.temps)) {
      if (faireApparaitre(o, b.ennemi, b.nombre, { boss: true, echelle: 1.6 })) o.hote.annoncer?.('Un boss arrive !', defs(o.jeu).ennemis.get(b.ennemi)?.nom || '');
    }
  }

  // --- Les armes ---
  function eff(o) { return C.effetsPassifs(defs(o.jeu), run.passifs); }
  function frapper(o, e, n, x, y, recul = 1) {
    const deg = C.degats(n, e.def.defense);
    const mort = horde.blesser(e, deg, x, y, recul);
    if (defs(o.jeu).reglages.degats_visibles && textes.length < 60) textes.push({ x: e.x, y: e.y - horde.t * 0.4, texte: String(deg), t: 0 });
    if (mort) mourir(o, e);
  }
  function mourir(o, e) {
    run.tues++;
    const d = defs(o.jeu);
    if (e.def.xp > 0) horde.poser(e.x, e.y, e.def.xp * (e.boss && !e.def.boss ? 10 : 1));
    if (e.boss) { horde.poser(e.x + horde.t * 0.4, e.y, 1, 'coffre'); o.hote.reagir('survivor_boss', { ennemi: e.def.id, temps: Math.floor(run.temps) }); }
    else if (Math.random() * 100 < d.reglages.coeur_chance) horde.poser(e.x, e.y, 1, 'coeur');
    if (e.final && arene.fin === 'boss') gagner(o);
  }
  function avancerArmes(o, dt) {
    const d = defs(o.jeu), ef = eff(o), t = horde.t, h = horde.heros;
    const dir = o.hote.tempsReel.direction();
    for (const [id, niveau] of Object.entries(run.armes)) {
      const s = C.statsArme(d, id, niveau, ef);
      if (!s) continue;
      const a = armes[id] || (armes[id] = { t: 0.3, actif: 0, angle: 0, cote: 1, touches: new Map() });
      a.t -= dt;
      switch (s.sorte) {
        case 'projectile':
        case 'direction': {
          if (a.t > 0) break;
          const cible = s.sorte === 'projectile' ? horde.plusProche(h.x, h.y, s.portee * t) : null;
          if (s.sorte === 'projectile' && !cible) { a.t = 0.15; break; }
          a.t = s.recharge;
          const [fx, fy] = cible ? [cible.x - h.x, cible.y - h.y] : ({ bas: [0, 1], haut: [0, -1], gauche: [-1, 0], droite: [1, 0] }[dir] || [0, 1]);
          const base = Math.atan2(fy, fx);
          for (let k = 0; k < s.nombre; k++) {
            const ang = base + (k - (s.nombre - 1) / 2) * 0.16;
            const v = s.vitesse * t;
            horde.tirer({ x: h.x, y: h.y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, vie: (s.portee * t) / Math.max(1, v), rayon: t * 0.22 * s.taille, degats: s.degats, percee: s.percee, couleur: s.couleur, arme: id });
          }
          break;
        }
        case 'orbite': {
          if (a.actif <= 0 && a.t <= 0) { a.actif = s.duree || s.recharge; a.t = s.recharge + (s.duree || 0); }
          if (a.actif <= 0) break;
          a.actif -= dt;
          a.angle += dt * Math.max(0.5, s.vitesse);
          const r = s.portee * t, rb = t * 0.38 * s.taille;
          for (let k = 0; k < s.nombre; k++) {
            const ang = a.angle + (k * Math.PI * 2) / s.nombre, x = h.x + Math.cos(ang) * r, y = h.y + Math.sin(ang) * r;
            horde.autour(x, y, rb, (e) => {
              const der = a.touches.get(e.id) || -9;
              if (run.temps - der < 0.45) return;
              a.touches.set(e.id, run.temps);
              frapper(o, e, s.degats, h.x, h.y, 1.2);
            });
          }
          if (a.touches.size > 600) a.touches.clear();
          break;
        }
        case 'aura': {
          if (a.t > 0) break;
          a.t = s.recharge;
          const r = s.portee * t * s.taille;
          horde.autour(h.x, h.y, r, (e) => frapper(o, e, s.degats, h.x, h.y, 0.3));
          break;
        }
        case 'eclair': {
          if (a.t > 0) break;
          a.t = s.recharge;
          for (const c of horde.auHasard(s.nombre, vue || { x: h.x - 8 * t, y: h.y - 6 * t, l: 16 * t, h: 12 * t })) {
            const r = s.portee * t * s.taille, x = c.x, y = c.y;
            effets.push({ sorte: 'eclair', x, y, r, couleur: s.couleur, t: 0, duree: 0.25, graine: Math.random() });
            horde.autour(x, y, r, (e) => frapper(o, e, s.degats, x, y - t, 0.6));
          }
          break;
        }
        case 'fouet': {
          if (a.t > 0) break;
          a.t = s.recharge;
          const devant = dir === 'gauche' ? -1 : dir === 'droite' ? 1 : a.cote;
          const cotes = s.nombre >= 2 ? [devant, -devant] : [devant];
          cotes.forEach((cote, k) => {
            const l = s.portee * t * s.taille, hh = t * 0.9 * Math.sqrt(s.taille);
            const x0 = cote > 0 ? h.x : h.x - l, y0 = h.y - hh / 2 - k * t * 0.25;
            effets.push({ sorte: 'fouet', x: x0, y: y0, l, h: hh, cote, couleur: s.couleur, t: -k * 0.08, duree: 0.22 });
            horde.autour(h.x + (cote * l) / 2, h.y, l / 2 + t, (e) => { if (e.x >= x0 - e.r && e.x <= x0 + l + e.r && e.y >= y0 - e.r && e.y <= y0 + hh + e.r) frapper(o, e, s.degats, h.x, h.y, 1); });
          });
          a.cote = -devant;
          break;
        }
        case 'onde': {
          if (a.t > 0) break;
          a.t = s.recharge;
          const r = s.portee * t * s.taille;
          effets.push({ sorte: 'onde', x: h.x, y: h.y, r, couleur: s.couleur, t: 0, duree: 0.4 });
          horde.autour(h.x, h.y, r, (e) => frapper(o, e, s.degats, h.x, h.y, 2));
          break;
        }
        default: break;
      }
    }
  }

  // --- Une image ---
  function avancer(o) {
    hoteVu = o.hote;
    if (!run || run.fin || o.carte !== carteRun) return;
    const rt = o.hote.tempsReel;
    if (!rt || !rt.libre) return;
    const dt = Math.min(0.05, Math.max(0, Number(o.dt) || 0));
    const corps = rt.heros();
    if (corps) { horde.heros.x = corps.x + corps.l / 2; horde.heros.y = corps.y + corps.h / 2; horde.heros.l = corps.l; horde.heros.h = corps.h; }
    const avant = run.temps;
    run.temps += dt;
    const d = defs(o.jeu), ef = eff(o);
    horde.aimant = d.reglages.aimant * horde.t * (1 + ef.aimant / 100);
    avancerVagues(o, dt, avant);
    // Le boss final, au bout du chrono.
    if (arene.fin === 'boss' && !run.bossFinal && run.temps >= arene.duree * 60) {
      run.bossFinal = true;
      const id = arene.boss_final || [...d.ennemis.values()].find((e) => e.boss)?.id || '';
      if (id && faireApparaitre(o, id, 1, { boss: true, final: true, echelle: 2 })) o.hote.annoncer?.('Le boss final !', d.ennemis.get(id)?.nom || '');
      else { gagner(o); return; }
    }
    avancerArmes(o, dt);
    horde.avancer(dt, {
      contact: (e) => rt.toucher(e.def.id, e.x, e.y, ef.armure),
      frappe: (e, n, x, y, recul) => frapper(o, e, n, x, y, recul),
      ramasse: (g) => {
        if (g.sorte === 'xp') { const n = C.gagnerXp(d, run, g.valeur * (1 + ef.croissance / 100)); if (n) { attente.niveaux += n; o.hote.reagir('survivor_niveau', { niveau: run.niveau }); } }
        else if (g.sorte === 'coeur') o.hote.soigner?.(Math.max(1, Math.round(d.reglages.soin_choix)));
        else if (g.sorte === 'coffre') attente.coffres++;
      },
    });
    for (const x of effets) x.t += dt;
    effets = effets.filter((x) => x.t < x.duree);
    for (const x of textes) x.t += dt;
    textes = textes.filter((x) => x.t < 0.6);
    // La régénération (un passif) : des PV toutes les 10 secondes.
    if (ef.regen > 0) { regen += dt; if (regen >= 10) { regen = 0; o.hote.soigner?.(Math.round(ef.regen)); } }
    if (arene.fin === 'temps' && run.temps >= arene.duree * 60) { gagner(o); return; }
    if (attente.niveaux > 0 || attente.coffres > 0) choisir(o);
  }

  // --- Le dessin ---
  function dessiner(o) {
    if (!run || !horde || o.carte !== carteRun) return;
    const { ctx, cam } = o, t = horde.t, h = horde.heros;
    vue = { x: cam.x, y: cam.y, l: o.largeur, h: o.hauteur };
    if (o.profondeur === 'sol') {
      // Les gemmes, les cœurs, les coffres.
      for (const g of horde.gemmes) {
        if (!g.actif) continue;
        const x = Math.round(g.x - cam.x), y = Math.round(g.y - cam.y);
        if (x < -t || y < -t || x > o.largeur + t || y > o.hauteur + t) continue;
        if (g.sorte === 'xp') gemme(ctx, x, y, g.valeur, t);
        else if (g.sorte === 'coeur') { ctx.fillStyle = '#e8344a'; ctx.beginPath(); ctx.arc(x - t * 0.1, y, t * 0.13, 0, Math.PI * 2); ctx.arc(x + t * 0.1, y, t * 0.13, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.moveTo(x - t * 0.23, y + t * 0.03); ctx.lineTo(x, y + t * 0.28); ctx.lineTo(x + t * 0.23, y + t * 0.03); ctx.fill(); }
        else { const b = Math.sin(o.maintenant / 150) * 1.5; ctx.fillStyle = '#7a4a1a'; ctx.fillRect(x - t * 0.35, y - t * 0.25 + b, t * 0.7, t * 0.5); ctx.fillStyle = '#ffd84a'; ctx.fillRect(x - t * 0.35, y - t * 0.05 + b, t * 0.7, t * 0.08); ctx.fillRect(x - t * 0.06, y - t * 0.12 + b, t * 0.12, t * 0.2); }
      }
      // L'aura, sous tout le monde.
      const d = defs(o.jeu), ef = eff(o);
      for (const [id, n] of Object.entries(run.armes)) {
        const s = C.statsArme(d, id, n, ef);
        if (s?.sorte !== 'aura') continue;
        const r = s.portee * t * s.taille, x = h.x - cam.x, y = h.y - cam.y;
        ctx.save();
        ctx.globalAlpha = 0.16 + 0.05 * Math.sin(o.maintenant / 200);
        ctx.fillStyle = s.couleur;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.45; ctx.strokeStyle = s.couleur; ctx.lineWidth = 1; ctx.stroke();
        ctx.restore();
      }
      // La horde, du haut vers le bas de l'écran.
      const visibles = horde.ennemis.filter((e) => e.actif && e.x > cam.x - t * 2 && e.y > cam.y - t * 2 && e.x < cam.x + o.largeur + t * 2 && e.y < cam.y + o.hauteur + t * 3).sort((a, b) => a.y - b.y);
      for (const e of visibles) {
        const perso = e.def.personnage ? o.jeu.personnages.get(e.def.personnage) : null;
        const pas = e.bouge ? 1 + Math.floor(e.marche * 7) : 0;
        const x = Math.round(e.x - cam.x - t / 2), y = Math.round(e.y - cam.y - t * 0.62);
        ctx.save();
        if (e.mort) ctx.globalAlpha = Math.max(0, 1 - e.mort / 0.3);
        else if (e.flash > 0) ctx.globalAlpha = 0.55;
        if (e.echelle !== 1) { const k = e.echelle; ctx.translate(x + t / 2, y + t); ctx.scale(k, k); ctx.translate(-(x + t / 2), -(y + t)); }
        o.corps({ perso, couleur: e.def.couleur, direction: e.dir, pas, x, y });
        ctx.restore();
        if (e.boss && !e.mort) barre(ctx, x - t * 0.2, y - t * 0.6 * e.echelle + t * 0.4, t * 1.4, e.pv / e.pvMax);
      }
      return;
    }
    // Profondeur « dessus » : les projectiles, les haches, les coups (devant les calques du dessus).
    const d = defs(o.jeu), ef = eff(o);
    for (const p of horde.projectiles) {
      if (!p.actif) continue;
      const x = p.x - cam.x, y = p.y - cam.y, a = Math.atan2(p.vy, p.vx);
      ctx.save();
      ctx.translate(x, y); ctx.rotate(a);
      ctx.fillStyle = p.couleur; ctx.fillRect(-p.rayon * 1.6, -Math.max(1, p.rayon * 0.35), p.rayon * 3.2, Math.max(2, p.rayon * 0.7));
      ctx.fillStyle = '#6a5030'; ctx.fillRect(-p.rayon * 1.9, -Math.max(1, p.rayon * 0.35), p.rayon * 0.6, Math.max(2, p.rayon * 0.7));
      ctx.restore();
    }
    for (const [id, n] of Object.entries(run.armes)) {
      const s = C.statsArme(d, id, n, ef), a = armes[id];
      if (s?.sorte !== 'orbite' || !a || a.actif <= 0) continue;
      const r = s.portee * t, rb = t * 0.38 * s.taille;
      for (let k = 0; k < s.nombre; k++) {
        const ang = a.angle + (k * Math.PI * 2) / s.nombre, x = h.x + Math.cos(ang) * r - cam.x, y = h.y + Math.sin(ang) * r - cam.y;
        ctx.save(); ctx.translate(x, y); ctx.rotate(a.angle * 3);
        ctx.fillStyle = '#6a5030'; ctx.fillRect(-rb * 0.12, -rb, rb * 0.24, rb * 2);
        ctx.fillStyle = s.couleur; ctx.beginPath(); ctx.moveTo(0, -rb); ctx.quadraticCurveTo(rb * 1.1, -rb * 0.7, rb * 0.15, 0); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(0, rb); ctx.quadraticCurveTo(-rb * 1.1, rb * 0.7, -rb * 0.15, 0); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
    for (const x of effets) {
      if (x.t < 0) continue;
      const k = x.t / x.duree;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - k);
      ctx.strokeStyle = x.couleur; ctx.fillStyle = x.couleur;
      if (x.sorte === 'eclair') {
        const bx = x.x - cam.x, by = x.y - cam.y;
        ctx.lineWidth = Math.max(1, t / 8);
        ctx.beginPath(); ctx.moveTo(bx + (x.graine - 0.5) * t, by - t * 6);
        for (let i = 1; i <= 6; i++) ctx.lineTo(bx + Math.sin(x.graine * 50 + i * 2.1) * t * 0.4 * (1 - i / 6), by - t * 6 + i * t);
        ctx.stroke();
        ctx.globalAlpha *= 0.35; ctx.beginPath(); ctx.arc(bx, by, x.r, 0, Math.PI * 2); ctx.fill();
      } else if (x.sorte === 'fouet') {
        const l = x.l * Math.min(1, k * 2.2);
        ctx.globalAlpha = Math.max(0, 0.85 - k * 0.85);
        const x0 = x.cote > 0 ? x.x - cam.x : x.x + x.l - l - cam.x;
        ctx.beginPath(); ctx.ellipse(x0 + l / 2, x.y - cam.y + x.h / 2, l / 2, x.h / 2 * (1 - k * 0.5), 0, 0, Math.PI * 2); ctx.fill();
      } else if (x.sorte === 'onde') {
        ctx.lineWidth = Math.max(1, t / 6);
        ctx.beginPath(); ctx.arc(x.x - cam.x, x.y - cam.y, x.r * Math.min(1, 0.2 + k), 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }
  }
  function gemme(ctx, x, y, valeur, t) {
    const c = valeur >= 25 ? ['#ff5a6a', '#ffd0d6'] : valeur >= 5 ? ['#4ade80', '#d8ffe6'] : ['#5ab0ff', '#d8ecff'];
    const r = t * (valeur >= 25 ? 0.24 : 0.17);
    ctx.fillStyle = c[0];
    ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.7, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.7, y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = c[1]; ctx.fillRect(Math.round(x - r * 0.2), Math.round(y - r * 0.5), Math.max(1, Math.round(r * 0.3)), Math.max(1, Math.round(r * 0.4)));
  }
  function barre(ctx, x, y, l, k) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, Math.round(l) + 2, 4);
    ctx.fillStyle = '#f0503c'; ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(l * Math.max(0, k))), 2);
  }

  // Par-dessus tout : les dégâts, la jauge d'expérience, le chrono, le compteur, les armes.
  function ecran(o) {
    if (!run || !horde || o.carte !== carteRun) return;
    const { ctx, cam } = o, t = horde.t, W = o.largeur, d = defs(o.jeu);
    const u = Math.max(1, Math.round(t / 16));
    ctx.save();
    ctx.font = `${Math.max(8, Math.round(t * 0.6))}px "Jersey 10", monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    for (const x of textes) {
      const k = x.t / 0.6;
      ctx.globalAlpha = 1 - k * k;
      const px = Math.round(x.x - cam.x), py = Math.round(x.y - cam.y - k * t * 0.6);
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillText(x.texte, px + 1, py + 1);
      ctx.fillStyle = '#fff'; ctx.fillText(x.texte, px, py);
    }
    ctx.globalAlpha = 1;
    // La jauge d'expérience, tout en haut.
    const besoin = C.xpPour(d, run.niveau), k = Math.min(1, run.xp / besoin), hb = 3 * u;
    ctx.fillStyle = 'rgba(8, 10, 24, 0.75)'; ctx.fillRect(0, 0, W, hb + 2);
    ctx.fillStyle = '#4aa8ff'; ctx.fillRect(1, 1, Math.round((W - 2) * k), hb);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(1, 1, Math.round((W - 2) * k), u);
    // Le chrono au milieu, le niveau et les ennemis vaincus à droite.
    const ombre = (s, x, y) => { ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillText(s, x + 1, y + 1); ctx.fillStyle = '#fff'; ctx.fillText(s, x, y); };
    ctx.textBaseline = 'top';
    ctx.font = `${Math.max(10, Math.round(t * 0.95))}px "Jersey 10", monospace`;
    const reste = arene.fin === 'temps' ? Math.max(0, arene.duree * 60 - run.temps) : run.temps;
    ombre(C.chrono(reste), Math.round(W / 2), hb + 3 * u);
    ctx.font = `${Math.max(8, Math.round(t * 0.7))}px "Jersey 10", monospace`;
    ctx.textAlign = 'right';
    ombre(`Niv. ${run.niveau}`, W - 4 * u, hb + 3 * u);
    ombre(`☠ ${run.tues}`, W - 4 * u, hb + 3 * u + Math.round(t * 0.7));
    // Les armes et les passifs, en petites pastilles en bas à gauche.
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tailleP = Math.round(t * 0.8), y0 = o.hauteur - tailleP - 4 * u;
    let x0 = 4 * u;
    const pastille = (def, n, couleur) => {
      ctx.fillStyle = 'rgba(8, 10, 24, 0.7)'; ctx.fillRect(x0, y0, tailleP, tailleP);
      ctx.strokeStyle = couleur; ctx.lineWidth = 1; ctx.strokeRect(x0 + 0.5, y0 + 0.5, tailleP - 1, tailleP - 1);
      const img = def?.icone ? icone(def.icone) : null;
      if (img?.complete && img.naturalWidth) ctx.drawImage(img, x0 + 2 * u, y0 + 2 * u, tailleP - 4 * u, tailleP - 4 * u);
      else { ctx.fillStyle = couleur; ctx.font = `${Math.max(8, Math.round(tailleP * 0.6))}px "Jersey 10", monospace`; ctx.fillText((def?.nom || '?')[0], x0 + tailleP / 2, y0 + tailleP / 2); }
      ctx.font = `${Math.max(7, Math.round(t * 0.45))}px "Jersey 10", monospace`;
      ctx.fillStyle = '#ffd84a'; ctx.fillText(String(n), x0 + tailleP - 2 * u, y0 + tailleP - 2 * u);
      x0 += tailleP + 2 * u;
    };
    for (const [id, n] of Object.entries(run.armes)) pastille(d.armes.get(id), n, d.armes.get(id)?.couleur || '#fff');
    if (Object.keys(run.passifs).length) x0 += 3 * u;
    for (const [id, n] of Object.entries(run.passifs)) pastille(d.passifs.get(id), n, '#c8a0ff');
    ctx.restore();
  }
  const icones = new Map();
  function icone(src) {
    if (!icones.has(src)) { const i = new Image(); i.src = src; icones.set(src, i); }
    return icones.get(src);
  }

  Modules.enregistrer({
    id: 'survivor',
    preparer,
    entrerCarte(o) {
      hoteVu = o.hote;
      const a = C.arenePour(defs(o.jeu), o.carte.id);
      if (run && o.carte !== carteRun) arreter(o);
      if (a && !run) demarrer(o, a);
      // On retient d'où vient le joueur (là où il revient après une partie, sauf si l'arène dit où).
      if (!a && o.hote.joueur) o.etat.retour = { carte: o.carte.id, x: o.hote.joueur.x, y: o.hote.joueur.y, direction: o.hote.joueur.direction || 'bas' };
    },
    avancer,
    dessiner,
    ecran,
    // Une défaite en temps réel pendant une partie : le bilan, puis le retour (reveil).
    apresCombat(o) {
      if (!run || o.issue !== 'defaite' || o.sorte !== 'temps_reel') return [];
      run.fin = 'defaite';
      noter(o, 'defaite');
      const d = defs(o.jeu);
      return [d.reglages.texte_defaite, bilan(o).join(' · ')];
    },
    reveil(o) {
      if (!run) return null;
      return retourDe(o);
    },
    commandes: {
      // Aller dans une arène (la partie commence à l'arrivée). Le joueur reviendra ici.
      async survivor_lancer(o) {
        const d = defs(o.jeu), a = d.arenes.get(String(o.c.arene || '')) || [...d.arenes.values()][0];
        if (!a || !o.jeu.cartes.has(a.carte)) { o.hote.message?.(`Arène inconnue ou sans carte : « ${o.c.arene || ''} »`); return false; }
        if (o.hote.carte && o.hote.joueur) o.etat.retour = { carte: o.hote.carte.id, x: o.hote.joueur.x, y: o.hote.joueur.y, direction: o.hote.joueur.direction || 'bas' };
        const c = o.jeu.cartes.get(a.carte);
        const p = a.depart || { x: Math.floor(c.largeur / 2), y: Math.floor(c.hauteur / 2) };
        await o.hote.teleporter?.(a.carte, p.x, p.y, 'bas');
        return true;
      },
      // Quitter l'arène tout de suite (la partie compte comme abandonnée).
      async survivor_arreter(o) {
        if (!run) return false;
        run.fin = 'abandon';
        noter(o, 'abandon');
        const r = retourDe(o);
        arreter(o);
        if (r) await o.hote.teleporter?.(r.carte, r.x, r.y, r.direction);
        return true;
      },
    },
    condition(o, c) {
      if (c.type === 'survivor_en_partie') return Boolean(run) === (c.valeur !== false);
      if (c.type === 'survivor_record') return (o.etat.record?.[c.arene] || 0) >= (Number(c.minutes) || 0) * 60;
      if (c.type === 'survivor_victoires') {
        const v = c.arene ? o.etat.victoires?.[c.arene] || 0 : Object.values(o.etat.victoires || {}).reduce((s, n) => s + n, 0);
        return v >= (Number(c.min) || 1);
      }
      return undefined;
    },
    actionsPause: () => (run ? [['armes', 'Mes armes', 'zap'], ['abandonner', 'Abandonner l\'arène', 'close']] : []),
    async agirPause(o, id) {
      const ui = o.hote.ui;
      if (!run || !ui) return;
      if (id === 'armes') await ui.liste({ titre: `${arene.nom} · ${C.chrono(run.temps)}`, lecture: true, items: [...bilan(o).map((texte) => ({ texte })), ...lignesArmes(o)] });
      if (id === 'abandonner') {
        const k = await ui.liste({ titre: 'Abandonner l\'arène ?', items: [{ texte: 'Continuer' }, { texte: 'Abandonner' }] });
        if (k === 1) await this.commandes.survivor_arreter(o);
      }
    },
    carnet(o) {
      const e = o.etat, d = defs(o.jeu);
      const lignes = [...d.arenes.values()].map((a) => ({ texte: a.nom, detail: `record ${C.chrono(e.record[a.id] || 0)}${e.victoires[a.id] ? ` · ${e.victoires[a.id]} victoire${e.victoires[a.id] > 1 ? 's' : ''}` : ''}` }));
      if (!lignes.length) return [];
      return [{ titre: 'Arènes', detail: `${e.parties} partie${e.parties > 1 ? 's' : ''}`, lignes, jetons: [{ texte: 'Ennemis vaincus', nombre: String(e.tues) }] }];
    },
    pourScript: (o) => ({
      en_partie: Boolean(run), arene: arene?.id || '', temps: run ? Math.floor(run.temps) : 0, niveau: run?.niveau || 0, tues: run?.tues || 0,
      ennemis: horde?.vivants || 0, armes: run ? { ...run.armes } : {}, passifs: run ? { ...run.passifs } : {},
      parties: o.etat.parties, record: { ...o.etat.record }, victoires: { ...o.etat.victoires }, tues_total: o.etat.tues,
    }),
  });

  // Pour les essais : la partie en cours.
  if (typeof window !== 'undefined') window.SagaSurvivor = { get run() { return run; }, get horde() { return horde; }, get attente() { return attente; }, get hote() { return hoteVu; } };
})();
