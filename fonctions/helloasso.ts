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

// ----- _shared/helloasso.ts -----
// Paiement en ligne avec HelloAsso (gratuit pour les associations) — API « Checkout »
// Secrets Supabase : HELLOASSO_CLIENT_ID, HELLOASSO_CLIENT_SECRET (HelloAsso › Mon compte › Intégrations et API)
//                    HELLOASSO_ORG (le nom de l'association dans l'adresse HelloAsso, ex. « actes-luchon »)
//                    HELLOASSO_API (facultatif : https://api.helloasso-sandbox.com pour les essais)



const base = () => (Deno.env.get("HELLOASSO_API") || "https://api.helloasso.com").replace(/\/$/, "");
const org = () => Deno.env.get("HELLOASSO_ORG") || "";

function helloassoConfigure(): boolean {
  return !!(Deno.env.get("HELLOASSO_CLIENT_ID") && Deno.env.get("HELLOASSO_CLIENT_SECRET") && org());
}

let cache: { jeton: string; fin: number } | null = null;
async function jetonApi(): Promise<string> {
  if (cache && cache.fin > Date.now() + 60_000) return cache.jeton;
  const r = await fetch(base() + "/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: Deno.env.get("HELLOASSO_CLIENT_ID")!, client_secret: Deno.env.get("HELLOASSO_CLIENT_SECRET")! }),
  });
  if (!r.ok) throw new Error("HelloAsso : identifiants refusés (" + r.status + ")");
  const j = await r.json();
  cache = { jeton: j.access_token, fin: Date.now() + (Number(j.expires_in) || 1800) * 1000 };
  return cache.jeton;
}

async function api(chemin: string, init: RequestInit = {}) {
  const r = await fetch(base() + "/v5/organizations/" + encodeURIComponent(org()) + chemin, {
    ...init,
    headers: { authorization: "Bearer " + (await jetonApi()), "content-type": "application/json", accept: "application/json", ...(init.headers || {}) },
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

// ----- helloasso/index.ts -----
// Notifications de HelloAsso (à déclarer dans HelloAsso › Mon compte › Intégrations et API › URL de notification).
// Le contenu reçu n'est jamais cru tel quel : on relit chaque paiement auprès de l'API HelloAsso avant de l'enregistrer.


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST" || !helloassoConfigure()) return json({ ok: true });
  const b = await req.json().catch(() => null);
  const resa = b && ((b.metadata && b.metadata.resa) || (b.data && b.data.meta && b.data.meta.resa));
  if (resa && /^[\w-]{1,80}$/.test(String(resa))) {
    try { await verifierPaiements(admin(), String(resa)); } catch (e) { console.error("helloasso", String(e)); }
  }
  return json({ ok: true });
});
