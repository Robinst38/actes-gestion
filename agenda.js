/*
 * Chalet Bellevue — agenda des environs
 *  - données lues sur l'API (/api/agenda), mises à jour chaque mois ;
 *  - roulement : les événements terminés disparaissent d'eux-mêmes chaque jour ;
 *  - carrousel par catégorie (flèches, balayage tactile, défilement automatique doux).
 * Sans JavaScript ou si l'API ne répond pas, la sélection intégrée à la page reste affichée
 * (filtrée elle aussi par date).
 */
(function () {
  'use strict';

  var section = document.getElementById('agenda');
  if (!section) return;

  var API = (typeof API_BASE_URL === 'string' && API_BASE_URL && API_BASE_URL.indexOf('REMPLACER') === -1)
    ? API_BASE_URL.replace(/\/$/, '') : '';
  var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
    'septembre', 'octobre', 'novembre', 'décembre'];
  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function todayIso() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  var TODAY = todayIso();

  function frDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    if (!m) return '';
    var day = Number(m[3]);
    return (day === 1 ? '1er' : day) + ' ' + MOIS[Number(m[2]) - 1] + ' ' + m[1];
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  function buildItem(ev) {
    var item = el('article', 'agenda-item');
    item.setAttribute('data-start', ev.start || '');
    item.setAttribute('data-end', ev.end || ev.start || '');
    var top = el('div', 'agenda-item-top');
    top.appendChild(el('span', 'agenda-dates', ev.dates || frDate(ev.start)));
    if (ev.start && ev.start <= TODAY) top.appendChild(el('span', 'agenda-live', 'En cours'));
    item.appendChild(top);
    item.appendChild(el('h4', '', ev.title || ''));
    var loc = ev.place || '';
    if (ev.time) loc += (loc ? ' · ' : '') + ev.time;
    if (loc) item.appendChild(el('p', 'agenda-loc', loc));
    if (ev.desc) item.appendChild(el('p', 'agenda-desc', ev.desc));
    return item;
  }

  /* ---------- Rendu depuis les données de l'API ---------- */
  function render(data) {
    var events = (data && Array.isArray(data.events)) ? data.events : [];
    var byCat = {};
    events.forEach(function (ev) {
      var end = ev.end || ev.start;
      if (!ev.cat || !end || end < TODAY) return; // roulement : on retire ce qui est passé
      (byCat[ev.cat] = byCat[ev.cat] || []).push(ev);
    });
    section.querySelectorAll('.agenda-cat[data-cat]').forEach(function (cat) {
      var list = cat.querySelector('.agenda-list');
      if (!list) return;
      var evs = (byCat[cat.getAttribute('data-cat')] || []).sort(function (a, b) {
        return (a.start || '').localeCompare(b.start || '') || (a.end || '').localeCompare(b.end || '');
      });
      list.textContent = '';
      evs.forEach(function (ev) { list.appendChild(buildItem(ev)); });
    });
    if (data && data.updated) setNote(data.updated);
    finish();
  }

  /* ---------- Repli : on filtre la sélection déjà présente dans la page ---------- */
  function filterStatic() {
    section.querySelectorAll('.agenda-item[data-end]').forEach(function (item) {
      var end = item.getAttribute('data-end');
      var start = item.getAttribute('data-start');
      if (end && end < TODAY) { item.remove(); return; }
      if (start && start <= TODAY && !item.querySelector('.agenda-live')) {
        var top = item.querySelector('.agenda-item-top');
        if (top) top.appendChild(el('span', 'agenda-live', 'En cours'));
      }
    });
    finish();
  }

  function setNote(updated) {
    var span = section.querySelector('[data-agenda-updated]');
    if (span && frDate(updated)) span.textContent = frDate(updated);
  }

  /* ---------- Masquage des catégories vides + carrousels ---------- */
  function finish() {
    var visible = 0;
    section.querySelectorAll('.agenda-cat[data-cat]').forEach(function (cat) {
      var n = cat.querySelectorAll('.agenda-item').length;
      cat.hidden = n === 0;
      if (n) visible++;
      var count = cat.querySelector('.agenda-count');
      if (count) count.textContent = n + (n > 1 ? ' événements' : ' événement');
      setupCarousel(cat);
    });
    var empty = section.querySelector('.agenda-empty');
    if (empty) empty.hidden = visible > 0;
  }

  var carousels = [];
  function setupCarousel(cat) {
    var list = cat.querySelector('.agenda-list');
    var prev = cat.querySelector('.agenda-nav-prev');
    var next = cat.querySelector('.agenda-nav-next');
    if (!list || !prev || !next) return;

    if (!list.__carousel) {
      var c = { list: list, prev: prev, next: next, pausedUntil: 0, hover: false, visible: false };
      list.__carousel = c;
      carousels.push(c);
      prev.addEventListener('click', function () { step(c, -1); c.pausedUntil = Date.now() + 20000; });
      next.addEventListener('click', function () { step(c, 1); c.pausedUntil = Date.now() + 20000; });
      list.addEventListener('scroll', function () { updateButtons(c); }, { passive: true });
      ['pointerdown', 'touchstart', 'wheel', 'focusin'].forEach(function (evt) {
        list.addEventListener(evt, function () { c.pausedUntil = Date.now() + 20000; }, { passive: true });
      });
      cat.addEventListener('mouseenter', function () { c.hover = true; });
      cat.addEventListener('mouseleave', function () { c.hover = false; });
      list.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight') { e.preventDefault(); step(c, 1); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); step(c, -1); }
      });
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (entries) {
          entries.forEach(function (en) { c.visible = en.isIntersecting; });
        }, { threshold: 0.5 }).observe(list);
      }
    }
    updateButtons(list.__carousel);
  }

  function cardWidth(list) {
    var first = list.querySelector('.agenda-item');
    if (!first) return list.clientWidth;
    var gap = parseFloat(getComputedStyle(list).columnGap || getComputedStyle(list).gap) || 0;
    return first.getBoundingClientRect().width + gap;
  }

  function step(c, dir, loop) {
    var list = c.list;
    var max = list.scrollWidth - list.clientWidth;
    if (loop && dir > 0 && list.scrollLeft >= max - 4) {
      list.scrollTo({ left: 0, behavior: REDUCED ? 'auto' : 'smooth' });
      return;
    }
    list.scrollBy({ left: dir * cardWidth(list), behavior: REDUCED ? 'auto' : 'smooth' });
  }

  function updateButtons(c) {
    var list = c.list;
    var max = list.scrollWidth - list.clientWidth;
    var scrollable = max > 4;
    c.prev.hidden = c.next.hidden = !scrollable;
    c.prev.disabled = list.scrollLeft <= 8;
    c.next.disabled = list.scrollLeft >= max - 8;
    list.classList.toggle('is-scrollable', scrollable);
  }

  window.addEventListener('resize', function () { carousels.forEach(updateButtons); });

  // Défilement automatique doux : une carte toutes les 6 s, seulement pour le carrousel visible,
  // en pause au survol / après une interaction ; désactivé si l'utilisateur limite les animations.
  if (!REDUCED) {
    setInterval(function () {
      if (document.hidden) return;
      var now = Date.now();
      carousels.forEach(function (c) {
        if (!c.visible || c.hover || now < c.pausedUntil) return;
        if (c.list.scrollWidth - c.list.clientWidth <= 4) return;
        step(c, 1, true);
      });
    }, 6000);
  }

  /* ---------- Chargement ---------- */
  if (!API || !window.fetch) { filterStatic(); return; }
  var done = false;
  var timer = setTimeout(function () { if (!done) { done = true; filterStatic(); } }, 6000);
  fetch(API + '/api/agenda', { credentials: 'omit' })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (data) {
      if (done) return;
      done = true; clearTimeout(timer);
      if (!data || !Array.isArray(data.events) || !data.events.length) { filterStatic(); return; }
      render(data);
    })
    .catch(function () { if (!done) { done = true; clearTimeout(timer); filterStatic(); } });
})();
