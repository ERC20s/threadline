/* scripts/cart.js — a minimal client-side cart for Threadline.
 *
 * Stores a small cart in localStorage under key 'threadline.cart'. Exposes
 * Threadline.Cart with a simple API used by the site:
 *
 *  Threadline.Cart.add(id, qty=1, size="")
 *  Threadline.Cart.remove(id, size)
 *  Threadline.Cart.setQty(id, size, qty)
 *  Threadline.Cart.count() -> total item count
 *  Threadline.Cart.open()
 *  Threadline.Cart.checkout()
 *
 * It renders a floating cart button with a badge, and a modal listing items,
 * per-item controls and a Checkout button. Checkout attempts to hand off to
 * the existing payments-widget: when the cart has exactly one item it finds
 * the widget's Buy anchor for that product, stamps data-quantity and data-size
 * and clicks it. For multiple items it opens the group's storefront so the
 * shopper can use the existing checkout flow (platforms here only support one
 * row per checkout). The cart is intentionally small and defensive.
 */
(function (global) {
  'use strict';
  var STORAGE_KEY = 'threadline.cart';
  var STORE_URL = 'https://d8a.com/g/d8aaaa-batch_threadline';
  var ns = global.Threadline || (global.Threadline = {});

  var read = function () {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed;
    } catch (e) { return []; }
  };
  var write = function (data) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data || [])); } catch (e) {}
    renderButton();
  };

  var keyFor = function (id, size) {
    return String(id || '') + '::' + String(size || '');
  };

  var findIndex = function (cart, id, size) {
    var key = keyFor(id, size);
    for (var i = 0; i < cart.length; i++) {
      if (keyFor(cart[i].id, cart[i].size) === key) return i;
    }
    return -1;
  };

  var add = function (id, qty, size) {
    if (!id) return;
    qty = Math.max(1, Math.floor(Number(qty) || 1));
    size = size || '';
    var cart = read();
    var idx = findIndex(cart, id, size);
    if (idx === -1) {
      cart.push({ id: id, size: size, qty: qty });
    } else {
      cart[idx].qty = Math.max(1, cart[idx].qty + qty);
    }
    write(cart);
    open();
  };

  var remove = function (id, size) {
    var cart = read();
    var idx = findIndex(cart, id, size || '');
    if (idx === -1) return;
    cart.splice(idx, 1);
    write(cart);
  };

  var setQty = function (id, size, qty) {
    qty = Math.max(1, Math.floor(Number(qty) || 1));
    var cart = read();
    var idx = findIndex(cart, id, size || '');
    if (idx === -1) return;
    cart[idx].qty = qty;
    write(cart);
  };

  var count = function () {
    var cart = read();
    var n = 0;
    cart.forEach(function (i) { n += Number(i.qty) || 0; });
    return n;
  };

  /* UI pieces */
  var buttonEl = null;
  var modalEl = null;
  var overlayEl = null;

  var ensureElements = function () {
    if (buttonEl && modalEl && overlayEl) return;

    // Floating button
    buttonEl = document.createElement('button');
    buttonEl.type = 'button';
    buttonEl.className = 'cart-button';
    buttonEl.setAttribute('aria-label', 'Open cart');
    buttonEl.style.position = 'fixed';
    buttonEl.style.right = '16px';
    buttonEl.style.bottom = '16px';
    buttonEl.style.zIndex = '9999';
    buttonEl.style.padding = '10px 14px';
    buttonEl.style.borderRadius = '999px';
    buttonEl.style.border = '1px solid #222';
    buttonEl.style.background = '#fff';
    buttonEl.style.cursor = 'pointer';
    buttonEl.style.boxShadow = '0 4px 10px rgba(0,0,0,0.08)';

    var icon = document.createElement('span');
    icon.textContent = 'Cart';
    icon.style.marginRight = '8px';
    buttonEl.appendChild(icon);

    var badge = document.createElement('span');
    badge.className = 'cart-badge';
    badge.style.background = '#222';
    badge.style.color = '#fff';
    badge.style.borderRadius = '999px';
    badge.style.padding = '2px 8px';
    badge.style.fontSize = '0.9em';
    badge.textContent = '0';
    buttonEl.appendChild(badge);

    buttonEl.addEventListener('click', function () { open(); });
    document.body.appendChild(buttonEl);

    // Overlay + modal
    overlayEl = document.createElement('div');
    overlayEl.className = 'cart-overlay';
    overlayEl.style.position = 'fixed';
    overlayEl.style.left = '0';
    overlayEl.style.top = '0';
    overlayEl.style.right = '0';
    overlayEl.style.bottom = '0';
    overlayEl.style.background = 'rgba(0,0,0,0.4)';
    overlayEl.style.zIndex = '9998';
    overlayEl.style.display = 'none';
    overlayEl.addEventListener('click', function (e) { if (e.target === overlayEl) close(); });
    document.body.appendChild(overlayEl);

    modalEl = document.createElement('div');
    modalEl.className = 'cart-modal';
    modalEl.style.position = 'fixed';
    modalEl.style.right = '16px';
    modalEl.style.bottom = '80px';
    modalEl.style.width = '360px';
    modalEl.style.maxHeight = '70vh';
    modalEl.style.overflow = 'auto';
    modalEl.style.background = '#fff';
    modalEl.style.border = '1px solid #ddd';
    modalEl.style.borderRadius = '8px';
    modalEl.style.padding = '12px';
    modalEl.style.zIndex = '9999';
    modalEl.style.boxShadow = '0 8px 30px rgba(0,0,0,0.12)';

    overlayEl.appendChild(modalEl);
  };

  var close = function () {
    if (!overlayEl) return;
    overlayEl.style.display = 'none';
  };

  var open = function () {
    ensureElements();
    renderModal();
    overlayEl.style.display = 'block';
  };

  var renderButton = function () {
    ensureElements();
    var n = count();
    try {
      var badge = buttonEl.querySelector('.cart-badge');
      if (badge) badge.textContent = String(n);
    } catch (e) {}
  };

  var renderModal = function () {
    if (!modalEl) return;
    var cart = read();
    modalEl.innerHTML = '';

    var h = document.createElement('h3');
    h.textContent = 'Your cart';
    modalEl.appendChild(h);

    if (!cart.length) {
      var p = document.createElement('p');
      p.textContent = 'Your cart is empty.';
      modalEl.appendChild(p);

      var lnk = document.createElement('a');
      lnk.href = 'products.html';
      lnk.textContent = 'Browse the collection';
      modalEl.appendChild(lnk);
      return;
    }

    var list = document.createElement('div');
    list.style.margin = '8px 0 12px 0';
    cart.forEach(function (item) {
      var prod = ns.byId ? ns.byId(item.id) : null;
      var row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.marginBottom = '8px';

      var left = document.createElement('div');
      left.style.flex = '1 1 auto';

      var title = document.createElement('div');
      title.textContent = prod ? prod.name : item.id;
      title.style.fontWeight = '600';
      left.appendChild(title);

      if (item.size) {
        var size = document.createElement('div');
        size.textContent = 'Size: ' + item.size;
        size.style.fontSize = '0.9em';
        size.style.color = '#444';
        left.appendChild(size);
      }

      var price = document.createElement('div');
      var unit = (prod && ns.money) ? ns.money(prod.price) : (prod ? String(prod.price) : '');
      var total = (prod ? (prod.price * (item.qty || 1)) : 0);
      price.textContent = unit + (prod ? ' × ' + item.qty + ' = ' + (ns.money ? ns.money(total) : ('$' + total)) : '');
      price.style.fontSize = '0.9em';
      price.style.color = '#333';
      left.appendChild(price);

      row.appendChild(left);

      var controls = document.createElement('div');
      controls.style.display = 'flex';
      controls.style.gap = '6px';
      controls.style.alignItems = 'center';

      var minus = document.createElement('button');
      minus.type = 'button';
      minus.textContent = '-';
      minus.style.width = '28px';
      minus.addEventListener('click', function () {
        var newQty = Math.max(1, (item.qty || 1) - 1);
        setQty(item.id, item.size, newQty);
        renderModal();
      });
      controls.appendChild(minus);

      var qty = document.createElement('span');
      qty.textContent = String(item.qty || 1);
      qty.style.minWidth = '18px';
      qty.style.textAlign = 'center';
      controls.appendChild(qty);

      var plus = document.createElement('button');
      plus.type = 'button';
      plus.textContent = '+';
      plus.style.width = '28px';
      plus.addEventListener('click', function () {
        var newQty = (item.qty || 1) + 1;
        setQty(item.id, item.size, newQty);
        renderModal();
      });
      controls.appendChild(plus);

      var rem = document.createElement('button');
      rem.type = 'button';
      rem.textContent = 'Remove';
      rem.addEventListener('click', function () {
        remove(item.id, item.size);
        renderModal();
      });
      controls.appendChild(rem);

      row.appendChild(controls);

      list.appendChild(row);
    });

    modalEl.appendChild(list);

    var totalPrice = 0;
    cart.forEach(function (item) {
      var prod = ns.byId ? ns.byId(item.id) : null;
      if (prod && prod.price) totalPrice += prod.price * (item.qty || 1);
    });

    var totalRow = document.createElement('div');
    totalRow.style.display = 'flex';
    totalRow.style.justifyContent = 'space-between';
    totalRow.style.alignItems = 'center';
    totalRow.style.marginTop = '10px';

    var ttl = document.createElement('div');
    ttl.textContent = 'Total';
    ttl.style.fontWeight = '700';
    totalRow.appendChild(ttl);

    var ttlVal = document.createElement('div');
    ttlVal.textContent = ns.money ? ns.money(totalPrice) : ('$' + String(totalPrice));
    ttlVal.style.fontWeight = '700';
    totalRow.appendChild(ttlVal);

    modalEl.appendChild(totalRow);

    var actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.justifyContent = 'space-between';
    actions.style.marginTop = '12px';

    var clear = document.createElement('button');
    clear.type = 'button';
    clear.textContent = 'Clear cart';
    clear.addEventListener('click', function () {
      write([]);
      renderModal();
    });
    actions.appendChild(clear);

    var checkoutBtn = document.createElement('button');
    checkoutBtn.type = 'button';
    checkoutBtn.textContent = 'Checkout';
    checkoutBtn.style.background = '#111';
    checkoutBtn.style.color = '#fff';
    checkoutBtn.style.padding = '8px 12px';
    checkoutBtn.addEventListener('click', function () { checkout(); });
    actions.appendChild(checkoutBtn);

    modalEl.appendChild(actions);
  };

  var setQty = function (id, size, qty) {
    setQtyInner(id, size, qty);
    renderButton();
  };
  var setQtyInner = function (id, size, qty) {
    var cart = read();
    var idx = findIndex(cart, id, size || '');
    if (idx === -1) return;
    cart[idx].qty = Math.max(1, Math.floor(Number(qty) || 1));
    write(cart);
  };

  var checkout = function () {
    var cart = read();
    if (!cart.length) return;
    // If single item, try to find the payments-widget Buy anchor and click it.
    if (cart.length === 1) {
      var item = cart[0];
      var panel = document.getElementById('group-store');
      var clicked = false;
      try {
        if (ns.findBuyAnchor && panel) {
          var matchFn = function (a) {
            var attr = a.getAttribute ? a.getAttribute('data-item') : '';
            if (!attr) return false;
            return String(attr || '') === String(item.id) || (ns.byId && ns.byId(item.id) && (String(ns.byId(item.id).name || '').toLowerCase() === String((a.parentNode && a.parentNode.querySelector && a.parentNode.querySelector('b') && a.parentNode.querySelector('b').textContent || '').toLowerCase())));
          };
          var anchor = ns.findBuyAnchor(panel, matchFn);
          if (anchor) {
            try {
              if (item.qty && item.qty > 1) anchor.setAttribute('data-quantity', String(item.qty));
              else anchor.removeAttribute('data-quantity');
              if (item.size) anchor.setAttribute('data-size', item.size); else anchor.removeAttribute('data-size');
              var note = (item.size ? (ns.byId && ns.byId(item.id) ? ns.byId(item.id).name + ' - size ' + item.size : '') : '');
              if (item.qty && item.qty > 1) note = (note || (ns.byId && ns.byId(item.id) ? ns.byId(item.id).name : '')) + ' ×' + item.qty;
              if (note) anchor.setAttribute('data-d8a-note', note); else anchor.removeAttribute('data-d8a-note');
            } catch (e) {}
            anchor.click();
            clicked = true;
            return;
          }
        }
      } catch (e) {}
      // No anchor to click: open the group storefront for the shopper to proceed.
      if (!clicked) {
        window.open(STORE_URL, '_blank');
        return;
      }
    }
    // Multiple items: open the group's storefront so the shopper can complete
    // the order using the existing flow. This is the simplest graceful handoff.
    if (cart.length > 1) {
      window.open(STORE_URL, '_blank');
    }
  };

  // When the platform verifies a returning payment, remove that item from the
  // cart if it matches by id or name. payments-widget.js fires group-store:paid
  // with the order detail; listen and clear.
  document.addEventListener('group-store:paid', function (e) {
    var order = e && e.detail ? e.detail : null;
    if (!order) return;
    var itemId = order.itemId || order.item || order.item_id || '';
    var itemName = (order.itemName || order.name || '');
    var cart = read();
    var changed = false;
    for (var i = cart.length - 1; i >= 0; i--) {
      if (String(cart[i].id) === String(itemId) || (itemName && ns.byId && ns.byId(cart[i].id) && String(ns.byId(cart[i].id).name) === String(itemName))) {
        cart.splice(i, 1);
        changed = true;
      }
    }
    if (changed) write(cart);
  });

  // Expose the API
  ns.Cart = ns.Cart || {};
  ns.Cart.add = add;
  ns.Cart.remove = remove;
  ns.Cart.setQty = setQty;
  ns.Cart.count = count;
  ns.Cart.open = open;
  ns.Cart.checkout = checkout;

  // Ensure UI exists on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { renderButton(); });
  } else {
    renderButton();
  }

})(window);