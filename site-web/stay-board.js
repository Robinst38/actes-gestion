/* Organisation du séjour — tableau partagé (participants, chambres, courses,
   frais). Utilisé par l'espace adhérent (sejour.js) et par la page publique
   groupe.html (lien secret partagé par le titulaire de la réservation).
   window.StayBoard.mount(container, { load, op, header }) */
(function () {
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function eur(n) {
    return (Math.round(n * 100) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  }
  function fmtDate(iso) {
    var p = String(iso || '').split('-');
    if (p.length !== 3) return iso || '';
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
  }

  // Soldes : ce que chacun a payé moins ce qu'il doit (parts égales par dépense).
  function balances(board) {
    var bal = {};
    board.people.forEach(function (p) { bal[p] = 0; });
    board.expenses.forEach(function (e) {
      var share = e.amount / e.shares.length;
      if (bal[e.payer] == null) bal[e.payer] = 0;
      bal[e.payer] += e.amount;
      e.shares.forEach(function (s) { if (bal[s] == null) bal[s] = 0; bal[s] -= share; });
    });
    return bal;
  }
  // Remboursements minimaux (algorithme glouton : le plus gros débiteur paie le plus gros créancier).
  function settlements(bal) {
    var debt = [], cred = [];
    Object.keys(bal).forEach(function (p) {
      var v = Math.round(bal[p] * 100) / 100;
      if (v < -0.009) debt.push({ p: p, v: -v });
      else if (v > 0.009) cred.push({ p: p, v: v });
    });
    debt.sort(function (a, b) { return b.v - a.v; });
    cred.sort(function (a, b) { return b.v - a.v; });
    var out = [], i = 0, j = 0;
    while (i < debt.length && j < cred.length) {
      var x = Math.min(debt[i].v, cred[j].v);
      out.push({ from: debt[i].p, to: cred[j].p, amount: Math.round(x * 100) / 100 });
      debt[i].v -= x; cred[j].v -= x;
      if (debt[i].v < 0.01) i++;
      if (cred[j].v < 0.01) j++;
    }
    return out;
  }

  function mount(root, api) {
    var state = { board: null, reservation: null, busy: false };

    function say(msg, isErr) {
      var el = root.querySelector('.sb-msg');
      if (!el) return;
      el.textContent = msg || '';
      el.className = 'sb-msg' + (isErr ? ' is-error' : '');
      if (msg) { clearTimeout(say._t); say._t = setTimeout(function () { el.textContent = ''; }, 4000); }
    }

    function send(body) {
      if (state.busy) return Promise.resolve();
      state.busy = true;
      return api.op(body).then(function (res) {
        state.board = res.board;
        render();
      }).catch(function (e) {
        say(e.message || 'Erreur', true);
      }).then(function () { state.busy = false; });
    }

    function peopleOptions(selected) {
      return state.board.people.map(function (p) {
        return '<option value="' + esc(p) + '"' + (p === selected ? ' selected' : '') + '>' + esc(p) + '</option>';
      }).join('');
    }

    function render() {
      var b = state.board, r = state.reservation;
      var assigned = {};
      b.rooms.forEach(function (room, i) { room.people.forEach(function (p) { assigned[p] = i; }); });
      var bal = balances(b);
      var settle = settlements(bal);
      var total = b.expenses.reduce(function (s, e) { return s + e.amount; }, 0);
      var todo = b.shopping.filter(function (s) { return !s.done; }).length;

      var html = '';
      html += '<div class="sb-head">' + (api.header ? api.header(r) : '') +
        '<div class="sb-stats">' +
        '<div><strong>' + b.people.length + '</strong><span>participant' + (b.people.length > 1 ? 's' : '') + '</span></div>' +
        '<div><strong>' + Object.keys(assigned).length + ' / ' + b.people.length + '</strong><span>placés en chambre</span></div>' +
        '<div><strong>' + todo + '</strong><span>course' + (todo > 1 ? 's' : '') + ' à faire</span></div>' +
        '<div><strong>' + eur(total) + '</strong><span>de frais partagés</span></div>' +
        '</div></div>';
      html += '<p class="sb-msg" role="status"></p>';

      // Participants
      html += '<div class="sb-card"><h3>1. Les participants</h3>' +
        '<p class="sb-help">Ajoutez le prénom de chaque personne du groupe. Ils servent ensuite pour les chambres et les frais.</p>' +
        '<form class="sb-inline" data-form="person"><input name="name" maxlength="40" placeholder="Prénom" required>' +
        '<button class="btn-sm primary" type="submit">Ajouter</button></form>' +
        '<div class="sb-chips">' + (b.people.length ? b.people.map(function (p) {
          return '<span class="sb-chip">' + esc(p) + '<button type="button" aria-label="Retirer ' + esc(p) + '" data-act="person_remove" data-name="' + esc(p) + '">×</button></span>';
        }).join('') : '<span class="sb-empty">Personne pour l’instant.</span>') + '</div></div>';

      // Chambres
      html += '<div class="sb-card"><h3>2. Qui dort où ?</h3>' +
        '<p class="sb-help">Choisissez une chambre pour chaque personne (24 personnes au maximum dans le chalet).</p>' +
        '<div class="sb-rooms">' + b.rooms.map(function (room, i) {
          var full = room.people.length >= room.places;
          return '<div class="sb-room' + (room.people.length > room.places ? ' is-over' : '') + '"><div class="sb-room-head"><strong>' + esc(room.name) + '</strong>' +
            '<span class="sb-room-count' + (full ? ' is-full' : '') + '">' + room.people.length + ' / ' + room.places + '</span></div>' +
            '<div class="sb-room-people">' + (room.people.length ? room.people.map(esc).join(', ') : '<span class="sb-empty">libre</span>') + '</div></div>';
        }).join('') + '</div>' +
        (b.people.length ? '<div class="sb-assign">' + b.people.map(function (p) {
          return '<label class="sb-assign-row"><span>' + esc(p) + '</span><select data-assign="' + esc(p) + '">' +
            '<option value="-1">— pas encore placé —</option>' +
            b.rooms.map(function (room, i) { return '<option value="' + i + '"' + (assigned[p] === i ? ' selected' : '') + '>' + esc(room.name) + '</option>'; }).join('') +
            '</select></label>';
        }).join('') + '</div>' : '') + '</div>';

      // Courses
      html += '<div class="sb-card"><h3>3. La liste de courses</h3>' +
        '<form class="sb-inline" data-form="shop"><input name="label" maxlength="80" placeholder="Article (ex. pâtes)" required>' +
        '<input name="qty" maxlength="20" placeholder="Quantité" class="sb-small">' +
        '<input name="who" maxlength="40" placeholder="Qui s’en charge ?" class="sb-small">' +
        '<button class="btn-sm primary" type="submit">Ajouter</button></form>' +
        (b.shopping.length ? '<ul class="sb-shop">' + b.shopping.map(function (s) {
          return '<li class="' + (s.done ? 'is-done' : '') + '"><label><input type="checkbox" data-act="shop_toggle" data-id="' + esc(s.id) + '"' + (s.done ? ' checked' : '') + '> ' +
            '<span>' + esc(s.label) + (s.qty ? ' <em>× ' + esc(s.qty) + '</em>' : '') + (s.who ? ' <small>(' + esc(s.who) + ')</small>' : '') + '</span></label>' +
            '<button type="button" class="sb-x" aria-label="Supprimer" data-act="shop_remove" data-id="' + esc(s.id) + '">×</button></li>';
        }).join('') + '</ul>' +
          (b.shopping.length > todo ? '<button type="button" class="btn-sm" data-act="shop_clear_done">Retirer les articles achetés</button>' : '')
          : '<p class="sb-empty">La liste est vide.</p>') + '</div>';

      // Frais
      html += '<div class="sb-card"><h3>4. Les frais partagés</h3>';
      if (b.people.length < 2) {
        html += '<p class="sb-empty">Ajoutez au moins deux participants pour partager des frais.</p>';
      } else {
        html += '<form class="sb-expense" data-form="expense">' +
          '<div class="sb-inline"><input name="label" maxlength="80" placeholder="Libellé (ex. courses Lidl)" required>' +
          '<input name="amount" type="number" step="0.01" min="0.01" placeholder="Montant €" class="sb-small" required>' +
          '<label class="sb-payer">payé par <select name="payer">' + peopleOptions(b.people[0]) + '</select></label></div>' +
          '<div class="sb-shares"><span>Pour :</span>' + b.people.map(function (p) {
            return '<label><input type="checkbox" name="shares" value="' + esc(p) + '" checked> ' + esc(p) + '</label>';
          }).join('') + '</div>' +
          '<button class="btn-sm primary" type="submit">Ajouter la dépense</button></form>';
        if (b.expenses.length) {
          html += '<table class="data-table sb-table"><thead><tr><th>Dépense</th><th>Payé par</th><th>Pour</th><th>Montant</th><th></th></tr></thead><tbody>' +
            b.expenses.slice().reverse().map(function (e) {
              return '<tr><td>' + esc(e.label) + '</td><td>' + esc(e.payer) + '</td><td>' +
                (e.shares.length === b.people.length ? 'tout le monde' : e.shares.map(esc).join(', ')) +
                '</td><td>' + eur(e.amount) + '</td><td><button type="button" class="sb-x" aria-label="Supprimer" data-act="expense_remove" data-id="' + esc(e.id) + '">×</button></td></tr>';
            }).join('') + '</tbody></table>';
          html += '<div class="sb-balance"><h4>Qui doit combien ?</h4>' +
            (settle.length ? '<ul>' + settle.map(function (s) {
              return '<li><strong>' + esc(s.from) + '</strong> rembourse <strong>' + eur(s.amount) + '</strong> à <strong>' + esc(s.to) + '</strong></li>';
            }).join('') + '</ul>' : '<p>Tout le monde est à l’équilibre.</p>') + '</div>';
        }
      }
      html += '</div>';
      root.innerHTML = html;
    }

    root.addEventListener('submit', function (ev) {
      var f = ev.target.closest('form[data-form]');
      if (!f) return;
      ev.preventDefault();
      var kind = f.dataset.form;
      if (kind === 'person') send({ op: 'person_add', name: f.name.value });
      if (kind === 'shop') send({ op: 'shop_add', label: f.label.value, qty: f.qty.value, who: f.who.value });
      if (kind === 'expense') {
        var shares = Array.prototype.slice.call(f.querySelectorAll('input[name="shares"]:checked')).map(function (i) { return i.value; });
        send({ op: 'expense_add', label: f.label.value, amount: Number(String(f.amount.value).replace(',', '.')), payer: f.payer.value, shares: shares });
      }
    });
    root.addEventListener('click', function (ev) {
      var b = ev.target.closest('button[data-act]');
      if (!b) return;
      if (b.dataset.act === 'person_remove') send({ op: 'person_remove', name: b.dataset.name });
      else send({ op: b.dataset.act, id: b.dataset.id });
    });
    root.addEventListener('change', function (ev) {
      var t = ev.target;
      if (t.matches('input[type="checkbox"][data-act="shop_toggle"]')) send({ op: 'shop_toggle', id: t.dataset.id });
      if (t.matches('select[data-assign]')) send({ op: 'room_assign', name: t.dataset.assign, room: Number(t.value) });
    });

    function reload() {
      root.innerHTML = '<p class="empty-state">Chargement…</p>';
      return api.load().then(function (res) {
        state.board = res.board;
        state.reservation = res.reservation;
        render();
        return res;
      }).catch(function (e) {
        root.innerHTML = '<p class="empty-state">' + esc(e.message || 'Erreur de chargement.') + '</p>';
      });
    }
    return { reload: reload };
  }

  window.StayBoard = { mount: mount, fmtDate: fmtDate, esc: esc, balances: balances, settlements: settlements };
})();
