// Le module « roguelite » (Saga 1.14, Tafl 1.12) : des parties courtes dans un donjon tiré au hasard.
//
// Le joueur part du camp (commande roguelite_partir). Saga bâtit l'étage avec une graine (etages.js) : des
// salles reliées par leurs portes, chacune la copie d'une carte modèle de Tafl (« base@rl-étage-n », avec
// sa propre mémoire). Les portes restent fermées tant qu'il reste des ennemis dans la salle. Dans la salle
// du boss, un événement (condition « la salle est vide ») mène à l'étage suivant (roguelite_suivant).
//
// Pendant la partie : des perks (coffres, boutiques, choix d'un parmi trois), perdus à la fin. D'une partie
// à l'autre : une monnaie gardée même après une défaite, et des améliorations à acheter au camp.
//
// Rien ici n'est propre à un jeu ni à un pack : les salles, les perks, les améliorations et les réglages
// viennent des données du jeu. Avec le pack action, les ennemis des zones apparaissent dans les salles et
// la salle se vide quand ils sont vaincus ; avec un pack au tour par tour, les salles sont vides d'emblée et
// les combats viennent des zones, comme ailleurs.
//
// L'état (partie.modules.roguelite) :
//   { monnaie, ameliorations: { id: niveau }, parties, victoires, record, reveil,
//     run: null | { graine, etage, salles, salle, perks: { id: n }, retour, gains, tirages, boutiques } }

(() => {
  const C = RogueliteCalcul;
  const cache = new WeakMap();
  const libre = (c, x, y) => { const k = Monde.code(c, x, y); return k !== Jeu.PASSAGE.bloque && !Jeu.REBORDS[k]; };
  const defs = (jeu) => { if (!cache.has(jeu)) cache.set(jeu, C.definitions(jeu.donnees, [...jeu.cartes.values()], libre)); return cache.get(jeu); };
  // Un boss n'est jamais renforcé (un seul Gardien, même au dernier étage).
  const estBoss = (jeu, id) => Boolean((jeu.donnees?.ennemis?.ennemis || []).find((e) => e?.id === id)?.boss);
  const modeleDe = (d, id) => d.salles.find((s) => s.id === id) || null;
  const idSalle = (run, i) => `${run.salles[i].modele}@rl-${run.etage}-${i}`;
  const NOMS_COTES = { n: 'nord', s: 'sud', e: 'est', o: 'ouest' };
  const DIR_COTE = { n: 'haut', s: 'bas', e: 'droite', o: 'gauche' };

  // Les cases de porte de la carte affichée : index → côté (préparé à l'arrivée, bloque doit rester rapide).
  let portesIci = { carte: null, cases: new Map() };
  let tempsSalle = 0;
  function preparerPortes(o, carte) {
    portesIci = { carte, cases: new Map() };
    const run = o.etat.run, i = salleIci(o, carte);
    if (i < 0) return;
    const m = modeleDe(defs(o.jeu), run.salles[i].modele);
    if (!m) return;
    for (const c of C.COTES) for (const p of m.portes[c]) portesIci.cases.set(p.y * carte.largeur + p.x, c);
  }
  function salleIci(o, carte) {
    const run = o.etat.run;
    if (!run || !carte) return -1;
    const i = Number(String(carte.id).match(/@rl-(\d+)-(\d+)$/)?.[2]);
    return Number.isInteger(i) && run.salles[i] && idSalle(run, i) === carte.id ? i : -1;
  }
  const salleCourante = (o) => { const run = o.etat.run; return run && run.salles[run.salle] ? run.salles[run.salle] : null; };

  function preparer(o) {
    const e = o.etat;
    e.monnaie = Math.max(0, Math.round(Number(e.monnaie) || 0));
    if (!e.ameliorations || typeof e.ameliorations !== 'object' || Array.isArray(e.ameliorations)) e.ameliorations = {};
    for (const [k, v] of Object.entries(e.ameliorations)) { const n = Math.round(Number(v) || 0); if (n > 0) e.ameliorations[k] = n; else delete e.ameliorations[k]; }
    for (const k of ['parties', 'victoires', 'record']) e[k] = Math.max(0, Math.round(Number(e[k]) || 0));
    const r = e.run;
    if (r && (!Array.isArray(r.salles) || !r.salles.length || !Number.isInteger(r.etage))) e.run = null;
    if (e.run) {
      if (!r.perks || typeof r.perks !== 'object') r.perks = {};
      if (!r.boutiques || typeof r.boutiques !== 'object') r.boutiques = {};
      r.salle = Number.isInteger(r.salle) && r.salles[r.salle] ? r.salle : 0;
      r.gains = Math.max(0, Math.round(Number(r.gains) || 0));
      r.tirages = Math.max(0, Math.round(Number(r.tirages) || 0));
    }
  }

  // Les bonus de la partie : ceux des perks, et ceux des améliorations (seulement pendant une partie).
  function appliquerBonus(o) {
    const d = defs(o.jeu), run = o.etat.run;
    if (!run) { o.hote.retirerBonus?.('roguelite:perks'); o.hote.retirerBonus?.('roguelite:meta'); return; }
    const p = C.effetsPerks(d, run.perks), m = C.effetsMeta(d, o.etat.ameliorations);
    if (Object.keys(p.stats).length) o.hote.bonus?.({ id: 'roguelite:perks', nom: 'Perks', stats: p.stats, combats: 0, nuit: false }); else o.hote.retirerBonus?.('roguelite:perks');
    if (Object.keys(m.stats).length) o.hote.bonus?.({ id: 'roguelite:meta', nom: 'Améliorations', stats: m.stats, combats: 0, nuit: false }); else o.hote.retirerBonus?.('roguelite:meta');
  }
  // Où arrive le joueur dans une salle : par une porte (un pas vers l'intérieur), ou près du centre (départ).
  function arrivee(o, run, i, cote) {
    const d = defs(o.jeu), m = modeleDe(d, run.salles[i].modele), carte = o.jeu.cartes.get(run.salles[i].modele);
    const p = cote ? C.entree(m.portes, cote) : null;
    if (p) return { carte: idSalle(run, i), x: p.x, y: p.y, direction: DIR_COTE[C.OPPOSE[cote]] };
    const cx = Math.floor(carte.largeur / 2), cy = Math.floor(carte.hauteur / 2);
    let best = { x: cx, y: cy }, bd = Infinity;
    for (let y = 1; y < carte.hauteur - 1; y++) for (let x = 1; x < carte.largeur - 1; x++) {
      const dd = Math.abs(x - cx) + Math.abs(y - cy);
      if (dd < bd && libre(carte, x, y)) { bd = dd; best = { x, y }; }
    }
    return { carte: idSalle(run, i), ...best, direction: 'bas' };
  }
  function batirEtage(o, run) {
    const r = C.generer(defs(o.jeu), run.etage, run.graine);
    if (r.erreur) return r.erreur;
    run.salles = r.salles.map((s, i) => ({ ...s, vue: i === 0, vide: false }));
    run.salle = 0;
    run.boutiques = {};
    return '';
  }
  const hasardRun = (run, quoi) => C.alea(C.melange(run.graine, run.etage, quoi, run.tirages++));

  // La partie se termine : on garde la monnaie et les améliorations, on perd les perks.
  function finir(o, issue) {
    const e = o.etat, run = e.run;
    if (!run) return [];
    const d = defs(o.jeu), R = d.reglages;
    let bonus = 0;
    if (issue === 'victoire') { bonus = R.monnaie_victoire; e.victoires += 1; }
    e.monnaie += bonus;
    e.record = Math.max(e.record, run.etage);
    const lignes = [`${issue === 'victoire' ? 'Victoire !' : issue === 'defaite' ? 'La partie est finie.' : 'Tu abandonnes la partie.'} Étage ${run.etage}, ${run.gains + bonus} ${R.monnaie} gagnés (gardés).`];
    e.run = null;
    appliquerBonus(o);
    o.hote.reagir?.('roguelite_fin', { issue, etage: run.etage, monnaie: run.gains + bonus });
    return [lignes, run];
  }
  function gagner(o, n) {
    const run = o.etat.run;
    const plus = Math.max(0, Math.round(n * (1 + (C.effetsPerks(defs(o.jeu), run?.perks).monnaie + C.effetsMeta(defs(o.jeu), o.etat.ameliorations).monnaie) / 100)));
    o.etat.monnaie += plus;
    if (run) run.gains += plus;
    return plus;
  }
  function donnerPerk(o, id) {
    const d = defs(o.jeu), run = o.etat.run, p = d.perks.get(id);
    if (!run || !p) return null;
    run.perks[id] = Math.min(p.max, (run.perks[id] || 0) + 1);
    if (p.effets.some((x) => x.type === 'soin')) o.hote.soigner?.();
    appliquerBonus(o);
    o.hote.reagir?.('roguelite_perk', { perk: id, niveau: run.perks[id] });
    return p;
  }
  const direPerk = (p, run) => `${p.nom}${p.max > 1 ? ` (${run.perks[p.id]}/${p.max})` : ''} : ${p.description || 'un nouveau pouvoir'}`;
  const NOM_RARETE = { commun: 'Commun', rare: 'Rare', epique: 'Épique', legendaire: 'Légendaire' };

  async function partir(o) {
    const e = o.etat, d = defs(o.jeu), R = d.reglages;
    if (e.run) { await o.narrer?.('Une partie est déjà en cours.'); return { ok: false }; }
    const graine = Math.round(Number(o.c?.graine)) || R.graine || Math.floor(Math.random() * 2147483646) + 1;
    const j = o.hote.joueur;
    const run = { graine, etage: 1, salles: [], salle: 0, perks: {}, retour: j ? { carte: o.hote.carte?.id, x: j.x, y: j.y, direction: j.direction } : null, gains: 0, tirages: 0, boutiques: {} };
    const erreur = batirEtage(o, run);
    if (erreur) { o.hote.message?.(erreur); await o.narrer?.(erreur); return { ok: false, erreur }; }
    o.hote.oublierCopies?.('rl-');
    e.run = run;
    e.parties += 1;
    o.hote.soigner?.();
    appliquerBonus(o);
    const m = C.effetsMeta(d, e.ameliorations);
    const cadeaux = [...m.objets.map((x) => ({ type: 'objet', action: 'donner', objet: x.objet, nombre: x.nombre })), ...(m.argent ? [{ type: 'argent', action: 'donner', montant: m.argent }] : [])];
    if (cadeaux.length && o.jouer) await o.jouer(cadeaux);
    o.hote.reagir?.('roguelite_debut', { graine });
    const a = arrivee(o, run, 0, null);
    await o.hote.teleporter?.(a.carte, a.x, a.y, a.direction);
    return { ok: true, graine };
  }
  async function suivant(o) {
    const e = o.etat, run = e.run, d = defs(o.jeu), R = d.reglages;
    if (!run) { await o.narrer?.('Il n\'y a pas de partie en cours.'); return { ok: false }; }
    if (salleCourante(o) && !salleCourante(o).vide) { await o.narrer?.('Il reste des ennemis dans la salle.'); return { ok: false }; }
    const gain = gagner(o, R.monnaie_etage);
    if (run.etage >= R.etages) {
      const [lignes, fini] = finir(o, 'victoire');
      if (fini.retour) await o.hote.teleporter?.(fini.retour.carte, fini.retour.x, fini.retour.y, fini.retour.direction);
      for (const l of lignes) await o.narrer?.(l);
      return { ok: true, victoire: true };
    }
    run.etage += 1;
    const erreur = batirEtage(o, run);
    if (erreur) { o.hote.message?.(erreur); run.etage -= 1; await o.narrer?.(erreur); return { ok: false, erreur }; }
    e.record = Math.max(e.record, run.etage);
    o.hote.reagir?.('roguelite_etage', { etage: run.etage });
    const a = arrivee(o, run, 0, null);
    await o.hote.teleporter?.(a.carte, a.x, a.y, a.direction);
    o.hote.annoncer?.(`Étage ${run.etage}`, gain ? `+${gain} ${R.monnaie}` : '');
    return { ok: true, etage: run.etage };
  }
  async function perk(o) {
    const run = o.etat.run, d = defs(o.jeu), ui = o.hote.ui;
    if (!run) { await o.narrer?.('Ce pouvoir ne sert que pendant une partie.'); return null; }
    const choix = o.c?.mode === 'choix';
    const ids = C.tirerPerks(d, o.etat, choix ? 3 : 1, hasardRun(run, 'perk'));
    if (!ids.length) { await o.narrer?.('Il n\'y a plus rien à prendre.'); return null; }
    let id = ids[0];
    if (choix && ids.length > 1 && ui?.liste) {
      const k = await ui.liste({ titre: 'Choisis un perk', annulable: false, large: true, items: ids.map((x) => { const p = d.perks.get(x); return { texte: p.nom, detail: `${NOM_RARETE[p.rarete]} · ${p.description}`, image: p.icone, etiquette: run.perks[x] ? `${run.perks[x]}/${p.max}` : '' }; }) });
      id = ids[Number.isInteger(k) ? k : 0];
    }
    const p = donnerPerk(o, id);
    if (p && o.c?.annoncer !== false) await o.narrer?.(direPerk(p, run));
    return p ? { perk: p.id } : null;
  }
  async function boutique(o) {
    const run = o.etat.run, d = defs(o.jeu), ui = o.hote.ui;
    if (!run || !ui?.liste) { await o.narrer?.('La boutique est fermée.'); return null; }
    const cle = String(run.salle);
    if (!run.boutiques[cle]) run.boutiques[cle] = { perks: C.tirerPerks(d, o.etat, 3, hasardRun(run, 'boutique')), achetes: [] };
    const b = run.boutiques[cle];
    const monnaie = o.jeu.donnees.reglages?.reglages?.monnaie || '₽';
    for (;;) {
      const items = b.perks.map((x) => {
        const p = d.perks.get(x), prix = C.prixPerk(d, p), pris = b.achetes.includes(x);
        return { texte: p.nom, detail: `${NOM_RARETE[p.rarete]} · ${p.description}`, image: p.icone, etiquette: pris ? 'Vendu' : `${prix} ${monnaie}`, desactive: pris || o.partie.argent < prix };
      });
      const k = await ui.liste({ titre: 'Boutique', entete: `${o.partie.argent} ${monnaie}`, items, annulable: true, large: true });
      if (!Number.isInteger(k)) return { achetes: b.achetes.length };
      const id = b.perks[k], p = d.perks.get(id), prix = C.prixPerk(d, p);
      if (b.achetes.includes(id) || o.partie.argent < prix) continue;
      if (o.jouer) await o.jouer([{ type: 'argent', action: 'retirer', montant: prix }]);
      b.achetes.push(id);
      donnerPerk(o, id);
      await o.narrer?.(direPerk(p, run));
    }
  }
  async function ameliorations(o) {
    const e = o.etat, d = defs(o.jeu), R = d.reglages, ui = o.hote.ui;
    if (!ui?.liste) return null;
    const liste = [...d.ameliorations.values()];
    if (!liste.length) { await o.narrer?.('Il n\'y a rien à améliorer.'); return null; }
    let achats = 0;
    for (;;) {
      const items = liste.map((a) => {
        const n = e.ameliorations[a.id] || 0, max = n >= a.niveau_max, cout = C.coutAmelioration(a, n);
        return { texte: a.nom, detail: a.description, image: a.icone, etiquette: max ? `${n}/${a.niveau_max} · max` : `${n}/${a.niveau_max} · ${cout} ${R.monnaie}`, desactive: max || e.monnaie < cout };
      });
      const k = await ui.liste({ titre: 'Améliorations', entete: `${e.monnaie} ${R.monnaie}`, items, annulable: true, large: true });
      if (!Number.isInteger(k)) return { achats };
      const a = liste[k], n = e.ameliorations[a.id] || 0, cout = C.coutAmelioration(a, n);
      if (n >= a.niveau_max || e.monnaie < cout) continue;
      e.monnaie -= cout;
      e.ameliorations[a.id] = n + 1;
      achats += 1;
      if (e.run) appliquerBonus(o);
      o.hote.reagir?.('roguelite_amelioration', { amelioration: a.id, niveau: n + 1 });
    }
  }
  async function abandonner(o) {
    const [lignes, fini] = finir(o, 'abandon');
    if (!fini) return { ok: false };
    if (fini.retour) await o.hote.teleporter?.(fini.retour.carte, fini.retour.x, fini.retour.y, fini.retour.direction);
    for (const l of lignes) (o.narrer ? await o.narrer(l) : o.hote.annoncer?.(l));
    return { ok: true };
  }

  // La mini-carte de l'étage, en haut à droite : les salles vues et celles qu'on devine derrière leurs portes.
  const COULEURS = { depart: '#7fb2ff', combat: '#c8c8d0', tresor: '#ffd84a', boutique: '#6ad0ff', repos: '#6ee08a', boss: '#ff5a5a' };
  function carteMini(o) {
    const run = o.etat.run, ctx = o.ctx;
    const connues = new Set();
    run.salles.forEach((s, i) => { if (s.vue) { connues.add(i); for (const c of C.COTES) if (s.liens[c] >= 0) connues.add(s.liens[c]); } });
    const k = 7, marge = 4;
    const maxX = Math.max(...run.salles.map((s) => s.x)), maxY = Math.max(...run.salles.map((s) => s.y));
    const largeur = Math.max((maxX + 1) * k, 44), hauteur = (maxY + 1) * k;
    const bx = o.largeur - marge - largeur - 6, by = marge;
    const x0 = bx + 3 + Math.floor((largeur - (maxX + 1) * k) / 2), y0 = by + 14;
    ctx.save();
    ctx.fillStyle = 'rgba(10, 12, 20, 0.62)';
    ctx.fillRect(bx, by, largeur + 6, hauteur + 28);
    ctx.font = '10px "Jersey 10", monospace';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#e8e8f0';
    ctx.fillText(`Étage ${run.etage}`, bx + 3, by + 2);
    for (const i of connues) {
      const s = run.salles[i], x = x0 + s.x * k, y = y0 + s.y * k;
      for (const c of ['e', 's']) if (s.liens[c] >= 0 && connues.has(s.liens[c])) { ctx.fillStyle = '#6a6a78'; if (c === 'e') ctx.fillRect(x + k - 2, y + 2, 2, 2); else ctx.fillRect(x + 2, y + k - 2, 2, 2); }
      ctx.fillStyle = s.vue ? (i === run.salle ? '#ffffff' : '#5a5a68') : 'rgba(90, 90, 104, 0.45)';
      ctx.fillRect(x, y, k - 2, k - 2);
      if (s.type !== 'combat' && (s.vue || s.type === 'boss')) { ctx.fillStyle = COULEURS[s.type]; ctx.fillRect(x + 1, y + 1, k - 4, k - 4); }
    }
    // La monnaie du roguelite : un petit losange doré et le nombre.
    const ly = y0 + hauteur + 4;
    ctx.fillStyle = '#ffd84a';
    ctx.fillRect(bx + 5, ly + 1, 1, 5); ctx.fillRect(bx + 4, ly + 2, 3, 3); ctx.fillRect(bx + 3, ly + 3, 5, 1);
    ctx.fillText(String(o.etat.monnaie), bx + 11, ly - 2);
    ctx.restore();
  }

  Modules.enregistrer({
    id: 'roguelite',
    preparer(o) { preparer(o); appliquerBonus(o); },
    entrerCarte(o) {
      preparerPortes(o, o.carte);
      tempsSalle = 0;
      const i = salleIci(o, o.carte);
      if (i >= 0) { o.etat.run.salle = i; o.etat.run.salles[i].vue = true; }
    },
    avancer(o) {
      const i = salleIci(o, o.carte);
      if (i < 0) return;
      const s = o.etat.run.salles[i];
      if (s.vide) return;
      tempsSalle += o.dt;
      if (tempsSalle > 0.3 && (o.hote.ennemis?.() || 0) === 0) {
        s.vide = true;
        o.hote.rafraichir?.();
        o.hote.reagir?.('roguelite_salle', { type: s.type, etage: o.etat.run.etage });
      }
    },
    // Les ennemis d'une salle : aucun si elle est vidée ; ceux de l'étage (etage_min), plus nombreux plus bas.
    rencontres(o) {
      const i = salleIci(o, o.carte);
      if (i < 0) return undefined;
      const run = o.etat.run;
      if (run.salles[i].vide) return [];
      const k = 1 + ((run.etage - 1) * defs(o.jeu).reglages.renfort) / 100;
      return o.liste.filter((r) => !(Number(r.etage_min) > run.etage) && !(Number(r.etage_max) > 0 && run.etage > Number(r.etage_max)))
        .map((r) => (estBoss(o.jeu, r.ennemi) ? r : { ...r, nombre: Math.max(1, Math.round((Number(r.nombre) || 1) * k)) }));
    },
    bloque(o, x, y) {
      if (portesIci.carte !== o.carte || !portesIci.cases.size) return false;
      const c = portesIci.cases.get(y * o.carte.largeur + x);
      if (!c) return false;
      const s = salleCourante(o);
      return !s || s.liens[c] < 0 || !s.vide;
    },
    teleporteur(o, x, y) {
      if (portesIci.carte !== o.carte) return null;
      const c = portesIci.cases.get(y * o.carte.largeur + x);
      const run = o.etat.run, s = salleCourante(o);
      if (!c || !s || !s.vide || s.liens[c] < 0) return null;
      return arrivee(o, run, s.liens[c], C.OPPOSE[c]);
    },
    dessiner(o) {
      const run = o.etat.run;
      if (!run || salleIci(o, o.carte) < 0) return;
      if (o.profondeur === 'dessus') { if (defs(o.jeu).reglages.carte_mini) carteMini(o); return; }
      const s = salleCourante(o), t = o.taille, mur = defs(o.jeu).reglages.tuile_mur;
      for (const [idx, c] of portesIci.cases) {
        const x = idx % o.carte.largeur, y = Math.floor(idx / o.carte.largeur), sx = x * t - o.cam.x, sy = y * t - o.cam.y;
        if (s.liens[c] < 0) {
          if (mur >= 0) o.tuile(mur, x, y);
          else { o.ctx.fillStyle = '#26232c'; o.ctx.fillRect(sx, sy, t, t); o.ctx.fillStyle = '#3a3642'; o.ctx.fillRect(sx + 1, sy + 1, t - 2, t - 2); o.ctx.fillStyle = '#1a181f'; o.ctx.fillRect(sx, sy + Math.floor(t / 2), t, 1); }
        } else if (!s.vide) {
          o.ctx.fillStyle = 'rgba(20, 16, 12, 0.55)'; o.ctx.fillRect(sx, sy, t, t);
          o.ctx.fillStyle = '#c89a4a';
          const vert = c === 'n' || c === 's';
          for (let k = 2; k < t; k += 4) { if (vert) o.ctx.fillRect(sx + k, sy, 2, t); else o.ctx.fillRect(sx, sy + k, t, 2); }
        }
      }
    },
    apresCombat(o) {
      if (!o.etat.run) return [];
      if (o.issue === 'victoire' && o.sorte !== 'temps_reel') gagner(o, defs(o.jeu).reglages.monnaie_ennemi);
      if (o.issue !== 'defaite') return [];
      const [lignes, fini] = finir(o, 'defaite');
      if (fini?.retour) o.etat.reveil = fini.retour;
      return lignes;
    },
    // Saga 1.14 : les moments du temps réel (un ennemi vaincu).
    moment(o) {
      if (!o.etat.run || o.nom !== 'ennemi_vaincu') return;
      gagner(o, defs(o.jeu).reglages.monnaie_ennemi);
      const vol = C.effetsPerks(defs(o.jeu), o.etat.run.perks).volDeVie;
      if (vol > 0) o.hote.soigner?.(vol);
    },
    reveil(o) {
      const r = o.etat.reveil;
      delete o.etat.reveil;
      return r && typeof r.carte === 'string' ? r : null;
    },
    commandes: {
      roguelite_partir: partir,
      roguelite_suivant: suivant,
      roguelite_perk: perk,
      roguelite_boutique: boutique,
      roguelite_ameliorations: ameliorations,
      roguelite_abandonner: abandonner,
      // Une fontaine, un feu de camp dans une salle de repos : soigne sans changer le point de réveil.
      async roguelite_repos(o) {
        o.hote.soigner?.();
        if (o.c?.annoncer !== false) await o.narrer?.('Tu reprends des forces. Tous tes cœurs sont revenus.');
        return { ok: true };
      },
    },
    condition(o, cond) {
      const e = o.etat, run = e.run;
      switch (cond.type) {
        case 'roguelite_en_partie': return Boolean(run) === (cond.valeur !== false);
        case 'roguelite_salle_vide': return Boolean(salleCourante(o)?.vide) === (cond.valeur !== false);
        case 'roguelite_etage': return Boolean(run) && run.etage >= (Number(cond.min) || 1);
        case 'roguelite_amelioration': return (e.ameliorations[cond.amelioration] || 0) >= Math.max(1, Number(cond.min) || 1);
        case 'roguelite_monnaie': return e.monnaie >= (Number(cond.min) || 0);
        case 'roguelite_perk': return Boolean(run?.perks?.[cond.perk]);
        default: return undefined;
      }
    },
    actionsPause(o) {
      if (!o.etat.run) return [];
      return [['perks', 'Perks de la partie', 'sparkle'], ['abandon', 'Abandonner la partie', 'sign-out']];
    },
    async agirPause(o, id) {
      const run = o.etat.run, d = defs(o.jeu), ui = o.hote.ui;
      if (!run || !ui?.liste) return;
      if (id === 'perks') {
        const ids = Object.keys(run.perks);
        await ui.liste({ titre: `Perks · étage ${run.etage} · graine ${run.graine}`, items: ids.length ? ids.map((x) => { const p = d.perks.get(x); return { texte: p?.nom || x, detail: p?.description || '', image: p?.icone || '', etiquette: p && p.max > 1 ? `${run.perks[x]}/${p.max}` : '' }; }) : [{ texte: 'Aucun perk pour l\'instant', desactive: true }], annulable: true, large: true });
      } else if (id === 'abandon') {
        const k = await ui.liste({ titre: 'Abandonner la partie ?', note: 'Tu gardes la monnaie gagnée, mais tu perds tes perks.', items: [{ texte: 'Continuer la partie' }, { texte: 'Abandonner' }], annulable: true });
        if (k === 1) await abandonner(o);
      }
    },
    pourScript(o) {
      const e = o.etat, run = e.run, s = salleCourante(o);
      return { en_partie: Boolean(run), etage: run?.etage || 0, graine: run?.graine || 0, monnaie: e.monnaie, perks: { ...(run?.perks || {}) }, ameliorations: { ...e.ameliorations }, parties: e.parties, victoires: e.victoires, record: e.record, salle: s ? { type: s.type, vide: s.vide } : null };
    },
  });
})();
