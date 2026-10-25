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
    });
    const vuePour = (r) => ({ ...E.vue(jeu(), partie(), r, ctxVue()), effets: effets.filter((e) => r.mj || e.public) });
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
      h.dialogue.observer((o) => { sceneTexte = o; });
      panneau = TablePanneau.creer({ conteneur: colonne, table: api });
      plateau.oublier();
    }
    function arreter() {
      actif = false;
      document.body.classList.remove('mode-table');
      h.dialogue.observer(null);
      panneau?.fermer();
      panneau = null;
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
      panneau?.rafraichir();
      return res;
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
      return new Promise((resoudre) => { picker = { sorte: 'case', cases, resoudre, titre }; });
    }
    function choisirPion(cibles, { zone = 0 } = {}) {
      return new Promise((resoudre) => { picker = { sorte: 'pion', cibles, resoudre, zone }; });
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
    function afficherAide(t) { aide.textContent = t; aide.hidden = !t; }
    function viderChoix() { choix.innerHTML = ''; }
    function menuBoite(items, annulable, titre = '') {
      viderChoix();
      if (titre) choix.append(el('div', { className: 'table-combat-titre', textContent: titre }));
      return new Promise((resoudre) => {
        const a = { sorte: 'menu', resoudre, annulable, boutons: [], i: Math.max(0, items.findIndex((x) => !x.desactive)) };
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

    // --- Les joueurs (leur fenêtre) : leurs demandes, vérifiées ici ---
    function recevoir(a) {
      if (!actif || !a || typeof a !== 'object') return;
      const r = { mj: false, perso: typeof a.perso === 'string' && a.perso ? a.perso : null };
      if (a.type === 'deplacer') {
        if (h.occupe()) return;
        const p = pion(a.pion);
        if (p) deplacerHorsCombat(p, Math.round(Number(a.x)), Math.round(Number(a.y)), r);
      } else if (a.type === 'parler') {
        // Parler à un PNJ (ou fouiller un coffre) : un héros du joueur doit être juste à côté.
        const q = presentDe(a.id);
        const p = pion(a.pion);
        if (!q || !p || combat || h.occupe() || q.ev.declenchement !== 'parler' || !E.visiblePour(q.ev.visible_par, r)) return;
        if (r.perso && E.membreDe(partie(), p)?.creature !== r.perso) return;
        if (G.distance(p, q) > 1) return;
        h.placerJoueur(p.x, p.y, p.direction);
        h.lancer(q);
      }
    }

    // --- Chaque image ---
    function dessiner(maintenant, dt) {
      if (!actif || !jeu() || !carte()) return;
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
      if (chronoEnvoi >= 0.12 && window.saga.tableEnvoyer) {
        chronoEnvoi = 0;
        const v = JSON.stringify(vuePour({ mj: false, perso: null }));
        if (v !== envoye) { envoye = v; window.saga.tableEnvoyer(v); }
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
