/* Formulaire de contact : envoi via le Worker (POST /api/contact), gratuit. */
(function () {
  var API = (typeof API_BASE_URL === 'string' && API_BASE_URL && API_BASE_URL.indexOf('REMPLACER') < 0)
    ? API_BASE_URL : 'https://chalet-bellevue-api.wild-meadow-7ec7.workers.dev';
  var form = document.getElementById('contact-form');
  if (!form) return;
  var fb = document.getElementById('contact-feedback');
  var btn = document.getElementById('contact-submit');
  function say(msg, ok) { fb.textContent = msg; fb.className = 'review-form-feedback ' + (ok ? 'is-success' : 'is-error'); }
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var data = {
      name: form.name.value.trim(), email: form.email.value.trim(), phone: form.phone.value.trim(),
      message: form.message.value.trim(), website: form.website.value
    };
    if (data.name.length < 2) return say('Merci d’indiquer votre nom.', false);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)) return say('Merci d’indiquer une adresse e-mail valide.', false);
    if (data.message.length < 10) return say('Votre message est un peu court.', false);
    btn.disabled = true; btn.textContent = 'Envoi en cours…'; say('', true);
    fetch(API + '/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error((res.j && res.j.error) || 'Erreur d’envoi.');
        form.innerHTML = '<div class="contact-form-done"><div class="icon-ok">✓</div><h3>Message envoyé, merci !</h3>' +
          '<p>Nous vous répondons dès que possible. Un accusé de réception vient de vous être envoyé par e-mail (pensez à vérifier vos courriers indésirables).</p></div>';
      })
      .catch(function (err) {
        btn.disabled = false; btn.textContent = 'Envoyer le message';
        say(err.message + ' Vous pouvez aussi nous écrire à contact@chalet-bellevue.fr ou appeler le 05 45 69 25 00.', false);
      });
  });
})();
