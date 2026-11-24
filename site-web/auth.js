
/**
 * Petit utilitaire partagé pour appeler l'API (login.html, espace-abonne.html,
 * espace-admin.html). Dépend de API_BASE_URL défini dans assets/api-config.js
 * (chargé avant ce fichier).
 */

async function apiFetch(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const res = await fetch(API_BASE_URL + path, {
    credentials: 'include',
    headers: isFormData ? {} : { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  let data = null;
  try { data = await res.json(); } catch (e) { /* réponse sans corps JSON */ }
  if (!res.ok) {
    const message = (data && data.error) || `Erreur ${res.status}`;
    throw new Error(message);
  }
  return data;
}

async function requireAuth(role) {
  // Fix 19/10/2026 : sur le vrai site (pages séparées), la navigation se
  // fait avec location.href vers le fichier réel, pas avec location.hash
  // (qui ne faisait rien que changer l'ancre de la page déjà affichée —
  // reliquat de l'ancien artefact de démo en SPA à une seule page).
  try {
    const me = await apiFetch('/api/auth/me');
    if (!me.authenticated) {
      location.href = 'login.html';
      return null;
    }
    if (role === 'admin' && me.role !== 'admin') {
      location.href = 'espace-abonne.html';
      return null;
    }
    return me;
  } catch (e) {
    location.href = 'login.html';
    return null;
  }
}

async function doLogout() {
  try { await apiFetch('/api/auth/logout', { method: 'POST' }); } catch (e) { /* ignore */ }
  location.href = 'login.html';
}

function fmtDateFR(iso) {
  if (!iso) return '';
  const d = new Date(iso + (iso.length <= 10 ? 'T00:00:00' : ''));
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

const STATUS_LABELS = {
  pending: 'En attente', confirmed: 'Confirmée', cancelled: 'Annulée',
  paid: 'Payé', failed: 'Échoué',
};

let toastTimer = null;
function showToast(message, isError = false) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.toggle('is-error', !!isError);
  el.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-visible'), 3200);
}

