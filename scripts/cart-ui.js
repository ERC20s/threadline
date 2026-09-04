(function () {
  // Minimal, defensive header cart UI. Safe if payments-widget.js or ThreadlineCart
  // are absent: it uses ThreadlineCart.read() when present and falls back to
  // localStorage key "threadline_cart".

  var LS_KEY = "threadline_cart";
  var CART_EVENT = "threadline:cart-updated"; // listened for

  function safe(fn) { try { return fn(); } catch (e) { return null; } }

  // Read the authoritative cart if available, otherwise from localStorage.
  function readCart() {
    var c = safe(function () {
      if (window.ThreadlineCart && typeof window.ThreadlineCart.read === "function") {
        return window.ThreadlineCart.read() || [];
      }
      return null;
    });
    if (c !== null) return Array.isArray(c) ? c : [];

    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
  }

  function writeCart(cart) {
    try {
      if (window.ThreadlineCart && typeof window.ThreadlineCart.write === "function") {
        // If an authorititative writer exists, prefer it when possible.
        try { window.ThreadlineCart.write(cart); } catch (e) { /* ignore */ }
      }
    } catch (e) {}
    try { localStorage.setItem(LS_KEY, JSON.stringify(cart || [])); } catch (e) {}
  }

  function cartCount(cart) {
    if (!cart || !cart.length) return 0;
    return cart.reduce(function (s, it) { return s + (Number(it.quantity) || 0); }, 0);
  }

  // Create header toggle and drawer DOM.
  function createUI() {
    var header = document.querySelector(".header");
    if (!header) return null;

    // container for toggle so we don't disturb existing layout
    var container = document.createElement("div");
    container.className = "cart-ui-container";

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cart-toggle";
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-label", "Cart");

    var icon = document.createElement("span");
    icon.className = "cart-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = "🧺";

    var badge = document.createElement("span");
    badge.className = "cart-badge";
    badge.setAttribute("aria-hidden", "true");
    badge.textContent = "0";

    btn.appendChild(icon);
    btn.appendChild(badge);

    // Drawer
    var drawer = document.createElement("aside");
    drawer.className = "cart-drawer";
    drawer.setAttribute("aria-hidden", "true");
    drawer.setAttribute("role", "dialog");
    drawer.setAttribute("aria-label", "Shopping cart");
    drawer.tabIndex = -1;

    var dhead = document.createElement("div");
    dhead.className = "cart-drawer-head";
    var h = document.createElement("h2");
    h.textContent = "Your cart";
    var close = document.createElement("button");
    close.type = "button";
    close.className = "cart-close";
    close.setAttribute("aria-label", "Close cart");
    close.textContent = "Close";
    dhead.appendChild(h);
    dhead.appendChild(close);

    var list = document.createElement("div");
    list.className = "cart-list";

    var actions = document.createElement("div");
    actions.className = "cart-actions";
    var checkoutLink = document.createElement("a");
    checkoutLink.className = "cart-checkout";
    checkoutLink.href = "#group-store"; // direct shoppers to the platform panel
    checkoutLink.textContent = "Checkout";
    actions.appendChild(checkoutLink);

    drawer.appendChild(dhead);
    drawer.appendChild(list);
    drawer.appendChild(actions);

    container.appendChild(btn);
    container.appendChild(drawer);

    // Insert at end of header so it is predictable and non-invasive
    header.appendChild(container);

    // Event handlers
    btn.addEventListener("click", function () { toggleDrawer(); });
    btn.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleDrawer(); }
    });
    close.addEventListener("click", function () { closeDrawer(); });

    // close on outside click
    document.addEventListener("click", function (e) {
      if (!drawer || !btn) return;
      if (drawer.contains(e.target) || btn.contains(e.target)) return;
      if (drawer.getAttribute("data-open") === "true") closeDrawer();
    });

    // escape key
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeDrawer(); });

    return { container: container, button: btn, badge: badge, drawer: drawer, list: list, checkout: checkoutLink };
  }

  var ui = null;
  var currentCart = null;

  function renderCart() {
    var cart = readCart();
    currentCart = cart;
    if (!ui) return;
    ui.badge.textContent = String(cartCount(cart) || 0);

    // Fill list
    var list = ui.list;
    list.innerHTML = "";
    if (!cart || !cart.length) {
      var p = document.createElement("p");
      p.className = "cart-empty";
      p.textContent = "Your cart is empty.";
      list.appendChild(p);
      return;
    }
    cart.forEach(function (it, i) {
      var row = document.createElement("div");
      row.className = "cart-item";
      var title = document.createElement("div");
      title.className = "cart-item-title";
      title.textContent = it.name || it.id || "Item";
      var meta = document.createElement("div");
      meta.className = "cart-item-meta";
      meta.textContent = (it.size ? it.size + " 3 " : "") + (it.quantity ? "×" + it.quantity : "");
      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "cart-remove";
      remove.setAttribute("aria-label", "Remove " + (it.name || "item"));
      remove.textContent = "Remove";
      remove.addEventListener("click", function () {
        removeItem(i);
      });
      row.appendChild(title);
      row.appendChild(meta);
      row.appendChild(remove);
      list.appendChild(row);
    });
  }

  function removeItem(index) {
    var cart = readCart();
    if (!cart || !cart.length) return;
    cart.splice(index, 1);
    writeCart(cart);
    emitCartUpdated();
    renderCart();
  }

  function toggleDrawer() {
    if (!ui) return;
    var open = ui.drawer.getAttribute("data-open") === "true";
    if (open) { closeDrawer(); }
    else { openDrawer(); }
  }

  function openDrawer() {
    if (!ui) return;
    ui.drawer.setAttribute("data-open", "true");
    ui.drawer.setAttribute("aria-hidden", "false");
    ui.button.setAttribute("aria-expanded", "true");
    try { ui.drawer.focus(); } catch (e) {}
  }

  function closeDrawer() {
    if (!ui) return;
    ui.drawer.setAttribute("data-open", "false");
    ui.drawer.setAttribute("aria-hidden", "true");
    ui.button.setAttribute("aria-expanded", "false");
  }

  function emitCartUpdated() {
    try { document.dispatchEvent(new CustomEvent(CART_EVENT, { detail: readCart() })); } catch (e) {}
  }

  // Listen for a platform payment confirmation and clear the cart when it matches
  // an item in our cart. We do a conservative clear: if any item id matches order.itemId
  // remove just that item; if unknown, clear whole cart to avoid stale state.
  function onPaid(e) {
    var order = e && e.detail ? e.detail : null;
    if (!order) return;
    var cart = readCart();
    if (!cart || !cart.length) return;
    var any = false;
    if (order && order.itemId) {
      for (var i = cart.length - 1; i >= 0; i--) {
        if (String(cart[i].id || "") === String(order.itemId || "")) { cart.splice(i, 1); any = true; }
      }
    }
    if (!any) { cart = []; }
    writeCart(cart);
    emitCartUpdated();
    renderCart();
  }

  // On explicit cart-updated events we re-render
  function onCartUpdated(e) { renderCart(); }

  // Small public helper: add an item to fallback localStorage cart when no ThreadlineCart
  function addToFallback(item) {
    var cart = readCart();
    // merge by id+size
    var found = -1;
    for (var i = 0; i < cart.length; i++) {
      if (String(cart[i].id || "") === String(item.id || "") && String(cart[i].size || "") === String(item.size || "")) { found = i; break; }
    }
    if (found > -1) { cart[found].quantity = (Number(cart[found].quantity) || 0) + (Number(item.quantity) || 1); }
    else { cart.push({ id: item.id, name: item.name, size: item.size, quantity: item.quantity || 1 }); }
    writeCart(cart);
    emitCartUpdated();
    renderCart();
  }

  // Initialise UI when DOM ready
  function init() {
    ui = createUI();
    renderCart();
    // Listen for the defensive client cart's events if present
    document.addEventListener(CART_EVENT, onCartUpdated);
    document.addEventListener("group-store:paid", onPaid);
    // Also listen for a threadline:cart-updated custom event name (proposal text)
    document.addEventListener("threadline:cart-updated", onCartUpdated);

    // Expose a fallback add so other inline code can call it without requiring ThreadlineCart
    try { if (!window.ThreadlineCart) window.ThreadlineCart = window.ThreadlineCart || {}; } catch (e) {}
    try { if (!window.ThreadlineCart || typeof window.ThreadlineCart.add !== "function") { window.ThreadlineCart = window.ThreadlineCart || {}; window.ThreadlineCart.addFallback = addToFallback; } } catch (e) {}

    // If authors use ThreadlineCart.read() synchronously later, ensure we reflect state
    // A gentle polling for changes in localStorage keeps the badge live in multi-tab.
    var last = JSON.stringify(readCart());
    setInterval(function () {
      var now = JSON.stringify(readCart());
      if (now !== last) { last = now; emitCartUpdated(); }
    }, 1500);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
