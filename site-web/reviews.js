
/**
 * Avis clients — section "Avis" de la page d'accueil.
 * - Affiche les avis déjà validés par un admin (GET /api/reviews).
 * - Permet à un visiteur d'en soumettre un nouveau (POST /api/reviews),
 *   qui reste invisible tant qu'un admin ne l'a pas approuvé (onglet
 *   "Avis" de l'espace admin).
 * - Injecte un balisage Schema.org AggregateRating calculé à partir des
 *   avis RÉELS déjà approuvés — jamais de note inventée : si aucun avis
 *   n'est encore approuvé, aucun balisage n'est ajouté.
 * Dépend de API_BASE_URL (assets/api-config.js, chargé avant ce fichier).
 * Tant que le Worker n'est pas déployé (API_BASE_URL encore au placeholder,
 * voir apiConfigured()), la section affiche un message d'attente plutôt que
 * de planter — même logique défensive que assets/reservation.js.
 */
(function () {
  function apiConfigured() {
    return typeof API_BASE_URL === 'string' && API_BASE_URL && !API_BASE_URL.includes('REMPLACER');
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // RGPD (audit 12/10/2026, constat 4) : un avis public n'affiche jamais le
  // nom complet — seulement le prénom et l'initiale du nom ("Marie D."),
  // même si l'auteur a saisi son nom complet dans le formulaire.
  function maskName(fullName) {
    const parts = String(fullName || '').trim().split(/\s+/);
    if (parts.length === 0 || !parts[0]) return 'Anonyme';
    if (parts.length === 1) return parts[0];
    return parts[0] + ' ' + parts[parts.length - 1].charAt(0).toUpperCase() + '.';
  }

  function starsHtml(rating) {
    let out = '';
    for (let i = 1; i <= 5; i++) {
      out += `<span class="${i <= rating ? 'is-filled' : ''}">&#9733;</span>`;
    }
    return out;
  }

  function fmtDate(raw) {
    try {
      const iso = raw.includes('T') ? raw : raw.replace(' ', 'T') + 'Z';
      return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch (e) {
      return '';
    }
  }

  function renderReviews(list) {
    const wrap = document.getElementById('reviews-list');
    if (!wrap) return;
    if (!list.length) {
      wrap.innerHTML = '<p class="empty-state">Aucun avis publié pour le moment — soyez les premiers à en laisser un !</p>';
      return;
    }
    wrap.innerHTML = list
      .map(
        (r) => `
      <div class="review-card">
        <div class="review-card-stars">${starsHtml(r.rating)}</div>
        <p class="review-card-comment">&laquo;&nbsp;${escapeHtml(r.comment)}&nbsp;&raquo;</p>
        <p class="review-card-author">${escapeHtml(maskName(r.author_name))} <span>&middot; ${fmtDate(r.created_at)}</span></p>
      </div>`
      )
      .join('');
  }

  // Ajoute (ou met à jour) un balisage Schema.org avec la note moyenne réelle
  // des avis approuvés. Séparé du JSON-LD principal de la page (LodgingBusiness
  // sans avis, dans le <head>) pour ne jamais avoir à modifier du HTML statique
  // avec des chiffres qui changent — celui-ci est entièrement calculé côté
  // client, à partir de données réelles, jamais inventées.
  function injectAggregateRatingJsonLd(list) {
    if (!list.length) return;
    const avg = list.reduce((sum, r) => sum + r.rating, 0) / list.length;
    const data = {
      '@context': 'https://schema.org',
      '@type': 'LodgingBusiness',
      name: 'Chalet Bellevue - Luchon',
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: Math.round(avg * 10) / 10,
        reviewCount: list.length,
      },
    };
    let el = document.getElementById('reviews-jsonld');
    if (!el) {
      el = document.createElement('script');
      el.type = 'application/ld+json';
      el.id = 'reviews-jsonld';
      document.head.appendChild(el);
    }
    el.textContent = JSON.stringify(data);
  }

  async function loadReviews() {
    const wrap = document.getElementById('reviews-list');
    if (!apiConfigured()) {
      if (wrap) wrap.innerHTML = '<p class="empty-state">Les avis en ligne seront affichés ici une fois le site connecté à son backend.</p>';
      return;
    }
    try {
      const res = await fetch(API_BASE_URL + '/api/reviews', { credentials: 'include' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const list = Array.isArray(data.reviews) ? data.reviews : [];
      renderReviews(list);
      injectAggregateRatingJsonLd(list);
    } catch (e) {
      if (wrap) wrap.innerHTML = '<p class="empty-state">Impossible de charger les avis pour le moment.</p>';
    }
  }

  function setupForm() {
    const form = document.getElementById('review-form');
    if (!form) return;
    const starButtons = Array.from(form.querySelectorAll('.review-star-input'));
    const ratingInput = document.getElementById('review-rating');
    const feedback = document.getElementById('review-form-feedback');

    starButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const value = Number(btn.dataset.value);
        ratingInput.value = value;
        starButtons.forEach((b) => b.classList.toggle('is-filled', Number(b.dataset.value) <= value));
      });
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      feedback.className = 'review-form-feedback';
      const authorName = document.getElementById('review-name').value.trim();
      const comment = document.getElementById('review-comment').value.trim();
      const rating = Number(ratingInput.value);
      const consentBox = document.getElementById('review-consent');

      if (!authorName || !comment) {
        feedback.textContent = 'Merci de remplir votre nom et votre avis.';
        feedback.classList.add('is-error');
        return;
      }
      if (!consentBox || !consentBox.checked) {
        feedback.textContent = 'Merci de cocher la case de consentement à la publication de votre avis.';
        feedback.classList.add('is-error');
        return;
      }
      if (!rating) {
        feedback.textContent = 'Merci de choisir une note (cliquez sur les étoiles).';
        feedback.classList.add('is-error');
        return;
      }
      if (!apiConfigured()) {
        feedback.textContent = "L'envoi d'avis sera disponible une fois le site connecté à son backend.";
        feedback.classList.add('is-error');
        return;
      }

      try {
        const res = await fetch(API_BASE_URL + '/api/reviews', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ authorName, rating, comment, consent: true }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Erreur lors de l'envoi.");
        feedback.textContent = 'Merci ! Votre avis sera visible après validation par l’association.';
        feedback.classList.add('is-success');
        form.reset();
        ratingInput.value = '';
        starButtons.forEach((b) => b.classList.remove('is-filled'));
        if (consentBox) consentBox.checked = false;
      } catch (err) {
        feedback.textContent = err.message;
        feedback.classList.add('is-error');
      }
    });
  }

  loadReviews();
  setupForm();
})();

