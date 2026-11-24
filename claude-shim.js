/*
 * A.C.T.E.S — passerelle Supabase
 * L'application a été écrite pour l'API « window.claude.use(...) » des artefacts Claude.
 * Ce fichier fournit la même API, branchée sur Supabase (base de données, comptes,
 * temps réel, fonctions serveur), pour que l'appli tourne comme un logiciel autonome.
 */
(function () {
  "use strict";
  var CFG = window.ACTES_CONFIG || {};
  var URL0 = location.hash + location.search;
  if (!CFG.supabaseUrl || !CFG.supabaseAnonKey || /VOTRE|XXXX/.test(CFG.supabaseUrl + CFG.supabaseAnonKey)) {
    document.addEventListener("DOMContentLoaded", function () { ecranMessage("Configuration manquante", "Renseigne l'adresse et la clé publique Supabase dans le fichier <b>web/config.js</b> (voir GUIDE.md, étape 2)."); });
    window.claude = { use: function () { return new Promise(function () {}); } };
    return;
  }
  var sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit" }
  });
  window.__actesSupabase = sb;

  /* ---------------- session & rôle ---------------- */
  var session = null, profil = null, pretResolve, pret = new Promise(function (r) { pretResolve = r; });
  async function chargerProfil() {
    var r = await sb.from("acces").select("email,nom,role").eq("email", (session.user.email || "").toLowerCase()).maybeSingle();
    profil = r.data || null;
    return profil;
  }
  async function surSession(s, evt) {
    session = s;
    window.__actesEmail = s && s.user && s.user.email ? String(s.user.email).toLowerCase() : "";
    if (!s) { afficherConnexion(); return; }
    if (evt === "PASSWORD_RECOVERY" || /type=(invite|recovery)/.test(URL0) || window.__actesDoitChoisirMdp) {
      window.__actesDoitChoisirMdp = true; afficherChoixMdp(); return;
    }
    await chargerProfil();
    if (profil && estPartage() && !prenomCourant()) {
      var pen = ""; try { pen = sessionStorage.getItem("actes_prenom_saisi") || ""; sessionStorage.removeItem("actes_prenom_saisi"); } catch (e) {}
      if (nettoiePrenom(pen)) enregistrerPrenom(pen); else { demanderPrenom(); return; }
    }
    if (!profil) { ecranMessage("Accès non autorisé", "Le compte <b>" + esc(s.user.email) + "</b> n'a pas encore d'accès à l'application. Demande à un administrateur de l'ajouter.", true); return; }
    fermerEcran(); pretResolve(true); badgeCompte(); ecouterAutres();
  }
  sb.auth.onAuthStateChange(function (evt, s) {
    if (evt === "TOKEN_REFRESHED") { session = s; return; }
    if (evt === "SIGNED_OUT") { try { Object.keys(localStorage).forEach(function (k) { if (k.indexOf("actes_prenom:") === 0) localStorage.removeItem(k); }); } catch (e) {} session = null; location.reload(); return; }
    if (evt === "INITIAL_SESSION" || evt === "SIGNED_IN" || evt === "PASSWORD_RECOVERY" || evt === "USER_UPDATED") setTimeout(function () { surSession(s, evt); }, 0);
  });

  /* ---------------- compte partagé bureau@ : prénom obligatoire (24/11/2026) ---------------- */
  var COMPTE_PARTAGE = "bureau@chalet-bellevue.fr";
  function estPartage() { return !!(session && session.user && String(session.user.email || "").toLowerCase() === COMPTE_PARTAGE); }
  function nettoiePrenom(v) { var p = String(v || "").replace(/[<>"'`]/g, "").replace(/\s+/g, " ").trim().slice(0, 40); return p.length >= 2 ? p : ""; }
  function clePrenom() { return "actes_prenom:" + (session && session.user ? session.user.id : ""); }
  function prenomCourant() { try { return estPartage() ? (localStorage.getItem(clePrenom()) || "") : ""; } catch (e) { return ""; } }
  function enregistrerPrenom(p) { try { localStorage.setItem(clePrenom(), nettoiePrenom(p)); } catch (e) {} journal("connexion", "", "", {}); }
  function auteur() { var p = prenomCourant(); return p ? p + " (compte bureau)" : ((profil && profil.nom) || (session && session.user.email) || ""); }
  function demanderPrenom() {
    quandPret(function () {
      var o = ecran('<p style="font-size:14px;text-align:center">Compte partagé <b>' + esc(COMPTE_PARTAGE) + '</b> : indique ton prénom pour savoir qui fait quoi.</p><form id="ax-f"><label>Ton prénom</label><input id="ax-pr" autocomplete="given-name" maxlength="40" required><button class="ax-btn" id="ax-b">Continuer</button></form><button class="ax-lien" id="ax-out">Se déconnecter</button><div class="ax-msg" id="ax-m"></div>');
      o.querySelector("#ax-f").onsubmit = function (ev) {
        ev.preventDefault(); var v = nettoiePrenom(o.querySelector("#ax-pr").value);
        if (!v) { var m = o.querySelector("#ax-m"); m.className = "ax-msg ax-err"; m.textContent = "Prénom trop court."; return; }
        enregistrerPrenom(v); surSession(session, "OK");
      };
      o.querySelector("#ax-out").onclick = function () { sb.auth.signOut(); };
    });
  }
  /* journal des actions : qui a modifié quoi (collection « journal_actions ») */
  var JOURNAL = "journal_actions";
  function resumeDoc(d) {
    if (!d || typeof d !== "object") return "";
    var k = ["nom", "client", "groupe", "titre", "libelle", "contact", "objet", "numero", "email"];
    for (var i = 0; i < k.length; i++) { var v = d[k[i]]; if (v && typeof v !== "object") return String(v).slice(0, 80); }
    return "";
  }
  function journal(action, col, id, data) {
    if (!session || col === JOURNAL) return;
    var det = action === "modification" ? Object.keys(data || {}).slice(0, 8).join(", ") : resumeDoc(data);
    var jid = "j" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    sb.from(TABLE).insert({ collection: JOURNAL, id: jid, data: { onglet: ONGLET, le: new Date().toISOString(), qui: auteur(), email: session.user.email, prenom: prenomCourant() || null, action: action, col: col, doc: id, detail: det } }).then(function () {}, function () {});
  }
  async function afficherJournal() {
    var o = ecran('<p style="font-weight:700">Historique des actions</p><div id="ax-l" style="font-size:12px;max-height:60vh;overflow:auto">Chargement…</div><button class="ax-lien" id="ax-x">Fermer</button>');
    o.querySelector(".ax-box").style.maxWidth = "720px"; o.style.overflow = "auto";
    o.querySelector("#ax-x").onclick = fermerEcran;
    var r = await sb.from(TABLE).select("id,data").eq("collection", JOURNAL).order("id", { ascending: false }).limit(300);
    var l = o.querySelector("#ax-l");
    if (r.error) { l.textContent = r.error.message; return; }
    if (!r.data.length) { l.textContent = "Aucune action enregistrée pour l'instant."; return; }
    var NOMS = { crm_actes_resas: "Réservation", crm_actes_membres: "Membre", crm_clients: "Client", crm_factures: "Facture", crm_adherents: "Adhérent", crm_paiements_demandes: "Demande de paiement", chalet_blocages: "Blocage de dates", chalet_config: "Réglages", chalet_envois_auto: "Envoi automatique" };
    l.innerHTML = '<table class="ax-tab"><tr><td><b>Date</b></td><td><b>Qui</b></td><td><b>Action</b></td><td><b>Détail</b></td></tr>' + r.data.map(function (x) {
      var d = x.data || {}; var dt = new Date(d.le).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
      var quoi = d.action === "connexion" ? "Connexion" : (NOMS[d.col] || String(d.col || "").replace(/^crm_|^chalet_/, "")) + " — " + d.action;
      return "<tr><td style='white-space:nowrap'>" + esc(dt) + "</td><td><b>" + esc(d.qui || d.email || "") + "</b></td><td>" + esc(quoi) + "</td><td style='color:#6E7469'>" + esc(d.detail || "") + "</td></tr>";
    }).join("") + "</table>";
  }

  /* ---------------- travail à plusieurs : pas d'écrasement (24/11/2026) ----------------
     Chaque onglet retient la version de chaque fiche qu'il a lue. Au moment d'enregistrer :
     - champs modifiés ailleurs mais pas ici → on garde la version de l'autre (fusion automatique) ;
     - même champ modifié des deux côtés → enregistrement refusé + message, rien n'est écrasé. */
  var ONGLET = "o" + Math.random().toString(36).slice(2, 10);
  var lu = new Map(), mesEcritures = new Map();
  function canon(v) {
    if (v === undefined) return "u";
    if (v === null || typeof v !== "object") return JSON.stringify(v);
    if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
    return "{" + Object.keys(v).filter(function (k) { return v[k] !== undefined; }).sort().map(function (k) { return JSON.stringify(k) + ":" + canon(v[k]); }).join(",") + "}";
  }
  function egal(a, b) { return canon(a) === canon(b); }
  var LIB_CHAMPS = { statut: "statut", paiements: "paiements", acompte: "acompte", arrivee: "date d'arrivée", depart: "date de départ", montant: "montant", notes: "notes", note: "note" };
  async function dernierAuteur(col, id) {
    try {
      var r = await sb.from(TABLE).select("data").eq("collection", JOURNAL).eq("data->>col", col).eq("data->>doc", id).order("id", { ascending: false }).limit(5);
      var x = (r.data || []).map(function (y) { return y.data; }).filter(function (d) { return d && d.onglet !== ONGLET; })[0];
      return x ? (x.qui || x.email) + " (" + new Date(x.le).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) + ")" : "";
    } catch (e) { return ""; }
  }
  async function conflit(col, id, champs) {
    var qui = await dernierAuteur(col, id);
    var noms = champs.map(function (k) { return LIB_CHAMPS[k] || k; }).join(", ");
    var msg = (qui ? qui : "Quelqu'un") + " a modifié cette fiche (" + noms + ") pendant que tu travaillais dessus. Pour ne pas écraser son travail, ta modification n'a pas été enregistrée : clique sur « Actualiser », puis refais-la.";
    bandeauActualiser(msg, true);
    var x = new Error(msg); x.code = "conflit"; return x;
  }
  /* renvoie les données à écrire (fusionnées) ou lève une erreur de conflit */
  async function preparerEcriture(col, id, nouv, patch) {
    var k = col + "/" + id;
    if (!lu.has(k)) return nouv;
    var r = await sb.from(TABLE).select("data").eq("collection", col).eq("id", id).maybeSingle();
    if (r.error || !r.data) return nouv;
    var cur = r.data.data || {}, old = lu.get(k) || {}, out = {}, bad = [];
    Object.keys(nouv).forEach(function (c) { out[c] = nouv[c]; });
    var cles = {};
    [nouv, cur, old].forEach(function (o) { Object.keys(o || {}).forEach(function (c) { cles[c] = 1; }); });
    Object.keys(cles).forEach(function (c) {
      if (patch && !(c in nouv)) return;
      var a = old[c], v = cur[c], n = nouv[c];
      if (egal(a, v) || egal(n, v)) return;           // personne d'autre n'a touché ce champ, ou même valeur
      if (egal(n, a)) {                                // changé ailleurs, pas ici → on garde la version de l'autre
        if (patch) delete out[c]; else if (v === undefined) delete out[c]; else out[c] = v;
        return;
      }
      bad.push(c);                                     // changé des deux côtés → conflit
    });
    if (bad.length) throw await conflit(col, id, bad);
    return out;
  }

  /* ---------------- base de données (API compatible) ---------------- */
  var TABLE = "documents";
  function decoupe(path) { var i = path.indexOf("/"); return [path.slice(0, i), path.slice(i + 1)]; }
  function snapDoc(id, data) { return { id: id, exists: data != null, data: function () { return data == null ? undefined : JSON.parse(JSON.stringify(data)); } }; }
  function snapCol(rows) { var docs = rows.map(function (r) { return snapDoc(r.id, r.data); }); return { docs: docs, size: docs.length, empty: !docs.length, forEach: function (f) { docs.forEach(f); } }; }
  function erreur(e) { var x = new Error((e && e.message) || "Erreur de base de données"); x.code = (e && e.code) || "db"; return x; }
  async function lireCollection(col) {
    var out = [], pas = 1000, from = 0;
    for (;;) {
      var r = await sb.from(TABLE).select("id,data").eq("collection", col).order("id").range(from, from + pas - 1);
      if (r.error) throw erreur(r.error);
      (r.data || []).forEach(function (x) { lu.set(col + "/" + x.id, x.data); });
      out = out.concat(r.data || []);
      if (!r.data || r.data.length < pas) break;
      from += pas;
    }
    return out;
  }
  /* abonnements temps réel partagés par collection */
  var canaux = {};
  function abonner(col, surChange) {
    var c = canaux[col];
    if (!c) {
      c = canaux[col] = { ecouteurs: new Set(), canal: null };
      c.canal = sb.channel("col:" + col)
        .on("postgres_changes", { event: "*", schema: "public", table: TABLE, filter: "collection=eq." + col }, function (p) { c.ecouteurs.forEach(function (f) { try { f(p); } catch (e) {} }); })
        .subscribe();
    }
    c.ecouteurs.add(surChange);
    return function () { c.ecouteurs.delete(surChange); if (!c.ecouteurs.size) { sb.removeChannel(c.canal); delete canaux[col]; } };
  }
  function refDoc(col, id) {
    return {
      id: id, path: col + "/" + id,
      get: async function () { var r = await sb.from(TABLE).select("data").eq("collection", col).eq("id", id).maybeSingle(); if (r.error) throw erreur(r.error); if (r.data) lu.set(col + "/" + id, r.data.data); else lu.delete(col + "/" + id); return snapDoc(id, r.data ? r.data.data : null); },
      set: async function (data, opts) {
        if (opts && opts.merge) return this.update(data);
        var d = await preparerEcriture(col, id, nettoie(data), false);
        mesEcritures.set(col + "/" + id, Date.now());
        var r = await sb.from(TABLE).upsert({ collection: col, id: id, data: d }, { onConflict: "collection,id" });
        if (r.error) throw erreur(r.error);
        lu.set(col + "/" + id, d);
        journal("enregistrement", col, id, d);
      },
      update: async function (patch) {
        var p = await preparerEcriture(col, id, nettoie(patch), true);
        if (!Object.keys(p).length) return;
        mesEcritures.set(col + "/" + id, Date.now());
        var r = await sb.rpc("doc_update", { p_col: col, p_id: id, p_patch: p }); if (r.error) throw erreur(r.error);
        var k = col + "/" + id; if (lu.has(k)) { var n = Object.assign({}, lu.get(k) || {}, p); lu.set(k, n); }
        journal("modification", col, id, p);
      },
      delete: async function () { mesEcritures.set(col + "/" + id, Date.now()); var r = await sb.from(TABLE).delete().eq("collection", col).eq("id", id); if (r.error) throw erreur(r.error); lu.delete(col + "/" + id); journal("suppression", col, id, {}); },
      onSnapshot: function (cb, cbErr) {
        var actif = true, self = this;
        self.get().then(function (s) { actif && cb(s); }).catch(function (e) { cbErr && cbErr(e); });
        var stop = abonner(col, function (p) { var row = p.new && p.new.id ? p.new : p.old; if (!row || row.id !== id) return; cb(snapDoc(id, p.eventType === "DELETE" ? null : p.new.data)); });
        return function () { actif = false; stop(); };
      }
    };
  }
  function refCol(col) {
    return {
      id: col,
      doc: function (id) { return refDoc(col, id || ("d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8))); },
      add: async function (data) { var d = this.doc(); await d.set(data); return d; },
      get: async function () { return snapCol(await lireCollection(col)); },
      onSnapshot: function (cb, cbErr) {
        var actif = true, cache = new Map(), pret_ = false, file = [];
        function emettre() { cb(snapCol(Array.from(cache.values()))); }
        function appliquer(p) {
          if (p.eventType === "DELETE") { if (p.old && p.old.id) cache.delete(p.old.id); }
          else if (p.new && p.new.id) cache.set(p.new.id, { id: p.new.id, data: p.new.data });
        }
        var stop = abonner(col, function (p) { if (!pret_) { file.push(p); return; } appliquer(p); if (actif) emettre(); });
        lireCollection(col).then(function (rows) {
          rows.forEach(function (r) { cache.set(r.id, r); });
          file.forEach(appliquer); file = []; pret_ = true; if (actif) emettre();
        }).catch(function (e) { cbErr && cbErr(e); });
        return function () { actif = false; stop(); };
      }
    };
  }
  function nettoie(o) { return JSON.parse(JSON.stringify(o == null ? {} : o)); }
  var db = { collection: refCol, doc: function (path) { var p = decoupe(path); return refDoc(p[0], p[1]); } };

  /* ---------------- fonctions serveur ---------------- */
  async function fonction(nom, corps) {
    var r = await sb.functions.invoke(nom, { body: corps || {} });
    if (r.error) {
      var msg = r.error.message || "Erreur serveur";
      try { var j = await r.error.context.json(); if (j && j.error) msg = j.error; } catch (e) {}
      var x = new Error(msg); x.code = /non configur/i.test(msg) ? "indisponible" : "serveur"; throw x;
    }
    return r.data;
  }
  function blobB64(b) { return new Promise(function (ok, ko) { var f = new FileReader(); f.onload = function () { ok(String(f.result).split(",")[1]); }; f.onerror = ko; f.readAsDataURL(b); }); }
  var mcp = {
    callTool: async function (serveur, outil, args) {
      args = args || {};
      if (serveur === "Gmail") {
        if (outil === "create_draft") { var e = new Error("Les brouillons ne sont pas disponibles : utilise « Envoyer »."); e.code = "indisponible"; throw e; }
        var res = await fonction("envoyer-email", args);
        return { payload: res, content: [{ type: "text", text: JSON.stringify(res) }] };
      }
      if (serveur === "Google Calendar") {
        var a = await fonction("agenda", { action: outil, args: args });
        return { payload: a, content: [{ type: "text", text: JSON.stringify(a) }] };
      }
      var x = new Error("Service « " + serveur + " » non disponible dans cette version."); x.code = "indisponible"; throw x;
    }
  };
  var sample = {
    limits: async function () { return { images: { mediaTypes: ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"] } }; },
    json: async function (prompt, opts) { return (await appelIA(prompt, opts, "json")).resultat; },
    text: async function (prompt, opts) { return (await appelIA(prompt, opts, "text")).resultat; }
  };
  async function appelIA(prompt, opts, mode) {
    var imgs = [];
    var src = (opts && opts.images) || [];
    for (var i = 0; i < src.length; i++) { var b = src[i]; if (b instanceof Blob) imgs.push({ mediaType: b.type || "image/jpeg", data: await blobB64(b) }); }
    var messages = opts && opts.messages;
    return fonction("ia", { prompt: prompt, images: imgs, mode: mode, messages: messages, system: opts && opts.system });
  }
  var user = {
    isOwner: async function () { return !!profil && profil.role === "admin"; },
    can: async function (perm) { if (!profil) return false; if (perm === "data.write") return profil.role !== "lecture"; return true; },
    info: async function () { return { email: session && session.user.email, nom: prenomCourant() ? auteur() : (profil && profil.nom), prenom: prenomCourant() || null, role: profil && profil.role }; }
  };
  var downloads = {
    save: async function (o) { var u = URL.createObjectURL(o.data instanceof Blob ? o.data : new Blob([o.data])); var a = document.createElement("a"); a.href = u; a.download = o.filename || "fichier"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 4000); return { ok: true }; }
  };
  var permissions = { manage: async function () { return true; } };
  // Pas d'IA payante dans le logiciel : la lecture automatique des factures et l'assistant d'estimation
  // (API Claude, facturée à l'usage) sont désactivés. Sans « sample », l'appli masque ces fonctions et tout le reste marche.
  var caps = { db: db, mcp: mcp, sample: null, user: user, downloads: downloads, permissions: permissions, comments: null };
  window.claude = {
    use: async function (nom) { await pret; return caps.hasOwnProperty(nom) ? caps[nom] : null; }
  };
  window.__actesServeur = { fonction: fonction, profil: function () { return profil; }, supabase: sb };

  /* ---------------- interface : connexion & compte ---------------- */
  var VERT = "#1F3D2B", OR = "#C0693E";
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var css = ".ax-ov{position:fixed;inset:0;z-index:2147483000;background:linear-gradient(160deg,#1F3D2B,#2A4D38 60%,#3B5E46);display:flex;align-items:center;justify-content:center;padding:16px;font-family:Inter,system-ui,sans-serif}" +
    ".ax-box{background:#FAF6EF;border-radius:18px;max-width:380px;width:100%;padding:28px 24px;box-shadow:0 20px 60px rgba(0,0,0,.35);color:#23302A}" +
    ".ax-box h1{font-family:Fraunces,Georgia,serif;font-size:24px;margin:8px 0 2px;color:#1F3D2B;text-align:center}.ax-sub{font-size:12px;letter-spacing:.12em;color:#B98D46;text-align:center;margin-bottom:20px}" +
    ".ax-box label{display:block;font-size:12px;font-weight:600;color:#6E7469;margin:12px 0 4px}.ax-box input,.ax-box select{width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid #E8E3D8;border-radius:10px;font-size:15px;background:#fff}" +
    ".ax-btn{width:100%;margin-top:18px;padding:12px;border:0;border-radius:10px;background:" + OR + ";color:#fff;font-weight:700;font-size:15px;cursor:pointer}.ax-btn[disabled]{opacity:.6}" +
    ".ax-lien{background:none;border:0;color:" + OR + ";font-size:13px;margin-top:12px;cursor:pointer;width:100%}.ax-msg{font-size:13px;margin-top:12px;text-align:center;min-height:18px}.ax-err{color:#C2410C}.ax-ok{color:#2E6B3A}" +
    ".ax-badge{position:fixed;top:10px;right:12px;z-index:2147482000;width:34px;height:34px;border-radius:50%;border:2px solid #fff;background:" + VERT + ";color:#fff;font:700 14px Inter,sans-serif;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.2)}" +
    ".ax-menu{position:fixed;top:50px;right:12px;z-index:2147482001;background:#fff;border:1px solid #E8E3D8;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.15);padding:12px;min-width:230px;font:14px Inter,sans-serif;color:#23302A}" +
    ".ax-menu button{display:block;width:100%;text-align:left;padding:8px;border:0;background:none;border-radius:8px;cursor:pointer;font-size:14px}.ax-menu button:hover{background:#F4F0E8}" +
    ".ax-tab{width:100%;border-collapse:collapse;font-size:13px;margin-top:8px}.ax-tab td{padding:6px 4px;border-top:1px solid #F0ECE3}" +
    "@media (max-width:767px){.ax-badge{top:auto;bottom:calc(env(safe-area-inset-bottom,0px) + 72px);right:10px;width:30px;height:30px;font-size:12px}.ax-menu{top:auto;bottom:calc(env(safe-area-inset-bottom,0px) + 110px)}}";
  function style() { if (document.getElementById("ax-style")) return; var s = document.createElement("style"); s.id = "ax-style"; s.textContent = css; document.head.appendChild(s); }
  var LOGO = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="64" height="64" style="display:block;margin:0 auto"><rect width="200" height="200" rx="44" fill="#1f3d2b"/><g transform="translate(18,15) scale(0.82)"><circle cx="146" cy="54" r="12" fill="#b98d46"/><polygon points="12,152 64,72 108,152" fill="#faf6ef" opacity="0.35"/><polygon points="96,152 138,88 178,152" fill="#faf6ef" opacity="0.22"/><rect x="38" y="181" width="124" height="5" rx="2.5" fill="#faf6ef" opacity="0.18"/><polygon points="53,152 100,83 147,152" fill="#faf6ef"/><polygon points="86,109 100,89 114,109 107,109 100,98 93,109" fill="#1f3d2b" opacity="0.92"/><rect x="76" y="152" width="48" height="34" fill="#1f3d2b" stroke="#faf6ef" stroke-width="3"/><rect x="81" y="160" width="10" height="10" rx="1.5" fill="#faf6ef" opacity="0.85"/><rect x="109" y="160" width="10" height="10" rx="1.5" fill="#faf6ef" opacity="0.85"/><path d="M92,186 V168 a8,8 0 0 1 16,0 v18 z" fill="#c0693e"/></g></svg>';
  function ecran(html) {
    style();
    var o = document.getElementById("ax-ov");
    if (!o) { o = document.createElement("div"); o.id = "ax-ov"; o.className = "ax-ov"; (document.body || document.documentElement).appendChild(o); }
    o.innerHTML = '<div class="ax-box">' + LOGO + '<h1>A.C.T.E.S</h1><div class="ax-sub">CHALET BELLEVUE · GESTION</div>' + html + "</div>";
    return o;
  }
  function fermerEcran() { var o = document.getElementById("ax-ov"); if (o) o.remove(); }
  function ecranMessage(titre, texte, deco) {
    var o = ecran('<p style="font-weight:700;text-align:center">' + esc(titre) + '</p><p style="font-size:14px;text-align:center">' + texte + "</p>" + (deco ? '<button class="ax-btn" id="ax-out">Changer de compte</button>' : ""));
    var b = o.querySelector("#ax-out"); if (b) b.onclick = function () { sb.auth.signOut(); };
  }
  function quandPret(f) { if (document.body) f(); else document.addEventListener("DOMContentLoaded", f); }
  function afficherConnexion() {
    quandPret(function () {
      var o = ecran('<form id="ax-f"><label>E-mail</label><input id="ax-e" type="email" autocomplete="username" required><label>Mot de passe</label><input id="ax-p" type="password" autocomplete="current-password" required><div id="ax-prw" style="display:none"><label>Ton prénom (compte bureau partagé)</label><input id="ax-pr0" autocomplete="given-name" maxlength="40"></div><button class="ax-btn" id="ax-b">Se connecter</button></form><button class="ax-lien" id="ax-oubli">Mot de passe oublié ?</button><div class="ax-msg" id="ax-m"></div>');
      var m = o.querySelector("#ax-m");
      var ie = o.querySelector("#ax-e"), ipr = o.querySelector("#ax-pr0");
      function majPr() { var p = ie.value.trim().toLowerCase() === COMPTE_PARTAGE; o.querySelector("#ax-prw").style.display = p ? "" : "none"; ipr.required = p; }
      ie.addEventListener("input", majPr); ie.addEventListener("change", majPr); setTimeout(majPr, 300);
      o.querySelector("#ax-f").onsubmit = async function (ev) {
        ev.preventDefault(); var b = o.querySelector("#ax-b");
        if (ie.value.trim().toLowerCase() === COMPTE_PARTAGE) { if (!nettoiePrenom(ipr.value)) { m.className = "ax-msg ax-err"; m.textContent = "Indique ton prénom."; return; } try { sessionStorage.setItem("actes_prenom_saisi", ipr.value); } catch (e) {} }
        b.disabled = true; m.className = "ax-msg"; m.textContent = "Connexion…";
        var r = await sb.auth.signInWithPassword({ email: o.querySelector("#ax-e").value.trim(), password: o.querySelector("#ax-p").value });
        b.disabled = false;
        if (r.error) { m.className = "ax-msg ax-err"; m.textContent = /invalid/i.test(r.error.message) ? "E-mail ou mot de passe incorrect." : r.error.message; }
      };
      o.querySelector("#ax-oubli").onclick = async function () {
        var e = o.querySelector("#ax-e").value.trim();
        if (!e) { m.className = "ax-msg ax-err"; m.textContent = "Saisis d'abord ton e-mail."; return; }
        var r = await sb.auth.resetPasswordForEmail(e, { redirectTo: location.origin + location.pathname });
        m.className = "ax-msg " + (r.error ? "ax-err" : "ax-ok"); m.textContent = r.error ? r.error.message : "Si ce compte existe, un e-mail vient de partir pour choisir un nouveau mot de passe.";
      };
    });
  }
  function afficherChoixMdp() {
    quandPret(function () {
      var o = ecran('<p style="font-size:14px;text-align:center">Bienvenue ! Choisis ton mot de passe pour <b>' + esc(session.user.email) + '</b>.</p><form id="ax-f"><label>Nouveau mot de passe (8 caractères min.)</label><input id="ax-p1" type="password" minlength="8" autocomplete="new-password" required><label>Confirmation</label><input id="ax-p2" type="password" minlength="8" autocomplete="new-password" required><button class="ax-btn" id="ax-b">Enregistrer</button></form><div class="ax-msg" id="ax-m"></div>');
      var m = o.querySelector("#ax-m");
      o.querySelector("#ax-f").onsubmit = async function (ev) {
        ev.preventDefault();
        var p1 = o.querySelector("#ax-p1").value, p2 = o.querySelector("#ax-p2").value;
        if (p1 !== p2) { m.className = "ax-msg ax-err"; m.textContent = "Les deux mots de passe sont différents."; return; }
        var r = await sb.auth.updateUser({ password: p1 });
        if (r.error) { m.className = "ax-msg ax-err"; m.textContent = r.error.message; return; }
        window.__actesDoitChoisirMdp = false; URL0 = ""; history.replaceState(null, "", location.pathname); surSession(session, "OK");
      };
    });
  }
  /* Les modules principaux (clients, devis, factures, réservations…) chargent leurs données à l'ouverture :
     si quelqu'un d'autre les modifie pendant ce temps, on propose d'actualiser. */
  var ecoute = false, tAutres = null;
  function ecouterAutres() {
    if (ecoute) return; ecoute = true;
    var NOMS_C = { crm_actes_resas: "une réservation", crm_actes_membres: "un membre", crm_clients: "un client", crm_factures: "une facture", crm_adherents: "un adhérent", crm_paiements_demandes: "une demande de paiement" };
    var nomme = 0;
    sb.channel("autres").on("postgres_changes", { event: "*", schema: "public", table: TABLE }, function (p) {
      var row = p.new && p.new.collection ? p.new : p.old || {};
      // modifications faites depuis un autre appareil / onglet, avec le prénom (journal)
      if (row.collection === JOURNAL) {
        var d = p.new && p.new.data; if (!d || d.onglet === ONGLET || d.action === "connexion") return;
        if (!/^(crm_|conciergerie|chalet_blocages)/.test(d.col || "")) return;
        nomme = Date.now(); clearTimeout(tAutres);
        bandeauActualiser((d.qui || d.email || "Un autre membre") + " vient de modifier " + (NOMS_C[d.col] || "des données") + (d.detail && d.action !== "modification" ? " (" + d.detail + ")" : "") + ".");
        return;
      }
      if (!/^(crm_|conciergerie)/.test(row.collection || "")) return;
      var t = mesEcritures.get(row.collection + "/" + row.id);
      if (t && Date.now() - t < 15000) return;          // c'est moi (cet onglet)
      clearTimeout(tAutres); tAutres = setTimeout(function () { if (Date.now() - nomme > 5000) bandeauActualiser(); }, 2500);
    }).subscribe();
  }
  function bandeauActualiser(texte, alerte) {
    var d = document.getElementById("ax-maj");
    if (!d) {
      d = document.createElement("div"); d.id = "ax-maj";
      d.innerHTML = "<span></span><button style='background:#C0693E;color:#fff;border:0;border-radius:8px;padding:6px 10px;font-weight:700;cursor:pointer;white-space:nowrap'>Actualiser</button><button style='background:none;border:0;color:#fff;cursor:pointer'>✕</button>";
      var b = d.querySelectorAll("button"); b[0].onclick = function () { location.reload(); }; b[1].onclick = function () { d.remove(); };
      document.body.appendChild(d);
    }
    d.style.cssText = "position:fixed;left:50%;transform:translateX(-50%);top:12px;z-index:2147482500;max-width:min(92vw,620px);background:" + (alerte ? "#9A3412" : "#1F3D2B") + ";color:#fff;border-radius:12px;padding:10px 14px;font:14px Inter,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.25);display:flex;gap:10px;align-items:center";
    d.querySelector("span").textContent = texte || "Un autre membre a modifié des données.";
  }
  var ROLES = { admin: "Administrateur", bureau: "Bureau (toute l'appli)", menage: "Ménage / exploitation", lecture: "Lecture seule" };
  function badgeCompte() {
    style();
    if (document.getElementById("ax-badge")) return;
    var b = document.createElement("button"); b.id = "ax-badge"; b.className = "ax-badge"; b.title = "Mon compte";
    b.textContent = (prenomCourant() || (profil && profil.nom) || session.user.email || "?").trim().charAt(0).toUpperCase();
    b.onclick = function () { var m = document.getElementById("ax-menu"); if (m) { m.remove(); return; } menuCompte(); };
    document.body.appendChild(b);
  }
  function menuCompte() {
    var m = document.createElement("div"); m.id = "ax-menu"; m.className = "ax-menu";
    m.innerHTML = '<div style="padding:4px 8px 10px;border-bottom:1px solid #F0ECE3;margin-bottom:6px"><b>' + esc(prenomCourant() ? auteur() : (profil.nom || session.user.email)) + '</b><div style="font-size:12px;color:#6E7469">' + esc(session.user.email) + " · " + esc(ROLES[profil.role] || profil.role) + "</div></div>" +
      (profil.role === "admin" ? '<button id="ax-acc">👥 Gérer les accès</button>' : "") + (profil.role === "admin" || profil.role === "bureau" ? '<button id="ax-hist">🕘 Historique des actions</button>' : "") + '<button id="ax-mdp">🔑 Changer mon mot de passe</button><button id="ax-out">↩ Se déconnecter</button>';
    document.body.appendChild(m);
    m.querySelector("#ax-out").onclick = function () { sb.auth.signOut(); };
    m.querySelector("#ax-mdp").onclick = function () { m.remove(); window.__actesDoitChoisirMdp = true; afficherChoixMdp(); };
    var a = m.querySelector("#ax-acc"); if (a) a.onclick = function () { m.remove(); gererAcces(); };
    var hi = m.querySelector("#ax-hist"); if (hi) hi.onclick = function () { m.remove(); afficherJournal(); };
  }
  async function gererAcces() {
    var o = ecran('<p style="font-weight:700">Accès à l\'application</p><div id="ax-l" style="font-size:13px">Chargement…</div>' +
      '<p style="font-weight:700;margin-top:16px">Inviter une personne</p><form id="ax-f"><label>E-mail</label><input id="ax-e" type="email" required><label>Nom</label><input id="ax-n"><label>Rôle</label><select id="ax-r">' +
      Object.keys(ROLES).map(function (k) { return '<option value="' + k + '"' + (k === "bureau" ? " selected" : "") + ">" + ROLES[k] + "</option>"; }).join("") +
      '</select><button class="ax-btn" id="ax-b">Envoyer l\'invitation</button></form><div class="ax-msg" id="ax-m"></div><button class="ax-lien" id="ax-x">Fermer</button>');
    o.querySelector(".ax-box").style.maxWidth = "460px"; o.style.overflow = "auto";
    var m = o.querySelector("#ax-m");
    async function lister() {
      var r = await sb.from("acces").select("email,nom,role").order("nom");
      var l = o.querySelector("#ax-l");
      if (r.error) { l.textContent = r.error.message; return; }
      l.innerHTML = '<table class="ax-tab">' + r.data.map(function (x) {
        return "<tr><td><b>" + esc(x.nom || "") + "</b><br><span style='color:#6E7469'>" + esc(x.email) + "</span></td><td><select data-e='" + esc(x.email) + "' style='padding:6px;font-size:12px'>" + Object.keys(ROLES).map(function (k) { return '<option value="' + k + '"' + (k === x.role ? " selected" : "") + ">" + ROLES[k] + "</option>"; }).join("") + "</select></td><td>" + (x.email === session.user.email.toLowerCase() ? "" : "<button data-del='" + esc(x.email) + "' style='border:0;background:none;color:#C2410C;cursor:pointer'>Retirer</button>") + "</td></tr>";
      }).join("") + "</table>";
      l.querySelectorAll("select").forEach(function (s) { s.onchange = async function () { var r = await sb.from("acces").update({ role: s.value }).eq("email", s.dataset.e); m.className = "ax-msg " + (r.error ? "ax-err" : "ax-ok"); m.textContent = r.error ? r.error.message : "Rôle mis à jour."; }; });
      l.querySelectorAll("[data-del]").forEach(function (b) { b.onclick = async function () { if (!confirm("Retirer l'accès de " + b.dataset.del + " ?")) return; var r = await sb.from("acces").delete().eq("email", b.dataset.del); m.className = "ax-msg " + (r.error ? "ax-err" : "ax-ok"); m.textContent = r.error ? r.error.message : "Accès retiré."; lister(); }; });
    }
    lister();
    o.querySelector("#ax-f").onsubmit = async function (ev) {
      ev.preventDefault(); m.className = "ax-msg"; m.textContent = "Envoi…";
      try {
        await fonction("inviter", { email: o.querySelector("#ax-e").value.trim(), nom: o.querySelector("#ax-n").value.trim(), role: o.querySelector("#ax-r").value, redirectTo: location.origin + location.pathname });
        m.className = "ax-msg ax-ok"; m.textContent = "Invitation envoyée."; o.querySelector("#ax-f").reset(); lister();
      } catch (e) { m.className = "ax-msg ax-err"; m.textContent = e.message; }
    };
    o.querySelector("#ax-x").onclick = fermerEcran;
  }
})();
