/* assets/api-config.js
   Seul fichier à modifier pour connecter le site au vrai backend, une fois
   le Worker Cloudflare déployé (voir worker/DEPLOIEMENT.md). Tant que
   l'adresse ci-dessous contient "REMPLACER", le site fonctionne en mode
   dégradé (messages d'attente sur Réservation / Avis / Espace membres). */
const API_BASE_URL = 'https://www.chalet-bellevue.fr';
