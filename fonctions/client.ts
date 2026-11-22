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
  demande: { nom: "Demande reçue (avec le code d'accès)", sujet: "Nous avons bien reçu votre demande — {chalet}", corps: "Bonjour {contact},\n\nNous avons bien reçu votre demande de réservation du {chalet} du {arrivee} au {depart} ({nuits} nuits, {personnes} personnes). Le bureau de l'association l'étudie et revient vers vous très rapidement.\n\nVous pouvez suivre votre demande dans votre espace séjour :\n{lien_connexion}\nAdresse e-mail : {email}\nCode d'accès : {code_acces}\n\nÀ très bientôt,\n{asso}" },
  confirmation: { nom: "Confirmation de réservation", sujet: "Confirmation de votre réservation au {chalet} du {arrivee} au {depart}", corps: "Bonjour {contact},\n\nNous avons le plaisir de vous confirmer la réservation du {chalet} pour {groupe}, du {arrivee} au {depart} ({nuits} nuits), pour {personnes} personnes.\n\nMontant total : {total}\nAcompte à verser : {acompte}\nSolde : {solde}, à régler au plus tard le {echeance_solde}\nCaution : {caution}\n\nVotre espace séjour en ligne : {lien_client}\n(ou sur {lien_connexion} avec votre adresse e-mail et le code d'accès {code_acces})\nVous y trouverez le contrat de location à accepter en un clic et le paiement sécurisé de l'acompte.\n\nÀ très bientôt,\n{asso}" },
  j7: { nom: "Infos pratiques (J-7)", sujet: "Votre séjour au {chalet} approche", corps: "Bonjour {contact},\n\nVotre arrivée au {chalet} est prévue le {arrivee}. Voici les informations pratiques :\n\n{infos}\n\nLivret d'accueil (Wi-Fi, consignes, numéros utiles) : {lien_livret}\n\nPour rappel, le solde restant dû est de {reste}.\n\nNous restons disponibles pour toute question.\n\nBon voyage,\n{asso}" },
  j1: { nom: "Consignes d'arrivée et de départ (veille de l'arrivée)", sujet: "Votre arrivée demain au {chalet} — consignes", corps: "Bonjour {contact},\n\nNous avons hâte de vous accueillir demain au {chalet} !\n\nVOTRE ARRIVÉE — {arrivee}, à partir de {heure_arrivee}\nAdresse : {adresse}\n{consignes_arrivee}\n\nVOTRE DÉPART — {depart}, avant {heure_depart}\n{consignes_depart}\n\nLe livret d'accueil (Wi-Fi, équipements, tri, numéros utiles) : {lien_livret}\nVotre espace séjour (contrat, paiements) : {lien_client}\n\nUn souci sur la route ou pendant le séjour ? Appelez-nous au {tel_asso}.\n\nBonne route et à demain,\n{asso}" },
  arrivee: { nom: "Bienvenue (arrivée)", sujet: "Bienvenue au {chalet} !", corps: "Bonjour {contact},\n\nBienvenue au {chalet} ! Nous espérons que l'installation se passe bien.\n\nEn cas de besoin pendant le séjour, vous pouvez nous joindre au {tel_asso}.\n\nTrès bon séjour,\n{asso}" },
  avis: { nom: "Après le séjour (avis)", sujet: "Merci pour votre séjour au {chalet}", corps: "Bonjour {contact},\n\nMerci d'avoir séjourné au {chalet} du {arrivee} au {depart}. Nous espérons que tout s'est bien passé.\n\nVotre avis compte beaucoup pour l'association : vous pouvez le laisser ici en une minute :\n{lien_avis}\n\nAu plaisir de vous accueillir à nouveau,\n{asso}" },
  relance: { nom: "Relance de paiement", sujet: "Rappel : règlement de votre réservation au {chalet}", corps: "Bonjour {contact},\n\nSauf erreur de notre part, nous n'avons pas encore reçu le règlement de {montant_du} pour votre séjour du {arrivee} au {depart} (échéance : {echeance}).\n\nMerci de procéder au règlement dès que possible. Si c'est déjà fait, merci de ne pas tenir compte de ce message.\n\nBien cordialement,\n{asso}" },
  caution: { nom: "Restitution de la caution", sujet: "Restitution de votre caution – {chalet}", corps: "Bonjour {contact},\n\nSuite à l'état des lieux de sortie, nous vous restituons votre caution de {caution}{retenue_txt}.\n\nMerci encore pour votre séjour,\n{asso}" },
};

const URL_SITE = "https://www.chalet-bellevue.fr";
/** Texte pour les clients : sans les lignes encore « [à compléter …] » (même règle que l'appli). */
function propre(t: unknown) { return String(t || "").split("\n").filter((l) => !/\[à compléter/i.test(l)).join("\n").replace(/\n{3,}/g, "\n\n").trim(); }
const CONDITIONS_DEFAUT = "1. Objet — Le présent contrat porte sur la location du chalet désigné ci-dessus, pour la période et le nombre de personnes indiqués. Le nombre d'occupants ne peut dépasser la capacité d'accueil.\n2. Prix — Le prix comprend la mise à disposition des locaux et du mobilier. La taxe de séjour est due en sus pour les personnes majeures.\n3. Réservation — La réservation devient ferme à réception du contrat signé et de l'acompte indiqué.\n4. Solde — Le solde est à régler au plus tard à la date indiquée dans l'échéancier.\n5. Caution — Une caution est remise à l'arrivée. Elle est restituée après l'état des lieux de sortie, déduction faite des éventuelles dégradations ou manquants constatés.\n6. Annulation — En cas d'annulation par le locataire, l'acompte reste acquis à l'association. [Conditions à préciser par le bureau.]\n7. Obligations du locataire — Le locataire s'engage à respecter le règlement intérieur, à occuper les lieux paisiblement et à les rendre en bon état de propreté.\n8. Assurance — Le locataire doit être couvert par une assurance responsabilité civile pour la durée du séjour.\n9. Animaux — Les animaux sont acceptés uniquement s'ils ont été déclarés à la réservation.\n10. État des lieux — Un état des lieux et un inventaire sont établis à l'arrivée et au départ.";
const REGLEMENT_DEFAUT = "• Respecter le calme entre 22 h et 8 h, par égard pour le voisinage.\n• Il est interdit de fumer à l'intérieur du chalet.\n• Respecter les consignes de sécurité incendie affichées ; ne jamais bloquer les issues de secours.\n• Trier les déchets selon les consignes affichées.\n• Signaler sans tarder toute casse ou panne au responsable de l'association.\n• Rendre le chalet rangé, la vaisselle propre et les poubelles vidées.\n• Les animaux déclarés ne sont pas admis dans les chambres ni sur la literie.";

const CHAMBRES_DEFAUT = [1, 2, 3, 4, 5, 6].map((i) => ({ id: "ch" + i, nom: "Chambre " + i, lits: i === 6 ? 3 : 4 }));
const ACTIVITES_DEFAUT = "Thermes de Luchon (espace bien-être)\nTélécabine vers Superbagnères\nRandonnée au lac d'Oô\nVallée du Lys et cascade d'Enfer\nBalade dans les allées d'Étigny\nMarché de Luchon\nSki ou luge à Superbagnères (en saison)\nParapente depuis Superbagnères\nVélo ou VTT dans la vallée\nSoirée jeux au chalet";
function config(c: any) {
  const o = { nomChalet: "Chalet Bellevue", ville: "Bagnères-de-Luchon", acomptePct: 30, soldeJours: 30, caution: "", infosPratiques: "", lienAvis: "", telAsso: "", conditions: CONDITIONS_DEFAUT, reglement: REGLEMENT_DEFAUT, adhesionSejour: "", acompteArrondi: false, livretToken: "", wifiNom: "", wifiCle: "", heureArrivee: "16 h", heureDepart: "10 h", adresseChalet: "", consignesArrivee: "", consignesDepart: "", numerosUtiles: "", livretSections: [], chambres: CHAMBRES_DEFAUT, activitesSuggerees: ACTIVITES_DEFAUT, ...(c || {}) };
  o.modeles = { ...MODELES, ...((c && c.modeles) || {}) };
  o.autoEmails = { demande: false, confirmation: false, j7: false, j1: false, avis: false, relances: false, recap: false, menage: false, ...((c && c.autoEmails) || {}) };
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

/** Code d'accès de 6 caractères pour l'espace séjour (sans 0/O, 1/I/L, pour éviter les confusions). */
function nouveauCode(): string {
  const A = "ABCDEFGHJKMNPQRSTUVWXYZ23456789", b = new Uint8Array(6);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => A[x % A.length]).join("");
}

function varsMsg(r: any, cfg: any, ent: any, extra: Record<string, string> = {}) {
  const e = echeancier(r, cfg), c = r.caution || {};
  return {
    chalet: cfg.nomChalet, groupe: r.groupe || "", contact: r.contact || r.groupe || "Madame, Monsieur",
    arrivee: fd(r.debut), depart: fd(r.fin), nuits: String(nbN(r.debut, r.fin)), personnes: String(pers(r)),
    total: eur(total(r)), acompte: eur(e[0] ? e[0].montant : 0), solde: eur(e[1] ? e[1].montant : 0), echeance_solde: fd(e[1] && e[1].du),
    reste: eur(Math.max(0, reste(r))), caution: eur(num(c.montant) || num(cfg.caution)), infos: propre(cfg.infosPratiques),
    lien_avis: cfg.lienAvis || "", lien_client: r.jeton ? URL_SITE + "/sejour/" + r.jeton : "", lien_connexion: URL_SITE + "/sejour", code_acces: r.codeAcces || "", email: r.email || "", lien_livret: cfg.livretToken ? URL_SITE + "/livret?k=" + cfg.livretToken : "",
    heure_arrivee: cfg.heureArrivee || "16 h", heure_depart: cfg.heureDepart || "10 h", adresse: cfg.adresseChalet || "", consignes_arrivee: propre(cfg.consignesArrivee), consignes_depart: propre(cfg.consignesDepart),
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

// ----- _shared/helloasso.ts -----
// Paiement en ligne avec HelloAsso (gratuit pour les associations) — API « Checkout »
// Secrets Supabase : HELLOASSO_CLIENT_ID, HELLOASSO_CLIENT_SECRET (HelloAsso › Mon compte › Intégrations et API)
//                    HELLOASSO_ORG (le nom de l'association dans l'adresse HelloAsso, ex. « actes-luchon »)
//                    HELLOASSO_API (facultatif : https://api.helloasso-sandbox.com pour les essais)



const base = () => (Deno.env.get("HELLOASSO_API") || "https://api.helloasso.com").replace(/\/$/, "");
const org = () => (Deno.env.get("HELLOASSO_ORG") || "").trim();
const UA = "ACTES-Chalet-Bellevue/1.0 (+https://www.chalet-bellevue.fr)";

function helloassoConfigure(): boolean {
  return !!(Deno.env.get("HELLOASSO_CLIENT_ID") && Deno.env.get("HELLOASSO_CLIENT_SECRET") && org());
}

let cache: { jeton: string; fin: number } | null = null;
async function jetonApi(): Promise<string> {
  if (cache && cache.fin > Date.now() + 60_000) return cache.jeton;
  const r = await fetch(base() + "/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json", "user-agent": UA },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: (Deno.env.get("HELLOASSO_CLIENT_ID") || "").trim(), client_secret: (Deno.env.get("HELLOASSO_CLIENT_SECRET") || "").trim() }),
  });
  if (!r.ok) throw new Error("HelloAsso : identifiants refusés (" + r.status + ") " + (await r.text()).replace(/\s+/g, " ").slice(0, 300));
  const j = await r.json();
  cache = { jeton: j.access_token, fin: Date.now() + (Number(j.expires_in) || 1800) * 1000 };
  return cache.jeton;
}

async function api(chemin: string, init: RequestInit = {}) {
  const r = await fetch(base() + "/v5/organizations/" + encodeURIComponent(org()) + chemin, {
    ...init,
    headers: { authorization: "Bearer " + (await jetonApi()), "content-type": "application/json", accept: "application/json", "user-agent": UA, ...(init.headers || {}) },
  });
  const t = await r.text();
  if (!r.ok) throw new Error("HelloAsso " + r.status + " : " + t.slice(0, 300));
  return t ? JSON.parse(t) : {};
}

/** Noms acceptés par HelloAsso (lettres, au moins 2 caractères) — sinon on laisse le payeur les saisir. */
function nomValide(s: string) { return /^[\p{L}][\p{L}' -]*[\p{L}]$/u.test(s) && !/(.)\1\1/.test(s); }

async function creerPaiement(o: { montant: number; libelle: string; email?: string; contact?: string; metadata: Record<string, string>; retour: string; erreur: string; annuler: string }) {
  const cents = Math.round(o.montant * 100);
  const corps: any = {
    totalAmount: cents, initialAmount: cents, itemName: o.libelle.slice(0, 250), containsDonation: false,
    backUrl: o.annuler, errorUrl: o.erreur, returnUrl: o.retour, metadata: o.metadata,
  };
  const payer: any = {};
  if (o.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(o.email)) payer.email = o.email;
  const morceaux = String(o.contact || "").trim().split(/\s+/);
  if (morceaux.length >= 2 && nomValide(morceaux[0]) && nomValide(morceaux.slice(1).join(" "))) { payer.firstName = morceaux[0]; payer.lastName = morceaux.slice(1).join(" "); }
  if (Object.keys(payer).length) corps.payer = payer;
  try {
    return await api("/checkout-intents", { method: "POST", body: JSON.stringify(corps) });
  } catch (e) {
    if (!corps.payer) throw e;
    delete corps.payer; // coordonnées refusées par HelloAsso : le payeur les saisira lui-même
    return await api("/checkout-intents", { method: "POST", body: JSON.stringify(corps) });
  }
}

/** Lit un paiement chez HelloAsso : seul ce résultat fait foi (jamais les paramètres de l'adresse de retour). */
async function lirePaiement(intentId: string | number) {
  const j = await api("/checkout-intents/" + encodeURIComponent(String(intentId)));
  const order = j && j.order;
  const ok = !!order && (order.payments || []).some((p: any) => ["Authorized", "Registered"].includes(p.state));
  const montant = order ? r2((num(order.amount && order.amount.total) || (order.payments || []).reduce((s: number, p: any) => s + num(p.amount), 0)) / 100) : 0;
  return { paye: ok, montant, orderId: order ? String(order.id) : "", date: order && order.date ? String(order.date).slice(0, 10) : auj(), metadata: j.metadata || {} };
}

/** Vérifie les paiements en attente d'une réservation et enregistre ceux qui sont réglés (sans doublon). */
async function verifierPaiements(sb: any, resaId: string, seulement?: string) {
  const r = await lireDoc(sb, "crm_actes_resas", resaId);
  if (!r) return { enregistres: [] as any[] };
  const attente: any[] = r.paiementsEnAttente || [];
  const deja = new Set(paiementsDe(r).map((p: any) => String(p.id)));
  const nouveaux: any[] = [], restants: any[] = [];
  for (const a of attente) {
    if (seulement && String(a.intentId) !== String(seulement)) { restants.push(a); continue; }
    let p;
    try { p = await lirePaiement(a.intentId); } catch (e) { restants.push(a); continue; }
    if (p.paye && p.montant > 0) {
      const id = "ha_" + (p.orderId || a.intentId);
      if (!deja.has(id)) { nouveaux.push({ id, date: p.date, montant: p.montant, mode: "HelloAsso", type: a.type === "solde" ? "solde" : "acompte", ref: p.orderId }); deja.add(id); }
    } else if (Date.now() - Date.parse(a.le || "") < 2 * 864e5) restants.push(a); // abandonné : oublié après 48 h
  }
  if (nouveaux.length || restants.length !== attente.length) {
    await fusionDoc(sb, "crm_actes_resas", resaId, { paiements: [...(r.paiements || []), ...nouveaux], paiementsEnAttente: restants });
  }
  if (nouveaux.length && smtpConfigure()) {
    const dest = Deno.env.get("SMTP_USER");
    const tot = nouveaux.reduce((s, p) => s + p.montant, 0);
    if (dest) await envoyer({ to: dest, subject: "Paiement en ligne reçu : " + eur(tot) + " — " + (r.groupe || r.contact || "réservation"),
      body: "Bonjour,\n\nUn paiement en ligne (HelloAsso) de " + eur(tot) + " vient d'être reçu pour le séjour de " + (r.groupe || r.contact || "") + " du " + fd(r.debut) + " au " + fd(r.fin) + ".\nIl est déjà enregistré dans le logiciel (fiche de la réservation › Tarif & paiements).\n\nLe logiciel A.C.T.E.S" }).catch(() => {});
  }
  return { enregistres: nouveaux };
}

// ----- client/index.ts -----
// Espace séjour du locataire et livret d'accueil — appelé uniquement par le relais du site (en-tête x-site-secret)
//   GET  ?jeton=…   → résumé du séjour, échéancier, contrat et règlement, état de l'acceptation
//   GET  ?livret=…  → contenu du livret d'accueil
//   POST {action:"accepter", jeton, nom, ip, ua}        → acceptation du contrat en ligne (horodatée)
//   POST {action:"payer", jeton, type:"acompte"|"solde"} → lien de paiement HelloAsso
//   POST {action:"verifier", jeton, intentId}           → vérifie un paiement auprès de HelloAsso et l'enregistre
//   POST {action:"adhesion", jeton, fiche, signature, ip, ua} → bulletin d'adhésion en ligne d'un nouvel adhérent



async function trouver(sb: any, jeton: string) {
  if (!/^[a-f0-9]{24,64}$/.test(jeton || "")) return null;
  return (await lireCollection(sb, "crm_actes_resas")).find((r) => r.jeton === jeton) || null;
}
async function empreinte(t: string) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return Array.from(new Uint8Array(h)).slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Fiche adhérent (collection crm_adherents) : une par adresse e-mail. */
async function adherentDe(sb: any, email: string) {
  const m = String(email || "").trim().toLowerCase();
  if (!m) return null;
  return await lireDoc(sb, "crm_adherents", "adh_" + (await empreinte(m)));
}

/** État de l'adhésion pour une réservation et niveau d'accès à l'espace séjour :
 *  - "bulletin" : séjour en cours avec adhésion à remplir → le bulletin est obligatoire avant tout le reste ;
 *  - "limite"   : bulletin rempli mais cotisation pas encore réglée → seulement le suivi de la réservation et le règlement ;
 *  - "complet"  : cotisation réglée (ou pas d'adhésion sur cette réservation). */
async function etatAdhesion(sb: any, r: any, cfg: any) {
  const lignes = (r.detailTarif || []).filter((l: any) => l.k === "adhesion");
  const aFaire = lignes.length > 0;
  const cotisation = num(cfg.adhesionSejour) || 30;
  const montant = r2(lignes.reduce((s: number, l: any) => s + num(l.montant), 0)) || cotisation;
  // Les paiements couvrent d'abord la cotisation (elle est comprise dans l'acompte) ; le bureau peut aussi la marquer réglée à la main.
  const payee = !aFaire || !!r.adhesionPayeeLe || paye(r) >= montant - 0.009;
  const enCours = r.statut !== "annulee" && (!r.fin || r.fin >= auj());
  const remplie = !!r.adhesionFiche;
  let ancien: any = null;
  if (aFaire && !remplie) ancien = await adherentDe(sb, r.email).catch(() => null);
  const prec = ancien ? (ancien.adhesions || []).filter((a: any) => a.resa !== String(r.id)) : [];
  const type = remplie ? (r.adhesionFiche.type || "premiere") : prec.length ? "renouvellement" : "premiere";
  const acces = aFaire && !remplie && enCours ? "bulletin" : !payee ? "limite" : "complet";
  return { aFaire, cotisation, montant, payee, remplie, type, acces, ancien, derniere: prec.map((a: any) => String(a.annee || "")).sort().pop() || "" };
}

// ----- Les trois documents obligatoires pour valider une réservation -----
// Chacun se signe en ligne (nom tapé + case cochée, horodaté avec l'IP) ou par dépôt du document imprimé, signé et scanné.
// Dans les textes : « ## » = intertitre, « • » = puce, ligne vide = nouveau paragraphe.
const DOCS_RESA = [
  {
    id: "principe", titre: "Principe locatif du Chalet Bellevue",
    case: "J'ai lu le principe locatif du Chalet Bellevue et je l'accepte.",
    champs: [] as { id: string; lib: string }[],
    texte: `Toute location du Chalet Bellevue se fait en cinq étapes, de la demande en ligne à la facture. L'adhésion annuelle à l'association A.C.T.E.S. (30 €) est obligatoire pour profiter de la location : A.C.T.E.S. est une association loi 1901 et le chalet est réservé à ses adhérents.

## Les étapes de la réservation

1. Votre demande : vous choisissez vos dates et envoyez votre demande depuis la page Réservation du site www.chalet-bellevue.fr.
2. Votre contrat de réservation : après validation par l'association, vous recevez par e-mail votre contrat de réservation et un code d'accès à votre espace séjour. Il précise vos coordonnées, les dates du séjour, le montant du séjour et la cotisation annuelle de 30 €.
3. Votre adhésion : vous remplissez dans votre espace séjour le bulletin de première adhésion ou de renouvellement. Cette étape est obligatoire avant toutes les autres.
4. Les documents et le règlement : vous signez les trois documents de la réservation (ce principe locatif, la convention d'utilisation et la convention de mise à disposition « sécurité »), en ligne ou en envoyant chaque document signé et scanné. Vous réglez ensuite l'acompte, qui comprend la cotisation.
5. La confirmation : vous recevez par e-mail la confirmation de réception et la facture du séjour.

## Règlement

• La facture doit être réglée en totalité au plus tard un mois avant le début du séjour.
• Par chèque à l'ordre de A.C.T.E.S., à recevoir au plus tard un mois avant le début du séjour.
• Par virement : IBAN FR76 1333 5004 0108 9357 5932 919 — BIC CEPAFRPP333 (Caisse d'Épargne Aquitaine Poitou-Charentes).
• Par carte bancaire, en ligne avec HelloAsso, depuis votre espace séjour.
• Une caution de 500 € et une caution ménage de 130 € sont demandées.`,
  },
  {
    id: "utilisation", titre: "Convention d'utilisation du Chalet Bellevue",
    case: "J'ai lu la convention d'utilisation et le règlement intérieur du Chalet Bellevue, et je les accepte au nom de mon groupe.",
    champs: [] as { id: string; lib: string }[],
    texte: `Entre l'association A.C.T.E.S. (Association Culturelle des Travailleurs des Établissements Sociaux), association loi 1901 — RNA W161001594 — SIRET 514 697 473 00015, dont le siège est Place de l'Hôtel de Ville, 16160 Gond-Pontouvre, représentée par son Président, Serge Prieuré, et l'utilisateur désigné dans le contrat de réservation (association ou personne physique), il a été convenu ce qui suit.

## Article 1 — Objet

A.C.T.E.S., propriétaire du chalet d'accueil de groupes « Bellevue » à Bagnères-de-Luchon, le met à la disposition de l'utilisateur pour la période indiquée dans le contrat de réservation. L'utilisateur doit être adhérent d'A.C.T.E.S. et à jour de sa cotisation annuelle (30 €).

## Article 2 — Nature du bâtiment

Le chalet est situé 2 Impasse du Poujaous, Domaine Bellevue, 31110 Bagnères-de-Luchon (avenue de Vénasque). C'est un centre de vacances agréé par la Direction départementale de la Jeunesse et des Sports de Toulouse sous le n° 031.042.089, établissement de type R, 5e catégorie.

La maison compte 2 niveaux et 24 couchages. Au rez-de-chaussée : cuisine, salle à manger, salon, salle de bains (2 douches, 3 lavabos), WC, chambre 1 (1 lit 2 places de 140) et chambre 2 (2 lits de 90). À l'étage : salle de bains (2 douches, 2 lavabos), 2 WC, chambre 3 (6 couchages en lits superposés de 80), chambre 4 (4 couchages en lits superposés), chambre 5 (6 couchages en lits superposés) et chambre 6 (2 couchages en lits superposés et 2 lits de 90).

• Chaque lit dispose d'une couette avec housse de protection et d'un oreiller ; les matelas sont protégés par des housses en coton. Merci d'apporter votre linge de lit.
• Le lit supérieur des lits superposés est interdit aux enfants de moins de 7 ans.
• Le chauffage et l'eau chaude sont produits par une chaudière au gaz, dont la réserve est au fond du jardin.
• Un accès Wi-Fi gratuit est à votre disposition.
• Le chalet est équipé d'une détection de fumées : il est interdit de fumer dans les locaux. Le diagnostic amiante est négatif.
• Les animaux sont acceptés s'ils ont été déclarés à la réservation.

## Article 3 — Incessibilité

L'utilisateur s'engage à utiliser les locaux et le matériel dans le cadre de la mission que lui fixent ses statuts. La présente convention est incessible et intransmissible.

## Article 4 — Loyer et période

Le loyer est payable conformément au contrat de réservation annexé. L'arrivée se fait à partir de 16 h, le départ au plus tard à 10 h.

• Une caution de 500 € et une caution ménage de 130 € sont à joindre au règlement de la réservation.
• Une facture est adressée à l'utilisateur à réception du règlement.
• La facture doit être réglée en totalité au plus tard un mois avant le début du séjour, par chèque, virement ou carte bancaire en ligne depuis l'espace séjour. Les chèques doivent être reçus par A.C.T.E.S. au plus tard un mois avant le début du séjour.

## Article 5 — Charges et entretien

• Le chauffage, l'éclairage et l'eau chaude sont compris dans le prix de la location.
• Un lave-linge, un sèche-linge et un lave-vaisselle sont à la disposition de l'utilisateur.
• L'utilisateur ne peut pas modifier l'agencement des locaux sans l'accord exprès d'A.C.T.E.S. Il répond des dégradations survenues pendant la durée de la convention, qui lui sont facturées.
• L'utilisateur assure l'entretien courant du chalet et de ses équipements. À défaut, les frais de débarras, de ménage et de nettoyage sont à sa charge.
• L'utilisateur souscrit une assurance responsabilité civile couvrant ses participants pendant le séjour.
• Un état des lieux est établi à l'arrivée et au départ avec le représentant d'A.C.T.E.S. sur place.

## Article 6 — Sécurité

L'utilisateur s'engage à n'utiliser aucun autre mode de chauffage que ceux en place, ni les conduits de fumée existants ; à vérifier le bon état du matériel de sécurité (fermetures coup de poing des issues de secours, extincteurs, sirène d'alarme, détecteurs de fumées) ; à laisser libres les voies de dégagement de secours ; à respecter les consignes affichées pour les produits gras ; et à signer la convention de mise à disposition « sécurité ».

## Article 7 — Durée de la convention

La présente convention prend effet à la confirmation de la réservation. Elle peut être résiliée par l'une ou l'autre des parties, par lettre recommandée envoyée trois mois avant le début du séjour. Les sommes versées restent alors acquises à A.C.T.E.S.

## Article 8 — Clause résolutoire

À défaut de paiement de tout ou partie d'une échéance du loyer, et un mois après une mise en demeure de payer restée sans effet, la présente convention est résiliée de plein droit par A.C.T.E.S., sans qu'A.C.T.E.S. ait à justifier d'un préjudice.`,
  },
  {
    id: "securite", titre: "Convention de mise à disposition — Sécurité",
    case: "Je reconnais avoir été informé(e) des dispositions de sécurité de cette convention et je m'engage à les appliquer et à les faire appliquer par mon groupe.",
    champs: [
      { id: "assureur", lib: "Assureur (assurance extension villégiature)" },
      { id: "police", lib: "N° de contrat d'assurance" },
      { id: "evacuation", lib: "Personne désignée pour vérifier l'évacuation (nom et prénom)" },
    ],
    texte: `Cette convention règle la sécurité pendant l'utilisation du Chalet Bellevue, 2 Impasse du Poujaous, Domaine Bellevue, 31110 Bagnères-de-Luchon. La personne qui la signe est appelée « l'organisateur ».

## I — Avant l'utilisation des locaux

L'organisateur déclare avoir souscrit une assurance (extension villégiature), dont il indique l'assureur et le numéro de contrat. Il s'engage à :

• prendre connaissance des consignes générales de sécurité et des consignes particulières affichées dans le chalet, et les appliquer ;
• visiter le chalet avec le représentant d'A.C.T.E.S. à la remise des clés, en particulier les locaux et les accès qui seront utilisés ;
• repérer avec lui l'emplacement de l'alarme et des extincteurs, les itinéraires d'évacuation et les issues de secours ;
• savoir utiliser les extincteurs et l'alarme.

## II — Pendant l'utilisation des locaux

L'organisateur s'engage à :

• faire appliquer par tous les participants les consignes de sécurité et d'usage des équipements ;
• laisser libres les voies de dégagement de secours ;
• respecter les consignes d'usage affichées pour les produits gras ;
• ne pas fumer et ne laisser personne fumer à l'intérieur du chalet ;
• assumer la pleine responsabilité de l'application des règles de sécurité dans le chalet et ses abords.

## Consignes d'évacuation

• En cas d'incendie, l'évacuation du chalet doit être totale.
• Une personne désignée par l'organisateur vérifie que tous les locaux sont vides, y compris ceux où l'on peut se trouver seul (sanitaires, WC, salles de bains).

## Numéros d'urgence

Sapeurs-pompiers : 18 · SAMU : 15 · Numéro d'urgence européen : 112 · A.C.T.E.S. : 05 45 69 25 00`,
  },
];
/** Documents signés d'une réservation (une acceptation en ligne de l'ancien contrat vaut convention d'utilisation).
 *  Statut de chaque document : "valide" (signé en ligne, ou scan conforme), "a_verifier" (scan à contrôler par l'équipe),
 *  "refuse" (scan refusé par l'équipe : le document est à renvoyer, il ne compte plus comme signé). */
function docsSignes(r: any): Record<string, any> {
  const s = { ...(r.documentsSignes || {}) };
  if (!s.utilisation && r.contratAccepte) s.utilisation = { mode: "electronique", nom: r.contratAccepte.nom, le: r.contratAccepte.le, statut: "valide" };
  for (const k of Object.keys(s)) if (!s[k] || s[k].statut === "refuse") delete s[k];
  return s;
}
/** Un document refusé qu'on remplace est gardé dans l'historique de la réservation. */
const historiqueRefus = (r: any, id: string) => r.documentsSignes && r.documentsSignes[id] && r.documentsSignes[id].statut === "refuse"
  ? { documentsHistorique: [...(r.documentsHistorique || []), { doc: id, ...r.documentsSignes[id] }].slice(-30) } : {};
const statutDoc = (x: any) => (x && x.statut) || (x && x.mode === "scan" ? "a_verifier" : "valide");

/** Clé du dépôt des documents de l'équipe (lien privé envoyé au bureau), dérivée du secret du site. */
async function jetonDepot() {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("depot-documents:" + (Deno.env.get("SITE_SECRET") || "")));
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
const lienDepot = async (ancre = "") => URL_SITE + "/equipe/documents?k=" + (await jetonDepot()) + (ancre ? "#" + ancre : "");

/** Vérification automatique des scans par l'IA gratuite de Cloudflare (faite par le relais du site) :
 *  plafond de pages par jour pour rester très loin du quota gratuit de Workers AI (partagé avec le chat du site). */
const QUOTA_IA_PAGES_JOUR = 40;
async function reserverQuotaIA(sb: any, n: number) {
  const jour = auj(), c = (await lireDoc(sb, "chalet_ia", "compteur")) || {};
  const deja = c.jour === jour ? num(c.pages) : 0;
  if (deja + n > QUOTA_IA_PAGES_JOUR) return false;
  await ecrireDoc(sb, "chalet_ia", "compteur", { jour, pages: deja + n });
  return true;
}

const docsComplets = (r: any) => { const s = docsSignes(r); return DOCS_RESA.every((d) => !!s[d.id]); };
const texteDoc = (d: any, cfg: any) => d.id === "utilisation" && cfg.reglement ? d.texte + "\n\n## Règlement intérieur\n\n" + String(cfg.reglement) : d.texte;
const EXT_SCAN: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" };
const BUCKET_DOCS = "documents-signes";

/** Prévient le bureau quand les trois documents d'une réservation sont signés (une seule fois). */
async function siDocsComplets(sb: any, r: any, s: Record<string, any>) {
  if (r.documentsCompletsLe || !DOCS_RESA.every((d) => !!s[d.id])) return;
  await fusionDoc(sb, "crm_actes_resas", r.id, { documentsCompletsLe: new Date().toISOString() });
  if (!smtpConfigure()) return;
  const dest = Deno.env.get("SMTP_USER");
  if (!dest) return;
  const lignes = DOCS_RESA.map((d) => "• " + d.titre + " : " + (s[d.id].mode === "scan" ? "document scanné reçu (" + (s[d.id].fichier && s[d.id].fichier.nom || "fichier") + ")" : "signé en ligne par " + s[d.id].nom) + " le " + new Date(s[d.id].le).toLocaleString("fr-FR", { timeZone: "Europe/Paris" }));
  await envoyer({ to: dest, subject: "Documents signés : " + (r.groupe || r.contact || "réservation") + " (" + fd(r.debut) + ")",
    body: "Bonjour,\n\nLes trois documents de la réservation de " + (r.groupe || r.contact || "") + " du " + fd(r.debut) + " au " + fd(r.fin) + " sont signés :\n\n" + lignes.join("\n")
      + (s.securite && s.securite.champs ? "\n\nAssurance : " + (s.securite.champs.assureur || "") + " — contrat n° " + (s.securite.champs.police || "") + "\nPersonne désignée pour l'évacuation : " + (s.securite.champs.evacuation || "") : "")
      + (DOCS_RESA.some((d) => statutDoc(s[d.id]) !== "valide") ? "\n\nAu moins un document scanné attend encore votre vérification." : "\n\nTous les documents sont validés : la réservation peut être validée.")
      + "\n\nDépôt des documents : " + (await lienDepot("r-" + r.id)) + "\n\nLe logiciel A.C.T.E.S" }).catch(() => {});
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const secret = Deno.env.get("SITE_SECRET");
  if (!secret || req.headers.get("x-site-secret") !== secret) return erreur("Non autorisé.", 401);
  const sb = admin();
  const cfg = config(await lireDoc(sb, "chalet_config", "main"));
  const ent = await entreprise(sb).catch(() => ({} as any));
  const url = new URL(req.url);

  if (req.method === "GET" && url.searchParams.get("livret")) {
    if (!cfg.livretToken || url.searchParams.get("livret") !== cfg.livretToken) return erreur("Livret introuvable.", 404);
    return json({
      chalet: cfg.nomChalet, ville: cfg.ville, asso: ent.nom || "A.C.T.E.S", tel: cfg.telAsso || ent.tel || "", email: ent.email || "",
      infos: propre(cfg.infosPratiques), wifiNom: cfg.wifiNom || "", wifiCle: cfg.wifiCle || "", consignes: propre(cfg.consignesDepart),
      numeros: propre(cfg.numerosUtiles), reglement: cfg.reglement || "", lienAvis: cfg.lienAvis || "",
      arrivee: propre(cfg.consignesArrivee), heureArrivee: cfg.heureArrivee || "16 h", heureDepart: cfg.heureDepart || "10 h", adresse: cfg.adresseChalet || "",
      sections: (cfg.livretSections || []).map((x: any) => ({ titre: String(x.titre || ""), texte: propre(x.texte) })).filter((x: any) => x.titre && x.texte),
    });
  }

  if (req.method === "GET") {
    const r = await trouver(sb, url.searchParams.get("jeton") || "");
    if (!r) return erreur("Séjour introuvable.", 404);
    if (r.statut === "annulee") return json({ annulee: true, chalet: cfg.nomChalet });
    const e = echeancier(r, cfg);
    const ea = await etatAdhesion(sb, r, cfg);
    const complet = ea.acces === "complet";
    return json({
      acces: ea.acces,
      chalet: cfg.nomChalet, ville: cfg.ville, asso: ent.nom || "A.C.T.E.S", tel: cfg.telAsso || ent.tel || "", email: ent.email || "",
      groupe: r.groupe || "", contact: r.contact || "", debut: r.debut, fin: r.fin, nuits: nbN(r.debut, r.fin), personnes: pers(r),
      statut: r.statut, total: total(r), paye: paye(r), reste: Math.max(0, reste(r)), detail: r.detailTarif || [],
      echeancier: e.map((x: any) => ({ type: x.type, lib: x.lib, montant: x.montant, du: x.du, etat: x.etat, reste: x.reste })),
      caution: num((r.caution || {}).montant) || num(cfg.caution),
      contrat: { conditions: cfg.conditions || "", reglement: cfg.reglement || "", accepte: r.contratAccepte || null },
      // Les trois documents obligatoires pour valider la réservation, et leur état de signature
      documents: (() => { const s = docsSignes(r); return DOCS_RESA.map((d) => ({ id: d.id, titre: d.titre, case: d.case, champs: d.champs, texte: texteDoc(d, cfg),
        signe: s[d.id] ? { mode: s[d.id].mode, statut: statutDoc(s[d.id]), nom: s[d.id].nom || "", le: s[d.id].le, fichier: s[d.id].fichier ? s[d.id].fichier.nom : "" } : null,
        refus: !s[d.id] && r.documentsSignes && r.documentsSignes[d.id] && r.documentsSignes[d.id].statut === "refuse" ? { motif: r.documentsSignes[d.id].refus && r.documentsSignes[d.id].refus.motif || "", le: r.documentsSignes[d.id].refus && r.documentsSignes[d.id].refus.le || "" } : null })); })(),
      documentsComplets: docsComplets(r),
      paiementEnLigne: helloassoConfigure(),
      // Organisation du séjour, remplie par le groupe : répartition des chambres, liste de choses à faire, activités.
      // Réservée à l'accès complet : tant que l'adhésion n'est pas remplie et réglée, rien n'est envoyé.
      ...(complet ? {
        chambres: (cfg.chambres || []).map((c: any) => ({ id: String(c.id), nom: String(c.nom || ""), lits: Math.max(0, Math.min(20, num(c.lits))) })),
        couchage: r.couchage || {},
        programme: r.programme || { taches: [], activites: [] },
        suggestions: String(cfg.activitesSuggerees || "").split("\n").map((x) => x.replace(/^[•\-–*]\s*/, "").trim()).filter(Boolean).slice(0, 30),
      } : {}),
      // Bulletin d'adhésion en ligne : première adhésion ou renouvellement, à remplir une fois par l'adhérent qui réserve.
      // Pour un renouvellement, seules la ville et les années sont renvoyées (le lien de l'espace est partagé avec le groupe).
      adhesion: {
        aFaire: ea.aFaire, obligatoire: ea.acces === "bulletin", type: ea.type, payee: ea.payee, montant: ea.montant,
        cotisation: ea.cotisation,
        fiche: r.adhesionFiche ? { le: r.adhesionFiche.le, nom: r.adhesionFiche.nom, prenom: r.adhesionFiche.prenom, type: r.adhesionFiche.type || "premiere" } : null,
        contact: r.contact || "", email: r.email || "", tel: r.tel || "",
        precedente: ea.type === "renouvellement" && ea.ancien ? {
          nom: ea.ancien.nom || "", prenom: ea.ancien.prenom || "", ville: ea.ancien.ville || "",
          depuis: String(ea.ancien.depuis || "").slice(0, 4), derniere: ea.derniere,
        } : null,
      },
    });
  }

  if (req.method === "POST") {
    const b = await req.json().catch(() => null);
    if (!b) return erreur("Demande incomplète.");

    // Connexion à l'espace séjour avec l'adresse e-mail de la réservation et le code d'accès (6 caractères, reçu par e-mail)
    if (b.action === "connexion") {
      const mail = String(b.email || "").trim().toLowerCase(), code = String(b.code || "").replace(/\s+/g, "").toUpperCase();
      if (!mail || !/^[A-Z0-9]{6}$/.test(code)) return erreur("Adresse e-mail ou code incorrect.", 401);
      const r = (await lireCollection(sb, "crm_actes_resas"))
        .filter((x) => x.jeton && x.statut !== "annulee" && String(x.email || "").trim().toLowerCase() === mail && String(x.codeAcces || "").toUpperCase() === code)
        .sort((x, y) => String(y.debut || "").localeCompare(String(x.debut || "")))[0];
      if (!r) return erreur("Adresse e-mail ou code incorrect.", 401);
      return json({ jeton: r.jeton });
    }

    // ----- Dépôt des documents de l'équipe (lien privé /equipe/documents?k=…) -----
    if (String(b.action || "").startsWith("depot")) {
      if (!b.k || b.k !== (await jetonDepot())) return erreur("Lien du dépôt invalide.", 401);
      const resas = await lireCollection(sb, "crm_actes_resas");
      if (b.action === "depot") {
        const lim = addD(auj(), -90);
        const liste = resas.filter((x) => x.statut !== "annulee" && (x.documentsSignes || x.contratAccepte || (x.fin && x.fin >= auj())) && (!x.fin || x.fin >= lim))
          .sort((x, y) => String(x.debut || "").localeCompare(String(y.debut || "")))
          .map((x) => ({
            id: String(x.id), groupe: x.groupe || "", contact: x.contact || "", email: x.email || "", debut: x.debut, fin: x.fin, statut: x.statut,
            docs: DOCS_RESA.map((d) => {
              const brut = (x.documentsSignes || {})[d.id] || (d.id === "utilisation" && x.contratAccepte ? { mode: "electronique", nom: x.contratAccepte.nom, le: x.contratAccepte.le, statut: "valide" } : null);
              if (!brut) return { id: d.id, titre: d.titre, statut: "manquant" };
              return { id: d.id, titre: d.titre, statut: brut.statut === "refuse" ? "refuse" : statutDoc(brut), mode: brut.mode, le: brut.le, nom: brut.nom || "",
                fichier: brut.fichier ? brut.fichier.nom : "", stocke: !!(brut.fichier && brut.fichier.chemin), pages: (brut.fichiers || (brut.fichier ? [brut.fichier] : [])).map((f: any) => !!f.chemin),
                problemes: brut.verif ? brut.verif.problemes || [] : [], auto: !!(brut.verif && brut.verif.ok), champs: brut.champs || null,
                valideur: brut.validePar || "", motif: brut.refus ? brut.refus.motif : "" };
            }),
          }));
        return json({ resas: liste });
      }
      const r = resas.find((x) => String(x.id) === String(b.resa));
      const d = DOCS_RESA.find((x) => x.id === b.doc);
      if (!r || !d) return erreur("Document introuvable.", 404);
      const rec = (r.documentsSignes || {})[d.id];
      if (b.action === "depot-fichier") {
        const fic = rec && (rec.fichiers || (rec.fichier ? [rec.fichier] : []))[Math.max(0, Math.floor(num(b.page)))];
        if (!fic || !fic.chemin) return erreur("Aucun fichier rangé pour ce document (voir l'e-mail reçu).", 404);
        const { data, error } = await sb.storage.from(BUCKET_DOCS).createSignedUrl(fic.chemin, 600);
        if (error || !data) return erreur("Le fichier n'a pas pu être ouvert.", 502);
        return json({ url: data.signedUrl });
      }
      if (!rec) return erreur("Ce document n'a pas encore été envoyé.", 409);
      const par = String(b.par || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 60) || "l'équipe";
      const le = new Date().toISOString();
      if (b.action === "depot-valider") {
        await fusionDoc(sb, "crm_actes_resas", r.id, { documentsSignes: { ...(r.documentsSignes || {}), [d.id]: { ...rec, statut: "valide", validePar: par, valideLe: le } } });
        return json({ ok: true });
      }
      if (b.action === "depot-refuser") {
        const motif = String(b.motif || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 400);
        if (motif.length < 3) return erreur("Merci d'indiquer le motif du refus : il sera envoyé au client.");
        await fusionDoc(sb, "crm_actes_resas", r.id, { documentsSignes: { ...(r.documentsSignes || {}), [d.id]: { ...rec, statut: "refuse", refus: { motif, par, le } } }, documentsCompletsLe: null });
        let mail = false;
        if (smtpConfigure() && r.email) {
          await envoyer({ to: r.email, subject: "Document à renvoyer pour votre séjour au " + cfg.nomChalet,
            body: "Bonjour " + (r.contact || "") + ",\n\nMerci pour l'envoi du document « " + d.titre + " » pour votre séjour du " + fd(r.debut) + " au " + fd(r.fin) + ".\n\n"
              + "Nous ne pouvons pas le valider : " + motif + "\n\nMerci de le signer à nouveau, en ligne ou en renvoyant le document signé et scanné, depuis votre espace séjour :\n"
              + URL_SITE + "/sejour/" + r.jeton + "\n\nBien cordialement,\n" + (ent.nom || "A.C.T.E.S") + (cfg.telAsso || ent.tel ? "\n" + (cfg.telAsso || ent.tel) : "") }).then(() => { mail = true; }).catch((e) => console.error("e-mail refus document", String(e)));
        }
        return json({ ok: true, mail });
      }
      return erreur("Action inconnue.");
    }

    const r = await trouver(sb, b.jeton || "");
    if (!r) return erreur("Séjour introuvable.", 404);
    if (r.statut === "annulee") return erreur("Cette réservation est annulée.", 409);

    // Accès à l'espace séjour selon l'adhésion : bulletin obligatoire d'abord, organisation seulement une fois la cotisation réglée.
    if (["espace", "accepter", "payer", "signer", "deposer"].includes(b.action)) {
      const ea = await etatAdhesion(sb, r, cfg);
      if (ea.acces === "bulletin") return erreur("Merci de remplir d'abord votre bulletin d'adhésion.", 403);
      if (b.action === "espace" && ea.acces !== "complet") return erreur("L'organisation du séjour sera disponible dès réception de votre cotisation d'adhésion.", 403);
    }

    if (b.action === "espace") {
      const txt = (v: unknown, n: number) => String(v == null ? "" : v).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
      const couchage: Record<string, string[]> = {};
      for (const c of cfg.chambres || []) {
        const l = ((b.couchage || {})[c.id] || []) as unknown[];
        couchage[String(c.id)] = Array.from({ length: Math.max(0, Math.min(20, num(c.lits))) }, (_, i) => txt(l[i], 60));
      }
      const liste = (v: unknown, jour: boolean) => (Array.isArray(v) ? v : []).slice(0, 80).map((x: any) => ({
        id: txt(x && x.id, 20) || Math.random().toString(36).slice(2, 10), t: txt(x && x.t, 160), fait: !!(x && x.fait),
        ...(jour ? { jour: /^\d{4}-\d{2}-\d{2}$/.test(String(x && x.jour)) ? String(x.jour) : "" } : {}),
      })).filter((x: any) => x.t);
      const programme = { taches: liste((b.programme || {}).taches, false), activites: liste((b.programme || {}).activites, true) };
      await fusionDoc(sb, "crm_actes_resas", r.id, { couchage, programme, espaceMajLe: new Date().toISOString() });
      return json({ ok: true });
    }

    // Bulletin d'adhésion en ligne d'un nouvel adhérent : vérifié ici, enregistré sur la réservation
    // et dans la collection des adhérents (une fiche par adresse e-mail), puis signalé au bureau par e-mail.
    if (b.action === "adhesion") {
      if (r.adhesionFiche) return json({ ok: true, deja: true });
      const t = (v: unknown, n: number) => String(v == null ? "" : v).replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
      let f = { ...(b.fiche || {}) };
      // Renouvellement : l'adhérent est retrouvé par l'e-mail de la réservation ; s'il garde les mêmes coordonnées
      // (ou son choix sur le droit à l'image), on reprend celles de sa fiche.
      const ea = await etatAdhesion(sb, r, cfg);
      const renouv = ea.type === "renouvellement" && !!ea.ancien;
      if (renouv) {
        const A = ea.ancien;
        if (f.coordonnees !== "modifiees") f = { ...f, civilite: f.civilite || A.civilite, naissance: A.naissance, adresse: A.adresse, cp: A.cp, ville: A.ville, tel: A.tel, email: A.email };
        if (!f.naissance) f.naissance = A.naissance;
        if (!f.civilite) f.civilite = A.civilite;
        if (f.droitImage === "maintenir") f.droitImage = A.droitImage === true;
        if (!f.structure && A.structure) f.structure = A.structure;
      }
      const fiche = {
        civilite: ["Madame", "Monsieur"].includes(f.civilite) ? f.civilite : "",
        nom: t(f.nom, 60).toUpperCase(), prenom: t(f.prenom, 60),
        naissance: /^\d{4}-\d{2}-\d{2}$/.test(String(f.naissance)) ? String(f.naissance) : "",
        adresse: t(f.adresse, 160), cp: t(f.cp, 10), ville: t(f.ville, 80),
        tel: t(f.tel, 20), email: t(f.email, 120).toLowerCase(), structure: t(f.structure, 120),
        source: t(f.source, 40), animal: t(f.animal, 80),
        droitImage: f.droitImage === true, infosEmail: f.infosEmail === true,
      };
      const manque: string[] = [];
      if (!fiche.civilite) manque.push("la civilité");
      if (!nomValide(fiche.nom)) manque.push("le nom");
      if (!nomValide(fiche.prenom)) manque.push("le prénom");
      if (!fiche.naissance || fiche.naissance > new Date().toISOString().slice(0, 10)) manque.push("la date de naissance");
      if (fiche.adresse.length < 5) manque.push("l'adresse");
      if (!/^\d{5}$/.test(fiche.cp)) manque.push("le code postal (5 chiffres)");
      if (fiche.ville.length < 2) manque.push("la ville");
      if (fiche.tel.replace(/\D/g, "").length < 10) manque.push("le téléphone");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(fiche.email)) manque.push("l'adresse e-mail");
      if (manque.length) return erreur("Merci de compléter " + manque.join(", ") + ".");
      if (f.engagements !== true) return erreur("Merci d'accepter les engagements de l'adhérent.");
      const signature = t(b.signature, 120);
      if (signature.length < 2) return erreur("Merci de signer en tapant votre nom et prénom.");
      const le = new Date().toISOString();
      const version = await empreinte(String(cfg.reglement));
      const type = renouv ? "renouvellement" : "premiere";
      const enreg = { ...fiche, type, le, annee: le.slice(0, 4), cotisation: num(cfg.adhesionSejour) || 30, resa: String(r.id),
        signature: { nom: signature, le, ip: t(b.ip, 60), ua: t(b.ua, 200), version } };
      await fusionDoc(sb, "crm_actes_resas", r.id, { adhesionFiche: enreg });
      // Une fiche par adresse e-mail. Si l'adhérent qui renouvelle a changé d'e-mail, on met à jour sa fiche existante.
      const idAdh = renouv && ea.ancien.id ? String(ea.ancien.id) : "adh_" + (await empreinte(fiche.email));
      const ancien = renouv ? ea.ancien : await lireDoc(sb, "crm_adherents", idAdh);
      await ecrireDoc(sb, "crm_adherents", idAdh, {
        ...(ancien || {}), ...fiche, id: idAdh, depuis: (ancien && ancien.depuis) || le.slice(0, 10), majLe: le,
        adhesions: [...((ancien && ancien.adhesions) || []).filter((a: any) => a.resa !== String(r.id)), { annee: enreg.annee, le, resa: String(r.id), cotisation: enreg.cotisation, type }],
      });
      if (smtpConfigure()) {
        const dest = Deno.env.get("SMTP_USER");
        if (dest) await envoyer({ to: dest, subject: (renouv ? "Renouvellement d'adhésion en ligne : " : "Nouvelle adhésion en ligne : ") + fiche.prenom + " " + fiche.nom,
          body: "Bonjour,\n\n" + fiche.civilite + " " + fiche.prenom + " " + fiche.nom + " vient de remplir son bulletin " + (renouv ? "de renouvellement d'adhésion" : "d'adhésion") + " en ligne pour le séjour du " + fd(r.debut) + " au " + fd(r.fin) + ".\n\n"
            + "Adresse : " + fiche.adresse + ", " + fiche.cp + " " + fiche.ville + "\nTéléphone : " + fiche.tel + "\nE-mail : " + fiche.email + (fiche.structure ? "\nStructure : " + fiche.structure : "")
            + "\nDroit à l'image : " + (fiche.droitImage ? "autorisé" : "refusé") + "\nInformations par e-mail : " + (fiche.infosEmail ? "oui" : "non")
            + "\n\nLa fiche est enregistrée dans le logiciel (réservation et liste des adhérents).\n\nLe logiciel A.C.T.E.S" }).catch(() => {});
      }
      return json({ ok: true });
    }

    // Signature électronique d'un des trois documents : nom tapé, case cochée, champs obligatoires ; horodatée avec l'IP
    // et l'empreinte du texte signé. La convention d'utilisation vaut aussi acceptation du contrat (affichée dans le logiciel).
    if (b.action === "signer") {
      const d = DOCS_RESA.find((x) => x.id === b.doc);
      if (!d) return erreur("Document inconnu.");
      const s = docsSignes(r);
      if (s[d.id]) return json({ ok: true, deja: true });
      const t = (v: unknown, n: number) => String(v == null ? "" : v).replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
      const nom = t(b.nom, 120);
      if (nom.length < 2) return erreur("Merci de signer en tapant votre prénom et votre nom.");
      if (b.accepte !== true) return erreur("Merci de cocher la case d'acceptation.");
      const champs: Record<string, string> = {};
      for (const c of d.champs) {
        champs[c.id] = t((b.champs || {})[c.id], 120);
        if (champs[c.id].length < 2) return erreur("Merci de compléter : " + c.lib.toLowerCase() + ".");
      }
      const le = new Date().toISOString();
      const rec = { mode: "electronique", statut: "valide", nom, le, ip: t(b.ip, 60), ua: t(b.ua, 200), version: await empreinte(texteDoc(d, cfg)), ...(d.champs.length ? { champs } : {}) };
      const ns = { ...(r.documentsSignes || {}), [d.id]: rec };
      await fusionDoc(sb, "crm_actes_resas", r.id, { documentsSignes: ns, ...historiqueRefus(r, d.id), ...(d.id === "utilisation" && !r.contratAccepte ? { contratAccepte: { le, nom, ip: rec.ip, ua: rec.ua, version: rec.version } } : {}) });
      await siDocsComplets(sb, r, { ...s, [d.id]: rec });
      return json({ ok: true });
    }

    // Avant un dépôt : le relais demande s'il peut faire vérifier les pages par l'IA de Cloudflare (quota du jour) et ce qu'il faut contrôler.
    if (b.action === "pre-verif") {
      const d = DOCS_RESA.find((x) => x.id === b.doc);
      const n = Math.floor(num(b.pages));
      if (!d || n < 1 || n > 6 || docsSignes(r)[d.id]) return json({ autorise: false });
      return json({ autorise: await reserverQuotaIA(sb, n), titre: d.titre, champs: d.champs.map((c) => c.lib) });
    }

    // Dépôt du document imprimé, signé et scanné (PDF, JPG ou PNG, 8 Mo au plus) : rangé dans le stockage privé
    // « documents-signes » et envoyé en pièce jointe au bureau.
    if (b.action === "deposer") {
      const d = DOCS_RESA.find((x) => x.id === b.doc);
      if (!d) return erreur("Document inconnu.");
      const s = docsSignes(r);
      if (s[d.id]) return json({ ok: true, deja: true });
      // Un ou plusieurs fichiers (un PDF, ou une photo par page) : 6 au plus, 8 Mo en tout.
      const brut: any[] = Array.isArray(b.fichiers) ? b.fichiers : [{ nom: b.nom, type: b.type, contenu: b.contenu }];
      if (!brut.length) return erreur("Merci de choisir le fichier du document signé.");
      if (brut.length > 6) return erreur("6 fichiers au plus par document (une photo par page, ou un seul PDF).");
      const pages: { nom: string; type: string; ext: string; b64: string; octets: Uint8Array; chemin: string; stocke: boolean }[] = [];
      const le = new Date().toISOString();
      for (let i = 0; i < brut.length; i++) {
        const x = brut[i] || {};
        const type = String(x.type || "").toLowerCase(), ext = EXT_SCAN[type];
        if (!ext) return erreur("Format accepté : PDF, JPG ou PNG.");
        const b64 = String(x.contenu || "");
        let octets: Uint8Array;
        try { octets = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); } catch { return erreur("Un des fichiers n'a pas pu être lu."); }
        if (octets.length < 1000) return erreur("Un des fichiers semble vide.");
        const nom = String(x.nom || d.id + "-" + (i + 1) + "." + ext).replace(/[^\w.\- ()À-ÿ]/g, "_").slice(0, 120);
        pages.push({ nom, type, ext, b64, octets, chemin: String(r.id) + "/" + d.id + "-" + le.replace(/[:.]/g, "-") + "-" + (i + 1) + "." + ext, stocke: false });
      }
      const totalOct = pages.reduce((t, p) => t + p.octets.length, 0);
      if (totalOct > 8 * 1024 * 1024) return erreur("Les fichiers dépassent 8 Mo en tout : merci de les alléger (photos moins lourdes, scan en noir et blanc ou en PDF).");
      await sb.storage.createBucket(BUCKET_DOCS, { public: false }).catch(() => null);
      for (const p of pages) {
        try {
          const { error } = await sb.storage.from(BUCKET_DOCS).upload(p.chemin, p.octets, { contentType: p.type, upsert: false });
          p.stocke = !error;
          if (error) console.error("stockage document signé", error.message);
        } catch (e) { console.error("stockage document signé", String((e as Error).message || e)); }
      }
      const stocke = pages.every((p) => p.stocke);
      const nomFichier = pages[0].nom + (pages.length > 1 ? " (+" + (pages.length - 1) + ")" : "");
      // Tout document scanné est vérifié par l'équipe (lisible, complet, signé) dans le dépôt des documents :
      // e-mail au bureau avec le fichier et le lien du dépôt. Aucun service payant n'est utilisé.
      // Résultat de la vérification automatique faite par le relais (IA gratuite de Cloudflare) : conforme → validé,
      // sinon (ou PDF, ou quota du jour atteint) → à vérifier par l'équipe.
      const vb = b.verif && typeof b.verif === "object" ? b.verif : null;
      const verif = { auto: !!(vb && vb.auto), ok: !!(vb && vb.auto && vb.ok === true), le,
        problemes: (vb && Array.isArray(vb.problemes) ? vb.problemes : []).map((x: unknown) => String(x).replace(/[\u0000-\u001f]/g, " ").slice(0, 200)).filter(Boolean).slice(0, 8) };
      const statut = verif.ok ? "valide" : "a_verifier";
      let envoye = false;
      const dest = smtpConfigure() ? Deno.env.get("SMTP_USER") : "";
      if (dest) {
        const qui = (r.groupe || r.contact || "réservation");
        await envoyer({ to: dest,
          subject: (verif.ok ? "Document signé reçu et validé : " : "À vérifier : document signé reçu — ") + d.titre + " — " + qui,
          body: "Bonjour,\n\nLe document « " + d.titre + " » signé et scanné vient d'être déposé dans l'espace séjour de " + qui + " (séjour du " + fd(r.debut) + " au " + fd(r.fin) + ").\n\n"
            + (verif.ok ? "La vérification automatique l'a trouvé lisible, signé et complet : il est validé. Vous pouvez le revoir (et le refuser si besoin) dans le dépôt des documents."
              : (verif.problemes.length ? "Points relevés par la vérification automatique :\n" + verif.problemes.map((x) => "• " + x).join("\n") + "\n\n" : "")
            + "Merci de vérifier qu'il est lisible, complet et signé" + (d.champs.length ? " (" + d.champs.map((c: any) => c.lib.toLowerCase()).join(", ") + " remplis)" : "") + ", puis de le valider ou de le refuser dans le dépôt des documents. En cas de refus, le client reçoit un e-mail pour le renvoyer.")
            + "\n\nDépôt des documents : " + (await lienDepot("r-" + r.id)) + "\n\n" + (pages.length > 1 ? "Les " + pages.length + " fichiers sont en pièces jointes" : "Le fichier est en pièce jointe") + (stocke ? "." : " (rangement dans le stockage incomplet).") + "\n\nLe logiciel A.C.T.E.S",
          attachments: pages.map((p) => ({ filename: p.nom, content: p.b64, mimeType: p.type })) }).then(() => { envoye = true; }).catch((e) => console.error("envoi document signé", String(e)));
      }
      if (!stocke && !envoye) return erreur("Le document n'a pas pu être enregistré. Merci de réessayer ou de l'envoyer par e-mail à l'association.", 502);
      const rec = { mode: "scan", statut, verif, le, ip: String(b.ip || "").slice(0, 60), ua: String(b.ua || "").slice(0, 200), fichier: { nom: nomFichier, type: pages[0].type, taille: totalOct, chemin: pages[0].stocke ? pages[0].chemin : "" },
        fichiers: pages.map((p) => ({ nom: p.nom, type: p.type, taille: p.octets.length, chemin: p.stocke ? p.chemin : "" })) };
      await fusionDoc(sb, "crm_actes_resas", r.id, { documentsSignes: { ...(r.documentsSignes || {}), [d.id]: rec }, ...historiqueRefus(r, d.id) });
      await siDocsComplets(sb, r, { ...s, [d.id]: rec });
      return json({ ok: true });
    }

    if (b.action === "accepter") {
      if (r.contratAccepte) return json({ ok: true, deja: true });
      const nom = String(b.nom || "").trim().slice(0, 120);
      if (nom.length < 2) return erreur("Merci d'indiquer votre nom.");
      const version = await empreinte(String(cfg.conditions) + "\n" + String(cfg.reglement));
      const acc = { le: new Date().toISOString(), nom, ip: String(b.ip || "").slice(0, 60), ua: String(b.ua || "").slice(0, 200), version };
      await fusionDoc(sb, "crm_actes_resas", r.id, { contratAccepte: acc });
      return json({ ok: true });
    }

    if (b.action === "payer") {
      if (!helloassoConfigure()) return erreur("Le paiement en ligne n'est pas encore disponible : merci de régler par virement ou chèque.", 503);
      if (!docsComplets(r)) return erreur("Merci de signer d'abord les trois documents de la réservation.", 409);
      const e = echeancier(r, cfg);
      const type = b.type === "solde" ? "solde" : "acompte";
      const montant = type === "acompte" ? (e[0] ? e[0].reste : 0) : Math.max(0, reste(r));
      if (!(montant >= 1)) return erreur("Il n'y a rien à régler pour le moment.", 409);
      const page = URL_SITE + "/sejour/" + r.jeton;
      let intent: any;
      try { intent = await creerPaiement({
        montant, email: r.email, contact: r.contact,
        libelle: (type === "acompte" ? "Acompte" : "Solde") + " — séjour au " + cfg.nomChalet + " du " + r.debut.split("-").reverse().join("/") + " au " + r.fin.split("-").reverse().join("/"),
        metadata: { resa: String(r.id), type }, retour: page + "?paiement=retour", erreur: page + "?paiement=erreur", annuler: page,
      }); } catch (e) {
        console.error("paiement HelloAsso", String((e as Error).message || e));
        return erreur("Le paiement en ligne est momentanément indisponible : merci de réessayer plus tard ou de contacter l'association.", 502);
      }
      await fusionDoc(sb, "crm_actes_resas", r.id, { paiementsEnAttente: [...(r.paiementsEnAttente || []), { intentId: String(intent.id), type, montant, le: new Date().toISOString() }] });
      return json({ url: intent.redirectUrl });
    }

    if (b.action === "verifier") {
      if (!helloassoConfigure()) return json({ enregistres: [] });
      const res = await verifierPaiements(sb, r.id, b.intentId ? String(b.intentId) : undefined);
      return json({ ok: true, enregistres: res.enregistres.map((p: any) => p.montant) });
    }
  }
  return erreur("Méthode non prise en charge.", 405);
});
