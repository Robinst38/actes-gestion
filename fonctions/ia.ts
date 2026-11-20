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

// ----- ia/index.ts -----
// Lecture automatique des factures / tickets (scanner) et assistant d'estimation, via l'API Claude

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const qui = await autoriser(req, ["admin", "bureau"]);
  if (!qui) return erreur("Non autorisé.", 401);
  const cle = Deno.env.get("ANTHROPIC_API_KEY");
  if (!cle) return erreur("Lecture automatique non configurée (clé ANTHROPIC_API_KEY absente).", 503);
  const { prompt, images = [], mode = "text", messages, system } = await req.json().catch(() => ({}));
  const contenu: any[] = [];
  for (const im of images.slice(0, 5)) {
    if (im.mediaType === "application/pdf") contenu.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: im.data } });
    else contenu.push({ type: "image", source: { type: "base64", media_type: im.mediaType || "image/jpeg", data: im.data } });
  }
  contenu.push({ type: "text", text: String(prompt || "") + (mode === "json" ? "\n\nRéponds uniquement avec un objet JSON valide, sans texte autour." : "") });
  const corps = {
    model: Deno.env.get("IA_MODEL") || "claude-haiku-5-5",
    max_tokens: 2000,
    ...(system ? { system } : {}),
    messages: Array.isArray(messages) && messages.length ? messages : [{ role: "user", content: contenu }],
  };
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": cle, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify(corps),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return erreur("Service IA : " + (d?.error?.message || r.status), 502);
  const texte = (d.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
  if (mode !== "json") return json({ resultat: texte });
  const m = texte.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  try { return json({ resultat: m ? JSON.parse(m[0]) : null }); } catch { return json({ resultat: null }); }
});
