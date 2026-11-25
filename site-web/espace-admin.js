
(function () {
  const root = document; // page autonome : plus besoin de cibler une route-view du SPA de démo
  function $id(id) { return root.querySelector('#' + id); }
  let blockedDates = new Set();
  let noCheckinDates = new Set();
  let resConfirmed = new Map(); // date -> libellé (réservations validées)
  let resPending = new Map();   // date -> libellé (demandes en cours de traitement)
  let blockReasons = new Map(); // date -> motif (blocages manuels)
  let selectedDates = new Set();
  let calMonthOffset = 0;
  let currentRates = [];
  let currentAdminEmail = '';
  let currentIsBureau = false;
  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  const DOW = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

  function isoDate(y, m, d) {
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  // ---- Calendrier de disponibilité ----
  function renderCalendar() {
    const today = new Date();
    const base = new Date(today.getFullYear(), today.getMonth() + calMonthOffset, 1);
    const y = base.getFullYear();
    const m = base.getMonth();
    $id('adm-cal-label').textContent = `${MONTHS[m]} ${y}`;
    const cal = $id('adm-cal');
    cal.innerHTML = '';
    DOW.forEach((d) => {
      const s = document.createElement('div');
      s.className = 'cal-dow';
      s.textContent = d;
      cal.appendChild(s);
    });
    const firstDow = (new Date(y, m, 1).getDay() + 6) % 7; // lundi = 0
    for (let i = 0; i < firstDow; i++) cal.appendChild(document.createElement('div'));
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const todayIso = isoDate(today.getFullYear(), today.getMonth(), today.getDate());
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = isoDate(y, m, d);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = String(d);
      const isPast = iso < todayIso;
      if (isPast) {
        btn.classList.add('is-past');
        btn.disabled = true;
      } else {
        btn.addEventListener('click', () => {
          if (selectedDates.has(iso)) selectedDates.delete(iso);
          else selectedDates.add(iso);
          renderCalendar();
        });
      }
      if (resConfirmed.has(iso)) {
        btn.classList.add('is-confirmed');
        btn.title = 'Réservation validée — ' + resConfirmed.get(iso);
      } else if (resPending.has(iso)) {
        btn.classList.add('is-pending');
        btn.title = 'Demande en cours de traitement — ' + resPending.get(iso);
      } else if (blockedDates.has(iso)) {
        btn.classList.add('is-blocked');
        btn.title = 'Date bloquée — ' + reasonText(blockReasons.get(iso));
      }
      if (noCheckinDates.has(iso)) btn.title = 'Arrivée impossible ce jour-là (départ d\'un autre séjour)';
      if (selectedDates.has(iso)) btn.classList.add('is-selected');
      cal.appendChild(btn);
    }
  }

  async function loadAvailability() {
    try {
      const r = await apiFetch('/api/availability');
      blockedDates = new Set(r.blocked || []);
      noCheckinDates = new Set(r.noCheckin || []);
      resConfirmed = new Map();
      resPending = new Map();
      try {
        const rr = await apiFetch('/api/admin/reservations');
        (rr.reservations || []).forEach((x) => {
          const target = x.status === 'confirmed' ? resConfirmed : x.status === 'pending' ? resPending : null;
          if (!target || !x.check_in || !x.check_out) return;
          const label = (x.full_name || 'Réservation') + ' (' + ((x.adults || 0) + (x.minors || 0)) + ' pers.)';
          const d = new Date(x.check_in + 'T00:00:00Z');
          const end = new Date(x.check_out + 'T00:00:00Z');
          while (d < end) {
            const k = d.toISOString().slice(0, 10);
            if (!target.has(k)) target.set(k, label);
            d.setUTCDate(d.getUTCDate() + 1);
          }
        });
      } catch (e) { /* le calendrier reste utilisable sans le détail des séjours */ }
      blockReasons = new Map();
      try {
        const br = await apiFetch('/api/admin/blocks');
        (br.blocks || []).forEach((b) => blockReasons.set(b.date, b.reason || ''));
      } catch (e) { /* les blocages restent visibles, sans leur motif */ }
      renderBlockPeriods();
      renderCalendar();
    } catch (e) {
      showToast('Impossible de charger le calendrier : ' + e.message, true);
    }
  }

  $id('adm-cal-prev').addEventListener('click', () => {
    calMonthOffset--;
    renderCalendar();
  });
  $id('adm-cal-next').addEventListener('click', () => {
    calMonthOffset++;
    renderCalendar();
  });
  $id('adm-clear-btn').addEventListener('click', () => {
    selectedDates.clear();
    renderCalendar();
  });

  $id('adm-block-btn').addEventListener('click', async () => {
    if (!selectedDates.size) {
      showToast('Sélectionnez au moins une date.', true);
      return;
    }
    const reason = $id('adm-block-reason').value;
    try {
      await apiFetch('/api/admin/availability', {
        method: 'POST',
        body: JSON.stringify({ dates: Array.from(selectedDates), action: 'block', reason }),
      });
      showToast('Dates bloquées.');
      selectedDates.clear();
      await loadAvailability();
    } catch (e) {
      showToast(e.message, true);
    }
  });

  $id('adm-unblock-btn').addEventListener('click', async () => {
    if (!selectedDates.size) {
      showToast('Sélectionnez au moins une date.', true);
      return;
    }
    try {
      await apiFetch('/api/admin/availability', {
        method: 'POST',
        body: JSON.stringify({ dates: Array.from(selectedDates), action: 'unblock' }),
      });
      showToast('Dates débloquées.');
      selectedDates.clear();
      await loadAvailability();
    } catch (e) {
      showToast(e.message, true);
    }
  });

  // ---- Périodes bloquées (travaux, entretien…) ----
  const REASON_LABELS = { maintenance: 'Travaux / entretien', reserved: 'Réservé hors site', personal: 'Usage personnel' };
  function reasonText(r) { return REASON_LABELS[r] || r || 'Bloqué'; }
  function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function addDaysIso(iso, n) {
    const d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function localTodayIso() {
    const t = new Date();
    return isoDate(t.getFullYear(), t.getMonth(), t.getDate());
  }
  async function postAvailability(dates, action, reason) {
    for (let i = 0; i < dates.length; i += 40) { // par lots : limite de requêtes par appel côté serveur
      await apiFetch('/api/admin/availability', {
        method: 'POST',
        body: JSON.stringify({ dates: dates.slice(i, i + 40), action, reason }),
      });
    }
  }
  function groupPeriods() {
    const dates = Array.from(blockReasons.keys()).sort();
    const groups = [];
    dates.forEach((d) => {
      const reason = blockReasons.get(d) || '';
      const g = groups[groups.length - 1];
      if (g && g.reason === reason && addDaysIso(g.end, 1) === d) { g.end = d; g.dates.push(d); }
      else groups.push({ start: d, end: d, reason, dates: [d] });
    });
    return groups;
  }
  function renderBlockPeriods() {
    const wrap = $id('adm-periods-wrap');
    if (!wrap) return;
    const groups = groupPeriods();
    if (!groups.length) {
      wrap.innerHTML = '<p class="empty-state">Aucune période bloquée à venir.</p>';
      return;
    }
    wrap.innerHTML = groups.map((g, i) => `
      <div class="period-row">
        <div>
          <div class="period-dates">${g.start === g.end ? fmtDateFR(g.start) : fmtDateFR(g.start) + ' &rarr; ' + fmtDateFR(g.end)} <span style="font-weight:400; color:var(--ink-soft);">(${g.dates.length} jour${g.dates.length > 1 ? 's' : ''})</span></div>
          <div class="period-reason">${escHtml(reasonText(g.reason))}</div>
        </div>
        <button class="btn-sm danger" data-period="${i}" type="button">Débloquer</button>
      </div>`).join('');
    wrap.querySelectorAll('button[data-period]').forEach((b) => {
      b.addEventListener('click', async () => {
        const g = groups[Number(b.dataset.period)];
        if (!g || !window.confirm('Débloquer cette période (' + g.dates.length + ' jour(s)) ?')) return;
        try {
          await postAvailability(g.dates, 'unblock');
          showToast('Période débloquée.');
          await loadAvailability();
        } catch (e) { showToast(e.message, true); }
      });
    });
  }
  (function initPeriodForm() {
    const from = $id('adm-per-from');
    const to = $id('adm-per-to');
    const btn = $id('adm-per-btn');
    if (!from || !to || !btn) return;
    const today = localTodayIso();
    from.min = today;
    to.min = today;
    from.addEventListener('change', () => {
      if (!to.value || to.value < from.value) to.value = from.value;
      to.min = from.value || today;
    });
    btn.addEventListener('click', async () => {
      const f = from.value;
      const t = to.value;
      if (!f || !t) { showToast('Indiquez le premier et le dernier jour à bloquer.', true); return; }
      if (t < f) { showToast('La date de fin est avant la date de début.', true); return; }
      if (f < today) { showToast('Impossible de bloquer une période déjà passée.', true); return; }
      const dates = [];
      for (let d = f; d <= t && dates.length <= 400; d = addDaysIso(d, 1)) dates.push(d);
      if (dates.length > 400) { showToast('Période trop longue (400 jours maximum à la fois).', true); return; }
      const clash = dates.filter((d) => resConfirmed.has(d) || resPending.has(d));
      if (clash.length && !window.confirm(clash.length + ' jour(s) de cette période chevauchent un séjour validé ou une demande en cours. Bloquer quand même ?')) return;
      const kind = $id('adm-per-kind').value;
      const label = $id('adm-per-label').value.trim();
      const reason = (label ? kind + ' : ' + label : kind).slice(0, 120);
      btn.disabled = true;
      try {
        await postAvailability(dates, 'block', reason);
        showToast('Période bloquée (' + dates.length + ' jour' + (dates.length > 1 ? 's' : '') + ').');
        from.value = '';
        to.value = '';
        $id('adm-per-label').value = '';
        await loadAvailability();
      } catch (e) {
        showToast(e.message, true);
        await loadAvailability();
      } finally { btn.disabled = false; }
    });
  })();

  // ---- Demandes de réservation ----
  const RES_ACTIONS = {
    confirm: { status: 'confirmed' },
    cancel: { status: 'cancelled' },
    'mark-paid': { paymentStatus: 'paid' },
    'pay-deposit': { payment: 'deposit' },
    'pay-full': { payment: 'full' },
    'pay-none': { payment: 'none' },
  };

  // Suivi des paiements : 3 états (À payer / Arrhes payées / Tout payé), calculés
  // à partir des factures acompte + solde de la réservation.
  function payStage(r) {
    if (r.status === 'cancelled') return 'cancelled';
    const sts = [r.deposit_status, r.balance_status].filter((x) => x && x !== 'cancelled');
    if (!sts.length) return r.payment_status === 'paid' ? 'full' : 'none';
    if (sts.every((x) => x === 'paid')) return 'full';
    if (r.deposit_status === 'paid') return 'deposit';
    return 'none';
  }
  const PAY_LABELS = { none: 'À payer', deposit: 'Arrhes payées', full: 'Tout payé', cancelled: 'Annulée' };
  const PAY_BADGES = { none: 'badge-pending', deposit: 'badge-deposit', full: 'badge-paid', cancelled: 'badge-cancelled' };
  function eur(n) { return Number(n || 0).toFixed(2).replace('.', ',') + ' €'; }
  function payInfo(r, st) {
    if (st === 'none' && r.deposit_amount != null) return 'Arrhes : ' + eur(r.deposit_amount);
    if (st === 'deposit') {
      return 'Reste ' + eur(r.balance_amount) + (r.balance_due ? ' avant le ' + fmtDateFR(r.balance_due) : '');
    }
    return '';
  }
  function payButtons(r, st) {
    if (st === 'cancelled' || currentIsBureau) return '';
    const id = r.id;
    let h = '';
    if (st === 'none') h += `<button class="btn-sm primary" data-action="pay-deposit" data-id="${id}">Arrhes payées</button> `;
    if (st !== 'full') h += `<button class="btn-sm primary" data-action="pay-full" data-id="${id}">Tout payé</button> `;
    if (st !== 'none') h += `<button class="btn-sm" data-action="pay-none" data-id="${id}">Annuler le paiement</button>`;
    return h;
  }

  function renderReservations(list) {
    const wrap = $id('adm-reservations-wrap');
    if (!list.length) {
      wrap.innerHTML = '<p class="empty-state">Aucune demande pour le moment.</p>';
      return;
    }
    const rows = list
      .map(
        (r) => `
      <tr>
        <td>${fmtDateFR(r.check_in)} &rarr; ${fmtDateFR(r.check_out)}</td>
        <td>${r.full_name}<br><span style="color:var(--ink-soft); font-size:0.8rem;">${r.email} &middot; ${r.phone}</span></td>
        <td>${r.adults}A${r.minors ? ' + ' + r.minors + 'E' : ''}</td>
        <td>${r.price_grand_total != null ? r.price_grand_total.toFixed(2) + ' €' : '—'}</td>
        <td><span class="badge badge-${r.status}">${STATUS_LABELS[r.status] || r.status}</span></td>
        <td><span class="badge ${PAY_BADGES[payStage(r)]}">${PAY_LABELS[payStage(r)]}</span>${payInfo(r, payStage(r)) ? `<br><span style="color:var(--ink-soft); font-size:0.78rem;">${payInfo(r, payStage(r))}</span>` : ''}</td>
        <td class="actions">
          <button class="btn-sm primary" data-action="confirm" data-id="${r.id}">Confirmer</button>
          <button class="btn-sm danger" data-action="cancel" data-id="${r.id}">Annuler</button>
          ${payButtons(r, payStage(r))}
        </td>
      </tr>`
      )
      .join('');
    wrap.innerHTML = `<div style="overflow-x:auto;"><table class="data-table">
      <thead><tr><th>Séjour</th><th>Client</th><th>Voyageurs</th><th>Total</th><th>Statut</th><th>Paiement</th><th>Actions</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
    wrap.querySelectorAll('button[data-action]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const action = RES_ACTIONS[btn.dataset.action];
        if (btn.dataset.action === 'pay-none' && !window.confirm('Annuler le paiement enregistré pour cette réservation ?')) return;
        try {
          await apiFetch(`/api/admin/reservations/${btn.dataset.id}/status`, {
            method: 'POST',
            body: JSON.stringify(action),
          });
          showToast('Réservation mise à jour.');
          loadReservations();
          loadAvailability();
        } catch (e) {
          showToast(e.message, true);
        }
      });
    });
  }

  async function loadReservations() {
    try {
      const r = await apiFetch('/api/admin/reservations');
      renderReservations(r.reservations || []);
    } catch (e) {
      $id('adm-reservations-wrap').innerHTML = `<p class="empty-state">${e.message}</p>`;
    }
  }

  // ---- Contenu du site : infos pratiques + tarifs ----
  function renderRates() {
    const wrap = $id('cc-rates-wrap');
    if (!currentRates.length) {
      wrap.innerHTML = '<p class="empty-state">Aucune période tarifaire.</p>';
      return;
    }
    const rows = currentRates
      .map(
        (r, idx) => `
      <tr data-idx="${idx}">
        <td><input type="text" class="rt-label" value="${r.label || ''}" style="width:130px; border:1px solid var(--stone-dark); border-radius:6px; padding:5px 7px;"></td>
        <td><input type="number" min="1" max="12" class="rt-start" value="${r.start_month || ''}" style="width:60px; border:1px solid var(--stone-dark); border-radius:6px; padding:5px 7px;"></td>
        <td><input type="number" min="1" max="12" class="rt-end" value="${r.end_month || ''}" style="width:60px; border:1px solid var(--stone-dark); border-radius:6px; padding:5px 7px;"></td>
        <td><input type="number" step="0.01" class="rt-price" value="${r.price_per_night || ''}" style="width:80px; border:1px solid var(--stone-dark); border-radius:6px; padding:5px 7px;"></td>
        <td><input type="number" min="1" class="rt-min" value="${r.min_nights || 2}" style="width:60px; border:1px solid var(--stone-dark); border-radius:6px; padding:5px 7px;"></td>
        <td><button type="button" class="btn-sm primary" data-action="save-rate" data-idx="${idx}">Enregistrer</button></td>
      </tr>`
      )
      .join('');
    wrap.innerHTML = `<div style="overflow-x:auto;"><table class="data-table">
      <thead><tr><th>Période</th><th>Du mois</th><th>Au mois</th><th>Prix/nuit</th><th>Nuits min.</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
    wrap.querySelectorAll('button[data-action="save-rate"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const tr = wrap.querySelector(`tr[data-idx="${btn.dataset.idx}"]`);
        const existing = currentRates[Number(btn.dataset.idx)];
        const payload = {
          id: existing && existing.id ? existing.id : undefined,
          label: tr.querySelector('.rt-label').value,
          startMonth: Number(tr.querySelector('.rt-start').value),
          endMonth: Number(tr.querySelector('.rt-end').value),
          pricePerNight: Number(tr.querySelector('.rt-price').value),
          minNights: Number(tr.querySelector('.rt-min').value) || 2,
        };
        try {
          await apiFetch('/api/admin/rates', { method: 'POST', body: JSON.stringify(payload) });
          showToast('Tarif enregistré.');
          loadContent();
        } catch (e) {
          showToast(e.message, true);
        }
      });
    });
  }

  $id('cc-add-rate').addEventListener('click', () => {
    currentRates.push({ label: '', start_month: '', end_month: '', price_per_night: '', min_nights: 2 });
    renderRates();
  });

  $id('cc-save-info').addEventListener('click', async () => {
    const value = $id('cc-practical-info').value;
    try {
      await apiFetch('/api/admin/content', { method: 'POST', body: JSON.stringify({ key: 'practical_info_html', value }) });
      showToast('Infos pratiques enregistrées.');
    } catch (e) {
      showToast(e.message, true);
    }
  });

  async function loadContent() {
    try {
      const r = await apiFetch('/api/admin/content');
      const info = (r.content || []).find((c) => c.key === 'practical_info_html');
      $id('cc-practical-info').value = info ? info.value : '';
      currentRates = r.rates || [];
      renderRates();
    } catch (e) {
      showToast('Impossible de charger le contenu : ' + e.message, true);
    }
  }

  // ---- Documents de l'association ----
  function renderDocs(list) {
    const wrap = $id('cc-docs-wrap');
    if (!list.length) {
      wrap.innerHTML = '<p class="empty-state">Aucun document.</p>';
      return;
    }
    const rows = list
      .map(
        (d) => `
      <tr>
        <td>${d.title}</td>
        <td>${d.category || ''}</td>
        <td>${fmtDateFR(d.uploaded_at)}</td>
        <td class="actions">
          <a class="btn-sm" href="${API_BASE_URL}/api/member/documents/${d.id}/download" target="_blank" rel="noopener">Voir</a>
          <button class="btn-sm danger" data-action="delete-doc" data-id="${d.id}">Supprimer</button>
        </td>
      </tr>`
      )
      .join('');
    wrap.innerHTML = `<div style="overflow-x:auto;"><table class="data-table">
      <thead><tr><th>Titre</th><th>Catégorie</th><th>Ajouté le</th><th>Actions</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
    wrap.querySelectorAll('button[data-action="delete-doc"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        /* confirmation désactivée dans cet artefact de démo */
        try {
          await apiFetch(`/api/admin/documents/${btn.dataset.id}`, { method: 'DELETE' });
          showToast('Document supprimé.');
          loadDocs();
        } catch (e) {
          showToast(e.message, true);
        }
      });
    });
  }

  async function loadDocs() {
    try {
      const r = await apiFetch('/api/member/documents');
      renderDocs(r.documents || []);
    } catch (e) {
      $id('cc-docs-wrap').innerHTML = `<p class="empty-state">${e.message}</p>`;
    }
  }

  $id('cc-doc-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = $id('doc-title').value.trim();
    const category = $id('doc-category').value;
    const file = $id('doc-file').files[0];
    if (!file) {
      showToast('Choisissez un fichier.', true);
      return;
    }
    const fd = new FormData();
    fd.append('title', title);
    fd.append('category', category);
    fd.append('file', file);
    try {
      await apiFetch('/api/admin/documents', { method: 'POST', body: fd });
      showToast('Document ajouté.');
      $id('cc-doc-form').reset();
      loadDocs();
    } catch (e) {
      showToast(e.message, true);
    }
  });

  // ---- Projets de l'association (feuille de route pluriannuelle) ----
  let currentProjects = [];
  const PROJECT_STATUS_LABELS = { idea: 'Idée', planned: 'Planifié', in_progress: 'En cours', done: 'Terminé' };

  function populateProjectYearSelect() {
    const sel = $id('proj-year');
    if (!sel || sel.options.length) return; // déjà rempli
    const startYear = new Date().getFullYear();
    for (let y = startYear; y < startYear + 5; y++) {
      const opt = document.createElement('option');
      opt.value = String(y);
      opt.textContent = String(y);
      sel.appendChild(opt);
    }
  }

  function projectCardHtml(p) {
    return `
      <div class="project-card" data-id="${p.id}">
        <div class="project-card-head">
          <strong>${p.title}</strong>
          <select class="project-status-select" data-id="${p.id}">
            ${Object.entries(PROJECT_STATUS_LABELS).map(([v, l]) => `<option value="${v}" ${p.status === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
          <button type="button" class="btn-sm danger" data-action="delete-project" data-id="${p.id}">Supprimer</button>
        </div>
        <textarea class="project-notes-input" data-id="${p.id}" rows="3" placeholder="Notes...">${p.notes || ''}</textarea>
        <button type="button" class="btn-sm" data-action="save-project-notes" data-id="${p.id}">Enregistrer les notes</button>
      </div>`;
  }

  function renderProjects(list) {
    const wrap = $id('adm-projects-wrap');
    if (!list.length) {
      wrap.innerHTML = '<p class="empty-state">Aucun projet enregistré pour le moment.</p>';
      return;
    }
    const byYear = {};
    list.forEach((p) => { (byYear[p.target_year] = byYear[p.target_year] || []).push(p); });
    const years = Object.keys(byYear).sort((a, b) => Number(a) - Number(b));
    wrap.innerHTML = years.map((y) => `
      <div class="project-year-group">
        <h3>${y}</h3>
        ${byYear[y].map(projectCardHtml).join('')}
      </div>`).join('');

    wrap.querySelectorAll('select.project-status-select').forEach((sel) => {
      sel.addEventListener('change', async () => {
        try {
          await apiFetch(`/api/admin/projects/${sel.dataset.id}`, { method: 'POST', body: JSON.stringify({ status: sel.value }) });
          showToast('Statut mis à jour.');
          loadProjects();
        } catch (e) {
          showToast(e.message, true);
        }
      });
    });
    wrap.querySelectorAll('button[data-action="save-project-notes"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const textarea = wrap.querySelector(`.project-notes-input[data-id="${id}"]`);
        try {
          await apiFetch(`/api/admin/projects/${id}`, { method: 'POST', body: JSON.stringify({ notes: textarea.value }) });
          showToast('Notes enregistrées.');
        } catch (e) {
          showToast(e.message, true);
        }
      });
    });
    wrap.querySelectorAll('button[data-action="delete-project"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!window.confirm('Supprimer ce projet ?')) return;
        try {
          await apiFetch(`/api/admin/projects/${btn.dataset.id}`, { method: 'DELETE' });
          showToast('Projet supprimé.');
          loadProjects();
        } catch (e) {
          showToast(e.message, true);
        }
      });
    });
  }

  async function loadProjects() {
    populateProjectYearSelect();
    try {
      const r = await apiFetch('/api/admin/projects');
      currentProjects = r.projects || [];
      renderProjects(currentProjects);
    } catch (e) {
      $id('adm-projects-wrap').innerHTML = `<p class="empty-state">${e.message}</p>`;
    }
  }

  $id('adm-new-project-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = $id('proj-title').value.trim();
    const targetYear = $id('proj-year').value;
    const status = $id('proj-status').value;
    const notes = $id('proj-notes').value;
    try {
      await apiFetch('/api/admin/projects', {
        method: 'POST',
        body: JSON.stringify({ title, targetYear, status, notes }),
      });
      showToast('Projet ajouté.');
      $id('adm-new-project-form').reset();
      loadProjects();
    } catch (e) {
      showToast(e.message, true);
    }
  });

  // ---- Avis clients ----
  const REVIEW_STATUS_LABELS = { pending: 'En attente', approved: 'Approuvé', rejected: 'Rejeté' };
  const REVIEW_STATUS_BADGE = { pending: 'badge-pending', approved: 'badge-confirmed', rejected: 'badge-cancelled' };

  function reviewStarsHtml(rating) {
    let out = '';
    for (let i = 1; i <= 5; i++) out += `<span style="opacity:${i <= rating ? '1' : '0.25'}">&#9733;</span>`;
    return out;
  }

  function renderAdminReviews(list) {
    const wrap = $id('adm-reviews-wrap');
    if (!list.length) {
      wrap.innerHTML = '<p class="empty-state">Aucun avis reçu pour le moment.</p>';
      return;
    }
    const rows = list
      .map(
        (r) => `
      <tr>
        <td>${fmtDateFR(r.created_at)}</td>
        <td>${r.author_name}</td>
        <td style="color:var(--gold); letter-spacing:1px;">${reviewStarsHtml(r.rating)}</td>
        <td style="max-width:320px;">${r.comment}</td>
        <td><span class="badge ${REVIEW_STATUS_BADGE[r.status] || ''}">${REVIEW_STATUS_LABELS[r.status] || r.status}</span></td>
        <td class="actions">
          ${r.status !== 'approved' ? `<button class="btn-sm primary" data-action="approve-review" data-id="${r.id}">Approuver</button>` : ''}
          ${r.status !== 'rejected' ? `<button class="btn-sm" data-action="reject-review" data-id="${r.id}">Rejeter</button>` : ''}
          <button class="btn-sm danger" data-action="delete-review" data-id="${r.id}">Supprimer</button>
        </td>
      </tr>`
      )
      .join('');
    wrap.innerHTML = `<div style="overflow-x:auto;"><table class="data-table">
      <thead><tr><th>Date</th><th>Auteur</th><th>Note</th><th>Avis</th><th>Statut</th><th>Actions</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;

    wrap.querySelectorAll('button[data-action="approve-review"], button[data-action="reject-review"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const status = btn.dataset.action === 'approve-review' ? 'approved' : 'rejected';
        try {
          await apiFetch(`/api/admin/reviews/${btn.dataset.id}/status`, { method: 'POST', body: JSON.stringify({ status }) });
          showToast(status === 'approved' ? 'Avis approuvé — visible sur le site.' : 'Avis rejeté.');
          loadReviews();
        } catch (e) {
          showToast(e.message, true);
        }
      });
    });
    wrap.querySelectorAll('button[data-action="delete-review"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        /* confirmation désactivée dans cet artefact de démo */
        try {
          await apiFetch(`/api/admin/reviews/${btn.dataset.id}`, { method: 'DELETE' });
          showToast('Avis supprimé.');
          loadReviews();
        } catch (e) {
          showToast(e.message, true);
        }
      });
    });
  }

  async function loadReviews() {
    try {
      const r = await apiFetch('/api/admin/reviews');
      renderAdminReviews(r.reviews || []);
    } catch (e) {
      $id('adm-reviews-wrap').innerHTML = `<p class="empty-state">${e.message}</p>`;
    }
  }

  // ---- Retour client (messages privés post-séjour, jamais publiés) ----
  function renderAdminFeedback(list) {
    const wrap = $id('adm-feedback-wrap');
    if (!list.length) {
      wrap.innerHTML = '<p class="empty-state">Aucun retour reçu pour le moment.</p>';
      return;
    }
    const rows = list
      .map(
        (f) => `
      <tr${f.read_by_admin ? '' : ' style="font-weight:600;"'}>
        <td>${fmtDateFR(f.check_in)} → ${fmtDateFR(f.check_out)}</td>
        <td>${f.full_name}</td>
        <td style="color:var(--gold); letter-spacing:1px;">${f.rating ? reviewStarsHtml(f.rating) : '<span style="color:var(--ink-soft); font-weight:400;">—</span>'}</td>
        <td style="max-width:340px;">${f.comment}</td>
        <td>${f.read_by_admin ? '<span class="badge badge-confirmed">Lu</span>' : '<span class="badge badge-pending">Non lu</span>'}</td>
        <td class="actions">
          ${!f.read_by_admin ? `<button class="btn-sm primary" data-action="read-feedback" data-id="${f.id}">Marquer lu</button>` : ''}
          <button class="btn-sm danger" data-action="delete-feedback" data-id="${f.id}">Supprimer</button>
        </td>
      </tr>`
      )
      .join('');
    wrap.innerHTML = `<div style="overflow-x:auto;"><table class="data-table">
      <thead><tr><th>Séjour</th><th>Client</th><th>Note</th><th>Retour</th><th>Statut</th><th>Actions</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;

    wrap.querySelectorAll('button[data-action="read-feedback"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await apiFetch(`/api/admin/feedback/${btn.dataset.id}/read`, { method: 'POST', body: JSON.stringify({}) });
          loadFeedback();
        } catch (e) {
          showToast(e.message, true);
        }
      });
    });
    wrap.querySelectorAll('button[data-action="delete-feedback"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        /* confirmation désactivée dans cet artefact de démo */
        try {
          await apiFetch(`/api/admin/feedback/${btn.dataset.id}`, { method: 'DELETE' });
          showToast('Retour supprimé.');
          loadFeedback();
        } catch (e) {
          showToast(e.message, true);
        }
      });
    });
  }

  async function loadFeedback() {
    try {
      const r = await apiFetch('/api/admin/feedback');
      renderAdminFeedback(r.feedback || []);
    } catch (e) {
      $id('adm-feedback-wrap').innerHTML = `<p class="empty-state">${e.message}</p>`;
    }
  }

  // ---- Onglets ----
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
      await apiFetch('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });
      showToast('Mot de passe mis à jour.');
      $id('change-password-form').reset();
      $id('must-change-banner').style.display = 'none';
    } catch (err) {
      showToast(err.message || 'Erreur lors de la mise à jour.', true);
    }
  });

  // Rôle « Bureau » : mêmes écrans que l'administrateur, sauf blocage de dates,
  // suppressions, rôles, tarifs et envois groupés (refusés aussi côté serveur).
  function applyBureauMode() {
    document.body.classList.add('is-bureau');
    const hide = (el) => { if (el) el.style.display = 'none'; };
    hide($id('adm-block-reason') && $id('adm-block-reason').closest('.form-row'));
    hide($id('adm-block-btn')); hide($id('adm-unblock-btn'));
    hide($id('adm-per-btn') && $id('adm-per-btn').closest('.dash-card'));
    const nm = $id('nm-role');
    if (nm) { hide(nm); const lab = root.querySelector('label[for="nm-role"]'); hide(lab); }
    const calCard = $id('adm-block-btn') && $id('adm-block-btn').closest('.dash-card');
    if (calCard) {
      const note = document.createElement('p');
      note.style.cssText = 'color:var(--ink-soft); font-size:0.85rem; margin-top:10px;';
      note.textContent = 'Le blocage et le déblocage de dates sont réservés aux administrateurs.';
      calCard.appendChild(note);
    }
  }

  async function init() {
    const me = await requireAuth('admin');
    if (!me) return;
    $id('admin-name').textContent = me.prenom ? (me.prenom + ' (' + me.fullName + ')') : me.fullName;
    if (me.compteBureau && !me.prenom) { try { await apiFetch('/api/auth/logout', { method: 'POST' }); } catch (e) {} location.href = 'login.html'; return; }
    currentAdminEmail = me.email;
    currentIsBureau = !!me.bureau;
    if (currentIsBureau) applyBureauMode();
    if (me.mustChangePassword) $id('must-change-banner').style.display = 'block';
    initTabs();
    loadAvailability();
    loadReservations();
    loadContent();
    loadDocs();
    loadProjects();
    loadReviews();
    loadFeedback();
    loadJournal();
    const ht = root.querySelector('.dash-tab[data-tab="historique"]');
    if (ht) ht.addEventListener('click', loadJournal);
  }

  // ---- Historique (journal des actions) ----
  const LIBELLES_JOURNAL = [
    [/^\/api\/admin\/connexion$/, 'Connexion'],
    [/^\/api\/admin\/availability$/, 'Disponibilités (blocage / déblocage de dates)'],
    [/^\/api\/admin\/reservations\/[^/]+\/status$/, 'Statut d\'une réservation'],
    [/^\/api\/admin\/reservations/, 'Réservation'],
    [/^\/api\/admin\/members/, 'Membres'],
    [/^\/api\/admin\/documents/, 'Documents'],
    [/^\/api\/admin\/content/, 'Contenu du site'],
    [/^\/api\/admin\/rates/, 'Tarifs'],
    [/^\/api\/admin\/invoices/, 'Factures'],
    [/^\/api\/admin\/projects/, 'Projets'],
    [/^\/api\/admin\/reviews/, 'Avis'],
    [/^\/api\/admin\/feedback/, 'Retours d\'expérience'],
    [/^\/api\/admin\/lastminute/, 'Envoi dernière minute'],
    [/^\/api\/admin\/sync-calendars$/, 'Synchronisation des calendriers'],
  ];
  function libelleJournal(chemin, methode) {
    let l = chemin.replace('/api/admin/', '');
    for (const [re, t] of LIBELLES_JOURNAL) { if (re.test(chemin)) { l = t; break; } }
    if (methode === 'DELETE') l += ' — suppression';
    return l;
  }
  function detailJournal(d) {
    if (!d) return '';
    try {
      const o = JSON.parse(d);
      if (Array.isArray(o.dates)) {
        const ds = o.dates.slice().sort();
        const per = ds.length > 1 ? ds[0] + ' → ' + ds[ds.length - 1] + ' (' + ds.length + ' j)' : ds[0];
        return (o.action === 'block' ? 'Bloque ' : o.action === 'unblock' ? 'Débloque ' : '') + per + (o.reason ? ' — « ' + o.reason + ' »' : '');
      }
      return Object.keys(o).slice(0, 6).map((k) => k + ' : ' + String(typeof o[k] === 'object' ? JSON.stringify(o[k]) : o[k]).slice(0, 60)).join(' · ');
    } catch (e) { return String(d).slice(0, 120); }
  }
  async function loadJournal() {
    const wrap = $id('adm-journal-wrap');
    if (!wrap) return;
    try {
      const r = await apiFetch('/api/admin/journal');
      const rows = r.journal || [];
      if (!rows.length) { wrap.innerHTML = '<p class="empty-state">Aucune action enregistrée pour l\'instant.</p>'; return; }
      const fmt = (iso) => new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      wrap.innerHTML = '<div style="overflow-x:auto;"><table style="width:100%; border-collapse:collapse; font-size:0.86rem;"><thead><tr style="text-align:left; border-bottom:1px solid var(--line, #ddd);"><th style="padding:6px 8px;">Date</th><th style="padding:6px 8px;">Qui</th><th style="padding:6px 8px;">Action</th><th style="padding:6px 8px;">Détail</th></tr></thead><tbody>' +
        rows.map((x) => '<tr style="border-bottom:1px solid var(--line, #eee);"><td style="padding:6px 8px; white-space:nowrap;">' + escHtml(fmt(x.le)) + '</td><td style="padding:6px 8px;"><strong>' + escHtml(x.prenom || '—') + '</strong><br><span style="color:var(--ink-soft); font-size:0.78rem;">' + escHtml(x.email || '') + '</span></td><td style="padding:6px 8px;">' + escHtml(libelleJournal(x.chemin || '', x.methode)) + '</td><td style="padding:6px 8px; color:var(--ink-soft);">' + escHtml(detailJournal(x.detail)) + '</td></tr>').join('') +
        '</tbody></table></div>';
    } catch (e) {
      wrap.innerHTML = '<p class="empty-state">' + escHtml(e.message || 'Erreur') + '</p>';
    }
  }
  // Fix 19/10/2026 : même correction que assets/espace-abonne.js — appel
  // direct de init() (page à part sur le vrai site, hash-gating de l'ancien
  // artefact de démo retiré).
  init();
})();

