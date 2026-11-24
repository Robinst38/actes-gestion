/* « Dernières disponibilités » (21/10/2026) : périodes encore libres dans
   les 30 prochains jours, calculées à partir de GET /api/availability (mêmes
   données que le calendrier de réservation). Aucun prix affiché. La section
   reste masquée s'il n'y a rien à proposer ou si l'API ne répond pas. */
(function () {
  var section = document.getElementById('dernieres-dispos');
  var list = document.getElementById('lastminute-list');
  if (!section || !list || typeof API_BASE_URL !== 'string' || API_BASE_URL.indexOf('REMPLACER') >= 0) return;
  var lang = (document.documentElement.lang || 'fr').slice(0, 2);
  var L = {
    fr: { weekend: 'Week-end', from: 'Du', to: 'au', nights: function (n) { return n + ' nuit' + (n > 1 ? 's' : '') + ' libre' + (n > 1 ? 's' : ''); }, cta: 'Voir ces dates →', locale: 'fr-FR' },
    en: { weekend: 'Weekend', from: 'From', to: 'to', nights: function (n) { return n + ' night' + (n > 1 ? 's' : '') + ' free'; }, cta: 'See these dates →', locale: 'en-GB' },
    es: { weekend: 'Fin de semana', from: 'Del', to: 'al', nights: function (n) { return n + ' noche' + (n > 1 ? 's' : '') + ' libre' + (n > 1 ? 's' : ''); }, cta: 'Ver estas fechas →', locale: 'es-ES' },
  }[lang] || null;
  if (!L) return;
  var prefix = /\/(en|es)\//.test(location.pathname) ? '../' : '';
  var LEAD_DAYS = 2;     // les demandes sont validées sous 48 h
  var WINDOW_DAYS = 30;  // on ne montre que les départs dans les 30 jours
  var HORIZON = 45;      // longueur maximale examinée
  var MAX_CARDS = 4;

  function iso(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function label(d) { return d.toLocaleDateString(L.locale, { weekday: 'short', day: 'numeric', month: 'short' }); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  fetch(API_BASE_URL + '/api/availability', { credentials: 'omit' })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) {
      var blocked = new Set(data.blocked || []);
      var noCheckin = new Set(data.noCheckin || []);
      var mins = (data.rates || []).map(function (r) { return r.min_nights || 2; });
      var minNights = mins.length ? Math.min.apply(null, mins) : 2;
      var today = new Date(); today.setHours(0, 0, 0, 0);
      var free = function (from, n) {
        for (var i = 0; i < n; i++) { if (blocked.has(iso(addDays(from, i)))) return false; }
        return true;
      };
      var runs = [];
      // 1) Les week-ends (vendredi -> dimanche, ou séjour minimum s'il est plus long) entièrement libres.
      for (var k = LEAD_DAYS; k <= WINDOW_DAYS; k++) {
        var f = addDays(today, k);
        var wn = Math.max(2, minNights);
        if (f.getDay() === 5 && !noCheckin.has(iso(f)) && free(f, wn)) runs.push({ s: f, e: addDays(f, wn), n: wn, weekend: true });
      }
      // 2) Les périodes libres plus courtes qui ne contiennent aucun de ces week-ends (trous en semaine).
      var d = addDays(today, LEAD_DAYS);
      var end = addDays(today, HORIZON);
      while (d < end) {
        if (blocked.has(iso(d)) || noCheckin.has(iso(d))) { d = addDays(d, 1); continue; }
        var s = new Date(d);
        var n = 0;
        while (d < end && !blocked.has(iso(d))) { n++; d = addDays(d, 1); }
        var e = addDays(s, n);
        var hasWeekend = runs.some(function (w) { return w.weekend && w.s >= s && w.e <= e; });
        if (!hasWeekend && n >= minNights && n <= 7 && (s - today) / 86400000 <= WINDOW_DAYS) runs.push({ s: s, e: e, n: n });
      }
      runs.sort(function (a, b) { return a.s - b.s; });
      if (!runs.length) return;
      list.innerHTML = runs.slice(0, MAX_CARDS).map(function (r) {
        var href = prefix + 'reservation.html?arrivee=' + iso(r.s) + '&depart=' + iso(r.e);
        return '<a class="lastminute-card" href="' + esc(href) + '">' +
          (r.weekend ? '<span class="lastminute-tag">' + esc(L.weekend) + '</span>' : '') +
          '<span class="lastminute-dates">' + esc(L.from + ' ' + label(r.s) + ' ' + L.to + ' ' + label(r.e)) + '</span>' +
          '<span class="lastminute-nights">' + esc(L.nights(r.n)) + '</span>' +
          '<span class="lastminute-go">' + esc(L.cta) + '</span></a>';
      }).join('');
      section.hidden = false;
    })
    .catch(function () { /* section laissée masquée */ });
})();
