/* Page groupe.html : tableau partagé du séjour, ouvert par lien secret
   (?t=…), sans compte. Les échanges passent par /api/stay/<jeton>. */
(function () {
  var el = document.getElementById('stay-board');
  if (!el || !window.StayBoard) return;
  var token = new URLSearchParams(location.search).get('t') || '';
  if (!/^[a-f0-9]{32}$/.test(token)) {
    el.innerHTML = '<p class="empty-state">Ce lien est incomplet. Demandez le lien à la personne qui a réservé le chalet.</p>';
    return;
  }
  // Le jeton reste dans l'adresse pour que la page puisse être rechargée ou
  // ajoutée aux favoris ; la page envoie « no-referrer » pour qu'il ne fuie
  // pas vers les sites externes.
  var base = API_BASE_URL + '/api/stay/' + token;
  function call(method, body) {
    return fetch(base, {
      method: method, credentials: 'omit',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error(j.error || ('Erreur ' + r.status));
        return j;
      });
    });
  }
  var dates = document.getElementById('groupe-dates');
  window.StayBoard.mount(el, {
    load: function () {
      return call('GET').then(function (res) {
        var r = res.reservation;
        if (dates && r) {
          dates.textContent = 'Séjour au Chalet Bellevue du ' + window.StayBoard.fmtDate(r.check_in) + ' au ' + window.StayBoard.fmtDate(r.check_out) +
            ' · ' + r.nights + ' nuit' + (r.nights > 1 ? 's' : '');
        }
        return res;
      });
    },
    op: function (body) { return call('POST', body); },
  }).reload();
})();
