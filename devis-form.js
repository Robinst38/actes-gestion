/* Formulaire de devis groupe / contact multilingue (21/10/2026).
   Envoie via le Worker (POST /api/contact) : même circuit que la page Contact
   (e-mail à contact@chalet-bellevue.fr + accusé de réception au visiteur). */
(function () {
  var form = document.getElementById('devis-form');
  if (!form) return;
  var API = (typeof API_BASE_URL === 'string' && API_BASE_URL && API_BASE_URL.indexOf('REMPLACER') < 0)
    ? API_BASE_URL : 'https://chalet-bellevue-api.wild-meadow-7ec7.workers.dev';
  var lang = (document.documentElement.lang || 'fr').slice(0, 2);
  var T = {
    fr: { name: 'Merci d’indiquer votre nom.', email: 'Merci d’indiquer une adresse e-mail valide.', msg: 'Votre message est un peu court.',
          dates: 'La date de départ doit être après la date d’arrivée.', sending: 'Envoi en cours…', err: 'Erreur d’envoi.',
          fallback: ' Vous pouvez aussi nous écrire à contact@chalet-bellevue.fr ou appeler le 05 45 69 25 00.',
          doneTitle: 'Demande envoyée, merci !', done: 'Nous vous répondons dès que possible. Un accusé de réception vient de vous être envoyé par e-mail (pensez à vérifier vos courriers indésirables).',
          head: 'Demande de devis groupe', type: 'Type de groupe', people: 'Nombre de personnes', from: 'Arrivée souhaitée', to: 'Départ souhaité', page: 'Page' },
    en: { name: 'Please enter your name.', email: 'Please enter a valid e-mail address.', msg: 'Your message is a little short.',
          dates: 'The departure date must be after the arrival date.', sending: 'Sending…', err: 'Sending failed.',
          fallback: ' You can also write to contact@chalet-bellevue.fr or call +33 5 45 69 25 00.',
          doneTitle: 'Message sent, thank you!', done: 'We will get back to you as soon as possible. An acknowledgement (in French) has been sent to your e-mail address — please check your spam folder.',
          head: 'Group quote request (English website)', type: 'Type of group', people: 'Guests', from: 'Arrival', to: 'Departure', page: 'Page' },
    es: { name: 'Indique su nombre.', email: 'Indique una dirección de e-mail válida.', msg: 'Su mensaje es un poco corto.',
          dates: 'La fecha de salida debe ser posterior a la de llegada.', sending: 'Enviando…', err: 'Error de envío.',
          fallback: ' También puede escribir a contact@chalet-bellevue.fr o llamar al +33 5 45 69 25 00.',
          doneTitle: '¡Mensaje enviado, gracias!', done: 'Le responderemos lo antes posible. Se ha enviado un acuse de recibo (en francés) a su e-mail: revise también la carpeta de correo no deseado.',
          head: 'Solicitud de presupuesto de grupo (web en español)', type: 'Tipo de grupo', people: 'Personas', from: 'Llegada', to: 'Salida', page: 'Página' },
  }[lang] || null;
  if (!T) return;
  var fb = document.getElementById('devis-feedback');
  var btn = document.getElementById('devis-submit');
  var label = btn.textContent;
  var isGroup = form.dataset.mode === 'group';
  function say(msg, ok) { fb.textContent = msg; fb.className = 'review-form-feedback ' + (ok ? 'is-success' : 'is-error'); }
  function val(n) { var el = form.elements.namedItem(n); return el ? String(el.value || '').trim() : ''; }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var name = val('name'), email = val('email'), message = val('message');
    if (name.length < 2) return say(T.name, false);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return say(T.email, false);
    var lines = [];
    if (isGroup) {
      var from = val('from'), to = val('to');
      if (from && to && to <= from) return say(T.dates, false);
      lines.push('[' + T.head + ']');
      lines.push(T.type + ' : ' + val('gtype'));
      if (val('people')) lines.push(T.people + ' : ' + val('people'));
      if (from) lines.push(T.from + ' : ' + from);
      if (to) lines.push(T.to + ' : ' + to);
      if (message) lines.push('', message);
    } else {
      if (message.length < 10) return say(T.msg, false);
      if (lang !== 'fr') lines.push('[' + T.page + ' : ' + location.pathname + ']');
      lines.push(message);
    }
    var full = lines.join('\n');
    if (full.length < 10) full += '\n—';
    btn.disabled = true; btn.textContent = T.sending; say('', true);
    fetch(API + '/api/contact', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, email: email, phone: val('phone'), message: full, website: val('website') }),
    })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error((res.j && res.j.error) || T.err);
        form.innerHTML = '<div class="contact-form-done"><div class="icon-ok">✓</div><h3>' + T.doneTitle + '</h3><p>' + T.done + '</p></div>';
      })
      .catch(function (err) {
        btn.disabled = false; btn.textContent = label;
        say((lang === 'fr' ? err.message : T.err) + T.fallback, false);
      });
  });
})();
