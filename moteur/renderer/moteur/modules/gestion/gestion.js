// Le module « gestion » (Saga 1.5) : un stock commun, des bâtiments qu'on paie et qui se construisent nuit
// après nuit, puis produisent chaque nuit. Rien n'y est propre à un jeu : les ressources, les bâtiments,
// leurs coûts et leurs productions viennent du dossier du jeu (Tafl, onglets Ressources et Bâtiments).
// Une ferme, une colonie, un village, une base : c'est le jeu qui décide.
//
// Les calculs sont dans calcul.js (GestionCalcul), purs et testables sans écran. Ce fichier les branche au
// moteur par le contrat des modules (../MODULES.md) : la fin de journée (commande « dormir »), les
// commandes et conditions des événements, l'écran du domaine (menu de pause), saga.modules.gestion.
//
// Cette première version ne place pas les bâtiments sur la carte : un jeu montre un bâtiment fini avec un
// événement dont une page a la condition « gestion_batiment » (un emplacement fixe). Le placement libre,
// les habitants et leurs emplois viendront ensuite.

(() => {
  const C = GestionCalcul;
  // Les définitions, lues une fois par jeu.
  const cache = new WeakMap();
  const defs = (jeu) => { if (!cache.has(jeu)) cache.set(jeu, C.definitions(jeu.donnees)); return cache.get(jeu); };
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

  Modules.enregistrer({
    id: 'gestion',

    nouvellePartie(o) { poser(o, C.etatNeuf(defs(o.jeu))); },
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
    },

    condition(o, cond) {
      const e = etatDe(o);
      if (cond.type === 'gestion_batiment') return C.combien(e, String(cond.batiment || ''), true) >= Math.max(1, Number(cond.min) || 1);
      if (cond.type === 'gestion_chantier') return C.combien(e, String(cond.batiment || '')) > C.combien(e, String(cond.batiment || ''), true);
      if (cond.type === 'gestion_stock') return (e.stock[String(cond.ressource || '')] || 0) >= Math.max(0, Number(cond.min) || 0);
      return undefined;
    },

    actionsPause(o) { const d = defs(o.jeu); return d.reglages.menu ? [['domaine', d.reglages.nom, 'home']] : []; },
    async agirPause(o, choix) { if (choix === 'domaine') await ecran(o); },

    pourScript(o) {
      const e = etatDe(o);
      return { stock: { ...e.stock }, capacite: C.capacite(defs(o.jeu)), batiments: e.batiments.map((b) => ({ id: b.id, type: b.type, etat: b.etat, reste: b.reste })) };
    },
  });
})();
