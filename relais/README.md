# Le relais de Saga

Un petit programme à poser sur un serveur (un VPS) pour jouer en ligne avec des amis **sans ouvrir de
port sur sa box**. Saga (le MJ) s'y connecte et reçoit un lien d'invitation ; les amis ouvrent ce lien
dans leur navigateur. Le relais ne fait que transmettre : le code de la partie, l'accord du MJ et ce
que chacun a le droit de voir se décident dans Saga, chez le MJ. Les infos cachées ne passent jamais
par le serveur.

N'importe qui peut installer son propre relais : Saga n'en connaît aucun d'avance, on lui donne
l'adresse dans ses réglages.

## Ce qu'il faut

- Un serveur Linux avec **Node.js 18 ou plus** (`node -v`).
- Un **nom de domaine** (ou un sous-domaine, ex. `relais.mon-domaine.fr`) qui pointe vers le serveur.
- **Caddy** (le plus simple : il fait le HTTPS tout seul) ou nginx devant le relais.

Aucune dépendance : c'est un seul fichier, `relais.js`.

## Installer

1. Copier `relais.js` sur le serveur, par exemple dans `/opt/saga-relais/`.
2. Choisir une **clé** (une longue phrase de passe) : seul un Saga qui la connaît peut ouvrir une partie.
   Par exemple : `openssl rand -base64 24`.
3. Le lancer comme un service, avec `saga-relais.service` (dans ce dossier) :

   ```
   sudo cp saga-relais.service /etc/systemd/system/
   sudo nano /etc/systemd/system/saga-relais.service   # mettre la clé dans RELAIS_CLE
   sudo systemctl daemon-reload
   sudo systemctl enable --now saga-relais
   ```

4. Mettre Caddy devant (fichier `/etc/caddy/Caddyfile`) :

   ```
   relais.mon-domaine.fr {
       reverse_proxy 127.0.0.1:8790 {
           flush_interval -1
       }
   }
   ```

   puis `sudo systemctl reload caddy`. Avec nginx, voir plus bas.

5. Vérifier : `https://relais.mon-domaine.fr/sante` répond `{"ok":true,...,"cle":true}`.

## Dans Saga

Multijoueur › **Réglages du relais** : l'adresse (`relais.mon-domaine.fr`) et la clé. Elles restent
dans les réglages de Saga, sur le PC du MJ. Puis **Par un relais** : Saga donne le lien à envoyer aux
amis (le code de la partie est dedans). Chaque nouveau joueur attend que le MJ l'accepte.

## Les réglages (variables d'environnement)

| Variable | Par défaut | Rôle |
|---|---|---|
| `PORT` | `8790` | Le port d'écoute |
| `HOTE` | `127.0.0.1` | L'adresse d'écoute (laisser 127.0.0.1 derrière Caddy ou nginx) |
| `RELAIS_CLE` | vide | La clé demandée à Saga. **Vide = n'importe qui peut ouvrir une partie** |
| `MAX_SALLES` | `20` | Les parties ouvertes en même temps |
| `CONFIANCE_PROXY` | `0` | `1` derrière Caddy ou nginx : l'adresse des amis est lue dans `X-Forwarded-For` |

Les limites sont prudentes : 40 requêtes par seconde et par adresse, 64 Ko par demande d'un ami, une
partie fermée 90 s après que le MJ a perdu le fil (il revient dans la même partie s'il se reconnecte
avant). Les fichiers de l'interface de Saga sont gardés en mémoire le temps d'une partie (40 Mo au
plus), pour ne pas les redemander au PC du MJ à chaque ami.

## Avec nginx

```
server {
    server_name relais.mon-domaine.fr;
    # (le HTTPS : certbot --nginx -d relais.mon-domaine.fr)
    location / {
        proxy_pass http://127.0.0.1:8790;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_buffering off;
        proxy_read_timeout 1h;
        client_max_body_size 50m;
    }
}
```

## Comment ça marche

- Saga ouvre une salle : `GET /hote/ouvrir?cle=…` (un flux qui reste ouvert). Le relais lui donne un
  identifiant de salle et un secret.
- Un ami ouvre `https://relais…/p/<salle>/` : chaque requête est envoyée à Saga par son flux, Saga la
  rejoue sur son petit serveur de partie (le même qu'en réseau local) et renvoie la réponse par
  morceaux (`POST /hote/reponse`).
- Le relais ne lit pas le contenu : il ne connaît ni le jeu, ni les joueurs, ni le code de la partie.
