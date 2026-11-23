
/**
 * Retour client — page privée (retour.html) liée depuis l'e-mail envoyé
 * automatiquement le lendemain de la fin d'un séjour confirmé (voir
 * worker.js, fonction `scheduled`). Le jeton qui identifie la réservation
 * concernée est transmis dans l'URL :
 *   - sur le vrai site : en paramètre de requête classique (?token=...) ;
 *   - dans l'artefact de démo (SPA à ancres) : après le "?" à l'intérieur du
 *     fragment (#/retour?token=...), car il n'y a qu'un seul fichier HTML —
 *     getToken() gère les deux cas.
 * Dépend de API_BASE_URL (assets/api-config.js, chargé avant ce fichier).
 */
(function () {
  function getToken() {
    const qs = new URLSearchParams(location.search);
    if (qs.get('token')) return qs.get('token');
    const hashQ = location.hash.indexOf('?');
    if (hashQ !== -1) {
      const hp = new URLSearchParams(location.hash.slice(hashQ + 1));
      if (hp.get('token')) return hp.get('token');
    }
    return null;
  }

  function apiConfigured() {
    return typeof API_BASE_URL === 'string' && API_BASE_URL && !API_BASE_URL.includes('REMPLACER');
  }

  function fmtDate(raw) {
    try {
      return new Date(raw).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch (e) {
      return raw;
    }
  }

  function show(id) {
    ['feedback-loading', 'feedback-invalid', 'feedback-already', 'feedback-thanks', 'feedback-form-wrap'].forEach((x) => {
      const el = document.getElementById(x);
      if (el) el.style.display = x === id ? '' : 'none';
    });
  }

  function setupForm(token) {
    const existing = document.getElementById('feedback-form');
    if (!existing) return;
    // Remonté depuis init() : peut être rappelé plusieurs fois dans
    // l'artefact de démo (navigation par ancre sans rechargement complet de
    // page — voir l'écouteur hashchange en bas de ce fichier). On clone le
    // formulaire pour repartir sans les écouteurs d'un appel précédent,
    // plutôt que d'empiler des soumissions en double.
    const form = existing.cloneNode(true);
    existing.parentNode.replaceChild(form, existing);
    const starButtons = Array.from(form.querySelectorAll('.review-star-input'));
    const ratingInput = document.getElementById('feedback-rating');
    const feedback = document.getElementById('feedback-form-feedback');

    starButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const value = Number(btn.dataset.value);
        // Cliquer deux fois sur la même étoile efface la note (le champ est
        // optionnel, contrairement à l'avis public).
        const next = ratingInput.value === String(value) ? '' : value;
        ratingInput.value = next;
        starButtons.forEach((b) => b.classList.toggle('is-filled', next !== '' && Number(b.dataset.value) <= Number(next)));
      });
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      feedback.className = 'review-form-feedback';
      const comment = document.getElementById('feedback-comment').value.trim();
      if (!comment) {
        feedback.textContent = 'Merci de partager quelques mots avant d’envoyer.';
        feedback.classList.add('is-error');
        return;
      }
      if (!apiConfigured()) {
        feedback.textContent = "L'envoi de retour sera disponible une fois le site connecté à son backend.";
        feedback.classList.add('is-error');
        return;
      }
      const payload = { comment };
      if (ratingInput.value) payload.rating = Number(ratingInput.value);
      try {
        const res = await fetch(API_BASE_URL + '/api/feedback/' + encodeURIComponent(token), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Erreur lors de l'envoi.");
        show('feedback-thanks');
      } catch (err) {
        feedback.textContent = err.message;
        feedback.classList.add('is-error');
      }
    });
  }

  async function init() {
    const wrap = document.getElementById('feedback-loading');
    if (!wrap) return; // page sans ce widget
    const token = getToken();
    if (!token) {
      show('feedback-invalid');
      return;
    }
    if (!apiConfigured()) {
      document.getElementById('feedback-loading').textContent = 'Cette page sera active une fois le site connecté à son backend.';
      return;
    }
    try {
      const res = await fetch(API_BASE_URL + '/api/feedback/' + encodeURIComponent(token));
      if (!res.ok) {
        show('feedback-invalid');
        return;
      }
      const data = await res.json();
      if (data.alreadySubmitted) {
        show('feedback-already');
        return;
      }
      document.getElementById('feedback-recap').innerHTML =
        `Votre séjour : <strong>${fmtDate(data.checkIn)} → ${fmtDate(data.checkOut)}</strong>`;
      show('feedback-form-wrap');
      setupForm(token);
    } catch (e) {
      show('feedback-invalid');
    }
  }

  // Sur le vrai site (retour.html, page à part), init() ne s'exécute qu'une
  // fois au chargement — le hash n'est jamais utilisé pour la navigation.
  // Dans l'artefact de démo (SPA à ancres, voir build_spa.py), la même page
  // reste chargée : on réagit aussi à un hashchange qui amène sur la route
  // /retour, pour permettre de tester ce flux sans recharger tout le
  // fichier (ex. lien envoyé cliqué depuis une autre vue déjà ouverte).
  function currentRouteIsRetour() {
    let hash = location.hash.replace(/^#/, '') || '/';
    const q = hash.indexOf('?');
    if (q !== -1) hash = hash.slice(0, q);
    return hash === '/retour';
  }
  window.addEventListener('hashchange', () => {
    if (currentRouteIsRetour()) init();
  });

  init();
})();

