
  (function(){
    var banner = document.getElementById('environs-banner');
    if (!banner) return;
    var m = banner.style.backgroundImage.match(/url\(['"]?(.*?)['"]?\)/);
    if (!m) return;
    var test = new Image();
    test.onerror = function(){ banner.classList.add('img-fallback'); };
    test.src = m[1];
  })();
  
  (function(){
    var ENV_DATA = {"thermes": {"title": "Thermes de Luchon", "dist": "~1 km", "photo": "thermes-de-luchon-bagneres-de-luchon.jpg", "credit": "", "paragraphs": ["Les Thermes de Luchon exploitent depuis l'époque romaine des sources sulfureuses parmi les plus riches d'Europe. Le site propose des cures thermales conventionnées de 18 jours (rhumatologie, voies respiratoires, ORL, programmes enfants), ainsi que des formules courtes : Cure Liberté de 3 ou 5 jours, matinées découverte, soins à la carte.", "L'espace bien-être « Ressources & Vous », ouvert toute l'année, propose trois bassins d'eau thermale dont un sur le toit, un espace fitness, un sauna, des douches sensorielles et le Vaporarium — un réseau de galeries souterraines naturellement chauffées par la vapeur thermale, unique en Europe."], "practical": ["Accès : centre de Bagnères-de-Luchon, à ~1 km du chalet à pied.", "Saison thermale 2026 : section standard du 2 mars au 14 novembre, section premium du 13 avril au 24 octobre. Soins du lundi au samedi, 7h-12h.", "Ressources & Vous : ouvert toute l'année. Spa &amp; massages tous les jours sauf lundi, 13h-19h, sur réservation."], "map": "Thermes de Luchon, Bagnères-de-Luchon", "link": ["https://www.thermes-luchon.fr/", "Site officiel des Thermes de Luchon"]}, "superbagneres": {"title": "Luchon-Superbagnères", "dist": "≈25 min · 18 km", "photo": "luchon-superbagneres-bagneres-de-luchon.jpg", "credit": "", "paragraphs": ["Perché à 1 800 m, Luchon-Superbagnères est l'une des premières stations pyrénéennes : un funiculaire à crémaillère, mis en service en 1912, y menait avant de cesser définitivement en 1966 après l'ouverture de la route. Aujourd'hui, l'accès se fait par la D46 (18 km depuis Luchon) ou en télécabine, qui relie le fond de vallée au sommet en 8 minutes.", "La station compte 28 pistes (3 vertes, 12 bleues, 7 rouges, 6 noires) sur 32 km répartis en trois secteurs, un itinéraire raquettes/ski de fond de 4 km, un snowpark et un site de décollage parapente. La table d'orientation du sommet offre un panorama à 360° sur le pic d'Aneto (3 404 m) et l'ensemble de la chaîne."], "practical": ["Accès : ~18 km depuis le chalet par la D46 (environ 25 min en voiture), ou télécabine (8 min de trajet) depuis le fond de vallée.", "Altitude : de 1 465 m à 2 125 m, station principale à 1 800 m.", "Activités hiver : ski alpin, ski de fond/raquettes, snowpark. Été : randonnée, VTT, parapente, table d'orientation."], "map": "Luchon-Superbagnères", "link": null}, "peyragudes": {"title": "Peyragudes", "dist": "≈20 min · 17,7 km", "photo": "peyragudes-bagneres-de-luchon.jpg", "credit": "", "paragraphs": ["Deuxième domaine skiable accessible depuis le chalet (17,7 km, environ 20 minutes de route via le col de Peyresourde), Peyragudes culmine entre 1 600 et 2 400 m d'altitude pour 42 km de pistes (21 km faciles, 18 km intermédiaires, 3 km difficiles).", "La station doit une partie de sa notoriété à son altiport, où une scène du James Bond « Demain ne meurt jamais » (1997) a été tournée — la piste d'atterrissage est depuis surnommée « Altiport 007 » par les habitués."], "practical": ["Accès : ~17,7 km depuis le chalet (environ 20 min en voiture) via le col de Peyresourde.", "Altitude : 1 600 m – 2 400 m, 42 km de pistes tous niveaux.", "L'altiport est aussi ouvert en été (ULM, planeur, vol à voile)."], "map": "Peyragudes", "link": null}, "lac_oo": {"title": "Lac d'Oô", "dist": "≈25 min · 15 km", "photo": "lac-d-oo-bagneres-de-luchon.jpg", "credit": "", "paragraphs": ["Le lac d'Oô est l'une des randonnées les plus courues des Pyrénées : 6,6 km aller-retour et environ 300 m de dénivelé depuis le parking des Granges d'Astau, pour 2h30 à 3h de marche. Le sentier, large et ombragé, longe le torrent avant de déboucher sur un lac glaciaire à 1 507 m, dominé par une cascade d'environ 275 m qui s'y jette directement.", "Le parking des Granges d'Astau (gratuit, non gardé, ~150 places) est souvent complet dès 10h en été. Une navette estivale (Lipy Line 1, juillet-août, 4 allers-retours par jour, 2€) permet de rejoindre le départ sans voiture."], "practical": ["Accès : ~15 km depuis le chalet par la D618 puis la D76 (environ 25 min en voiture).", "Parking Granges d'Astau : gratuit, non gardé — arriver tôt en haute saison.", "Randonnée : 6,6 km A/R, 2h30-3h, praticable en famille (bonnes chaussures conseillées).", "Navette estivale Lipy Line 1 : juillet-août, 4 A/R par jour, 2€ (gratuit -13 ans)."], "map": "42.8048,0.5005", "link": ["https://lacdoo.fr/acces", "Infos d'accès détaillées (lacdoo.fr)"]}, "vallee_lys": {"title": "Vallée du Lys & Hospice de France", "dist": "≈15 min · 10 km", "photo": "vallee-du-lys-etamp-hospice-de-france-bagnere.jpg", "credit": "", "paragraphs": ["À 10 km du chalet par la D46 — la seule route carrossable vers Superbagnères — la vallée du Lys s'ouvre sur des alpages et des cascades puis, plus haut, sur l'Hospice de France (1 385 m), point de départ historique vers le GR10 et le port de Venasque, à la frontière espagnole.", "La cascade d'Enfer, chute de 70 m, se rejoint en quelques minutes à pied depuis le parking. Plusieurs niveaux de balade sont possibles : promenade familiale au Pré de l'Artigue, marche d'une heure jusqu'au Gouffre d'Enfer, ou circuit plus engagé vers les lacs d'altitude et le Pic du Maupas (3 109 m)."], "practical": ["Accès : ~10 km depuis le chalet par la D46 (environ 15 min en voiture).", "Cascade d'Enfer : à quelques mètres du parking, accessible à tous.", "Hospice de France : départ du GR10 vers le port de Venasque (Espagne).", "Attention en hiver : couloirs d'avalanche au-dessus de certains secteurs."], "map": "Hospice de France, Bagnères-de-Luchon", "link": null}, "sports": {"title": "Sports outdoor", "dist": "à la carte", "photo": "https://images.unsplash.com/photo-1629651747669-b243d6868e3a?w=900&q=75&fm=jpg&fit=crop&auto=format", "credit": "Photo : Bagnères-de-Luchon, Tim Oun / Unsplash", "paragraphs": ["La vallée de Luchon rassemble une offre sportive large : cols mythiques du Tour de France (Peyresourde, Portillon, Menté) prisés des cyclistes et VTTistes, falaises d'escalade et parcours de via ferrata, et sites de vol libre — le décollage de Superbagnères offre un panorama exceptionnel pour le parapente, biplace compris.", "S'y ajoutent balades à cheval, cani-rando, accrobranche et, selon la saison, canyoning dans la vallée du Lys. La plupart de ces activités passent par des prestataires locaux (moniteurs, clubs, bases de loisirs) que recense l'office de tourisme."], "practical": ["VTT/cyclisme : cols de Peyresourde, Portillon, Menté ; pistes de descente à Superbagnères.", "Parapente : décollage principal à Superbagnères, vols biplace disponibles.", "Escalade, via ferrata, canyoning, accrobranche, équitation : via des prestataires locaux.", "Renseignements et réservations : Office de Tourisme Pyrénées 31."], "map": "Office de Tourisme Pyrénées 31, Bagnères-de-Luchon", "link": ["https://www.pyrenees31.com/destinations/luchon/que-faire", "Activités recensées par l'Office de Tourisme"]}, "patrimoine": {"title": "Patrimoine Belle Époque", "dist": "centre-ville", "photo": "https://images.unsplash.com/photo-1711987802537-1b4aa57f9eac?w=900&q=75&fm=jpg&fit=crop&auto=format", "credit": "Photo : Bagnères-de-Luchon, Iñigo Telleria Perez / Unsplash", "paragraphs": ["Les Allées d'Étigny, ouvertes en 1762 par le baron du même nom pour relier le village aux « Baigneries » (les thermes), forment une promenade plantée de 600 m de long sur 30 m de large, bordée d'un ensemble architectural éclectique : le château Lassus Nestier (1772, aujourd'hui office de tourisme), l'hôtel de ville, plusieurs immeubles néoclassiques, et les chalets Spont, trois villas de style alpin suisse construites entre 1848 et 1855.", "Au bout de l'allée, le Casino de Luchon (construit en 1878-1880, agrandi en 1929) est inscrit monument historique depuis le 10 mai 1999 : façade en brique et pierre de style historiciste, grand escalier, verrière à vitraux, salon dit « tunisien » et jardin avec grotte artificielle. Il reste aujourd'hui propriété de la commune."], "practical": ["Accès : cœur de Bagnères-de-Luchon, à pied depuis le chalet.", "Casino : inscrit monument historique (10 mai 1999) — façade et jardins visibles librement, accès aux salles selon les horaires d'ouverture.", "Marchés de producteurs : mercredi et samedi matin sur les Allées."], "map": "Casino de Luchon, Allées d’Étigny, Bagnères-de-Luchon", "link": null}};
    var backdrop = document.getElementById('env-modal-backdrop');
    var lastTrigger = null;

    function openModal(key){
      var d = ENV_DATA[key];
      if (!d) return;
      lastTrigger = document.activeElement;

      var photoWrap = document.getElementById('env-modal-photo');
      photoWrap.classList.remove('img-fallback');
      var img = document.getElementById('env-modal-img');
      img.src = d.photo;
      img.alt = d.title + ' — Bagnères-de-Luchon';

      document.getElementById('env-modal-dist').textContent = d.dist;
      document.getElementById('env-modal-title').textContent = d.title;

      var textHtml = d.paragraphs.map(function(p){ return '<p>' + p + '</p>'; }).join('');
      document.getElementById('env-modal-text').innerHTML = textHtml;

      var practicalHtml = d.practical.map(function(p){ return '<li>' + p + '</li>'; }).join('');
      document.getElementById('env-modal-practical').innerHTML = practicalHtml;

      var q = encodeURIComponent(d.map);
      // RGPD (audit 12/10/2026, constat 7) : la carte Google Maps ne charge
      // (et ne dépose son cookie tiers) qu'au clic sur « Afficher la carte »,
      // jamais automatiquement à l'ouverture de la fenêtre. On mémorise juste
      // l'URL à charger et on réaffiche le bouton à chaque nouvelle ouverture.
      var mapWrap = document.getElementById('env-modal-map-wrap');
      var mapFrame = document.getElementById('env-modal-map');
      var mapBtn = document.getElementById('env-modal-map-load');
      var mapNote = document.getElementById('env-modal-map-note');
      mapFrame.src = '';
      mapFrame.style.display = 'none';
      mapFrame.dataset.pendingSrc = 'https://maps.google.com/maps?q=' + q + '&z=15&output=embed&hl=fr';
      if (mapBtn) { mapBtn.style.display = ''; }
      if (mapNote) { mapNote.style.display = ''; }

      var linksHtml = '<a href="https://www.google.com/maps/search/?api=1&query=' + q + '" target="_blank" rel="noopener">Ouvrir dans Google Maps &rarr;</a>';
      if (d.link) {
        linksHtml += '<a href="' + d.link[0] + '" target="_blank" rel="noopener">' + d.link[1] + ' &rarr;</a>';
      }
      document.getElementById('env-modal-links').innerHTML = linksHtml;
      var creditEl = document.getElementById('env-modal-credit');
      creditEl.textContent = d.credit;
      creditEl.style.display = d.credit ? '' : 'none';

      backdrop.classList.add('is-open');
      document.body.style.overflow = 'hidden';
      document.getElementById('env-modal-close').focus();
    }

    document.getElementById('env-modal-map-load') && document.getElementById('env-modal-map-load').addEventListener('click', function(){
      var mapFrame = document.getElementById('env-modal-map');
      var btn = document.getElementById('env-modal-map-load');
      var note = document.getElementById('env-modal-map-note');
      if (!mapFrame.dataset.pendingSrc) return;
      mapFrame.src = mapFrame.dataset.pendingSrc;
      mapFrame.style.display = '';
      if (btn) btn.style.display = 'none';
      if (note) note.style.display = 'none';
    });

    function closeModal(){
      backdrop.classList.remove('is-open');
      document.body.style.overflow = '';
      document.getElementById('env-modal-map').src = '';
      if (lastTrigger && typeof lastTrigger.focus === 'function') lastTrigger.focus();
    }

    document.querySelectorAll('.env-photo-card').forEach(function(card){
      card.addEventListener('click', function(){ openModal(card.dataset.env); });
      card.addEventListener('keydown', function(e){
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(card.dataset.env); }
      });
    });
    document.getElementById('env-modal-close').addEventListener('click', closeModal);
    backdrop.addEventListener('click', function(e){ if (e.target === backdrop) closeModal(); });
    document.addEventListener('keydown', function(e){
      if (e.key === 'Escape' && backdrop.classList.contains('is-open')) closeModal();
    });
  })();
  