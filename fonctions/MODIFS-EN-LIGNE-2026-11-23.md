# Modifications faites en ligne le 23/11/2026 — à reporter dans les sources

Ces trois changements ont été faits directement dans Cloudflare et Supabase (déjà en service).
`fonctions/site.ts` et `fonctions/worker.js` sont des fichiers générés : reporter ces lignes dans
les sources (`_shared/`, `site-relais/`, puis `scripts/bundle_functions.py`) avant tout nouveau
déploiement depuis les sources, sinon elles seront écrasées.

## 1. Worker `chalet-bellevue-api` (Cloudflare) — fonction `syncExternalCalendars`

Juste après `report.at = new Date().toISOString();`, avant `return report;` :

```js
try { await env.DB.prepare("INSERT OR REPLACE INTO site_content (key, value) VALUES ('ical_sync_last', ?)").bind(JSON.stringify(report)).run(); } catch (e) { console.error('sync-save', String(e)); }
```

Rôle : garder le résultat de la dernière synchro Booking/Airbnb (affiché dans l'onglet « Plateformes » de l'espace admin du site).

## 2. Worker `chalet-bellevue-relais` (Cloudflare) — fonction `synchroniser(env)`

Juste après le bloc `try { const n = await synchroBlocages(env, soft, DB); … } catch (e) { … }` :

```js
try { const mk = await DB.prepare("SELECT updated_at FROM site_content WHERE key = 'relais_sauvegarde'").first(); if (!mk || !mk.updated_at || Date.now() - Date.parse(mk.updated_at) > 72e6) { const noms = (await DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").all()).results.map((t) => t.name).filter((n) => !/^(sessions|password_resets|feedback_tokens)$/.test(n)); const tables = {}; for (const n of noms) tables[n] = (await DB.prepare('SELECT * FROM "' + n + '"').all()).results; await versLogiciel(env, { action: "sauvegardeSite", tables }); await DB.prepare("INSERT INTO site_content (key, value, updated_at) VALUES ('relais_sauvegarde', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(String(noms.length), maintenant).run(); bilan.sauvegarde = noms.length; } } catch (e) { console.error("sauvegarde site", String(e)); }
```

Rôle : une fois par jour (au plus toutes les 20 h), copie toutes les tables de la base du site (D1)
vers le logiciel, sauf les jetons temporaires (sessions, réinitialisations de mot de passe, liens d'avis).

## 3. Fonction Supabase `site` (fonctions/site.ts)

Dans la partie POST + x-site-secret, juste avant le commentaire
`// Dates bloquées après synchro site ↔ logiciel …` :

```ts
    // Sauvegarde quotidienne de la base du site (Cloudflare D1) envoyée par le relais → collection site_sauvegarde
    // (incluse ensuite dans la sauvegarde hebdomadaire du logiciel vers Google Drive)
    if (b.action === "sauvegardeSite") {
      const tables = b.tables && typeof b.tables === "object" ? b.tables : {};
      const resume: Record<string, number> = {};
      for (const [nom, lignes] of Object.entries(tables)) resume[nom] = Array.isArray(lignes) ? lignes.length : 0;
      const le = new Date().toISOString();
      await ecrireDoc(sb, "site_sauvegarde", "derniere", { le, resume, tables });
      return json({ ok: true, le, resume });
    }
```

Rôle : ranger la copie de la base du site dans `documents` (collection `site_sauvegarde`, id `derniere`),
qui part ensuite dans la sauvegarde hebdomadaire Google Drive (« Sauvegardes Logiciel de gestion A.C.T.E.S »).

## Site public (Cloudflare Pages)

Nouveau fichier `admin-plateformes.js` + onglet « Plateformes » dans `espace-admin.html`
(déployés sur Pages, inclus dans la sauvegarde hebdomadaire du site).

## Réglage du logiciel (pas de code)

Réservations › Réglages du chalet › Automatisations › « Synchronisation Airbnb / Booking » :
les deux liens d'export (Airbnb, Booking) sont renseignés ; la tâche planifiée Supabase
`actes-sync-ical` (toutes les heures) importe les séjours dans les modules Airbnb et Booking.
