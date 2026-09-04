(function () {
  if (typeof document === 'undefined') return;

  // Small, dependency-free cart UI that talks to window.ThreadlineCart.
  // Degrades gracefully when ThreadlineCart is absent: nothing is shown.

  var CART_BUTTON_ID = 'threadline-cart-button';
  var CART_PANEL_ID = 'threadline-cart-panel';

  function centsToMoney(cents) {
    if (!Number.isFinite(cents)) return '$0.00';
    return '$' + (Math.abs(cents) / 100).toFixed(2);
  }

  function createButton() {
    var btn = document.createElement('button');
    btn.id = CART_BUTTON_ID;
    btn.type = 'button';
    btn.className = 'cart-btn';
    btn.setAttribute('aria-label', 'Open cart');
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.setAttribute('aria-expanded', 'false');

    var icon = document.createElement('span');
    icon.className = 'cart-icon';
    icon.textContent = '\uD83D\uDED2'; // shopping trolley emoji
    btn.appendChild(icon);

    var badge = document.createElement('span');
    badge.className = 'cart-badge';
    badge.setAttribute('aria-hidden', 'true');
    badge.textContent = '0';
    btn.appendChild(badge);

    return btn;
  }

  function createPanel() {
    var panel = document.createElement('div');
    panel.id = CART_PANEL_ID;
    panel.className = 'cart-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'false');
    panel.setAttribute('aria-hidden', 'true');

    // header
    var header = document.createElement('div');
    header.className = 'cart-panel-header';
    var h = document.createElement('h2');
    h.textContent = 'Your cart';
    header.appendChild(h);
    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'cart-close';
    close.setAttribute('aria-label', 'Close cart');
    close.textContent = '✕';
    header.appendChild(close);
    panel.appendChild(header);

    // list
    var list = document.createElement('div');
    list.className = 'cart-list';
    panel.appendChild(list);

    // footer: total + actions
    var footer = document.createElement('div');
    footer.className = 'cart-panel-footer';
    var total = document.createElement('div');
    total.className = 'cart-total';
    total.textContent = 'Total: $0.00';
    footer.appendChild(total);

    var actions = document.createElement('div');
    actions.className = 'cart-actions';
    var clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'btn btn-ghost cart-clear';
    clearBtn.textContent = 'Clear';
    actions.appendChild(clearBtn);

    var checkoutBtn = document.createElement('button');
    checkoutBtn.type = 'button';
    checkoutBtn.className = 'btn cart-checkout';
    checkoutBtn.textContent = 'Checkout';
    actions.appendChild(checkoutBtn);

    footer.appendChild(actions);
    panel.appendChild(footer);

    return panel;
  }

  function findHeader() {
    return document.querySelector('.header');
  }

  function renderList(panel, summary) {
    var list = panel.querySelector('.cart-list');
    var total = panel.querySelector('.cart-total');
    list.innerHTML = '';

    if (!summary || !Array.isArray(summary.items) || summary.items.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'cart-empty';
      empty.textContent = 'Your cart is empty.';
      list.appendChild(empty);
      total.textContent = 'Total: $0.00';
      return;
    }

    summary.items.forEach(function (it) {
      var row = document.createElement('div');
      row.className = 'cart-item';
      row.dataset.itemId = it.id;

      var name = document.createElement('div');
      name.className = 'cart-item-name';
      name.textContent = it.name || it.id;
      row.appendChild(name);

      var meta = document.createElement('div');
      meta.className = 'cart-item-meta';
      meta.textContent = centsToMoney(it.price_cents || 0);
      row.appendChild(meta);

      var controls = document.createElement('div');
      controls.className = 'cart-item-controls';

      var minus = document.createElement('button');
      minus.type = 'button';
      minus.className = 'cart-qty cart-qty-decr';
      minus.setAttribute('aria-label', 'Decrease quantity');
      minus.textContent = '−';
      controls.appendChild(minus);

      var qty = document.createElement('span');
      qty.className = 'cart-qty-value';
      qty.textContent = String(it.quantity || 1);
      controls.appendChild(qty);

      var plus = document.createElement('button');
      plus.type = 'button';
      plus.className = 'cart-qty cart-qty-incr';
      plus.setAttribute('aria-label', 'Increase quantity');
      plus.textContent = '+';
      controls.appendChild(plus);

      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'cart-remove btn-ghost';
      remove.textContent = 'Remove';
      controls.appendChild(remove);

      row.appendChild(controls);
      list.appendChild(row);
    });

    total.textContent = 'Total: ' + centsToMoney(summary.totalPriceCents || 0);
  }

  function openPanel(panel, button) {
    panel.style.display = 'block';
    panel.setAttribute('aria-hidden', 'false');
    if (button) button.setAttribute('aria-expanded', 'true');
    // focus first focusable in panel
    var focusable = panel.querySelector('button, [href], input, select, textarea');
    if (focusable && typeof focusable.focus === 'function') focusable.focus();
    document.addEventListener('keydown', escClose);
    setTimeout(function () {
      document.addEventListener('click', outsideClick);
    }, 0);
  }

  function closePanel(panel, button) {
    panel.style.display = 'none';
    panel.setAttribute('aria-hidden', 'true');
    if (button) button.setAttribute('aria-expanded', 'false');
    document.removeEventListener('keydown', escClose);
    document.removeEventListener('click', outsideClick);
    if (button && typeof button.focus === 'function') button.focus();
  }

  function escClose(ev) {
    if (ev.key === 'Escape' || ev.key === 'Esc') {
      var panel = document.getElementById(CART_PANEL_ID);
      var btn = document.getElementById(CART_BUTTON_ID);
      if (panel && panel.style.display !== 'none') closePanel(panel, btn);
    }
  }

  function outsideClick(ev) {
    var panel = document.getElementById(CART_PANEL_ID);
    var btn = document.getElementById(CART_BUTTON_ID);
    if (!panel) return;
    if (panel.contains(ev.target) || (btn && btn.contains(ev.target))) return;
    closePanel(panel, btn);
  }

  function init() {
    var header = findHeader();
    if (!header) return; // no place to put the button

    var cartButton = createButton();
    var panel = createPanel();
    panel.style.display = 'none';

    // wire interactions
    cartButton.addEventListener('click', function () {
      var isOpen = cartButton.getAttribute('aria-expanded') === 'true';
      if (isOpen) closePanel(panel, cartButton); else openPanel(panel, cartButton);
    });

    panel.querySelector('.cart-close').addEventListener('click', function () { closePanel(panel, cartButton); });

    panel.querySelector('.cart-clear').addEventListener('click', function () {
      try {
        if (window.ThreadlineCart && typeof window.ThreadlineCart.clear === 'function') {
          window.ThreadlineCart.clear();
        }
      } catch (e) {}
    });

    panel.querySelector('.cart-checkout').addEventListener('click', function () {
      try {
        var summary = window.ThreadlineCart && typeof window.ThreadlineCart.read === 'function' ? window.ThreadlineCart.read() : null;
        var ev = new CustomEvent('threadline:cart-checkout', { detail: summary, bubbles: true });
        document.dispatchEvent(ev);
      } catch (e) {}
    });

    // delegate quantity and remove controls
    panel.addEventListener('click', function (ev) {
      var t = ev.target;
      var itemRow = t && t.closest ? t.closest('.cart-item') : null;
      if (!itemRow) return;
      var id = itemRow.dataset.itemId;
      if (!id) return;
      if (t.classList.contains('cart-qty-decr')) {
        // decrement
        var qtyEl = itemRow.querySelector('.cart-qty-value');
        var cur = parseInt(qtyEl.textContent, 10) || 1;
        var next = Math.max(0, cur - 1);
        try {
          if (window.ThreadlineCart && typeof window.ThreadlineCart.setQuantity === 'function') {
            window.ThreadlineCart.setQuantity(id, next);
          }
        } catch (e) {}
        return;
      }
      if (t.classList.contains('cart-qty-incr')) {
        var qtyEl2 = itemRow.querySelector('.cart-qty-value');
        var cur2 = parseInt(qtyEl2.textContent, 10) || 1;
        var next2 = cur2 + 1;
        try {
          if (window.ThreadlineCart && typeof window.ThreadlineCart.setQuantity === 'function') {
            window.ThreadlineCart.setQuantity(id, next2);
          }
        } catch (e) {}
        return;
      }
      if (t.classList.contains('cart-remove')) {
        try {
          if (window.ThreadlineCart && typeof window.ThreadlineCart.remove === 'function') {
            window.ThreadlineCart.remove(id);
          }
        } catch (e) {}
      }
    });

    // update on cart events
    function updateFromSummary(summary) {
      var badge = cartButton.querySelector('.cart-badge');
      if (!badge) return;
      var qty = (summary && typeof summary.totalQuantity === 'number') ? summary.totalQuantity : 0;
      badge.textContent = String(qty);
      if (qty > 0) badge.classList.add('has-items'); else badge.classList.remove('has-items');
      renderList(panel, summary);
    }

    document.addEventListener('threadline:cart-updated', function (ev) {
      try { updateFromSummary(ev && ev.detail ? ev.detail : null); } catch (e) {}
    }, false);

    // If ThreadlineCart is present, seed initial state. Otherwise hide UI.
    if (window.ThreadlineCart && typeof window.ThreadlineCart.read === 'function') {
      header.appendChild(cartButton);
      document.body.appendChild(panel);
      try { updateFromSummary(window.ThreadlineCart.read()); } catch (e) {}
    } else {
      // do not add anything if cart module missing
      return;
    }
  }

  // small helpers used in event handlers
  function outsideClick() {}
  function escClose() {}

  // Delay init until DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 0);
  }
})();
