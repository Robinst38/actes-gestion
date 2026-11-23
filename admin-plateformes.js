/* =====================================================================
   Espace admin — onglet « Plateformes » (Booking.com / Airbnb)
   - Copier les liens iCal du site à coller dans Booking et Airbnb
   - Enregistrer les liens d'export de Booking et d'Airbnb
   - Voir l'état de la dernière synchronisation et la relancer
   Les liens contiennent des clés secrètes : ils ne sont jamais affichés,
   seulement copiés dans le presse-papiers.
   ===================================================================== */
(function () {
  'use strict';

  var API = (typeof API_BASE_URL === 'string' && API_BASE_URL) ? API_BASE_URL : '';
  var PLATFORMS = [
    { key: 'booking', label: 'Booking.com', re: /^https:\/\/[^\s]*booking\.com\//i,
      help: 'Booking › Calendrier et tarifs › Synchroniser les calendriers' },
    { key: 'airbnb', label: 'Airbnb', re: /^https:\/\/[^\s]*airbnb\.[a-z.]+\/calendar\/ical\//i,
      help: 'Airbnb › Calendrier › Disponibilités › Associer des calendriers' },
  ];
  var MAX_AGE_MIN = 90; // au-delà, la synchro automatique est considérée comme arrêtée

  var token = '';
  var content = {};

  function $(id) { return document.getElementById(id); }

  function api(path, options) {
    options = options || {};
    return fetch(API + path, Object.assign({
      credentials: 'include',
      headers: options.body ? { 'Content-Type': 'application/json' } : {},
    }, options)).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error((data && data.error) || ('Erreur ' + res.status));
        return data;
      });
    });
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function ago(iso) {
    var t = Date.parse(iso);
    if (!t) return '';
    var min = Math.round((Date.now() - t) / 60000);
    if (min < 1) return "à l'instant";
    if (min < 60) return 'il y a ' + min + ' min';
    var h = Math.floor(min / 60);
    if (h < 48) return 'il y a ' + h + ' h' + (min % 60 ? ' ' + (min % 60) + ' min' : '');
    return 'il y a ' + Math.floor(h / 24) + ' jours';
  }

  function isBad(text) { return /erreur|injoignable|invalide/i.test(String(text || '')); }

  function badge(state) {
    var styles = {
      ok: 'background:#e5f4ea;color:#1f6b3a;',
      warn: 'background:#fff4dc;color:#8a5a00;',
      bad: 'background:#fde8e8;color:#a32020;',
      off: 'background:#eee;color:#555;',
    };
    var labels = { ok: 'OK', warn: 'À vérifier', bad: 'Erreur', off: 'Non configuré' };
    return '<span style="display:inline-block;padding:2px 9px;border-radius:999px;font-size:0.78rem;font-weight:600;' +
      styles[state] + '">' + labels[state] + '</span>';
  }

  function siteLink(platform) {
    return 'https://www.chalet-bellevue.fr/api/ical/' + token + '-plateformes-' + platform + '.ics';
  }

  function flash(el, msg, ok) {
    el.textContent = msg;
    el.style.color = ok ? '#1f6b3a' : '#a32020';
  }

  function lastSync() {
    try { return JSON.parse(content.ical_sync_last || 'null'); } catch (e) { return null; }
  }

  function renderStatus(extra) {
    var wrap = $('pf-status');
    if (!wrap) return;
    var last = extra || lastSync();
    var stale = !last || !last.at || (Date.now() - Date.parse(last.at)) / 60000 > MAX_AGE_MIN;
    var rows = PLATFORMS.map(function (p) {
      var configured = !!content['ical_import_' + p.key];
      var text = last && last[p.key];
      var state = !configured ? 'off' : isBad(text) ? 'bad' : (stale || !text) ? 'warn' : 'ok';
      return '<tr>' +
        '<td style="padding:8px 10px;font-weight:600;">' + p.label + ' → site</td>' +
        '<td style="padding:8px 10px;">' + badge(state) + '</td>' +
        '<td style="padding:8px 10px;color:var(--ink-soft);font-size:0.86rem;">' +
        esc(configured ? (text || 'pas encore synchronisé') : "lien d'export pas encore enregistré") + '</td></tr>';
    }).join('');
    var when = last && last.at
      ? 'Dernière synchronisation : ' + new Date(last.at).toLocaleString('fr-FR') + ' (' + ago(last.at) + ')' +
        (last.source === 'manuel' ? ' — lancée à la main' : '')
      : 'Aucune synchronisation enregistrée pour l\'instant.';
    var warn = stale && last && last.at
      ? '<p style="margin-top:8px;color:#8a5a00;font-size:0.86rem;">⚠ La synchronisation automatique (toutes les 30 min) ne semble plus tourner. Cliquez sur « Synchroniser maintenant » ; si le problème continue, vérifiez le Worker dans Cloudflare.</p>'
      : '';
    wrap.innerHTML =
      '<table style="width:100%;border-collapse:collapse;margin-top:6px;">' + rows + '</table>' +
      '<p style="margin-top:10px;font-size:0.86rem;color:var(--ink-soft);">' + esc(when) + '</p>' + warn;
  }

  function checkFeeds() {
    var wrap = $('pf-feeds');
    if (!wrap || !token) return;
    wrap.innerHTML = '<span style="color:var(--ink-soft);font-size:0.86rem;">Vérification des liens du site…</span>';
    Promise.all(PLATFORMS.map(function (p) {
      return fetch(siteLink(p.key), { cache: 'no-store' }).then(function (r) {
        return r.text().then(function (t) { return r.ok && /BEGIN:VCALENDAR/.test(t); });
      }).catch(function () { return false; });
    })).then(function (res) {
      wrap.innerHTML = PLATFORMS.map(function (p, i) {
        return '<div style="margin:4px 0;font-size:0.88rem;">Site → ' + p.label + ' : ' + badge(res[i] ? 'ok' : 'bad') +
          ' <span style="color:var(--ink-soft);">' + (res[i] ? 'le lien répond correctement' : 'le lien ne répond pas') + '</span></div>';
      }).join('') +
      '<p style="margin-top:6px;font-size:0.8rem;color:var(--ink-soft);">Pour vérifier le côté plateforme : statut « OK » dans Booking (Synchroniser les calendriers) et calendrier « Site Chalet Bellevue » présent dans Airbnb.</p>';
    });
  }

  function load() {
    return api('/api/admin/content').then(function (r) {
      content = {};
      (r.content || []).forEach(function (c) { content[c.key] = c.value; });
      token = content.ical_token || '';
      PLATFORMS.forEach(function (p) {
        var s = $('pf-saved-' + p.key);
        if (s) s.innerHTML = content['ical_import_' + p.key] ? badge('ok') + ' lien enregistré' : badge('off');
      });
      var noTok = $('pf-notoken');
      if (noTok) noTok.style.display = token ? 'none' : 'block';
      renderStatus();
      checkFeeds();
    }).catch(function (e) {
      var wrap = $('pf-status');
      if (wrap) wrap.innerHTML = '<p class="empty-state">Impossible de charger : ' + esc(e.message) + '</p>';
    });
  }

  function syncNow() {
    var btn = $('pf-sync');
    var msg = $('pf-sync-msg');
    btn.disabled = true;
    flash(msg, 'Synchronisation en cours…', true);
    return api('/api/admin/sync-calendars', { method: 'POST' }).then(function (r) {
      r.source = 'manuel';
      content.ical_sync_last = JSON.stringify(r);
      renderStatus(r);
      flash(msg, 'Synchronisation terminée.', true);
    }).catch(function (e) {
      flash(msg, 'Échec : ' + e.message, false);
    }).then(function () { btn.disabled = false; });
  }

  function saveLinks() {
    var msg = $('pf-save-msg');
    var jobs = [];
    var errors = [];
    PLATFORMS.forEach(function (p) {
      var input = $('pf-in-' + p.key);
      var v = (input.value || '').trim();
      if (!v) return;
      if (!p.re.test(v)) { errors.push(p.label + " : ce n'est pas un lien d'export " + p.label); return; }
      jobs.push(api('/api/admin/content', { method: 'POST', body: JSON.stringify({ key: 'ical_import_' + p.key, value: v }) })
        .then(function () { input.value = ''; }));
    });
    if (errors.length) { flash(msg, errors.join(' · '), false); return; }
    if (!jobs.length) { flash(msg, 'Collez au moins un lien.', false); return; }
    flash(msg, 'Enregistrement…', true);
    Promise.all(jobs).then(function () {
      flash(msg, 'Lien(s) enregistré(s) ✔', true);
      return load().then(syncNow);
    }).catch(function (e) { flash(msg, 'Échec : ' + e.message, false); });
  }

  function copy(platform, label) {
    var msg = $('pf-copy-msg');
    if (!token) { flash(msg, 'Jeton iCal introuvable.', false); return; }
    navigator.clipboard.writeText(siteLink(platform)).then(function () {
      flash(msg, 'Lien pour ' + label + ' copié ✔ — collez-le dans ' + label + '.', true);
    }).catch(function () { flash(msg, 'Copie impossible dans ce navigateur.', false); });
  }

  function init() {
    if (!$('panel-plateformes')) return;
    PLATFORMS.forEach(function (p) {
      var b = $('pf-copy-' + p.key);
      if (b) b.addEventListener('click', function () { copy(p.key, p.label); });
    });
    $('pf-save').addEventListener('click', saveLinks);
    $('pf-sync').addEventListener('click', syncNow);
    var tab = document.querySelector('.dash-tab[data-tab="plateformes"]');
    if (tab) tab.addEventListener('click', function () { load(); });
    load();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
