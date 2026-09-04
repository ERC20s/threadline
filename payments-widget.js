(function () {
  // Idempotent guard: if the widget has already initialized, stop.
  if (window.__d8aPaymentsWidgetInstalled) return;
  window.__d8aPaymentsWidgetInstalled = true;

  var BASE = "https://d8a.com";
  // The group slug this site sells for. Must match the `group:` line and the
  // items/verify URLs generated in the root .d8a file
  // (group: d8a:d8aaaa-batch_threadline). A container may override it with
  // data-d8a-group; see getGroupForElement below.
  var GROUP = "d8aaaa-batch_threadline";
  var esc = function (s) {
    return String(s).replace(/[&<>\"']/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; });
  };

  // Helper: sanitize/validate external URLs. Allow only:
  // - absolute http: and https: URLs
  // - protocol-relative URLs starting with //
  // - same-origin absolute paths starting with /
  // Return the original trimmed string when allowed, or null when unsafe.
  var sanitizeUrl = function (u) {
    try {
      if (!u && u !== 0) return null;
      var s = String(u).trim();
      if (!s) return null;
      // Reject any control characters or whitespace inside the URL
      if (/\s/.test(s)) return null;
      // Protocol-relative (//example.com/path)
      if (/^\/\//.test(s)) return s;
      // Absolute http(s)
      if (/^https?:\/\//i.test(s)) return s;
      // Absolute path on same origin (/path)
      if (/^\//.test(s)) return s;
      return null;
    } catch (e) { return null; }
  };

  // Resolve a per-container base declared on the container element.
  // Reads data-d8a-base, runs through sanitizeUrl, strips trailing slashes,
  // caches the resolved value on el.__d8a_base and returns null when absent/invalid.
  var getBaseForElement = function (el) {
    try {
      if (!el || !el.getAttribute) return null;
      if (typeof el.__d8a_base !== 'undefined') return el.__d8a_base;
      var raw = el.getAttribute('data-d8a-base');
      var s = sanitizeUrl(raw);
      if (!s) { el.__d8a_base = null; return null; }
      // Strip trailing slashes
      while (s.length > 1 && s[s.length - 1] === '/') s = s.slice(0, -1);
      el.__d8a_base = s;
      return s;
    } catch (e) { try { el.__d8a_base = null; } catch (err) {} return null; }
  };

  // Promise cache for store item fetches keyed by group slug and optional base.
  // Stored on window so multiple widget instances or re-initializations share the same cache.
  window.__d8aPaymentsWidgetStoreCache = window.__d8aPaymentsWidgetStoreCache || {};
  var storeFetchCache = window.__d8aPaymentsWidgetStoreCache;

  // Shared map for concurrent checkout attempts across containers. Keys are
  // namespaced by group so the same item in different groups is distinct.
  window.__d8aPaymentsWidgetOpening = window.__d8aPaymentsWidgetOpening || {};
  var globalOpening = window.__d8aPaymentsWidgetOpening;

  // Helper: return the current set of #group-store containers on demand.
  var currentContainers = function () {
    try { return Array.prototype.slice.call(document.querySelectorAll('#group-store')); } catch (e) { return []; }
  };

  // Helper to resolve the group slug for a container element. If the element
  // has a data-d8a-group attribute, use that; otherwise fall back to the
  // legacy GROUP constant.
  var getGroupForElement = function (el) {
    try {
      var attr = el && el.getAttribute ? el.getAttribute('data-d8a-group') : null;
      return (attr && String(attr).trim()) ? String(attr).trim() : GROUP;
    } catch (e) { return GROUP; }
  };

  // Ensure each container is an aria-live region before we do anything.
  currentContainers().forEach(function (el) {
    if (!el.getAttribute('aria-live')) el.setAttribute('aria-live', 'polite');
  });

  // Helper: fetch with a timeout (defaults to 10s). On timeout the returned
  // promise rejects (treat as a network failure). Uses AbortController when
  // available to cancel the outstanding fetch.
  var fetchWithTimeout = function (url, opts, timeoutMs) {
    timeoutMs = typeof timeoutMs === 'number' ? timeoutMs : 10000;
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var signal = controller ? controller.signal : undefined;
    var fetchOpts = opts ? Object.assign({}, opts) : {};
    if (signal) fetchOpts.signal = signal;

    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () {
        try { if (controller) controller.abort(); } catch (e) {}
        reject(new Error('timeout'));
      }, timeoutMs);

      fetch(url, fetchOpts).then(function (r) {
        clearTimeout(timer);
        resolve(r);
      }).catch(function (err) {
        clearTimeout(timer);
        reject(err);
      });
    });
  };

  // Helper: doFetch — prefer native fetchWithTimeout, but fall back to an
  // XMLHttpRequest implementation when fetch is not available. Returns a
  // Promise that resolves to an object with the minimal shape consumers expect
  // (ok boolean, status, statusText, json() -> Promise).
  var doFetch = function (url, opts, timeoutMs) {
    timeoutMs = typeof timeoutMs === 'number' ? timeoutMs : 10000;
    if (typeof fetch !== 'undefined') {
      // Native fetch available: delegate to fetchWithTimeout which already
      // implements AbortController-based cancellation.
      return fetchWithTimeout(url, opts, timeoutMs);
    }

    // XHR fallback
    return new Promise(function (resolve, reject) {
      try {
        var xhr = new XMLHttpRequest();
        var method = (opts && opts.method) ? opts.method : 'GET';
        xhr.open(method, url, true);

        // Apply headers if provided.
        if (opts && opts.headers) {
          try {
            for (var h in opts.headers) {
              if (Object.prototype.hasOwnProperty.call(opts.headers, h)) {
                xhr.setRequestHeader(h, opts.headers[h]);
              }
            }
          } catch (e) {}
        }

        var timer = setTimeout(function () {
          try { xhr.abort(); } catch (e) {}
          reject(new Error('timeout'));
        }, timeoutMs);

        xhr.onreadystatechange = function () {
          if (xhr.readyState !== 4) return;
          clearTimeout(timer);
          var status = xhr.status === 1223 ? 204 : xhr.status; // IE quirk
          var ok = status >= 200 && status < 300;
          var res = {
            ok: ok,
            status: status,
            statusText: xhr.statusText,
            text: function () { return Promise.resolve(xhr.responseText); },
            json: function () {
              try { return Promise.resolve(JSON.parse(xhr.responseText)); }
              catch (e) { return Promise.reject(e); }
            }
          };
          resolve(res);
        };

        xhr.onerror = function () { clearTimeout(timer); reject(new Error('network')); };
        // Send the provided body if present, otherwise null.
        try {
          xhr.send(opts && typeof opts.body !== 'undefined' ? opts.body : null);
        } catch (e) {
          clearTimeout(timer);
          reject(e);
        }
      } catch (e) {
        reject(e);
      }
    });
  };

  // The handshake: an order id is only proof once the platform says so.
  // Original single-base verifier kept for explicit-group checks.
  var verifySingle = function (id, group) {
    var g;
    try { g = group && String(group).trim() ? String(group).trim() : GROUP; } catch (e) { g = GROUP; }
    return doFetch(BASE + "/api/v1/store/orders/" + encodeURIComponent(id) + "?group=" + encodeURIComponent(g), null, 10000)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { return d && d.paid ? d.order : null; })
      .catch(function () { return null; });
  };

  // Verify against a specific base: base may be null meaning the global BASE.
  var verifySingleWithBase = function (id, group, base) {
    var g;
    try { g = group && String(group).trim() ? String(group).trim() : GROUP; } catch (e) { g = GROUP; }
    var host = base || BASE;
    try { host = String(host); } catch (e) { host = BASE; }
    var url = host + "/api/v1/store/orders/" + encodeURIComponent(id) + "?group=" + encodeURIComponent(g);
    return doFetch(url, null, 10000)
      .then(function (r) { return r && r.ok ? r.json() : null; })
      .then(function (d) { if (d && d.paid && d.order) { try { d.order._d8a_group = g; d.order._d8a_base = base || null; } catch (e) {} return d.order; } return null; })
      .catch(function () { return null; });
  };

  var groupStoreVerify = function (id, group) {
    if (!id) return Promise.resolve(null);
    // If a specific group is requested, verify only that group (legacy behavior).
    if (typeof group === 'string' && group) {
      return verifySingle(id, group);
    }

    // Otherwise, attempt verification across every distinct group resolved
    // from #group-store elements on the page. For each group, if any
    // containers declare a base, build distinct (group, base) pairs and try
    // those bases sequentially. If no containers for a group declare a base,
    // fall back to verifying only against the global BASE for that group.
    var seenGroups = {};
    var groups = [];
    try {
      currentContainers().forEach(function (el) {
        try {
          var g = getGroupForElement(el);
          if (!seenGroups[g]) { seenGroups[g] = true; groups.push(g); }
        } catch (e) {}
      });
    } catch (e) {}
    if (!groups.length) groups.push(GROUP);

    var pairs = [];
    try {
      groups.forEach(function (g) {
        var seenBases = {};
        currentContainers().forEach(function (el) {
          try {
            if (getGroupForElement(el) !== g) return;
            var b = getBaseForElement(el);
            if (b && !seenBases[b]) { seenBases[b] = true; pairs.push({group: g, base: b}); }
          } catch (e) {}
        });
        // If no declared bases for this group, fall back to a null base which means the global BASE.
        if (!Object.keys(seenBases).length) pairs.push({group: g, base: null});
      });
    } catch (e) {}

    var found = null;
    var foundGroup = null;
    var foundBase = null;
    // Sequentially try each (group,base) pair, returning the order when found.
    return pairs.reduce(function (prev, pair) {
      return prev.then(function (res) {
        if (res) return res; // already found
        return verifySingleWithBase(id, pair.group, pair.base).then(function (o) {
          if (o) { found = o; foundGroup = pair.group; foundBase = pair.base; return o; }
          return null;
        });
      });
    }, Promise.resolve(null)).then(function (res) {
      if (found) {
        try { found._d8a_group = foundGroup; found._d8a_base = foundBase; } catch (e) {}
        return found;
      }
      return null;
    });
  };

  window.groupStoreVerify = groupStoreVerify;

  var back = (location.search.match(/[?&]d8a_order=([A-Za-z0-9_-]+)/) || [])[1];
  if (back) groupStoreVerify(back).then(function (o) {
    if (!o) return;
    // Preserve the original behavior of exposing the paid order object.
    window.groupStorePaid = o;
    // Determine which group/base matched the verified order. If verification was
    // run across groups the matched group/base may be attached as _d8a_group/_d8a_base; fall
    // back to the legacy GROUP constant when absent, and to null base when absent.
    var matchedGroup = (o && o._d8a_group) ? o._d8a_group : GROUP;
    var matchedBase = (o && typeof o._d8a_base !== 'undefined') ? o._d8a_base : null;
    currentContainers().forEach(function (el) {
      if (!el) return;
      var localGroup = getGroupForElement(el);
      var localBase = getBaseForElement(el);
      // Only insert the receipt into containers that resolve to the same
      // group and the same base that verified the order. This avoids showing
      // receipts for other groups or bases on pages hosting multiple stores.
      // A null matchedBase means the verification used the global BASE, so only
      // containers with no declared base receive the receipt.
      if (localGroup !== matchedGroup) return;
      if ((matchedBase === null && localBase !== null) || (matchedBase !== null && localBase !== matchedBase)) return;
      // Suppress duplicates: skip if this container already contains a receipt for this order id.
      if (el.querySelector('[data-paid="' + o.id + '"]')) return;
      var p = document.createElement('p');
      p.setAttribute('data-paid', o.id);
      p.setAttribute('role', 'status');
      p.style.cssText = "font:13px system-ui,sans-serif;color:#059669";
      p.innerHTML = "Paid: " + esc(o.itemName) + (o.quantity > 1 ? " \u00d7" + o.quantity : "") + " \u2014 order " + esc(o.id);
      try {
        el.insertBefore(p, el.firstChild);
      } catch (e) {
        el.appendChild(p);
      }
    });
    document.dispatchEvent(new CustomEvent("group-store:paid", { detail: o }));
  });

  // Helper: render an error / empty message with a Retry control into a container.
  var renderMessageWithRetry = function (el, htmlMessage) {
    var retryBtn = '<button type="button" data-d8a-retry style="margin-left:10px;background:transparent;border:1px solid #e5e7eb;padding:6px 10px;border-radius:6px;color:#111;cursor:pointer">Retry</button>';
    el.innerHTML = htmlMessage + retryBtn;
  };

  // Attach a per-container retry listener if not already attached.
  var ensureRetryListener = function (el) {
    if (el.getAttribute('data-d8a-retry-listener')) return;
    el.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('[data-d8a-retry]') : null;
      if (!btn) return;
      e.preventDefault();
      // Clear the shared in-memory store fetch cache for this container's group+base so Retry always forces a fresh network request.
      var localGroup = getGroupForElement(el);
      var localBase = getBaseForElement(el);
      var key = localGroup + '::' + (localBase || '');
      try { delete storeFetchCache[key]; } catch (err) { storeFetchCache[key] = undefined; }
      // Re-run the fetch/render flow for only this container.
      fetchAndRender(el);
    });
    el.setAttribute('data-d8a-retry-listener', '1');
  };

  // Render a read-only catalogue from the page's local Threadline.products.
  // This is opt-in only: only containers that set data-d8a-fallback="readonly"
  // will use this. The rendered rows are non-interactive 'View' links that
  // point to product.html?id=<id> and carry no data-item attribute or checkout wiring.
  var renderReadOnlyCatalogue = function (el) {
    try {
      if (!el) return;
      var T = window.Threadline || {};
      var products = Array.isArray(T.products) ? T.products : [];
      try { el.innerHTML = ''; } catch (e) {}

      var info = document.createElement('p');
      info.style.cssText = "font:13px system-ui,sans-serif;color:#9ca3af";
      info.textContent = 'Read-only catalogue — prices may be out of date.\u00a0 Links go to the product page.';
      el.appendChild(info);

      products.forEach(function (p) {
        try {
          var row = document.createElement('div');
          row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:8px 0;border-top:1px solid #e5e7eb;font:14px system-ui,sans-serif';
          var left = document.createElement('div'); left.style.flex = '1';
          var b = document.createElement('b'); b.textContent = p.name || '';
          left.appendChild(b);
          if (p.description) { var d = document.createElement('div'); d.style.fontSize = '12px'; d.style.color = '#6b7280'; d.textContent = p.description; left.appendChild(d); }
          row.appendChild(left);

          var priceText = '';
          try {
            if (T && typeof T.money === 'function' && p && p.price) priceText = T.money(p.price);
            else priceText = (p && p.price) ? String(p.price) : '';
          } catch (e) { priceText = (p && p.price) ? String(p.price) : ''; }
          var price = document.createElement('span'); price.textContent = priceText; row.appendChild(price);

          var a = document.createElement('a');
          var href = 'product.html?id=' + encodeURIComponent(p.id || '');
          var safe = sanitizeUrl(href) || '#';
          a.setAttribute('href', safe);
          // Intentionally do NOT set data-item, do not attach checkout behavior.
          a.setAttribute('rel', 'noopener noreferrer');
          a.style.cssText = 'background:#7c5cff;color:#fff;border-radius:999px;padding:6px 14px;text-decoration:none';
          a.textContent = 'View';
          row.appendChild(a);

          el.appendChild(row);
        } catch (e) {}
      });

      // Footer: a real link to the group's page on the platform. The fallback
      // has no store payload to read group.url from, so build it from the
      // container's own group slug and base (data-d8a-group / data-d8a-base),
      // falling back to the widget's GROUP and BASE constants.
      var p = document.createElement('p');
      p.style.cssText = "font:11px system-ui,sans-serif;color:#9ca3af";
      var link = document.createElement('a');
      var groupSlug = GROUP;
      try { groupSlug = getGroupForElement(el) || GROUP; } catch (e) { groupSlug = GROUP; }
      var host = BASE;
      try { host = getBaseForElement(el) || BASE; } catch (e) { host = BASE; }
      var groupUrl = '';
      try { groupUrl = String(host) + '/g/' + encodeURIComponent(String(groupSlug)); } catch (e) { groupUrl = ''; }
      link.setAttribute('href', sanitizeUrl(groupUrl) || '#');
      link.setAttribute('rel', 'noopener noreferrer');
      link.style.color = '#7c5cff';
      link.textContent = groupSlug ? ('View group shop — ' + String(groupSlug)) : 'View group shop';
      p.appendChild(link);
      el.appendChild(p);
    } catch (e) {
      try { el.innerHTML = ''; } catch (err) {}
    }
  };

  // Attach a per-container buy click listener that uses the container's stored store data.
  var ensureBuyListener = function (el) {
    if (el.getAttribute('data-d8a-listener')) return;
    el.addEventListener('click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a[data-item]') : null;
      if (!a) return;
      // Read the store data that fetchAndRender attached to the container.
      var store = el.__d8a_store;
      if (!store || !store.checkout || !store.checkout.enabled) return;
      // Respect modified clicks: allow ctrl/cmd/shift/alt clicks and target=_blank to behave natively.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (a.getAttribute && a.getAttribute('target') === '_blank')) return;

      var itemId = a.getAttribute('data-item');
      if (!itemId) return;

      // Determine quantity: data-quantity (explicit) or data-default-quantity fallback to store default.
      var qty = 1;
      try {
        var qAttr = a.getAttribute('data-quantity');
        var qDef = a.getAttribute('data-default-quantity') || (store && store.defaultQuantity);
        if (qAttr != null) {
          var n = parseInt(qAttr, 10);
          if (!isNaN(n) && n > 0) qty = n;
        } else if (qDef != null) {
          var nd = parseInt(qDef, 10);
          if (!isNaN(nd) && nd > 0) qty = nd;
        }
      } catch (e) {}

      // Optional per-anchor extras. A sized garment is sold in a size, but the
      // platform item is sizeless, so the page that owns the size (product.html)
      // stamps its choice on the row it is about to click:
      //   data-size      -> "M"
      //   data-d8a-note  -> "Everyday Tee - size M"
      // Both are trimmed, whitespace-collapsed and length-capped here, and they
      // are only added to the posted object when they are actually present, so
      // an anchor with no attributes posts exactly the body this widget has
      // always posted.
      var readExtra = function (name, max) {
        try {
          var raw = a.getAttribute ? a.getAttribute(name) : null;
          if (raw == null) return '';
          var v = String(raw).replace(/\s+/g, ' ').trim();
          if (!v) return '';
          return v.length > max ? v.slice(0, max) : v;
        } catch (err) { return ''; }
      };
      var size = readExtra('data-size', 40);
      var noteText = readExtra('data-d8a-note', 140);

      // Prevent duplicate concurrent checkouts for the same group+item+qty across all containers.
      // The note (or the bare size) is part of the key: a second click for a
      // different size is a different purchase and must not be swallowed by the
      // guard, while two identical clicks still post once.
      var group = getGroupForElement(el);
      var variant = noteText || size;
      var key = group + '::' + itemId + '::' + qty + '::' + variant;
      if (globalOpening[key]) return;
      try { globalOpening[key] = true; } catch (e) {}

      e.preventDefault();
      var originalText = a.textContent;
      a.textContent = "Opening…";

      // Build the return URL: current page without any earlier d8a_order param
      var here = location.href.replace(/([?&])d8a_order=[^&#]*&?/, "$1").replace(/[?&](#|$)/, "$1");

      // POST to the store's checkout URL as JSON
      var payload = { group: group, item: itemId, quantity: qty, returnUrl: here };
      // The exact body this widget posted before size was carried — kept so a
      // platform that refuses unknown fields can still be checked out with.
      var plainBody = JSON.stringify(payload);
      if (size) payload.size = size;
      if (noteText) payload.note = noteText;
      var body = JSON.stringify(payload);
      var hasExtras = body !== plainBody;

      var checkoutUrl = (store && store.checkout && store.checkout.url) ? store.checkout.url : (BASE + '/api/v1/store/checkout');
      // If the checkoutUrl is a relative path (starts with '/') and this container
      // declares a base, resolve it against that base so per-container platforms
      // receive the POST. Do not otherwise change the legacy absolute BASE behavior.
      try {
        var elBase = getBaseForElement(el);
        if (typeof checkoutUrl === 'string' && checkoutUrl.charAt(0) === '/' && elBase) {
          checkoutUrl = elBase + checkoutUrl;
        }
      } catch (e) {}

      var release = function () { try { delete globalOpening[key]; } catch (err) {} };
      var fallback = function () {
        try { a.textContent = originalText; } catch (err) {}
        var safe = sanitizeUrl(a.getAttribute('href')) || (store && store.group && store.group.url) || a.getAttribute('href');
        location.href = safe;
      };
      var post = function (bodyText) {
        return doFetch(checkoutUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyText }, 10000)
          .then(function (r) { return (r && r.json) ? r.json() : null; });
      };

      post(body)
        .then(function (d) {
          if (d && d.url) {
            release();
            location.href = d.url;
            return null;
          }
          // No checkout url came back. If we sent the extra fields, the answer
          // may be the platform rejecting them: try exactly once more with the
          // plain body before giving up to the anchor href.
          if (!hasExtras) {
            release();
            fallback();
            return null;
          }
          return post(plainBody).then(function (d2) {
            release();
            if (d2 && d2.url) { location.href = d2.url; return null; }
            fallback();
            return null;
          }).catch(function () {
            release();
            fallback();
            return null;
          });
        })
        .catch(function () {
          release();
          fallback();
        });
    });
    el.setAttribute('data-d8a-listener', '1');
  };

  // Fetch the store data (items, checkout, group) for a given group slug.
  // Use the shared cache so parallel containers dedupe network traffic. If an
  // element is provided the per-container base (data-d8a-base) is respected
  // and the cache key is namespaced by group::base.
  var fetchStoreForGroup = function (group, el) {
    try { group = String(group).trim(); } catch (e) { group = GROUP; }
    var base = null;
    try { base = getBaseForElement(el); } catch (e) { base = null; }
    var key = group + '::' + (base || '');
    if (storeFetchCache[key]) return storeFetchCache[key];
    var host = base || BASE;
    var url = host + "/api/v1/store/items?group=" + encodeURIComponent(group);
    var p = doFetch(url, null, 10000)
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
    storeFetchCache[key] = p;
    return p;
  };

  // Build item markup using DOM APIs and attach listeners. Use sanitizeUrl to avoid unsafe urls.
  var buildItemsInto = function (el, store) {
    if (!el || !store) return;
    try { el.innerHTML = ''; } catch (e) {}

    if (!store.items || !store.items.length) {
      var p0 = document.createElement('p');
      p0.style.cssText = "font:13px system-ui,sans-serif;color:#9ca3af";
      p0.textContent = 'Nothing for sale right now.';
      el.appendChild(p0);
      return;
    }

    store.items.forEach(function (it) {
      try {
        var row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid #e5e7eb;font:14px system-ui,sans-serif';
        var left = document.createElement('div'); left.style.flex = '1';
        var b = document.createElement('b'); b.textContent = it.name; left.appendChild(b);
        if (it.description) { var d = document.createElement('div'); d.style.fontSize = '12px'; d.style.color = '#6b7280'; d.textContent = it.description; left.appendChild(d); }
        row.appendChild(left);
        var price = document.createElement('span'); price.textContent = it.price; row.appendChild(price);
        var a = document.createElement('a');
        var safe = sanitizeUrl(it.payUrl) || (store && store.group && store.group.url) || '#';
        a.setAttribute('href', safe);
        a.setAttribute('data-item', it.id);
        a.style.cssText = 'background:#7c5cff;color:#fff;border-radius:999px;padding:6px 14px;text-decoration:none';
        a.textContent = 'Buy';
        row.appendChild(a);
        el.appendChild(row);
      } catch (e) {}
    });

    var p = document.createElement('p');
    p.style.cssText = "font:11px system-ui,sans-serif;color:#9ca3af";
    var link = document.createElement('a');
    link.setAttribute('href', (store && store.group && store.group.url) ? store.group.url : '');
    link.style.color = '#7c5cff';
    link.textContent = store && store.group && store.group.name ? store.group.name : '';
    p.appendChild(link);
    el.appendChild(p);

    // Attach buy listener and save the store on the container for use by the listener.
    try { el.__d8a_store = store; } catch (e) {}
    ensureBuyListener(el);
  };

  // Fetch and render flow for a single container element.
  var fetchAndRender = function (el) {
    if (!el) return;
    // Ensure aria-live region
    if (!el.getAttribute('aria-live')) el.setAttribute('aria-live', 'polite');

    var group = getGroupForElement(el);
    // Optimistically show a loading state
    el.innerHTML = '<p style="font:13px system-ui,sans-serif;color:#6b7280">Loading…</p>';

    // Name the slug we tried, so a future mismatch between this file and the
    // group declared in .d8a is visible on the page instead of silent.
    var failure = '<p style="font:13px system-ui,sans-serif;color:#9ca3af">There was an error loading the store (group ' + esc(group) + ').</p>';

    var promise = fetchStoreForGroup(group, el);
    promise.then(function (s) {
      if (!s) {
        // If the container explicitly opts in to a read-only fallback and
        // the page carries a local catalogue (window.Threadline.products),
        // render a clearly labelled read-only catalogue instead of the retry UI.
        try {
          var opted = el.getAttribute && el.getAttribute('data-d8a-fallback') === 'readonly';
          var T = window.Threadline || {};
          var localProducts = Array.isArray(T.products) ? T.products : null;
          if (opted && localProducts && localProducts.length) {
            renderReadOnlyCatalogue(el);
            // Still attach a Retry so authors can force a network re-check.
            ensureRetryListener(el);
            return;
          }
        } catch (e) {}

        renderMessageWithRetry(el, failure);
        ensureRetryListener(el);
        return;
      }
      // Attach the store onto the element for later use by the buy handler.
      try { el.__d8a_store = s; } catch (e) {}
      buildItemsInto(el, s);
    }).catch(function () {
      renderMessageWithRetry(el, failure);
      ensureRetryListener(el);
    });
  };

  // Initialize: render each current container and observe for additions.
  currentContainers().forEach(function (el) { fetchAndRender(el); });

  // Observe DOM additions of #group-store containers so dynamically injected
  // stores are supported.
  try {
    if (typeof MutationObserver !== 'undefined') {
      var mo = new MutationObserver(function (mutations) {
        mutations.forEach(function (m) {
          for (var i = 0; i < (m.addedNodes ? m.addedNodes.length : 0); i++) {
            var n = m.addedNodes[i];
            if (!n || !n.querySelector) continue;
            var found = n.id === 'group-store' ? n : n.querySelector('#group-store');
            if (found) {
              if (!found.getAttribute('aria-live')) found.setAttribute('aria-live', 'polite');
              fetchAndRender(found);
            }
          }
        });
      });
      mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
    }
  } catch (e) {}

})();
