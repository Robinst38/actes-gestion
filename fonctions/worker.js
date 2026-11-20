/**
 * Chalet Bellevue — relais entre le site et le logiciel de gestion
 * Placé devant l'API du site sur deux adresses seulement :
 *   GET  /api/availability  → ajoute les dates occupées (et la grille de tarifs) venant du logiciel
 *   POST /api/reservations  → refuse les dates déjà prises dans le logiciel, puis transmet la demande
 *                             au site ET l'enregistre dans le logiciel (statut « Demande »)
 * Tout le reste passe tel quel à l'API d'origine (liaison API → chalet-bellevue-api).
 * Pour revenir en arrière : supprimer les routes de ce Worker.
 *
 * Réglages (Settings › Variables and Secrets / Bindings) :
 *   API            : liaison de service vers le Worker « chalet-bellevue-api »
 *   LOGICIEL_URL   : https://qmggmwdfzsacjpykvjvf.supabase.co/functions/v1/site
 *   SITE_SECRET    : secret partagé avec le logiciel (même valeur que dans Supabase)
 */
async function logiciel(env) {
  try {
    const r = await fetch(env.LOGICIEL_URL, { signal: AbortSignal.timeout(4000), headers: { accept: "application/json" } });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    console.error("logiciel injoignable", String(e));
    return null;
  }
}

function chevauche(dates, debut, fin) {
  if (!debut || !fin) return false;
  const s = new Set(dates || []);
  for (let d = new Date(debut + "T12:00:00Z"); d < new Date(fin + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) {
    if (s.has(d.toISOString().slice(0, 10))) return true;
  }
  return false;
}

function reponseJson(data, status, base) {
  const h = new Headers(base || {});
  h.delete("content-length");
  h.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { status, headers: h });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/availability" && request.method === "GET") {
      const [orig, soft] = await Promise.all([env.API.fetch(request), logiciel(env)]);
      if (!soft || !orig.ok) return orig;
      const data = await orig.json();
      data.blocked = [...new Set([...(data.blocked || []), ...(soft.blocked || [])])].sort();
      if (Array.isArray(soft.rates) && soft.rates.length) data.rates = soft.rates;
      return reponseJson(data, 200, orig.headers);
    }

    if (url.pathname === "/api/reservations" && request.method === "POST") {
      const body = await request.clone().json().catch(() => null);
      const soft = await logiciel(env);
      if (body && soft && chevauche(soft.blocked, body.checkIn, body.checkOut)) {
        return reponseJson({ error: "Ces dates ne sont plus disponibles — merci de choisir une autre période." }, 409);
      }
      const res = await env.API.fetch(request);
      if (res.status === 201 && body) {
        const copie = res.clone();
        ctx.waitUntil((async () => {
          let siteId = null;
          try { const j = await copie.json(); siteId = j && j.reservation && j.reservation.id; } catch (e) {}
          try {
            const r = await fetch(env.LOGICIEL_URL, {
              method: "POST",
              headers: { "content-type": "application/json", "x-site-secret": env.SITE_SECRET },
              body: JSON.stringify({ ...body, siteId }),
            });
            if (!r.ok) console.error("envoi au logiciel refusé", r.status, await r.text());
          } catch (e) {
            console.error("envoi au logiciel impossible", String(e));
          }
        })());
      }
      return res;
    }

    return env.API.fetch(request);
  },
};
