
(function () {
  const form = document.getElementById('login-form');
  const errorBox = document.getElementById('login-error');

  async function redirectIfLoggedIn() {
    try {
      const me = await apiFetch('/api/auth/me');
      if (me.authenticated) {
        // Fix 19/10/2026 : navigation réelle vers la page de destination
        // (location.href), pas location.hash — voir même correction dans
        // assets/auth.js. Sur le vrai site (pages séparées), changer le
        // hash de login.html ne menait nulle part.
        location.href = me.role === 'admin' ? 'espace-admin.html' : 'espace-abonne.html';
      }
    } catch (e) {
      /* API pas encore déployée ou utilisateur non connecté : on reste sur la page */
    }
  }
  // Sur le vrai site, login.html est une page à part chargée une seule
  // fois : on vérifie simplement une fois au chargement si l'utilisateur
  // est déjà connecté, et on réinitialise le formulaire (plus besoin du
  // hash-routing de l'ancien artefact de démo en SPA à une seule page).
  const btn = form.querySelector('.auth-submit');
  btn.disabled = false;
  btn.textContent = 'Se connecter';
  errorBox.classList.remove('is-visible');
  form.reset();
  redirectIfLoggedIn();

  // Compte partagé bureau@ : prénom obligatoire (journal « qui a fait quoi »).
  const COMPTE_PARTAGE = 'bureau@chalet-bellevue.fr';
  const emailInput = document.getElementById('login-email');
  const prenomField = document.getElementById('login-prenom-field');
  const prenomInput = document.getElementById('login-prenom');
  function majPrenom() {
    const partage = emailInput.value.trim().toLowerCase() === COMPTE_PARTAGE;
    prenomField.style.display = partage ? '' : 'none';
    prenomInput.required = partage;
  }
  emailInput.addEventListener('input', majPrenom);
  emailInput.addEventListener('change', majPrenom);
  setTimeout(majPrenom, 300); // remplissage automatique du navigateur

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.classList.remove('is-visible');
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const btn = form.querySelector('.auth-submit');
    btn.disabled = true;
    btn.textContent = 'Connexion...';
    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, prenom: prenomInput.value.trim() }),
      });
      location.href = res.role === 'admin' ? 'espace-admin.html' : 'espace-abonne.html';
    } catch (err) {
      errorBox.textContent = err.message || 'Identifiants incorrects.';
      errorBox.classList.add('is-visible');
      btn.disabled = false;
      btn.textContent = 'Se connecter';
    }
  });
})();

