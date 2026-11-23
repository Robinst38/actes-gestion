# Site public chalet-bellevue.fr — copie de référence

Cette branche contient le site public tel qu'il est déployé sur Cloudflare Pages
(projet `chaletbellevue`, domaine www.chalet-bellevue.fr). Elle n'est pas publiée par GitHub Pages.

- Déployer : Cloudflare › Workers & Pages › chaletbellevue › Create deployment › envoyer le dossier (ou un zip) complet.
- L'API du site est dans la branche `main` : `site/chalet-bellevue-api.js` (Worker `chalet-bellevue-api`).
- Le relais (Worker `chalet-bellevue-relais`) est dans `main` : `fonctions/worker.js`.

Règle : toute modification déployée sur Pages doit être recopiée ici.
