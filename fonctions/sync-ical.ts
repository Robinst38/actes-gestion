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
  confirmation: { nom: "Confirmation de réservation", sujet: "Confirmation de votre réservation au {chalet} du {arrivee} au {depart}", corps: "Bonjour {contact},\n\nNous avons le plaisir de vous confirmer la réservation du {chalet} pour {groupe}, du {arrivee} au {depart} ({nuits} nuits), pour {personnes} personnes.\n\nMontant total : {total}\nAcompte à verser : {acompte}\nSolde : {solde}, à régler au plus tard le {echeance_solde}\nCaution : {caution}\n\nLe contrat de location et le règlement intérieur sont joints à ce message : merci de nous retourner le contrat signé avec l'acompte.\n\nÀ très bientôt,\n{asso}" },
  j7: { nom: "Infos pratiques (J-7)", sujet: "Votre séjour au {chalet} approche", corps: "Bonjour {contact},\n\nVotre arrivée au {chalet} est prévue le {arrivee}. Voici les informations pratiques :\n\n{infos}\n\nPour rappel, le solde restant dû est de {reste}.\n\nNous restons disponibles pour toute question.\n\nBon voyage,\n{asso}" },
  arrivee: { nom: "Bienvenue (arrivée)", sujet: "Bienvenue au {chalet} !", corps: "Bonjour {contact},\n\nBienvenue au {chalet} ! Nous espérons que l'installation se passe bien.\n\nEn cas de besoin pendant le séjour, vous pouvez nous joindre au {tel_asso}.\n\nTrès bon séjour,\n{asso}" },
  avis: { nom: "Après le séjour (avis)", sujet: "Merci pour votre séjour au {chalet}", corps: "Bonjour {contact},\n\nMerci d'avoir séjourné au {chalet} du {arrivee} au {depart}. Nous espérons que tout s'est bien passé.\n\nVotre avis compte beaucoup pour l'association : vous pouvez le laisser ici en une minute :\n{lien_avis}\n\nAu plaisir de vous accueillir à nouveau,\n{asso}" },
  relance: { nom: "Relance de paiement", sujet: "Rappel : règlement de votre réservation au {chalet}", corps: "Bonjour {contact},\n\nSauf erreur de notre part, nous n'avons pas encore reçu le règlement de {montant_du} pour votre séjour du {arrivee} au {depart} (échéance : {echeance}).\n\nMerci de procéder au règlement dès que possible. Si c'est déjà fait, merci de ne pas tenir compte de ce message.\n\nBien cordialement,\n{asso}" },
  caution: { nom: "Restitution de la caution", sujet: "Restitution de votre caution – {chalet}", corps: "Bonjour {contact},\n\nSuite à l'état des lieux de sortie, nous vous restituons votre caution de {caution}{retenue_txt}.\n\nMerci encore pour votre séjour,\n{asso}" },
};

function config(c: any) {
  const o = { nomChalet: "Chalet Bellevue", ville: "Bagnères-de-Luchon", acomptePct: 30, soldeJours: 30, caution: "", infosPratiques: "", lienAvis: "", telAsso: "", ...(c || {}) };
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

function echeancier(r: any, cfg: any) {
  const T = total(r), pct = num(cfg.acomptePct), ac = r2(T * pct / 100), so = r2(T - ac), pa = paye(r);
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
    lien_avis: cfg.lienAvis || "", asso: (ent && ent.nom) || "L'association", tel_asso: cfg.telAsso || (ent && ent.tel) || "",
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

// ----- sync-ical/index.ts -----
// Synchronisation automatique des calendriers Airbnb / Booking (lancée toutes les heures)


const BLOCAGE = /not available|blocked|indisponible|bloqu/i;
async function hash(s: string) {
  const d = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 20);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const qui = await autoriser(req, ["admin", "bureau"]);
  if (!qui) return erreur("Non autorisé.", 401);
  const sb = admin();
  const cfg = (await lireDoc(sb, "chalet_config", "main")) || {};
  const flux: { plateforme: string; url: string; ignorerBlocages?: boolean }[] = (cfg.icalSync || []).filter((f: any) => f && f.url);
  const t = auj();
  const existants = await lireCollection(sb, "actes_plateformes");
  const parRef = new Map(existants.filter((p) => p.ref).map((p) => [p.ref, p]));
  const rapport: any[] = [];
  for (const f of flux) {
    const r0 = { plateforme: f.plateforme, ajoutes: 0, modifies: 0, annules: 0, erreur: "" };
    try {
      const rep = await fetch(f.url, { headers: { "User-Agent": "ACTES-Gestion/1.0" }, signal: AbortSignal.timeout(20000) });
      if (!rep.ok) throw new Error("HTTP " + rep.status);
      const ignorer = f.ignorerBlocages ?? f.plateforme === "Airbnb";
      const ev = parseIcs(await rep.text()).filter((e) => e.uid && !/chalet-bellevue/i.test(e.uid) && !(ignorer && BLOCAGE.test(e.titre || "")));
      const vus = new Set<string>();
      for (const e of ev) {
        vus.add(e.uid);
        if (e.fin < addJ(t, -400)) continue;
        const ex = parRef.get(e.uid);
        if (!ex) {
          const id = "ical_" + (await hash(f.plateforme + e.uid));
          const nom = String(e.titre || "").replace(/^(Reserved|Réservé|CLOSED)\s*-?\s*/i, "").replace(/^Not available$/i, "") || f.plateforme;
          await ecrireDoc(sb, "actes_plateformes", id, { platform: f.plateforme, ref: e.uid, arrivee: e.debut, depart: e.fin, guest: nom, guests: "", gross: 0, commission: 0, payout: 0, statut: "Confirmée", source: "ical", notes: "Synchronisé automatiquement depuis le calendrier " + f.plateforme + (e.desc ? " — " + String(e.desc).slice(0, 200) : ""), createdAt: new Date().toISOString() });
          r0.ajoutes++;
        } else if (ex.source === "ical" && (ex.arrivee !== e.debut || ex.depart !== e.fin) && !/annul/i.test(ex.statut || "")) {
          await fusionDoc(sb, "actes_plateformes", ex.id, { arrivee: e.debut, depart: e.fin, notes: (ex.notes || "") + " · Dates modifiées le " + t });
          r0.modifies++;
        }
      }
      // séjours futurs disparus du calendrier = annulés sur la plateforme
      for (const ex of existants) {
        if (ex.source !== "ical" || ex.platform !== f.plateforme || /annul/i.test(ex.statut || "") || !(ex.arrivee >= t) || vus.has(ex.ref)) continue;
        await fusionDoc(sb, "actes_plateformes", ex.id, { statut: "Annulée", notes: (ex.notes || "") + " · Disparu du calendrier " + f.plateforme + " le " + t + " (annulation probable)" });
        r0.annules++;
      }
    } catch (e) {
      r0.erreur = e instanceof Error ? e.message : String(e);
    }
    rapport.push(r0);
  }
  await ecrireDoc(sb, "chalet_sync", "ical", { date: new Date().toISOString(), rapport });
  return json({ ok: true, rapport });
});
function addJ(iso: string, n: number) { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
