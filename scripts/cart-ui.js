(function () {
  if (typeof window === 'undefined') return;

  function fmtPrice(cents) {
    var n = Number(cents || 0) / 100;
    return '$' + n.toFixed(2);
  }

  function createDrawer() {
    var d = document.createElement('div');
    d.id = 'cart-drawer';
    d.className = 'cart-drawer';
    d.setAttribute('role', 'dialog');
    d.setAttribute('aria-hidden', 'true');
    d.innerHTML = '<div class="cart-drawer-head"><strong>Your cart</strong><button type="button" aria-label="Close cart" class="cart-close">×</button></div>' +
      '<div class="cart-drawer-body"><p class="cart-empty">Your cart is empty.</p><ul class="cart-items" aria-live="polite"></ul></div>' +
      '<div class="cart-drawer-foot"><div class="cart-total"></div><div class="cart-actions"><button type="button" class="btn btn-ghost cart-clear">Clear cart</button><button type="button" class="btn cart-checkout">Checkout</button></div></div>';
    document.body.appendChild(d);
    return d;
  }

  function ensureToggleInHeader() {
    var header = document.querySelector('.header');
    if (!header) return null;
    var existing = document.getElementById('cart-toggle');
    if (existing) return existing;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'cart-toggle';
    btn.className = 'btn cart-toggle';
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', 'cart-drawer');
    btn.setAttribute('aria-label', 'Open cart');
    btn.textContent = 'Cart (0)';
    // place after nav if present
    var nav = header.querySelector('.nav');
    if (nav && nav.parentNode) {
      nav.parentNode.insertBefore(btn, nav.nextSibling);
    } else {
      header.appendChild(btn);
    }
    return btn;
  }

  function renderItems(drawer, summary) {
    var list = drawer.querySelector('.cart-items');
    var empty = drawer.querySelector('.cart-empty');
    var totalEl = drawer.querySelector('.cart-total');
    list.innerHTML = '';
    if (!summary || !summary.items || !summary.items.length) {
      empty.style.display = '';
      totalEl.textContent = '';
      return;
    }
    empty.style.display = 'none';
    summary.items.forEach(function (it) {
      var li = document.createElement('li');
      li.className = 'cart-item';
      li.innerHTML = '<div class="cart-item-main"><div class="cart-item-name">' + (it.name || it.id) + '</div>' +
        '<div class="cart-item-meta">Qty: ' + (it.quantity || 1) + ' <span class="cart-item-price">' + fmtPrice(it.price_cents || 0) + '</span></div></div>' +
        '<div class="cart-item-remove"><button type="button" class="cart-item-remove-btn">Remove</button></div>';
      var removeBtn = li.querySelector('.cart-item-remove-btn');
      removeBtn.addEventListener('click', function () {
        try {
          if (window.ThreadlineCart && window.ThreadlineCart.remove) {
            window.ThreadlineCart.remove(it.id);
          }
        } catch (e) {}
      });
      list.appendChild(li);
    });
    totalEl.textContent = 'Total: ' + fmtPrice(summary.totalPriceCents || 0);
  }

  function updateToggleCount(btn, summary) {
    try {
      var n = summary && typeof summary.totalQuantity === 'number' ? summary.totalQuantity : (summary && summary.totalItems ? summary.totalItems : 0);
      btn.textContent = 'Cart (' + n + ')';
    } catch (e) {}
  }

  function openDrawer(drawer, btn) {
    drawer.setAttribute('aria-hidden', 'false');
    drawer.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
    // focus first action
    var c = drawer.querySelector('.cart-checkout');
    if (c) c.focus();
  }
  function closeDrawer(drawer, btn) {
    drawer.setAttribute('aria-hidden', 'true');
    drawer.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
    try { btn.focus(); } catch (e) {}
  }

  document.addEventListener('DOMContentLoaded', function () {
    var btn = ensureToggleInHeader();
    var drawer = createDrawer();

    // wire close button
    var close = drawer.querySelector('.cart-close');
    close.addEventListener('click', function () { closeDrawer(drawer, btn); });

    // clear button
    var clear = drawer.querySelector('.cart-clear');
    clear.addEventListener('click', function () {
      try { window.ThreadlineCart && window.ThreadlineCart.clear && window.ThreadlineCart.clear(); } catch (e) {}
    });

    // checkout button
    var checkout = drawer.querySelector('.cart-checkout');
    checkout.addEventListener('click', function () {
      var panel = document.getElementById('group-store');
      if (panel && panel.scrollIntoView) {
        panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        try { panel.focus && panel.focus(); } catch (e) {}
      } else {
        // fallback: go to products.html which has the shop panel
        location.href = 'products.html';
      }
    });

    // header toggle
    if (btn) {
      btn.addEventListener('click', function () {
        if (drawer.classList.contains('open')) closeDrawer(drawer, btn); else openDrawer(drawer, btn);
      });
    }

    // render helper
    var render = function () {
      var Tcart = window.ThreadlineCart;
      if (!Tcart || !Tcart.read) {
        // no cart available: disable
        if (btn) { btn.disabled = true; btn.setAttribute('aria-disabled', 'true'); }
        var body = drawer.querySelector('.cart-drawer-body');
        body.innerHTML = '<p class="cart-missing">A client-side cart is not available in this browser.</p>';
        return;
      }
      try {
        var summary = Tcart.read();
        renderItems(drawer, summary);
        updateToggleCount(btn, summary);
      } catch (e) {
        // ignore
      }
    };

    // listen for updates
    document.addEventListener('threadline:cart-updated', function (ev) {
      render();
    }, false);

    // initial render
    render();
  });
})();
