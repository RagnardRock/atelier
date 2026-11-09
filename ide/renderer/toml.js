// Fichiers .toml (Cargo.toml, pyproject.toml, netlify.toml, config de Hugo…) : Monaco ne connaît pas
// ce format. On lui donne ici sa coloration : [sections], clé = valeur, textes, nombres, dates,
// true/false et # commentaires. Ctrl+/ commente la ligne avec #.
// Autres fichiers de réglages (.conf, .cfg, .env) : la coloration .ini de Monaco leur va bien.

function registerConfigLanguages() {
  monaco.languages.register({ id: 'toml', extensions: ['.toml'], filenames: ['Pipfile'], aliases: ['TOML', 'toml'] });
  monaco.languages.setLanguageConfiguration('toml', {
    comments: { lineComment: '#' },
    brackets: [['[', ']'], ['{', '}']],
    autoClosingPairs: [
      { open: '[', close: ']' }, { open: '{', close: '}' },
      { open: '"', close: '"', notIn: ['string'] }, { open: "'", close: "'", notIn: ['string'] },
    ],
    surroundingPairs: [{ open: '[', close: ']' }, { open: '{', close: '}' }, { open: '"', close: '"' }, { open: "'", close: "'" }],
  });
  monaco.languages.setMonarchTokensProvider('toml', {
    tokenizer: {
      root: [
        { include: '@whitespace' },
        // [section] et [[tableau.de.sections]] en début de ligne.
        [/^\s*\[\[[^\]]*\]\]/, 'type'],
        [/^\s*\[[^\]]*\]/, 'type'],
        // Valeurs d'abord : dans « 2.5 » le 2 n'est pas une clé pointée.
        // Dates et heures (1979-05-27T07:32:00Z, 07:32:00).
        [/\d{4}-\d{2}-\d{2}([Tt ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?([Zz]|[+-]\d{2}:\d{2})?)?/, 'number'],
        [/\d{2}:\d{2}:\d{2}(\.\d+)?/, 'number'],
        // Nombres : 0x, 0o, 0b, flottants, inf, nan.
        [/[+-]?0x[0-9A-Fa-f_]+|[+-]?0o[0-7_]+|[+-]?0b[01_]+/, 'number'],
        [/[+-]?(inf|nan)\b/, 'number'],
        [/[+-]?\d[\d_]*(\.[\d_]+)?([eE][+-]?\d+)?/, 'number'],
        [/\b(true|false)\b/, 'keyword'],
        // Clé (nue, "entre guillemets" ou pointée) avant le signe =.
        [/[A-Za-z0-9_-]+(?=\s*(\.|=))/, 'key'],
        [/"[^"]*"(?=\s*(\.|=))/, 'key'],
        [/'[^']*'(?=\s*(\.|=))/, 'key'],
        [/[=.,]/, 'delimiter'],
        [/[[\]{}]/, '@brackets'],
        // Textes : """multiligne""", '''littéral multiligne''', "simple", 'littéral'.
        [/"""/, 'string', '@mlstring'],
        [/'''/, 'string', '@mlliteral'],
        [/"/, 'string', '@string'],
        [/'[^']*'/, 'string'],
      ],
      whitespace: [[/\s+/, 'white'], [/#.*$/, 'comment']],
      string: [[/[^\\"]+/, 'string'], [/\\./, 'string.escape'], [/"/, 'string', '@pop']],
      mlstring: [[/[^\\"]+/, 'string'], [/\\./, 'string.escape'], [/"""/, 'string', '@pop'], [/"/, 'string']],
      mlliteral: [[/[^']+/, 'string'], [/'''/, 'string', '@pop'], [/'/, 'string']],
    },
  });

  // Réglages façon .ini : on ajoute ces extensions au langage ini de Monaco.
  const ini = monaco.languages.getLanguages().find((l) => l.id === 'ini');
  if (ini) monaco.languages.register({ id: 'ini', extensions: ['.conf', '.cfg', '.env'], filenames: ['.env'] });
}
