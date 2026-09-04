(function () {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (!window.ThreadlineCart) return; // degrade silently when cart module absent

  var Cart = window.ThreadlineCart;

  // Avoid creating globals or touching existing helpers.
  var cls = {
    btn: 'cart-btn',
    badge: 'cart-badge',
    panel: 'cart-panel',
    overlay: 'cart-panel-overlay',
    items: 'cart-items',
    item: 'cart-item',
    qty: 'cart-qty',
    control: 'cart-control',
    empty: 'cart-empty',
    footer: 'cart-footer',
    clear: 'cart-clear',
    checkout: 'cart-checkout'
  };

  function qs(sel, ctx) { return (ctx || document).querySelector(sel); }

  // Build button in header
  function ensureButton() {
    var header = qs('.header');
    if (!header) return null;
    var existing = qs('.' + cls.btn, header);
    if (existing) return existing;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = cls.btn;
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', 'Open cart');

    var icon = document.createElement('span');
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '\u{1F6D2}'; // shopping cart glyph
    btn.appendChild(icon);

    var badge = document.createElement('span');
    badge.className = cls.badge;
    badge.setAttribute('aria-hidden', 'true');
    badge.textContent = '0';
    btn.appendChild(badge);

    header.appendChild(btn);
    return btn;
  }

  // Build panel overlay
  function buildPanel() {
    var existing = qs('.' + cls.panel);
    if (existing) return existing;

    var overlay = document.createElement('div');
    overlay.className = cls.overlay;

    var panel = document.createElement('aside');
    panel.className = cls.panel;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-hidden', 'true');
    panel.tabIndex = -1;

    var header = document.createElement('div');
    header.className = 'cart-panel-header';
    var h = document.createElement('h2');
    h.textContent = 'Your cart';
    header.appendChild(h);

    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'cart-panel-close';
    close.setAttribute('aria-label', 'Close cart');
    close.textContent = '✕';
    header.appendChild(close);

    panel.appendChild(header);

    var list = document.createElement('div');
    list.className = cls.items;
    panel.appendChild(list);

    var empty = document.createElement('div');
    empty.className = cls.empty;
    empty.textContent = 'Your cart is empty.';
    panel.appendChild(empty);

    var footer = document.createElement('div');
    footer.className = cls.footer;

    var clear = document.createElement('button');
    clear.type = 'button';
    clear.className = cls.clear;
    clear.textContent = 'Clear';

    var checkout = document.createElement('button');
    checkout.type = 'button';
    checkout.className = cls.checkout;
    checkout.textContent = 'Checkout';

    footer.appendChild(clear);
    footer.appendChild(checkout);
    panel.appendChild(footer);

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    // interactions
    close.addEventListener('click', function () { closePanel(); });
    overlay.addEventListener('click', function (ev) {
      if (ev.target === overlay) closePanel();
    });

    clear.addEventListener('click', function () { Cart.clear(); });

    checkout.addEventListener('click', function () {
      try {
        var summary = Cart.read();
        var ev = new CustomEvent('threadline:cart-checkout', { detail: summary, bubbles: true });
        document.dispatchEvent(ev);
      } catch (e) { /* swallow */ }
    });

    return overlay;
  }

  function openPanel() {
    var overlay = qs('.' + cls.overlay);
    var panel = qs('.' + cls.panel);
    if (!overlay || !panel) return;
    overlay.style.display = 'block';
    panel.setAttribute('aria-hidden', 'false');
    var btn = qs('.' + cls.btn);
    if (btn) btn.setAttribute('aria-expanded', 'true');
    // focus management
    var close = qs('.cart-panel-close', panel) || panel;
    try { close.focus(); } catch (e) {}
    // key handler
    document.addEventListener('keydown', onKeyDown);
  }

  function closePanel() {
    var overlay = qs('.' + cls.overlay);
    var panel = qs('.' + cls.panel);
    if (!overlay || !panel) return;
    overlay.style.display = 'none';
    panel.setAttribute('aria-hidden', 'true');
    var btn = qs('.' + cls.btn);
    if (btn) btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('keydown', onKeyDown);
  }

  function onKeyDown(ev) {
    if (ev.key === 'Escape' || ev.key === 'Esc') {
      closePanel();
    }
  }

  function renderCart() {
    var badge = qs('.' + cls.badge);
    var overlay = qs('.' + cls.overlay);
    var list = qs('.' + cls.items, overlay);
    var empty = qs('.' + cls.empty, overlay);
    var checkout = qs('.' + cls.checkout, overlay);
    if (!list) return;
    var summary = Cart.read();

    // badge
    if (badge) {
      badge.textContent = String(summary.totalQuantity || 0);
      badge.style.display = (summary.totalQuantity > 0) ? 'inline-block' : 'none';
    }

    // items
    list.innerHTML = '';
    if (!summary.items || !summary.items.length) {
      empty.style.display = 'block';
      checkout.disabled = true;
      checkout.setAttribute('aria-disabled', 'true');
      return;
    }
    empty.style.display = 'none';
    checkout.disabled = false;
    checkout.removeAttribute('aria-disabled');

    summary.items.forEach(function (it) {
      var row = document.createElement('div');
      row.className = cls.item;
      row.tabIndex = -1;

      var title = document.createElement('div');
      title.className = 'cart-item-title';
      title.textContent = it.name || it.id;
      row.appendChild(title);

      var price = document.createElement('div');
      price.className = 'cart-item-price';
      price.textContent = it.price_cents ? ('$' + (it.price_cents / 100).toFixed(2)) : '';
      row.appendChild(price);

      var controls = document.createElement('div');
      controls.className = cls.control;

      var minus = document.createElement('button');
      minus.type = 'button';
      minus.className = 'cart-decrease';
      minus.setAttribute('aria-label', 'Decrease quantity');
      minus.textContent = '−';
      controls.appendChild(minus);

      var qty = document.createElement('span');
      qty.className = cls.qty;
      qty.textContent = String(it.quantity || 1);
      controls.appendChild(qty);

      var plus = document.createElement('button');
      plus.type = 'button';
      plus.className = 'cart-increase';
      plus.setAttribute('aria-label', 'Increase quantity');
      plus.textContent = '+';
      controls.appendChild(plus);

      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'cart-remove';
      remove.setAttribute('aria-label', 'Remove item');
      remove.textContent = 'Remove';
      controls.appendChild(remove);

      row.appendChild(controls);
      list.appendChild(row);

      minus.addEventListener('click', function () {
        var n = Math.max(0, (parseInt(it.quantity, 10) || 1) - 1);
        Cart.setQuantity(it.id, n);
      });
      plus.addEventListener('click', function () {
        var n = (parseInt(it.quantity, 10) || 1) + 1;
        Cart.setQuantity(it.id, n);
      });
      remove.addEventListener('click', function () { Cart.remove(it.id); });
    });
  }

  // wire UI
  document.addEventListener('DOMContentLoaded', function () {
    var btn = ensureButton();
    var overlay = buildPanel();
    if (!btn || !overlay) return;

    // initial render
    renderCart();

    btn.addEventListener('click', function () {
      var expanded = btn.getAttribute('aria-expanded') === 'true';
      if (expanded) closePanel(); else openPanel();
    });

    // keep in sync with cart changes from other scripts
    document.addEventListener('threadline:cart-updated', function () { renderCart(); });
  });

})();
