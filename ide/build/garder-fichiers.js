// Utilisé seulement par « npm run dist » (electron-builder), pas par Rune lui-même.
// Par défaut, electron-builder retire les fichiers .d.ts des librairies pour alléger l'installeur.
// Mais l'intelligence TypeScript/Vue en a besoin : ce sont eux qui décrivent les types de
// JavaScript (lib.dom.d.ts…) et de Vue (ref, defineProps…). On les garde donc tous.
module.exports = (file) => file.endsWith('.d.ts');
