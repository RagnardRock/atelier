// Le vérificateur du jeu (Tafl 0.27) : Jeu › Vérifier le jeu (Ctrl+Maj+V), et l'action verifier de Loki.
// Il cherche ce qui empêcherait de jouer ou de finir le jeu : les téléporteurs cassés, les personnages
// qu'on ne peut pas atteindre, les quêtes impossibles à finir, et les ids qui n'existent pas.
//
// Il lit le jeu au format des fichiers (FORMAT.md, comme Saga) : { cartes: [carte JSON], depart, donnees }.
// Rien ici ne touche à la page : la fenêtre est dans app.js.
//
// Comment il sait où le joueur peut aller : il marche depuis le départ, case par case, comme Saga
// (moteur/renderer/moteur/monde.js › destination), en suivant les téléporteurs et les commandes
// « téléporter » des scripts qu'il peut lancer. Il est optimiste : le joueur a tous les objets que
// le jeu donne ou vend quelque part (la planche de surf, la hache…), et un événement qui peut
// disparaître (une page cachée, ou des conditions sur toutes ses pages) ne bloque pas.
// Ce qu'il signale reste donc impossible même dans le meilleur des cas.
const Verificateur = (() => {
  const BLOQUE = 2;
  const REBORDS = { 3: 'bas', 4: 'haut', 5: 'gauche', 6: 'droite' };
  const DIRECTIONS = { bas: [0, 1], haut: [0, -1], gauche: [-1, 0], droite: [1, 0] };
  const VOISINS = Object.values(DIRECTIONS);
  const OBSTACLES = ['couper', 'briser', 'pousser'];

  // Les catégories de la fenêtre, dans l'ordre.
  const CATEGORIES = {
    teleporteurs: 'Téléporteurs',
    acces: 'Cartes et personnages inaccessibles',
    quetes: 'Quêtes et conditions impossibles',
    references: 'Ids qui n\'existent pas',
    scripts: 'Scripts JS et variables',
  };

  // Toutes les commandes d'une liste, celles des choix et des « si » comprises.
  function parcourir(liste, fn) {
    for (const c of Array.isArray(liste) ? liste : []) {
      if (!c || typeof c !== 'object') continue;
      fn(c);
      if (c.type === 'choix') for (const o of c.options || []) parcourir(o?.commandes, fn);
      if (c.type === 'si') { parcourir(c.alors, fn); parcourir(c.sinon, fn); }
      if (['test', 'sauvegarde', 'test_oppose', 'gestion_construire', 'gestion_placer'].includes(c.type)) { parcourir(c.reussi, fn); parcourir(c.rate, fn); }
    }
  }
  // Les conditions d'un événement : celles de ses pages, et celles des « si » de ses scripts.
  function conditions(ev, fn) {
    for (const p of ev.pages || []) {
      for (const c of p.conditions || []) fn(c, p);
      parcourir(p.commandes, (c) => { if (c.type === 'si' && c.condition) fn(c.condition, p); });
    }
  }
  const commandes = (ev, fn) => { for (const p of ev.pages || []) parcourir(p.commandes, fn); };

  function verifier(jeu) {
    const problemes = [];
    const ajouter = (gravite, categorie, message, ou = {}) => problemes.push({ gravite, categorie, message, ...ou });
    const cartes = new Map((jeu.cartes || []).map((c) => [c.id, c]));
    const d = jeu.donnees || {};
    const liste = (sorte) => (Array.isArray(d[sorte]) ? d[sorte] : []);
    const reglages = d.reglages || {};
    const jrpg = reglages.regles === 'jrpg';
    const jdr = reglages.regles === 'jdr';
    const enGroupe = jrpg || jdr; // un groupe de héros contre des groupes de monstres (pas de créatures)
    const ids = (sorte) => new Set(liste(sorte).map((x) => x.id));
    const connus = {
      personnages: ids('personnages'), quetes: ids('quetes'), objets: ids('objets'), creatures: ids('creatures'),
      dresseurs: ids('dresseurs'), boutiques: ids('boutiques'), groupes: ids('groupes'),
      monstres_jdr: ids('monstres_jdr'), classes_jdr: ids('classes_jdr'), origines: ids('origines'),
      badges: new Set((reglages.badges || []).map((b) => b.id)),
      ressources: ids('ressources'), batiments: ids('batiments'), // Tafl 1.3 : le module gestion
    };
    // Tafl 1.2 : un module activé que ce Tafl ne connaît pas (écrit à la main, ou par un Tafl plus récent).
    // Dit avant tout le reste : même un jeu sans carte doit l'apprendre.
    if (typeof ModulesJeu !== 'undefined') {
      for (const id of ModulesJeu.actifs(reglages)) {
        if (!ModulesJeu.CATALOGUE[id]) ajouter('attention', 'references', `Le module « ${id} » est activé (Réglages › Règles du jeu › Modules), mais ce Tafl ne le connaît pas : Saga jouera sans lui s'il ne le connaît pas non plus.`);
      }
    }
    const nomCarte = (id) => cartes.get(id)?.nom || id;
    const nomEv = (ev) => `« ${ev.nom || ev.id} »`;
    const nomQuete = (id) => `« ${liste('quetes').find((q) => q.id === id)?.titre || id} »`;
    const dans = (c, x, y) => x >= 0 && y >= 0 && x < c.largeur && y < c.hauteur;
    const code = (c, x, y) => (dans(c, x, y) ? c.collisions?.[y * c.largeur + x] ?? 1 : BLOQUE);
    const zonesEn = (c, x, y) => (c.zones || []).filter((z) => x >= z.x && y >= z.y && x < z.x + z.largeur && y < z.y + z.hauteur);
    const tpEn = (c, x, y) => (c.teleporteurs || []).find((t) => t.x === x && t.y === y) || null;

    // --- Ce que le jeu peut donner : objets, interrupteurs, quêtes, badges, membres du groupe ---
    // (n'importe où, même dans un événement inaccessible : l'accès est vérifié à part)
    const donne = { objets: new Set(), interrupteurs: new Set(), eteints: new Set(), commencees: new Set(), etapes: new Map(), finies: new Set(), badges: new Set(), membres: new Set(), dresseurs: new Set(), construits: new Set() };
    const scriptsDe = []; // [{ carte, ev }] pour la suite
    for (const c of cartes.values()) {
      for (const ev of c.evenements || []) {
        scriptsDe.push({ carte: c, ev });
        commandes(ev, (cmd) => {
          if (cmd.type === 'objet' && cmd.action !== 'retirer' && cmd.objet) donne.objets.add(cmd.objet);
          if (cmd.type === 'interrupteur' && cmd.id) (cmd.valeur === false ? donne.eteints : donne.interrupteurs).add(cmd.id);
          if (cmd.type === 'quete' && cmd.quete) {
            if (cmd.action === 'commencer') donne.commencees.add(cmd.quete);
            if (cmd.action === 'etape') {
              donne.commencees.add(cmd.quete); // une étape met aussi la quête en cours (Saga, scripts.js)
              if (!donne.etapes.has(cmd.quete)) donne.etapes.set(cmd.quete, new Set());
              donne.etapes.get(cmd.quete).add(Math.max(1, Number(cmd.etape) || 1));
            }
            if (cmd.action === 'finir') donne.finies.add(cmd.quete);
          }
          if (cmd.type === 'badge' && cmd.badge) donne.badges.add(cmd.badge);
          if (cmd.type === 'gestion_construire' && cmd.batiment) donne.construits.add(cmd.batiment);
          if (cmd.type === 'gestion_placer') donne.places = true;
          if (cmd.type === 'gestion_habitants' && cmd.action !== 'retirer') donne.habitants = true;
          if (cmd.type === 'gestion_placer' && cmd.batiment) donne.construits.add(cmd.batiment);
          if (cmd.type === 'groupe' && cmd.action !== 'quitter' && cmd.personnage) donne.membres.add(cmd.personnage);
          if (cmd.type === 'combat_dresseur' && cmd.dresseur) donne.dresseurs.add(cmd.dresseur);
        });
      }
    }
    for (const b of liste('boutiques')) for (const a of b.articles || []) if (a.sorte === 'objet' && a.id) donne.objets.add(a.id);
    // Le butin des monstres (packs JRPG et JDR) compte aussi.
    if (enGroupe) for (const m of liste(jdr ? 'monstres_jdr' : 'monstres')) for (const b of m.butin || []) if (b.objet) donne.objets.add(b.objet);
    // Le héros qui a une classe est dans le groupe dès le début.
    for (const p of liste('personnages')) if (p.heros && p.classe) donne.membres.add(p.id);
    const aObjet = (id) => !id || donne.objets.has(id);

    // --- Où le joueur peut aller ---
    // Un événement bloque sa case pour de bon s'il ne se traverse pas et qu'il est toujours là :
    // une page sans condition (il y a donc toujours une page active) et aucune page cachée.
    // Un obstacle qu'on peut ouvrir (on peut avoir son objet) ne bloque pas.
    const toujoursLa = (ev) => (ev.pages || []).some((p) => !(p.conditions || []).length) && !(ev.pages || []).some((p) => p.cache);
    const obstacle = (ev) => (ev.type === 'obstacle' && OBSTACLES.includes(ev.obstacle?.sorte) ? ev.obstacle : null);
    const bloquants = new Map(); // carte → Set de "x,y"
    for (const c of cartes.values()) {
      const s = new Set();
      for (const ev of c.evenements || []) {
        if (ev.traversable) continue;
        const o = obstacle(ev);
        if (o && o.objet && aObjet(o.objet)) continue;
        if (toujoursLa(ev) || o) s.add(`${ev.x},${ev.y}`);
      }
      bloquants.set(c.id, s);
    }
    const occupe = (c, x, y) => bloquants.get(c.id)?.has(`${x},${y}`);
    // Les cases où on peut entrer en allant de (x, y) vers [dx, dy] (Monde.destination de Saga).
    function pas(c, x, y, [dx, dy], dir) {
      const tx = x + dx, ty = y + dy;
      if (!dans(c, tx, ty)) return null;
      const v = code(c, tx, ty);
      if (REBORDS[v]) {
        if (REBORDS[v] !== dir) return null;
        const lx = tx + dx, ly = ty + dy, vl = code(c, lx, ly);
        if (!dans(c, lx, ly) || vl === BLOQUE || REBORDS[vl] || occupe(c, lx, ly)) return null;
        return [lx, ly];
      }
      if (occupe(c, tx, ty)) return null;
      if (v === BLOQUE && !zonesEn(c, tx, ty).some((z) => z.objetRequis && aObjet(z.objetRequis))) return null;
      return [tx, ty];
    }
    // Où mènent les scripts d'un événement (commandes « téléporter »).
    const teleportsDe = (ev) => {
      const out = [];
      commandes(ev, (cmd) => { if (cmd.type === 'teleporter' && cartes.has(cmd.carte)) out.push(cmd); });
      return out;
    };

    // Marche depuis une case (ou plusieurs) : renvoie les cases atteintes (carte → Set "x,y") et les
    // événements qu'on peut lancer (Set d'objets ev).
    function marcher(departs) {
      const vues = new Map([...cartes.keys()].map((id) => [id, new Set()]));
      const lances = new Set();
      const cartesVues = new Set();
      const file = [];
      const etats = new Set();
      // pose : le joueur est posé sur la case (le départ, l'arrivée d'un téléporteur) ; sinon il y marche.
      const entrer = (idCarte, x, y, pose = false) => {
        const c = cartes.get(idCarte);
        if (!c || !dans(c, x, y)) return;
        const k = `${x},${y}`;
        const etat = `${idCarte}/${k}/${pose ? 1 : 0}`;
        if (etats.has(etat)) return;
        etats.add(etat);
        vues.get(idCarte).add(k);
        if (!cartesVues.has(idCarte)) {
          cartesVues.add(idCarte);
          // Les scènes d'arrivée (déclenchement auto) se jouent dès qu'on arrive sur la carte.
          for (const ev of c.evenements || []) if (ev.declenchement === 'auto') lancer(ev);
        }
        file.push([c, x, y, pose]);
      };
      const lancer = (ev) => {
        if (lances.has(ev)) return;
        lances.add(ev);
        for (const t of teleportsDe(ev)) entrer(t.carte, Number(t.x), Number(t.y), true);
      };
      const vider = () => {
        while (file.length) {
          const [c, x, y, pose] = file.pop();
          // Marcher sur un téléporteur emmène aussitôt ailleurs (y être posé, non : comme dans Saga).
          const tp = tpEn(c, x, y);
          if (tp && !pose) { entrer(tp.vers?.carte, Number(tp.vers?.x), Number(tp.vers?.y), true); continue; }
          for (const [dir, delta] of Object.entries(DIRECTIONS)) {
            const n = pas(c, x, y, delta, dir);
            if (n) entrer(c.id, n[0], n[1]);
          }
        }
      };
      for (const p of departs) entrer(p.carte, p.x, p.y, true);
      // Les événements qu'on peut lancer depuis les cases atteintes : devant lui (parler, ou se cogner
      // contre lui), ou sur sa case (un déclencheur qu'on traverse). Un événement lancé peut téléporter
      // ailleurs : on recommence tant que ça ajoute des cases.
      let avant = -1;
      while (avant !== total(vues)) {
        vider();
        avant = total(vues);
        for (const c of cartes.values()) {
          const v = vues.get(c.id);
          if (!v.size) continue;
          for (const ev of c.evenements || []) {
            if (lances.has(ev)) continue;
            const sur = v.has(`${ev.x},${ev.y}`);
            const aCote = VOISINS.some(([dx, dy]) => v.has(`${ev.x + dx},${ev.y + dy}`));
            if (ev.declenchement === 'toucher' && ev.traversable ? sur : sur || aCote) lancer(ev);
          }
        }
        vider();
      }
      return { vues, lances, cartesVues };
    }
    const total = (vues) => { let n = 0; for (const s of vues.values()) n += s.size; return n; };

    // --- Le départ ---
    let depart = jeu.depart && cartes.has(jeu.depart.carte) ? jeu.depart : null;
    if (!cartes.size) {
      ajouter('attention', 'acces', 'Le jeu n\'a encore aucune carte.');
      return resultat(problemes);
    }
    if (!depart) {
      const c = cartes.values().next().value;
      const i = Math.max(0, (c.collisions || []).findIndex((v) => v !== BLOQUE));
      depart = { carte: c.id, x: i % c.largeur, y: Math.floor(i / c.largeur) };
      ajouter('attention', 'acces', jeu.depart ? `Le départ du joueur est sur une carte qui n'existe plus (${jeu.depart.carte}) : Saga le met sur la première carte.` : 'Le départ du joueur n\'est pas placé (outil Départ, touche J) : Saga le met sur la première carte.', { carte: c.id });
    } else if (code(cartes.get(depart.carte), depart.x, depart.y) === BLOQUE) {
      ajouter('erreur', 'acces', 'Le départ du joueur est sur une case bloquée.', { carte: depart.carte, x: depart.x, y: depart.y });
    }
    // Tafl 1.4.2 : la porte d'un bâtiment du module gestion mène à son intérieur. Le joueur pourra y entrer
    // dès qu'il en pose un : ces intérieurs comptent comme atteints (un départ de plus).
    const gestionPortes = (Array.isArray(reglages.modules) && reglages.modules.includes('gestion') ? liste('batiments') : [])
      .map((b) => b.porte_vers).filter((v) => v?.carte && cartes.has(v.carte)).map((v) => ({ carte: v.carte, x: Number(v.x), y: Number(v.y) }));
    const monde = marcher([{ carte: depart.carte, x: depart.x, y: depart.y }, ...gestionPortes]);

    // --- 1. Téléporteurs ---
    // L'arrivée d'un téléporteur ou d'une commande « téléporter » : la carte existe, la case aussi, on peut s'y tenir.
    const arrivee = (vers, ou, quoi) => {
      if (!vers?.carte) return ajouter('erreur', 'teleporteurs', `${quoi} ne mène nulle part : choisis sa carte d'arrivée.`, ou);
      const c = cartes.get(vers.carte);
      if (!c) return ajouter('erreur', 'teleporteurs', `${quoi} mène à une carte qui n'existe plus (${vers.carte}).`, ou);
      const x = Number(vers.x), y = Number(vers.y);
      if (!dans(c, x, y)) return ajouter('erreur', 'teleporteurs', `${quoi} fait arriver hors de « ${c.nom} » (case ${x}, ${y} ; la carte fait ${c.largeur} × ${c.hauteur}).`, ou);
      if (code(c, x, y) === BLOQUE && !zonesEn(c, x, y).some((z) => z.objetRequis)) return ajouter('erreur', 'teleporteurs', `${quoi} fait arriver sur une case bloquée de « ${c.nom} » (${x}, ${y}) : le joueur y serait coincé.`, ou);
      if (occupe(c, x, y)) return ajouter('erreur', 'teleporteurs', `${quoi} fait arriver sous un événement qui bloque, sur « ${c.nom} » (${x}, ${y}).`, ou);
      // Coincé à l'arrivée : aucune case voisine où aller (et pas de téléporteur sous les pieds).
      if (!tpEn(c, x, y) && !Object.entries(DIRECTIONS).some(([dir, delta]) => pas(c, x, y, delta, dir))) {
        ajouter('erreur', 'teleporteurs', `${quoi} fait arriver sur une case de « ${c.nom} » (${x}, ${y}) d'où le joueur ne peut aller nulle part.`, ou);
      }
      return null;
    };
    const retours = new Map(); // arrivée → les cartes qu'on peut atteindre depuis elle
    for (const c of cartes.values()) {
      for (const t of c.teleporteurs || []) {
        const ou = { carte: c.id, x: t.x, y: t.y };
        const quoi = `Le téléporteur de « ${c.nom} » (${t.x}, ${t.y})`;
        const avant = problemes.length;
        arrivee(t.vers, ou, quoi);
        // Le téléporteur lui-même : on doit pouvoir marcher dessus.
        if (code(c, t.x, t.y) === BLOQUE && !zonesEn(c, t.x, t.y).some((z) => z.objetRequis)) {
          ajouter('erreur', 'teleporteurs', `${quoi} est sur une case bloquée : le joueur ne peut pas marcher dessus. Mets la case en Libre (ligne Passage).`, ou);
        } else if (occupe(c, t.x, t.y)) {
          ajouter('erreur', 'teleporteurs', `${quoi} est sous un événement qui bloque : le joueur ne peut pas marcher dessus.`, ou);
        } else if (monde.cartesVues.has(c.id) && !monde.vues.get(c.id).has(`${t.x},${t.y}`)) {
          ajouter('attention', 'teleporteurs', `${quoi} n'est atteint par aucun chemin depuis le départ.`, ou);
        }
        // Un chemin de retour : depuis l'arrivée, peut-on revenir sur la carte de départ ?
        // (un trou où l'on tombe peut être voulu : c'est seulement « à vérifier »)
        if (problemes.length === avant && cartes.has(t.vers?.carte) && t.vers.carte !== c.id && monde.vues.get(c.id).has(`${t.x},${t.y}`)) {
          const k = `${t.vers.carte}/${t.vers.x},${t.vers.y}`;
          if (!retours.has(k)) retours.set(k, marcher([{ carte: t.vers.carte, x: Number(t.vers.x), y: Number(t.vers.y) }]).cartesVues);
          if (!retours.get(k).has(c.id)) ajouter('attention', 'teleporteurs', `${quoi} mène à « ${nomCarte(t.vers.carte)} », d'où on ne peut jamais revenir sur « ${c.nom} ». Ajoute un téléporteur du retour, sauf si c'est voulu.`, ou);
        }
      }
      for (const ev of c.evenements || []) {
        commandes(ev, (cmd) => {
          if (cmd.type !== 'teleporter') return;
          arrivee({ carte: cmd.carte, x: cmd.x, y: cmd.y }, { carte: c.id, x: ev.x, y: ev.y, evenement: ev.id }, `La commande « téléporter » de ${nomEv(ev)} (${c.nom})`);
        });
      }
    }

    // --- 2. Cartes et événements inaccessibles ---
    for (const c of cartes.values()) {
      if (!monde.cartesVues.has(c.id)) {
        ajouter('attention', 'acces', `On ne peut jamais aller sur « ${c.nom} » : aucun téléporteur ni script n'y mène depuis le départ.`, { carte: c.id });
        continue;
      }
      for (const ev of c.evenements || []) {
        if (monde.lances.has(ev) || ev.declenchement === 'auto') continue;
        // Un événement qui ne fait rien (pas de commande) n'a pas besoin d'être atteint (un décor).
        let vide = true;
        commandes(ev, (cmd) => { if (cmd.type !== 'commentaire') vide = false; });
        if (vide && !obstacle(ev)) continue;
        const qui = ev.type === 'pnj' ? 'Le personnage' : ev.type === 'panneau' ? 'Le panneau' : ev.type === 'coffre' ? 'Le coffre' : ev.type === 'objet' ? 'L\'objet' : ev.type === 'obstacle' ? 'L\'obstacle' : 'L\'événement';
        const comment = ev.declenchement === 'toucher' && ev.traversable ? 'aucun chemin ne passe sur sa case' : 'aucune case libre à côté de lui n\'est atteinte';
        ajouter('erreur', 'acces', `${qui} ${nomEv(ev)} sur « ${c.nom} » est inaccessible : ${comment}.`, { carte: c.id, x: ev.x, y: ev.y, evenement: ev.id });
      }
    }
    // Ce que le joueur peut vraiment obtenir : seulement dans les événements qu'il peut lancer.
    const atteint = { objets: new Set(), interrupteurs: new Set(), commencees: new Set(), finies: new Set() };
    for (const ev of monde.lances) {
      commandes(ev, (cmd) => {
        if (cmd.type === 'objet' && cmd.action !== 'retirer') atteint.objets.add(cmd.objet);
        if (cmd.type === 'interrupteur' && cmd.valeur !== false) atteint.interrupteurs.add(cmd.id);
        if (cmd.type === 'quete' && cmd.action !== 'finir') atteint.commencees.add(cmd.quete);
        if (cmd.type === 'quete' && cmd.action === 'finir') atteint.finies.add(cmd.quete);
      });
    }

    // --- 3. Quêtes ---
    // Où une quête est commencée, avancée, finie (pour dire où aller la corriger).
    const ouQuete = new Map();
    for (const { carte, ev } of scriptsDe) commandes(ev, (cmd) => {
      if (cmd.type !== 'quete' || !cmd.quete) return;
      const ou = { carte: carte.id, x: ev.x, y: ev.y, evenement: ev.id };
      for (const k of [cmd.quete, `${cmd.quete}/${cmd.action}`]) if (!ouQuete.has(k)) ouQuete.set(k, ou);
    });
    for (const q of liste('quetes')) {
      const ou = ouQuete.get(q.id) || {};
      const nom = `La quête « ${q.titre || q.id} »`;
      if (!donne.commencees.has(q.id)) { ajouter('erreur', 'quetes', `${nom} n'est jamais commencée : aucun script ne la commence (commande Quête › commencer).`); continue; }
      if (!donne.finies.has(q.id)) ajouter('erreur', 'quetes', `${nom} ne peut jamais finir : aucun script ne la finit (commande Quête › finir).`, ou);
      else if (!atteint.finies.has(q.id)) ajouter('erreur', 'quetes', `${nom} se finit seulement dans un événement inaccessible.`, ouQuete.get(`${q.id}/finir`) || ou);
      else if (!atteint.commencees.has(q.id)) ajouter('erreur', 'quetes', `${nom} se commence seulement dans un événement inaccessible.`, ouQuete.get(`${q.id}/commencer`) || ou);
      const etapes = Array.isArray(q.etapes) ? q.etapes.length : 0;
      const faites = donne.etapes.get(q.id) || new Set();
      for (let n = 2; n <= etapes; n++) {
        if (!faites.has(n)) ajouter('attention', 'quetes', `${nom} : l'étape ${n} (« ${q.etapes[n - 1]?.texte || ''} ») n'est jamais atteinte, aucun script ne la met.`, ou);
      }
      for (const n of faites) if (n > etapes) ajouter('erreur', 'quetes', `${nom} n'a que ${etapes} étape(s), mais un script la met à l'étape ${n}.`, ou);
      if (q.suivante && !connus.quetes.has(q.suivante)) ajouter('erreur', 'references', `${nom} a pour suivante une quête qui n'existe pas (${q.suivante}).`);
    }
    // Les conditions qui ne peuvent jamais être vraies : la page (ou le « si ») ne se jouera jamais.
    // Tafl 1.3 : le joueur peut poser n'importe quel bâtiment s'il a « Placer un bâtiment » au choix, ou
    // « Construire » dans le menu de pause (et une zone Constructible quelque part).
    const gestionActif = typeof ModulesJeu !== 'undefined' ? ModulesJeu.actifs(reglages).includes('gestion') : (reglages.modules || []).includes('gestion');
    const zoneConstructible = [...cartes.values()].some((c) => (c.zones || []).some((z) => z.type === 'constructible'));
    const placeLibre = zoneConstructible && (donne.places || reglages.modules_reglages?.gestion?.construire_menu !== false);
    const impossible = (cond) => {
      switch (cond?.type) {
        case 'interrupteur':
          if (cond.valeur === false) return null; // éteint au départ : toujours possible
          return cond.id && !donne.interrupteurs.has(cond.id) ? `l'interrupteur « ${cond.id} » allumé, mais aucun script ne l'allume` : null;
        case 'objet': return cond.objet && connus.objets.has(cond.objet) && !donne.objets.has(cond.objet) ? `l'objet « ${cond.objet} », que personne ne donne ni ne vend` : null;
        case 'quete':
          if (cond.etat === 'finie' && cond.quete && !donne.finies.has(cond.quete)) return `la quête ${nomQuete(cond.quete)} finie, mais rien ne la finit`;
          if (cond.etat === 'en_cours' && cond.quete && !donne.commencees.has(cond.quete)) return `la quête ${nomQuete(cond.quete)} en cours, mais rien ne la commence`;
          return null;
        case 'badge': return cond.badge && !donne.badges.has(cond.badge) ? `le badge « ${cond.badge} », que personne ne donne` : null;
        case 'membre': return jrpg && cond.personnage && !donne.membres.has(cond.personnage) ? `« ${cond.personnage} » dans le groupe, mais rien ne l'y fait entrer` : null;
        case 'gestion_batiment': case 'gestion_chantier': return cond.batiment && connus.batiments.has(cond.batiment) && !donne.construits.has(cond.batiment) && !placeLibre ? `le bâtiment « ${cond.batiment} », mais aucune commande « Construire un bâtiment » ne le construit` : null;
        default: return null;
      }
    };
    for (const { carte, ev } of scriptsDe) {
      const vus = new Set();
      conditions(ev, (cond, page) => {
        const pourquoi = impossible(cond);
        if (!pourquoi || vus.has(pourquoi)) return;
        vus.add(pourquoi);
        const n = (ev.pages || []).indexOf(page) + 1;
        ajouter('attention', 'quetes', `${nomEv(ev)} sur « ${carte.nom} », page ${n} : il faut ${pourquoi}.`, { carte: carte.id, x: ev.x, y: ev.y, evenement: ev.id });
      });
    }
    for (const b of liste('boutiques')) {
      for (const a of b.articles || []) {
        const pourquoi = impossible(a.condition);
        if (pourquoi) ajouter('attention', 'quetes', `L'article « ${a.id} » de la boutique « ${b.nom || b.id} » ne sera jamais en vente : il faut ${pourquoi}.`);
      }
    }

    // --- 4. Les ids qui n'existent pas ---
    const verifierId = (sorte, id, quoi, ou = {}) => {
      if (!id || connus[sorte].has(id)) return;
      const noms = { personnages: 'de personnage', quetes: 'de quête', objets: 'd\'objet', creatures: 'de créature', dresseurs: 'de dresseur', boutiques: 'de boutique', groupes: 'de groupe de monstres', badges: 'de badge', monstres_jdr: 'de monstre', classes_jdr: 'de classe', origines: 'd\'origine', ressources: 'de ressource', batiments: 'de bâtiment' };
      ajouter('erreur', 'references', `${quoi} : pas ${noms[sorte]} « ${id} » dans les données du jeu.`, ou);
    };
    for (const { carte, ev } of scriptsDe) {
      const ou = { carte: carte.id, x: ev.x, y: ev.y, evenement: ev.id };
      const quoi = `${nomEv(ev)} sur « ${carte.nom} »`;
      verifierId('personnages', ev.apparence?.personnage, quoi, ou);
      if (obstacle(ev)) verifierId('objets', ev.obstacle.objet, quoi, ou);
      commandes(ev, (cmd) => {
        if (cmd.type === 'dire' && cmd.qui && cmd.qui !== '@evenement') verifierId('personnages', cmd.qui, quoi, ou);
        if (cmd.type === 'objet') verifierId('objets', cmd.objet, quoi, ou);
        if ((cmd.type === 'creature' || cmd.type === 'combat_sauvage') && !enGroupe) verifierId('creatures', cmd.creature, quoi, ou);
        if (cmd.type === 'combat_dresseur') verifierId('dresseurs', cmd.dresseur, quoi, ou);
        if (cmd.type === 'boutique') verifierId('boutiques', cmd.boutique, quoi, ou);
        if (cmd.type === 'quete') verifierId('quetes', cmd.quete, quoi, ou);
        if (cmd.type === 'badge') verifierId('badges', cmd.badge, quoi, ou);
        if (cmd.type === 'groupe') verifierId('personnages', cmd.personnage, quoi, ou);
        if (cmd.type === 'combat_groupe') verifierId('groupes', cmd.groupe, quoi, ou);
        if (cmd.type === 'test_oppose' && cmd.monstre) verifierId('monstres_jdr', cmd.monstre, quoi, ou);
        if (cmd.type === 'gestion_construire') verifierId('batiments', cmd.batiment, quoi, ou);
        if (cmd.type === 'gestion_placer' && cmd.batiment) verifierId('batiments', cmd.batiment, quoi, ou);
        if (cmd.type === 'gestion_stock') verifierId('ressources', cmd.ressource, quoi, ou);
      });
      conditions(ev, (cond) => {
        if (cond.type === 'objet') verifierId('objets', cond.objet, quoi, ou);
        if (cond.type === 'quete') verifierId('quetes', cond.quete, quoi, ou);
        if (cond.type === 'badge') verifierId('badges', cond.badge, quoi, ou);
        if (cond.type === 'membre') verifierId('personnages', cond.personnage, quoi, ou);
        if (cond.type === 'jdr_classe') verifierId('classes_jdr', cond.classe, quoi, ou);
        if (cond.type === 'jdr_origine') verifierId('origines', cond.origine, quoi, ou);
        if (cond.type === 'gestion_batiment' || cond.type === 'gestion_chantier') verifierId('batiments', cond.batiment, quoi, ou);
        if (cond.type === 'gestion_stock') verifierId('ressources', cond.ressource, quoi, ou);
      });
    }
    for (const c of cartes.values()) {
      for (const z of c.zones || []) {
        const ou = { carte: c.id, x: z.x, y: z.y };
        const quoi = `La zone « ${z.nom || z.id} » de « ${c.nom} »`;
        verifierId('objets', z.objetRequis, quoi, ou);
        for (const r of z.rencontres || []) {
          if (enGroupe) verifierId('groupes', r.groupe, quoi, ou);
          else verifierId('creatures', r.creature, quoi, ou);
        }
        if (z.objetRequis && connus.objets.has(z.objetRequis) && !donne.objets.has(z.objetRequis)) ajouter('attention', 'quetes', `${quoi} demande l'objet « ${z.objetRequis} », que personne ne donne ni ne vend : on n'y entrera jamais.`, ou);
      }
      for (const ev of c.evenements || []) {
        const o = obstacle(ev);
        if (o?.objet && connus.objets.has(o.objet) && !donne.objets.has(o.objet)) ajouter('attention', 'quetes', `L'obstacle ${nomEv(ev)} sur « ${c.nom} » demande l'objet « ${o.objet} », que personne ne donne ni ne vend : il ne s'ouvrira jamais.`, { carte: c.id, x: ev.x, y: ev.y, evenement: ev.id });
      }
    }
    for (const b of liste('boutiques')) {
      for (const a of b.articles || []) {
        const quoi = `La boutique « ${b.nom || b.id} »`;
        if (a.sorte === 'objet') verifierId('objets', a.id, quoi);
        if (a.sorte === 'creature' && !enGroupe) verifierId('creatures', a.id, quoi);
      }
    }
    if (!enGroupe) {
      for (const t of liste('dresseurs')) {
        for (const m of t.equipe || []) verifierId('creatures', m.creature, `Le dresseur « ${t.nom || t.id} »`);
        verifierId('personnages', t.personnage, `Le dresseur « ${t.nom || t.id} »`);
      }
    }
    for (const q of liste('quetes')) for (const p of q.personnages || []) verifierId('personnages', p, `La quête « ${q.titre || q.id} »`);
    // Tafl 1.3 : les ressources citées par les bâtiments et le stock de départ du module gestion.
    for (const b of liste('batiments')) {
      for (const q of [...(b.cout || []), ...(b.production || []), ...(b.consommation || [])]) verifierId('ressources', q.ressource, `Le bâtiment « ${b.nom || b.id} »`);
    }
    // Tafl 1.3 : les tampons des bâtiments (par leur nom), et une zone où les poser.
    if (Array.isArray(jeu.tampons)) {
      const tampons = new Set(jeu.tampons);
      for (const b of liste('batiments')) {
        for (const cle of ['tampon', 'tampon_chantier']) {
          if (b[cle] && !tampons.has(b[cle])) ajouter('erreur', 'references', `Le bâtiment « ${b.nom || b.id} » a pour ${cle === 'tampon' ? 'tampon' : 'tampon de chantier'} « ${b[cle]} », qui n'existe pas (les tampons se créent dans l'éditeur de cartes).`);
        }
      }
    }
    if (gestionActif && donne.places && !zoneConstructible) ajouter('attention', 'quetes', 'La commande « Placer un bâtiment » ne réussira jamais : aucune carte n\'a de zone de type « Constructible ».');
    // Tafl 1.4 : les habitants. Les ressources des repas, et un bâtiment qui demande des ouvriers alors
    // qu'aucun habitant ne peut venir (ni logement, ni habitants au départ, ni commande qui en amène).
    const gestionR = reglages.modules_reglages?.gestion || {};
    // Tafl 1.4.1 : la porte d'un bâtiment mène à une carte et une case qui existent.
    for (const b of liste('batiments')) {
      const v = b.porte_vers;
      if (!v?.carte) continue;
      const c = cartes.get(v.carte);
      if (!c) ajouter('erreur', 'teleporteurs', `La porte du bâtiment « ${b.nom || b.id} » mène à une carte qui n'existe pas (${v.carte}).`);
      else if (v.x >= c.largeur || v.y >= c.hauteur) ajouter('erreur', 'teleporteurs', `La porte du bâtiment « ${b.nom || b.id} » mène hors de la carte « ${c.nom || c.id} » (${v.x}, ${v.y}).`);
    }
    for (const q of gestionR.repas || []) verifierId('ressources', q.ressource, 'Les repas des habitants (Réglages › Modules)');
    // Tafl 1.6 : l'apparence des habitants qu'on voit marcher est un personnage du jeu.
    if (gestionActif && gestionR.promeneurs !== false && gestionR.promeneur_perso) verifierId('personnages', gestionR.promeneur_perso, 'L\'apparence des habitants (Réglages › Modules)');
    if (gestionActif && !liste('batiments').some((b) => b.logement > 0) && !(gestionR.habitants_depart > 0) && !donne.habitants) {
      for (const b of liste('batiments')) if (b.ouvriers > 0 && (b.production || []).length) ajouter('attention', 'quetes', `Le bâtiment « ${b.nom || b.id} » demande ${b.ouvriers} ouvrier(s), mais aucun habitant ne peut venir : aucun bâtiment n'a de logement, il n'y a pas d'habitants au départ, et aucune commande n'en amène. Il ne produira jamais.`);
    }
    for (const q of reglages.modules_reglages?.gestion?.stock_depart || []) verifierId('ressources', q.ressource, 'Le stock de départ (Réglages › Modules)');
    for (const r of liste('ressources')) verifierId('objets', r.objet, `La ressource « ${r.nom || r.id} »`);

    // --- 5. Scripts JS et variables (Tafl 0.31) ---
    // jeu.scripts : ce que Tafl sait des scripts (ScriptsTafl.etat). Sans lui (ou pas encore calculé),
    // on ne dit rien des commandes de script.
    const sc = jeu.scripts || null;
    for (const p of sc?.problemes || []) ajouter(p.gravite, 'scripts', p.message, { script: p.script, ligne: p.ligne });
    const variables = new Set(liste('variables').map((v) => v.id));
    const commandesJs = new Map((sc?.pret ? sc.inventaire.commandes : []).map((c) => [c.nom, c]));
    for (const { carte, ev } of scriptsDe) {
      const ou = { carte: carte.id, x: ev.x, y: ev.y, evenement: ev.id };
      const quoi = `${nomEv(ev)} sur « ${carte.nom} »`;
      commandes(ev, (cmd) => {
        // Un test ou un jet du pack JDR peut ranger son total dans une variable.
        if ((cmd.type === 'test' || cmd.type === 'jet') && cmd.variable && !variables.has(cmd.variable)) ajouter('erreur', 'scripts', `${quoi} : le bloc ${cmd.type === 'test' ? 'Test' : 'Jet de dés'} range son total dans « ${cmd.variable} », qui n'existe pas (Données › Variables).`, ou);
        if (cmd.type === 'variable' && (!cmd.id || !variables.has(cmd.id))) ajouter('erreur', 'scripts', cmd.id ? `${quoi} : pas de variable « ${cmd.id} » (Données › Variables).` : `${quoi} : un bloc Variable n'a pas de variable choisie.`, ou);
        if (cmd.type !== 'script' || !sc?.pret) return;
        if (!cmd.nom) return ajouter('erreur', 'scripts', `${quoi} : un bloc Script n'a pas de commande choisie.`, ou);
        const c = commandesJs.get(cmd.nom);
        if (!c) return ajouter('erreur', 'scripts', `${quoi} : aucun script actif ne déclare la commande « ${cmd.nom} » (commande('${cmd.nom}', …)).`, ou);
        for (const [cle, p] of Object.entries(c.params || {})) {
          const v = cmd.params?.[cle] ?? p.defaut;
          const sortes = { objet: 'objets', personnage: 'personnages', quete: 'quetes', creature: 'creatures', dresseur: 'dresseurs', boutique: 'boutiques', badge: 'badges', groupe: 'groupes' };
          if (p.type === 'carte' && v && !cartes.has(v)) ajouter('erreur', 'scripts', `${quoi}, commande « ${cmd.nom} » : pas de carte « ${v} ».`, ou);
          if (sortes[p.type] && v && !(enGroupe && p.type === 'creature')) verifierId(sortes[p.type], v, `${quoi}, commande « ${cmd.nom} » (${p.nom || cle})`, ou);
          if (p.type === 'variable' && v && !variables.has(v)) ajouter('erreur', 'scripts', `${quoi}, commande « ${cmd.nom} » : pas de variable « ${v} ».`, ou);
        }
      });
      conditions(ev, (cond) => {
        if (cond.type === 'variable' && (!cond.id || !variables.has(cond.id))) ajouter('erreur', 'scripts', cond.id ? `${quoi} : une condition parle de la variable « ${cond.id} », qui n'existe pas (Données › Variables).` : `${quoi} : une condition Variable n'a pas de variable choisie.`, ou);
      });
    }
    if (!jrpg && liste('personnages').length && !liste('personnages').some((p) => p.heros)) {
      ajouter('attention', 'references', 'Aucun personnage n\'est le héros (case « C\'est le héros » dans Personnages) : Saga dessine un petit bonhomme.');
    }
    return resultat(problemes);
  }

  // Les problèmes rangés : les erreurs d'abord, puis par catégorie. Un même message n'est dit qu'une fois.
  function resultat(problemes) {
    const vus = new Set();
    const uniques = problemes.filter((p) => !vus.has(p.message) && vus.add(p.message));
    const ordre = Object.keys(CATEGORIES);
    uniques.sort((a, b) => (a.gravite === b.gravite ? 0 : a.gravite === 'erreur' ? -1 : 1) || ordre.indexOf(a.categorie) - ordre.indexOf(b.categorie));
    return {
      problemes: uniques,
      erreurs: uniques.filter((p) => p.gravite === 'erreur').length,
      attentions: uniques.filter((p) => p.gravite === 'attention').length,
    };
  }

  return { verifier, CATEGORIES };
})();
if (typeof module !== 'undefined') module.exports = Verificateur;
