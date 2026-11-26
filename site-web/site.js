/* assets/site.js — Chalet Bellevue
   Reconstruit le 15/10/2026 (voir claude/site-web-refonte.md) à partir de
   l'artefact de démo encore disponible, après la perte du dossier de travail
   précédent dans le bac à sable. Regroupe : menu mobile, bouton "Réserver"
   flottant, carte de localisation du pied de page (chargement au clic,
   RGPD), et la visionneuse plein écran des photos (lightbox). */

document.getElementById('year') && (document.getElementById('year').textContent = new Date().getFullYear());

const toggle = document.querySelector('.menu-toggle');
const navList = document.querySelector('nav ul');
if (toggle) {
  toggle.setAttribute('aria-expanded', 'false');
  toggle.addEventListener('click', () => {
    navList.classList.toggle('open');
    toggle.classList.toggle('open');
    toggle.setAttribute('aria-expanded', navList.classList.contains('open') ? 'true' : 'false');
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && navList && navList.classList.contains('open')) {
      navList.classList.remove('open'); toggle.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false'); toggle.focus();
    }
  });
}
document.querySelectorAll('nav a').forEach((a) => {
  a.addEventListener('click', () => {
    if (navList) navList.classList.remove('open');
    if (toggle) toggle.classList.remove('open');
  });
});

const stickyCta = document.querySelector('.sticky-cta');
const activeHero = document.querySelector('.hero, .page-banner');
function toggleSticky() {
  if (!stickyCta || !activeHero) return;
  const heroBottom = activeHero.getBoundingClientRect().bottom;
  stickyCta.classList.toggle('is-visible', heroBottom < 0);
}
window.addEventListener('scroll', toggleSticky, { passive: true });
toggleSticky();

// RGPD (audit 12/10/2026, constat 7) : la carte du pied de page (présente sur
// toutes les pages) ne charge l'iframe Google Maps, et donc ne dépose son
// cookie tiers, qu'après un clic explicite sur « Afficher la carte ».
(function () {
  const btn = document.getElementById('footer-map-load');
  const wrap = document.getElementById('footer-map-wrap');
  if (!btn || !wrap) return;
  btn.addEventListener('click', function () {
    const iframe = document.createElement('iframe');
    iframe.loading = 'lazy';
    iframe.referrerPolicy = 'no-referrer-when-downgrade';
    iframe.title = 'Localisation du Chalet Bellevue';
    iframe.src = 'https://maps.google.com/maps?q=42.77744,0.59906&z=14&output=embed';
    wrap.innerHTML = '';
    wrap.appendChild(iframe);
  });
})();


// Carte de la page Contact : chargée au clic (RGPD), comme celle du pied de page.
(function () {
  const btn = document.getElementById('contact-map-load');
  const wrap = document.getElementById('contact-map-wrap');
  if (!btn || !wrap) return;
  btn.addEventListener('click', function () {
    const iframe = document.createElement('iframe');
    iframe.loading = 'lazy';
    iframe.referrerPolicy = 'no-referrer-when-downgrade';
    iframe.title = 'Localisation du Chalet Bellevue';
    iframe.src = 'https://maps.google.com/maps?q=42.77744,0.59906&z=14&output=embed';
    iframe.style.cssText = 'width:100%;height:360px;border:0;display:block';
    wrap.innerHTML = '';
    wrap.style.padding = '0';
    wrap.appendChild(iframe);
  });
})();


// LIGHTBOX_START — bloc extrait tel quel par build_spa.py (voir marqueurs
// LIGHTBOX_START/LIGHTBOX_END) pour l'artefact de démo, qui a son propre
// bundle de scripts (router_js) sans assets/site.js : ne pas dupliquer ici
// la logique menu-toggle/sticky-cta déjà présente dans router_js, pour
// éviter d'attacher les écouteurs deux fois côté démo.
// Lightbox "cliquer pour afficher en grand" (19/08/2026, demande explicite)
// — s'applique à toute image marquée .zoomable-img, où qu'elle soit sur le
// site (aujourd'hui : les photos du chalet sur chalet.html). Les images
// partageant le même data-lightbox-group se parcourent avec les flèches.
const zoomImgs = Array.prototype.slice.call(document.querySelectorAll('.zoomable-img'));
if(zoomImgs.length){
  const zoomGroups = {};
  zoomImgs.forEach((img) => {
    const g = img.dataset.lightboxGroup || 'default';
    (zoomGroups[g] = zoomGroups[g] || []).push(img);
  });

  const lbOverlay = document.createElement('div');
  lbOverlay.className = 'lightbox-overlay';
  lbOverlay.setAttribute('role', 'dialog');
  lbOverlay.setAttribute('aria-modal', 'true');
  lbOverlay.setAttribute('aria-label', 'Photo agrandie');
  lbOverlay.innerHTML =
    '<button type="button" class="lightbox-close" aria-label="Fermer">&times;</button>' +
    '<button type="button" class="lightbox-prev" aria-label="Photo précédente">&#8249;</button>' +
    '<button type="button" class="lightbox-next" aria-label="Photo suivante">&#8250;</button>' +
    '<figure class="lightbox-figure"><img class="lightbox-img" alt=""><figcaption class="lightbox-caption"></figcaption></figure>';
  document.body.appendChild(lbOverlay);
  const lbImg = lbOverlay.querySelector('.lightbox-img');
  const lbCaption = lbOverlay.querySelector('.lightbox-caption');
  const lbPrev = lbOverlay.querySelector('.lightbox-prev');
  const lbNext = lbOverlay.querySelector('.lightbox-next');
  const lbClose = lbOverlay.querySelector('.lightbox-close');
  let lbGroup = [];
  let lbIndex = 0;
  let lbTrigger = null;

  const lbCaptionFor = (img) => {
    const fig = img.closest('figure');
    const cap = fig ? fig.querySelector('figcaption') : null;
    return cap ? cap.textContent : (img.alt || '');
  };
  const lbShow = (index) => {
    lbIndex = (index + lbGroup.length) % lbGroup.length;
    const img = lbGroup[lbIndex];
    lbImg.src = img.dataset.full || img.src;
    lbImg.alt = img.alt || '';
    const cap = lbCaptionFor(img);
    lbCaption.textContent = cap;
    lbCaption.style.display = cap ? '' : 'none';
    const multi = lbGroup.length > 1;
    lbPrev.style.display = multi ? '' : 'none';
    lbNext.style.display = multi ? '' : 'none';
  };
  const lbOpen = (img) => {
    lbGroup = zoomGroups[img.dataset.lightboxGroup || 'default'];
    lbShow(lbGroup.indexOf(img));
    lbTrigger = img;
    lbOverlay.classList.add('is-open');
    document.body.classList.add('lightbox-locked');
    document.body.style.overflow = 'hidden';
    lbClose.focus();
  };
  const lbClosePanel = () => {
    lbOverlay.classList.remove('is-open');
    document.body.classList.remove('lightbox-locked');
    document.body.style.overflow = '';
    if (lbTrigger) lbTrigger.focus();
  };

  zoomImgs.forEach((img) => {
    img.setAttribute('tabindex', '0');
    img.setAttribute('role', 'button');
    img.setAttribute('aria-label', 'Agrandir : ' + (img.alt || 'photo'));
    img.addEventListener('click', () => lbOpen(img));
    img.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); lbOpen(img); } });
  });
  lbClose.addEventListener('click', lbClosePanel);
  lbOverlay.addEventListener('click', (e) => { if(e.target === lbOverlay) lbClosePanel(); });
  lbPrev.addEventListener('click', () => lbShow(lbIndex - 1));
  lbNext.addEventListener('click', () => lbShow(lbIndex + 1));
  document.addEventListener('keydown', (e) => {
    if(!lbOverlay.classList.contains('is-open')) return;
    if(e.key === 'Escape') lbClosePanel();
    else if(e.key === 'Tab') {
      const f = Array.prototype.filter.call(lbOverlay.querySelectorAll('button'), (b) => b.style.display !== 'none');
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
    else if(e.key === 'ArrowLeft') lbShow(lbIndex - 1);
    else if(e.key === 'ArrowRight') lbShow(lbIndex + 1);
  });
}
// LIGHTBOX_END
