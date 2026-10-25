// Tafl 0.31 : les scripts JS du jeu (Événements › Scripts).
//
// Un jeu peut avoir ses propres fichiers JavaScript (doc.scripts, enregistrés dans scripts/<nom>.js).
// Ils déclarent trois sortes de choses (voir moteur/SCRIPTS.md, copié à côté de FORMAT.md) :
//   commande('nom', { réglages }, async (saga, params) => { … })  une commande pour le bloc Script ;
//   formule('degats', (valeurs, des) => …)                         une règle maison du pack de règles ;
//   quand('apres_combat', async (saga, infos) => { … })            une réaction à un moment du jeu.
//
// Tafl ne les exécute jamais dans sa fenêtre : seulement dans le bac à sable commun à Saga
// (../commun/bac-a-sable.js), pour savoir ce qu'ils déclarent (l'« inventaire » : les commandes que
// propose le bloc Script, les erreurs pour le vérificateur) et pour le bouton Essayer, qui joue une
// commande sur une partie pour de faux et raconte ce qu'elle aurait fait.
//
// L'éditeur est Monaco, celui de Rune (chargé la première fois qu'on ouvre un script), avec
// l'autocomplétion de toute l'API (saga., des., les ids du jeu) et une aide en français.
const ScriptsTafl = (() => {
  const VIDE = Object.freeze({ commandes: [], formules: [], quand: [], erreurs: [] });
  const fichier = (s) => `scripts/${s.nom}.js`;
  const packDe = (doc) => doc?.data?.reglages?.regles || 'pokemon';

  // --- Ce qu'on tape dans l'éditeur, pas encore dans le jeu ---
  // nom → texte. Il passe dans doc.scripts (un seul Ctrl+Z) en quittant le script, en enregistrant, en
  // jouant, avant une action de Loki (Espaces.appliquer) et avec Essayer.
  const brouillons = new Map();
  let docBrouillons = null;
  const texteDe = (doc, s) => (doc === docBrouillons && brouillons.has(s.nom) ? brouillons.get(s.nom) : s.code);
  function appliquer() {
    const doc = App.doc;
    if (!doc || doc !== docBrouillons || !brouillons.size) { brouillons.clear(); return true; }
    const changes = [...brouillons].filter(([nom, code]) => doc.scripts.find((s) => s.nom === nom && s.code !== code));
    brouillons.clear();
    if (!changes.length) return true;
    Doc.change(doc, changes.length > 1 ? 'Modifier les scripts' : `Modifier le script ${changes[0][0]}.js`, () => {
      doc.scripts = doc.scripts.map((s) => { const c = changes.find(([nom]) => nom === s.nom); return c ? { ...s, code: c[1] } : s; });
    });
    return true;
  }

  // --- L'inventaire : ce que déclarent les scripts actifs ---
  // Calculé dans un bac à sable (en arrière-plan), gardé tant que les scripts ne changent pas.
  let cache = { cle: null, inv: VIDE, promesse: null };
  const ecouteurs = new Set();
  const actifs = (doc) => (doc?.scripts || []).filter((s) => s.actif !== false).map((s) => ({ fichier: fichier(s), code: texteDe(doc, s) }));
  function rafraichir(doc) {
    if (!doc) return Promise.resolve(VIDE);
    const f = actifs(doc);
    const cle = JSON.stringify(f);
    if (cle === cache.cle) return cache.promesse;
    if (!f.length) { cache = { cle, inv: VIDE, promesse: Promise.resolve(VIDE), fini: true }; prevenir(); return cache.promesse; }
    const bac = BacASable.creer({ fichiers: f, donnees: doc.data });
    const promesse = bac.pret().then((inv) => {
      bac.fermer();
      if (cache.cle === cle) { cache.inv = inv; cache.fini = true; prevenir(); }
      return inv;
    });
    cache = { cle, inv: cache.inv, promesse, fini: false };
    return promesse;
  }
  const prevenir = () => { for (const f of ecouteurs) f(cache.inv); };
  // L'inventaire connu tout de suite (le dernier calculé) ; il se met à jour en arrière-plan.
  function connu(doc) { rafraichir(doc); return cache.inv; }
  // Pour le vérificateur : l'inventaire, seulement s'il correspond aux scripts d'aujourd'hui (sinon,
  // pret: false et il ne dit pas « commande inconnue » pour une commande qu'on vient d'écrire).
  function etat(doc) {
    connu(doc);
    return { pret: Boolean(cache.fini), inventaire: cache.inv, problemes: cache.fini ? problemes(doc) : [] };
  }

  // --- Les modèles (Nouveau script) ---
  function modeles(doc) {
    const pack = packDe(doc);
    const objet = doc.data.objets?.find((o) => o.id === 'potion')?.id || doc.data.objets?.[0]?.id || 'potion';
    const jrpg = pack === 'jrpg';
    const nomPack = { jrpg: 'JRPG', jdr: 'JDR' }[pack] || 'Pokémon';
    return [
      { id: 'dialogue', nom: 'Commande avec dialogue', aide: 'Un personnage qui offre un objet une seule fois, avec une question.', nomFichier: 'cadeau', code: `// Une commande pour le bloc Script d'un événement : un personnage offre un objet, une seule fois.
// Dans l'événement : ajoute le bloc « Script JS », choisis « cadeau » et règle l'objet et le nombre.
commande('cadeau', {
  objet: { type: 'objet', nom: 'Objet offert', defaut: '${objet}' },
  nombre: { type: 'nombre', nom: 'Combien', defaut: 1, min: 1, max: 99 },
}, async (saga, params) => {
  if (saga.local()) {
    await saga.dire('Reviens me voir plus tard, {joueur} !', '@evenement');
    return;
  }
  await saga.dire('Bonjour {joueur} ! Tu as l\\'air fatigué… Tu veux un petit quelque chose ?', '@evenement');
  const reponse = await saga.choisir(['Oui, merci !', 'Non, ça va']);
  if (reponse === 0) {
    await saga.donner(params.objet, params.nombre);
    await saga.local(true); // « déjà fait » : la prochaine fois, il dira autre chose
  } else {
    await saga.dire('Comme tu veux !', '@evenement');
  }
});
` },
      { id: 'des', nom: 'Jet de dés (épreuve)', aide: 'Crocheter une serrure avec un d20 contre une difficulté, façon jeu de rôle.', nomFichier: 'epreuves', code: `// Une épreuve façon jeu de rôle : un d20 plus un bonus, contre une difficulté.
// Le hasard passe toujours par des (jamais Math.random) : mêmes jets, même résultat.
commande('crocheter', {
  difficulte: { type: 'nombre', nom: 'Difficulté', defaut: 12, min: 1, max: 30 },
  bonus: { type: 'nombre', nom: 'Bonus du héros', defaut: 2, min: -5, max: 15 },
}, async (saga, params) => {
  const jet = des.jet(\`d20+\${params.bonus}\`);
  await saga.dire(\`Tu lances le dé : \${jet.des[0].valeur} + \${params.bonus} = \${jet.total} (il fallait \${params.difficulte}).\`);
  if (jet.total >= params.difficulte) {
    await saga.dire('Clic ! La serrure cède.');
    await saga.local(true);
    await saga.ajouter('serrures-ouvertes', 1);
  } else {
    await saga.dire('La serrure résiste… Tu pourras réessayer.');
  }
});
` },
      { id: 'degats', nom: 'Règle de dégâts maison', aide: `Remplace la formule des dégâts du pack ${nomPack} (ici : +10 %, et les critiques encore plus forts).`, nomFichier: 'regles-maison', code: `// Une règle maison : elle remplace la formule des dégâts du pack de règles du jeu.
// v.normal est le résultat de la formule du pack : on peut juste l'ajuster.
// (Les formules qu'on peut remplacer sont listées à droite, et dans l'aide de formule().)
formule('degats', (v, des) => {
  let degats = v.normal * 1.1;            // tous les coups font 10 % de plus
  if (v.critique) degats *= 1.25;         // et les coups critiques encore un peu plus
  return Math.max(1, Math.round(degats));
});
` },
      { id: 'reaction', nom: 'Réaction après combat', aide: 'Compte les victoires dans une variable et félicite le joueur tous les 10 combats.', nomFichier: 'victoires', code: `// Une réaction : Saga l'appelle après chaque combat.
quand('apres_combat', async (saga, infos) => {
  if (infos.issue !== 'victoire') return;
  await saga.ajouter('victoires', 1);
  const n = saga.variable('victoires');
  if (n % 10 === 0) await saga.annoncer('Bravo !', \`\${n} combats gagnés\`);
});
` },
      { id: 'vide', nom: 'Script vide', aide: 'Juste un commentaire pour commencer.', nomFichier: 'script', code: `// Mon script. Trois choses possibles :
//   commande('nom', async (saga, params) => { … })   une commande pour le bloc « Script JS »
//   formule('degats', (valeurs, des) => …)            une règle maison du pack de règles
//   quand('carte', async (saga, infos) => { … })      une réaction à un moment du jeu
// Tape « saga. » ou « des. » pour voir tout ce qu'on peut faire.
` },
    ];
  }

  // --- Monaco (chargé à la demande, comme dans Rune) ---
  let monacoPret = null;
  const MONACO = new URL('../node_modules/monaco-editor/min/', location.href).href;
  function chargerMonaco() {
    if (monacoPret) return monacoPret;
    monacoPret = new Promise((resolve, reject) => {
      self.MonacoEnvironment = { getWorkerUrl: () => `${MONACO}vs/base/worker/workerMain.js` };
      const s = el('script', { src: `${MONACO}vs/loader.js` });
      s.onload = () => {
        window.require.config({ paths: { vs: `${MONACO}vs` } });
        window.require(['vs/nls.messages.fr'], () => window.require(['vs/editor/editor.main'], () => resolve(window.monaco), reject), reject);
      };
      s.onerror = () => reject(new Error('L\'éditeur de code (Monaco) est introuvable : lance « npm install » dans tuiles/.'));
      document.head.append(s);
    });
    monacoPret.then((monaco) => {
      monaco.editor.defineTheme('tafl-verre', {
        base: 'vs-dark', inherit: true, rules: [],
        colors: { 'editor.background': '#00000000', 'editor.lineHighlightBackground': '#ffffff0a', 'editorGutter.background': '#00000000', 'minimap.background': '#00000000' },
      });
      const js = monaco.languages.typescript.javascriptDefaults;
      js.setCompilerOptions({ target: monaco.languages.typescript.ScriptTarget.ES2020, allowNonTsExtensions: true, noLib: false, lib: ['es2020'], checkJs: false });
      js.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: false });
    }).catch(() => { monacoPret = null; });
    return monacoPret;
  }
  // Les types de l'API pour l'autocomplétion : ceux du pack du jeu, avec les ids de ses données.
  let libActuelle = null;
  function majTypes(monaco, doc) {
    const texte = typesPour(doc);
    if (libActuelle?.texte === texte) return;
    libActuelle?.lib.dispose();
    libActuelle = { texte, lib: monaco.languages.typescript.javascriptDefaults.addExtraLib(texte, 'ts:atelier/saga-scripts.d.ts') };
  }
  const chaine = (l) => (l.length ? `${l.map((x) => JSON.stringify(x)).join(' | ')} | (string & {})` : 'string');
  const typeDe = (v) => (typeof v === 'boolean' ? 'boolean' : typeof v === 'string' ? 'string' : 'number');
  const doc1 = (t) => `/** ${String(t).replace(/\*\//g, '* /')} */`;
  function typesPour(doc) {
    const formules = BacASable.formulesDuPack(packDe(doc));
    const ids = (l, k = 'id') => (l || []).map((x) => x[k]).filter(Boolean).slice(0, 400);
    const L = [
      `type IdObjet = ${chaine(ids(doc.data.objets))};`,
      `type IdPersonnage = ${chaine(ids(doc.data.personnages))} | '@evenement' | '';`,
      `type IdCarte = ${chaine(doc.maps.map((m) => m.id))};`,
      `type IdQuete = ${chaine(ids(doc.data.quetes))};`,
      `type IdInterrupteur = ${chaine(ids(doc.data.interrupteurs))};`,
      `type IdVariable = ${chaine(ids(doc.data.variables))};`,
      `type IdCreature = ${chaine(ids(doc.data.creatures))};`,
      `type IdBoutique = ${chaine(ids(doc.data.boutiques))};`,
      `type IdDresseur = ${chaine(ids(doc.data.dresseurs))};`,
      `type IdGroupe = ${chaine(ids(doc.data.groupes))};`,
      'type Fiche = { nom: string; personnage: string; joueur: string; origine: string; classe: string; niveau: number; xp: number; pv: number; pvMax: number; pv_temp: number; ca: number; maitrise: number; vitesse: number; caracteristiques: Record<string, number>; modificateurs: Record<string, number>; sauvegardes: Record<string, number>; competences: Record<string, number>; maitrises: string[]; perception_passive: number; etats: string[]; sorts: string[]; dd_sorts: number; mort: boolean };',
      'type Direction = \'haut\' | \'bas\' | \'gauche\' | \'droite\';',
      'type Issue = \'victoire\' | \'defaite\' | \'fuite\' | \'capture\';',
      '/** Les formules du pack de règles de ce jeu, et les valeurs que chacune reçoit. */',
      'interface Formules {',
      ...Object.entries(formules).map(([nom, f]) => `  ${doc1(`${f.nom}. Rend : ${f.rend}`)}\n  ${nom}: { ${Object.entries(f.valeurs).map(([k, aide]) => `${doc1(aide)} readonly ${k}: ${typeDe(f.exemple[k])};`).join(' ')} };`),
      '}',
      '/** Les moments du jeu qu\'on peut écouter avec quand(), et ce que chacun reçoit. */',
      'interface Moments {',
      ...Object.entries(BacASable.MOMENTS).map(([nom, m]) => `  ${doc1(m.nom)}\n  ${nom}: { ${Object.entries(m.infos).map(([k, aide]) => `${doc1(aide)} readonly ${k}: ${k === 'x' || k === 'y' ? 'number' : 'string'};`).join(' ')} };`),
      '}',
      `interface Jet { readonly formule: string; readonly des: ReadonlyArray<{ readonly faces: number; readonly valeur: number; readonly signe: 1 | -1 }>; readonly bonus: number; readonly total: number; }`,
      '/** Les dés et le hasard. Toujours eux, jamais Math.random (qui utilise d\'ailleurs la même graine) : mêmes jets, même résultat. */',
      'interface Des {',
      `  ${doc1('Un dé à `faces` faces : de 1 à faces. des.d(20) : un d20.')}\n  d(faces: number): number;`,
      `  ${doc1('Lance une formule de dés et rend le total : des.lancer(\'2d6+3\'), des.lancer(\'d20\'), des.lancer(\'3d6 + 1d4 - 1\').')}\n  lancer(formule: string): number;`,
      `  ${doc1('Comme lancer, mais rend le détail : { total, des: [{ faces, valeur }], bonus }, pour montrer le jet au joueur.')}\n  jet(formule: string): Jet;`,
      `  ${doc1('Un nombre entier entre min et max (compris).')}\n  hasard(min: number, max: number): number;`,
      `  ${doc1('true avec cette chance en % : des.chance(25) est vrai une fois sur quatre.')}\n  chance(pourcent: number): boolean;`,
      `  ${doc1('Un élément de la liste, au hasard.')}\n  choisir<T>(liste: T[]): T;`,
      `  ${doc1('Un nombre entre 0 (compris) et 1 (non compris).')}\n  aleatoire(): number;`,
      '}',
      'interface Partie { readonly nom: string; readonly argent: number; readonly sac: Readonly<Record<string, number>>; readonly interrupteurs: Readonly<Record<string, boolean>>; readonly variables: Readonly<Record<string, number | string>>; readonly quetes: Readonly<Record<string, { etat: string; etape: number }>>; readonly compteurs: Readonly<Record<string, number>>; readonly badges: readonly string[]; readonly equipe: readonly any[]; readonly [cle: string]: any; }',
      '/** Ce que Saga prête à un script pour agir sur le jeu. Tout ce qui change le jeu se fait avec await. */',
      'interface Saga {',
      `  ${doc1('Une copie (gelée) de la partie : sac, argent, interrupteurs, variables, quêtes, compteurs, équipe… Elle se met à jour après chaque await.')}\n  readonly partie: Partie;`,
      `  ${doc1('La carte où est le joueur.')}\n  readonly carte: { readonly id: string; readonly nom: string } | null;`,
      `  ${doc1('L\'événement qui a lancé le script (null pour une réaction).')}\n  readonly evenement: { readonly id: string; readonly nom: string; readonly x: number; readonly y: number } | null;`,
      `  ${doc1('Le joueur : son nom et sa case.')}\n  readonly joueur: { readonly nom: string; readonly x: number; readonly y: number; readonly direction: Direction } | null;`,
      `  ${doc1('Une boîte de dialogue. qui : un id de personnage, \'@evenement\' (le personnage de l\'événement) ou \'\' (texte seul). {joueur} devient le nom du joueur ; une ligne vide coupe en plusieurs boîtes.')}\n  dire(texte: string, qui?: IdPersonnage, expression?: string): Promise<void>;`,
      `  ${doc1('Une question : 1 à 4 réponses. Rend le numéro de la réponse choisie (0 pour la première).')}\n  choisir(reponses: string[]): Promise<number>;`,
      `  ${doc1('Un petit bandeau en haut de l\'écran (comme « Nouvelle quête »).')}\n  annoncer(titre: string, texte?: string): Promise<void>;`,
      `  ${doc1('Une pause, en millisecondes.')}\n  attendre(ms: number): Promise<void>;`,
      `  ${doc1('Sans valeur : l\'interrupteur est-il allumé ? Avec une valeur : l\'allume (true) ou l\'éteint (false).')}\n  interrupteur(id: IdInterrupteur): boolean;\n  interrupteur(id: IdInterrupteur, valeur: boolean): Promise<void>;`,
      `  ${doc1('Sans valeur : l\'événement est-il « déjà fait » ? Avec une valeur : le marque (true) ou non.')}\n  local(): boolean;\n  local(valeur: boolean): Promise<void>;`,
      `  ${doc1('Sans valeur : la valeur de la variable (0 si elle n\'existe pas). Avec une valeur : la règle (un nombre ou un texte).')}\n  variable(id: IdVariable): number | string;\n  variable(id: IdVariable, valeur: number | string): Promise<void>;`,
      `  ${doc1('Ajoute n à une variable (n négatif pour retirer).')}\n  ajouter(id: IdVariable, n?: number): Promise<void>;`,
      `  ${doc1('Combien le joueur a de cet objet.')}\n  combien(objet: IdObjet): number;`,
      `  ${doc1('Donne un objet au joueur (avec le message « Tu reçois… »).')}\n  donner(objet: IdObjet, nombre?: number): Promise<void>;`,
      `  ${doc1('Retire un objet au joueur.')}\n  retirer(objet: IdObjet, nombre?: number): Promise<void>;`,
      `  ${doc1('Sans valeur : l\'argent du joueur. Avec une valeur : en donne (positif) ou en retire (négatif, jamais sous 0).')}\n  argent(): number;\n  argent(montant: number): Promise<void>;`,
      `  ${doc1('Fait avancer une quête : \'commencer\', \'etape\' (avec son numéro) ou \'finir\'.')}\n  quete(quete: IdQuete, action?: 'commencer' | 'etape' | 'finir', etape?: number): Promise<void>;`,
      `  ${doc1('L\'état d\'une quête : \'pas_commencee\', \'en_cours\' ou \'finie\'.')}\n  etatQuete(quete: IdQuete): 'pas_commencee' | 'en_cours' | 'finie';`,
      `  ${doc1('Donne un badge.')}\n  badge(badge: string): Promise<void>;`,
      `  ${doc1('Soigne toute l\'équipe (le joueur se réveillera ici s\'il perd un combat).')}\n  soigner(): Promise<void>;`,
      `  ${doc1('Emmène le joueur ailleurs, avec un fondu.')}\n  teleporter(carte: IdCarte, x: number, y: number, direction?: Direction): Promise<void>;`,
      ...(packDe(doc) === 'jdr'
        ? [`  ${doc1('Un test au d20 contre un DD, comme le bloc Test (pack JDR). qui : \'choix\' (le joueur choisit), \'meilleur\', \'premier\', \'tous\' (réussi si l\'un réussit), \'groupe\' (la moitié). Rend reussi, total, membre (son nom), naturel.')}\n  test(o: { competence: string; dd: number; qui?: 'choix' | 'meilleur' | 'premier' | 'tous' | 'groupe'; avantage?: boolean; desavantage?: boolean; quoi?: string }): Promise<{ reussi: boolean; total: number; membre: string; naturel: number; annule?: boolean }>;`,
          `  ${doc1('Un jet de sauvegarde du groupe (pack JDR), avec des dégâts (la moitié si réussi avec moitie) et un état pour ceux qui ratent. reussi : tous ont réussi.')}\n  sauvegarde(o: { carac: string; dd: number; qui?: 'tous' | 'premier' | 'choix'; degats?: string; type_degats?: string; moitie?: boolean; etat?: string; quoi?: string }): Promise<{ reussi: boolean; reussis: number; total: number }>;`,
          `  ${doc1('Un test opposé (pack JDR) : la compétence d\'un héros contre un monstre de monstres_jdr ou un PNJ (son bonus : contre).')}\n  oppose(o: { competence: string; monstre?: string; competence_adverse?: string; contre?: number; nom_adverse?: string; qui?: 'choix' | 'meilleur' | 'premier' }): Promise<{ reussi: boolean; total: number; adverse: number }>;`,
          `  ${doc1('Un jet de dés montré sur le plateau et noté au journal des jets (pack JDR) : \'2d6+3\'.')}\n  jet(formule: string, quoi?: string): Promise<{ total: number; des: number[] }>;`,
          `  ${doc1('Le groupe se repose (pack JDR).')}\n  repos(sorte?: 'court' | 'long'): Promise<void>;`,
          `  ${doc1('Chaque héros gagne de l\'expérience (pack JDR).')}\n  xp(montant: number): Promise<void>;`,
          `  ${doc1('Met ou enlève un état (empoisonne, a_terre…) au groupe (pack JDR).')}\n  etat(etat: string, action?: 'ajouter' | 'retirer', qui?: 'tous' | 'premier' | 'choix'): Promise<void>;`,
          `  ${doc1('La fiche du membre i du groupe (0 = le premier), ou null (pack JDR) : nom, classe, niveau, pv, pvMax, ca, caracteristiques, modificateurs, sauvegardes, competences (les bonus), etats, sorts…')}\n  fiche(i?: number): Fiche | null;`,
          `  ${doc1('Toutes les fiches du groupe (pack JDR).')}\n  readonly fiches: Fiche[];`,
          `  ${doc1('Un combat contre une rencontre (un groupe de monstres). Rend l\'issue ; perdu, le script de l\'événement s\'arrête.')}\n  combattre(o: { groupe: IdGroupe }): Promise<Issue>;`]
        : packDe(doc) === 'jrpg'
        ? [`  ${doc1('Un personnage rejoint ou quitte le groupe (pack JRPG).')}\n  groupe(personnage: IdPersonnage, action?: 'rejoindre' | 'quitter', niveau?: number): Promise<void>;`,
          `  ${doc1('Un combat contre un groupe de monstres. Rend l\'issue ; perdu, le script de l\'événement s\'arrête.')}\n  combattre(o: { groupe: IdGroupe }): Promise<Issue>;`]
        : [`  ${doc1('Donne une créature au joueur.')}\n  creature(creature: IdCreature, niveau?: number): Promise<void>;`,
          `  ${doc1('Un combat contre une créature sauvage ou un dresseur. Rend l\'issue ; perdu, le script de l\'événement s\'arrête.')}\n  combattre(o: { creature: IdCreature; niveau?: number } | { dresseur: IdDresseur }): Promise<Issue>;`]),
      `  ${doc1('Ouvre une boutique.')}\n  boutique(boutique: IdBoutique): Promise<void>;`,
      `  ${doc1('Change la musique : un fichier de sons/, \'aucune\' (silence) ou \'\' (celle de la carte).')}\n  musique(fichier: string): Promise<void>;`,
      `  ${doc1('Joue un bruitage de sons/.')}\n  son(fichier: string): Promise<void>;`,
      `  ${doc1('L\'horloge du jeu : met l\'heure (\'regler\') ou l\'avance de quelques heures (\'avancer\').')}\n  heure(heures: number, action?: 'regler' | 'avancer'): Promise<void>;`,
      `  ${doc1('N\'importe quelle commande des scripts en blocs, telle que dans FORMAT.md › Commandes : { type: \'soigner\' }, { type: \'boutique\', boutique: \'marche\' }…')}\n  commande(c: { type: string; [cle: string]: any }): Promise<any>;`,
      `  ${doc1('Arrête le script de l\'événement ici (les blocs suivants ne se jouent pas).')}\n  fin(): never;`,
      '}',
      'interface ReglageCommande { /** Le genre de réglage (une case dans le bloc Script de Tafl). */ type?: \'nombre\' | \'texte\' | \'oui_non\' | \'liste\' | \'objet\' | \'personnage\' | \'carte\' | \'interrupteur\' | \'variable\' | \'quete\' | \'creature\'; /** Son nom dans Tafl. */ nom?: string; /** Sa valeur si on ne la change pas. */ defaut?: any; /** Pour une liste : les choix. */ choix?: string[]; min?: number; max?: number; aide?: string; }',
      `${doc1('Déclare une commande pour le bloc « Script JS » des événements. reglages : ce que Tafl demandera dans le bloc (exemple : { degats: { type: \'nombre\', nom: \'Dégâts\', defaut: 10 } }).')}`,
      'declare function commande(nom: string, fn: (saga: Saga, params: Readonly<Record<string, any>>) => any): void;',
      'declare function commande(nom: string, reglages: Record<string, ReglageCommande | number | string | boolean>, fn: (saga: Saga, params: Readonly<Record<string, any>>) => any): void;',
      `${doc1('Une règle maison : remplace une formule du pack de règles de ce jeu. valeurs.normal est le résultat de la formule du pack. Rend un nombre.')}`,
      'declare function formule<N extends keyof Formules>(nom: N, fn: (valeurs: Formules[N] & { readonly normal: number }, des: Des) => number): void;',
      `${doc1('Une réaction à un moment du jeu (une nouvelle partie, une carte, après un combat…).')}`,
      'declare function quand<M extends keyof Moments>(moment: M, fn: (saga: Saga, infos: Moments[M]) => any): void;',
      `${doc1('Les dés et le hasard.')}\ndeclare const des: Des;`,
      `${doc1('Les données du jeu (personnages, objets, quêtes…), en lecture seule et sans les images.')}\ndeclare const donnees: { readonly [sorte: string]: any };`,
      `${doc1('Écrire dans la console de Tafl (Essayer) ou de Saga.')}\ndeclare const console: { log(...x: any[]): void; warn(...x: any[]): void; error(...x: any[]): void };`,
    ];
    return L.join('\n');
  }

  // --- Essayer : jouer une commande (ou une formule, une réaction) pour de faux ---
  // Une fausse partie (celle du début du jeu, avec un peu d'argent) ; les demandes du script sont
  // racontées dans la console au lieu d'être jouées. saga.choisir demande vraiment la réponse.
  function faussePartie(doc) {
    const variables = {};
    for (const v of doc.data.variables || []) variables[v.id] = v.defaut;
    return {
      nom: doc.data.personnages.find((p) => p.heros)?.nom || 'Ragna', argent: Number(doc.data.reglages?.argent_depart) || 3000,
      sac: {}, interrupteurs: {}, locaux: {}, variables, quetes: {}, badges: [], equipe: [], boites: [],
      compteurs: { captures: 0, dresseurs_battus: 0, sauvages_battus: 0, evolutions: 0, badges: 0, pas: 0 },
    };
  }
  const nomDe = (doc, sorte, id) => (doc.data[sorte] || []).find((o) => o.id === id)?.nom || id;
  // ici : le fichier ouvert (ses erreurs sont dites ; celles des autres scripts, seulement comptées).
  async function essayer(doc, quoi, console, ici = '') {
    appliquer();
    const inv = await rafraichir(doc);
    for (const e of inv.erreurs.filter((x) => !ici || x.fichier === ici)) console.ecrire('erreur', `${BacASable.lieuTexte(e.ligne ? e : null) || e.fichier} : ${e.message}`);
    const autres = inv.erreurs.filter((x) => ici && x.fichier !== ici).length;
    if (autres) console.ecrire('log', `${autres} autre(s) script(s) du jeu ont une erreur : ils ne sont pas chargés pour cet essai.`);
    const partie = faussePartie(doc);
    const carte = doc.map ? { id: doc.map.id, nom: doc.map.name } : null;
    const ev = { id: 'essai', nom: 'Essai', x: 0, y: 0 };
    const raconter = (c) => {
      const n = c.nombre > 1 ? ` ×${c.nombre}` : '';
      switch (c.type) {
        case 'dire': { const qui = c.qui === '@evenement' ? 'L\'événement' : c.qui ? nomDe(doc, 'personnages', c.qui) : ''; return `${qui ? `${qui} : ` : ''}« ${String(c.texte).replace(/\{joueur\}/g, partie.nom)} »`; }
        case 'objet': partie.sac[c.objet] = Math.max(0, (partie.sac[c.objet] || 0) + (c.action === 'retirer' ? -c.nombre : c.nombre)); return `${c.action === 'retirer' ? 'Retire' : 'Donne'} ${nomDe(doc, 'objets', c.objet)}${n}`;
        case 'argent': partie.argent = Math.max(0, partie.argent + (c.action === 'retirer' ? -c.montant : c.montant)); return `${c.action === 'retirer' ? 'Retire' : 'Donne'} ${c.montant} d'argent`;
        case 'interrupteur': partie.interrupteurs[c.id] = Boolean(c.valeur); return `Interrupteur « ${c.id} » ${c.valeur ? 'allumé' : 'éteint'}`;
        case 'local': partie.locaux[`${carte?.id}/${ev.id}`] = Boolean(c.valeur); return c.valeur ? 'Marque l\'événement « déjà fait »' : 'Marque l\'événement « pas encore fait »';
        case 'variable': {
          const avant = partie.variables[c.id] ?? 0;
          partie.variables[c.id] = c.action === 'regler' ? c.valeur : (Number(avant) || 0) + (c.action === 'retirer' ? -1 : 1) * (Number(c.valeur) || 0);
          return `Variable « ${c.id} » : ${avant} → ${partie.variables[c.id]}`;
        }
        case 'quete': partie.quetes[c.quete] = { etat: c.action === 'finir' ? 'finie' : 'en_cours', etape: c.action === 'etape' ? c.etape : 1 }; return `Quête « ${nomDe(doc, 'quetes', c.quete)} » : ${c.action}`;
        case 'attendre': return `Attend ${c.ms} ms`;
        case 'fin': throw BacASable.FIN;
        default: return `Commande ${c.type} ${JSON.stringify(c)}`;
      }
    };
    const bac = BacASable.creer({
      fichiers: actifs(doc), donnees: doc.data, graine: Math.floor(Math.random() * 2147483647),
      hote: {
        etat: () => ({ partie: JSON.parse(JSON.stringify(partie)), carte, evenement: quoi.sorte === 'commande' ? ev : null, joueur: { nom: partie.nom, x: 0, y: 0, direction: 'bas' } }),
        console: (c) => console.ecrire(c.niveau === 'erreur' ? 'erreur' : 'log', `${c.lieu ? `${BacASable.lieuTexte(c.lieu)} · ` : ''}${c.texte}`),
        demande: async (action, args) => {
          if (action === 'choisir') {
            console.ecrire('demande', `Question : ${args.options.map((o, i) => `${i + 1}. ${o}`).join('   ')}`);
            // Loki (essayer_script) donne ses réponses à l'avance : 1 = la première ; après la dernière, la première.
            const i = Array.isArray(quoi.reponses) ? Math.min(args.options.length, Math.max(1, Number(quoi.reponses.shift()) || 1)) - 1 : await Dialogs.ask('Le script pose une question', 'Quelle réponse le joueur choisit-il ?', args.options.map((o, k) => ({ label: o, value: k, primary: k === 0 })));
            console.ecrire('demande', `→ le joueur répond « ${args.options[i ?? 0]} »`);
            return i ?? 0;
          }
          if (action === 'annoncer') { console.ecrire('demande', `Bandeau : ${args.titre}${args.texte ? ` · ${args.texte}` : ''}`); return null; }
          if (args.type === 'combat_sauvage' || args.type === 'combat_dresseur' || args.type === 'combat_groupe') {
            console.ecrire('demande', `Combat (${args.creature || args.dresseur || args.groupe}) : pour l'essai, c'est une victoire`);
            return 'victoire';
          }
          console.ecrire('demande', raconter(args));
          return null;
        },
      },
    });
    try {
      await bac.pret();
      const t0 = performance.now();
      if (quoi.sorte === 'formule') {
        const ex = { ...(BacASable.formulesDuPack(packDe(doc))[quoi.nom]?.exemple || {}), ...(quoi.valeurs || {}) };
        const r = await bac.appeler('formule', quoi.nom, ex);
        console.ecrire('ok', `formule('${quoi.nom}') avec ${JSON.stringify(ex)} → ${r.valeur?.absente ? 'pas remplacée' : r.valeur} (le pack donnait ${ex.normal})`);
      } else if (quoi.sorte === 'quand') {
        const infos = { carte: { carte: carte?.id || '', depuis: '' }, apres_combat: { issue: 'victoire', sorte: ['jrpg', 'jdr'].includes(packDe(doc)) ? 'groupe' : 'sauvage' }, moment: { moment: 'nuit' }, pas: { x: 3, y: 4 } }[quoi.nom] || {};
        await bac.appeler('quand', quoi.nom, infos);
        console.ecrire('ok', `quand('${quoi.nom}') a fini (${Math.round(performance.now() - t0)} ms).`);
      } else {
        const r = await bac.appeler('commande', quoi.nom, { params: quoi.params || {} });
        console.ecrire('ok', `${r.finScript ? 'Le script de l\'événement s\'arrêterait ici. ' : ''}« ${quoi.nom} » a fini.`);
      }
    } catch (err) {
      console.ecrire('erreur', `${err.lieu ? `${BacASable.lieuTexte(err.lieu)} · ` : ''}${err.message}`);
    } finally {
      bac.fermer();
    }
  }

  // --- La liste des scripts (sous les événements, dans l'espace Événements) ---
  function ligneListe(doc, choisi, choisir, ajouter) {
    const inv = connu(doc);
    const box = el('div', { className: 'scripts-liste' });
    const plus = el('button', { className: 'icon-button', title: 'Nouveau script JS' }, [icon('add')]);
    plus.onclick = (e) => ajouter(e);
    box.append(el('div', { className: 'page-group scripts-tete' }, [icon('code'), el('span', { textContent: 'Scripts JS' }), el('span', { className: 'panel-count', textContent: String(doc.scripts.length) }), plus]));
    for (const s of doc.scripts) {
      const erreurs = inv.erreurs.filter((e) => e.fichier === fichier(s)).length;
      const row = el('button', { className: `row${s.nom === choisi ? ' active' : ''}${s.actif === false ? ' inactif' : ''}`, title: s.actif === false ? 'Coupé : Saga ne le charge pas' : fichier(s) }, [
        icon(s.actif === false ? 'circle-slash' : 'file-code'),
        el('span', { className: 'row-name', textContent: `${s.nom}.js` }),
        erreurs ? el('span', { className: 'badge erreur', textContent: `${erreurs} erreur${erreurs > 1 ? 's' : ''}` }) : null,
      ]);
      row.onclick = () => choisir(s.nom);
      box.append(row);
    }
    if (!doc.scripts.length) box.append(el('p', { className: 'modal-info', textContent: 'Pas encore de script. Le + en propose des modèles : une commande avec dialogue, un jet de dés, une règle de dégâts maison…' }));
    return box;
  }

  async function nouveau(doc, x, y) {
    if (!doc.game) {
      const ok = await Dialogs.ask('Scripts JS', 'Les scripts vivent dans un dossier de jeu (scripts/*.js), que Saga lit. Ce document est un simple jeu de tuiles : enregistre-le d\'abord comme dossier de jeu (Fichier › Enregistrer comme dossier de jeu). Tu peux quand même écrire le script maintenant.', [
        { label: 'Annuler', value: false }, { label: 'Écrire quand même', value: true, primary: true }]);
      if (!ok) return null;
    }
    const m = await new Promise((resolve) => Menus.open(modeles(doc).map((x2) => ({ label: x2.nom, run: () => resolve(x2) })), x, y));
    if (!m) return null;
    let nom = m.nomFichier, n = 2;
    while (doc.scripts.some((s) => s.nom === nom)) nom = `${m.nomFichier}-${n++}`;
    appliquer();
    Doc.change(doc, `Nouveau script ${nom}.js`, () => { doc.scripts = [...doc.scripts, { nom, code: m.code, actif: true }]; });
    return nom;
  }

  // --- La page d'un script (dans l'espace Événements) ---
  // Rend une promesse qui finit quand on quitte le script (fermer() : choisir autre chose).
  let pageCourante = null;
  function page(hote, doc, nom, { fini, ligne = 0, ligneVue = () => {} }) {
    const s = () => doc.scripts.find((x) => x.nom === nom);
    if (!s()) { fini(); return; }
    if (docBrouillons !== doc) { brouillons.clear(); docBrouillons = doc; }
    const sortie = el('div', { className: 'script-console' });
    const consoleScript = {
      ecrire(niveau, texte) {
        sortie.querySelector('.script-console-vide')?.remove();
        sortie.append(el('div', { className: `script-ligne ${niveau}` }, [icon({ erreur: 'error', demande: 'arrow-right', ok: 'pass', log: 'output' }[niveau] || 'output'), el('span', { textContent: texte })]));
        sortie.scrollTop = sortie.scrollHeight;
      },
      vider() { sortie.replaceChildren(el('p', { className: 'script-console-vide modal-info', textContent: 'Essayer joue une commande, une formule ou une réaction sur une partie pour de faux : ce qu\'elle aurait fait s\'écrit ici. console.log() aussi.' })); },
    };
    consoleScript.vider();
    const titre = el('span', { className: 'panel-title', textContent: `${nom}.js` });
    const actif = el('input', { type: 'checkbox', checked: s().actif !== false });
    actif.onchange = () => {
      appliquer();
      Doc.change(doc, `${actif.checked ? 'Activer' : 'Couper'} le script ${nom}.js`, () => { doc.scripts = doc.scripts.map((x) => (x.nom === nom ? { ...x, actif: actif.checked } : x)); });
      majCote();
      Espaces.recharger?.();
    };
    const essai = el('button', { className: 'button primary', title: 'Jouer pour de faux ce que déclare ce script (Ctrl+Entrée dans l\'éditeur)' }, [icon('play'), 'Essayer']);
    const renommer = el('button', { className: 'icon-button', title: 'Renommer le fichier' }, [icon('edit')]);
    const supprimer = el('button', { className: 'icon-button', title: 'Supprimer ce script' }, [icon('trash')]);
    const aide = el('button', { className: 'icon-button', title: 'Tout ce qu\'un script peut faire (SCRIPTS.md)' }, [icon('question')]);
    const zone = el('div', { className: 'script-editeur' }, [el('div', { className: 'page-vide' }, [icon('loading'), el('span', { textContent: 'Chargement de l\'éditeur…' })])]);
    const cote = el('aside', { className: 'script-cote' });
    hote.replaceChildren(el('div', { className: 'script-page page-panel' }, [
      el('div', { className: 'panel-header' }, [icon('file-code'), titre,
        el('label', { className: 'script-actif', title: 'Coupé, Saga ne charge pas ce script (rien n\'est effacé)' }, [actif, el('span', { textContent: 'Actif' })]),
        el('div', { className: 'panel-actions' }, [aide, renommer, supprimer, essai])]),
      el('div', { className: 'script-corps' }, [zone, cote]),
    ]));

    // Le côté : ce que le fichier apporte, puis la console.
    function majCote() {
      const inv = cache.inv;
      const f = fichier(s() || { nom });
      const formules = BacASable.formulesDuPack(packDe(doc));
      const coupees = new Set(doc.data.reglages?.scripts?.formules_coupees || []);
      const mes = { commandes: inv.commandes.filter((x) => x.fichier === f), formules: inv.formules.filter((x) => x.fichier === f), quand: inv.quand.filter((x) => x.fichier === f), erreurs: inv.erreurs.filter((x) => x.fichier === f) };
      const bloc = (titreBloc, items) => (items.length ? [el('div', { className: 'editor-section' }, [el('span', { textContent: titreBloc })]), ...items] : []);
      const ligne = (ic, texte, detail, quoi, classe = '') => {
        const b = el('button', { className: `script-item ${classe}`, title: quoi ? 'Essayer' : '' }, [icon(ic), el('span', { className: 'script-item-nom', textContent: texte }), detail ? el('span', { className: 'script-item-detail', textContent: detail }) : null, quoi ? icon('play') : null]);
        if (quoi) b.onclick = () => { consoleScript.vider(); essayer(doc, quoi, consoleScript, fichier(s())); };
        else b.disabled = true;
        return b;
      };
      cote.replaceChildren(
        el('div', { className: 'script-apporte' }, [
          ...(s()?.actif === false ? [el('p', { className: 'modal-info', textContent: 'Ce script est coupé : Saga ne le charge pas, et ses commandes ne sont pas proposées dans le bloc Script.' })] : []),
          ...bloc('Erreurs', mes.erreurs.map((e) => {
            const b = ligne('error', e.ligne ? `Ligne ${e.ligne}` : 'Au chargement', e.message, null, 'erreur');
            if (e.ligne) { b.disabled = false; b.title = 'Aller à cette ligne'; b.onclick = () => allerLigne(e.ligne, e.colonne); }
            return b;
          })),
          ...bloc('Commandes (bloc Script)', mes.commandes.map((c) => ligne('symbol-method', c.nom, Object.values(c.params).map((p) => p.nom).join(', '), { sorte: 'commande', nom: c.nom }))),
          ...bloc('Règles maison (formules)', mes.formules.map((x) => {
            const def = formules[x.nom];
            return ligne(def ? 'symbol-operator' : 'warning', x.nom, def ? `${def.nom}${coupees.has(x.nom) ? ' · coupée dans Réglages' : ''}` : `inconnue du pack ${packDe(doc)} : Saga ne l'appellera jamais`, def ? { sorte: 'formule', nom: x.nom } : null, def ? '' : 'attention');
          })),
          ...bloc('Réactions (quand)', mes.quand.map((x) => {
            const def = BacASable.MOMENTS[x.moment];
            return ligne(def ? 'symbol-event' : 'warning', x.moment, def ? def.nom : 'moment inconnu : Saga ne l\'appellera jamais', def ? { sorte: 'quand', nom: x.moment } : null, def ? '' : 'attention');
          })),
          ...(!mes.erreurs.length && !mes.commandes.length && !mes.formules.length && !mes.quand.length ? [el('p', { className: 'modal-info', textContent: 'Ce fichier ne déclare encore rien. commande(), formule() et quand() s\'affichent ici au fur et à mesure.' })] : []),
          el('div', { className: 'editor-section' }, [el('span', { textContent: `Formules du pack ${{ jrpg: 'JRPG', jdr: 'JDR' }[packDe(doc)] || 'Pokémon'}` })]),
          el('p', { className: 'script-formules modal-info', textContent: Object.entries(formules).map(([k, f]) => `${k} (${f.nom.toLowerCase()})`).join(' · ') }),
        ]),
        el('div', { className: 'editor-section' }, [el('span', { textContent: 'Console' })]),
        sortie,
      );
    }
    const ecoute = () => majCote();
    ecouteurs.add(ecoute);
    majCote();
    rafraichir(doc);

    let editeur = null, modele = null, minuteur = null;
    let allerLigne = () => {};
    essai.onclick = () => {
      const inv = cache.inv, f = fichier(s());
      const c = inv.commandes.find((x) => x.fichier === f), fo = inv.formules.find((x) => x.fichier === f), q = inv.quand.find((x) => x.fichier === f);
      const quoi = c ? { sorte: 'commande', nom: c.nom } : fo ? { sorte: 'formule', nom: fo.nom } : q ? { sorte: 'quand', nom: q.moment } : null;
      consoleScript.vider();
      if (!quoi) { appliquer(); rafraichir(doc).then(() => { majCote(); consoleScript.ecrire('log', 'Rien à essayer : ce fichier ne déclare ni commande(), ni formule(), ni quand().'); }); return; }
      essayer(doc, quoi, consoleScript, fichier(s()));
    };
    aide.onclick = () => window.tafl.ouvrirAideScripts().catch((err) => notify(`L'aide des scripts (SCRIPTS.md) ne s'ouvre pas : ${err.message}`, 'error'));
    renommer.onclick = async () => {
      const v = await Dialogs.form({ title: 'Renommer le script', okLabel: 'Renommer', fields: [{ key: 'nom', label: 'Nom', type: 'text', value: nom, unit: '.js' }, { type: 'info', text: 'En minuscules, chiffres et tirets : il devient scripts/<nom>.js dans le dossier du jeu.' }] });
      const neuf = v && Doc.slug(v.nom, '').slice(0, 60);
      if (!neuf || neuf === nom) return;
      if (doc.scripts.some((x) => x.nom === neuf)) { notify(`Il y a déjà un script ${neuf}.js.`, 'warning'); return; }
      appliquer();
      Doc.change(doc, `Renommer ${nom}.js en ${neuf}.js`, () => { doc.scripts = doc.scripts.map((x) => (x.nom === nom ? { ...x, nom: neuf } : x)); });
      fermer(neuf);
    };
    supprimer.onclick = async () => {
      const go = await Dialogs.ask('Supprimer le script', `${nom}.js sera retiré du jeu (Ctrl+Z le remet). Les blocs Script qui utilisent ses commandes ne les trouveront plus.`, [{ label: 'Annuler', value: false }, { label: 'Supprimer', value: true, primary: true }]);
      if (!go) return;
      brouillons.delete(nom);
      Doc.change(doc, `Supprimer le script ${nom}.js`, () => { doc.scripts = doc.scripts.filter((x) => x.nom !== nom); });
      fermer('');
    };

    chargerMonaco().then((monaco) => {
      if (pageCourante !== moi) return;
      majTypes(monaco, doc);
      zone.replaceChildren();
      modele = monaco.editor.createModel(texteDe(doc, s()), 'javascript');
      editeur = monaco.editor.create(zone, {
        model: modele, theme: 'tafl-verre', automaticLayout: true, fontSize: 13, tabSize: 2, minimap: { enabled: false },
        scrollBeyondLastLine: false, wordWrap: 'on', fixedOverflowWidgets: true, renderLineHighlight: 'line', padding: { top: 8 },
      });
      editeur.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => essai.click());
      // Ctrl+K est un début de raccourci dans Monaco : ici, il garde son sens de Tafl (chercher partout).
      editeur.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, () => Recherche.ouvrir());
      allerLigne = (l, c = 1) => { editeur.revealLineInCenter(l); editeur.setPosition({ lineNumber: l, column: c || 1 }); editeur.focus(); };
      const marquer = () => {
        const erreurs = cache.inv.erreurs.filter((e) => e.fichier === fichier(s() || { nom }) && e.ligne);
        monaco.editor.setModelMarkers(modele, 'bac-a-sable', erreurs.map((e) => ({ severity: monaco.MarkerSeverity.Error, message: e.message, startLineNumber: e.ligne, endLineNumber: e.ligne, startColumn: e.colonne || 1, endColumn: 1000 })));
      };
      ecouteurs.add(marquer);
      marquer();
      modele.onDidChangeContent(() => {
        brouillons.set(nom, modele.getValue());
        if (!doc.dirty) { doc.dirty = true; App.refresh(); }
        clearTimeout(minuteur);
        minuteur = setTimeout(() => rafraichir(doc), 500);
      });
      moi.liberer = () => { ecouteurs.delete(marquer); editeur.dispose(); modele.dispose(); };
      if (ligne > 0) { allerLigne(ligne); ligneVue(); } else editeur.focus();
    }).catch((err) => {
      zone.replaceChildren(el('div', { className: 'page-vide' }, [icon('warning'), el('strong', { textContent: 'L\'éditeur de code ne s\'ouvre pas.' }), el('span', { textContent: err.message })]));
    });

    const moi = { nom, liberer: () => {} };
    pageCourante = moi;
    function fermer(suivant) {
      if (pageCourante !== moi) return;
      if (!moi.sansAppliquer) appliquer();
      clearTimeout(minuteur);
      ecouteurs.delete(ecoute);
      moi.liberer();
      pageCourante = null;
      fini(suivant);
    }
    moi.fermer = fermer;
    return moi;
  }
  const quitterPage = () => pageCourante?.fermer(undefined);
  // Le jeu a changé ailleurs (Ctrl+Z, Loki, un autre jeu) : la page se rouvre sur le texte du jeu,
  // sans rien appliquer (ce qui était tapé l'a déjà été par Espaces.appliquer).
  function rouvrir() {
    brouillons.clear();
    if (!pageCourante) return;
    const p = pageCourante;
    p.sansAppliquer = true;
    p.fermer(undefined);
  }

  // --- Pour le vérificateur, Ctrl+K et Loki ---
  // Les problèmes des scripts : erreurs, formules et moments inconnus, blocs Script sans commande.
  function problemes(doc) {
    const inv = connu(doc);
    const out = [];
    for (const e of inv.erreurs) out.push({ gravite: 'erreur', message: `${BacASable.lieuTexte(e.ligne ? e : null) || e.fichier} : ${e.message}`, script: e.fichier.replace(/^scripts\/|\.js$/g, ''), ligne: e.ligne || 0 });
    const formules = BacASable.formulesDuPack(packDe(doc));
    for (const f of inv.formules) if (!formules[f.nom]) out.push({ gravite: 'attention', message: `${f.fichier.replace(/^scripts\//, '')} : formule('${f.nom}') n'existe pas dans le pack ${packDe(doc)} (possibles : ${Object.keys(formules).join(', ')}) : Saga ne l'appellera jamais.`, script: f.fichier.replace(/^scripts\/|\.js$/g, '') });
    for (const q of inv.quand) if (!BacASable.MOMENTS[q.moment]) out.push({ gravite: 'attention', message: `${q.fichier.replace(/^scripts\//, '')} : quand('${q.moment}') : ce moment n'existe pas (possibles : ${Object.keys(BacASable.MOMENTS).join(', ')}).`, script: q.fichier.replace(/^scripts\/|\.js$/g, '') });
    return out;
  }

  return {
    connu, etat, rafraichir, appliquer, page, quitterPage, rouvrir, ligneListe, nouveau, essayer, problemes, modeles, typesPour,
    ecouter: (f) => { ecouteurs.add(f); return () => ecouteurs.delete(f); },
    get pageOuverte() { return pageCourante; },
  };
})();
