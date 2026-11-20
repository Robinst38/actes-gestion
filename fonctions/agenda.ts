// Fichier généré par scripts/bundle_functions.py — ne pas modifier
import { SupabaseClient, createClient } from "npm:@supabase/supabase-js@2.45.4";

// ----- _shared/commun.ts -----
// Outils communs aux fonctions serveur A.C.T.E.S

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });
}
function erreur(message: string, status = 400): Response {
  return json({ error: message }, status);
}

/** Client « administrateur » (clé service, côté serveur uniquement). */
function admin(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Vérifie l'appelant : soit la tâche planifiée (en-tête x-cron-secret), soit un utilisateur connecté avec l'un des rôles demandés. */
async function autoriser(req: Request, roles: string[]): Promise<{ email: string; role: string } | null> {
  const cron = Deno.env.get("CRON_SECRET");
  if (cron && req.headers.get("x-cron-secret") === cron) return { email: "cron", role: "cron" };
  const jeton = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jeton) return null;
  const sb = admin();
  const { data, error } = await sb.auth.getUser(jeton);
  if (error || !data.user?.email) return null;
  const email = data.user.email.toLowerCase();
  const { data: acc } = await sb.from("acces").select("role").eq("email", email).maybeSingle();
  if (!acc || !roles.includes(acc.role)) return null;
  return { email, role: acc.role };
}

/** Lecture / écriture des documents de l'appli. */
async function lireDoc(sb: SupabaseClient, col: string, id: string): Promise<any | null> {
  const { data } = await sb.from("documents").select("data").eq("collection", col).eq("id", id).maybeSingle();
  return data ? data.data : null;
}
async function lireCollection(sb: SupabaseClient, col: string): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("documents").select("id,data").eq("collection", col).order("id").range(from, from + 999);
    if (error) throw error;
    out.push(...(data || []).map((r: any) => ({ ...r.data, id: r.id })));
    if (!data || data.length < 1000) break;
  }
  return out;
}
async function ecrireDoc(sb: SupabaseClient, col: string, id: string, data: unknown) {
  const { error } = await sb.from("documents").upsert({ collection: col, id, data }, { onConflict: "collection,id" });
  if (error) throw error;
}
async function fusionDoc(sb: SupabaseClient, col: string, id: string, patch: Record<string, unknown>) {
  const { error } = await sb.rpc("doc_update", { p_col: col, p_id: id, p_patch: patch });
  if (error) throw error;
}

/** Fiche « Mon association » (nom, e-mail, téléphone…). */
async function entreprise(sb: SupabaseClient): Promise<Record<string, any>> {
  const d = await lireDoc(sb, "crm_entreprise", "main");
  try { return d && d.valeur ? JSON.parse(d.valeur) : {}; } catch { return {}; }
}

// ----- agenda/index.ts -----
// Agenda Google de l'association (lecture), via un compte de service Google

let jeton: { valeur: string; expire: number } | null = null;

function b64url(buf: ArrayBuffer | string) {
  const s = typeof buf === "string" ? btoa(unescape(encodeURIComponent(buf))) : btoa(String.fromCharCode(...new Uint8Array(buf)));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function accessToken(): Promise<string> {
  if (jeton && jeton.expire > Date.now() + 60_000) return jeton.valeur;
  const sa = JSON.parse(Deno.env.get("GOOGLE_SA_JSON")!);
  const now = Math.floor(Date.now() / 1000);
  const entete = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const charge = b64url(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/calendar.readonly", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const cle = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cle, new TextEncoder().encode(entete + "." + charge));
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: entete + "." + charge + "." + b64url(sig) }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error_description || d.error || "jeton Google refusé");
  jeton = { valeur: d.access_token, expire: Date.now() + d.expires_in * 1000 };
  return jeton.valeur;
}
const agendasAutorises = () => (Deno.env.get("AGENDA_IDS") || "").split(",").map((s) => s.trim()).filter(Boolean);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const qui = await autoriser(req, ["admin", "bureau", "lecture", "menage"]);
  if (!qui) return erreur("Non autorisé.", 401);
  if (!Deno.env.get("GOOGLE_SA_JSON") || !agendasAutorises().length) return erreur("Agenda Google non configuré (GOOGLE_SA_JSON, AGENDA_IDS).", 503);
  const { action, args = {} } = await req.json().catch(() => ({}));
  try {
    const tk = await accessToken();
    const g = async (url: string) => { const r = await fetch(url, { headers: { Authorization: "Bearer " + tk } }); const d = await r.json(); if (!r.ok) throw new Error(d?.error?.message || String(r.status)); return d; };
    if (action === "list_calendars") {
      const calendars = [];
      for (const id of agendasAutorises()) {
        try { const c = await g("https://www.googleapis.com/calendar/v3/calendars/" + encodeURIComponent(id)); calendars.push({ id, summary: c.summary, primary: calendars.length === 0 }); } catch { calendars.push({ id, summary: id }); }
      }
      return json({ calendars, items: calendars });
    }
    if (action === "list_events") {
      let id = String(args.calendarId || "primary");
      if (id === "primary") id = agendasAutorises()[0];
      if (!agendasAutorises().includes(id)) return erreur("Agenda non autorisé : " + id, 403);
      const tz = (s?: string) => (s && !/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s + "+01:00" : s);
      const p = new URLSearchParams({ singleEvents: "true", orderBy: "startTime", maxResults: String(Math.min(2500, args.pageSize || 250)) });
      if (args.startTime) p.set("timeMin", new Date(tz(args.startTime)!).toISOString());
      if (args.endTime) p.set("timeMax", new Date(tz(args.endTime)!).toISOString());
      const d = await g("https://www.googleapis.com/calendar/v3/calendars/" + encodeURIComponent(id) + "/events?" + p);
      const events = (d.items || []).map((e: any) => ({ id: e.id, summary: e.summary, location: e.location, description: e.description, start: e.start, end: e.end, htmlLink: e.htmlLink }));
      return json({ events });
    }
    return erreur("Action inconnue : " + action);
  } catch (e) {
    return erreur("Agenda Google : " + (e instanceof Error ? e.message : String(e)), 502);
  }
});
