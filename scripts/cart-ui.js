(function () {
  if (typeof window === 'undefined') return;
  if (!window.ThreadlineCart) return; // nothing to do without the cart module
  if (document.querySelector('.tl-cart-btn')) return; // already mounted

  // Create header button
  var header = document.querySelector('header.header') || document.querySelector('header') || document.body;
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'tl-cart-btn';
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-label', 'Open cart');

  var icon = document.createElement('span');
  icon.className = 'tl-cart-icon';
  icon.textContent = '\u{1F6D2}'; // cart glyph fallback
  btn.appendChild(icon);

  var badge = document.createElement('span');
  badge.className = 'tl-cart-badge';
  badge.setAttribute('aria-hidden', 'true');
  btn.appendChild(badge);

  // Create slide-over panel
  var panel = document.createElement('div');
  panel.className = 'tl-cart-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'false');
  panel.setAttribute('aria-hidden', 'true');
  panel.tabIndex = -1;

  panel.innerHTML = '<div class="tl-cart-panel-inner">' +
    '<header class="tl-cart-panel-head"><h2>Cart</h2><button type="button" class="tl-cart-close" aria-label="Close cart">\u2715</button></header>' +
    '<div class="tl-cart-list" role="region" aria-live="polite"></div>' +
    '<div class="tl-cart-foot"><div class="tl-cart-summary"></div><div class="tl-cart-actions"><button type="button" class="tl-cart-clear">Clear</button><button type="button" class="tl-cart-checkout">Checkout</button></div></div>' +
    '</div>';

  // Insert into DOM
  try { header.appendChild(btn); } catch (e) { document.body.appendChild(btn); }
  document.body.appendChild(panel);

  var listEl = panel.querySelector('.tl-cart-list');
  var summaryEl = panel.querySelector('.tl-cart-summary');
  var closeBtn = panel.querySelector('.tl-cart-close');
  var clearBtn = panel.querySelector('.tl-cart-clear');
  var checkoutBtn = panel.querySelector('.tl-cart-checkout');

  // Helpers
  function centsToMoney(cents) {
    try {
      var n = Number(cents) || 0;
      return '$' + (n / 100).toFixed(2);
    } catch (e) { return '$0.00'; }
  }

  function render() {
    var cart = window.ThreadlineCart.read();
    // update badge
    var qty = cart.totalQuantity || 0;
    badge.textContent = qty > 0 ? String(qty) : '';
    badge.style.display = qty > 0 ? 'inline-block' : 'none';

    // render list
    listEl.innerHTML = '';
    if (!cart.items || !cart.items.length) {
      listEl.innerHTML = '<p class="tl-cart-empty">Your cart is empty.</p>';
      summaryEl.textContent = '';
      checkoutBtn.disabled = true;
      return;
    }

    cart.items.forEach(function (it) {
      var row = document.createElement('div');
      row.className = 'tl-cart-item';
      row.dataset.id = it.id;

      var name = document.createElement('div');
      name.className = 'tl-cart-item-name';
      name.textContent = it.name || it.id;
      row.appendChild(name);

      var controls = document.createElement('div');
      controls.className = 'tl-cart-item-controls';

      var dec = document.createElement('button');
      dec.type = 'button';
      dec.className = 'tl-cart-dec';
      dec.setAttribute('aria-label', 'Decrease quantity');
      dec.textContent = '-';
      dec.addEventListener('click', function () {
        var newQty = Math.max(0, (it.quantity || 1) - 1);
        if (newQty <= 0) {
          window.ThreadlineCart.remove(it.id);
        } else {
          window.ThreadlineCart.setQuantity(it.id, newQty);
        }
      });
      controls.appendChild(dec);

      var qty = document.createElement('span');
      qty.className = 'tl-cart-qty';
      qty.textContent = String(it.quantity || 1);
      controls.appendChild(qty);

      var inc = document.createElement('button');
      inc.type = 'button';
      inc.className = 'tl-cart-inc';
      inc.setAttribute('aria-label', 'Increase quantity');
      inc.textContent = '+';
      inc.addEventListener('click', function () {
        var newQty = Math.max(1, (it.quantity || 1) + 1);
        window.ThreadlineCart.setQuantity(it.id, newQty);
      });
      controls.appendChild(inc);

      var price = document.createElement('div');
      price.className = 'tl-cart-item-price';
      price.textContent = centsToMoney((it.price_cents || 0) * (it.quantity || 1));

      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'tl-cart-remove';
      remove.setAttribute('aria-label', 'Remove item');
      remove.textContent = 'Remove';
      remove.addEventListener('click', function () { window.ThreadlineCart.remove(it.id); });

      row.appendChild(controls);
      row.appendChild(price);
      row.appendChild(remove);

      listEl.appendChild(row);
    });

    var total = centsToMoney(cart.totalPriceCents || 0);
    summaryEl.textContent = (cart.totalQuantity || 0) + ' items — ' + total;
    checkoutBtn.disabled = false;
  }

  // Toggle panel
  function openPanel() {
    panel.classList.add('tl-open');
    panel.setAttribute('aria-hidden', 'false');
    btn.setAttribute('aria-expanded', 'true');
    panel.focus();
    render();
  }
  function closePanel() {
    panel.classList.remove('tl-open');
    panel.setAttribute('aria-hidden', 'true');
    btn.setAttribute('aria-expanded', 'false');
  }

  btn.addEventListener('click', function (e) {
    e.preventDefault();
    if (panel.classList.contains('tl-open')) closePanel(); else openPanel();
  });

  closeBtn.addEventListener('click', function () { closePanel(); });

  clearBtn.addEventListener('click', function () {
    try { window.ThreadlineCart.clear(); } catch (e) {}
  });

  checkoutBtn.addEventListener('click', function () {
    var cart = window.ThreadlineCart.read();
    // Dispatch a neutral event so other scripts (any checkout wiring) can
    // handle it. The UI does not itself post to the payments platform.
    var ev = new CustomEvent('threadline:cart-checkout', { detail: cart, bubbles: true });
    document.dispatchEvent(ev);
  });

  // Close on outside click
  document.addEventListener('click', function (e) {
    if (!panel.classList.contains('tl-open')) return;
    if (e.target === btn || btn.contains(e.target)) return;
    if (panel.contains(e.target)) return;
    closePanel();
  }, false);

  // Keyboard: Esc closes
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && panel.classList.contains('tl-open')) closePanel();
  });

  // Update render on cart change events
  document.addEventListener('threadline:cart-updated', function () { render(); });

  // Initial render to set badge
  try { render(); } catch (e) {}

})();
