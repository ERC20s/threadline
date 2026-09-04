(function () {
  if (typeof window === 'undefined') return;
  if (window.ThreadlineCartUI) return; // don't double-install

  // Helpers
  function q(sel, root) { return (root || document).querySelector(sel); }
  function create(name, attrs) {
    var el = document.createElement(name);
    if (attrs) Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    return el;
  }
  function formatMoney(cents) {
    try { return '$' + (Number(cents) / 100).toFixed(2); } catch (e) { return '$0.00'; }
  }

  var TOGGLE_ID = 'cart-toggle';
  var DRAWER_ID = 'cart-drawer';
  var STORAGE_KEY = (window.ThreadlineCart && ThreadlineCart._STORAGE_KEY) ? ThreadlineCart._STORAGE_KEY : 'threadline_cart';

  // Build drawer DOM
  function makeDrawer() {
    var drawer = create('aside', { id: DRAWER_ID, 'aria-hidden': 'true' });
    drawer.className = 'cart-drawer';

    var header = create('div'); header.className = 'cart-drawer-head';
    var h = create('h3'); h.textContent = 'Your cart'; header.appendChild(h);
    var close = create('button', { type: 'button', 'aria-label': 'Close cart' }); close.className = 'btn btn-ghost cart-close'; close.textContent = 'Close';
    header.appendChild(close);
    drawer.appendChild(header);

    var list = create('div'); list.className = 'cart-items'; drawer.appendChild(list);

    var summary = create('div'); summary.className = 'cart-summary';
    var total = create('div'); total.className = 'cart-total'; summary.appendChild(total);
    var actions = create('div'); actions.className = 'cart-actions';
    var clear = create('button', { type: 'button' }); clear.className = 'btn cart-clear'; clear.textContent = 'Clear';
    var checkout = create('button', { type: 'button' }); checkout.className = 'btn cart-checkout'; checkout.textContent = 'Checkout';
    actions.appendChild(clear); actions.appendChild(checkout);
    summary.appendChild(actions);
    drawer.appendChild(summary);

    // events
    close.addEventListener('click', function () { closeDrawer(); });
    clear.addEventListener('click', function () {
      if (window.ThreadlineCart && typeof ThreadlineCart.clear === 'function') {
        ThreadlineCart.clear();
      } else {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ items: [] })); } catch (e) {}
        dispatchLocalUpdate();
      }
    });
    checkout.addEventListener('click', function () {
      // Focus the payments panel if present, else go to products.html
      var panel = q('#group-store');
      if (panel && panel.scrollIntoView) {
        panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        try { panel.focus && panel.focus(); } catch (e) {}
      } else {
        location.href = 'products.html';
      }
    });

    return drawer;
  }

  function getCart() {
    try {
      if (window.ThreadlineCart && typeof ThreadlineCart.read === 'function') return ThreadlineCart.read();
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { items: [], totalItems: 0, totalQuantity: 0, totalPriceCents: 0 };
      var parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.items)) return { items: [], totalItems: 0, totalQuantity: 0, totalPriceCents: 0 };
      var totalQ = 0, totalP = 0;
      parsed.items.forEach(function (it) { totalQ += it.quantity || 0; totalP += (it.price_cents || 0) * (it.quantity || 0); });
      return { items: parsed.items, totalItems: parsed.items.length, totalQuantity: totalQ, totalPriceCents: totalP };
    } catch (e) { return { items: [], totalItems: 0, totalQuantity: 0, totalPriceCents: 0 }; }
  }

  function dispatchLocalUpdate() {
    try {
      var summary = getCart();
      var ev = new CustomEvent('threadline:cart-updated', { detail: summary, bubbles: true });
      document.dispatchEvent(ev);
    } catch (e) {}
  }

  function renderCart(summary) {
    var drawer = q('#' + DRAWER_ID);
    if (!drawer) return;
    var itemsBox = drawer.querySelector('.cart-items');
    var totalEl = drawer.querySelector('.cart-total');
    itemsBox.innerHTML = '';
    if (!summary || !summary.items || !summary.items.length) {
      itemsBox.textContent = 'Your cart is empty.';
      totalEl.textContent = '';
      drawer.querySelector('.cart-clear').disabled = true;
      drawer.querySelector('.cart-checkout').disabled = true;
      updateBadge(0);
      return;
    }
    summary.items.forEach(function (it) {
      var row = create('div'); row.className = 'cart-row';
      var left = create('div'); left.className = 'cart-row-left';
      var name = create('div'); name.className = 'cart-row-name'; name.textContent = it.name || it.id;
      var qty = create('div'); qty.className = 'cart-row-qty'; qty.textContent = '×' + (it.quantity || 1);
      left.appendChild(name); left.appendChild(qty);
      var right = create('div'); right.className = 'cart-row-right';
      var price = create('div'); price.className = 'cart-row-price'; price.textContent = formatMoney(it.price_cents || 0);
      var remove = create('button', { type: 'button' }); remove.className = 'btn btn-ghost cart-remove'; remove.textContent = 'Remove';
      remove.addEventListener('click', function () {
        if (window.ThreadlineCart && typeof ThreadlineCart.remove === 'function') {
          ThreadlineCart.remove(it.id);
        } else {
          // remove from localStorage
          try {
            var raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            var arr = Array.isArray(raw.items) ? raw.items : [];
            arr = arr.filter(function (x) { return String(x.id) !== String(it.id); });
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ items: arr }));
          } catch (e) {}
          dispatchLocalUpdate();
        }
      });
      right.appendChild(price); right.appendChild(remove);
      row.appendChild(left); row.appendChild(right);
      itemsBox.appendChild(row);
    });
    totalEl.textContent = 'Total: ' + formatMoney(summary.totalPriceCents || 0);
    drawer.querySelector('.cart-clear').disabled = false;
    drawer.querySelector('.cart-checkout').disabled = false;
    updateBadge(summary.totalQuantity || 0);
  }

  function updateBadge(n) {
    var btn = q('#' + TOGGLE_ID);
    if (!btn) return;
    var badge = btn.querySelector('.cart-badge');
    if (!badge) return;
    badge.textContent = n > 0 ? String(n) : '';
    if (n > 0) badge.classList.add('has-count'); else badge.classList.remove('has-count');
  }

  function openDrawer() {
    var drawer = q('#' + DRAWER_ID);
    if (!drawer) return;
    drawer.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('cart-open');
    var btn = q('#' + TOGGLE_ID);
    if (btn) btn.setAttribute('aria-expanded', 'true');
  }
  function closeDrawer() {
    var drawer = q('#' + DRAWER_ID);
    if (!drawer) return;
    drawer.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('cart-open');
    var btn = q('#' + TOGGLE_ID);
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  // Install toggle button into headers (only once)
  function ensureToggle() {
    var existing = q('#' + TOGGLE_ID);
    if (existing) return existing;
    // find a header nav to insert after
    var headers = document.querySelectorAll('header.header');
    for (var i = 0; i < headers.length; i++) {
      var h = headers[i];
      var nav = h.querySelector('nav');
      if (!nav) continue;
      var btn = create('button', { id: TOGGLE_ID, type: 'button', 'aria-expanded': 'false', 'aria-controls': DRAWER_ID });
      btn.className = 'cart-toggle';
      var inner = create('span'); inner.className = 'cart-toggle-inner'; inner.textContent = 'Cart';
      var badge = create('span'); badge.className = 'cart-badge'; badge.setAttribute('aria-hidden', 'true');
      inner.appendChild(badge);
      btn.appendChild(inner);
      // insert after nav
      if (nav.nextSibling) h.insertBefore(btn, nav.nextSibling); else h.appendChild(btn);
      btn.addEventListener('click', function () {
        var expanded = this.getAttribute('aria-expanded') === 'true';
        if (expanded) { closeDrawer(); } else { openDrawer(); }
      });
      return btn;
    }
    return null;
  }

  // wire up
  function setup() {
    var container = document.body;
    if (!container) return;
    var drawer = q('#' + DRAWER_ID);
    if (!drawer) {
      drawer = makeDrawer();
      // place at end of body
      document.body.appendChild(drawer);
    }
    ensureToggle();

    // initial render
    try { renderCart(getCart()); } catch (e) {}

    // listen for ThreadlineCart updates
    document.addEventListener('threadline:cart-updated', function (ev) {
      try { renderCart((ev && ev.detail) || getCart()); } catch (e) {}
    }, false);

    // keyboard: close on Escape when open
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && q('#' + DRAWER_ID) && q('#' + DRAWER_ID).getAttribute('aria-hidden') === 'false') {
        closeDrawer();
      }
    });

    // click outside drawer to close
    document.addEventListener('click', function (e) {
      var drawerEl = q('#' + DRAWER_ID);
      var toggle = q('#' + TOGGLE_ID);
      if (!drawerEl || drawerEl.getAttribute('aria-hidden') === 'true') return;
      if (e.target && (drawerEl.contains(e.target) || (toggle && toggle.contains(e.target)))) return;
      closeDrawer();
    });
  }

  // wait for DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }

  window.ThreadlineCartUI = {
    openDrawer: openDrawer,
    closeDrawer: closeDrawer
  };
})();
