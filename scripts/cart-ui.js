(function () {
  // ThreadlineCartUI — non-invasive, idempotent demo cart UI
  // Stable root key: root.id || root.dataset.threadlineCartRoot || assigned data attribute
  // Single-shot document handlers guarded by `initialized`.
  if (window.ThreadlineCartUI) return; // do not clobber if already present

  var initialized = false;
  var idCounter = 0;
  var storedStates = []; // list of states for roots that have been rendered
  var wm = typeof WeakMap === 'function' ? new WeakMap() : null;

  function getRootElement(rootOrId) {
    var root = null;
    if (!rootOrId) return null;
    if (typeof rootOrId === 'string') {
      root = document.getElementById(rootOrId) || document.querySelector(rootOrId);
    } else if (rootOrId instanceof Element) {
      root = rootOrId;
    }
    return root;
  }

  function getOrMakeState(root) {
    var key = root.id || root.dataset.threadlineCartRoot;
    if (!key) {
      idCounter += 1;
      key = 'threadline-cart-root-' + idCounter;
      try { root.dataset.threadlineCartRoot = key; } catch (e) { /* ignore */ }
    }

    var state = wm ? wm.get(root) : root.__threadlineCartState;
    if (!state) {
      state = { key: key, count: 0, badgeEl: null, drawerEl: null, buttonEl: null, root: root };
      if (wm) wm.set(root, state); else root.__threadlineCartState = state;
    }

    // ensure storedStates contains this state exactly once
    if (!state._stored) {
      storedStates.push(state);
      state._stored = true;
    }

    return state;
  }

  // scripts/cart.js, when the page loads it. Looked up per call rather than
  // once, because nothing guarantees it is evaluated before this file.
  function cartModule() {
    try { return window.ThreadlineCart || null; } catch (e) { return null; }
  }

  // cart.js publishes the badge number as both `count` and `totalQuantity`;
  // the demo tally below publishes only `count`. Read either, and treat a
  // detail carrying neither as unknown rather than as zero — reading 0 off
  // cart.js's summary is what used to blank the badge on every real update.
  function summaryFromDetail(detail) {
    var d = detail || {};
    var count = Number(d.count);
    if (!isFinite(count)) count = Number(d.totalQuantity);
    if (!isFinite(count)) return null;
    return { count: count, items: Array.isArray(d.items) ? d.items : null };
  }

  function summaryFromCart() {
    var cart = cartModule();
    if (!cart || typeof cart.read !== 'function') return null;
    try { return summaryFromDetail(cart.read()); } catch (e) { return null; }
  }

  function formatCents(cents) {
    var n = Number(cents);
    if (!isFinite(n)) return '';
    return '$' + (n / 100).toFixed(2);
  }

  // Fill the drawer from the cart's line items. Without a cart module there is
  // nothing to list, so the drawer keeps its placeholder text.
  function renderDrawer(drawer, summary) {
    if (!drawer) return;
    var items = summary.items;
    if (!items) return;
    while (drawer.firstChild) drawer.removeChild(drawer.firstChild);
    if (!items.length) {
      drawer.appendChild(document.createTextNode('Your cart is empty.'));
      return;
    }
    var list = document.createElement('ul');
    list.className = 'threadline-cart-lines';
    var totalCents = 0;
    items.forEach(function (it) {
      var qty = Number(it.quantity) || 0;
      var lineCents = (Number(it.price_cents) || 0) * qty;
      totalCents += lineCents;
      var li = document.createElement('li');
      li.textContent = (it.name || it.id || 'Item') + ' × ' + qty + ' — ' + formatCents(lineCents);
      list.appendChild(li);
    });
    drawer.appendChild(list);
    var total = document.createElement('p');
    total.className = 'threadline-cart-total';
    total.textContent = 'Total ' + formatCents(totalCents);
    drawer.appendChild(total);
  }

  // Push one summary into every root this module has rendered into.
  function applySummary(summary) {
    if (!summary) return;
    for (var i = 0; i < storedStates.length; i++) {
      var st = storedStates[i];
      if (!st) continue;
      st.count = summary.count;
      if (st.badgeEl) {
        st.badgeEl.textContent = summary.count > 0 ? String(summary.count) : '';
        st.badgeEl.style.display = summary.count > 0 ? 'inline-block' : 'none';
      }
      // The badge is aria-hidden, so the count reaches assistive tech through
      // the button's own name instead.
      if (st.buttonEl) {
        st.buttonEl.setAttribute('aria-label',
          summary.count > 0
            ? 'Cart, ' + summary.count + ' item' + (summary.count === 1 ? '' : 's')
            : 'Cart, empty');
      }
      renderDrawer(st.drawerEl, summary);
    }
  }

  function ensureHandlers() {
    if (initialized) return;
    initialized = true;

    // Update all rendered roots when cart-updated is fired.
    document.addEventListener('threadline:cart-updated', function (ev) {
      applySummary(summaryFromDetail(ev && ev.detail));
    }, false);

    // Demo add-to-cart tally, for a page that renders this UI without
    // scripts/cart.js. When the cart module IS present it owns this event and
    // emits its own cart-updated, so a second tally here would fight it: the
    // badge ended up showing the last add's quantity instead of the cart
    // total. Hence the check at dispatch time, not at install time — nothing
    // guarantees cart.js has been evaluated when these handlers go in.
    document.addEventListener('threadline:add-to-cart', function (ev) {
      if (cartModule()) return;
      var d = (ev && ev.detail) || {};
      var qty = Number(d.quantity || 1) || 1;
      var base = storedStates.length ? (storedStates[0].count || 0) : 0;
      document.dispatchEvent(new CustomEvent('threadline:cart-updated', { detail: { count: base + qty } }));
    }, false);
  }

  function renderInto(rootOrId) {
    var root = getRootElement(rootOrId);
    if (!root) return null;
    var state = getOrMakeState(root);
    ensureHandlers();

    // If we've already rendered into this root, do nothing
    if (state.badgeEl) return { root: root, key: state.key };

    // Build minimal demo UI
    var wrapper = document.createElement('div');
    wrapper.className = 'threadline-cart-ui-wrapper';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'threadline-cart-button';
    btn.setAttribute('aria-expanded', 'false');
    btn.textContent = 'Cart ';

    var badge = document.createElement('span');
    badge.className = 'threadline-cart-badge';
    badge.setAttribute('aria-hidden', 'true');
    badge.style.display = 'none';
    btn.appendChild(badge);

    var drawer = document.createElement('div');
    drawer.className = 'threadline-cart-drawer';
    drawer.style.display = 'none';
    drawer.textContent = 'Cart drawer (demo)';

    wrapper.appendChild(btn);
    wrapper.appendChild(drawer);

    root.appendChild(wrapper);

    state.badgeEl = badge;
    state.drawerEl = drawer;
    state.buttonEl = btn;

    // Paint what is already in the cart. localStorage survives a reload, so a
    // freshly rendered badge that started at zero was wrong until the shopper
    // happened to change something.
    applySummary(summaryFromCart() || { count: state.count, items: null });

    btn.addEventListener('click', function () {
      var open = drawer.style.display !== 'none';
      drawer.style.display = open ? 'none' : 'block';
      btn.setAttribute('aria-expanded', open ? 'false' : 'true');
    }, false);

    return { root: root, key: state.key };
  }

  window.ThreadlineCartUI = { renderInto: renderInto };
})();
