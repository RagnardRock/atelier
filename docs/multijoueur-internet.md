---
name: multijoueur-internet
description: Saga 1.1 « Ouvrir sur Internet » : héberger la partie sur le PC de Ragna via UPnP (PR #72), sûreté et repli manuel.
metadata:
  type: project
---

Choix de Ragna (2026-10-25) : héberger sur son PC en ouvrant un port de la box (plus rapide) plutôt qu'un relais sur son serveur. Le relais reste possible plus tard (protocole inchangé). Voir [multijoueur](multijoueur.md).

PR #72 (Saga 1.1.0, squash-mergée 352925b le 2026-10-25), fil « Ouvrir le multijoueur sur Internet » : moteur/internet.js (SSDP + SOAP UPnP IGD, bail 1 h renouvelé toutes les 25 min, 718 → port suivant, 725 → bail 0, CGNAT détecté si l'IP WAN de la box est privée/100.64/10, adresse publique via ipify en secours), IPC reseau:internet ('upnp' | 'manuel' | false) et reseau:accepter. Sur Internet : code 8 lettres ABCD-EFGH, limite 20 mauvais codes/min au total + 6/min par IP, chaque nouveau joueur en « attente » jusqu'à l'accord de l'hôte, /commun/ limité à bac-a-sable.js. internet.js ajouté à FICHIERS_APP de l'export .exe. Pas encore essayé avec une vraie box.
