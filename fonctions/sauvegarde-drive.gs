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
