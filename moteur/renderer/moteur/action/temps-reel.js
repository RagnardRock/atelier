// Le mode temps réel de Saga (Saga 1.12) : pour les jeux dont le pack de règles a la capacité `tempsReel`
// (le pack « action », regles/action/pack.js). Le joueur se déplace librement, au pixel près, en diagonale
// aussi ; il frappe avec la touche Action ; les ennemis apparaissent dans les zones de la carte, le
// poursuivent par le plus court chemin (moteur/chemins.js), frappent, reculent, clignotent, meurent et
// laissent leur butin au sol.
//
// Ce qui est commun à tous les jeux en temps réel est ici : le mouvement, les collisions avec la grille de
// passage de Tafl, les boîtes de coups (hitbox), le recul, l'invincibilité, les animations, le chemin, les
// comportements. Ce qui change d'un jeu à l'autre (les dégâts, la vie, l'expérience, le butin) est demandé
// au pack (ActionRegles) : il reçoit des nombres et rend des nombres.
//
// Ce fichier ne connaît ni les événements ni les scripts : le moteur (moteur.js) lui prête ce qu'il faut
// par `hote`, et lui dit quand la carte change. Le multijoueur en temps réel viendra ensuite : l'hôte fera
// tourner cette simulation et enverra aux autres où sont les ennemis.
//
// Les boîtes : un personnage (le héros ou le personnage d'un ennemi) peut avoir, dans personnages.json,
//   hitbox: { x, y, largeur, hauteur }   son corps, en pixels, depuis le coin haut gauche de sa case
//   frappe: { portee, largeur }          la zone que touche son coup, devant lui, en pixels
//   animations: { repos, attaque, coup, mort }   chacune une planche comme le sprite (4 rangées), + duree
// Sans elles, Saga prend des boîtes à la taille d'une case et dessine le coup lui-même.

const TempsReel = (() => {
  const DIRS = { bas: [0, 1], haut: [0, -1], gauche: [-1, 0], droite: [1, 0] };
  const DUREE_COUP = 0.26;      // le coup d'épée du héros (secondes)
  const RECHARGE_COUP = 0.12;   // après un coup, avant le suivant
  const DUREE_RECUL = 0.16;     // le recul d'un coup reçu
  const DUREE_MORT = 0.5;
  const PENSER = 0.28;          // un ennemi réfléchit ~3 fois par seconde
  const INVINCIBLE_ENNEMI = 0.35;
  // Saga 1.15.1 : le coup d'épée touche pendant tout le balayage de la lame (pas à un seul instant), et
  // dans l'éventail qu'on voit à l'écran (pas seulement dans un rectangle droit devant).
  const COUP_DEBUT = 0.08, COUP_FIN = 0.8;   // la fenêtre où la lame touche (fraction de DUREE_COUP)
  const DEMI_ARC = Math.PI / 2.2;            // l'éventail de la lame : un peu moins d'un demi-cercle
  const APPROCHE = 1.8;                      // (cases) assez près : l'ennemi va droit sur le joueur

  const rect = (x, y, l, h) => ({ x, y, l, h });
  const touche = (a, b) => a.x < b.x + b.l && b.x < a.x + a.l && a.y < b.y + b.h && b.y < a.y + a.h;
  const centre = (r) => ({ x: r.x + r.l / 2, y: r.y + r.h / 2 });
  const vers = (dx, dy) => (Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'gauche' : 'droite') : (dy < 0 ? 'haut' : 'bas'));

  // hote : {
  //   jeu(), partie(), carte()        le jeu, la partie, la carte du joueur
  //   bloque(cx, cy)                   la case est-elle infranchissable à pied (mur, rebord, événement…) ?
  //   surCase(cx, cy, dir, pousse)     le joueur arrive sur une nouvelle case (téléporteur, événement « toucher ») ;
  //                                    pousse : par un recul, le moteur note la case sans rien déclencher ;
  //                                    rend true si quelque chose commence (le joueur ne bouge plus)
  //   agir(cx, cy, dir)                Action devant le joueur : parler, ouvrir… ; rend true si c'est fait
  //   corps(o, maintenant)             dessine un personnage (moteur.js › dessinerCorps)
  //   bruit(nom), son(chemin)          les bruitages
  //   defaite()                        le héros n'a plus de vie
  //   annoncer(titre, texte)           une annonce en haut de l'écran (niveau gagné)
  //   reagir(moment, infos)            un moment pour les scripts JS (ennemi_vaincu, heros_touche)
  //   rencontres(zone, liste)          (facultatif) → les ennemis à faire apparaître dans la zone
  //   comportement(nom, etat)          → promesse de la décision d'un script JS (ou null s'il n'y en a pas)
  //   signaler(texte)                  une erreur à montrer au créateur
  // }
  function creer(hote) {
    let carte = null, t = 16;
    let heros = null;     // { px, py, dir, vx, vy, coup, recharge, recul, invincible, marche, cx, cy }
    let ennemis = [];
    let butins = [];      // au sol : { sorte: 'coeur' | 'argent' | 'objet', id, n, px, py, t }
    let textes = [];      // les nombres qui s'envolent : { x, y, texte, couleur, t }
    let horloge = 0;
    const scriptsSignales = new Set();

    const jeu = () => hote.jeu(), partie = () => hote.partie();
    const R = () => ActionRegles;

    // --- Les boîtes d'un personnage ---
    function boites(perso) {
      const h = perso?.hitbox;
      const corps = h && Number(h.largeur) > 0 && Number(h.hauteur) > 0
        ? rect(Number(h.x) || 0, Number(h.y) || 0, Number(h.largeur), Number(h.hauteur))
        : rect(t * 0.18, t * 0.3, t * 0.64, t * 0.66);
      // Les pieds : ce qui se cogne aux murs (le bas du corps), pour passer devant un mur sans s'y coller.
      const pieds = rect(corps.x + corps.l * 0.08, corps.y + corps.h * 0.55, corps.l * 0.84, corps.h * 0.45);
      const f = perso?.frappe;
      const frappe = { portee: Number(f?.portee) > 0 ? Number(f.portee) : t * 0.9, largeur: Number(f?.largeur) > 0 ? Number(f.largeur) : t * 1.1 };
      return { corps, pieds, frappe };
    }
    const enMonde = (e, r) => rect(e.px + r.x, e.py + r.y, r.l, r.h);
    // La case sous les pieds.
    const caseDe = (e) => { const c = centre(enMonde(e, e.b.pieds)); return { x: Math.floor(c.x / t), y: Math.floor(c.y / t) }; };
    // Le centre du corps, en cases (pour les distances et les comportements).
    const enCases = (e) => { const c = centre(enMonde(e, e.b.corps)); return { x: c.x / t - 0.5, y: c.y / t - 0.5 }; };

    // Une boîte posée là touche-t-elle un mur ?
    function libre(r) {
      const x0 = Math.floor(r.x / t), y0 = Math.floor(r.y / t), x1 = Math.floor((r.x + r.l - 0.01) / t), y1 = Math.floor((r.y + r.h - 0.01) / t);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x < 0 || y < 0 || x >= carte.largeur || y >= carte.hauteur || hote.bloque(x, y)) return false;
      return true;
    }
    // Avancer de (dx, dy) pixels en glissant le long des murs, et en contournant un coin de quelques pixels
    // (comme dans Zelda : on ne reste pas accroché à l'angle d'un arbre).
    function deplacer(e, dx, dy, aide = true) {
      const p = e.b.pieds;
      const essai = (x, y) => libre(rect(x + p.x, y + p.y, p.l, p.h));
      let bouge = false;
      for (const [ax, ay] of [[dx, 0], [0, dy]]) {
        if (!ax && !ay) continue;
        if (essai(e.px + ax, e.py + ay)) { e.px += ax; e.py += ay; bouge = true; continue; }
        if (!aide) continue;
        // Bloqué : un mur de côté juste à quelques pixels ? On glisse de ce côté.
        const pas = Math.max(1, Math.abs(ax || ay)), coin = Math.round(t * 0.4);
        for (let k = 1; k <= coin; k++) {
          const ok = ax
            ? [1, -1].find((s) => essai(e.px + ax, e.py + s * k) && essai(e.px, e.py + s * Math.min(k, pas)))
            : [1, -1].find((s) => essai(e.px + s * k, e.py + ay) && essai(e.px + s * Math.min(k, pas), e.py));
          if (ok) { if (ax) e.py += ok * Math.min(k, pas); else e.px += ok * Math.min(k, pas); bouge = true; break; }
        }
      }
      // Pas sortir de la carte.
      e.px = Math.max(-p.x, Math.min(carte.largeur * t - p.x - p.l, e.px));
      e.py = Math.max(-p.y, Math.min(carte.hauteur * t - p.y - p.h, e.py));
      return bouge;
    }

    // --- La carte ---
    function entrerCarte(nouvelle, x, y, dir) {
      carte = nouvelle;
      t = jeu().taille;
      const persoHeros = heros?.perso || jeu().heros;
      heros = {
        perso: persoHeros, b: boites(persoHeros),
        px: x * t, py: y * t, dir: DIRS[dir] ? dir : 'bas',
        coup: null, recharge: 0, recul: null, invincible: 0, marche: 0, bouge: false,
        cx: x, cy: y,
      };
      ennemis = [];
      butins = [];
      textes = [];
      apparaitre();
    }
    // Le héros est posé ailleurs (téléporteur sur la même carte, script « déplacer le joueur »).
    function placer(x, y, dir) {
      if (!heros) return;
      heros.px = x * t; heros.py = y * t; heros.cx = x; heros.cy = y;
      if (DIRS[dir]) heros.dir = dir;
      heros.recul = null;
    }

    // Les ennemis des zones : rencontres [{ ennemi, nombre }]. Un boss vaincu ne revient pas ; les autres
    // reviennent quand on revient sur la carte.
    function apparaitre() {
      const p = partie();
      for (const z of carte.zones) {
        const liste = Array.isArray(z.rencontres) ? z.rencontres : [];
        // Saga 1.14 : un module peut changer la liste (le roguelite : aucun ennemi dans une salle vidée).
        (hote.rencontres ? hote.rencontres(z, liste) || liste : liste).forEach((r, k) => {
          if (!r || !r.ennemi) return;
          const def = R().ennemi(jeu(), r.ennemi);
          if (!def) return;
          const n = Math.max(1, Math.min(30, Math.round(Number(r.nombre) || 1)));
          for (let i = 0; i < n; i++) {
            const cle = `${carte.id}/ennemi/${z.id}/${k}/${i}`;
            if (def.boss && p.locaux[cle]) continue;
            const ici = caseLibreDans(z);
            if (!ici) continue;
            const perso = jeu().personnages.get(def.personnage) || null;
            const e = {
              def, perso, b: boites(perso), cle,
              px: ici.x * t, py: ici.y * t, dir: 'bas', depart: { x: ici.x, y: ici.y },
              pv: def.pv, etat: 'repos', decision: { etat: 'repos', but: null }, penser: Math.random() * PENSER,
              chemin: [], butChemin: null, refaire: 0, coup: null, recharge: 0.6 + Math.random() * 0.6,
              recul: null, invincible: 0, mort: null, marche: 0, bouge: false, attend: false,
            };
            ennemis.push(e);
          }
        });
      }
    }
    function caseLibreDans(z) {
      for (let essai = 0; essai < 40; essai++) {
        const x = z.x + Math.floor(Math.random() * z.largeur), y = z.y + Math.floor(Math.random() * z.hauteur);
        if (x < 0 || y < 0 || x >= carte.largeur || y >= carte.hauteur || hote.bloque(x, y)) continue;
        if (heros && Math.abs(x - heros.cx) + Math.abs(y - heros.cy) < 4) continue;
        if (ennemis.some((e) => e.depart.x === x && e.depart.y === y)) continue;
        return { x, y };
      }
      return null;
    }

    // --- Une image ---
    // commande : { vecteur: { x, y } (de -1 à 1), courir, action (appuyée à cette image), libre }
    function avancer(dt, commande) {
      if (!carte || !heros) return;
      horloge += dt;
      textes = textes.filter((x) => (x.t += dt) < 0.8);
      for (const b of butins) b.t += dt;
      avancerHeros(dt, commande);
      for (const e of ennemis) avancerEnnemi(e, dt, commande.libre);
      ennemis = ennemis.filter((e) => !(e.mort && e.mort.t >= DUREE_MORT));
      if (commande.libre) ramasser();
    }

    function avancerHeros(dt, { vecteur, courir, action, libre: estLibre }) {
      const h = heros;
      h.recharge = Math.max(0, h.recharge - dt);
      h.invincible = Math.max(0, h.invincible - dt);
      const s = R().stats(jeu(), partie().equipe[0], partie());
      // Le recul d'un coup reçu : on ne contrôle plus rien pendant ce temps.
      if (h.recul) {
        h.recul.t += dt;
        const k = 1 - h.recul.t / DUREE_RECUL;
        deplacer(h, h.recul.vx * dt * Math.max(0, k) * 2, h.recul.vy * dt * Math.max(0, k) * 2, false);
        if (h.recul.t >= DUREE_RECUL) h.recul = null;
        h.bouge = false;
        // Poussé, il ne prend pas les téléporteurs ni les événements « toucher » : il faut y marcher.
        return verifierCase(true);
      }
      if (h.coup) {
        h.coup.t += dt;
        // Chaque image du balayage : ce que la lame rencontre est touché (une fois par coup).
        if (h.coup.t >= DUREE_COUP * COUP_DEBUT && h.coup.t <= DUREE_COUP * COUP_FIN) frapperDevant();
        if (h.coup.t >= DUREE_COUP) { h.coup = null; h.recharge = RECHARGE_COUP; }
      }
      if (!estLibre) { h.bouge = false; return; }
      if (action && !h.coup) {
        const c = caseDe(h), [dx, dy] = DIRS[h.dir];
        // D'abord ce qu'il y a devant (parler, ouvrir un coffre) ; sinon, un coup d'épée.
        if (!hote.agir(c.x + dx, c.y + dy, h.dir)) {
          if (h.recharge <= 0) { h.coup = { t: 0, touches: new Set() }; hote.bruit('epee'); }
        }
      }
      let { x: vx, y: vy } = vecteur || { x: 0, y: 0 };
      const n = Math.hypot(vx, vy);
      if (n > 1) { vx /= n; vy /= n; }
      // Pendant le coup, on avance à peine et on garde sa direction.
      const lent = h.coup ? 0.25 : 1;
      if (n > 0.05) {
        if (!h.coup) h.dir = Math.abs(vx) > Math.abs(vy) + 0.01 ? (vx < 0 ? 'gauche' : 'droite') : (vy < 0 ? 'haut' : vy > 0 ? 'bas' : h.dir);
        const v = s.vitesse * t * (courir ? 1.35 : 1) * lent;
        h.bouge = deplacer(h, vx * v * dt, vy * v * dt);
        if (h.bouge) h.marche += dt * (courir ? 1.35 : 1);
        else if (!h.choc) { hote.bruit('choc'); h.choc = 0.5; }
      } else h.bouge = false;
      if (h.choc) h.choc = Math.max(0, h.choc - dt) || (h.bouge ? 0 : h.choc);
      if (h.bouge) h.choc = 0;
      verifierCase();
    }
    // Une nouvelle case sous les pieds : le moteur regarde s'il s'y passe quelque chose.
    function verifierCase(pousse = false) {
      const c = caseDe(heros);
      if (c.x === heros.cx && c.y === heros.cy) return;
      heros.cx = c.x; heros.cy = c.y;
      hote.surCase(c.x, c.y, heros.dir, pousse);
    }
    // La portée d'un coup, en pixels. Un ennemi qui frappe « à 2 cases » (portee dans Tafl) atteint bien
    // 2 cases, même si son personnage n'a pas de zone de frappe aussi longue.
    const porteeDe = (e) => Math.max(e.b.frappe.portee, e === heros ? 0 : (Number(e.def?.portee) || 0) * t);
    // La zone du coup, devant celui qui frappe.
    function zoneFrappe(e) {
      const c = centre(enMonde(e, e.b.corps)), [dx, dy] = DIRS[e.dir], { largeur } = e.b.frappe, portee = porteeDe(e);
      const demi = (dx ? e.b.corps.l : e.b.corps.h) / 2;
      if (dx) return rect(dx > 0 ? c.x + demi * 0.4 : c.x - demi * 0.4 - portee, c.y - largeur / 2, portee, largeur);
      return rect(c.x - largeur / 2, dy > 0 ? c.y + demi * 0.4 : c.y - demi * 0.4 - portee, largeur, portee);
    }
    // Le rayon de l'éventail : jusqu'au bout de la lame dessinée (dessinerEpee).
    const rayonCoup = (e) => porteeDe(e) + t * 0.15;
    // Le coup de e atteint-il la boîte r ? Le rectangle devant lui, ou l'éventail (le point de r le plus
    // proche de son centre est à portée et devant lui, à DEMI_ARC près), ou r collé contre son centre.
    function atteint(e, r) {
      if (touche(zoneFrappe(e), r)) return true;
      const c = centre(enMonde(e, e.b.corps));
      const px = Math.max(r.x, Math.min(c.x, r.x + r.l)), py = Math.max(r.y, Math.min(c.y, r.y + r.h));
      const dx = px - c.x, dy = py - c.y, d = Math.hypot(dx, dy);
      if (d > rayonCoup(e)) return false;
      if (d < 1) return true;
      const [fx, fy] = DIRS[e.dir];
      return (dx * fx + dy * fy) / d >= Math.cos(DEMI_ARC);
    }
    function frapperDevant() {
      const coup = heros.coup;
      for (const e of ennemis) {
        // Encore invincible (touché au coup d'avant) : il pourra l'être plus tard dans ce même balayage.
        if (e.mort || e.invincible > 0 || coup.touches.has(e) || !atteint(heros, enMonde(e, e.b.corps))) continue;
        coup.touches.add(e);
        appliquer(R().coupDuHeros(jeu(), partie(), e.def), (n) => blesserEnnemi(e, n));
      }
    }
    // Un nombre, ou une promesse (règle maison d'un script) : on l'applique dès qu'on l'a.
    function appliquer(v, faire) {
      if (v && typeof v.then === 'function') v.then((n) => { if (carte) faire(Math.max(0, Math.round(Number(n) || 0))); }).catch(() => {});
      else faire(Math.max(0, Math.round(Number(v) || 0)));
    }
    function pousser(e, depuis, force) {
      const a = centre(enMonde(e, e.b.corps));
      let dx = a.x - depuis.x, dy = a.y - depuis.y;
      const n = Math.hypot(dx, dy) || 1;
      dx /= n; dy /= n;
      const v = (force * t) / DUREE_RECUL;
      e.recul = { vx: dx * v, vy: dy * v, t: 0 };
    }
    function blesserEnnemi(e, n) {
      if (e.mort) return;
      e.pv -= n;
      e.invincible = INVINCIBLE_ENNEMI;
      const c = centre(enMonde(e, e.b.corps));
      textes.push({ x: c.x, y: c.y - t * 0.5, texte: String(n), couleur: '#fff', t: 0 });
      hote.bruit(e.pv > 0 ? 'touche' : 'vaincu');
      e.coup = null;
      pousser(e, centre(enMonde(heros, heros.b.corps)), 1.6 / e.def.poids);
      if (e.pv <= 0) mourir(e);
    }
    function mourir(e) {
      e.mort = { t: 0 };
      e.recul = null;
      const p = partie();
      if (e.def.boss) p.locaux[e.cle] = true;
      const r = R().vaincu(jeu(), p, e.def);
      const c = centre(enMonde(e, e.b.corps));
      const poser = (sorte, id, n) => {
        const k = butins.length, a = k * 2.4;
        butins.push({ sorte, id, n, px: c.x + Math.cos(a) * t * 0.35 * Math.min(1, k), py: c.y + Math.sin(a) * t * 0.25 * Math.min(1, k), t: 0 });
      };
      if (r.coeur) poser('coeur', '', R().reglages(jeu()).pv_coeur);
      if (r.argent > 0) poser('argent', '', r.argent);
      for (const id of r.butin) poser('objet', id, 1);
      if (r.xp > 0) textes.push({ x: c.x, y: c.y - t, texte: `+${r.xp} xp`, couleur: '#8fd0ff', t: 0 });
      for (const n of r.niveaux) { hote.annoncer(`Niveau ${n} !`, 'Tu deviens plus fort.'); hote.bruit('niveau'); }
      hote.reagir('ennemi_vaincu', { ennemi: e.def.id, x: Math.floor(c.x / t), y: Math.floor(c.y / t) });
    }
    function blesserHeros(n, depuis) {
      const h = heros, s = R().stats(jeu(), partie().equipe[0]);
      if (h.invincible > 0) return;
      const pv = R().blesser(jeu(), partie(), n);
      h.invincible = s.invincibilite;
      h.coup = null;
      const c = centre(enMonde(h, h.b.corps));
      textes.push({ x: c.x, y: c.y - t * 0.6, texte: String(n), couleur: '#ff6b6b', t: 0 });
      hote.bruit('blesse');
      if (s.recul > 0) pousser(h, depuis, s.recul);
      hote.reagir('heros_touche', { degats: n, pv });
      if (pv <= 0) hote.defaite();
    }

    // --- Un ennemi ---
    function avancerEnnemi(e, dt, estLibre) {
      if (e.mort) { e.mort.t += dt; return; }
      e.invincible = Math.max(0, e.invincible - dt);
      e.recharge = Math.max(0, e.recharge - dt);
      e.bouge = false;
      if (e.recul) {
        e.recul.t += dt;
        deplacer(e, e.recul.vx * dt, e.recul.vy * dt, false);
        if (e.recul.t >= DUREE_RECUL) e.recul = null;
        return;
      }
      if (!estLibre) return; // un dialogue, un menu : le monde attend
      const moi = enCases(e), lui = enCases(heros);
      const distance = Math.hypot(lui.x - moi.x, lui.y - moi.y);
      // Réfléchir (Comportements.decider, ou le script du jeu).
      e.penser -= dt;
      if (e.penser <= 0 && !e.attend) {
        e.penser = PENSER * (0.8 + Math.random() * 0.4);
        const etat = {
          comportement: e.def.comportement, etat: e.decision.etat, x: moi.x, y: moi.y, depart: { ...e.depart },
          joueur: { x: lui.x, y: lui.y }, distance, vue: e.def.vue, portee: e.def.portee, pret: e.recharge <= 0 && !e.coup,
          pv: e.pv, pvMax: e.def.pv, hasard: Math.random(), but: e.decision.but,
        };
        if (e.def.comportement === 'script') penserScript(e, etat);
        else e.decision = Comportements.decider(etat);
      }
      // Son coup : il s'arrête, se tourne vers le joueur, frappe un peu plus tard (on a le temps de le voir).
      if (e.coup) {
        e.coup.t += dt;
        if (!e.coup.fait && e.coup.t >= e.coup.duree * 0.55) {
          e.coup.fait = true;
          if (atteint(e, enMonde(heros, heros.b.corps))) appliquer(R().coupDeLEnnemi(jeu(), partie(), e.def), (n) => blesserHeros(n, centre(enMonde(e, e.b.corps))));
        }
        if (e.coup.t >= e.coup.duree) { e.coup = null; e.recharge = e.def.recharge; }
        return;
      }
      if (e.decision.frapper && e.recharge <= 0 && e.def.portee > 0) {
        e.decision = { ...e.decision, frapper: false };
        e.dir = vers(lui.x - moi.x, lui.y - moi.y);
        e.coup = { t: 0, duree: 0.45, fait: false };
        return;
      }
      const v = e.def.vitesse * t * dt;
      if (e.decision.fuir) {
        const dx = moi.x - lui.x, dy = moi.y - lui.y, n = Math.hypot(dx, dy) || 1;
        e.bouge = deplacer(e, (dx / n) * v, (dy / n) * v);
        if (e.bouge) e.dir = vers(dx, dy);
      } else if (e.decision.but && v > 0) {
        // Il chasse le joueur et il est tout près : il va droit sur lui, au pixel près. (Avant, il visait
        // le centre de la case du joueur et s'arrêtait là, parfois à côté de lui sans le toucher.)
        const surJoueur = e.decision.but.x === Math.round(lui.x) && e.decision.but.y === Math.round(lui.y);
        if (!(surJoueur && distance <= APPROCHE && approcher(e, v))) suivreChemin(e, e.decision.but, v, dt);
      }
      if (e.bouge) e.marche += dt;
      // Le contact : un ennemi qui touche le héros le blesse.
      if (e.def.contact && heros.invincible <= 0 && touche(enMonde(e, e.b.corps), enMonde(heros, heros.b.corps))) {
        appliquer(R().coupDeLEnnemi(jeu(), partie(), e.def), (n) => blesserHeros(n, centre(enMonde(e, e.b.corps))));
      }
    }
    function penserScript(e, etat) {
      const nom = e.def.script;
      const p = nom ? hote.comportement(nom, etat) : null;
      if (!p) {
        if (!scriptsSignales.has(nom)) { scriptsSignales.add(nom); hote.signaler(`L'ennemi « ${e.def.nom} » suit le comportement de script « ${nom || '(sans nom)'} », mais aucun script ne le déclare : il patrouille.`); }
        e.decision = Comportements.decider({ ...etat, comportement: 'patrouiller' });
        return;
      }
      e.attend = true;
      p.then((d) => { e.decision = Comportements.nettoyer(d, e.decision); })
        .catch(() => { e.decision = Comportements.decider({ ...etat, comportement: 'patrouiller' }); })
        .finally(() => { e.attend = false; });
    }
    // Aller droit sur le joueur, jusqu'à le toucher (ou l'avoir à portée de coup, pour un ennemi qui frappe
    // sans blesser au contact). Rend false s'il est bloqué (un mur entre eux) : on reprend alors le chemin.
    function approcher(e, v) {
      const corpsHeros = enMonde(heros, heros.b.corps), moi = enMonde(e, e.b.corps);
      const a = centre(moi), b = centre(corpsHeros);
      const dx = b.x - a.x, dy = b.y - a.y, n = Math.hypot(dx, dy);
      e.dir = vers(dx, dy);
      // Un ennemi qui frappe s'arrête à sa portée (la même mesure que Comportements : de centre à centre).
      const assez = touche(moi, corpsHeros) || (!e.def.contact && e.def.portee > 0 && n / t <= e.def.portee);
      if (assez || n < 1) { e.chemin = []; return true; }
      const k = Math.min(1, v / n);
      e.bouge = deplacer(e, dx * k, dy * k);
      if (e.bouge) e.chemin = [];
      return e.bouge;
    }
    // Aller vers une case par le plus court chemin (A* de moteur/chemins.js, en 8 directions).
    function suivreChemin(e, but, v, dt) {
      const ici = caseDe(e);
      e.refaire -= dt;
      const autreBut = !e.butChemin || e.butChemin.x !== but.x || e.butChemin.y !== but.y;
      if (autreBut || e.refaire <= 0 || !e.chemin.length) {
        e.butChemin = { ...but };
        e.refaire = 0.5;
        const b = { x: Math.max(0, Math.min(carte.largeur - 1, but.x)), y: Math.max(0, Math.min(carte.hauteur - 1, but.y)) };
        e.chemin = Chemins.trouver({
          largeur: carte.largeur, hauteur: carte.hauteur, depart: ici, arrivee: b, max: 900, diagonales: true,
          libre: (x, y) => !hote.bloque(x, y),
        }) || [];
        if (!e.chemin.length && (ici.x !== b.x || ici.y !== b.y) && hote.bloque(b.x, b.y) === false) e.chemin = [b];
      }
      // La prochaine case : on vise son centre (les pieds de l'ennemi au milieu de la case).
      while (e.chemin.length && e.chemin[0].x === ici.x && e.chemin[0].y === ici.y && e.chemin.length > 1) e.chemin.shift();
      const prochaine = e.chemin[0];
      if (!prochaine) return;
      const p = e.b.pieds;
      const cx = prochaine.x * t + t / 2 - (p.x + p.l / 2), cy = prochaine.y * t + t / 2 - (p.y + p.h / 2);
      const dx = cx - e.px, dy = cy - e.py, n = Math.hypot(dx, dy);
      if (n < 1) { e.chemin.shift(); return; }
      const k = Math.min(1, v / n);
      e.bouge = deplacer(e, dx * k, dy * k);
      e.dir = vers(dx, dy);
      if (!e.bouge) e.refaire = 0; // coincé : on cherche un autre chemin
    }

    // --- Le butin au sol : on marche dessus pour le prendre ---
    function ramasser() {
      const corps = enMonde(heros, heros.b.corps), p = partie();
      butins = butins.filter((b) => {
        if (b.t < 0.35 || !touche(corps, rect(b.px - t * 0.3, b.py - t * 0.3, t * 0.6, t * 0.6))) return true;
        if (b.sorte === 'coeur') R().soignerPv(jeu(), p, b.n);
        else if (b.sorte === 'argent') p.argent = (p.argent || 0) + b.n;
        else p.sac[b.id] = (p.sac[b.id] || 0) + b.n;
        const nom = b.sorte === 'objet' ? R().trouver(jeu(), 'objets', b.id)?.nom || b.id : '';
        textes.push({ x: b.px, y: b.py - t * 0.5, texte: b.sorte === 'coeur' ? '♥' : b.sorte === 'argent' ? `+${b.n}` : nom, couleur: b.sorte === 'coeur' ? '#ff6b8a' : '#ffd84a', t: 0 });
        hote.bruit('ramasser');
        return false;
      });
    }

    // --- Le dessin ---
    // Ce qu'on ajoute à la liste des choses à dessiner du moteur (triée du haut vers le bas de l'écran).
    function aDessiner(cam, maintenant) {
      const out = [];
      for (const b of butins) out.push({ y: b.py - t, dessiner: (ctx) => dessinerButin(ctx, b, cam) });
      for (const e of ennemis) out.push({ y: e.py, dessiner: (ctx) => dessinerEntite(ctx, e, e.perso, e.def.couleur, cam, maintenant) });
      if (heros) out.push({ y: heros.py, heros: true, dessiner: (ctx, o = {}) => dessinerEntite(ctx, heros, o.perso || heros.perso, '#d94a4a', cam, maintenant) });
      return out;
    }
    function animation(perso, nom) { return perso?.animations?.[nom] || null; }
    function dessinerEntite(ctx, e, perso, couleur, cam, maintenant) {
      const x = Math.round(e.px) - cam.x, y = Math.round(e.py) - cam.y;
      // Invincible : il clignote (sauf pendant sa mort).
      if (!e.mort && e.invincible > 0 && Math.floor(e.invincible * 16) % 2) return;
      ctx.save();
      let anim = null, temps = 0, boucle = true;
      if (e.mort) { anim = animation(perso, 'mort'); temps = e.mort.t; boucle = false; if (!anim) { ctx.globalAlpha = Math.max(0, 1 - e.mort.t / DUREE_MORT); } }
      else if (e.coup) { anim = animation(perso, 'attaque'); temps = e.coup.t; boucle = false; }
      else if (e.recul) { anim = animation(perso, 'coup'); temps = e.recul.t; boucle = false; }
      else if (!e.bouge) { anim = animation(perso, 'repos'); temps = horloge; }
      // Un ennemi qui prépare son coup sans animation : il recule un peu puis bondit.
      let ox = 0, oy = 0;
      if (e.coup && !anim && e !== heros) {
        const [dx, dy] = DIRS[e.dir], k = e.coup.t / e.coup.duree;
        const d = k < 0.55 ? -k * 3 : (1 - k) * 6;
        ox = Math.round(dx * d); oy = Math.round(dy * d);
      }
      if (anim) {
        Sprites.ombre(ctx, x + ox, y + oy, t, 1);
        Sprites.dessinerAnimation(ctx, anim, e.dir, temps, x + ox, y + oy, t, boucle);
      } else {
        const pas = e.bouge ? 1 + Math.floor(e.marche * 8) : 0;
        if (e.mort && !anim) {
          // Sans animation de mort : il s'aplatit en s'effaçant.
          const k = e.mort.t / DUREE_MORT;
          ctx.translate(x + t / 2, y + t);
          ctx.scale(1 + k * 0.4, 1 - k * 0.7);
          ctx.translate(-(x + t / 2), -(y + t));
        }
        hote.corps({ perso, couleur, direction: e.dir, pas, x: x + ox, y: y + oy }, maintenant, ctx);
      }
      ctx.restore();
      if (e === heros && e.coup && !anim) dessinerEpee(ctx, cam);
      // La vie d'un ennemi blessé, en petite barre au-dessus de lui.
      if (e !== heros && !e.mort && e.pv < e.def.pv) {
        const l = Math.round(t * 0.8), k = Math.max(0, e.pv / e.def.pv);
        const bx = x + Math.round((t - l) / 2), by = y + Math.round(e.b.corps.y) - 4;
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(bx - 1, by - 1, l + 2, 4);
        ctx.fillStyle = k > 0.5 ? '#6fdc6f' : k > 0.25 ? '#f2c230' : '#f0503c'; ctx.fillRect(bx, by, Math.max(1, Math.round(l * k)), 2);
      }
    }
    // Le coup d'épée sans animation : une lame qui balaie un quart de cercle devant le héros.
    function dessinerEpee(ctx, cam) {
      const h = heros, c = centre(enMonde(h, h.b.corps)), k = Math.min(1, h.coup.t / (DUREE_COUP * 0.7));
      const base = { droite: 0, bas: Math.PI / 2, gauche: Math.PI, haut: -Math.PI / 2 }[h.dir];
      const a = base - DEMI_ARC + k * 2 * DEMI_ARC;
      const r0 = t * 0.25, r1 = rayonCoup(h);
      const cx = c.x - cam.x, cy = c.y - cam.y;
      ctx.save();
      // La traînée, puis la lame.
      ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r1, base - DEMI_ARC, a);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#eef3ff';
      ctx.lineWidth = Math.max(1, Math.round(t / 10));
      ctx.lineCap = 'square';
      ctx.beginPath();
      ctx.moveTo(Math.round(cx + Math.cos(a) * r0), Math.round(cy + Math.sin(a) * r0));
      ctx.lineTo(Math.round(cx + Math.cos(a) * r1), Math.round(cy + Math.sin(a) * r1));
      ctx.stroke();
      ctx.fillStyle = '#c9a24a';
      ctx.fillRect(Math.round(cx + Math.cos(a) * r0) - 1, Math.round(cy + Math.sin(a) * r0) - 1, 3, 3);
      ctx.restore();
    }
    function dessinerButin(ctx, b, cam) {
      const x = Math.round(b.px) - cam.x, y = Math.round(b.py - Math.abs(Math.sin(Math.min(b.t, 0.35) * 9)) * (b.t < 0.35 ? 4 : 0)) - cam.y;
      const u = Math.max(1, Math.round(t / 16));
      // Il clignote un peu avant qu'on puisse le prendre.
      if (b.t < 0.35 && Math.floor(b.t * 20) % 2) return;
      if (b.sorte === 'coeur') coeur(ctx, x - 4 * u, y - 4 * u, u, 1);
      else if (b.sorte === 'argent') {
        ctx.fillStyle = '#7a5a10'; ctx.fillRect(x - 3 * u, y - 3 * u, 6 * u, 6 * u);
        ctx.fillStyle = '#ffd84a'; ctx.fillRect(x - 2 * u, y - 3 * u, 4 * u, 6 * u); ctx.fillRect(x - 3 * u, y - 2 * u, 6 * u, 4 * u);
        ctx.fillStyle = '#fff3b0'; ctx.fillRect(x - u, y - 2 * u, u, 2 * u);
      } else {
        const o = R().trouver(jeu(), 'objets', b.id);
        const img = o?.icone ? icone(o.icone) : null;
        if (img?.complete && img.naturalWidth) ctx.drawImage(img, x - 6 * u, y - 6 * u, 12 * u, 12 * u);
        else { ctx.fillStyle = '#5ea8ff'; ctx.fillRect(x - 3 * u, y - 4 * u, 6 * u, 8 * u); ctx.fillStyle = '#d8ecff'; ctx.fillRect(x - 2 * u, y - 3 * u, 2 * u, 2 * u); }
      }
    }
    const icones = new Map();
    function icone(src) {
      if (!icones.has(src)) { const i = new Image(); i.src = src; icones.set(src, i); }
      return icones.get(src);
    }
    // Un cœur de 8 × 7 pixels (agrandi u fois), rempli au quart près (k de 0 à 1).
    const COEUR = ['.oo..oo.', 'orroorro', 'orrrrrro', 'orrrrrro', '.orrrro.', '..orro..', '...oo...'];
    function coeur(ctx, x, y, u, k) {
      for (let j = 0; j < COEUR.length; j++) {
        for (let i = 0; i < 8; i++) {
          const c = COEUR[j][i];
          if (c === '.') continue;
          // Le remplissage par quarts : gauche-haut, gauche-bas, droite-bas, droite-haut… plus simple : de gauche à droite.
          const plein = (i + 0.5) / 8 <= k + 1e-6;
          ctx.fillStyle = c === 'o' ? '#3a0d14' : plein ? (j < 2 && i % 4 === 1 ? '#ff9aa8' : '#e8344a') : '#5a2a32';
          ctx.fillRect(x + i * u, y + j * u, u, u);
        }
      }
    }
    // Les nombres qui s'envolent, et la vie du héros (des cœurs) et son argent, en haut à gauche.
    function dessinerDessus(ctx, cam, largeur) {
      ctx.save();
      ctx.font = `${Math.max(8, Math.round(t * 0.75))}px "Jersey 10", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      for (const x of textes) {
        const k = x.t / 0.8;
        ctx.globalAlpha = 1 - k * k;
        const px = Math.round(x.x - cam.x), py = Math.round(x.y - cam.y - k * t * 0.8);
        ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillText(x.texte, px + 1, py + 1);
        ctx.fillStyle = x.couleur; ctx.fillText(x.texte, px, py);
      }
      ctx.restore();
      const c = partie()?.equipe[0];
      if (!c) return;
      const r = R().reglages(jeu()), max = R().pvMax(jeu(), c);
      const u = Math.max(1, Math.round(t / 16)), n = Math.ceil(max / r.pv_coeur), parLigne = Math.max(5, Math.min(10, Math.floor((largeur - 8) / (9 * u))));
      for (let i = 0; i < n; i++) {
        const k = Math.max(0, Math.min(1, (c.pv - i * r.pv_coeur) / r.pv_coeur));
        coeur(ctx, 4 + (i % parLigne) * 9 * u, 4 + Math.floor(i / parLigne) * 8 * u, u, Math.floor(k * 4) / 4);
      }
      // L'argent, sous les cœurs.
      const y = 6 + (Math.floor((n - 1) / parLigne) + 1) * 8 * u;
      ctx.save();
      ctx.font = `${Math.max(8, Math.round(t * 0.7))}px "Jersey 10", monospace`;
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#ffd84a'; ctx.fillRect(4, y + u, 4 * u, 4 * u);
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(String(partie().argent || 0), 6 + 5 * u, y - u + 1);
      ctx.fillStyle = '#fff'; ctx.fillText(String(partie().argent || 0), 5 + 5 * u, y - u);
      ctx.restore();
    }
    // F3 : les boîtes (corps en vert, pieds en bleu, coups en rouge) et les chemins des ennemis.
    function dessinerDebug(ctx, cam) {
      ctx.save();
      ctx.lineWidth = 1;
      const boite = (r, couleur) => { ctx.strokeStyle = couleur; ctx.strokeRect(Math.round(r.x - cam.x) + 0.5, Math.round(r.y - cam.y) + 0.5, Math.max(1, Math.round(r.l) - 1), Math.max(1, Math.round(r.h) - 1)); };
      for (const e of [heros, ...ennemis]) {
        if (!e || e.mort) continue;
        boite(enMonde(e, e.b.corps), 'rgba(90, 255, 120, 0.9)');
        boite(enMonde(e, e.b.pieds), 'rgba(90, 170, 255, 0.9)');
        if (e.coup || e === heros) {
          const couleur = e.coup ? 'rgba(255, 80, 80, 0.95)' : 'rgba(255, 80, 80, 0.3)';
          boite(zoneFrappe(e), couleur);
          // L'éventail du coup (ce qu'il atteint en plus du rectangle).
          const c = centre(enMonde(e, e.b.corps)), base = { droite: 0, bas: Math.PI / 2, gauche: Math.PI, haut: -Math.PI / 2 }[e.dir];
          ctx.strokeStyle = couleur;
          ctx.beginPath();
          ctx.moveTo(c.x - cam.x, c.y - cam.y);
          ctx.arc(c.x - cam.x, c.y - cam.y, rayonCoup(e), base - DEMI_ARC, base + DEMI_ARC);
          ctx.closePath();
          ctx.stroke();
        }
        if (e !== heros && e.chemin?.length) {
          ctx.strokeStyle = 'rgba(255, 220, 90, 0.8)';
          ctx.beginPath();
          const c0 = centre(enMonde(e, e.b.pieds));
          ctx.moveTo(c0.x - cam.x, c0.y - cam.y);
          for (const p of e.chemin) ctx.lineTo(p.x * t + t / 2 - cam.x, p.y * t + t / 2 - cam.y);
          ctx.stroke();
          ctx.fillStyle = '#fff';
          ctx.font = '8px monospace';
          ctx.fillText(e.decision.etat || '', Math.round(e.px - cam.x), Math.round(e.py - cam.y));
        }
      }
      ctx.restore();
    }

    return {
      entrerCarte, placer, avancer, aDessiner, dessinerDessus, dessinerDebug,
      // Le héros, en pixels (coin haut gauche de sa « case » de dessin) : la caméra le suit.
      pixels: () => (heros ? { x: Math.round(heros.px), y: Math.round(heros.py), saut: 0 } : null),
      get caseHeros() { return heros ? { x: heros.cx, y: heros.cy, dir: heros.dir } : null; },
      get ennemis() { return ennemis.filter((e) => !e.mort).map((e) => ({ id: e.def.id, nom: e.def.nom, pv: e.pv, x: caseDe(e).x, y: caseDe(e).y, etat: e.decision.etat })); },
      // Une case occupée par un ennemi vivant (pour qu'un PNJ ne marche pas dessus).
      occupe: (x, y) => ennemis.some((e) => !e.mort && caseDe(e).x === x && caseDe(e).y === y),
      oublierHeros() { if (heros) { heros.coup = null; heros.recul = null; } },
      soignerHeros() { if (heros) { heros.invincible = 0; heros.recul = null; heros.coup = null; } },
    };
  }

  return { creer };
})();
