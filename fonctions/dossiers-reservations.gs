/**
 * A.C.T.E.S — Un dossier Google Drive par réservation validée
 *
 * Toutes les 10 minutes, chaque réservation confirmée (ou sur place, partie, soldée, terminée)
 * reçoit son dossier dans « Réservations Chalet Bellevue / AAAA / <dates> — <groupe> » avec :
 *   01 Fiche réservation · 02 Accès et consignes (lien et code de l'espace séjour, Wi-Fi, livret, adresse…)
 *   03 Contrat + règlement intérieur (avec la trace d'acceptation en ligne) · 04 Plan de couchage et programme
 *   05 Reçu de caution · 06/07 États des lieux · 08 Fiches de police · 09 Bulletin d'adhésion (quand ils existent)
 *   Factures/ (une par facture et avoir) · Photos état des lieux/ · Documents à signer/ (copie des modèles) · Documents reçus/
 * Les PDF sont refaits automatiquement quand la réservation change (paiement, contrat accepté, facture…).
 * Réservation annulée : le dossier est renommé « ANNULÉE — … » (rien n'est supprimé).
 * Ce que vous déposez vous-même dans le dossier n'est jamais touché.
 *
 * Mise en route (une seule fois), dans le projet « Sauvegarde A.C.T.E.S » (script.google.com, compte contact@) :
 *   1. Fichier ＋ › Script, nommé « Dossiers réservations », coller ce code.
 *   2. Choisir la fonction « installer » puis ▶ Exécuter, et accepter les autorisations.
 * Mise à jour immédiate : choisir « mettreAJour » puis ▶ Exécuter.
 */
const URL_DOSSIERS = 'https://qmggmwdfzsacjpykvjvf.supabase.co/functions/v1/dossiers-drive';
const CLE_DOSSIERS = 'COLLER_ICI_LA_CLE';   // inutile si ce fichier est dans le même projet que la sauvegarde (la clé CLE_SAUVEGARDE est reprise)
const DOSSIER_RACINE = 'Réservations Chalet Bellevue';
const DOSSIER_MODELES = 'Modèles — documents de réservation';   // principe locatif, convention d'utilisation, convention sécurité… copiés dans chaque nouveau dossier
const DUREE_MAX_MS = 4.5 * 60 * 1000;

function mettreAJour() {
  const verrou = LockService.getScriptLock();
  if (!verrou.tryLock(5000)) return 'Mise à jour déjà en cours.';
  const debut = Date.now();
  try {
    const liste = appel_('GET', '').a_traiter || [];
    let faits = 0;
    for (const item of liste) {
      if (Date.now() - debut > DUREE_MAX_MS) break;   // la suite sera faite au prochain passage
      try { traiter_(item); faits++; }
      catch (e) { console.error(item.nom + ' : ' + e.message); }
    }
    const msg = faits + ' dossier(s) traité(s) sur ' + liste.length + ' à faire.';
    console.log(msg);
    return msg;
  } finally {
    verrou.releaseLock();
  }
}

function installer() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'mettreAJour'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('mettreAJour').timeBased().everyMinutes(10).create();
  dossier_(DriveApp.getRootFolder(), DOSSIER_RACINE);
  dossier_(DriveApp.getRootFolder(), DOSSIER_MODELES);
  return mettreAJour();
}

function traiter_(item) {
  let dossier = null;
  if (item.dossierId) { try { dossier = DriveApp.getFolderById(item.dossierId); if (dossier.isTrashed()) dossier = null; } catch (e) { dossier = null; } }

  // Réservation annulée : on renomme le dossier, sans rien supprimer
  if (item.statut === 'annulee') {
    if (dossier && dossier.getName().indexOf('ANNULÉE') !== 0) dossier.setName('ANNULÉE — ' + dossier.getName());
    if (dossier) appel_('POST', '', { id: item.id, dossierId: dossier.getId(), url: dossier.getUrl(), empreinte: 'annulee' });
    return;
  }

  const d = appel_('GET', '?id=' + encodeURIComponent(item.id));
  const racineAnnee = dossier_(dossier_(DriveApp.getRootFolder(), DOSSIER_RACINE), d.annee);
  const nouveau = !dossier;
  if (nouveau) {
    dossier = racineAnnee.createFolder(d.nom);
    dossier_(dossier, 'Documents reçus');
    copierModeles_(dossier_(dossier, 'Documents à signer'));
  } else {
    if (dossier.getName() !== d.nom) dossier.setName(d.nom);   // dates ou nom du groupe modifiés
    const parents = dossier.getParents();
    if (parents.hasNext() && parents.next().getId() !== racineAnnee.getId()) dossier.moveTo(racineAnnee);
  }

  // Documents PDF (refaits à chaque changement)
  d.documents.forEach(function (doc) {
    const morceaux = doc.nom.split('/');
    const cible = morceaux.length > 1 ? dossier_(dossier, morceaux[0]) : dossier;
    const nomPdf = morceaux[morceaux.length - 1] + '.pdf';
    const pdf = Utilities.newBlob(doc.html, 'text/html', 'doc.html').getAs('application/pdf').setName(nomPdf);
    remplacer_(cible, nomPdf, pdf);
  });

  // Photos d'état des lieux (ajoutées une seule fois)
  if (d.photos && d.photos.length) {
    const dp = dossier_(dossier, 'Photos état des lieux');
    d.photos.forEach(function (p) {
      const m = /^data:(image\/[\w+.-]+);base64,(.*)$/.exec(p.data);
      if (!m) return;
      const nom = p.nom + (m[1] === 'image/png' ? '.png' : '.jpg');
      if (!dp.getFilesByName(nom).hasNext()) dp.createFile(Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], nom));
    });
  }

  appel_('POST', '', { id: d.id, dossierId: dossier.getId(), url: dossier.getUrl(), empreinte: d.empreinte });
  console.log((nouveau ? 'Créé : ' : 'Mis à jour : ') + d.nom);
}

function appel_(methode, suite, corps) {
  const opts = { method: methode.toLowerCase(), headers: { 'x-backup-secret': cle_() }, muteHttpExceptions: true };
  if (corps) { opts.contentType = 'application/json'; opts.payload = JSON.stringify(corps); }
  const rep = UrlFetchApp.fetch(URL_DOSSIERS + suite, opts);
  if (rep.getResponseCode() !== 200) throw new Error('Logiciel (' + rep.getResponseCode() + ') : ' + rep.getContentText().slice(0, 300));
  return JSON.parse(rep.getContentText());
}

function cle_() {
  try { if (CLE_SAUVEGARDE && CLE_SAUVEGARDE !== 'COLLER_ICI_LA_CLE') return CLE_SAUVEGARDE; } catch (e) { /* fichier de sauvegarde absent */ }
  return CLE_DOSSIERS;
}

function dossier_(parent, nom) {
  const it = parent.getFoldersByName(nom);
  return it.hasNext() ? it.next() : parent.createFolder(nom);
}

function remplacer_(dossier, nom, blob) {
  const it = dossier.getFilesByName(nom);
  while (it.hasNext()) it.next().setTrashed(true);
  dossier.createFile(blob);
}

function copierModeles_(cible) {
  const it = DriveApp.getFoldersByName(DOSSIER_MODELES);
  if (!it.hasNext()) return;
  const fichiers = it.next().getFiles();
  while (fichiers.hasNext()) {
    const f = fichiers.next();
    if (!cible.getFilesByName(f.getName()).hasNext()) f.makeCopy(f.getName(), cible);
  }
}
