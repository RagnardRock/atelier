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
    // À droite, la colonne du MJ (le panneau). La boîte des combats (le menu du tour) : un encart en verre à
    // côté du plateau (Saga 1.35 : plus d'onglet Combat, le chat reste visible pendant le combat).
    const boite = el('div', { className: 'table-combat', hidden: true });
    const colonne = el('aside', { className: 'table-colonne' });
    const menu = el('div', { className: 'table-menu', hidden: true });
    scene.append(canvas, colonne, boite, menu);
    const plateau = Plateau.creer(canvas);
    // Saga 1.32 : la règle, les gabarits, le ping (les mêmes outils que l'écran des joueurs).
    const outils = TableOutils.barre({
      conteneur: scene, caseM: () => R().caseM, diagonales: () => R().diagonales,
      placer: (g) => agir({ type: 'gabarit', ...g }),
      ping: (c) => agir({ type: 'ping', x: c.x, y: c.y }),
      effacer: () => agir({ type: 'gabarit_retirer' }),
      // Saga 1.43 : le feutre et les notes (le MJ choisit : son calque, ou pour tous).
      mj: true,
      dessiner: (d) => agir({ type: 'dessin', ...d }),
      noter: (n) => agir({ type: 'note', ...n }),
      effacerDessins: (calque) => agir({ type: 'dessin_retirer', calque }),
      message: (t) => h.message(t),
      // Saga 1.35 : le pinceau du brouillard et le tapis de dés, dans le rail du MJ.
      extras: [
        { icone: 'lightbulb', titre: 'Révéler au pinceau (B) : glisse sur le plateau pour montrer des cases aux joueurs', touche: 'B', faire: () => { api.pinceau = pinceau === 'reveler' ? null : 'reveler'; panneau?.dessiner(); }, actif: () => pinceau === 'reveler' },
        { icone: 'circle-slash', titre: 'Cacher au pinceau (N)', touche: 'N', faire: () => { api.pinceau = pinceau === 'cacher' ? null : 'cacher'; panneau?.dessiner(); }, actif: () => pinceau === 'cacher' },
        { icone: 'symbol-event', titre: 'Le tapis de dés (D) : composer un jet, lancer au bouton ou en glissant', touche: 'D', faire: () => ouvrirTapis(), actif: () => Boolean(h.tapis?.()?.ouvert) },
      ],
    });
    // Saga 1.35 : le tapis de dés du MJ (ses jets passent par la commande, comme le chat).
    function ouvrirTapis() {
      h.tapis?.()?.basculer({ lancer: (f, secret) => commande(f.startsWith('/') ? f : `${secret ? '/gr' : '/r'} ${f}`, { mj: true }, 'MJ', 'hote') });
    }
    let actif = false;
    let selection = null, survol = null, picker = null, pinceau = null, apercu = null;
    let combat = null;     // { tour, ordre, actif, reste, heros: [pion], ennemis: [pion] }
    let sceneTexte = null; // ce que dit la boîte de dialogue (recopié chez les joueurs)
    // Saga 1.21.4 : le récit (les dialogues et les messages des combats), gardé pour le journal des joueurs.
    const recit = [];
    let numeroRecit = 0;
    // Le nom d'un pion (un héros : celui de sa fiche).
    function nomPion(p) {
      const c = p?.sorte === 'heros' ? E.membreDe(partie(), p) : null;
      return c ? JdrPerso.nom(jeu(), c) : p?.nom || '?';
    }
    function noterRecit(o) {
      const texte = String(o?.texte || '').trim();
      if (!texte) return;
      const der = recit[recit.length - 1];
      if (der && der.texte === texte && der.qui === (o.qui || '')) return; // la même boîte (avec ses choix)
      recit.push({ n: ++numeroRecit, qui: o.qui || '', texte, visible: o.visible || 'tous', combat: Boolean(combat), heure: Date.now() });
      if (recit.length > 80) recit.shift();
    }
    const sons = []; let numeroSon = 0; // Saga 1.46 : les bruitages du MJ, rejoués chez les amis
    let effets = [], numero = 0; // les nombres et éclats, pour les rejouer chez les joueurs
    // Saga 1.32 : les pings (quelques secondes), et les avis pour un ami (« formule incomprise »…).
    let pings = [], numeroPing = 0;
    const avis = new Map(); // nom → { n, texte }
    let numeroAvis = 0;
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
    // Saga 1.48 : un joueur dont le héros est sur une autre carte que le MJ voit celle-là (sans ses PNJ ni le combat).
    const carteDe = (r) => {
      if (!r || r.mj || !r.perso) return null;
      const c = herosDuGroupe().find((q) => E.estMien(r, q));
      const p = c ? pion(c.pion) : null;
      return p && p.carte !== carte()?.id ? jeu().cartes.get(p.carte) || null : null;
    };
    const ctxVue = (r = null) => {
      const ailleurs = carteDe(r);
      if (ailleurs) return { ...ctxIci(), carte: ailleurs, presents: [], scene: null, combat: null, pings: [] };
      return ctxIci();
    };
    const ctxIci = () => ({
      carte: carte(), presents: h.presents(), scene: sceneTexte,
      combat: combat ? { tour: combat.tour, ordre: combat.ordre, actif: combat.actif, reste: combat.reste, libre: combat.libre, attente: combat.attente } : null,
      nomHeros: (c) => JdrPerso.nom(jeu(), c), pvMaxHeros: (c) => JdrPerso.pvMax(jeu(), c),
      ficheDe: (perso) => fichePour(perso),
      pings: pings.filter((q) => performance.now() - q.t < 3000),
      // Saga 1.46 : la musique et les bruitages du MJ, que les amis entendent chez eux (sauf s'il les garde pour lui).
      audio: table().audio === 'mj' ? null : { musique: lecture?.chemin || h.morceau?.() || '', sons: sons.filter((x) => Date.now() - x.t < 8000).map(({ n, chemin }) => ({ n, chemin })) },
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
        // Saga 1.41 : les bonus que le MJ a mis sur sa fiche, à cocher avant un jet.
        bonusChoix: JdrMeca.vueBonus(j, c),
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

    // Saga 1.41 : les bonus à cocher (le MJ ajoute et retire ; le joueur coche les siens).
    function changerBonus(c, action) {
      if (!JdrMeca.changerBonus(c, action)) return false;
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
        cadre.replaceChildren(fermer, FichePerso.rendre(f, d, { changer: (id, v) => changerChamp(c, id, v, true), image: f?.theme.image, mj: true, bonus: (action) => changerBonus(c, action), cocher: (id, coche) => changerBonus(c, { type: 'cocher', id, coche }) }));
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
      const v = { ...E.vue(jeu(), partie(), r, ctxVue(r)), effets: effets.filter((e) => r.mj || e.public) };
      v.recit = recit.filter((e) => r.mj || E.visiblePour(e.visible, r)).slice(-50);
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
    const occupee = (x, y, sauf = null) => {
      const id = sauf?.carte || carte().id;
      return E.occupee(table(), id, x, y, sauf) || (id === carte().id && h.presents().some((q) => q.bloque && q.x === x && q.y === y));
    };

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
      document.body.classList.add('mode-table', 'table-verre');
      E.preparer(jeu(), partie());
      h.dialogue.observer((o) => {
        sceneTexte = o;
        noterRecit(o);
        // Saga 1.21.2 : des choix de dialogue → un vote des joueurs (le MJ peut toujours cliquer lui-même).
        vote = o?.choix?.length ? { n: ++numeroQuestion, nb: o.choix.length, votes: new Map() } : null;
        montrerVotes();
      });
      // Un deuxième démarrage (une nouvelle partie, F5) remplace le panneau au lieu d'en empiler un autre.
      panneau?.fermer();
      panneau = TablePanneau.creer({ conteneur: colonne, scene, table: api });
      plateau.oublier();
      brancherMulti();
      // Saga 1.38 : la campagne (salle fixe, téléphones gardés, copies hors séance).
      if (typeof TableCampagne !== 'undefined') {
        campagne = campagne || TableCampagne.creer({ table, copiePour, appliquer: appliquerProposition, multi: () => h.multi?.(), message: (t) => h.message(t), rafraichir: () => panneau?.rafraichir() });
        campagne.brancher();
        const m = h.multi?.();
        if (m) m.avantFermeture = () => Promise.race([campagne.deposer({ silencieux: true }), pause(8000)]);
      }
    }
    function arreter() {
      actif = false;
      document.body.classList.remove('mode-table', 'table-verre');
      h.dialogue.observer(null);
      panneau?.fermer();
      panneau = null;
      ficheMj?.fermer();
      boite.hidden = true;
      combat = null;
      window.saga.tableFermer?.();
      campagne?.debrancher();
      const m = h.multi?.();
      if (m) m.avantFermeture = null;
    }
    // Le groupe arrive sur une carte (le départ, un téléporteur, une sauvegarde) : ses pions autour de (x, y).
    // Saga 1.48 : les héros envoyés ailleurs (p.ailleurs) restent où ils sont ; « Y aller seul » : aucun ne suit.
    // Ceux que le MJ retrouve sur la carte où il arrive refont partie du groupe.
    let seul = false;
    function entrerCarte(c, x, y) {
      if (!actif) return;
      E.preparer(jeu(), partie());
      const garder = new Set(table().pions.filter((p) => p.sorte === 'heros' && (seul || p.ailleurs)).map((p) => p.id));
      E.placerHeros(table(), partie(), c, x, y, h.presents(), garder);
      for (const p of table().pions) if (p.sorte === 'heros' && p.carte === c.id) delete p.ailleurs;
      if (seul) for (const p of table().pions) if (p.sorte === 'heros' && p.carte !== c.id) p.ailleurs = true;
      seul = false;
      selection = null;
      plateau.oublier();
      panneau?.rafraichir();
    }

    // --- Ce que le MJ fait sur le plateau ---
    function agir(a, r = { mj: true }, nom = '') {
      const res = E.agir(jeu(), partie(), r, a, ctxVue(r));
      if (!res.ok && r.mj) h.message(res.erreur);
      else if (!res.ok && nom) avertir(nom, res.erreur);
      if (res.jet) lancerJet(res.jet);
      if (res.ping) {
        const qui = r.mj ? 'MJ' : nom || 'Joueurs';
        pings.push({ n: ++numeroPing, ...res.ping, qui, couleur: r.mj ? '#ffd36b' : couleurDe(qui), t: performance.now() });
        if (pings.length > 12) pings.shift();
      }
      if (res.ok && a.type !== 'ping') envoyes.clear();
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
    // --- Saga 1.32 : les jets tapés dans le chat (/r, /gr, /m) et les macros ---
    const COULEURS_JOUEURS = ['#5ea8ff', '#6fd17d', '#e86bd0', '#4cd4c8', '#f0a04c', '#a77bff'];
    function couleurDe(nom) { let k = 0; for (const ch of nom) k = (k * 31 + ch.charCodeAt(0)) | 0; return COULEURS_JOUEURS[Math.abs(k) % COULEURS_JOUEURS.length]; }
    function avertir(nom, texte) { if (nom) { avis.set(nom, { n: ++numeroAvis, texte }); envoyes.clear(); } }
    // r : le rôle de celui qui lance ; nom : son nom (MJ : celui de l'hôte) ; client : son id réseau.
    function commande(texte, r, nom, client = '') {
      const dire = (t) => (r.mj ? h.message(t) : avertir(nom, t));
      let cmd = TableOutils.commande(texte);
      if (!cmd) return;
      const c = r.mj ? null : herosDuGroupe().find((q) => E.estMien(r, q)) || null;
      if (cmd.sorte === 'macro') {
        const l = r.mj ? table().macros || [] : c?.macros || [];
        const m = l.find((x) => x.nom.toLowerCase() === cmd.nom.toLowerCase()) || l[Math.round(Number(cmd.nom)) - 1];
        if (!m) { dire(`Pas de macro « ${cmd.nom} ».`); return; }
        cmd = TableOutils.commande(m.formule.startsWith('/') ? m.formule : `/r ${m.formule}`) || { sorte: 'jet', formule: m.formule, quoi: '' };
        if (!cmd.quoi) cmd.quoi = m.nom;
      }
      lancerFormule({ ...cmd, r, nom, client, c, dire });
    }
    function lancerFormule({ formule, quoi, cache, r, nom, client, c, dire }) {
      if (table().pause && !r.mj) { dire('La partie est en pause.'); return; }
      const f = TableOutils.remplacer(formule, TableOutils.refsHeros(jeu(), c));
      if (f.erreur) { dire(`${f.erreur}${c ? '' : ' (il faut un héros pour les @)'}.`); return; }
      const res = JdrDes.lancer(partie(), f.formule);
      if (!res.des.length && !res.bonus) { dire(`Formule de dés incomprise : « ${formule} »`); return; }
      const qui = c ? JdrPerso.nom(jeu(), c) : r.mj ? 'MJ' : nom;
      const l = JdrDes.noter(partie(), { qui, quoi: quoi || 'Jet', formule: res.formule, des: res.des, bonus: res.bonus, total: res.total, cache: Boolean(cache), voit: cache && !r.mj ? r.heros || '' : '' });
      h.des({ titre: `${qui} · ${quoi || 'Jet'}${cache ? ' (secret)' : ''}`, lignes: [l] });
      h.reagir?.('table_jet', { qui, quoi: quoi || 'Jet', formule: res.formule, total: res.total, cache: Boolean(cache) });
      // Le chat aussi le dit (un jet secret : au MJ, et à celui qui l'a lancé).
      const m = h.multi?.();
      if (m?.actif) window.saga.reseauDire?.(`🎲 ${quoi || 'Jet'} : ${JdrDes.detail(l)}`, cache ? (client && client !== 'hote' ? client : 'hote') : 'tous', { nom: qui });
      envoyes.clear();
      panneau?.rafraichir();
    }

    // Un héros arrivé sur sa case (hors combat) : le meneur du groupe est là ; un déclencheur ou un
    // téléporteur sous ses pieds se lance.
    function arrive(p) {
      if (p.sorte !== 'heros' || combat || p.carte !== carte()?.id) return;
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
      const ch = G.chemin(jeu().cartes.get(p.carte) || carte(), p, { x, y }, { diagonales: R().diagonales, occupe: (cx, cy) => occupee(cx, cy, p) });
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
    // Saga 1.44 : une image déposée sur le plateau devient un pion (le MJ), là où on l'a lâchée.
    canvas.addEventListener('dragover', (e) => { if (!apercu && [...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
    canvas.addEventListener('drop', async (e) => {
      const f = e.dataTransfer?.files?.[0];
      if (!f || apercu || !panneau) return;
      e.preventDefault();
      const { px, py } = pos(e);
      const c = plateau.caseSous(px, py, jeu());
      const src = await panneau.imageJeton(f);
      if (src) agir({ type: 'pion_poser', image: src, nom: f.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').slice(0, 40), x: c.x, y: c.y });
    });
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); const { px, py } = pos(e); plateau.zoomer(e.deltaY < 0 ? 1 : -1, px, py); }, { passive: false });
    canvas.addEventListener('mousedown', (e) => {
      if (!actif || !jeu()) return;
      fermerMenu();
      const { px, py } = pos(e);
      if (e.button === 1 || e.button === 2) { glisse = { x: e.clientX, y: e.clientY, bouge: false, droit: e.button === 2, px, py }; return; }
      if (e.button !== 0) return;
      const c = plateau.caseSous(px, py, jeu());
      if (picker) { cliquerPicker(c, plateau.pionSous(px, py, jeu(), derniereVue)); return; }
      if (outils.appuyer(c, e)) return;
      if (pinceau) { glisse = { pinceau: true }; peindre(c); return; }
      clicGauche(c, plateau.pionSous(px, py, jeu(), derniereVue), e);
    });
    window.addEventListener('mousemove', (e) => {
      if (!actif || !jeu()) return;
      const { px, py } = pos(e);
      survol = plateau.caseSous(px, py, jeu());
      outils.bouger(survol);
      if (glisse?.pinceau) { peindre(survol); return; }
      if (glisse && !glisse.pinceau) {
        const dx = e.clientX - glisse.x, dy = e.clientY - glisse.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) glisse.bouge = true;
        if (glisse.bouge) { plateau.glisser(dx, dy); glisse.x = e.clientX; glisse.y = e.clientY; }
      }
    });
    window.addEventListener('keydown', (e) => {
      if (!actif || ficheMj || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target?.matches?.('input, select, textarea')) return;
      // Saga 1.35 : 1 à 9 lancent les macros de la barre du bas.
      if (/^[1-9]$/.test(e.key) && panneau?.macro(Number(e.key) - 1)) { e.preventDefault(); return; }
      outils.touche(e);
    });
    window.addEventListener('mouseup', (e) => {
      if (actif && outils.occupe) { outils.lacher(); return; }
      const g = glisse;
      glisse = null;
      if (!actif || !g || g.pinceau) return;
      // Un clic droit sans glisser : le menu du pion (ou de la case).
      if (g.droit && !g.bouge) menuPion(e.clientX, e.clientY, plateau.pionSous(g.px, g.py, jeu(), derniereVue), plateau.caseSous(g.px, g.py, jeu()));
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
    function menuPion(x, y, id, c = null) {
      fermerMenu();
      // Saga 1.32 : un clic droit sur un gabarit (sans pion) : l'effacer.
      if (!id && c) {
        const i = c.y * carte().largeur + c.x;
        const g = [...(derniereVue?.gabarits || [])].reverse().find((q) => TableOutils.casesGabarit(carte(), q, R().diagonales).includes(i) || (q.x === c.x && q.y === c.y));
        // Saga 1.43 : une note sur cette case, un trait de feutre qui passe tout près.
        const n = [...(derniereVue?.notes || [])].reverse().find((q) => q.x === c.x && q.y === c.y);
        const fx = c.fx ?? c.x + 0.5, fy = c.fy ?? c.y + 0.5;
        const d = [...(derniereVue?.dessins || [])].reverse().find((q) => q.points.some(([px, py]) => Math.hypot(px - fx, py - fy) < 0.4));
        if (n) menu.append(el('div', { className: 'table-menu-titre', textContent: `Note : ${n.texte}` }), bouton('trash', 'Effacer cette note', () => agir({ type: 'dessin_retirer', id: n.id })));
        if (d) menu.append(el('div', { className: 'table-menu-titre', textContent: d.visible === 'mj' ? 'Dessin (calque du MJ)' : 'Dessin' }), bouton('trash', 'Effacer ce dessin', () => agir({ type: 'dessin_retirer', id: d.id })));
        if (g) menu.append(el('div', { className: 'table-menu-titre', textContent: 'Gabarit' }), bouton('trash', 'Effacer ce gabarit', () => agir({ type: 'gabarit_retirer', id: g.id })));
        if (g || n || d) {
          menu.hidden = false;
          const r = scene.getBoundingClientRect();
          menu.style.left = `${Math.min(x - r.left, r.width - 260)}px`;
          menu.style.top = `${Math.min(y - r.top, r.height - menu.offsetHeight - 8)}px`;
        }
        return;
      }
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
        // Saga 1.32 : les marques (les états du jeu, des couleurs), vues de tous sur le pion.
        const marques = new Set(p.marques || []);
        const sous = el('div', { className: 'table-menu-marques' }, ...TableOutils.marquesDispo(jeu()).map((m, i) => {
          const b = el('button', { className: `table-marque${marques.has(m.id) ? ' actif' : ''}`, type: 'button', title: m.nom, textContent: m.nom.replace(/^Marque /, '') });
          b.style.setProperty('--marque', TableOutils.couleurMarque(m, i));
          b.onclick = () => { agir({ type: 'marque', pion: id, id: m.id }); b.classList.toggle('actif'); };
          return b;
        }));
        items.push(el('div', { className: 'table-menu-note', textContent: 'Marques' }), sous);
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
      // Saga 1.35.1 : plusieurs rencontres posées dans un même combat (g.ids : celles dont les pions combattent).
      combat = { tour: 0, ordre: [], actif: '', reste: null, heros: [], ennemis: [], groupe: g?.id || '', groupes: Array.isArray(g?.ids) ? g.ids : null,
        // Saga 1.44 : l'ordre libre (le MJ choisit qui agit), par défaut celui du jeu (Tafl › Mécaniques › Initiative).
        libre: typeof JdrMeca !== 'undefined' && JdrMeca.meca(jeu())?.initiative?.ordre === 'libre', attente: [] };
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
        const libres = t.pions.filter((p) => p.sorte === 'monstre' && p.carte === c.id && !p.vaincu && (combat.groupes ? combat.groupes.includes(p.groupe) : (!combat.groupe || p.groupe === combat.groupe)));
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
      actif(u, tour, reste) {
        combat.tour = tour; combat.actif = pionDe(u)?.id || ''; combat.reste = u.camp === 'heros' ? reste : null; panneau?.rafraichir();
        h.reagir?.('table_tour', { nom: u.nom || nomPion(pionDe(u)), pion: combat.actif, tour: Number(tour) || 1 });
      },
      vaincu(u) { const p = pionDe(u); if (p) p.vaincu = true; },
      // Saga 1.44 : qui agit maintenant, parmi ceux qui n'ont pas joué ce tour : le premier dans l'ordre que le MJ
      // a réglé (glissé, « agir maintenant ») ; en ordre libre, le MJ le choisit dans la boîte du combat.
      async suivant(restants) {
        combat.attente = restants.map((u) => pionDe(u)?.id || '');
        const rang = (u) => { const k = combat.ordre.findIndex((o) => o.id === pionDe(u)?.id); return k < 0 ? 999 : k; };
        let k = 0;
        restants.forEach((u, i) => { if (rang(u) < rang(restants[k])) k = i; });
        const debout = restants.map((u, i) => [u, i]).filter(([u]) => !(pionDe(u)?.vaincu) && !(pionDe(u)?.ko));
        if (combat.libre && debout.length > 1) {
          combat.actif = '';
          envoyes.clear();
          panneau?.rafraichir();
          boite.hidden = false;
          tete.textContent = `Tour ${combat.tour || 1} · ordre libre`;
          texte.textContent = 'Qui agit maintenant ?';
          const tri = [...debout].sort((a, b) => rang(a[0]) - rang(b[0]));
          const choix = await menuBoite(tri.map(([u]) => ({ texte: combat.ordre.find((o) => o.id === pionDe(u)?.id)?.nom || '?', icone: u.camp === 'heros' ? 'person' : 'flame' })), false, 'Ordre libre');
          if (choix != null && tri[choix]) k = tri[choix][1];
        }
        combat.attente = combat.attente.filter((id) => id !== (pionDe(restants[k])?.id || ''));
        return k;
      },
      brancher(f) { if (combat) combat.ajuster = f; },
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
        // Le menu d'un tour (il a « Finir le tour ») : Retour n'y mène nulle part, Échap y ouvre le menu du jeu.
        const a = { sorte: 'menu', resoudre, annulable, titre, n: ++numeroQuestion, boutons: [], i: Math.max(0, items.findIndex((x) => !x.desactive)), racine: items.some((x) => x.id === 'fin') };
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
      else if ((t === 'retour' || t === 'echap') && a.annulable && !(t === 'echap' && a.racine)) a.finir(null);
      return true;
    }
    const ui = {
      ouvrir() { boite.hidden = false; tete.textContent = 'Combat'; texte.textContent = ''; viderChoix(); return Promise.resolve(); },
      heros() { /* les PV des héros se lisent directement sur leur fiche */ },
      ennemi(i, v) { const p = combat?.ennemis[i]; if (p) Object.assign(p, { pv: v.pv, pvMax: v.pvMax, nom: v.nom }); },
      message(t, { attendre = false } = {}) {
        texte.textContent = t;
        sceneTexte = { qui: '', texte: t };
        noterRecit(sceneTexte);
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
      // Saga 1.32 : le MJ a tapé une commande dans son chat.
      if (a.client === 'hote') {
        if (a.type === 'commande') commande(a.texte, { mj: true }, 'MJ', 'hote');
        // Saga 1.34 : le téléphone du MJ (son compagnon) : ses macros, les PV d'un pion.
        else if (a.compagnon) actionCompagnonMj(a);
        return;
      }
      // D'un ami par le réseau : son rôle décide, pas ce qu'il dit être.
      if (a.client) {
        const nom = h.multi?.()?.nomDe(a.client) || '';
        if (!nom) return;
        const r = rolePour(nom);
        // Saga 1.32 : les jets du chat, les macros, les marques, les gabarits, le ping.
        if (a.type === 'commande') { if (!creations.has(nom)) commande(String(a.texte || ''), r, nom, a.client); return; }
        if (a.type === 'macro') { const m = herosDuGroupe().find((q) => E.estMien(r, q))?.macros?.[Math.round(Number(a.k))]; if (m) commande(`/m ${m.nom}`, r, nom, a.client); return; }
        if (['ping', 'gabarit', 'gabarit_retirer', 'dessin', 'note', 'dessin_retirer', 'marque', 'macro_ajouter', 'macro_retirer'].includes(a.type)) {
          agir({ ...a, pion: typeof a.pion === 'string' ? a.pion : undefined }, r, nom);
          return;
        }
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
        if (a.type === 'bonus') { const c = herosDuGroupe().find((q) => E.estMien(r, q)); if (c) changerBonus(c, { type: 'cocher', id: String(a.id || ''), coche: Boolean(a.coche) }); return; }
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
      } else if (['ping', 'gabarit', 'gabarit_retirer', 'dessin', 'note', 'dessin_retirer'].includes(a.type)) {
        agir(a, r);
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
    // Saga 1.38 : le MJ prépare un héros lui-même (onglet Pions) : il rejoint le groupe, sans joueur.
    async function preparerHeros() {
      if (!actif || !jeu() || !partie() || h.occupe()) return null;
      const c = await h.creerHeros?.(herosDuGroupe().length + 1);
      if (!c || !actif) return null;
      const ou = Collection.ranger(jeu(), partie(), c);
      if (ou?.ou !== 'equipe') h.message(`Le groupe est complet : ${JdrPerso.nom(jeu(), c)} attend dans la réserve.`);
      else {
        E.placerHeros(table(), partie(), carte(), h.joueur().x, h.joueur().y, h.presents());
        h.message(`${JdrPerso.nom(jeu(), c)} rejoint la table.`);
      }
      envoyes.clear();
      panneau?.rafraichir();
      return c;
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
    // Saga 1.34 : le nom de la campagne et le fond du compagnon (l'image elle-même passe à part).
    // Le fond : celui de la campagne (Saga), sinon celui du jeu (Tafl › Réglages › Fiche des personnages).
    const fondCompagnon = () => table().campagne?.fond || jeu()?.donnees?.reglages?.reglages?.jdr?.compagnon?.fond || '';
    const empreinte = (t) => { let x = t.length; for (let i = 0; i < t.length; i += 997) x = (x * 31 + t.charCodeAt(i)) | 0; return t ? `${t.length}-${x >>> 0}` : ''; };
    let fondPousse = null;
    function extrasCompagnon() {
      const f = fondCompagnon();
      // L'image part une fois au serveur ; la vue n'en porte que l'empreinte (le téléphone la recharge si elle change).
      if (f !== fondPousse && window.saga.reseauFond) { fondPousse = f; window.saga.reseauFond(f); }
      return { campagne: { nom: table().campagne?.nom || jeu()?.titre || '', fond: empreinte(f) } };
    }
    function extrasPour(nom, r) {
      const x = { ...TableDocuments.vue(table(), nom, false, montre) };
      if (avis.has(nom)) x.avis = avis.get(nom);
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
    // --- Saga 1.37 : les documents du MJ (table/documents.js) ---
    // montre : celui que le MJ vient d'ouvrir sur les écrans de ceux qui l'ont (et la télé, s'il est à tous).
    let montre = null, numeroMontre = 0, docsPousses = '';
    const envois = new Map(); // une photo du téléphone du MJ, morceau par morceau : envoi → { n, morceaux, meta, t }
    function docAgir(a) {
      const res = TableDocuments.agir(table(), a);
      if (!res.ok) { h.message(res.erreur); return res; }
      if (res.montre) montre = { id: res.doc.id, n: ++numeroMontre };
      if (a.type === 'doc_retirer' && montre?.id === a.id) montre = null;
      if (a.type === 'doc_donner' && montre?.id === a.id && TableDocuments.brouillon(res.doc)) montre = null;
      envoyes.clear();
      panneau?.rafraichir();
      return res;
    }
    function cacherDocument() { montre = null; envoyes.clear(); panneau?.rafraichir(); }
    // À qui le MJ peut donner : les amis venus (même partis) et ceux qui jouent un héros.
    function destinataires() {
      const noms = new Map();
      for (const n of Object.keys(roles())) if (n) noms.set(n.toLowerCase(), n);
      for (const j of h.multi?.()?.joueurs || []) if (!j.hote && j.nom) noms.set(j.nom.toLowerCase(), j.nom);
      return [...noms.values()].sort((a, b) => a.localeCompare(b, 'fr'));
    }
    // Les images partent au serveur (une fois, quand la liste change) ; les vues n'en portent que l'empreinte.
    function pousserDocuments() {
      if (!window.saga.tableDocuments) return;
      const l = TableDocuments.liste(table()).filter((d) => d.image && !TableDocuments.brouillon(d));
      // Saga 1.42 : les images des jetons partent avec, pour tout le monde (leur id porte leur empreinte).
      const jetons = Object.entries(table().jetons || {});
      const sig = JSON.stringify([l.map((d) => [d.id, d.pour, TableDocuments.empreinte(d.image)]), jetons.map(([id]) => id)]);
      if (sig === docsPousses) return;
      docsPousses = sig;
      window.saga.tableDocuments([...l.map((d) => ({ id: d.id, image: d.image, pour: d.pour })), ...jetons.map(([id, image]) => ({ id, image, pour: 'tous' }))]);
    }
    // Une photo prise avec le téléphone du MJ arrive en morceaux (une demande est petite) ; au dernier, c'est
    // un nouveau document.
    function morceauDocument(a) {
      const id = String(a.envoi || '').slice(0, 40), n = Math.round(Number(a.n)), i = Math.round(Number(a.i));
      const data = String(a.data || '');
      if (!id || !(n > 0 && n <= 600) || !(i >= 0 && i < n) || data.length > 15000 || !/^[A-Za-z0-9+/=]*$/.test(data)) return;
      for (const [k, e] of envois) if (Date.now() - e.t > 120e3) envois.delete(k);
      const e = envois.get(id) || { n, morceaux: new Array(n), recus: 0, t: Date.now() };
      if (e.n !== n) return;
      if (e.morceaux[i] == null) e.recus++;
      e.morceaux[i] = data;
      e.t = Date.now();
      envois.set(id, e);
      if (e.recus < n) return;
      envois.delete(id);
      docAgir({ type: 'doc_nouveau', titre: a.titre, texte: a.texte, image: `data:image/jpeg;base64,${e.morceaux.join('')}`, pour: a.pour, montrer: a.montrer });
    }

    // --- Saga 1.38 : la campagne (table/campagne.js) ---
    let campagne = null;
    // La copie hors séance d'un joueur : ce que son téléphone montre entre deux séances (sa fiche, ses macros, le
    // journal qu'il voit, ses documents avec leurs images, le chat public). Rien que sa vue ne lui montrerait pas.
    function copiePour(nom) {
      const r = rolePour(nom);
      const v = r.spectateur ? null : vuePour(r);
      const images = {};
      for (const d of TableDocuments.liste(table())) if (d.image && !TableDocuments.brouillon(d) && TableDocuments.voit(d, nom)) images[d.id] = d.image;
      const chat = (h.multi?.()?.lignes || []).filter((l) => l.pour === 'tous' && l.de !== '').slice(-60).map((l) => ({ nom: l.nom, texte: l.texte, t: l.t, ...(l.jet ? { jet: true } : {}) }));
      const p = v?.pions?.find((q) => q.id === v.moi);
      return {
        v: 1, t: Date.now(), campagne: { nom: table().campagne?.nom || jeu()?.titre || '' }, nom,
        vue: v ? { fiche: v.fiche || null, macros: v.macros || [], journal: v.journal || [], moi: v.moi || '', nom: v.nom || '', pions: p ? [{ id: p.id, nom: p.nom }] : [] } : { fiche: null, macros: [], journal: [], moi: '', pions: [] },
        documents: TableDocuments.vue(table(), nom, false, null).documents, images, chat,
      };
    }
    // Un changement de fiche proposé hors séance : appliqué comme s'il venait du joueur en séance.
    function appliquerProposition(nom, id, valeur) {
      const r = rolePour(nom);
      if (r.spectateur) return false;
      const c = herosDuGroupe().find((q) => E.estMien(r, q));
      return c ? changerChamp(c, id, valeur, false) : false;
    }
    function libelleChamp(nom, id) {
      const r = rolePour(nom);
      const c = r.spectateur ? null : herosDuGroupe().find((q) => E.estMien(r, q));
      return (c && JdrFiches.champs(jeu(), c).find((x) => x.id === id)?.nom) || id;
    }

    // Saga 1.34 : ce que demande le téléphone du MJ.
    function actionCompagnonMj(a) {
      if (a.type === 'doc_morceau') morceauDocument(a);
      else if (a.type === 'doc_cacher') cacherDocument();
      else if (/^doc_(nouveau|modifier|donner|montrer|retirer)$/.test(a.type)) docAgir(a);
      else if (a.type === 'macro') {
        const m = (table().macros || [])[Math.round(Number(a.k))];
        if (m) commande(`/m ${m.nom}`, { mj: true }, 'MJ', 'hote');
      } else if (a.type === 'pv') changerPv(String(a.pion || ''), a);
      else if (a.type === 'macro_ajouter' || a.type === 'macro_retirer') { agir(a, { mj: true }, 'MJ'); envoyes.clear(); panneau?.rafraichir(); }
    }
    // Les PV d'un pion, changés à la main par le MJ (+1, −5, ou une valeur) : héros ou monstre, en combat aussi.
    function changerPv(id, { delta, valeur }) {
      const p = table().pions.find((q) => q.id === id);
      if (!p) return false;
      const calcul = (pv, max) => Math.max(0, Math.min(max, Number.isFinite(Number(valeur)) && valeur !== '' && valeur != null ? Math.round(Number(valeur)) : pv + Math.round(Number(delta) || 0)));
      if (p.sorte === 'heros') {
        const c = E.membreDe(partie(), p);
        if (!c) return false;
        c.pv = calcul(Math.max(0, c.pv), JdrPerso.pvMax(jeu(), c));
      } else {
        const i = combat ? combat.ennemis.indexOf(p) : -1;
        const v = calcul(Math.max(0, Number(p.pv) || 0), Number(p.pvMax) || 1);
        if (i >= 0 && combat.ajuster) combat.ajuster.pvMonstre(i, v);
        else { p.pv = v; if (v <= 0 && !combat) p.vaincu = true; }
      }
      envoyes.clear();
      panneau?.rafraichir();
      return true;
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
    // --- Saga 1.48 : les listes de lecture du MJ (un morceau après l'autre, dans l'ordre ou au hasard, en boucle) ---
    let lecture = null, numeroLecture = 0;
    function jouerListe(id) {
      const l = table().listes.find((x) => x.id === id);
      if (!l?.morceaux.length) return false;
      lecture = { id, i: -1, ordre: [], rates: 0, chemin: '' };
      morceauSuivant();
      return true;
    }
    async function morceauSuivant() {
      if (!lecture) return;
      const l = table().listes.find((x) => x.id === lecture.id);
      if (!l?.morceaux.length) { arreterListe(); return; }
      lecture.i++;
      if (lecture.i >= lecture.ordre.length || lecture.ordre.length !== l.morceaux.length) {
        const ordre = l.morceaux.map((_, k) => k);
        if (l.hasard) for (let k = ordre.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [ordre[k], ordre[j]] = [ordre[j], ordre[k]]; }
        lecture.ordre = ordre;
        lecture.i = 0;
      }
      const chemin = l.morceaux[lecture.ordre[lecture.i]];
      const moi = ++numeroLecture;
      lecture.chemin = chemin;
      envoyes.clear();
      panneau?.rafraichir();
      const t0 = Date.now();
      try { await h.musiqueFois?.(chemin); } catch { /* illisible : compté comme raté */ }
      if (numeroLecture !== moi || !lecture) return; // un autre morceau ou une autre musique entre-temps
      // Une autre musique a pris la place (un combat, une scène) : la liste s'arrête là.
      if (Date.now() - t0 >= 300 && h.morceau && h.morceau() !== chemin) { arreterListe(); return; }
      // Un morceau qui finit tout de suite est illisible : si aucun ne se lit, la liste s'arrête.
      if (Date.now() - t0 < 300) {
        if (++lecture.rates >= l.morceaux.length) { arreterListe(); h.message(`« ${l.nom} » : aucun morceau ne se lit.`); return; }
      } else lecture.rates = 0;
      morceauSuivant();
    }
    function arreterListe() { numeroLecture++; lecture = null; envoyes.clear(); panneau?.rafraichir(); }

    // --- Saga 1.47 : les scripts JS du jeu à la table (BacASable.MOMENTS › table_*, saga.table) ---
    // Les jets et ce que dit un script arrivent marqués « jet » : un script ne se répond pas à lui-même.
    function chatPourScripts(l) {
      if (!l || l.jet || !l.de) return;
      h.reagir?.('table_chat', { nom: String(l.nom || ''), texte: String(l.texte || ''), mj: l.de === 'hote' });
    }
    const pionPour = (cle) => {
      const k = String(cle || '').trim().toLowerCase();
      const l = table().pions.filter((p) => p.carte === carte()?.id);
      return l.find((p) => p.id.toLowerCase() === k) || l.find((p) => nomPion(p).toLowerCase() === k) || null;
    };
    function pourScript() {
      const l = table().pions.filter((p) => p.carte === carte()?.id);
      const pv = (p) => {
        const c = p.sorte === 'heros' ? E.membreDe(partie(), p) : null;
        return c ? [Math.max(0, c.pv), JdrPerso.pvMax(jeu(), c)] : [Number(p.pv) || 0, Number(p.pvMax) || 0];
      };
      const actifId = combat ? combat.actif : table().initiative?.liste?.find((x) => x.id === table().initiative.actif)?.pion || '';
      return {
        pions: l.map((p) => { const [v, max] = pv(p); return { id: p.id, nom: nomPion(p), sorte: p.sorte, x: p.x, y: p.y, pv: v, pvMax: max, marques: [...(p.marques || [])], vaincu: Boolean(p.vaincu) }; }),
        actif: actifId ? { pion: actifId, nom: nomPion(pion(actifId)) } : null,
      };
    }
    // Les commandes des scripts : elles agissent comme le MJ. Rend { ok } (un objet : le script le reçoit).
    function commandeScript(c) {
      if (!actif) return { ok: false };
      if (c.type === 'table_dire') {
        const t = String(c.texte || '').trim().slice(0, 400);
        if (!t) return { ok: false };
        const m = h.multi?.();
        if (m?.actif && window.saga.reseauDire) {
          window.saga.reseauDire(t, c.pour === 'mj' ? 'hote' : 'tous', { nom: 'Script' });
        } else if (c.pour === 'mj') h.message(t);
        else noterRecit({ texte: t });
        return { ok: true };
      }
      const p = pionPour(c.pion);
      if (!p) { h.message(`Script : pas de pion « ${c.pion} » sur cette carte.`); return { ok: false }; }
      if (c.type === 'table_pv') return { ok: changerPv(p.id, { delta: c.delta, valeur: c.valeur }) };
      if (c.type === 'table_marque') return { ok: agir({ type: 'marque', pion: p.id, id: String(c.marque || ''), valeur: c.mettre !== false }).ok };
      return { ok: false };
    }

    function brancherMulti() {
      const m = h.multi?.();
      if (!m) return;
      if (!ecouteMulti) {
        ecouteMulti = true;
        // Les demandes des amis (déplacer, parler, lancer un jet, répondre en combat) arrivent par le réseau.
        m.sur((sorte, d) => {
          if (sorte === 'demande') recevoir(d);
          // Saga 1.47 : un message du chat, pour les scripts (pas les jets, ni ce qu'un script vient de dire).
          else if (sorte === 'chat') chatPourScripts(d);
          // Quelqu'un arrive (un ami, un téléphone) : chacun reçoit sa vue à nouveau.
          else if (sorte === 'joueurs') { envoyes.clear(); arrivees(d); }
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
      plateau.dessiner({ jeu: jeu(), carte: carte(), vue: derniereVue, maintenant, mj: r.mj, jeton: (id) => table().jetons?.[id] || '', apercu: !r.mj, cases: cases || casesZone, cibles: picker?.sorte === 'pion' ? picker.cibles : null, selection, survol, outil: outils.dessin(survol) });
      // L'écran des joueurs : sa vue, au plus 8 fois par seconde, seulement quand elle change.
      chronoEnvoi += dt;
      if (chronoEnvoi >= 0.12) {
        chronoEnvoi = 0;
        if (window.saga.tableEnvoyer) {
          pousserDocuments();
          const v = JSON.stringify({ ...vuePour({ mj: false, perso: null }), campagne: { nom: table().campagne?.nom || jeu()?.titre || '' }, ...TableDocuments.vue(table(), '', false, montre) });
          if (v !== envoye) { envoye = v; window.saga.tableEnvoyer(v); }
        }
        // Le multijoueur : à chaque ami, la vue de SON rôle (un spectateur voit celle de l'écran partagé).
        const multi = h.multi?.();
        if (multi?.actif && window.saga.reseauEnvoyer) {
          pousserDocuments();
          for (const j of multi.joueurs) {
            // Saga 1.34 : le téléphone du MJ reçoit la vue du MJ (tout), seulement s'il y en a un.
            if (j.hote) {
              if (!j.compagnons) continue;
              const v = JSON.stringify({ ...vuePour({ mj: true }), ...extrasCompagnon(), ...TableDocuments.vue(table(), '', true, montre), destinataires: destinataires() });
              if (envoyes.get('hote') !== v) { envoyes.set('hote', v); window.saga.reseauEnvoyer('hote', 'vue', v); }
              continue;
            }
            if (!j.connecte && !j.compagnons) continue;
            const r = rolePour(j.nom);
            const v = JSON.stringify({ ...vuePour(r.spectateur ? { mj: false, perso: null } : r), ...extrasPour(j.nom, r), ...extrasCompagnon() });
            if (envoyes.get(j.id) !== v) { envoyes.set(j.id, v); window.saga.reseauEnvoyer(j.id, 'vue', v); }
          }
        }
      }
    }

    // Échap hors combat : annuler ce qui est en cours (un choix de case, le pinceau, le pion choisi).
    function annuler() {
      fermerMenu();
      if (ficheMj) { ficheMj.fermer(); return true; }
      if (picker) { annulerPicker(); afficherAide(''); return true; }
      if (pinceau) { api.pinceau = null; panneau?.dessiner(); return true; }
      if (selection) { selection = null; panneau?.rafraichir(); return true; }
      return false;
    }

    const api = {
      demarrer, arreter, entrerCarte, dessiner, combattre, touche, recevoir, annuler,
      get actif() { return actif; },
      get enCombat() { return Boolean(combat); },
      // Saga 1.35 : le récit (le chat du MJ y mêle les phrases du combat).
      get recit() { return recit; },
      // Saga 1.35.1 : en combat, Échap revient en arrière s'il y a de quoi ; sinon il ouvre le menu du jeu.
      get retourPossible() { return Boolean(ficheMj || picker || (attente && attente.sorte !== 'message' && attente.annulable && !attente.racine)); },
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
      vuePour,
      choisirCase, afficherAide, annulerPicker,
      cadrer: () => plateau.oublier(),
      // Saga 1.35 : le zoom (les boutons en bas du plateau), le tapis de dés.
      zoomer: (k) => { const r = canvas.getBoundingClientRect(); const m = plateau.marges?.() || {}; plateau.zoomer(k, ((m.g || 0) + r.width - (m.d || 0)) / 2, ((m.h || 0) + r.height - (m.b || 0)) / 2); },
      get zoom() { return plateau.camera.z; },
      ouvrirTapis,
      tapis: () => h.tapis?.(),
      set marges(f) { plateau.marges = f; },
      redessinerOutils: () => outils.rafraichir(),
      pointDe: (x, y) => { const r = canvas.getBoundingClientRect(); const q = plateau.pointDe(x, y, jeu()); return { x: r.left + q.px, y: r.top + q.py }; },
      musique: (c) => { if (lecture) arreterListe(); h.musique(c); }, son: (c) => { h.son(c); sons.push({ n: ++numeroSon, chemin: c, t: Date.now() }); if (sons.length > 6) sons.shift(); envoyes.clear(); }, message: (t) => h.message(t), des: (o) => h.des(o),
      lancerCombat: (groupe) => h.combattreDepuisTable(groupe),
      // Saga 1.35.1 : les rencontres posées sur cette carte ([{ id, nom, n }]), et en lancer plusieurs d'un coup
      // (les monstres du combat : ceux qui sont sur la table, pas un de plus).
      rencontresPosees() {
        const c = carte(), par = new Map();
        for (const p of table().pions) if (p.sorte === 'monstre' && p.carte === c?.id && !p.vaincu && p.groupe) par.set(p.groupe, (par.get(p.groupe) || 0) + 1);
        const noms = new Map((jeu().donnees.groupes?.groupes || []).map((g) => [g.id, g.nom || g.id]));
        return [...par].map(([id, n]) => ({ id, nom: noms.get(id) || id, n }));
      },
      // Saga 1.43 : l'initiative tenue à la main (hors des combats de Saga). Jeter : chaque pion de la carte
      // (ou ceux de ids) lance son initiative, comme dans un combat ; ceux déjà dans la liste relancent.
      nomPion,
      jeterInitiative(ids = null) {
        const c = carte(), j = jeu(), lignes = [];
        const vide = !table().initiative?.liste?.length;
        const pions = table().pions.filter((p) => p.carte === c.id && !p.vaincu && (!ids || ids.includes(p.id)));
        for (const p of pions) {
          const h0 = p.sorte === 'heros' ? E.membreDe(partie(), p) : null;
          const m = p.sorte === 'monstre' ? (j.donnees.monstres_jdr?.monstres_jdr || []).find((x) => x.id === p.monstre) : null;
          if (!h0 && !m) continue;
          const dex = h0 ? JdrPerso.initiative(j, h0) : JdrBase.mod(Number(m.carac?.dex) || 10) + (Number(m.initiative) || 0);
          const vars = typeof JdrMeca !== 'undefined' ? (h0 ? JdrMeca.varsHeros(j, h0) : JdrMeca.varsMonstre(m, p.pv, p.pvMax)) : {};
          const r = (typeof JdrMeca !== 'undefined' && JdrMeca.initiative(j, partie(), vars, dex)) || (() => { const d = JdrDes.d20(partie()); return { total: d.naturel + dex, des: d.des, formule: 'd20', bonus: dex }; })();
          const nom = nomPion(p);
          lignes.push(JdrDes.noter(partie(), { qui: nom, quoi: 'Initiative', formule: r.formule, des: r.des, bonus: r.bonus, total: r.total, cache: !h0 }));
          const deja = (table().initiative?.liste || []).find((x) => x.pion === p.id);
          if (deja) E.agir(j, partie(), { mj: true }, { type: 'init_valeur', id: deja.id, init: r.total }, ctxVue());
          else E.agir(j, partie(), { mj: true }, { type: 'init_ajouter', pion: p.id, nom, init: r.total }, ctxVue());
        }
        if (lignes.length) {
          E.agir(j, partie(), { mj: true }, { type: 'init_trier' }, ctxVue());
          // Une liste neuve : le premier commence, au tour 1.
          if (vide) Object.assign(table().initiative, { actif: table().initiative.liste[0].id, tour: 1, libre: typeof JdrMeca !== 'undefined' && JdrMeca.meca(j)?.initiative?.ordre === 'libre' });
          h.des({ titre: 'Initiative', lignes });
        }
        envoyes.clear();
        panneau?.rafraichir();
        return lignes.length;
      },
      // Saga 1.44 : régler l'ordre d'un combat de Saga : placer une ligne (glisser), faire agir quelqu'un juste
      // après le tour en cours, passer en ordre libre. Ça compte pour ceux qui n'ont pas encore joué ce tour.
      ordreCombat(id, index) {
        if (!combat) return false;
        const i = combat.ordre.findIndex((o) => o.id === id);
        if (i < 0) return false;
        const [o] = combat.ordre.splice(i, 1);
        combat.ordre.splice(Math.max(0, Math.min(combat.ordre.length, Math.round(Number(index) || 0))), 0, o);
        envoyes.clear(); panneau?.rafraichir();
        return true;
      },
      agirMaintenant(id) {
        if (!combat) {
          const l = table().initiative?.liste || [];
          const x = l.find((q) => q.id === id || q.pion === id);
          const res = x ? agir({ type: 'init_agir', id: x.id }) : { ok: false };
          if (res.ok) noterRecit({ texte: `Au tour de ${x.nom} (tour ${table().initiative.tour}).` });
          return res.ok;
        }
        if (!combat.attente.includes(id)) { h.message('Il a déjà joué ce tour.'); return false; }
        // Juste après celui qui joue (ou en tête) : il sera le prochain.
        const a = combat.ordre.findIndex((o) => o.id === combat.actif);
        const i = combat.ordre.findIndex((o) => o.id === id);
        return api.ordreCombat(id, a < 0 ? 0 : (i > a ? a + 1 : a));
      },
      ordreLibre(v) {
        if (combat) combat.libre = Boolean(v);
        else agir({ type: 'init_libre', valeur: Boolean(v) });
        envoyes.clear(); panneau?.rafraichir();
      },
      // Passer au suivant (ou revenir) : le récit dit à qui c'est.
      passerInitiative(sens = 1) {
        const res = agir({ type: sens < 0 ? 'init_precedent' : 'init_suivant' });
        if (res.ok && res.tourDe) {
          noterRecit({ texte: `Au tour de ${res.tourDe.nom} (tour ${table().initiative.tour}).` });
          h.reagir?.('table_tour', { nom: res.tourDe.nom, pion: res.tourDe.pion || '', tour: Number(table().initiative.tour) || 1 });
        }
        return res;
      },
      // Saga 1.42 : le MJ emmène le groupe sur une autre carte ou une scène image (onglet Scène › Cartes).
      // Le groupe arrive au départ de la carte s'il y est, sinon sur la case libre la plus proche du centre.
      // Saga 1.48 : envoyer un héros (et son joueur) sur une autre carte ; celle du MJ : il rejoint le groupe.
      envoyerHeros(pionId, carteId) {
        const p = pion(pionId), c = jeu().cartes.get(carteId);
        if (!p || p.sorte !== 'heros' || !c || combat) return false;
        const ici = c.id === carte()?.id;
        const autre = ici ? table().pions.find((q) => q.sorte === 'heros' && q !== p && q.carte === c.id) : null;
        const d = jeu().depart?.carte === c.id ? jeu().depart : null;
        const vise = autre || d || { x: Math.floor(c.largeur / 2), y: Math.floor(c.hauteur / 2) };
        const pos = E.caseLibre(table(), c, vise.x, vise.y, [], ici ? h.presents() : []);
        Object.assign(p, { carte: c.id, x: pos.x, y: pos.y });
        if (ici) delete p.ailleurs; else p.ailleurs = true;
        if (selection === p.id) selection = null;
        noterRecit({ texte: `${nomPion(p)} : ${c.nom || c.id}.`, visible: 'mj' });
        envoyes.clear(); plateau.oublier(); panneau?.rafraichir();
        return true;
      },
      // Les héros sur une autre carte que celle du MJ.
      herosAilleurs: () => table().pions.filter((p) => p.sorte === 'heros' && p.carte !== carte()?.id),
      allerCarte(id, { seul: s = false } = {}) {
        const c = jeu().cartes.get(id);
        if (!c || combat || h.occupe() || id === carte()?.id) return false;
        seul = Boolean(s);
        const d = jeu().depart?.carte === id ? jeu().depart : null;
        let pos = d ? { x: d.x, y: d.y } : null;
        if (!pos) {
          const cx = Math.floor(c.largeur / 2), cy = Math.floor(c.hauteur / 2);
          let best = null;
          for (let y = 0; y < c.hauteur; y++) for (let x = 0; x < c.largeur; x++) {
            if (!G.libre(c, x, y)) continue;
            const k = Math.abs(x - cx) + Math.abs(y - cy);
            if (!best || k < best.k) best = { x, y, k };
          }
          pos = best || { x: cx, y: cy };
        }
        h.teleporter({ carte: id, x: pos.x, y: pos.y, direction: 'bas' });
        if (!seul) noterRecit?.({ texte: `Le groupe arrive : ${c.nom}.` });
        return true;
      },
      lancerRencontres(ids) {
        const c = carte(), liste = (jeu().donnees.groupes?.groupes || []).filter((g) => ids.includes(g.id));
        if (!liste.length) return null;
        const compte = new Map();
        for (const p of table().pions) if (p.sorte === 'monstre' && p.carte === c?.id && !p.vaincu && ids.includes(p.groupe)) compte.set(p.monstre, (compte.get(p.monstre) || 0) + 1);
        if (!compte.size) return null;
        return h.combattreDepuisTable({
          id: liste[0].id, ids: liste.map((g) => g.id), nom: liste.map((g) => g.nom || g.id).join(' + '),
          monstres: [...compte].map(([monstre, nombre]) => ({ monstre, nombre })), fuite: liste.every((g) => g.fuite !== false),
        });
      },
      // Saga 1.32 : une formule ou une commande du MJ (le panneau, ses macros).
      commande: (texte) => commande(texte, { mj: true }, 'MJ', 'hote'),
      changerPv,
      // Saga 1.48 : les listes de lecture.
      jouerListe, morceauSuivant, arreterListe, lecture: () => (lecture ? { id: lecture.id, chemin: lecture.chemin } : null),
      // Saga 1.47 : les scripts JS du jeu (saga.table).
      pourScript, commandeScript,
      outils,
      occupe: () => h.occupe(),
      // Saga 1.37 : les documents (le volet Documents du MJ, son téléphone).
      documents: () => TableDocuments.liste(table()), docAgir, cacherDocument, destinataires,
      get montre() { return montre; },
      // Saga 1.38 : la campagne (l'onglet Joueurs, les essais).
      campagne: () => campagne, copiePour, libelleChamp, preparerHeros,
    };
    return api;
  }

  return { creer };
})();
