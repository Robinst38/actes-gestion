// Fichier généré par scripts/bundle_functions.py — ne pas modifier
import { SupabaseClient, createClient } from "npm:@supabase/supabase-js@2.45.4";
import nodemailer from "npm:nodemailer@6.9.14";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

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
  confirmation: { nom: "Confirmation de réservation", sujet: "Confirmation de votre réservation au {chalet} du {arrivee} au {depart}", corps: "Bonjour {contact},\n\nNous avons le plaisir de vous confirmer la réservation du {chalet} pour {groupe}, du {arrivee} au {depart} ({nuits} nuits), pour {personnes} personnes.\n\nMontant total : {total}\nArrhes à verser : {acompte}\nSolde : {solde}, à régler au plus tard le {echeance_solde}\nCaution : {caution}\n\nVotre espace séjour en ligne : {lien_client}\n(ou sur {lien_connexion} avec votre adresse e-mail et le code d'accès {code_acces})\nVous y trouverez le contrat de location à accepter en un clic et le paiement sécurisé des arrhes.\n\nÀ très bientôt,\n{asso}" },
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
const CONDITIONS_DEFAUT = "1. Objet — Le présent contrat porte sur la location du chalet désigné ci-dessus, pour la période et le nombre de personnes indiqués. Le nombre d'occupants ne peut dépasser la capacité d'accueil.\n2. Prix — Le prix comprend la mise à disposition des locaux et du mobilier. La taxe de séjour est due en sus pour les personnes majeures.\n3. Réservation — La réservation devient ferme à réception du contrat signé et des arrhes indiquées.\n4. Solde — Le solde est à régler au plus tard à la date indiquée dans l'échéancier.\n5. Caution — Une caution est remise à l'arrivée. Elle est restituée après l'état des lieux de sortie, déduction faite des éventuelles dégradations ou manquants constatés.\n6. Annulation — En cas d'annulation par le locataire, les arrhes restent acquises à l'association. [Conditions à préciser par le bureau.]\n7. Obligations du locataire — Le locataire s'engage à respecter le règlement intérieur, à occuper les lieux paisiblement et à les rendre en bon état de propreté.\n8. Assurance — Le locataire doit être couvert par une assurance responsabilité civile pour la durée du séjour.\n9. Animaux — Les animaux sont acceptés uniquement s'ils ont été déclarés à la réservation.\n10. État des lieux — Un état des lieux et un inventaire sont établis à l'arrivée et au départ.";
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
    l.push({ type: "acompte", lib: "Arrhes (" + pct + " %)", montant: ac, du: base, etat: etat(ac, base), reste: r2(Math.max(0, ac - pa)) });
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
    + "Association A.C.T.E.S · Chalet Bellevue, 2 Impasse du Poujaou, 31110 Bagnères-de-Luchon<br>"
    + '<a href="https://www.chalet-bellevue.fr" style="color:' + GRIS + ';">www.chalet-bellevue.fr</a> · Une question ? Répondez simplement à cet e-mail.'
    + "</td></tr></table></td></tr></table></body></html>";
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
    if (dest) await envoyer({ to: dest, subject: (r.statut === "demande" ? "À VALIDER — " : "") + "Paiement en ligne reçu : " + eur(tot) + " — " + (r.groupe || r.contact || "réservation"),
      body: "Bonjour,\n\nUn paiement en ligne (HelloAsso) de " + eur(tot) + " vient d'être reçu pour le séjour de " + (r.groupe || r.contact || "") + " du " + fd(r.debut) + " au " + fd(r.fin) + ".\nIl est déjà enregistré dans le logiciel (fiche de la réservation › Tarif & paiements).\n" + (r.statut === "demande" ? "\nATTENTION : c'est une réservation directe, encore au statut « Demande ». Validez-la sous 48 h (statut « Confirmée »), ou refusez-la et remboursez les arrhes dans HelloAsso › Paiements.\n" : "") + "\nLe logiciel A.C.T.E.S" }).catch(() => {});
  }
  return { enregistres: nouveaux };
}

// ----- Exemplaire signé en PDF (24/11/2026) -----
// Mise en page soignée de chaque document signé en ligne (bibliothèque libre pdf-lib, gratuite).
async function pdfExemplaire(d: any, r: any, v: any, ent: any): Promise<string> {
  const doc = await PDFDocument.create();
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const serif = await doc.embedFont(StandardFonts.TimesRomanBold);
  const ital = await doc.embedFont(StandardFonts.HelveticaOblique);
  const mono = await doc.embedFont(StandardFonts.Courier);
  const VERT = rgb(0.122, 0.239, 0.169), OR = rgb(0.725, 0.553, 0.275), TERRA = rgb(0.753, 0.412, 0.243);
  const GRIS = rgb(0.43, 0.45, 0.41), TXT = rgb(0.14, 0.19, 0.16), BEIGE = rgb(0.98, 0.965, 0.937), FILET = rgb(0.91, 0.89, 0.85);
  const W = 595.28, H = 841.89, M = 56, LW = W - 2 * M, BAS = 64;
  doc.setTitle(String(d.titre || "Document signé"));
  doc.setAuthor(String(ent.nom || "A.C.T.E.S"));
  doc.setSubject("Exemplaire signé électroniquement — " + (r.groupe || r.contact || ""));
  const jeu = new Set(helv.getCharacterSet());
  const net = (s: unknown) => String(s ?? "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/ | /g, " ")
    .replace(/[☐☑☒]/g, "").replace(/→/g, "->").split("").filter((c) => c === "\n" || jeu.has(c.codePointAt(0)!)).join("");
  const coupe = (txt: string, f: any, t: number, w: number) => {
    const out: string[] = [];
    for (const para of net(txt).split("\n")) {
      let l = "";
      for (const mot of para.split(/\s+/).filter(Boolean)) {
        const essai = l ? l + " " + mot : mot;
        if (f.widthOfTextAtSize(essai, t) <= w) l = essai; else { if (l) out.push(l); l = mot; }
      }
      out.push(l);
    }
    return out;
  };
  let page: any, y = 0;
  const nouvellePage = (premiere = false) => {
    page = doc.addPage([W, H]);
    if (premiere) {
      page.drawRectangle({ x: 0, y: H - 92, width: W, height: 92, color: VERT });
      page.drawRectangle({ x: 0, y: H - 95, width: W, height: 3, color: OR });
      page.drawText("A.C.T.E.S", { x: M, y: H - 46, size: 22, font: serif, color: rgb(1, 1, 1) });
      page.drawText(net("CHALET BELLEVUE · BAGNÈRES-DE-LUCHON"), { x: M, y: H - 66, size: 8.5, font: bold, color: OR });
      const e1 = net("Document signé électroniquement");
      page.drawText(e1, { x: W - M - helv.widthOfTextAtSize(e1, 9), y: H - 46, size: 9, font: helv, color: rgb(0.85, 0.88, 0.85) });
      const e2 = net("Exemplaire à conserver");
      page.drawText(e2, { x: W - M - ital.widthOfTextAtSize(e2, 8.5), y: H - 60, size: 8.5, font: ital, color: OR });
      y = H - 130;
    } else {
      page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: VERT });
      page.drawText(net(d.titre), { x: M, y: H - 34, size: 8.5, font: bold, color: GRIS });
      y = H - 58;
    }
  };
  const place = (h: number) => { if (y - h < BAS) nouvellePage(); };
  const ligne = (txt: string, o: { f?: any; t?: number; c?: any; x?: number; w?: number; inter?: number } = {}) => {
    const f = o.f || helv, t = o.t || 10, x = o.x ?? M, w = o.w ?? LW, inter = o.inter ?? t * 1.45;
    for (const l of coupe(txt, f, t, w)) { place(inter); page.drawText(l, { x, y: y - t, size: t, font: f, color: o.c || TXT }); y -= inter; }
  };
  nouvellePage(true);
  // Titre
  for (const l of coupe(d.titre, serif, 20, LW)) { page.drawText(l, { x: M, y: y - 20, size: 20, font: serif, color: VERT }); y -= 26; }
  y -= 6;
  // Encadré réservation
  const infos: [string, string][] = [
    ["Réservation", r.groupe || r.contact || ""],
    ["Séjour", "du " + fd(r.debut) + " au " + fd(r.fin)],
    ["Signataire", String(v.nom || "")],
    ["Signé le", new Date(v.le).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "long", timeStyle: "short" }) + " (heure de Paris)"],
  ];
  const hBox = infos.length * 16 + 18;
  page.drawRectangle({ x: M, y: y - hBox, width: LW, height: hBox, color: BEIGE, borderColor: FILET, borderWidth: 1 });
  page.drawRectangle({ x: M, y: y - hBox, width: 3, height: hBox, color: OR });
  let yi = y - 22;
  for (const [k, val] of infos) {
    page.drawText(net(k.toUpperCase()), { x: M + 16, y: yi, size: 7.5, font: bold, color: GRIS });
    page.drawText(net(val).slice(0, 90), { x: M + 110, y: yi, size: 10, font: bold, color: TXT });
    yi -= 16;
  }
  y -= hBox + 20;
  // Corps du document
  const blocs = String(v.texte || "").trim().split(/\n\s*\n/);
  for (const b of blocs) {
    const ls = b.split("\n").map((x) => x.trim()).filter(Boolean);
    if (!ls.length) continue;
    if (ls.length === 1 && ls[0].startsWith("## ")) {
      place(40); y -= 8;
      page.drawText(net(ls[0].slice(3)), { x: M, y: y - 12, size: 12, font: bold, color: VERT });
      y -= 17; page.drawRectangle({ x: M, y, width: 28, height: 1.5, color: OR }); y -= 10;
      continue;
    }
    if (ls.every((x) => x.startsWith("• ") || x.startsWith("- "))) {
      for (const x of ls) {
        const lignes = coupe(x.slice(2), helv, 10, LW - 16);
        place(14.5);
        page.drawCircle({ x: M + 4, y: y - 6.5, size: 1.8, color: TERRA });
        for (const l of lignes) { place(14.5); page.drawText(l, { x: M + 14, y: y - 10, size: 10, font: helv, color: TXT }); y -= 14.5; }
      }
      y -= 6; continue;
    }
    for (const x of ls) ligne(x);
    y -= 7;
  }
  // Champs complétés par le signataire
  const champs = (d.champs || []).filter((c: any) => v.champs && v.champs[c.id]);
  if (champs.length || v.attestation) {
    place(40); y -= 6;
    page.drawText(net("Informations complétées par le signataire"), { x: M, y: y - 12, size: 12, font: bold, color: VERT });
    y -= 17; page.drawRectangle({ x: M, y, width: 28, height: 1.5, color: OR }); y -= 12;
    for (const c of champs) {
      ligne(c.lib, { f: bold, t: 8.5, c: GRIS, inter: 12 });
      ligne(String(v.champs[c.id]), { t: 10.5, inter: 17 });
    }
    if (v.attestation) {
      const lignes = coupe(v.attestation, helv, 10, LW - 22);
      place(lignes.length * 14.5 + 6);
      page.drawRectangle({ x: M, y: y - 11, width: 10, height: 10, borderColor: VERT, borderWidth: 1.2 });
      page.drawLine({ start: { x: M + 2, y: y - 6 }, end: { x: M + 4.5, y: y - 9 }, thickness: 1.6, color: VERT });
      page.drawLine({ start: { x: M + 4.5, y: y - 9 }, end: { x: M + 8.5, y: y - 2.5 }, thickness: 1.6, color: VERT });
      for (const l of lignes) { page.drawText(l, { x: M + 18, y: y - 10, size: 10, font: helv, color: TXT }); y -= 14.5; }
      y -= 4;
    }
  }
  // Bloc signature
  const engagement = coupe(d.case || "", bold, 10, LW - 28);
  const preuves = [
    "Signé électroniquement par " + (v.nom || "") + " le " + new Date(v.le).toLocaleString("fr-FR", { timeZone: "Europe/Paris" }) + " (heure de Paris),",
    v.acces || "après identification par un code à usage unique envoyé à " + (r.email || "") + ".",
    "Adresse IP : " + (v.ip || "—"),
  ];
  const lp = preuves.flatMap((p) => coupe(p, helv, 8.5, LW - 28));
  const em = coupe("Empreinte SHA-256 du texte signé : " + (v.version || ""), mono, 7, LW - 28);
  const hs = 26 + engagement.length * 14 + 8 + lp.length * 12 + em.length * 10 + 14;
  place(hs + 14); y -= 10;
  page.drawRectangle({ x: M, y: y - hs, width: LW, height: hs, color: rgb(1, 1, 1), borderColor: OR, borderWidth: 1.2 });
  page.drawText("SIGNATURE", { x: M + 14, y: y - 18, size: 7.5, font: bold, color: OR });
  let ys = y - 34;
  for (const l of engagement) { page.drawText(l, { x: M + 14, y: ys, size: 10, font: bold, color: VERT }); ys -= 14; }
  ys -= 6;
  for (const l of lp) { page.drawText(l, { x: M + 14, y: ys, size: 8.5, font: helv, color: GRIS }); ys -= 12; }
  for (const l of em) { page.drawText(l, { x: M + 14, y: ys, size: 7, font: mono, color: GRIS }); ys -= 10; }
  y -= hs;
  // Pied de page sur chaque page
  const pages = doc.getPages();
  const pied = net((ent.nom || "A.C.T.E.S") + " — association loi 1901 · Chalet Bellevue, 2 Impasse du Poujaou, 31110 Bagnères-de-Luchon" + (ent.email ? " · " + ent.email : ""));
  pages.forEach((p: any, i: number) => {
    p.drawRectangle({ x: M, y: 44, width: LW, height: 0.6, color: FILET });
    p.drawText(pied.slice(0, 130), { x: M, y: 30, size: 7, font: helv, color: GRIS });
    const n = "Page " + (i + 1) + " / " + pages.length;
    p.drawText(n, { x: W - M - helv.widthOfTextAtSize(n, 7), y: 30, size: 7, font: helv, color: GRIS });
  });
  const octets = await doc.save();
  let bin = "";
  for (let i = 0; i < octets.length; i += 0x8000) bin += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  return btoa(bin);
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
  const r = (await lireCollection(sb, "crm_actes_resas")).find((x) => x.jeton === jeton);
  if (r) return r;
  // Séjours Airbnb / Booking : lien de signature des 3 documents (créé depuis la page de la plateforme dans le logiciel)
  const p = (await lireCollection(sb, "actes_plateformes")).find((x) => x.jeton === jeton);
  return p ? resaPlateforme(p) : null;
}
/** Séjour Airbnb / Booking vu comme une réservation : documents seulement (ni adhésion, ni paiement : tout est réglé sur la plateforme). */
function resaPlateforme(p: any) {
  const nom = String(p.guest || "").trim();
  return { ...p, __col: "actes_plateformes", plateforme: String(p.platform || "la plateforme"), groupe: nom, contact: nom, debut: p.arrivee, fin: p.depart,
    adultes: num(p.guests) || 0, enfants: 0, statut: /annul/i.test(String(p.statut || "")) ? "annulee" : "confirmee", canal: String(p.platform || ""),
    email: String(p.email || ""), detailTarif: [], paiements: [], paiementsEnAttente: [] };
}
/** Collection où enregistrer une réservation (réservation directe ou séjour Airbnb / Booking). */
const colDe = (r: any) => (r && r.__col) || "crm_actes_resas";
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
  if (r.plateforme) return { aFaire: false, cotisation: 0, montant: 0, payee: true, remplie: false, type: "premiere", acces: "complet", ancien: null, derniere: "" };
  const lignes = (r.detailTarif || []).filter((l: any) => l.k === "adhesion");
  const aFaire = lignes.length > 0;
  const cotisation = num(cfg.adhesionSejour) || 30;
  const montant = r2(lignes.reduce((s: number, l: any) => s + num(l.montant), 0)) || cotisation;
  // Les paiements couvrent d'abord la cotisation (elle est comprise dans les arrhes) ; le bureau peut aussi la marquer réglée à la main.
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
4. Les documents et le règlement : vous signez les trois documents de la réservation (ce principe locatif, la convention d'utilisation et la convention de mise à disposition « sécurité »), en ligne et en une fois dans votre espace séjour avec un code reçu par e-mail, ou sur papier en les renvoyant signés par e-mail à l'association. Vous réglez ensuite les arrhes, qui comprennent la cotisation.
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

Le chalet est situé 2 Impasse du Poujaou, Domaine Bellevue, 31110 Bagnères-de-Luchon (avenue de Vénasque). C'est un centre de vacances agréé par la Direction départementale de la Jeunesse et des Sports de Toulouse sous le n° 031.042.089, établissement de type R, 5e catégorie.

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

À défaut de paiement de tout ou partie d'une échéance du loyer, et un mois après une mise en demeure de payer restée sans effet, la présente convention est résiliée de plein droit par A.C.T.E.S., sans qu'A.C.T.E.S. ait à justifier d'un préjudice.

## Article 9 — Signature électronique et preuve

L'utilisateur peut signer la présente convention, le principe locatif et la convention de mise à disposition « sécurité » en ligne, depuis son espace séjour, après s'être identifié par un code à usage unique envoyé à l'adresse e-mail de la réservation. Les parties conviennent que cette signature électronique a la même valeur que leur signature manuscrite. A.C.T.E.S. conserve le texte signé, son empreinte numérique, la date, l'heure et l'adresse IP de la signature ; ces enregistrements font preuve entre les parties. Un exemplaire des documents signés est envoyé à l'utilisateur par e-mail.`,
  },
  {
    id: "securite", titre: "Convention de mise à disposition — Sécurité",
    case: "Je reconnais avoir été informé(e) des dispositions de sécurité de cette convention et je m'engage à les appliquer et à les faire appliquer par mon groupe.",
    attestation: "J'atteste sur l'honneur que mon groupe est couvert par une assurance responsabilité civile (extension villégiature) pour toute la durée du séjour, et je m'engage à fournir l'attestation à l'association sur simple demande.",
    champs: [
      { id: "evacuation", lib: "Personne désignée pour vérifier l'évacuation (nom et prénom)" },
    ],
    texte: `Cette convention règle la sécurité pendant l'utilisation du Chalet Bellevue, 2 Impasse du Poujaou, Domaine Bellevue, 31110 Bagnères-de-Luchon. Elle est obligatoire pour valider la réservation et se signe au moment de la réservation, en ligne dans l'espace séjour ou sur papier en la renvoyant signée par e-mail. La personne qui la signe est appelée « l'organisateur ».

## I — Avant l'utilisation des locaux

L'organisateur atteste sur l'honneur avoir souscrit une assurance (extension villégiature) couvrant le séjour, et s'engage à présenter l'attestation à A.C.T.E.S. sur simple demande. Il s'engage également à :

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

Sapeurs-pompiers : 18 · SAMU : 15 · Numéro d'urgence européen : 112`,
  },
];
/** Documents signés d'une réservation (une acceptation en ligne de l'ancien contrat vaut convention d'utilisation).
 *  mode "electronique" : signé en ligne depuis l'espace séjour (code reçu par e-mail) ;
 *  mode "email" : document imprimé, signé et renvoyé par e-mail ou courrier — enregistré par l'équipe dans le dépôt, ou par
 *  l'agent des e-mails (script Google de l'association) : statut "valide" s'il est conforme, sinon "a_verifier" (un clic de l'équipe). */
function docsSignes(r: any): Record<string, any> {
  const s = { ...(r.documentsSignes || {}) };
  if (!s.utilisation && r.contratAccepte) s.utilisation = { mode: "electronique", nom: r.contratAccepte.nom, le: r.contratAccepte.le };
  // Ne comptent pas : anciens essais de dépôt de scan, documents reçus par e-mail encore « à vérifier » par l'équipe.
  for (const k of Object.keys(s)) if (!s[k] || s[k].statut === "refuse" || s[k].statut === "a_verifier" || s[k].mode === "scan") delete s[k];
  return s;
}
const docsComplets = (r: any) => { const s = docsSignes(r); return DOCS_RESA.every((d) => !!s[d.id]); };
// Séjours Airbnb / Booking : principe locatif adapté (réservation et paiement sur la plateforme). Texte à faire valider par le bureau.
const principePlateforme = (pf: string) => `Vous avez réservé le Chalet Bellevue sur ${pf}. Le chalet appartient à l'association A.C.T.E.S. (loi 1901), qui le met en location.

## Votre réservation

1. La réservation et son paiement se font sur ${pf}, selon les conditions de la plateforme.
2. Avant votre arrivée, vous signez les trois documents du séjour : ce principe locatif, la convention d'utilisation et la convention de mise à disposition « sécurité ». La signature se fait en ligne et en une fois dans votre espace séjour, avec un code reçu par e-mail, ou sur papier en renvoyant les documents signés par e-mail à l'association.
3. Vous recevez par e-mail un exemplaire de chaque document signé.

## Règlement

• Le prix du séjour et les conditions d'annulation sont ceux indiqués sur ${pf}.
• Le paiement du séjour se fait sur ${pf}.`;
const texteDoc = (d: any, cfg: any, r?: any) => r && r.plateforme && d.id === "principe" ? principePlateforme(String(r.plateforme)) : d.id === "utilisation" && cfg.reglement ? d.texte + "\n\n## Règlement intérieur\n\n" + String(cfg.reglement) : d.texte;

/** Clé du dépôt des documents de l'équipe (lien privé envoyé au bureau), dérivée du secret du site. */
async function jetonDepot() {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("depot-documents:" + (Deno.env.get("SITE_SECRET") || "")));
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
const lienDepot = async (ancre = "") => URL_SITE + "/equipe/documents?k=" + (await jetonDepot()) + (ancre ? "#" + ancre : "");
/** Empreinte SHA-256 complète (texte signé, code de signature). */
async function sha256(t: string) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
/** Exemplaire d'un document signé en ligne, en HTML (le script Google en fait un PDF rangé dans le dossier du client). */
function htmlExemplaire(d: any, r: any, v: any) {
  const e = (t: unknown) => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const corps = String(v.texte || "").trim().split(/\n\s*\n/).map((b) => {
    const l = b.split("\n").map((x) => x.trim()).filter(Boolean);
    if (l.length === 1 && l[0].startsWith("## ")) return "<h3>" + e(l[0].slice(3)) + "</h3>";
    if (l.every((x) => x.startsWith("• "))) return "<ul>" + l.map((x) => "<li>" + e(x.slice(2)) + "</li>").join("") + "</ul>";
    return "<p>" + l.map(e).join("<br>") + "</p>";
  }).join("");
  const ch = v.champs ? "<p>" + d.champs.map((c: any) => e(c.lib) + " : <b>" + e(v.champs[c.id]) + "</b>").join("<br>") + "</p>" : "";
  return "<html><head><meta charset='utf-8'><style>body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.4}h1{font-size:16pt}h3{font-size:12pt;margin:14px 0 4px}.sig{border:1px solid #999;padding:10px;margin-top:18px}</style></head><body>"
    + "<h1>" + e(d.titre) + "</h1><p><b>Réservation :</b> " + e(r.groupe || r.contact) + " — séjour du " + fd(r.debut) + " au " + fd(r.fin) + "</p>" + corps + ch + (v.attestation ? "<p>☑ <b>Attestation sur l'honneur :</b> " + e(v.attestation) + "</p>" : "")
    + "<div class='sig'><p>" + e(d.case) + "</p><p><b>Signé électroniquement par " + e(v.nom) + "</b> le " + e(new Date(v.le).toLocaleString("fr-FR", { timeZone: "Europe/Paris" }))
    + " (heure de Paris), après identification par un code envoyé à " + e(r.email) + ".<br>Adresse IP : " + e(v.ip || "—") + "<br>Empreinte SHA-256 du texte signé : " + e(v.version) + "</p></div></body></html>";
}
/** Nom du dossier Drive du client : nom du groupe, sinon nom de famille du contact, en majuscules. */
const frDate = (iso: unknown) => { const x = String(iso || ""); return /^\d{4}-\d{2}-\d{2}/.test(x) ? x.slice(8, 10) + "-" + x.slice(5, 7) + "-" + x.slice(0, 4) : x; };
const dossierClient = (r: any) => (String(r.groupe || "").trim() || String(r.contact || "").trim() || "SANS NOM")
  .toUpperCase().replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
const masquerEmail = (e: string) => String(e || "").replace(/^(.)[^@]*(@.*)$/, "$1•••$2");

/** Prévient le bureau quand les trois documents d'une réservation sont signés (une seule fois). */
async function siDocsComplets(sb: any, r: any, s: Record<string, any>) {
  if (r.documentsCompletsLe || !DOCS_RESA.every((d) => !!s[d.id])) return;
  await fusionDoc(sb, colDe(r), r.id, { documentsCompletsLe: new Date().toISOString() });
  if (!smtpConfigure()) return;
  const dest = Deno.env.get("SMTP_USER");
  if (!dest) return;
  const lignes = DOCS_RESA.map((d) => "• " + d.titre + " : " + (s[d.id].mode === "email" ? "reçu signé par e-mail (enregistré par " + (s[d.id].par || "l'équipe") + ")" : "signé en ligne par " + s[d.id].nom) + " le " + new Date(s[d.id].le).toLocaleString("fr-FR", { timeZone: "Europe/Paris" }));
  const af: any = r.adhesionFiche; if (af) lignes.push("• Adhésion " + (af.type === "renouvellement" ? "(renouvellement)" : "(nouvel adhérent)") + " : " + [af.civilite, af.prenom, af.nom].filter(Boolean).join(" ") + (af.email ? " — " + af.email : "") + (af.tel ? " — " + af.tel : ""));
  await envoyer({ to: dest, subject: "Documents signés : " + (r.groupe || r.contact || "réservation") + " (" + fd(r.debut) + ")",
    body: "Bonjour,\n\nLes trois documents de la réservation de " + (r.groupe || r.contact || "") + " du " + fd(r.debut) + " au " + fd(r.fin) + " sont signés :\n\n" + lignes.join("\n")
      + (s.securite && s.securite.champs ? "\n\nAssurance : " + (s.securite.champs.assureur ? s.securite.champs.assureur + " — contrat n° " + (s.securite.champs.police || "") : "attestée sur l'honneur (attestation à demander si besoin)") + "\nPersonne désignée pour l'évacuation : " + (s.securite.champs.evacuation || "") : "")
      + "\n\nLa réservation peut être validée."
      + "\n\nDépôt des documents : " + (await lienDepot("r-" + r.id)) + "\n\nLe logiciel A.C.T.E.S" }).catch(() => {});
}

// ----- Agent des e-mails -----
// Le script Google de l'association lit la boîte contact@ : pour chaque e-mail avec pièces jointes venant d'un client,
// il range les fichiers dans Drive (Réservations › RESERVATION <année> › <GROUPE>), lit le texte des pages (OCR Google)
// et fait regarder la signature par l'IA gratuite de Cloudflare, puis envoie ici son analyse :
// document conforme → compté comme signé ; doute → « à vérifier » (un clic de l'équipe). Le client reçoit un accusé de réception.
async function agent(sb: any, b: any, cfg: any, ent: any): Promise<Response> {
  const t = (v: unknown, n: number) => String(v == null ? "" : v).replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
  const resas = await lireCollection(sb, "crm_actes_resas");
  if (b.action === "agent-reservations") {
    const lim = addD(auj(), -30);
    const liste: any[] = [], exemplaires: any[] = [];
    for (const r of resas) {
      if (r.statut === "annulee" || (r.fin && r.fin < lim)) continue;
      const s = docsSignes(r), brut = r.documentsSignes || {};
      const docs = DOCS_RESA.map((d) => ({ id: d.id, titre: d.titre, champs: d.champs.map((c) => c.lib), statut: s[d.id] ? "signe" : brut[d.id] && brut[d.id].statut === "a_verifier" ? "a_verifier" : "manquant" }));
      const dossier = dossierClient(r), annee = String(r.debut || auj()).slice(0, 4);
      if (docs.some((d) => d.statut !== "signe")) liste.push({ id: String(r.id), email: String(r.email || "").toLowerCase(), contact: r.contact || "", groupe: r.groupe || "", debut: r.debut, fin: r.fin, annee, dossier, docs });
      for (const d of DOCS_RESA) {
        const v = brut[d.id];
        if (v && v.mode === "electronique" && v.texte && !v.driveId && exemplaires.length < 30) {
          const num = { principe: "2", utilisation: "3", securite: "4" }[d.id as "principe"] || "9";
          const court = { principe: "Principe locatif", utilisation: "Convention d'utilisation", securite: "Convention sécurité" }[d.id as "principe"] || d.titre;
          let pdf = "";
          try { pdf = await pdfExemplaire(d, r, v, ent); } catch (e) { console.error("pdf agent", String(e)); }
          exemplaires.push({ cle: String(r.id) + ":" + d.id, annee, dossier, nom: num + " - " + court + " - signé le " + frDate(v.le), pdf, html: pdf ? "" : htmlExemplaire(d, r, v) });
        }
      }
      // Bulletin d'adhésion rempli en ligne : rangé avec les documents du séjour.
      const fa = r.adhesionFiche;
      if (fa && fa.le && !fa.driveId && exemplaires.length < 30) {
        try {
          const oui = (x: unknown) => (x ? "oui" : "non");
          const dAdh = { titre: "Bulletin d'adhésion A.C.T.E.S — " + (fa.type === "renouvellement" ? "renouvellement" : "première adhésion"), case: "Bulletin rempli et signé en ligne par l'adhérent, qui a accepté les engagements de l'adhérent.",
            champs: [["civilite", "Civilité"], ["nom", "Nom"], ["prenom", "Prénom"], ["naissanceFr", "Date de naissance"], ["adresseComplete", "Adresse"], ["tel", "Téléphone"], ["email", "E-mail"], ["structure", "Structure / groupe"], ["source", "Comment nous avez-vous connus ?"], ["animal", "Animal"], ["droitImageTxt", "Droit à l'image"], ["infosEmailTxt", "Recevoir les informations par e-mail"], ["cotisationTxt", "Cotisation annuelle"]].map(([id, lib]) => ({ id, lib })) };
          const vals = { ...fa, naissanceFr: fa.naissance ? frDate(fa.naissance) : "", adresseComplete: [fa.adresse, [fa.cp, fa.ville].filter(Boolean).join(" ")].filter(Boolean).join(", "),
            droitImageTxt: oui(fa.droitImage), infosEmailTxt: oui(fa.infosEmail), cotisationTxt: fa.cotisation ? fa.cotisation + " € (année " + (fa.annee || "") + ")" : "" };
          const sig = fa.signature || {};
          const vAdh = { nom: sig.nom || (fa.prenom + " " + fa.nom), le: sig.le || fa.le, ip: sig.ip || "", version: sig.version || "", texte: "", champs: vals,
            acces: "depuis son espace séjour personnel (lien privé envoyé à " + (r.email || fa.email || "") + ")." };
          const pdf = await pdfExemplaire(dAdh, r, vAdh, ent);
          exemplaires.push({ cle: String(r.id) + ":adhesion", annee, dossier, nom: "1 - Bulletin d'adhésion - " + (fa.prenom || "") + " " + (fa.nom || "") + " - " + frDate(fa.le), pdf, html: "" });
        } catch (e) { console.error("pdf adhésion", String(e)); }
      }
    }
    return json({ resas: liste, exemplaires: exemplaires.slice(0, 30), cleIA: await sha256("agent-ia:" + (Deno.env.get("SITE_SECRET") || "")) });
  }
  if (b.action === "agent-ranges") {
    let n = 0;
    for (const f of (Array.isArray(b.faits) ? b.faits : []).slice(0, 60)) {
      const m = /^([\w-]{1,80}):(principe|utilisation|securite|adhesion)$/.exec(String(f && f.cle || ""));
      const r = m && resas.find((x) => String(x.id) === m[1]);
      if (m && r && m[2] === "adhesion") {
        if (r.adhesionFiche && /^[\w-]{10,}$/.test(String(f.driveId || ""))) { await fusionDoc(sb, colDe(r), r.id, { adhesionFiche: { ...r.adhesionFiche, driveId: String(f.driveId), driveUrl: t(f.driveUrl, 300) } }); n++; }
        continue;
      }
      if (!r || !r.documentsSignes || !r.documentsSignes[m[2]] || !/^[\w-]{10,}$/.test(String(f.driveId || ""))) continue;
      await fusionDoc(sb, colDe(r), r.id, { documentsSignes: { ...r.documentsSignes, [m[2]]: { ...r.documentsSignes[m[2]], driveId: String(f.driveId), driveUrl: t(f.driveUrl, 300) } } });
      r.documentsSignes = { ...r.documentsSignes, [m[2]]: { ...r.documentsSignes[m[2]], driveId: String(f.driveId) } };
      n++;
    }
    return json({ ok: true, marques: n });
  }
  if (b.action === "agent-documents") {
    const r = resas.find((x) => String(x.id) === String(b.resa));
    if (!r) return erreur("Réservation introuvable.", 404);
    const msg = { id: t(b.message && b.message.id, 80), de: t(b.message && b.message.de, 120), objet: t(b.message && b.message.objet, 200), date: t(b.message && b.message.date, 40) };
    const fichiers = (Array.isArray(b.fichiers) ? b.fichiers : []).slice(0, 20).map((f: any) => ({ nom: t(f.nom, 120), driveId: t(f.driveId, 80), driveUrl: t(f.driveUrl, 300) }));
    const s = docsSignes(r), le = new Date().toISOString();
    const ns = { ...(r.documentsSignes || {}) };
    const bilan: { d: any; ok: boolean; problemes: string[] }[] = [];
    for (const a of (Array.isArray(b.analyse) ? b.analyse : [])) {
      const d = DOCS_RESA.find((x) => x.id === a.doc);
      if (!d || s[d.id] || bilan.some((x) => x.d.id === d.id)) continue;
      const problemes = (Array.isArray(a.problemes) ? a.problemes : []).map((x: unknown) => t(x, 200)).filter(Boolean).slice(0, 8);
      if (b.expediteurReconnu !== true) problemes.unshift("Envoyé depuis une autre adresse que celle de la réservation (" + msg.de + ")");
      const ok = a.conforme === true && !problemes.length;
      const idx = (Array.isArray(a.fichiers) ? a.fichiers : []).map(Number).filter((i: number) => fichiers[i]);
      ns[d.id] = { mode: "email", statut: ok ? "valide" : "a_verifier", le, par: "agent des e-mails", verif: { problemes, mail: msg }, fichiers: idx.map((i: number) => fichiers[i]) };
      bilan.push({ d, ok, problemes });
    }
    if (!bilan.length) return json({ ok: true, rien: true });
    await fusionDoc(sb, colDe(r), r.id, { documentsSignes: ns });
    const s2 = docsSignes({ ...r, documentsSignes: ns });
    await siDocsComplets(sb, r, s2);
    if (smtpConfigure()) {
      const manquants = DOCS_RESA.filter((d) => !s2[d.id] && !(ns[d.id] && ns[d.id].statut === "a_verifier"));
      if (r.email) await envoyer({ to: r.email, subject: "Documents reçus — séjour du " + fd(r.debut) + " au " + fd(r.fin),
        body: "Bonjour " + (r.contact || "") + ",\n\nNous avons bien reçu vos documents :\n" + bilan.map((x) => "• " + x.d.titre + " : " + (x.ok ? "enregistré, merci" : "reçu, en cours de vérification par l'association")).join("\n")
          + (manquants.length ? "\n\nIl manque encore : " + manquants.map((d) => d.titre).join(", ") + ". Vous pouvez aussi les signer en ligne dans votre espace séjour :\n" + URL_SITE + "/sejour/" + r.jeton : "")
          + "\n\nBien cordialement,\n" + (ent.nom || "A.C.T.E.S") }).catch((e) => console.error("accusé documents", String(e)));
      const dest = Deno.env.get("SMTP_USER");
      if (dest && bilan.some((x) => !x.ok)) await envoyer({ to: dest, subject: "À vérifier : documents reçus par e-mail — " + (r.groupe || r.contact || "réservation"),
        body: "Bonjour,\n\nL'agent des e-mails a reçu des documents de " + (r.groupe || r.contact || "") + " (séjour du " + fd(r.debut) + " au " + fd(r.fin) + "), envoyés par " + msg.de + " le " + msg.date + ".\n\n"
          + bilan.map((x) => "• " + x.d.titre + " : " + (x.ok ? "conforme, enregistré" : "À VÉRIFIER\n" + x.problemes.map((p) => "    – " + p).join("\n"))).join("\n")
          + "\n\nFichiers rangés dans Drive :\n" + fichiers.map((f) => "• " + f.nom + " : " + f.driveUrl).join("\n")
          + "\n\nConfirmer ou refuser : " + (await lienDepot("r-" + r.id)) + "\n\nLe logiciel A.C.T.E.S" }).catch((e) => console.error("alerte équipe", String(e)));
    }
    return json({ ok: true, valides: bilan.filter((x) => x.ok).length, aVerifier: bilan.filter((x) => !x.ok).length });
  }
  if (b.action === "agent-a-trier") {
    const dest = smtpConfigure() ? Deno.env.get("SMTP_USER") : "";
    if (dest) await envoyer({ to: dest, subject: "À trier : documents reçus par e-mail sans réservation reconnue",
      body: "Bonjour,\n\nL'agent des e-mails a reçu des pièces jointes qui ressemblent à des documents de réservation, mais il n'a pas trouvé la réservation correspondante.\n\nDe : " + t(b.de, 120) + "\nObjet : " + t(b.objet, 200) + "\nRaison : " + t(b.raison, 200)
        + "\n\nLe message est marqué « ACTES/À trier » dans la boîte contact@. Rangez les documents et enregistrez-les dans le suivi des documents :\n" + (await lienDepot()) + "\n\nLe logiciel A.C.T.E.S" }).catch(() => {});
    return json({ ok: true });
  }
  return erreur("Action inconnue.");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const secret = Deno.env.get("SITE_SECRET");
  // L'agent des e-mails (script Google de l'association) s'identifie avec la clé de sauvegarde, pour ses seules actions « agent-… ».
  const cleAgent = Deno.env.get("BACKUP_SECRET");
  const parAgent = !!cleAgent && req.headers.get("x-backup-secret") === cleAgent;
  if (!parAgent && (!secret || req.headers.get("x-site-secret") !== secret)) return erreur("Non autorisé.", 401);
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
      acces: ea.acces, plateforme: r.plateforme || "",
      chalet: cfg.nomChalet, ville: cfg.ville, asso: ent.nom || "A.C.T.E.S", tel: cfg.telAsso || ent.tel || "", email: ent.email || "",
      groupe: r.groupe || "", contact: r.contact || "", debut: r.debut, fin: r.fin, nuits: nbN(r.debut, r.fin), personnes: pers(r),
      statut: r.statut, paiementDirect: !!r.paiementDirect, total: total(r), paye: paye(r), reste: Math.max(0, reste(r)), detail: r.detailTarif || [],
      echeancier: e.map((x: any) => ({ type: x.type, lib: x.lib, montant: x.montant, du: x.du, etat: x.etat, reste: x.reste })),
      caution: num((r.caution || {}).montant) || num(cfg.caution),
      contrat: { conditions: cfg.conditions || "", reglement: cfg.reglement || "", accepte: r.contratAccepte || null },
      // Les trois documents obligatoires pour valider la réservation, et leur état de signature
      documents: (() => { const s = docsSignes(r); return DOCS_RESA.map((d) => ({ id: d.id, titre: d.titre, case: d.case, champs: d.champs, attestation: (d as any).attestation || "", texte: texteDoc(d, cfg, r),
        signe: s[d.id] ? { mode: s[d.id].mode, nom: s[d.id].nom || "", le: s[d.id].le } : null,
        verification: !s[d.id] && r.documentsSignes && r.documentsSignes[d.id] && r.documentsSignes[d.id].statut === "a_verifier" ? { le: r.documentsSignes[d.id].le } : null })); })(),
      signature: { email: masquerEmail(r.email || ""), codeEnvoye: !!(r.signatureCode && r.signatureCode.empreinte && Date.parse(r.signatureCode.expire || "") > Date.now()), possible: !!((r.email || r.plateforme) && smtpConfigure()), saisirEmail: !!(r.plateforme && !r.email) },
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

    // ----- Agent des e-mails : documents renvoyés signés par e-mail, rangés dans Drive -----
    if (parAgent || String(b.action || "").startsWith("agent-")) {
      if (!parAgent) return erreur("Non autorisé.", 401);
      const res = await agent(sb, b, cfg, ent);
      return res;
    }

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
    // Suivi des 3 documents de chaque réservation ; l'équipe y enregistre ceux reçus signés par e-mail ou courrier.
    if (String(b.action || "").startsWith("depot")) {
      if (!b.k || b.k !== (await jetonDepot())) return erreur("Lien du dépôt invalide.", 401);
      const resas = await lireCollection(sb, "crm_actes_resas");
      if (b.action === "depot") {
        const lim = addD(auj(), -90);
        const liste = resas.filter((x) => x.statut !== "annulee" && (x.documentsSignes || x.contratAccepte || (x.fin && x.fin >= auj())) && (!x.fin || x.fin >= lim))
          .sort((x, y) => String(x.debut || "").localeCompare(String(y.debut || "")))
          .map((x) => {
            const s = docsSignes(x);
            return {
              id: String(x.id), groupe: x.groupe || "", contact: x.contact || "", email: x.email || "", debut: x.debut, fin: x.fin, statut: x.statut,
              docs: DOCS_RESA.map((d) => {
                const v = s[d.id], av = (x.documentsSignes || {})[d.id];
                if (!v && av && av.statut === "a_verifier") return { id: d.id, titre: d.titre, statut: "a_verifier", le: av.le, problemes: (av.verif && av.verif.problemes) || [], fichiers: av.fichiers || [], de: av.verif && av.verif.mail ? av.verif.mail.de : "" };
                if (!v) return { id: d.id, titre: d.titre, statut: "manquant" };
                return { id: d.id, titre: d.titre, statut: "signe", mode: v.mode, le: v.le, nom: v.nom || "", par: v.par || "", note: v.note || "", champs: v.champs || null, fichiers: v.fichiers || [], driveUrl: v.driveUrl || "" };
              }),
            };
          });
        return json({ resas: liste });
      }
      const r = resas.find((x) => String(x.id) === String(b.resa));
      const d = DOCS_RESA.find((x) => x.id === b.doc);
      if (!r || !d) return erreur("Document introuvable.", 404);
      const t = (v: unknown, n: number) => String(v == null ? "" : v).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
      const actuel = docsSignes(r)[d.id];
      if (b.action === "depot-recu") {
        if (actuel) return erreur("Ce document est déjà signé.", 409);
        const rec = { mode: "email", statut: "valide", le: new Date().toISOString(), par: t(b.par, 60) || "l'équipe", note: t(b.note, 200) };
        const s2 = { ...docsSignes(r), [d.id]: rec };
        await fusionDoc(sb, colDe(r), r.id, { documentsSignes: { ...(r.documentsSignes || {}), [d.id]: rec } });
        await siDocsComplets(sb, r, s2);
        return json({ ok: true });
      }
      const brutDoc = (r.documentsSignes || {})[d.id];
      if (b.action === "depot-confirmer") {
        if (!brutDoc || brutDoc.statut !== "a_verifier") return erreur("Ce document n'est pas en attente de vérification.", 409);
        const ns = { ...(r.documentsSignes || {}), [d.id]: { ...brutDoc, statut: "valide", par: t(b.par, 60) || "l'équipe", confirmeLe: new Date().toISOString() } };
        await fusionDoc(sb, colDe(r), r.id, { documentsSignes: ns });
        await siDocsComplets(sb, r, docsSignes({ ...r, documentsSignes: ns }));
        return json({ ok: true });
      }
      if (b.action === "depot-non-conforme") {
        if (!brutDoc || brutDoc.statut !== "a_verifier") return erreur("Ce document n'est pas en attente de vérification.", 409);
        const motif = t(b.motif, 400);
        if (motif.length < 3) return erreur("Merci d'indiquer ce qui ne va pas : ce sera envoyé au client.");
        const ns = { ...(r.documentsSignes || {}) };
        delete ns[d.id];
        await fusionDoc(sb, colDe(r), r.id, { documentsSignes: ns, documentsHistorique: [...(r.documentsHistorique || []), { doc: d.id, ...brutDoc, statut: "refuse", refus: { motif, par: t(b.par, 60), le: new Date().toISOString() } }].slice(-30) });
        let mail = false;
        if (smtpConfigure() && r.email) await envoyer({ to: r.email, subject: "Document à renvoyer pour votre séjour au " + cfg.nomChalet,
          body: "Bonjour " + (r.contact || "") + ",\n\nMerci pour l'envoi du document « " + d.titre + " ». Nous ne pouvons pas l'enregistrer : " + motif
            + "\n\nMerci de le renvoyer signé, ou de le signer en ligne depuis votre espace séjour :\n" + URL_SITE + "/sejour/" + r.jeton + "\n\nBien cordialement,\n" + (ent.nom || "A.C.T.E.S") }).then(() => { mail = true; }).catch(() => {});
        return json({ ok: true, mail });
      }
      if (b.action === "depot-retirer") {
        if (!actuel || actuel.mode !== "email") return erreur("Seul un document enregistré « reçu par e-mail » peut être retiré.", 409);
        const ns = { ...(r.documentsSignes || {}) };
        delete ns[d.id];
        await fusionDoc(sb, colDe(r), r.id, { documentsSignes: ns, documentsCompletsLe: null });
        return json({ ok: true });
      }
      return erreur("Action inconnue.");
    }

    const r = await trouver(sb, b.jeton || "");
    if (!r) return erreur("Séjour introuvable.", 404);
    if (r.statut === "annulee") return erreur("Cette réservation est annulée.", 409);

    // Accès à l'espace séjour selon l'adhésion : bulletin obligatoire d'abord, organisation seulement une fois la cotisation réglée.
    if (["espace", "accepter", "payer", "code-signature", "signer-tout"].includes(b.action)) {
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
      await fusionDoc(sb, colDe(r), r.id, { couchage, programme, espaceMajLe: new Date().toISOString() });
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
      await fusionDoc(sb, colDe(r), r.id, { adhesionFiche: enreg });
      // Une fiche par adresse e-mail. Si l'adhérent qui renouvelle a changé d'e-mail, on met à jour sa fiche existante.
      const idAdh = renouv && ea.ancien.id ? String(ea.ancien.id) : "adh_" + (await empreinte(fiche.email));
      const ancien = renouv ? ea.ancien : await lireDoc(sb, "crm_adherents", idAdh);
      await ecrireDoc(sb, "crm_adherents", idAdh, {
        ...(ancien || {}), ...fiche, id: idAdh, depuis: (ancien && ancien.depuis) || le.slice(0, 10), majLe: le,
        adhesions: [...((ancien && ancien.adhesions) || []).filter((a: any) => a.resa !== String(r.id)), { annee: enreg.annee, le, resa: String(r.id), cotisation: enreg.cotisation, type }],
      });
      if (smtpConfigure()) {
        const dest = Deno.env.get("SMTP_USER");
        if (dest && false) await envoyer({ to: dest, subject: (renouv ? "Renouvellement d'adhésion en ligne : " : "Nouvelle adhésion en ligne : ") + fiche.prenom + " " + fiche.nom,
          body: "Bonjour,\n\n" + fiche.civilite + " " + fiche.prenom + " " + fiche.nom + " vient de remplir son bulletin " + (renouv ? "de renouvellement d'adhésion" : "d'adhésion") + " en ligne pour le séjour du " + fd(r.debut) + " au " + fd(r.fin) + ".\n\n"
            + "Adresse : " + fiche.adresse + ", " + fiche.cp + " " + fiche.ville + "\nTéléphone : " + fiche.tel + "\nE-mail : " + fiche.email + (fiche.structure ? "\nStructure : " + fiche.structure : "")
            + "\nDroit à l'image : " + (fiche.droitImage ? "autorisé" : "refusé") + "\nInformations par e-mail : " + (fiche.infosEmail ? "oui" : "non")
            + "\n\nLa fiche est enregistrée dans le logiciel (réservation et liste des adhérents).\n\nLe logiciel A.C.T.E.S" }).catch(() => {});
      }
      return json({ ok: true });
    }

    // ----- Signature électronique des 3 documents, en une fois -----
    // Signature électronique simple (art. 1366-1367 du Code civil, règlement eIDAS) : pour que la preuve tienne,
    // le signataire est identifié par un code à usage unique envoyé à l'adresse e-mail de la réservation, et l'on garde
    // le texte exact signé, son empreinte SHA-256, la date, l'heure, l'adresse IP et le navigateur. Un exemplaire part au signataire.
    if (b.action === "code-signature") {
      if (docsComplets(r)) return json({ ok: true, deja: true });
      // Séjour Airbnb / Booking : le voyageur indique lui-même son adresse e-mail (la plateforme ne la transmet pas toujours).
      if (r.plateforme && !r.email) {
        const m = String(b.email || "").trim().toLowerCase();
        if (!/^[^@\s<>"']+@[^@\s<>"']+\.[a-z]{2,}$/i.test(m)) return erreur("Indiquez votre adresse e-mail pour recevoir le code de signature.", 400);
        await fusionDoc(sb, colDe(r), r.id, { email: m });
        r.email = m;
      }
      if (!r.email || !smtpConfigure()) return erreur("La signature en ligne n'est pas disponible pour cette réservation : merci d'imprimer les documents, de les signer et de les envoyer par e-mail à l'association.", 409);
      const avant = r.signatureCode && r.signatureCode.envoyeLe ? Date.parse(r.signatureCode.envoyeLe) : 0;
      if (Date.now() - avant < 60e3) return erreur("Un code vient d'être envoyé : merci de patienter une minute avant d'en demander un autre.", 429);
      const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1e6).padStart(6, "0");
      await fusionDoc(sb, colDe(r), r.id, { signatureCode: { empreinte: await sha256(r.id + ":" + code), envoyeLe: new Date().toISOString(), expire: new Date(Date.now() + 15 * 60e3).toISOString(), essais: 0 } });
      await envoyer({ to: r.email, subject: "Votre code de signature : " + code,
        body: "Bonjour " + (r.contact || "") + ",\n\nVoici votre code pour signer en ligne les documents de votre séjour au " + cfg.nomChalet + " du " + fd(r.debut) + " au " + fd(r.fin) + " :\n\n" + code
          + "\n\nIl est valable 15 minutes. Si vous n'avez pas demandé ce code, ignorez ce message.\n\n" + (ent.nom || "A.C.T.E.S") });
      return json({ ok: true, email: masquerEmail(r.email) });
    }

    if (b.action === "signer-tout") {
      const s = docsSignes(r);
      const aSigner = DOCS_RESA.filter((d) => !s[d.id]);
      if (!aSigner.length) return json({ ok: true, deja: true });
      const t = (v: unknown, n: number) => String(v == null ? "" : v).replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
      const c = r.signatureCode || {};
      if (!c.empreinte) return erreur("Demandez d'abord votre code de signature.");
      if (Date.parse(c.expire || "") < Date.now()) return erreur("Ce code a expiré : demandez-en un nouveau.");
      if (num(c.essais) >= 5) return erreur("Trop d'essais : demandez un nouveau code.");
      if ((await sha256(r.id + ":" + t(b.code, 6).replace(/\D/g, ""))) !== c.empreinte) {
        await fusionDoc(sb, colDe(r), r.id, { signatureCode: { ...c, essais: num(c.essais) + 1 } });
        return erreur("Code incorrect.");
      }
      const nom = t(b.nom, 120);
      if (nom.length < 3 || !/\s/.test(nom)) return erreur("Merci de signer en tapant votre prénom et votre nom.");
      if (b.accepte !== true) return erreur("Merci de cocher la case d'acceptation des documents.");
      const champs: Record<string, string> = {};
      for (const d of aSigner) for (const ch of d.champs) {
        champs[ch.id] = t((b.champs || {})[ch.id], 120) || (ch.id === "evacuation" ? t(r.contact, 120) : "");
        if (champs[ch.id].length < 2) return erreur("Merci de compléter : " + ch.lib.toLowerCase() + ".");
      }
      if (aSigner.some((d: any) => d.attestation) && b.attestationAssurance !== true) return erreur("Merci de cocher l'attestation sur l'honneur d'assurance.");
      const le = new Date().toISOString(), ip = t(b.ip, 60), ua = t(b.ua, 200);
      const ns = { ...(r.documentsSignes || {}) };
      const exemplaires: { filename: string; content: string; mimeType: string }[] = [];
      for (const d of aSigner) {
        const texte = texteDoc(d, cfg, r);
        const ch = d.champs.length ? Object.fromEntries(d.champs.map((x) => [x.id, champs[x.id]])) : null;
        const rec = { mode: "electronique", statut: "valide", nom, le, ip, ua, identification: "code à usage unique envoyé à " + r.email, version: await sha256(texte), texte, ...(ch ? { champs: ch } : {}), ...((d as any).attestation ? { attestation: (d as any).attestation } : {}) };
        ns[d.id] = rec;
        const preuve = d.titre + "\n\nRéservation : " + (r.groupe || r.contact || "") + " — séjour du " + fd(r.debut) + " au " + fd(r.fin) + "\n\n" + texte.replace(/^## /gm, "").replace(/^• /gm, "- ")
          + (ch ? "\n\n" + d.champs.map((x) => x.lib + " : " + ch[x.id]).join("\n") : "")
          + ((d as any).attestation ? "\n\n[x] " + (d as any).attestation : "")
          + "\n\n----------\n" + d.case + "\nSigné électroniquement par " + nom + " le " + new Date(le).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })
          + " (heure de Paris), après identification par un code envoyé à " + r.email + ".\nAdresse IP : " + (ip || "—") + "\nEmpreinte SHA-256 du texte signé : " + rec.version + "\n";
        let pdf = "";
        try { pdf = await pdfExemplaire(d, r, rec, ent); } catch (e) { console.error("pdf exemplaire", String(e)); }
        const nomFichier = d.titre.replace(/[^\wÀ-ÿ' -]+/g, " ").replace(/\s+/g, " ").trim() + " - signé";
        exemplaires.push(pdf ? { filename: nomFichier + ".pdf", content: pdf, mimeType: "application/pdf" }
          : { filename: nomFichier + ".txt", content: btoa(String.fromCharCode(...new TextEncoder().encode(preuve))), mimeType: "text/plain; charset=utf-8" });
      }
      await fusionDoc(sb, colDe(r), r.id, { documentsSignes: ns, signatureCode: null,
        ...(aSigner.some((d) => d.id === "utilisation") && !r.contratAccepte ? { contratAccepte: { le, nom, ip, ua, version: ns.utilisation.version } } : {}) });
      // Un exemplaire des documents signés pour le signataire (support durable) ; copie au bureau.
      if (smtpConfigure()) {
        await envoyer({ to: r.email, subject: "Vos documents signés — séjour du " + fd(r.debut) + " au " + fd(r.fin),
          body: "Bonjour " + (r.contact || "") + ",\n\nVous avez signé en ligne, le " + new Date(le).toLocaleString("fr-FR", { timeZone: "Europe/Paris" }) + " :\n" + aSigner.map((d) => "• " + d.titre).join("\n")
            + "\n\nVous trouverez en pièces jointes un exemplaire de chaque document signé, à conserver.\n\nBien cordialement,\n" + (ent.nom || "A.C.T.E.S"),
          attachments: exemplaires }).catch((e) => console.error("exemplaire signé", String(e)));
      }
      await siDocsComplets(sb, r, docsSignes({ ...r, documentsSignes: ns }));
      return json({ ok: true, signes: aSigner.length });
    }

    if (b.action === "accepter") {
      if (r.contratAccepte) return json({ ok: true, deja: true });
      const nom = String(b.nom || "").trim().slice(0, 120);
      if (nom.length < 2) return erreur("Merci d'indiquer votre nom.");
      const version = await empreinte(String(cfg.conditions) + "\n" + String(cfg.reglement));
      const acc = { le: new Date().toISOString(), nom, ip: String(b.ip || "").slice(0, 60), ua: String(b.ua || "").slice(0, 200), version };
      await fusionDoc(sb, colDe(r), r.id, { contratAccepte: acc });
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
      await fusionDoc(sb, colDe(r), r.id, { paiementsEnAttente: [...(r.paiementsEnAttente || []), { intentId: String(intent.id), type, montant, le: new Date().toISOString() }] });
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
