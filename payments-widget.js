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

  // Helper: return a per-container base URL for a given group slug when one is
  // declared on any #group-store element that resolves to that group. The value
  // is validated with sanitizeUrl and trimmed of a trailing slash. If nothing
  // suitable is found, fall back to the global BASE constant.
  var getBaseForGroup = function (group) {
    try {
      var cs = currentContainers();
      for (var i = 0; i < cs.length; i++) {
        var el = cs[i];
        try {
          var g = getGroupForElement(el);
          if (g !== group) continue;
          var raw = el.getAttribute && el.getAttribute('data-d8a-base') ? el.getAttribute('data-d8a-base') : null;
          var s = sanitizeUrl(raw);
          if (!s) return BASE;
          // Trim trailing slash for consistent concatenation
          return s.replace(/\/$/, '');
        } catch (e) { continue; }
      }
    } catch (e) {}
    return BASE;
  };

  // Promise cache for store item fetches keyed by group slug. Stored on window so
  // multiple widget instances or re-initializations share the same cache.
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
  // New: support multi-group verification. Expose window.groupStoreVerify(id[, group]).
  var verifySingle = function (id, group) {
    var g;
    try { g = group && String(group).trim() ? String(group).trim() : GROUP; } catch (e) { g = GROUP; }
    var base = getBaseForGroup(g);
    return doFetch(base + "/api/v1/store/orders/" + encodeURIComponent(id) + "?group=" + encodeURIComponent(g), null, 10000)
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
      // Clear the shared in-memory store fetch cache for this container's group so Retr
    });
    el.setAttribute('data-d8a-retry-listener', '1');
  };

  // Attach buy listener and make sure only one checkout per item is opened per group.
  var ensureBuyListener = function (el) {
    if (!el || el.getAttribute('data-d8a-listener')) return;
    el.addEventListener('click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a[data-item]') : null;
      if (!a) return;
      e.preventDefault();
      var group = getGroupForElement(el);
      var item = a.getAttribute('data-item');
      if (!item) return;

      // If a checkout for this item in this group is already in progress, ignore.
      var key = group + '::' + item;
      if (globalOpening[key]) return;
      globalOpening[key] = true;

      // Post the checkout request. The post helper uses the same base resolution
      // as fetchStoreForGroup so extra fields and the checkout url are sent to
      // the per-container platform when present.
      var post = function (body) {
        var base = getBaseForGroup(group);
        return doFetch(base + "/api/v1/store/checkout", { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 10000)
          .then(function (r) { return r.ok ? r.json() : null; });
      };

      var release = function () { try { delete globalOpening[key]; } catch (e) { globalOpening[key] = null; } };

      var fallback = function () { try { var href = a.getAttribute('href'); if (href) location.href = href; } catch (e) {}; };

      var store = el.__d8a_store || null;
      var hasExtras = store && store.group && store.group.checkoutRequires && store.group.checkoutRequires.length;

      var plainBody = { id: item, group: group };
      var body = Object.assign({}, plainBody);
      try {
        if (hasExtras && store && store.group && store.group.meta) {
          body.meta = store.group.meta;
        }
        if (el && el.getAttribute && el.getAttribute('data-default-quantity')) {
          var q = parseInt(el.getAttribute('data-default-quantity'), 10);
          if (!isNaN(q) && q > 0) body.quantity = q;
        }
      } catch (e) {}

      // Attempt the POST and follow the returned redirect to the platform when provided.
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

  // Fetch the store data (items, checkout, group) for a given group slug. Use the shared cache so parallel containers dedupe network traffic.
  var fetchStoreForGroup = function (group) {
    try { group = String(group).trim(); } catch (e) { group = GROUP; }
    if (storeFetchCache[group]) return storeFetchCache[group];
    var base = getBaseForGroup(group);
    var p = doFetch(base + "/api/v1/store/items?group=" + encodeURIComponent(group), null, 10000)
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
    storeFetchCache[group] = p;
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

    var promise = fetchStoreForGroup(group);
    promise.then(function (s) {
      if (!s) {
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
