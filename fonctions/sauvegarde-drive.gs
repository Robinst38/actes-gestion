/**
 * A.C.T.E.S — Sauvegarde hebdomadaire du logiciel de gestion dans Google Drive
 *
 * Chaque dimanche vers 3 h, une copie complète des données du logiciel
 * (réservations, clients, factures, trésorerie, réglages, accès…) est déposée
 * dans le dossier Drive « Sauvegardes A.C.T.E.S ». Les 12 dernières sont gardées.
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
 */
const URL_SAUVEGARDE = 'https://qmggmwdfzsacjpykvjvf.supabase.co/functions/v1/sauvegarde';
const CLE_SAUVEGARDE = 'COLLER_ICI_LA_CLE';   // même valeur que le secret BACKUP_SECRET dans Supabase
const NOM_DOSSIER = 'Sauvegardes A.C.T.E.S';
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
  return it.hasNext() ? it.next() : DriveApp.createFolder(NOM_DOSSIER);
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
