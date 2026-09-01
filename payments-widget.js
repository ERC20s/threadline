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
      var p = document.createElement("p");
      p.setAttribute("data-paid", o.id);
      p.setAttribute("role", "status");
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
    el.addEventListener('click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a[data-item]') : null;
      if (!a) return;
      var s = el._d8a_store;
      if (!s || !s.checkout || !s.checkout.enabled) return;
      e.preventDefault();
      // Guard against duplicate checkout clicks originating from the same container.
      if (el.getAttribute('data-d8a-checkout-busy')) return;
      try { el.setAttribute('data-d8a-checkout-busy', '1'); } catch (e) {}
      var oldText = a.textContent;
      try { a.textContent = 'Opening\u2026'; } catch (e) {}
      // Come back to this page — minus any earlier receipt on the URL.
      var here = location.href.replace(/([?&])d8a_order=[^&#]*&?/, "$1").replace(/[?&](#|$)/, "$1");
      var body = { group: getGroupForElement(el), item: a.getAttribute('data-item'), quantity: 1, returnUrl: here };
      var opts = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
      // Prefer the configured checkout.url, but fall back to the platform checkout endpoint when absent.
      var checkoutUrl = (s.checkout && s.checkout.url) ? s.checkout.url : (BASE + '/api/v1/store/checkout');
      doFetch(checkoutUrl, opts, 10000).then(function (r) { return r.json(); }).then(function (d) {
        try { a.textContent = oldText; } catch (e) {}
        try { el.removeAttribute('data-d8a-checkout-busy'); } catch (e) {}
        if (d && d.url) { location.href = d.url; return; }
        // No returned URL: navigate to the safe payUrl on the item link.
        try { location.href = a.href; } catch (e) {}
      }).catch(function () {
        try { a.textContent = oldText; } catch (e) {}
        try { el.removeAttribute('data-d8a-checkout-busy'); } catch (e) {}
        try { location.href = a.href; } catch (e) {}
      });
    });
    el.setAttribute('data-d8a-listener', '1');
  };

  // Core: fetch the store payload for the group and render it into a container.
  var fetchAndRender = function (el) {
    if (!el) return;
    try { el.setAttribute('aria-busy', 'true'); } catch (e) {}
    var localGroup = getGroupForElement(el);

    // If a cached promise exists for this slug, reuse it — callers may share the same network request.
    try {
      if (storeFetchCache[localGroup]) {
        return storeFetchCache[localGroup].then(function (s) { try { renderStoreInto(el, s, localGroup); } catch (e) {} });
      }
    } catch (e) {}

    var promise = doFetch(BASE + '/api/v1/store/items?group=' + encodeURIComponent(localGroup), null, 10000).then(function (r) { return r.json(); });
    try { storeFetchCache[localGroup] = promise; } catch (e) {}
    promise.then(function (s) {
      renderStoreInto(el, s, localGroup);
    }).catch(function () {
      renderMessageWithRetry(el, '<p style="font:13px system-ui,sans-serif;color:#9ca3af">Unable to load store right now.</p>');
      ensureRetryListener(el);
      ensureBuyListener(el);
    }).finally(function () {
      try { el.removeAttribute('aria-busy'); } catch (e) {}
      try { el.removeAttribute('data-d8a-checkout-busy'); } catch (e) {}
    });
  };

  var renderStoreInto = function (el, s, localGroup) {
    if (!el) return;
    try { el.innerHTML = ''; } catch (e) {}
    try {
      if (!s || !s.items || !s.items.length) {
        renderMessageWithRetry(el, '<p style="font:13px system-ui,sans-serif;color:#9ca3af">Nothing for sale right now.</p>');
        ensureRetryListener(el);
        ensureBuyListener(el);
        return;
      }

      for (var i = 0; i < s.items.length; i++) {
        try {
          var it = s.items[i];
          var itemDiv = document.createElement('div');
          itemDiv.style.cssText = 'display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid #e5e7eb;font:14px system-ui,sans-serif';

          var left = document.createElement('div');
          left.style.cssText = 'flex:1';

          var nameNode = document.createElement('b');
          nameNode.textContent = it.name || '';
          left.appendChild(nameNode);

          if (it.description) {
            var desc = document.createElement('div');
            desc.style.cssText = 'font-size:12px;color:#6b7280';
            desc.textContent = it.description;
            left.appendChild(desc);
          }

          itemDiv.appendChild(left);

          var price = document.createElement('span');
          price.textContent = it.price || '';
          itemDiv.appendChild(price);

          var a = document.createElement('a');
          var safePay = sanitizeUrl(it.payUrl) || (BASE + '/g/' + localGroup);
          a.setAttribute('href', safePay);
          try { a.setAttribute('data-item', String(it.id)); } catch (e) { a.setAttribute('data-item', it.id); }
          a.style.cssText = 'background:#7c5cff;color:#fff;border-radius:999px;padding:6px 14px;text-decoration:none';
          a.textContent = 'Buy';
          try { a.setAttribute('rel', 'noopener noreferrer'); } catch (e) {}
          itemDiv.appendChild(a);

          try { el.appendChild(itemDiv); } catch (e) { /* best-effort */ }
        } catch (e) { /* continue with other items */ }
      }

      // Add the sold-by line with a safe link to the group storefront.
      try {
        var soldp = document.createElement('p');
        soldp.style.cssText = 'font:11px system-ui,sans-serif;color:#9ca3af';
        soldp.textContent = 'Sold by ';
        var solda = document.createElement('a');
        var safeGroupHref = sanitizeUrl(s.group && s.group.url) || (BASE + '/g/' + localGroup);
        solda.setAttribute('href', safeGroupHref);
        solda.style.cssText = 'color:#7c5cff';
        solda.textContent = (s.group && s.group.name) ? s.group.name : '';
        try { solda.setAttribute('rel', 'noopener noreferrer'); } catch (e) {}
        soldp.appendChild(solda);
        el.appendChild(soldp);
      } catch (e) { /* ignore sold-by failures */ }
    } catch (e) {
      // If DOM APIs fail for any reason, fall back to the previous safe innerHTML rendering using esc().
      el.innerHTML = s.items.map(function (it) {
        return '<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid #e5e7eb;font:14px system-ui,sans-serif">' +
          '<div style="flex:1"><b>' + esc(it.name) + '</b>' +
          (it.description ? '<div style="font-size:12px;color:#6b7280">' + esc(it.description) + '</div>' : '') + '</div>' +
          '<span>' + esc(it.price) + '</span>' +
          '<a href="' + esc(it.payUrl) + '" data-item="' + esc(it.id) + '" style="background:#7c5cff;color:#fff;border-radius:999px;padding:6px 14px;text-decoration:none">Buy</a></div>';
      }).join('') + '<p style="font:11px system-ui,sans-serif;color:#9ca3af">Sold by <a href="' + esc(s.group && s.group.url) + '" style="color:#7c5cff">' + esc(s.group && s.group.name) + '</a></p>';
    }

    // Store a reference to the store payload on the container so the click handler can use it without another network roundtrip.
    try { el._d8a_store = s; } catch (e) { el._d8a_store = null; }

    ensureRetryListener(el);
    ensureBuyListener(el);
  };

  // Public API: programmatically clear the in-memory store cache for a group
  // and re-run fetch/render for matching #group-store containers on the page.
  // Calling without an argument clears all groups and re-renders all containers.
  window.groupStoreRefresh = function (slug) {
    if (typeof slug === 'string' && slug) {
      try { delete storeFetchCache[slug]; } catch (e) { storeFetchCache[slug] = undefined; }
      // Re-render only containers that resolve to this slug.
      currentContainers().forEach(function (el) { try { if (getGroupForElement(el) === slug) { try { el.removeAttribute('data-d8a-checkout-busy'); } catch (e) {} fetchAndRender(el); } } catch (e) {} });
      return;
    }
    // No slug provided: clear all cached fetches and re-render every container.
    try {
      for (var k in storeFetchCache) {
        if (Object.prototype.hasOwnProperty.call(storeFetchCache, k)) {
          try { delete storeFetchCache[k]; } catch (e) { storeFetchCache[k] = undefined; }
        }
      }
    } catch (e) {}
    currentContainers().forEach(function (el) { try { try { el.removeAttribute('data-d8a-checkout-busy'); } catch (e) {} fetchAndRender(el); } catch (e) {} });
  };

  // Optional MutationObserver: discover #group-store elements added after the
  // script runs and render them on-demand. Feature guarded so pages without
  // MutationObserver aren't affected.
  if (typeof MutationObserver !== 'undefined') {
    try {
      var observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (m) {
          if (!m.addedNodes || !m.addedNodes.length) return;
          for (var i = 0; i < m.addedNodes.length; i++) {
            var node = m.addedNodes[i];
            try {
              // If the added node itself is a matching container, render it.
              if (node.nodeType === 1 && node.matches && node.matches('#group-store')) {
                try { if (!node.getAttribute('aria-live')) node.setAttribute('aria-live', 'polite'); } catch (e) {}
                fetchAndRender(node);
                continue;
              }
              // Otherwise, if it contains matching containers, render each.
              if (node.nodeType === 1 && node.querySelector) {
                var found = node.querySelectorAll('#group-store');
                for (var j = 0; j < found.length; j++) {
                  try { if (!found[j].getAttribute('aria-live')) found[j].setAttribute('aria-live', 'polite'); } catch (e) {}
                  fetchAndRender(found[j]);
                }
              }
            } catch (e) {}
          }
        });
      });
      observer.observe(document.documentElement || document.body || document, { childList: true, subtree: true });
      // Expose the observer only for debugging; it's not needed for normal use.
      try { window.__d8aPaymentsWidgetObserver = observer; } catch (e) {}
    } catch (e) {}
  }

  // Initialize each container by fetching and rendering its store.
  currentContainers().forEach(function (el) {
    fetchAndRender(el);
  });
})();
