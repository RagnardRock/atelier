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
