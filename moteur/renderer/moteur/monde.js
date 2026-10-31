// Le monde : la partie en cours (ce qu'une sauvegarde gardera) et les questions qu'on pose à une carte
// (cette case est-elle bloquée ? y a-t-il un téléporteur ? qui est là ?).
//
// La partie suit FORMAT.md › « Ce que le moteur garde dans une sauvegarde » : interrupteurs, interrupteurs
// « déjà fait » de chaque événement, quêtes, compteurs, sac, équipe, argent, position. Les scripts des
// événements (scripts.js) la changent ; les conditions des pages se lisent dessus.

const Monde = (() => {
  const { PASSAGE, DIRECTIONS, REBORDS } = Jeu;

  function nouvellePartie(jeu, depart = jeu.depart) {
    const reglages = jeu.donnees.reglages?.reglages || {};
    return {
      version: 1,
      nom: jeu.heros?.nom || 'Héros', // {joueur} dans les dialogues
      interrupteurs: {},   // id → true (les absents sont éteints)
      locaux: {},          // "carte/ev-1" → true
      repousses: {},       // "carte/ev-1" → nuits passées depuis la récolte (Saga 1.6, événements avec repousse_nuits)
      quetes: {},          // id → { etat: 'en_cours' | 'finie', etape }
      compteurs: { captures: 0, dresseurs_battus: 0, sauvages_battus: 0, evolutions: 0, badges: 0, pas: 0 },
      sac: {},             // id d'objet → nombre
      equipe: [],          // les créatures du joueur (voir creatures.js), 6 au plus
      boites: [],          // le PC : celles qui ne tiennent plus dans l'équipe (voir collection.js)
      dex: { vus: {}, pris: {} }, // le Pokédex : les espèces vues et attrapées
      argent: Number(reglages.argent_depart) || 0,
      badges: [],          // les ids des badges reçus (Tafl 0.16) ; compteurs.badges = leur nombre
      tenue: '',           // la tenue du héros (un id de ses tenues), '' = sa tenue de base
      dernierSoin: null,   // où le joueur se réveille après une défaite (la dernière commande « soigner »)
      repousse: 0,         // pas sans rencontres qui restent
      partis: {},          // les héros qui ont quitté le groupe (pack JRPG, commande groupe), tels quels
      temps: (Number(jeu.donnees.reglages?.reglages?.temps?.heure_depart) || 8) * 60, // l'horloge du jeu, en minutes (Saga 0.11)
      musique: null,       // la musique en cours (Saga 0.11), pour la retrouver en chargeant la partie
      variables: variablesDeDepart(jeu), // id → nombre ou texte (Saga 0.12)
      graine: Math.floor(Math.random() * 2147483647), // le hasard des scripts JS (Saga 0.12)
      modules: {},         // l'état de chaque module du jeu, par id (Saga 1.4, modules/MODULES.md)
      jour: 1,             // le numéro du jour (Saga 1.5) : la commande « dormir » passe au suivant
      bonus: [],           // les bonus du groupe (Saga 1.11, moteur/bonus.js) : un bain chaud, un bon repas
      position: { ...depart },
    };
  }

  // Les variables du jeu (Saga 0.12, donnees/variables.json) avec leur valeur de départ.
  function variablesDeDepart(jeu) {
    const out = {};
    for (const v of jeu.donnees.variables?.variables || []) {
      if (v && typeof v.id === 'string' && v.id) out[v.id] = typeof v.defaut === 'number' || typeof v.defaut === 'string' ? v.defaut : 0;
    }
    return out;
  }
  // Comparer une variable (condition « variable ») : en nombres si les deux en sont, sinon en textes
  // (seulement = et ≠ ont un sens pour un texte).
  function comparer(a, op, b) {
    const na = Number(a), nb = Number(b);
    const nombres = a !== '' && b !== '' && Number.isFinite(na) && Number.isFinite(nb);
    if (op === '==' || op === '!=') {
      const egal = nombres ? na === nb : String(a ?? '') === String(b ?? '');
      return op === '==' ? egal : !egal;
    }
    if (!nombres) return false;
    return op === '>=' ? na >= nb : op === '<=' ? na <= nb : op === '>' ? na > nb : op === '<' ? na < nb : false;
  }

  // Un compteur du joueur (FORMAT.md › Conditions › compteur). Ceux de Saga 0.7 se lisent sur la partie :
  // les espèces vues et attrapées (le Pokédex), les quêtes finies.
  function compteur(partie, nom) {
    switch (nom) {
      case 'especes_vues': return Object.keys(partie.dex?.vus || {}).length;
      case 'especes_prises': return Object.keys(partie.dex?.pris || {}).length;
      case 'quetes_finies': return Object.values(partie.quetes || {}).filter((q) => q?.etat === 'finie').length;
      default: return Number(partie.compteurs?.[nom]) || 0;
    }
  }

  // Une condition (FORMAT.md › Conditions), pour l'événement ev de la carte.
  function vraie(cond, partie, carte, ev) {
    if (!cond || typeof cond !== 'object') return true;
    switch (cond.type) {
      case 'interrupteur': return Boolean(partie.interrupteurs[cond.id]) === Boolean(cond.valeur);
      case 'local': return Boolean(partie.locaux[`${carte.id}/${ev?.id}`]) === Boolean(cond.valeur);
      case 'objet': return (partie.sac[cond.objet] || 0) >= (Number(cond.min) || 1);
      // Saga 1.11 : le groupe a ce bonus (par son id ; vide : un bonus, quel qu'il soit).
      case 'bonus': return Array.isArray(partie.bonus) && partie.bonus.some((b) => b && (!cond.id || b.id === cond.id));
      case 'compteur': return compteur(partie, cond.compteur) >= (Number(cond.min) || 0);
      case 'argent': return (partie.argent || 0) >= (Number(cond.min) || 0);
      case 'badge': return (partie.badges || []).includes(cond.badge);
      // Saga 0.12 : une variable comparée à une valeur.
      case 'variable': return comparer(partie.variables?.[cond.id] ?? 0, cond.comparaison || '>=', cond.valeur ?? 0);
      // Le moment de la journée (Saga 0.11) : matin, jour, soir ou nuit, selon l'horloge du jeu.
      case 'moment': return typeof Temps === 'undefined' || Temps.moment(null, partie, cond.moment);
      // Le numéro du jour (Saga 1.5), comparé à une valeur.
      case 'jour': return comparer(Number(partie.jour) || 1, cond.comparaison || '>=', Number(cond.valeur) || 1);
      // Un héros dans le groupe ou la réserve (pack JRPG, Saga 0.8).
      case 'membre': return [...(partie.equipe || []), ...(partie.boites || []).flatMap((b) => b.creatures || [])]
        .some((c) => c && c.heros && c.creature === cond.personnage);
      case 'quete': {
        const q = partie.quetes[cond.quete];
        const etat = q ? q.etat : 'pas_commencee';
        if (etat !== cond.etat) return false;
        return cond.etat !== 'en_cours' || !(cond.etape > 0) || q.etape >= cond.etape;
      }
      default: {
        // Saga 0.13 : une condition du pack de règles du jeu (jdr_perception…), sinon une condition
        // inconnue (Tafl plus récent) qui ne bloque rien.
        const r = conditionPack ? conditionPack(cond, partie) : undefined;
        return r === undefined ? true : Boolean(r);
      }
    }
  }
  // Le moteur branche ici les conditions du pack du jeu en cours (Regles.condition), puis des modules.
  let conditionPack = null;
  const brancherConditions = (f) => { conditionPack = f; };
  // Saga 1.4 : les cases qu'un module bloque (un bâtiment posé en jeu), en plus de collisions.
  let blocage = null;
  const brancherBlocage = (f) => { blocage = f; };
  const bloqueParModule = (carte, x, y) => Boolean(blocage && blocage(carte, x, y));

  // Une condition dite au joueur (Saga 0.7) : le déblocage d'un article de boutique montré grisé.
  // Un interrupteur ne se raconte pas (ce serait dévoiler l'histoire).
  const NOMS_COMPTEURS = {
    captures: 'captures', dresseurs_battus: 'dresseurs battus', sauvages_battus: 'créatures sauvages battues', evolutions: 'évolutions',
    badges: 'badges', pas: 'pas', especes_vues: 'espèces vues', especes_prises: 'espèces attrapées', quetes_finies: 'quêtes finies',
  };
  function decrire(jeu, cond, partie) {
    const liste = (sorte) => jeu.donnees[sorte]?.[sorte] || [];
    const nom = (sorte, id) => liste(sorte).find((x) => x.id === id)?.nom || id;
    switch (cond?.type) {
      case 'compteur': {
        const min = Number(cond.min) || 0;
        return `Après ${min} ${NOMS_COMPTEURS[cond.compteur] || cond.compteur} (${Math.min(min, compteur(partie, cond.compteur))}/${min})`;
      }
      case 'badge': return `Avec le ${(jeu.donnees.reglages?.reglages?.badges || []).find((b) => b.id === cond.badge)?.nom || cond.badge}`;
      case 'objet': return `Avec ${nom('objets', cond.objet)}`;
      case 'argent': return `Avec ${Number(cond.min) || 0} ${jeu.donnees.reglages?.reglages?.monnaie || '₽'}`;
      case 'quete': {
        const q = liste('quetes').find((x) => x.id === cond.quete);
        const titre = q?.titre || cond.quete;
        return cond.etat === 'finie' ? `Après la quête « ${titre} »` : cond.etat === 'en_cours' ? `Pendant la quête « ${titre} »` : 'Bientôt';
      }
      case 'jour': return `À partir du jour ${Number(cond.valeur) || 1}`;
      case 'moment': return { matin: 'Le matin', jour: 'Le jour', soir: 'Le soir', nuit: 'La nuit' }[cond.moment] || 'À un autre moment';
      default: return 'Plus tard dans l\'aventure';
    }
  }

  // La page active : la DERNIÈRE dont toutes les conditions sont vraies, ou null.
  function pageActive(ev, partie, carte) {
    for (let i = ev.pages.length - 1; i >= 0; i--) {
      const p = ev.pages[i];
      if ((p.conditions || []).every((c) => vraie(c, partie, carte, ev))) return p;
    }
    return null;
  }

  // Les obstacles (Saga 0.7, FORMAT.md › Obstacles) : ce qui remplace les CS sur la carte. Un événement
  // de type « obstacle » a obstacle: { sorte: 'couper' | 'briser' | 'pousser', objet, message, repousse }.
  // Couper et briser : avec l'objet, le joueur le fait disparaître (son interrupteur « déjà fait »).
  // Pousser : avec l'objet, le joueur le pousse d'une case en marchant contre lui.
  const SORTES_OBSTACLE = ['couper', 'briser', 'pousser'];
  const obstacle = (ev) => (ev?.type === 'obstacle' && ev.obstacle && SORTES_OBSTACLE.includes(ev.obstacle.sorte) ? ev.obstacle : null);
  const obstacleFranchi = (ev, partie, carte) => obstacle(ev)?.sorte !== 'pousser' && Boolean(obstacle(ev)) && Boolean(partie.locaux[`${carte.id}/${ev.id}`]);

  // Les événements présents sur la carte, avec leur apparence. À refaire après chaque script
  // et à chaque changement de carte. avant : la liste précédente de la même carte, pour garder
  // la place et la direction de ceux qui se sont déplacés (un PNJ qui marche au hasard).
  function evenementsPresents(jeu, carte, partie, avant = []) {
    const out = [];
    for (const ev of carte.evenements) {
      // Un obstacle franchi (Saga 0.7 : arbre coupé, rocher brisé) n'est plus là.
      if (obstacleFranchi(ev, partie, carte)) continue;
      const page = pageActive(ev, partie, carte);
      if (!page || page.cache) continue;
      const perso = jeu.personnages.get(ev.apparence?.personnage || '') || null;
      // Ce qu'on montre (FORMAT.md, apparence) : la tuile de l'événement, sinon le sprite du
      // personnage (Tafl 0.12), sinon sa tuile, sinon le petit bonhomme de Saga.
      let tuile = Number(ev.apparence?.tuile);
      if (!(tuile >= 0) && perso && !perso.sprite && perso.tuile >= 0) tuile = perso.tuile;
      const ancien = avant.find((p) => p.ev === ev);
      out.push({
        ev, page, perso,
        x: ancien ? ancien.x : ev.x,
        y: ancien ? ancien.y : ev.y,
        direction: ancien ? ancien.direction : DIRECTIONS[ev.direction] ? ev.direction : 'bas',
        mouvement: null,  // { de: {x, y}, t, duree, pas } quand il marche
        pas: ancien ? ancien.pas : 0, // combien de pas il a faits (pour alterner les pieds)
        attente: 1 + Math.random() * 2,
        tuile: tuile >= 0 ? tuile : -1,
        // Sans tuile mais avec un personnage : son sprite, ou le petit bonhomme à sa couleur.
        visible: tuile >= 0 || Boolean(perso) || Boolean(obstacle(ev)),
        bloque: !ev.traversable,
      });
    }
    return out;
  }

  const dansCarte = (carte, x, y) => x >= 0 && y >= 0 && x < carte.largeur && y < carte.hauteur;
  const code = (carte, x, y) => (dansCarte(carte, x, y) ? carte.collisions[y * carte.largeur + x] : PASSAGE.bloque);
  const teleporteur = (carte, x, y) => carte.teleporteurs.find((t) => t.x === x && t.y === y) || null;
  const zonesEn = (carte, x, y) => carte.zones.filter((z) => x >= z.x && y >= z.y && x < z.x + z.largeur && y < z.y + z.hauteur);

  // Peut-on entrer sur la case (x, y) en allant vers dir ? Renvoie null (non) ou { x, y, saut }.
  // - case bloquée : non, sauf une zone dont on possède l'objet requis (la planche de surf pour l'eau) ;
  // - rebord : on le saute seulement dans sa direction, et on atterrit sur la case d'après ;
  // - un événement qui n'est pas traversable bloque sa case ;
  // - prises : d'autres cases occupées (le joueur, pour un PNJ qui marche).
  function destination(carte, partie, presents, x, y, dir, prises = []) {
    const [dx, dy] = DIRECTIONS[dir];
    const tx = x + dx, ty = y + dy;
    if (!dansCarte(carte, tx, ty)) return null;
    const occupe = (cx, cy) => presents.some((p) => p.bloque && p.x === cx && p.y === cy) || prises.some((c) => c.x === cx && c.y === cy);
    const c = code(carte, tx, ty);
    if (REBORDS[c]) {
      if (REBORDS[c] !== dir) return null;
      const lx = tx + dx, ly = ty + dy;
      const cl = code(carte, lx, ly);
      if (!dansCarte(carte, lx, ly) || cl === PASSAGE.bloque || REBORDS[cl] || occupe(lx, ly) || bloqueParModule(carte, lx, ly)) return null;
      return { x: lx, y: ly, saut: true };
    }
    if (occupe(tx, ty)) return null;
    if (bloqueParModule(carte, tx, ty)) return null;
    if (c === PASSAGE.bloque) {
      const ouverte = zonesEn(carte, tx, ty).some((z) => z.objetRequis && (partie.sac[z.objetRequis] || 0) > 0);
      if (!ouverte) return null;
    }
    return { x: tx, y: ty, saut: false };
  }

  // L'événement présent sur une case (le premier qui y est), ou null.
  const presentEn = (presents, x, y) => presents.find((p) => p.x === x && p.y === y) || null;

  // La direction de (x1, y1) vers (x2, y2), pour un PNJ qui se tourne vers le joueur.
  function directionVers(x1, y1, x2, y2) {
    if (Math.abs(x2 - x1) >= Math.abs(y2 - y1)) return x2 > x1 ? 'droite' : 'gauche';
    return y2 > y1 ? 'bas' : 'haut';
  }

  // Saga 1.6 : ce qui repousse. Un événement avec repousse_nuits (une récolte, un arbre coupé, un coffre
  // qui se remplit) : une fois son « déjà fait » allumé, il s'éteint après ce nombre de nuits, et
  // l'événement revient à sa première page. Appelé par la commande dormir. Rend combien ont repoussé.
  function repousser(jeu, partie) {
    if (!partie.repousses || typeof partie.repousses !== 'object' || Array.isArray(partie.repousses)) partie.repousses = {};
    const vues = new Set();
    let n = 0;
    // Saga 1.6.1 : on part de ce que la partie a retenu (et non des cartes), pour compter aussi les copies
    // de carte (« base@copie », l'intérieur d'un bâtiment) que le joueur n'a pas revues depuis le chargement.
    for (const cle of Object.keys(partie.locaux || {})) {
      if (!partie.locaux[cle]) continue;
      const i = cle.lastIndexOf('/');
      const c = i > 0 ? jeu.cartes.get(cle.slice(0, i)) : null;
      const ev = c?.evenements.find((e) => String(e.id) === cle.slice(i + 1));
      const nuits = Math.round(Number(ev?.repousse_nuits) || 0);
      if (nuits < 1) continue;
      const k = (Number(partie.repousses[cle]) || 0) + 1;
      if (k >= nuits) { delete partie.locaux[cle]; n++; } else { partie.repousses[cle] = k; vues.add(cle); }
    }
    for (const cle of Object.keys(partie.repousses)) if (!vues.has(cle)) delete partie.repousses[cle];
    return n;
  }

  return { repousser, brancherConditions, brancherBlocage, bloqueParModule, nouvellePartie, variablesDeDepart, comparer, compteur, decrire, obstacle, vraie, pageActive, evenementsPresents, dansCarte, code, teleporteur, zonesEn, destination, presentEn, directionVers };
})();
