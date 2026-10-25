// Le modèle D&D 5e du pack JDR (Tafl 0.32, joué par Saga 0.13) : Réglages › « Charger le modèle D&D 5e
// (SRD) ». Les règles de base de la 5e en français, tirées du SRD 5.1 (System Reference Document) de
// Wizards of the Coast, sous licence Creative Commons Attribution 4.0 (CC-BY-4.0) :
// https://creativecommons.org/licenses/by/4.0/legalcode. Le texte d'attribution est dans ATTRIBUTION
// (Tafl le met dans les crédits du jeu quand on charge le modèle).
//
// Ce fichier ne contient que des données, écrites en court (des tableaux) puis dépliées au format des
// fichiers du jeu (tuiles/FORMAT.md › « Le pack JDR ») par donnees() en bas. Les distances sont en mètres
// (1,5 m = une case = 5 pieds). Les aptitudes de classe des niveaux 1 à 5 qui ont un `effet` sont jouées
// par Saga ; les autres (et celles des niveaux 6 à 20) sont écrites sur la fiche, pour le MJ et les joueurs.

const ModeleDnd5e = (() => {
  const ATTRIBUTION = 'Ce jeu utilise du contenu du System Reference Document 5.1 (« SRD 5.1 ») de Wizards of the Coast LLC, disponible à https://dnd.wizards.com/resources/systems-reference-document. Le SRD 5.1 est publié sous licence Creative Commons Attribution 4.0 International, disponible à https://creativecommons.org/licenses/by/4.0/legalcode. Traduction française et adaptation pour Tafl et Saga.';

  // --- Les listes de base ---
  const CARACTERISTIQUES = [['for', 'Force', 'FOR'], ['dex', 'Dextérité', 'DEX'], ['con', 'Constitution', 'CON'], ['int', 'Intelligence', 'INT'], ['sag', 'Sagesse', 'SAG'], ['cha', 'Charisme', 'CHA']]
    .map(([id, nom, court]) => ({ id, nom, court }));
  const COMPETENCES = [
    ['acrobaties', 'Acrobaties', 'dex'], ['arcanes', 'Arcanes', 'int'], ['athletisme', 'Athlétisme', 'for'],
    ['discretion', 'Discrétion', 'dex'], ['dressage', 'Dressage', 'sag'], ['escamotage', 'Escamotage', 'dex'],
    ['histoire', 'Histoire', 'int'], ['intimidation', 'Intimidation', 'cha'], ['intuition', 'Intuition', 'sag'],
    ['investigation', 'Investigation', 'int'], ['medecine', 'Médecine', 'sag'], ['nature', 'Nature', 'int'],
    ['perception', 'Perception', 'sag'], ['persuasion', 'Persuasion', 'cha'], ['religion', 'Religion', 'int'],
    ['representation', 'Représentation', 'cha'], ['survie', 'Survie', 'sag'], ['tromperie', 'Tromperie', 'cha'],
  ].map(([id, nom, carac]) => ({ id, nom, carac }));
  const ETATS = [
    ['a_terre', 'À terre', 'Désavantage à ses attaques ; on l\'attaque avec avantage au contact (désavantage à distance). Se relever coûte la moitié de son déplacement.', ['desavantage_attaques', 'avantage_contre']],
    ['agrippe', 'Agrippé', 'Sa vitesse tombe à 0.', []],
    ['assourdi', 'Assourdi', 'N\'entend plus rien et rate les tests qui demandent l\'ouïe.', []],
    ['aveugle', 'Aveuglé', 'Ne voit plus : désavantage à ses attaques ; on l\'attaque avec avantage.', ['desavantage_attaques', 'avantage_contre']],
    ['charme', 'Charmé', 'Ne peut pas attaquer celui qui l\'a charmé ; celui-ci a l\'avantage à ses tests sociaux contre lui.', []],
    ['effraye', 'Effrayé', 'Désavantage à ses tests et à ses attaques tant qu\'il voit ce qui l\'effraie ; ne peut pas s\'en approcher.', ['desavantage_attaques', 'desavantage_tests']],
    ['empoisonne', 'Empoisonné', 'Désavantage à ses attaques et à ses tests de caractéristique.', ['desavantage_attaques', 'desavantage_tests']],
    ['entrave', 'Entravé', 'Vitesse 0 ; désavantage à ses attaques et aux sauvegardes de Dextérité ; on l\'attaque avec avantage.', ['desavantage_attaques', 'avantage_contre', 'desavantage_sauvegardes_dex']],
    ['etourdi', 'Étourdi', 'Incapable d\'agir ; rate ses sauvegardes de Force et de Dextérité ; on l\'attaque avec avantage.', ['incapable', 'echec_for_dex', 'avantage_contre']],
    ['incapable', 'Neutralisé', 'Ne peut ni agir ni réagir.', ['incapable']],
    ['inconscient', 'Inconscient', 'Incapable d\'agir, lâche ce qu\'il tient, tombe à terre ; rate ses sauvegardes de Force et de Dextérité ; tout coup au contact est critique.', ['incapable', 'echec_for_dex', 'avantage_contre', 'critique_contact']],
    ['invisible', 'Invisible', 'Impossible à voir sans magie : avantage à ses attaques ; on l\'attaque avec désavantage.', ['avantage_attaques', 'desavantage_contre']],
    ['paralyse', 'Paralysé', 'Incapable d\'agir et de bouger ; rate ses sauvegardes de Force et de Dextérité ; tout coup au contact est critique.', ['incapable', 'echec_for_dex', 'avantage_contre', 'critique_contact']],
    ['petrifie', 'Pétrifié', 'Changé en pierre : incapable d\'agir, rate ses sauvegardes de Force et de Dextérité, résiste à tous les dégâts.', ['incapable', 'echec_for_dex', 'avantage_contre']],
    ['epuisement', 'Épuisement', 'Désavantage à ses tests de caractéristique (premier niveau d\'épuisement). Un repos long en retire un niveau.', ['desavantage_tests']],
  ].map(([id, nom, description, effets]) => ({ id, nom, description, effets }));

  // --- Les origines (les races du SRD 5.1, avec la sous-race du SRD) ---
  // trait(nom, description, effet) ; l'effet est facultatif.
  const t = (nom, description, effet) => ({ nom, description, ...(effet ? { effet } : {}) });
  const VISION = t('Vision dans le noir', 'Voit dans la pénombre jusqu\'à 18 m comme en pleine lumière, et dans le noir comme dans la pénombre (en nuances de gris).');
  const ORIGINES = [
    { id: 'nain', nom: 'Nain des collines', bonus: { con: 2, sag: 1 }, vitesse: 7.5, taille: 'moyenne', langues: 'commun, nain', pv_bonus_niveau: 1, resistances: ['poison'],
      maitrises: { armes: ['hachette', 'hache-d-armes', 'marteau-leger', 'marteau-de-guerre'] },
      description: 'Robustes et obstinés, les nains vivent dans des cités de pierre sous les montagnes. Ceux des collines ont un sens aigu des autres et une grande endurance.',
      traits: [VISION, t('Résistance naine', 'Avantage aux sauvegardes contre le poison, et résistance aux dégâts de poison.'), t('Entraînement aux armes naines', 'Maîtrise de la hache d\'armes, de la hachette, du marteau léger et du marteau de guerre.'),
        t('Connaissance de la pierre', 'Double bonus de maîtrise aux tests d\'Histoire sur l\'origine d\'un travail de la pierre.'), t('Ténacité naine', '+1 point de vie à chaque niveau.')] },
    { id: 'elfe', nom: 'Haut-elfe', bonus: { dex: 2, int: 1 }, vitesse: 9, taille: 'moyenne', langues: 'commun, elfique, une langue de plus', maitrises: { competences: ['perception'], armes: ['epee-longue', 'epee-courte', 'arc-court', 'arc-long'] },
      description: 'Gracieux et magiques, les elfes vivent des siècles. Les hauts-elfes ont l\'esprit vif et une petite magie innée.',
      traits: [VISION, t('Sens aiguisés', 'Maîtrise de la Perception.'), t('Ascendance féerique', 'Avantage aux sauvegardes contre le charme ; la magie ne peut pas l\'endormir.'), t('Transe', 'Médite 4 heures au lieu de dormir 8.'),
        t('Entraînement aux armes elfiques', 'Maîtrise de l\'épée longue, de l\'épée courte, de l\'arc court et de l\'arc long.'), t('Tour de magie', 'Connaît un tour de magie de magicien (Intelligence).')] },
    { id: 'halfelin', nom: 'Halfelin pied-léger', bonus: { dex: 2, cha: 1 }, vitesse: 7.5, taille: 'petite', langues: 'commun, halfelin',
      description: 'Petits et discrets, les halfelins aiment le confort d\'un foyer, mais ont un courage étonnant. Les pieds-légers se faufilent partout.',
      traits: [t('Chanceux', 'Sur un 1 naturel à une attaque, un test ou une sauvegarde, peut relancer le dé (le MJ s\'en charge pour l\'instant).'), t('Brave', 'Avantage aux sauvegardes contre la peur.'), t('Agilité halfeline', 'Peut traverser l\'espace d\'une créature plus grande.'), t('Discrétion naturelle', 'Peut se cacher derrière une créature plus grande que lui.')] },
    { id: 'humain', nom: 'Humain', bonus: { for: 1, dex: 1, con: 1, int: 1, sag: 1, cha: 1 }, vitesse: 9, taille: 'moyenne', langues: 'commun, une langue de plus',
      description: 'Les plus jeunes des peuples communs, ambitieux et divers : on les trouve partout.',
      traits: [t('Polyvalence', '+1 à toutes les caractéristiques.')] },
    { id: 'drakeide', nom: 'Drakéide (rouge)', bonus: { for: 2, cha: 1 }, vitesse: 9, taille: 'moyenne', langues: 'commun, draconique', resistances: ['feu'],
      description: 'Descendants des dragons, fiers et honorables. Celui-ci a un ancêtre rouge : il souffle le feu (change la résistance et le souffle pour une autre couleur).',
      traits: [t('Ascendance draconique', 'Dragon rouge : souffle de feu et résistance au feu.'), t('Souffle', 'Une fois par repos : un cône de feu de 4,5 m, sauvegarde de Dextérité (DD 8 + Con + maîtrise), 2d6 dégâts (la moitié si réussi) ; 3d6 au niveau 6, 4d6 au 11, 5d6 au 16.'), t('Résistance aux dégâts', 'Résistance aux dégâts de feu.')] },
    { id: 'gnome', nom: 'Gnome des roches', bonus: { int: 2, con: 1 }, vitesse: 7.5, taille: 'petite', langues: 'commun, gnome',
      description: 'Curieux et inventifs, les gnomes adorent les secrets et les mécanismes. Ceux des roches sont des bricoleurs nés.',
      traits: [VISION, t('Ruse gnome', 'Avantage aux sauvegardes d\'Intelligence, de Sagesse et de Charisme contre la magie.'), t('Connaissance de l\'artisan', 'Double bonus de maîtrise en Histoire sur les objets magiques, alchimiques ou mécaniques.'), t('Bricoleur', 'Fabrique de petits mécanismes (jouet, briquet, boîte à musique).')] },
    { id: 'demi-elfe', nom: 'Demi-elfe', bonus: { cha: 2, dex: 1, con: 1 }, vitesse: 9, taille: 'moyenne', langues: 'commun, elfique, une langue de plus', competences_choix: { nombre: 2 },
      description: 'Entre deux mondes, les demi-elfes ont le charme des humains et la grâce des elfes. (+1 en Dextérité et en Constitution par défaut : change-les dans Tafl.)',
      traits: [VISION, t('Ascendance féerique', 'Avantage aux sauvegardes contre le charme ; la magie ne peut pas l\'endormir.'), t('Polyvalence', 'Deux compétences de plus au choix (à la création).')] },
    { id: 'demi-orc', nom: 'Demi-orc', bonus: { for: 2, con: 1 }, vitesse: 9, taille: 'moyenne', langues: 'commun, orc', maitrises: { competences: ['intimidation'] },
      description: 'Forts et redoutables, les demi-orcs portent la sauvagerie de leurs ancêtres et une volonté farouche.',
      traits: [VISION, t('Menaçant', 'Maîtrise de l\'Intimidation.'), t('Endurance implacable', 'Une fois par repos long, tombe à 1 PV au lieu de 0 (le MJ s\'en charge pour l\'instant).'), t('Attaques sauvages', 'Sur un critique au corps à corps, un dé de dégâts de plus.')] },
    { id: 'tieffelin', nom: 'Tieffelin', bonus: { cha: 2, int: 1 }, vitesse: 9, taille: 'moyenne', langues: 'commun, infernal', resistances: ['feu'],
      description: 'Marqués par un pacte infernal ancien, les tieffelins ont des cornes, une queue et la méfiance des autres.',
      traits: [VISION, t('Résistance infernale', 'Résistance aux dégâts de feu.'), t('Héritage infernal', 'Connaît Thaumaturgie ; Représailles infernales au niveau 3, Ténèbres au niveau 5 (Charisme).')] },
  ];

  // --- L'équipement ---
  // Une arme : [id, nom, prix (po), catégorie (courante, guerre), dégâts, type, propriétés, portée (m, à distance), polyvalente]
  const ARMES = [
    ['baton', 'Bâton', 1, 'courante', '1d6', 'contondant', ['polyvalente'], 0, '1d8'],
    ['dague', 'Dague', 2, 'courante', '1d4', 'perforant', ['finesse', 'legere', 'lancer'], 0],
    ['gourdin', 'Gourdin', 1, 'courante', '1d4', 'contondant', ['legere'], 0],
    ['hachette', 'Hachette', 5, 'courante', '1d6', 'tranchant', ['legere', 'lancer'], 0],
    ['javeline', 'Javeline', 1, 'courante', '1d6', 'perforant', ['lancer'], 0],
    ['lance', 'Lance', 1, 'courante', '1d6', 'perforant', ['lancer', 'polyvalente'], 0, '1d8'],
    ['marteau-leger', 'Marteau léger', 2, 'courante', '1d4', 'contondant', ['legere', 'lancer'], 0],
    ['masse-d-armes', 'Masse d\'armes', 5, 'courante', '1d6', 'contondant', [], 0],
    ['massue', 'Massue', 1, 'courante', '1d8', 'contondant', ['deux_mains'], 0],
    ['serpe', 'Serpe', 1, 'courante', '1d4', 'tranchant', ['legere'], 0],
    ['arbalete-legere', 'Arbalète légère', 25, 'courante', '1d8', 'perforant', ['munitions', 'chargement', 'deux_mains'], 24],
    ['arc-court', 'Arc court', 25, 'courante', '1d6', 'perforant', ['munitions', 'deux_mains'], 24],
    ['flechette', 'Fléchette', 1, 'courante', '1d4', 'perforant', ['finesse', 'lancer'], 6],
    ['fronde', 'Fronde', 1, 'courante', '1d4', 'contondant', ['munitions'], 9],
    ['cimeterre', 'Cimeterre', 25, 'guerre', '1d6', 'tranchant', ['finesse', 'legere'], 0],
    ['coutille', 'Coutille', 20, 'guerre', '1d10', 'tranchant', ['lourde', 'allonge', 'deux_mains'], 0],
    ['epee-a-deux-mains', 'Épée à deux mains', 50, 'guerre', '2d6', 'tranchant', ['lourde', 'deux_mains'], 0],
    ['epee-courte', 'Épée courte', 10, 'guerre', '1d6', 'perforant', ['finesse', 'legere'], 0],
    ['epee-longue', 'Épée longue', 15, 'guerre', '1d8', 'tranchant', ['polyvalente'], 0, '1d10'],
    ['fleau', 'Fléau', 10, 'guerre', '1d8', 'contondant', [], 0],
    ['fouet', 'Fouet', 2, 'guerre', '1d4', 'tranchant', ['finesse', 'allonge'], 0],
    ['hache-a-deux-mains', 'Hache à deux mains', 30, 'guerre', '1d12', 'tranchant', ['lourde', 'deux_mains'], 0],
    ['hache-d-armes', 'Hache d\'armes', 10, 'guerre', '1d8', 'tranchant', ['polyvalente'], 0, '1d10'],
    ['hallebarde', 'Hallebarde', 20, 'guerre', '1d10', 'tranchant', ['lourde', 'allonge', 'deux_mains'], 0],
    ['lance-d-arcon', 'Lance d\'arçon', 10, 'guerre', '1d12', 'perforant', ['allonge'], 0],
    ['maillet-d-armes', 'Maillet d\'armes', 10, 'guerre', '2d6', 'contondant', ['lourde', 'deux_mains'], 0],
    ['marteau-de-guerre', 'Marteau de guerre', 15, 'guerre', '1d8', 'contondant', ['polyvalente'], 0, '1d10'],
    ['morgenstern', 'Morgenstern', 15, 'guerre', '1d8', 'perforant', [], 0],
    ['pic-de-guerre', 'Pic de guerre', 5, 'guerre', '1d8', 'perforant', [], 0],
    ['pique', 'Pique', 5, 'guerre', '1d10', 'perforant', ['lourde', 'allonge', 'deux_mains'], 0],
    ['rapiere', 'Rapière', 25, 'guerre', '1d8', 'perforant', ['finesse'], 0],
    ['trident', 'Trident', 5, 'guerre', '1d6', 'perforant', ['lancer', 'polyvalente'], 0, '1d8'],
    ['arbalete-de-poing', 'Arbalète de poing', 75, 'guerre', '1d6', 'perforant', ['munitions', 'legere', 'chargement'], 9],
    ['arbalete-lourde', 'Arbalète lourde', 50, 'guerre', '1d10', 'perforant', ['munitions', 'lourde', 'chargement', 'deux_mains'], 30],
    ['arc-long', 'Arc long', 50, 'guerre', '1d8', 'perforant', ['munitions', 'lourde', 'deux_mains'], 45],
    ['sarbacane', 'Sarbacane', 10, 'guerre', '1', 'perforant', ['munitions', 'chargement'], 7.5],
  ];
  // Une armure : [id, nom, prix (po), type (legere, intermediaire, lourde, bouclier), CA, Force demandée, désavantage en Discrétion]
  const ARMURES = [
    ['armure-matelassee', 'Armure matelassée', 5, 'legere', 11, 0, true],
    ['armure-de-cuir', 'Armure de cuir', 10, 'legere', 11, 0, false],
    ['cuir-cloute', 'Armure de cuir clouté', 45, 'legere', 12, 0, false],
    ['armure-de-peau', 'Armure de peau', 10, 'intermediaire', 12, 0, false],
    ['chemise-de-mailles', 'Chemise de mailles', 50, 'intermediaire', 13, 0, false],
    ['armure-d-ecailles', 'Armure d\'écailles', 50, 'intermediaire', 14, 0, true],
    ['cuirasse', 'Cuirasse', 400, 'intermediaire', 14, 0, false],
    ['demi-plate', 'Demi-plate', 750, 'intermediaire', 15, 0, true],
    ['broigne', 'Broigne', 30, 'lourde', 14, 0, true],
    ['cotte-de-mailles', 'Cotte de mailles', 75, 'lourde', 16, 13, true],
    ['clibanion', 'Clibanion', 200, 'lourde', 17, 15, true],
    ['harnois', 'Harnois', 1500, 'lourde', 18, 15, true],
    ['bouclier', 'Bouclier', 10, 'bouclier', 2, 0, false],
  ];
  // Les autres objets : [id, nom, prix, catégorie, description, effet]
  const AUTRES = [
    ['potion-de-soins', 'Potion de soins', 50, 'soin', 'Une fiole de liquide rouge qui scintille. Rend 2d4 + 2 PV.', { type: 'soin', des: '2d4+2' }],
    ['potion-de-soins-superieurs', 'Potion de soins supérieurs', 150, 'soin', 'Rend 4d4 + 4 PV.', { type: 'soin', des: '4d4+4' }],
    ['potion-de-soins-majeurs', 'Potion de soins majeurs', 450, 'soin', 'Rend 8d4 + 8 PV.', { type: 'soin', des: '8d4+8' }],
    ['antitoxine', 'Antitoxine', 50, 'soin', 'Guérit l\'état Empoisonné (et donne l\'avantage contre le poison pendant une heure).', { type: 'soin_statut', statut: 'empoisonne' }],
    ['trousse-de-soins', 'Trousse de soins', 5, 'autre', 'Bandages, onguents et attelles : stabilise une créature à 0 PV sans test de Médecine.', { type: 'aucun' }],
    ['rations', 'Rations (1 jour)', 1, 'autre', 'De la nourriture sèche pour une journée.', { type: 'aucun' }],
    ['corde', 'Corde en chanvre (15 m)', 1, 'autre', 'Solide : 2 points de vie, se rompt sur un test de Force DD 17.', { type: 'aucun' }],
    ['torche', 'Torche', 1, 'autre', 'Éclaire 6 m autour d\'elle pendant une heure.', { type: 'aucun' }],
    ['outils-de-voleur', 'Outils de voleur', 25, 'autre', 'Une lime, des crochets, un petit miroir, des ciseaux et une pince : pour crocheter serrures et pièges.', { type: 'aucun' }],
    ['symbole-sacre', 'Symbole sacré', 5, 'autre', 'L\'emblème d\'une divinité : un focaliseur pour les sorts de clerc et de paladin.', { type: 'aucun' }],
    ['grimoire', 'Grimoire', 50, 'autre', 'Le livre de sorts d\'un magicien.', { type: 'aucun' }],
    ['focaliseur-arcanique', 'Focaliseur arcanique', 10, 'autre', 'Un cristal, un orbe ou une baguette : pour les sorts d\'ensorceleur, d\'occultiste et de magicien.', { type: 'aucun' }],
    ['focaliseur-druidique', 'Focaliseur druidique', 1, 'autre', 'Un brin de gui, un bâton d\'if : pour les sorts de druide.', { type: 'aucun' }],
    ['instrument', 'Luth', 35, 'autre', 'Un instrument de musique (focaliseur des bardes).', { type: 'aucun' }],
    ['sac-a-dos', 'Sac d\'explorateur', 10, 'autre', 'Un sac, un sac de couchage, une gamelle, une boîte à amadou, 10 torches, 10 jours de rations, une gourde et 15 m de corde.', { type: 'aucun' }],
    ['pierre-precieuse', 'Pierre précieuse', 50, 'tresor', 'À revendre chez un marchand.', { type: 'aucun' }],
  ];

  // --- Les classes ---
  // Une aptitude : [niveau, nom, description, effet, valeur]. L'effet (facultatif) est ce que Saga sait
  // jouer (REGLES.md › « Le pack JDR » › aptitudes) ; la valeur dépend de l'effet (les dés d'arts
  // martiaux, le bonus de rage, le nombre d'attaques en plus…).
  const AMELIORATION = 'Amélioration de caractéristiques : +2 à une caractéristique, ou +1 à deux (20 au plus).';
  const asi = (...niveaux) => niveaux.map((n) => [n, 'Amélioration de caractéristiques', AMELIORATION]);
  const CLASSES = [
    {
      id: 'barbare', nom: 'Barbare', couleur: '#d9534f', de_vie: 12, carac_principale: 'for', sauvegardes: ['for', 'con'],
      maitrises: { armures: ['legere', 'intermediaire', 'bouclier'], armes: ['courante', 'guerre'] },
      competences_choix: { nombre: 2, parmi: ['athletisme', 'dressage', 'intimidation', 'nature', 'perception', 'survie'] },
      equipement_depart: [['hache-a-deux-mains'], ['hachette', 2], ['javeline', 4], ['sac-a-dos']], or_depart: '2d4*10',
      description: 'Un guerrier féroce qui puise sa force dans la rage. Il encaisse les coups mieux que personne.',
      niveaux: [
        [1, 'Rage', 'Action bonus : avantage aux tests et sauvegardes de Force, +2 aux dégâts au corps à corps (Force), résistance aux dégâts contondants, perforants et tranchants. Pas en armure lourde. 2 rages par repos long (plus aux niveaux 3, 6, 12, 17).', 'rage', 2],
        [1, 'Défense sans armure', 'Sans armure, CA = 10 + Dextérité + Constitution (un bouclier compte).', 'defense_sans_armure_barbare'],
        [2, 'Attaque téméraire', 'Peut attaquer avec avantage (Force) ; les attaques contre lui aussi jusqu\'à son prochain tour.'],
        [2, 'Sens du danger', 'Avantage aux sauvegardes de Dextérité contre ce qu\'il voit venir.'],
        [3, 'Voie du berserker : Frénésie', 'En rage, peut faire une attaque au corps à corps en action bonus ; un niveau d\'épuisement à la fin.'],
        ...asi(4, 8, 12, 16, 19),
        [5, 'Attaque supplémentaire', 'Attaque deux fois quand il prend l\'action Attaquer.', 'attaque_supplementaire', 1],
        [5, 'Déplacement rapide', '+3 m de vitesse sans armure lourde.'],
        [6, 'Rage aveugle', 'Ne peut être ni charmé ni effrayé en rage.'],
        [7, 'Instinct sauvage', 'Avantage à l\'initiative.'],
        [9, 'Critique brutal', 'Un dé de dégâts de plus sur un critique au corps à corps (deux au niveau 13, trois au 17).'],
        [9, 'Rage (+3)', 'Les dégâts de la rage passent à +3.', 'rage', 3],
        [10, 'Présence intimidante', 'Peut effrayer une créature par sa présence.'],
        [11, 'Rage implacable', 'À 0 PV en rage : sauvegarde de Constitution DD 10 pour rester à 1 PV.'],
        [14, 'Représailles', 'Frappe en réaction celui qui le blesse au contact.'],
        [15, 'Rage persistante', 'Sa rage ne s\'arrête que s\'il le veut ou tombe inconscient.'],
        [16, 'Rage (+4)', 'Les dégâts de la rage passent à +4.', 'rage', 4],
        [18, 'Puissance indomptable', 'Un test de Force ne vaut jamais moins que sa valeur de Force.'],
        [20, 'Champion primitif', '+4 en Force et en Constitution (24 au plus).'],
      ],
    },
    {
      id: 'barde', nom: 'Barde', couleur: '#c16ad8', de_vie: 8, carac_principale: 'cha', sauvegardes: ['dex', 'cha'],
      maitrises: { armures: ['legere'], armes: ['courante', 'arbalete-de-poing', 'epee-longue', 'rapiere', 'epee-courte'] },
      competences_choix: { nombre: 3, parmi: [] },
      equipement_depart: [['rapiere'], ['armure-de-cuir'], ['dague'], ['instrument'], ['sac-a-dos']], or_depart: '5d4*10',
      lanceur: { type: 'complet', carac: 'cha', tours: 2, connus: [4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 15, 16, 18, 19, 19, 20, 22, 22, 22] },
      description: 'Un artiste dont la musique et les mots tissent la magie. Il soutient le groupe et touche à tout.',
      niveaux: [
        [1, 'Incantation', 'Lance des sorts de barde (Charisme) ; un instrument sert de focaliseur.'],
        [1, 'Inspiration bardique', 'Action bonus : un allié gagne un d6 à ajouter à un jet (d8 au niveau 5, d10 au 10, d12 au 15). Charisme fois par repos long (repos court dès le niveau 5).', 'inspiration_bardique'],
        [2, 'Touche-à-tout', 'Ajoute la moitié de son bonus de maîtrise à ses tests sans maîtrise.'],
        [2, 'Chant reposant', 'Pendant un repos court, les alliés qui dépensent des dés de vie regagnent 1d6 PV de plus.'],
        [3, 'Collège du savoir', 'Trois compétences de plus ; Mots cinglants (réaction : retire un dé d\'inspiration au jet d\'un ennemi).'],
        [3, 'Expertise', 'Double bonus de maîtrise dans deux compétences maîtrisées (deux de plus au niveau 10).'],
        ...asi(4, 8, 12, 16, 19),
        [5, 'Source d\'inspiration', 'L\'inspiration bardique revient après un repos court.'],
        [6, 'Contre-charme', 'Les alliés proches ont l\'avantage contre la peur et le charme.'],
        [6, 'Secrets magiques supplémentaires', 'Deux sorts de n\'importe quelle classe.'],
        [10, 'Secrets magiques', 'Deux sorts de n\'importe quelle classe (et encore aux niveaux 14 et 18).'],
        [14, 'Compétence inégalée', 'Peut ajouter un dé d\'inspiration à son propre test.'],
        [20, 'Inspiration supérieure', 'Retrouve une inspiration si elle n\'en a plus au début d\'un combat.'],
      ],
    },
    {
      id: 'clerc', nom: 'Clerc', couleur: '#f0c75e', de_vie: 8, carac_principale: 'sag', sauvegardes: ['sag', 'cha'],
      maitrises: { armures: ['legere', 'intermediaire', 'bouclier'], armes: ['courante'] },
      competences_choix: { nombre: 2, parmi: ['histoire', 'intuition', 'medecine', 'persuasion', 'religion'] },
      equipement_depart: [['masse-d-armes'], ['armure-d-ecailles'], ['arbalete-legere'], ['bouclier'], ['symbole-sacre'], ['sac-a-dos']], or_depart: '5d4*10',
      lanceur: { type: 'complet', carac: 'sag', tours: 3, prepare: true },
      description: 'Un prêtre combattant qui canalise le pouvoir de sa divinité : il soigne, protège et punit.',
      niveaux: [
        [1, 'Incantation', 'Prépare chaque jour Sagesse + niveau sorts de clerc ; un symbole sacré sert de focaliseur.'],
        [1, 'Domaine de la vie', 'Maîtrise des armures lourdes. Disciple de la vie : ses sorts de soins rendent 2 + le niveau du sort PV de plus.'],
        [2, 'Conduit divin : Renvoi des morts-vivants', 'Les morts-vivants proches font une sauvegarde de Sagesse ou fuient. Une fois par repos court (deux au niveau 6, trois au 18).', 'canalisation'],
        [2, 'Conduit divin : Préservation de la vie', 'Répartit 5 × son niveau PV entre les blessés proches.'],
        ...asi(4, 8, 12, 16, 19),
        [5, 'Destruction des morts-vivants', 'Le renvoi détruit les morts-vivants faibles (FP 1/2, puis plus).'],
        [6, 'Guérisseur béni', 'Soigner un autre le soigne aussi.'],
        [8, 'Frappe divine', 'Une fois par tour, +1d8 radiants à une attaque d\'arme (2d8 au niveau 14).'],
        [10, 'Intervention divine', 'Demande l\'aide de sa divinité : réussit si un d100 fait moins que son niveau.'],
        [17, 'Guérison suprême', 'Ses sorts de soins rendent le maximum.'],
      ],
    },
    {
      id: 'druide', nom: 'Druide', couleur: '#5cb85c', de_vie: 8, carac_principale: 'sag', sauvegardes: ['int', 'sag'],
      maitrises: { armures: ['legere', 'intermediaire', 'bouclier'], armes: ['gourdin', 'dague', 'flechette', 'javeline', 'masse-d-armes', 'baton', 'cimeterre', 'serpe', 'fronde', 'lance'] },
      competences_choix: { nombre: 2, parmi: ['arcanes', 'dressage', 'intuition', 'medecine', 'nature', 'perception', 'religion', 'survie'] },
      equipement_depart: [['cimeterre'], ['armure-de-cuir'], ['bouclier'], ['focaliseur-druidique'], ['sac-a-dos']], or_depart: '2d4*10',
      lanceur: { type: 'complet', carac: 'sag', tours: 2, prepare: true },
      description: 'Un gardien de la nature qui en tire sa magie et peut prendre la forme des bêtes.',
      niveaux: [
        [1, 'Druidique', 'Connaît la langue secrète des druides.'],
        [1, 'Incantation', 'Prépare chaque jour Sagesse + niveau sorts de druide.'],
        [2, 'Forme sauvage', 'Prend la forme d\'une bête qu\'il a vue (FP 1/4 au niveau 2, 1/2 au 4, 1 au 8), deux fois par repos court.'],
        [2, 'Cercle de la terre', 'Récupération naturelle : regagne des emplacements pendant un repos court ; un tour de magie de plus.'],
        ...asi(4, 8, 12, 16, 19),
        [6, 'Traversée des terrains', 'Le terrain difficile non magique ne le ralentit pas.'],
        [10, 'Protection de la nature', 'Insensible aux poisons et aux maladies ; ni charmé ni effrayé par les fées et les élémentaires.'],
        [18, 'Jeunesse éternelle', 'Vieillit dix fois moins vite.'],
        [20, 'Archidruide', 'Forme sauvage à volonté.'],
      ],
    },
    {
      id: 'ensorceleur', nom: 'Ensorceleur', couleur: '#e8743b', de_vie: 6, carac_principale: 'cha', sauvegardes: ['con', 'cha'],
      maitrises: { armures: [], armes: ['dague', 'flechette', 'fronde', 'baton', 'arbalete-legere'] },
      competences_choix: { nombre: 2, parmi: ['arcanes', 'intimidation', 'intuition', 'persuasion', 'religion', 'tromperie'] },
      equipement_depart: [['arbalete-legere'], ['dague', 2], ['focaliseur-arcanique'], ['sac-a-dos']], or_depart: '3d4*10',
      lanceur: { type: 'complet', carac: 'cha', tours: 4, connus: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 12, 13, 13, 14, 14, 15, 15, 15, 15] },
      description: 'Né avec la magie dans le sang : peu de sorts, mais il les tord à sa guise.',
      niveaux: [
        [1, 'Incantation', 'Lance des sorts d\'ensorceleur (Charisme), sans livre ni préparation.'],
        [1, 'Lignée draconique', '+1 PV par niveau ; sans armure, CA = 13 + Dextérité.'],
        [2, 'Source de magie', 'Points de sorcellerie (autant que son niveau), rendus par un repos long : se changent en emplacements, et inversement.', 'sorcellerie'],
        [3, 'Métamagie', 'Deux options pour modifier ses sorts (sort jumeau, prolongé, accéléré…), une de plus aux niveaux 10 et 17.'],
        ...asi(4, 8, 12, 16, 19),
        [6, 'Affinité élémentaire', '+Charisme aux dégâts de l\'élément de son dragon.'],
        [14, 'Ailes de dragon', 'Fait pousser des ailes : vole à sa vitesse.'],
        [18, 'Présence draconique', 'Une aura de crainte ou de fascination.'],
        [20, 'Restauration ensorcelée', 'Regagne 4 points de sorcellerie après un repos court.'],
      ],
    },
    {
      id: 'guerrier', nom: 'Guerrier', couleur: '#8a8f98', de_vie: 10, carac_principale: ['for', 'dex'], sauvegardes: ['for', 'con'],
      maitrises: { armures: ['legere', 'intermediaire', 'lourde', 'bouclier'], armes: ['courante', 'guerre'] },
      competences_choix: { nombre: 2, parmi: ['acrobaties', 'athletisme', 'dressage', 'histoire', 'intimidation', 'intuition', 'perception', 'survie'] },
      equipement_depart: [['cotte-de-mailles'], ['epee-longue'], ['bouclier'], ['arbalete-legere'], ['sac-a-dos']], or_depart: '5d4*10', ameliorations: [4, 6, 8, 12, 14, 16, 19],
      description: 'Un maître des armes et des armures, solide et polyvalent.',
      niveaux: [
        [1, 'Style de combat : Défense', '+1 à la CA en armure (change le style dans Tafl : Archerie, Duel, Combat à deux armes).', 'style_defense'],
        [1, 'Second souffle', 'Action bonus : regagne 1d10 + niveau PV, une fois par repos court.', 'second_souffle'],
        [2, 'Fougue', 'Une action de plus à son tour, une fois par repos court (deux fois au niveau 17).', 'sursaut'],
        [3, 'Champion : Critique amélioré', 'Coup critique sur un 19 ou un 20.', 'critique_ameliore', 19],
        ...asi(4, 6, 8, 12, 14, 16, 19),
        [5, 'Attaque supplémentaire', 'Attaque deux fois avec l\'action Attaquer (trois au niveau 11, quatre au 20).', 'attaque_supplementaire', 1],
        [7, 'Athlète remarquable', 'La moitié du bonus de maîtrise aux tests de Force, Dextérité et Constitution sans maîtrise.'],
        [9, 'Indomptable', 'Relance une sauvegarde ratée, une fois par repos long (deux au 13, trois au 17).'],
        [10, 'Style de combat supplémentaire', 'Un deuxième style de combat.'],
        [11, 'Attaque supplémentaire (2)', 'Trois attaques avec l\'action Attaquer.', 'attaque_supplementaire', 2],
        [15, 'Critique supérieur', 'Coup critique sur un 18, 19 ou 20.', 'critique_ameliore', 18],
        [18, 'Survivant', 'Regagne 5 + Constitution PV à chaque tour s\'il lui reste moins de la moitié de ses PV.'],
        [20, 'Attaque supplémentaire (3)', 'Quatre attaques avec l\'action Attaquer.', 'attaque_supplementaire', 3],
      ],
    },
    {
      id: 'magicien', nom: 'Magicien', couleur: '#4a90d9', de_vie: 6, carac_principale: 'int', sauvegardes: ['int', 'sag'],
      maitrises: { armures: [], armes: ['dague', 'flechette', 'fronde', 'baton', 'arbalete-legere'] },
      competences_choix: { nombre: 2, parmi: ['arcanes', 'histoire', 'intuition', 'investigation', 'medecine', 'religion'] },
      equipement_depart: [['baton'], ['grimoire'], ['focaliseur-arcanique'], ['sac-a-dos']], or_depart: '4d4*10',
      lanceur: { type: 'complet', carac: 'int', tours: 3, prepare: true },
      description: 'Un érudit de l\'arcane qui apprend ses sorts dans les livres : la plus grande palette de magie.',
      niveaux: [
        [1, 'Incantation', 'Prépare chaque jour Intelligence + niveau sorts de son grimoire.'],
        [1, 'Restauration arcanique', 'Une fois par jour, pendant un repos court, regagne des emplacements (la moitié de son niveau, arrondie au supérieur).', 'recuperation_arcanique'],
        [2, 'École d\'évocation', 'Sculpter les sorts : ses alliés évitent ses sorts d\'évocation.'],
        ...asi(4, 8, 12, 16, 19),
        [6, 'Tour de magie puissant', 'Ses tours de magie à sauvegarde font la moitié des dégâts même réussis.'],
        [10, 'Évocation renforcée', '+Intelligence aux dégâts de ses sorts d\'évocation.'],
        [14, 'Surcharge', 'Ses sorts d\'évocation de niveau 1 à 5 font le maximum de dégâts.'],
        [18, 'Maîtrise des sorts', 'Un sort de niveau 1 et un de niveau 2 à volonté.'],
        [20, 'Sorts de prédilection', 'Deux sorts de niveau 3, une fois chacun par repos court sans emplacement.'],
      ],
    },
    {
      id: 'moine', nom: 'Moine', couleur: '#38b2ac', de_vie: 8, carac_principale: ['dex', 'sag'], sauvegardes: ['for', 'dex'],
      maitrises: { armures: [], armes: ['courante', 'epee-courte'] },
      competences_choix: { nombre: 2, parmi: ['acrobaties', 'athletisme', 'discretion', 'histoire', 'intuition', 'religion'] },
      equipement_depart: [['epee-courte'], ['flechette', 10], ['sac-a-dos']], or_depart: '5d4',
      description: 'Un maître des arts martiaux qui transforme son corps en arme grâce au ki.',
      niveaux: [
        [1, 'Défense sans armure', 'Sans armure ni bouclier, CA = 10 + Dextérité + Sagesse.', 'defense_sans_armure_moine'],
        [1, 'Arts martiaux', 'Mains nues et armes de moine : Dextérité au lieu de la Force, un d4 de dégâts, et une frappe à mains nues en action bonus.', 'arts_martiaux', '1d4'],
        [2, 'Ki', 'Points de ki (autant que son niveau), rendus par un repos court : Déluge de coups, Défense patiente, Pas du vent.', 'ki'],
        [2, 'Déplacement sans armure', '+3 m de vitesse sans armure (plus aux niveaux 6, 10, 14, 18).'],
        [3, 'Voie de la paume', 'Ses coups du Déluge peuvent renverser, repousser ou empêcher les réactions.'],
        [3, 'Parade de projectiles', 'Réaction : réduit les dégâts d\'une attaque à distance de 1d10 + Dex + niveau.'],
        ...asi(4, 8, 12, 16, 19),
        [4, 'Chute ralentie', 'Réaction : réduit les dégâts de chute de 5 × son niveau.'],
        [5, 'Attaque supplémentaire', 'Attaque deux fois avec l\'action Attaquer.', 'attaque_supplementaire', 1],
        [5, 'Arts martiaux (d6)', 'Les dégâts de ses arts martiaux passent à 1d6.', 'arts_martiaux', '1d6'],
        [5, 'Frappe étourdissante', '1 point de ki : la cible touchée fait une sauvegarde de Constitution ou est étourdie.'],
        [7, 'Dérobade', 'Aucun dégât sur une sauvegarde de Dextérité réussie, la moitié sur un échec.'],
        [7, 'Esprit tranquille', 'Une action pour finir un charme ou une peur sur lui.'],
        [10, 'Pureté physique', 'Insensible aux maladies et aux poisons.'],
        [11, 'Arts martiaux (d8)', 'Les dégâts de ses arts martiaux passent à 1d8.', 'arts_martiaux', '1d8'],
        [14, 'Âme de diamant', 'Maîtrise de toutes les sauvegardes.'],
        [17, 'Arts martiaux (d10)', 'Les dégâts de ses arts martiaux passent à 1d10.', 'arts_martiaux', '1d10'],
        [18, 'Corps vide', '4 points de ki : invisible et résistant à tout pendant une minute.'],
        [20, 'Perfection de l\'être', 'Regagne 4 points de ki au début d\'un combat s\'il n\'en a plus.'],
      ],
    },
    {
      id: 'occultiste', nom: 'Occultiste', couleur: '#7e57c2', de_vie: 8, carac_principale: 'cha', sauvegardes: ['sag', 'cha'],
      maitrises: { armures: ['legere'], armes: ['courante'] },
      competences_choix: { nombre: 2, parmi: ['arcanes', 'histoire', 'intimidation', 'investigation', 'nature', 'religion', 'tromperie'] },
      equipement_depart: [['arbalete-legere'], ['armure-de-cuir'], ['dague', 2], ['focaliseur-arcanique'], ['sac-a-dos']], or_depart: '4d4*10',
      lanceur: { type: 'occultiste', carac: 'cha', tours: 2, connus: [2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15] },
      description: 'Il tient sa magie d\'un pacte avec une puissance d\'outre-monde : peu d\'emplacements, rendus par un repos court.',
      niveaux: [
        [1, 'Protecteur : le Fiélon', 'Bénédiction du ténébreux : des PV temporaires (Charisme + niveau) quand il réduit un ennemi à 0 PV.'],
        [1, 'Magie de pacte', 'Peu d\'emplacements, tous du plus haut niveau qu\'il connaît, rendus par un repos court.'],
        [2, 'Manifestations occultes', 'Deux pouvoirs à choisir (plus aux niveaux suivants) : Décharge déchirante, Vision du diable…'],
        [3, 'Faveur de pacte', 'Pacte de la lame, de la chaîne ou du grimoire.'],
        ...asi(4, 8, 12, 16, 19),
        [6, 'Chance du ténébreux', '+1d10 à un test ou une sauvegarde, une fois par repos court.'],
        [10, 'Résilience fiélonne', 'Une résistance à choisir après chaque repos.'],
        [11, 'Arcanum mystique', 'Un sort de niveau 6 une fois par repos long (7 au niveau 13, 8 au 15, 9 au 17).'],
        [14, 'Traversée de l\'enfer', 'Envoie la cible touchée en enfer un instant (10d10 psychiques).'],
        [20, 'Maître de l\'occulte', 'Regagne tous ses emplacements de pacte en une minute, une fois par repos long.'],
      ],
    },
    {
      id: 'paladin', nom: 'Paladin', couleur: '#e6b450', de_vie: 10, carac_principale: ['for', 'cha'], sauvegardes: ['sag', 'cha'],
      maitrises: { armures: ['legere', 'intermediaire', 'lourde', 'bouclier'], armes: ['courante', 'guerre'] },
      competences_choix: { nombre: 2, parmi: ['athletisme', 'intimidation', 'intuition', 'medecine', 'persuasion', 'religion'] },
      equipement_depart: [['cotte-de-mailles'], ['epee-longue'], ['bouclier'], ['javeline', 5], ['symbole-sacre'], ['sac-a-dos']], or_depart: '5d4*10',
      lanceur: { type: 'demi', carac: 'cha', tours: 0, prepare: true },
      description: 'Un chevalier sacré lié par un serment : il protège, soigne et frappe avec une puissance divine.',
      niveaux: [
        [1, 'Sens divin', 'Sent la présence des célestes, des fiélons et des morts-vivants proches.'],
        [1, 'Imposition des mains', 'Une réserve de 5 × niveau PV à donner en touchant, rendue par un repos long.', 'imposition_des_mains'],
        [2, 'Style de combat : Défense', '+1 à la CA en armure.', 'style_defense'],
        [2, 'Incantation', 'Prépare chaque jour Charisme + la moitié de son niveau sorts de paladin.'],
        [2, 'Châtiment divin', 'Quand il touche au corps à corps, dépense un emplacement : +2d8 radiants (+1d8 par niveau d\'emplacement au-dessus du 1er).', 'chatiment_divin'],
        [3, 'Santé divine', 'Insensible aux maladies.'],
        [3, 'Serment de dévotion', 'Conduit divin : Arme sacrée (+Charisme à ses attaques) ou Renvoi des impies.', 'canalisation'],
        ...asi(4, 8, 12, 16, 19),
        [5, 'Attaque supplémentaire', 'Attaque deux fois avec l\'action Attaquer.', 'attaque_supplementaire', 1],
        [6, 'Aura de protection', 'Lui et ses alliés proches ajoutent son Charisme à leurs sauvegardes.'],
        [10, 'Aura de courage', 'Lui et ses alliés proches ne peuvent pas être effrayés.'],
        [11, 'Châtiment divin amélioré', '+1d8 radiants à chaque coup au corps à corps.'],
        [14, 'Contact purifiant', 'Met fin à un sort sur une créature, Charisme fois par repos long.'],
        [20, 'Sainte némésis', 'Prend la forme d\'un être de lumière pendant une minute.'],
      ],
    },
    {
      id: 'rodeur', nom: 'Rôdeur', couleur: '#6b8e23', de_vie: 10, carac_principale: ['dex', 'sag'], sauvegardes: ['for', 'dex'],
      maitrises: { armures: ['legere', 'intermediaire', 'bouclier'], armes: ['courante', 'guerre'] },
      competences_choix: { nombre: 3, parmi: ['athletisme', 'discretion', 'dressage', 'intuition', 'investigation', 'nature', 'perception', 'survie'] },
      equipement_depart: [['armure-d-ecailles'], ['epee-courte', 2], ['arc-long'], ['sac-a-dos']], or_depart: '5d4*10',
      lanceur: { type: 'demi', carac: 'sag', tours: 0, connus: [0, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11] },
      description: 'Un pisteur des terres sauvages, chasseur redoutable à l\'arc ou à deux lames.',
      niveaux: [
        [1, 'Ennemi juré', 'Avantage pour pister et se souvenir d\'un type de créatures choisi.'],
        [1, 'Explorateur-né', 'Son terrain de prédilection ne le ralentit ni ne l\'égare.'],
        [2, 'Style de combat : Archerie', '+2 aux attaques avec une arme à distance (change le style dans Tafl : Défense, Duel, Combat à deux armes).', 'style_archerie'],
        [2, 'Incantation', 'Lance des sorts de rôdeur (Sagesse).'],
        [3, 'Chasseur : Tueur de colosses', 'Une fois par tour, +1d8 contre une cible déjà blessée.'],
        [3, 'Vigilance primitive', 'Un emplacement : sent les ennemis jurés proches.'],
        ...asi(4, 8, 12, 16, 19),
        [5, 'Attaque supplémentaire', 'Attaque deux fois avec l\'action Attaquer.', 'attaque_supplementaire', 1],
        [8, 'Déplacement fluide', 'Le terrain difficile non magique ne le ralentit pas.'],
        [10, 'Camouflage naturel', '+10 en Discrétion quand il se camoufle sans bouger.'],
        [14, 'Disparition', 'Se cache en action bonus ; impossible à pister par magie.'],
        [18, 'Sens sauvages', 'Sent les créatures invisibles proches.'],
        [20, 'Tueur implacable', '+Sagesse à une attaque ou aux dégâts contre son ennemi juré, une fois par tour.'],
      ],
    },
    {
      id: 'roublard', nom: 'Roublard', couleur: '#5a5f6b', de_vie: 8, carac_principale: 'dex', sauvegardes: ['dex', 'int'],
      maitrises: { armures: ['legere'], armes: ['courante', 'arbalete-de-poing', 'epee-longue', 'rapiere', 'epee-courte'] },
      competences_choix: { nombre: 4, parmi: ['acrobaties', 'athletisme', 'discretion', 'escamotage', 'intimidation', 'intuition', 'investigation', 'perception', 'persuasion', 'representation', 'tromperie'] },
      equipement_depart: [['rapiere'], ['arc-court'], ['armure-de-cuir'], ['dague', 2], ['outils-de-voleur'], ['sac-a-dos']], or_depart: '4d4*10', ameliorations: [4, 8, 10, 12, 16, 19],
      description: 'Discret et rusé : il frappe là où ça fait mal et désamorce les pièges.',
      niveaux: [
        [1, 'Expertise', 'Double bonus de maîtrise dans deux compétences maîtrisées (deux de plus au niveau 6).'],
        [1, 'Attaque sournoise', 'Une fois par tour, +1d6 de dégâts (un de plus tous les deux niveaux) avec une arme de finesse ou à distance, s\'il a l\'avantage ou un allié près de la cible.', 'attaque_sournoise'],
        [1, 'Jargon des voleurs', 'Une langue secrète de signes et de mots codés.'],
        [2, 'Ruse', 'Action bonus : se cacher, se désengager ou foncer.', 'ruse'],
        [3, 'Voleur : Mains lestes', 'Action bonus : escamoter, crocheter ou utiliser un objet.'],
        [3, 'Monte-en-l\'air', 'Escalade à vitesse normale ; saute plus loin.'],
        ...asi(4, 8, 10, 12, 16, 19),
        [5, 'Esquive instinctive', 'Réaction : moitié des dégâts d\'une attaque qu\'il voit venir.'],
        [7, 'Dérobade', 'Aucun dégât sur une sauvegarde de Dextérité réussie, la moitié sur un échec.'],
        [11, 'Talent fiable', 'Un test maîtrisé ne fait jamais moins de 10 au dé.'],
        [14, 'Perception aveugle', 'Sent les créatures cachées ou invisibles à 3 m.'],
        [15, 'Esprit fuyant', 'Maîtrise des sauvegardes de Sagesse.'],
        [18, 'Insaisissable', 'Aucune attaque n\'a l\'avantage contre lui.'],
        [20, 'Coup de chance', 'Transforme un raté en coup, ou un test en 20, une fois par repos court.'],
      ],
    },
  ];

  // --- Les sorts (niveaux 0 à 3) ---
  // [id, nom, niveau, école, classes, temps, portée, durée, concentration, composantes, description, effet]
  // classes : b barde, c clerc, d druide, e ensorceleur, m magicien, o occultiste, p paladin, r rôdeur.
  // temps : A une action, B une action bonus, R une réaction (sinon le texte). L'effet est ce que Saga
  // joue en combat (et hors combat pour les soins) ; sans effet, le sort n'est que décrit (le MJ décide).
  const CLASSES_SORT = { b: 'barde', c: 'clerc', d: 'druide', e: 'ensorceleur', m: 'magicien', o: 'occultiste', p: 'paladin', r: 'rodeur' };
  const TEMPS = { A: '1 action', B: '1 action bonus', R: '1 réaction' };
  // Des raccourcis pour les effets les plus courants.
  const att = (degats, type, o = {}) => ({ type: 'attaque', cibles: 'un', degats, type_degats: type, ...o });
  const sauv = (carac, degats, type, o = {}) => ({ type: 'sauvegarde', cibles: 'un', sauvegarde: carac, degats, type_degats: type, ...o });
  const etat = (carac, id, o = {}) => ({ type: 'sauvegarde', cibles: 'un', sauvegarde: carac, etat: id, ...o });
  const soin = (des, o = {}) => ({ type: 'soin', cibles: 'allie', soin: des, ...o });
  const SORTS = [
    // Tours de magie
    ['aspersion-d-acide', 'Aspersion d\'acide', 0, 'invocation', 'em', 'A', '18 m', 'instantanée', false, 'V, S', 'Une bulle d\'acide jaillit sur une ou deux créatures proches l\'une de l\'autre : sauvegarde de Dextérité ou 1d6 dégâts d\'acide.', sauv('dex', '1d6', 'acide', { cibles: 'plusieurs', nombre: 2 })],
    ['assistance', 'Assistance', 0, 'divination', 'cd', 'A', 'contact', '1 minute', true, 'V, S', 'La cible ajoute 1d4 à un test de caractéristique de son choix.', null],
    ['bouffee-de-poison', 'Bouffée de poison', 0, 'invocation', 'dem', 'A', '3 m', 'instantanée', false, 'V, S', 'Un nuage de gaz toxique : sauvegarde de Constitution ou 1d12 dégâts de poison.', sauv('con', '1d12', 'poison')],
    ['contact-glacial', 'Contact glacial', 0, 'necromancie', 'emo', 'A', '36 m', '1 round', false, 'V, S', 'Une main squelettique spectrale : attaque de sort à distance, 1d8 dégâts nécrotiques ; la cible ne peut pas regagner de PV avant ton prochain tour.', att('1d8', 'necrotique')],
    ['decharge-occulte', 'Décharge occulte', 0, 'evocation', 'o', 'A', '36 m', 'instantanée', false, 'V, S', 'Un rayon d\'énergie crépitante : attaque de sort à distance, 1d10 dégâts de force (plus de rayons aux niveaux 5, 11 et 17).', att('1d10', 'force')],
    ['druidisme', 'Druidisme', 0, 'transmutation', 'd', 'A', '9 m', 'instantanée', false, 'V, S', 'Un petit effet de nature : prédire la météo, faire éclore une fleur, allumer ou éteindre une flamme.', null],
    ['epargner-les-mourants', 'Épargner les mourants', 0, 'necromancie', 'c', 'A', 'contact', 'instantanée', false, 'V, S', 'Une créature vivante à 0 PV devient stable.', null],
    ['flamme-sacree', 'Flamme sacrée', 0, 'evocation', 'c', 'A', '18 m', 'instantanée', false, 'V, S', 'Une flamme radieuse tombe sur la cible : sauvegarde de Dextérité ou 1d8 dégâts radiants (l\'abri ne protège pas).', sauv('dex', '1d8', 'radiant')],
    ['gourdin-magique', 'Gourdin magique', 0, 'transmutation', 'd', 'B', 'contact', '1 minute', false, 'V, S, M', 'Un bâton ou un gourdin devient magique : attaques avec la Sagesse, dégâts 1d8.', null],
    ['illusion-mineure', 'Illusion mineure', 0, 'illusion', 'bemo', 'A', '9 m', '1 minute', false, 'S, M', 'Crée un son ou une image immobile d\'un cube de 1,5 m.', null],
    ['lumiere', 'Lumière', 0, 'evocation', 'bcem', 'A', 'contact', '1 heure', false, 'V, M', 'Un objet brille comme une torche (6 m de lumière vive).', null],
    ['lumieres-dansantes', 'Lumières dansantes', 0, 'evocation', 'bem', 'A', '36 m', '1 minute', true, 'V, S, M', 'Jusqu\'à quatre lumières flottantes que tu déplaces.', null],
    ['main-de-mage', 'Main de mage', 0, 'invocation', 'bemo', 'A', '9 m', '1 minute', false, 'V, S', 'Une main spectrale qui manipule les objets (pas plus de 5 kg).', null],
    ['message', 'Message', 0, 'transmutation', 'bem', 'A', '36 m', '1 round', false, 'V, S, M', 'Tu chuchotes un message que seule la cible entend ; elle peut répondre.', null],
    ['moquerie-cruelle', 'Moquerie cruelle', 0, 'enchantement', 'b', 'A', '18 m', 'instantanée', false, 'V', 'Une insulte chargée de magie : sauvegarde de Sagesse ou 1d4 dégâts psychiques (et désavantage à sa prochaine attaque).', sauv('sag', '1d4', 'psychique')],
    ['poigne-electrique', 'Poigne électrique', 0, 'evocation', 'em', 'A', 'contact', 'instantanée', false, 'V, S', 'Une décharge électrique : attaque de sort au corps à corps (avantage contre une armure métallique), 1d8 dégâts de foudre.', att('1d8', 'foudre', { attaque: 'corps' })],
    ['prestidigitation', 'Prestidigitation', 0, 'transmutation', 'bemo', 'A', '3 m', '1 heure', false, 'V, S', 'De petits tours : nettoyer, réchauffer, parfumer, une étincelle.', null],
    ['produire-une-flamme', 'Produire une flamme', 0, 'invocation', 'd', 'A', 'personnelle', '10 minutes', false, 'V, S', 'Une flamme dans la main qui éclaire, et qu\'on lance : attaque de sort à distance, 1d8 dégâts de feu.', att('1d8', 'feu')],
    ['protection-contre-les-armes', 'Protection contre les armes', 0, 'abjuration', 'bemo', 'A', 'personnelle', '1 round', false, 'V, S', 'Résistance aux dégâts contondants, perforants et tranchants des armes jusqu\'à ton prochain tour.', null],
    ['rayon-de-givre', 'Rayon de givre', 0, 'evocation', 'em', 'A', '18 m', 'instantanée', false, 'V, S', 'Un rayon bleuté glacial : attaque de sort à distance, 1d8 dégâts de froid ; la cible est ralentie.', att('1d8', 'froid')],
    ['reparation', 'Réparation', 0, 'transmutation', 'bcdem', '1 minute', 'contact', 'instantanée', false, 'V, S, M', 'Répare une cassure ou une déchirure d\'un objet.', null],
    ['resistance', 'Résistance', 0, 'abjuration', 'cd', 'A', 'contact', '1 minute', true, 'V, S, M', 'La cible ajoute 1d4 à une sauvegarde.', { type: 'bonus', cibles: 'allie', bonus_sauvegarde: '1d4' }],
    ['thaumaturgie', 'Thaumaturgie', 0, 'transmutation', 'c', 'A', '9 m', '1 minute', false, 'V', 'Des prodiges mineurs : une voix tonnante, des flammes qui vacillent, le sol qui tremble.', null],
    ['trait-de-feu', 'Trait de feu', 0, 'evocation', 'em', 'A', '36 m', 'instantanée', false, 'V, S', 'Une flèche de feu : attaque de sort à distance, 1d10 dégâts de feu.', att('1d10', 'feu')],
    // Niveau 1
    ['alarme', 'Alarme', 1, 'abjuration', 'mr', '1 minute', '9 m', '8 heures', false, 'V, S, M', 'Une alarme mentale ou sonore quand une créature entre dans la zone. Rituel.', null, true],
    ['amitie-avec-les-animaux', 'Amitié avec les animaux', 1, 'enchantement', 'bdr', 'A', '9 m', '24 heures', false, 'V, S, M', 'Une bête (Int 3 ou moins) est charmée si elle rate une sauvegarde de Sagesse.', null],
    ['armure-de-mage', 'Armure de mage', 1, 'abjuration', 'em', 'A', 'contact', '8 heures', false, 'V, S, M', 'Sans armure, la CA de la cible devient 13 + Dextérité (ici : +3 à sa CA pendant le combat).', { type: 'bonus', cibles: 'soi', bonus_ca: 3, tours: 100 }],
    ['benediction', 'Bénédiction', 1, 'enchantement', 'cp', 'A', '9 m', '1 minute', true, 'V, S, M', 'Jusqu\'à trois créatures ajoutent 1d4 à leurs attaques et à leurs sauvegardes.', { type: 'bonus', cibles: 'allies', bonus_attaque: '1d4', bonus_sauvegarde: '1d4' }],
    ['blessure', 'Blessure', 1, 'necromancie', 'c', 'A', 'contact', 'instantanée', false, 'V, S', 'Attaque de sort au corps à corps : 3d10 dégâts nécrotiques (+1d10 par niveau au-dessus du 1er).', att('3d10', 'necrotique', { attaque: 'corps', niveau_sup: '1d10' })],
    ['bouclier', 'Bouclier', 1, 'abjuration', 'em', 'R', 'personnelle', '1 round', false, 'V, S', '+5 à la CA jusqu\'à ton prochain tour (dans Saga : lancé à ton tour, faute de réaction).', { type: 'bonus', cibles: 'soi', bonus_ca: 5, tours: 1 }],
    ['bouclier-de-la-foi', 'Bouclier de la foi', 1, 'abjuration', 'cp', 'B', '18 m', '10 minutes', true, 'V, S, M', 'Un champ scintillant : +2 à la CA de la cible.', { type: 'bonus', cibles: 'allie', bonus_ca: 2, action: 'bonus' }],
    ['charme-personne', 'Charme-personne', 1, 'enchantement', 'bdemo', 'A', '9 m', '1 heure', false, 'V, S', 'Un humanoïde est charmé s\'il rate une sauvegarde de Sagesse (avec avantage s\'il se bat contre toi).', etat('sag', 'charme', { tours: 10 })],
    ['communication-avec-les-animaux', 'Communication avec les animaux', 1, 'divination', 'bdr', 'A', 'personnelle', '10 minutes', false, 'V, S', 'Tu comprends les bêtes et leur parles. Rituel.', null, true],
    ['comprehension-des-langues', 'Compréhension des langues', 1, 'divination', 'bemo', 'A', 'personnelle', '1 heure', false, 'V, S, M', 'Tu comprends toutes les langues parlées et écrites. Rituel.', null, true],
    ['couleurs-dansantes', 'Couleurs dansantes', 1, 'illusion', 'bem', 'A', 'personnelle (cône de 4,5 m)', '1 round', false, 'V, S, M', 'Un éventail de couleurs aveugle 6d10 PV de créatures, les plus faibles d\'abord.', null],
    ['creation-ou-destruction-d-eau', 'Création ou destruction d\'eau', 1, 'transmutation', 'cd', 'A', '9 m', 'instantanée', false, 'V, S, M', 'Crée ou détruit jusqu\'à 40 litres d\'eau.', null],
    ['deguisement', 'Déguisement', 1, 'illusion', 'bem', 'A', 'personnelle', '1 heure', false, 'V, S', 'Tu changes d\'apparence, vêtements compris.', null],
    ['detection-de-la-magie', 'Détection de la magie', 1, 'divination', 'bcdemopr', 'A', 'personnelle', '10 minutes', true, 'V, S', 'Tu sens la magie à 9 m et vois son aura. Rituel.', null, true],
    ['detection-du-mal-et-du-bien', 'Détection du mal et du bien', 1, 'divination', 'cp', 'A', 'personnelle', '10 minutes', true, 'V, S', 'Tu sens les aberrations, célestes, élémentaires, fées, fiélons et morts-vivants à 9 m.', null],
    ['enchevetrement', 'Enchevêtrement', 1, 'invocation', 'd', 'A', '27 m', '1 minute', true, 'V, S', 'Des herbes et des lianes jaillissent : sauvegarde de Force ou entravé (il retente à chaque tour).', etat('for', 'entrave', { cibles: 'zone', repete: true })],
    ['feuille-morte', 'Feuille morte', 1, 'transmutation', 'bem', 'R', '18 m', '1 minute', false, 'V, M', 'Jusqu\'à cinq créatures qui tombent descendent doucement.', null],
    ['fleau', 'Fléau', 1, 'enchantement', 'bc', 'A', '9 m', '1 minute', true, 'V, S, M', 'Jusqu\'à trois créatures font une sauvegarde de Charisme ou retirent 1d4 à leurs attaques et sauvegardes.', null],
    ['fou-rire-de-tasha', 'Fou rire de Tasha', 1, 'enchantement', 'bm', 'A', '9 m', '1 minute', true, 'V, S, M', 'La cible est prise d\'un fou rire : sauvegarde de Sagesse ou à terre et neutralisée (elle retente à chaque tour).', etat('sag', 'incapable', { repete: true })],
    ['graisse', 'Graisse', 1, 'invocation', 'm', 'A', '18 m', '1 minute', false, 'V, S, M', 'Un carré de 3 m de graisse glissante : sauvegarde de Dextérité ou à terre.', etat('dex', 'a_terre', { cibles: 'zone', tours: 1 })],
    ['grande-foulee', 'Grande foulée', 1, 'transmutation', 'bdmr', 'A', 'contact', '1 heure', false, 'V, S, M', 'La vitesse de la cible augmente de 3 m.', null],
    ['heroisme', 'Héroïsme', 1, 'enchantement', 'bp', 'A', 'contact', '1 minute', true, 'V, S', 'La cible ne peut pas être effrayée et gagne des PV temporaires à chaque tour.', { type: 'pv_temp', cibles: 'allie', soin: '0', ajouter_mod: true }],
    ['identification', 'Identification', 1, 'divination', 'bm', '1 minute', 'contact', 'instantanée', false, 'V, S, M', 'Tu apprends les propriétés d\'un objet magique. Rituel.', null, true],
    ['image-silencieuse', 'Image silencieuse', 1, 'illusion', 'bem', 'A', '18 m', '10 minutes', true, 'V, S, M', 'Une image immobile ou mobile, sans son, d\'au plus un cube de 4,5 m.', null],
    ['injonction', 'Injonction', 1, 'enchantement', 'cp', 'A', '18 m', '1 round', false, 'V', 'Un ordre d\'un mot (« À terre ! ») : sauvegarde de Sagesse ou il obéit à son prochain tour.', etat('sag', 'a_terre', { tours: 1 })],
    ['mains-brulantes', 'Mains brûlantes', 1, 'evocation', 'em', 'A', 'personnelle (cône de 4,5 m)', 'instantanée', false, 'V, S', 'Une nappe de flammes : sauvegarde de Dextérité, 3d6 dégâts de feu (la moitié si réussi) ; +1d6 par niveau au-dessus du 1er.', sauv('dex', '3d6', 'feu', { cibles: 'zone', moitie: true, niveau_sup: '1d6' })],
    ['marque-du-chasseur', 'Marque du chasseur', 1, 'divination', 'r', 'B', '27 m', '1 heure', true, 'V', 'Tu marques une proie : +1d6 de dégâts quand tu la touches, et l\'avantage pour la pister.', null],
    ['mot-de-guerison', 'Mot de guérison', 1, 'evocation', 'bcd', 'B', '18 m', 'instantanée', false, 'V', 'Une créature que tu vois regagne 1d4 + ta caractéristique PV (+1d4 par niveau au-dessus du 1er).', soin('1d4', { niveau_sup: '1d4', action: 'bonus' })],
    ['nappe-de-brouillard', 'Nappe de brouillard', 1, 'invocation', 'dmr', 'A', '36 m', '1 heure', true, 'V, S', 'Une sphère de brouillard épais de 6 m de rayon.', null],
    ['projectile-magique', 'Projectile magique', 1, 'evocation', 'em', 'A', '36 m', 'instantanée', false, 'V, S', 'Trois fléchettes de force qui touchent toujours : 1d4 + 1 chacune (une de plus par niveau au-dessus du 1er).', { type: 'auto', cibles: 'un', degats: '3d4+3', type_degats: 'force', niveau_sup: '1d4+1' }],
    ['protection-contre-le-mal-et-le-bien', 'Protection contre le mal et le bien', 1, 'abjuration', 'cmop', 'A', 'contact', '10 minutes', true, 'V, S, M', 'Les aberrations, célestes, élémentaires, fées, fiélons et morts-vivants ont un désavantage contre la cible.', null],
    ['repli-expeditif', 'Repli expéditif', 1, 'transmutation', 'emo', 'B', 'personnelle', '10 minutes', true, 'V, S', 'Tu peux foncer en action bonus.', null],
    ['sanctuaire', 'Sanctuaire', 1, 'abjuration', 'c', 'B', '9 m', '1 minute', false, 'V, S, M', 'Qui veut attaquer la cible fait d\'abord une sauvegarde de Sagesse.', null],
    ['saut', 'Saut', 1, 'transmutation', 'dmr', 'A', 'contact', '1 minute', false, 'V, S, M', 'La distance de saut de la cible est triplée.', null],
    ['serviteur-invisible', 'Serviteur invisible', 1, 'invocation', 'bm', 'A', '18 m', '1 heure', false, 'V, S, M', 'Une force invisible fait des tâches simples. Rituel.', null, true],
    ['simulacre-de-vie', 'Simulacre de vie', 1, 'necromancie', 'em', 'A', 'personnelle', '1 heure', false, 'V, S, M', 'Tu gagnes 1d4 + 4 PV temporaires (+5 par niveau au-dessus du 1er).', { type: 'pv_temp', cibles: 'soi', soin: '1d4+4', niveau_sup: '5' }],
    ['soins', 'Soins', 1, 'evocation', 'bcdpr', 'A', 'contact', 'instantanée', false, 'V, S', 'La créature touchée regagne 1d8 + ta caractéristique PV (+1d8 par niveau au-dessus du 1er).', soin('1d8', { niveau_sup: '1d8' })],
    ['sommeil', 'Sommeil', 1, 'enchantement', 'bem', 'A', '27 m', '1 minute', false, 'V, S, M', 'Endort 5d8 PV de créatures, les plus faibles d\'abord (+2d8 par niveau au-dessus du 1er).', { type: 'sommeil', cibles: 'zone', degats: '5d8', niveau_sup: '2d8' }],
    ['texte-illisible', 'Texte illisible', 1, 'illusion', 'bmo', '1 minute', 'contact', '10 jours', false, 'S, M', 'Un message que seuls ceux que tu choisis savent lire. Rituel.', null, true],
    ['vague-tonnante', 'Vague tonnante', 1, 'evocation', 'bdm', 'A', 'personnelle (cube de 4,5 m)', 'instantanée', false, 'V, S', 'Une onde de choc : sauvegarde de Constitution, 2d8 dégâts de tonnerre (la moitié si réussi) et repoussé ; +1d8 par niveau au-dessus du 1er.', sauv('con', '2d8', 'tonnerre', { cibles: 'zone', moitie: true, niveau_sup: '1d8' })],
    ['faveur-divine', 'Faveur divine', 1, 'evocation', 'p', 'B', 'personnelle', '1 minute', true, 'V, S', 'Tes attaques d\'arme font 1d4 dégâts radiants de plus.', null],
    ['rayon-tracant', 'Rayon traçant', 1, 'evocation', 'c', 'A', '36 m', '1 round', false, 'V, S', 'Un éclair de lumière : attaque de sort à distance, 4d6 dégâts radiants ; la prochaine attaque contre la cible a l\'avantage. +1d6 par niveau au-dessus du 1er.', att('4d6', 'radiant', { niveau_sup: '1d6' })],
    ['baies-nourricieres', 'Baies nourricières', 1, 'transmutation', 'dr', 'A', 'contact', 'instantanée', false, 'V, S, M', 'Dix baies magiques ; chacune nourrit pour un jour et rend 1 PV.', null],
    // Niveau 2
    ['aide', 'Aide', 2, 'abjuration', 'cp', 'A', '9 m', '8 heures', false, 'V, S, M', 'Jusqu\'à trois créatures gagnent 5 PV (max et actuels) ; +5 par niveau au-dessus du 2e. (Dans Saga : des PV temporaires.)', { type: 'pv_temp', cibles: 'allies', soin: '5', niveau_sup: '5' }],
    ['arme-magique', 'Arme magique', 2, 'transmutation', 'pm', 'B', 'contact', '1 heure', true, 'V, S', 'Une arme devient magique : +1 à l\'attaque et aux dégâts.', { type: 'bonus', cibles: 'allie', bonus_attaque: '1', action: 'bonus' }],
    ['arme-spirituelle', 'Arme spirituelle', 2, 'evocation', 'c', 'B', '18 m', '1 minute', false, 'V, S', 'Une arme spectrale frappe : attaque de sort au corps à corps, 1d8 + ta caractéristique de force (dans Saga : une frappe quand tu la lances).', att('1d8', 'force', { attaque: 'corps', ajouter_mod: true, action: 'bonus', niveau_sup: '1d8' })],
    ['augure', 'Augure', 2, 'divination', 'c', '1 minute', 'personnelle', 'instantanée', false, 'V, S, M', 'Un présage sur une action prévue dans la demi-heure : bonheur, malheur, les deux, rien. Rituel.', null, true],
    ['bourrasque', 'Bourrasque', 2, 'evocation', 'dmr', 'A', 'personnelle (ligne de 18 m)', '1 minute', true, 'V, S, M', 'Un vent violent repousse les créatures et disperse les gaz.', null],
    ['cecite-surdite', 'Cécité/Surdité', 2, 'necromancie', 'bcem', 'A', '9 m', '1 minute', false, 'V', 'Sauvegarde de Constitution ou aveuglé (ou assourdi) ; il retente à la fin de chacun de ses tours.', etat('con', 'aveugle', { repete: true })],
    ['detection-des-pensees', 'Détection des pensées', 2, 'divination', 'bem', 'A', 'personnelle', '1 minute', true, 'V, S, M', 'Tu lis les pensées de surface d\'une créature proche.', null],
    ['agrandissement-rapetissement', 'Agrandissement/Rapetissement', 2, 'transmutation', 'em', 'A', '9 m', '1 minute', true, 'V, S, M', 'La cible double de taille (+1d4 aux dégâts) ou rapetisse (−1d4).', null],
    ['fleche-acide-de-melf', 'Flèche acide de Melf', 2, 'evocation', 'm', 'A', '27 m', 'instantanée', false, 'V, S, M', 'Attaque de sort à distance : 4d4 dégâts d\'acide, puis 2d4 au tour suivant. +1d4 par niveau au-dessus du 2e.', att('4d4', 'acide', { niveau_sup: '1d4' })],
    ['flou', 'Flou', 2, 'illusion', 'em', 'A', 'personnelle', '1 minute', true, 'V', 'Ton corps devient flou : les attaques contre toi ont un désavantage.', null],
    ['force-fantasmagorique', 'Force fantasmagorique', 2, 'illusion', 'bem', 'A', '18 m', '1 minute', true, 'V, S, M', 'Une illusion dans l\'esprit de la cible (sauvegarde d\'Intelligence), qui peut lui faire 1d6 dégâts psychiques par tour.', null],
    ['fracassement', 'Fracassement', 2, 'evocation', 'bemo', 'A', '18 m', 'instantanée', false, 'V, S, M', 'Un bruit assourdissant : sauvegarde de Constitution, 3d8 dégâts de tonnerre (la moitié si réussi) ; +1d8 par niveau au-dessus du 2e.', sauv('con', '3d8', 'tonnerre', { cibles: 'zone', moitie: true, niveau_sup: '1d8' })],
    ['immobilisation-de-personne', 'Immobilisation de personne', 2, 'enchantement', 'bcdemo', 'A', '18 m', '1 minute', true, 'V, S, M', 'Un humanoïde est paralysé s\'il rate une sauvegarde de Sagesse ; il retente à la fin de chacun de ses tours.', etat('sag', 'paralyse', { repete: true })],
    ['image-miroir', 'Image miroir', 2, 'illusion', 'emo', 'A', 'personnelle', '1 minute', false, 'V, S', 'Trois doubles illusoires détournent les attaques.', null],
    ['invisibilite', 'Invisibilité', 2, 'illusion', 'bemo', 'A', 'contact', '1 heure', true, 'V, S, M', 'La cible devient invisible jusqu\'à ce qu\'elle attaque ou lance un sort.', { type: 'etat', cibles: 'allie', etat: 'invisible' }],
    ['lame-de-feu', 'Lame de feu', 2, 'evocation', 'd', 'B', 'personnelle', '10 minutes', true, 'V, S, M', 'Une lame de flammes : attaque de sort au corps à corps, 3d6 dégâts de feu.', att('3d6', 'feu', { attaque: 'corps', action: 'bonus' })],
    ['levitation', 'Lévitation', 2, 'transmutation', 'em', 'A', '18 m', '10 minutes', true, 'V, S, M', 'Une créature ou un objet s\'élève jusqu\'à 6 m.', null],
    ['localisation-d-objet', 'Localisation d\'objet', 2, 'divination', 'bcdmpr', 'A', 'personnelle', '10 minutes', true, 'V, S, M', 'Tu sens la direction d\'un objet connu à moins de 300 m.', null],
    ['modification-d-apparence', 'Modification d\'apparence', 2, 'transmutation', 'em', 'A', 'personnelle', '1 heure', true, 'V, S', 'Tu changes ton corps : nager, respirer sous l\'eau, griffes…', null],
    ['nuee-de-dagues', 'Nuée de dagues', 2, 'invocation', 'bemo', 'A', '18 m', '1 minute', true, 'V, S, M', 'Des dagues tournoyantes : 4d4 dégâts tranchants (+2d4 par niveau au-dessus du 2e).', { type: 'auto', cibles: 'un', degats: '4d4', type_degats: 'tranchant', niveau_sup: '2d4' }],
    ['pas-brumeux', 'Pas brumeux', 2, 'invocation', 'emo', 'B', 'personnelle', 'instantanée', false, 'V', 'Tu te téléportes jusqu\'à 9 m.', null],
    ['peau-d-ecorce', 'Peau d\'écorce', 2, 'transmutation', 'dr', 'A', 'contact', '1 heure', true, 'V, S, M', 'La peau de la cible devient dure comme l\'écorce : CA d\'au moins 16.', null],
    ['priere-de-guerison', 'Prière de guérison', 2, 'evocation', 'c', '10 minutes', '9 m', 'instantanée', false, 'V', 'Jusqu\'à six créatures regagnent 2d8 + ta caractéristique PV (hors combat ; +1d8 par niveau au-dessus du 2e).', soin('2d8', { cibles: 'allies', niveau_sup: '1d8' })],
    ['rayon-ardent', 'Rayon ardent', 2, 'evocation', 'em', 'A', '36 m', 'instantanée', false, 'V, S', 'Trois rayons de feu : une attaque de sort chacun, 2d6 dégâts de feu (dans Saga : un rayon par ennemi, jusqu\'à trois).', att('2d6', 'feu', { cibles: 'plusieurs', nombre: 3 })],
    ['restauration-partielle', 'Restauration partielle', 2, 'abjuration', 'bcdpr', 'A', 'contact', 'instantanée', false, 'V, S', 'Met fin à une maladie, ou à l\'état aveuglé, assourdi, paralysé ou empoisonné.', null],
    ['silence', 'Silence', 2, 'illusion', 'bcr', 'A', '36 m', '10 minutes', true, 'V, S', 'Une sphère de 6 m de rayon où aucun son ne passe. Rituel.', null, true],
    ['sphere-de-feu', 'Sphère de feu', 2, 'invocation', 'dem', 'A', '18 m', '1 minute', true, 'V, S, M', 'Une boule de feu roulante : sauvegarde de Dextérité ou 2d6 dégâts de feu (+1d6 par niveau au-dessus du 2e).', sauv('dex', '2d6', 'feu', { niveau_sup: '1d6' })],
    ['suggestion', 'Suggestion', 2, 'enchantement', 'bemo', 'A', '9 m', '8 heures', true, 'V, M', 'Tu suggères une action raisonnable : sauvegarde de Sagesse ou la cible la fait.', etat('sag', 'charme')],
    ['tenebres', 'Ténèbres', 2, 'evocation', 'emo', 'A', '18 m', '10 minutes', true, 'V, M', 'Une sphère de ténèbres magiques de 4,5 m de rayon.', null],
    ['toile-d-araignee', 'Toile d\'araignée', 2, 'invocation', 'em', 'A', '18 m', '1 heure', true, 'V, S, M', 'Des toiles épaisses : sauvegarde de Dextérité ou entravé.', etat('dex', 'entrave', { cibles: 'zone', repete: true })],
    ['vision-dans-le-noir', 'Vision dans le noir', 2, 'transmutation', 'dmr', 'A', 'contact', '8 heures', false, 'V, S, M', 'La cible voit dans le noir jusqu\'à 18 m.', null],
    ['chauffer-le-metal', 'Chauffer le métal', 2, 'transmutation', 'bd', 'A', '18 m', '1 minute', true, 'V, S, M', 'Un objet métallique devient brûlant : 2d8 dégâts de feu à qui le touche (+1d8 par niveau au-dessus du 2e).', { type: 'auto', cibles: 'un', degats: '2d8', type_degats: 'feu', niveau_sup: '1d8' }],
    ['zone-de-verite', 'Zone de vérité', 2, 'enchantement', 'bcp', 'A', '18 m', '10 minutes', false, 'V, S', 'Dans la zone, qui rate une sauvegarde de Charisme ne peut pas mentir.', null],
    // Niveau 3
    ['animation-des-morts', 'Animation des morts', 3, 'necromancie', 'cm', '1 minute', '3 m', 'instantanée', false, 'V, S, M', 'Un squelette ou un zombi t\'obéit pendant 24 heures.', null],
    ['appel-de-la-foudre', 'Appel de la foudre', 3, 'invocation', 'd', 'A', '36 m', '10 minutes', true, 'V, S', 'Un nuage d\'orage : chaque tour, un éclair, sauvegarde de Dextérité, 3d10 dégâts de foudre (la moitié si réussi).', sauv('dex', '3d10', 'foudre', { moitie: true, niveau_sup: '1d10' })],
    ['boule-de-feu', 'Boule de feu', 3, 'evocation', 'em', 'A', '45 m', 'instantanée', false, 'V, S, M', 'Une explosion de flammes de 6 m de rayon : sauvegarde de Dextérité, 8d6 dégâts de feu (la moitié si réussi) ; +1d6 par niveau au-dessus du 3e.', sauv('dex', '8d6', 'feu', { cibles: 'zone', moitie: true, niveau_sup: '1d6' })],
    ['caresse-du-vampire', 'Caresse du vampire', 3, 'necromancie', 'mo', 'A', 'personnelle', '1 minute', true, 'V, S', 'Attaque de sort au corps à corps : 3d6 dégâts nécrotiques, et tu regagnes la moitié en PV.', att('3d6', 'necrotique', { attaque: 'corps', niveau_sup: '1d6' })],
    ['clairvoyance', 'Clairvoyance', 3, 'divination', 'bcm', '10 minutes', '1,5 km', '10 minutes', true, 'V, S, M', 'Un œil ou une oreille invisible dans un lieu connu.', null],
    ['clignotement', 'Clignotement', 3, 'transmutation', 'em', 'A', 'personnelle', '1 minute', false, 'V, S', 'À la fin de chaque tour, une chance sur deux de passer dans le plan éthéré.', null],
    ['contresort', 'Contresort', 3, 'abjuration', 'emo', 'R', '18 m', 'instantanée', false, 'S', 'Interrompt un sort en train d\'être lancé.', null],
    ['dissipation-de-la-magie', 'Dissipation de la magie', 3, 'abjuration', 'bcdemop', 'A', '36 m', 'instantanée', false, 'V, S', 'Met fin aux sorts sur une cible (de niveau 3 ou moins, au-delà sur un test).', null],
    ['don-des-langues', 'Don des langues', 3, 'divination', 'bemo', 'A', 'contact', '1 heure', false, 'V, M', 'La cible comprend et parle toutes les langues.', null],
    ['eclair', 'Éclair', 3, 'evocation', 'em', 'A', 'personnelle (ligne de 30 m)', 'instantanée', false, 'V, S, M', 'Un trait de foudre : sauvegarde de Dextérité, 8d6 dégâts de foudre (la moitié si réussi) ; +1d6 par niveau au-dessus du 3e.', sauv('dex', '8d6', 'foudre', { cibles: 'zone', moitie: true, niveau_sup: '1d6' })],
    ['esprits-gardiens', 'Esprits gardiens', 3, 'invocation', 'c', 'A', 'personnelle (rayon de 4,5 m)', '10 minutes', true, 'V, S, M', 'Des esprits t\'entourent : sauvegarde de Sagesse, 3d8 dégâts radiants (la moitié si réussi) ; +1d8 par niveau au-dessus du 3e.', sauv('sag', '3d8', 'radiant', { cibles: 'zone', moitie: true, niveau_sup: '1d8' })],
    ['forme-gazeuse', 'Forme gazeuse', 3, 'transmutation', 'emo', 'A', 'contact', '1 heure', true, 'V, S, M', 'La cible devient un nuage de brume qui passe par les fentes.', null],
    ['glyphe-de-protection', 'Glyphe de protection', 3, 'abjuration', 'bcm', '1 heure', 'contact', 'jusqu\'à dissipation', false, 'V, S, M', 'Un glyphe piégé qui explose (5d8) ou libère un sort.', null],
    ['hate', 'Hâte', 3, 'transmutation', 'em', 'A', '9 m', '1 minute', true, 'V, S, M', 'La cible : vitesse doublée, +2 à la CA, avantage aux sauvegardes de Dextérité et une action de plus.', { type: 'bonus', cibles: 'allie', bonus_ca: 2 }],
    ['lenteur', 'Lenteur', 3, 'transmutation', 'em', 'A', '36 m', '1 minute', true, 'V, S, M', 'Jusqu\'à six créatures ralenties (sauvegarde de Sagesse) : −2 à la CA, une seule action ou action bonus.', null],
    ['lueur-d-espoir', 'Lueur d\'espoir', 3, 'abjuration', 'c', 'A', '9 m', '1 minute', true, 'V, S', 'Avantage aux sauvegardes de Sagesse et contre la mort ; les soins rendent le maximum.', null],
    ['lumiere-du-jour', 'Lumière du jour', 3, 'evocation', 'cdpr', 'A', '18 m', '1 heure', false, 'V, S', 'Une sphère de lumière vive de 18 m de rayon.', null],
    ['malediction', 'Malédiction', 3, 'necromancie', 'bcm', 'A', 'contact', '1 minute', true, 'V, S', 'Sauvegarde de Sagesse ou maudit : désavantage, perte d\'actions ou 1d8 dégâts nécrotiques de plus.', null],
    ['mot-de-guerison-de-groupe', 'Mot de guérison de groupe', 3, 'evocation', 'c', 'B', '18 m', 'instantanée', false, 'V', 'Jusqu\'à six créatures regagnent 1d4 + ta caractéristique PV (+1d4 par niveau au-dessus du 3e).', soin('1d4', { cibles: 'allies', niveau_sup: '1d4', action: 'bonus' })],
    ['motif-hypnotique', 'Motif hypnotique', 3, 'illusion', 'bem', 'A', '36 m', '1 minute', true, 'S, M', 'Des couleurs envoûtantes : sauvegarde de Sagesse ou charmé et neutralisé.', etat('sag', 'incapable', { cibles: 'zone' })],
    ['nuage-puant', 'Nuage puant', 3, 'invocation', 'bm', 'A', '27 m', '1 minute', true, 'V, S, M', 'Un nuage nauséabond : sauvegarde de Constitution ou il passe son tour à vomir.', etat('con', 'incapable', { cibles: 'zone', tours: 1 })],
    ['peur', 'Peur', 3, 'illusion', 'bemo', 'A', 'personnelle (cône de 9 m)', '1 minute', true, 'V, S, M', 'Une vision terrifiante : sauvegarde de Sagesse ou effrayé et en fuite (il retente s\'il ne te voit plus).', etat('sag', 'effraye', { cibles: 'zone', repete: true })],
    ['protection-contre-l-energie', 'Protection contre l\'énergie', 3, 'abjuration', 'demr', 'A', 'contact', '1 heure', true, 'V, S', 'Résistance à l\'acide, au froid, au feu, à la foudre ou au tonnerre.', null],
    ['respiration-aquatique', 'Respiration aquatique', 3, 'transmutation', 'demr', 'A', '9 m', '24 heures', false, 'V, S, M', 'Jusqu\'à dix créatures respirent sous l\'eau. Rituel.', null, true],
    ['retour-a-la-vie', 'Retour à la vie', 3, 'necromancie', 'cp', 'A', 'contact', 'instantanée', false, 'V, S, M', 'Une créature morte depuis moins d\'une minute revient avec 1 PV (diamant de 300 po).', null],
    ['tempete-de-neige', 'Tempête de neige', 3, 'invocation', 'dem', 'A', '45 m', '1 minute', true, 'V, S, M', 'Grêle et verglas : sauvegarde de Dextérité ou à terre.', etat('dex', 'a_terre', { cibles: 'zone', tours: 1 })],
    ['vol', 'Vol', 3, 'transmutation', 'emo', 'A', 'contact', '10 minutes', true, 'V, S, M', 'La cible vole à 18 m.', null],
    ['communication-avec-les-morts', 'Communication avec les morts', 3, 'necromancie', 'bc', 'A', '3 m', '10 minutes', false, 'V, S, M', 'Un cadavre répond à cinq questions.', null],
    ['image-majeure', 'Image majeure', 3, 'illusion', 'bemo', 'A', '36 m', '10 minutes', true, 'V, S, M', 'Une illusion avec son, odeur et chaleur.', null],
  ];

  // --- Les monstres (FP 0 à 5) ---
  // m(id, nom, fp, type, taille, ca, dés de vie, vitesse (m), [for, dex, con, int, sag, cha], le reste).
  // Une action : a(nom, bonus pour toucher, dégâts, type, le reste) ; une action à sauvegarde :
  // s(nom, carac, DD, dégâts, type, le reste). FORMAT.md › « Le pack JDR » › monstres_jdr.
  const CARACS = ['for', 'dex', 'con', 'int', 'sag', 'cha'];
  const a = (nom, attaque, degats, type_degats, o = {}) => ({ nom, attaque, degats, type_degats, ...o });
  const s = (nom, carac, dd, degats, type_degats, o = {}) => ({ nom, sauvegarde: { carac, dd, moitie: o.moitie !== false }, degats, type_degats, ...o });
  const m = (id, nom, fp, type, taille, ca, pv_des, vitesse, c, o = {}) => ({ id, nom, fp, type, taille, ca, pv_des, vitesse, carac: Object.fromEntries(CARACS.map((k, i) => [k, c[i]])), ...o });
  const MONSTRES = [
    m('rat-geant', 'Rat géant', '1/8', 'bête', 'petite', 12, '2d6', 9, [7, 15, 11, 2, 10, 4], { sens: 'vision dans le noir 18 m', actions: [a('Morsure', 4, '1d4+2', 'perforant')], traits: [{ nom: 'Tactique de meute', description: 'Avantage contre une cible qui a un de ses alliés au contact.' }], description: 'Gros comme un chien, il infeste les égouts et les caves.' }),
    m('kobold', 'Kobold', '1/8', 'humanoïde (kobold)', 'petite', 12, '2d6-2', 9, [7, 15, 9, 8, 7, 8], { sens: 'vision dans le noir 18 m', langues: 'commun, draconique', actions: [a('Dague', 4, '1d4+2', 'perforant'), a('Fronde', 4, '1d4+2', 'contondant', { distance: true })], traits: [{ nom: 'Sensibilité au soleil', description: 'Désavantage en plein soleil.' }, { nom: 'Tactique de meute', description: 'Avantage contre une cible qui a un de ses alliés au contact.' }], or: '1d6', description: 'Petit reptile rusé qui pose des pièges et vénère les dragons.' }),
    m('bandit', 'Bandit', '1/8', 'humanoïde', 'moyenne', 12, '2d8+2', 9, [11, 12, 12, 10, 10, 10], { langues: 'commun', actions: [a('Cimeterre', 3, '1d6+1', 'tranchant'), a('Arbalète légère', 3, '1d8+1', 'perforant', { distance: true })], or: '2d6', butin: [{ objet: 'cimeterre', chance: 15 }], description: 'Un détrousseur des grands chemins.' }),
    m('garde', 'Garde', '1/8', 'humanoïde', 'moyenne', 16, '2d8+2', 9, [13, 12, 12, 10, 11, 10], { ca_texte: 'chemise de mailles, bouclier', competences: { perception: 2 }, langues: 'commun', actions: [a('Lance', 3, '1d6+1', 'perforant')], description: 'Un soldat de la milice, qui veille sur les portes de la ville.' }),
    m('cultiste', 'Cultiste', '1/8', 'humanoïde', 'moyenne', 12, '2d8', 9, [11, 12, 10, 10, 11, 10], { langues: 'commun', actions: [a('Cimeterre', 3, '1d6+1', 'tranchant')], traits: [{ nom: 'Dévotion sombre', description: 'Avantage contre le charme et la peur.' }], or: '1d6', description: 'Un fidèle d\'une puissance sombre, en robe à capuche.' }),
    m('gobelin', 'Gobelin', '1/4', 'humanoïde (gobelinoïde)', 'petite', 15, '2d6', 9, [8, 14, 10, 10, 8, 8], { ca_texte: 'armure de cuir, bouclier', competences: { discretion: 6 }, sens: 'vision dans le noir 18 m', langues: 'commun, gobelin', actions: [a('Cimeterre', 4, '1d6+2', 'tranchant'), a('Arc court', 4, '1d6+2', 'perforant', { distance: true })], traits: [{ nom: 'Fuite agile', description: 'Se désengage ou se cache en action bonus.' }], or: '1d6', butin: [{ objet: 'potion-de-soins', chance: 5 }], description: 'Petit, vicieux et lâche ; dangereux en bande.' }),
    m('loup', 'Loup', '1/4', 'bête', 'moyenne', 13, '2d8+2', 12, [12, 15, 12, 3, 12, 6], { competences: { perception: 3, discretion: 4 }, actions: [a('Morsure', 4, '2d4+2', 'perforant', { etat: 'a_terre', etat_sauvegarde: { carac: 'for', dd: 11 }, tours: 1 })], traits: [{ nom: 'Tactique de meute', description: 'Avantage contre une cible qui a un de ses alliés au contact.' }], description: 'Il chasse en meute et renverse ses proies.' }),
    m('squelette', 'Squelette', '1/4', 'mort-vivant', 'moyenne', 13, '2d8+4', 9, [10, 14, 15, 6, 8, 5], { ca_texte: 'restes d\'armure', vulnerabilites_degats: ['contondant'], immunites_degats: ['poison'], immunites_etats: ['empoisonne', 'epuisement'], sens: 'vision dans le noir 18 m', actions: [a('Épée courte', 4, '1d6+2', 'perforant'), a('Arc court', 4, '1d6+2', 'perforant', { distance: true })], description: 'Des os animés par la nécromancie, sans peur ni pitié.' }),
    m('zombi', 'Zombi', '1/4', 'mort-vivant', 'moyenne', 8, '3d8+9', 6, [13, 6, 16, 3, 6, 5], { sauvegardes: { sag: 0 }, immunites_degats: ['poison'], immunites_etats: ['empoisonne'], sens: 'vision dans le noir 18 m', actions: [a('Coup', 3, '1d6+1', 'contondant')], traits: [{ nom: 'Ténacité des morts-vivants', description: 'À 0 PV (sauf radiants ou coup critique), sauvegarde de Constitution pour rester à 1 PV.' }], description: 'Un cadavre qui titube, lent et increvable.' }),
    m('sanglier', 'Sanglier', '1/4', 'bête', 'moyenne', 11, '2d8+2', 12, [13, 11, 12, 2, 9, 5], { actions: [a('Défenses', 3, '1d6+1', 'tranchant')], traits: [{ nom: 'Charge', description: '+1d6 dégâts s\'il charge sur 6 m.' }, { nom: 'Implacable', description: 'Une fois par repos, reste à 1 PV au lieu de 0.' }], description: 'Il charge tout ce qui entre sur son territoire.' }),
    m('chauve-souris-geante', 'Chauve-souris géante', '1/4', 'bête', 'grande', 13, '4d10', 18, [15, 16, 11, 2, 12, 6], { sens: 'vision aveugle 18 m', actions: [a('Morsure', 4, '1d6+2', 'perforant')], description: 'Elle niche dans les grottes et chasse grâce à l\'écho.' }),
    m('acolyte', 'Acolyte', '1/4', 'humanoïde', 'moyenne', 10, '2d8', 9, [10, 10, 10, 10, 14, 11], { competences: { medecine: 4, religion: 2 }, langues: 'commun', actions: [a('Gourdin', 2, '1d4', 'contondant'), s('Flamme sacrée', 'dex', 12, '1d8', 'radiant', { moitie: false, couleur: '#fff3b0' })], or: '1d6', description: 'Un jeune prêtre au service d\'un temple.' }),
    m('hobgobelin', 'Hobgobelin', '1/2', 'humanoïde (gobelinoïde)', 'moyenne', 18, '2d8+2', 9, [13, 12, 12, 10, 10, 9], { ca_texte: 'cotte de mailles, bouclier', sens: 'vision dans le noir 18 m', langues: 'commun, gobelin', actions: [a('Épée longue', 3, '1d8+1', 'tranchant'), a('Arc long', 3, '1d8+1', 'perforant', { distance: true })], traits: [{ nom: 'Avantage martial', description: '+2d6 dégâts une fois par tour si un allié est près de la cible.' }], or: '2d6', description: 'Un gobelinoïde discipliné, soldat d\'une armée.' }),
    m('orc', 'Orc', '1/2', 'humanoïde (orc)', 'moyenne', 13, '2d8+6', 9, [16, 12, 16, 7, 11, 10], { ca_texte: 'armure de peau', competences: { intimidation: 2 }, sens: 'vision dans le noir 18 m', langues: 'commun, orc', actions: [a('Hache à deux mains', 5, '1d12+3', 'tranchant'), a('Javeline', 5, '1d6+3', 'perforant', { distance: true })], traits: [{ nom: 'Agressif', description: 'Se rapproche d\'un ennemi en action bonus.' }], or: '2d6', description: 'Un pillard brutal, toujours en quête de combat.' }),
    m('gnoll', 'Gnoll', '1/2', 'humanoïde (gnoll)', 'moyenne', 15, '5d8', 9, [14, 12, 11, 6, 10, 7], { ca_texte: 'armure de peau, bouclier', sens: 'vision dans le noir 18 m', langues: 'gnoll', actions: [a('Morsure', 4, '1d4+2', 'perforant'), a('Lance', 4, '1d6+2', 'perforant'), a('Arc long', 3, '1d8+1', 'perforant', { distance: true })], traits: [{ nom: 'Rage sanguinaire', description: 'Quand il tue, il se rapproche et mord en action bonus.' }], description: 'Un humanoïde à tête de hyène, affamé et cruel.' }),
    m('ombre', 'Ombre', '1/2', 'mort-vivant', 'moyenne', 12, '3d8+3', 12, [6, 14, 13, 6, 10, 8], { competences: { discretion: 4 }, vulnerabilites_degats: ['radiant'], resistances_degats: ['acide', 'froid', 'feu', 'foudre', 'tonnerre', 'contondant', 'perforant', 'tranchant'], immunites_degats: ['necrotique', 'poison'], immunites_etats: ['epuisement', 'effraye', 'agrippe', 'paralyse', 'petrifie', 'a_terre', 'entrave', 'empoisonne'], sens: 'vision dans le noir 18 m', actions: [a('Contact affaiblissant', 4, '2d6+2', 'necrotique')], traits: [{ nom: 'Furtivité des ombres', description: 'Se cache en action bonus dans la pénombre.' }], description: 'Une silhouette noire qui aspire la force des vivants.' }),
    m('worg', 'Worg', '1/2', 'créature monstrueuse', 'grande', 13, '4d10+4', 15, [16, 13, 13, 7, 11, 8], { competences: { perception: 4 }, sens: 'vision dans le noir 18 m', langues: 'gobelin, worg', actions: [a('Morsure', 5, '2d6+3', 'perforant', { etat: 'a_terre', etat_sauvegarde: { carac: 'for', dd: 13 }, tours: 1 })], description: 'Un loup géant et malveillant, monture des gobelins.' }),
    m('malfrat', 'Malfrat', '1/2', 'humanoïde', 'moyenne', 11, '5d8+10', 9, [15, 11, 14, 10, 10, 11], { competences: { intimidation: 2 }, langues: 'commun', multiattaque: 2, actions: [a('Masse d\'armes', 4, '1d6+2', 'contondant'), a('Arbalète lourde', 2, '1d10', 'perforant', { distance: true, poids: 3 })], traits: [{ nom: 'Tactique de meute', description: 'Avantage contre une cible qui a un de ses alliés au contact.' }], or: '3d6', description: 'Un homme de main payé pour casser des os.' }),
    m('eclaireur', 'Éclaireur', '1/2', 'humanoïde', 'moyenne', 13, '3d8', 9, [11, 14, 12, 11, 13, 11], { competences: { nature: 4, perception: 5, discretion: 6, survie: 5 }, langues: 'commun', multiattaque: 2, actions: [a('Épée courte', 4, '1d6+2', 'perforant'), a('Arc long', 4, '1d8+2', 'perforant', { distance: true })], description: 'Un pisteur et un chasseur des terres sauvages.' }),
    m('araignee-geante', 'Araignée géante', '1', 'bête', 'grande', 14, '4d10+4', 9, [14, 16, 12, 2, 11, 4], { competences: { discretion: 7 }, sens: 'vision aveugle 3 m, vision dans le noir 18 m', actions: [a('Morsure', 5, '1d8+3', 'perforant', { etat: 'empoisonne', etat_sauvegarde: { carac: 'con', dd: 11 }, tours: 3, poids: 20 }), s('Toile', 'dex', 12, '', '', { etat: 'entrave', repete: true, recharge: '5-6', moitie: false, couleur: '#e8e8e8' })], traits: [{ nom: 'Pattes d\'araignée', description: 'Escalade les murs et marche au plafond.' }], description: 'Une araignée grosse comme un cheval, qui tisse des toiles collantes.' }),
    m('gobelours', 'Gobelours', '1', 'humanoïde (gobelinoïde)', 'moyenne', 16, '5d8+5', 9, [15, 14, 13, 8, 11, 9], { ca_texte: 'armure de peau, bouclier', competences: { discretion: 6, survie: 2 }, sens: 'vision dans le noir 18 m', langues: 'commun, gobelin', actions: [a('Morgenstern', 4, '2d8+2', 'perforant'), a('Javeline', 4, '1d6+2', 'perforant', { distance: true })], traits: [{ nom: 'Brute', description: 'Un dé de dégâts de plus au corps à corps (compté).' }, { nom: 'Attaque surprise', description: '+2d6 dégâts contre une créature surprise.' }], or: '2d10', description: 'Un grand gobelinoïde velu, étonnamment silencieux.' }),
    m('goule', 'Goule', '1', 'mort-vivant', 'moyenne', 12, '5d8', 9, [13, 15, 10, 7, 10, 6], { immunites_degats: ['poison'], immunites_etats: ['charme', 'epuisement', 'empoisonne'], sens: 'vision dans le noir 18 m', langues: 'commun', actions: [a('Morsure', 2, '2d6+2', 'perforant'), a('Griffes', 4, '2d4+2', 'tranchant', { etat: 'paralyse', etat_sauvegarde: { carac: 'con', dd: 10 }, tours: 10 })], description: 'Un mort affamé de chair, dont les griffes paralysent.' }),
    m('loup-sanguinaire', 'Loup sanguinaire', '1', 'bête', 'grande', 14, '5d10+10', 15, [17, 15, 15, 3, 12, 7], { competences: { perception: 3, discretion: 4 }, actions: [a('Morsure', 5, '2d6+3', 'perforant', { etat: 'a_terre', etat_sauvegarde: { carac: 'for', dd: 13 }, tours: 1 })], traits: [{ nom: 'Tactique de meute', description: 'Avantage contre une cible qui a un de ses alliés au contact.' }], description: 'Un loup énorme, chef de meute des forêts profondes.' }),
    m('ours-brun', 'Ours brun', '1', 'bête', 'grande', 11, '4d10+12', 12, [19, 10, 16, 2, 13, 7], { competences: { perception: 3 }, multiattaque: 2, actions: [a('Morsure', 6, '1d8+4', 'perforant'), a('Griffes', 6, '2d6+4', 'tranchant')], description: 'Fort et protecteur, il ne recule devant rien.' }),
    m('harpie', 'Harpie', '1', 'créature monstrueuse', 'moyenne', 11, '7d8+7', 6, [12, 13, 12, 7, 10, 13], { langues: 'commun', multiattaque: 2, actions: [a('Griffes', 3, '2d4+1', 'tranchant'), a('Gourdin', 3, '1d4+1', 'contondant'), s('Chant envoûtant', 'sag', 11, '', '', { etat: 'charme', zone: true, repete: true, moitie: false, poids: 4, couleur: '#ffb3e6' })], description: 'Mi-femme mi-vautour, elle attire les voyageurs par son chant.' }),
    m('lion', 'Lion', '1', 'bête', 'grande', 12, '4d10+4', 15, [17, 15, 13, 3, 12, 8], { competences: { perception: 3, discretion: 6 }, multiattaque: 2, actions: [a('Morsure', 5, '1d8+3', 'perforant'), a('Griffes', 5, '1d6+3', 'tranchant')], traits: [{ nom: 'Bond', description: 'Peut renverser sa proie en bondissant.' }], description: 'Le roi des savanes, chasseur patient.' }),
    m('spectre', 'Spectre', '1', 'mort-vivant', 'moyenne', 12, '5d8', 0, [1, 14, 11, 10, 10, 11], { resistances_degats: ['acide', 'froid', 'feu', 'foudre', 'tonnerre', 'contondant', 'perforant', 'tranchant'], immunites_degats: ['necrotique', 'poison'], immunites_etats: ['charme', 'epuisement', 'agrippe', 'paralyse', 'petrifie', 'a_terre', 'entrave', 'inconscient'], sens: 'vision dans le noir 18 m', actions: [a('Absorption de vie', 4, '3d6', 'necrotique')], traits: [{ nom: 'Mouvement incorporel', description: 'Traverse les murs et les créatures.' }], description: 'L\'âme glacée d\'un mort qui hait les vivants.' }),
    m('chef-gobelin', 'Chef gobelin', '1', 'humanoïde (gobelinoïde)', 'petite', 17, '6d6', 9, [10, 14, 10, 10, 8, 10], { ca_texte: 'chemise de mailles, bouclier', competences: { discretion: 6 }, sens: 'vision dans le noir 18 m', langues: 'commun, gobelin', multiattaque: 2, actions: [a('Cimeterre', 4, '1d6+2', 'tranchant'), a('Javeline', 2, '1d6', 'perforant', { distance: true })], or: '3d10', butin: [{ objet: 'potion-de-soins', chance: 50 }], description: 'Le plus fort (et le plus méchant) de la bande.' }),
    m('ogre', 'Ogre', '2', 'géant', 'grande', 11, '7d10+21', 12, [19, 8, 16, 5, 7, 7], { ca_texte: 'armure de peau', sens: 'vision dans le noir 18 m', langues: 'commun, géant', actions: [a('Massue', 6, '2d8+4', 'contondant'), a('Javeline', 6, '2d6+4', 'perforant', { distance: true, poids: 3 })], or: '4d10', description: 'Un géant stupide et vorace, plus fort qu\'un bœuf.' }),
    m('goule-blafarde', 'Goule blafarde', '2', 'mort-vivant', 'moyenne', 13, '8d8', 9, [16, 17, 10, 11, 10, 8], { resistances_degats: ['necrotique'], immunites_degats: ['poison'], immunites_etats: ['charme', 'epuisement', 'empoisonne'], sens: 'vision dans le noir 18 m', langues: 'commun', actions: [a('Morsure', 3, '2d8+3', 'perforant'), a('Griffes', 5, '2d6+3', 'tranchant', { etat: 'paralyse', etat_sauvegarde: { carac: 'con', dd: 10 }, tours: 10 })], traits: [{ nom: 'Puanteur', description: 'Sauvegarde de Constitution DD 10 à son contact ou empoisonné.' }], description: 'Une goule plus forte, qui dégage une odeur de charogne.' }),
    m('pretre', 'Prêtre', '2', 'humanoïde', 'moyenne', 13, '5d8+5', 7.5, [10, 10, 12, 13, 16, 13], { ca_texte: 'chemise de mailles', competences: { medecine: 7, persuasion: 3, religion: 4 }, langues: 'deux langues', actions: [a('Masse d\'armes', 2, '1d6', 'contondant'), s('Esprits gardiens', 'sag', 13, '3d8', 'radiant', { zone: true, recharge: '5-6', couleur: '#fff3b0' }), s('Flamme sacrée', 'dex', 13, '2d8', 'radiant', { moitie: false, couleur: '#fff3b0' })], or: '2d10', butin: [{ objet: 'potion-de-soins', chance: 30 }], description: 'Le gardien de la foi d\'une communauté.' }),
    m('chef-bandit', 'Chef bandit', '2', 'humanoïde', 'moyenne', 15, '10d8+20', 9, [15, 16, 14, 14, 11, 14], { ca_texte: 'armure de cuir clouté', sauvegardes: { for: 4, dex: 5, sag: 2 }, competences: { athletisme: 4, tromperie: 4 }, langues: 'deux langues', multiattaque: 3, actions: [a('Cimeterre', 5, '1d6+3', 'tranchant'), a('Dague', 5, '1d4+3', 'perforant')], or: '6d10', butin: [{ objet: 'potion-de-soins', chance: 40 }, { objet: 'pierre-precieuse', chance: 25 }], description: 'Le chef charismatique d\'une bande de brigands.' }),
    m('feu-follet', 'Feu follet', '2', 'mort-vivant', 'tres_petite', 19, '9d4', 0, [1, 28, 10, 13, 14, 11], { immunites_degats: ['foudre', 'poison'], resistances_degats: ['acide', 'froid', 'feu', 'necrotique', 'tonnerre', 'contondant', 'perforant', 'tranchant'], immunites_etats: ['epuisement', 'agrippe', 'paralyse', 'empoisonne', 'a_terre', 'entrave', 'inconscient'], actions: [a('Choc', 4, '2d8', 'foudre')], traits: [{ nom: 'Invisibilité', description: 'Devient invisible à volonté.' }], description: 'Une petite lumière qui attire les voyageurs dans les marais.' }),
    m('cube-gelatineux', 'Cube gélatineux', '2', 'vase', 'tres_grande', 6, '8d10+40', 4.5, [14, 3, 20, 1, 6, 1], { immunites_etats: ['aveugle', 'charme', 'assourdi', 'epuisement', 'effraye', 'a_terre'], sens: 'vision aveugle 18 m', actions: [a('Pseudopode', 4, '3d6', 'acide'), s('Engloutissement', 'dex', 12, '3d6', 'acide', { poids: 5 })], traits: [{ nom: 'Transparent', description: 'Presque invisible quand il ne bouge pas.' }], or: '3d10', description: 'Un bloc de gelée qui nettoie les couloirs des donjons… de tout.' }),
    m('ours-hibou', 'Ours-hibou', '3', 'créature monstrueuse', 'grande', 13, '7d10+21', 12, [20, 12, 17, 3, 12, 7], { competences: { perception: 3 }, sens: 'vision dans le noir 18 m', multiattaque: 2, actions: [a('Bec', 7, '1d10+5', 'perforant'), a('Griffes', 7, '2d8+5', 'tranchant')], description: 'Un fauve à tête de hibou, féroce et territorial.' }),
    m('loup-garou', 'Loup-garou', '3', 'humanoïde (métamorphe)', 'moyenne', 12, '9d8+18', 12, [15, 13, 14, 10, 11, 10], { resistances_degats: ['contondant', 'perforant', 'tranchant'], competences: { perception: 4, discretion: 3 }, langues: 'commun', multiattaque: 2, actions: [a('Morsure', 4, '1d8+2', 'perforant'), a('Griffes', 4, '2d4+2', 'tranchant')], traits: [{ nom: 'Immunité (simplifiée)', description: 'Dans le SRD, immunisé aux armes non magiques ni argentées ; ici, il y résiste.' }], or: '2d10', description: 'Un humain maudit qui devient loup les nuits de pleine lune.' }),
    m('momie', 'Momie', '3', 'mort-vivant', 'moyenne', 11, '9d8+18', 6, [16, 8, 15, 6, 10, 12], { sauvegardes: { sag: 2 }, vulnerabilites_degats: ['feu'], resistances_degats: ['contondant', 'perforant', 'tranchant'], immunites_degats: ['necrotique', 'poison'], immunites_etats: ['charme', 'epuisement', 'effraye', 'paralyse', 'empoisonne'], sens: 'vision dans le noir 18 m', multiattaque: 2, actions: [a('Poing pourrissant', 5, '2d6+3', 'contondant'), s('Regard terrifiant', 'sag', 11, '', '', { etat: 'effraye', tours: 2, moitie: false, poids: 5 })], or: '4d10', butin: [{ objet: 'pierre-precieuse', chance: 50 }], description: 'Un mort embaumé qui protège un tombeau ancien.' }),
    m('veteran', 'Vétéran', '3', 'humanoïde', 'moyenne', 17, '9d8+18', 9, [16, 13, 14, 10, 11, 10], { ca_texte: 'broigne', competences: { athletisme: 5, perception: 2 }, langues: 'commun', multiattaque: 2, actions: [a('Épée longue', 5, '1d8+3', 'tranchant'), a('Arbalète lourde', 3, '1d10+1', 'perforant', { distance: true, poids: 3 })], or: '3d10', description: 'Un soldat endurci qui a survécu à cent batailles.' }),
    m('necrophage', 'Nécrophage', '3', 'mort-vivant', 'moyenne', 14, '6d8+18', 9, [15, 14, 16, 10, 13, 15], { ca_texte: 'cuir clouté', competences: { perception: 3, discretion: 4 }, resistances_degats: ['necrotique', 'contondant', 'perforant', 'tranchant'], immunites_degats: ['poison'], immunites_etats: ['epuisement', 'empoisonne'], sens: 'vision dans le noir 18 m', langues: 'commun', multiattaque: 2, actions: [a('Épée longue', 4, '1d8+2', 'tranchant'), a('Absorption de vie', 4, '1d6+2', 'necrotique')], or: '4d10', description: 'Un mort intelligent, guerrier des tertres.' }),
    m('manticore', 'Manticore', '3', 'créature monstrueuse', 'grande', 14, '8d10+24', 9, [17, 16, 17, 7, 12, 8], { sens: 'vision dans le noir 18 m', langues: 'commun', multiattaque: 3, actions: [a('Morsure', 5, '1d8+3', 'perforant'), a('Griffes', 5, '1d6+3', 'tranchant'), a('Pointes de queue', 5, '1d8+3', 'perforant', { distance: true })], description: 'Lion ailé à tête humaine, qui lance les pointes de sa queue.' }),
    m('minotaure', 'Minotaure', '3', 'créature monstrueuse', 'grande', 14, '9d10+27', 12, [18, 11, 16, 6, 16, 9], { competences: { perception: 7 }, sens: 'vision dans le noir 18 m', langues: 'abyssal', actions: [a('Hache à deux mains', 6, '2d12+4', 'tranchant'), a('Cornes', 6, '2d8+4', 'perforant')], traits: [{ nom: 'Charge', description: '+2d8 dégâts s\'il charge sur 3 m.' }, { nom: 'Mémoire du labyrinthe', description: 'Ne se perd jamais.' }], description: 'Un taureau humanoïde qui hante les labyrinthes.' }),
    m('ettin', 'Ettin', '4', 'géant', 'grande', 12, '10d10+30', 12, [21, 8, 17, 6, 10, 8], { ca_texte: 'armure naturelle', competences: { perception: 4 }, sens: 'vision dans le noir 18 m', langues: 'géant, orc', multiattaque: 2, actions: [a('Hache d\'armes', 7, '2d8+5', 'tranchant'), a('Morgenstern', 7, '2d8+5', 'perforant')], traits: [{ nom: 'Deux têtes', description: 'Avantage en Perception et contre l\'aveuglement, le charme, la peur et l\'étourdissement.' }], or: '5d10', description: 'Un géant à deux têtes qui se disputent sans cesse.' }),
    m('dragonnet-rouge', 'Dragonnet rouge', '4', 'dragon', 'moyenne', 17, '10d8+30', 9, [19, 10, 17, 12, 11, 15], { boss: true, sauvegardes: { dex: 2, con: 5, sag: 2, cha: 4 }, competences: { perception: 4, discretion: 2 }, immunites_degats: ['feu'], sens: 'vision aveugle 3 m, vision dans le noir 18 m', langues: 'draconique', actions: [a('Morsure', 6, '1d10+4', 'perforant'), s('Souffle de feu', 'dex', 13, '7d6', 'feu', { zone: true, recharge: '5-6', couleur: '#ff7a3c' })], or: '10d10', butin: [{ objet: 'pierre-precieuse', chance: 100, nombre: 2 }, { objet: 'potion-de-soins-superieurs', chance: 50 }], description: 'Un jeune dragon rouge, déjà arrogant et cupide.' }),
    m('troll', 'Troll', '5', 'géant', 'grande', 15, '8d10+40', 9, [18, 13, 20, 7, 9, 7], { competences: { perception: 2 }, sens: 'vision dans le noir 18 m', langues: 'géant', multiattaque: 3, actions: [a('Morsure', 7, '1d6+4', 'perforant'), a('Griffes', 7, '2d6+4', 'tranchant')], traits: [{ nom: 'Régénération', description: 'Regagne 10 PV au début de son tour, sauf s\'il a subi des dégâts d\'acide ou de feu (le MJ s\'en charge pour l\'instant).' }], or: '5d10', description: 'Un géant vert et maigre qui repousse quand on le coupe ; seuls le feu et l\'acide l\'arrêtent.' }),
    m('elementaire-de-feu', 'Élémentaire du feu', '5', 'élémentaire', 'grande', 13, '12d10+36', 15, [10, 17, 16, 6, 10, 7], { resistances_degats: ['contondant', 'perforant', 'tranchant'], immunites_degats: ['feu', 'poison'], immunites_etats: ['epuisement', 'agrippe', 'paralyse', 'petrifie', 'empoisonne', 'a_terre', 'entrave', 'inconscient'], sens: 'vision dans le noir 18 m', langues: 'igné', multiattaque: 2, actions: [a('Contact', 6, '2d6+3', 'feu')], traits: [{ nom: 'Forme de feu', description: 'Ce qui le touche prend feu.' }, { nom: 'Vulnérable à l\'eau', description: '1 dégât de froid par litre d\'eau versé sur lui.' }], description: 'Une flamme vivante qui brûle tout sur son passage.' }),
  ];

  // --- Des rencontres toutes prêtes (groupes de monstres) ---
  const GROUPES = [
    ['embuscade-gobeline', 'Embuscade gobeline', [['gobelin', 3]]],
    ['bande-gobeline', 'Bande gobeline et son chef', [['chef-gobelin', 1], ['gobelin', 3]]],
    ['meute-de-loups', 'Meute de loups', [['loup', 3]]],
    ['brigands', 'Brigands', [['bandit', 3], ['malfrat', 1]]],
    ['morts-de-la-crypte', 'Morts de la crypte', [['squelette', 2], ['zombi', 2]]],
    ['nid-d-araignees', 'Nid d\'araignées', [['araignee-geante', 2]]],
    ['ogre-et-gobelins', 'Ogre et gobelins', [['ogre', 1], ['gobelin', 2]]],
    ['cultistes', 'Cultistes et leur prêtre', [['pretre', 1], ['cultiste', 4]]],
    ['dragonnet', 'Le dragonnet rouge', [['dragonnet-rouge', 1]], false],
  ].map(([id, nom, l, fuite = true]) => ({ id, nom, monstres: l.map(([monstre, nombre]) => ({ monstre, nombre })), fuite }));

  // --- Des personnages pré-tirés (niveau 1) : le joueur peut en prendre un à la création ---
  const PRETIRES = [
    { id: 'thorgrim', nom: 'Thorgrim', couleur: '#b5651d', description: 'Un guerrier nain bourru au grand cœur.', jdr: { origine: 'nain', classe: 'guerrier', niveau: 1, carac: { for: 15, dex: 10, con: 14, int: 8, sag: 13, cha: 12 }, competences: ['athletisme', 'perception'], equipement: { arme: 'hache-d-armes', seconde: 'bouclier', armure: 'cotte-de-mailles' } } },
    { id: 'elaria', nom: 'Elaria', couleur: '#4a90d9', description: 'Une magicienne haute-elfe, curieuse de tout.', jdr: { origine: 'elfe', classe: 'magicien', niveau: 1, carac: { for: 8, dex: 14, con: 13, int: 15, sag: 12, cha: 10 }, competences: ['arcanes', 'histoire'], sorts: ['trait-de-feu', 'main-de-mage', 'lumiere', 'projectile-magique', 'armure-de-mage', 'sommeil', 'bouclier'], equipement: { arme: 'baton' } } },
    { id: 'pip', nom: 'Pip', couleur: '#5a5f6b', description: 'Un roublard halfelin, plus rapide que son ombre.', jdr: { origine: 'halfelin', classe: 'roublard', niveau: 1, carac: { for: 8, dex: 15, con: 14, int: 12, sag: 10, cha: 13 }, competences: ['discretion', 'escamotage', 'perception', 'tromperie'], expertises: ['discretion', 'escamotage'], equipement: { arme: 'rapiere', armure: 'armure-de-cuir' } } },
    { id: 'soeur-maelle', nom: 'Sœur Maëlle', couleur: '#f0c75e', description: 'Une clerc humaine qui soigne autant qu\'elle protège.', jdr: { origine: 'humain', classe: 'clerc', niveau: 1, carac: { for: 14, dex: 8, con: 13, int: 10, sag: 15, cha: 12 }, competences: ['medecine', 'religion'], sorts: ['flamme-sacree', 'assistance', 'thaumaturgie', 'soins', 'benediction', 'bouclier-de-la-foi', 'rayon-tracant'], equipement: { arme: 'masse-d-armes', seconde: 'bouclier', armure: 'armure-d-ecailles' } } },
  ];

  // --- Tout déplier au format des fichiers du jeu ---
  function donnees() {
    const objets = [
      ...ARMES.map(([id, nom, prix, categorie, degats, type, proprietes, portee, polyvalente]) => ({
        id, nom, prix, categorie: 'arme', description: '', effet: { type: 'aucun' },
        jdr: { arme: { categorie, degats, type, proprietes, ...(portee ? { distance: true, portee } : {}), ...(polyvalente ? { polyvalente } : {}) } },
      })),
      ...ARMURES.map(([id, nom, prix, type, ca, force, discretion]) => ({
        id, nom, prix, categorie: type === 'bouclier' ? 'bouclier' : 'armure', description: '', effet: { type: 'aucun' },
        jdr: { armure: { type, ca, ...(force ? { force } : {}), ...(discretion ? { discretion: true } : {}) } },
      })),
      ...AUTRES.map(([id, nom, prix, categorie, description, effet]) => ({ id, nom, prix, categorie, description, effet })),
    ];
    const classes_jdr = CLASSES.map((k) => {
      const niveaux = [];
      for (const [niveau, nom, description, effet, valeur] of k.niveaux) {
        let n = niveaux.find((x) => x.niveau === niveau);
        if (!n) niveaux.push(n = { niveau, aptitudes: [] });
        n.aptitudes.push({ nom, description, ...(effet ? { effet } : {}), ...(valeur !== undefined ? { valeur } : {}) });
      }
      niveaux.sort((x, y) => x.niveau - y.niveau);
      return { ...k, equipement_depart: k.equipement_depart.map(([objet, nombre = 1]) => ({ objet, nombre })), niveaux };
    });
    const sorts = SORTS.map(([id, nom, niveau, ecole, classes, temps, portee, duree, concentration, composantes, description, effet, rituel]) => ({
      id, nom, niveau, ecole, classes: [...classes].map((x) => CLASSES_SORT[x]), temps: TEMPS[temps] || temps, portee, duree, concentration, composantes, description,
      ...(rituel ? { rituel: true } : {}), effet: effet || { type: 'aucun' },
    }));
    const moyenne = (t) => { const r = /^(\d+)d(\d+)([+-]\d+)?$/.exec(t); return r ? Math.floor(Number(r[1]) * (Number(r[2]) + 1) / 2 + Number(r[3] || 0)) : Number(t) || 1; };
    const monstres_jdr = MONSTRES.map((x, i) => ({ numero: i + 1, ...x, pv: moyenne(x.pv_des) }));
    const personnages = PRETIRES.map((p) => ({ description: '', heros: false, tuile: -1, portraits: [], sprite: null, tenues: [], ...p }));
    return {
      caracteristiques: structuredClone(CARACTERISTIQUES), competences: structuredClone(COMPETENCES), etats: structuredClone(ETATS),
      origines: structuredClone(ORIGINES), classes_jdr, sorts, monstres_jdr, objets, groupes: structuredClone(GROUPES), personnages,
    };
  }

  return { ATTRIBUTION, CARACTERISTIQUES, COMPETENCES, ETATS, donnees };
})();

if (typeof module !== 'undefined') module.exports = ModeleDnd5e;
