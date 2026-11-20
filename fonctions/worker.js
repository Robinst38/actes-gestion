/**
 * Chalet Bellevue — relais entre le site et le logiciel de gestion (le logiciel est la référence)
 *
 * Routes (zone chalet-bellevue.fr) :
 *   www.chalet-bellevue.fr/api/availability*  → ajoute les dates occupées et la grille de tarifs du logiciel
 *   www.chalet-bellevue.fr/api/reservations*  → refuse les dates prises dans le logiciel, transmet la demande
 *                                                au site puis l'enregistre dans le logiciel (statut « Demande »)
 *   www.chalet-bellevue.fr/tarifs*            → ajoute le règlement intérieur et les conditions publiés depuis le logiciel
 * Tâche planifiée (chaque minute) :
 *   - décisions et paiements saisis dans le logiciel → réservation du site (statut, factures)
 *   - décisions prises dans l'admin du site sur une demande encore « Demande » → logiciel
 *   - demandes du site absentes du logiciel → recopiées (rattrapage si le logiciel était injoignable)
 *   - grille de saisons du logiciel → tarifs du site (même prix affiché et facturé)
 *   - infos pratiques du logiciel → espace membres du site
 * Tout le reste passe tel quel à l'API d'origine. Pour revenir en arrière : supprimer les routes et la tâche planifiée.
 *
 * Réglages (Settings) :
 *   API           : liaison de service → Worker « chalet-bellevue-api »
 *   DB            : liaison D1 → base « chalet-bellevue-db »
 *   LOGICIEL_URL  : https://qmggmwdfzsacjpykvjvf.supabase.co/functions/v1/site
 *   SITE_SECRET   : secret partagé avec le logiciel (même valeur que dans Supabase)
 */

async function logiciel(env, avecSecret, delai) {
  try {
    const headers = { accept: "application/json" };
    if (avecSecret) headers["x-site-secret"] = env.SITE_SECRET;
    const r = await fetch(env.LOGICIEL_URL, { signal: AbortSignal.timeout(delai || 4000), headers });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    console.error("logiciel injoignable", String(e));
    return null;
  }
}

async function versLogiciel(env, corps) {
  const r = await fetch(env.LOGICIEL_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-site-secret": env.SITE_SECRET },
    body: JSON.stringify(corps),
  });
  if (!r.ok) throw new Error("logiciel " + r.status + " " + (await r.text()).slice(0, 200));
  return r.json();
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

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Texte simple du logiciel → HTML : paragraphes séparés par une ligne vide, retours à la ligne conservés */
function enHtml(t) {
  return String(t).trim().split(/\n\s*\n/).map((p) => "<p>" + esc(p.trim()).replace(/\n/g, "<br>") + "</p>").join("\n");
}

/** Fiche de réservation complète du site, pour la recopier dans le logiciel */
function versDemande(r) {
  return {
    siteId: String(r.id), siteStatus: r.status, checkIn: r.check_in, checkOut: r.check_out,
    adults: r.adults, minors: r.minors, wantsCleaning: !!r.wants_cleaning, name: r.full_name, email: r.email,
    phone: r.phone, message: r.message, paymentMethod: r.payment_method, montant: r.price_grand_total,
  };
}

/* ------------------------------------------------------------------ page Tarifs : documents publiés */
async function documentsPublies(env, ctx) {
  const cache = caches.default;
  const cle = new Request("https://relais.cache/documents-v1");
  const enCache = await cache.match(cle);
  if (enCache) return enCache.json();
  const soft = await logiciel(env, false, 2500);
  const docs = (soft && soft.documents) || {};
  ctx.waitUntil(cache.put(cle, new Response(JSON.stringify(docs), { headers: { "cache-control": "max-age=60" } })));
  return docs;
}

function sectionDocument(id, surtitre, titre, texte, fond) {
  return `<section id="${id}"${fond ? ' class="alt-bg"' : ""}><div class="container"><p class="eyebrow">${esc(surtitre)}</p><h2>${esc(titre)}</h2>` +
    `<div class="cb-doc" style="max-width:820px;line-height:1.65">${enHtml(texte)}</div></div></section>`;
}

async function pageTarifs(request, env, ctx) {
  const page = await fetch(request);
  const type = page.headers.get("content-type") || "";
  if (request.method !== "GET" || !page.ok || !type.includes("text/html")) return page;
  let docs;
  try { docs = await documentsPublies(env, ctx); } catch (e) { return page; }
  if (!docs.conditions && !docs.reglement) return page;
  let html = "";
  if (docs.conditions) html += sectionDocument("conditions", "Association A.C.T.E.S", "Conditions de location", docs.conditions, false);
  if (docs.reglement) html += sectionDocument("reglement", "Pendant votre séjour", "Règlement intérieur", docs.reglement, !!docs.conditions);
  const h = new Headers(page.headers);
  h.set("cache-control", "public, max-age=60");
  return new HTMLRewriter().on("main", { element(el) { el.append(html, { html: true }); } })
    .transform(new Response(page.body, { status: page.status, headers: h }));
}

/* ------------------------------------------------------------------ synchronisation planifiée */
const STATUT_SITE = { option: "pending", confirmee: "confirmed", arrivee: "confirmed", partie: "confirmed", soldee: "confirmed", terminee: "confirmed", annulee: "cancelled" };
const egal = (a, b) => Math.abs(Number(a) - Number(b)) < 0.01;

async function synchroniser(env) {
  const soft = await logiciel(env, true, 8000);
  if (!soft || !soft.sync) { console.error("synchro : logiciel injoignable"); return; }
  const DB = env.DB;
  const bilan = { statuts: 0, paiements: 0, versLogiciel: 0, recopies: 0, tarifs: false, infos: false };
  const maintenant = new Date().toISOString();
  const dansLogiciel = new Map(soft.sync.resas.map((r) => [r.siteId, r]));

  // 1. Réservations du site connues du logiciel
  const lignes = dansLogiciel.size
    ? (await DB.prepare(`SELECT id, status, price_deposit, price_grand_total FROM reservations WHERE id IN (${[...dansLogiciel.keys()].map(() => "?").join(",")})`)
        .bind(...[...dansLogiciel.keys()].map(Number)).all()).results || []
    : [];
  const factures = new Map();
  if (lignes.length) {
    const f = (await DB.prepare(`SELECT reservation_id, type, status FROM invoices WHERE reservation_id IN (${lignes.map(() => "?").join(",")}) AND type IN ('reservation_deposit','reservation_balance')`)
      .bind(...lignes.map((l) => l.id)).all()).results || [];
    for (const x of f) factures.set(x.reservation_id + ":" + x.type, x.status);
  }
  const retours = [];
  for (const l of lignes) {
    const s = dansLogiciel.get(String(l.id));
    // a) décision du logiciel → site (une demande encore « Demande » dans le logiciel ne change rien)
    const voulu = STATUT_SITE[s.statut];
    if (voulu && voulu !== l.status) {
      await DB.prepare("UPDATE reservations SET status = ? WHERE id = ?").bind(voulu, l.id).run();
      if (voulu === "cancelled") await DB.prepare("UPDATE invoices SET status = 'cancelled' WHERE reservation_id = ? AND status = 'pending'").bind(l.id).run();
      bilan.statuts++;
    } else if (s.statut === "demande" && l.status !== "pending") {
      // b) décision prise dans l'admin du site → logiciel
      retours.push({ siteId: String(l.id), status: l.status });
    }
    // c) paiements enregistrés dans le logiciel → factures du site (ne fait que monter : jamais d'annulation d'un paiement noté sur le site)
    if ((voulu || l.status) === "cancelled" || !(s.paye > 0)) continue;
    const depOk = s.paye + 0.01 >= Number(l.price_deposit || 0);
    const balOk = s.paye + 0.01 >= Number(l.price_grand_total || 0);
    const depPaye = factures.get(l.id + ":reservation_deposit") === "paid";
    const balPaye = factures.get(l.id + ":reservation_balance") === "paid";
    if ((depOk && !depPaye) || (balOk && !balPaye)) {
      const sPaid = "UPDATE invoices SET status = 'paid', paid_at = COALESCE(paid_at, ?) WHERE reservation_id = ? AND type = ? AND status != 'cancelled'";
      if (depOk) {
        await DB.prepare("UPDATE reservations SET payment_status = 'paid' WHERE id = ?").bind(l.id).run();
        await DB.prepare(sPaid).bind(maintenant, l.id, "reservation_deposit").run();
      }
      if (balOk) await DB.prepare(sPaid).bind(maintenant, l.id, "reservation_balance").run();
      bilan.paiements++;
    }
  }
  if (retours.length) { await versLogiciel(env, { action: "statuts", statuts: retours }); bilan.versLogiciel = retours.length; }

  // 2. Rattrapage : demandes du site des dernières 24 h absentes du logiciel
  //    (fenêtre courte : une demande supprimée volontairement du logiciel ne revient pas)
  const manquantes = ((await DB.prepare("SELECT * FROM reservations WHERE created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 day') AND status != 'cancelled' ORDER BY id").all()).results || [])
    .filter((r) => !dansLogiciel.has(String(r.id)));
  for (const r of manquantes.slice(0, 20)) { await versLogiciel(env, versDemande(r)); bilan.recopies++; }

  // 3. Grille de tarifs du logiciel → tarifs du site (prix affiché = prix facturé)
  if (Array.isArray(soft.rates) && soft.rates.length) {
    const actuels = (await DB.prepare("SELECT label, start_month, end_month, price_per_night, min_nights FROM rates ORDER BY id").all()).results || [];
    const pareil = actuels.length === soft.rates.length && actuels.every((a, i) => {
      const b = soft.rates[i];
      return a.label === b.label && a.start_month === b.start_month && a.end_month === b.end_month && egal(a.price_per_night, b.price_per_night) && a.min_nights === b.min_nights;
    });
    if (!pareil) {
      await DB.batch([
        DB.prepare("DELETE FROM rates"),
        ...soft.rates.map((t) => DB.prepare("INSERT INTO rates (label, start_month, end_month, price_per_night, min_nights) VALUES (?, ?, ?, ?, ?)")
          .bind(t.label, t.start_month, t.end_month, t.price_per_night, t.min_nights)),
      ]);
      bilan.tarifs = true;
    }
  }

  // 4. Infos pratiques du logiciel → espace membres du site
  if (soft.sync.infosPratiques) {
    const html = enHtml(soft.sync.infosPratiques);
    const actuel = await DB.prepare("SELECT value FROM site_content WHERE key = 'practical_info_html'").first();
    if (!actuel || actuel.value !== html) {
      await DB.prepare("INSERT INTO site_content (key, value, updated_at) VALUES ('practical_info_html', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
        .bind(html, maintenant).run();
      bilan.infos = true;
    }
  }
  if (bilan.statuts || bilan.paiements || bilan.versLogiciel || bilan.recopies || bilan.tarifs || bilan.infos) console.log("synchro", JSON.stringify(bilan));
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/tarifs" || url.pathname === "/tarifs.html") return pageTarifs(request, env, ctx);

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
          try {
            const j = await copie.json();
            const id = j && j.reservation && j.reservation.id;
            const ligne = id && env.DB ? await env.DB.prepare("SELECT * FROM reservations WHERE id = ?").bind(id).first() : null;
            await versLogiciel(env, ligne ? versDemande(ligne) : { ...body, siteId: id || null });
          } catch (e) {
            console.error("envoi au logiciel impossible (rattrapé à la prochaine synchro)", String(e));
          }
        })());
      }
      return res;
    }

    return env.API.fetch(request);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(synchroniser(env).catch((e) => console.error("synchro en échec", String(e))));
  },
};
