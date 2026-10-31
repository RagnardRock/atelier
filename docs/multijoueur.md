---
name: multijoueur
description: Le multijoueur local de Saga/Tafl (roadmap étape 4) : architecture, protocole, et où ça en est.
metadata:
  type: project
---

Multijoueur local (étape 4 de la roadmap), PR #69 squash-mergée cb81566 le 2026-10-25 avec le oui de Ragna : Saga 1.0.0 + Tafl 1.0.0.

Décision de Ragna (2026-10-25) : le multi n'est **pas réservé au JDR** → base réseau commune à tous les packs, utilisée par le mode table (JDR) ET par un monde partagé Pokémon/JRPG (se voir, chat, échanges, duels).

Architecture : hôte-autoritaire. `moteur/reseau.js` = petit serveur HTTP dans le process principal ; SSE `GET /flux` hôte→amis, `POST /action` amis→hôte ; code de partie à 4 lettres, jetons en localStorage, 12 clients max. Les amis jouent dans leur navigateur, rien à installer. Le jeu envoyé est allégé (`jeuPublic` : pas d'événements, zones, téléporteurs ni scripts). Protocole indépendant du transport (rejoindre / vue / action / chat / monde / pair) → un relais sur le serveur de Ragna pourra le remplacer plus tard (codes d'invitation, amis éloignés, chat vocal).

Duel Pokémon : celui qui défie est l'« arbitre », il joue `Combat.lancer({ duel })` ; ses appels d'interface sont renvoyés à l'autre avec les côtés inversés, et l'autre répond ses choix par le réseau. Équipes copiées au départ et rendues intactes. En duel, `combat.js` prend l'équipe adverse telle quelle (ne pas la recréer avec `C.creer` : ses attaques sont des objets, pas des ids).

Tafl : modèle de jeu « Arène de duel » (exemple-arene.js), commande `composer_equipe` (créatures + 4 attaques + objet tenu ; le pack fournit attaquesPossibles / attaquesDefaut / objetsTenables), réglages `reglages.multijoueur` (echanges, duels, pv_autres).

Reste à faire ensuite : duel de groupe JRPG (2e PR, annoncé à Ragna), puis temps réel (Zelda-like, roguelite). Pas encore essayé sous Windows.
