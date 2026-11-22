/* Bulletin d'adhésion en ligne — A.C.T.E.S. · Chalet Bellevue
 *
 * À afficher dans l'espace séjour (www.chalet-bellevue.fr/sejour/<jeton>) pour les nouveaux adhérents.
 *
 * Utilisation dans la page de l'espace séjour, après avoir chargé le séjour (GET ?jeton=…) :
 *
 *   <div id="adhesion"></div>
 *   <script src="/formulaire-adhesion.js"></script>
 *   ActesAdhesion.monter(document.getElementById("adhesion"), {
 *     sejour,                                   // la réponse JSON du GET (contient sejour.adhesion)
 *     envoyer: (corps) => posterAuRelais({ ...corps, jeton }),  // la fonction POST déjà utilisée par la page
 *   });
 *
 * `envoyer` reçoit { action:"adhesion", fiche, signature, ua } et doit renvoyer une promesse
 * de la réponse JSON du serveur ({ ok:true } ou { error:"…" }). Le relais ajoute l'IP comme pour « accepter ».
 */
(function () {
  "use strict";
  var CSS = [
    ".aa{--vert:#1F3D2B;--terra:#C0693E;--or:#B98D46;--creme:#FAF6EF;--encre:#23302A;--gris:#6B746E;--bord:#E6DCCB;font:15px/1.5 Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:var(--encre);background:var(--creme);border-radius:14px;overflow:hidden;max-width:760px;margin:0 auto}",
    ".aa *{box-sizing:border-box}",
    ".aa-tete{background:var(--vert);color:var(--creme);padding:22px 24px 18px;position:relative}",
    ".aa-tete:after{content:'';position:absolute;left:0;right:0;bottom:0;height:4px;background:linear-gradient(90deg,var(--terra) 0 62%,var(--or) 62% 100%)}",
    ".aa-kicker{font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--or);font-weight:600}",
    ".aa h2{font-family:Georgia,'Times New Roman',serif;font-size:24px;margin:4px 0 2px;line-height:1.15}",
    ".aa-tete p{margin:0;opacity:.85;font-size:14px}",
    ".aa-corps{padding:20px 24px 24px}",
    ".aa-intro{background:#fff;border-left:4px solid var(--terra);border-radius:0 8px 8px 0;padding:12px 14px;margin-bottom:18px}",
    ".aa h3{font-family:Georgia,'Times New Roman',serif;color:var(--vert);font-size:18px;margin:22px 0 10px;display:flex;align-items:center;gap:10px}",
    ".aa h3 span{width:24px;height:24px;border-radius:50%;background:var(--vert);color:var(--creme);font:600 12px Inter,sans-serif;display:inline-flex;align-items:center;justify-content:center;flex:none}",
    ".aa-carte{background:#fff;border:1px solid var(--bord);border-radius:10px;padding:16px}",
    ".aa-grille{display:grid;grid-template-columns:1fr 1fr;gap:12px 16px}",
    ".aa-plein{grid-column:1/-1}",
    ".aa label.aa-champ{display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--gris)}",
    ".aa input[type=text],.aa input[type=email],.aa input[type=tel],.aa input[type=date],.aa select{font:inherit;color:var(--encre);border:1px solid #CDBFA6;border-radius:8px;padding:10px 12px;background:#fff;min-height:44px;width:100%}",
    ".aa input:focus,.aa select:focus{outline:2px solid var(--or);outline-offset:1px;border-color:var(--or)}",
    ".aa-choix{display:flex;flex-wrap:wrap;gap:8px 18px;align-items:center}",
    ".aa-choix label,.aa-coche{display:flex;gap:10px;align-items:flex-start;cursor:pointer;font-size:14px;color:var(--encre)}",
    ".aa input[type=radio],.aa input[type=checkbox]{accent-color:var(--vert);width:18px;height:18px;margin:2px 0 0;flex:none}",
    ".aa ul{margin:0 0 8px;padding-left:20px}.aa li{margin:3px 0}",
    ".aa-note{font-size:13px;color:var(--gris);margin:8px 0 0}",
    ".aa-prix{display:flex;align-items:center;gap:16px}",
    ".aa-prix b{font-family:Georgia,serif;font-size:34px;color:var(--terra);white-space:nowrap}",
    ".aa-signe{font-family:'Brush Script MT','Segoe Script',cursive;font-size:22px!important;color:#23439E!important}",
    ".aa-bouton{margin-top:20px;width:100%;min-height:50px;border:0;border-radius:10px;background:var(--vert);color:var(--creme);font:600 16px Inter,sans-serif;cursor:pointer}",
    ".aa-bouton:hover{background:#2A5139}.aa-bouton:disabled{opacity:.6;cursor:wait}",
    ".aa-erreur{margin-top:12px;background:#FBEDE6;border:1px solid var(--terra);color:#8A3E1C;border-radius:8px;padding:10px 12px;font-size:14px}",
    ".aa-merci{text-align:center;padding:34px 24px}",
    ".aa-merci .aa-rond{width:56px;height:56px;border-radius:50%;background:var(--vert);color:var(--creme);display:inline-flex;align-items:center;justify-content:center;font-size:28px;margin-bottom:10px}",
    "@media (max-width:560px){.aa-grille{grid-template-columns:1fr}.aa-corps,.aa-tete{padding-left:16px;padding-right:16px}}",
  ].join("\n");

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function fdate(iso) { return iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4) : ""; }

  function tete(asso, chalet) {
    return '<div class="aa-tete"><div class="aa-kicker">Association ' + esc(asso) + " · " + esc(chalet) + '</div><h2>Bulletin d\'adhésion</h2><p>Association Culturelle des Travailleurs des Établissements Sociaux</p></div>';
  }

  function merci(racine, s, fiche) {
    racine.innerHTML = '<div class="aa">' + tete(s.asso || "A.C.T.E.S", s.chalet || "Chalet Bellevue") +
      '<div class="aa-merci"><div class="aa-rond">✓</div><h3 style="justify-content:center;margin-top:4px">Bienvenue dans l\'association !</h3>' +
      "<p>Votre bulletin d'adhésion" + (fiche && fiche.le ? " a été enregistré le " + esc(fdate(fiche.le.slice(0, 10))) : " est enregistré") +
      ".<br>La cotisation est comprise dans le montant de votre réservation.</p></div></div>";
  }

  function monter(racine, opts) {
    if (!document.getElementById("aa-style")) { var st = document.createElement("style"); st.id = "aa-style"; st.textContent = CSS; document.head.appendChild(st); }
    var s = opts.sejour || {}, a = s.adhesion || {};
    if (!a.aFaire) { racine.innerHTML = ""; return; }
    if (a.fiche) { merci(racine, s, a.fiche); return; }
    var cot = a.cotisation || 30;
    var morceaux = String(a.contact || "").trim().split(/\s+/);
    var contactAsso = s.email ? esc(s.email) : "l'association";

    racine.innerHTML = '<form class="aa" novalidate>' + tete(s.asso || "A.C.T.E.S", s.chalet || "Chalet Bellevue") + '<div class="aa-corps">' +
      '<div class="aa-intro">Bienvenue ! L\'adhésion annuelle à <b>A.C.T.E.S.</b> (' + cot + " €) est obligatoire pour séjourner au <b>" + esc(s.chalet || "Chalet Bellevue") +
      "</b>. Elle est déjà comprise dans le montant de votre réservation : il vous reste seulement à remplir ce bulletin.</div>" +

      '<h3><span>1</span>Vos coordonnées</h3><div class="aa-carte aa-grille">' +
      '<div class="aa-plein aa-choix"><label><input type="radio" name="civilite" value="Madame" required> Madame</label><label><input type="radio" name="civilite" value="Monsieur"> Monsieur</label></div>' +
      '<label class="aa-champ">Nom<input type="text" name="nom" autocomplete="family-name" required value="' + esc(morceaux.length > 1 ? morceaux.slice(-1)[0] : "") + '"></label>' +
      '<label class="aa-champ">Prénom<input type="text" name="prenom" autocomplete="given-name" required value="' + esc(morceaux.length > 1 ? morceaux.slice(0, -1).join(" ") : morceaux[0] || "") + '"></label>' +
      '<label class="aa-champ">Date de naissance<input type="date" name="naissance" autocomplete="bday" required></label>' +
      '<label class="aa-champ">Téléphone<input type="tel" name="tel" autocomplete="tel" required value="' + esc(a.tel) + '"></label>' +
      '<label class="aa-champ aa-plein">Adresse<input type="text" name="adresse" autocomplete="street-address" required></label>' +
      '<label class="aa-champ">Code postal<input type="text" name="cp" inputmode="numeric" maxlength="5" autocomplete="postal-code" required></label>' +
      '<label class="aa-champ">Ville<input type="text" name="ville" autocomplete="address-level2" required></label>' +
      '<label class="aa-champ aa-plein">E-mail<input type="email" name="email" autocomplete="email" required value="' + esc(a.email) + '"></label>' +
      '<label class="aa-champ aa-plein">Groupe, club ou structure représenté (facultatif)<input type="text" name="structure" value="' + esc(s.groupe) + '"></label>' +
      '<label class="aa-champ aa-plein">Comment avez-vous connu le chalet ?<select name="source"><option value="">— Choisir —</option><option>Site internet</option><option>Bouche-à-oreille</option><option>Office de tourisme</option><option>Autre</option></select></label>' +
      "</div>" +

      '<h3><span>2</span>Votre séjour</h3><div class="aa-carte">' +
      "<p style=\"margin:0 0 10px\">Du <b>" + esc(fdate(s.debut)) + "</b> (à partir de 16 h) au <b>" + esc(fdate(s.fin)) + "</b> (avant 10 h) · " + esc(s.personnes || "") + " personnes</p>" +
      '<label class="aa-champ">Animal (facultatif — il doit avoir été déclaré à la réservation)<input type="text" name="animal" placeholder="Ex. : un chien"></label></div>' +

      '<h3><span>3</span>Cotisation</h3><div class="aa-carte aa-prix"><b>' + cot + ' €</b><div>Une adhésion par réservation, déjà comprise dans votre réservation (ligne « Adhésion annuelle à l\'association »). Rien de plus à payer ici.</div></div>' +

      '<h3><span>4</span>Engagements</h3><div class="aa-carte">' +
      "<p style=\"margin:0 0 6px\">En adhérant à A.C.T.E.S., je m'engage, pour moi et pour mon groupe, à :</p><ul>" +
      "<li>respecter les statuts de l'association et le règlement intérieur du chalet ;</li>" +
      "<li>respecter le calme entre 22 h et 8 h, par égard pour le voisinage ;</li>" +
      "<li>ne pas fumer à l'intérieur et respecter les consignes de sécurité incendie ;</li>" +
      "<li>trier les déchets et rendre le chalet rangé, la vaisselle propre et les poubelles vidées ;</li>" +
      "<li>signaler sans tarder toute casse ou panne à un responsable de l'association ;</li>" +
      "<li>être couvert par une assurance responsabilité civile pendant le séjour.</li></ul>" +
      '<label class="aa-coche"><input type="checkbox" name="engagements" required> J\'ai lu et j\'accepte ces engagements. La cotisation reste acquise à l\'association, y compris en cas d\'annulation du séjour.</label></div>' +

      '<h3><span>5</span>Image et données personnelles</h3><div class="aa-carte">' +
      '<div class="aa-choix" style="margin-bottom:8px"><b style="font-size:14px">Droit à l\'image :</b><label><input type="radio" name="droitImage" value="oui" required> J\'autorise</label><label><input type="radio" name="droitImage" value="non"> Je n\'autorise pas</label></div>' +
      '<p class="aa-note" style="margin-top:0">A.C.T.E.S. peut utiliser les photos prises au chalet où vous apparaissez pour sa communication (site, réseaux sociaux, affiches). Autorisation gratuite et révocable à tout moment.</p>' +
      '<label class="aa-coche" style="margin-top:12px"><input type="checkbox" name="infosEmail"> J\'accepte de recevoir les informations de l\'association par e-mail.</label>' +
      '<p class="aa-note">Vos informations servent à gérer les adhésions, les réservations, la facturation et les obligations légales de l\'association. Seuls les membres du bureau y ont accès. Elles sont conservées 3 ans après votre dernier séjour (10 ans pour les pièces comptables). Pour y accéder, les rectifier ou les effacer, écrivez à ' + contactAsso + ".</p></div>" +

      '<h3><span>6</span>Signature</h3><div class="aa-carte">' +
      '<label class="aa-champ">Tapez votre prénom et votre nom pour signer<input type="text" name="signature" class="aa-signe" autocomplete="name" required></label>' +
      '<p class="aa-note">La date et l\'heure de votre signature sont enregistrées avec votre bulletin.</p></div>' +

      '<div class="aa-erreur" hidden></div><button class="aa-bouton" type="submit">Envoyer mon bulletin d\'adhésion</button></div></form>';

    var form = racine.querySelector("form"), boite = racine.querySelector(".aa-erreur"), bouton = racine.querySelector(".aa-bouton");
    var libelles = { nom: "le nom", prenom: "le prénom", naissance: "la date de naissance", tel: "le téléphone", adresse: "l'adresse", ville: "la ville", email: "l'e-mail" };
    function val(n) { var x = form.elements[n]; return x ? String(x.value || "").trim() : ""; }
    function coche(n) { var x = form.elements[n]; return !!(x && x.checked); }
    function radio(n) { var x = form.querySelector('input[name="' + n + '"]:checked'); return x ? x.value : ""; }
    function montrer(msg) { boite.textContent = msg; boite.hidden = false; boite.scrollIntoView({ behavior: "smooth", block: "center" }); }

    form.addEventListener("submit", function (ev) {
      ev.preventDefault(); boite.hidden = true;
      var manque = [];
      if (!radio("civilite")) manque.push("la civilité");
      Object.keys(libelles).forEach(function (n) { if (!val(n)) manque.push(libelles[n]); });
      if (!/^\d{5}$/.test(val("cp"))) manque.push("le code postal (5 chiffres)");
      if (!radio("droitImage")) manque.push("votre choix pour le droit à l'image");
      if (manque.length) return montrer("Merci de compléter : " + manque.join(", ") + ".");
      if (!coche("engagements")) return montrer("Merci d'accepter les engagements de l'adhérent.");
      if (val("signature").length < 2) return montrer("Merci de signer en tapant votre prénom et votre nom.");

      var fiche = {
        civilite: radio("civilite"), nom: val("nom"), prenom: val("prenom"), naissance: val("naissance"),
        adresse: val("adresse"), cp: val("cp"), ville: val("ville"), tel: val("tel"), email: val("email"),
        structure: val("structure"), source: val("source"), animal: val("animal"),
        droitImage: radio("droitImage") === "oui", infosEmail: coche("infosEmail"), engagements: true,
      };
      bouton.disabled = true; bouton.textContent = "Envoi en cours…";
      Promise.resolve(opts.envoyer({ action: "adhesion", fiche: fiche, signature: val("signature"), ua: navigator.userAgent }))
        .then(function (rep) {
          if (rep && rep.error) throw new Error(rep.error);
          merci(racine, s, { le: new Date().toISOString() });
          if (opts.apresEnvoi) opts.apresEnvoi(fiche);
        })
        .catch(function (e) {
          bouton.disabled = false; bouton.textContent = "Envoyer mon bulletin d'adhésion";
          montrer((e && e.message) || "L'envoi n'a pas abouti. Merci de réessayer ou de contacter l'association.");
        });
    });
  }

  window.ActesAdhesion = { monter: monter };
})();
