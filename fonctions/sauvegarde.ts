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

// ----- sauvegarde/index.ts -----
// Sauvegarde complète des données du logiciel (lue chaque semaine par le script Google Drive de l'association)
//   GET + en-tête x-backup-secret (secret BACKUP_SECRET)  — ou un administrateur connecté
//   → { format, cree_le, documents: [{collection,id,data,updated_at}], acces: [...] }
// Restauration : voir GUIDE.md › « Restaurer une sauvegarde ».

async function tout(sb: any, table: string, colonnes: string, ordre: string[]) {
  const lignes: any[] = [];
  for (let de = 0; ; de += 1000) {
    let q = sb.from(table).select(colonnes);
    for (const o of ordre) q = q.order(o);
    const { data, error } = await q.range(de, de + 999);
    if (error) throw new Error(table + " : " + error.message);
    lignes.push(...(data || []));
    if (!data || data.length < 1000) return lignes;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "GET") return erreur("Méthode non prise en charge.", 405);
  const secret = Deno.env.get("BACKUP_SECRET");
  const parSecret = !!secret && req.headers.get("x-backup-secret") === secret;
  if (!parSecret && !(await autoriser(req, ["admin"]))) return erreur("Non autorisé.", 401);
  try {
    const sb = admin();
    const documents = await tout(sb, "documents", "collection,id,data,updated_at", ["collection", "id"]);
    const acces = await tout(sb, "acces", "email,nom,role,cree_le", ["email"]);
    const parCollection: Record<string, number> = {};
    for (const d of documents) parCollection[d.collection] = (parCollection[d.collection] || 0) + 1;
    return new Response(JSON.stringify({ format: "actes-sauvegarde-1", cree_le: new Date().toISOString(), resume: parCollection, documents, acces }), {
      headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch (e) {
    return erreur("Sauvegarde impossible : " + String((e as Error).message || e), 500);
  }
});
