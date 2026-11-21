# Vérificateur de code et essais rapides

Ils tournent tout seuls sur GitHub à chaque pull request (« Vérificateur de code » dans l'onglet
**Checks**), en moins d'une minute. Les gros essais de Tafl et Saga (robot qui joue) sont à part,
dans `tests/`.

## Le vérificateur (ESLint)

Réglé dans `eslint.config.mjs`, à la racine du dépôt. Il ne regarde pas le style, seulement de vraies
erreurs : une variable ou une fonction jamais utilisée, une clé en double dans un objet (la seconde
écrase la première sans rien dire), du code jamais atteint, `x === NaN`… Il ignore les copies de
`commun/` faites par `npm install`, `foliate-js` et les fichiers `vendor/`.

## Les essais rapides (`essais/*.test.js`)

Avec `node --test`, sans fenêtre et presque sans dépendance. `charger.js` charge des scripts de
l'interface d'un outil dans un bac à sable Node, comme le fait la page.

- `reikna-formules.test.js` : formules françaises ↔ moteur de calcul, lecture de ce qu'on tape dans
  une cellule (12,5 ; 15 % ; 24/10/2026…), dates ↔ numéros de série d'Excel.
- `saga-jdr.test.js` : les dés du pack JDR (même graine = mêmes jets), formules `2d6+3`, avantage et
  désavantage, coups critiques, modificateurs et bonus de maîtrise, journal limité à 200 jets.
- `rune-bifrost.test.js` : panneau Bifrost de Rune. Zones `data-bf` d'une page (type, ligne, listes,
  formulaires), erreurs signalées (noms en double, liste sans élément, formulaire sans nom…), balise sous
  le curseur et attribut ajouté au bon endroit.
- `edda-formats.test.js` : un document enregistré puis rouvert en Word, OpenDocument, RTF, Markdown
  et HTML garde son texte, gras, italique, titres, listes et tableau (dans Chromium, car les formats
  ont besoin d'une vraie page).

## Les lancer sur ton PC

```
cd verif
npm install
npx eslint ..          (le vérificateur)
cd ..\texte && npm install && cd ..\verif
npx playwright install chromium
node --test            (les essais rapides)
```

Un nouvel essai : un fichier `essais/<outil>-<sujet>.test.js`, trouvé tout seul par `node --test`.
