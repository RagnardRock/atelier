// Le vérificateur de code de l'Atelier (ESLint), lancé à chaque pull request (verif/LISEZMOI.md).
// Il ne cherche que de vraies erreurs (variable jamais utilisée, clé en double, code jamais atteint…),
// pas le style : chaque outil garde sa façon d'écrire.
//
// Les fichiers de l'interface (renderer/) sont des scripts classiques qui se partagent leurs objets
// (App, Doc, Moteur…) par la page : ce qui est déclaré tout en haut d'un fichier sert souvent dans
// un autre, donc on ne le vérifie pas (vars: 'local').
const regles = {
  'no-unused-vars': ['error', { vars: 'local', args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }],
  'no-dupe-keys': 'error',
  'no-duplicate-case': 'error',
  'no-dupe-else-if': 'error',
  'no-dupe-class-members': 'error',
  'no-unreachable': 'error',
  'no-const-assign': 'error',
  'no-self-assign': 'error',
  'no-self-compare': 'error',
  'no-unsafe-finally': 'error',
  'no-unsafe-negation': 'error',
  'no-compare-neg-zero': 'error',
  'no-sparse-arrays': 'error',
  'no-func-assign': 'error',
  'no-import-assign': 'error',
  'no-setter-return': 'error',
  'getter-return': 'error',
  'use-isnan': 'error',
  'valid-typeof': 'error',
  'no-debugger': 'error',
};

export default [
  {
    ignores: [
      '**/node_modules/**', '**/dist/**', '**/nsis/**', 'docs/**',
      // Les copies de commun/ faites par npm install (on vérifie l'original).
      '*/commun/**',
      // Le code d'autres projets, gardé tel quel.
      '**/vendor/**', 'liseuse/renderer/foliate/**',
    ],
  },
  { files: ['**/*.js', '**/*.cjs'], languageOptions: { ecmaVersion: 'latest', sourceType: 'commonjs' }, rules: regles },
  { files: ['*/renderer/**/*.js', 'commun/**/*.js'], languageOptions: { sourceType: 'script' } },
  {
    files: ['**/*.mjs', ...['app', 'bibliotheque', 'claude-actions', 'etat', 'lecture', 'livre'].map((f) => `liseuse/renderer/${f}.js`)],
    languageOptions: { sourceType: 'module' },
  },
];
