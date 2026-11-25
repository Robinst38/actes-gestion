/**
 * A.C.T.E.S — Sauvegarde hebdomadaire du logiciel de gestion dans Google Drive
 *
 * Chaque dimanche vers 3 h, une copie complète des données du logiciel
 * (réservations, clients, factures, trésorerie, réglages, accès…) est déposée
 * dans le dossier Drive « Sauvegardes Logiciel de gestion A.C.T.E.S ». Les 12 dernières sont gardées.
 *
 * Mise en route (une seule fois) : choisir la fonction « installer » puis ▶ Exécuter,
 * et accepter les autorisations demandées par Google.
 * Sauvegarde immédiate : choisir « sauvegarder » puis ▶ Exécuter.
 * Restauration : voir le guide du logiciel (GUIDE.md › « Restaurer une sauvegarde »).
 *
 * Factures dans Drive : les factures prises en photo ou scannées dans le logiciel (Scanner, catégories
 * « Facture fournisseur » et « Ticket / reçu », et justificatifs joints aux dépenses) sont rangées
 * chaque heure, en PDF, dans « 💶 Trésorerie & comptabilité › Factures reçues (dépenses, fournisseurs) »,
 * classées par année puis par mois. Mise en route (une seule fois) : choisir « installerFactures » puis ▶ Exécuter.
 * Rangement immédiat : choisir « envoyerFactures » puis ▶ Exécuter. Entièrement gratuit (compte Google de l'association).
 *
 * Agent des e-mails : toutes les 15 minutes, il lit la boîte contact@ et, pour chaque e-mail avec pièces jointes
 * venant d'un client dont la réservation attend des documents signés :
 *   1. range les pièces jointes dans « 🏡 Chalet — gestion courante › Réservations › RESERVATION <année> › <GROUPE> » ;
 *   2. lit le texte des pages (reconnaissance de texte de Google Drive) : quel document, « Fait à … le … » rempli,
 *      assurance et personne d'évacuation remplies (convention sécurité) ;
 *   3. fait regarder la signature manuscrite par l'IA gratuite de Cloudflare (une petite image par page) ;
 *   4. envoie son analyse au logiciel : conforme → compté comme signé ; doute → « à vérifier » (mail à l'équipe, un clic) ;
 *      le client reçoit un accusé de réception.
 * Il range aussi dans ce dossier un exemplaire PDF des documents signés en ligne.
 * Mise en route (une seule fois) : fichier appsscript.json fourni (service avancé Drive), puis « installerAgent » ▶ Exécuter.
 */
const URL_SAUVEGARDE = 'https://qmggmwdfzsacjpykvjvf.supabase.co/functions/v1/sauvegarde';
const CLE_SAUVEGARDE = 'd7c6c1356ef90b5045650451c186a734206b0483eacf23af';   // même valeur que le secret BACKUP_SECRET dans Supabase
const NOM_DOSSIER = 'Sauvegardes Logiciel de gestion A.C.T.E.S'; // ancien nom : « Sauvegardes A.C.T.E.S » (renommé automatiquement)
const NOMBRE_A_GARDER = 12;

function sauvegarder() {
  const rep = UrlFetchApp.fetch(URL_SAUVEGARDE, {
    headers: { 'x-backup-secret': CLE_SAUVEGARDE },
    muteHttpExceptions: true,
  });
  if (rep.getResponseCode() !== 200) {
    throw new Error('Sauvegarde refusée (' + rep.getResponseCode() + ') : ' + rep.getContentText().slice(0, 300));
  }
  const texte = rep.getContentText();
  const donnees = JSON.parse(texte);
  if (donnees.format !== 'actes-sauvegarde-1' || !Array.isArray(donnees.documents)) {
    throw new Error('Réponse inattendue du logiciel.');
  }
  const dossier = dossierSauvegardes_();
  const nom = 'actes-sauvegarde-' + Utilities.formatDate(new Date(), 'Europe/Paris', 'yyyy-MM-dd_HH-mm') + '.json';
  dossier.createFile(nom, texte, 'application/json');
  nettoyer_(dossier);
  console.log(nom + ' : ' + donnees.documents.length + ' éléments enregistrés.');
  return nom;
}

function installer() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'sauvegarder'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('sauvegarder').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(3).inTimezone('Europe/Paris').create();
  return sauvegarder();
}

function dossierSauvegardes_() {
  const it = DriveApp.getFoldersByName(NOM_DOSSIER);
  if (it.hasNext()) return it.next();
  // Renommage du 23/11/2026 : l'ancien dossier « Sauvegardes A.C.T.E.S » est repris et renommé,
  // pour le distinguer de « Sauvegardes Site chalet-bellevue.fr » (voir Sauvegarde site.gs).
  const ancien = DriveApp.getFoldersByName('Sauvegardes A.C.T.E.S');
  if (ancien.hasNext()) { const d = ancien.next(); d.setName(NOM_DOSSIER); return d; }
  return DriveApp.createFolder(NOM_DOSSIER);
}

function nettoyer_(dossier) {
  const fichiers = [];
  const it = dossier.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    if (/^actes-sauvegarde-.*\.json$/.test(f.getName())) fichiers.push(f);
  }
  fichiers.sort(function (a, b) { return b.getDateCreated() - a.getDateCreated(); });
  fichiers.slice(NOMBRE_A_GARDER).forEach(function (f) { f.setTrashed(true); });
}


// ===================== Factures scannées → Google Drive =====================
const DOSSIER_FACTURES_ID = '1xDZmLanVN5eQ34q_Ldhpwu3M5_XVeNax'; // 💶 Trésorerie & comptabilité › Factures reçues (dépenses, fournisseurs)
const MOIS = ['01 - Janvier', '02 - Février', '03 - Mars', '04 - Avril', '05 - Mai', '06 - Juin', '07 - Juillet', '08 - Août', '09 - Septembre', '10 - Octobre', '11 - Novembre', '12 - Décembre'];

function envoyerFactures() {
  const url = URL_SAUVEGARDE + '?factures=1';
  const entetes = { 'x-backup-secret': CLE_SAUVEGARDE };
  let total = 0;
  for (let tour = 0; tour < 10; tour++) {           // 10 lots au plus par passage (le reste partira à l'heure suivante)
    const rep = UrlFetchApp.fetch(url, { headers: entetes, muteHttpExceptions: true });
    if (rep.getResponseCode() !== 200) throw new Error('Liste des factures refusée (' + rep.getResponseCode() + ') : ' + rep.getContentText().slice(0, 300));
    const lot = JSON.parse(rep.getContentText());
    if (!lot.factures || !lot.factures.length) break;
    const faits = [];
    lot.factures.forEach(function (f) {
      try {
        const dossier = dossierMois_(f.date);
        const fichiers = fichiersFacture_(f).map(function (b) { return dossier.createFile(b); });
        faits.push({ cle: f.cle, driveId: fichiers[0].getId(), driveUrl: fichiers[0].getUrl() });
      } catch (e) {
        console.error('Facture ' + f.cle + ' non rangée : ' + e);
      }
    });
    if (!faits.length) break;
    const ok = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', headers: entetes, payload: JSON.stringify({ faits: faits }), muteHttpExceptions: true });
    if (ok.getResponseCode() !== 200) throw new Error('Marquage refusé (' + ok.getResponseCode() + ') : ' + ok.getContentText().slice(0, 300));
    total += faits.length;
    if (!lot.reste) break;
  }
  console.log(total + ' facture(s) rangée(s) dans Drive.');
  return total;
}

function installerFactures() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'envoyerFactures'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('envoyerFactures').timeBased().everyHours(1).create();
  return envoyerFactures();
}

/** « Factures reçues › 2026 › 11 - Novembre » (créés s'ils n'existent pas). */
function dossierMois_(date) {
  const d = /^\d{4}-\d{2}/.test(date || '') ? date : Utilities.formatDate(new Date(), 'Europe/Paris', 'yyyy-MM-dd');
  const racine = DriveApp.getFolderById(DOSSIER_FACTURES_ID);
  return sousDossier_(sousDossier_(racine, d.slice(0, 4)), MOIS[Number(d.slice(5, 7)) - 1] || d.slice(5, 7));
}
function sousDossier_(parent, nom) {
  const it = parent.getFoldersByName(nom);
  return it.hasNext() ? it.next() : parent.createFolder(nom);
}

/** Un PDF par facture : le PDF d'origine tel quel, ou les photos/pages réunies dans un PDF.
 *  Si Google ne parvient pas à fabriquer le PDF, les photos sont rangées telles quelles (… – p1.jpg, p2.jpg…). */
function fichiersFacture_(f) {
  const base = (f.date + ' – ' + (f.nom || 'Facture')).replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 120);
  const morceaux = f.pages.map(function (u) {
    const i = u.indexOf(',');
    return { type: u.slice(5, u.indexOf(';')), b64: u.slice(i + 1) };
  });
  if (morceaux.length === 1 && morceaux[0].type === 'application/pdf') {
    return [Utilities.newBlob(Utilities.base64Decode(morceaux[0].b64), 'application/pdf', base + '.pdf')];
  }
  try {
    const html = '<html><body style="margin:0">' + morceaux.map(function (m, i) {
      return '<div style="' + (i ? 'page-break-before:always;' : '') + 'text-align:center"><img src="data:' + m.type + ';base64,' + m.b64 + '" style="max-width:100%;max-height:1000px"></div>';
    }).join('') + '</body></html>';
    return [Utilities.newBlob(html, 'text/html', 'facture.html').getAs('application/pdf').setName(base + '.pdf')];
  } catch (e) {
    console.warn('PDF impossible, photos rangées telles quelles : ' + e);
    return morceaux.map(function (m, i) {
      const ext = m.type === 'image/png' ? '.png' : m.type === 'image/webp' ? '.webp' : '.jpg';
      return Utilities.newBlob(Utilities.base64Decode(m.b64), m.type, base + (morceaux.length > 1 ? ' – p' + (i + 1) : '') + ext);
    });
  }
}


// ===================== Agent des e-mails : documents signés reçus par e-mail =====================
const URL_LOGICIEL = URL_SAUVEGARDE.replace(/\/sauvegarde$/, '/client');
const URL_IA = 'https://www.chalet-bellevue.fr/equipe/agent-ia';
const DOSSIER_RESERVATIONS_ID = '1d9d6TKP7dJLujlNqI0y1PlVvYovjXkv2'; // 🏡 Chalet — gestion courante › Réservations
const LIBELLE_TRAITE = 'ACTES/Documents traités';
const LIBELLE_A_TRIER = 'ACTES/À trier';
const TYPES_PJ = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

function installerAgent() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'verifierMailsDocuments'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('verifierMailsDocuments').timeBased().everyMinutes(15).create();
  return verifierMailsDocuments();
}

function verifierMailsDocuments() {
  const donnees = appelLogiciel_({ action: 'agent-reservations' });
  const ranges = rangerExemplaires_(donnees.exemplaires || []);
  const vus = messagesVus_();
  let traites = 0;
  GmailApp.search('in:inbox has:attachment newer_than:21d', 0, 40).forEach(function (fil) {
    fil.getMessages().forEach(function (m) {
      if (vus.indexOf(m.getId()) >= 0) return;
      try {
        const r = traiterMessage_(m, donnees);
        if (r) { fil.addLabel(libelle_(r === 'a_trier' ? LIBELLE_A_TRIER : LIBELLE_TRAITE)); traites++; }
      } catch (e) {
        console.error('Message ' + m.getId() + ' : ' + e);
        return; // réessayé au prochain passage
      }
      vus.push(m.getId());
    });
  });
  enregistrerVus_(vus);
  console.log(traites + ' e-mail(s) de documents traité(s), ' + ranges + ' exemplaire(s) signé(s) en ligne rangé(s).');
  return traites;
}

/** Retourne 'documents', 'a_trier' ou '' (e-mail sans rapport, laissé tel quel). */
function traiterMessage_(m, donnees) {
  const pj = m.getAttachments({ includeInlineImages: false }).filter(function (a) {
    return TYPES_PJ.indexOf(String(a.getContentType()).toLowerCase()) >= 0 && a.getSize() > 5000;
  });
  if (!pj.length) return '';
  const de = emailDe_(m.getFrom()), objet = m.getSubject() || '';
  // Ignore les e-mails envoyés par l'association elle-même (copies, notifications) : évite les boucles « À trier ».
  if (/^(contact|no-reply|noreply)@chalet-bellevue\.fr$/i.test(String(de).trim())) return '';
  let resa = (donnees.resas || []).filter(function (r) { return r.email && r.email === de; })[0];
  const reconnu = !!resa;
  if (!resa) resa = (donnees.resas || []).filter(function (r) { return r.groupe && norm_(objet).indexOf(norm_(r.groupe)) >= 0; })[0];
  const ressemble = /document|sign|convention|principe|locatif|s[ée]curit[ée]/i.test(objet + ' ' + pj.map(function (a) { return a.getName(); }).join(' '));
  if (!resa) {
    if (!ressemble) return '';
    appelLogiciel_({ action: 'agent-a-trier', de: de, objet: objet, raison: 'Expéditeur et objet ne correspondent à aucune réservation en attente de documents' });
    return 'a_trier';
  }
  if (!reconnu && !ressemble) return '';
  const dossier = sousDossier_(sousDossier_(DriveApp.getFolderById(DOSSIER_RESERVATIONS_ID), 'RESERVATION ' + resa.annee), resa.dossier);
  const date = Utilities.formatDate(m.getDate(), 'Europe/Paris', 'yyyy-MM-dd');
  const fichiers = [], textes = [], vignettes = [];
  pj.forEach(function (a) {
    const f = dossier.createFile(a.copyBlob()).setName('5 - Reçu par e-mail le ' + date.split('-').reverse().join('-') + ' - ' + a.getName());
    fichiers.push({ nom: f.getName(), driveId: f.getId(), driveUrl: f.getUrl(), pdf: a.getContentType() === 'application/pdf' });
    textes.push(texteOCR_(f));
  });
  const analyse = analyserDocuments_(textes, resa.docs, function (i) {
    if (!vignettes[i]) vignettes[i] = { v: signatureIA_(fichiers[i].driveId, donnees.cleIA) };
    return vignettes[i].v;
  }, fichiers);
  if (!analyse.length) {
    appelLogiciel_({ action: 'agent-a-trier', de: de, objet: objet, raison: 'Pièces jointes rangées dans Drive (' + resa.dossier + ') mais aucun document de réservation reconnu' });
    return 'a_trier';
  }
  appelLogiciel_({
    action: 'agent-documents', resa: resa.id, expediteurReconnu: reconnu,
    message: { id: m.getId(), de: de, objet: objet, date: Utilities.formatDate(m.getDate(), 'Europe/Paris', 'dd/MM/yyyy HH:mm') },
    fichiers: fichiers.map(function (f) { return { nom: f.nom, driveId: f.driveId, driveUrl: f.driveUrl }; }),
    analyse: analyse,
  });
  return 'documents';
}

/**
 * Analyse des pièces jointes d'un e-mail (fonction pure, testable) :
 * textes[i] = texte lu sur la pièce i ; docs = documents de la réservation ; signature(i) → {signature, lisible} ou null.
 * Une page sans titre reconnu suit le document de la page précédente (photos page par page).
 */
function analyserDocuments_(textes, docs, signature, fichiers) {
  const groupes = {}, ordre = [];
  let courant = null;
  textes.forEach(function (t, i) {
    const type = typeDocument_(t) || (t && t.length > 80 ? courant : null);
    if (!type) return;
    courant = type;
    if (!groupes[type]) { groupes[type] = []; ordre.push(type); }
    groupes[type].push(i);
  });
  const res = [];
  ordre.forEach(function (type) {
    const d = (docs || []).filter(function (x) { return x.id === type; })[0];
    if (!d || d.statut === 'signe') return;
    const idx = groupes[type], texte = idx.map(function (i) { return textes[i]; }).join('\n');
    const problemes = [];
    if (!faitALeRempli_(texte)) problemes.push('« Fait à … le … » ne semble pas rempli');
    const vides = champsVides_(texte, d.champs || []);
    if (vides.length) problemes.push('À compléter : ' + vides.join(', '));
    // Signature : on regarde d'abord la dernière page du document, puis les autres (3 pages au plus).
    let vue = false, illisible = false, essais = 0, sansReponse = false;
    for (let k = idx.length - 1; k >= 0 && !vue && essais < 3; k--, essais++) {
      const v = signature(idx[k]);
      if (!v) { sansReponse = true; continue; }
      if (v.lisible === false) illisible = true;
      if (v.signature === true) vue = true;
    }
    if (!vue) problemes.push(sansReponse ? 'Signature non contrôlée automatiquement' : idx.some(function (i) { return fichiers && fichiers[i] && fichiers[i].pdf; }) ? 'Signature manuscrite non reconnue (pour un PDF, seule la 1re page est contrôlée)' : 'Signature manuscrite non reconnue');
    if (illisible) problemes.push('Une page semble floue ou coupée');
    res.push({ doc: type, conforme: problemes.length === 0, problemes: problemes, fichiers: idx });
  });
  return res;
}

function norm_(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, "'").replace(/\s+/g, ' ').trim(); }
function emailDe_(de) { const m = String(de || '').match(/<([^>]+)>/); return String(m ? m[1] : de || '').trim().toLowerCase(); }

/** Quel document : le titre, en haut de la première page (les autres titres cités plus bas ne comptent pas). */
function typeDocument_(texte) {
  const t = norm_(texte).slice(0, 400);
  const cas = [['principe', /principe locatif/], ['utilisation', /convention d' ?utilisation/], ['securite', /convention de mise a disposition/]];
  let meilleur = null, pos = 1e9;
  cas.forEach(function (c) { const m = c[1].exec(t); if (m && m.index < pos) { pos = m.index; meilleur = c[0]; } });
  return meilleur;
}
/** « Fait à Angoulême, le 22/11/2026 » : un lieu (3 lettres) et une date (chiffres) écrits après les pointillés. */
function faitALeRempli_(texte) {
  const lignes = String(texte || '').split(/\n/);
  for (let i = 0; i < lignes.length; i++) {
    const l = norm_(lignes[i]);
    if (l.indexOf('fait a') < 0) continue;
    const reste = l.slice(l.indexOf('fait a') + 6).replace(/[_./\-,:]+/g, ' ').replace(/\ble\b/g, ' ');
    if ((reste.match(/[a-z]/g) || []).length >= 3 && (reste.match(/\d/g) || []).length >= 2) return true;
  }
  return false;
}
/** Champs à remplir à la main (« Assureur … : ____ ») restés vides. */
function champsVides_(texte, libs) {
  const lignes = String(texte || '').split(/\n/).map(norm_);
  return libs.filter(function (lib) {
    const debut = norm_(lib).slice(0, 14);
    const l = lignes.filter(function (x) { return x.indexOf(debut) === 0; })[0];
    if (l == null) return true;
    const apres = l.indexOf(':') >= 0 ? l.slice(l.indexOf(':') + 1) : '';
    return (apres.replace(/[_.\s-]/g, '').match(/[a-z0-9]/g) || []).length < 2;
  }).map(function (lib) { return lib.replace(/\s*\(.*\)$/, '').toLowerCase(); });
}

/** Texte d'un PDF ou d'une photo : copie en Google Docs avec reconnaissance de texte (service avancé Drive), puis supprimée. */
function texteOCR_(fichier) {
  try {
    const copie = Drive.Files.copy({ name: 'OCR temporaire – ' + fichier.getName(), mimeType: 'application/vnd.google-apps.document' }, fichier.getId(), { ocrLanguage: 'fr' });
    try { return DocumentApp.openById(copie.id).getBody().getText(); }
    finally { DriveApp.getFileById(copie.id).setTrashed(true); }
  } catch (e) {
    console.warn('Lecture du texte impossible (' + fichier.getName() + ') : ' + e);
    return '';
  }
}

/** Vignette de la page (1re page pour un PDF), envoyée à l'IA gratuite de Cloudflare via le relais du site. */
function signatureIA_(driveId, cleIA) {
  if (!cleIA) return null;
  let blob = null;
  for (let i = 0; i < 4 && !blob; i++) {
    try {
      const lien = Drive.Files.get(driveId, { fields: 'thumbnailLink' }).thumbnailLink;
      if (lien) {
        const r = UrlFetchApp.fetch(lien.replace(/=s\d+$/, '=s1400'), { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
        if (r.getResponseCode() === 200) blob = r.getBlob();
      }
    } catch (e) { console.warn('Vignette : ' + e); }
    if (!blob) Utilities.sleep(4000);
  }
  if (!blob) return null;
  const image = 'data:' + (blob.getContentType() || 'image/jpeg') + ';base64,' + Utilities.base64Encode(blob.getBytes());
  if (image.length > 1400000) return null;
  const r = UrlFetchApp.fetch(URL_IA, { method: 'post', contentType: 'application/json', headers: { 'x-agent-cle': cleIA }, payload: JSON.stringify({ image: image }), muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) { console.warn('IA : ' + r.getContentText().slice(0, 200)); return null; }
  return JSON.parse(r.getContentText());
}

/** Exemplaires des documents signés en ligne → PDF dans le dossier du client. */
function rangerExemplaires_(liste) {
  const faits = [];
  liste.forEach(function (x) {
    try {
      const dossier = sousDossier_(sousDossier_(DriveApp.getFolderById(DOSSIER_RESERVATIONS_ID), 'RESERVATION ' + x.annee), x.dossier);
      const nom = String(x.nom).replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 150);
      let blob;
      if (x.pdf) blob = Utilities.newBlob(Utilities.base64Decode(x.pdf), 'application/pdf', nom + '.pdf'); // PDF mis en page par le logiciel (24/11/2026)
      else {
        try { blob = Utilities.newBlob(x.html, 'text/html', 'exemplaire.html').getAs('application/pdf').setName(nom + '.pdf'); }
        catch (e) { blob = Utilities.newBlob(x.html, 'text/html', nom + '.html'); }
      }
      const f = dossier.createFile(blob);
      faits.push({ cle: x.cle, driveId: f.getId(), driveUrl: f.getUrl() });
    } catch (e) { console.error('Exemplaire ' + x.cle + ' : ' + e); }
  });
  if (faits.length) appelLogiciel_({ action: 'agent-ranges', faits: faits });
  return faits.length;
}

function appelLogiciel_(corps) {
  const r = UrlFetchApp.fetch(URL_LOGICIEL, { method: 'post', contentType: 'application/json', headers: { 'x-backup-secret': CLE_SAUVEGARDE }, payload: JSON.stringify(corps), muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('Logiciel (' + corps.action + ') : ' + r.getResponseCode() + ' ' + r.getContentText().slice(0, 300));
  return JSON.parse(r.getContentText());
}
function libelle_(nom) { return GmailApp.getUserLabelByName(nom) || GmailApp.createLabel(nom); }
function messagesVus_() { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('agentVus') || '[]'); } catch (e) { return []; } }
function enregistrerVus_(vus) { PropertiesService.getScriptProperties().setProperty('agentVus', JSON.stringify(vus.slice(-800))); }
