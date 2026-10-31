---
name: objets-tenus
description: Saga 1.3 + Tafl 1.1 — les objets tenus agissent en combat, pastilles d'état, arène au détail, capacités œufs (PR #73)
metadata:
  type: project
---

Saga 1.3 + Tafl 1.1 (PR #73, 2026-10-31, avec le premier commit Saga 1.2) : le retour du test multijoueur de Ragna.

- Objets tenus : un objet de Tafl peut avoir un champ `tenu` à côté de `effet` (le sac). Types : `degats` (valeur, categorie, recul), `type` (element, valeur), `stat` (stat, valeur, verrou = objet Choix), `soin_tour`, `drain`, `baie` (valeur ou pv, seuil), `soin_statut`, `survie`. Les objets officiels connus sont reconnus par leur nom PokeAPI dans `TENUS_OFFICIELS` / `TENUS_TYPE` de `moteur/renderer/moteur/regles/pokemon/combat.js`.
- Pastilles d'état en combat : `ui.etats(cote, liste)` sur l'écran de combat, facultatif dans le contrat des packs. **Piège : tout appel ui mirroré vers l'invité doit être ajouté à `AUTORISES` dans `moteur/renderer/moteur/reseau/duel.js`**, sinon il est silencieusement jeté.
- Capacités œufs : champ `oeufs` d'une espèce, importé de PokeAPI (méthode 2).
- Pas encore fait : vent arrière, provoc et les effets de terrain n'existent pas dans le moteur. Dit à Ragna, à faire dans une PR à part.
- Essais : harnais Playwright deux navigateurs dans le bac à sable ([multijoueur](multijoueur.md)).
