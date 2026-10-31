// Le module « gestion » (Saga 1.5) : un stock commun, des bâtiments qu'on paie et qui se construisent nuit
// après nuit, puis produisent chaque nuit. Rien n'y est propre à un jeu : les ressources, les bâtiments,
// leurs coûts et leurs productions viennent du dossier du jeu (Tafl, onglets Ressources et Bâtiments).
// Une ferme, une colonie, un village, une base : c'est le jeu qui décide.
//
// Les calculs sont dans calcul.js (GestionCalcul), purs et testables sans écran. Ce fichier les branche au
// moteur par le contrat des modules (../MODULES.md) : la fin de journée (commande « dormir »), les
// commandes et conditions des événements, l'écran du domaine (menu de pause), saga.modules.gestion.
//
// Les bâtiments se posent librement (Saga 1.5) : le joueur choisit où, dans une zone « constructible » de
// la carte, et le bâtiment est dessiné avec son tampon de Tafl et bloque ses cases (sauf sa porte). Un jeu
// peut aussi construire sans place (commande gestion_construire) et montrer le bâtiment par un événement.
//
// Les habitants (Saga 1.6) : ils logent dans les bâtiments finis (logement), mangent chaque nuit (repas) et
// font tourner les bâtiments qui demandent des ouvriers. Ils arrivent seuls quand il reste de la place et
// que tout le monde a mangé.
//
// Saga 1.7 : on les voit aller et venir (promeneurs) : ils sortent de chez eux, vont travailler, flânent et
// rentrent, par le plus court chemin (moteur/chemins.js, prêté par hote.chemin). Chaque pas use la case
// (usure, gardée dans la partie) : l'herbe se tasse, puis un sentier se dessine, et les habitants préfèrent
// les cases déjà usées. Un sentier qu'on ne prend plus repousse, nuit après nuit.

(() => {
  const C = GestionCalcul;
  // Les définitions, lues une fois par jeu.
  const cache = new WeakMap();
  const defs = (jeu) => { if (!cache.has(jeu)) cache.set(jeu, C.definitions(jeu.donnees, jeu.tampons)); return cache.get(jeu); };
  // Remplacer l'état du module par un état neuf (o.etat est l'objet de la partie : on garde le même).
  const poser = (o, neuf) => { for (const k of Object.keys(o.etat)) delete o.etat[k]; Object.assign(o.etat, neuf); };
  const etatDe = (o) => C.normaliser(defs(o.jeu), o.etat);

  // L'écran du domaine : le jour, le stock et les bâtiments (lecture seule).
  async function ecran(o) {
    const ui = o.hote?.ui;
    if (!ui) return;
    const d = defs(o.jeu);
    const e = etatDe(o);
    const cap = C.capacite(d);
    const titre = (texte) => ({ texte, desactive: true, etiquette: '' });
    const items = [titre('Stock')];
    const ressources = [...new Set([...d.ressources.keys(), ...Object.keys(e.stock)])].filter((r) => e.stock[r] || d.ressources.has(r));
    if (!ressources.length) items.push({ texte: 'Rien pour l\'instant', desactive: true });
    for (const r of ressources) items.push({ texte: C.nomRessource(d, r), detail: cap ? `${e.stock[r] || 0} / ${cap}` : String(e.stock[r] || 0), image: d.ressources.get(r)?.icone || '' });
    // Les habitants : seulement si le jeu s'en sert (des logements, des ouvriers ou des habitants au départ).
    const em = C.emplois(d, e);
    if (em.habitants || em.logement || [...d.batiments.values()].some((b) => b.ouvriers)) {
      items.push(titre('Habitants'));
      items.push({ texte: 'Habitants', detail: `${em.habitants} / ${em.logement} logés` });
      if (em.demandes) items.push({ texte: 'Au travail', detail: `${Math.min(em.demandes, em.habitants - em.libres)} / ${em.demandes} demandés` });
      if (Object.keys(d.reglages.repas).length) items.push({ texte: 'Repas de la nuit', detail: C.dire(d, Object.fromEntries(Object.entries(d.reglages.repas).map(([r, k]) => [r, k * em.habitants]))) || 'rien' });
    }
    items.push(titre('Bâtiments'));
    if (!e.batiments.length) items.push({ texte: 'Aucun pour l\'instant', desactive: true });
    for (const b of e.batiments) {
      items.push({ texte: C.nomBatiment(d, b.type), detail: b.etat === 'fini' ? 'Terminé' : `Chantier : encore ${b.reste} nuit${b.reste > 1 ? 's' : ''}` });
    }
    await ui.liste({ titre: d.reglages.nom, entete: `Jour ${Number(o.partie.jour) || 1}`, items, annulable: true });
  }

  // --- Le passage d'un bâtiment posé (Saga 1.6.1) ---
  // Le masque d'un type de bâtiment : pour chaque case (rangée par rangée), 'bloque', 'libre' ou 'porte'.
  // 'auto' (ou rien de réglé dans Tafl) : les rangées « dessus » du tampon et ses cases vides sont libres,
  // sinon la tuile décide (son passage « libre » laisse passer, le reste bloque) ; sans tampon, tout bloque.
  const masques = new WeakMap();
  function masque(jeu, def) {
    if (!masques.has(jeu)) masques.set(jeu, new Map());
    const cache = masques.get(jeu);
    if (cache.has(def.id)) return cache.get(def.id);
    const t = def.tampon ? jeu.tampons?.get(def.tampon) : null;
    const out = [];
    for (let j = 0; j < def.hauteur; j++) {
      for (let i = 0; i < def.largeur; i++) {
        const k = j * def.largeur + i;
        let v = def.passage?.[k] || 'auto';
        if (def.porte && def.porte.x === i && def.porte.y === j) v = 'porte';
        if (v === 'auto') {
          const n = t && t.largeur === def.largeur ? t.cases[k] : 0;
          if (!t) v = 'bloque';
          else if (j < t.dessus || n < 0) v = 'libre';
          else v = jeu.tuiles?.[n]?.passage === Jeu.PASSAGE.libre ? 'libre' : 'bloque';
        }
        out.push(v);
      }
    }
    cache.set(def.id, out);
    return out;
  }
  // Le bâtiment posé sur la case (x, y) de la carte affichée, avec sa définition, ou null.
  function batimentEn(o, x, y) {
    const d = defs(o.jeu);
    for (const b of Array.isArray(o.etat.batiments) ? o.etat.batiments : []) {
      if (b.carte !== o.carte?.id) continue;
      const def = d.batiments.get(b.type);
      if (def && x >= b.x && y >= b.y && x < b.x + def.largeur && y < b.y + def.hauteur) return { ...b, def };
    }
    return null;
  }

  // --- Saga 1.7 : les habitants qu'on voit aller et venir ---
  const SECONDES_PAR_CASE = 0.42;
  const COULEURS = ['#8fd18a', '#e0a35a', '#9ab8f0', '#e88fb0', '#d8d070', '#b0a0e8', '#80d0c8', '#f0b090'];
  const hasard = (a, b) => a + Math.random() * (b - a);
  let foule = null; // { carte, cle, gens } : pas sauvé, refait en arrivant sur la carte
  // La case par où l'on entre dans un bâtiment fini : sa porte, sinon devant le milieu de sa rangée du bas.
  const entreeDe = (b, def) => (def.porte ? { x: b.x + def.porte.x, y: b.y + def.porte.y } : { x: b.x + Math.floor(def.largeur / 2), y: b.y + def.hauteur });
  // Les habitants visibles sur la carte : un logement chacun (les maisons de la carte, dans l'ordre), et un
  // travail pour les premiers (les bâtiments qui demandent des ouvriers, dans l'ordre de construction).
  function composer(o, d) {
    const carte = o.carte, e = o.etat;
    const finis = (Array.isArray(e.batiments) ? e.batiments : []).filter((b) => b.carte === carte.id && b.etat === 'fini' && d.batiments.has(b.type));
    const maisons = [], travaux = [];
    for (const b of finis) {
      const def = d.batiments.get(b.type);
      for (let k = 0; k < def.logement; k++) maisons.push(entreeDe(b, def));
      if (Object.keys(def.production).length) for (let k = 0; k < def.ouvriers; k++) travaux.push(entreeDe(b, def));
    }
    const n = Math.min(Math.max(0, Math.round(Number(e.habitants) || 0)), maisons.length, d.reglages.promeneurs_max);
    const cle = `${carte.id}|${n}|${finis.map((b) => b.id).join(',')}`;
    if (foule && foule.cle === cle) return foule;
    const gens = [];
    for (let i = 0; i < n; i++) {
      const m = maisons[i];
      gens.push({ maison: m, travail: travaux[i] || null, x: m.x, y: m.y, de: null, t: 0, chemin: [], dedans: true, attente: hasard(0.3, 6), ensuite: travaux[i] ? 'travail' : 'flaner',
        direction: 'bas', pas: 0, couleur: COULEURS[i % COULEURS.length] });
    }
    foule = { carte: carte.id, cle, gens };
    return foule;
  }
  // Les cases où la carte a déjà la tuile du sentier (ou de l'herbe tassée) : un chemin dessiné dans Tafl.
  // L'usure ne s'y dessine pas (elle cacherait le chemin), et les habitants les prennent comme un sentier.
  const dejaSentier = new WeakMap();
  function sentiersDeCarte(d, carte) {
    if (dejaSentier.has(carte)) return dejaSentier.get(carte);
    const tuiles = new Set([d.reglages.tuile_sentier, d.reglages.tuile_usee].filter((n) => n >= 0));
    const out = new Set();
    if (tuiles.size) for (const c of carte.calques || []) if (c.profondeur !== 'dessus') c.cases.forEach((n, i) => { if (tuiles.has(n)) out.add(i); });
    dejaSentier.set(carte, out);
    return out;
  }
  // Ce que coûte une case pour un habitant : moins elle est usée, plus elle coûte (ils suivent les sentiers).
  const coutUsure = (d, e, carte) => {
    const m = e.usure?.[carte.id] || {}, deja = sentiersDeCarte(d, carte);
    return (x, y) => { const i = y * carte.largeur + x; return 1 / (1 + 0.15 * (deja.has(i) ? d.reglages.seuil_sentier : Math.min(m[i] || 0, d.reglages.seuil_sentier))); };
  };
  function partir(o, d, h, vers) {
    const chemin = o.hote?.chemin?.({ x: h.x, y: h.y }, vers, { cout: coutUsure(d, o.etat, o.carte), coutMin: 1 / (1 + 0.15 * d.reglages.seuil_sentier) });
    if (!chemin || !chemin.length) return false;
    h.chemin = chemin;
    h.dedans = false;
    h.t = 0;
    return true;
  }
  // Un coin où flâner : une case où l'on marche, à quelques pas de là.
  function coin(o, h) {
    for (let k = 0; k < 12; k++) {
      const x = h.x + Math.round(hasard(-6, 6)), y = h.y + Math.round(hasard(-5, 5));
      if (x < 0 || y < 0 || x >= o.carte.largeur || y >= o.carte.hauteur || (x === h.x && y === h.y)) continue;
      if (o.hote?.libre?.(x, y) && !batimentEn(o, x, y)) return { x, y };
    }
    return null;
  }
  function avancerHabitant(o, d, h, dt) {
    if (h.chemin.length) {
      const prochaine = h.chemin[0];
      h.t += dt;
      const dx = prochaine.x - h.x, dy = prochaine.y - h.y;
      h.direction = dx > 0 ? 'droite' : dx < 0 ? 'gauche' : dy < 0 ? 'haut' : 'bas';
      if (h.t < SECONDES_PAR_CASE) return;
      h.t = 0;
      h.x = prochaine.x;
      h.y = prochaine.y;
      h.chemin.shift();
      h.pas = (h.pas % 2) + 1;
      // Un pas de plus sur cette case (pas sous un bâtiment : ni sa porte ni son seuil).
      if (!batimentEn(o, h.x, h.y)) C.user(d, o.etat, o.carte.id, h.y * o.carte.largeur + h.x);
      if (h.chemin.length) return;
      // Arrivé : chez lui ou au travail, il entre ; ailleurs, il reste un peu là.
      const chez = (p) => p && p.x === h.x && p.y === h.y;
      if (chez(h.maison)) { h.dedans = true; h.attente = hasard(4, 9); h.ensuite = h.travail ? 'travail' : 'flaner'; }
      else if (chez(h.travail)) { h.dedans = true; h.attente = hasard(5, 10); h.ensuite = 'flaner'; }
      else { h.attente = hasard(1, 3.5); h.ensuite = Math.random() < 0.35 ? 'flaner' : 'maison'; }
      return;
    }
    if ((h.attente -= dt) > 0) return;
    const but = h.ensuite === 'travail' ? h.travail : h.ensuite === 'maison' ? h.maison : coin(o, h);
    if (but && partir(o, d, h, but)) return;
    // Pas de chemin : il réessaie un peu plus tard, en rentrant.
    h.attente = hasard(1.5, 4);
    h.ensuite = h.ensuite === 'maison' ? 'flaner' : 'maison';
  }

  // --- Le placement libre (Saga 1.5) ---
  const constructible = (carte) => (carte?.zones || []).filter((z) => z.type === 'constructible');
  const lieuDe = (o) => {
    const carte = o.hote?.carte;
    const zones = constructible(carte);
    return {
      carte: carte?.id || '',
      constructible: (x, y) => zones.some((z) => x >= z.x && y >= z.y && x < z.x + z.largeur && y < z.y + z.hauteur),
      libre: (x, y) => Boolean(o.hote?.libre?.(x, y)),
    };
  };
  const coutTexte = (d, def) => C.dire(d, def.cout) || 'gratuit';
  let apercu = null; // le type de bâtiment visé en ce moment (dessiné en transparence)

  // Choisir un bâtiment dans la liste (ceux qu'on ne peut pas payer sont grisés). → type, ou null.
  async function choisirBatiment(o) {
    const d = defs(o.jeu), e = etatDe(o), ui = o.hote?.ui;
    const types = [...d.batiments.values()];
    if (!ui || !types.length) return null;
    const items = types.map((def) => {
      const r = C.construire(d, e, def.id);
      return { texte: def.nom, detail: r.ok ? `${coutTexte(d, def)}${def.jours ? ` · ${def.jours} nuit${def.jours > 1 ? 's' : ''}` : ''}` : r.raison.replace(`${def.nom} : `, '').replace(`Pour ${def.nom}, `, ''), desactive: !r.ok };
    });
    const i = await ui.liste({ titre: 'Construire', items, annulable: true, note: 'Le coût est pris dans le stock du domaine.' });
    return i === null || i === undefined || i < 0 ? null : types[i].id;
  }

  // Poser un bâtiment : choisir sa place, le payer, lancer son chantier. → { ok, batiment }
  async function placer(o, type, annoncer = true) {
    const d = defs(o.jeu);
    const dire = async (t) => { if (annoncer) await (o.narrer ? o.narrer(t) : o.hote?.ui?.dire(t)); };
    const lieu = lieuDe(o);
    if (!lieu.carte || !constructible(o.hote?.carte).length) { await dire('On ne peut rien construire ici.'); return { ok: false, batiment: '' }; }
    const essai = C.construire(d, etatDe(o), type);
    if (!essai.ok) { await dire(essai.raison); return { ok: false, batiment: '' }; }
    const def = d.batiments.get(type);
    apercu = type;
    let place;
    try {
      place = await o.hote.viser({ largeur: def.largeur, hauteur: def.hauteur, valide: (x, y) => C.placement(d, etatDe(o), type, lieu, x, y).ok });
    } finally { apercu = null; }
    if (!place) return { ok: false, batiment: '' };
    const r = C.construire(d, etatDe(o), type, { carte: lieu.carte, x: place.x, y: place.y });
    if (!r.ok) { await dire(r.raison); return { ok: false, batiment: '' }; }
    poser(o, r.etat);
    o.hote.rafraichir?.();
    await dire(r.batiment.etat === 'fini' ? `Construction terminée : ${def.nom} !` : `Le chantier commence : ${def.nom} (${def.jours} nuit${def.jours > 1 ? 's' : ''} de travail).`);
    return { ok: true, batiment: r.batiment.id };
  }

  // Dessiner un tampon (ou un simple bloc sans tampon) sur la carte. rangees : 'bas' (sous le joueur),
  // 'haut' (ses rangées « dessus », devant le joueur) ou 'tout'.
  function dessinerTampon(o, def, nomTampon, x, y, rangees, alpha) {
    const t = o.jeu.tampons?.get(nomTampon);
    o.ctx.globalAlpha = alpha;
    if (!t) {
      if (rangees !== 'haut') {
        const s = o.taille;
        o.ctx.fillStyle = 'rgba(150, 105, 60, 0.9)';
        o.ctx.fillRect(x * s - o.cam.x + 1, y * s - o.cam.y + 1, def.largeur * s - 2, def.hauteur * s - 2);
      }
    } else {
      for (let j = 0; j < t.hauteur; j++) {
        const haut = j < t.dessus;
        if ((rangees === 'bas' && haut) || (rangees === 'haut' && !haut)) continue;
        for (let i = 0; i < t.largeur; i++) { const n = t.cases[j * t.largeur + i]; if (n >= 0) o.tuile(n, x + i, y + j); }
      }
    }
    o.ctx.globalAlpha = 1;
  }

  Modules.enregistrer({
    id: 'gestion',

    nouvellePartie(o) { poser(o, C.etatNeuf(defs(o.jeu))); },

    dessiner(o) {
      const d = defs(o.jeu);
      const sol = o.profondeur === 'sol';
      // Saga 1.7 : l'usure, sous tout le reste : l'herbe tassée, puis le sentier.
      const usure = sol && d.reglages.usure ? o.etat.usure?.[o.carte.id] : null;
      if (usure) {
        const s = o.taille, L = o.carte.largeur, ctx = o.ctx, deja = sentiersDeCarte(d, o.carte);
        for (const [i, n] of Object.entries(usure)) {
          if (deja.has(Number(i))) continue;
          const niveau = C.niveauUsure(d, n);
          if (!niveau) continue;
          const x = Number(i) % L, y = Math.floor(Number(i) / L);
          const sx = x * s - o.cam.x, sy = y * s - o.cam.y;
          if (sx < -s || sy < -s || sx > (o.largeur || ctx.canvas.width) || sy > (o.hauteur || ctx.canvas.height)) continue;
          const tuile = niveau === 2 ? d.reglages.tuile_sentier : d.reglages.tuile_usee;
          if (tuile >= 0) { o.tuile(tuile, x, y); continue; }
          // Sans tuile choisie : Saga dessine une terre battue, plus ou moins marquée, avec des grains.
          ctx.fillStyle = niveau === 2 ? 'rgba(178, 138, 82, 0.82)' : 'rgba(150, 128, 72, 0.26)';
          ctx.fillRect(sx, sy, s, s);
          const u = Math.max(1, Math.round(s / 16));
          ctx.fillStyle = niveau === 2 ? 'rgba(120, 88, 48, 0.55)' : 'rgba(140, 110, 60, 0.4)';
          for (let k = 0; k < (niveau === 2 ? 7 : 5); k++) {
            const h = ((Number(i) + 1) * 2654435761 + k * 97531) >>> 0;
            ctx.fillRect(sx + (h % 15) * u, sy + ((h >>> 8) % 15) * u, u, u);
          }
        }
      }
      for (const b of Array.isArray(o.etat.batiments) ? o.etat.batiments : []) {
        if (b.carte !== o.carte.id) continue;
        const def = d.batiments.get(b.type);
        if (!def) continue;
        if (b.etat === 'chantier') {
          // Un chantier : son propre tampon s'il en a un, sinon le bâtiment en transparence.
          if (def.tampon_chantier) dessinerTampon(o, def, def.tampon_chantier, b.x, b.y, sol ? 'bas' : 'haut', 1);
          else if (sol) dessinerTampon(o, def, def.tampon, b.x, b.y, 'tout', 0.45);
        } else dessinerTampon(o, def, def.tampon, b.x, b.y, sol ? 'bas' : 'haut', 1);
      }
      // Saga 1.6.2 : pendant la visée, le reste de la carte s'assombrit et les zones constructibles ressortent,
      // avec un bord en pointillés qui bouge (on voit d'un coup d'œil où l'on peut bâtir).
      if (apercu && o.visee && !sol) {
        const ctx = o.ctx, s = o.taille, W = ctx.canvas.width, H = ctx.canvas.height;
        const zones = constructible(o.carte).map((z) => [z.x * s - o.cam.x, z.y * s - o.cam.y, z.largeur * s, z.hauteur * s]);
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, W, H);
        for (const [x, y, l, h] of zones) ctx.rect(x, y, l, h);
        ctx.fillStyle = 'rgba(10, 14, 30, 0.42)';
        ctx.fill('evenodd');
        ctx.setLineDash([4, 3]);
        ctx.lineDashOffset = -((o.maintenant || 0) / 80) % 7;
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255, 236, 150, 0.95)';
        for (const [x, y, l, h] of zones) ctx.strokeRect(x + 1, y + 1, l - 2, h - 2);
        ctx.restore();
      }
      // Le bâtiment qu'on est en train de placer, en transparence sous le rectangle visé.
      if (apercu && o.visee && !sol) {
        const def = d.batiments.get(apercu);
        if (def) dessinerTampon(o, def, def.tampon, o.visee.x, o.visee.y, 'tout', o.visee.ok ? 0.75 : 0.4);
      }
    },

    // Saga 1.6.1 : case par case, selon le passage du bâtiment (masque) : une ombre ou une case vide du
    // tampon ne bloque plus.
    bloque(o, x, y) {
      const b = batimentEn(o, x, y);
      return Boolean(b && masque(o.jeu, b.def)[(y - b.y) * b.def.largeur + (x - b.x)] === 'bloque');
    },
    // Saga 1.6.1 : la porte d'un bâtiment fini qui mène quelque part (porte_vers : son intérieur). On retient
    // la case d'où vient le joueur, pour l'y ramener (commande gestion_sortir).
    teleporteur(o, x, y) {
      const b = batimentEn(o, x, y);
      if (!b || b.etat !== 'fini' || !b.def.porte_vers) return null;
      if (masque(o.jeu, b.def)[(y - b.y) * b.def.largeur + (x - b.x)] !== 'porte') return null;
      const dir = o.hote?.joueur?.direction || 'haut';
      const [dx, dy] = { haut: [0, -1], bas: [0, 1], gauche: [-1, 0], droite: [1, 0] }[dir] || [0, -1];
      const inverse = { haut: 'bas', bas: 'haut', gauche: 'droite', droite: 'gauche' }[dir] || 'bas';
      o.etat.retour = { carte: o.carte.id, x: x - dx, y: y - dy, direction: inverse };
      // Saga 1.6.1 : sa propre copie de l'intérieur, sauf si le type le partage.
      const v = b.def.porte_vers;
      return b.def.interieur === 'partage' ? v : { ...v, carte: `${Jeu.baseDe(v.carte)}@${b.id}` };
    },
    preparer(o) { poser(o, etatDe(o)); foule = null; },
    entrerCarte() { foule = null; },

    // Saga 1.7 : les habitants marchent (seulement sur la carte du joueur ; ailleurs, on ne les voit pas).
    avancer(o) {
      const d = defs(o.jeu);
      if (!d.reglages.promeneurs || !o.carte) return;
      const f = composer(o, d);
      const dt = Math.min(0.1, Math.max(0, Number(o.dt) || 0));
      for (const h of f.gens) avancerHabitant(o, d, h, dt);
    },
    figurants(o) {
      const d = defs(o.jeu);
      if (!d.reglages.promeneurs || !foule || foule.carte !== o.carte?.id) return [];
      const s = o.jeu.taille;
      return foule.gens.filter((h) => !h.dedans).map((h) => {
        const p = h.chemin[0];
        const k = p ? Math.min(1, h.t / SECONDES_PAR_CASE) : 0;
        return { x: (h.x + (p ? (p.x - h.x) * k : 0)) * s, y: (h.y + (p ? (p.y - h.y) * k : 0)) * s, direction: h.direction,
          pas: p && k < 0.5 ? h.pas : 0, personnage: d.reglages.promeneur_perso, couleur: h.couleur };
      });
    },

    finDeJournee(o) {
      const r = C.finDeJournee(defs(o.jeu), etatDe(o), o.jour);
      poser(o, r.etat);
      for (const type of r.termines) o.hote.reagir?.('gestion_termine', { batiment: type });
      if (r.arrives) o.hote.reagir?.('gestion_arrivee', { nombre: r.arrives, habitants: r.etat.habitants });
      if (r.partis) o.hote.reagir?.('gestion_depart', { nombre: r.partis, habitants: r.etat.habitants });
      if (r.termines.length) o.hote.rafraichir?.();
      return r.lignes;
    },

    commandes: {
      // Construire un bâtiment : payé tout de suite sur le stock. Branches réussi / raté.
      async gestion_construire(o) {
        const d = defs(o.jeu);
        const r = C.construire(d, etatDe(o), String(o.c.batiment || ''));
        if (r.ok) {
          poser(o, r.etat);
          o.hote.rafraichir?.();
          const def = d.batiments.get(r.batiment.type);
          if (o.c.annoncer !== false) await o.narrer(r.batiment.etat === 'fini' ? `Construction terminée : ${def.nom} !` : `Le chantier commence : ${def.nom} (${def.jours} nuit${def.jours > 1 ? 's' : ''} de travail).`);
          await o.jouer(o.c.reussi);
        } else {
          if (o.c.annoncer !== false) await o.narrer(r.raison);
          await o.jouer(o.c.rate);
        }
        return { ok: r.ok, batiment: r.ok ? r.batiment.id : '' };
      },
      // Ajouter ou retirer une ressource du stock.
      async gestion_stock(o) {
        const d = defs(o.jeu);
        const ressource = String(o.c.ressource || '');
        const n = Math.max(1, Math.round(Number(o.c.nombre) || 1));
        const r = C.ajouter(d, etatDe(o), ressource, o.c.action === 'retirer' ? -n : n);
        poser(o, r.etat);
        o.hote.rafraichir?.();
        if (o.c.annoncer !== false && r.change) await o.narrer(r.change > 0 ? `${r.change} ${C.nomRessource(d, ressource)} au stock.` : `${-r.change} ${C.nomRessource(d, ressource)} pris dans le stock.`);
        return { stock: r.etat.stock[ressource] || 0, change: r.change };
      },
      // Saga 1.6 : des habitants arrivent ou partent (une histoire, une famille qui s'installe). Sans
      // forcer, ils ne dépassent pas les logements.
      async gestion_habitants(o) {
        const d = defs(o.jeu);
        const n = Math.max(1, Math.round(Number(o.c.nombre) || 1));
        const r = C.habitants(d, etatDe(o), o.c.action === 'retirer' ? -n : n, Boolean(o.c.forcer));
        poser(o, r.etat);
        o.hote.rafraichir?.();
        if (o.c.annoncer !== false) {
          const k = Math.abs(r.change);
          if (r.change > 0) await o.narrer(k > 1 ? `${k} habitants s'installent au domaine.` : 'Un habitant s\'installe au domaine.');
          else if (r.change < 0) await o.narrer(k > 1 ? `${k} habitants quittent le domaine.` : 'Un habitant quitte le domaine.');
          else if (o.c.action !== 'retirer') await o.narrer('Il n\'y a plus de place pour loger quelqu\'un.');
        }
        return { habitants: r.etat.habitants, change: r.change };
      },
      // Déposer au stock ce que le joueur rapporte dans son sac.
      async gestion_deposer(o) {
        const d = defs(o.jeu);
        const r = C.deposer(d, etatDe(o), o.partie.sac);
        poser(o, r.etat);
        for (const k of Object.keys(o.partie.sac)) delete o.partie.sac[k];
        Object.assign(o.partie.sac, r.sac);
        o.hote.rafraichir?.();
        if (o.c.annoncer !== false) await o.narrer(Object.keys(r.depose).length ? `Tu déposes au stock : ${C.dire(d, r.depose)}.` : 'Tu n\'as rien à déposer.');
        return { depose: r.depose };
      },
      // Saga 1.6.1 : ressortir d'un bâtiment, devant la porte par laquelle le joueur est entré (sur un
      // déclencheur à la sortie de l'intérieur). Sans porte connue : rien (branche raté si besoin).
      async gestion_sortir(o) {
        const r = etatDe(o).retour;
        if (!r) return { ok: false };
        await o.jouer([{ type: 'teleporter', carte: r.carte, x: r.x, y: r.y, direction: r.direction }]);
        return { ok: true };
      },
      // Ouvrir l'écran du domaine.
      async gestion_domaine(o) { await ecran(o); return null; },
      // Saga 1.5 : poser un bâtiment où le joueur veut, dans une zone constructible de la carte. Sans
      // batiment, le joueur le choisit dans la liste. Branches réussi / raté (raté : annulé, ou impossible).
      async gestion_placer(o) {
        const type = String(o.c.batiment || '') || await choisirBatiment(o);
        const r = type ? await placer(o, type, o.c.annoncer !== false) : { ok: false, batiment: '' };
        await o.jouer(r.ok ? o.c.reussi : o.c.rate);
        return r;
      },
    },

    condition(o, cond) {
      const e = etatDe(o);
      if (cond.type === 'gestion_batiment') return C.combien(e, String(cond.batiment || ''), true) >= Math.max(1, Number(cond.min) || 1);
      if (cond.type === 'gestion_chantier') return C.combien(e, String(cond.batiment || '')) > C.combien(e, String(cond.batiment || ''), true);
      if (cond.type === 'gestion_habitants') return (Number(e.habitants) || 0) >= Math.max(0, Number(cond.min) || 0);
      if (cond.type === 'gestion_stock') return (e.stock[String(cond.ressource || '')] || 0) >= Math.max(0, Number(cond.min) || 0);
      return undefined;
    },

    actionsPause(o) {
      const d = defs(o.jeu);
      const out = d.reglages.menu ? [['domaine', d.reglages.nom, 'home']] : [];
      // Construire depuis le menu de pause : seulement sur une carte qui a une zone constructible.
      if (d.reglages.construire_menu && d.batiments.size && constructible(o.hote?.carte).length) out.push(['construire', 'Construire', 'tools']);
      return out;
    },
    async agirPause(o, choix) {
      if (choix === 'domaine') await ecran(o);
      if (choix === 'construire') { const type = await choisirBatiment(o); if (type) await placer(o, type); }
    },

    pourScript(o) {
      const e = etatDe(o);
      const em = C.emplois(defs(o.jeu), e);
      return { stock: { ...e.stock }, capacite: C.capacite(defs(o.jeu)), habitants: em.habitants, logement: em.logement, ouvriers: { demandes: em.demandes, libres: em.libres }, batiments: e.batiments.map((b) => ({ id: b.id, type: b.type, etat: b.etat, reste: b.reste })) };
    },
  });
})();
