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
    + "Association A.C.T.E.S · Chalet Bellevue, 2 Impasse du Poujaou, 31110 Bagnères-de-Luchon<br>"
    + '<a href="https://www.chalet-bellevue.fr" style="color:' + GRIS + ';">www.chalet-bellevue.fr</a> · Une question ? Répondez simplement à cet e-mail.'
    + "</td></tr></table></td></tr></table></body></html>";
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
    if (auto.j1 && ["confirmee", "soldee", "arrivee"].includes(r.statut) && r.debut >= t && nbN(t, r.debut) <= 1 && !m.j1) await envoi(r, "j1", "j1");
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

  // Planning du ménage : chaque lundi, les rotations des 14 prochains jours au prestataire
  let menage = false;
  const pm = cfg.prestataireMenage || {};
  const lundi = new Date(t + "T12:00:00Z").getUTCDay() === 1;
  if (auto.menage && pm.email && (lundi || new URL(req.url).searchParams.get("menage") === "1") && !journal.has("planning_menage__" + t)) {
    const platsM = (await lireCollection(sb, "actes_plateformes")).filter((p) => p.arrivee && p.depart && !/annul/i.test(p.statut || ""));
    const sejM = [
      ...resas.filter((r) => actif(r) && r.debut && r.fin).map((r) => ({ k: "d" + r.id, nom: r.groupe || r.contact || "Réservation", debut: r.debut, fin: r.fin, pers: pers(r), src: "Direct" })),
      ...platsM.map((p) => ({ k: "p" + p.id, nom: p.guest || p.platform || "Voyageur", debut: p.arrivee, fin: p.depart, pers: num(p.guests), src: p.platform || "Plateforme" })),
    ];
    const fin14 = new Date(t + "T12:00:00Z"); fin14.setUTCDate(fin14.getUTCDate() + 14);
    const lim = fin14.toISOString().slice(0, 10);
    const rot = sejM.filter((x) => x.fin >= t && x.fin <= lim).sort((a, b) => a.fin.localeCompare(b.fin)).map((x) => {
      const nx = sejM.filter((y) => y.debut >= x.fin && y.k !== x.k).sort((a, b) => a.debut.localeCompare(b.debut))[0];
      return { x, nx, meme: !!nx && nx.debut === x.fin };
    });
    const lignes = rot.map(({ x, nx, meme }) => `${fd(x.fin)} — départ de ${x.nom} (${x.src})` +
      (nx ? (meme ? ` — ⚠ ARRIVÉE LE JOUR MÊME : ${nx.nom}, linge pour ${nx.pers || "?"} pers.` : ` — prochaine arrivée le ${fd(nx.debut)} (${nx.nom}, linge pour ${nx.pers || "?"} pers.)`) : " — pas d'arrivée prévue ensuite"));
    const intro = `Bonjour${pm.nom ? " " + pm.nom : ""},\n\n`;
    const corps = intro + (lignes.length ? `Voici les ménages à prévoir au ${cfg.nomChalet} dans les 2 prochaines semaines :\n\n${lignes.map((l) => "• " + l).join("\n")}\n\n` : `Aucun départ n'est prévu au ${cfg.nomChalet} dans les 2 prochaines semaines.\n\n`) +
      `Merci de nous confirmer vos disponibilités${cfg.telAsso ? " (" + cfg.telAsso + ")" : ""}.\n\nBonne semaine,\n${ent.nom || "L'association"}`;
    const html = `<div style="font:14px/1.55 Arial,sans-serif;color:#23302A"><p>${echapper(intro.trim())}</p>` +
      (lignes.length ? `<p>Voici les ménages à prévoir au <b>${echapper(cfg.nomChalet)}</b> dans les 2 prochaines semaines :</p><table style="border-collapse:collapse;width:100%">` +
        rot.map(({ x, nx, meme }) => `<tr><td style="padding:8px;border-top:1px solid #E5DED0;white-space:nowrap;vertical-align:top"><b>${echapper(fd(x.fin))}</b></td><td style="padding:8px;border-top:1px solid #E5DED0">Départ de ${echapper(x.nom)} <span style="color:#6E7469">(${echapper(x.src)})</span><br>` +
          (nx ? (meme ? `<b style="color:#B3261E">⚠ Arrivée le jour même</b> : ${echapper(nx.nom)} — linge pour <b>${nx.pers || "?"}</b> pers.` : `Prochaine arrivée le ${echapper(fd(nx.debut))} : ${echapper(nx.nom)} — linge pour <b>${nx.pers || "?"}</b> pers.`) : `<span style="color:#6E7469">Pas d'arrivée prévue ensuite</span>`) + `</td></tr>`).join("") + `</table>`
        : `<p>Aucun départ n'est prévu au <b>${echapper(cfg.nomChalet)}</b> dans les 2 prochaines semaines.</p>`) +
      `<p>Merci de nous confirmer vos disponibilités${cfg.telAsso ? " (" + echapper(cfg.telAsso) + ")" : ""}.</p><p>Bonne semaine,<br>${echapper(ent.nom || "L'association")}</p></div>`;
    try {
      if (!essai) {
        await envoyer({ to: pm.email, subject: `Planning ménage — ${cfg.nomChalet} — semaine du ${fd(t)}`, body: corps, htmlBody: html, replyTo: ent.email || undefined });
        await ecrireDoc(sb, "chalet_envois_auto", "planning_menage__" + t, { type: "planning_menage", date: t, a: pm.email, rotations: rot.length });
      }
      faits.push({ resa: "Prestataire ménage", type: "planning ménage", a: pm.email });
      menage = true;
    } catch (e) { erreurs.push({ resa: "Prestataire ménage", type: "planning ménage", erreur: e instanceof Error ? e.message : String(e) }); }
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
  return json({ ok: true, essai, envoyes: faits, erreurs, recap, menage });
});
