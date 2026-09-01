(function () {
  // Idempotent guard: if the widget has already initialized, stop.
  if (window.__d8aPaymentsWidgetInstalled) return;
  window.__d8aPaymentsWidgetInstalled = true;

  var BASE = "https://d8a.com";
  var GROUP = "batch-threadline";
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

  // Promise cache for store item fetches keyed by group slug. Stored on window so
  // multiple widget instances or re-initializations share the same cache.
  window.__d8aPaymentsWidgetStoreCache = window.__d8aPaymentsWidgetStoreCache || {};
  var storeFetchCache = window.__d8aPaymentsWidgetStoreCache;

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
  // New: support multi-group verification. Expose window.groupStoreVerify(id[, group]).
  var verifySingle = function (id, group) {
    var g;
    try { g = group && String(group).trim() ? String(group).trim() : GROUP; } catch (e) { g = GROUP; }
    return doFetch(BASE + "/api/v1/store/orders/" + encodeURIComponent(id) + "?group=" + encodeURIComponent(g), null, 10000)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { return d && d.paid ? d.order : null; })
      .catch(function () { return null; });
  };

  var groupStoreVerify = function (id, group) {
    if (!id) return Promise.resolve(null);
    // If a specific group is requested, verify only that group.
    if (typeof group === 'string' && group) {
      return verifySingle(id, group);
    }
    // Otherwise, attempt verification across every distinct group resolved
    // from #group-store elements on the page. Run sequentially and stop at
    // the first match.
    var seen = {};
    var groups = [];
    try {
      currentContainers().forEach(function (el) {
        try {
          var g = getGroupForElement(el);
          if (!seen[g]) { seen[g] = true; groups.push(g); }
        } catch (e) {}
      });
    } catch (e) {}
    if (!groups.length) groups.push(GROUP);

    var found = null;
    var foundGroup = null;
    // Sequentially try each group, returning the order when found.
    return groups.reduce(function (prev, g) {
      return prev.then(function (res) {
        if (res) return res; // already found
        return verifySingle(id, g).then(function (o) {
          if (o) {
            found = o; foundGroup = g; return o;
          }
          return null;
        });
      });
    }, Promise.resolve(null)).then(function (res) {
      if (found) {
        try { found._d8a_group = foundGroup; } catch (e) {}
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
    // Determine which group matched the verified order. If verification was
    // run across groups the matched group is attached as _d8a_group; fall
    // back to the legacy GROUP constant when absent.
    var matchedGroup = (o && o._d8a_group) ? o._d8a_group : GROUP;
    currentContainers().forEach(function (el) {
      if (!el) return;
      var localGroup = getGroupForElement(el);
      // Only insert the receipt into containers that resolve to the same
      // group that verified the order. This avoids showing receipts for
      // other groups on pages hosting multiple stores.
      if (localGroup !== matchedGroup) return;
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
      // Clear the shared in-memory store fetch cache for this container's group so Retry always forces a fresh network request.
      var localGroup = getGroupForElement(el);
      try { delete storeFetchCache[localGroup]; } catch (err) { storeFetchCache[localGroup] = undefined; }
      // Re-run the fetch/render flow for only this container.
      fetchAndRender(el);
    });
    el.setAttribute('data-d8a-retry-listener', '1');
  };

  // Attach a per-container buy click listener that uses the container's stored store data.
  var ensureBuyListener = function (el) {
    if (el.getAttribute('data-d8a-listener')) return;
    // Use a shared, namespaced opening map on window so clicks across containers
    // (including multiple containers resolving to the same group) are deduped.
    window.__d8aPaymentsWidgetOpening = window.__d8aPaymentsWidgetOpening || {};
    var opening = window.__d8aPaymentsWidgetOpening;
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

      // Prevent duplicate concurrent checkouts for the same group+item+qty across all containers.
      var groupSlug = getGroupForElement(el);
      var key = groupSlug + '::' + itemId + '::' + qty;
      if (opening[key]) return;
      opening[key] = true;

      e.preventDefault();
      var originalText = a.textContent;
      a.textContent = "Opening\u2026";

      // Build the return URL: current page without any earlier d8a_order param
      var here = location.href.replace(/([?&])d8a_order=[^&#]*&?/, "$1").replace(/[?&](#|$)/, "$1");

      // POST to the store's checkout URL as JSON
      var body = JSON.stringify({ group: getGroupForElement(el), item: itemId, quantity: qty, returnUrl: here });
      doFetch((store && store.checkout && store.checkout.url) ? store.checkout.url : (BASE + '/api/v1/store/checkout'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body }, 10000)
        .then(function (r) { return r.json ? r.json() : null; })
        .then(function (d) {
          opening[key] = false;
          if (d && d.url) {
            location.href = d.url;
            return;
          }
          // Otherwise, fall back to anchor href if present and allowed by sanitizeUrl.
          try { a.textContent = originalText; } catch (e) {}
          var safe = sanitizeUrl(a.getAttribute('href')) || (store && store.group && store.group.url) || a.getAttribute('href');
          location.href = safe;
        }).catch(function () {
          opening[key] = false;
          try { a.textContent = originalText; } catch (e) {}
          var safe2 = sanitizeUrl(a.getAttribute('href')) || (store && store.group && store.group.url) || a.getAttribute('href');
          location.href = safe2;
        });
    });
    el.setAttribute('data-d8a-listener', '1');
  };

  // Fetch the store data (items, checkout, group) for a given group slug. Use the shared cache so parallel containers dedupe network traffic.
  var fetchStoreForGroup = function (group) {
    try { group = String(group).trim(); } catch (e) { group = GROUP; }
    if (storeFetchCache[group]) return storeFetchCache[group];
    var p = doFetch(BASE + "/api/v1/store/items?group=" + encodeURIComponent(group), null, 10000)
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
    storeFetchCache[group] = p;
    return p;
  };

  // Build item markup using DOM APIs and attach listeners. Use sanitizeUrl to avoid unsafe urls.
  var buildItemsInto = function (el, store) {
    // Clear container
    while (el.firstChild) el.removeChild(el.firstChild);

    if (!store || !store.items) {
      renderMessageWithRetry(el, '<p style="font:13px system-ui,sans-serif;color:#9ca3af">There was an error loading the store.</p>');
      ensureRetryListener(el);
      return;
    }

    if (!store.items.length) {
      el.innerHTML = '<p style="font:13px system-ui,sans-serif;color:#9ca3af">Nothing for sale right now.</p>';
      return;
    }

    store.items.forEach(function (it) {
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid #e5e7eb;font:14px system-ui,sans-serif';

      var left = document.createElement('div');
      left.style.cssText = 'flex:1';
      var b = document.createElement('b');
      b.textContent = it.name || '';
      left.appendChild(b);
      if (it.description) {
        var desc = document.createElement('div');
        desc.style.cssText = 'font-size:12px;color:#6b7280';
        desc.textContent = it.description;
        left.appendChild(desc);
      }

      var price = document.createElement('span');
      price.textContent = it.price != null ? String(it.price) : '';

      var a = document.createElement('a');
      // sanitize payUrl and fall back to group url when unsafe
      var safePay = sanitizeUrl(it.payUrl) || (store && store.group && store.group.url) || '#';
      a.setAttribute('href', safePay);
      a.setAttribute('data-item', it.id != null ? String(it.id) : '');
      a.setAttribute('role', 'link');
      a.style.cssText = 'background:#7c5cff;color:#fff;border-radius:999px;padding:6px 14px;text-decoration:none';
      a.textContent = 'Buy';
      // Provide a contextual aria-label when possible
      try { a.setAttribute('aria-label', 'Buy ' + (it.name || '').replace(/\s+/g, ' ').trim()); } catch (e) {}

      row.appendChild(left);
      row.appendChild(price);
      row.appendChild(a);
      el.appendChild(row);
    });

    // Footer link to storefront
    var p = document.createElement('p');
    p.style.cssText = 'font:11px system-ui,sans-serif;color:#9ca3af';
    var text = document.createTextNode('Sold by ');
    p.appendChild(text);
    var link = document.createElement('a');
    link.style.cssText = 'color:#7c5cff';
    link.setAttribute('href', (store && store.group && store.group.url) ? sanitizeUrl(store.group.url) || '#' : '#');
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
    el.innerHTML = '<p style="font:13px system-ui,sans-serif;color:#6b7280">Loading2
6</p>';

    var promise = fetchStoreForGroup(group);
    promise.then(function (s) {
      if (!s) {
        renderMessageWithRetry(el, '<p style="font:13px system-ui,sans-serif;color:#9ca3af">There was an error loading the store.</p>');
        ensureRetryListener(el);
        return;
      }
      // Attach the store onto the element for later use by the buy handler.
      try { el.__d8a_store = s; } catch (e) {}
      buildItemsInto(el, s);
    }).catch(function () {
      renderMessageWithRetry(el, '<p style="font:13px system-ui,sans-serif;color:#9ca3af">There was an error loading the store.</p>');
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
