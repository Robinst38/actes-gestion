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
    html: m.htmlBody || (m.body ? "<div style=\"font:14px/1.5 Arial,Helvetica,sans-serif\">" + echapper(m.body).replace(/\n/g, "<br>") + "</div>" : undefined),
    attachments: (m.attachments || []).map((a) => ({ filename: a.filename, content: a.content, encoding: "base64", contentType: a.mimeType })),
  });
  return { messageId: info.messageId };
}

function echapper(s: string) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}


// ----- _shared/chalet.ts -----
// Règles métier du chalet, côté serveur (mêmes calculs que dans l'appli : app/chalet/01_core.js)

const p2 = (n: number) => String(n).padStart(2, "0");
/** Date du jour à Paris, au format AAAA-MM-JJ. */
function auj(): string {
  const f = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" });
  return f.format(new Date());
}
function addD(iso: string, n: number) { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function nbN(a?: string, b?: string) { if (!a || !b) return 0; const n = Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 864e5); return isNaN(n) ? 0 : Math.max(0, n); }
function num(v: unknown): number {
  let s = String(v ?? "").replace(/[^\d,.\-]/g, "");
  if (s.includes(",") && s.includes(".")) s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else s = s.replace(",", ".");
  const n = parseFloat(s); return isNaN(n) ? 0 : n;
}
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const eur = (n: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(n) || 0);
const fd = (iso?: string) => (iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4) : "—");

const MODELES: Record<string, { nom: string; sujet: string; corps: string }> = {
  confirmation: { nom: "Confirmation de réservation", sujet: "Confirmation de votre réservation au {chalet} du {arrivee} au {depart}", corps: "Bonjour {contact},\n\nNous avons le plaisir de vous confirmer la réservation du {chalet} pour {groupe}, du {arrivee} au {depart} ({nuits} nuits), pour {personnes} personnes.\n\nMontant total : {total}\nAcompte à verser : {acompte}\nSolde : {solde}, à régler au plus tard le {echeance_solde}\nCaution : {caution}\n\nVotre espace séjour en ligne : {lien_client}\nVous y trouverez le contrat de location à accepter en un clic et le paiement sécurisé de l'acompte.\n\nÀ très bientôt,\n{asso}" },
  j7: { nom: "Infos pratiques (J-7)", sujet: "Votre séjour au {chalet} approche", corps: "Bonjour {contact},\n\nVotre arrivée au {chalet} est prévue le {arrivee}. Voici les informations pratiques :\n\n{infos}\n\nLivret d'accueil (Wi-Fi, consignes, numéros utiles) : {lien_livret}\n\nPour rappel, le solde restant dû est de {reste}.\n\nNous restons disponibles pour toute question.\n\nBon voyage,\n{asso}" },
  arrivee: { nom: "Bienvenue (arrivée)", sujet: "Bienvenue au {chalet} !", corps: "Bonjour {contact},\n\nBienvenue au {chalet} ! Nous espérons que l'installation se passe bien.\n\nEn cas de besoin pendant le séjour, vous pouvez nous joindre au {tel_asso}.\n\nTrès bon séjour,\n{asso}" },
  avis: { nom: "Après le séjour (avis)", sujet: "Merci pour votre séjour au {chalet}", corps: "Bonjour {contact},\n\nMerci d'avoir séjourné au {chalet} du {arrivee} au {depart}. Nous espérons que tout s'est bien passé.\n\nVotre avis compte beaucoup pour l'association : vous pouvez le laisser ici en une minute :\n{lien_avis}\n\nAu plaisir de vous accueillir à nouveau,\n{asso}" },
  relance: { nom: "Relance de paiement", sujet: "Rappel : règlement de votre réservation au {chalet}", corps: "Bonjour {contact},\n\nSauf erreur de notre part, nous n'avons pas encore reçu le règlement de {montant_du} pour votre séjour du {arrivee} au {depart} (échéance : {echeance}).\n\nMerci de procéder au règlement dès que possible. Si c'est déjà fait, merci de ne pas tenir compte de ce message.\n\nBien cordialement,\n{asso}" },
  caution: { nom: "Restitution de la caution", sujet: "Restitution de votre caution – {chalet}", corps: "Bonjour {contact},\n\nSuite à l'état des lieux de sortie, nous vous restituons votre caution de {caution}{retenue_txt}.\n\nMerci encore pour votre séjour,\n{asso}" },
};

const URL_SITE = "https://www.chalet-bellevue.fr";
const CONDITIONS_DEFAUT = "1. Objet — Le présent contrat porte sur la location du chalet désigné ci-dessus, pour la période et le nombre de personnes indiqués. Le nombre d'occupants ne peut dépasser la capacité d'accueil.\n2. Prix — Le prix comprend la mise à disposition des locaux et du mobilier. La taxe de séjour est due en sus pour les personnes majeures.\n3. Réservation — La réservation devient ferme à réception du contrat signé et de l'acompte indiqué.\n4. Solde — Le solde est à régler au plus tard à la date indiquée dans l'échéancier.\n5. Caution — Une caution est remise à l'arrivée. Elle est restituée après l'état des lieux de sortie, déduction faite des éventuelles dégradations ou manquants constatés.\n6. Annulation — En cas d'annulation par le locataire, l'acompte reste acquis à l'association. [Conditions à préciser par le bureau.]\n7. Obligations du locataire — Le locataire s'engage à respecter le règlement intérieur, à occuper les lieux paisiblement et à les rendre en bon état de propreté.\n8. Assurance — Le locataire doit être couvert par une assurance responsabilité civile pour la durée du séjour.\n9. Animaux — Les animaux sont acceptés uniquement s'ils ont été déclarés à la réservation.\n10. État des lieux — Un état des lieux et un inventaire sont établis à l'arrivée et au départ.";
const REGLEMENT_DEFAUT = "• Respecter le calme entre 22 h et 8 h, par égard pour le voisinage.\n• Il est interdit de fumer à l'intérieur du chalet.\n• Respecter les consignes de sécurité incendie affichées ; ne jamais bloquer les issues de secours.\n• Trier les déchets selon les consignes affichées.\n• Signaler sans tarder toute casse ou panne au responsable de l'association.\n• Rendre le chalet rangé, la vaisselle propre et les poubelles vidées.\n• Les animaux déclarés ne sont pas admis dans les chambres ni sur la literie.";

function config(c: any) {
  const o = { nomChalet: "Chalet Bellevue", ville: "Bagnères-de-Luchon", acomptePct: 30, soldeJours: 30, caution: "", infosPratiques: "", lienAvis: "", telAsso: "", conditions: CONDITIONS_DEFAUT, reglement: REGLEMENT_DEFAUT, adhesionSejour: "", acompteArrondi: false, livretToken: "", wifiNom: "", wifiCle: "", ...(c || {}) };
  o.modeles = { ...MODELES, ...((c && c.modeles) || {}) };
  o.autoEmails = { confirmation: false, j7: false, avis: false, relances: false, recap: false, ...((c && c.autoEmails) || {}) };
  return o;
}

const actif = (r: any) => r.statut !== "annulee";
const pers = (r: any) => num(r.adultes) + num(r.enfants) || num(r.personnes);
function paiementsDe(r: any) {
  const l = (r.paiements || []).slice();
  if (!l.length && num(r.acompte) > 0) l.push({ id: "legacy", date: r.debut || "", montant: num(r.acompte), type: "acompte" });
  return l;
}
const paye = (r: any) => r2(paiementsDe(r).reduce((s: number, p: any) => s + num(p.montant), 0));
const total = (r: any) => r2(num(r.tarif));
const reste = (r: any) => r2(total(r) - paye(r));

/** Acompte : montant fixé par le site, sinon % de la location (arrondi si demandé) + adhésion ; la taxe va au solde. Même règle que l'appli. */
function acompteDe(r: any, cfg: any) {
  const T = total(r), pct = num(cfg.acomptePct);
  if (num(r.acompteFixe) > 0) return Math.min(T, r2(num(r.acompteFixe)));
  let adh = 0, tx = 0;
  const dl = r.detailTarif || [];
  if (r.tarifAuto && dl.some((l: any) => l.k)) for (const l of dl) { if (l.k === "adhesion") adh += num(l.montant); if (l.k === "taxe") tx += num(l.montant); }
  const x = (T - adh - tx) * pct / 100;
  return Math.min(T, r2((cfg.acompteArrondi ? Math.round(x) : x) + adh));
}

function echeancier(r: any, cfg: any) {
  const T = total(r), pct = num(cfg.acomptePct), ac = acompteDe(r, cfg), so = r2(T - ac), pa = paye(r);
  const base = r.confirmeLe || r.creeLe || (r.debut ? addD(r.debut, -60) : auj());
  let dS = r.debut ? addD(r.debut, -num(cfg.soldeJours)) : "";
  if (dS && dS < base) dS = base;
  const t = auj();
  const etat = (cumul: number, date: string) => (cumul <= pa + 0.009 ? "paye" : date && date < t ? "retard" : "avenir");
  const l: any[] = [];
  if (T > 0) {
    l.push({ type: "acompte", lib: "Acompte (" + pct + " %)", montant: ac, du: base, etat: etat(ac, base), reste: r2(Math.max(0, ac - pa)) });
    l.push({ type: "solde", lib: "Solde", montant: so, du: dS, etat: etat(T, dS), reste: r2(Math.max(0, T - Math.max(pa, ac))) });
  }
  return l;
}

function varsMsg(r: any, cfg: any, ent: any, extra: Record<string, string> = {}) {
  const e = echeancier(r, cfg), c = r.caution || {};
  return {
    chalet: cfg.nomChalet, groupe: r.groupe || "", contact: r.contact || r.groupe || "Madame, Monsieur",
    arrivee: fd(r.debut), depart: fd(r.fin), nuits: String(nbN(r.debut, r.fin)), personnes: String(pers(r)),
    total: eur(total(r)), acompte: eur(e[0] ? e[0].montant : 0), solde: eur(e[1] ? e[1].montant : 0), echeance_solde: fd(e[1] && e[1].du),
    reste: eur(Math.max(0, reste(r))), caution: eur(num(c.montant) || num(cfg.caution)), infos: cfg.infosPratiques || "",
    lien_avis: cfg.lienAvis || "", lien_client: r.jeton ? URL_SITE + "/sejour/" + r.jeton : "", lien_livret: cfg.livretToken ? URL_SITE + "/livret?k=" + cfg.livretToken : "",
    wifi: cfg.wifiNom ? cfg.wifiNom + (cfg.wifiCle ? " — mot de passe : " + cfg.wifiCle : "") : "", asso: (ent && ent.nom) || "L'association", tel_asso: cfg.telAsso || (ent && ent.tel) || "",
    retenue_txt: num(c.retenue) ? ", déduction faite de " + eur(c.retenue) + (c.motif ? " (" + c.motif + ")" : "") : "",
    ...extra,
  } as Record<string, string>;
}
const remplir = (t: string, v: Record<string, string>) => String(t || "").replace(/\{([a-z_]+)\}/g, (m, k) => (v[k] !== undefined ? String(v[k]) : m));

/** Lecture d'un calendrier iCal (.ics). */
function parseIcs(t: string) {
  const lignes = String(t || "").replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r?\n/);
  const ev: any[] = []; let cur: any = null;
  const dt = (v: string) => { const m = /(\d{4})(\d{2})(\d{2})/.exec(v || ""); return m ? `${m[1]}-${m[2]}-${m[3]}` : ""; };
  for (const l of lignes) {
    if (l === "BEGIN:VEVENT") cur = {};
    else if (l === "END:VEVENT") { if (cur && cur.debut) ev.push(cur); cur = null; }
    else if (cur) {
      const i = l.indexOf(":"); if (i < 0) continue;
      const k = l.slice(0, i).split(";")[0], v = l.slice(i + 1);
      if (k === "DTSTART") cur.debut = dt(v); else if (k === "DTEND") cur.fin = dt(v);
      else if (k === "SUMMARY") cur.titre = v.replace(/\\,/g, ",").replace(/\\n/g, " ");
      else if (k === "UID") cur.uid = v; else if (k === "DESCRIPTION") cur.desc = v.replace(/\\n/g, " ").replace(/\\,/g, ",");
    }
  }
  return ev.map((e) => (e.fin ? e : { ...e, fin: addD(e.debut, 1) }));
}

// ----- emails-auto/index.ts -----
// E-mails automatiques aux locataires + récapitulatif quotidien (lancé chaque matin)



Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const qui = await autoriser(req, ["admin", "bureau"]);
  if (!qui) return erreur("Non autorisé.", 401);
  if (!smtpConfigure()) return erreur("Envoi d'e-mails non configuré.", 503);
  const essai = new URL(req.url).searchParams.get("essai") === "1"; // simulation : rien n'est envoyé
  const sb = admin();
  const cfg = config(await lireDoc(sb, "chalet_config", "main"));
  const ent = await entreprise(sb);
  const auto = cfg.autoEmails;
  const t = auj();
  const resas = await lireCollection(sb, "crm_actes_resas");
  const journal = new Map((await lireCollection(sb, "chalet_envois_auto")).map((x) => [x.id, x]));
  const faits: any[] = [], erreurs: any[] = [];

  async function envoi(r: any, cle: string, modele: string, extra: Record<string, string> = {}) {
    const id = r.id + "__" + cle;
    if (journal.has(id)) return;
    const m = cfg.modeles[modele]; if (!m) return;
    const v = varsMsg(r, cfg, ent, extra);
    const sujet = remplir(m.sujet, v), corps = remplir(m.corps, v);
    try {
      if (!essai) {
        await envoyer({ to: r.email, subject: sujet, body: corps, replyTo: ent.email || undefined });
        await ecrireDoc(sb, "chalet_envois_auto", id, { resaId: r.id, type: modele, cle, date: t, a: r.email, sujet });
      }
      faits.push({ resa: r.groupe || r.contact, type: modele, a: r.email });
    } catch (e) { erreurs.push({ resa: r.groupe || r.contact, type: modele, erreur: e instanceof Error ? e.message : String(e) }); }
  }

  for (const r of resas) {
    if (!actif(r) || !r.debut || !r.fin || !r.email) continue;
    const m = r.messages || {};
    if (auto.confirmation && r.statut === "confirmee" && r.debut >= t && !m.confirmation) await envoi(r, "confirmation", "confirmation");
    if (auto.j7 && !["demande"].includes(r.statut) && r.debut >= t && nbN(t, r.debut) <= 7 && !m.j7) await envoi(r, "j7", "j7");
    if (auto.avis && r.fin < t && nbN(r.fin, t) <= 3 && !m.avis) await envoi(r, "avis", "avis");
    if (auto.relances && !["demande", "option"].includes(r.statut)) {
      for (const e of echeancier(r, cfg)) {
        if (e.etat !== "retard" || e.reste <= 0.009) continue;
        // une relance par semaine maximum, 3 au total par échéance
        const n = [1, 2, 3].find((k) => !journal.has(r.id + "__relance_" + e.type + "_" + k));
        if (!n) continue;
        const prec = journal.get(r.id + "__relance_" + e.type + "_" + (n - 1));
        if (prec && nbN(prec.date, t) < 7) continue;
        await envoi(r, "relance_" + e.type + "_" + n, "relance", { montant_du: eur(e.reste), echeance: fd(e.du) });
      }
    }
  }

  // Récapitulatif du jour pour le bureau
  let recap = false;
  if (auto.recap && cfg.recapEmail) {
    const plats = (await lireCollection(sb, "actes_plateformes")).filter((p) => p.arrivee && !/annul/i.test(p.statut || ""));
    const sej = [
      ...resas.filter((r) => actif(r) && r.debut).map((r) => ({ nom: r.groupe || r.contact, debut: r.debut, fin: r.fin, pers: pers(r), src: "Direct" })),
      ...plats.map((p) => ({ nom: p.guest || p.platform, debut: p.arrivee, fin: p.depart, pers: num(p.guests), src: p.platform })),
    ];
    const lim = (d: string) => d >= t && nbN(t, d) <= 2;
    const arr = sej.filter((s) => lim(s.debut)), dep = sej.filter((s) => lim(s.fin));
    const retards: string[] = [];
    for (const r of resas) if (actif(r)) for (const e of echeancier(r, cfg)) if (e.etat === "retard") retards.push(`${r.groupe || r.contact} — ${e.lib} : ${eur(e.reste)} (échéance ${fd(e.du)})`);
    const maint = (await lireCollection(sb, "chalet_maint")).filter((m) => { if (!m.derniere) return false; const d = new Date(m.derniere + "T12:00:00Z"); d.setUTCMonth(d.getUTCMonth() + (num(m.periodicite) || 12)); return d.toISOString().slice(0, 10) <= t; }).map((m) => m.libelle);
    const stocks = (await lireCollection(sb, "chalet_stocks")).filter((s) => num(s.seuil) > 0 && num(s.quantite) <= num(s.seuil)).map((s) => s.nom);
    const blocs: [string, string[]][] = [
      ["Arrivées (aujourd'hui → J+2)", arr.map((s) => `${fd(s.debut)} · ${s.nom}${s.pers ? " · " + s.pers + " pers." : ""} (${s.src})`)],
      ["Départs (aujourd'hui → J+2)", dep.map((s) => `${fd(s.fin)} · ${s.nom} (${s.src})`)],
      ["Paiements en retard", retards],
      ["Contrôles / entretiens en retard", maint],
      ["Stocks à racheter", stocks],
      ["E-mails envoyés automatiquement ce matin", faits.map((f) => `${f.type} → ${f.resa}`)],
      ["Échecs d'envoi", erreurs.map((e) => `${e.type} → ${e.resa} : ${e.erreur}`)],
    ];
    const pleins = blocs.filter((b) => b[1].length);
    if (pleins.length) {
      const html = `<div style="font:14px/1.5 Arial,sans-serif;color:#23302A"><h2 style="color:#1F3D2B;font-family:Georgia,serif">${echapper(cfg.nomChalet)} — point du ${fd(t)}</h2>` +
        pleins.map(([titre, l]) => `<h3 style="margin:16px 0 4px;color:#C0693E">${echapper(titre)}</h3><ul>${l.map((x) => "<li>" + echapper(x) + "</li>").join("")}</ul>`).join("") + "</div>";
      if (!essai) await envoyer({ to: cfg.recapEmail, subject: `${cfg.nomChalet} — point du ${fd(t)}`, htmlBody: html, body: pleins.map(([a, l]) => a + "\n" + l.map((x) => "• " + x).join("\n")).join("\n\n") });
      recap = true;
    }
  }
  if (!essai) await ecrireDoc(sb, "chalet_sync", "emails", { date: new Date().toISOString(), envoyes: faits, erreurs, recap });
  return json({ ok: true, essai, envoyes: faits, erreurs, recap });
});
