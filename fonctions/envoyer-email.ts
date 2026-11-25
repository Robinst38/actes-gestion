// Fichier généré par scripts/bundle_functions.py — ne pas modifier
import { SupabaseClient, createClient } from "npm:@supabase/supabase-js@2.45.4";
import nodemailer from "npm:nodemailer@6.9.14";

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


// ----- _shared/email.ts -----
// Envoi d'e-mails par SMTP (Google Workspace de l'association, ou tout autre fournisseur)

type PieceJointe = { filename: string; mimeType?: string; content: string /* base64 */ };
type Message = { to: string | string[]; cc?: string | string[]; bcc?: string | string[]; subject: string; body?: string; htmlBody?: string; attachments?: PieceJointe[]; replyTo?: string };

function smtpConfigure(): boolean {
  return !!(Deno.env.get("SMTP_HOST") && Deno.env.get("SMTP_USER") && Deno.env.get("SMTP_PASS"));
}

let transport: any = null;
function getTransport() {
  if (transport) return transport;
  const port = Number(Deno.env.get("SMTP_PORT") || 465);
  transport = nodemailer.createTransport({
    host: Deno.env.get("SMTP_HOST"),
    port,
    secure: port === 465,
    auth: { user: Deno.env.get("SMTP_USER"), pass: Deno.env.get("SMTP_PASS") },
  });
  return transport;
}

const liste = (v?: string | string[]) => (Array.isArray(v) ? v : v ? String(v).split(/[,;]\s*/) : []).map((x) => x.trim()).filter(Boolean);

async function envoyer(m: Message): Promise<{ messageId: string }> {
  if (!smtpConfigure()) throw new Error("Envoi d'e-mails non configuré (SMTP_HOST, SMTP_USER, SMTP_PASS).");
  const to = liste(m.to);
  if (!to.length) throw new Error("Aucun destinataire.");
  const from = Deno.env.get("SMTP_FROM") || Deno.env.get("SMTP_USER")!;
  const info = await getTransport().sendMail({
    from,
    to,
    cc: liste(m.cc),
    bcc: liste(m.bcc),
    replyTo: m.replyTo || Deno.env.get("SMTP_REPLY_TO") || undefined,
    subject: m.subject || "(sans objet)",
    text: m.body || undefined,
    html: m.htmlBody || (m.body ? habiller(m.body, m.subject) : undefined),
    attachments: (m.attachments || []).map((a) => ({ filename: a.filename, content: a.content, encoding: "base64", contentType: a.mimeType })),
  });
  return { messageId: info.messageId };
}

function echapper(s: string) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}
/** Habillage des e-mails du logiciel (24/11/2026) : le texte des modèles est mis en page aux couleurs du Chalet Bellevue.
 *  Titres en MAJUSCULES → intertitres, « Clé : valeur » → lignes d'information, adresse seule sur une ligne → bouton. */
function habiller(texte: string, sujet?: string): string {
  const VERT = "#1F3D2B", OR = "#B98D46", TERRA = "#C0693E", GRIS = "#6E7469", FOND = "#F4F0E8";
  const SANS = "Helvetica,Arial,sans-serif", SERIF = "Georgia,'Times New Roman',serif";
  const lien = (s: string) => echapper(s).replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '<a href="$1" style="color:' + TERRA + ';">$1</a>')
    .replace(/([\w.+-]+@[\w-]+\.[\w.-]+)/g, (m) => m.includes("href") ? m : '<a href="mailto:' + m + '" style="color:' + TERRA + ';">' + m + "</a>");
  const bouton = (url: string) => {
    const lib = /\/sejour/.test(url) ? "Ouvrir mon espace séjour" : /helloasso|\/pay/.test(url) ? "Payer en ligne" : /livret/.test(url) ? "Ouvrir le livret d'accueil" : /avis|review|g\.page/.test(url) ? "Laisser un avis" : "Ouvrir le lien";
    return '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 14px;"><tr><td style="background:' + TERRA + ';border-radius:8px;">'
      + '<a href="' + echapper(url) + '" style="display:inline-block;padding:11px 22px;font:700 14px ' + SANS + ';color:#ffffff;text-decoration:none;">' + lib + " →</a></td></tr></table>"
      + '<div style="font:12px ' + SANS + ';color:' + GRIS + ';margin:-6px 0 12px;word-break:break-all;">' + lien(url) + "</div>";
  };
  const blocs = String(texte || "").replace(/\r\n/g, "\n").trim().split(/\n\s*\n/);
  let corps = "", premier = true;
  for (const b of blocs) {
    const lignes = b.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lignes.length) continue;
    let html = "", dansEncadre = false;
    for (const [i, l] of lignes.entries()) {
      if (premier && i === 0 && /^(bonjour|madame|monsieur|cher|chère)/i.test(l)) {
        html += '<div style="font:italic 20px ' + SERIF + ';color:' + VERT + ';margin:0 0 12px;">' + echapper(l) + "</div>"; continue;
      }
      const lettres = l.replace(/[^A-Za-zÀ-ÿ]/g, "");
      if (i === 0 && lignes.length > 1 && lettres.length >= 4 && l === l.toUpperCase() && !/^https?:/.test(l) && l.length < 60) {
        html += '<div style="font:700 11px ' + SANS + ';letter-spacing:.12em;color:' + OR + ';margin:6px 0 8px;">' + echapper(l) + "</div>";
        dansEncadre = true; continue;
      }
      if (/^https?:\/\/\S+$/.test(l)) { html += bouton(l); continue; }
      const kv = /^([^:]{2,40}?)\s:\s(.+)$/.exec(l);
      if (kv && !/^https?/.test(kv[1])) {
        const code = /code/i.test(kv[1]);
        html += '<div style="font:14px/1.7 ' + SANS + ';color:#23302A;"><span style="color:' + GRIS + ';">' + echapper(kv[1]) + " :</span> "
          + (code ? '<span style="display:inline-block;font:700 16px Consolas,Menlo,monospace;letter-spacing:2px;background:#ffffff;border:1px dashed ' + OR + ';border-radius:6px;padding:2px 10px;color:' + VERT + ';">' + echapper(kv[2]) + "</span>"
            : "<strong>" + lien(kv[2]) + "</strong>") + "</div>";
        continue;
      }
      if (/^[•\-–] /.test(l)) { html += '<div style="font:14px/1.6 ' + SANS + ';color:#23302A;padding-left:14px;text-indent:-12px;"><span style="color:' + TERRA + ';">•</span> ' + lien(l.slice(2)) + "</div>"; continue; }
      html += '<div style="font:15px/1.6 ' + SANS + ';color:#23302A;">' + lien(l) + "</div>";
    }
    const dernier = b === blocs[blocs.length - 1];
    if (dernier && !dansEncadre && lignes.length <= 3 && !/https?:/.test(b)) {
      corps += '<div style="font:italic 16px/1.6 ' + SERIF + ';color:' + VERT + ';margin:6px 0 18px;">' + lignes.map(echapper).join("<br>") + "</div>";
    } else if (dansEncadre) {
      corps += '<div style="background:' + FOND + ';border-left:3px solid ' + OR + ';border-radius:10px;padding:14px 18px;margin:0 0 18px;">' + html + "</div>";
    } else {
      corps += '<div style="margin:0 0 18px;">' + html + "</div>";
    }
    premier = false;
  }
  return '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + echapper(sujet || "Chalet Bellevue") + "</title></head>"
    + '<body style="margin:0;padding:0;background:#EFEAE0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EFEAE0;"><tr><td align="center" style="padding:24px 12px;">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border-radius:14px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.06);">'
    + '<tr><td style="background:' + VERT + ';padding:22px 28px;border-bottom:3px solid ' + OR + ';">'
    + '<div style="font:700 22px ' + SERIF + ';color:#FFFFFF;letter-spacing:.5px;">Chalet Bellevue</div>'
    + '<div style="font:700 10px ' + SANS + ';letter-spacing:.18em;color:' + OR + ';margin-top:4px;">A.C.T.E.S · BAGNÈRES-DE-LUCHON</div></td></tr>'
    + '<tr><td style="padding:28px 28px 10px;">' + corps + "</td></tr>"
    + '<tr><td style="background:' + FOND + ';padding:16px 28px;font:12px/1.6 ' + SANS + ';color:' + GRIS + ';">'
    + "Association A.C.T.E.S · Chalet Bellevue, 2 Impasse du Poujaous, 31110 Bagnères-de-Luchon<br>"
    + '<a href="https://www.chalet-bellevue.fr" style="color:' + GRIS + ';">www.chalet-bellevue.fr</a> · Une question ? Répondez simplement à cet e-mail.'
    + "</td></tr></table></td></tr></table></body></html>";
}

// ----- envoyer-email/index.ts -----
// Envoie un e-mail depuis l'appli (factures, devis, messages aux locataires…)


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const qui = await autoriser(req, ["admin", "bureau"]);
  if (!qui) return erreur("Non autorisé.", 401);
  if (!smtpConfigure()) return erreur("Envoi d'e-mails non configuré sur le serveur (voir GUIDE.md, étape 5).", 503);
  try {
    const m = await req.json();
    const r = await envoyer(m);
    return json({ ok: true, messageId: r.messageId });
  } catch (e) {
    return erreur("Échec de l'envoi : " + (e instanceof Error ? e.message : String(e)), 502);
  }
});
