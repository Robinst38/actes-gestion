
/* =========================================================================
   Widget de réservation — Chalet Bellevue
   -------------------------------------------------------------------------
   Se connecte au vrai backend (Cloudflare Worker + D1, voir worker/) dès que
   assets/api-config.js pointe vers un Worker déployé :
     - GET  /api/availability   → dates bloquées + tarifs réels (loadLiveData)
     - POST /api/reservations   → envoi réel de la demande (submitRequest)
   Tant que API_BASE_URL est encore le placeholder (ou que l'API est
   injoignable), la page continue de fonctionner avec le relevé manuel du
   13/08/2026 (REAL_BLOCKED / NO_CHECKIN) et la grille tarifaire ci-dessous,
   pour ne jamais bloquer le site avant le déploiement du Worker.
   Le paiement en ligne (Stripe Checkout) reste à brancher côté Worker
   (voir le TODO Stripe dans worker/worker.js) — le bouton "Payer en ligne"
   envoie pour l'instant une demande classique, comme "Envoyer une demande".
   ========================================================================= */

/* ---------- 1. TARIFS (EXEMPLE — à remplacer par la grille réelle) ---------- */
const RATE_CONFIG = {
  currency: '€',
  minNights: 2,
  membershipFee: 30,      // adhésion annuelle A.C.T.E.S, obligatoire
  cleaningFee: 130,       // ménage de fin de séjour, optionnel
  depositPercent: 25,     // acompte à la réservation
  seasons: [
    // months = mois (1-12) où ce tarif s'applique. Le dernier de la liste sert de tarif par défaut.
    { label: 'Haute saison (juillet–août, vac. de Noël & février)', months: [7, 8, 12, 2], pricePerNight: 180 },
    { label: 'Moyenne saison (avril–juin, septembre)', months: [4, 5, 6, 9], pricePerNight: 140 },
    { label: 'Basse saison (reste de l\'année)', months: [1, 3, 10, 11], pricePerNight: 100 },
  ],
  // Taxe de séjour — taux réels publiés par la Communauté de communes Pyrénées
  // Haut Garonnaises (dont dépend Bagnères-de-Luchon) pour un meublé de tourisme
  // NON CLASSÉ : taxe proportionnelle (le chalet n'a pas de classement en étoiles
  // à notre connaissance — à confirmer). Source : ccphg.taxesejour.fr (consulté 08/2026).
  // Si le chalet obtient un classement en meublé de tourisme, ce barème change
  // (tarif fixe par nuit et par personne selon la catégorie, pas un pourcentage).
  touristTax: {
    ratePercent: 5,                 // 5% du prix de la nuitée par personne (hors taxe), meublé non classé
    capPerPersonPerNight: 3.00,     // plafond avant majorations
    departmentalSurchargePercent: 10,  // taxe additionnelle Haute-Garonne
    regionalSurchargePercent: 34,      // taxe additionnelle régionale (financement LGV GPSO, depuis 01/2024)
    exemptMinors: true,             // les mineurs (-18 ans) sont exonérés
  },
};

function touristTaxMultiplier() {
  const t = RATE_CONFIG.touristTax;
  return 1 + (t.departmentalSurchargePercent + t.regionalSurchargePercent) / 100;
}

function rateForMonth(month) {
  for (const s of RATE_CONFIG.seasons) {
    if (s.months.includes(month)) return s;
  }
  return RATE_CONFIG.seasons[RATE_CONFIG.seasons.length - 1];
}

/* ---------- 2. DISPONIBILITÉ ----------
   Instantané pris manuellement le 13/08/2026 depuis le vrai calendrier de
   réservation WeeBnB (chalet-bellevue-luchon.fr/bnb/bnb-1-1) : dates
   réellement déjà réservées à cette date-là. Ce n'est PAS une synchronisation
   automatique — sans backend, ces dates resteront figées à ce qu'elles étaient
   le 13/08/2026 et devront être remises à jour manuellement (ou, mieux,
   remplacées par un vrai flux une fois le backend branché, voir TODO BACKEND
   ci-dessous). */
const REAL_BLOCKED = new Set([
  // Août 2026 — jours "unavailable" sur le calendrier WeeBnB
  '2026-08-18', '2026-08-19', '2026-08-20',
  '2026-08-29', '2026-08-30', '2026-08-31',
  // Septembre 2026
  '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04',
]);
// Jours où le calendrier WeeBnB affiche "no-checkin" : le séjour d'un autre
// groupe se termine ce jour-là, donc on ne peut pas Y COMMENCER un séjour,
// mais la nuit elle-même n'est pas occupée (on peut toujours en faire une
// date de départ, ou une nuit traversée par un séjour déjà commencé avant).
const NO_CHECKIN = new Set([
  '2026-08-15', '2026-08-28', '2026-09-30',
]);

/* ---------- 2bis. CONNEXION AU VRAI BACKEND (si déployé) ---------- */
function monthsInRange(startMonth, endMonth) {
  const months = [];
  let m = startMonth;
  for (let i = 0; i < 12; i++) {
    months.push(m);
    if (m === endMonth) break;
    m = m === 12 ? 1 : m + 1;
  }
  return months;
}

function apiConfigured() {
  return typeof API_BASE_URL === 'string' && API_BASE_URL && !API_BASE_URL.includes('REMPLACER');
}

/** Tente de charger dispo + tarifs réels depuis le Worker. Retourne true si
 *  les données live ont bien été appliquées, false si on reste sur le relevé
 *  manuel local (API pas encore déployée ou injoignable). */
async function loadLiveData() {
  if (!apiConfigured()) return false;
  try {
    const res = await fetch(API_BASE_URL + '/api/availability', { credentials: 'include' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (Array.isArray(data.blocked)) {
      REAL_BLOCKED.clear();
      data.blocked.forEach((d) => REAL_BLOCKED.add(d));
    }
    if (Array.isArray(data.noCheckin)) {
      NO_CHECKIN.clear();
      data.noCheckin.forEach((d) => NO_CHECKIN.add(d));
    }
    if (Array.isArray(data.rates) && data.rates.length) {
      RATE_CONFIG.seasons = data.rates.map((r) => ({
        label: r.label,
        months: monthsInRange(r.start_month, r.end_month),
        pricePerNight: r.price_per_night,
      }));
      RATE_CONFIG.minNights = Math.min(...data.rates.map((r) => r.min_nights || 2));
    }
    return true;
  } catch (e) {
    console.warn('Chalet Bellevue — API de réservation injoignable, utilisation du relevé manuel local :', e.message);
    return false;
  }
}

function applyDataSourceNote(isLive) {
  const banner = document.getElementById('bk-demo-banner');
  if (banner) banner.style.display = isLive ? 'none' : 'block';
  const note = document.getElementById('bk-availability-note');
  if (note && isLive) {
    note.textContent = 'Disponibilités et tarifs connectés en direct à la base de réservation.';
  }
}

function fmtISO(d) {
  // Heure locale (et non UTC) : toISOString() décalait toutes les dates d'un jour en France.
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function isPast(d, today) {
  const t = new Date(today); t.setHours(0, 0, 0, 0);
  return d < t;
}
function isBlocked(d) {
  return REAL_BLOCKED.has(fmtISO(d));
}
function isNoCheckin(d) {
  return NO_CHECKIN.has(fmtISO(d));
}

/* ---------- 3. ÉTAT ---------- */
const state = {
  viewMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  start: null,
  end: null,
  adults: 2,
  minors: 0,       // -18 ans, exonérés de taxe de séjour
  wantsCleaning: false,
};
function totalGuests() { return state.adults + state.minors; }

const DOW = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const MONTH_NAMES = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

/* ---------- 4. RENDU CALENDRIER ---------- */
function renderCalendar() {
  const grid = document.getElementById('bk-cal-months');
  if (!grid) return;
  grid.innerHTML = '';
  const today = new Date(); today.setHours(0,0,0,0);

  for (let m = 0; m < 2; m++) {
    const monthDate = new Date(state.viewMonth.getFullYear(), state.viewMonth.getMonth() + m, 1);
    const monthWrap = document.createElement('div');

    const label = document.createElement('div');
    label.className = 'cal-month-name';
    label.textContent = `${MONTH_NAMES[monthDate.getMonth()]} ${monthDate.getFullYear()}`;
    monthWrap.appendChild(label);

    const g = document.createElement('div');
    g.className = 'cal-grid';
    DOW.forEach(d => {
      const el = document.createElement('div');
      el.className = 'cal-dow';
      el.textContent = d;
      g.appendChild(el);
    });

    const firstDow = (monthDate.getDay() + 6) % 7; // lundi = 0
    for (let i = 0; i < firstDow; i++) {
      const empty = document.createElement('div');
      empty.className = 'cal-day is-empty';
      g.appendChild(empty);
    }

    const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(monthDate.getFullYear(), monthDate.getMonth(), day);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cal-day';
      btn.textContent = String(day);

      const past = isPast(d, today);
      const blocked = isBlocked(d);
      const noCheckin = isNoCheckin(d);
      if (past) btn.classList.add('is-past');
      if (blocked && !past) btn.classList.add('is-blocked');
      if (noCheckin && !past && !blocked) btn.classList.add('is-no-checkin');

      if (state.start && fmtISO(d) === fmtISO(state.start)) btn.classList.add('is-selected-start');
      if (state.end && fmtISO(d) === fmtISO(state.end)) btn.classList.add('is-selected-end');
      if (state.start && state.end && d > state.start && d < state.end) btn.classList.add('is-in-range');

      if (!past && !blocked) {
        btn.addEventListener('click', () => onDayClick(d));
      } else {
        btn.disabled = true;
      }
      g.appendChild(btn);
    }
    monthWrap.appendChild(g);
    grid.appendChild(monthWrap);
  }

  document.getElementById('bk-prev').disabled =
    state.viewMonth.getFullYear() === today.getFullYear() && state.viewMonth.getMonth() === today.getMonth();
}

function rangeHasBlocked(start, end) {
  const d = new Date(start);
  while (d < end) {
    if (isBlocked(d)) return true;
    d.setDate(d.getDate() + 1);
  }
  return false;
}

function onDayClick(d) {
  if (!state.start || (state.start && state.end)) {
    if (isNoCheckin(d)) {
      showNote('Arrivée impossible ce jour-là (départ d\'un autre séjour) — choisissez une autre date d\'arrivée.');
      return;
    }
    state.start = d;
    state.end = null;
  } else if (d <= state.start) {
    if (isNoCheckin(d)) {
      showNote('Arrivée impossible ce jour-là (départ d\'un autre séjour) — choisissez une autre date d\'arrivée.');
      return;
    }
    state.start = d;
    state.end = null;
  } else {
    const nights = Math.round((d - state.start) / 86400000);
    if (nights < RATE_CONFIG.minNights) {
      showNote(`Séjour minimum : ${RATE_CONFIG.minNights} nuits.`);
      return;
    }
    if (rangeHasBlocked(state.start, d)) {
      showNote('Certaines dates de cette période sont déjà réservées — choisissez une autre plage.');
      state.start = d;
      state.end = null;
      renderCalendar();
      updateSummary();
      return;
    }
    state.end = d;
  }
  renderCalendar();
  updateSummary();
}

function showNote(msg) {
  const el = document.getElementById('bk-note');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(showNote._t);
  showNote._t = setTimeout(() => { el.style.display = 'none'; }, 4000);
}

/* ---------- 5. PRIX ---------- */
function computePrice() {
  if (!state.start || !state.end) return null;
  const guests = totalGuests();
  const taxableAdults = RATE_CONFIG.touristTax.exemptMinors ? state.adults : guests;
  const multiplier = touristTaxMultiplier();
  let nights = 0;
  let subtotal = 0;
  let taxeSejour = 0;
  const d = new Date(state.start);
  while (d < state.end) {
    const nightlyRate = rateForMonth(d.getMonth() + 1).pricePerNight;
    subtotal += nightlyRate;
    if (guests > 0 && taxableAdults > 0) {
      // taxe de séjour proportionnelle (meublé non classé) : % du coût de la nuitée
      // PAR PERSONNE, plafonnée, puis majorée des taxes additionnelles départementale + régionale
      const perPersonCost = nightlyRate / guests;
      const baseTaxPerPerson = Math.min(
        perPersonCost * RATE_CONFIG.touristTax.ratePercent / 100,
        RATE_CONFIG.touristTax.capPerPersonPerNight
      );
      taxeSejour += baseTaxPerPerson * multiplier * taxableAdults;
    }
    nights++;
    d.setDate(d.getDate() + 1);
  }
  taxeSejour = Math.round(taxeSejour * 100) / 100;
  const cleaning = state.wantsCleaning ? RATE_CONFIG.cleaningFee : 0;
  // L'acompte (pourcentage) ne porte QUE sur la location (nuitées + ménage) :
  // l'adhésion A.C.T.E.S est un forfait fixe annuel, pas une charge qui doit
  // être diluée par le pourcentage d'acompte. Elle est réglée à 100% dès
  // maintenant, en plus de l'acompte sur la location — sinon seule une
  // fraction de l'adhésion (ex. 25% × 30€ = 7,50€) serait perçue à la
  // réservation, ce qui n'a pas de sens pour une cotisation annuelle.
  const rentalBase = subtotal + cleaning;
  const depositOnRental = Math.round(rentalBase * RATE_CONFIG.depositPercent) / 100;
  const deposit = Math.round((depositOnRental + RATE_CONFIG.membershipFee) * 100) / 100;
  const balance = Math.round((rentalBase - depositOnRental) * 100) / 100;
  const total = rentalBase + RATE_CONFIG.membershipFee;
  const grandTotal = Math.round((total + taxeSejour) * 100) / 100;
  return {
    nights, subtotal, cleaning, membership: RATE_CONFIG.membershipFee,
    taxeSejour, taxableAdults, guests,
    total, deposit, balance, grandTotal,
  };
}

function updateSummary() {
  const datesEl = document.getElementById('bk-dates');
  const linesEl = document.getElementById('bk-price-lines');
  const actionsEl = document.getElementById('bk-actions');
  const emptyEl = document.getElementById('bk-empty');
  const price = computePrice();

  if (!price) {
    datesEl.textContent = 'Sélectionnez vos dates d\'arrivée et de départ.';
    linesEl.innerHTML = '';
    actionsEl.style.display = 'none';
    emptyEl.style.display = 'block';
    return;
  }
  emptyEl.style.display = 'none';
  actionsEl.style.display = 'flex';

  const opts = { day: 'numeric', month: 'short', year: 'numeric' };
  datesEl.textContent = `${state.start.toLocaleDateString('fr-FR', opts)} → ${state.end.toLocaleDateString('fr-FR', opts)} · ${price.nights} nuit${price.nights > 1 ? 's' : ''}`;

  const cur = RATE_CONFIG.currency;
  linesEl.innerHTML = `
    <div class="price-line"><span>Hébergement (${price.nights} nuit${price.nights > 1 ? 's' : ''})</span><span>${price.subtotal}${cur}</span></div>
    ${state.wantsCleaning ? `<div class="price-line"><span>Ménage de fin de séjour</span><span>${price.cleaning}${cur}</span></div>` : ''}
    <div class="price-line"><span>Adhésion A.C.T.E.S (obligatoire, 100% à la réservation)</span><span>${price.membership}${cur}</span></div>
    <div class="price-line total"><span>Sous-total location + adhésion</span><span>${price.total}${cur}</span></div>
    <div class="price-line deposit"><span>À régler maintenant — acompte (${RATE_CONFIG.depositPercent}% de la location) + adhésion</span><span>${price.deposit}${cur}</span></div>
    <div class="price-line"><span>Solde location (1 mois avant le séjour)</span><span>${price.balance}${cur}</span></div>
    <div class="price-line"><span>Taxe de séjour (${price.taxableAdults} adulte${price.taxableAdults > 1 ? 's' : ''} × ${price.nights} nuit${price.nights > 1 ? 's' : ''})</span><span>${price.taxeSejour.toFixed(2)}${cur}</span></div>
    <div class="price-line total"><span>Total du séjour</span><span>${price.grandTotal.toFixed(2)}${cur}</span></div>
  `;
  const taxNote = document.getElementById('bk-tax-note');
  if (taxNote) {
    taxNote.style.display = 'block';
    taxNote.innerHTML = `Taxe de séjour Bagnères-de-Luchon (meublé non classé) : 5% du prix de la nuitée par personne, plafonnée à 3,00${cur} + majorations département (10%) et région (34%) — mineurs exonérés. Généralement réglée sur place, à l'arrivée.`;
  }
}

/* ---------- 6. DEMANDE DE RÉSERVATION ---------- */
async function submitRequest(method) {
  const price = computePrice();
  if (!price) return;
  const name = document.getElementById('bk-name').value.trim();
  const email = document.getElementById('bk-email').value.trim();
  const phone = document.getElementById('bk-phone').value.trim();
  if (!name || !email || !phone) {
    showNote('Merci de renseigner nom, e-mail et téléphone.');
    return;
  }

  const payload = {
    checkIn: fmtISO(state.start),
    checkOut: fmtISO(state.end),
    adults: state.adults,
    minors: state.minors,
    wantsCleaning: state.wantsCleaning,
    price,
    name, email, phone,
    message: document.getElementById('bk-message').value.trim(),
    paymentMethod: method, // 'online' | 'offline' — le paiement en ligne (Stripe) reste à activer côté Worker
  };

  const submitBtn = document.getElementById('bk-form-submit');
  let sentToBackend = false;
  let backendError = null;
  let emailSent = false;

  if (apiConfigured()) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Envoi en cours...';
    try {
      const res = await fetch(API_BASE_URL + '/api/reservations', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.error) || 'Erreur ' + res.status);
      sentToBackend = true;
      emailSent = !!(data && data.emailSent);
    } catch (e) {
      backendError = e.message;
      console.warn('Chalet Bellevue — envoi de la demande au backend impossible :', e.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Confirmer la demande';
    }
  }

  document.getElementById('bk-form-panel').classList.remove('is-open');
  const confirmEl = document.getElementById('bk-confirm');
  confirmEl.classList.add('is-open');

  const longDate = (d) => d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const stay = `<strong>${longDate(state.start)}</strong> au <strong>${longDate(state.end)}</strong> (${price.nights} nuit${price.nights > 1 ? 's' : ''})`;
  const cur = RATE_CONFIG.currency;
  const titleEl = document.getElementById('bk-confirm-title');
  const iconEl = confirmEl.querySelector('.icon-ok');

  if (sentToBackend) {
    if (iconEl) { iconEl.textContent = '✓'; iconEl.classList.remove('is-error'); }
    if (titleEl) titleEl.textContent = 'Merci, votre demande est bien envoyée !';
    const step2 = method === 'online'
      ? `Serge vous recontacte pour organiser le règlement de l'acompte.`
      : `Il vous recontacte pour organiser le règlement de l'acompte et de l'adhésion annuelle.`;
    document.getElementById('bk-confirm-text').innerHTML =
      `<p>Séjour du ${stay}, transmis à l'association.</p>` +
      `<p><strong>La suite :</strong></p>` +
      `<ol><li>Serge valide votre demande personnellement sous 48 h.</li><li>${step2}</li><li>Le solde est à régler un mois avant votre arrivée.</li></ol>` +
      `<p>La taxe de séjour se règle sur place.</p>` +
      (emailSent ? `<p>Vous allez recevoir dans quelques minutes, à <strong>${payload.email}</strong>, un e-mail avec le lien et le code d’accès à votre espace séjour (pensez à vérifier vos courriers indésirables).</p>` : '');
  } else {
    console.log('Demande de réservation (non envoyée) :', payload, backendError ? `Erreur : ${backendError}` : '');
    if (iconEl) { iconEl.textContent = '✕'; iconEl.classList.add('is-error'); }
    if (titleEl) titleEl.textContent = "Votre demande n'a pas pu être enregistrée automatiquement";
    document.getElementById('bk-confirm-text').innerHTML =
      `<p>Pas de panique : écrivez-nous à <a href="mailto:contact@chalet-bellevue.fr">contact@chalet-bellevue.fr</a> en indiquant vos dates (${stay}) et le nombre de personnes.</p>` +
      ``;
  }
}

/* ---------- 7. TABLEAU DES TARIFS ---------- */
function renderRateTable() {
  const body = document.getElementById('bk-rate-table-body');
  if (!body) return;
  body.innerHTML = RATE_CONFIG.seasons
    .map(s => `<tr><td>${s.label}</td><td>${s.pricePerNight}${RATE_CONFIG.currency}</td></tr>`)
    .join('');
}

/* ---------- 8. INIT ---------- */
document.addEventListener('DOMContentLoaded', async () => {
  if (!document.getElementById('bk-cal-months')) return; // page sans widget

  document.getElementById('bk-prev').addEventListener('click', () => {
    state.viewMonth.setMonth(state.viewMonth.getMonth() - 1);
    renderCalendar();
  });
  document.getElementById('bk-next').addEventListener('click', () => {
    state.viewMonth.setMonth(state.viewMonth.getMonth() + 1);
    renderCalendar();
  });

  document.getElementById('bk-adults-minus').addEventListener('click', () => {
    if (state.adults > 1) { state.adults--; document.getElementById('bk-adults-count').value = state.adults; updateSummary(); }
  });
  document.getElementById('bk-adults-plus').addEventListener('click', () => {
    if (totalGuests() < 24) { state.adults++; document.getElementById('bk-adults-count').value = state.adults; updateSummary(); }
  });
  document.getElementById('bk-minors-minus').addEventListener('click', () => {
    if (state.minors > 0) { state.minors--; document.getElementById('bk-minors-count').value = state.minors; updateSummary(); }
  });
  document.getElementById('bk-minors-plus').addEventListener('click', () => {
    if (totalGuests() < 24) { state.minors++; document.getElementById('bk-minors-count').value = state.minors; updateSummary(); }
  });

  document.getElementById('bk-cleaning').addEventListener('change', (e) => {
    state.wantsCleaning = e.target.checked;
    updateSummary();
  });

  document.getElementById('bk-request-btn').addEventListener('click', () => {
    document.getElementById('bk-form-panel').classList.add('is-open');
  });
  document.getElementById('bk-pay-online-btn').addEventListener('click', () => {
    document.getElementById('bk-form-panel').classList.add('is-open');
    document.getElementById('bk-form-panel').dataset.method = 'online';
  });
  document.getElementById('bk-form-submit').addEventListener('click', () => {
    const method = document.getElementById('bk-form-panel').dataset.method || 'offline';
    submitRequest(method);
  });

  const isLive = await loadLiveData();
  applyDataSourceNote(isLive);
(function prefillFromUrl() {
  try {
    const q = new URLSearchParams(location.search);
    const a = q.get('arrivee'), b = q.get('depart');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a || '') || !/^\d{4}-\d{2}-\d{2}$/.test(b || '')) return;
    const pa = a.split('-').map(Number), pb = b.split('-').map(Number);
    const s = new Date(pa[0], pa[1] - 1, pa[2]), e = new Date(pb[0], pb[1] - 1, pb[2]);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const n = Math.round((e - s) / 86400000);
    if (s < today || n < RATE_CONFIG.minNights || isNoCheckin(s) || rangeHasBlocked(s, e)) return;
    state.start = s; state.end = e; state.viewMonth = new Date(s.getFullYear(), s.getMonth(), 1);
  } catch (err) { /* lien invalide : calendrier vide */ }
})();
  renderCalendar();
  updateSummary();
  renderRateTable();
});



/* Saisie directe du nombre d'adultes / d'enfants (21/10/2026) */
document.addEventListener('DOMContentLoaded', function () {
  function bind(id, key, min) {
    var el = document.getElementById(id);
    if (!el || el.tagName !== 'INPUT') return;
    var other = function () { return key === 'adults' ? state.minors : state.adults; };
    function apply(final) {
      var raw = el.value.replace(/\D/g, '');
      if (raw === '') { if (final) el.value = state[key]; return; }
      var v = parseInt(raw, 10);
      var max = 24 - other();
      if (v > max) v = max;
      if (v < min) v = min;
      state[key] = v;
      el.value = String(v);
      updateSummary();
    }
    el.addEventListener('input', function () { apply(false); });
    el.addEventListener('blur', function () { apply(true); });
    el.addEventListener('focus', function () { el.select(); });
    el.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
  }
  bind('bk-adults-count', 'adults', 1);
  bind('bk-minors-count', 'minors', 0);
});
