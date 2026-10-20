// La liste des outils qu'Atelier sait lancer, installer et mettre à jour.
// Pour ajouter un futur outil : une ligne de plus ici, et son icône dans renderer/outils/.
//
// - prefixe : le début des étiquettes git de ses versions (rune-v0.11.0 → « rune-v »).
//   C'est ce qui permet de reconnaître ses Releases parmi celles des autres outils du dépôt.
// - exe : le nom du programme une fois installé (package.json › build.win.executableName).
// - nom : aussi le nom affiché dans « Paramètres › Applications » de Windows
//   (package.json › build.nsis.uninstallDisplayName) ; Atelier s'en sert pour le retrouver.
//   L'installeur publié s'appelle toujours « <nom>-Setup-<version>.exe ».
// - ouvreDossier : à partir de quelle version l'outil sait ouvrir un dossier passé en ligne de commande
//   (« Rune.exe D:\Projets\site ») ; c'est ce qu'utilise le widget Projets récents.

module.exports = [
  {
    id: 'rune',
    nom: 'Rune',
    glyphe: 'ᚱ',
    description: 'Mon IDE : code, terminal, Git, aperçu web et Claude',
    prefixe: 'rune-v',
    exe: 'Rune.exe',
    icone: 'rune.svg',
    ouvreDossier: '0.12.0',
  },
  {
    id: 'skald',
    nom: 'Skald',
    glyphe: 'ᛋ',
    description: 'Retouche d\'images et de logos, PSD compris',
    prefixe: 'skald-v',
    exe: 'Skald.exe',
    icone: 'skald.svg',
    ouvreDossier: '0.3.0',
  },
];
