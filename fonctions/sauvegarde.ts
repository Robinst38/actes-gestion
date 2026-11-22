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

// ----- Factures à ranger dans Google Drive -----
// Le script Google de l'association (sauvegarde-drive.gs › envoyerFactures, chaque heure) demande les factures
// pas encore rangées, les dépose dans Drive (Trésorerie & comptabilité › Factures reçues › année › mois),
// puis signale ici ce qui est fait. Gratuit : aucun service extérieur, le script tourne sur le compte Google de l'association.
//   GET  ?factures=1  → { factures: [{ cle, date, nom, pages: [dataURL…] }], reste }
//   POST ?factures=1  { faits: [{ cle, driveId, driveUrl }] } → marque les factures comme rangées
// Sources : le Scanner (catégories « Facture fournisseur » et « Ticket / reçu ») et les justificatifs joints aux dépenses.
const CATS_FACTURES = ["Facture fournisseur", "Ticket / reçu"];
const LOT_MAX_OCTETS = 12 * 1024 * 1024;
const propreNom = (t: unknown) => String(t || "").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 90);
const eurNom = (m: unknown) => { const n = Number(String(m ?? "").replace(",", ".")); return isFinite(n) && n > 0 ? " – " + n.toFixed(2).replace(".", ",") + " €" : ""; };

async function facturesARanger(sb: any) {
  const docs = await tout(sb, "documents", "collection,id,data", ["collection", "id"]);
  const parCol = (c: string) => docs.filter((d: any) => d.collection === c);
  // Les dépenses (achats) qui portent un justificatif : pour nommer le fichier avec le libellé et le montant.
  const achats = new Map<string, any>();
  for (const d of docs) {
    const lst = (d.data && (d.data.achats || (d.data.data && d.data.data.achats))) || [];
    if (Array.isArray(lst)) for (const a of lst) if (a && a.pieceId) achats.set(String(a.pieceId), a);
  }
  const att: any[] = [];
  for (const d of parCol("crm_scans")) {
    const m = d.data || {};
    if (m.driveId || !CATS_FACTURES.includes(m.categorie) || !Array.isArray(m.pages) || !m.pages.length) continue;
    att.push({ cle: "scan:" + d.id, date: String(m.date || "").slice(0, 10), nom: propreNom(m.titre || m.categorie), source: "scan", m });
  }
  for (const d of parCol("crm_achat_pj")) {
    const m = d.data || {};
    if (m.driveId) continue;
    const a = achats.get(String(d.id)) || {};
    const lib = [a.fournisseur, a.libelle].filter(Boolean).join(" – ") || String(m.nom || "").replace(/\.[a-z0-9]{2,4}$/i, "") || "Justificatif de dépense";
    att.push({ cle: "pj:" + d.id, date: String(a.dateAchat || m.date || "").slice(0, 10), nom: propreNom(lib) + eurNom(a.montant), source: "pj", m });
  }
  att.sort((x, y) => (x.date || "").localeCompare(y.date || ""));
  const pages = new Map(parCol("crm_scan_pages").map((d: any) => [d.id, d.data && d.data.img]));
  const parts = new Map(parCol("crm_achat_pj_parts").map((d: any) => [d.id, d.data && d.data.d]));
  const lot: any[] = [];
  let poids = 0;
  for (const f of att) {
    let contenu: string[] = [];
    if (f.source === "scan") contenu = f.m.pages.map((pid: string) => pages.get(pid)).filter(Boolean);
    else {
      let t = "";
      for (let k = 0; k < Number(f.m.n || 0); k++) { const x = parts.get(f.m.id + "_" + k) ?? parts.get(String(f.cle).slice(3) + "_" + k); if (x == null) { t = ""; break; } t += x; }
      if (t) contenu = [t];
    }
    if (!contenu.length || contenu.some((x) => !/^data:(image\/(jpeg|png|webp)|application\/pdf);base64,/.test(x))) continue; // incomplet : réessayé plus tard
    const taille = contenu.reduce((n, x) => n + x.length, 0);
    if (lot.length && poids + taille > LOT_MAX_OCTETS) break;
    poids += taille;
    lot.push({ cle: f.cle, date: f.date || new Date().toISOString().slice(0, 10), nom: f.nom, pages: contenu });
  }
  return { factures: lot, reste: Math.max(0, att.length - lot.length) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const secret = Deno.env.get("BACKUP_SECRET");
  const parSecret = !!secret && req.headers.get("x-backup-secret") === secret;
  const url = new URL(req.url);
  if (url.searchParams.get("factures")) {
    if (!parSecret) return erreur("Non autorisé.", 401);
    const sb = admin();
    try {
      if (req.method === "GET") return json(await facturesARanger(sb));
      if (req.method === "POST") {
        const b = await req.json().catch(() => ({}));
        let n = 0;
        for (const f of (Array.isArray(b.faits) ? b.faits : []).slice(0, 50)) {
          const m = /^(scan|pj):([\w-]{1,80})$/.exec(String(f && f.cle || ""));
          if (!m || !/^[\w-]{10,}$/.test(String(f.driveId || ""))) continue;
          const col = m[1] === "scan" ? "crm_scans" : "crm_achat_pj";
          if (!(await lireDoc(sb, col, m[2]))) continue;
          await fusionDoc(sb, col, m[2], { driveId: String(f.driveId), driveUrl: String(f.driveUrl || "").slice(0, 300), driveLe: new Date().toISOString() });
          n++;
        }
        return json({ ok: true, marques: n });
      }
      return erreur("Méthode non prise en charge.", 405);
    } catch (e) {
      return erreur("Factures : " + String((e as Error).message || e), 500);
    }
  }
  if (req.method !== "GET") return erreur("Méthode non prise en charge.", 405);
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
