(function () {
  // Minimal, dependency-free client-side cart that listens for
  // 'threadline:add-to-cart' CustomEvents (bubbles:true) and keeps a
  // persisted state in localStorage under 'threadline_cart'. Exposes
  // window.Threadline.cart for debugging and tests.

  if (typeof window === 'undefined') return;
  var LS_KEY = 'threadline_cart';
  var MAX_PER_ITEM = 5;

  function safeParse(s) {
    try { return JSON.parse(s); } catch (e) { return null; }
  }

  function save(state) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}
  }
  function load() {
    var raw = null;
    try { raw = localStorage.getItem(LS_KEY); } catch (e) {}
    var s = safeParse(raw);
    if (!s || !Array.isArray(s.items)) return { items: [] };
    return s;
  }

  function money(n) {
    if (n == null) return '';
    if (typeof n === 'string') return n;
    return '$' + Number(n).toFixed(2);
  }

  // Renderer: floating button and drawer
  var btn, drawer, overlay, countEl, listEl, subtotalEl, closeBtn;
  function ensureElements() {
    if (btn) return;
    // button
    btn = document.createElement('button');
    btn.className = 'cart-button';
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('title', 'Open cart');
    btn.type = 'button';
    btn.innerHTML = '<span class="cart-icon">🧺</span> <span class="cart-count">0</span>';
    countEl = btn.querySelector('.cart-count');
    btn.addEventListener('click', function () { toggle(); });
    document.body.appendChild(btn);

    // overlay
    overlay = document.createElement('div');
    overlay.className = 'cart-overlay';
    overlay.tabIndex = -1;
    overlay.addEventListener('click', close);
    document.body.appendChild(overlay);

    // drawer
    drawer = document.createElement('aside');
    drawer.className = 'cart-drawer';
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-label', 'Shopping cart');
    drawer.setAttribute('aria-hidden', 'true');
    drawer.innerHTML = '' +
      '<div class="cart-header"><h2>Cart</h2><button class="cart-close" aria-label="Close cart">Close</button></div>' +
      '<div class="cart-body">' +
      '<ul class="cart-list"></ul>' +
      '</div>' +
      '<div class="cart-footer"><div class="cart-subtotal"></div><div class="cart-actions"><button class="btn cart-checkout">Checkout</button></div></div>';
    closeBtn = drawer.querySelector('.cart-close');
    closeBtn.addEventListener('click', close);
    listEl = drawer.querySelector('.cart-list');
    subtotalEl = drawer.querySelector('.cart-subtotal');
    drawer.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') { close(); }
    });
    // Checkout behaviour: navigate to shop or product page; left intentionally
    // simple: go to /products.html to encourage size selection or to shop.
    drawer.querySelector('.cart-checkout').addEventListener('click', function () {
      // If single-item with no-size requirement, go to product page with qty
      var state = load();
      if (state.items.length === 1 && state.items[0].id) {
        // prefer product page so shopper can select size if needed
        location.href = 'product.html?id=' + encodeURIComponent(state.items[0].id);
        return;
      }
      location.href = 'products.html';
    });

    document.body.appendChild(drawer);
  }

  function render() {
    ensureElements();
    var state = load();
    var totalCount = state.items.reduce(function (s, it) { return s + (it.quantity || 0); }, 0);
    countEl.textContent = totalCount || '';
    btn.setAttribute('aria-expanded', String(isOpen()));
    // list
    listEl.innerHTML = '';
    if (!state.items.length) {
      listEl.innerHTML = '<li class="cart-empty">Your cart is empty.</li>';
      subtotalEl.textContent = '';
      return;
    }
    var subtotal = 0;
    state.items.forEach(function (it) {
      var li = document.createElement('li');
      li.className = 'cart-item';
      var priceNum = (typeof it.price === 'number') ? it.price : (Number(it.price) || 0);
      var lineTotal = (it.quantity || 0) * priceNum;
      subtotal += lineTotal;
      li.innerHTML = '<div class="cart-item-main">' +
        '<div class="cart-item-name">' + escapeHtml(it.name) + '</div>' +
        '<div class="cart-item-price">' + (it.priceString || money(it.price)) + '</div>' +
        '</div>' +
        '<div class="cart-item-controls">' +
        '<button class="cart-minus" aria-label="Decrease quantity">-</button>' +
        '<span class="cart-qty">' + (it.quantity || 0) + '</span>' +
        '<button class="cart-plus" aria-label="Increase quantity">+</button>' +
        '<button class="cart-remove" aria-label="Remove item">Remove</button>' +
        '</div>';
      // hook up controls
      (function (item, el) {
        el.querySelector('.cart-minus').addEventListener('click', function () {
          setQuantity(item.id, Math.max(0, (item.quantity || 1) - 1));
        });
        el.querySelector('.cart-plus').addEventListener('click', function () {
          setQuantity(item.id, Math.min(MAX_PER_ITEM, (item.quantity || 0) + 1));
        });
        el.querySelector('.cart-remove').addEventListener('click', function () {
          remove(item.id);
        });
      })(it, li);
      listEl.appendChild(li);
    });
    subtotalEl.textContent = 'Subtotal: ' + money(subtotal);
  }

  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }

  function isOpen() { return drawer && drawer.getAttribute('aria-hidden') === 'false'; }
  function open() { ensureElements(); overlay.classList.add('visible'); drawer.setAttribute('aria-hidden', 'false'); drawer.classList.add('open'); btn.setAttribute('aria-expanded', 'true'); try { closeBtn.focus(); } catch (e) {} }
  function close() { if (!drawer) return; overlay.classList.remove('visible'); drawer.setAttribute('aria-hidden', 'true'); drawer.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); try { btn.focus(); } catch (e) {} }
  function toggle() { isOpen() ? close() : open(); }

  // Cart operations
  function find(state, id) { return state.items.find(function (i) { return i.id === id; }); }

  function add(detail) {
    if (!detail || !detail.id || !detail.name) return false;
    var qty = Number(detail.quantity) || 1;
    qty = qty < 1 ? 1 : qty;
    var state = load();
    var existing = find(state, detail.id);
    if (existing) {
      existing.quantity = Math.min(MAX_PER_ITEM, (existing.quantity || 0) + qty);
    } else {
      state.items.push({ id: detail.id, name: detail.name, price: detail.price, priceString: detail.priceString, quantity: Math.min(MAX_PER_ITEM, qty) });
    }
    save(state);
    render();
    return true;
  }

  function remove(id) {
    if (!id) return;
    var state = load();
    state.items = state.items.filter(function (i) { return i.id !== id; });
    save(state);
    render();
  }

  function setQuantity(id, n) {
    if (!id) return;
    var state = load();
    var it = find(state, id);
    if (!it) return;
    if (!n || n < 1) {
      // remove
      remove(id);
      return;
    }
    it.quantity = Math.min(MAX_PER_ITEM, Math.floor(Number(n) || 1));
    save(state);
    render();
  }

  // Event listener for the public contract
  document.addEventListener('threadline:add-to-cart', function (ev) {
    var d = ev && ev.detail ? ev.detail : null;
    if (!d) return;
    // Accept price as number or priceString; if price missing, try to coerce
    if ((d.price == null) && !d.priceString) {
      // allow items without price (they may be resolved later) but still add
    }
    var accepted = add({ id: String(d.id), name: String(d.name || d.id), price: (d.price != null ? Number(d.price) : d.price), priceString: d.priceString, quantity: (d.quantity || 1) });
    if (accepted) {
      // announce
      var ev2 = new CustomEvent('threadline:cart-updated', { detail: load() });
      document.dispatchEvent(ev2);
    }
  });

  // Public API on window.Threadline.cart
  window.Threadline = window.Threadline || {};
  window.Threadline.cart = window.Threadline.cart || {};
  window.Threadline.cart.readCart = function () { return load(); };
  window.Threadline.cart.add = function (d) { return add(d); };
  window.Threadline.cart.remove = function (id) { return remove(id); };
  window.Threadline.cart.setQuantity = function (id, n) { return setQuantity(id, n); };
  window.Threadline.cart.open = open;
  window.Threadline.cart.close = close;

  // Initial render
  document.addEventListener('DOMContentLoaded', function () { render(); });
  // If script is injected later
  render();
})();
