// Palettes proposées à la création d'un jeu de tuiles (et dans le panneau Palette).
// Une palette = un id, un nom affiché et une liste de couleurs. En ajouter une : une ligne de plus.
// La palette d'un jeu de tuiles est ensuite la sienne : tu peux y ajouter ou retirer des couleurs.

const PALETTES = [
  {
    id: 'nature',
    nom: 'Nature (style GBA)',
    // Herbes, chemins, eau, bois, roche et toits : de quoi dessiner une route et un village.
    couleurs: [
      '#183018', '#285828', '#38a048', '#70c858', '#a8e070', '#e0f8a0',
      '#584028', '#906838', '#c8a060', '#e8d098', '#f8f0c8', '#ffffff',
      '#203868', '#3060b0', '#58a0f0', '#98d0f8', '#d0f0ff', '#101010',
      '#484850', '#787880', '#a8a8b0', '#d0d0d8', '#a83030', '#e05848',
      '#f89060', '#f8c838', '#8858b8', '#c890e0',
    ],
  },
  {
    id: 'brume',
    nom: 'Brume (16 bits sombre, en rampes)',
    // Tafl 0.17 : d'après la référence de Ragna (pluie, verts éteints, ardoises sombres, bois).
    // Rangée par rampes, de la plus sombre à la plus claire : les ombres tirent vers le violet,
    // les lumières vers le jaune. Claude s'en sert pour ombrer sans changer de famille de couleurs.
    couleurs: [
      '#120c1e', '#231a2e', '#3a2c40', // ombres profondes et contours
      '#2c3f3a', '#3f5a4f', '#567563', '#739281', '#9bb5a0', // herbe
      '#1d2a2e', '#2a3d40', '#3d5655', '#587470', // feuillage des sapins
      '#2e1f26', '#4a3238', '#6b4a47', '#8e6a5a', '#b08c72', // bois
      '#24222f', '#383747', '#524f62', '#706c7e', '#9590a0', // pierre et ardoise
      '#3b3036', '#57484a', '#776560', '#998676', // terre et chemins
      '#172338', '#23395a', '#345a7e', '#4f86a8', '#8bc0d4', // eau
      '#d8d0c0', '#f2ead6', '#c8503e', '#e6b45a', '#7fb3e0', // lumières : pierre claire, blanc chaud, rouge, lampe, vitre
    ],
  },
  {
    id: 'gameboy',
    nom: 'Game Boy (4 verts)',
    couleurs: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'],
  },
  {
    id: 'gbc',
    nom: 'Game Boy Color (douce)',
    couleurs: ['#081820', '#346856', '#88c070', '#e0f8d0', '#7c3f58', '#eb6b6f', '#f9a875', '#fff6d3'],
  },
  {
    id: 'pico8',
    nom: 'PICO-8 (16 couleurs)',
    couleurs: ['#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8', '#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8', '#ffccaa'],
  },
  {
    id: 'sweetie16',
    nom: 'Sweetie 16',
    couleurs: ['#1a1c2c', '#5d275d', '#b13e53', '#ef7d57', '#ffcd75', '#a7f070', '#38b764', '#257179', '#29366f', '#3b5dc9', '#41a6f6', '#73eff7', '#f4f4f4', '#94b0c2', '#566c86', '#333c57'],
  },
  {
    id: 'libre',
    nom: 'Libre (vide, tu ajoutes tes couleurs)',
    couleurs: ['#000000', '#ffffff'],
  },
];

const paletteById = (id) => PALETTES.find((p) => p.id === id) || PALETTES[0];
