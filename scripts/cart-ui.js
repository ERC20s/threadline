(function () {
  if (typeof window === 'undefined') return;

  // Ensure a single shared object is used across reloads
  window.ThreadlineCartUI = window.ThreadlineCartUI || {};
  var UI = window.ThreadlineCartUI;

  // Internal state
  UI._initialized = UI._initialized || false;
  UI._roots = UI._roots || {}; // map of rootElement -> {badge, drawer}

  function safeQuery(idOrSelector) {
    if (!idOrSelector) return null;
    if (typeof idOrSelector === 'string') {
      // id shorthand
      var byId = document.getElementById(idOrSelector);
      if (byId) return byId;
      try { return document.querySelector(idOrSelector); } catch (e) { return null; }
    }
    // assume element
    return idOrSelector.nodeType ? idOrSelector : null;
  }

  function formatMoney(cents) {
    if (!Number.isFinite(cents)) return "";
    try {
      var n = cents / 100;
      if (typeof Intl === 'object' && Intl && typeof Intl.NumberFormat === 'function') {
        var nf = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
        var s = nf.format(n);
        if (Math.round(n * 100) % 100 === 0) s = s.replace(/\.00$/, '');
        return s;
      }
    } catch (e) {}
    var s = '$' + (n % 1 === 0 ? String(n) : n.toFixed(2));
    return s;
  }

  function ensureNodes(root) {
    var key = root === document ? 'document' : (root.id || (root.tagName + ':' + Math.random()));
    if (UI._roots[key]) return UI._roots[key];

    // Avoid creating duplicates if other code already added a badge/drawer
    var existingBadge = root.querySelector('.cart-demo-badge');
    var existingDrawer = root.querySelector('.cart-demo-drawer');

    // Create badge
    var badge = existingBadge || document.createElement('button');
    badge.className = 'cart-demo-badge';
    badge.setAttribute('aria-label', 'Open cart drawer');
    badge.type = 'button';
    badge.innerHTML = '<span class="cart-demo-count" aria-hidden="true">0</span>';

    // Create drawer
    var drawer = existingDrawer || document.createElement('div');
    drawer.className = 'cart-demo-drawer';
    drawer.setAttribute('aria-hidden', 'true');
    drawer.innerHTML = '<div class="cart-demo-drawer-inner"><h3>Your demo cart</h3><div class="cart-demo-items"></div><div class="cart-demo-actions"><button type="button" class="cart-demo-close">Close</button><button type="button" class="cart-demo-clear">Clear</button></div></div>';

    // If badge not present in DOM, append it to root in a defensive place
    if (!existingBadge) {
      // Put it at the top-right of the root if root is the document body or a container
      if (root === document || root === document.body) {
        document.body.appendChild(badge);
      } else {
        root.appendChild(badge);
      }
    }

    if (!existingDrawer) {
      // Append drawer next to the root
      if (root === document || root === document.body) {
        document.body.appendChild(drawer);
      } else {
        root.appendChild(drawer);
      }
    }

    // Wire interactions only once per nodeset
    if (!UI._roots[key]) {
      badge.addEventListener('click', function () {
        UI.open();
      });

      drawer.querySelector('.cart-demo-close').addEventListener('click', function () { UI.close(); });
      drawer.querySelector('.cart-demo-clear').addEventListener('click', function () {
        if (window.ThreadlineCart && typeof window.ThreadlineCart.clear === 'function') {
          window.ThreadlineCart.clear();
        } else {
          // fallback: clear storage and fire update
          try { localStorage.removeItem(window.ThreadlineCart && window.ThreadlineCart._STORAGE_KEY ? window.ThreadlineCart._STORAGE_KEY : 'threadline_cart'); } catch (e) {}
          document.dispatchEvent(new CustomEvent('threadline:cart-updated', { detail: { items: [], totalItems: 0, totalQuantity: 0, totalPriceCents: 0 } }));
        }
      });

      UI._roots[key] = { badge: badge, drawer: drawer };
    }

    return UI._roots[key];
  }

  function renderCartInto(idOrSelector) {
    var root = safeQuery(idOrSelector) || document.body;
    var nodes = ensureNodes(root);
    // seed a current view
    updateView(nodes);
  }

  function updateView(nodes) {
    if (!nodes) return;
    var countEl = nodes.badge.querySelector('.cart-demo-count');
    var itemsEl = nodes.drawer.querySelector('.cart-demo-items');
    // read cart
    var summary = (window.ThreadlineCart && typeof window.ThreadlineCart.read === 'function') ? window.ThreadlineCart.read() : { items: [], totalQuantity: 0, totalPriceCents: 0, totalItems: 0 };
    try {
      if (countEl) countEl.textContent = String(summary.totalQuantity || 0);
      // populate items
      if (itemsEl) {
        itemsEl.innerHTML = '';
        if (!summary.items || !summary.items.length) {
          itemsEl.innerHTML = '<p class="cart-demo-empty">Your cart is empty.</p>';
        } else {
          summary.items.forEach(function (it) {
            var row = document.createElement('div');
            row.className = 'cart-demo-item';
            var name = document.createElement('div'); name.className = 'cart-demo-item-name'; name.textContent = it.name || it.id || '';
            var meta = document.createElement('div'); meta.className = 'cart-demo-item-meta'; meta.textContent = (it.quantity || 0) + ' × ' + formatMoney(it.price_cents || 0);
            var rem = document.createElement('button'); rem.type = 'button'; rem.className = 'cart-demo-remove'; rem.textContent = 'Remove';
            rem.addEventListener('click', function () {
              if (window.ThreadlineCart && typeof window.ThreadlineCart.remove === 'function') {
                window.ThreadlineCart.remove(it.id);
              }
            });
            row.appendChild(name); row.appendChild(meta); row.appendChild(rem);
            itemsEl.appendChild(row);
          });
        }
        // total
        var tot = document.createElement('div'); tot.className = 'cart-demo-total'; tot.textContent = 'Total: ' + formatMoney((summary.totalPriceCents || 0));
        itemsEl.appendChild(tot);
      }
    } catch (e) { /* never crash UI */ }
  }

  function openDrawer() {
    Object.keys(UI._roots).forEach(function (k) {
      var n = UI._roots[k];
      if (!n) return;
      n.drawer.setAttribute('aria-hidden', 'false');
      n.drawer.classList.add('open');
    });
  }

  function closeDrawer() {
    Object.keys(UI._roots).forEach(function (k) {
      var n = UI._roots[k];
      if (!n) return;
      n.drawer.setAttribute('aria-hidden', 'true');
      n.drawer.classList.remove('open');
    });
  }

  // Wire cart update listener only once
  if (!UI._listeningForCart) {
    try {
      document.addEventListener('threadline:cart-updated', function (ev) {
        // Update all known roots
        Object.keys(UI._roots).forEach(function (k) { updateView(UI._roots[k]); });
      }, false);
    } catch (e) { /* ignore */ }
    UI._listeningForCart = true;
  }

  // Public API
  UI.renderInto = UI.renderInto || function (idOrSelector) {
    // idempotent: repeated calls with same root are no-ops beyond first render
    try { renderCartInto(idOrSelector); } catch (e) { /* swallow */ }
  };
  UI.open = UI.open || function () { try { openDrawer(); } catch (e) {} };
  UI.close = UI.close || function () { try { closeDrawer(); } catch (e) {} };
  UI.addForDemo = UI.addForDemo || function (item) {
    // item: { id, name, price, quantity }
    try {
      if (window.ThreadlineCart && typeof window.ThreadlineCart.add === 'function') {
        return window.ThreadlineCart.add(item);
      }
      // fallback: dispatch the add event the cart module listens for
      var ev = new CustomEvent('threadline:add-to-cart', { detail: item, bubbles: true });
      document.dispatchEvent(ev);
      return { ok: true };
    } catch (e) { return { ok: false, error: 'unexpected' }; }
  };

  // Mark initialized so re-loading the script won't duplicate listeners/nodes
  UI._initialized = true;

  // keep global reference tidy
  window.ThreadlineCartUI = UI;
})();
