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
// Saga 1.9 : on les voit aller et venir (promeneurs) : ils sortent de chez eux, vont travailler, flânent et
// rentrent, par le plus court chemin (moteur/chemins.js, prêté par hote.chemin). Chaque pas use la case
// (usure, gardée dans la partie) : l'herbe se tasse, puis un sentier se dessine, et les habitants préfèrent
// les cases déjà usées. Un sentier qu'on ne prend plus repousse, nuit après nuit.
//
// Saga 1.10 : quand le jeu a une horloge, ils suivent un emploi du temps (horaires) : au travail de
// heure_travail à heure_fin (avec quelques pas dehors de temps en temps), libres avant et après (ils
// flânent, rendent visite à un voisin, rentrent), et chez eux de heure_coucher à heure_lever.

(() => {
  const C = GestionCalcul;
  // Les définitions, lues une fois par jeu.
  const cache = new WeakMap();
  const defs = (jeu) => { if (!cache.has(jeu)) cache.set(jeu, C.definitions(jeu.donnees, jeu.tampons)); return cache.get(jeu); };
  // Remplacer l'état du module par un état neuf (o.etat est l'objet de la partie : on garde le même).
  const poser = (o, neuf) => { for (const k of Object.keys(o.etat)) delete o.etat[k]; Object.assign(o.etat, neuf); };
  const etatDe = (o) => C.normaliser(defs(o.jeu), o.etat);

  // Saga 1.13 : l'apparence d'une ressource dans les menus : son icône, sinon celle de l'objet qui la
  // représente (ressource.objet), sinon une pastille de couleur avec son initiale.
  function apparence(o, d, r) {
    const def = d.ressources.get(r);
    const objet = def?.objet ? (o.jeu.donnees?.objets?.objets || []).find((x) => x.id === def.objet) : null;
    const image = def?.icone || objet?.icone || '';
    return image ? { image } : d.reglages.pastilles ? { pastille: C.nomRessource(d, r) } : {};
  }
  const signe = (k) => (k > 0 ? `+${k}` : k < 0 ? `−${-k}` : '±0');
  const pluriel = (n, mot) => `${n} ${mot}${n > 1 && !/[sx]$/.test(mot) ? 's' : ''}`;
  // Ce qui a bougé pour une ressource, en mots : « 6 produits · 3 mangés » (les mots : réglage textes).
  const raisons = (d, b) => { const T = d.reglages.textes; return [b.produit ? pluriel(b.produit, T.produit) : '', b.mange ? pluriel(b.mange, T.mange) : '',
    b.consomme ? pluriel(b.consomme, T.utilise) : '', b.perdu ? pluriel(b.perdu, T.perdu) : ''].filter(Boolean).join(' · '); };

  // Ce que font n bâtiments d'un type, en mots : « loge 2 · produit 3 Blé par nuit (1 ouvrier) ».
  function role(d, def, n = 1) {
    if (!def) return '';
    const prod = Object.keys(def.production).length ? `produit ${C.dire(d, Object.fromEntries(Object.entries(def.production).map(([r, q]) => [r, q * n])))} par nuit` : '';
    const conso = Object.keys(def.consommation).length ? `avec ${C.dire(d, Object.fromEntries(Object.entries(def.consommation).map(([r, q]) => [r, q * n])))}` : '';
    return [def.logement ? `loge ${def.logement * n}` : '', [prod, conso].filter(Boolean).join(' '), prod && def.ouvriers ? `${def.ouvriers * n} ouvrier${def.ouvriers * n > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ');
  }

  // Les bâtiments, regroupés : ceux qui sont finis par type (« Maison ×2 »), puis chaque chantier.
  function lignesBatiments(d, e) {
    const finis = new Map();
    for (const b of e.batiments) if (b.etat === 'fini') finis.set(b.type, (finis.get(b.type) || 0) + 1);
    const out = [];
    for (const [type, n] of finis) {
      const def = d.batiments.get(type);
      const rep = def?.repos;
      out.push({ texte: n > 1 ? `${C.nomBatiment(d, type)} ×${n}` : C.nomBatiment(d, type), sous: role(d, def, n), detail: rep ? (rep.quand === 'matin' ? 'repos chaque matin' : 'lieu de repos') : d.reglages.textes.termine });
    }
    // Les chantiers : regroupés eux aussi, par type et par nuits qui restent.
    const chantiers = new Map();
    for (const b of e.batiments) if (b.etat !== 'fini') { const k = `${b.type}:${b.reste}`; chantiers.set(k, { type: b.type, reste: b.reste, n: (chantiers.get(k)?.n || 0) + 1 }); }
    for (const { type, reste, n } of chantiers.values()) {
      out.push({ texte: n > 1 ? `${C.nomBatiment(d, type)} ×${n}` : C.nomBatiment(d, type), sous: d.reglages.textes.chantier, detail: reste > 1 ? `encore ${reste} nuits` : d.reglages.textes.fini_demain, ton: 'doux' });
    }
    return out;
  }

  // L'écran du domaine : le jour, le stock, les habitants et les bâtiments (un écran à lire).
  // Saga 1.13 : de vrais titres de section, les icônes du stock, et (prevision) ce que la nuit va changer.
  async function ecran(o) {
    const ui = o.hote?.ui;
    if (!ui) return;
    const d = defs(o.jeu);
    const e = etatDe(o);
    const cap = C.capacite(d);
    const section = (texte, detail = '') => ({ texte, detail, section: true });
    // La nuit qui vient, calculée sur une copie (rien ne change pour de vrai).
    const nuit = d.reglages.prevision ? C.finDeJournee(d, e, e.resolu + 1) : null;
    const T = d.reglages.textes;
    const items = [section(T.stock, cap ? `${cap} au plus de chaque` : '')];
    const ressources = [...new Set([...d.ressources.keys(), ...Object.keys(e.stock)])].filter((r) => e.stock[r] || d.ressources.has(r));
    if (!ressources.length) items.push({ texte: T.vide, ton: 'doux' });
    for (const r of ressources) {
      const b = nuit?.bilan[r];
      const k = b ? b.apres - b.avant : 0;
      items.push({ texte: C.nomRessource(d, r), ...apparence(o, d, r), detail: cap ? `${e.stock[r] || 0} / ${cap}` : String(e.stock[r] || 0),
        sous: b && (k || raisons(d, b)) ? `${T.cette_nuit} : ${signe(k)}${raisons(d, b) ? ` (${raisons(d, b)})` : ''}` : '' });
    }
    // Les habitants : seulement si le jeu s'en sert (des logements, des ouvriers ou des habitants au départ).
    const em = C.emplois(d, e);
    if (em.habitants || em.logement || [...d.batiments.values()].some((b) => b.ouvriers)) {
      items.push(section(T.habitants));
      const place = em.logement - em.habitants;
      items.push({ texte: T.loges, detail: `${em.habitants} / ${em.logement}`, sous: place > 0 ? `${pluriel(place, 'place')} pour de nouveaux venus` : em.logement ? 'tout est occupé : un nouveau logement en attirerait d\'autres' : 'aucun logement pour l\'instant' });
      if (em.demandes) items.push({ texte: T.travail, detail: `${Math.min(em.demandes, em.habitants - em.libres)} / ${em.demandes}`, sous: em.libres ? `${pluriel(em.libres, 'habitant')} sans travail` : '' });
      if (Object.keys(d.reglages.repas).length && em.habitants) {
        const faut = Object.fromEntries(Object.entries(d.reglages.repas).map(([r, k]) => [r, k * em.habitants]));
        const manque = Object.fromEntries(Object.entries(faut).map(([r, k]) => [r, k - (e.stock[r] || 0)]).filter(([, k]) => k > 0));
        items.push({ texte: T.repas, detail: C.dire(d, faut) || 'rien', ...(Object.keys(manque).length ? { ton: 'alerte', sous: `il manque ${C.dire(d, manque)}` } : {}) });
      }
    }
    // Saga 1.11 : les bonus du groupe en cours (des bains, d'un repas).
    const bonus = Array.isArray(o.partie.bonus) ? o.partie.bonus : [];
    if (bonus.length) {
      items.push(section(T.groupe));
      for (const b of bonus) items.push({ texte: b.nom, detail: `${Bonus.dire(b, o.hote?.nomsStats?.() || {})}${Bonus.duree(b) ? ` · ${Bonus.duree(b)}` : ''}` });
    }
    items.push(section(T.batiments, e.batiments.length ? String(e.batiments.length) : ''));
    const bat = lignesBatiments(d, e);
    if (!bat.length) items.push({ texte: T.vide, ton: 'doux' });
    items.push(...bat);
    await ui.liste({ titre: d.reglages.nom, entete: `Jour ${Number(o.partie.jour) || 1}`, items, annulable: true, lecture: true });
  }

  // Saga 1.13 : le rapport du matin, en lignes de menu : le bilan du stock (rapport_bilan), puis le reste.
  function rapport(o, d, r) {
    const out = [];
    const bilan = Object.entries(r.bilan).filter(([, b]) => b.apres !== b.avant || raisons(d, b));
    if (d.reglages.rapport_bilan && bilan.length) {
      out.push({ texte: d.reglages.textes.rapport_stock, section: true });
      for (const [res, b] of bilan) {
        const k = b.apres - b.avant;
        out.push({ texte: C.nomRessource(d, res), ...apparence(o, d, res), detail: signe(k), ton: k > 0 ? 'plus' : k < 0 ? 'moins' : '', sous: `${raisons(d, b)} · il y en a ${b.apres}` });
      }
      if (r.evenements.length) out.push({ texte: d.reglages.textes.rapport_domaine || d.reglages.nom, section: true });
      for (const x of r.evenements) out.push({ texte: x.texte, ton: x.ton });
      return out;
    }
    // Sans bilan : la ligne de production, puis le reste (comme avant Saga 1.13).
    const production = r.lignes.length > r.evenements.length ? [{ texte: r.lignes[0] }] : [];
    return [...production, ...r.evenements.map((x) => ({ texte: x.texte, ton: x.ton }))];
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

  // --- Saga 1.9 : les habitants qu'on voit aller et venir ---
  const SECONDES_PAR_CASE = 0.42;
  const COULEURS = ['#8fd18a', '#e0a35a', '#9ab8f0', '#e88fb0', '#d8d070', '#b0a0e8', '#80d0c8', '#f0b090'];
  const hasard = (a, b) => a + Math.random() * (b - a);
  let foule = null; // { carte, cle, gens } : pas sauvé, refait en arrivant sur la carte
  // La case par où l'on entre dans un bâtiment fini : sa porte, sinon devant le milieu de sa rangée du bas.
  const entreeDe = (b, def) => (def.porte ? { x: b.x + def.porte.x, y: b.y + def.porte.y } : { x: b.x + Math.floor(def.largeur / 2), y: b.y + def.hauteur });
  // Les habitants visibles sur la carte : un logement chacun (les maisons de la carte, dans l'ordre), et un
  // travail pour les premiers (les bâtiments qui demandent des ouvriers, dans l'ordre de construction).
  function composer(o, d, per = null) {
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
      const m = maisons[i], w = travaux[i] || null;
      // Saga 1.10 : en arrivant sur la carte, chacun est où l'heure le veut : au travail pendant le travail,
      // sinon chez lui (la nuit, il y reste).
      const p = per === 'travail' && w ? w : m;
      gens.push({ maison: m, travail: w, x: p.x, y: p.y, de: null, t: 0, chemin: [], dedans: true, attente: hasard(0.3, 6), ensuite: w ? 'travail' : 'flaner',
        periode: per, direction: 'bas', pas: 0, couleur: COULEURS[i % COULEURS.length] });
    }
    // Les portes de tous les bâtiments finis : on y rend visite le soir.
    const lieux = finis.map((b) => entreeDe(b, d.batiments.get(b.type)));
    foule = { carte: carte.id, cle, gens, lieux };
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
  const memeCase = (p, h) => Boolean(p) && p.x === h.x && p.y === h.y;
  // Arrivé au bout de son chemin : chez lui, au travail ou chez un voisin, il entre ; ailleurs, il reste un
  // peu là. per : la période de l'emploi du temps (C.periode), ou null sans horloge.
  function arriver(f, h, per) {
    if (memeCase(h.maison, h)) {
      h.dedans = true;
      h.attente = per === 'nuit' ? hasard(3, 6) : hasard(4, 9);
      h.ensuite = h.travail ? 'travail' : 'flaner';
    } else if (memeCase(h.travail, h)) {
      h.dedans = true;
      h.attente = per === 'travail' ? hasard(18, 35) : per ? hasard(0.5, 2) : hasard(5, 10);
      h.ensuite = 'flaner';
    } else if (per === 'libre' && f.lieux.some((p) => memeCase(p, h))) {
      h.dedans = true; // une visite
      h.attente = hasard(3, 7);
    } else {
      h.attente = hasard(1, 3.5);
      h.ensuite = Math.random() < 0.35 ? 'flaner' : 'maison';
    }
  }
  // Où il va maintenant : une case, 'rester' (il ne bouge pas), ou null (rien trouvé).
  function viserHabitant(o, f, h, per) {
    const autre = () => { const l = f.lieux.filter((p) => !memeCase(p, h) && !memeCase(p, h.maison)); return l.length ? l[Math.floor(Math.random() * l.length)] : null; };
    // Sans horloge (ou horaires coupé) : il va et vient, maison, travail, flânerie.
    if (per === null) return h.ensuite === 'travail' ? h.travail : h.ensuite === 'maison' ? h.maison : coin(o, h);
    // La nuit : chez lui, et il y reste.
    if (per === 'nuit') return h.dedans && memeCase(h.maison, h) ? 'rester' : h.maison;
    // Au travail : il y va, et de temps en temps sort faire quelques pas devant.
    if (per === 'travail' && h.travail) return h.dedans && memeCase(h.travail, h) ? coin(o, h) : h.travail;
    // Libre (avant et après le travail, ou sans travail) : il sort flâner, rend visite, rentre.
    const r = Math.random();
    if (h.dedans) return r < 0.25 ? autre() || coin(o, h) : coin(o, h);
    return r < 0.4 ? h.maison : r < 0.55 ? autre() || coin(o, h) : coin(o, h);
  }
  function avancerHabitant(o, d, f, h, dt, per) {
    // Saga 1.10 : l'heure passe à une autre période (le travail, la nuit) : il n'attend plus, chacun à son rythme.
    if (per !== h.periode) {
      h.periode = per;
      if (!h.chemin.length) h.attente = Math.min(h.attente, hasard(0.2, 4));
    }
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
      if (!h.chemin.length) arriver(f, h, per);
      return;
    }
    if ((h.attente -= dt) > 0) return;
    const but = viserHabitant(o, f, h, per);
    if (but === 'rester') { h.attente = hasard(2, 5); return; }
    if (but && partir(o, d, h, but)) return;
    // Pas de chemin : il réessaie un peu plus tard (sans horloge, en rentrant).
    h.attente = hasard(1.5, 4);
    if (per === null) h.ensuite = h.ensuite === 'maison' ? 'flaner' : 'maison';
  }

  // --- Saga 1.11 : les bâtiments de repos ---
  // Soigner le groupe et lui donner le bonus du bâtiment (par ce que le moteur prête). → le bonus, ou null.
  function appliquerRepos(o, def) {
    const r = def?.repos;
    if (!r) return null;
    if (r.soigner) o.hote?.soigner?.();
    if (!Object.keys(r.stats).length) return null;
    return o.hote?.bonus?.({ id: `gestion:${def.id}`, nom: r.nom, stats: r.stats, combats: r.combats, nuit: true }) || null;
  }
  // Le bâtiment de repos où se trouve le joueur : la copie de son intérieur (« carte@id du bâtiment »),
  // sinon un bâtiment de repos fini dont la porte mène à cette carte (intérieur partagé).
  function batimentDuLieu(o, d) {
    const id = o.hote?.carte?.id || '';
    const e = etatDe(o);
    const [base, bid] = id.split('@');
    const ici = bid ? e.batiments.find((b) => b.id === bid) : null;
    if (ici && d.batiments.get(ici.type)?.repos) return ici.type;
    const b = e.batiments.find((x) => x.etat === 'fini' && d.batiments.get(x.type)?.repos?.quand === 'visite' && Jeu.baseDe(d.batiments.get(x.type).porte_vers?.carte || '') === base);
    return b ? b.type : '';
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
      // Saga 1.13 : le coût toujours à droite, et dessous ce qu'il apporte (ou ce qui manque).
      const pourquoi = r.ok ? '' : r.raison.replace(`${def.nom} : `, '').replace(`Pour ${def.nom}, `, '');
      return { texte: def.nom, detail: `${coutTexte(d, def)}${def.jours ? ` · ${def.jours} nuit${def.jours > 1 ? 's' : ''}` : ''}`, sous: pourquoi || role(d, def) || (def.repos ? (def.repos.quand === 'matin' ? 'repos chaque matin' : 'lieu de repos') : '') || def.description.slice(0, 80), desactive: !r.ok };
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
      // Saga 1.9 : l'usure, sous tout le reste : l'herbe tassée, puis le sentier.
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

    // Saga 1.9 : les habitants marchent (seulement sur la carte du joueur ; ailleurs, on ne les voit pas).
    avancer(o) {
      const d = defs(o.jeu);
      if (!d.reglages.promeneurs || !o.carte) return;
      // Saga 1.10 : leur emploi du temps suit l'horloge du jeu (null : pas d'horloge, ou horaires coupé).
      const per = C.periode(d, o.hote?.heure?.() ?? null);
      const f = composer(o, d, per);
      const dt = Math.min(0.1, Math.max(0, Number(o.dt) || 0));
      for (const h of f.gens) avancerHabitant(o, d, f, h, dt, per);
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
      const d = defs(o.jeu), avant = etatDe(o);
      const r = C.finDeJournee(d, avant, o.jour);
      const neuve = (Number(o.jour) || 0) > avant.resolu;
      poser(o, r.etat);
      const lignes = rapport(o, d, r);
      // Saga 1.11 : les bâtiments de repos « chaque matin » (une cuisine, un temple) : leur bonus pour la
      // journée qui commence (le moteur vient d'effacer ceux de la veille).
      if (neuve) for (const { def } of C.reposFinis(d, r.etat, 'matin')) {
        const b = appliquerRepos(o, def);
        if (b) lignes.push(`${def.repos.nom} : ${Bonus.dire(b, o.hote?.nomsStats?.() || {})}${b.combats ? ` pour ${b.combats} combat${b.combats > 1 ? 's' : ''}` : ''} aujourd'hui.`);
      }
      for (const type of r.termines) o.hote.reagir?.('gestion_termine', { batiment: type });
      if (r.arrives) o.hote.reagir?.('gestion_arrivee', { nombre: r.arrives, habitants: r.etat.habitants });
      if (r.partis) o.hote.reagir?.('gestion_depart', { nombre: r.partis, habitants: r.etat.habitants });
      if (r.termines.length) o.hote.rafraichir?.();
      return lignes;
    },

    // Saga 1.13 : le résumé du domaine dans le carnet (touche Tab) : le stock en jetons, et une ligne sur
    // les habitants et les chantiers (carnet_resume, false : rien).
    carnet(o) {
      const d = defs(o.jeu);
      if (!d.reglages.carnet_resume) return [];
      const e = etatDe(o);
      const ressources = [...new Set([...d.ressources.keys(), ...Object.keys(e.stock)])].filter((r) => e.stock[r] || d.ressources.has(r));
      const em = C.emplois(d, e);
      const chantiers = e.batiments.filter((b) => b.etat !== 'fini').length;
      const ligne = [em.habitants || em.logement ? `${pluriel(em.habitants, 'habitant')} (${pluriel(em.logement, 'place')})` : '', `${pluriel(e.batiments.length - chantiers, 'bâtiment')}`,
        chantiers ? `${pluriel(chantiers, 'chantier')} en cours` : ''].filter(Boolean).join(' · ');
      return [{ titre: d.reglages.nom, jetons: ressources.map((r) => ({ texte: C.nomRessource(d, r), nombre: e.stock[r] || 0, ...apparence(o, d, r) })), lignes: [{ texte: ligne }] }];
    },

    // Saga 1.11 : après un combat, le butin va au stock (butin_au_stock), et une défaite coûte au domaine
    // (perte_defaite, 0 par défaut).
    apresCombat(o) {
      const d = defs(o.jeu), lignes = [];
      if ((o.issue === 'victoire' || o.issue === 'capture') && d.reglages.butin_au_stock && o.partie.sac) {
        const r = C.deposer(d, etatDe(o), o.partie.sac);
        if (Object.keys(r.depose).length) {
          poser(o, r.etat);
          for (const k of Object.keys(o.partie.sac)) delete o.partie.sac[k];
          Object.assign(o.partie.sac, r.sac);
          lignes.push(`Au stock du domaine : ${C.dire(d, r.depose)}.`);
        }
      }
      if (o.issue === 'defaite' && d.reglages.perte_defaite) {
        const r = C.perdre(d, etatDe(o), d.reglages.perte_defaite);
        if (Object.keys(r.perdu).length) { poser(o, r.etat); lignes.push(`${d.reglages.nom} a perdu : ${C.dire(d, r.perdu)}.`); }
      }
      if (lignes.length) o.hote?.rafraichir?.();
      return lignes;
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
      // Saga 1.11 : se reposer dans un bâtiment de repos (« visite ») : le groupe est soigné et reçoit son
      // bonus. Sans batiment : celui dont le joueur est à l'intérieur. Branches réussi / raté.
      async gestion_repos(o) {
        const d = defs(o.jeu);
        const type = String(o.c.batiment || '') || batimentDuLieu(o, d);
        const r = type ? C.sereposer(d, etatDe(o), type) : { ok: false, raison: 'Il n\'y a pas de lieu de repos ici.' };
        const dire = async (t) => { if (o.c.annoncer !== false && t) await o.narrer(t); };
        if (!r.ok) { await dire(r.raison); await o.jouer(o.c.rate); return { ok: false }; }
        poser(o, r.etat);
        o.hote.rafraichir?.();
        const def = d.batiments.get(type);
        const b = appliquerRepos(o, def);
        const phrases = [`Tu te reposes : ${def.repos.nom}.`];
        if (def.repos.soigner && o.partie.equipe?.length) phrases.push('Le groupe est en pleine forme !');
        if (b) { const du = Bonus.duree(b); phrases.push(`${Bonus.dire(b, o.hote?.nomsStats?.() || {})}${du ? ` ${du}` : ''}.`); }
        if (Object.keys(def.repos.cout).length) phrases.push(`(${C.dire(d, def.repos.cout)} pris dans le stock.)`);
        await dire(phrases.join(' '));
        await o.jouer(o.c.reussi);
        return { ok: true, batiment: type };
      },
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
