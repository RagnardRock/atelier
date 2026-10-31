// Tafl 0.30 : les espaces de travail, en onglets dans la barre de titre (comme Godot ou Blender).
// - Accueil : sans jeu ouvert, l'écran de bienvenue ; avec un jeu, son accueil (carte du monde,
//   vérificateur, récents, raccourcis).
// - Tuiles et Cartes : les deux modes d'avant (#layout, Tab passe de l'un à l'autre).
// - Événements : tous les événements du jeu à gauche, l'éditeur d'événement en pleine page ; dessous,
//   les scripts JS du jeu (Tafl 0.31, scripts-js.js), ouverts dans l'éditeur de code à la place.
// - Données : les données du jeu en pleine page (celles du pack de règles du jeu, comme avant).
// - Jeu : jouer, tester, vérifier, exporter, régler le jeu.
// Plus tard, un pack de règles qui en a besoin (jeu de rôle sur table) ajoutera son espace « Table ».
//
// Les éditeurs en page travaillent sur une copie, comme les fenêtres d'avant : « Appliquer » (ou
// Ctrl+Entrée) les met dans le jeu (un Ctrl+Z les défait). Ils s'appliquent aussi tout seuls en
// quittant la page, en enregistrant, en jouant, et avant une action de Loki : rien ne se perd.
const Espaces = (() => {
  const LISTE = [
    { id: 'accueil', nom: 'Accueil', icone: 'home', aide: 'L\'accueil du jeu : la carte du monde, ce que trouve le vérificateur, les jeux récents' },
    { id: 'tuiles', nom: 'Tuiles', icone: 'edit', aide: 'Dessiner les tuiles, pixel par pixel' },
    { id: 'cartes', nom: 'Cartes', icone: 'map', aide: 'Poser les tuiles, les tampons, les zones, les téléporteurs et les événements' },
    { id: 'evenements', nom: 'Événements', icone: 'comment-discussion', aide: 'Tous les événements du jeu et leurs scripts' },
    { id: 'donnees', nom: 'Données', icone: 'database', aide: 'Personnages, quêtes, et les données du pack de règles (créatures, monstres, objets…)' },
    { id: 'jeu', nom: 'Jeu', icone: 'game', aide: 'Jouer, tester, vérifier, exporter et régler le jeu' },
  ];
  const PAGES = ['accueil', 'evenements', 'donnees', 'jeu'];
  let courant = 'accueil';
  const memoDonnees = { tab: null, ids: {} };
  const memoEvenements = { carte: null, id: null, filtre: '', script: '', ligne: 0 };
  let session = null; // l'éditeur ouvert en page : la promesse qui finit quand il est appliqué ou fermé
  let reveil = null;  // la page Événements sans événement choisi attend ceci

  const estPage = (id = courant) => PAGES.includes(id);
  const raccourci = (e) => `Alt+${LISTE.indexOf(e) + 1}`;

  // --- La barre des onglets ---
  const nav = $('#espaces');
  for (const e of LISTE) {
    const b = el('button', { className: 'espace', role: 'tab', title: `${e.nom} (${raccourci(e)}) : ${e.aide}` }, [icon(e.icone), el('span', { className: 'espace-nom', textContent: e.nom })]);
    b.dataset.espace = e.id;
    b.onclick = () => aller(e.id);
    nav.append(b);
  }
  function majBarre() {
    const doc = App.doc;
    for (const b of nav.children) {
      b.classList.toggle('active', b.dataset.espace === courant);
      b.setAttribute('aria-selected', String(b.dataset.espace === courant));
      b.disabled = !doc && b.dataset.espace !== 'accueil';
    }
    for (const e of LISTE) document.body.classList.toggle(`espace-${e.id}`, e.id === courant);
    document.body.classList.toggle('espace-page', estPage());
    $('#pages').hidden = !estPage();
    for (const id of PAGES) $(`#page-${id}`).hidden = id !== courant;
  }

  // --- Aller dans un espace ---
  // opts : { tab, id } pour Données ; { carte, evenement } ou { script } pour Événements.
  async function aller(id, opts = {}) {
    const doc = App.doc;
    if (!doc && id !== 'accueil') return false;
    if (id === 'donnees' && opts.tab) { memoDonnees.tab = opts.tab; if (opts.id) memoDonnees.ids[opts.tab] = opts.id; }
    if (id === 'evenements' && opts.evenement) { memoEvenements.carte = opts.carte; memoEvenements.id = opts.evenement; memoEvenements.script = ''; }
    if (id === 'evenements' && opts.script) { memoEvenements.script = opts.script; memoEvenements.ligne = opts.ligne || 0; }
    if (id === courant) {
      // Déjà là : la page se rouvre sur ce qui est demandé (après avoir appliqué ce qui était en cours).
      if (id === 'donnees' || id === 'evenements') { if (await appliquer()) reveiller(); }
      else if (id === 'accueil' || id === 'jeu') rendre();
      return true;
    }
    const avant = courant;
    courant = id; // avant d'appliquer : la page quittée ne doit pas se rouvrir
    if (!(await appliquer())) { courant = avant; return false; }
    reveiller();
    Menus.close();
    if (id === 'tuiles' || id === 'cartes') App.choisirMode(id === 'cartes' ? 'map' : 'tile');
    majBarre();
    if (estPage()) rendre();
    App.updateStatus(null);
    return true;
  }
  // Tab : Tuiles ↔ Cartes. Alt+1 à Alt+6 : les espaces dans l'ordre ; Ctrl+Tab : le suivant.
  // (Pas Ctrl+chiffre : sur un clavier AZERTY, Ctrl+6 est déjà Ctrl+-, le zoom arrière.)
  const numero = (n) => (LISTE[n - 1] ? aller(LISTE[n - 1].id) : false);
  function suivant(sens = 1) {
    if (!App.doc) return false;
    const i = LISTE.findIndex((e) => e.id === courant);
    return aller(LISTE[(i + sens + LISTE.length) % LISTE.length].id);
  }

  function rendre() {
    if (courant === 'accueil') return rendreAccueil();
    if (courant === 'jeu') return rendreJeu();
    if (courant === 'donnees' && !session) return boucleDonnees(App.doc);
    if (courant === 'evenements' && !session) return boucleEvenements(App.doc);
    return null;
  }

  // --- Les éditeurs en page ---
  // Applique ce qui est en cours dans la page. false si l'éditeur refuse (un événement sur une case prise).
  async function appliquer() {
    ScriptsTafl.appliquer(); // le texte tapé dans un script (Tafl 0.31)
    const p = Events.pageOuverte();
    if (!p) return true;
    const s = session;
    p.valider();
    if (Events.pageOuverte() === p) return false;
    await s;
    return true;
  }
  function reveiller() { reveil?.(); reveil = null; }
  // Le jeu a changé ailleurs (Loki, Ctrl+Z, un autre jeu ouvert) : la page se redessine.
  // Les changements pas encore appliqués sont perdus : appliquer() d'abord.
  function recharger() {
    if (!App.doc) return;
    if (courant === 'accueil' || courant === 'jeu') return rendre();
    if (ScriptsTafl.pageOuverte) { ScriptsTafl.rouvrir(); return null; }
    const p = Events.pageOuverte();
    if (p && !p.change()) p.jeter();
    else reveiller();
    return null;
  }
  // Un autre jeu s'ouvre : l'éditeur en page se ferme sans rien appliquer (déjà fait par confirmDiscard).
  function fermerPage() {
    ScriptsTafl.rouvrir();
    Events.pageOuverte()?.jeter();
    reveiller();
  }

  async function boucleDonnees(doc) {
    while (courant === 'donnees' && App.doc === doc) {
      const hote = $('#page-donnees');
      hote.replaceChildren();
      session = Events.editData(doc, memoDonnees.tab || 'personnages', { page: hote, memo: memoDonnees }).then((data) => {
        if (data) Doc.change(doc, 'Données du jeu', () => { doc.data = data; });
        App.refresh();
      });
      const ouvert = Boolean(Events.pageOuverte());
      await session;
      session = null;
      if (!ouvert) break;
    }
  }

  // --- Événements ---
  function evenementChoisi(doc) {
    let map = doc.maps.find((m) => m.id === memoEvenements.carte);
    let ev = map?.events.find((o) => o.id === memoEvenements.id);
    if (!ev && !memoEvenements.id) {
      // Rien de choisi : le premier événement de la carte affichée.
      map = doc.map;
      ev = map.events[0];
      if (ev) Object.assign(memoEvenements, { carte: map.id, id: ev.id });
    }
    return ev ? { map, ev } : { map: null, ev: null };
  }
  async function boucleEvenements(doc) {
    while (courant === 'evenements' && App.doc === doc) {
      const page = $('#page-evenements');
      if (!page.firstChild) page.append(el('aside', { id: 'ev-liste', className: 'page-panel' }), el('div', { id: 'ev-editeur' }));
      // Un script JS choisi (Tafl 0.31) : l'éditeur de code à la place de celui de l'événement.
      if (memoEvenements.script && !doc.scripts.some((x) => x.nom === memoEvenements.script)) memoEvenements.script = '';
      rendreListeEvenements(doc);
      if (memoEvenements.script) {
        session = new Promise((fini) => {
          // La ligne demandée (vérificateur) ne sert qu'une fois : quand l'éditeur l'a vraiment montrée.
          const p = ScriptsTafl.page($('#ev-editeur'), doc, memoEvenements.script, { ligne: memoEvenements.ligne, ligneVue: () => { memoEvenements.ligne = 0; }, fini: (suivant) => { if (suivant !== undefined) memoEvenements.script = suivant; fini(); } });
          if (!p) fini();
          reveil = () => ScriptsTafl.quitterPage();
        });
        await session;
        session = null;
        continue;
      }
      const { map, ev } = evenementChoisi(doc);
      const hote = $('#ev-editeur');
      hote.replaceChildren();
      if (!ev) {
        hote.append(el('div', { className: 'page-vide' }, [
          icon('comment-discussion'),
          el('strong', { textContent: doc.maps.some((m) => m.events.length) ? 'Choisis un événement à gauche.' : 'Aucun événement pour l\'instant.' }),
          el('span', { textContent: 'Un événement se pose sur une case de la carte : un personnage, un panneau, un coffre, un obstacle… (espace Cartes, outil Événement, N).' }),
          bouton('Poser un événement sur la carte', 'add', nouvelEvenement, true),
        ]));
        session = new Promise((r) => { reveil = r; });
        await session;
        session = null;
        continue;
      }
      const i = doc.maps.indexOf(map);
      if (i !== doc.mapIndex) App.selectMap(i);
      session = Events.editEvent(doc, ev, { page: hote }).then((r) => {
        if (r === 'supprimer') memoEvenements.id = '';
        App.applyEvent(map, r, ev);
        App.refresh();
      });
      const ouvert = Boolean(Events.pageOuverte());
      await session;
      session = null;
      if (!ouvert) break;
    }
  }
  const replies = new Set();
  // Les scripts JS viennent d'être relus (une erreur de plus ou de moins) : la liste se met à jour.
  ScriptsTafl.ecouter(() => { if (courant === 'evenements' && App.doc) rendreListeEvenements(App.doc); });
  function rendreListeEvenements(doc) {
    const box = $('#ev-liste');
    if (!box) return;
    const total = doc.maps.reduce((n, m) => n + m.events.length, 0);
    const cherche = el('input', { type: 'search', className: 'page-search', placeholder: `Chercher (${total})`, value: memoEvenements.filtre, spellcheck: false });
    const rows = el('div', { className: 'rows' });
    const lignes = () => {
      const q = Doc.slug(memoEvenements.filtre, '');
      rows.replaceChildren();
      for (const m of doc.maps) {
        const evs = m.events.filter((e) => !q || Doc.slug(`${e.nom} ${e.id} ${e.type} ${Events.perso(doc, e.apparence?.personnage)?.nom || ''}`, '').includes(q));
        if (!evs.length && (q || !m.events.length)) continue;
        const plie = replies.has(m.id) && !q;
        const tete = el('button', { className: `page-group${plie ? ' folded' : ''}` }, [icon('chevron-down'), el('span', { textContent: m.name }), el('span', { className: 'panel-count', textContent: String(m.events.length) })]);
        tete.onclick = () => { if (replies.has(m.id)) replies.delete(m.id); else replies.add(m.id); lignes(); };
        rows.append(tete);
        if (plie) continue;
        for (const e of evs) {
          const actif = !memoEvenements.script && m.id === memoEvenements.carte && e.id === memoEvenements.id;
          const row = el('button', { className: `row${actif ? ' active' : ''}`, title: Events.decrire(doc, e) }, [
            icon(Events.TYPE_ICONS[e.type] || 'circle'),
            el('span', { className: 'row-name', textContent: e.nom || e.id }),
            el('span', { className: 'badge', textContent: `${e.x}, ${e.y}` }),
          ]);
          row.onclick = () => choisirEvenement(m.id, e.id);
          rows.append(row);
        }
      }
      if (!rows.childElementCount) rows.append(el('p', { className: 'modal-info', textContent: q ? 'Rien ne correspond.' : 'Aucun événement.' }));
    };
    cherche.oninput = () => { memoEvenements.filtre = cherche.value; lignes(); };
    const ajouter = el('button', { className: 'icon-button', title: 'Poser un nouvel événement sur la carte (espace Cartes, outil Événement)' }, [icon('add')]);
    ajouter.onclick = nouvelEvenement;
    const focus = document.activeElement?.classList?.contains('page-search');
    box.replaceChildren(
      el('div', { className: 'panel-header' }, [el('span', { className: 'panel-title', textContent: 'Événements' }), el('span', { className: 'panel-count', textContent: String(total) }), el('div', { className: 'panel-actions' }, [ajouter])]),
      el('div', { className: 'page-search-row' }, [cherche]),
      rows,
      ScriptsTafl.ligneListe(doc, memoEvenements.script, choisirScript, async (e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const nom = await ScriptsTafl.nouveau(doc, r.left, r.bottom + 4);
        if (nom) choisirScript(nom);
      }),
    );
    lignes();
    if (focus) { cherche.focus(); cherche.setSelectionRange(cherche.value.length, cherche.value.length); }
    rows.querySelector('.row.active')?.scrollIntoView({ block: 'nearest' });
  }
  async function choisirEvenement(carte, id) {
    const avant = { ...memoEvenements };
    Object.assign(memoEvenements, { carte, id, script: '' });
    if (await appliquer()) reveiller();
    else Object.assign(memoEvenements, avant);
  }
  async function choisirScript(nom) {
    const avant = { ...memoEvenements };
    memoEvenements.script = nom;
    memoEvenements.ligne = 0;
    if (courant !== 'evenements') { await aller('evenements'); return; }
    if (await appliquer()) reveiller();
    else Object.assign(memoEvenements, avant);
  }
  async function nouvelEvenement() {
    if (!(await aller('cartes'))) return;
    App.setTool('event');
    notify('Clique une case de la carte pour y poser le nouvel événement.', 'info', 4000);
  }

  // --- Petits morceaux des pages Accueil et Jeu ---
  function bouton(label, ic, run, primary = false, title = '') {
    const b = el('button', { className: `button${primary ? ' primary' : ''}`, title }, [ic ? icon(ic) : null, label]);
    b.onclick = () => App.run(run);
    return b;
  }
  const panneau = (titre, extra, corps, className = '') => el('section', { className: `page-panel ${className}` }, [
    el('div', { className: 'panel-header' }, [el('span', { className: 'panel-title', textContent: titre }), ...[].concat(extra || [])]),
    corps,
  ]);
  const packDe = (doc) => doc.data?.reglages?.regles || 'pokemon';
  const nomPack = (doc) => {
    const p = (typeof Donnees !== 'undefined' ? Donnees.REGLES : []).find(([k]) => k === packDe(doc));
    return p ? p[1].split(' :')[0] : packDe(doc);
  };
  // Les listes de données du pack du jeu (comme la page Données).
  // Tafl 1.3 : et ceux d'un module seulement si le jeu l'active (Réglages › Règles du jeu › Modules).
  const ongletsDuPack = (doc) => [...Events.ONGLETS, ...(typeof Donnees !== 'undefined' ? Donnees.ONGLETS : [])].filter((d) => (!d.packs || d.packs.includes(packDe(doc))) && (!d.modules || d.modules.some((m) => (doc.data?.reglages?.modules || []).includes(m))));
  const libelle = (doc, d) => d.labels?.[packDe(doc)] || d.label;

  const verification = (doc) => Verificateur.verifier(OutilsJeu.jeuDe(doc));
  function lignesVerif(doc, r, max = Infinity) {
    const box = el('div', { className: 'verif-liste' });
    if (!r.problemes.length) {
      box.append(el('div', { className: 'verif-vide petit' }, [icon('pass-filled'), el('strong', { textContent: 'Aucun problème trouvé.' }), el('span', { textContent: 'Les téléporteurs, les accès, les quêtes et les ids sont en ordre.' })]));
      return box;
    }
    const tri = [...r.problemes].sort((a, b) => (a.gravite === b.gravite ? 0 : a.gravite === 'erreur' ? -1 : 1));
    for (const p of tri.slice(0, max)) {
      const carte = p.carte && doc.maps.find((m) => m.id === p.carte);
      const lieu = carte ? `${carte.name}${Number.isInteger(p.x) ? ` (${p.x}, ${p.y})` : ''}` : Verificateur.CATEGORIES[p.categorie] || '';
      const ligne = el('button', { className: `verif-ligne ${p.gravite}`, title: carte ? 'Voir sur la carte' : '' }, [
        icon(p.gravite === 'erreur' ? 'error' : 'warning'),
        el('span', { className: 'verif-message', textContent: p.message }),
        lieu ? el('span', { className: 'verif-lieu' }, [carte ? icon('location') : null, lieu]) : null,
      ]);
      ligne.disabled = !carte && !p.script;
      ligne.onclick = () => OutilsJeu.allerA(p);
      box.append(ligne);
    }
    if (tri.length > max) box.append(el('p', { className: 'modal-info', textContent: `… et ${tri.length - max} autre(s), dans l'espace Jeu.` }));
    return box;
  }
  const pastilles = (r) => [
    r.erreurs ? el('span', { className: 'pill erreur', textContent: `${r.erreurs} erreur${r.erreurs > 1 ? 's' : ''}` }) : null,
    r.attentions ? el('span', { className: 'pill attention', textContent: `${r.attentions} à vérifier` }) : null,
    !r.problemes.length ? el('span', { className: 'pill ok', textContent: 'en ordre' }) : null,
  ];

  // --- Accueil ---
  async function rendreAccueil() {
    const doc = App.doc;
    $('#welcome').hidden = Boolean(doc);
    const box = $('#accueil-projet');
    box.hidden = !doc;
    if (!doc) { App.renderWelcome(); return; }
    const evenements = doc.maps.reduce((n, m) => n + m.events.length, 0);
    const principal = ongletsDuPack(doc).find((d) => ['creatures', 'monstres'].includes(d.key));
    const stats = [
      [doc.maps.length, 'carte(s)'], [evenements, 'événement(s)'], [doc.tiles.length, 'tuile(s)'],
      ...(doc.game ? [[doc.data.quetes.length, 'quête(s)'], ...(principal ? [[doc.data[principal.key]?.length || 0, libelle(doc, principal).toLowerCase()]] : [])] : []),
    ];
    const vignette = el('canvas', { className: 'accueil-vignette', width: doc.tileSize, height: doc.tileSize });
    const t0 = doc.tiles.find((t) => t.frames[0]) || doc.tiles[0];
    if (t0) vignette.getContext('2d').drawImage(Doc.tileCanvas(t0, doc.tileSize), 0, 0);
    const hero = el('section', { className: 'page-panel accueil-hero' }, [
      vignette,
      el('div', { className: 'accueil-titre' }, [
        el('h1', { textContent: doc.name }),
        el('p', {}, [
          doc.game ? el('span', { className: 'pack-badge', title: 'Le pack de règles du jeu : il décide des combats et des données (Données › Réglages)', textContent: `Pack ${nomPack(doc)}` }) : el('span', { className: 'pack-badge', textContent: 'Jeu de tuiles' }),
          ` · tuiles ${doc.tileSize} × ${doc.tileSize}${doc.game?.folder ? ` · ${doc.game.folder}` : doc.path ? ` · ${doc.path}` : ' · pas encore enregistré'}${doc.dirty ? ' · modifié' : ''}`,
        ]),
      ]),
      el('div', { className: 'accueil-stats' }, stats.map(([n, l]) => el('div', { className: 'stat' }, [el('b', { textContent: String(n) }), el('span', { textContent: l })]))),
      el('div', { className: 'accueil-boutons' }, [
        bouton(`Reprendre : ${doc.map.name}`, 'map', () => aller('cartes'), false, 'Ouvrir la carte affichée en dernier (espace Cartes)'),
        doc.game ? bouton('Jouer', 'play', () => App.jouer(false), true, 'Jouer dans Saga, depuis le départ (F5)') : bouton('En faire un jeu', 'game', () => IO.saveAsGame(doc), true, 'Enregistrer comme dossier de jeu : plusieurs cartes, des événements, jouable dans Saga'),
      ]),
    ]);

    // La carte du monde : un clic ouvre la carte cliquée.
    const monde = el('div', { className: 'accueil-monde' });
    const panMonde = panneau('Carte du monde', [el('span', { className: 'panel-sub', textContent: 'clic : ouvrir la carte' }), el('div', { className: 'panel-actions' }, [petit('globe', 'Ouvrir la carte monde : placer les villes et les routes (Ctrl+Maj+M)', () => App.openWorld())])], monde, 'accueil-monde-panel');
    try {
      const pos = Monde.positions(doc);
      const d = Monde.dessin(doc, pos);
      if (d) {
        const s = doc.tileSize;
        d.canvas.className = 'accueil-monde-image';
        const g = d.canvas.getContext('2d');
        // Les noms des cartes, lisibles même réduits.
        const k = Math.max(1, Math.round(Math.max(d.canvas.width, d.canvas.height) / 700));
        g.font = `600 ${11 * k}px "Segoe UI", system-ui, sans-serif`;
        for (const m of doc.maps.filter((x) => pos.has(x.id))) {
          const p = pos.get(m.id);
          const x = (p.x - d.x0) * s, y = (p.y - d.y0) * s;
          g.strokeStyle = m === doc.map ? 'rgba(123, 216, 143, 0.95)' : 'rgba(255, 255, 255, 0.35)';
          g.lineWidth = (m === doc.map ? 3 : 1.5) * k;
          g.strokeRect(x, y, m.width * s, m.height * s);
          const w = g.measureText(m.name).width;
          g.fillStyle = 'rgba(0, 0, 0, 0.65)';
          g.fillRect(x + 4 * k, y + 4 * k, w + 10 * k, 17 * k);
          g.fillStyle = '#fff';
          g.fillText(m.name, x + 9 * k, y + 16.5 * k);
        }
        d.canvas.onclick = (e) => {
          const r = d.canvas.getBoundingClientRect();
          const tx = (e.clientX - r.left) / r.width * d.canvas.width / s + d.x0;
          const ty = (e.clientY - r.top) / r.height * d.canvas.height / s + d.y0;
          const m = doc.maps.find((x) => { const p = pos.get(x.id); return p && tx >= p.x && ty >= p.y && tx < p.x + x.width && ty < p.y + x.height; });
          if (!m) return;
          App.selectMap(doc.maps.indexOf(m));
          aller('cartes');
        };
        monde.append(d.canvas);
      }
    } catch (err) { console.error(err); }
    if (!monde.firstChild) monde.append(el('p', { className: 'modal-info', textContent: 'Les cartes extérieures apparaîtront ici, placées selon leurs téléporteurs.' }));

    const colonnes = [panMonde];
    // Le vérificateur (les jeux seulement).
    const milieu = el('div', { className: 'accueil-colonne' });
    if (doc.game) {
      const r = verification(doc);
      milieu.append(panneau('Vérificateur', [...pastilles(r), el('div', { className: 'panel-actions' }, [petit('refresh', 'Vérifier à nouveau', () => rendreAccueil()), petit('list-flat', 'Tout voir (espace Jeu)', () => aller('jeu'))])], lignesVerif(doc, r, 7), 'grandit'));
    }
    const raccourcis = el('div', { className: 'raccourcis' });
    const rac = (ic, titre, sous, run, ok = true) => {
      if (!ok) return;
      const b = el('button', { className: 'raccourci' }, [el('strong', {}, [icon(ic), titre]), el('span', { textContent: sous })]);
      b.onclick = () => App.run(run);
      raccourcis.append(b);
    };
    rac('beaker', 'Test rapide', 'Ctrl+F5 · équipe, objets et badges choisis', () => App.testRapide(), Boolean(doc.game));
    rac('export', 'Exporter le jeu', 'version web et Windows (.exe)', () => App.exporterJeu(), Boolean(doc.game));
    rac('database', 'Données du jeu', 'Alt+5 · personnages, quêtes, et celles du pack', () => aller('donnees'), Boolean(doc.game));
    rac('sparkle', 'Générer des tuiles', 'ComfyUI · Ctrl+Maj+G', () => Comfy.fenetre());
    rac('file-media', 'Importer une planche', 'PNG à découper · Ctrl+I', () => IO.importDialog());
    rac('globe', 'Carte monde', 'placer les villes et les routes · Ctrl+Maj+M', () => App.openWorld());
    milieu.append(panneau('Raccourcis', null, raccourcis));
    colonnes.push(milieu);

    // Récents et dernières modifications.
    const droite = el('div', { className: 'accueil-colonne' });
    const recents = el('div', { className: 'rows' });
    droite.append(panneau('Jeux récents', [el('div', { className: 'panel-actions' }, [petit('add', 'Nouveau jeu (Ctrl+Maj+J)', () => App.newDocument(true)), petit('folder-opened', 'Ouvrir (Ctrl+O)', () => IO.open())])], recents, 'grandit'));
    const histoire = el('div', { className: 'rows' });
    const faits = doc.undo.slice(-6).reverse();
    for (const u of faits) histoire.append(el('div', { className: 'row statique' }, [icon('history'), el('span', { className: 'row-name', textContent: u.label })]));
    if (!faits.length) histoire.append(el('p', { className: 'modal-info', textContent: 'Rien de modifié depuis l\'ouverture.' }));
    droite.append(panneau('Dernières modifications', [el('div', { className: 'panel-actions' }, [petit('history', 'Historique : revenir à une étape (Ctrl+H)', () => $('#btn-history').click())])], histoire));
    colonnes.push(droite);
    box.replaceChildren(hero, el('div', { className: 'accueil-grille' }, colonnes));

    const liste = await window.tafl.recentFiles();
    if (App.doc !== doc || courant !== 'accueil') return;
    for (const f of liste.slice(0, 8)) {
      const parts = f.split(/[\\/]/);
      const game = /^jeu\.json$/i.test(parts[parts.length - 1]);
      const name = game ? parts[parts.length - 2] || 'jeu' : parts[parts.length - 1];
      const actuel = (doc.game?.folder && f.startsWith(doc.game.folder)) || f === doc.path;
      const b = el('button', { className: `row${actuel ? ' active' : ''}`, title: f }, [icon(game ? 'game' : 'symbol-color'), el('span', { className: 'row-name', textContent: name }), el('span', { className: 'badge', textContent: actuel ? 'ouvert' : game ? 'jeu' : 'tuiles' })]);
      if (!actuel) b.onclick = () => App.run(() => IO.openPath(f));
      recents.append(b);
    }
    if (!liste.length) recents.append(el('p', { className: 'modal-info', textContent: 'Aucun pour l\'instant.' }));
  }
  function petit(ic, title, run) {
    const b = el('button', { className: 'icon-button', title }, [icon(ic)]);
    b.onclick = (e) => { e.stopPropagation(); App.run(run); };
    return b;
  }

  // --- Jeu ---
  function rendreJeu() {
    const doc = App.doc;
    const box = $('#page-jeu');
    if (!doc) return;
    const cartes = el('div', { className: 'jeu-cartes' });
    const carte = (ic, titre, texte, ...boutons) => cartes.append(el('div', { className: 'jeu-carte' }, [el('h3', {}, [icon(ic), titre]), el('p', { textContent: texte }), el('div', { className: 'jeu-boutons' }, boutons.filter(Boolean))]));
    if (!doc.game) {
      carte('game', 'Ce n\'est pas encore un jeu', 'C\'est un jeu de tuiles (.tafl). Enregistre-le comme dossier de jeu pour avoir plusieurs cartes, des événements, des données, et y jouer dans Saga.', bouton('Enregistrer comme dossier de jeu…', 'save', () => IO.saveAsGame(doc), true));
    } else {
      carte('play', 'Jouer', 'Lance le jeu dans Saga, depuis le départ du joueur. Maj+F5 sur une carte : depuis la case sous la souris.', bouton('Jouer', 'play', () => App.jouer(false), true, 'F5'));
      carte('beaker', 'Test rapide', 'Choisis l\'équipe, le niveau, les objets, les badges et l\'endroit, puis lance une partie de test.', bouton('Préparer un test…', 'beaker', () => App.testRapide(), false, 'Ctrl+F5'));
      carte('export', 'Exporter le jeu', 'Une version web (index.html) et une version Windows (.exe) dans un zip, prêtes à partager.', bouton('Exporter…', 'export', () => App.exporterJeu()));
      carte('law', `Pack de règles : ${nomPack(doc)}`, 'Il décide des combats, des statistiques et des données du jeu. Il se change dans Données › Réglages, avec l\'interface de Saga, le jour et la nuit, les sons…', bouton('Réglages du jeu…', 'settings-gear', () => aller('donnees', { tab: 'reglages' })));
      carte('globe', 'Carte monde', 'Les villes et les routes ensemble, placées selon leurs téléporteurs.', bouton('Ouvrir la carte monde…', 'globe', () => App.openWorld(), false, 'Ctrl+Maj+M'));
      carte('edit', 'Titre et dossier', `« ${doc.name} »${doc.game.folder ? ` · ${doc.game.folder}` : ' · pas encore enregistré'}`, bouton('Renommer…', 'edit', () => App.renameGame()), doc.game.folder ? bouton('Afficher le dossier', 'folder-opened', () => window.tafl.revealFile(doc.path)) : null);
    }
    const colonnes = [panneau('Tester et publier', null, cartes, 'jeu-gauche')];
    if (doc.game) {
      const r = verification(doc);
      colonnes.push(panneau('Vérificateur', [...pastilles(r), el('div', { className: 'panel-actions' }, [petit('refresh', 'Vérifier à nouveau (Ctrl+Maj+V)', () => rendreJeu())])], lignesVerif(doc, r), 'jeu-droite'));
    }
    box.replaceChildren(el('div', { className: 'jeu-grille' }, colonnes));
  }

  return {
    aide: () => LISTE.find((e) => e.id === courant)?.aide || '',
    LISTE, aller, numero, suivant, choisirScript, majBarre, appliquer, recharger, fermerPage, estPage, rendre, ongletsDuPack, libelle, nomPack, packDe,
    get courant() { return courant; },
  };
})();
