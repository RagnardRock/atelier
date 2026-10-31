// Les événements des cartes et les données du jeu (Tafl 0.7).
//
// Un événement est ce qui vit sur une case de la carte : un personnage à qui parler, un panneau, un
// coffre, un objet au sol, ou une case invisible qui déclenche une scène quand le joueur marche dessus.
// Ce qu'il fait est écrit dans ses « pages » : chaque page a des conditions et une liste de commandes
// (son script : dialogues, choix, objets donnés, combats, quêtes…). Le moteur du jeu joue la DERNIÈRE
// page dont toutes les conditions sont vraies, comme dans RPG Maker : un coffre a une page « fermé »,
// puis une page « déjà ouvert » qui prend le relais.
//
// Un événement est un objet tout simple, avec les mêmes clés que dans les fichiers des cartes
// (voir ../FORMAT.md, « Événements ») :
//   { id, nom, type, x, y, apparence: { personnage, tuile }, direction, deplacement, traversable,
//     declenchement, pages: [{ conditions: [...], cache, commandes: [...] }] }
// Un obstacle (Tafl 0.24, type « obstacle ») a en plus obstacle: { sorte, objet, message, repousse } :
// l'objet qui remplace une CS (couper un arbre, briser ou pousser un rocher), joué par Saga 0.7.
// Comme les zones, on ne le modifie jamais sur place : on remplace la liste (map.events = [...]).
//
// doc.data, les données du jeu, suit la même règle (on remplace doc.data en entier) :
//   { personnages: [{ id, nom, description, heros, couleur, tuile, portraits: [{ expression, png }], sprite, tenues: [{ id, nom, sprite }] }],
//     quetes: [{ id, titre, description, secondaire, suivante, personnages, etapes: [{ texte }] }],
//     interrupteurs: [{ id, nom, description }],
//     variables: [{ id, nom, description, defaut }] } (Tafl 0.31 : un nombre ou un texte, pour les scripts)
//
// Les deux grandes fenêtres (l'éditeur d'un événement, et Jeu › Données du jeu) travaillent sur une
// copie et la rendent d'un bloc quand on valide : App la remet dans le jeu avec Doc.change(), ce qui
// s'annule en un seul Ctrl+Z.

const Events = (() => {
  // --- Listes de choix ---
  const TYPES = [['pnj', 'Personnage'], ['panneau', 'Panneau'], ['coffre', 'Coffre'], ['objet', 'Objet au sol'], ['declencheur', 'Déclencheur (case invisible)'], ['obstacle', 'Obstacle (arbre, rocher : à la place des CS)']];
  const TYPE_ICONS = { pnj: 'person', panneau: 'note', coffre: 'package', objet: 'gift', declencheur: 'zap', obstacle: 'circle-slash' };
  // Les obstacles (Tafl 0.24) : ce que l'objet permet, et l'objet proposé d'office.
  const SORTES_OBSTACLE = [['couper', 'Arbre à couper (disparaît)'], ['briser', 'Rocher à briser (disparaît)'], ['pousser', 'Rocher à pousser (d\'une case)']];
  const OBJETS_OBSTACLE = { couper: 'hache', briser: 'marteau', pousser: 'gants-de-force' };
  const DEPLACEMENTS = [['fixe', 'Immobile'], ['regarde', 'Se tourne vers le joueur qui lui parle'], ['aleatoire', 'Marche au hasard'], ['tourne', 'Regarde autour de lui']];
  const DECLENCHEMENTS = [['parler', 'Le joueur lui parle (touche A)'], ['toucher', 'Le joueur marche dessus ou le touche'], ['auto', 'Tout seul, dès l\'arrivée sur la carte']];
  const EXPRESSIONS = ['normal', 'content', 'rire', 'triste', 'colere', 'surpris', 'inquiet', 'gene', 'determine'];
  const COMPTEURS = [['captures', 'Créatures capturées'], ['dresseurs_battus', 'Dresseurs battus'], ['sauvages_battus', 'Créatures sauvages battues'], ['evolutions', 'Évolutions vues'], ['especes_vues', 'Espèces vues (Pokédex)'], ['especes_prises', 'Espèces attrapées (Pokédex)'], ['quetes_finies', 'Quêtes finies'], ['badges', 'Badges'], ['pas', 'Pas du joueur'], ['monstres_vaincus', 'Monstres vaincus']];
  // Tafl 0.32.1 : les compteurs que le pack de règles du jeu fait vraiment monter (les autres restent à 0).
  const COMPTEURS_PACK = { captures: ['pokemon'], dresseurs_battus: ['pokemon'], sauvages_battus: ['pokemon'], evolutions: ['pokemon'], especes_vues: ['pokemon'], especes_prises: ['pokemon'], badges: ['pokemon'], monstres_vaincus: ['jrpg', 'jdr', 'action'] };
  const ETATS_QUETE = [['pas_commencee', 'Pas commencée'], ['en_cours', 'En cours'], ['finie', 'Finie']];
  const VRAI_FAUX = [['true', 'Allumé (vrai)'], ['false', 'Éteint (faux)']];
  // Tafl 0.31 : les variables (un nombre ou un texte) et la façon de les comparer.
  const ACTIONS_VARIABLE = [['regler', 'La mettre à'], ['ajouter', 'Lui ajouter'], ['retirer', 'Lui retirer']];
  const COMPARAISONS = [['>=', 'au moins (≥)'], ['<=', 'au plus (≤)'], ['==', 'égale à (=)'], ['!=', 'différente de (≠)'], ['>', 'plus que (>)'], ['<', 'moins que (<)']];
  // « 12 » → 12, « Bourg » → 'Bourg' (un texte court).
  const valeurVariable = (v) => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    const t = String(v ?? '').trim().slice(0, 200);
    return t !== '' && Number.isFinite(Number(t.replace(',', '.'))) ? Number(t.replace(',', '.')) : t;
  };

  // --- Petites aides ---
  const str = (v, d = '') => (v === undefined || v === null ? d : String(v));
  const int = (v, d = 0) => (Number.isFinite(Number(v)) && v !== '' && v !== null ? Math.round(Number(v)) : d);
  const pick = (v, list, d) => (list.some(([k]) => k === v) ? v : d);
  const vrai = (v) => v !== false && v !== 'false';
  const court = (t, n = 60) => {
    const s = String(t || '').replace(/\s+/g, ' ').trim();
    return s.length > n ? `${s.slice(0, n - 1)}…` : s;
  };
  const libelle = (list, k) => list.find(([x]) => x === k)?.[1] || k;
  // Identifiant tiré d'un nom (« Prof. Chêne » → prof-chene), unique dans la liste.
  function ident(nom, liste, fallback) {
    const base = Doc.slug(nom, fallback);
    const ids = new Set(liste.map((o) => o.id));
    if (!ids.has(base)) return base;
    let n = 2;
    while (ids.has(`${base}-${n}`)) n++;
    return `${base}-${n}`;
  }
  // ev-1, ev-2… : le premier libre.
  function nextId(prefix, list) {
    let n = list.length + 1;
    while (list.some((o) => o.id === `${prefix}-${n}`)) n++;
    return `${prefix}-${n}`;
  }

  // Le nom d'une donnée de Tafl 0.8 (créature, objet, dresseur, boutique), sinon son identifiant.
  const nomData = (doc, sorte, id) => (doc.data[sorte] || []).find((o) => o.id === id)?.nom || id;
  const perso = (doc, id) => doc.data.personnages.find((p) => p.id === id) || null;
  const quete = (doc, id) => doc.data.quetes.find((q) => q.id === id) || null;
  // Le portrait d'un personnage pour une expression (sinon « normal », sinon le premier).
  function portrait(doc, id, expression) {
    const p = perso(doc, id);
    if (!p || !p.portraits.length) return null;
    return p.portraits.find((x) => x.expression === expression) || p.portraits.find((x) => x.expression === 'normal') || p.portraits[0];
  }
  // « @evenement » : celui qui parle est le personnage de l'événement (pratique pour dupliquer un PNJ).
  const quiReel = (qui, ev) => (qui === '@evenement' ? ev?.apparence?.personnage || '' : qui);
  function nomQui(doc, qui, ev) {
    if (!qui) return 'Texte';
    const id = quiReel(qui, ev);
    return perso(doc, id)?.nom || (qui === '@evenement' ? ev?.nom || 'L\'événement' : qui);
  }
  const choixQui = (doc) => [['', 'Personne (texte seul : panneau, narration)'], ['@evenement', 'L\'événement lui-même (son personnage)'], ...doc.data.personnages.map((p) => [p.id, `${p.nom}${p.heros ? ' (le héros)' : ''}`])];
  const choixQuetes = (doc, actuelle) => {
    const list = doc.data.quetes.map((q) => [q.id, q.titre || q.id]);
    if (actuelle && !list.some(([k]) => k === actuelle)) list.unshift([actuelle, `${actuelle} (n'existe plus)`]);
    return list.length ? list : [['', 'Aucune quête : crée-la dans Jeu › Données du jeu']];
  };
  // Tafl 0.16 : les badges (Réglages), les tenues du héros, la monnaie.
  const badges = (doc) => doc.data.reglages?.badges || [];
  // Les badges servent au pack Pokémon (niveau maximum, dresseurs) ; un autre pack ne les montre que si le jeu en a déjà.
  // Tafl 1.9 (Saga 1.11) : les statistiques qu'un bonus du groupe peut toucher, selon le pack du jeu.
  const STATS_BONUS = {
    jrpg: [['force', 'Force'], ['magie', 'Magie'], ['defense', 'Défense'], ['esprit', 'Esprit'], ['agilite', 'Agilité'], ['chance', 'Chance']],
    pokemon: [['attaque', 'Attaque'], ['defense', 'Défense'], ['att_spe', 'Att. Spé.'], ['def_spe', 'Déf. Spé.'], ['vitesse', 'Vitesse']],
  };
  const statsBonus = (doc) => STATS_BONUS[doc?.data?.reglages?.regles || 'pokemon'] || [];
  const avecBadges = (doc) => (doc?.data?.reglages?.regles || 'pokemon') === 'pokemon' || badges(doc).length > 0;
  const compteursDu = (doc, garde = '') => COMPTEURS.filter(([k]) => k === garde || (k === 'badges' ? avecBadges(doc) : !COMPTEURS_PACK[k] || COMPTEURS_PACK[k].includes(doc?.data?.reglages?.regles || 'pokemon')));
  const nomBadge = (doc, id) => badges(doc).find((b) => b.id === id)?.nom || id || '…';
  const choixBadges = (doc, actuel) => {
    const list = badges(doc).map((b) => [b.id, b.nom]);
    if (actuel && !list.some(([k]) => k === actuel)) list.unshift([actuel, `${actuel} (n'existe plus)`]);
    return list.length ? list : [['', 'Aucun badge : crée-les dans Jeu › Données du jeu › Réglages']];
  };
  const tenues = (doc) => doc.data.personnages.find((p) => p.heros)?.tenues || [];
  const monnaie = (doc) => doc.data.reglages?.monnaie || 'Pokédollars';
  const choixTuiles = (doc) => [['-1', 'Aucune'], ...doc.tiles.map((t, i) => [String(i), `${i}. ${t.name}`])];

  // Les listes de commandes rangées dans une commande : [titre, liste, sorte] pour les réponses d'un
  // choix, l'alors et le sinon d'un « si », et (Tafl 0.32, pack JDR) le réussi et le raté d'un test.
  const A_BRANCHES = ['test', 'sauvegarde', 'test_oppose'];
  function branches(c) {
    if (c?.type === 'choix') return (c.options || []).map((o) => [`Si le joueur répond « ${o.texte} »`, o.commandes || [], 'reponse']);
    if (c?.type === 'si') return [['Alors', c.alors || [], 'alors'], ['Sinon', c.sinon || [], 'sinon']];
    if (A_BRANCHES.includes(c?.type)) return [['Si c\'est réussi', c.reussi || [], 'alors'], ['Si c\'est raté', c.rate || [], 'sinon']];
    return [];
  }
  // Parcourt toutes les commandes d'une liste, y compris celles rangées dans un choix, un « si » ou un test.
  function parcourir(liste, fn) {
    for (const c of liste || []) {
      fn(c);
      for (const [, l] of branches(c)) parcourir(l, fn);
    }
  }
  function parcourirJeu(doc, fn) {
    for (const map of doc.maps) {
      for (const ev of map.events) {
        ev.pages.forEach((p, k) => {
          for (const c of p.conditions) fn({ condition: c, ev, map, page: k });
          parcourir(p.commandes, (c) => { fn({ commande: c, ev, map, page: k }); if (c.type === 'si') fn({ condition: c.condition, ev, map, page: k }); });
        });
      }
    }
  }
  // Où une donnée (personnage, quête, interrupteur) est utilisée : [« Bourg › Maman (page 1) », …].
  function utilisations(doc, kind, id) {
    const out = new Set();
    const at = ({ ev, map, page }) => out.add(`${map.name} › ${ev.nom || ev.id}${ev.pages.length > 1 ? ` (page ${page + 1})` : ''}`);
    for (const map of doc.maps) for (const ev of map.events) if (kind === 'personnage' && ev.apparence.personnage === id) out.add(`${map.name} › ${ev.nom || ev.id} (apparence)`);
    parcourirJeu(doc, (u) => {
      const c = u.commande || u.condition;
      if (kind === 'personnage' && u.commande?.type === 'dire' && quiReel(c.qui, u.ev) === id) at(u);
      if (kind === 'personnage' && (c.type === 'groupe' || c.type === 'membre') && c.personnage === id) at(u);
      if (kind === 'quete' && c.type === 'quete' && c.quete === id) at(u);
      if (kind === 'interrupteur' && c.type === 'interrupteur' && c.id === id) at(u);
      if (kind === 'variable' && c.type === 'variable' && c.id === id) at(u);
    });
    if (kind === 'quete') for (const q of doc.data.quetes) if (q.suivante === id) out.add(`Quête « ${q.titre} » (suite)`);
    return [...out];
  }
  // Les identifiants d'objets déjà utilisés (proposés quand on en tape un).
  function objetsUtilises(doc) {
    const out = new Set(doc.data.objets?.length ? [] : ['potion', 'super-potion', 'poke-ball', 'planche-de-surf', 'velo', 'canne-a-peche']);
    for (const m of doc.maps) for (const z of m.zones) if (z.objet) out.add(z.objet);
    for (const m of doc.maps) for (const ev of m.events || []) if (ev.obstacle?.objet) out.add(ev.obstacle.objet);
    parcourirJeu(doc, (u) => { const c = u.commande || u.condition; if (c.type === 'objet' && c.objet) out.add(c.objet); });
    return out;
  }
  // Les listes proposées sous les champs de texte (expressions, interrupteurs, objets).
  function listes(doc) {
    const set = (id, values) => {
      let dl = document.getElementById(id);
      if (!dl) { dl = el('datalist', { id }); document.body.append(dl); }
      dl.replaceChildren(...[...new Set(values)].filter(Boolean).map((v) => el('option', { value: v })));
    };
    set('tafl-expressions', [...EXPRESSIONS, ...doc.data.personnages.flatMap((p) => p.portraits.map((x) => x.expression))]);
    set('tafl-interrupteurs', doc.data.interrupteurs.map((i) => i.id));
    set('tafl-variables', (doc.data.variables || []).map((v) => v.id));
    set('tafl-objets', [...(doc.data.objets || []).map((o) => o.id), ...objetsUtilises(doc)]);
    if (typeof Donnees !== 'undefined' && doc.data.creatures) Donnees.listes(doc.data);
  }

  // --- Les commandes d'un script ---
  // Pour chaque type : son nom, son icône, son groupe (dans le menu « Ajouter une commande »), la
  // commande neuve, les champs de sa fenêtre (Dialogs.form), comment la refaire depuis la fenêtre, et
  // une phrase qui la résume dans la liste. Une commande sans champs s'ajoute directement.
  let sonOuvert = null; // le choix de son de la fenêtre « musique » ou « son » ouverte (Tafl 0.29)
  const COMMANDES = {
    dire: {
      nom: 'Dialogue', icone: 'comment', groupe: 'Dialogue', largeur: 520,
      nouveau: () => ({ type: 'dire', qui: '@evenement', expression: 'normal', texte: '' }),
      champs: (doc, c) => [
        { key: 'qui', label: 'Qui parle', type: 'select', value: c.qui, choices: choixQui(doc) },
        { key: 'expression', label: 'Expression', type: 'text', value: c.expression, list: 'tafl-expressions', placeholder: 'normal' },
        { key: 'texte', label: 'Texte', type: 'textarea', rows: 5, value: c.texte, placeholder: 'Bonjour {joueur} ! Belle journée pour partir à l\'aventure.' },
        { type: 'element', element: el('div', { className: 'dialogue-apercu' }) },
        { type: 'info', text: '{joueur} est remplacé par le nom du joueur. Une ligne vide coupe le texte en plusieurs boîtes de dialogue. Le portrait vient de Jeu › Données du jeu › Personnages.' },
      ],
      onInput: (v, f, doc, ev) => apercuDialogue(f.card.querySelector('.dialogue-apercu'), doc, { qui: v.qui, expression: v.expression || 'normal', texte: v.texte }, ev),
      depuis: (v) => ({ type: 'dire', qui: v.qui, expression: v.expression.trim() || 'normal', texte: v.texte.trim() }),
      valide: (c) => (c.texte ? null : 'Le dialogue n\'a pas de texte.'),
      resume: (doc, c, ev) => `${nomQui(doc, c.qui, ev)}${c.qui && c.expression && c.expression !== 'normal' ? ` (${c.expression})` : ''} : « ${court(c.texte)} »`,
    },
    choix: {
      nom: 'Choix (question au joueur)', icone: 'question', groupe: 'Dialogue',
      nouveau: () => ({ type: 'choix', options: [{ texte: 'Oui', commandes: [] }, { texte: 'Non', commandes: [] }] }),
      champs: (doc, c) => [
        { key: 'options', label: 'Réponses', type: 'textarea', rows: 4, value: c.options.map((o) => o.texte).join('\n') },
        { type: 'info', text: 'Une réponse par ligne, de 2 à 4. Chaque réponse a ensuite ses propres commandes dans le script. Pose la question juste avant, avec un dialogue.' },
      ],
      depuis: (v, c) => ({ type: 'choix', options: v.options.split('\n').map((t) => t.trim()).filter(Boolean).slice(0, 4).map((texte, i) => ({ texte, commandes: c.options[i]?.commandes || [] })) }),
      valide: (c) => (c.options.length >= 2 ? null : 'Il faut au moins deux réponses.'),
      resume: (doc, c) => `Choix : ${c.options.map((o) => `« ${o.texte} »`).join(' / ')}`,
    },
    commentaire: {
      nom: 'Note (ignorée par le jeu)', icone: 'edit', groupe: 'Dialogue',
      nouveau: () => ({ type: 'commentaire', texte: '' }),
      champs: (doc, c) => [{ key: 'texte', label: 'Note', type: 'textarea', rows: 3, value: c.texte }],
      depuis: (v) => ({ type: 'commentaire', texte: v.texte.trim() }),
      resume: (doc, c) => `// ${court(c.texte) || '…'}`,
    },
    si: {
      nom: 'Si… sinon (condition)', icone: 'git-compare', groupe: 'Logique',
      resume: (doc, c) => `Si ${resumeCondition(doc, c.condition)}`,
    },
    interrupteur: {
      nom: 'Interrupteur du jeu', icone: 'symbol-boolean', groupe: 'Logique',
      nouveau: () => ({ type: 'interrupteur', id: '', valeur: true }),
      champs: (doc, c) => [
        { key: 'id', label: 'Interrupteur', type: 'text', value: c.id, list: 'tafl-interrupteurs', placeholder: 'a-recu-son-starter' },
        { key: 'valeur', label: 'Le mettre', type: 'select', value: String(c.valeur), choices: VRAI_FAUX },
        { type: 'info', text: 'Un interrupteur retient un fait de l\'histoire (« le rival est battu », « le pont est réparé ») pour tout le jeu. Un nom qui n\'existe pas encore crée l\'interrupteur.' },
      ],
      depuis: (v) => ({ type: 'interrupteur', id: Doc.slug(v.id, ''), valeur: v.valeur === 'true' }),
      valide: (c) => (c.id ? null : 'Donne un nom à l\'interrupteur.'),
      resume: (doc, c) => `Interrupteur « ${nomInterrupteur(doc, c.id)} » ${c.valeur ? 'allumé' : 'éteint'}`,
    },
    local: {
      nom: 'Interrupteur « déjà fait » de l\'événement', icone: 'pass', groupe: 'Logique',
      nouveau: () => ({ type: 'local', valeur: true }),
      champs: (doc, c) => [
        { key: 'valeur', label: 'Le mettre', type: 'select', value: String(c.valeur), choices: VRAI_FAUX },
        { type: 'info', text: 'Chaque événement a son propre interrupteur « déjà fait » : le coffre est ouvert, l\'objet ramassé, le dresseur battu. Une page avec la condition « déjà fait » prend alors le relais.' },
      ],
      depuis: (v) => ({ type: 'local', valeur: v.valeur === 'true' }),
      resume: (doc, c) => (c.valeur ? 'Marquer comme déjà fait' : 'Marquer comme pas encore fait'),
    },
    // Tafl 0.31 (Saga 0.12) : une variable, un nombre (pièces trouvées, réputation) ou un texte.
    variable: {
      nom: 'Variable (un nombre ou un texte)', icone: 'symbol-variable', groupe: 'Logique',
      nouveau: () => ({ type: 'variable', id: '', action: 'ajouter', valeur: 1 }),
      champs: (doc, c) => [
        { key: 'id', label: 'Variable', type: 'text', value: c.id, list: 'tafl-variables', placeholder: 'pieces-trouvees' },
        { key: 'action', label: 'Action', type: 'select', value: c.action, choices: ACTIONS_VARIABLE },
        { key: 'valeur', label: 'Valeur', type: 'text', value: String(c.valeur ?? 0), placeholder: '1' },
        { type: 'info', text: 'Une variable retient un nombre (pièces trouvées, réputation, nombre de victoires) ou un texte, pour tout le jeu. Elle vaut sa valeur de départ (Données › Variables), sinon 0. Les pages et les « si » la testent (condition « Une variable »), les scripts JS la lisent avec saga.variable().' },
      ],
      depuis: (v) => {
        const action = pick(v.action, ACTIONS_VARIABLE, 'regler');
        return { type: 'variable', id: Doc.slug(v.id, ''), action, valeur: action === 'regler' ? valeurVariable(v.valeur) : Number(String(v.valeur).replace(',', '.')) || 0 };
      },
      valide: (c) => (c.id ? null : 'Donne un nom à la variable.'),
      resume: (doc, c) => (c.action === 'regler' ? `Variable « ${nomVariable(doc, c.id)} » = ${typeof c.valeur === 'string' ? `« ${c.valeur} »` : c.valeur}`
        : `Variable « ${nomVariable(doc, c.id)} » ${c.action === 'retirer' ? '−' : '+'} ${c.valeur}`),
    },
    attendre: {
      nom: 'Attendre', icone: 'watch', groupe: 'Logique',
      nouveau: () => ({ type: 'attendre', ms: 500 }),
      champs: (doc, c) => [{ key: 'ms', label: 'Durée', type: 'number', value: c.ms, min: 0, max: 60000, step: 100, unit: 'ms' }],
      depuis: (v) => ({ type: 'attendre', ms: clamp(Math.round(v.ms) || 0, 0, 60000) }),
      resume: (doc, c) => `Attendre ${c.ms} ms`,
    },
    fin: {
      nom: 'Arrêter le script ici', icone: 'debug-stop', groupe: 'Logique',
      nouveau: () => ({ type: 'fin' }),
      resume: () => 'Fin du script',
    },
    objet: {
      nom: 'Donner ou retirer un objet', icone: 'gift', groupe: 'Objets et créatures',
      nouveau: () => ({ type: 'objet', action: 'donner', objet: '', nombre: 1 }),
      champs: (doc, c) => [
        { key: 'action', label: 'Action', type: 'select', value: c.action, choices: [['donner', 'Donner au joueur'], ['retirer', 'Retirer au joueur']] },
        { key: 'objet', label: 'Objet', type: 'text', value: c.objet, list: 'tafl-objets', placeholder: 'potion' },
        { key: 'nombre', label: 'Combien', type: 'number', value: c.nombre, min: 1, max: 999 },
        { type: 'info', text: 'L\'identifiant de l\'objet (potion, planche-de-surf…), parmi les objets de Jeu › Données du jeu.' },
      ],
      depuis: (v) => ({ type: 'objet', action: v.action, objet: Doc.slug(v.objet, ''), nombre: clamp(Math.round(v.nombre) || 1, 1, 999) }),
      valide: (c) => (c.objet ? null : 'Quel objet ?'),
      resume: (doc, c) => `${c.action === 'retirer' ? 'Retirer' : 'Donner'} ${c.nombre} × ${nomData(doc, 'objets', c.objet)}`,
    },
    creature: {
      nom: 'Donner une créature', icone: 'heart', groupe: 'Objets et créatures', packs: ['pokemon'],
      nouveau: () => ({ type: 'creature', creature: '', niveau: 5 }),
      champs: (doc, c) => [
        { key: 'creature', label: 'Créature', type: 'text', value: c.creature, list: 'tafl-creatures', placeholder: 'salameche' },
        { key: 'niveau', label: 'Niveau', type: 'number', value: c.niveau, min: 1, max: 100 },
        { type: 'info', text: 'Le starter, un cadeau, un échange… Une créature de Jeu › Données du jeu.' },
      ],
      depuis: (v) => ({ type: 'creature', creature: Doc.slug(v.creature, ''), niveau: clamp(Math.round(v.niveau) || 5, 1, 100) }),
      valide: (c) => (c.creature ? null : 'Quelle créature ?'),
      resume: (doc, c) => `Donner ${nomData(doc, 'creatures', c.creature)} (niveau ${c.niveau})`,
    },
    combat_sauvage: {
      nom: 'Combat contre une créature', icone: 'flame', groupe: 'Objets et créatures', packs: ['pokemon'],
      nouveau: () => ({ type: 'combat_sauvage', creature: '', niveau: 50 }),
      champs: (doc, c) => [
        { key: 'creature', label: 'Créature', type: 'text', value: c.creature, list: 'tafl-creatures', placeholder: 'legendaire-du-lac' },
        { key: 'niveau', label: 'Niveau', type: 'number', value: c.niveau, min: 1, max: 100 },
        { type: 'info', text: 'Un combat contre une créature précise, qu\'on peut capturer : un légendaire au bout d\'une quête, un gardien qui bloque la route…' },
      ],
      depuis: (v) => ({ type: 'combat_sauvage', creature: Doc.slug(v.creature, ''), niveau: clamp(Math.round(v.niveau) || 5, 1, 100) }),
      valide: (c) => (c.creature ? null : 'Quelle créature ?'),
      resume: (doc, c) => `Combat contre ${nomData(doc, 'creatures', c.creature)} (niveau ${c.niveau})`,
    },
    combat_dresseur: {
      nom: 'Combat contre un dresseur', icone: 'person', groupe: 'Objets et créatures', packs: ['pokemon'],
      nouveau: () => ({ type: 'combat_dresseur', dresseur: '' }),
      champs: (doc, c) => [
        { key: 'dresseur', label: 'Dresseur', type: 'text', value: c.dresseur, list: 'tafl-dresseurs', placeholder: 'rival-1' },
        { type: 'info', text: 'Un dresseur de Jeu › Données du jeu : son équipe, ses dialogues, l\'argent gagné, et son niveau qui peut suivre la progression du joueur (Réglages).' },
      ],
      depuis: (v) => ({ type: 'combat_dresseur', dresseur: Doc.slug(v.dresseur, '') }),
      valide: (c) => (c.dresseur ? null : 'Quel dresseur ?'),
      resume: (doc, c) => `Combat contre le dresseur ${nomData(doc, 'dresseurs', c.dresseur)}`,
    },
    // Tafl 0.25 (Saga 0.8, pack JRPG) : un combat contre un groupe de monstres (boss, embuscade).
    combat_groupe: {
      nom: 'Combat contre un groupe de monstres', icone: 'flame', groupe: 'Objets et créatures', packs: ['jrpg', 'jdr'],
      nouveau: () => ({ type: 'combat_groupe', groupe: '' }),
      champs: (doc, c) => [
        { key: 'groupe', label: 'Groupe de monstres', type: 'text', value: c.groupe, list: 'tafl-groupes', placeholder: 'dragon' },
        { type: 'info', text: 'Un groupe de Jeu › Données du jeu › Groupes de monstres. Perdu : le script s\'arrête et le joueur se réveille au dernier soin. Pour un boss, décoche « On peut fuir » dans le groupe.' },
      ],
      depuis: (v) => ({ type: 'combat_groupe', groupe: Doc.slug(v.groupe, '') }),
      valide: (c) => (c.groupe ? null : 'Quel groupe de monstres ?'),
      resume: (doc, c) => `Combat contre ${nomData(doc, 'groupes', c.groupe)}`,
    },
    argent: {
      nom: 'Donner ou retirer de l\'argent', icone: 'credit-card', groupe: 'Objets et créatures',
      nouveau: () => ({ type: 'argent', action: 'donner', montant: 500 }),
      champs: (doc, c) => [
        { key: 'action', label: 'Action', type: 'select', value: c.action, choices: [['donner', 'Donner au joueur'], ['retirer', 'Retirer au joueur']] },
        { key: 'montant', label: 'Combien', type: 'number', value: c.montant, min: 1, max: 9999999, unit: monnaie(doc) },
        { type: 'info', text: 'Une récompense de quête, un pourboire, un péage… Retirer ne descend jamais sous 0 : teste d\'abord avec la condition « Le joueur a assez d\'argent ».' },
      ],
      depuis: (v) => ({ type: 'argent', action: v.action === 'retirer' ? 'retirer' : 'donner', montant: clamp(Math.round(v.montant) || 1, 1, 9999999) }),
      resume: (doc, c) => `${c.action === 'retirer' ? 'Retirer' : 'Donner'} ${c.montant} ${monnaie(doc)}`,
    },
    teleporter: {
      nom: 'Téléporter le joueur', icone: 'debug-step-into', groupe: 'Déplacements',
      nouveau: () => ({ type: 'teleporter', carte: '', x: 0, y: 0, direction: 'bas' }),
      champs: (doc, c) => [
        { key: 'carte', label: 'Carte', type: 'select', value: c.carte || doc.map.id, choices: doc.maps.map((m) => [m.id, m.name]) },
        { key: 'x', label: 'Colonne (x)', type: 'number', value: c.x, min: 0, max: 255 },
        { key: 'y', label: 'Rangée (y)', type: 'number', value: c.y, min: 0, max: 255 },
        { key: 'direction', label: 'Le joueur regarde', type: 'select', value: c.direction, choices: Doc.DIRECTIONS },
      ],
      depuis: (v) => {
        const m = Doc.mapById(App.doc, v.carte);
        return { type: 'teleporter', carte: v.carte, x: clamp(Math.round(v.x), 0, (m?.width || 256) - 1), y: clamp(Math.round(v.y), 0, (m?.height || 256) - 1), direction: v.direction };
      },
      resume: (doc, c) => `Téléporter vers ${Doc.mapById(doc, c.carte)?.name || c.carte} (${c.x}, ${c.y})`,
    },
    quete: {
      nom: 'Avancer une quête', icone: 'book', groupe: 'Progression',
      nouveau: () => ({ type: 'quete', quete: '', action: 'commencer', etape: 1 }),
      champs: (doc, c) => [
        { key: 'quete', label: 'Quête', type: 'select', value: c.quete || doc.data.quetes[0]?.id || '', choices: choixQuetes(doc, c.quete) },
        { key: 'action', label: 'Action', type: 'select', value: c.action, choices: [['commencer', 'La commencer'], ['etape', 'Passer à l\'étape…'], ['finir', 'La finir']] },
        { key: 'etape', label: 'Étape', type: 'number', value: c.etape, min: 1, max: 99 },
      ],
      onInput: (v, f) => { f.inputs.etape.row.hidden = v.action !== 'etape'; },
      depuis: (v) => ({ type: 'quete', quete: v.quete, action: v.action, etape: clamp(Math.round(v.etape) || 1, 1, 99) }),
      valide: (c) => (c.quete ? null : 'Crée d\'abord une quête dans Jeu › Données du jeu.'),
      resume: (doc, c) => {
        const q = quete(doc, c.quete);
        const t = q?.titre || c.quete;
        if (c.action === 'etape') return `Quête « ${t} » : étape ${c.etape}${q?.etapes[c.etape - 1] ? ` (${court(q.etapes[c.etape - 1].texte, 40)})` : ''}`;
        return `${c.action === 'finir' ? 'Finir' : 'Commencer'} la quête « ${t} »`;
      },
    },
    badge: {
      nom: 'Donner un badge', icone: 'star-full', groupe: 'Progression', packs: ['pokemon'], aussiSi: avecBadges,
      nouveau: (doc) => ({ type: 'badge', badge: badges(doc)[0]?.id || '' }),
      champs: (doc, c) => [
        { key: 'badge', label: 'Badge', type: 'select', value: c.badge, choices: choixBadges(doc, c.badge) },
        { type: 'info', text: 'Le joueur reçoit ce badge (une seule fois, même si le script repasse). Le compteur « Badges » vaut le nombre de badges différents reçus : c\'est lui qui fait monter le niveau maximum de l\'équipe et celui des dresseurs (Jeu › Données du jeu › Réglages).' },
      ],
      depuis: (v) => ({ type: 'badge', badge: v.badge }),
      valide: (c) => (c.badge ? null : 'Crée d\'abord les badges dans Jeu › Données du jeu › Réglages.'),
      resume: (doc, c) => `Donner le badge « ${nomBadge(doc, c.badge)} »`,
    },
    personnaliser: {
      nom: 'Personnaliser le héros (nom, tenue)', icone: 'account', groupe: 'Héros',
      nouveau: () => ({ type: 'personnaliser', nom: true, tenue: true }),
      champs: (doc, c) => [
        { key: 'nom', label: 'Le joueur choisit son nom', type: 'checkbox', value: c.nom },
        { key: 'tenue', label: 'Le joueur choisit sa tenue', type: 'checkbox', value: c.tenue },
        { type: 'info', text: tenues(doc).length ? `Tenues proposées : la tenue de base et ${tenues(doc).map((t) => t.nom).join(', ')}. Elles se créent dans la fiche du héros (Jeu › Données du jeu › Personnages).` : 'Le héros n\'a pas encore de tenue en plus : crée-les dans sa fiche (Jeu › Données du jeu › Personnages, section Tenues).' },
      ],
      depuis: (v) => ({ type: 'personnaliser', nom: Boolean(v.nom), tenue: Boolean(v.tenue) }),
      valide: (c) => (c.nom || c.tenue ? null : 'Coche au moins le nom ou la tenue.'),
      resume: (doc, c) => `Le joueur choisit ${[c.nom ? 'son nom' : '', c.tenue ? 'sa tenue' : ''].filter(Boolean).join(' et ')}`,
    },
    tenue: {
      nom: 'Changer la tenue du héros', icone: 'person', groupe: 'Héros',
      nouveau: (doc) => ({ type: 'tenue', tenue: tenues(doc)[0]?.id || '' }),
      champs: (doc, c) => [
        { key: 'tenue', label: 'Tenue', type: 'select', value: c.tenue, choices: [['', 'Sa tenue de base'], ...tenues(doc).map((t) => [t.id, t.nom]), ...(c.tenue && !tenues(doc).some((t) => t.id === c.tenue) ? [[c.tenue, `${c.tenue} (n'existe plus)`]] : [])] },
        { type: 'info', text: 'Pour l\'histoire : un uniforme pour s\'infiltrer, une tenue de plongée… Le héros garde ses portraits.' },
      ],
      depuis: (v) => ({ type: 'tenue', tenue: v.tenue }),
      resume: (doc, c) => `Le héros met ${c.tenue ? `la tenue « ${tenues(doc).find((t) => t.id === c.tenue)?.nom || c.tenue} »` : 'sa tenue de base'}`,
    },
    // Tafl 0.25 (Saga 0.8, pack JRPG) : un personnage rejoint le groupe, ou le quitte.
    groupe: {
      nom: 'Le groupe : un héros rejoint ou part', icone: 'organization', groupe: 'Héros', packs: ['jrpg', 'jdr'],
      nouveau: (doc) => ({ type: 'groupe', action: 'rejoindre', personnage: doc.data.personnages.find((p) => p.classe && !p.heros)?.id || '', niveau: 0 }),
      champs: (doc, c) => [
        { key: 'action', label: 'Action', type: 'select', value: c.action, choices: [['rejoindre', 'Rejoint le groupe'], ['quitter', 'Quitte le groupe']] },
        { key: 'personnage', label: 'Personnage', type: 'select', value: c.personnage, choices: doc.data.personnages.map((p) => [p.id, `${p.nom}${p.jdr?.classe && doc.data.reglages?.regles === 'jdr' ? ` (${nomData(doc, 'classes_jdr', p.jdr.classe)})` : p.classe ? ` (${nomData(doc, 'classes', p.classe)})` : ' (sans classe)'}`]) },
        { key: 'niveau', label: 'Niveau', type: 'number', value: c.niveau, min: 0, max: 999, unit: '0 = son niveau de départ' },
        { type: 'info', text: 'Le personnage (avec sa classe, son niveau et son équipement de départ : Jeu › Données du jeu › Personnages) rejoint le groupe, ou la Réserve si le groupe est complet. Un héros qui part puis revient retrouve son niveau et son équipement.' },
      ],
      onInput: (v, f) => { f.inputs.niveau.row.hidden = v.action !== 'rejoindre'; },
      depuis: (v) => ({ type: 'groupe', action: v.action === 'quitter' ? 'quitter' : 'rejoindre', personnage: v.personnage, niveau: clamp(Math.round(v.niveau) || 0, 0, 999) }),
      valide: (c) => (c.personnage ? null : 'Crée d\'abord le personnage (Jeu › Données du jeu › Personnages).'),
      resume: (doc, c) => `${nomData(doc, 'personnages', c.personnage)} ${c.action === 'quitter' ? 'quitte le groupe' : `rejoint le groupe${c.niveau ? ` (niveau ${c.niveau})` : ''}`}`,
    },
    // Tafl 1.0 (Saga 1.0) : le joueur compose son équipe lui-même (les jeux « arène », un tournoi…).
    composer_equipe: {
      nom: 'Composer son équipe', icone: 'organization', groupe: 'Objets et créatures', packs: ['pokemon'],
      nouveau: () => ({ type: 'composer_equipe', nombre: 6, niveau: 50, titre: '', garder: true, pour: 'soi' }),
      champs: (doc, c) => [
        { key: 'pour', label: 'Qui compose quoi', type: 'select', value: c.pour === 'adversaire' ? 'adversaire' : 'soi',
          choices: [['soi', 'Chacun compose sa propre équipe'], ['adversaire', 'Chacun compose l\'équipe de l\'autre joueur']] },
        { key: 'nombre', label: 'Combien de créatures', type: 'number', value: c.nombre, min: 1, max: 6 },
        { key: 'niveau', label: 'Niveau', type: 'number', value: c.niveau, min: 1, max: 100 },
        { key: 'titre', label: 'Titre de l\'écran', type: 'text', value: c.titre, placeholder: 'Compose ton équipe' },
        { key: 'garder', label: 'Mettre l\'équipe d\'avant au PC', type: 'checkbox', value: c.garder !== false },
        { type: 'info', text: c.pour === 'adversaire'
          ? 'Saga 1.8 : les deux joueurs choisissent en même temps, chacun pour l\'autre ; quand les deux ont fini, chacun reçoit l\'équipe que l\'autre lui a faite. Il faut jouer à plusieurs (sinon Saga le dit et ne fait rien).'
          : 'Saga montre toutes les créatures du jeu : le joueur en choisit jusqu\'à ce nombre, au niveau écrit ici, et elles deviennent son équipe. Pour les duels entre amis (multijoueur) : chacun prend son équipe, puis vous vous affrontez.' },
      ],
      depuis: (v) => ({ type: 'composer_equipe', nombre: clamp(Math.round(v.nombre) || 6, 1, 6), niveau: clamp(Math.round(v.niveau) || 50, 1, 100), titre: String(v.titre || '').slice(0, 60), garder: Boolean(v.garder), pour: v.pour === 'adversaire' ? 'adversaire' : 'soi' }),
      resume: (doc, c) => (c.pour === 'adversaire'
        ? `Chacun compose l'équipe de l'autre : ${c.nombre} créature${c.nombre > 1 ? 's' : ''} au niveau ${c.niveau}`
        : `Le joueur choisit ${c.nombre} créature${c.nombre > 1 ? 's' : ''} au niveau ${c.niveau}`),
    },
    soigner: {
      nom: 'Soigner l\'équipe', icone: 'heart-filled', groupe: 'Services',
      nouveau: () => ({ type: 'soigner' }),
      resume: () => 'Soigner toute l\'équipe',
    },
    // Tafl 1.9 (Saga 1.11) : un bonus pour tout le groupe, en combat (un bain chaud, un bon repas).
    bonus: {
      nom: 'Donner un bonus au groupe (bain, repas, bénédiction)', icone: 'sparkle', groupe: 'Services',
      nouveau: (doc) => ({ type: 'bonus', action: 'donner', id: '', nom: 'Bien reposé', stats: [{ stat: statsBonus(doc)[0]?.[0] || 'defense', pourcent: 10 }], combats: 3, nuit: true, annoncer: true }),
      champs: (doc, c) => {
        const choix = [['', '(aucune)'], ...statsBonus(doc)];
        const st = Array.isArray(c.stats) ? c.stats : [];
        return [
          { key: 'action', label: 'Action', type: 'select', value: c.action === 'retirer' ? 'retirer' : 'donner', choices: [['donner', 'Donner le bonus'], ['retirer', 'Retirer le bonus']] },
          { key: 'nom', label: 'Nom', type: 'text', value: c.nom, placeholder: 'Bains chauds, Bon repas…' },
          { key: 'id', label: 'Identifiant', type: 'text', value: c.id, placeholder: 'facultatif : bains (le même remplace l\'ancien ; à retirer : vide = tous)' },
          { key: 'stat1', label: 'Statistique', type: 'select', value: st[0]?.stat || '', choices: choix },
          { key: 'pct1', label: 'En %', type: 'number', value: st[0]?.pourcent ?? 10, min: -90, max: 200 },
          { key: 'stat2', label: 'Et', type: 'select', value: st[1]?.stat || '', choices: choix },
          { key: 'pct2', label: 'En %', type: 'number', value: st[1]?.pourcent ?? 10, min: -90, max: 200 },
          { key: 'combats', label: 'Pendant (combats, 0 = sans limite)', type: 'number', value: c.combats ?? 3, min: 0, max: 99 },
          { key: 'nuit', label: 'Jusqu\'à la nuit (il s\'efface quand le joueur dort)', type: 'checkbox', value: c.nuit !== false },
          { ...{ key: 'annoncer', label: 'Le dire au joueur', type: 'checkbox' }, value: c.annoncer !== false },
          { type: 'info', text: 'Les statistiques de combat de tout le groupe sont multipliées (+10 % : ×1,1) tant que le bonus dure : il perd un combat à chaque combat (gagné, perdu ou fui). Un bonus du même identifiant remplace l\'ancien ; plusieurs bonus différents s\'additionnent. Les PV et PM ne changent pas : pour un soin, ajoute « Soigner l\'équipe ».' },
        ];
      },
      onInput: (v, f) => { for (const k of ['nom', 'stat1', 'pct1', 'stat2', 'pct2', 'combats', 'nuit']) if (f.inputs[k]) f.inputs[k].row.hidden = v.action === 'retirer'; },
      depuis: (v) => ({ type: 'bonus', action: v.action === 'retirer' ? 'retirer' : 'donner', id: Doc.slug(v.id, ''), nom: String(v.nom || '').trim().slice(0, 60),
        stats: [[v.stat1, v.pct1], [v.stat2, v.pct2]].filter(([k, n]) => k && Math.round(Number(n))).map(([k, n]) => ({ stat: k, pourcent: clamp(Math.round(Number(n)), -90, 200) })),
        combats: clamp(Math.round(v.combats) || 0, 0, 99), nuit: Boolean(v.nuit), annoncer: Boolean(v.annoncer) }),
      valide: (c) => (c.action === 'retirer' || c.stats?.length ? null : 'Choisis au moins une statistique, avec un % qui n\'est pas 0.'),
      resume: (doc, c) => (c.action === 'retirer' ? `Retirer le bonus ${c.id ? `« ${c.id} »` : '(tous)'}`
        : `Bonus « ${c.nom || 'Bonus'} » : ${(c.stats || []).map((q) => `${libelle(statsBonus(doc), q.stat)} ${q.pourcent > 0 ? '+' : ''}${q.pourcent} %`).join(', ')}${c.combats ? `, ${c.combats} combat(s)` : ''}${c.nuit !== false ? ', jusqu\'à la nuit' : ''}`),
    },
    boutique: {
      nom: 'Ouvrir une boutique', icone: 'tag', groupe: 'Services',
      nouveau: () => ({ type: 'boutique', boutique: '' }),
      champs: (doc, c) => [
        { key: 'boutique', label: 'Boutique', type: 'text', value: c.boutique, list: 'tafl-boutiques', placeholder: 'boutique-bourg' },
        { type: 'info', text: 'Une boutique de Jeu › Données du jeu : ses articles, et ce qui débloque chacun (captures, dresseurs battus, évolutions, quêtes…).' },
      ],
      depuis: (v) => ({ type: 'boutique', boutique: Doc.slug(v.boutique, '') }),
      valide: (c) => (c.boutique ? null : 'Quelle boutique ?'),
      resume: (doc, c) => `Ouvrir la boutique ${nomData(doc, 'boutiques', c.boutique)}`,
    },
    ecran_ev: {
      nom: 'Écran des EV (centre de soins)', icone: 'settings', groupe: 'Services', packs: ['pokemon'],
      nouveau: () => ({ type: 'ecran_ev' }),
      resume: () => 'Ouvrir l\'écran des EV (répartir les points d\'effort)',
    },
    // Tafl 0.21 (Saga 0.6) : le PC, où le joueur range ses créatures dans des boîtes.
    ecran_boites: {
      nom: 'PC : les boîtes du joueur', icone: 'archive', groupe: 'Services',
      nouveau: () => ({ type: 'ecran_boites' }),
      resume: () => 'Ouvrir le PC (ranger les créatures dans les boîtes)',
    },
    // Tafl 0.29 (Saga 0.11) : la musique, un bruitage, l'heure du jeu.
    musique: {
      nom: 'Changer la musique', icone: 'music', groupe: 'Ambiance',
      nouveau: () => ({ type: 'musique', fichier: '' }),
      champs: (doc, c) => {
        sonOuvert = Sons.choix(doc, c.fichier, { mots: [['', 'Celle de la carte'], ['aucune', 'Silence']] });
        const choix = sonOuvert;
        return [
          { type: 'element', element: Sons.ligne('Musique', choix) },
          { type: 'info', text: 'Pour une scène : la musique du rival, un silence avant la révélation. Elle reste jusqu\'à la carte suivante qui a sa propre musique ; « Celle de la carte » remet la musique de la carte.' },
        ];
      },
      depuis: () => ({ type: 'musique', fichier: sonOuvert?.valeur || '' }),
      resume: (doc, c) => (c.fichier === 'aucune' ? 'Couper la musique' : c.fichier ? `Musique : ${c.fichier.slice(5)}` : 'Remettre la musique de la carte'),
    },
    son: {
      nom: 'Jouer un son', icone: 'unmute', groupe: 'Ambiance',
      nouveau: () => ({ type: 'son', fichier: '' }),
      champs: (doc, c) => {
        sonOuvert = Sons.choix(doc, c.fichier, { mots: [['', 'Choisis un son…']] });
        const choix = sonOuvert;
        return [
          { type: 'element', element: Sons.ligne('Son', choix) },
          { type: 'info', text: 'Un bruitage du dossier sons/ du jeu : une porte qui grince, un cri, une cloche. Le script continue sans attendre la fin du son (ajoute « Attendre » au besoin).' },
        ];
      },
      depuis: () => ({ type: 'son', fichier: sonOuvert?.valeur || '' }),
      valide: (c) => (c.fichier ? null : 'Quel son ?'),
      resume: (doc, c) => `Son : ${c.fichier ? c.fichier.slice(5) : '…'}`,
    },
    heure: {
      nom: 'Changer l\'heure (dormir, attendre la nuit)', icone: 'history', groupe: 'Ambiance',
      nouveau: () => ({ type: 'heure', action: 'avancer', heures: 8 }),
      champs: (doc, c) => [
        { key: 'action', label: 'Action', type: 'select', value: c.action, choices: [['avancer', 'Avancer de… heures'], ['regler', 'Mettre à… heures']] },
        { key: 'heures', label: 'Heures', type: 'number', value: c.heures, min: 0, max: 23 },
        { type: 'info', text: 'Pour l\'horloge du jeu (Réglages › Jour et nuit) : une nuit à l\'auberge (avancer de 8 heures), une scène qui se passe le soir (mettre à 20 heures). Avec l\'heure réelle du PC, la commande ne fait rien.' },
      ],
      depuis: (v) => ({ type: 'heure', action: v.action === 'regler' ? 'regler' : 'avancer', heures: clamp(Math.round(v.heures) || 0, 0, 23) }),
      resume: (doc, c) => (c.action === 'regler' ? `Mettre l'heure à ${c.heures} h` : `Avancer l'heure de ${c.heures} h`),
    },
    // Tafl 1.3 (Saga 1.5) : dormir, passer au jour suivant.
    dormir: {
      nom: 'Dormir (passer au jour suivant)', icone: 'eye-closed', groupe: 'Ambiance',
      nouveau: () => ({ type: 'dormir', texte: '', soigner: true, heure: '' }),
      champs: (doc, c) => [
        { key: 'texte', label: 'Avant de dormir', type: 'text', value: c.texte, placeholder: 'facultatif : Tu te glisses sous la couverture…' },
        { key: 'heure', label: 'Réveil à', type: 'select', value: String(c.heure ?? ''), choices: HEURES_REVEIL },
        { key: 'soigner', label: 'Soigner le groupe (on se réveillera ici après une défaite)', type: 'checkbox', value: c.soigner !== false },
        { type: 'info', text: 'Le jour se termine : les modules du jeu font leur calcul de la nuit (la gestion produit, les chantiers avancent), fondu au noir, et le joueur se réveille le lendemain avec le rapport du matin. Le numéro du jour se teste avec la condition « Le numéro du jour ».' },
      ],
      depuis: (v) => ({ type: 'dormir', texte: v.texte.trim(), soigner: Boolean(v.soigner), heure: v.heure === '' ? '' : clamp(Math.round(Number(v.heure)) || 0, 0, 23) }),
      resume: (doc, c) => `Dormir${c.heure !== '' && c.heure !== undefined ? ` (réveil à ${c.heure} h)` : ''}${c.soigner === false ? ', sans soigner' : ''}`,
    },
    // Tafl 0.31 (Saga 0.12) : une commande écrite en JavaScript (Événements › Scripts, commande()).
    script: {
      nom: 'Script JS (une commande de tes scripts)', icone: 'code', groupe: 'Scripts', largeur: 540,
      nouveau: (doc) => ({ type: 'script', nom: ScriptsTafl.connu(doc).commandes[0]?.nom || '', params: {} }),
      champs: (doc, c) => champsScript(doc, c),
      onInput: (v, f) => { for (const [k, i] of Object.entries(f.inputs)) if (k.startsWith('p|')) i.row.hidden = k.split('|')[1] !== v.nom; },
      depuis: (v, c) => ({ type: 'script', nom: v.nom || c.nom, params: paramsDepuis(v, v.nom || c.nom) }),
      valide: (c) => (c.nom ? null : 'Écris d\'abord une commande dans Événements › Scripts : commande(\'mon-nom\', async (saga) => { … }).'),
      resume: (doc, c) => {
        const p = Object.entries(c.params || {}).map(([k, v]) => `${k} : ${typeof v === 'string' ? v || '…' : v}`).join(', ');
        return `Script « ${c.nom || '…'} »${p ? ` (${court(p, 48)})` : ''}`;
      },
    },
  };
  const nomVariable = (doc, id) => (doc.data.variables || []).find((v) => v.id === id)?.nom || id;

  // --- Tafl 0.32 (Saga 0.13) : les blocs du pack JDR (dés, tests, repos, expérience, états) ---
  // Les listes du jeu (Données › Caractéristiques, Compétences, États), sinon celles de la 5e.
  const jdrListe = (doc, sorte) => {
    const l = doc.data[sorte] || [];
    if (l.length || typeof ModeleDnd5e === 'undefined') return l;
    return { caracteristiques: ModeleDnd5e.CARACTERISTIQUES, competences: ModeleDnd5e.COMPETENCES, etats: ModeleDnd5e.ETATS }[sorte] || [];
  };
  const jdrNom = (doc, sorte, id) => jdrListe(doc, sorte).find((o) => o.id === id)?.nom || id || '…';
  const choixCaracs = (doc) => jdrListe(doc, 'caracteristiques').map((k) => [k.id, k.nom]);
  // Une compétence, ou une caractéristique seule (« un test de Force »).
  const choixTests = (doc) => [...jdrListe(doc, 'competences').map((k) => [k.id, `${k.nom} (${jdrNom(doc, 'caracteristiques', k.carac)})`]), ...choixCaracs(doc).map(([k, n]) => [k, `${n} (sans compétence)`])];
  const choixEtats = (doc) => jdrListe(doc, 'etats').map((k) => [k.id, k.nom]);
  const QUI_TEST = [['choix', 'Le joueur choisit qui le tente'], ['meilleur', 'Le meilleur du groupe'], ['premier', 'Le premier du groupe'], ['tous', 'Chacun : réussi si au moins un réussit'], ['groupe', 'Test de groupe : réussi si la moitié réussit']];
  const QUI_VISES = [['tous', 'Tout le groupe'], ['premier', 'Le premier du groupe'], ['choix', 'Le joueur choisit qui']];
  const MODES_JET = [['', 'Normal'], ['avantage', 'Avec avantage (2d20, le meilleur)'], ['desavantage', 'Avec désavantage (2d20, le pire)']];
  const lireDes = (t) => /^\s*(\d*d\d+(\s*[+-]\s*\d+)?|\d+)\s*$/i.test(String(t || ''));
  const PACK_JDR = ['jdr'];
  const de = (nom) => (/^[aeiouyhéèêàâîôû]/i.test(nom) ? `d'${nom}` : `de ${nom}`);
  const AIDE_BRANCHES = 'Le bloc a deux branches, « réussi » et « raté » : glisse dedans ce qui arrive dans chaque cas.';
  Object.assign(COMMANDES, {
    test: {
      nom: 'Test de compétence (d20 contre un DD)', icone: 'symbol-event', groupe: 'Dés et règles', packs: PACK_JDR,
      nouveau: () => ({ type: 'test', competence: 'perception', dd: 12, qui: 'choix', avantage: false, desavantage: false, quoi: '', variable: '', reussi: [], rate: [] }),
      champs: (doc, c) => [
        { key: 'competence', label: 'Compétence', type: 'select', value: c.competence, choices: choixTests(doc) },
        { key: 'dd', label: 'Difficulté (DD)', type: 'number', value: c.dd, min: 1, max: 40, unit: '5 très facile · 10 facile · 15 moyen · 20 difficile · 25 très difficile' },
        { key: 'qui', label: 'Qui le tente', type: 'select', value: c.qui, choices: QUI_TEST },
        { key: 'mode', label: 'Le jet', type: 'select', value: c.avantage ? 'avantage' : c.desavantage ? 'desavantage' : '', choices: MODES_JET },
        { key: 'quoi', label: 'Ce qu\'on tente', type: 'text', value: c.quoi, placeholder: 'Crocheter la serrure (le texte du journal des jets)' },
        { key: 'variable', label: 'Retenir le total dans', type: 'text', value: c.variable, list: 'tafl-variables', placeholder: 'facultatif : une variable' },
        { type: 'info', text: `Le d20 + le bonus du personnage (caractéristique, et maîtrise s'il maîtrise la compétence) contre le DD. ${AIDE_BRANCHES}` },
      ],
      depuis: (v, c) => ({ type: 'test', competence: v.competence, dd: clamp(Math.round(v.dd) || 10, 1, 40), qui: v.qui, avantage: v.mode === 'avantage', desavantage: v.mode === 'desavantage', quoi: v.quoi.trim(), variable: Doc.slug(v.variable, ''), reussi: c.reussi || [], rate: c.rate || [] }),
      resume: (doc, c) => `${c.quoi ? `${c.quoi} : ` : ''}test ${de(jdrNom(doc, 'competences', c.competence) === c.competence ? jdrNom(doc, 'caracteristiques', c.competence) : jdrNom(doc, 'competences', c.competence))} DD ${c.dd} (${libelle(QUI_TEST, c.qui).split(' :')[0].toLowerCase()})${c.avantage ? ', avantage' : c.desavantage ? ', désavantage' : ''}`,
    },
    sauvegarde: {
      nom: 'Jet de sauvegarde (piège, poison, sort)', icone: 'shield', groupe: 'Dés et règles', packs: PACK_JDR,
      nouveau: () => ({ type: 'sauvegarde', carac: 'dex', dd: 12, qui: 'tous', degats: '', type_degats: '', moitie: true, etat: '', quoi: '', reussi: [], rate: [] }),
      champs: (doc, c) => [
        { key: 'carac', label: 'Sauvegarde de', type: 'select', value: c.carac, choices: choixCaracs(doc) },
        { key: 'dd', label: 'Difficulté (DD)', type: 'number', value: c.dd, min: 1, max: 40 },
        { key: 'qui', label: 'Qui', type: 'select', value: c.qui, choices: QUI_VISES },
        { key: 'quoi', label: 'Quoi', type: 'text', value: c.quoi, placeholder: 'Une fléchette empoisonnée jaillit du mur !' },
        { key: 'degats', label: 'Dégâts', type: 'text', value: c.degats, placeholder: '2d6 (vide : aucun)' },
        { key: 'type_degats', label: 'Type de dégâts', type: 'select', value: c.type_degats, choices: [['', '—'], ...TYPES_DEGATS] },
        { key: 'moitie', label: 'Réussi : la moitié des dégâts', type: 'checkbox', value: c.moitie },
        { key: 'etat', label: 'Raté : un état', type: 'select', value: c.etat, choices: [['', 'Aucun'], ...choixEtats(doc)] },
        { type: 'info', text: `Chacun lance son d20 + son bonus de sauvegarde. Ceux qui ratent prennent les dégâts (et l'état) ; hors combat, le dernier debout garde toujours 1 PV. Le bloc est « réussi » si tous réussissent. ${AIDE_BRANCHES}` },
      ],
      onInput: (v, f) => { f.inputs.type_degats.row.hidden = !v.degats.trim(); f.inputs.moitie.row.hidden = !v.degats.trim(); },
      depuis: (v, c) => ({ type: 'sauvegarde', carac: v.carac, dd: clamp(Math.round(v.dd) || 10, 1, 40), qui: v.qui, quoi: v.quoi.trim(), degats: v.degats.trim(), type_degats: v.degats.trim() ? v.type_degats : '', moitie: Boolean(v.moitie), etat: v.etat, reussi: c.reussi || [], rate: c.rate || [] }),
      valide: (c) => (!c.degats || lireDes(c.degats) ? null : 'Dégâts : des dés comme 2d6, 1d8+2 ou un nombre.'),
      resume: (doc, c) => `${c.quoi ? `${court(c.quoi, 30)} ` : ''}sauvegarde ${de(jdrNom(doc, 'caracteristiques', c.carac))} DD ${c.dd}${c.degats ? `, ${c.degats}${c.type_degats ? ` ${c.type_degats}` : ''}${c.moitie ? ' (moitié si réussi)' : ''}` : ''}${c.etat ? `, ${jdrNom(doc, 'etats', c.etat).toLowerCase()} si raté` : ''}`,
    },
    test_oppose: {
      nom: 'Test opposé (contre un PNJ ou un monstre)', icone: 'arrow-swap', groupe: 'Dés et règles', packs: PACK_JDR,
      nouveau: () => ({ type: 'test_oppose', competence: 'persuasion', contre: 2, monstre: '', competence_adverse: '', nom_adverse: '', qui: 'choix', reussi: [], rate: [] }),
      champs: (doc, c) => [
        { key: 'competence', label: 'Compétence du héros', type: 'select', value: c.competence, choices: choixTests(doc) },
        { key: 'qui', label: 'Qui', type: 'select', value: c.qui === 'premier' ? 'premier' : c.qui === 'meilleur' ? 'meilleur' : 'choix', choices: QUI_TEST.slice(0, 3) },
        { key: 'nom_adverse', label: 'L\'adversaire', type: 'text', value: c.nom_adverse, placeholder: 'Le garde, le marchand…' },
        { key: 'monstre', label: 'Ou un monstre', type: 'text', value: c.monstre, list: 'tafl-monstres-jdr', placeholder: 'facultatif : il prend la compétence du monstre' },
        { key: 'competence_adverse', label: 'Sa compétence', type: 'select', value: c.competence_adverse, choices: [['', 'La même'], ...choixTests(doc)] },
        { key: 'contre', label: 'Son bonus', type: 'number', value: c.contre, min: -10, max: 30, unit: 'sans monstre : l\'adversaire lance d20 + ce bonus' },
        { type: 'info', text: `Les deux lancent un d20 + leur bonus ; égalité : celui qui tente échoue (Persuasion contre Intuition, Discrétion contre Perception, Athlétisme contre Athlétisme…). ${AIDE_BRANCHES}` },
      ],
      depuis: (v, c) => ({ type: 'test_oppose', competence: v.competence, qui: v.qui, nom_adverse: v.nom_adverse.trim(), monstre: Doc.slug(v.monstre, ''), competence_adverse: v.competence_adverse, contre: clamp(Math.round(v.contre) || 0, -10, 30), reussi: c.reussi || [], rate: c.rate || [] }),
      resume: (doc, c) => `${jdrNom(doc, 'competences', c.competence)} contre ${c.monstre ? nomData(doc, 'monstres_jdr', c.monstre) : c.nom_adverse || 'un adversaire'}${c.competence_adverse ? ` (${jdrNom(doc, 'competences', c.competence_adverse)})` : ''}${c.monstre ? '' : ` ${c.contre >= 0 ? '+' : '−'}${Math.abs(c.contre)}`}`,
    },
    jet: {
      nom: 'Lancer des dés (2d6, d100…)', icone: 'symbol-numeric', groupe: 'Dés et règles', packs: PACK_JDR,
      nouveau: () => ({ type: 'jet', formule: '1d20', quoi: '', variable: '' }),
      champs: (doc, c) => [
        { key: 'formule', label: 'Les dés', type: 'text', value: c.formule, placeholder: '1d20, 2d6+3, 1d100' },
        { key: 'quoi', label: 'Pour quoi', type: 'text', value: c.quoi, placeholder: 'Table des rumeurs (le texte du journal)' },
        { key: 'variable', label: 'Retenir le total dans', type: 'text', value: c.variable, list: 'tafl-variables', placeholder: 'une variable, testée ensuite par un « si »' },
        { type: 'info', text: 'Les dés roulent à l\'écran et le jet est noté dans le journal. Pour une table aléatoire : retiens le total dans une variable, puis des « si » sur cette variable.' },
      ],
      depuis: (v) => ({ type: 'jet', formule: v.formule.trim().toLowerCase() || '1d20', quoi: v.quoi.trim(), variable: Doc.slug(v.variable, '') }),
      valide: (c) => (lireDes(c.formule) ? null : 'Des dés comme 1d20, 2d6+3 ou 1d100.'),
      resume: (doc, c) => `Lancer ${c.formule}${c.quoi ? ` (${court(c.quoi, 30)})` : ''}${c.variable ? ` → ${nomVariable(doc, c.variable)}` : ''}`,
    },
    repos: {
      nom: 'Repos (court ou long)', icone: 'coffee', groupe: 'Dés et règles', packs: PACK_JDR,
      nouveau: () => ({ type: 'repos', sorte: 'long' }),
      champs: (doc, c) => [
        { key: 'sorte', label: 'Repos', type: 'select', value: c.sorte, choices: [['long', 'Long (une nuit : tous les PV, les sorts, la moitié des dés de vie)'], ['court', 'Court (une heure : dépenser des dés de vie)']] },
        { type: 'info', text: 'Une auberge, un feu de camp. Les règles maison (Réglages › Règles du JDR) disent si le groupe peut aussi se reposer depuis le menu.' },
      ],
      depuis: (v) => ({ type: 'repos', sorte: v.sorte === 'court' ? 'court' : 'long' }),
      resume: (doc, c) => `Repos ${c.sorte}`,
    },
    xp: {
      nom: 'Donner de l\'XP (ou un jalon)', icone: 'star-full', groupe: 'Dés et règles', packs: PACK_JDR,
      nouveau: () => ({ type: 'xp', montant: 100, jalon: false }),
      champs: (doc, c) => [
        { key: 'jalon', label: 'Donner', type: 'select', value: String(c.jalon), choices: [['false', 'Des points d\'expérience à chaque héros'], ['true', 'Un jalon : tout le groupe monte d\'un niveau']] },
        { key: 'montant', label: 'XP', type: 'number', value: c.montant, min: 0, max: 999999, unit: 'pour chaque héros' },
        { type: 'info', text: 'Avec la progression par jalons (Réglages › Règles du JDR), les combats ne donnent pas d\'XP : ce bloc fait monter de niveau aux moments clés de l\'histoire.' },
      ],
      onInput: (v, f) => { f.inputs.montant.row.hidden = v.jalon === 'true'; },
      depuis: (v) => ({ type: 'xp', jalon: v.jalon === 'true', montant: clamp(Math.round(v.montant) || 0, 0, 999999) }),
      resume: (doc, c) => (c.jalon ? 'Jalon : le groupe monte d\'un niveau' : `${c.montant} XP pour chaque héros`),
    },
    etat: {
      nom: 'Mettre ou retirer un état (empoisonné…)', icone: 'pulse', groupe: 'Dés et règles', packs: PACK_JDR,
      nouveau: () => ({ type: 'etat', etat: 'empoisonne', action: 'ajouter', qui: 'tous' }),
      champs: (doc, c) => [
        { key: 'action', label: 'Action', type: 'select', value: c.action, choices: [['ajouter', 'Mettre l\'état'], ['retirer', 'Retirer l\'état']] },
        { key: 'etat', label: 'État', type: 'select', value: c.etat, choices: choixEtats(doc) },
        { key: 'qui', label: 'Qui', type: 'select', value: c.qui, choices: QUI_VISES },
      ],
      depuis: (v) => ({ type: 'etat', action: v.action === 'retirer' ? 'retirer' : 'ajouter', etat: v.etat, qui: v.qui }),
      resume: (doc, c) => `${c.action === 'retirer' ? 'Retirer' : 'Mettre'} l'état ${jdrNom(doc, 'etats', c.etat).toLowerCase()} (${libelle(QUI_VISES, c.qui).toLowerCase()})`,
    },
    creer_personnage: {
      nom: 'Créer un personnage (un héros de plus)', icone: 'person-add', groupe: 'Dés et règles', packs: PACK_JDR,
      nouveau: () => ({ type: 'creer_personnage' }),
      resume: () => 'Le joueur crée un nouveau personnage (il rejoint le groupe)',
    },
  });
  const TYPES_DEGATS = [['contondant', 'Contondant'], ['perforant', 'Perforant'], ['tranchant', 'Tranchant'], ['acide', 'Acide'], ['feu', 'Feu'], ['froid', 'Froid'], ['foudre', 'Foudre'], ['tonnerre', 'Tonnerre'], ['poison', 'Poison'], ['necrotique', 'Nécrotique'], ['radiant', 'Radiant'], ['force', 'Force'], ['psychique', 'Psychique']];

  // Le bloc Script : la commande à jouer, puis ses réglages (ceux qu'elle déclare dans commande()). Les
  // réglages de toutes les commandes sont dans la fenêtre ; seuls ceux de la commande choisie se voient.
  function champsScript(doc, c) {
    const connu = ScriptsTafl.connu(doc);
    const cmds = connu.commandes;
    const choix = cmds.map((x) => [x.nom, `${x.nom}  (${x.fichier.replace(/^scripts\//, '')})`]);
    if (c.nom && !cmds.some((x) => x.nom === c.nom)) choix.unshift([c.nom, `${c.nom} (introuvable dans les scripts)`]);
    if (!choix.length) {
      return [{ type: 'info', text: 'Aucune commande de script pour l\'instant. Dans Événements › Scripts, crée un script (modèle « Commande avec dialogue »), puis reviens ici.' },
        { key: 'nom', label: 'Commande', type: 'select', value: '', choices: [['', '(aucune)']] }];
    }
    const fields = [{ key: 'nom', label: 'Commande', type: 'select', value: c.nom || choix[0][0], choices: choix }];
    const choisie = c.nom || choix[0][0];
    for (const x of cmds) {
      for (const [cle, d] of Object.entries(x.params || {})) {
        const v = x.nom === c.nom && c.params?.[cle] !== undefined ? c.params[cle] : d.defaut;
        const f = { key: `p|${x.nom}|${cle}`, label: d.nom || cle, hidden: x.nom !== choisie };
        if (d.type === 'nombre') Object.assign(f, { type: 'number', value: Number(v) || 0, ...(Number.isFinite(d.min) ? { min: d.min } : {}), ...(Number.isFinite(d.max) ? { max: d.max } : {}) });
        else if (d.type === 'oui_non') Object.assign(f, { type: 'select', value: String(Boolean(v)), choices: [['true', 'Oui'], ['false', 'Non']] });
        else if (d.type === 'liste') Object.assign(f, { type: 'select', value: String(v ?? d.choix?.[0] ?? ''), choices: (d.choix || []).map((k) => [k, k]) });
        else if (d.type === 'personnage') Object.assign(f, { type: 'select', value: String(v ?? ''), choices: [['', '(aucun)'], ...doc.data.personnages.map((p) => [p.id, p.nom])] });
        else if (d.type === 'carte') Object.assign(f, { type: 'select', value: String(v ?? ''), choices: [['', '(aucune)'], ...doc.maps.map((m) => [m.id, m.name])] });
        else if (d.type === 'quete') Object.assign(f, { type: 'select', value: String(v ?? ''), choices: [['', '(aucune)'], ...doc.data.quetes.map((q) => [q.id, q.titre])] });
        else Object.assign(f, { type: 'text', value: String(v ?? ''), ...({ objet: { list: 'tafl-objets' }, interrupteur: { list: 'tafl-interrupteurs' }, variable: { list: 'tafl-variables' }, creature: { list: 'tafl-creatures' } }[d.type] || {}) });
        fields.push(f);
      }
    }
    const aide = cmds.find((x) => x.nom === choisie)?.aide;
    fields.push({ type: 'info', text: `${aide ? `${aide} ` : ''}La commande et ses réglages viennent de commande('nom', { réglages }, async (saga, params) => { … }) dans un script (Événements › Scripts). Saga la joue dans un bac à sable : elle ne voit ni tes fichiers ni Internet.` });
    return fields;
  }
  function paramsDepuis(v, nom) {
    const d = ScriptsTafl.connu(App.doc).commandes.find((x) => x.nom === nom);
    const out = {};
    for (const [cle, def] of Object.entries(d?.params || {})) {
      const brut = v[`p|${nom}|${cle}`];
      if (brut === undefined) continue;
      out[cle] = def.type === 'nombre' ? Number(brut) || 0 : def.type === 'oui_non' ? brut === 'true' : String(brut);
    }
    return out;
  }

  // --- Les conditions (d'une page, ou d'un « si ») ---
  const CONDITIONS = {
    interrupteur: {
      nom: 'Un interrupteur du jeu',
      nouveau: () => ({ type: 'interrupteur', id: '', valeur: true }),
      champs: (doc, c) => [
        { key: 'id', label: 'Interrupteur', type: 'text', value: c.id, list: 'tafl-interrupteurs', placeholder: 'rival-battu' },
        { key: 'valeur', label: 'Est', type: 'select', value: String(c.valeur), choices: VRAI_FAUX },
      ],
      depuis: (v) => ({ type: 'interrupteur', id: Doc.slug(v.id, ''), valeur: v.valeur === 'true' }),
      valide: (c) => (c.id ? null : 'Donne le nom de l\'interrupteur.'),
    },
    local: {
      nom: 'L\'événement est « déjà fait »',
      nouveau: () => ({ type: 'local', valeur: true }),
      champs: (doc, c) => [{ key: 'valeur', label: 'Déjà fait', type: 'select', value: String(c.valeur), choices: [['true', 'Oui'], ['false', 'Non']] }],
      depuis: (v) => ({ type: 'local', valeur: v.valeur === 'true' }),
    },
    objet: {
      nom: 'Le joueur a un objet',
      nouveau: () => ({ type: 'objet', objet: '', min: 1 }),
      champs: (doc, c) => [
        { key: 'objet', label: 'Objet', type: 'text', value: c.objet, list: 'tafl-objets', placeholder: 'planche-de-surf' },
        { key: 'min', label: 'Au moins', type: 'number', value: c.min, min: 1, max: 999 },
      ],
      depuis: (v) => ({ type: 'objet', objet: Doc.slug(v.objet, ''), min: clamp(Math.round(v.min) || 1, 1, 999) }),
      valide: (c) => (c.objet ? null : 'Quel objet ?'),
    },
    // Tafl 1.9 (Saga 1.11) : le groupe a un bonus (des bains, un repas).
    bonus: {
      nom: 'Le groupe a un bonus (bain, repas…)',
      nouveau: () => ({ type: 'bonus', id: '' }),
      champs: (doc, c) => [
        { key: 'id', label: 'Identifiant', type: 'text', value: c.id, placeholder: 'vide : un bonus, quel qu\'il soit' },
        { type: 'info', text: 'L\'identifiant donné par la commande « Donner un bonus au groupe ». Ceux des bâtiments de repos (gestion) : gestion:<id du bâtiment>.' },
      ],
      depuis: (v) => ({ type: 'bonus', id: String(v.id || '').trim().slice(0, 80) }),
    },
    quete: {
      nom: 'L\'état d\'une quête',
      nouveau: () => ({ type: 'quete', quete: '', etat: 'en_cours', etape: 0 }),
      champs: (doc, c) => [
        { key: 'quete', label: 'Quête', type: 'select', value: c.quete || doc.data.quetes[0]?.id || '', choices: choixQuetes(doc, c.quete) },
        { key: 'etat', label: 'Est', type: 'select', value: c.etat, choices: ETATS_QUETE },
        { key: 'etape', label: 'Au moins à l\'étape', type: 'number', value: c.etape, min: 0, max: 99 },
        { type: 'info', text: 'Étape : 0 = peu importe. Par exemple « en cours, au moins à l\'étape 2 » : le joueur a déjà parlé au pêcheur.' },
      ],
      onInput: (v, f) => { f.inputs.etape.row.hidden = v.etat !== 'en_cours'; },
      depuis: (v) => ({ type: 'quete', quete: v.quete, etat: v.etat, etape: v.etat === 'en_cours' ? clamp(Math.round(v.etape) || 0, 0, 99) : 0 }),
      valide: (c) => (c.quete ? null : 'Crée d\'abord une quête dans Jeu › Données du jeu.'),
    },
    compteur: {
      nom: 'Un compteur du joueur (quêtes finies, pas…)',
      nouveau: (doc) => ({ type: 'compteur', compteur: compteursDu(doc)[0]?.[0] || 'quetes_finies', min: 10 }),
      champs: (doc, c) => [
        { key: 'compteur', label: 'Compteur', type: 'select', value: c.compteur, choices: compteursDu(doc, c.compteur) },
        { key: 'min', label: 'Au moins', type: 'number', value: c.min, min: 0, max: 99999 },
        { type: 'info', text: (doc?.data?.reglages?.regles || 'pokemon') === 'pokemon'
          ? 'Pour débloquer une boutique, un personnage ou une quête au fil de la progression : 10 créatures capturées, 5 dresseurs battus, 3 évolutions…'
          : 'Pour débloquer une boutique, un personnage ou une quête au fil de la progression : 3 quêtes finies, 20 monstres vaincus…' },
      ],
      depuis: (v) => ({ type: 'compteur', compteur: v.compteur, min: clamp(Math.round(v.min) || 0, 0, 99999) }),
    },
    argent: {
      nom: 'Le joueur a assez d\'argent',
      nouveau: () => ({ type: 'argent', min: 500 }),
      champs: (doc, c) => [{ key: 'min', label: 'Au moins', type: 'number', value: c.min, min: 0, max: 9999999, unit: monnaie(doc) }],
      depuis: (v) => ({ type: 'argent', min: clamp(Math.round(v.min) || 0, 0, 9999999) }),
    },
    badge: {
      nom: 'Le joueur a un badge', packs: ['pokemon'], aussiSi: avecBadges,
      nouveau: (doc) => ({ type: 'badge', badge: badges(doc)[0]?.id || '' }),
      champs: (doc, c) => [
        { key: 'badge', label: 'Badge', type: 'select', value: c.badge, choices: choixBadges(doc, c.badge) },
        { type: 'info', text: 'Pour un garde qui ne laisse passer qu\'avec le badge de la ville. Pour « au moins 3 badges », prends plutôt la condition « Un compteur du joueur ».' },
      ],
      depuis: (v) => ({ type: 'badge', badge: v.badge }),
      valide: (c) => (c.badge ? null : 'Crée d\'abord les badges dans Jeu › Données du jeu › Réglages.'),
    },
    membre: {
      nom: 'Un héros est avec le joueur (JRPG)', packs: ['jrpg'],
      nouveau: (doc) => ({ type: 'membre', personnage: doc.data.personnages.find((p) => p.classe && !p.heros)?.id || '' }),
      champs: (doc, c) => [
        { key: 'personnage', label: 'Personnage', type: 'select', value: c.personnage, choices: doc.data.personnages.map((p) => [p.id, p.nom]) },
        { type: 'info', text: 'Vrai s\'il est dans le groupe ou dans la Réserve (commande « Le groupe »).' },
      ],
      depuis: (v) => ({ type: 'membre', personnage: v.personnage }),
      valide: (c) => (c.personnage ? null : 'Quel personnage ?'),
    },
  };
  // Tafl 0.29 (Saga 0.11) : le moment de la journée, selon l'horloge du jeu.
  const MOMENTS = [['matin', 'Le matin (6 h à 10 h)'], ['jour', 'Le jour (6 h à 20 h)'], ['soir', 'Le soir (17 h à 20 h)'], ['nuit', 'La nuit (20 h à 6 h)']];
  CONDITIONS.moment = {
    nom: 'Le moment de la journée (jour, nuit…)',
    nouveau: () => ({ type: 'moment', moment: 'nuit' }),
    champs: (doc, c) => [
      { key: 'moment', label: 'C\'est', type: 'select', value: c.moment, choices: MOMENTS },
      { type: 'info', text: 'Selon l\'horloge du jeu (Réglages › Jour et nuit). Un marchand qui ne vient que le soir, un fantôme la nuit, une boulangerie ouverte le matin. Sans horloge, il est toujours midi : « le jour » est vrai.' },
    ],
    depuis: (v) => ({ type: 'moment', moment: v.moment }),
  };
  CONDITIONS.variable = {
    nom: 'Une variable (nombre ou texte)',
    nouveau: () => ({ type: 'variable', id: '', comparaison: '>=', valeur: 1 }),
    champs: (doc, c) => [
      { key: 'id', label: 'Variable', type: 'text', value: c.id, list: 'tafl-variables', placeholder: 'pieces-trouvees' },
      { key: 'comparaison', label: 'Est', type: 'select', value: c.comparaison, choices: COMPARAISONS },
      { key: 'valeur', label: 'Valeur', type: 'text', value: String(c.valeur ?? 0) },
      { type: 'info', text: 'Pour un nombre : au moins, au plus, égal… Pour un texte (le nom d\'une ville, un choix du joueur), seulement « égale à » ou « différente de ».' },
    ],
    depuis: (v) => ({ type: 'variable', id: Doc.slug(v.id, ''), comparaison: pick(v.comparaison, COMPARAISONS, '>='), valeur: valeurVariable(v.valeur) }),
    valide: (c) => (c.id ? null : 'Donne le nom de la variable.'),
  };
  // Tafl 0.32 (Saga 0.13) : les conditions du pack JDR, vraies si au moins un héros du groupe convient.
  Object.assign(CONDITIONS, {
    jdr_perception: {
      nom: 'La Perception passive du groupe (JDR)', packs: PACK_JDR,
      nouveau: () => ({ type: 'jdr_perception', min: 13 }),
      champs: (doc, c) => [
        { key: 'min', label: 'Au moins', type: 'number', value: c.min, min: 1, max: 40 },
        { type: 'info', text: 'Sans lancer de dé : 10 + le bonus de Perception du meilleur héros. Une porte secrète, un piège, un pickpocket qui ne se voient que si le groupe est attentif.' },
      ],
      depuis: (v) => ({ type: 'jdr_perception', min: clamp(Math.round(v.min) || 10, 1, 40) }),
    },
    jdr_maitrise: {
      nom: 'Un héros maîtrise une compétence (JDR)', packs: PACK_JDR,
      nouveau: () => ({ type: 'jdr_maitrise', competence: 'arcanes' }),
      champs: (doc, c) => [{ key: 'competence', label: 'Compétence', type: 'select', value: c.competence, choices: jdrListe(doc, 'competences').map((k) => [k.id, k.nom]) }],
      depuis: (v) => ({ type: 'jdr_maitrise', competence: v.competence }),
    },
    jdr_etat: {
      nom: 'Un héros a un état (JDR)', packs: PACK_JDR,
      nouveau: () => ({ type: 'jdr_etat', etat: 'empoisonne', valeur: true }),
      champs: (doc, c) => [
        { key: 'etat', label: 'État', type: 'select', value: c.etat, choices: choixEtats(doc) },
        { key: 'valeur', label: 'Est', type: 'select', value: String(c.valeur), choices: [['true', 'Vrai : au moins un héros l\'a'], ['false', 'Faux : personne ne l\'a']] },
      ],
      depuis: (v) => ({ type: 'jdr_etat', etat: v.etat, valeur: v.valeur === 'true' }),
    },
    jdr_classe: {
      nom: 'Un héros a une classe (JDR)', packs: PACK_JDR,
      nouveau: (doc) => ({ type: 'jdr_classe', classe: doc.data.classes_jdr?.[0]?.id || '' }),
      champs: (doc, c) => [{ key: 'classe', label: 'Classe', type: 'select', value: c.classe, choices: (doc.data.classes_jdr || []).map((k) => [k.id, k.nom]) }],
      depuis: (v) => ({ type: 'jdr_classe', classe: v.classe }),
      valide: (c) => (c.classe ? null : 'Crée d\'abord les classes (Données › Classes, ou le modèle D&D 5e).'),
    },
    jdr_origine: {
      nom: 'Un héros a une origine (JDR)', packs: PACK_JDR,
      nouveau: (doc) => ({ type: 'jdr_origine', origine: doc.data.origines?.[0]?.id || '' }),
      champs: (doc, c) => [{ key: 'origine', label: 'Origine', type: 'select', value: c.origine, choices: (doc.data.origines || []).map((k) => [k.id, k.nom]) }],
      depuis: (v) => ({ type: 'jdr_origine', origine: v.origine }),
      valide: (c) => (c.origine ? null : 'Crée d\'abord les origines (Données › Origines, ou le modèle D&D 5e).'),
    },
    jdr_niveau: {
      nom: 'Un héros a au moins un niveau (JDR)', packs: PACK_JDR,
      nouveau: () => ({ type: 'jdr_niveau', min: 3 }),
      champs: (doc, c) => [{ key: 'min', label: 'Au moins le niveau', type: 'number', value: c.min, min: 1, max: 20 }],
      depuis: (v) => ({ type: 'jdr_niveau', min: clamp(Math.round(v.min) || 1, 1, 20) }),
    },
  });

  // --- Tafl 1.3 (Saga 1.5) : dormir et le numéro du jour, pour tous les jeux ---
  const HEURES_REVEIL = [['', 'L\'heure de départ du jeu (Réglages › Jour et nuit)'], ...Array.from({ length: 24 }, (_, h) => [String(h), `${h} h`])];
  CONDITIONS.jour = {
    nom: 'Le numéro du jour (après avoir dormi)',
    nouveau: () => ({ type: 'jour', comparaison: '>=', valeur: 2 }),
    champs: (doc, c) => [
      { key: 'comparaison', label: 'Le jour est', type: 'select', value: c.comparaison, choices: COMPARAISONS },
      { key: 'valeur', label: 'Jour', type: 'number', value: c.valeur, min: 1, max: 99999 },
      { type: 'info', text: 'Le jeu commence au jour 1 ; la commande « Dormir » passe au jour suivant. Pour un marchand qui arrive le jour 3, une réponse qui vient deux jours après une lettre.' },
    ],
    depuis: (v) => ({ type: 'jour', comparaison: pick(v.comparaison, COMPARAISONS, '>='), valeur: clamp(Math.round(v.valeur) || 1, 1, 99999) }),
  };

  // --- Tafl 1.3 (Saga 1.5) : le module « gestion » (Réglages › Règles du jeu › Modules) ---
  // Ses commandes et conditions ne sont proposées que si le jeu l'active (modules : comme packs).
  const MODULE_GESTION = ['gestion'];
  const choixDe = (doc, sorte, actuel, vide) => {
    const list = (doc.data[sorte] || []).map((o) => [o.id, o.nom || o.id]);
    if (actuel && !list.some(([k]) => k === actuel)) list.unshift([actuel, `${actuel} (n'existe plus)`]);
    return list.length ? list : [['', vide]];
  };
  const choixRessources = (doc, actuel) => choixDe(doc, 'ressources', actuel, 'Aucune ressource : crée-les dans Données › Ressources');
  const choixBatiments = (doc, actuel) => choixDe(doc, 'batiments', actuel, 'Aucun bâtiment : crée-les dans Données › Bâtiments');
  const ANNONCER = { key: 'annoncer', label: 'Le dire au joueur', type: 'checkbox' };
  A_BRANCHES.push('gestion_construire', 'gestion_placer', 'gestion_repos');
  Object.assign(COMMANDES, {
    gestion_construire: {
      nom: 'Construire un bâtiment', icone: 'tools', groupe: 'Gestion', modules: MODULE_GESTION,
      nouveau: (doc) => ({ type: 'gestion_construire', batiment: doc.data.batiments?.[0]?.id || '', annoncer: true, reussi: [], rate: [] }),
      champs: (doc, c) => [
        { key: 'batiment', label: 'Bâtiment', type: 'select', value: c.batiment, choices: choixBatiments(doc, c.batiment) },
        { ...ANNONCER, value: c.annoncer !== false },
        { type: 'info', text: `Son coût est pris tout de suite dans le stock ; le chantier avance d'une nuit chaque fois que le joueur dort. Raté : pas assez de ressources, ou son maximum est atteint. ${AIDE_BRANCHES} Pour le montrer une fois fini : une page avec la condition « Un bâtiment est construit ».` },
      ],
      depuis: (v, c) => ({ type: 'gestion_construire', batiment: v.batiment, annoncer: Boolean(v.annoncer), reussi: c.reussi || [], rate: c.rate || [] }),
      valide: (c) => (c.batiment ? null : 'Crée d\'abord un bâtiment (Données › Bâtiments).'),
      resume: (doc, c) => `Construire « ${nomData(doc, 'batiments', c.batiment)} »`,
    },
    // Tafl 1.3 : le joueur pose le bâtiment où il veut, dans une zone Constructible de la carte.
    gestion_placer: {
      nom: 'Placer un bâtiment (le joueur choisit où)', icone: 'tools', groupe: 'Gestion', modules: MODULE_GESTION,
      nouveau: () => ({ type: 'gestion_placer', batiment: '', annoncer: true, reussi: [], rate: [] }),
      champs: (doc, c) => [
        { key: 'batiment', label: 'Bâtiment', type: 'select', value: c.batiment, choices: [['', 'Le joueur le choisit dans la liste'], ...choixBatiments(doc, c.batiment).filter(([k]) => k)] },
        { ...ANNONCER, value: c.annoncer !== false },
        { type: 'info', text: `Le joueur déplace le bâtiment avec les flèches et le pose avec la touche d'action, dans une zone de type « Constructible » de la carte ; retour annule. Son coût est pris quand il le pose. Raté : annulé, pas assez de ressources, maximum atteint, ou pas de zone constructible ici. ${AIDE_BRANCHES}` },
      ],
      depuis: (v, c) => ({ type: 'gestion_placer', batiment: v.batiment, annoncer: Boolean(v.annoncer), reussi: c.reussi || [], rate: c.rate || [] }),
      resume: (doc, c) => (c.batiment ? `Placer « ${nomData(doc, 'batiments', c.batiment)} »` : 'Placer un bâtiment (au choix)'),
    },
    gestion_stock: {
      nom: 'Ajouter ou retirer une ressource du stock', icone: 'archive', groupe: 'Gestion', modules: MODULE_GESTION,
      nouveau: (doc) => ({ type: 'gestion_stock', action: 'ajouter', ressource: doc.data.ressources?.[0]?.id || '', nombre: 1, annoncer: true }),
      champs: (doc, c) => [
        { key: 'action', label: 'Action', type: 'select', value: c.action, choices: [['ajouter', 'Ajouter au stock'], ['retirer', 'Retirer du stock']] },
        { key: 'ressource', label: 'Ressource', type: 'select', value: c.ressource, choices: choixRessources(doc, c.ressource) },
        { key: 'nombre', label: 'Nombre', type: 'number', value: c.nombre, min: 1, max: 99999 },
        { ...ANNONCER, value: c.annoncer !== false },
        { type: 'info', text: 'Le stock est celui du domaine, pas le sac du joueur. Il ne passe jamais sous 0, ni au-dessus de sa capacité (Réglages › Règles du jeu › Modules).' },
      ],
      depuis: (v) => ({ type: 'gestion_stock', action: v.action === 'retirer' ? 'retirer' : 'ajouter', ressource: v.ressource, nombre: clamp(Math.round(v.nombre) || 1, 1, 99999), annoncer: Boolean(v.annoncer) }),
      valide: (c) => (c.ressource ? null : 'Crée d\'abord une ressource (Données › Ressources).'),
      resume: (doc, c) => `${c.action === 'retirer' ? 'Retirer du stock' : 'Ajouter au stock'} : ${c.nombre} ${nomData(doc, 'ressources', c.ressource)}`,
    },
    gestion_deposer: {
      nom: 'Déposer le sac au stock', icone: 'inbox', groupe: 'Gestion', modules: MODULE_GESTION,
      nouveau: () => ({ type: 'gestion_deposer', annoncer: true }),
      resume: () => 'Déposer au stock ce que le joueur rapporte (les objets des ressources)',
    },
    // Tafl 1.4 (Saga 1.6) : les habitants.
    gestion_habitants: {
      nom: 'Des habitants arrivent ou partent', icone: 'organization', groupe: 'Gestion', modules: MODULE_GESTION,
      nouveau: () => ({ type: 'gestion_habitants', action: 'ajouter', nombre: 1, forcer: false, annoncer: true }),
      champs: (doc, c) => [
        { key: 'action', label: 'Action', type: 'select', value: c.action, choices: [['ajouter', 'Ils arrivent'], ['retirer', 'Ils partent']] },
        { key: 'nombre', label: 'Combien', type: 'number', value: c.nombre, min: 1, max: 999 },
        { key: 'forcer', label: 'Même sans logement libre', type: 'checkbox', value: Boolean(c.forcer) },
        { ...ANNONCER, value: c.annoncer !== false },
        { type: 'info', text: 'Une famille qui s\'installe, un ami qui rejoint le domaine. Sans « même sans logement », ils ne dépassent pas la place des bâtiments finis (leur champ Logement). Chaque nuit, des habitants arrivent aussi tout seuls s\'il reste de la place (Réglages › Modules › Gestion).' },
      ],
      depuis: (v) => ({ type: 'gestion_habitants', action: v.action === 'retirer' ? 'retirer' : 'ajouter', nombre: clamp(Math.round(v.nombre) || 1, 1, 999), forcer: Boolean(v.forcer), annoncer: Boolean(v.annoncer) }),
      resume: (doc, c) => `${c.action === 'retirer' ? 'Des habitants partent' : 'Des habitants arrivent'} : ${c.nombre}${c.forcer && c.action !== 'retirer' ? ' (même sans logement)' : ''}`,
    },
    // Tafl 1.4.1 : ressortir d'un bâtiment par sa porte (dans l'intérieur, sur un déclencheur de sortie).
    gestion_sortir: {
      nom: 'Ressortir du bâtiment (devant sa porte)', icone: 'sign-out', groupe: 'Gestion', modules: MODULE_GESTION,
      nouveau: () => ({ type: 'gestion_sortir' }),
      champs: () => [{ type: 'info', text: 'Pour l\'intérieur d\'un bâtiment posé par le joueur : le ramène devant la porte par laquelle il est entré (chaque maison du même type a le même intérieur, mais pas la même place). Mets-la sur un déclencheur « toucher » à la sortie de l\'intérieur.' }],
      resume: () => 'Ressortir du bâtiment, devant sa porte',
    },
    gestion_domaine: {
      nom: 'Ouvrir l\'écran du domaine', icone: 'home', groupe: 'Gestion', modules: MODULE_GESTION,
      nouveau: () => ({ type: 'gestion_domaine' }),
      resume: () => 'Montrer le domaine (le stock et les bâtiments)',
    },
    // Tafl 1.9 (Saga 1.11) : se reposer dans un bâtiment de repos (un spa, des bains).
    gestion_repos: {
      nom: 'Se reposer (bâtiment de repos : soin et bonus)', icone: 'coffee', groupe: 'Gestion', modules: MODULE_GESTION,
      nouveau: () => ({ type: 'gestion_repos', batiment: '', annoncer: true, reussi: [], rate: [] }),
      champs: (doc, c) => [
        { key: 'batiment', label: 'Bâtiment', type: 'select', value: c.batiment, choices: [['', 'Celui où est le joueur (son intérieur)'], ...choixDe(doc, 'batiments', c.batiment, '').filter(([k]) => k && (doc.data.batiments || []).find((b) => b.id === k)?.repos?.quand)] },
        { ...ANNONCER, value: c.annoncer !== false },
        { type: 'info', text: `Le bâtiment doit être fini, avec un repos « quand on vient s'y reposer » (Données › Bâtiments › Repos) : le groupe est soigné et reçoit son bonus, et le coût d'une visite est pris dans le stock. Mets-la sur un bassin, un lit, un comptoir de l'intérieur. Raté : pas encore construit, ou pas assez dans le stock. ${AIDE_BRANCHES}` },
      ],
      depuis: (v, c) => ({ type: 'gestion_repos', batiment: v.batiment, annoncer: Boolean(v.annoncer), reussi: c.reussi || [], rate: c.rate || [] }),
      resume: (doc, c) => (c.batiment ? `Se reposer à « ${nomData(doc, 'batiments', c.batiment)} »` : 'Se reposer (le bâtiment où l\'on est)'),
    },
  });
  Object.assign(CONDITIONS, {
    gestion_batiment: {
      nom: 'Un bâtiment est construit (gestion)', modules: MODULE_GESTION,
      nouveau: (doc) => ({ type: 'gestion_batiment', batiment: doc.data.batiments?.[0]?.id || '', min: 1 }),
      champs: (doc, c) => [
        { key: 'batiment', label: 'Bâtiment', type: 'select', value: c.batiment, choices: choixBatiments(doc, c.batiment) },
        { key: 'min', label: 'Au moins', type: 'number', value: c.min, min: 1, max: 999 },
        { type: 'info', text: 'Seulement les bâtiments finis (pas les chantiers). Une page avec cette condition montre le bâtiment à son emplacement.' },
      ],
      depuis: (v) => ({ type: 'gestion_batiment', batiment: v.batiment, min: clamp(Math.round(v.min) || 1, 1, 999) }),
      valide: (c) => (c.batiment ? null : 'Quel bâtiment ?'),
    },
    gestion_chantier: {
      nom: 'Un chantier est en cours (gestion)', modules: MODULE_GESTION,
      nouveau: (doc) => ({ type: 'gestion_chantier', batiment: doc.data.batiments?.[0]?.id || '' }),
      champs: (doc, c) => [{ key: 'batiment', label: 'Bâtiment', type: 'select', value: c.batiment, choices: choixBatiments(doc, c.batiment) }],
      depuis: (v) => ({ type: 'gestion_chantier', batiment: v.batiment }),
      valide: (c) => (c.batiment ? null : 'Quel bâtiment ?'),
    },
    gestion_stock: {
      nom: 'Le stock a assez d\'une ressource (gestion)', modules: MODULE_GESTION,
      nouveau: (doc) => ({ type: 'gestion_stock', ressource: doc.data.ressources?.[0]?.id || '', min: 10 }),
      champs: (doc, c) => [
        { key: 'ressource', label: 'Ressource', type: 'select', value: c.ressource, choices: choixRessources(doc, c.ressource) },
        { key: 'min', label: 'Au moins', type: 'number', value: c.min, min: 0, max: 99999 },
      ],
      depuis: (v) => ({ type: 'gestion_stock', ressource: v.ressource, min: clamp(Math.round(v.min) || 0, 0, 99999) }),
      valide: (c) => (c.ressource ? null : 'Quelle ressource ?'),
    },
    gestion_habitants: {
      nom: 'Le domaine a assez d\'habitants (gestion)', modules: MODULE_GESTION,
      nouveau: () => ({ type: 'gestion_habitants', min: 1 }),
      champs: (doc, c) => [{ key: 'min', label: 'Au moins', type: 'number', value: c.min, min: 0, max: 9999, unit: 'habitants' }],
      depuis: (v) => ({ type: 'gestion_habitants', min: clamp(Math.round(v.min) || 0, 0, 9999) }),
    },
  });
  const nomInterrupteur = (doc, id) => doc.data.interrupteurs.find((i) => i.id === id)?.nom || id;
  function resumeCondition(doc, c) {
    if (!c) return '…';
    if (c.type === 'interrupteur') return `« ${nomInterrupteur(doc, c.id)} » ${c.valeur ? 'allumé' : 'éteint'}`;
    if (c.type === 'local') return c.valeur ? 'déjà fait' : 'pas encore fait';
    if (c.type === 'bonus') return c.id ? `le groupe a le bonus « ${c.id} »` : 'le groupe a un bonus';
    if (c.type === 'objet') return `a ${c.min > 1 ? `au moins ${c.min} × ` : ''}${c.objet}`;
    if (c.type === 'quete') return `quête « ${quete(doc, c.quete)?.titre || c.quete} » ${libelle(ETATS_QUETE, c.etat).toLowerCase()}${c.etat === 'en_cours' && c.etape ? `, étape ${c.etape} ou plus` : ''}`;
    if (c.type === 'compteur') return `${libelle(COMPTEURS, c.compteur).toLowerCase()} ≥ ${c.min}`;
    if (c.type === 'argent') return `a au moins ${c.min} ${monnaie(doc)}`;
    if (c.type === 'badge') return `a le badge « ${nomBadge(doc, c.badge)} »`;
    if (c.type === 'membre') return `${nomData(doc, 'personnages', c.personnage)} est avec le joueur`;
    if (c.type === 'moment') return libelle(MOMENTS, c.moment).replace(/ \(.*\)$/, '').toLowerCase();
    if (c.type === 'variable') return `« ${nomVariable(doc, c.id)} » ${libelle(COMPARAISONS, c.comparaison).replace(/ \(.*\)$/, '')} ${typeof c.valeur === 'string' ? `« ${c.valeur} »` : c.valeur}`;
    if (c.type === 'jdr_perception') return `Perception passive du groupe ≥ ${c.min}`;
    if (c.type === 'jdr_maitrise') return `un héros maîtrise ${jdrNom(doc, 'competences', c.competence)}`;
    if (c.type === 'jdr_etat') return c.valeur === false ? `personne n'est ${jdrNom(doc, 'etats', c.etat).toLowerCase()}` : `un héros est ${jdrNom(doc, 'etats', c.etat).toLowerCase()}`;
    if (c.type === 'jdr_classe') return `un héros est ${nomData(doc, 'classes_jdr', c.classe)}`;
    if (c.type === 'jdr_origine') return `un héros est ${nomData(doc, 'origines', c.origine)}`;
    if (c.type === 'jdr_niveau') return `un héros est au moins niveau ${c.min}`;
    if (c.type === 'jour') return `le jour ${libelle(COMPARAISONS, c.comparaison).replace(/ \(.*\)$/, '')} ${c.valeur}`;
    if (c.type === 'gestion_batiment') return `${c.min > 1 ? `au moins ${c.min} × ` : ''}« ${nomData(doc, 'batiments', c.batiment)} » construit`;
    if (c.type === 'gestion_chantier') return `chantier de « ${nomData(doc, 'batiments', c.batiment)} » en cours`;
    if (c.type === 'gestion_stock') return `au moins ${c.min} ${nomData(doc, 'ressources', c.ressource)} au stock`;
    if (c.type === 'gestion_habitants') return `au moins ${c.min} habitant${c.min > 1 ? 's' : ''} au domaine`;
    return `condition inconnue (${c.type})`;
  }
  const resumeCommande = (doc, c, ev) => (COMMANDES[c.type] ? COMMANDES[c.type].resume(doc, c, ev) : `Commande inconnue (${c.type}) : gardée telle quelle`);

  // --- Lire un événement (fichier, Claude) : on complète et on corrige ce qui manque ---
  function normCondition(c) {
    if (!c || typeof c !== 'object') return null;
    switch (c.type) {
      case 'interrupteur': return { type: 'interrupteur', id: str(c.id), valeur: vrai(c.valeur) };
      case 'local': return { type: 'local', valeur: vrai(c.valeur) };
      case 'objet': return { type: 'objet', objet: str(c.objet), min: Math.max(1, int(c.min, 1)) };
      case 'bonus': return { type: 'bonus', id: str(c.id).slice(0, 80) };
      case 'quete': return { type: 'quete', quete: str(c.quete), etat: pick(c.etat, ETATS_QUETE, 'en_cours'), etape: Math.max(0, int(c.etape, 0)) };
      case 'compteur': return { type: 'compteur', compteur: pick(c.compteur, COMPTEURS, 'captures'), min: Math.max(0, int(c.min, 1)) };
      case 'argent': return { type: 'argent', min: clamp(int(c.min, 0), 0, 9999999) };
      case 'badge': return { type: 'badge', badge: str(c.badge) };
      case 'membre': return { type: 'membre', personnage: str(c.personnage) };
      case 'moment': return { type: 'moment', moment: pick(c.moment, MOMENTS, 'nuit') };
      case 'variable': return { type: 'variable', id: str(c.id), comparaison: pick(c.comparaison, COMPARAISONS, '>='), valeur: valeurVariable(c.valeur ?? 0) };
      case 'jdr_perception': return { type: 'jdr_perception', min: clamp(int(c.min, 10), 1, 40) };
      case 'jdr_maitrise': return { type: 'jdr_maitrise', competence: str(c.competence) };
      case 'jdr_etat': return { type: 'jdr_etat', etat: str(c.etat), valeur: c.valeur !== false };
      case 'jdr_classe': return { type: 'jdr_classe', classe: str(c.classe) };
      case 'jdr_origine': return { type: 'jdr_origine', origine: str(c.origine) };
      case 'jdr_niveau': return { type: 'jdr_niveau', min: clamp(int(c.min, 1), 1, 20) };
      case 'jour': return { type: 'jour', comparaison: pick(c.comparaison, COMPARAISONS, '>='), valeur: clamp(int(c.valeur, 1), 1, 99999) };
      case 'gestion_batiment': return { type: 'gestion_batiment', batiment: str(c.batiment), min: clamp(int(c.min, 1), 1, 999) };
      case 'gestion_chantier': return { type: 'gestion_chantier', batiment: str(c.batiment) };
      case 'gestion_stock': return { type: 'gestion_stock', ressource: str(c.ressource), min: clamp(int(c.min, 0), 0, 99999) };
      case 'gestion_habitants': return { type: 'gestion_habitants', min: clamp(int(c.min, 0), 0, 9999) };
      default: return { ...c }; // une condition d'une version plus récente : gardée telle quelle
    }
  }
  const normListe = (liste) => (Array.isArray(liste) ? liste.map(normCommande).filter(Boolean) : []);
  function normCommande(c) {
    if (!c || typeof c !== 'object') return null;
    switch (c.type) {
      case 'dire': return { type: 'dire', qui: str(c.qui), expression: str(c.expression) || 'normal', texte: str(c.texte) };
      case 'choix': return { type: 'choix', options: (Array.isArray(c.options) ? c.options : []).slice(0, 4).map((o) => ({ texte: str(o?.texte ?? o), commandes: normListe(o?.commandes) })) };
      case 'si': return { type: 'si', condition: normCondition(c.condition) || { type: 'local', valeur: true }, alors: normListe(c.alors), sinon: normListe(c.sinon) };
      case 'commentaire': return { type: 'commentaire', texte: str(c.texte) };
      case 'fin': case 'soigner': case 'ecran_ev': case 'ecran_boites': return { type: c.type };
      case 'interrupteur': return { type: 'interrupteur', id: str(c.id), valeur: vrai(c.valeur) };
      case 'local': return { type: 'local', valeur: vrai(c.valeur) };
      case 'attendre': return { type: 'attendre', ms: clamp(int(c.ms, 500), 0, 60000) };
      case 'objet': return { type: 'objet', action: c.action === 'retirer' ? 'retirer' : 'donner', objet: str(c.objet), nombre: clamp(int(c.nombre, 1), 1, 999) };
      case 'creature': case 'combat_sauvage': return { type: c.type, creature: str(c.creature), niveau: clamp(int(c.niveau, 5), 1, 100) };
      case 'combat_dresseur': return { type: 'combat_dresseur', dresseur: str(c.dresseur) };
      case 'teleporter': return { type: 'teleporter', carte: str(c.carte), x: Math.max(0, int(c.x)), y: Math.max(0, int(c.y)), direction: pick(c.direction, Doc.DIRECTIONS, 'bas') };
      case 'quete': return { type: 'quete', quete: str(c.quete), action: pick(c.action, [['commencer'], ['etape'], ['finir']], 'commencer'), etape: Math.max(1, int(c.etape, 1)) };
      case 'composer_equipe': return { type: 'composer_equipe', nombre: clamp(int(c.nombre, 6), 1, 6), niveau: clamp(int(c.niveau, 50), 1, 100), titre: str(c.titre).slice(0, 60), garder: c.garder !== false, pour: c.pour === 'adversaire' ? 'adversaire' : 'soi' };
      case 'boutique': return { type: 'boutique', boutique: str(c.boutique) };
      case 'argent': return { type: 'argent', action: c.action === 'retirer' ? 'retirer' : 'donner', montant: clamp(int(c.montant, 1), 1, 9999999) };
      case 'badge': return { type: 'badge', badge: str(c.badge) };
      case 'personnaliser': return { type: 'personnaliser', nom: c.nom !== false, tenue: c.tenue !== false };
      case 'tenue': return { type: 'tenue', tenue: str(c.tenue) };
      case 'groupe': return { type: 'groupe', action: c.action === 'quitter' ? 'quitter' : 'rejoindre', personnage: str(c.personnage), niveau: clamp(int(c.niveau, 0), 0, 999) };
      case 'combat_groupe': return { type: 'combat_groupe', groupe: str(c.groupe) };
      // Tafl 0.32 : le pack JDR.
      case 'test': return { type: 'test', competence: str(c.competence) || 'perception', dd: clamp(int(c.dd, 10), 1, 40), qui: pick(c.qui, QUI_TEST, 'choix'), avantage: Boolean(c.avantage), desavantage: Boolean(c.desavantage) && !c.avantage, quoi: str(c.quoi), variable: str(c.variable), reussi: normListe(c.reussi), rate: normListe(c.rate) };
      case 'sauvegarde': return { type: 'sauvegarde', carac: str(c.carac) || 'dex', dd: clamp(int(c.dd, 10), 1, 40), qui: pick(c.qui, QUI_VISES, 'tous'), quoi: str(c.quoi), degats: lireDes(c.degats) ? str(c.degats).trim() : '', type_degats: str(c.type_degats), moitie: c.moitie !== false, etat: str(c.etat), reussi: normListe(c.reussi), rate: normListe(c.rate) };
      case 'test_oppose': return { type: 'test_oppose', competence: str(c.competence) || 'athletisme', qui: pick(c.qui, QUI_TEST, 'choix'), nom_adverse: str(c.nom_adverse), monstre: str(c.monstre), competence_adverse: str(c.competence_adverse), contre: clamp(int(c.contre, 0), -10, 30), reussi: normListe(c.reussi), rate: normListe(c.rate) };
      case 'jet': return { type: 'jet', formule: lireDes(c.formule) ? str(c.formule).trim().toLowerCase() : '1d20', quoi: str(c.quoi), variable: str(c.variable) };
      case 'repos': return { type: 'repos', sorte: c.sorte === 'court' ? 'court' : 'long' };
      case 'xp': return { type: 'xp', jalon: Boolean(c.jalon), montant: clamp(int(c.montant, 0), 0, 999999) };
      case 'etat': return { type: 'etat', action: c.action === 'retirer' ? 'retirer' : 'ajouter', etat: str(c.etat), qui: pick(c.qui, QUI_VISES, 'tous') };
      case 'creer_personnage': return { type: 'creer_personnage' };
      case 'musique': return { type: 'musique', fichier: Donnees.son(c.fichier, ['aucune']) };
      case 'son': return { type: 'son', fichier: Donnees.son(c.fichier) };
      case 'heure': return { type: 'heure', action: c.action === 'regler' ? 'regler' : 'avancer', heures: clamp(int(c.heures, 8), 0, 23) };
      case 'dormir': return { type: 'dormir', texte: str(c.texte), soigner: vrai(c.soigner), heure: c.heure === '' || c.heure === null || c.heure === undefined ? '' : clamp(int(c.heure, 8), 0, 23) };
      case 'gestion_construire': return { type: 'gestion_construire', batiment: str(c.batiment), annoncer: vrai(c.annoncer), reussi: normListe(c.reussi), rate: normListe(c.rate) };
      case 'gestion_placer': return { type: 'gestion_placer', batiment: str(c.batiment), annoncer: vrai(c.annoncer), reussi: normListe(c.reussi), rate: normListe(c.rate) };
      case 'gestion_stock': return { type: 'gestion_stock', action: c.action === 'retirer' ? 'retirer' : 'ajouter', ressource: str(c.ressource), nombre: clamp(int(c.nombre, 1), 1, 99999), annoncer: vrai(c.annoncer) };
      case 'gestion_deposer': return { type: 'gestion_deposer', annoncer: vrai(c.annoncer) };
      case 'gestion_sortir': return { type: 'gestion_sortir' };
      case 'gestion_habitants': return { type: 'gestion_habitants', action: c.action === 'retirer' ? 'retirer' : 'ajouter', nombre: clamp(int(c.nombre, 1), 1, 999), forcer: Boolean(c.forcer), annoncer: vrai(c.annoncer) };
      case 'gestion_domaine': return { type: 'gestion_domaine' };
      case 'gestion_repos': return { type: 'gestion_repos', batiment: str(c.batiment), annoncer: vrai(c.annoncer), reussi: normListe(c.reussi), rate: normListe(c.rate) };
      case 'bonus': return { type: 'bonus', action: c.action === 'retirer' ? 'retirer' : 'donner', id: str(c.id).slice(0, 80), nom: str(c.nom).slice(0, 60),
        stats: (Array.isArray(c.stats) ? c.stats : []).filter((q) => q && q.stat).slice(0, 4).map((q) => ({ stat: str(q.stat), pourcent: clamp(int(q.pourcent, 10), -90, 200) })),
        combats: clamp(int(c.combats, 0), 0, 99), nuit: c.nuit !== false, annoncer: vrai(c.annoncer) };
      case 'variable': {
        const action = pick(c.action, ACTIONS_VARIABLE, 'regler');
        return { type: 'variable', id: str(c.id), action, valeur: action === 'regler' ? valeurVariable(c.valeur ?? 0) : Number(c.valeur) || 0 };
      }
      case 'script': {
        // Les réglages : des nombres, des textes, des oui/non (rien d'autre ne passe dans un bloc).
        const params = {};
        for (const [k, v] of Object.entries(c.params && typeof c.params === 'object' && !Array.isArray(c.params) ? c.params : {})) {
          if (typeof v === 'number' && Number.isFinite(v)) params[k] = v;
          else if (typeof v === 'boolean') params[k] = v;
          else if (v !== null && v !== undefined && typeof v !== 'object') params[k] = String(v).slice(0, 500);
        }
        return { type: 'script', nom: str(c.nom), params };
      }
      default: return { ...c };
    }
  }
  const normPage = (p) => ({ conditions: (Array.isArray(p?.conditions) ? p.conditions : []).map(normCondition).filter(Boolean), cache: Boolean(p?.cache), commandes: normListe(p?.commandes) });
  function normEvent(e, fallbackId, width, height, tileCount = Infinity) {
    const tuile = int(e?.apparence?.tuile, -1);
    return {
      id: str(e?.id) || fallbackId,
      nom: str(e?.nom),
      type: pick(e?.type, TYPES, 'pnj'),
      x: clamp(int(e?.x), 0, width - 1),
      y: clamp(int(e?.y), 0, height - 1),
      apparence: { personnage: str(e?.apparence?.personnage), tuile: tuile >= 0 && tuile < tileCount ? tuile : -1 },
      direction: pick(e?.direction, Doc.DIRECTIONS, 'bas'),
      deplacement: pick(e?.deplacement, DEPLACEMENTS, 'fixe'),
      traversable: Boolean(e?.traversable),
      declenchement: pick(e?.declenchement, DECLENCHEMENTS, 'parler'),
      pages: (Array.isArray(e?.pages) && e.pages.length ? e.pages : [{}]).map(normPage),
      ...(pick(e?.type, TYPES, 'pnj') === 'obstacle' ? { obstacle: normObstacle(e?.obstacle) } : {}),
      // Tafl 1.4 (Saga 1.6) : il repousse. Son « déjà fait » s'éteint après ce nombre de nuits (une récolte).
      ...(int(e?.repousse_nuits) > 0 ? { repousse_nuits: clamp(int(e.repousse_nuits), 1, 999) } : {}),
      // Tafl 0.29 : l'événement éclaire (un feu de camp, un PNJ avec une lanterne), quelle que soit sa page.
      ...(e?.lumiere && typeof Donnees !== 'undefined' ? { lumiere: Donnees.normLumiere(e.lumiere) } : {}),
      // Tafl 0.33 (pack JDR) : qui le voit dans le mode table de Saga ('tous' n'est pas écrit).
      ...(e?.visible_par && e.visible_par !== 'tous' && typeof DonneesJdr !== 'undefined' ? { visible_par: DonneesJdr.normVisible(e.visible_par) } : {}),
    };
  }
  function normObstacle(o) {
    const sorte = pick(o?.sorte, SORTES_OBSTACLE, 'couper');
    return { sorte, objet: Doc.slug(o?.objet ?? OBJETS_OBSTACLE[sorte], ''), message: str(o?.message), repousse: Boolean(o?.repousse) };
  }
  function normEvents(list, width, height, tileCount) {
    const out = [];
    (Array.isArray(list) ? list : []).forEach((raw, i) => {
      const e = normEvent(raw, `ev-${i + 1}`, width, height, tileCount);
      let id = e.id, n = 2;
      while (out.some((o) => o.id === id)) id = `${e.id}-${n++}`;
      e.id = id;
      out.push(e);
    });
    return out;
  }

  const emptyData = () => ({ personnages: [], quetes: [], interrupteurs: [], variables: [], ...(typeof Donnees !== 'undefined' ? Donnees.vides() : {}) });
  // Les données du jeu, lues d'un fichier (ou données par Claude) : identifiants uniques, valeurs sûres.
  function normData(d, tileCount = Infinity) {
    const uniques = (list) => {
      const out = [];
      for (const o of list) { o.id = ident(o.id, out, o.id || 'x'); out.push(o); }
      return out;
    };
    const arr = (v) => (Array.isArray(v) ? v : []);
    return {
      personnages: uniques(arr(d?.personnages).map((p, i) => {
        const tuile = int(p?.tuile, -1);
        return {
          id: Doc.slug(p?.id || p?.nom, `personnage-${i + 1}`),
          nom: str(p?.nom || p?.id, `Personnage ${i + 1}`),
          description: str(p?.description),
          heros: Boolean(p?.heros),
          couleur: normalizeHex(p?.couleur) || '',
          tuile: tuile >= 0 && tuile < tileCount ? tuile : -1,
          portraits: arr(p?.portraits).filter((x) => /^data:image\/(png|gif|webp|jpeg|bmp);base64,/.test(x?.png)).map((x) => ({ expression: Doc.slug(x.expression, 'normal'), png: x.png })),
          sprite: Sprites.norm(p?.sprite), // Tafl 0.12 : sa planche de marche (voir sprites.js), ou null
          // Tafl 0.16 : les tenues que le joueur peut choisir pour le héros (chacune son sprite).
          tenues: uniques(arr(p?.tenues).filter((t) => t && typeof t === 'object').map((t, k) => ({
            id: Doc.slug(t.id || t.nom, `tenue-${k + 1}`), nom: str(t.nom || t.id, `Tenue ${k + 1}`), sprite: Sprites.norm(t.sprite),
          }))),
          // Tafl 0.25 (pack JRPG) : sa classe, son niveau et son équipement quand il rejoint le groupe.
          classe: Doc.slug(p?.classe, ''),
          niveau: clamp(int(p?.niveau, 1), 1, 999),
          equipement: Object.fromEntries(['arme', 'bouclier', 'casque', 'armure', 'accessoire'].map((k) => [k, Doc.slug(p?.equipement?.[k], '')]).filter(([, v]) => v)),
          // Tafl 0.32 (pack JDR) : la fiche d'un pré-tiré (donnees-jdr.js › normFiche).
          ...(p?.jdr && typeof DonneesJdr !== 'undefined' ? { jdr: DonneesJdr.normFiche(p.jdr) } : {}),
          // Tafl 1.10 (temps réel, pack action) : ses animations et ses boîtes (donnees-action.js › normPersonnage).
          ...(typeof DonneesAction !== 'undefined' ? DonneesAction.normPersonnage(p) : {}),
        };
      })),
      quetes: uniques(arr(d?.quetes).map((q, i) => ({
        id: Doc.slug(q?.id || q?.titre, `quete-${i + 1}`),
        titre: str(q?.titre || q?.id, `Quête ${i + 1}`),
        description: str(q?.description),
        secondaire: Boolean(q?.secondaire),
        suivante: str(q?.suivante),
        personnages: arr(q?.personnages).map((p) => str(p)).filter(Boolean),
        etapes: arr(q?.etapes).map((s) => ({ texte: str(typeof s === 'string' ? s : s?.texte) })),
      }))),
      interrupteurs: uniques(arr(d?.interrupteurs).map((s, i) => ({
        id: Doc.slug(s?.id || s?.nom, `interrupteur-${i + 1}`),
        nom: str(s?.nom || s?.id, `Interrupteur ${i + 1}`),
        description: str(s?.description),
      }))),
      // Tafl 0.31 : les variables (un nombre ou un texte), avec leur valeur au début d'une partie.
      variables: uniques(arr(d?.variables).map((v, i) => ({
        id: Doc.slug(v?.id || v?.nom, `variable-${i + 1}`),
        nom: str(v?.nom || v?.id, `Variable ${i + 1}`),
        description: str(v?.description),
        defaut: valeurVariable(v?.defaut ?? 0),
      }))),
      // Tafl 0.8 : types, talents, attaques, créatures, objets, dresseurs, boutiques, réglages (donnees.js).
      ...(typeof Donnees !== 'undefined' ? Donnees.normer(d) : {}),
    };
  }

  // Les interrupteurs utilisés par un événement mais pas encore dans les données : ils sont créés.
  function interrupteursManquants(doc, ev) {
    const connus = new Set(doc.data.interrupteurs.map((i) => i.id));
    const out = [];
    const voir = (c) => { if (c?.type === 'interrupteur' && c.id && !connus.has(c.id)) { connus.add(c.id); const nom = c.id.replace(/-/g, ' ');
        out.push({ id: c.id, nom: nom[0].toUpperCase() + nom.slice(1), description: '' }); } };
    for (const p of ev.pages) {
      p.conditions.forEach(voir);
      parcourir(p.commandes, (c) => { voir(c); if (c.type === 'si') voir(c.condition); });
    }
    return out;
  }

  // --- Vérifier un script donné par Claude (les erreurs sont dites, rien n'est deviné) ---
  function verifierPages(doc, pages) {
    const erreurs = [];
    if (!Array.isArray(pages) || !pages.length) return { erreurs: ['pages : une liste d\'au moins une page { conditions, cache, commandes }.'], pages: [] };
    const verifCondition = (c, ou) => {
      if (!c || !CONDITIONS[c.type]) return erreurs.push(`${ou} : condition inconnue (${c?.type}) ; possibles : ${Object.keys(CONDITIONS).join(', ')}.`);
      if (c.type === 'interrupteur' && !c.id) erreurs.push(`${ou} : id de l'interrupteur manquant.`);
      if (c.type === 'objet' && !c.objet) erreurs.push(`${ou} : objet manquant.`);
      if (c.type === 'quete' && !quete(doc, c.quete)) erreurs.push(`${ou} : pas de quête « ${c.quete} » (${doc.data.quetes.map((q) => q.id).join(', ') || 'aucune quête : crée-la avec l\'action quete'}).`);
      if (c.type === 'membre' && !perso(doc, c.personnage)) erreurs.push(`${ou} : pas de personnage « ${c.personnage} ».`);
      if (c.type === 'variable' && !variableExiste(c.id)) erreurs.push(`${ou} : pas de variable « ${c.id} » (${variablesConnues()}).`);
      return null;
    };
    // Tafl 0.31 : les variables du jeu, et les commandes déclarées par les scripts JS actifs.
    const variableExiste = (id) => (doc.data.variables || []).some((v) => v.id === id);
    const variablesConnues = () => (doc.data.variables || []).map((v) => v.id).join(', ') || 'aucune : crée-la avec l\'action variable';
    const commandesJs = ScriptsTafl.connu(doc).commandes;
    const verifListe = (liste, ou) => {
      if (!Array.isArray(liste)) { erreurs.push(`${ou} : il faut une liste de commandes.`); return; }
      liste.forEach((c, i) => {
        const ici = `${ou}, commande ${i + 1}`;
        if (!c || !COMMANDES[c.type]) { erreurs.push(`${ici} : type inconnu (${c?.type}) ; possibles : ${Object.keys(COMMANDES).join(', ')}.`); return; }
        if (c.type === 'dire') {
          if (!str(c.texte).trim()) erreurs.push(`${ici} (dire) : texte vide.`);
          if (c.qui && c.qui !== '@evenement' && !perso(doc, c.qui)) erreurs.push(`${ici} (dire) : pas de personnage « ${c.qui} » (${doc.data.personnages.map((p) => p.id).join(', ') || 'aucun : crée-le avec l\'action personnage'} ; "" = texte seul, "@evenement" = le personnage de l'événement).`);
        }
        if (c.type === 'choix') {
          if (!Array.isArray(c.options) || c.options.length < 2 || c.options.length > 4) erreurs.push(`${ici} (choix) : options = 2 à 4 réponses { texte, commandes }.`);
          else c.options.forEach((o, k) => { if (!str(o?.texte).trim()) erreurs.push(`${ici} (choix) : réponse ${k + 1} sans texte.`); if (o?.commandes !== undefined) verifListe(o.commandes, `${ici}, réponse ${k + 1}`); });
        }
        if (c.type === 'si') {
          verifCondition(c.condition, `${ici} (si)`);
          if (c.alors !== undefined) verifListe(c.alors, `${ici}, alors`);
          if (c.sinon !== undefined) verifListe(c.sinon, `${ici}, sinon`);
        }
        if (A_BRANCHES.includes(c.type)) for (const k of ['reussi', 'rate']) if (c[k] !== undefined) verifListe(c[k], `${ici}, ${k}`);
        for (const [type, champ] of [['interrupteur', 'id'], ['objet', 'objet'], ['creature', 'creature'], ['combat_sauvage', 'creature'], ['combat_dresseur', 'dresseur'], ['boutique', 'boutique'], ['combat_groupe', 'groupe'], ['groupe', 'personnage']]) {
          if (c.type === type && !str(c[champ]).trim()) erreurs.push(`${ici} (${type}) : ${champ} manquant.`);
        }
        // Tafl 0.8 : si le jeu a une liste de cette sorte, la référence doit y être.
        for (const [type, champ, sorte] of [['objet', 'objet', 'objets'], ['creature', 'creature', 'creatures'], ['combat_sauvage', 'creature', 'creatures'], ['combat_dresseur', 'dresseur', 'dresseurs'], ['boutique', 'boutique', 'boutiques'], ['combat_groupe', 'groupe', 'groupes'], ['groupe', 'personnage', 'personnages']]) {
          const l = doc.data[sorte] || [];
          if (c.type === type && c[champ] && l.length && !l.some((o) => o.id === c[champ])) erreurs.push(`${ici} (${type}) : pas de ${sorte.replace(/s$/, '')} « ${c[champ]} » dans les données (voir_donnees pour chercher).`);
        }
        if (c.type === 'teleporter' && !Doc.mapById(doc, c.carte)) erreurs.push(`${ici} (teleporter) : pas de carte « ${c.carte} » (${doc.maps.map((m) => m.id).join(', ')}).`);
        if (c.type === 'quete' && !quete(doc, c.quete)) erreurs.push(`${ici} (quete) : pas de quête « ${c.quete} » (${doc.data.quetes.map((q) => q.id).join(', ') || 'aucune : crée-la avec l\'action quete'}).`);
        if (c.type === 'variable') {
          if (!variableExiste(c.id)) erreurs.push(`${ici} (variable) : pas de variable « ${c.id} » (${variablesConnues()}).`);
          if (!['regler', 'ajouter', 'retirer'].includes(c.action)) erreurs.push(`${ici} (variable) : action = regler, ajouter ou retirer.`);
        }
        if (c.type === 'script') {
          const js = commandesJs.find((x) => x.nom === c.nom);
          if (!js) erreurs.push(`${ici} (script) : aucun script actif ne déclare la commande « ${c.nom} » (${commandesJs.map((x) => x.nom).join(', ') || 'aucune : écris-la avec l\'action ecrire_script'}).`);
          else if (c.params !== undefined && (typeof c.params !== 'object' || Array.isArray(c.params))) erreurs.push(`${ici} (script) : params = un objet { ${Object.keys(js.params || {}).join(', ')} }.`);
          else for (const k of Object.keys(c.params || {})) if (!js.params?.[k]) erreurs.push(`${ici} (script) : « ${c.nom} » n'a pas de réglage « ${k} » (${Object.keys(js.params || {}).join(', ') || 'aucun'}).`);
        }
      });
    };
    pages.forEach((p, k) => {
      if (!p || typeof p !== 'object') return erreurs.push(`page ${k + 1} : il faut un objet { conditions, cache, commandes }.`);
      if (p.conditions !== undefined && !Array.isArray(p.conditions)) erreurs.push(`page ${k + 1} : conditions doit être une liste.`);
      (Array.isArray(p.conditions) ? p.conditions : []).forEach((c, i) => verifCondition(c, `page ${k + 1}, condition ${i + 1}`));
      verifListe(p.commandes ?? [], `page ${k + 1}`);
      return null;
    });
    return { erreurs, pages: pages.map(normPage) };
  }

  // Le script d'un événement en texte (pour Claude, et pour s'y retrouver).
  function texte(doc, ev) {
    const lignes = [];
    const liste = (l, n) => {
      for (const c of l) {
        lignes.push(`${'  '.repeat(n)}- ${resumeCommande(doc, c, ev)}`);
        if (c.type === 'choix') c.options.forEach((o) => { lignes.push(`${'  '.repeat(n + 1)}« ${o.texte} » :`); liste(o.commandes, n + 2); });
        if (c.type === 'si') { lignes.push(`${'  '.repeat(n + 1)}alors :`); liste(c.alors, n + 2); if (c.sinon.length) { lignes.push(`${'  '.repeat(n + 1)}sinon :`); liste(c.sinon, n + 2); } }
        if (A_BRANCHES.includes(c.type)) for (const [k, mot] of [['reussi', 'réussi'], ['rate', 'raté']]) if (c[k].length) { lignes.push(`${'  '.repeat(n + 1)}${mot} :`); liste(c[k], n + 2); }
      }
    };
    ev.pages.forEach((p, k) => {
      lignes.push(`Page ${k + 1}${p.conditions.length ? ` (si ${p.conditions.map((c) => resumeCondition(doc, c)).join(' et ')})` : ''}${p.cache ? ' : événement absent' : ''}`);
      liste(p.commandes, 1);
    });
    return lignes.join('\n');
  }
  const decrire = (doc, ev) => `${ev.id} « ${ev.nom || libelle(TYPES, ev.type)} » ${ev.type} (${ev.x}, ${ev.y})${ev.obstacle ? ` [${ev.obstacle.sorte}, objet ${ev.obstacle.objet || 'aucun'}${ev.obstacle.repousse ? ', repousse' : ''}]` : ''}${ev.apparence.personnage ? `, personnage ${ev.apparence.personnage}` : ''}${ev.apparence.tuile >= 0 ? `, tuile ${ev.apparence.tuile}` : ''}, ${ev.declenchement}${ev.traversable ? ', traversable' : ''}${ev.repousse_nuits ? `, repousse après ${ev.repousse_nuits} nuit(s)` : ''}, ${ev.pages.length} page(s)`;

  // --- Un événement neuf, selon son type ---
  function create(doc, type, x, y, id) {
    const dire = (texte, qui = '') => ({ type: 'dire', qui, expression: 'normal', texte });
    const base = { id, nom: libelle(TYPES, type), type, x, y, apparence: { personnage: '', tuile: -1 }, direction: 'bas', deplacement: 'fixe', traversable: false, declenchement: 'parler', pages: [{ conditions: [], cache: false, commandes: [] }] };
    if (type === 'pnj') return { ...base, nom: 'Habitant', deplacement: 'regarde', pages: [{ conditions: [], cache: false, commandes: [dire('Bonjour ! Belle journée, pas vrai ?', '@evenement')] }] };
    if (type === 'panneau') return { ...base, nom: 'Panneau', pages: [{ conditions: [], cache: false, commandes: [dire(`${doc.map.name} : là où tout commence.`)] }] };
    if (type === 'coffre') {
      return { ...base, nom: 'Coffre', pages: [
        { conditions: [], cache: false, commandes: [dire('Tu as trouvé une potion !'), { type: 'objet', action: 'donner', objet: 'potion', nombre: 1 }, { type: 'local', valeur: true }] },
        { conditions: [{ type: 'local', valeur: true }], cache: false, commandes: [dire('Le coffre est vide.')] },
      ] };
    }
    if (type === 'objet') {
      return { ...base, nom: 'Potion', pages: [
        { conditions: [], cache: false, commandes: [dire('Tu ramasses une potion.'), { type: 'objet', action: 'donner', objet: 'potion', nombre: 1 }, { type: 'local', valeur: true }] },
        { conditions: [{ type: 'local', valeur: true }], cache: true, commandes: [] },
      ] };
    }
    // Un obstacle : Saga le gère tout seul (message, question, disparition) ; sa page 1 est le script
    // joué juste après le passage (vide d'habitude, ou un objet caché sous le rocher).
    if (type === 'obstacle') return { ...base, nom: 'Petit arbre', obstacle: normObstacle({ sorte: 'couper' }) };
    return { ...base, nom: 'Déclencheur', traversable: true, declenchement: 'toucher' };
  }

  // --- L'aperçu d'un dialogue : portrait, nom en couleur, texte (comme dans le jeu) ---
  function apercuDialogue(box, doc, c, ev) {
    if (!box) return;
    box.replaceChildren();
    const id = quiReel(c.qui, ev);
    const p = perso(doc, id);
    const img = portrait(doc, id, c.expression);
    if (img) box.append(el('img', { className: 'dialogue-portrait', src: img.png, alt: '' }));
    const bulle = el('div', { className: 'dialogue-bulle' });
    if (c.qui) bulle.append(el('div', { className: 'dialogue-nom', textContent: p?.nom || nomQui(doc, c.qui, ev), style: { color: p?.couleur || '' } }));
    const premier = String(c.texte || '').split(/\n\s*\n/)[0].replace(/\{joueur\}/g, 'Ragna');
    bulle.append(el('div', { className: 'dialogue-texte', textContent: premier || '…' }));
    box.append(bulle);
    if (p && !img && c.qui) box.append(el('div', { className: 'dialogue-note', textContent: `${p.nom} n'a pas encore de portrait « ${c.expression} ».` }));
  }

  // --- Fenêtres de commande et de condition ---
  async function formCommande(doc, c, ev) {
    const def = COMMANDES[c.type];
    if (!def?.champs) return c;
    listes(doc);
    const v = await Dialogs.form({ title: def.nom, okLabel: 'OK', width: def.largeur || 470, fields: def.champs(doc, c, ev), onInput: def.onInput ? (values, f) => def.onInput(values, f, doc, ev) : undefined });
    if (!v) return null;
    const out = { ...c, ...def.depuis(v, c) };
    const err = def.valide?.(out);
    if (err) { notify(err, 'warning', 3500); return null; }
    return out;
  }
  async function formCondition(doc, c) {
    const def = CONDITIONS[c.type];
    if (!def) { notify(`Condition inconnue (${c.type}) : elle vient d'une version plus récente de Tafl.`, 'warning'); return null; }
    listes(doc);
    const v = await Dialogs.form({ title: `Condition : ${def.nom.toLowerCase()}`, okLabel: 'OK', width: 470, fields: def.champs(doc, c), onInput: def.onInput });
    if (!v) return null;
    const out = def.depuis(v, c);
    const err = def.valide?.(out);
    if (err) { notify(err, 'warning', 3500); return null; }
    return out;
  }
  // Un menu dont on attend le choix.
  const choisir = (items, x, y) => new Promise((resolve) => Menus.open(items.map((it) => it && { ...it, run: () => resolve(it.value) }), x, y));
  // Les commandes et conditions d'un autre pack de règles ne sont pas proposées (packs : sinon toutes).
  // aussiSi(doc) : une commande d'un autre pack que le jeu utilise quand même (des badges déjà créés).
  // Tafl 1.3 : celles d'un module (modules : ['gestion']) seulement si le jeu active ce module.
  const duModule = (doc, d) => !d.modules || d.modules.some((m) => (doc?.data?.reglages?.modules || []).includes(m));
  const duPack = (doc, d) => (!d.packs || d.packs.includes(doc?.data?.reglages?.regles || 'pokemon') || Boolean(d.aussiSi?.(doc))) && duModule(doc, d);
  const menuConditions = (doc) => Object.entries(CONDITIONS).filter(([, d]) => duPack(doc, d)).map(([k, d]) => ({ label: d.nom, value: k }));
  function menuCommandes(doc) {
    const items = [];
    let groupe = null;
    for (const [k, d] of Object.entries(COMMANDES)) {
      if (!duPack(doc, d)) continue;
      if (d.groupe !== groupe) { if (groupe) items.push(null); groupe = d.groupe; }
      items.push({ label: d.nom, value: k });
    }
    return items;
  }

  // Une commande neuve de ce type, remplie dans sa fenêtre (null si on annule). Un « si » demande
  // d'abord sa condition, dans un menu ouvert en (x, y).
  async function nouvelleCommande(doc, type, ev, x, y) {
    if (!COMMANDES[type]) return null;
    if (type === 'si') {
      const ct = await choisir(menuConditions(doc), x, y);
      const cond = ct && await formCondition(doc, CONDITIONS[ct].nouveau(doc));
      return cond ? { type: 'si', condition: cond, alors: [], sinon: [] } : null;
    }
    const neuf = COMMANDES[type].nouveau(doc);
    return COMMANDES[type].champs ? formCommande(doc, neuf, ev) : neuf;
  }

  // --- Les grandes fenêtres (au-dessus de Tafl, sous les petites fenêtres et les menus) ---
  let courant = null; // la fenêtre ouverte : { fermer() }
  const isOpen = () => Boolean(courant);
  // Tafl 0.30 : l'éditeur ouvert en pleine page (espaces Événements et Données, espaces.js) :
  // { fermer, valider, jeter, suivi }. Il ne bloque ni les autres fenêtres ni les raccourcis de Tafl.
  let courantPage = null;
  const pageOuverte = () => courantPage;
  // Échap ferme d'abord un menu ouvert : on regarde avant que le menu ne se ferme.
  let menuOuvert = false;
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') menuOuvert = Menus.isOpen(); }, true);
  // Appelé par les raccourcis de Tafl : true si la touche est pour la fenêtre ouverte.
  function handleKey(e) {
    if (!courant) return courantPage ? handleKeyPage(e) : false;
    if (e.key === 'Escape' && !menuOuvert) courant.fermer();
    const ctrl = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (ctrl && e.key === 'Enter') courant.valider?.();
    // Tafl 0.28 : annuler et refaire dans la fenêtre. Dans une case de texte, Ctrl+Z reste celui du
    // texte (il défait les lettres tapées) ; ailleurs, il défait le dernier changement de la fenêtre.
    const texte = /INPUT|TEXTAREA/.test(document.activeElement?.tagName) && !/checkbox|radio|range|color|button/.test(document.activeElement?.type);
    if (ctrl && courant.suivi && !texte && !Dialogs.isOpen()) {
      if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); courant.suivi.refaire(); }
      else if (k === 'z') { e.preventDefault(); courant.suivi.annuler(); }
    }
    return true;
  }

  // Dans une page, seuls Ctrl+Entrée (appliquer) et Ctrl+Z / Ctrl+Y (hors des cases de texte) sont
  // pour l'éditeur ; le reste (Ctrl+S, Ctrl+K, changer d'espace…) va à Tafl.
  function handleKeyPage(e) {
    const ctrl = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (Dialogs.isOpen()) return false;
    if (ctrl && e.key === 'Enter') { e.preventDefault(); courantPage.valider?.(); return true; }
    const texte = /INPUT|TEXTAREA/.test(document.activeElement?.tagName) && !/checkbox|radio|range|color|button/.test(document.activeElement?.type);
    if (ctrl && courantPage.suivi && !texte) {
      if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); courantPage.suivi.refaire(); return true; }
      if (k === 'z') { e.preventDefault(); courantPage.suivi.annuler(); return true; }
    }
    return false;
  }

  // Tafl 0.28 : l'historique d'une grande fenêtre (événement, données du jeu). La fenêtre travaille
  // sur une copie `work` ; après chaque geste (clic, choix, glisser-déposer, texte tapé puis une
  // petite pause), on regarde ce qui a changé, clé par clé (work.pages, work.creatures…), et on garde
  // l'ancienne version des seules clés changées. Annuler les remet et redessine la fenêtre.
  function suivi(work, redessiner, { max = 100, nom = 'la fenêtre' } = {}) {
    const json = (v) => (v === undefined ? undefined : JSON.stringify(v));
    let photo = Object.fromEntries(Object.keys(work).map((k) => [k, json(work[k])]));
    const pile = [], refaites = [];
    function differences() {
      const avant = {}, apres = {};
      for (const k of new Set([...Object.keys(photo), ...Object.keys(work)])) {
        const j = json(work[k]);
        if (j !== photo[k]) { avant[k] = photo[k]; apres[k] = j; }
      }
      return Object.keys(avant).length ? { avant, apres } : null;
    }
    function noter() {
      const d = differences();
      if (!d) return;
      pile.push(d.avant);
      if (pile.length > max) pile.shift();
      refaites.length = 0;
      Object.assign(photo, d.apres);
    }
    function remettre(etat) {
      for (const [k, j] of Object.entries(etat)) {
        if (j === undefined) delete work[k]; else work[k] = JSON.parse(j);
        photo[k] = j;
      }
      redessiner();
    }
    function bouger(depuis, vers, mot) {
      noter(); // ce qui vient d'être tapé compte comme un pas
      const etat = depuis.pop();
      if (!etat) { notify(`Rien à ${mot} dans ${nom}.`, 'info', 1800); return; }
      vers.push(Object.fromEntries(Object.keys(etat).map((k) => [k, photo[k]])));
      remettre(etat);
    }
    let attente = 0;
    const bientot = () => { clearTimeout(attente); attente = setTimeout(noter, 0); };
    const apresPause = () => { clearTimeout(attente); attente = setTimeout(noter, 700); };
    const gestes = ['click', 'change', 'drop', 'pointerup', 'dragend'];
    for (const g of gestes) document.addEventListener(g, bientot, true);
    document.addEventListener('input', apresPause, true);
    return {
      noter,
      annuler: () => bouger(pile, refaites, 'annuler'),
      refaire: () => bouger(refaites, pile, 'refaire'),
      arreter() {
        clearTimeout(attente);
        for (const g of gestes) document.removeEventListener(g, bientot, true);
        document.removeEventListener('input', apresPause, true);
      },
    };
  }
  // page (Tafl 0.30) : l'élément où poser l'éditeur en pleine page, au lieu d'une fenêtre par-dessus Tafl.
  function fenetre({ titre, icone: ic, largeur = 1180, page = null }) {
    const root = el('div', { className: page ? 'editor-page' : 'editor-overlay' });
    const card = el('div', { className: `editor${page ? ' en-page' : ''}`, style: page ? {} : { width: `min(${largeur}px, calc(100vw - 48px))` } });
    const headIcon = icon(ic);
    const title = el('span', { className: 'editor-title', textContent: titre });
    const close = el('button', { className: 'icon-button', title: 'Fermer (Échap)' }, [icon('close')]);
    const head = el('header', {}, [headIcon, title]);
    const tabs = el('nav', { className: 'editor-tabs' });
    head.append(tabs, close);
    const body = el('div', { className: 'editor-body' });
    const hint = el('span', { className: 'editor-hint' });
    const foot = el('footer', {}, [hint]);
    card.append(head, body, foot);
    root.append(card);
    (page || document.body).append(root);
    if (page) close.hidden = true;
    const bouton = (label, run, primary = false) => {
      const b = el('button', { className: `button${primary ? ' primary' : ''}`, textContent: label });
      b.onclick = run;
      foot.append(b);
      return b;
    };
    return { root, card, body, tabs, close, hint, bouton, setTitle: (t) => { title.textContent = t; }, setIcon: (n) => { headIcon.className = `codicon codicon-${n}`; } };
  }
  const champ = (label, input, title = '') => el('label', { className: `field${input.type === 'checkbox' ? ' checkbox-row' : ''}`, title }, [el('span', { className: 'field-label', textContent: label }), input]);
  function selectEl(choices, value, onchange) {
    const s = el('select');
    for (const [k, l] of choices) s.add(new Option(l, k));
    s.value = String(value);
    s.onchange = () => onchange(s.value);
    return s;
  }
  const section = (text, ...extra) => el('div', { className: 'editor-section' }, [el('span', { textContent: text }), ...extra]);
  const petitBouton = (ic, title, run) => {
    const b = el('button', { className: 'icon-button', title }, [icon(ic)]);
    b.onclick = (e) => { e.stopPropagation(); run(e); };
    return b;
  };
  // Confirme avant de jeter des modifications.
  async function abandonner(change) {
    if (!change) return true;
    return Dialogs.ask('Modifications non validées', 'Fermer sans garder ce que tu as changé dans cette fenêtre ?', [
      { label: 'Continuer à modifier', value: false },
      { label: 'Fermer sans garder', value: true, primary: true },
    ]);
  }

  // --- L'éditeur d'un événement ---
  // Rend { event, interrupteurs } (les interrupteurs à créer), 'supprimer', ou null (annulé).
  // page : l'élément où l'ouvrir en pleine page (espace Événements), sinon une fenêtre.
  function editEvent(doc, ev, { nouveau = false, page: hote = null } = {}) {
    if (hote ? courantPage : courant) return Promise.resolve(null);
    return new Promise((resolve) => {
      const map = doc.map;
      const work = structuredClone(ev);
      const avant = JSON.stringify(work);
      let page = 0;
      let vue = 'blocs';
      try { vue = localStorage.getItem('tafl.vueScript') === 'liste' ? 'liste' : 'blocs'; } catch { /* sans mémoire : les blocs */ }
      const etatBlocs = { choisi: null, boite: 0, theme: '' };
      const w = fenetre({ titre: '', icone: TYPE_ICONS[work.type], largeur: 1600, page: hote });
      w.card.classList.add('event-editor');
      const majTitre = () => { w.setTitle(`${nouveau ? 'Nouvel événement' : 'Événement'} « ${work.nom || libelle(TYPES, work.type)} » sur ${map.name}`); w.setIcon(TYPE_ICONS[work.type]); };
      majTitre();
      const side = el('div', { className: 'editor-side' });
      const main = el('div', { className: 'editor-main' });
      w.body.append(side, main);

      // Colonne de gauche : ce qu'est l'événement (redessinée après Ctrl+Z).
      let nom = null;
      function renderSide() {
        side.replaceChildren();
        nom = el('input', { type: 'text', value: work.nom, placeholder: 'Maman, Prof. Chêne, Panneau du bourg…' });
        nom.oninput = () => { work.nom = nom.value; majTitre(); };
        const num = (key, max) => {
          const i = el('input', { type: 'number', min: 0, max, value: work[key] });
          i.oninput = () => { work[key] = clamp(Math.round(Number(i.value)) || 0, 0, max); };
          return i;
        };
        const apercuTuile = el('canvas', { className: 'tile-apercu', width: doc.tileSize, height: doc.tileSize });
        const majApercu = () => {
          const g = apercuTuile.getContext('2d');
          g.clearRect(0, 0, apercuTuile.width, apercuTuile.height);
          const t = doc.tiles[work.apparence.tuile >= 0 ? work.apparence.tuile : perso(doc, work.apparence.personnage)?.tuile ?? -1];
          if (t) g.drawImage(Doc.tileCanvas(t, doc.tileSize), 0, 0);
          apercuTuile.hidden = !t;
        };
        // Tafl 1.4 (Saga 1.6) : une récolte qui repousse (son « déjà fait » s'éteint après N nuits).
        const repousse = el('input', { type: 'number', min: 0, max: 999, value: work.repousse_nuits || 0 });
        repousse.onchange = () => { const n = Math.max(0, Math.min(999, Math.round(Number(repousse.value) || 0))); repousse.value = n; if (n) work.repousse_nuits = n; else delete work.repousse_nuits; };
        const traversable = el('input', { type: 'checkbox', checked: work.traversable });
        traversable.onchange = () => { work.traversable = traversable.checked; };
        const aide = el('p', { className: 'modal-info' });
        const majAide = () => {
          aide.textContent = {
            pnj: 'Un habitant, un dresseur, le prof… Choisis son personnage (Jeu › Données du jeu) : ses dialogues prennent son nom et ses portraits.',
            panneau: 'Le joueur le lit en se plaçant devant et en appuyant sur A.',
            coffre: 'La page 2 (« déjà fait ») prend le relais une fois le coffre ouvert.',
            objet: 'Une fois ramassé, la page 2 le fait disparaître (case « absent »).',
            declencheur: 'Une case invisible : une scène se lance quand le joueur marche dessus. Mets une condition pour qu\'elle ne se joue qu\'une fois (déjà fait, ou un interrupteur).',
            obstacle: 'À la place des CS : avec l\'objet, le joueur coupe l\'arbre ou brise le rocher (touche A, Saga lui demande s\'il veut l\'utiliser), ou pousse le rocher en marchant contre lui. Sans l\'objet, Saga dit lequel il faudrait. Donne-lui une tuile (l\'arbre, le rocher) ; la page 1 se joue juste après le passage (vide d\'habitude). Un rocher poussé sur un déclencheur le lance : une énigme ! Il revient à sa place quand le joueur quitte la carte.',
          }[work.type];
        };
        // L'obstacle (Tafl 0.24) : sa sorte, l'objet qu'il faut, son message, s'il repousse.
        const blocObstacle = el('div');
        const majObstacle = () => {
          blocObstacle.replaceChildren();
          if (work.type !== 'obstacle') { delete work.obstacle; return; }
          if (!work.obstacle) { work.obstacle = normObstacle({ sorte: 'couper' }); work.traversable = false; traversable.checked = false; }
          const o = work.obstacle;
          const objet = el('input', { type: 'text', value: o.objet, placeholder: OBJETS_OBSTACLE[o.sorte] });
          objet.setAttribute('list', 'tafl-objets');
          objet.oninput = () => { o.objet = Doc.slug(objet.value, ''); };
          const message = el('input', { type: 'text', value: o.message, placeholder: { couper: 'Ce petit arbre a l\'air fragile.', briser: 'Ce rocher est fissuré de partout.', pousser: 'Un gros rocher, bien lourd.' }[o.sorte] });
          message.oninput = () => { o.message = message.value; };
          const repousse = el('input', { type: 'checkbox', checked: o.repousse });
          repousse.onchange = () => { o.repousse = repousse.checked; };
          blocObstacle.append(
            section('Obstacle'),
            champ('Sorte', selectEl(SORTES_OBSTACLE, o.sorte, (v) => { const avant = OBJETS_OBSTACLE[o.sorte]; o.sorte = v; if (!o.objet || o.objet === avant) o.objet = OBJETS_OBSTACLE[v]; majObstacle(); })),
            champ('Objet requis', objet, 'L\'objet du sac qui ouvre le passage (Jeu › Données du jeu › Objets, effet « Ouvre un passage »)'),
            champ('Message', message, 'Ce que Saga dit quand le joueur le regarde (vide : la phrase grise)'),
            ...(o.sorte === 'pousser' ? [] : [champ('Repousse quand le joueur quitte la carte', repousse)]),
          );
        };
        // La lumière (Tafl 0.29) : un halo autour de l'événement quand il fait sombre (Saga 0.11).
        const blocLumiere = el('div');
        const majLumiere = () => {
          blocLumiere.replaceChildren();
          const active = el('input', { type: 'checkbox', checked: Boolean(work.lumiere) });
          active.onchange = () => { if (active.checked) work.lumiere = Donnees.lumiereVide(); else delete work.lumiere; majLumiere(); };
          blocLumiere.append(section('Lumière'), champ('Il éclaire quand il fait sombre', active));
          const l = work.lumiere;
          if (!l) return;
          const couleur = el('input', { type: 'color', value: l.couleur });
          couleur.oninput = () => { l.couleur = couleur.value; };
          const rayon = el('input', { type: 'number', min: 0.5, max: 10, step: 0.5, value: l.rayon });
          rayon.oninput = () => { l.rayon = clamp(Number(rayon.value) || 3, 0.5, 16); };
          const force = el('input', { type: 'number', min: 0, max: 100, value: l.intensite });
          force.oninput = () => { l.intensite = clamp(Math.round(Number(force.value)) || 0, 0, 100); };
          const vacille = el('input', { type: 'checkbox', checked: l.scintille });
          vacille.onchange = () => { l.scintille = vacille.checked; };
          blocLumiere.append(champ('Couleur', couleur), champ('Portée', rayon, 'cases'), champ('Force', force, '%'), champ('Elle vacille (flamme)', vacille));
        };
        majLumiere();
        side.append(
          champ('Nom', nom),
          champ('Type', selectEl(TYPES, work.type, (v) => { work.type = v; majTitre(); majAide(); majObstacle(); })),
          champ('Colonne (x)', num('x', map.width - 1)),
          champ('Rangée (y)', num('y', map.height - 1)),
          section('Apparence'),
          champ('Personnage', selectEl([['', 'Aucun'], ...doc.data.personnages.map((p) => [p.id, p.nom])], work.apparence.personnage, (v) => { work.apparence = { ...work.apparence, personnage: v }; majApercu(); renderPage(); }), 'Le personnage (Jeu › Données du jeu) : son nom, ses portraits et son sprite'),
          el('div', { className: 'field' }, [el('span', { className: 'field-label', textContent: 'Tuile' }), selectEl(choixTuiles(doc), work.apparence.tuile, (v) => { work.apparence = { ...work.apparence, tuile: Number(v) }; majApercu(); }), apercuTuile]),
          champ('Regarde', selectEl(Doc.DIRECTIONS, work.direction, (v) => { work.direction = v; })),
          champ('Bouge', selectEl(DEPLACEMENTS, work.deplacement, (v) => { work.deplacement = v; })),
          section('Déclenchement'),
          champ('Se lance', selectEl(DECLENCHEMENTS, work.declenchement, (v) => { work.declenchement = v; })),
          champ('Le joueur peut passer à travers', traversable),
          champ('Repousse après', repousse, 'nuits (0 = jamais) : son « déjà fait » s\'éteint, il revient à sa page 1. Pour une récolte, un buisson, un coffre qui se remplit'),
          ...(typeof Espaces !== 'undefined' && Espaces.packDe(doc) === 'jdr' && typeof DonneesJdr !== 'undefined'
            ? [champ('Visible par', selectEl(DonneesJdr.visibilites(doc.data), work.visible_par || 'tous', (v) => { if (v === 'tous') delete work.visible_par; else work.visible_par = v; }), 'Mode table de Saga : un PNJ, un piège, un coffre que seul le MJ (ou un joueur) voit')]
            : []),
          blocObstacle,
          blocLumiere,
          aide,
        );
        majApercu();
        majAide();
        majObstacle();
      }
      renderSide();

      // Colonne de droite : les pages, leurs conditions et leur script.
      function renderPage() {
        page = clamp(page, 0, work.pages.length - 1);
        const p = work.pages[page];
        main.replaceChildren();
        const tabs = el('div', { className: 'page-tabs' });
        work.pages.forEach((pg, k) => {
          const b = el('button', { className: `page-tab${k === page ? ' active' : ''}`, title: pg.conditions.length ? `Si ${pg.conditions.map((c) => resumeCondition(doc, c)).join(' et ')}` : 'Toujours valable' }, [`Page ${k + 1}`, pg.conditions.length ? el('span', { className: 'page-cond', textContent: '•' }) : null]);
          b.onclick = () => { page = k; etatBlocs.choisi = null; renderPage(); };
          tabs.append(b);
        });
        tabs.append(petitBouton('add', 'Nouvelle page (vide)', () => { work.pages.push({ conditions: [], cache: false, commandes: [] }); page = work.pages.length - 1; renderPage(); }));
        tabs.append(el('span', { className: 'spacer' }));
        tabs.append(petitBouton('ellipsis', 'Dupliquer, déplacer, supprimer la page', (e) => Menus.open([
          { label: 'Dupliquer la page', run: () => { work.pages.splice(page + 1, 0, structuredClone(p)); page++; renderPage(); } },
          { label: 'Déplacer vers la gauche', disabled: page === 0, run: () => { work.pages.splice(page - 1, 0, ...work.pages.splice(page, 1)); page--; renderPage(); } },
          { label: 'Déplacer vers la droite', disabled: page >= work.pages.length - 1, run: () => { work.pages.splice(page + 1, 0, ...work.pages.splice(page, 1)); page++; renderPage(); } },
          { label: 'Supprimer la page', disabled: work.pages.length < 2, run: () => { work.pages.splice(page, 1); renderPage(); } },
        ], e.clientX, e.clientY)));
        main.append(tabs);
        main.append(el('p', { className: 'modal-info', textContent: 'Le jeu joue la dernière page dont toutes les conditions sont vraies. Page 1 sans condition = ce qui se passe d\'habitude ; les pages suivantes prennent le relais quand l\'histoire avance.' }));

        // Conditions.
        main.append(section('Conditions de la page'));
        const chips = el('div', { className: 'chips' });
        p.conditions.forEach((c, i) => {
          const chip = el('button', { className: 'chip', title: 'Modifier la condition' }, [el('span', { textContent: resumeCondition(doc, c) })]);
          chip.append(petitBouton('close', 'Retirer la condition', () => { p.conditions.splice(i, 1); renderPage(); }));
          chip.onclick = async () => { const n = await formCondition(doc, c); if (n) { p.conditions[i] = n; renderPage(); } };
          chips.append(chip);
        });
        if (!p.conditions.length) chips.append(el('span', { className: 'chips-empty', textContent: 'Aucune : la page est toujours valable.' }));
        const addCond = el('button', { className: 'cmd-add', textContent: '+ Condition' });
        addCond.onclick = async (e) => {
          const r = addCond.getBoundingClientRect();
          const type = await choisir(menuConditions(doc), r.left, r.bottom + 4);
          const c = await formCondition(doc, CONDITIONS[type].nouveau(doc));
          if (c) { p.conditions.push(c); renderPage(); }
          e.stopPropagation();
        };
        chips.append(addCond);
        main.append(chips);
        const cache = el('input', { type: 'checkbox', checked: p.cache });
        cache.onchange = () => { p.cache = cache.checked; };
        main.append(el('label', { className: 'field checkbox-row page-cache' }, [el('span', { className: 'field-label', textContent: 'Sur cette page, l\'événement est absent (invisible : on ne peut ni lui parler ni le toucher)' }), cache]));

        // Le script : en blocs reliés (Tafl 0.28) ou en liste, au choix (gardé pour la prochaine fois).
        const vues = el('span', { className: 'vue-choix' });
        for (const [v, label, ic] of [['blocs', 'Blocs', 'type-hierarchy-sub'], ['liste', 'Liste', 'list-flat']]) {
          const b = el('button', { className: `button small${vue === v ? ' active' : ''}`, title: v === 'blocs' ? 'Les commandes en blocs reliés, avec l\'aperçu des dialogues' : 'Les commandes en liste, comme avant' }, [icon(ic), label]);
          b.onclick = () => { vue = v; try { localStorage.setItem('tafl.vueScript', v); } catch { /* sans mémoire, tant pis */ } renderPage(); };
          vues.append(b);
        }
        main.append(section('Script : ce qui se passe, dans l\'ordre', el('span', { className: 'spacer' }), vues));
        if (vue === 'blocs') {
          const box = el('div', { className: 'flow-box' });
          main.append(box);
          Blocs.dessiner(box, { doc, ev: work, page: p, etat: etatBlocs, redessiner: renderPage });
          return;
        }
        const tree = el('div', { className: 'cmd-tree' });
        renderListe(tree, p.commandes, 0);
        main.append(tree);
      }

      // Une liste de commandes (le script de la page, ou celles d'une réponse, d'un « alors »…).
      function renderListe(box, liste, n) {
        liste.forEach((c, i) => {
          const def = COMMANDES[c.type];
          const row = el('div', { className: `cmd${c.type === 'commentaire' ? ' comment' : ''}${def ? '' : ' unknown'}`, style: { paddingLeft: `${8 + n * 22}px` }, title: def?.champs || c.type === 'si' ? 'Double-clic : modifier' : '' }, [
            icon(def?.icone || 'question'),
            el('span', { className: 'cmd-text', textContent: resumeCommande(doc, c, work) }),
          ]);
          row.firstChild.classList.add('lead');
          const edit = async () => {
            if (c.type === 'si') { const cond = await formCondition(doc, c.condition); if (cond) { liste[i] = { ...c, condition: cond }; renderPage(); } return; }
            if (!def?.champs) return;
            const out = await formCommande(doc, c, work);
            if (out) { liste[i] = out; renderPage(); }
          };
          const actions = el('span', { className: 'cmd-actions' }, [
            petitBouton('arrow-up', 'Monter', () => { if (i > 0) { liste.splice(i - 1, 0, ...liste.splice(i, 1)); renderPage(); } }),
            petitBouton('arrow-down', 'Descendre', () => { if (i < liste.length - 1) { liste.splice(i + 1, 0, ...liste.splice(i, 1)); renderPage(); } }),
            def?.champs || c.type === 'si' ? petitBouton('edit', 'Modifier', edit) : null,
            petitBouton('copy', 'Dupliquer', () => { liste.splice(i + 1, 0, structuredClone(c)); renderPage(); }),
            petitBouton('trash', 'Supprimer', () => { liste.splice(i, 1); renderPage(); }),
          ]);
          row.append(actions);
          row.ondblclick = edit;
          box.append(row);
          const sous = (text) => box.append(el('div', { className: 'cmd-sub', style: { paddingLeft: `${8 + (n + 1) * 22}px` }, textContent: text }));
          for (const [titre, l] of branches(c)) { sous(titre); renderListe(box, l, n + 2); }
        });
        const add = el('button', { className: 'cmd-add', style: { marginLeft: `${8 + n * 22}px` }, textContent: '+ Ajouter une commande' });
        add.onclick = async () => {
          const r = add.getBoundingClientRect();
          const type = await choisir(menuCommandes(doc), r.left, r.bottom + 4);
          const c = await nouvelleCommande(doc, type, work, r.left, r.bottom + 4);
          if (c) { liste.push(c); renderPage(); }
        };
        box.append(add);
      }
      renderPage();

      const historique = suivi(work, () => { majTitre(); renderSide(); renderPage(); }, { nom: 'cet événement' });
      const finir = (r) => { historique.arreter(); w.root.remove(); if (hote) courantPage = null; else courant = null; resolve(r); };
      const fermer = async () => { if (await abandonner(!nouveau && JSON.stringify(work) !== avant)) finir(null); };
      const valider = () => {
        if (map.events.some((o) => o.id !== work.id && o.x === work.x && o.y === work.y)) return notify(`La case (${work.x}, ${work.y}) a déjà un événement.`, 'warning', 3500);
        const event = normEvent(work, work.id, map.width, map.height, doc.tiles.length);
        finir({ event, interrupteurs: interrupteursManquants(doc, event) });
        return null;
      };
      w.close.onclick = fermer;
      if (hote) {
        // En page : les changements s'appliquent en quittant la page, en enregistrant ou en jouant.
        w.hint.textContent = 'Ctrl+Z / Ctrl+Y : annuler / refaire · Ctrl+Entrée : appliquer. Les changements s\'appliquent aussi tout seuls quand tu changes d\'événement ou d\'espace, enregistres ou joues.';
        w.bouton('Supprimer l\'événement', async () => {
          if (await Dialogs.ask('Supprimer l\'événement', `Supprimer « ${work.nom || libelle(TYPES, work.type)} » ? (Ctrl+Z le remet)`, [{ label: 'Annuler', value: false }, { label: 'Supprimer', value: true, primary: true }])) finir('supprimer');
        });
        // Rien de changé : rien à appliquer (le jeu ne devient pas « modifié » pour rien).
        const appliquer = () => (JSON.stringify(work) === avant ? finir(null) : valider());
        w.bouton('Annuler les changements', fermer);
        w.bouton('Appliquer', appliquer, true);
        courantPage = { fermer, valider: appliquer, jeter: () => finir(null), suivi: historique, change: () => JSON.stringify(work) !== avant };
        return;
      }
      w.hint.textContent = 'Ctrl+Z / Ctrl+Y : annuler / refaire · Ctrl+Entrée : valider · Échap : fermer';
      if (!nouveau) w.bouton('Supprimer l\'événement', () => finir('supprimer'));
      w.bouton('Annuler', fermer);
      w.bouton(nouveau ? 'Créer' : 'Valider', valider, true);
      courant = { fermer, valider, suivi: historique };
      nom.focus();
      nom.select();
    });
  }

  // --- Jeu › Données du jeu : personnages, quêtes, interrupteurs (0.7), et les bases de Tafl 0.8 ---
  // Chaque onglet : { key, groupe, label, icon, kind (pour « Utilisé par »), base (nom d'un nouveau),
  // nouveau(id, work), meta(o, work), lead(o), vide, form(o, ctx), unique (un seul objet, sans liste) }.
  // Les onglets de Tafl 0.8 viennent de donnees.js (Donnees.ONGLETS).
  const ONGLETS = [
    { key: 'personnages', groupe: 'Histoire', label: 'Personnages', icon: 'person', kind: 'personnage', base: 'Nouveau personnage',
      nouveau: (id) => ({ id, nom: 'Nouveau personnage', description: '', heros: false, couleur: '', tuile: -1, portraits: [], sprite: null, tenues: [], classe: '', niveau: 1, equipement: {} }),
      meta: (o) => (o.heros ? 'héros' : o.jdr ? 'pré-tiré' : `${o.portraits.length} portrait(s)`), lead: (o) => (o.portraits[0] ? el('img', { className: 'row-portrait', src: o.portraits[0].png, alt: '' }) : null),
      vide: 'Aucun personnage. Ajoute le héros, sa mère, le prof, les deux rivaux…' },
    { key: 'quetes', groupe: 'Histoire', label: 'Quêtes', icon: 'book', kind: 'quete', base: 'Nouvelle quête', nomKey: 'titre',
      nouveau: (id) => ({ id, titre: 'Nouvelle quête', description: '', secondaire: false, suivante: '', personnages: [], etapes: [{ texte: '' }] }),
      meta: (o) => (o.secondaire ? 'secondaire' : 'principale'),
      vide: 'Aucune quête. Une quête a des étapes ; les scripts des événements la commencent, la font avancer et la finissent.' },
    { key: 'interrupteurs', groupe: 'Histoire', label: 'Interrupteurs', icon: 'symbol-boolean', kind: 'interrupteur', base: 'Nouvel interrupteur',
      nouveau: (id) => ({ id, nom: 'Nouvel interrupteur', description: '' }), meta: () => '',
      vide: 'Aucun interrupteur. Ils se créent aussi tout seuls quand un script en utilise un nouveau.' },
    { key: 'variables', groupe: 'Histoire', label: 'Variables', icon: 'symbol-variable', kind: 'variable', base: 'Nouvelle variable',
      nouveau: (id) => ({ id, nom: 'Nouvelle variable', description: '', defaut: 0 }), meta: (o) => `départ : ${o.defaut === '' ? '« »' : o.defaut}`,
      vide: 'Aucune variable. Une variable retient un nombre (pièces trouvées, réputation) ou un texte ; les blocs et les scripts JS la changent et la testent.' },
  ];
  const onglets = () => [...ONGLETS, ...(typeof Donnees !== 'undefined' ? Donnees.ONGLETS : [])];
  const MAX_LIGNES = 250; // au-delà, on cherche (1025 créatures, c'est long à faire défiler)
  const readDataURL = (bytes, name) => new Promise((resolve, reject) => {
    const type = /\.gif$/i.test(name) ? 'image/gif' : /\.webp$/i.test(name) ? 'image/webp' : /\.jpe?g$/i.test(name) ? 'image/jpeg' : /\.bmp$/i.test(name) ? 'image/bmp' : 'image/png';
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('Image illisible'));
    r.readAsDataURL(new Blob([bytes], { type }));
  });
  // Une image du disque → { png, largeur, hauteur } (vérifiée : elle doit se charger).
  async function imagePortrait(file) {
    const png = await readDataURL(file.bytes, file.name);
    const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error(`${file.name} n'est pas une image lisible.`)); i.src = png; });
    return { png, largeur: img.naturalWidth, hauteur: img.naturalHeight };
  }

  // Rend les nouvelles données, ou null (annulé).
  // page (Tafl 0.30) : l'élément où l'ouvrir en pleine page (espace Données) ; memo : { tab, ids }
  // garde l'onglet et l'élément choisi d'une ouverture à l'autre (la page se rouvre après chaque « Appliquer »).
  function editData(doc, onglet = 'personnages', { page = null, memo = null } = {}) {
    if (page ? courantPage : courant) return Promise.resolve(null);
    return new Promise((resolve) => {
      const work = structuredClone(doc.data);
      const avant = JSON.stringify(work);
      let importe = false;
      const nouveaux = new Set(); // créés dans cette fenêtre : leur identifiant suit encore leur nom
      // Les onglets du pack de règles du jeu (Donnees.ONGLETS › packs), avec leurs noms dans ce pack.
      const tous = onglets();
      const pack = () => work.reglages?.regles || 'pokemon';
      // Tafl 1.3 : les onglets d'un module (modules : ['gestion']) seulement si le jeu l'active.
      const defs = () => tous.filter((d) => (!d.packs || d.packs.includes(pack())) && (!d.modules || d.modules.some((m) => (work.reglages?.modules || []).includes(m))));
      const libelleDe = (d) => d.labels?.[pack()] || d.label;
      const choisis = Object.fromEntries(tous.map((d) => [d.key, 0]));
      const recherches = Object.fromEntries(tous.map((d) => [d.key, '']));
      if (memo?.tab) onglet = memo.tab;
      for (const [k, id] of Object.entries(memo?.ids || {})) {
        const i = Array.isArray(work[k]) ? work[k].findIndex((o) => o.id === id) : -1;
        if (i >= 0) choisis[k] = i;
      }
      let tab = defs().some((d) => d.key === onglet) ? onglet : 'personnages';
      const def = () => tous.find((d) => d.key === tab);
      const w = fenetre({ titre: 'Données du jeu', icone: 'database', largeur: 1320, page });
      w.card.classList.add('data-editor');
      const nav = el('nav', { className: 'data-nav' });
      const liste = el('div', { className: 'data-list' });
      const form = el('div', { className: 'editor-main data-form' });
      w.body.append(nav, liste, form);

      function renderNav() {
        const out = [];
        let groupe = '';
        for (const d of defs()) {
          if (d.groupe !== groupe) { groupe = d.groupe; out.push(el('div', { className: 'data-nav-group', textContent: groupe })); }
          const b = el('button', { className: d.key === tab ? 'active' : '' }, [icon(d.icon), el('span', { className: 'data-nav-label', textContent: libelleDe(d) }), d.unique ? null : el('span', { className: 'panel-count', textContent: work[d.key].length })]);
          b.onclick = () => { tab = d.key; render(); };
          out.push(b);
        }
        if (typeof Donnees !== 'undefined' && pack() === 'pokemon') {
          const imp = el('button', { className: 'data-import', title: 'Types, talents, attaques, créatures, objets officiels, en français (PokeAPI)' }, [icon('cloud-download'), el('span', { textContent: 'Importer les données officielles…' })]);
          imp.onclick = importer;
          out.push(el('div', { className: 'data-nav-fill' }), imp);
        }
        nav.replaceChildren(...out);
      }
      async function importer() {
        const options = await Donnees.demanderImport();
        if (!options) return;
        try {
          const imp = await Donnees.telechargerOfficiel(options);
          const { data, bilan } = Donnees.fusionner(work, imp, { maj: options.maj });
          Object.assign(work, data);
          importe = true;
          render();
          const n = (k) => bilan[k].ajoutes + bilan[k].misAJour;
          notify(`Importé : ${n('types')} types, ${n('talents')} talents, ${n('attaques')} attaques, ${n('creatures')} créatures, ${n('objets')} objets. Valide pour les garder.`, 'success');
        } catch (err) { notify(cleanError(err), 'error'); }
      }
      const nomDe = (o) => o[def().nomKey || 'nom'] || o.id;
      function renderListe() {
        const d = def();
        if (d.unique) { liste.hidden = true; return; }
        liste.hidden = false;
        const items = work[tab];
        choisis[tab] = clamp(choisis[tab], 0, Math.max(0, items.length - 1));
        const ajouter = el('button', { className: 'button small', title: 'Ajouter' }, [icon('add'), ` ${libelleDe(d).split(' ')[0].replace(/s$/, '')}`]);
        ajouter.onclick = () => {
          const o = d.nouveau(ident(d.base, items, 'x'), work);
          items.push(o);
          nouveaux.add(o);
          recherches[tab] = '';
          choisis[tab] = items.length - 1;
          render();
          form.querySelector('input[type=text]')?.select();
        };
        const cherche = el('input', { type: 'search', className: 'data-search', placeholder: `Chercher (${items.length})`, value: recherches[tab] });
        cherche.oninput = () => { recherches[tab] = cherche.value; lignes(); };
        const rows = el('div', { className: 'rows' });
        const lignes = () => {
          const q = Doc.slug(recherches[tab], '');
          const chercher = d.chercher || ((o) => `${nomDe(o)} ${o.id}`);
          const trouves = [];
          items.forEach((o, i) => { if (!q || Doc.slug(chercher(o), '').includes(q)) trouves.push(i); });
          rows.replaceChildren();
          for (const i of trouves.slice(0, MAX_LIGNES)) {
            const o = items[i];
            const meta = d.meta(o, work);
            const row = el('button', { className: `row${i === choisis[tab] ? ' active' : ''}` }, [d.lead?.(o) || el('i', { className: `codicon codicon-${d.icon} lead` }), el('span', { className: 'row-name', textContent: nomDe(o) }), meta ? el('span', { className: 'badge', textContent: meta }) : null]);
            row.onclick = () => { choisis[tab] = i; renderListe(); renderForm(); };
            rows.append(row);
          }
          if (trouves.length > MAX_LIGNES) rows.append(el('p', { className: 'modal-info', textContent: `… et ${trouves.length - MAX_LIGNES} autres : cherche par nom ou numéro.` }));
          if (!items.length) rows.append(el('p', { className: 'modal-info', textContent: d.vide }));
          else if (!trouves.length) rows.append(el('p', { className: 'modal-info', textContent: 'Rien ne correspond.' }));
        };
        lignes();
        const focus = document.activeElement?.classList?.contains('data-search');
        liste.replaceChildren(el('div', { className: 'data-list-head' }, [cherche, ajouter]), rows);
        if (focus) { cherche.focus(); cherche.setSelectionRange(cherche.value.length, cherche.value.length); }
        rows.querySelector('.row.active')?.scrollIntoView({ block: 'nearest' });
      }

      const input = (o, key, placeholder = '', after = null) => {
        const i = el('input', { type: 'text', value: o[key] ?? '', placeholder });
        i.oninput = () => { o[key] = i.value; after?.(); };
        return i;
      };
      const zone = (o, key, rows, placeholder = '') => {
        const t = el('textarea', { rows, value: o[key] ?? '', placeholder });
        t.oninput = () => { o[key] = t.value; };
        return t;
      };
      const coche = (o, key) => {
        const c = el('input', { type: 'checkbox', checked: Boolean(o[key]) });
        c.onchange = () => { o[key] = c.checked; renderListe(); };
        return c;
      };
      // L'identifiant d'un élément tout neuf suit son nom ; ensuite, il ne change plus (les scripts s'en servent).
      const idLigne = (o, items) => {
        const span = el('code', { className: 'data-id', textContent: o.id });
        const maj = () => {
          if (nouveaux.has(o)) o.id = ident(nomDe(o) || 'x', items.filter((x) => x !== o), 'x');
          span.textContent = o.id;
          renderListe();
        };
        return { el: el('div', { className: 'field' }, [el('span', { className: 'field-label', textContent: 'Identifiant' }), span, el('span', { className: 'unit', textContent: nouveaux.has(o) ? 'suit le nom (ensuite il ne change plus)' : o.officiel ? `officiel (${o.officiel}), utilisé par les scripts` : 'utilisé par les scripts' })]), maj };
      };
      const vue = () => ({ ...doc, data: work });
      const usagesDe = (kind, id) => (['personnage', 'quete', 'interrupteur', 'variable'].includes(kind) ? utilisations(vue(), kind, id) : Donnees.utilisations(vue(), kind, id));
      const usages = (kind, id) => {
        const u = usagesDe(kind, id);
        return el('p', { className: 'modal-info', textContent: u.length ? `Utilisé par : ${u.slice(0, 12).join(' · ')}${u.length > 12 ? ` (et ${u.length - 12} autres)` : ''}` : 'Pas encore utilisé.' });
      };
      async function supprimer(items, i, kind) {
        const o = items[i];
        const u = usagesDe(kind, o.id);
        if (u.length) {
          const go = await Dialogs.ask('Supprimer', `« ${nomDe(o)} » est utilisé par ${u.length} endroit(s) : ${u.slice(0, 6).join(', ')}${u.length > 6 ? '…' : ''}. Ils garderont son identifiant (${o.id}) sans le retrouver.`, [
            { label: 'Annuler', value: false },
            { label: 'Supprimer', value: true, primary: true },
          ]);
          if (!go) return;
        }
        items.splice(i, 1);
        render();
      }


      function formPersonnage(p, items, i) {
        const idl = idLigne(p, items);
        const couleur = el('input', { type: 'color', value: p.couleur || '#ffffff' });
        couleur.oninput = () => { p.couleur = couleur.value; };
        const sansCouleur = petitBouton('discard', 'Couleur par défaut', () => { p.couleur = ''; couleur.value = '#ffffff'; });
        const portraits = el('div', { className: 'portraits' });
        p.portraits.forEach((x, k) => {
          const expr = el('input', { type: 'text', value: x.expression, list: 'tafl-expressions', title: 'Expression : normal, content, triste, colere…' });
          expr.oninput = () => { x.expression = Doc.slug(expr.value, 'normal'); };
          const img = el('img', { src: x.png, alt: x.expression });
          const dim = el('span', { className: 'portrait-size' });
          img.onload = () => { dim.textContent = `${img.naturalWidth} × ${img.naturalHeight}`; };
          portraits.append(el('div', { className: 'portrait' }, [
            el('div', { className: 'portrait-img checker' }, [img, dim]),
            el('div', { className: 'portrait-bar' }, [
              expr,
              petitBouton('refresh', 'Remplacer l\'image', async () => {
                const f = await window.tafl.openFile({ kind: 'image', titre: `Portrait « ${x.expression} » de ${p.nom}` });
                if (!f) return;
                try { x.png = (await imagePortrait(f)).png; } catch (err) { notify(cleanError(err), 'error'); }
                render();
              }),
              petitBouton('trash', 'Supprimer ce portrait', () => { p.portraits.splice(k, 1); render(); }),
            ]),
          ]));
        });
        const importer = el('button', { className: 'portrait-add' }, [icon('add'), el('span', { textContent: 'Importer un portrait…' })]);
        importer.onclick = async () => {
          const f = await window.tafl.openFile({ kind: 'image', titre: `Portrait de ${p.nom}` });
          if (!f) return;
          try {
            const { png } = await imagePortrait(f);
            const pris = new Set(p.portraits.map((x) => x.expression));
            // L'expression : celle du nom du fichier (maman-triste.png → triste), sinon la première libre.
            const nomFichier = Doc.slug(f.name.replace(/\.[^.]+$/, ''), '');
            const expression = EXPRESSIONS.find((e) => nomFichier.endsWith(e) && !pris.has(e)) || EXPRESSIONS.find((e) => !pris.has(e)) || `expression-${p.portraits.length + 1}`;
            p.portraits.push({ expression, png });
            render();
          } catch (err) { notify(cleanError(err), 'error'); }
        };
        portraits.append(importer);
        form.append(
          champ('Nom', input(p, 'nom', 'Maman, Prof. Chêne, Léo (rival)…', idl.maj)),
          idl.el,
          el('label', { className: 'field field-textarea' }, [el('span', { className: 'field-label', textContent: 'Description' }), zone(p, 'description', 3, 'Son rôle et sa personnalité : pour t\'en souvenir, et pour Loki quand il écrit ses dialogues.')]),
          champ('C\'est le héros (le joueur, qui parle et a sa personnalité)', (() => {
            // Un seul héros : le cocher ici le retire aux autres.
            const c = coche(p, 'heros');
            c.addEventListener('change', () => { if (c.checked) for (const o of items) if (o !== p) o.heros = false; render(); });
            return c;
          })()),
          el('div', { className: 'field' }, [el('span', { className: 'field-label', textContent: 'Couleur du nom' }), couleur, sansCouleur, el('span', { className: 'unit', textContent: 'dans les boîtes de dialogue' })]),
          section('Sprite sur la carte : 4 directions et la marche'),
          Sprites.editeur(p, { tileSize: doc.tileSize, palette: doc.palette, change: renderListe, tuile: () => (doc.tiles[p.tuile] ? Doc.tileCanvas(doc.tiles[p.tuile], doc.tileSize) : null) }),
          champ('Tuile sur la carte', selectEl(choixTuiles(doc), p.tuile, (v) => { p.tuile = Number(v); }), 'Sans sprite : la tuile qui le montre sur la carte (une seule image, quelle que soit sa direction)'),
          ...(p.heros ? [section('Tenues : le joueur personnalise son héros'), tenuesHeros(p)] : []),
          ...(pack() === 'jrpg' ? groupeJrpg(p) : []),
          ...(pack() === 'jdr' && typeof DonneesJdr !== 'undefined' ? DonneesJdr.formPersonnage(p, work, render) : []),
          ...(pack() === 'action' && typeof DonneesAction !== 'undefined' ? DonneesAction.formPersonnage(p, work, renderListe, doc) : []),
          section('Portraits, un par expression'),
          el('p', { className: 'modal-info', textContent: 'Les visages montrés à côté des dialogues. Dessine-les dans Skald ou Photoshop (PNG, fond transparent), puis importe-les ici : un fichier nommé maman-triste.png devient l\'expression « triste ».' }),
          portraits,
          section('Utilisation'),
          usages('personnage', p.id),
        );
      }

      // Pack JRPG (Tafl 0.25) : ce qu'il est quand il rejoint le groupe (le héros principal, dès le début).
      function groupeJrpg(p) {
        const champsEquipement = Donnees.PLACES.map(([place, nom]) => champ(nom, selectEl(
          [['', 'Rien'], ...work.objets.filter((o) => o.equipement?.place === place && (!o.equipement.classes.length || !p.classe || o.equipement.classes.includes(p.classe))).map((o) => [o.id, o.nom])],
          p.equipement[place] || '', (v) => { p.equipement = { ...p.equipement }; if (v) p.equipement[place] = v; else delete p.equipement[place]; },
        )));
        return [
          section('Dans le groupe (pack JRPG)'),
          el('div', { className: 'field-grid' }, [
            champ('Classe', selectEl([['', 'Aucune'], ...work.classes.map((k) => [k.id, k.nom])], p.classe, (v) => { p.classe = v; render(); })),
            champ('Niveau de départ', (() => { const i = el('input', { type: 'number', value: p.niveau, min: 1, max: 999, className: 'num-input' }); i.oninput = () => { p.niveau = clamp(Math.round(Number(i.value)) || 1, 1, 999); }; return i; })()),
          ]),
          el('div', { className: 'field-grid' }, champsEquipement),
          el('p', { className: 'modal-info', textContent: p.heros ? 'Le héros est dans le groupe dès le début s\'il a une classe. Son équipement de départ est porté (pas dans le sac).' : 'Il rejoint le groupe avec la commande « Le groupe : un héros rejoint ou part ». Son équipement de départ est porté (pas dans le sac).' }),
        ];
      }

      // Les tenues du héros (Tafl 0.16) : chacune a son nom et son sprite. La commande « Personnaliser
      // le héros » les propose au joueur ; « Changer la tenue » en met une pour l'histoire.
      function tenuesHeros(p) {
        const sertTenue = (id) => { let oui = false; parcourirJeu(doc, ({ commande }) => { if (commande?.type === 'tenue' && commande.tenue === id) oui = true; }); return oui; };
        const box = el('div', { className: 'tenues' });
        const rendre = () => {
          box.replaceChildren(el('p', { className: 'modal-info', textContent: 'Le sprite du dessus est sa tenue de base. Chaque tenue ici est une autre planche de marche (même format) ; ses portraits ne changent pas. Astuce : « Partir de la tenue de base » copie le sprite pour ne changer que les couleurs.' }));
          p.tenues.forEach((t, k) => {
            const nom = el('input', { type: 'text', value: t.nom, placeholder: 'Sportive, Hiver, Uniforme…' });
            // L'identifiant suit le nom, sauf si un script met déjà cette tenue (il ne la retrouverait plus).
            nom.oninput = () => {
              t.nom = nom.value;
              const id = Doc.slug(nom.value, '');
              if (id && !sertTenue(t.id) && !p.tenues.some((o) => o !== t && o.id === id)) t.id = id;
              idTexte.textContent = t.id;
            };
            const idTexte = el('code', { textContent: t.id });
            box.append(el('div', { className: 'tenue' }, [
              el('div', { className: 'tenue-tete' }, [
                nom, idTexte,
                p.sprite && !t.sprite ? petitBouton('copy', 'Partir de la tenue de base', () => { t.sprite = { ...p.sprite }; rendre(); }) : null,
                petitBouton('trash', 'Supprimer la tenue', () => { p.tenues.splice(k, 1); rendre(); }),
              ]),
              Sprites.editeur(t, { tileSize: doc.tileSize, palette: doc.palette, change: renderListe }),
            ]));
          });
          const add = el('button', { className: 'cmd-add', textContent: '+ Tenue' });
          add.onclick = (e) => {
            e.preventDefault();
            const nom = `Tenue ${p.tenues.length + 2}`;
            p.tenues.push({ id: ident(nom, p.tenues, 'tenue'), nom, sprite: p.sprite ? { ...p.sprite } : null });
            rendre();
          };
          box.append(add);
        };
        rendre();
        return box;
      }

      function formQuete(q, items, i) {
        const idl = idLigne(q, items);
        const etapes = el('div', { className: 'etapes' });
        const renderEtapes = () => {
          etapes.replaceChildren();
          q.etapes.forEach((s, k) => {
            const t = el('input', { type: 'text', value: s.texte, placeholder: k ? 'Puis…' : 'Parler au pêcheur du lac' });
            t.oninput = () => { s.texte = t.value; };
            etapes.append(el('div', { className: 'etape' }, [
              el('span', { className: 'etape-num', textContent: k + 1 }), t,
              petitBouton('arrow-up', 'Monter', () => { if (k > 0) { q.etapes.splice(k - 1, 0, ...q.etapes.splice(k, 1)); renderEtapes(); } }),
              petitBouton('arrow-down', 'Descendre', () => { if (k < q.etapes.length - 1) { q.etapes.splice(k + 1, 0, ...q.etapes.splice(k, 1)); renderEtapes(); } }),
              petitBouton('trash', 'Supprimer l\'étape', () => { q.etapes.splice(k, 1); renderEtapes(); }),
            ]));
          });
          const add = el('button', { className: 'cmd-add', textContent: '+ Étape' });
          add.onclick = () => { q.etapes.push({ texte: '' }); renderEtapes(); etapes.querySelectorAll('input')[q.etapes.length - 1]?.focus(); };
          etapes.append(add);
        };
        renderEtapes();
        const persos = el('div', { className: 'chips' });
        for (const p of work.personnages) {
          const c = el('input', { type: 'checkbox', checked: q.personnages.includes(p.id) });
          c.onchange = () => { q.personnages = c.checked ? [...q.personnages, p.id] : q.personnages.filter((x) => x !== p.id); };
          persos.append(el('label', { className: 'chip chip-check' }, [c, el('span', { textContent: p.nom })]));
        }
        if (!work.personnages.length) persos.append(el('span', { className: 'chips-empty', textContent: 'Aucun personnage pour l\'instant (onglet Personnages).' }));
        form.append(
          champ('Titre', input(q, 'titre', 'Le trésor du lac', idl.maj)),
          idl.el,
          el('label', { className: 'field field-textarea' }, [el('span', { className: 'field-label', textContent: 'Description' }), zone(q, 'description', 3, 'Ce que vit le joueur, et comment elle se rattache au fil rouge de l\'histoire.')]),
          champ('Quête secondaire (sinon : histoire principale)', coche(q, 'secondaire')),
          champ('Suite', selectEl([['', 'Aucune'], ...work.quetes.filter((o) => o !== q).map((o) => [o.id, o.titre])], q.suivante, (v) => { q.suivante = v; }), 'La quête qui commence quand celle-ci finit (le fil rouge)'),
          section('Personnages de la quête'),
          el('p', { className: 'modal-info', textContent: 'Les personnages qu\'on y croise : pratique pour suivre les personnages récurrents d\'une quête à l\'autre.' }),
          persos,
          section('Étapes'),
          el('p', { className: 'modal-info', textContent: 'Les scripts font avancer la quête (commande « Avancer une quête ») et testent où elle en est (condition « L\'état d\'une quête »). Un légendaire au bout d\'une quête : une page avec la condition « quête finie », et la commande « Combat contre une créature ».' }),
          etapes,
          section('Utilisation'),
          usages('quete', q.id),
        );
      }

      function formInterrupteur(s, items, i) {
        const idl = idLigne(s, items);
        form.append(
          champ('Nom', input(s, 'nom', 'Rival battu au labo', idl.maj)),
          idl.el,
          el('label', { className: 'field field-textarea' }, [el('span', { className: 'field-label', textContent: 'Description' }), zone(s, 'description', 3, 'Ce qu\'il veut dire dans l\'histoire.')]),
          el('p', { className: 'modal-info', textContent: 'Un interrupteur est allumé ou éteint, pour tout le jeu : il retient un fait de l\'histoire. Les scripts l\'allument (commande « Interrupteur du jeu ») et les pages le testent (condition « Un interrupteur du jeu »). Au début d\'une partie, ils sont tous éteints.' }),
          section('Utilisation'),
          usages('interrupteur', s.id),
        );
      }

      function formVariable(v, items) {
        const idl = idLigne(v, items);
        const depart = el('input', { type: 'text', value: String(v.defaut ?? 0), placeholder: '0' });
        depart.oninput = () => { v.defaut = valeurVariable(depart.value); renderListe(); };
        form.append(
          champ('Nom', input(v, 'nom', 'Pièces d\'or trouvées', idl.maj)),
          idl.el,
          champ('Valeur de départ', depart, 'Un nombre (0, 10) ou un texte court (Bourg)'),
          el('label', { className: 'field field-textarea' }, [el('span', { className: 'field-label', textContent: 'Description' }), zone(v, 'description', 3, 'Ce qu\'elle compte, ce qu\'elle retient.')]),
          el('p', { className: 'modal-info', textContent: 'Une variable retient un nombre ou un texte pour tout le jeu (pièces trouvées, réputation auprès d\'un village, nombre de victoires). Les blocs la changent (commande « Variable »), les pages et les « si » la testent (condition « Une variable »), les scripts JS la lisent et l\'écrivent (saga.variable, saga.ajouter). Elle part de sa valeur de départ.' }),
          section('Utilisation'),
          usages('variable', v.id),
        );
      }

      function renderForm() {
        form.replaceChildren();
        // Le pack a changé (Réglages) : un onglet d'un autre pack laisse la place aux Réglages.
        if (!defs().includes(def())) tab = 'reglages';
        const d = def();
        if (d.unique) {
          supprimerBtn.hidden = true;
          d.form(work[tab], ctx());
          return;
        }
        const items = work[tab];
        const i = choisis[tab];
        const o = items[i];
        supprimerBtn.hidden = !o;
        w.bouton.supprimer = o ? () => supprimer(items, i, d.kind) : null;
        if (!o) return;
        if (tab === 'personnages') formPersonnage(o, items, i);
        else if (tab === 'quetes') formQuete(o, items, i);
        else if (tab === 'interrupteurs') formInterrupteur(o, items, i);
        else if (tab === 'variables') formVariable(o, items, i);
        else d.form(o, ctx());
        form.scrollTop = 0;
      }
      // Ce que les onglets de donnees.js reçoivent pour construire leur formulaire.
      const ctx = () => ({ doc, work, form, input, zone, coche, idLigne: (o) => idLigne(o, work[tab]), usages, render, renderListe, change: renderNav });
      function render() {
        listes(vue());
        if (typeof Donnees !== 'undefined') Donnees.listes(work);
        renderNav();
        renderListe();
        renderForm();
      }

      const change = () => importe || JSON.stringify(work) !== avant;
      const historique = suivi(work, render, { max: 40, nom: 'les données du jeu' });
      const finir = (r) => {
        if (memo) {
          memo.tab = tab;
          memo.ids = Object.fromEntries(tous.filter((d) => !d.unique && Array.isArray(work[d.key])).map((d) => [d.key, work[d.key][choisis[d.key]]?.id]).filter(([, id]) => id));
        }
        historique.arreter(); w.root.remove(); if (page) courantPage = null; else courant = null; resolve(r);
      };
      const fermer = async () => { if (await abandonner(change())) finir(null); };
      const valider = () => finir(change() ? normData(work, doc.tiles.length) : null);
      w.close.onclick = fermer;
      w.hint.textContent = 'Tout sert dans les scripts des événements (outil Événement, N), les zones et les combats. Ctrl+Z / Ctrl+Y : annuler / refaire.';
      const supprimerBtn = w.bouton('Supprimer', () => w.bouton.supprimer?.());
      if (page) {
        w.hint.textContent = 'Tout sert dans les scripts des événements, les zones et les combats. Ctrl+Z / Ctrl+Y : annuler / refaire · Ctrl+Entrée : appliquer. Les changements s\'appliquent aussi tout seuls quand tu changes d\'espace, enregistres ou joues.';
        w.bouton('Annuler les changements', fermer);
        w.bouton('Appliquer', valider, true);
        courantPage = { fermer, valider, jeter: () => finir(null), suivi: historique, change };
      } else {
        w.bouton('Annuler', fermer);
        w.bouton('Valider', valider, true);
        courant = { fermer, valider, suivi: historique };
      }
      render();
    });
  }

  return {
    TYPES, TYPE_ICONS, DEPLACEMENTS, DECLENCHEMENTS, EXPRESSIONS, COMPTEURS, ETATS_QUETE, COMMANDES, CONDITIONS,
    create, nextId, ident, normEvent, normEvents, normPage, emptyData, normData, verifierPages, interrupteursManquants, valeurVariable,
    STATS_BONUS, statsBonus, texte, decrire, resumeCommande, resumeCondition, utilisations, portrait, perso, imagePortrait,
    editEvent, editData, isOpen, pageOuverte, handleKey, fenetre, occuper: (c) => { courant = c; }, normCondition, parcourirJeu, choisir, formCondition, listes, ONGLETS,
    formCommande, nouvelleCommande, menuCommandes, duPack, parcourir, branches, nomQui, quiReel, suivi,
  };
})();
