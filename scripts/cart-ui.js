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
      state = { key: key, count: 0, badgeEl: null, drawerEl: null, root: root };
      if (wm) wm.set(root, state); else root.__threadlineCartState = state;
    }

    // ensure storedStates contains this state exactly once
    if (!state._stored) {
      storedStates.push(state);
      state._stored = true;
    }

    return state;
  }

  function ensureHandlers() {
    if (initialized) return;
    initialized = true;

    // Update all rendered roots when cart-updated is fired
    document.addEventListener('threadline:cart-updated', function (ev) {
      var detail = (ev && ev.detail) || {};
      var count = Number(detail.count || 0) || 0;
      for (var i = 0; i < storedStates.length; i++) {
        var st = storedStates[i];
        if (!st) continue;
        st.count = count;
        if (st.badgeEl) {
          st.badgeEl.textContent = count > 0 ? String(count) : '';
          st.badgeEl.style.display = count > 0 ? 'inline-block' : 'none';
        }
      }
    }, false);

    // Simple demo add-to-cart handler: increments count and re-emits cart-updated
    document.addEventListener('threadline:add-to-cart', function (ev) {
      var d = (ev && ev.detail) || {};
      var qty = Number(d.quantity || 1) || 1;
      // For demo purposes we compute a total by adding qty to the first stored state's count
      var total = 0;
      if (storedStates.length) {
        // prefer the first state's current count
        total = (storedStates[0].count || 0) + qty;
      } else {
        total = qty;
      }
      document.dispatchEvent(new CustomEvent('threadline:cart-updated', { detail: { count: total } }));
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

    btn.addEventListener('click', function () {
      var open = drawer.style.display !== 'none';
      drawer.style.display = open ? 'none' : 'block';
      btn.setAttribute('aria-expanded', open ? 'false' : 'true');
    }, false);

    return { root: root, key: state.key };
  }

  window.ThreadlineCartUI = { renderInto: renderInto };
})();
