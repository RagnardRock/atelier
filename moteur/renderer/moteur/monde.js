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
      quetes: {},          // id → { etat: 'en_cours' | 'finie', etape }
      compteurs: { captures: 0, dresseurs_battus: 0, evolutions: 0, badges: 0, pas: 0 },
      sac: {},             // id d'objet → nombre
      equipe: [],          // [{ creature, niveau }]
      argent: Number(reglages.argent_depart) || 0,
      position: { ...depart },
    };
  }

  // Une condition (FORMAT.md › Conditions), pour l'événement ev de la carte.
  function vraie(cond, partie, carte, ev) {
    if (!cond || typeof cond !== 'object') return true;
    switch (cond.type) {
      case 'interrupteur': return Boolean(partie.interrupteurs[cond.id]) === Boolean(cond.valeur);
      case 'local': return Boolean(partie.locaux[`${carte.id}/${ev?.id}`]) === Boolean(cond.valeur);
      case 'objet': return (partie.sac[cond.objet] || 0) >= (Number(cond.min) || 1);
      case 'compteur': return (partie.compteurs[cond.compteur] || 0) >= (Number(cond.min) || 0);
      case 'quete': {
        const q = partie.quetes[cond.quete];
        const etat = q ? q.etat : 'pas_commencee';
        if (etat !== cond.etat) return false;
        return cond.etat !== 'en_cours' || !(cond.etape > 0) || q.etape >= cond.etape;
      }
      default: return true; // une condition inconnue (Tafl plus récent) ne bloque rien
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

  // Les événements présents sur la carte, avec leur apparence. À refaire après chaque script
  // et à chaque changement de carte. avant : la liste précédente de la même carte, pour garder
  // la place et la direction de ceux qui se sont déplacés (un PNJ qui marche au hasard).
  function evenementsPresents(jeu, carte, partie, avant = []) {
    const out = [];
    for (const ev of carte.evenements) {
      const page = pageActive(ev, partie, carte);
      if (!page || page.cache) continue;
      const perso = jeu.personnages.get(ev.apparence?.personnage || '') || null;
      let tuile = Number(ev.apparence?.tuile);
      if (!(tuile >= 0) && perso && perso.tuile >= 0) tuile = perso.tuile;
      const ancien = avant.find((p) => p.ev === ev);
      out.push({
        ev, page, perso,
        x: ancien ? ancien.x : ev.x,
        y: ancien ? ancien.y : ev.y,
        direction: ancien ? ancien.direction : DIRECTIONS[ev.direction] ? ev.direction : 'bas',
        mouvement: null,  // { de: {x, y}, t, duree } quand il marche
        attente: 1 + Math.random() * 2,
        tuile: tuile >= 0 ? tuile : -1,
        // Sans tuile mais avec un personnage : Saga le dessine en petit bonhomme à sa couleur.
        visible: tuile >= 0 || Boolean(perso),
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
      if (!dansCarte(carte, lx, ly) || cl === PASSAGE.bloque || REBORDS[cl] || occupe(lx, ly)) return null;
      return { x: lx, y: ly, saut: true };
    }
    if (occupe(tx, ty)) return null;
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

  return { nouvellePartie, vraie, pageActive, evenementsPresents, dansCarte, code, teleporteur, zonesEn, destination, presentEn, directionVers };
})();
