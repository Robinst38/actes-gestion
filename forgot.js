/* forgot.js — « Mot de passe oublié » (page de connexion) + choix du nouveau mot de passe via le lien reçu par e-mail */
(function () {
  var form = document.getElementById('login-form');
  if (!form) return;
  var card = form.closest('.auth-card') || form.parentNode;

  function msgBox() {
    var d = document.createElement('div');
    d.setAttribute('role', 'status');
    d.style.cssText = 'display:none;margin:14px 0;padding:12px 14px;border-radius:10px;font-size:.95rem;line-height:1.5;';
    return d;
  }
  function show(box, text, ok) {
    box.textContent = text;
    box.style.display = 'block';
    box.style.background = ok ? '#e8f3ea' : '#fbeae5';
    box.style.color = ok ? '#1f3d2b' : '#8a2b12';
  }
  function field(id, label, type, auto) {
    return '<div class="auth-field"><label for="' + id + '">' + label + '</label>' +
      '<input id="' + id + '" type="' + type + '" autocomplete="' + auto + '" required></div>';
  }
  function wire(el) { card.appendChild(el); return el; }

  var params = new URLSearchParams(location.search);
  var token = params.get('reset');

  /* ---------- 1) Arrivée depuis le lien reçu par e-mail ---------- */
  if (token) {
    try { history.replaceState(null, '', location.pathname); } catch (e) { /* ignore */ }
    form.style.display = 'none';
    var h1 = card.querySelector('h1');
    if (h1) h1.textContent = 'Nouveau mot de passe';
    var sub = card.querySelector('.sub');
    if (sub) sub.textContent = 'Choisissez un nouveau mot de passe (8 caractères minimum).';
    var rf = document.createElement('form');
    rf.innerHTML = field('rp-new', 'Nouveau mot de passe', 'password', 'new-password') +
      field('rp-new2', 'Confirmer le mot de passe', 'password', 'new-password') +
      '<button class="btn btn-primary auth-submit" type="submit">Enregistrer</button>';
    var rbox = msgBox();
    wire(rbox);
    wire(rf);
    rf.addEventListener('submit', async function (e) {
      e.preventDefault();
      var p1 = document.getElementById('rp-new').value;
      var p2 = document.getElementById('rp-new2').value;
      if (p1.length < 8) { show(rbox, 'Le mot de passe doit faire au moins 8 caractères.', false); return; }
      if (p1 !== p2) { show(rbox, 'Les deux mots de passe ne sont pas identiques.', false); return; }
      var btn = rf.querySelector('.auth-submit');
      btn.disabled = true; btn.textContent = 'Enregistrement...';
      try {
        await apiFetch('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token: token, newPassword: p1 }) });
        rf.style.display = 'none';
        show(rbox, 'Votre mot de passe a bien été modifié. Vous pouvez maintenant vous connecter.', true);
        var go = document.createElement('p');
        go.style.cssText = 'text-align:center;margin:14px 0 0;';
        go.innerHTML = '<a class="btn btn-primary" href="login.html">Se connecter</a>';
        wire(go);
      } catch (err) {
        show(rbox, err.message || 'Ce lien est invalide ou a expiré.', false);
        btn.disabled = false; btn.textContent = 'Enregistrer';
      }
    });
    return;
  }

  /* ---------- 2) Lien « Mot de passe oublié ? » sous le formulaire ---------- */
  var linkP = document.createElement('p');
  linkP.style.cssText = 'text-align:center;margin:14px 0 0;font-size:.92rem;';
  linkP.innerHTML = '<a href="#" id="fp-open" style="color:#a6532e;text-decoration:underline;">Mot de passe oublié ?</a>';
  form.insertAdjacentElement('afterend', linkP);

  var ff = document.createElement('form');
  ff.style.display = 'none';
  ff.innerHTML = '<p class="sub" style="margin-top:18px;"><strong>Mot de passe oublié</strong><br>Indiquez l’adresse e-mail de votre compte : nous vous enverrons un lien pour choisir un nouveau mot de passe.</p>' +
    field('fp-email', 'E-mail', 'email', 'email') +
    '<button class="btn btn-primary auth-submit" type="submit">Envoyer le lien</button>' +
    '<p style="text-align:center;margin:14px 0 0;font-size:.92rem;"><a href="#" id="fp-back" style="color:#a6532e;text-decoration:underline;">Retour à la connexion</a></p>';
  var fbox = msgBox();
  linkP.insertAdjacentElement('afterend', ff);
  ff.insertAdjacentElement('beforebegin', fbox);

  document.getElementById('fp-open').addEventListener('click', function (e) {
    e.preventDefault();
    var typed = (document.getElementById('login-email') || {}).value || '';
    form.style.display = 'none';
    linkP.style.display = 'none';
    ff.style.display = 'block';
    fbox.style.display = 'none';
    var inp = document.getElementById('fp-email');
    if (typed.indexOf('@') > 0) inp.value = typed.trim();
    inp.focus();
  });
  document.getElementById('fp-back').addEventListener('click', function (e) {
    e.preventDefault();
    ff.style.display = 'none';
    fbox.style.display = 'none';
    form.style.display = '';
    linkP.style.display = '';
  });
  ff.addEventListener('submit', async function (e) {
    e.preventDefault();
    var email = document.getElementById('fp-email').value.trim();
    var btn = ff.querySelector('.auth-submit');
    btn.disabled = true; btn.textContent = 'Envoi...';
    try {
      await apiFetch('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: email }) });
      show(fbox, 'Si cette adresse correspond à un compte, un e-mail vient d’être envoyé avec un lien valable 1 heure. Pensez à vérifier vos courriers indésirables.', true);
    } catch (err) {
      show(fbox, err.message || 'Une erreur est survenue. Merci de réessayer.', false);
    }
    btn.disabled = false; btn.textContent = 'Envoyer le lien';
  });
})();
