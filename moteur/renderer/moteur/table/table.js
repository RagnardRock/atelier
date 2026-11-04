// Le mode table (Saga 0.14) : une partie de jeu de rôle sur table (pack JDR), menée par un MJ.
//
// Au lieu d'un héros qui marche au clavier, la carte devient un plateau : une grille (une case = une
// tuile), un pion par héros, des pions de monstres, le brouillard sur les pièces. Le MJ déplace tout à la
// souris (chaque joueur peut déplacer son héros depuis l'écran des joueurs), révèle les pièces, cache
// des pions et des jets, lance la musique. Les combats suivent les règles du pack, sur la grille.
//
// Ce fichier est le chef d'orchestre, côté hôte : il garde l'état (table/etat.js, dans la partie),
// dessine la vue du MJ (table/plateau.js), joue les combats (regles/jdr/combat.js avec la `grille` et
// l'écran de combat d'ici), et envoie à l'écran des joueurs sa vue filtrée, rien de plus.
//
//   creer({ scene, hote }) → { demarrer, arreter, entrerCarte, dessiner, combattre, touche, recevoir, ... }
//   hote (moteur.js) : { jeu(), partie(), carte(), presents(), occupe(), lancer(p), teleporter(vers),
//                        placerJoueur(x, y, dir), dialogue, des(o), musique(chemin), son(chemin), message(t), bruit(n) }

const TableMode = (() => {
  const E = TableEtat, G = TableGrille;
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  const VISIBILITES = (jeu, partie) => [
    ['tous', 'Tout le monde'], ['mj', 'Le MJ seulement'],
    ...partie.equipe.filter((c) => c.jdr).map((c) => [`perso:${c.creature}`, `${JdrPerso.nom(jeu, c)} seulement`]),
  ];

  function creer({ scene, hote }) {
    const h = hote;
    const canvas = el('canvas', { className: 'table-plateau' });
    // À droite, la colonne du MJ : la boîte des combats en haut (le plateau reste tout visible), le panneau dessous.
    const boite = el('div', { className: 'table-combat', hidden: true });
    const colonne = el('aside', { className: 'table-colonne' }, boite);
    const menu = el('div', { className: 'table-menu', hidden: true });
    scene.append(canvas, colonne, menu);
    const plateau = Plateau.creer(canvas);
    let actif = false;
    let selection = null, survol = null, picker = null, pinceau = null, apercu = null;
    let combat = null;     // { tour, ordre, actif, reste, heros: [pion], ennemis: [pion] }
    let sceneTexte = null; // ce que dit la boîte de dialogue (recopié chez les joueurs)
    let effets = [], numero = 0; // les nombres et éclats, pour les rejouer chez les joueurs
    let derniereVue = null, envoye = '', chronoEnvoi = 0;
    // Saga 1.0 : le multijoueur. Chaque ami connecté reçoit SA vue (celle de son rôle), jamais celle du MJ.
    const envoyes = new Map(); // id du client → le dernier texte envoyé
    let panneau = null;

    const jeu = () => h.jeu();
    const partie = () => h.partie();
    const carte = () => h.carte();
    const table = () => partie().table;
    const R = () => E.reglages(jeu());
    const role = () => apercu || { mj: true };
    const ctxVue = () => ({
      carte: carte(), presents: h.presents(), scene: sceneTexte,
      combat: combat ? { tour: combat.tour, ordre: combat.ordre, actif: combat.actif, reste: combat.reste } : null,
      nomHeros: (c) => JdrPerso.nom(jeu(), c), pvMaxHeros: (c) => JdrPerso.pvMax(jeu(), c),
      ficheDe: (perso) => fichePour(perso),
    });
    // La fiche qu'un joueur reçoit (la sienne) : de quoi la lire et lancer ses jets.
    function fichePour(role) {
      const c = partie().equipe.find((q) => q?.jdr && E.estMien(role, q));
      if (!c) return null;
      const j = jeu();
      return {
        nom: JdrPerso.nom(j, c), niveau: c.niveau, pv: Math.max(0, c.pv), pvMax: JdrPerso.pvMax(j, c), ca: JdrPerso.ca(j, c),
        caracs: JdrBase.caracteristiques(j).map((x) => ({ id: x.id, nom: x.nom, court: x.court, valeur: JdrPerso.carac(j, c, x.id), mod: JdrBase.mod(JdrPerso.carac(j, c, x.id)), sauvegarde: JdrPerso.bonusSauvegarde(j, c, x.id) })),
        competences: JdrBase.listeOuDefaut(j, 'competences').map((x) => ({ id: x.id, nom: x.nom, bonus: JdrPerso.bonusCompetence(j, c, x.id), maitrise: JdrPerso.competencesMaitrisees(j, c).includes(x.id) })),
        attaques: JdrPerso.attaques(j, c).map((x) => ({ nom: x.nom, bonus: x.bonus, des: x.des, mod: x.mod })),
        etats: c.etats || [],
        // Saga 1.21.2 : ce que le joueur peut faire hors combat (équipement, sorts, niveau…) et le sac du groupe.
        actions: JdrHorsCombat.actionsMembre(j, c).map(([id, texte]) => ({ id, texte })),
        sac: Object.entries(partie().sac || {}).filter(([, n]) => n > 0).map(([id, n]) => {
          const o = JdrPerso.objet(j, id);
          return o ? { id, nom: o.nom, n, detail: JdrHorsCombat.texteObjet(o), utilisable: JdrHorsCombat.utilisable(o) } : null;
        }).filter(Boolean),
        argent: partie().argent || 0,
        notes: c.notes || '',
        ...ficheDuJeu(c, false),
      };
    }
    // Saga 1.21.3 : la fiche personnalisée du jeu (commun/fiche-perso.js). Au joueur : la disposition et
    // l'apparence (sans l'image, que son écran lit dans le jeu) et ses champs, sans ceux du MJ seul.
    function ficheDuJeu(c, mj) {
      const f = JdrBase.fiche(jeu());
      if (!f) return {};
      const j = jeu();
      const k = JdrPerso.classe(j, c), o = JdrPerso.origine(j, c);
      const champs = JdrFiches.champs(j, c).filter((x) => mj || x.visible !== 'mj')
        .map(({ id, nom, type, valeur, max, options, formule, calcule, note, visible, modifiable }) => ({ id, nom, type, valeur, max, options, formule, calcule, note, visible, modifiable: mj || modifiable === 'joueur' }));
      const caches = new Set(f.champs.filter((x) => !mj && x.visible === 'mj').map((x) => x.id));
      return {
        sousTitre: `${o?.nom ? `${o.nom} · ` : ''}${k?.nom || ''} niv. ${c.niveau}`,
        champs,
        modele: { ...f, theme: { ...f.theme, image: '' }, champs: f.champs.filter((x) => !caches.has(x.id)).map((x) => ({ id: x.id })), blocs: f.blocs.map((b) => (b.champs ? { ...b, champs: b.champs.filter((x) => !caches.has(x)) } : b)) },
      };
    }
    // Un champ changé depuis une fiche (un joueur : la sienne, et seulement ce que le jeu lui laisse).
    function changerChamp(c, id, valeur, mj) {
      const x = JdrFiches.champs(jeu(), c).find((k) => k.id === id);
      if (!x || (!mj && (x.visible === 'mj' || x.modifiable !== 'joueur'))) return false;
      if (JdrFiches.changerChamp(jeu(), c, id, valeur) === undefined) return false;
      envoyes.clear();
      panneau?.rafraichir();
      ficheMj?.maj();
      return true;
    }

    // La fiche d'un héros pour le MJ : tous les champs, qu'il peut tous changer.
    let ficheMj = null;
    function ouvrirFiche(c) {
      ficheMj?.fermer();
      if (!c) return;
      const fond = el('div', { className: 'table-fiche-mj' });
      const cadre = el('div', { className: 'table-fiche-mj-cadre' });
      const fermer = el('button', { type: 'button', className: 'table-fiche-mj-fermer', title: 'Fermer (Échap)', textContent: '✕' });
      fond.append(cadre);
      let signatureMj = '';
      const maj = () => {
        if (!partie()?.equipe.includes(c)) { ficheMj?.fermer(); return; }
        const d = { ...fichePour({ mj: false, perso: c.creature, heros: c.pion }) || {}, ...ficheDuJeu(c, true) };
        const s = JSON.stringify(d);
        if (s === signatureMj) return;
        signatureMj = s;
        const f = JdrBase.fiche(jeu());
        cadre.replaceChildren(fermer, FichePerso.rendre(f, d, { changer: (id, v) => changerChamp(c, id, v, true), image: f?.theme.image, mj: true }));
      };
      const minuterie = setInterval(maj, 700);
      const quitter = () => { clearInterval(minuterie); fond.remove(); ficheMj = null; };
      fermer.onclick = quitter;
      fond.onclick = (e) => { if (e.target === fond) quitter(); };
      ficheMj = { fermer: quitter, maj: () => { signatureMj = ''; maj(); } };
      document.body.append(fond);
      maj();
    }
    const vuePour = (r) => {
      const v = { ...E.vue(jeu(), partie(), r, ctxVue()), effets: effets.filter((e) => r.mj || e.public) };
      // Saga 1.21 : en combat, le joueur du héros dont c'est le tour reçoit ses choix (le menu, les cases, les cibles).
      const q = questionPour(r);
      if (q) {
        if (q.choix?.cibles) q.choix.cibles = q.choix.cibles.filter((id) => v.pions.some((p) => p.id === id));
        v.question = q;
      }
      return v;
    };
    const pion = (id) => table().pions.find((p) => p.id === id) || null;
    const presentDe = (id) => h.presents().find((q) => `ev:${q.ev.id}` === id) || null;
    const occupee = (x, y, sauf = null) => E.occupee(table(), carte().id, x, y, sauf) || h.presents().some((q) => q.bloque && q.x === x && q.y === y);

    function noterEffet(id, sorte, texte, couleur) {
      const p = pion(id);
      // Un nombre sur un monstre caché ne se montre pas aux joueurs.
      const pub = !p || p.sorte === 'heros' || E.visiblePour(p.visible, { mj: false });
      effets.push({ n: ++numero, id, sorte, texte, couleur, public: pub });
      if (effets.length > 30) effets.shift();
    }

    // --- Démarrer, changer de carte ---
    function demarrer() {
      actif = true;
      document.body.classList.add('mode-table');
      E.preparer(jeu(), partie());
      h.dialogue.observer((o) => {
        sceneTexte = o;
        // Saga 1.21.2 : des choix de dialogue → un vote des joueurs (le MJ peut toujours cliquer lui-même).
        vote = o?.choix?.length ? { n: ++numeroQuestion, nb: o.choix.length, votes: new Map() } : null;
        montrerVotes();
      });
      // Un deuxième démarrage (une nouvelle partie, F5) remplace le panneau au lieu d'en empiler un autre.
      panneau?.fermer();
      panneau = TablePanneau.creer({ conteneur: colonne, table: api });
      plateau.oublier();
      brancherMulti();
    }
    function arreter() {
      actif = false;
      document.body.classList.remove('mode-table');
      h.dialogue.observer(null);
      panneau?.fermer();
      panneau = null;
      ficheMj?.fermer();
      boite.hidden = true;
      combat = null;
      window.saga.tableFermer?.();
    }
    // Le groupe arrive sur une carte (le départ, un téléporteur, une sauvegarde) : ses pions autour de (x, y).
    function entrerCarte(c, x, y) {
      if (!actif) return;
      E.preparer(jeu(), partie());
      E.placerHeros(table(), partie(), c, x, y, h.presents());
      selection = null;
      plateau.oublier();
      panneau?.rafraichir();
    }

    // --- Ce que le MJ fait sur le plateau ---
    function agir(a, r = { mj: true }) {
      const res = E.agir(jeu(), partie(), r, a, ctxVue());
      if (!res.ok && r.mj) h.message(res.erreur);
      if (res.jet) lancerJet(res.jet);
      panneau?.rafraichir();
      return res;
    }
    // Le jet demandé par un joueur : lancé ici (l'hôte), montré sur le plateau de dés et noté au journal.
    async function lancerJet({ perso, heros, sorte, id, quoi }) {
      const c = partie().equipe.find((q) => q?.jdr && E.estMien({ perso, heros }, q));
      if (!c) return;
      const o = { jeu: jeu(), partie: partie(), ui: { des: (x) => h.des(x) }, c, quoi };
      try {
        if (sorte === 'sauvegarde') await JdrTests.sauvegarde({ ...o, carac: id, dd: 0 });
        else await JdrTests.test({ ...o, competence: id, dd: 0 });
      } catch (err) { h.message(`Jet impossible : ${err.message}`); }
      panneau?.rafraichir();
    }
    // Un héros arrivé sur sa case (hors combat) : le meneur du groupe est là ; un déclencheur ou un
    // téléporteur sous ses pieds se lance.
    function arrive(p) {
      if (p.sorte !== 'heros' || combat) return;
      h.placerJoueur(p.x, p.y, p.direction);
      if (h.occupe()) return;
      const q = Monde.presentEn(h.presents(), p.x, p.y);
      if (q && q.ev.declenchement === 'toucher' && !q.bloque) { h.lancer(q); return; }
      const tp = Monde.teleporteur(carte(), p.x, p.y);
      if (tp) h.teleporter(tp.vers);
    }
    async function marcher(p, chemin) {
      for (const c of chemin) {
        if (!actif) return;
        p.direction = Math.abs(c.x - p.x) >= Math.abs(c.y - p.y) ? (c.x > p.x ? 'droite' : 'gauche') : (c.y > p.y ? 'bas' : 'haut');
        p.x = c.x; p.y = c.y;
        h.bruit?.('pas');
        await pause(110);
      }
    }
    // Hors combat, le MJ (ou un joueur) envoie un pion sur une case : il y marche s'il y a un chemin, sinon
    // (le MJ seulement) il y est posé directement.
    let enMarche = false;
    async function deplacerHorsCombat(p, x, y, r = { mj: true }) {
      if (enMarche || (p.x === x && p.y === y)) return;
      const depart = { x: p.x, y: p.y };
      const ch = G.chemin(carte(), p, { x, y }, { diagonales: R().diagonales, occupe: (cx, cy) => occupee(cx, cy, p) });
      const res = agir({ type: 'deplacer', pion: p.id, x, y }, r);
      if (!res.ok) return;
      if (ch && ch.length > 1 && ch.length <= 40) {
        enMarche = true;
        p.x = depart.x; p.y = depart.y;
        try { await marcher(p, ch); } finally { enMarche = false; }
      }
      arrive(p);
      panneau?.rafraichir();
    }

    // --- La souris sur le plateau ---
    let glisse = null;
    const pos = (e) => { const r = canvas.getBoundingClientRect(); return { px: e.clientX - r.left, py: e.clientY - r.top }; };
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); const { px, py } = pos(e); plateau.zoomer(e.deltaY < 0 ? 1 : -1, px, py); }, { passive: false });
    canvas.addEventListener('mousedown', (e) => {
      if (!actif || !jeu()) return;
      fermerMenu();
      const { px, py } = pos(e);
      if (e.button === 1 || e.button === 2) { glisse = { x: e.clientX, y: e.clientY, bouge: false, droit: e.button === 2, px, py }; return; }
      if (e.button !== 0) return;
      const c = plateau.caseSous(px, py, jeu());
      if (picker) { cliquerPicker(c, plateau.pionSous(px, py, jeu(), derniereVue)); return; }
      if (pinceau) { glisse = { pinceau: true }; peindre(c); return; }
      clicGauche(c, plateau.pionSous(px, py, jeu(), derniereVue), e);
    });
    window.addEventListener('mousemove', (e) => {
      if (!actif || !jeu()) return;
      const { px, py } = pos(e);
      survol = plateau.caseSous(px, py, jeu());
      if (glisse?.pinceau) { peindre(survol); return; }
      if (glisse && !glisse.pinceau) {
        const dx = e.clientX - glisse.x, dy = e.clientY - glisse.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) glisse.bouge = true;
        if (glisse.bouge) { plateau.glisser(dx, dy); glisse.x = e.clientX; glisse.y = e.clientY; }
      }
    });
    window.addEventListener('mouseup', (e) => {
      const g = glisse;
      glisse = null;
      if (!actif || !g || g.pinceau) return;
      // Un clic droit sans glisser : le menu du pion (ou de la case).
      if (g.droit && !g.bouge) menuPion(e.clientX, e.clientY, plateau.pionSous(g.px, g.py, jeu(), derniereVue));
    });

    function clicGauche(c, id, e) {
      if (id?.startsWith('ev:')) { menuPion(e.clientX, e.clientY, id); return; }
      if (id) { selection = selection === id ? null : id; panneau?.rafraichir(); return; }
      const p = selection ? pion(selection) : null;
      if (!p || combat) { selection = null; return; }
      if (h.occupe()) { h.message('Attends la fin de la scène en cours.'); return; }
      deplacerHorsCombat(p, c.x, c.y);
    }
    function peindre(c) {
      if (!c || c.x < 0 || c.y < 0 || c.x >= carte().largeur || c.y >= carte().hauteur) return;
      const i = c.y * carte().largeur + c.x;
      const v = pinceau === 'reveler' ? 1 : pinceau === 'cacher' ? 0 : null;
      if (E.etatCarte(table(), carte().id).cases[i] === v) return;
      agir({ type: 'pinceau', cases: [i], valeur: v });
    }

    // Le petit menu d'un pion, d'un PNJ ou d'un événement (clic droit, ou clic sur un événement).
    function fermerMenu() { menu.hidden = true; menu.innerHTML = ''; }
    function menuPion(x, y, id) {
      fermerMenu();
      if (!id) return;
      const items = [];
      if (id.startsWith('ev:')) {
        const q = presentDe(id);
        if (!q) return;
        items.push(el('div', { className: 'table-menu-titre', textContent: q.ev.nom || q.ev.id }));
        if (q.page?.commandes?.length) items.push(bouton('play', 'Lancer l\'événement', () => { if (!h.occupe()) h.lancer(q); }));
        items.push(el('div', { className: 'table-menu-note', textContent: `Visible par : ${libelleVisible(E.normVisible(q.ev.visible_par))} (dans Tafl)` }));
      } else {
        const p = pion(id);
        if (!p) return;
        const nom = p.sorte === 'heros' ? JdrPerso.nom(jeu(), E.membreDe(partie(), p) || {}) : p.nom;
        items.push(el('div', { className: 'table-menu-titre', textContent: nom }));
        if (p.sorte !== 'heros') {
          for (const [v, l] of VISIBILITES(jeu(), partie())) items.push(bouton(E.normVisible(p.visible) === v ? 'check' : 'blank', `Visible par : ${l}`, () => agir({ type: 'visibilite', pion: id, visible: v })));
          if (!combat) items.push(bouton('trash', 'Retirer de la table', () => { agir({ type: 'retirer', pion: id }); if (selection === id) selection = null; }));
        }
      }
      menu.append(...items);
      menu.hidden = false;
      const r = scene.getBoundingClientRect();
      menu.style.left = `${Math.min(x - r.left, r.width - 260)}px`;
      menu.style.top = `${Math.min(y - r.top, r.height - menu.offsetHeight - 8)}px`;
    }
    function bouton(icone, texte, faire) {
      const b = el('button', { className: 'table-menu-choix', type: 'button' }, el('i', { className: `codicon codicon-${icone}` }), el('span', { textContent: texte }));
      b.onclick = () => { fermerMenu(); faire(); };
      return b;
    }
    const libelleVisible = (v) => (VISIBILITES(jeu(), partie()).find(([k]) => k === v)?.[1]) || (v.startsWith('perso:') ? `${v.slice(6)} seulement` : v);

    // --- Choisir une case ou un pion (les combats, poser une rencontre) ---
    function choisirCase(cases, { titre = '' } = {}) {
      return new Promise((resoudre) => { picker = { sorte: 'case', cases, resoudre, titre, n: ++numeroQuestion }; });
    }
    function choisirPion(cibles, { zone = 0 } = {}) {
      return new Promise((resoudre) => { picker = { sorte: 'pion', cibles, resoudre, zone, n: ++numeroQuestion }; });
    }
    function cliquerPicker(c, id) {
      const p = picker;
      if (p.sorte === 'case') {
        const i = c.y * carte().largeur + c.x;
        if (!p.cases || p.cases.has(i)) { picker = null; p.resoudre(c); }
        return;
      }
      if (id && p.cibles.has(id)) { picker = null; p.resoudre(id); }
    }
    function annulerPicker() { const p = picker; picker = null; p?.resoudre(null); }

    // --- Les combats sur la grille ---
    function combattre(o) {
      const g = typeof o.groupe === 'string' ? (jeu().donnees.groupes?.groupes || []).find((x) => x.id === o.groupe) : o.groupe;
      combat = { tour: 0, ordre: [], actif: '', reste: null, heros: [], ennemis: [], groupe: g?.id || '' };
      return Regles.combattre({ ...o, ui, grille }).finally(() => {
        combat = null;
        boite.hidden = true;
        annulerPicker();
        // Les monstres vaincus quittent la table.
        table().pions = table().pions.filter((p) => !(p.sorte === 'monstre' && p.vaincu));
        panneau?.rafraichir();
      });
    }
    const pionDe = (u) => (u.camp === 'heros' ? combat.heros[u.i] : combat.ennemis[u.i]);
    const posDe = (u) => pionDe(u) || { x: 0, y: 0 };
    const grille = {
      get caseM() { return R().caseM; },
      get jetsCaches() { return R().jetsCaches; },
      cases: (m) => G.cases(m, R().caseM),
      distance: (u, t) => G.distance(posDe(u), posDe(t), R().diagonales),
      voit: (u, t) => G.ligneDeVue(carte(), posDe(u), posDe(t)),
      autour: (t, r, liste) => liste.filter((x) => G.distance(posDe(t), posDe(x), R().diagonales) <= r),
      placer({ heros, monstres }) {
        const t = table(), c = carte();
        E.placerHeros(t, partie(), c, h.joueur().x, h.joueur().y, h.presents());
        combat.heros = heros.map((u) => t.pions.find((p) => p.id === u.c.pion && p.carte === c.id));
        // Les monstres : les pions de cette rencontre déjà posés sur la table, sinon de nouveaux, près de
        // l'événement qui a lancé le combat (ou à quelques cases du groupe).
        const libres = t.pions.filter((p) => p.sorte === 'monstre' && p.carte === c.id && !p.vaincu && (!combat.groupe || p.groupe === combat.groupe));
        const origine = h.origine?.() || (() => { const j = h.joueur(); return { x: j.x, y: Math.max(0, j.y - 3) }; })();
        combat.ennemis = monstres.map((u) => {
          let p = libres.find((q) => q.monstre === u.m.id);
          if (p) libres.splice(libres.indexOf(p), 1);
          else {
            const pc = E.caseLibre(t, c, origine.x, origine.y, [], h.presents());
            p = { id: `m-${Date.now().toString(36)}-${u.i}`, sorte: 'monstre', monstre: u.m.id, groupe: combat.groupe, carte: c.id, x: pc.x, y: pc.y, direction: 'bas' };
            t.pions.push(p);
          }
          // En combat, on voit ses adversaires (le MJ peut encore les recacher).
          Object.assign(p, { nom: u.nom, pv: u.pv, pvMax: u.pvMax, visible: E.normVisible(p.visible) === 'mj' ? 'tous' : p.visible });
          const ec = E.etatCarte(t, c.id);
          if (E.brouillard(t, c)) ec.cases[p.y * c.largeur + p.x] = 1;
          return p;
        });
        panneau?.rafraichir();
      },
      ordre(liste) { combat.ordre = liste.map(({ u, nom, init }) => ({ id: pionDe(u)?.id || '', nom, init })); },
      actif(u, tour, reste) { combat.tour = tour; combat.actif = pionDe(u)?.id || ''; combat.reste = u.camp === 'heros' ? reste : null; panneau?.rafraichir(); },
      vaincu(u) { const p = pionDe(u); if (p) p.vaincu = true; },
      async deplacer(u, reste) {
        const p = pionDe(u);
        if (!p) return 0;
        const cases = G.atteignables(carte(), p, reste, { diagonales: R().diagonales, occupe: (x, y) => occupee(x, y, p) });
        cases.delete(p.y * carte().largeur + p.x);
        if (!cases.size) { await ui.message('Pas de case libre où aller.'); return 0; }
        afficherAide('Clique une case en bleu (Échap : revenir).');
        const vers = await choisirCase(new Map([...cases.keys()].map((i) => [i, 'aller'])));
        afficherAide('');
        if (!vers) return 0;
        const ch = G.chemin(carte(), p, vers, { diagonales: R().diagonales, occupe: (x, y) => occupee(x, y, p), max: reste });
        if (!ch) return 0;
        await marcher(p, ch);
        return ch[ch.length - 1]?.cout || 0;
      },
      async approcher(u, t, portee, max) {
        const p = pionDe(u), q = pionDe(t);
        if (!p || !q) return 0;
        const o = { diagonales: R().diagonales, occupe: (x, y) => occupee(x, y, p), voir: true };
        const d = G.vers(carte(), p, q, portee, max, o);
        if (!d) return 0;
        const ch = G.chemin(carte(), p, d, { ...o, max });
        if (!ch) return 0;
        await marcher(p, ch);
        return ch[ch.length - 1]?.cout || 0;
      },
    };

    // --- L'écran de combat de la table : les mêmes promesses que ecran-groupe.js, sur le plateau ---
    const tete = el('div', { className: 'table-combat-tete' });
    const texte = el('div', { className: 'table-combat-texte' });
    const choix = el('div', { className: 'table-combat-choix' });
    const aide = el('div', { className: 'table-combat-aide', hidden: true });
    boite.append(tete, texte, choix, aide);
    let attente = null; // { sorte: 'message' | 'menu', resoudre, items, i }
    let numeroQuestion = 0; // chaque menu et chaque choix sur le plateau a son numéro (une réponse en retard ne compte pas)
    function afficherAide(t) { aide.textContent = t; aide.hidden = !t; }
    function viderChoix() { choix.innerHTML = ''; }
    function menuBoite(items, annulable, titre = '') {
      viderChoix();
      if (titre) choix.append(el('div', { className: 'table-combat-titre', textContent: titre }));
      return new Promise((resoudre) => {
        const a = { sorte: 'menu', resoudre, annulable, titre, n: ++numeroQuestion, boutons: [], i: Math.max(0, items.findIndex((x) => !x.desactive)) };
        items.forEach((it, k) => {
          const b = el('button', { className: `table-combat-option${it.desactive ? ' desactive' : ''}`, type: 'button', disabled: Boolean(it.desactive) },
            it.icone ? el('i', { className: `codicon codicon-${it.icone}` }) : null, el('span', { textContent: it.texte }), it.detail ? el('small', { textContent: it.detail }) : null);
          b.onclick = () => { if (!it.desactive) finir(k); };
          b.onmouseenter = () => { a.i = k; surligner(); };
          a.boutons.push(b);
          choix.append(b);
        });
        if (annulable) {
          const b = el('button', { className: 'table-combat-option retour', type: 'button' }, el('i', { className: 'codicon codicon-arrow-left' }), el('span', { textContent: 'Retour' }));
          b.onclick = () => finir(null);
          choix.append(b);
        }
        const surligner = () => a.boutons.forEach((b, k) => b.classList.toggle('actif', k === a.i));
        a.surligner = surligner;
        a.items = items;
        function finir(k) { if (attente !== a) return; attente = null; viderChoix(); resoudre(k); }
        a.finir = finir;
        attente = a;
        surligner();
      });
    }
    // Les touches du clavier (et de la manette) pour la boîte de combat.
    function touche(t) {
      if (ficheMj && (t === 'retour' || t === 'echap')) { ficheMj.fermer(); return true; }
      if (picker && (t === 'retour' || t === 'echap')) { annulerPicker(); afficherAide(''); return true; }
      const a = attente;
      if (!a) return false;
      if (a.sorte === 'message') { if (t === 'action' || t === 'retour') a.finir(); return true; }
      if (t === 'haut' || t === 'bas') {
        const n = a.items.length;
        for (let k = 1; k <= n; k++) { const j = (a.i + (t === 'bas' ? k : -k) + n * 2) % n; if (!a.items[j].desactive) { a.i = j; break; } }
        a.surligner();
      } else if (t === 'action') { if (!a.items[a.i]?.desactive) a.finir(a.i); }
      else if ((t === 'retour' || t === 'echap') && a.annulable) a.finir(null);
      return true;
    }
    const ui = {
      ouvrir() { boite.hidden = false; tete.textContent = 'Combat'; texte.textContent = ''; viderChoix(); return Promise.resolve(); },
      heros() { /* les PV des héros se lisent directement sur leur fiche */ },
      ennemi(i, v) { const p = combat?.ennemis[i]; if (p) Object.assign(p, { pv: v.pv, pvMax: v.pvMax, nom: v.nom }); },
      message(t, { attendre = false } = {}) {
        texte.textContent = t;
        sceneTexte = { qui: '', texte: t };
        return new Promise((resoudre) => {
          const a = { sorte: 'message', finir: () => { if (attente === a) { attente = null; texte.classList.remove('attend'); resoudre(); } } };
          attente = a;
          if (attendre) texte.classList.add('attend');
          else setTimeout(a.finir, Math.max(900, Math.min(2600, t.length * 28)));
        });
      },
      bandeau(t) { tete.textContent = t || (combat?.tour ? `Combat · tour ${combat.tour}` : 'Combat'); },
      commande(i, items) {
        const p = combat.heros[i];
        tete.textContent = `Tour de ${p ? JdrPerso.nom(jeu(), E.membreDe(partie(), p) || {}) : '…'}`;
        selection = p?.id || null;
        return menuBoite(items, true).then((k) => (k == null ? null : items[k].id));
      },
      // Saga 1.21.1 : le MJ joue les monstres (regles/jdr/combat.js › tourMonstreMJ).
      commandeMonstre(i, items) {
        const p = combat.ennemis[i];
        tete.textContent = `Tour de ${p?.nom || 'monstre'}`;
        selection = p?.id || null;
        return menuBoite(items, false).then((k) => (k == null ? null : items[k].id));
      },
      liste(titre, items, annulable = true) {
        if (titre && typeof titre === 'object') ({ titre, items, annulable = true } = titre);
        return menuBoite(items.map((x) => ({ ...x, desactive: x.desactive })), annulable, titre);
      },
      async cible({ camp, tous = false, possibles = [], zone = 0 }) {
        const liste = camp === 'heros' ? combat.heros : combat.ennemis;
        const ids = new Map();
        liste.forEach((p, k) => { if (p && possibles[k]) ids.set(p.id, k); });
        if (!ids.size) { await ui.message('Aucune cible possible.'); return null; }
        afficherAide(tous ? 'Clique un ennemi : le sort les touche tous.' : zone ? `Clique le centre de la zone (rayon ${zone} case${zone > 1 ? 's' : ''}).` : 'Clique une cible entourée de rouge (Échap : revenir).');
        // Les cibles aussi en liste, pour qui préfère cliquer un nom.
        const items = [...ids.keys()].map((id) => ({ texte: pion(id)?.sorte === 'heros' ? JdrPerso.nom(jeu(), E.membreDe(partie(), pion(id)) || {}) : pion(id)?.nom || id }));
        const parListe = menuBoite(items, true, 'Cible');
        const parPlateau = choisirPion(new Set(ids.keys()), { zone });
        const r = await Promise.race([parListe.then((k) => ({ k })), parPlateau.then((id) => ({ id }))]);
        afficherAide('');
        if (r.id !== undefined) { attente?.finir?.(null); if (r.id == null) return null; return tous ? -1 : ids.get(r.id); }
        annulerPicker();
        if (r.k == null) return null;
        const id = [...ids.keys()][r.k];
        return tous ? -1 : ids.get(id);
      },
      animer(camp, i, nom) {
        const p = (camp === 'heros' ? combat?.heros : combat?.ennemis)?.[i];
        if (!p) return Promise.resolve();
        if (nom === 'touche') { plateau.secouer(p.id); noterEffet(p.id, 'secousse'); }
        else if (['soin', 'ranime', 'hausse'].includes(nom)) { plateau.eclat(p.id, '#7dffb0'); noterEffet(p.id, 'eclat', '', '#7dffb0'); }
        return pause(nom === 'ko' ? 380 : 160);
      },
      nombre(camp, i, t, sorte) {
        const p = (camp === 'heros' ? combat?.heros : combat?.ennemis)?.[i];
        if (!p) return;
        plateau.flotter(p.id, t, sorte);
        noterEffet(p.id, sorte, t);
      },
      effet(cibles, couleur) {
        for (const [camp, i] of cibles) {
          const p = (camp === 'heros' ? combat?.heros : combat?.ennemis)?.[i];
          if (p) { plateau.eclat(p.id, couleur); noterEffet(p.id, 'eclat', '', couleur); }
        }
        return pause(260);
      },
      fermer() { boite.hidden = true; attente = null; viderChoix(); },
      des: (o) => h.des(o),
      touche,
      get ouvert() { return !boite.hidden; },
      avancer() {},
    };

    // --- Le multijoueur (Saga 1.0) : qui joue quoi ---
    // Les rôles sont gardés dans la partie, par NOM de joueur : un ami qui se reconnecte (ou qui recharge
    // sa page) retrouve son héros. '' = spectateur (il regarde, il ne touche à rien).
    function roles() {
      const t = table();
      if (!t.roles || typeof t.roles !== 'object') t.roles = {};
      return t.roles;
    }
    const roleDe = (nom) => String(roles()[nom] || '');
    // Saga 1.21.2 : un héros se désigne par son pion (unique) ; les parties d'avant gardaient son personnage.
    const cleDe = (c) => c.pion || c.creature;
    const herosDuGroupe = () => partie().equipe.filter((c) => c?.jdr);
    const membreParCle = (cle) => (cle ? herosDuGroupe().find((c) => c.pion === cle) || herosDuGroupe().find((c) => c.creature === cle) || null : null);
    const cleRole = (nom) => { const c = membreParCle(roleDe(nom)); return c ? cleDe(c) : ''; };
    function donnerRole(nom, cle) {
      roles()[nom] = String(cle || '');
      envoyes.clear();
      panneau?.rafraichir();
    }
    // Le rôle d'un ami, pour le filtrage et pour ses droits : un spectateur ne peut que choisir ou créer son perso.
    const rolePour = (nom) => {
      const c = membreParCle(roleDe(nom));
      return c ? { mj: false, perso: c.creature, heros: c.pion || '' } : { mj: false, perso: null, spectateur: true };
    };
    // Les héros que personne ne joue (un ami sans héros peut en prendre un).
    function libres() {
      const pris = new Set(Object.values(roles()).map((v) => membreParCle(v)).filter(Boolean).map(cleDe));
      return herosDuGroupe().filter((c) => !c.mort_definitive && !pris.has(cleDe(c)));
    }

    // --- Les joueurs (leur fenêtre, ou le navigateur d'un ami) : leurs demandes, vérifiées ici ---
    function recevoir(a) {
      if (!actif || !a || typeof a !== 'object') return;
      // D'un ami par le réseau : son rôle décide, pas ce qu'il dit être.
      if (a.client) {
        const nom = h.multi?.()?.nomDe(a.client) || '';
        if (!nom) return;
        const r = rolePour(nom);
        // Saga 1.21.2 : un ami sans héros en prend un libre ou crée le sien (étape par étape, ici).
        if (a.type === 'creation') { repondreCreation(nom, a); return; }
        if (r.spectateur) {
          if (a.type === 'creer') creerPour(nom);
          else if (a.type === 'prendre') { const c = libres().find((x) => cleDe(x) === a.heros); if (c && !creations.has(nom)) { donnerRole(nom, cleDe(c)); h.message(`${nom} joue ${JdrPerso.nom(jeu(), c)}.`); } }
          return;
        }
        if (a.type === 'agir_fiche') { agirFiche(nom, r, a); return; }
        // Saga 1.21.3 : un champ de la fiche du jeu, sur son propre héros.
        if (a.type === 'champ') { const c = herosDuGroupe().find((q) => E.estMien(r, q)); if (c && !creations.has(nom)) changerChamp(c, String(a.id || ''), a.valeur, false); return; }
        if (a.type === 'voter') { voter(nom, a); return; }
        a = { ...a, perso: r.perso, heros: r.heros };
      }
      const r = { mj: false, perso: typeof a.perso === 'string' && a.perso ? a.perso : null, heros: typeof a.heros === 'string' ? a.heros : '' };
      if (a.type === 'deplacer') {
        if (h.occupe()) return;
        const p = pion(a.pion);
        if (p) deplacerHorsCombat(p, Math.round(Number(a.x)), Math.round(Number(a.y)), r);
      } else if (a.type === 'parler') {
        // Parler à un PNJ (ou fouiller un coffre) : un héros du joueur doit être juste à côté.
        const q = presentDe(a.id);
        const p = pion(a.pion);
        if (!q || !p || combat || h.occupe() || q.ev.declenchement !== 'parler' || !E.visiblePour(q.ev.visible_par, r)) return;
        if (r.perso && !E.estMien(r, E.membreDe(partie(), p))) return;
        if (G.distance(p, q) > 1) return;
        h.placerJoueur(p.x, p.y, p.direction);
        h.lancer(q);
      } else if (a.type === 'jet') {
        // Un jet de SA fiche : l'hôte lance les dés (etat.js › agir vérifie le rôle).
        if (table().pause) return;
        agir({ type: 'jet', sorte: a.sorte, id: a.id, quoi: a.quoi }, r);
      } else if (a.type === 'repondre') {
        repondre(a, r);
      }
    }

    // --- Saga 1.21 : en combat, le joueur d'un héros joue son tour depuis son écran ---
    // Le MJ garde la main : son menu reste ouvert, et la première réponse (la sienne ou celle du joueur) compte.
    function heroActif() {
      const p = combat?.actif ? pion(combat.actif) : null;
      return p?.sorte === 'heros' ? E.membreDe(partie(), p) : null;
    }
    function questionPour(r) {
      if (r.mj || !r.perso || !combat || !E.estMien(r, heroActif())) return null;
      const q = { tete: tete.textContent, aide: aide.hidden ? '' : aide.textContent };
      if (attente?.sorte === 'menu') {
        q.menu = { n: attente.n, titre: attente.titre || '', annulable: Boolean(attente.annulable),
          items: attente.items.map((x) => ({ texte: String(x.texte || ''), detail: String(x.detail || ''), icone: x.icone || '', desactive: Boolean(x.desactive) })) };
      }
      if (picker) q.choix = { n: picker.n, sorte: picker.sorte, cases: picker.cases ? [...picker.cases.keys()] : null, cibles: picker.cibles ? [...picker.cibles] : null, zone: picker.zone || 0 };
      return q.menu || q.choix ? q : null;
    }
    function repondre(a, r) {
      if (!r.perso || !E.estMien(r, heroActif())) return;
      if (a.menu != null) {
        if (attente?.sorte !== 'menu' || attente.n !== Number(a.menu)) return;
        const k = a.k == null || Number(a.k) < 0 ? null : Math.round(Number(a.k));
        if (k == null) { if (attente.annulable) attente.finir(null); }
        else if (attente.items[k] && !attente.items[k].desactive) attente.finir(k);
      } else if (a.choix != null) {
        if (!picker || picker.n !== Number(a.choix)) return;
        if (a.annuler) { annulerPicker(); afficherAide(''); return; }
        if (picker.sorte === 'case') {
          const x = Math.round(Number(a.x)), y = Math.round(Number(a.y));
          if (x >= 0 && y >= 0 && x < carte().largeur && y < carte().hauteur) cliquerPicker({ x, y }, null);
        } else if (typeof a.id === 'string') cliquerPicker({ x: 0, y: 0 }, a.id);
      }
    }

    // --- Saga 1.21.2 : un ami crée son personnage depuis son écran ---
    // La création du pack (regles/jdr/creation.js) tourne ici, chez l'hôte ; ses questions (une liste, un nom,
    // une phrase) partent sur l'écran de l'ami, qui répond. Le héros rejoint le groupe : il est dans la partie,
    // donc dans la sauvegarde, et l'ami le retrouve en revenant sous le même nom.
    const creations = new Map(); // nom → { q: la question en cours (null pendant que l'hôte calcule), resoudre }
    function uiDistant(nom, { des = false } = {}) {
      const demander = (q) => new Promise((resoudre) => { creations.set(nom, { q: { ...q, n: ++numeroQuestion }, resoudre }); envoyes.clear(); });
      const lignes = (l) => (Array.isArray(l) ? l : []).map((x) => ({ texte: String(x?.texte ?? ''), detail: String(x?.detail || ''), desactive: Boolean(x?.desactive) }));
      return {
        liste(titre, items, annulable = true) {
          const o = titre && typeof titre === 'object' ? titre : { titre, items, annulable };
          return demander({ sorte: 'liste', titre: String(o.titre || ''), entete: String(o.entete || ''), note: String(o.note || ''), items: lignes(o.items), annulable: o.annulable !== false });
        },
        texte: (o = {}) => demander({ sorte: 'texte', titre: String(o.titre || ''), valeur: String(o.valeur || ''), max: Number(o.max) || 24 }),
        dire: (t) => demander({ sorte: 'dire', texte: String(t || '') }),
        // Les jets vont au journal, que l'ami voit ; hors création, le MJ les voit aussi rouler.
        des: (o) => (des ? h.des(o) : Promise.resolve()),
      };
    }
    function repondreCreation(nom, a) {
      const e = creations.get(nom);
      const q = e?.q;
      if (!q || q.n !== Number(a.n)) return;
      let v;
      if (q.sorte === 'liste') {
        if (a.k == null || Number(a.k) < 0) { if (!q.annulable) return; v = null; } else {
          const k = Math.round(Number(a.k));
          if (!q.items[k] || q.items[k].desactive) return;
          v = k;
        }
      } else if (q.sorte === 'texte') v = a.annuler ? null : String(a.texte || '').trim().slice(0, q.max);
      creations.set(nom, { q: null, resoudre: null });
      envoyes.clear();
      e.resoudre(v);
    }
    async function creerPour(nom) {
      if (creations.has(nom) || !jeu() || !partie()) return;
      creations.set(nom, { q: null, resoudre: null });
      envoyes.clear();
      h.message(`${nom} crée son personnage.`);
      try {
        const c = await JdrCreation.creer({ jeu: jeu(), partie: partie(), ui: uiDistant(nom), numero: herosDuGroupe().length + 1, annulable: true });
        if (!c || !actif) return;
        c.joueur = nom;
        const ou = Collection.ranger(jeu(), partie(), c);
        if (ou?.ou !== 'equipe') { h.message(`Le groupe est complet : ${JdrPerso.nom(jeu(), c)} (de ${nom}) attend dans la réserve.`); return; }
        E.placerHeros(table(), partie(), carte(), h.joueur().x, h.joueur().y, h.presents());
        donnerRole(nom, cleDe(c));
        h.message(`${nom} a créé ${JdrPerso.nom(jeu(), c)}.`);
      } catch (err) {
        h.message(`Création impossible : ${err.message}`);
      } finally {
        creations.delete(nom);
        envoyes.clear();
        panneau?.rafraichir();
      }
    }
    // Saga 1.21.2 : la fiche hors combat d'un joueur (équipement, sorts, monter de niveau, dés de vie, notes,
    // utiliser un objet du sac) : les écrans du pack (regles/jdr/hors-combat.js), joués chez l'hôte, sur son écran.
    async function agirFiche(nom, r, a) {
      if (creations.has(nom) || combat || !jeu() || !partie()) return;
      const c = herosDuGroupe().find((q) => E.estMien(r, q));
      if (!c) return;
      const id = String(a.id || '');
      const objet = id === 'objet' ? String(a.objet || '') : '';
      if (objet ? !(partie().sac?.[objet] > 0) : !JdrHorsCombat.actionsMembre(jeu(), c).some(([x]) => x === id)) return;
      creations.set(nom, { q: null, resoudre: null });
      envoyes.clear();
      try {
        const ui = uiDistant(nom, { des: true });
        if (objet) await JdrHorsCombat.utiliserObjet({ jeu: jeu(), partie: partie(), ui, id: objet });
        else await JdrHorsCombat.agirMembre({ jeu: jeu(), partie: partie(), ui, c, id });
      } catch (err) {
        h.message(`${nom} : ${err.message}`);
      } finally {
        creations.delete(nom);
        envoyes.clear();
        panneau?.rafraichir();
      }
    }
    // --- Saga 1.21.2 : les joueurs votent les choix de dialogue ---
    // Chaque joueur qui a un héros vote ; quand tous les joueurs connectés ont voté, la majorité l'emporte.
    // En cas d'égalité, le MJ tranche (il peut aussi cliquer un choix à tout moment).
    let vote = null; // { n, nb, votes: Map nom → indice }
    const votants = () => (h.multi?.()?.joueurs || []).filter((j) => !j.hote && j.connecte && !rolePour(j.nom).spectateur);
    function comptes() {
      const c = Array(vote?.nb || 0).fill(0);
      for (const k of vote?.votes.values() || []) c[k]++;
      return c;
    }
    function voter(nom, a) {
      if (!vote || Number(a.n) !== vote.n) return;
      const k = Math.round(Number(a.k));
      if (!(k >= 0 && k < vote.nb)) return;
      vote.votes.set(nom, k);
      envoyes.clear();
      montrerVotes();
      const l = votants();
      if (!l.length || !l.every((j) => vote.votes.has(j.nom))) return;
      const c = comptes();
      const max = Math.max(...c);
      const gagnants = c.map((x, i) => (x === max ? i : -1)).filter((i) => i >= 0);
      if (gagnants.length === 1) h.dialogue.choisirIndice(gagnants[0]);
      else h.message(`Égalité au vote (${gagnants.map((i) => `« ${sceneTexte?.choix?.[i] || i + 1} »`).join(', ')}) : à toi de choisir.`);
    }
    // Chez le MJ, le nombre de voix à côté de chaque choix.
    function montrerVotes() {
      const c = comptes();
      document.querySelectorAll('.dialogue-choix .dialogue-option').forEach((b, i) => {
        if (vote && c[i]) b.dataset.votes = `${c[i]} voix`; else delete b.dataset.votes;
      });
    }
    // Ce qu'un ami sans héros voit en plus : les héros libres, sa création en cours.
    function extrasPour(nom, r) {
      const x = {};
      const e = creations.get(nom);
      if (e) x.creation = e.q || { sorte: 'attente' };
      if (vote && !r.spectateur) x.vote = { n: vote.n, comptes: comptes(), moi: vote.votes.has(nom) ? vote.votes.get(nom) : -1 };
      else if (r.spectateur) {
        x.libres = libres().map((c) => ({ id: cleDe(c), nom: JdrPerso.nom(jeu(), c),
          detail: [JdrPerso.origine?.(jeu(), c)?.nom, JdrPerso.classe?.(jeu(), c)?.nom, `niv. ${c.niveau || 1}`].filter(Boolean).join(' · ') }));
        x.groupePlein = partie().equipe.length >= (Number(jeu().donnees?.reglages?.reglages?.equipe_max) || 6);
      }
      return x;
    }
    // Un ami arrive sans héros : le MJ le sait.
    const vus = new Set();
    function arrivees(joueurs) {
      if (!actif) return;
      for (const j of joueurs || []) {
        if (j.hote || !j.connecte || vus.has(j.nom)) continue;
        vus.add(j.nom);
        if (rolePour(j.nom).spectateur) h.message(`${j.nom} est là : il choisit un héros libre ou crée le sien.`);
      }
    }
    let ecouteMulti = false;
    function brancherMulti() {
      const m = h.multi?.();
      if (!m) return;
      if (!ecouteMulti) {
        ecouteMulti = true;
        // Les demandes des amis (déplacer, parler, lancer un jet, répondre en combat) arrivent par le réseau.
        m.sur((sorte, d) => {
          if (sorte === 'demande') recevoir(d);
          else if (sorte === 'joueurs') arrivees(d);
        });
      }
      arrivees(m.joueurs);
    }

    // --- Chaque image ---
    function dessiner(maintenant, dt) {
      if (!actif || !jeu() || !carte()) return;
      // Saga 1.21 : un héros arrivé après l'entrée sur la carte (créé au début d'une nouvelle partie, ou
      // ajouté au groupe) reçoit son pion tout de suite, près du meneur.
      if (!combat && partie().equipe.some((c) => c?.jdr && (!c.pion || !table().pions.some((p) => p.id === c.pion)))) {
        E.placerHeros(table(), partie(), carte(), h.joueur().x, h.joueur().y, h.presents());
        panneau?.rafraichir();
      }
      const r = role();
      derniereVue = vuePour(r);
      const cases = picker?.sorte === 'case' ? picker.cases : null;
      let casesZone = null;
      if (picker?.sorte === 'pion' && picker.zone && survol) {
        const cible = derniereVue.pions.find((p) => p.x === survol.x && p.y === survol.y && picker.cibles.has(p.id));
        if (cible) {
          casesZone = new Map();
          for (let y = cible.y - picker.zone; y <= cible.y + picker.zone; y++) for (let x = cible.x - picker.zone; x <= cible.x + picker.zone; x++) {
            if (x >= 0 && y >= 0 && x < carte().largeur && y < carte().hauteur && G.distance(cible, { x, y }, R().diagonales) <= picker.zone) casesZone.set(y * carte().largeur + x, 'zone');
          }
        }
      }
      plateau.dessiner({ jeu: jeu(), carte: carte(), vue: derniereVue, maintenant, mj: r.mj, apercu: !r.mj, cases: cases || casesZone, cibles: picker?.sorte === 'pion' ? picker.cibles : null, selection, survol });
      // L'écran des joueurs : sa vue, au plus 8 fois par seconde, seulement quand elle change.
      chronoEnvoi += dt;
      if (chronoEnvoi >= 0.12) {
        chronoEnvoi = 0;
        if (window.saga.tableEnvoyer) {
          const v = JSON.stringify(vuePour({ mj: false, perso: null }));
          if (v !== envoye) { envoye = v; window.saga.tableEnvoyer(v); }
        }
        // Le multijoueur : à chaque ami, la vue de SON rôle (un spectateur voit celle de l'écran partagé).
        const multi = h.multi?.();
        if (multi?.actif && window.saga.reseauEnvoyer) {
          for (const j of multi.joueurs) {
            if (j.hote || !j.connecte) continue;
            const r = rolePour(j.nom);
            const v = JSON.stringify({ ...vuePour(r.spectateur ? { mj: false, perso: null } : r), ...extrasPour(j.nom, r) });
            if (envoyes.get(j.id) !== v) { envoyes.set(j.id, v); window.saga.reseauEnvoyer(j.id, 'vue', v); }
          }
        }
      }
    }

    // Échap hors combat : annuler ce qui est en cours (un choix de case, le pinceau, le pion choisi).
    function annuler() {
      fermerMenu();
      if (picker) { annulerPicker(); afficherAide(''); return true; }
      if (pinceau) { api.pinceau = null; panneau?.dessiner(); return true; }
      if (selection) { selection = null; panneau?.rafraichir(); return true; }
      return false;
    }

    const api = {
      demarrer, arreter, entrerCarte, dessiner, combattre, touche, recevoir, annuler,
      get actif() { return actif; },
      get enCombat() { return Boolean(combat); },
      get combatOuvert() { return Boolean(combat) && !boite.hidden; },
      // Pour le panneau du MJ.
      jeu, partie, carte, table, agir, pion, VISIBILITES: () => VISIBILITES(jeu(), partie()), libelleVisible,
      // Le multijoueur (Saga 1.0) : qui joue quel héros (panneau du MJ).
      roleDe, cleRole, cleDe, donnerRole, multi: () => h.multi?.(),
      // Saga 1.21.3 : la fiche d'un héros (tous ses champs) pour le MJ.
      ouvrirFiche, get ficheOuverte() { return Boolean(ficheMj); },
      get selection() { return selection; }, set selection(v) { selection = v; },
      get pinceau() { return pinceau; }, set pinceau(v) { pinceau = v; canvas.classList.toggle('pinceau', Boolean(v)); },
      get apercu() { return apercu; }, set apercu(v) { apercu = v; },
      get combat() { return combat; },
      // Le choix en cours sur le plateau (pour les tests) : { sorte, cases: [index], cibles: [id] }.
      get choix() { return picker ? { sorte: picker.sorte, cases: picker.cases ? [...picker.cases.keys()] : null, cibles: picker.cibles ? [...picker.cibles] : null } : null; },
      vue: () => derniereVue,
      choisirCase, afficherAide, annulerPicker,
      cadrer: () => plateau.oublier(),
      pointDe: (x, y) => { const r = canvas.getBoundingClientRect(); const q = plateau.pointDe(x, y, jeu()); return { x: r.left + q.px, y: r.top + q.py }; },
      musique: (c) => h.musique(c), son: (c) => h.son(c), message: (t) => h.message(t), des: (o) => h.des(o),
      lancerCombat: (groupe) => h.combattreDepuisTable(groupe),
      occupe: () => h.occupe(),
    };
    return api;
  }

  return { creer };
})();
