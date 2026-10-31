// La liste des outils qu'Atelier sait lancer, installer et mettre à jour.
// Pour ajouter un futur outil : une ligne de plus ici, et son icône dans renderer/outils/.
//
// - prefixe : le début des étiquettes git de ses versions (rune-v0.11.0 → « rune-v »).
//   C'est ce qui permet de reconnaître ses Releases parmi celles des autres outils du dépôt.
// - exe : le nom du programme une fois installé (package.json › build.win.executableName).
// - nom : aussi le nom affiché dans « Paramètres › Applications » de Windows
//   (package.json › build.nsis.uninstallDisplayName) ; Atelier s'en sert pour le retrouver.
//   L'installeur publié s'appelle toujours « <nom>-Setup-<version>.exe ».
// - dossier : son dossier dans le dépôt ; Atelier y lit la version en cours de fabrication sur GitHub.
// - ouvreDossier : à partir de quelle version l'outil sait ouvrir un dossier passé en ligne de commande
//   (« Rune.exe D:\Projets\site ») ; c'est ce qu'utilise le widget Projets récents.
// - categorie : le rayon où l'outil est rangé dans la colonne Outils (voir CATEGORIES plus bas).
//   Un outil sans catégorie (ou avec une catégorie inconnue) va dans « Autres ».

const OUTILS = [
  {
    id: 'rune',
    categorie: 'developpement',
    nom: 'Rune',
    glyphe: 'ᚱ',
    description: 'Mon IDE : code, terminal, Git, serveurs SSH, aperçu web en direct et Loki',
    prefixe: 'rune-v',
    exe: 'Rune.exe',
    icone: 'rune.svg',
    dossier: 'ide',
    ouvreDossier: '0.12.0',
  },
  {
    id: 'skald',
    categorie: 'graphisme',
    nom: 'Skald',
    glyphe: 'ᛋ',
    description: 'Retouche d\'images et de logos à la Photoshop : calques, sélections, filtres, PSD compris',
    prefixe: 'skald-v',
    exe: 'Skald.exe',
    icone: 'skald.svg',
    dossier: 'retouche',
    ouvreDossier: '0.3.0',
  },
  {
    id: 'brokk',
    categorie: 'graphisme',
    nom: 'Brokk',
    glyphe: 'ᛒ',
    description: 'Export d\'assets : un PSD ou un logo vers toutes les tailles web (favicon, icônes, WebP, @2x, Open Graph)',
    prefixe: 'brokk-v',
    exe: 'Brokk.exe',
    icone: 'brokk.svg',
    dossier: 'export',
    ouvreDossier: '0.1.0',
  },
  {
    id: 'tafl',
    categorie: 'jeu',
    nom: 'Tafl',
    glyphe: 'ᛏ',
    description: 'L\'éditeur de jeu : tuiles, cartes, événements, scripts et données, avec les règles Pokémon, JRPG ou JDR (D&D 5e) et des modules comme la gestion',
    prefixe: 'tafl-v',
    exe: 'Tafl.exe',
    icone: 'tafl.svg',
    dossier: 'tuiles',
    ouvreDossier: '0.1.0',
  },
  {
    id: 'saga',
    categorie: 'jeu',
    nom: 'Saga',
    glyphe: 'ᛃ',
    description: 'Le moteur qui joue les jeux de Tafl : combats, mode table JDR, gestion de domaine, multijoueur en réseau ou sur Internet, export web et .exe',
    prefixe: 'saga-v',
    exe: 'Saga.exe',
    icone: 'saga.svg',
    dossier: 'moteur',
    ouvreDossier: '0.1.0',
  },
  {
    id: 'mimir',
    nom: 'Mimir', // sans accent : c'est aussi le nom de l'installeur et celui inscrit dans Windows
    glyphe: 'ᛗ',
    description: 'Lecteur de documents : PDF (annoter, signer, remplir), EPUB, BD, Word, images et textes',
    prefixe: 'mimir-v',
    exe: 'Mimir.exe',
    icone: 'mimir.svg',
    dossier: 'lecteur',
    categorie: 'bureautique',
  },
  {
    id: 'kenning',
    nom: 'Kenning',
    glyphe: 'ᚲ',
    description: 'Ma liseuse d\'eBooks : bibliothèque avec couvertures et collections, EPUB, MOBI, AZW3, FB2, surlignages et notes',
    prefixe: 'kenning-v',
    exe: 'Kenning.exe',
    icone: 'kenning.svg',
    dossier: 'liseuse',
    categorie: 'bureautique',
  },
  {
    id: 'reikna',
    categorie: 'bureautique',
    nom: 'Reikna',
    glyphe: 'ᛞ',
    description: 'Mon tableur : xlsx, xls, ods, csv, formules en français, graphiques et mise en forme conditionnelle',
    prefixe: 'reikna-v',
    exe: 'Reikna.exe',
    icone: 'reikna.svg',
    dossier: 'tableur',
    ouvreDossier: '0.1.0',
  },
  {
    id: 'edda',
    nom: 'Edda',
    glyphe: 'ᛖ',
    description: 'Traitement de texte : Word (.docx), LibreOffice (.odt), RTF, Markdown, HTML, texte, avec images, vidéos et sons',
    prefixe: 'edda-v',
    exe: 'Edda.exe',
    icone: 'edda.svg',
    dossier: 'texte',
    ouvreDossier: '0.1.0',
    categorie: 'bureautique',
  },
];

// Les rayons de la colonne Outils, dans l'ordre d'affichage.
const CATEGORIES = [
  { id: 'developpement', nom: 'Développement', icone: 'code' },
  { id: 'graphisme', nom: 'Graphisme', icone: 'symbol-color' },
  { id: 'bureautique', nom: 'Bureautique', icone: 'file-text' },
  { id: 'jeu', nom: 'Jeu', icone: 'game' },
  { id: 'autres', nom: 'Autres', icone: 'extensions' },
];

module.exports = OUTILS;
module.exports.CATEGORIES = CATEGORIES;
