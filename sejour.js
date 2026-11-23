/* Espace adhérent — onglet « Organiser le séjour » (21/10/2026).
   Dépend de auth.js (apiFetch, fmtDateFR) et de stay-board.js. */
(function () {
  var panel = document.getElementById('panel-sejour');
  if (!panel || !window.StayBoard) return;
  var esc = window.StayBoard.esc;
  var pick = panel.querySelector('#sejour-pick');
  var share = panel.querySelector('#sejour-share');
  var boardEl = panel.querySelector('#sejour-board');
  var current = null;
  var board = null;

  function shareUrl(token) {
    return location.origin + location.pathname.replace(/[^/]*$/, '') + 'groupe.html?t=' + token;
  }
  function renderShare(token) {
    var url = shareUrl(token);
    share.innerHTML =
      '<div class="sb-share"><div><strong>Partagez ce lien avec votre groupe</strong>' +
      '<p>Toute personne qui a le lien peut voir et modifier ce tableau, sans compte. Ne le publiez pas.</p></div>' +
      '<div class="sb-share-row"><input type="text" readonly value="' + esc(url) + '" aria-label="Lien à partager">' +
      '<button type="button" class="btn-sm primary" id="sejour-copy">Copier</button>' +
      '<button type="button" class="btn-sm" id="sejour-reset">Nouveau lien</button></div></div>';
    share.querySelector('#sejour-copy').addEventListener('click', function () {
      var input = share.querySelector('input');
      input.select();
      (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () {
        showToast('Lien copié.');
      }).catch(function () { document.execCommand('copy'); showToast('Lien copié.'); });
    });
    share.querySelector('#sejour-reset').addEventListener('click', function () {
      if (!window.confirm('Créer un nouveau lien ? L’ancien lien ne fonctionnera plus.')) return;
      apiFetch('/api/member/stays/' + current + '/reset-link', { method: 'POST' }).then(function (r) {
        renderShare(r.shareToken);
        showToast('Nouveau lien créé.');
      }).catch(function (e) { showToast(e.message, true); });
    });
  }

  function open(id) {
    current = id;
    share.innerHTML = '';
    board = window.StayBoard.mount(boardEl, {
      load: function () {
        return apiFetch('/api/member/stays/' + id).then(function (r) { renderShare(r.shareToken); return r; });
      },
      op: function (body) {
        return apiFetch('/api/member/stays/' + id + '/op', { method: 'POST', body: JSON.stringify(body) });
      },
    });
    board.reload();
  }

  apiFetch('/api/member/reservations').then(function (r) {
    var today = new Date().toISOString().slice(0, 10);
    var list = (r.reservations || []).filter(function (x) { return x.status !== 'cancelled' && x.check_out >= today; });
    if (!list.length) {
      pick.innerHTML = '<p class="empty-state">Aucun séjour à venir. Dès qu’une réservation est enregistrée, vous pourrez l’organiser ici avec votre groupe.</p>';
      return;
    }
    list.sort(function (a, b) { return a.check_in < b.check_in ? -1 : 1; });
    pick.innerHTML = '<label class="sb-pick">Séjour : <select id="sejour-select">' + list.map(function (x) {
      return '<option value="' + x.id + '">' + esc(fmtDateFR(x.check_in) + ' → ' + fmtDateFR(x.check_out)) +
        (x.status === 'pending' ? ' (en attente de validation)' : '') + '</option>';
    }).join('') + '</select></label>';
    var sel = pick.querySelector('#sejour-select');
    sel.addEventListener('change', function () { open(Number(sel.value)); });
    open(Number(sel.value));
  }).catch(function (e) {
    pick.innerHTML = '<p class="empty-state">' + esc(e.message) + '</p>';
  });
})();
