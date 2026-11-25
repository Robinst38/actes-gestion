(function () {
  const root = document; // page autonome : plus besoin de cibler une route-view du SPA de démo
  function $id(id) { return root.querySelector('#' + id); }

  // ---- Paiement en ligne HelloAsso (ajout du 23/11/2026) ----
  // Le bouton n'apparaît que si le serveur indique que le paiement en ligne
  // est activé (clés HelloAsso configurées), pour une réservation validée
  // dont rien n'a encore été payé.
  let onlinePayment = false;

  function eurPay(n) {
    n = Number(n) || 0;
    return (Math.abs(n - Math.round(n)) > 0.001 ? n.toFixed(2).replace('.', ',') : String(Math.round(n))) + '\u00a0€';
  }
  function payButton(r, part, label, amount) {
    const q = part === 'balance' ? '?part=balance' : '';
    const amt = Number(amount) > 0 ? ' · ' + eurPay(amount) : '';
    return `<br><a class="btn-sm primary" style="margin-top:6px;display:inline-block;" href="${API_BASE_URL}/api/member/reservations/${r.id}/pay${q}">${label}${amt}</a>`;
  }

  function paymentCell(r) {
    if (r.status === 'cancelled') return '—';
    if (r.payment_stage === 'full') return '<span class="badge badge-paid">Tout payé</span>';
    const canPay = onlinePayment && r.status === 'confirmed';
    if (r.payment_stage === 'deposit') {
      let h = '<span class="badge badge-deposit">Arrhes payées</span>';
      if (canPay && Number(r.balance_amount) > 0) h += payButton(r, 'balance', 'Payer le solde en ligne', r.balance_amount);
      return h;
    }
    let html = '<span class="badge badge-pending">À payer</span>';
    if (canPay) html += payButton(r, 'deposit', "Payer les arrhes en ligne", r.deposit_amount);
    return html;
  }

  const PAYMENT_MESSAGES = {
    ok: ['Merci ! Votre paiement est bien enregistré.', false],
    rien: ['Il n\'y a rien à régler pour le moment.', false],
    'acompte-d-abord': ['Réglez d\'abord les arrhes : le solde pourra être payé ensuite.', true],
    attente: ['Paiement en cours de confirmation : votre espace sera mis à jour dans quelques minutes.', false],
    annule: ['Paiement annulé : vous pouvez réessayer quand vous le souhaitez.', true],
    erreur: ['Le paiement n\'a pas abouti. Vous pouvez réessayer, ou régler par chèque, espèces ou virement.', true],
    'non-validee': ['Votre réservation doit d\'abord être validée par l\'association avant le paiement.', true],
    'deja-payee': ['Ces arrhes sont déjà réglées.', false],
  };

  function showPaymentReturn() {
    const params = new URLSearchParams(location.search);
    const code = params.get('paiement');
    if (!code) return;
    const msg = PAYMENT_MESSAGES[code];
    if (msg) showToast(msg[0], msg[1]);
    params.delete('paiement');
    const qs = params.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
  }

  function renderReservations(list) {
    const wrap = $id('reservations-table-wrap');
    if (!list.length) {
      wrap.innerHTML = '<p class="empty-state">Vous n\'avez pas encore de réservation.</p>';
      return;
    }
    const rows = list
      .map(
        (r) => `
      <tr>
        <td>${fmtDateFR(r.check_in)} &rarr; ${fmtDateFR(r.check_out)}</td>
        <td>${r.nights} nuit${r.nights > 1 ? 's' : ''}</td>
        <td>${r.adults} adulte${r.adults > 1 ? 's' : ''}${r.minors ? ' + ' + r.minors + ' enfant' + (r.minors > 1 ? 's' : '') : ''}</td>
        <td>${r.price_grand_total != null ? r.price_grand_total.toFixed(2) + ' €' : '—'}</td>
        <td><span class="badge badge-${r.status}">${STATUS_LABELS[r.status] || r.status}</span></td>
        <td>${paymentCell(r)}</td>
      </tr>`
      )
      .join('');
    wrap.innerHTML = `<table class="data-table">
      <thead><tr><th>Séjour</th><th>Durée</th><th>Voyageurs</th><th>Total</th><th>Statut</th><th>Paiement</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  // ---- Retour d'amélioration (un avis privé possible par réservation) ----
  function starsInputHtml() {
    return `<div class="review-stars-input" role="group" aria-label="Votre note (optionnelle)">
      <button type="button" class="review-star-input" data-value="1" aria-label="1 étoile">&#9733;</button>
      <button type="button" class="review-star-input" data-value="2" aria-label="2 étoiles">&#9733;</button>
      <button type="button" class="review-star-input" data-value="3" aria-label="3 étoiles">&#9733;</button>
      <button type="button" class="review-star-input" data-value="4" aria-label="4 étoiles">&#9733;</button>
      <button type="button" class="review-star-input" data-value="5" aria-label="5 étoiles">&#9733;</button>
      <input type="hidden" class="amelioration-rating">
    </div>`;
  }

  function renderAmelioration(list) {
    const wrap = $id('amelioration-list');
    if (!list.length) {
      wrap.innerHTML = '<p class="empty-state">Vous n\'avez pas encore de réservation.</p>';
      return;
    }
    wrap.innerHTML = list
      .map((r) => {
        const body = r.has_feedback
          ? '<p class="amelioration-already">Merci, votre retour a déjà été envoyé pour cette réservation.</p>'
          : `<form class="amelioration-form" data-id="${r.id}">
              ${starsInputHtml()}
              <div class="review-form-row">
                <textarea class="amelioration-comment" rows="3" required maxlength="800" placeholder="Ce qui vous a plu, ce qui pourrait être amélioré..."></textarea>
              </div>
              <button type="submit" class="btn-sm primary">Envoyer mon retour</button>
              <p class="review-form-feedback" role="status"></p>
            </form>`;
        return `<div class="amelioration-item">
          <div class="amelioration-item-head">
            <h4>Réservation n°${r.id}</h4>
            <span class="badge badge-${r.status}">${STATUS_LABELS[r.status] || r.status}</span>
          </div>
          <p class="amelioration-item-dates">${fmtDateFR(r.check_in)} &rarr; ${fmtDateFR(r.check_out)}</p>
          ${body}
        </div>`;
      })
      .join('');

    wrap.querySelectorAll('form.amelioration-form').forEach((form) => {
      const starButtons = Array.from(form.querySelectorAll('.review-star-input'));
      const ratingInput = form.querySelector('.amelioration-rating');
      starButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
          const value = Number(btn.dataset.value);
          const next = ratingInput.value === String(value) ? '' : value;
          ratingInput.value = next;
          starButtons.forEach((b) => b.classList.toggle('is-filled', next !== '' && Number(b.dataset.value) <= Number(next)));
        });
      });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const feedback = form.querySelector('.review-form-feedback');
        feedback.className = 'review-form-feedback';
        const comment = form.querySelector('.amelioration-comment').value.trim();
        if (!comment) {
          feedback.textContent = 'Merci de partager quelques mots avant d’envoyer.';
          feedback.classList.add('is-error');
          return;
        }
        const payload = { reservationId: Number(form.dataset.id), comment };
        if (ratingInput.value) payload.rating = Number(ratingInput.value);
        try {
          await apiFetch('/api/member/feedback', { method: 'POST', body: JSON.stringify(payload) });
          showToast('Merci pour votre retour !');
          loadAll();
        } catch (err) {
          feedback.textContent = err.message;
          feedback.classList.add('is-error');
        }
      });
    });
  }

  function renderDocuments(list) {
    const wrap = $id('documents-list');
    if (!list.length) {
      wrap.innerHTML = '<p class="empty-state">Aucun document disponible pour le moment.</p>';
      return;
    }
    const rows = list
      .map(
        (d) => `
      <tr>
        <td>${d.title}</td>
        <td>${d.category || ''}</td>
        <td>${fmtDateFR(d.uploaded_at)}</td>
        <td><a class="btn-sm primary" href="${API_BASE_URL}/api/member/documents/${d.id}/download" target="_blank" rel="noopener">Télécharger</a></td>
      </tr>`
      )
      .join('');
    wrap.innerHTML = `<table class="data-table">
      <thead><tr><th>Titre</th><th>Catégorie</th><th>Ajouté le</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  function renderInfos(html) {
    $id('infos-content').innerHTML =
      html && html.trim() ? html : '<p class="empty-state">Aucune information pour le moment.</p>';
  }

  async function loadAll() {
    try {
      const r = await apiFetch('/api/member/reservations');
      onlinePayment = !!r.onlinePayment;
      renderReservations(r.reservations || []);
      renderAmelioration(r.reservations || []);
    } catch (e) {
      $id('reservations-table-wrap').innerHTML = `<p class="empty-state">${e.message}</p>`;
      $id('amelioration-list').innerHTML = `<p class="empty-state">${e.message}</p>`;
    }
    try {
      const d = await apiFetch('/api/member/documents');
      renderDocuments(d.documents || []);
    } catch (e) {
      $id('documents-list').innerHTML = `<p class="empty-state">${e.message}</p>`;
    }
    try {
      const i = await apiFetch('/api/member/practical-info');
      renderInfos(i.html);
    } catch (e) {
      $id('infos-content').innerHTML = `<p class="empty-state">${e.message}</p>`;
    }
  }

  function initTabs() {
    root.querySelectorAll('.dash-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        root.querySelectorAll('.dash-tab').forEach((b) => b.classList.remove('is-active'));
        root.querySelectorAll('.dash-panel').forEach((p) => p.classList.remove('is-active'));
        btn.classList.add('is-active');
        $id('panel-' + btn.dataset.tab).classList.add('is-active');
      });
    });
  }

  $id('logout-btn').addEventListener('click', doLogout);

  $id('change-password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const currentPassword = $id('cp-current').value;
    const newPassword = $id('cp-new').value;
    try {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      showToast('Mot de passe mis à jour.');
      $id('change-password-form').reset();
      $id('must-change-banner').style.display = 'none';
    } catch (err) {
      showToast(err.message || 'Erreur lors de la mise à jour.', true);
    }
  });

  async function init() {
    const me = await requireAuth();
    if (!me) return;
    $id('member-name').textContent = me.fullName;
    if (me.mustChangePassword) $id('must-change-banner').style.display = 'block';
    initTabs();
    showPaymentReturn();
    loadAll();
  }
  // Fix 19/10/2026 : sur le vrai site, espace-abonne.html est une page à
  // part chargée une seule fois — l'ancien hash-gating (hérité de
  // l'artefact de démo en SPA à une seule page, où location.hash servait
  // de routeur) faisait que init() ne s'exécutait jamais au chargement
  // réel de la page, puisque le hash y est vide. Appel direct, comme dans
  // assets/feedback.js.
  init();
})();