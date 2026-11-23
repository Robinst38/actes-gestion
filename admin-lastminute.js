/* Espace admin — carte « Dernières disponibilités » (21/10/2026).
   Liste les périodes libres des 30 prochains jours et permet de préparer
   un e-mail aux adhérents. Rien n'est envoyé sans clic + confirmation ;
   un envoi test vers sa propre adresse est proposé d'abord. */
(function () {
  var panel = document.getElementById('panel-dispo');
  if (!panel || typeof apiFetch !== 'function') return;
  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function label(d) { return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var card = document.createElement('div');
  card.className = 'dash-card';
  card.id = 'adm-lastminute';
  card.innerHTML =
    '<h2>Dernières disponibilités</h2>' +
    '<p style="color:var(--ink-soft); font-size:0.88rem; margin-bottom:14px;">Périodes encore libres dans les 30 prochains jours (2 nuits minimum). Elles s’affichent automatiquement sur la page d’accueil du site. Vous pouvez aussi prévenir les adhérents par e-mail.</p>' +
    '<div id="adm-lm-list"><p class="empty-state">Calcul en cours…</p></div>' +
    '<details id="adm-lm-mail" style="margin-top:16px;"><summary style="cursor:pointer; font-weight:600;">Préparer un e-mail aux adhérents</summary>' +
    '<div style="margin-top:14px; max-width:640px;">' +
    '<div class="form-row"><div><label for="adm-lm-subject">Objet</label><input id="adm-lm-subject" maxlength="120" type="text"></div></div>' +
    '<div class="form-row"><div><label for="adm-lm-message">Message</label><textarea id="adm-lm-message" rows="8" maxlength="3000"></textarea></div></div>' +
    '<p style="font-size:0.8rem; color:var(--ink-soft); margin:0 0 12px;">Un bouton « Voir le calendrier et réserver » et une mention de désinscription sont ajoutés automatiquement. Aucune remise n’est proposée : toute offre tarifaire doit d’abord être validée par le bureau.</p>' +
    '<div style="display:flex; gap:10px; flex-wrap:wrap;">' +
    '<button class="btn-sm" id="adm-lm-test" type="button">M’envoyer un test</button>' +
    '<button class="btn-sm primary" id="adm-lm-send" type="button" disabled>Envoyer aux adhérents</button></div>' +
    '<p id="adm-lm-info" style="font-size:0.82rem; color:var(--ink-soft); margin-top:10px;"></p>' +
    '</div></details>';
  panel.insertBefore(card, panel.firstChild);

  var runs = [];
  var recipients = 0;

  function fillDefaults() {
    var subj = document.getElementById('adm-lm-subject');
    var msg = document.getElementById('adm-lm-message');
    if (!subj.value) subj.value = 'Le Chalet Bellevue est encore libre dans les prochaines semaines';
    if (!msg.value) {
      msg.value = 'Bonjour,\n\nLe chalet est encore disponible aux dates suivantes :\n' +
        runs.map(function (r) { return '- du ' + label(r.s) + ' au ' + label(r.e) + ' (' + r.n + ' nuits)'; }).join('\n') +
        '\n\nPour en profiter, envoyez votre demande depuis le calendrier du site : elle est validée sous 48 h.\n\nÀ bientôt,\nL’équipe de l’association A.C.T.E.S';
    }
  }

  fetch(API_BASE_URL + '/api/availability', { credentials: 'include' })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var blocked = new Set(data.blocked || []);
      var noCheckin = new Set(data.noCheckin || []);
      var mins = (data.rates || []).map(function (r) { return r.min_nights || 2; });
      var minNights = mins.length ? Math.min.apply(null, mins) : 2;
      var today = new Date(); today.setHours(0, 0, 0, 0);
      var d = addDays(today, 2), end = addDays(today, 45);
      while (d < end) {
        if (blocked.has(iso(d)) || noCheckin.has(iso(d))) { d = addDays(d, 1); continue; }
        var s = new Date(d), n = 0;
        while (d < end && !blocked.has(iso(d))) { n++; d = addDays(d, 1); }
        if (n >= minNights && (s - today) / 86400000 <= 30) runs.push({ s: s, e: addDays(s, n), n: n });
      }
      var wrap = document.getElementById('adm-lm-list');
      wrap.innerHTML = runs.length
        ? '<table class="data-table"><thead><tr><th>Arrivée</th><th>Départ</th><th>Nuits libres</th></tr></thead><tbody>' +
          runs.map(function (r) { return '<tr><td>' + esc(label(r.s)) + '</td><td>' + esc(label(r.e)) + '</td><td>' + r.n + '</td></tr>'; }).join('') + '</tbody></table>'
        : '<p class="empty-state">Aucune période libre de 2 nuits ou plus dans les 30 prochains jours.</p>';
      fillDefaults();
    })
    .catch(function () { document.getElementById('adm-lm-list').innerHTML = '<p class="empty-state">Impossible de calculer les disponibilités.</p>'; });

  apiFetch('/api/admin/lastminute-recipients').then(function (r) {
    recipients = r.count;
    var info = document.getElementById('adm-lm-info');
    var send = document.getElementById('adm-lm-send');
    if (!r.emailConfigured) { info.textContent = 'L’envoi d’e-mails n’est pas configuré sur le serveur.'; return; }
    if (r.count > r.max) { info.textContent = r.count + ' adhérents : au-delà du quota d’envoi gratuit (' + r.max + ' par jour).'; return; }
    send.textContent = 'Envoyer aux ' + r.count + ' adhérents';
    send.disabled = !r.count;
    info.textContent = 'Destinataires : tous les comptes adhérents actifs (' + r.count + ').';
  }).catch(function () { /* carte laissée sans compteur */ });

  function sendMail(test) {
    var subject = document.getElementById('adm-lm-subject').value.trim();
    var message = document.getElementById('adm-lm-message').value.trim();
    if (!test && !window.confirm('Envoyer cet e-mail à ' + recipients + ' adhérents ? Cette action ne peut pas être annulée.')) return;
    var btn = document.getElementById(test ? 'adm-lm-test' : 'adm-lm-send');
    btn.disabled = true;
    apiFetch('/api/admin/lastminute-mail', { method: 'POST', body: JSON.stringify({ subject: subject, message: message, test: !!test }) })
      .then(function (r) {
        showToast(test ? 'E-mail test envoyé à votre adresse.' : r.sent + ' e-mail(s) envoyé(s)' + (r.failed ? ', ' + r.failed + ' échec(s)' : '') + '.', !!r.failed);
      })
      .catch(function (e) { showToast(e.message, true); })
      .then(function () { btn.disabled = false; });
  }
  document.getElementById('adm-lm-test').addEventListener('click', function () { sendMail(true); });
  document.getElementById('adm-lm-send').addEventListener('click', function () { sendMail(false); });
})();
