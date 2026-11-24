/*
 * Chalet Bellevue — gestion du consentement aux cookies de mesure d'audience
 * (Google Analytics 4), conforme aux recommandations de la CNIL :
 *  - aucun script ni cookie Google n'est chargé AVANT le consentement ;
 *  - boutons « Tout accepter » et « Tout refuser » de même importance ;
 *  - le choix est conservé 6 mois, puis redemandé ;
 *  - retrait possible à tout moment via le lien « Gérer les cookies » du pied de page
 *    (le retrait supprime les cookies _ga déjà déposés).
 */
(function () {
  'use strict';

  var GA_ID = 'G-5RW4FXHJRN'; // identifiant de mesure Google Analytics 4
  var STORAGE_KEY = 'cb_consent_v1';
  var MAX_AGE_MS = 1000 * 60 * 60 * 24 * 182; // ~6 mois

  if (!/^G-[A-Z0-9]{6,}$/.test(GA_ID) || GA_ID === 'G-XXXXXXXXXX') return; // pas encore configuré

  function readChoice() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var c = JSON.parse(raw);
      if (!c || !c.t || Date.now() - c.t > MAX_AGE_MS) return null;
      return c.v === 'granted' || c.v === 'denied' ? c.v : null;
    } catch (e) { return null; }
  }
  function saveChoice(v) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: v, t: Date.now() })); } catch (e) {}
  }

  // Pages privées (espace membres/admin) : jamais de mesure d'audience.
  var PRIVATE_PAGE = /(espace-admin|espace-abonne|login|retour)/.test(location.pathname);

  var gaLoaded = false;
  function loadGA() {
    if (gaLoaded || PRIVATE_PAGE) return;
    gaLoaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA_ID, {
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      cookie_expires: 60 * 60 * 24 * 395 // 13 mois maximum (CNIL)
    });
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_ID);
    document.head.appendChild(s);
  }

  function deleteGACookies() {
    var host = location.hostname;
    var parts = host.split('.');
    var domains = ['', host, '.' + host];
    if (parts.length > 2) domains.push('.' + parts.slice(-2).join('.'));
    document.cookie.split(';').forEach(function (c) {
      var name = c.split('=')[0].trim();
      if (name.indexOf('_ga') === 0 || name === '_gid') {
        domains.forEach(function (d) {
          document.cookie = name + '=; Max-Age=0; path=/' + (d ? '; domain=' + d : '');
        });
      }
    });
  }

  var banner = null;
  function buildBanner() {
    banner = document.createElement('div');
    banner.className = 'cookie-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-live', 'polite');
    banner.setAttribute('aria-label', 'Gestion des cookies');
    banner.innerHTML =
      '<div class="cookie-banner-inner">' +
        '<p class="cookie-banner-title">Statistiques de visite</p>' +
        '<p class="cookie-banner-text">Avec votre accord, nous utilisons Google Analytics pour mesurer la fréquentation du site ' +
        '(pages consultées, provenance des visiteurs) et l’améliorer. Aucune donnée n’est utilisée à des fins publicitaires. ' +
        'Vous pouvez changer d’avis à tout moment via « Gérer les cookies » en bas de page. ' +
        '<a href="politique-confidentialite.html#cookies">En savoir plus</a></p>' +
        '<div class="cookie-banner-actions">' +
          '<button type="button" class="cookie-btn" data-consent="denied">Tout refuser</button>' +
          '<button type="button" class="cookie-btn" data-consent="granted">Tout accepter</button>' +
        '</div>' +
      '</div>';
    banner.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-consent]');
      if (!btn) return;
      apply(btn.getAttribute('data-consent'), true);
    });
    document.body.appendChild(banner);
  }
  function showBanner() {
    if (!banner) buildBanner();
    banner.hidden = false;
    var first = banner.querySelector('button');
    if (first) { try { first.focus({ preventScroll: true }); } catch (e) {} }
  }
  function hideBanner() { if (banner) banner.hidden = true; }

  function apply(choice, fromUser) {
    if (fromUser) saveChoice(choice);
    hideBanner();
    if (choice === 'granted') {
      loadGA();
    } else {
      deleteGACookies();
      if (gaLoaded && fromUser) location.reload(); // décharge le script déjà chargé
    }
  }

  window.openCookieSettings = function () { showBanner(); };

  function init() {
    document.addEventListener('click', function (e) {
      var link = e.target.closest('[data-cookie-settings]');
      if (link) { e.preventDefault(); showBanner(); }
    });
    if (PRIVATE_PAGE) return; // espace membres/admin : aucune mesure d'audience, donc pas de bandeau
    var choice = readChoice();
    if (choice) apply(choice, false);
    else showBanner();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
