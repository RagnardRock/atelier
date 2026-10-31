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
// Les habitants et leurs emplois viendront ensuite.

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
    items.push(titre('Bâtiments'));
    if (!e.batiments.length) items.push({ texte: 'Aucun pour l\'instant', desactive: true });
    for (const b of e.batiments) {
      items.push({ texte: C.nomBatiment(d, b.type), detail: b.etat === 'fini' ? 'Terminé' : `Chantier : encore ${b.reste} nuit${b.reste > 1 ? 's' : ''}` });
    }
    await ui.liste({ titre: d.reglages.nom, entete: `Jour ${Number(o.partie.jour) || 1}`, items, annulable: true });
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
      // Le bâtiment qu'on est en train de placer, en transparence sous le rectangle visé.
      if (apercu && o.visee && !sol) {
        const def = d.batiments.get(apercu);
        if (def) dessinerTampon(o, def, def.tampon, o.visee.x, o.visee.y, 'tout', o.visee.ok ? 0.75 : 0.4);
      }
    },

    bloque(o, x, y) {
      const d = defs(o.jeu);
      for (const b of Array.isArray(o.etat.batiments) ? o.etat.batiments : []) {
        if (b.carte !== o.carte.id) continue;
        const def = d.batiments.get(b.type);
        if (!def || x < b.x || y < b.y || x >= b.x + def.largeur || y >= b.y + def.hauteur) continue;
        if (def.porte && x === b.x + def.porte.x && y === b.y + def.porte.y) continue;
        return true;
      }
      return false;
    },
    preparer(o) { poser(o, etatDe(o)); },

    finDeJournee(o) {
      const r = C.finDeJournee(defs(o.jeu), etatDe(o), o.jour);
      poser(o, r.etat);
      for (const type of r.termines) o.hote.reagir?.('gestion_termine', { batiment: type });
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
      return { stock: { ...e.stock }, capacite: C.capacite(defs(o.jeu)), batiments: e.batiments.map((b) => ({ id: b.id, type: b.type, etat: b.etat, reste: b.reste })) };
    },
  });
})();
