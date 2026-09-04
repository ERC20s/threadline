(function () {
  if (typeof window === 'undefined') return;
  if (window.ThreadlineCart) return; // do not clobber an existing implementation

  var STORAGE_KEY = 'threadline_cart';
  var MAX_DISTINCT = 5;
  var MAX_PER_ITEM = 5;

  function safeParse(v) {
    try { return JSON.parse(v); } catch (e) { return null; }
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { items: [] };
      var data = safeParse(raw);
      if (!data || !Array.isArray(data.items)) return { items: [] };
      // normalize shape
      data.items = data.items.map(function (it) {
        return {
          id: String(it.id || '').trim(),
          name: it.name || '',
          price_cents: Number.isFinite(it.price_cents) ? Math.floor(it.price_cents) : (Number.isFinite(it.price) ? Math.round(it.price * 100) : 0),
          quantity: Math.max(1, Math.min(MAX_PER_ITEM, parseInt(it.quantity, 10) || 1))
        };
      }).filter(function(it){ return it.id; });
      // trim to MAX_DISTINCT if something invalid persisted
      if (data.items.length > MAX_DISTINCT) data.items = data.items.slice(0, MAX_DISTINCT);
      return { items: data.items };
    } catch (err) {
      return { items: [] };
    }
  }

  function save(state) {
    try {
      var toStore = { items: state.items };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
      return true;
    } catch (e) { return false; }
  }

  function cartSummary(state) {
    var totalQuantity = 0;
    var totalPriceCents = 0;
    state.items.forEach(function (it) {
      totalQuantity += it.quantity;
      totalPriceCents += (it.price_cents || 0) * it.quantity;
    });
    return {
      items: state.items.slice(),
      totalItems: state.items.length,
      totalQuantity: totalQuantity,
      totalPriceCents: totalPriceCents
    };
  }

  function centsFromPrice(v) {
    if (v == null) return 0;
    var n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.-]+/g, ''));
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100);
  }

  function dispatchUpdate(state) {
    try {
      var summary = cartSummary(state);
      var ev = new CustomEvent('threadline:cart-updated', { detail: summary, bubbles: true });
      document.dispatchEvent(ev);
    } catch (e) { /* never throw */ }
  }

  function read() {
    return cartSummary(load());
  }

  function findIndex(items, id) {
    for (var i = 0; i < items.length; i++) if (items[i].id === id) return i;
    return -1;
  }

  function add(item) {
    try {
      if (!item || !item.id) return { ok: false, error: 'missing id' };
      var id = String(item.id);
      var name = item.name || '';
      var price_cents = centsFromPrice(item.price);
      var qty = Math.max(1, Math.min(MAX_PER_ITEM, parseInt(item.quantity, 10) || 1));

      var state = load();
      var idx = findIndex(state.items, id);
      if (idx === -1) {
        if (state.items.length >= MAX_DISTINCT) return { ok: false, error: 'too many distinct items (max ' + MAX_DISTINCT + ')' };
        state.items.push({ id: id, name: name, price_cents: price_cents, quantity: qty });
      } else {
        var existing = state.items[idx];
        var newQty = Math.min(MAX_PER_ITEM, existing.quantity + qty);
        existing.quantity = newQty;
        // prefer keeping stored name/price if present, but overwrite with provided if missing
        existing.name = existing.name || name;
        existing.price_cents = existing.price_cents || price_cents;
      }
      if (!save(state)) return { ok: false, error: 'storage failed' };
      dispatchUpdate(state);
      return { ok: true, cart: cartSummary(state) };
    } catch (e) { return { ok: false, error: 'unexpected error' }; }
  }

  function remove(id) {
    try {
      if (!id) return { ok: false, error: 'missing id' };
      var state = load();
      var idx = findIndex(state.items, String(id));
      if (idx === -1) return { ok: false, error: 'not found' };
      state.items.splice(idx, 1);
      if (!save(state)) return { ok: false, error: 'storage failed' };
      dispatchUpdate(state);
      return { ok: true, cart: cartSummary(state) };
    } catch (e) { return { ok: false, error: 'unexpected error' }; }
  }

  function setQuantity(id, n) {
    try {
      if (!id) return { ok: false, error: 'missing id' };
      var qty = Math.max(0, Math.min(MAX_PER_ITEM, parseInt(n, 10) || 0));
      var state = load();
      var idx = findIndex(state.items, String(id));
      if (idx === -1) return { ok: false, error: 'not found' };
      if (qty <= 0) {
        // remove
        state.items.splice(idx, 1);
      } else {
        state.items[idx].quantity = qty;
      }
      if (!save(state)) return { ok: false, error: 'storage failed' };
      dispatchUpdate(state);
      return { ok: true, cart: cartSummary(state) };
    } catch (e) { return { ok: false, error: 'unexpected error' }; }
  }

  function clear() {
    try {
      var state = { items: [] };
      if (!save(state)) return { ok: false, error: 'storage failed' };
      dispatchUpdate(state);
      return { ok: true, cart: cartSummary(state) };
    } catch (e) { return { ok: false, error: 'unexpected error' }; }
  }

  function open() { return { ok: true }; }
  function close() { return { ok: true }; }

  // Wire the document-level add-to-cart event listener. It must be a bubbling
  // CustomEvent with detail: {id,name,price,quantity}
  try {
    document.addEventListener('threadline:add-to-cart', function (ev) {
      try {
        var d = ev && ev.detail ? ev.detail : null;
        if (!d || !d.id) return; // ignore malformed
        add({ id: d.id, name: d.name, price: d.price, quantity: d.quantity });
      } catch (e) { /* swallow */ }
    }, false);
  } catch (e) { /* document not available */ }

  window.ThreadlineCart = {
    read: read,
    add: add,
    remove: remove,
    setQuantity: setQuantity,
    clear: clear,
    open: open,
    close: close,
    // constants exposed for UI authors
    _STORAGE_KEY: STORAGE_KEY,
    _MAX_DISTINCT: MAX_DISTINCT,
    _MAX_PER_ITEM: MAX_PER_ITEM
  };

})();
