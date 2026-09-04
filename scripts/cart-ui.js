(function () {
  if (typeof window === 'undefined') return;
  if (window.ThreadlineCartUI) return; // do not clobber

  // Defensive helpers
  function qs(sel, root) { try { return (root || document).querySelector(sel); } catch (e) { return null; } }
  function el(name, attrs) { var n = document.createElement(name); if (attrs) for (var k in attrs) if (k === 'text') n.textContent = attrs[k]; else n.setAttribute(k, attrs[k]); return n; }

  var CART = window.ThreadlineCart || null;
  var demoRoot = qs('#cart-demo');
  var badgeBtn = null;
  var drawer = null;
  var list = null;
  var totalLine = null;

  function formatMoney(cents) {
    try {
      var n = Number(cents) / 100;
      if (typeof Intl === 'object' && Intl && typeof Intl.NumberFormat === 'function') {
        var nf = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
        var out = nf.format(n);
        if (Math.round(n * 100) % 100 === 0) out = out.replace(/\.00$/, '');
        return out;
      }
      return '$' + (Math.round(n) === n ? String(n) : n.toFixed(2));
    } catch (e) { return String(cents); }
  }

  function renderBadge(summary) {
    if (!badgeBtn) return;
    var qty = summary && summary.totalQuantity ? summary.totalQuantity : 0;
    var price = summary && summary.totalPriceCents ? formatMoney(summary.totalPriceCents) : '';
    badgeBtn.innerHTML = '<span class="cart-demo-badge-count">' + qty + '</span>' + (price ? ' <span class="cart-demo-badge-price">' + price + '</span>' : '');
    badgeBtn.setAttribute('aria-label', 'Cart with ' + qty + ' items');
  }

  function buildDrawer() {
    if (!drawer) return;
    drawer.innerHTML = '';
    var title = el('div', { 'class': 'cart-demo-drawer-head', 'text': 'Your cart' });
    drawer.appendChild(title);
    list = el('div', { 'class': 'cart-demo-list' });
    drawer.appendChild(list);
    totalLine = el('div', { 'class': 'cart-demo-total' });
    drawer.appendChild(totalLine);
    var clearBtn = el('button', { 'type': 'button' }); clearBtn.textContent = 'Clear cart';
    clearBtn.addEventListener('click', function () { if (CART && CART.clear) CART.clear(); else dispatchClear(); });
    drawer.appendChild(clearBtn);
  }

  function updateDrawer(summary) {
    if (!drawer || !list || !totalLine) return;
    var items = summary && summary.items ? summary.items : [];
    list.innerHTML = '';
    if (!items.length) {
      list.textContent = 'Your cart is empty.';
    } else {
      items.forEach(function (it) {
        var row = el('div', { 'class': 'cart-demo-row' });
        var name = el('div', { 'class': 'cart-demo-row-name', 'text': it.name || it.id });
        row.appendChild(name);
        var qty = el('div', { 'class': 'cart-demo-row-qty', 'text': '×' + (it.quantity || 1) });
        row.appendChild(qty);
        var price = el('div', { 'class': 'cart-demo-row-price', 'text': formatMoney(it.price_cents || 0) });
        row.appendChild(price);
        var remove = el('button', { 'type': 'button' }); remove.textContent = 'Remove';
        remove.addEventListener('click', function () {
          if (CART && CART.remove) CART.remove(it.id);
          else dispatchRemove(it.id);
        });
        row.appendChild(remove);
        list.appendChild(row);
      });
    }
    totalLine.textContent = (summary && typeof summary.totalQuantity !== 'undefined') ? ('Items: ' + summary.totalQuantity + ' — ' + formatMoney(summary.totalPriceCents || 0)) : '';
  }

  function dispatchAdd(item) {
    try {
      var ev = new CustomEvent('threadline:add-to-cart', { detail: item, bubbles: true });
      document.dispatchEvent(ev);
    } catch (e) {}
  }

  function dispatchRemove(id) {
    // ThreadlineCart exposes remove on the global object; there is no event API
    // defined for removing, so the demo falls back to calling ThreadlineCart.remove
    // or to saving nothing.
    try { var ev = new CustomEvent('threadline:remove-from-cart', { detail: { id: id }, bubbles: true }); document.dispatchEvent(ev); } catch (e) {}
  }

  function dispatchClear() {
    try { var ev = new CustomEvent('threadline:clear-cart', { bubbles: true }); document.dispatchEvent(ev); } catch (e) {}
  }

  function onCartUpdated(ev) {
    try {
      var summary = (ev && ev.detail) ? ev.detail : (CART && CART.read ? CART.read() : { items: [], totalQuantity: 0, totalPriceCents: 0 });
      renderBadge(summary);
      updateDrawer(summary);
    } catch (e) {}
  }

  function onPaid(ev) {
    try {
      if (!drawer) return;
      var detail = ev && ev.detail ? ev.detail : null;
      var p = el('div', { 'class': 'cart-demo-paid' });
      p.textContent = detail && detail.itemName ? ('Paid: ' + detail.itemName + (detail.quantity > 1 ? ' ×' + detail.quantity : '') + ' — order ' + (detail.id || '')) : 'Payment received.';
      drawer.insertBefore(p, drawer.firstChild);
      setTimeout(function () { try { if (p && p.parentNode) p.parentNode.removeChild(p); } catch (e) {} }, 5000);
    } catch (e) {}
  }

  function toggleDrawer() {
    if (!drawer) return;
    drawer.classList.toggle('open');
  }

  function ensureUi() {
    if (!demoRoot) return;
    // Create badge and drawer
    var container = el('div', { 'class': 'cart-demo-container' });
    badgeBtn = el('button', { 'class': 'cart-demo-badge', 'type': 'button' });
    badgeBtn.addEventListener('click', toggleDrawer);
    container.appendChild(badgeBtn);
    drawer = el('div', { 'class': 'cart-demo-drawer', 'role': 'region' });
    container.appendChild(drawer);
    demoRoot.appendChild(container);
    buildDrawer();

    // initial read
    try {
      var initial = CART && CART.read ? CART.read() : { items: [], totalQuantity: 0, totalPriceCents: 0 };
      renderBadge(initial);
      updateDrawer(initial);
    } catch (e) {}
  }

  // Listen for publicly exposed events
  try { document.addEventListener('threadline:cart-updated', onCartUpdated, false); } catch (e) {}
  try { document.addEventListener('group-store:paid', onPaid, false); } catch (e) {}

  // Provide a minimal API for demo drivers
  var API = {
    addForDemo: function (item) {
      if (CART && CART.add) return CART.add(item);
      dispatchAdd(item);
      return { ok: true };
    },
    open: function () { if (drawer) drawer.classList.add('open'); },
    close: function () { if (drawer) drawer.classList.remove('open'); },
    renderInto: function (root) {
      if (!root) return;
      demoRoot = (typeof root === 'string') ? document.getElementById(root) : root;
      ensureUi();
    }
  };

  // Wire small event listeners for demo events that call into ThreadlineCart if available
  // Some pages may prefer events rather than calling ThreadlineCart directly.
  try {
    document.addEventListener('threadline:remove-from-cart', function (ev) {
      try { var id = ev && ev.detail && ev.detail.id ? ev.detail.id : null; if (!id) return; if (CART && CART.remove) CART.remove(id); }
      catch (e) {}
    }, false);
  } catch (e) {}

  try {
    document.addEventListener('threadline:clear-cart', function () { try { if (CART && CART.clear) CART.clear(); } catch (e) {} }, false);
  } catch (e) {}

  // attach global
  window.ThreadlineCartUI = API;

  // Auto-render into #cart-demo if present
  try { if (demoRoot) ensureUi(); } catch (e) {}

})();
