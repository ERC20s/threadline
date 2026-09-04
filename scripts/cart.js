(function (window, document) {
  'use strict';
  var STORAGE_KEY = 'threadline_cart';
  var CAP_DISTINCT = 5;
  var MAX_PER_ITEM = 5;

  var safe = function (fn) { try { return fn(); } catch (e) { console.error('cart error', e); } };

  var read = function () {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { items: [] };
      return JSON.parse(raw) || { items: [] };
    } catch (e) {
      return { items: [] };
    }
  };

  var write = function (state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {}
  };

  var findItem = function (items, id) {
    for (var i = 0; i < items.length; i++) if (items[i].id === id) return i;
    return -1;
  };

  var state = read();

  var emit = function (name, detail) {
    try {
      document.dispatchEvent(new CustomEvent(name, { detail: detail, bubbles: true }));
    } catch (e) {}
  };

  /* ---- UI ------------------------------------------------------------ */
  var ui = {};

  ui.create = function () {
    if (document.getElementById('threadline-cart-button')) return;

    var btn = document.createElement('button');
    btn.id = 'threadline-cart-button';
    btn.type = 'button';
    btn.className = 'cart-button';
    btn.setAttribute('aria-label', 'Open cart');
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.setAttribute('aria-expanded', 'false');

    var count = document.createElement('span');
    count.className = 'cart-count';
    count.textContent = ui.totalCount();
    btn.appendChild(count);

    btn.addEventListener('click', function () { ui.open(); });

    var overlay = document.createElement('div');
    overlay.id = 'threadline-cart-overlay';
    overlay.className = 'cart-overlay';
    overlay.tabIndex = -1;
    overlay.addEventListener('click', function (e) { if (e.target === overlay) ui.close(); });

    var drawer = document.createElement('aside');
    drawer.id = 'threadline-cart-drawer';
    drawer.className = 'cart-drawer';
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-label', 'Shopping cart');

    var header = document.createElement('div');
    header.className = 'cart-drawer-header';
    var h = document.createElement('h2');
    h.textContent = 'Your cart';
    header.appendChild(h);
    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'cart-close';
    close.setAttribute('aria-label', 'Close cart');
    close.textContent = 'Close';
    close.addEventListener('click', function () { ui.close(); });
    header.appendChild(close);
    drawer.appendChild(header);

    var list = document.createElement('div');
    list.id = 'threadline-cart-list';
    list.className = 'cart-list';
    drawer.appendChild(list);

    var foot = document.createElement('div');
    foot.className = 'cart-drawer-foot';
    var total = document.createElement('div');
    total.id = 'threadline-cart-total';
    total.className = 'cart-total';
    foot.appendChild(total);

    var checkout = document.createElement('button');
    checkout.type = 'button';
    checkout.className = 'cart-checkout btn';
    checkout.textContent = 'Checkout';
    checkout.addEventListener('click', function () {
      // Let consumers implement checkout handling; also dispatch a normal event.
      emit('threadline:cart-checkout', { state: state });
    });
    foot.appendChild(checkout);
    drawer.appendChild(foot);

    overlay.appendChild(drawer);
    document.body.appendChild(overlay);
    document.body.appendChild(btn);

    // Keyboard handlers
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') ui.close();
    });

    ui._els = { btn: btn, count: count, overlay: overlay, drawer: drawer, list: list, total: total };
    ui.render();
  };

  ui.totalCount = function () {
    var c = 0; (state.items || []).forEach(function (it) { c += Number(it.quantity || 0); });
    return c;
  };

  ui.render = function () {
    var els = ui._els;
    if (!els) return;
    els.count.textContent = ui.totalCount() || '';
    // Render list
    els.list.innerHTML = '';
    if (!state.items || state.items.length === 0) {
      var p = document.createElement('p'); p.className = 'cart-empty'; p.textContent = 'Your cart is empty.'; els.list.appendChild(p); els.total.textContent = '';
      return;
    }

    var subtotal = 0;
    state.items.forEach(function (it) {
      var row = document.createElement('div'); row.className = 'cart-item';
      var left = document.createElement('div'); left.className = 'cart-item-left';
      var title = document.createElement('div'); title.className = 'cart-item-name'; title.textContent = it.name || it.id || 'Item';
      left.appendChild(title);
      var price = document.createElement('div'); price.className = 'cart-item-price'; price.textContent = (typeof it.price !== 'undefined' && it.price !== null) ? (formatMoney(it.price)) : '';
      left.appendChild(price);
      row.appendChild(left);

      var controls = document.createElement('div'); controls.className = 'cart-item-controls';
      var dec = document.createElement('button'); dec.type = 'button'; dec.className = 'cart-q'; dec.textContent = '−';
      dec.addEventListener('click', function () { updateQuantity(it.id, (Number(it.quantity || 1) - 1)); });
      var qty = document.createElement('span'); qty.className = 'cart-q-val'; qty.textContent = it.quantity;
      var inc = document.createElement('button'); inc.type = 'button'; inc.className = 'cart-q'; inc.textContent = '+';
      inc.addEventListener('click', function () { updateQuantity(it.id, (Number(it.quantity || 1) + 1)); });
      var rem = document.createElement('button'); rem.type = 'button'; rem.className = 'cart-remove'; rem.textContent = 'Remove';
      rem.addEventListener('click', function () { removeItem(it.id); });

      controls.appendChild(dec); controls.appendChild(qty); controls.appendChild(inc); controls.appendChild(rem);
      row.appendChild(controls);
      els.list.appendChild(row);

      subtotal += (Number(it.price || 0) * Number(it.quantity || 0));
    });

    els.total.textContent = 'Total: ' + formatMoney(subtotal);
  };

  var formatMoney = function (v) {
    try {
      if (typeof v === 'number') {
        // show dollars with no trailing .00 when whole
        if (Math.round(v * 100) % 100 === 0) return '$' + Math.round(v);
        return '$' + (Math.round(v * 100) / 100).toFixed(2);
      }
      return String(v);
    } catch (e) { return String(v); }
  };

  var setState = function (next) {
    state = next || { items: [] };
    write(state);
    emit('threadline:cart-updated', { state: state });
    safe(function () { ui.render(); });
  };

  var addItem = function (item) {
    var s = state || { items: [] };
    var idx = findItem(s.items, item.id);
    if (idx === -1) {
      if (s.items.length >= CAP_DISTINCT) return { ok: false, reason: 'distinct_limit' };
      var qty = Math.max(1, Math.min(MAX_PER_ITEM, Number(item.quantity || 1)));
      s.items.push({ id: String(item.id), name: item.name || '', price: Number(item.price || 0), quantity: qty });
    } else {
      var now = Number(s.items[idx].quantity || 0) + Number(item.quantity || 1);
      s.items[idx].quantity = Math.min(MAX_PER_ITEM, now);
    }
    setState(s);
    return { ok: true };
  };

  var removeItem = function (id) {
    var s = state || { items: [] };
    var idx = findItem(s.items, id);
    if (idx === -1) return;
    s.items.splice(idx, 1);
    setState(s);
  };

  var updateQuantity = function (id, qty) {
    var s = state || { items: [] };
    var idx = findItem(s.items, id);
    if (idx === -1) return;
    qty = Math.max(0, Math.min(MAX_PER_ITEM, Number(qty || 0)));
    if (qty === 0) { s.items.splice(idx, 1); } else { s.items[idx].quantity = qty; }
    setState(s);
  };

  var open = function () { var els = ui._els; if (!els) return; els.overlay.classList.add('open'); els.btn.setAttribute('aria-expanded', 'true'); setTimeout(function () { try { els.drawer.querySelector('button, a, [tabindex]') && els.drawer.querySelector('button, a, [tabindex]').focus(); } catch (e) {} }, 20); };
  var close = function () { var els = ui._els; if (!els) return; els.overlay.classList.remove('open'); els.btn.setAttribute('aria-expanded', 'false'); els.btn.focus(); };

  var clear = function () { setState({ items: [] }); };

  // Expose API
  var API = {
    read: function () { return JSON.parse(JSON.stringify(read())); },
    add: function (item) { return addItem(item); },
    remove: function (id) { removeItem(id); },
    setQuantity: function (id, qty) { updateQuantity(id, qty); },
    open: function () { ui.create(); open(); },
    close: function () { ui.create(); close(); },
    clear: function () { clear(); }
  };

  // Attach to window without stomping an existing value
  if (!window.ThreadlineCart) { try { Object.defineProperty(window, 'ThreadlineCart', { value: API, configurable: true }); } catch (e) { window.ThreadlineCart = API; } }

  // Wire event listener
  document.addEventListener('threadline:add-to-cart', function (e) {
    try {
      var detail = (e && e.detail) ? e.detail : {};
      if (!detail || !detail.id) return;
      var ok = addItem({ id: detail.id, name: detail.name || detail.id, price: detail.price || 0, quantity: detail.quantity || 1 });
      // create UI lazily
      ui.create();
      if (ok && ok.ok) {
        // if caller expected a reply, send it
        emit('threadline:cart-added', { id: detail.id, state: read() });
      } else {
        emit('threadline:cart-add-failed', { id: detail.id, reason: ok ? ok.reason : 'error' });
      }
    } catch (err) { console.error(err); }
  }, false);

  // Update UI from storage on load (in case other tabs changed it)
  window.addEventListener('storage', function (e) { if (e.key === STORAGE_KEY) { state = read(); safe(function () { ui.render(); }); emit('threadline:cart-updated', { state: state }); } });

  // Initialise UI but do not open drawer
  safe(function () { ui.create(); });

})(window, document);
