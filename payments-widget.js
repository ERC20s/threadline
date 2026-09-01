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

  var els = Array.prototype.slice.call(document.querySelectorAll('#group-store'));

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
  els.forEach(function (el) {
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
  // We'll support verifying a single group (backwards-compatible) and a
  // multi-group verification flow used when a returning buyer comes back
  // with ?d8a_order=<id> on pages that host multiple #group-store containers.
  var verifySingleGroup = function (id, group) {
    try {
      var g = (typeof group === 'string' && String(group).trim()) ? String(group).trim() : GROUP;
      return doFetch(BASE + "/api/v1/store/orders/" + encodeURIComponent(id) + "?group=" + encodeURIComponent(g), null, 10000)
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) { return d && d.paid ? d.order : null; })
        .catch(function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  };

  var verifyAcrossGroups = function (id) {
    // Collect distinct groups found on the page's containers. Always include
    // the legacy GROUP as a fallback so single-container pages keep working.
    var seen = {};
    els.forEach(function (el) {
      try { seen[getGroupForElement(el)] = true; } catch (e) {}
    });
    seen[GROUP] = true;
    var groups = Object.keys(seen);

    // Try each group sequentially, stopping at the first paid order found.
    var chain = Promise.resolve(null);
    var result = null;
    groups.forEach(function (g) {
      chain = chain.then(function () {
        if (result) return result;
        return verifySingleGroup(id, g).then(function (o) {
          if (o) { result = { order: o, group: g }; }
          return result;
        });
      });
    });
    return chain.then(function () { return result; });
  };

  // Expose window.groupStoreVerify(id[, group]): when group is provided it
  // verifies that single group and returns the order (old behaviour). When
  // called without a group it will attempt verification across the groups
  // present on the page and return the order (without exposing the group).
  // For internal callers that need the matching group, use verifyAcrossGroups.
  window.groupStoreVerify = function (id, group) {
    if (typeof group === 'string' && String(group).trim()) return verifySingleGroup(id, group);
    return verifyAcrossGroups(id).then(function (res) { return res ? res.order : null; });
  };

  var back = (location.search.match(/[?&]d8a_order=([A-Za-z0-9_-]+)/) || [])[1];
  if (back) {
    // Use the multi-group flow so pages hosting multiple stores resolve which
    // group the paid order belongs to and insert the receipt only into the
    // matching container(s).
    verifyAcrossGroups(back).then(function (res) {
      if (!res || !res.order) return;
      var o = res.order;
      var matchedGroup = res.group;
      window.groupStorePaid = o;
      els.forEach(function (el) {
        if (!el) return;
        // Only insert the receipt into containers that resolve to the same
        // group that matched the verified order. This avoids showing receipts
        // in containers that represent other groups.
        var localGroup = getGroupForElement(el);
        if (localGroup !== matchedGroup) return;
        // Suppress duplicates: skip if this container already contains a receipt for this order id.
        if (el.querySelector('[data-paid="' + o.id + '"]')) return;
        var p = document.createElement("p");
        p.setAttribute("data-paid", o.id);
        p.setAttribute("role", "status");
        p.style.cssText = "font:13px system-ui,sans-serif;color:#059669";
        p.innerHTML = "Paid: " + esc(o.itemName) + (o.quantity > 1 ? " \u00d7" + o.quantity : "") + " \u2014 order " + esc(o.id);
        // Insert inside the store container so assistive tech hears it as part of the live region.
        try {
          el.insertBefore(p, el.firstChild);
        } catch (e) {
          // Fallback: append if insertBefore isn't available for some reason.
          el.appendChild(p);
        }
      });
      document.dispatchEvent(new CustomEvent("group-store:paid", { detail: o }));
    });
  }

  // Helper: render an error / empty message with a Retry control into a container.
  var renderMessageWithRetry = function (el, htmlMessage) {
    var retryBtn = '<button data-d8a-retry style="margin-left:10px;background:transparent;border:1px solid #e5e7eb;padding:6px 10px;border-radius:6px;color:#111;cursor:pointer">Retry</button>';
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

      // Preserve native browser behaviors: allow modified clicks (Ctrl/Cmd/Shift/Alt)
      // and non-primary mouse buttons (e.button !== 0) to follow the anchor href
      // so users can open links in new tabs/windows as expected.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (typeof e.button !== 'undefined' && e.button !== 0)) {
        // Let the browser handle it; do not intercept.
        return;
      }

      e.preventDefault();

      // Compute quantity defensively: per-link data-quantity overrides container data-default-quantity, otherwise default to 1.
      var itemQ = a.getAttribute('data-quantity');
      var containerQ = el.getAttribute('data-default-quantity');
      var qRaw = typeof itemQ !== 'undefined' && itemQ !== null ? itemQ : (typeof containerQ !== 'undefined' && containerQ !== null ? containerQ : '1');
      var q = parseInt(qRaw, 10);
      if (!isFinite(q) || q < 1) q = 1;

      // UI: show opening state and mark busy on the container so assistive tech knows.
      var prevText = a.textContent;
      try { a.textContent = "Opening\u2026"; } catch (e) {}
      try { el.setAttribute('aria-busy', 'true'); } catch (e) {}

      var localGroup = getGroupForElement(el);

      // Validate the checkout URL before posting. If the checkout URL is not a
      // recognized safe form, skip the POST and fall back to a safe redirect.
      var rawCheckout = s.checkout && s.checkout.url ? s.checkout.url : null;
      var safeCheckout = sanitizeUrl(rawCheckout);
      if (!safeCheckout) {
        try { a.textContent = prevText; } catch (e) {}
        try { el.removeAttribute('aria-busy'); } catch (e) {}
        // Fallback to a safe navigation using the anchor's href.
        try { location.href = a.href; } catch (e) {}
        return;
      }

      // Come back to this page — minus any earlier receipt on the URL.
      var here = location.href.replace(/([?&])d8a_order=[^&#]*&?/, "$1").replace(/[?&](#|$)/, "$1");

      // POST to the checkout endpoint to create a payment session. If that
      // fails we'll gracefully fall back to redirecting to the anchor's href.
      var body = JSON.stringify({ group: localGroup, item: a.getAttribute('data-item'), quantity: q, returnUrl: here });
      doFetch(s.checkout.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body }, 10000)
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          try {
            if (d && d.url) { location.href = d.url; }
            else { location.href = a.href; }
          } catch (e) {
            try { location.href = a.href; } catch (e) {}
          }
        })
        .catch(function () {
          try { location.href = a.href; } catch (e) {}
        })
        .finally(function () {
          try { a.textContent = prevText; } catch (e) {}
          try { el.removeAttribute('aria-busy'); } catch (e) {}
        });
    });
    el.setAttribute('data-d8a-listener', '1');
  };

  // Fetch the store for a given group and render it into the provided container.
  var fetchAndRender = function (el) {
    if (!el) return;
    var group = getGroupForElement(el);
    try { el.setAttribute('aria-busy', 'true'); } catch (e) {}

    var p = storeFetchCache[group];
    if (!p) {
      p = doFetch(BASE + "/api/v1/store/items?group=" + encodeURIComponent(group), null, 10000)
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; });
      storeFetchCache[group] = p;
    }

    p.then(function (s) {
      try { el.removeAttribute('aria-busy'); } catch (e) {}
      if (!el) return;
      if (!s || !s.items) {
        renderMessageWithRetry(el, '<p style="font:13px system-ui,sans-serif;color:#9ca3af">Failed to load store.</p>');
        ensureRetryListener(el);
        return;
      }
      el._d8a_store = s;
      if (!s.items.length) {
        el.innerHTML = '<p style="font:13px system-ui,sans-serif;color:#9ca3af">Nothing for sale right now.</p>';
        return;
      }
      el.innerHTML = s.items.map(function (it) {
        return '<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid #e5e7eb;font:14px system-ui,sans-serif">' +
          '<div style="flex:1"><b>' + esc(it.name) + '</b>' +
          (it.description ? '<div style="font-size:12px;color:#6b7280">' + esc(it.description) + '</div>' : '') + '</div>' +
          '<span>' + esc(it.price) + '</span>' +
          '<a href="' + esc(it.payUrl) + '" data-item="' + esc(it.id) + '" style="background:#7c5cff;color:#fff;border-radius:999px;padding:6px 14px;text-decoration:none">Buy</a></div>';
      }).join("") + '<p style="font:11px system-ui,sans-serif;color:#9ca3af">Sold by <a href="' + esc(s.group.url) + '" style="color:#7c5cff">' + esc(s.group.name) + '</a></p>';

      // Attach listeners for Buy and Retry now that the markup is present.
      ensureBuyListener(el);
      ensureRetryListener(el);
    }).catch(function () {
      try { el.removeAttribute('aria-busy'); } catch (e) {}
      renderMessageWithRetry(el, '<p style="font:13px system-ui,sans-serif;color:#9ca3af">Failed to load store.</p>');
      ensureRetryListener(el);
    });
  };

  // Initialize every container on the page.
  els.forEach(function (el) {
    try { fetchAndRender(el); } catch (e) {}
  });

})();
