# Le mode d'emploi de Tafl et Saga

`mode-emploi-tafl-saga.pdf` : le guide illustré de Tafl et Saga (Tafl › espace Jeu › **Mode d'emploi** l'ouvre ;
installé, Tafl télécharge la dernière version de ce fichier sur `main`).

| Fichier | Rôle |
|---|---|
| `manuel.html` | Le texte, une page A4 par `<section class="page">`. Le sommaire et les numéros se calculent seuls (`manuel.js`). |
| `manuel.css` | La mise en page (sombre, en verre, vert Tafl, ambre Saga). |
| `captures.js` | Refait les captures (`captures/`, non suivies par git) : Tafl et Saga dans Chromium, modèles de jeu en tuiles de 32 px, plus les captures des essais (`tests/essais`, lancés avec `CAPTURES`). |
| `generer.js` | Fabrique le PDF ; refait d'abord les captures si `captures/` est vide (ou avec `--captures`). Signale les pages qui débordent. |

## Le mettre à jour (à chaque nouveauté visible de Tafl ou Saga)

```
cd moteur && npm ci --ignore-scripts && node ../commun/copier.js && cd ..
cd tuiles && npm ci --ignore-scripts && node ../commun/copier.js && cd ..
cd tests && npm install && cd ..
node docs/manuel/generer.js --captures
```

1. Compléter la page concernée de `manuel.html` (ou en ajouter une : `data-titre` pour le pied, `data-sommaire` sur son titre pour le sommaire).
2. Une nouvelle capture : une scène dans `captures.js`, ou une capture d'essai (`CAPTURES`) dont le fichier est listé dans `ESSAIS`.
3. `node docs/manuel/generer.js --captures`, regarder le PDF, corriger les pages qui débordent.
