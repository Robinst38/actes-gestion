# Code serveur — état de référence

Depuis le 23/11/2026, les fichiers de ce dossier sont **la référence** : ils sont identiques,
octet pour octet, au code qui tourne en production.

| Fichier | Où il tourne | Comment le déployer |
|---|---|---|
| `worker.js` | Cloudflare › Worker `chalet-bellevue-relais` (relais site ↔ logiciel) | Coller le fichier dans l'éditeur du Worker puis « Deploy » |
| `site.ts`, `client.ts`, `sync-ical.ts`… | Supabase › Edge Functions (une fonction par fichier) | Coller le fichier dans l'onglet « Code » de la fonction puis « Deploy updates » |
| `../site/chalet-bellevue-api.js` | Cloudflare › Worker `chalet-bellevue-api` (API du site public) | Coller le fichier dans l'éditeur du Worker puis « Deploy » |

Les anciennes sources séparées (`_shared/`, `site-relais/`, `scripts/bundle_functions.py`) ne sont
plus disponibles : la mention « Fichier généré… ne pas modifier » en tête de certains fichiers est
historique. **Modifier directement ces fichiers**, puis les redéployer.

Règle simple : toute modification faite en ligne doit être recopiée ici (et inversement), pour que
GitHub reste toujours identique à la production.

Historique des changements faits en ligne : voir `MODIFS-EN-LIGNE-2026-11-23.md`.
