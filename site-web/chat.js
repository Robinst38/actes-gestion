/* Assistant de chat du Chalet Bellevue (gratuit, Cloudflare Workers AI).
   Répond uniquement à partir des infos du site ; sinon renvoie vers Serge.
   Langues : fr (défaut), en, es — selon <html lang>. */
(function () {
  if (document.getElementById('cb-chat')) return;
  var API = (typeof API_BASE_URL === 'string' && API_BASE_URL && API_BASE_URL.indexOf('REMPLACER') < 0)
    ? API_BASE_URL : 'https://chalet-bellevue-api.wild-meadow-7ec7.workers.dev';
  var lang = String(document.documentElement.lang || 'fr').slice(0, 2).toLowerCase();
  if (lang !== 'en' && lang !== 'es') lang = 'fr';

  var T = {
    fr: {
      fab: 'Une question ?', fabAria: 'Poser une question au chalet', panelAria: 'Assistant du Chalet Bellevue',
      sub: 'Assistant automatique', close: 'Fermer', ph: 'Votre question…', phAria: 'Votre question', send: 'Envoyer',
      note: 'Réponses automatiques, à vérifier auprès de Serge au <a href="tel:+33545692500">05 45 69 25 00</a>. Merci de ne pas y saisir de données personnelles.',
      hello: 'Bonjour ! Je peux répondre à vos questions sur le chalet, les horaires, les conditions de séjour ou les environs.',
      chips: ['Horaires d’arrivée et de départ', 'Combien de couchages ?', 'Que faire autour du chalet ?', 'Comment réserver ?'],
      errGeneric: 'Assistant indisponible. Vous pouvez nous joindre au 05 45 69 25 00.',
      errMany: null
    },
    en: {
      fab: 'Any question?', fabAria: 'Ask the chalet a question', panelAria: 'Chalet Bellevue assistant',
      sub: 'Automatic assistant', close: 'Close', ph: 'Your question…', phAria: 'Your question', send: 'Send',
      note: 'Automatic answers, please check with Serge on <a href="tel:+33545692500">+33 5 45 69 25 00</a>. Please do not enter any personal data.',
      hello: 'Hello! I can answer your questions about the chalet, check-in and check-out times, stay conditions or the surrounding area.',
      chips: ['Check-in and check-out times', 'How many beds?', 'What is there to do nearby?', 'How do I book?'],
      errGeneric: 'The assistant is unavailable right now. You can reach us on +33 5 45 69 25 00 or through the Contact page.',
      errMany: 'Too many questions for now. Please use the Contact page or call +33 5 45 69 25 00.'
    },
    es: {
      fab: '¿Alguna pregunta?', fabAria: 'Hacer una pregunta al chalet', panelAria: 'Asistente del Chalet Bellevue',
      sub: 'Asistente automático', close: 'Cerrar', ph: 'Su pregunta…', phAria: 'Su pregunta', send: 'Enviar',
      note: 'Respuestas automáticas, a confirmar con Serge en el <a href="tel:+33545692500">+33 5 45 69 25 00</a>. Le rogamos que no introduzca datos personales.',
      hello: '¡Hola! Puedo responder a sus preguntas sobre el chalet, los horarios de llegada y salida, las condiciones de la estancia o los alrededores.',
      chips: ['Horarios de llegada y salida', '¿Cuántas plazas hay?', '¿Qué hacer cerca del chalet?', '¿Cómo reservar?'],
      errGeneric: 'El asistente no está disponible ahora. Puede llamarnos al +33 5 45 69 25 00 o escribirnos desde la página de Contacto.',
      errMany: 'Demasiadas preguntas por ahora. Use la página de Contacto o llame al +33 5 45 69 25 00.'
    }
  }[lang];

  var history = [];
  var busy = false;

  var root = document.createElement('div');
  root.id = 'cb-chat';
  root.innerHTML =
    '<button type="button" class="cb-chat-fab" id="cb-chat-fab" aria-label="' + T.fabAria + '">💬 <span>' + T.fab + '</span></button>' +
    '<div class="cb-chat-panel" id="cb-chat-panel" role="dialog" aria-label="' + T.panelAria + '" hidden>' +
      '<div class="cb-chat-head"><div><strong>Chalet Bellevue</strong><small>' + T.sub + '</small></div>' +
      '<button type="button" id="cb-chat-close" aria-label="' + T.close + '">×</button></div>' +
      '<div class="cb-chat-log" id="cb-chat-log" aria-live="polite"></div>' +
      '<div class="cb-chat-chips" id="cb-chat-chips"></div>' +
      '<form id="cb-chat-form" autocomplete="off"><input id="cb-chat-input" type="text" maxlength="500" placeholder="' + T.ph + '" aria-label="' + T.phAria + '"/>' +
      '<button type="submit" aria-label="' + T.send + '">➤</button></form>' +
      '<p class="cb-chat-note">' + T.note + '</p>' +
    '</div>';
  document.body.appendChild(root);

  var fab = document.getElementById('cb-chat-fab');
  var panel = document.getElementById('cb-chat-panel');
  var log = document.getElementById('cb-chat-log');
  var input = document.getElementById('cb-chat-input');
  var chips = document.getElementById('cb-chat-chips');

  function add(role, text) {
    var d = document.createElement('div');
    d.className = 'cb-msg cb-' + role;
    d.textContent = text;
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
    return d;
  }
  function open() {
    panel.hidden = false; fab.style.display = 'none';
    if (!log.children.length) {
      add('bot', T.hello);
      T.chips.forEach(function (q) {
        var b = document.createElement('button'); b.type = 'button'; b.textContent = q;
        b.addEventListener('click', function () { send(q); });
        chips.appendChild(b);
      });
    }
    setTimeout(function () { input.focus(); }, 50);
  }
  function close() { panel.hidden = true; fab.style.display = ''; }
  fab.addEventListener('click', open);
  document.getElementById('cb-chat-close').addEventListener('click', close);

  function send(text) {
    text = String(text || '').trim();
    if (!text || busy) return;
    chips.innerHTML = '';
    add('user', text);
    history.push({ role: 'user', content: text });
    busy = true;
    var wait = add('bot', '…'); wait.classList.add('cb-wait');
    fetch(API + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history.slice(-6), lang: lang }) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, status: r.status, j: j }; }); })
      .then(function (res) {
        if (!res.ok) {
          var err = new Error((res.j && res.j.error) || 'Assistant indisponible.');
          err.status = res.status;
          throw err;
        }
        wait.classList.remove('cb-wait'); wait.textContent = res.j.reply;
        history.push({ role: 'assistant', content: res.j.reply });
      })
      .catch(function (e) {
        wait.classList.remove('cb-wait'); wait.classList.add('cb-err');
        if (lang === 'fr') {
          wait.textContent = e.message + (e.message.indexOf('05 45 69 25 00') < 0 ? ' Vous pouvez nous joindre au 05 45 69 25 00.' : '');
        } else {
          wait.textContent = (e.status === 429 && T.errMany) ? T.errMany : T.errGeneric;
        }
        history.pop();
      })
      .then(function () { busy = false; log.scrollTop = log.scrollHeight; });
  }
  document.getElementById('cb-chat-form').addEventListener('submit', function (e) {
    e.preventDefault(); var v = input.value; input.value = ''; send(v);
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) close(); });
})();
