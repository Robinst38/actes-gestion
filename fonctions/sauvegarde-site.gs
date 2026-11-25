/**
 * A.C.T.E.S – Sauvegarde hebdomadaire du SITE PUBLIC chalet-bellevue.fr
 * (pages, scripts, styles, photos, polices, brochure – hébergé sur Cloudflare Pages)
 *
 * Chaque dimanche vers 4 h, tous les fichiers du site en ligne sont téléchargés
 * et rangés dans un .zip, dans le dossier Drive « Sauvegardes Site chalet-bellevue.fr ».
 * Les 12 dernières sont gardées.
 * Ne pas confondre avec « Sauvegardes Logiciel de gestion A.C.T.E.S » (Code.gs),
 * qui sauvegarde les données du logiciel (réservations, factures, trésorerie…).
 *
 * Mise en route (une seule fois) : choisir « installerSauvegardeSite » puis ▶ Exécuter.
 * Sauvegarde immédiate : choisir « sauvegarderSite » puis ▶ Exécuter.
 * Restauration : télécharger le .zip voulu, puis Cloudflare › Workers & Pages ›
 *   chaletbellevue › Create deployment (Production), glisser le .zip, Save and deploy.
 *
 * Les fichiers sont lus sur l'adresse Cloudflare du site (sans le mode maintenance).
 * La liste ci-dessous est complétée automatiquement : chaque nouveau fichier
 * cité dans une page, un script ou une feuille de style est aussi sauvegardé.
 */
const SITE_URL = 'https://chaletbellevue-4pi.pages.dev';
const SITE_DOSSIER = 'Sauvegardes Site chalet-bellevue.fr';
const SITE_A_GARDER = 12;
const SITE_MINIMUM = 80; // en dessous, la sauvegarde est jugée incomplète et n'est pas gardée

const SITE_FICHIERS = [
  '404.html', 'Chalet-Bellevue-Brochure.pdf', 'admin-lastminute.js', 'agenda.js', 'api-config.js',
  'apple-touch-icon.png', 'association.html', 'auth.js',
  'buanderie-et-rangement-du-chalet-bellevue-full.webp', 'buanderie-et-rangement-du-chalet-bellevue.webp',
  'chalet.html', 'chambre-a-lits-superposes-du-chalet-bellevue-full.webp',
  'chambre-a-lits-superposes-du-chalet-bellevue.webp', 'chat.js',
  'coin-repas-couvert-et-barbecue-dans-le-jardin-full.webp', 'coin-repas-couvert-et-barbecue-dans-le-jardin.webp',
  'colonies.html', 'consent.js', 'contact-form.js', 'contact.html',
  'cuisine-equipee-du-chalet-bellevue-full.webp', 'cuisine-equipee-du-chalet-bellevue.webp',
  'devis-form.js', 'entre-amis.html', 'environs.html', 'environs.js',
  'escalier-en-bois-d-origine-du-chalet-full.webp', 'escalier-en-bois-d-origine-du-chalet.webp',
  'espace-abonne.html', 'espace-abonne.js', 'espace-admin.html', 'espace-admin.js',
  'facade-du-chalet-avec-vue-sur-la-vallee-de-lu-full.webp', 'facade-du-chalet-avec-vue-sur-la-vallee-de-lu.webp',
  'facade-du-chalet-bellevue-en-automne-full.webp', 'facade-du-chalet-bellevue-en-automne.webp',
  'facade-et-balcon-du-chalet-bellevue.jpg', 'faq.html', 'favicon.svg', 'feedback.js', 'fonts.css', 'forgot.js',
  'fraunces-latin-400-normal.woff2', 'fraunces-latin-500-normal.woff2',
  'fraunces-latin-600-normal.woff2', 'fraunces-latin-700-normal.woff2',
  'groupe.html', 'groupe.js', 'groupes.html', 'hero-chalet-neige.jpg', 'index.html',
  'inter-latin-400-normal.woff2', 'inter-latin-500-normal.woff2',
  'inter-latin-600-normal.woff2', 'inter-latin-700-normal.woff2',
  'jardin-et-terrasse-du-chalet-bellevue-full.webp', 'jardin-et-terrasse-du-chalet-bellevue.webp',
  'lac-d-oo-bagneres-de-luchon.jpg', 'lastminute.js', 'le-chalet-bellevue-sous-la-neige-bagneres-de-.jpg',
  'login.html', 'login.js', 'luchon-superbagneres-bagneres-de-luchon.jpg', 'mentions-legales.html',
  'parking-prive-du-chalet-vue-sur-les-montagnes-full.webp', 'parking-prive-du-chalet-vue-sur-les-montagnes.webp',
  'peyragudes-bagneres-de-luchon.jpg', 'peyragudes-bagneres-de-luchon.webp',
  'politique-confidentialite.html', 'reservation.html', 'reservation.js', 'retour.html', 'reviews.js',
  'robots.txt', 'salle-a-manger-du-chalet-bellevue-full.webp', 'salle-a-manger-du-chalet-bellevue.webp',
  'salon-et-salle-a-manger-du-chalet-bellevue-full.webp', 'salon-et-salle-a-manger-du-chalet-bellevue.webp',
  'sejour.js', 'site.js', 'sitemap.xml', 'ski-groupe.html', 'stay-board.js', 'style.css', 'tarifs.html',
  'terrasse-exterieure-avec-table-pour-les-repas-full.webp', 'terrasse-exterieure-avec-table-pour-les-repas.webp',
  'thermes-de-luchon-bagneres-de-luchon.jpg',
  'toilettes-separees-du-chalet-bellevue-full.webp', 'toilettes-separees-du-chalet-bellevue.webp',
  'une-autre-salle-d-eau-du-chalet-full.webp', 'une-autre-salle-d-eau-du-chalet.webp',
  'une-chambre-a-lits-superposes-avec-vue-sur-la-full.webp', 'une-chambre-a-lits-superposes-avec-vue-sur-la.webp',
  'une-des-chambres-du-chalet-bellevue-full.webp', 'une-des-chambres-du-chalet-bellevue.webp',
  'une-des-salles-d-eau-du-chalet-full.webp', 'une-des-salles-d-eau-du-chalet.webp',
  'vallee-du-lys-etamp-hospice-de-france-bagnere.jpg',
  'vue-sur-les-montagnes-depuis-un-balcon-du-cha-full.webp', 'vue-sur-les-montagnes-depuis-un-balcon-du-cha.webp',
  'en/chalet.html', 'en/colonies.html', 'en/contact.html', 'en/entre-amis.html', 'en/environs.html',
  'en/groupes.html', 'en/index.html', 'en/ski-groupe.html', 'en/tarifs.html',
  'es/chalet.html', 'es/colonies.html', 'es/contact.html', 'es/entre-amis.html', 'es/environs.html',
  'es/groupes.html', 'es/index.html', 'es/ski-groupe.html', 'es/tarifs.html'
];

// Règles d'en-têtes du site (fichier _headers), remises dans chaque sauvegarde.
const SITE_HEADERS = [
  '/',
  '  Cache-Control: no-cache',
  '/index.html',
  '  Cache-Control: no-cache',
  '/*.js',
  '  Cache-Control: no-cache',
  '  Content-Type: application/javascript; charset=utf-8',
  '/*.css',
  '  Content-Type: text/css; charset=utf-8',
  '/groupe*',
  '  X-Robots-Tag: noindex, nofollow',
  '  Referrer-Policy: no-referrer',
  ''
].join('\n');

function sauvegarderSite() {
  const aFaire = SITE_FICHIERS.slice();
  const vus = new Set(aFaire);
  const blobs = [];
  const manquants = [];

  for (let i = 0; i < aFaire.length; i += 20) {
    const lot = aFaire.slice(i, i + 20);
    const reponses = UrlFetchApp.fetchAll(lot.map(function (chemin) {
      return { url: SITE_URL + '/' + encodeURI(chemin), muteHttpExceptions: true, followRedirects: true };
    }));
    reponses.forEach(function (rep, j) {
      const chemin = lot[j];
      const code = rep.getResponseCode();
      // 404.html est la page « introuvable » : elle peut répondre avec le code 404.
      if (code !== 200 && !(chemin === '404.html' && code === 404)) {
        manquants.push(chemin + ' (' + code + ')');
        return;
      }
      blobs.push(rep.getBlob().setName(chemin));
      if (/\.(html|css|js)$/i.test(chemin)) {
        liensSite_(rep.getContentText(), chemin).forEach(function (lien) {
          if (!vus.has(lien)) { vus.add(lien); aFaire.push(lien); }
        });
      }
    });
  }

  if (blobs.length < SITE_MINIMUM) {
    throw new Error('Sauvegarde du site incomplète (' + blobs.length + ' fichiers). Manquants : ' + manquants.join(', '));
  }
  blobs.push(Utilities.newBlob(SITE_HEADERS, 'text/plain', '_headers'));

  const nom = 'site-chalet-bellevue-' + Utilities.formatDate(new Date(), 'Europe/Paris', 'yyyy-MM-dd_HH-mm') + '.zip';
  const dossier = dossierSite_();
  dossier.createFile(Utilities.zip(blobs, nom));
  nettoyerSite_(dossier);
  console.log(nom + ' : ' + blobs.length + ' fichiers enregistrés.' +
    (manquants.length ? ' Introuvables (ignorés) : ' + manquants.join(', ') : ''));
  return nom;
}

// Fichiers du site cités dans une page, un script ou une feuille de style.
function liensSite_(texte, chemin) {
  const base = chemin.indexOf('/') >= 0 ? chemin.slice(0, chemin.lastIndexOf('/') + 1) : '';
  const re = /(?:src|href)\s*=\s*["']([^"'#?]+)|url\(\s*["']?([^"')#?]+)/g;
  const liens = [];
  let m;
  while ((m = re.exec(texte)) !== null) {
    let lien = (m[1] || m[2] || '').trim();
    if (!lien || /^(https?:|mailto:|tel:|data:|javascript:|\/\/|\$\{)/i.test(lien)) continue;
    lien = lien.charAt(0) === '/' ? lien.slice(1) : base + lien;
    const morceaux = [];
    lien.split('/').forEach(function (p) {
      if (p === '..') morceaux.pop(); else if (p && p !== '.') morceaux.push(p);
    });
    lien = morceaux.join('/');
    if (!lien) continue;
    if (!/\.[a-z0-9]{2,5}$/i.test(lien)) lien += '.html'; // adresses courtes : /tarifs → tarifs.html
    if (/^[\w\-./]+$/.test(lien)) liens.push(lien);
  }
  return liens;
}

function installerSauvegardeSite() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'sauvegarderSite'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('sauvegarderSite').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(4).inTimezone('Europe/Paris').create();
  return sauvegarderSite();
}

function dossierSite_() {
  const it = DriveApp.getFoldersByName(SITE_DOSSIER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(SITE_DOSSIER);
}

function nettoyerSite_(dossier) {
  const fichiers = [];
  const it = dossier.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    if (/^site-chalet-bellevue-.*\.zip$/.test(f.getName())) fichiers.push(f);
  }
  fichiers.sort(function (a, b) { return b.getDateCreated() - a.getDateCreated(); });
  fichiers.slice(SITE_A_GARDER).forEach(function (f) { f.setTrashed(true); });
}
