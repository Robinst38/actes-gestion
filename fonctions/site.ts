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
    if (dest) await envoyer({ to: dest, subject: "Paiement en ligne reçu : " + eur(tot) + " — " + (r.groupe || r.contact || "réservation"),
      body: "Bonjour,\n\nUn paiement en ligne (HelloAsso) de " + eur(tot) + " vient d'être reçu pour le séjour de " + (r.groupe || r.contact || "") + " du " + fd(r.debut) + " au " + fd(r.fin) + ".\nIl est déjà enregistré dans le logiciel (fiche de la réservation › Tarif & paiements).\n\nLe logiciel A.C.T.E.S" }).catch(() => {});
  }
  return { enregistres: nouveaux };
}

// ----- site/index.ts -----
// Passerelle entre le site public (www.chalet-bellevue.fr) et le logiciel.
//   GET                       → dates occupées, tarifs, documents publiés (public)
//   GET  + x-site-secret      → idem + « sync » : décisions et paiements des demandes du site, infos pratiques
//   POST + x-site-secret      → enregistre une demande faite sur le site
//   POST + x-site-secret {action:"statuts"} → reporte dans le logiciel une décision prise sur le site




function nouveauJeton() { const a = new Uint8Array(18); crypto.getRandomValues(a); return Array.from(a).map((b) => b.toString(16).padStart(2, "0")).join(""); }

function nuits(debut: string, fin: string, out: Set<string>, depuis: string) {
  const n = Math.min(nbN(debut, fin), 400);
  for (let i = 0; i < n; i++) { const d = addD(debut, i); if (d >= depuis) out.add(d); }
}
const texte = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const sb = admin();
  const secret = Deno.env.get("SITE_SECRET");
  const autorise = !!secret && req.headers.get("x-site-secret") === secret;

  if (req.method === "GET") {
    const t = auj(), depuis = addD(t, -1);
    const blocked = new Set<string>();
    const resas = await lireCollection(sb, "crm_actes_resas");
    for (const r of resas) {
      if (!r.debut || !r.fin || ["annulee", "demande"].includes(r.statut)) continue;
      nuits(r.debut, r.fin, blocked, depuis);
    }
    for (const p of await lireCollection(sb, "actes_plateformes")) {
      if (!p.arrivee || !p.depart || /annul/i.test(p.statut || "")) continue;
      nuits(p.arrivee, p.depart, blocked, depuis);
    }
    // Dates bloquées (travaux, entretien…) : fermées tout de suite, avant même la synchro avec le site
    const blocages = await lireCollection(sb, "chalet_blocages");
    for (const b of blocages) {
      if (!b.debut || !b.fin || b.type === "no_checkin") continue;
      nuits(b.debut, b.fin, blocked, depuis);
    }
    const cfg = (await lireDoc(sb, "chalet_config", "main")) || {};
    // Tarifs : uniquement si la grille du logiciel a un prix « nuit chalet » (sinon le site garde la sienne)
    const rates = (cfg.saisons || [])
      .filter((s: any) => s && s.du && s.au && num(s.nuitChalet) > 0)
      .map((s: any) => ({ label: s.nom || "Tarif", start_month: num(String(s.du).slice(0, 2)), end_month: num(String(s.au).slice(0, 2)), price_per_night: num(s.nuitChalet), min_nights: num(cfg.minNuits) || 2 }));
    // Documents : seulement ceux que le bureau a choisi de publier
    const documents = {
      reglement: cfg.publierReglement ? texte(cfg.reglement) : null,
      conditions: cfg.publierConditions ? texte(cfg.conditions) : null,
    };
    const out: Record<string, unknown> = { blocked: [...blocked].sort(), rates: rates.length ? rates : null, documents, maj: new Date().toISOString() };
    if (autorise) {
      // Paiements HelloAsso en attente : vérifiés à chaque passage les 3 premières heures, puis tous les quarts d'heure
      if (helloassoConfigure()) {
        const quart = new Date().getUTCMinutes() % 15 === 0;
        for (const r of resas.filter((x) => (x.paiementsEnAttente || []).some((a: any) => quart || Date.now() - Date.parse(a.le || "") < 3 * 36e5)).slice(0, 10)) {
          await verifierPaiements(sb, r.id).catch((e) => console.error("verif paiement", String(e)));
        }
      }
      out.sync = {
        resas: resas.filter((r) => r.siteId).map((r) => ({ siteId: String(r.siteId), statut: r.statut || "demande", paye: paye(r), acompte: acompteDe(r, config(cfg)) })),
        infosPratiques: cfg.publierInfos ? texte(cfg.infosPratiques) : null,
        // Toutes les dates bloquées à venir, jour par jour (le relais les compare à celles du site)
        blocages: blocages.filter((b: any) => b.debut && b.fin && b.fin > depuis).flatMap((b: any) => {
          const out: any[] = [];
          for (let d = b.debut; d < b.fin && out.length < 800; d = addD(d, 1)) if (d >= depuis) out.push({ date: d, type: b.type === "no_checkin" ? "no_checkin" : "blocked", reason: b.motif || "" });
          return out;
        }),
      };
      // Mode maintenance du site (visible seulement avec le code d'accès) — jamais envoyé sans le secret
      const ent = await entreprise(sb).catch(() => ({} as any));
      out.maintenance = { actif: !!cfg.siteMaintenance, code: String(cfg.siteCodeApercu || "").trim(), contact: String(ent.email || "").trim() };

      // Connaissances de l'assistant du site (chat) : uniquement des informations publiques.
      // Jamais : Wi-Fi, consignes d'arrivée (codes, boîte à clés), rubriques du livret « Le chalet » / « Sécurité », noms des clients.
      const c = config(cfg);
      const propreTxt = (t: unknown) => String(t || "").split("\n").filter((l) => !/\[à compléter|\[heure|wi-?fi|code|cl[ée]s?\b|bo[iî]te/i.test(l)).join("\n").trim();
      const periodes: string[] = [];
      const fin12 = addD(t, 400);
      for (const r of resas) {
        if (!r.debut || !r.fin || ["annulee", "demande"].includes(r.statut) || r.fin < t || r.debut > fin12) continue;
        periodes.push(r.debut + " → " + r.fin);
      }
      for (const p of await lireCollection(sb, "actes_plateformes")) {
        if (!p.arrivee || !p.depart || /annul/i.test(p.statut || "") || p.depart < t || p.arrivee > fin12) continue;
        periodes.push(p.arrivee + " → " + p.depart);
      }
      for (const b of blocages) {
        if (!b.debut || !b.fin || b.type === "no_checkin" || b.fin < t || b.debut > fin12) continue;
        periodes.push(b.debut + " → " + b.fin + " (fermé)");
      }
      out.chat = {
        aujourdhui: t,
        chalet: c.nomChalet, ville: c.ville, capacite: num(c.capacite) || 24,
        heureArrivee: c.heureArrivee || "16 h", heureDepart: c.heureDepart || "10 h",
        nuitsMin: num(c.minNuits) || 2,
        saisons: (c.saisons || []).filter((s: any) => s && num(s.nuitChalet) > 0).map((s: any) => ({ nom: s.nom || "", du: s.du, au: s.au, nuit: num(s.nuitChalet) })),
        menage: num(c.menageForfait), adhesion: num(c.adhesionSejour), acomptePct: num(c.acomptePct), soldeJours: num(c.soldeJours), caution: num(c.caution),
        taxe: c.taxeMode === "pourcentage" ? { pct: num(c.taxePct), plafond: num(c.taxePlafond), majoration: num(c.taxeMajoration) } : { forfait: num(c.taxeSejour) },
        conditions: c.publierConditions ? texte(c.conditions) : null,
        reglement: texte(c.reglement),
        infos: propreTxt(c.infosPratiques),
        depart: propreTxt(c.consignesDepart),
        rubriques: (c.livretSections || []).filter((x: any) => x && /autour|commerce|sant|animaux|d[ée]chet|tri|cuisine|chauffage|bienvenue/i.test(String(x.titre || "")))
          .map((x: any) => ({ titre: String(x.titre), texte: propreTxt(x.texte).slice(0, 1500) })).filter((x: any) => x.texte),
        activites: String(c.activitesSuggerees || "").split("\n").map((x) => x.trim()).filter(Boolean),
        occupe: periodes.sort().slice(0, 80),
        contact: { asso: ent.nom || "A.C.T.E.S", tel: c.telAsso || ent.tel || "", email: String(ent.email || "").trim() },
      };
    }
    return new Response(JSON.stringify(out), {
      headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  if (req.method === "POST") {
    if (!autorise) return erreur("Non autorisé.", 401);
    const b = await req.json().catch(() => null);
    if (!b) return erreur("Demande incomplète.");

    // Décisions prises dans l'espace admin du site → reportées sur les demandes encore « Demande » du logiciel
    if (b.action === "statuts") {
      const faits: string[] = [];
      for (const s of Array.isArray(b.statuts) ? b.statuts.slice(0, 200) : []) {
        const id = "site_" + String(s.siteId || "").replace(/[^\w-]/g, "");
        const r = await lireDoc(sb, "crm_actes_resas", id);
        if (!r || r.statut !== "demande") continue;
        if (s.status === "confirmed") await fusionDoc(sb, "crm_actes_resas", id, { statut: "confirmee", confirmeLe: auj() });
        else if (s.status === "cancelled") await fusionDoc(sb, "crm_actes_resas", id, { statut: "annulee" });
        else continue;
        faits.push(id);
      }
      return json({ ok: true, faits });
    }

    // Sauvegarde quotidienne de la base du site (Cloudflare D1) envoyée par le relais → collection site_sauvegarde
    // (incluse ensuite dans la sauvegarde hebdomadaire du logiciel vers Google Drive)
    if (b.action === "sauvegardeSite") {
      const tables = b.tables && typeof b.tables === "object" ? b.tables : {};
      const resume: Record<string, number> = {};
      for (const [nom, lignes] of Object.entries(tables)) resume[nom] = Array.isArray(lignes) ? lignes.length : 0;
      const le = new Date().toISOString();
      await ecrireDoc(sb, "site_sauvegarde", "derniere", { le, resume, tables });
      return json({ ok: true, le, resume });
    }

    // Dates bloquées après synchro site ↔ logiciel (le relais envoie la liste complète à venir) → collection chalet_blocages
    if (b.action === "blocages") {
      const dates = (Array.isArray(b.dates) ? b.dates : []).filter((d: any) => /^\d{4}-\d{2}-\d{2}$/.test(String(d && d.date)))
        .map((d: any) => ({ date: String(d.date), type: d.type === "no_checkin" ? "no_checkin" : "blocked", motif: String(d.reason || "").slice(0, 200) }))
        .sort((x: any, y: any) => (x.date < y.date ? -1 : 1));
      const periodes: any[] = [];
      for (const d of dates) {
        const der = periodes[periodes.length - 1];
        if (der && der.fin === d.date && der.type === d.type && der.motif === d.motif) der.fin = addD(d.date, 1);
        else periodes.push({ debut: d.date, fin: addD(d.date, 1), type: d.type, motif: d.motif });
      }
      const depuis = String(b.depuis || addD(auj(), -1));
      const existants = await lireCollection(sb, "chalet_blocages");
      const garder = new Set<string>();
      let ecrits = 0, retires = 0;
      for (const p of periodes) {
        // garde l'identifiant d'une période identique déjà connue (sinon nouvel identifiant)
        const ex = existants.find((x: any) => !garder.has(x.id) && x.fin === p.fin && x.type === p.type && (x.motif || "") === p.motif && (x.debut === p.debut || (x.debut < depuis && p.debut === depuis)));
        if (ex) { garder.add(ex.id); continue; }
        const id = "b_" + p.debut + "_" + p.type;
        garder.add(id);
        await ecrireDoc(sb, "chalet_blocages", id, { id, ...p, majLe: new Date().toISOString() });
        ecrits++;
      }
      for (const ex of existants) {
        if (garder.has(ex.id) || String(ex.fin || "") <= depuis) continue;
        await sb.from("documents").delete().eq("collection", "chalet_blocages").eq("id", ex.id);
        retires++;
      }
      return json({ ok: true, periodes: periodes.length, ecrits, retires });
    }

    if (!b.checkIn || !b.checkOut) return erreur("Demande incomplète.");
    const id = b.siteId ? "site_" + String(b.siteId).replace(/[^\w-]/g, "") : "site_" + Date.now().toString(36);
    if (await lireDoc(sb, "crm_actes_resas", id)) return json({ ok: true, deja: true, id });
    const adultes = Math.max(0, num(b.adults)), enfants = Math.max(0, num(b.minors));
    const montant = num(b.montant);
    // Détail du prix calculé par le site (location, ménage, adhésion, taxe) et acompte fixé par le site
    const detail = [
      { lib: "Location (" + nbN(String(b.checkIn).slice(0, 10), String(b.checkOut).slice(0, 10)) + " nuits)", montant: num(b.prixLocation), k: "loc" },
      { lib: "Forfait ménage", montant: num(b.prixMenage), k: "loc" },
      { lib: "Adhésion annuelle à l'association", montant: num(b.prixAdhesion), k: "adhesion" },
      { lib: "Taxe de séjour", montant: num(b.prixTaxe), k: "taxe" },
    ].filter((l) => l.montant > 0).map((l) => ({ ...l, montant: r2(l.montant) }));
    const statut = b.siteStatus === "confirmed" ? "confirmee" : "demande";
    const notes = [
      "Demande reçue depuis le site internet" + (b.siteId ? " (n° " + b.siteId + ")" : "") + ".",
      montant > 0 ? "Montant calculé par le site : " + montant.toFixed(2).replace(".", ",") + " € (location, ménage, adhésion et taxe de séjour compris)." : "",
      b.message ? "Message : " + String(b.message).slice(0, 2000) : "",
      b.paymentMethod === "online" ? "RÉSERVATION DIRECTE : le client règle les arrhes en ligne avant la validation par le bureau (à valider sous 48 h, ou à refuser en remboursant les arrhes dans HelloAsso)." : "Paiement souhaité : hors ligne.",
    ].filter(Boolean).join("\n");
    await ecrireDoc(sb, "crm_actes_resas", id, {
      id, creeLe: auj(), canal: "Site web", statut, ...(statut === "confirmee" ? { confirmeLe: auj() } : {}),
      groupe: "", contact: String(b.name || "").slice(0, 120), email: String(b.email || "").trim().toLowerCase().slice(0, 200), tel: String(b.phone || "").slice(0, 40),
      debut: String(b.checkIn).slice(0, 10), fin: String(b.checkOut).slice(0, 10),
      adultes: String(adultes), enfants: String(enfants), personnes: String(adultes + enfants),
      options: { menage: !!b.wantsCleaning }, tarif: montant > 0 ? String(montant) : "", paiements: [], notes, siteId: b.siteId ? String(b.siteId) : null,
      paiementDirect: b.paymentMethod === "online", jeton: nouveauJeton(), codeAcces: nouveauCode(), ...(detail.length ? { detailTarif: detail } : {}), ...(num(b.acompte) > 0 ? { acompteFixe: r2(num(b.acompte)) } : {}),
    });
    // Accusé de réception avec le code d'accès à l'espace séjour (si activé dans Automatisations)
    try {
      const cfgC = config(await lireDoc(sb, "chalet_config", "main"));
      const r = await lireDoc(sb, "crm_actes_resas", id);
      const m = cfgC.modeles.demande;
      if (cfgC.autoEmails.demande && m && r && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email || "") && smtpConfigure() && !(await lireDoc(sb, "chalet_envois_auto", id + "__demande"))) {
        const ent = await entreprise(sb).catch(() => ({} as any));
        const v = varsMsg({ ...r, id }, cfgC, ent);
        const sujet = remplir(m.sujet, v);
        await envoyer({ to: r.email, subject: sujet, body: remplir(m.corps, v), replyTo: ent.email || undefined });
        await ecrireDoc(sb, "chalet_envois_auto", id + "__demande", { resaId: id, type: "demande", cle: "demande", date: auj(), a: r.email, sujet });
      }
    } catch (e) {
      console.error("accusé de réception non envoyé", String(e));
    }
    return json({ ok: true, id, ...(b.paymentMethod === "online" ? { jeton: ((await lireDoc(sb, "crm_actes_resas", id)) || {}).jeton || "" } : {}) }, 201);
  }
  return erreur("Méthode non prise en charge.", 405);
});
