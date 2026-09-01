(function () {
  // Idempotent guard: if the widget has already initialized, stop.
  if (window.__d8aPaymentsWidgetInstalled) return;
  window.__d8aPaymentsWidgetInstalled = true;

  var BASE = "https://d8a.com";
  var GROUP = "batch-threadline";
  var esc = function (s) {
    return String(s).replace(/[&<>\"']/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; });
  };

  // Promise cache for store item fetches keyed by GROUP. Stored on window so
  // multiple widget instances or re-initializations share the same cache.
  window.__d8aPaymentsWidgetStoreCache = window.__d8aPaymentsWidgetStoreCache || {};
  var storeFetchCache = window.__d8aPaymentsWidgetStoreCache;

  var els = Array.prototype.slice.call(document.querySelectorAll('#group-store'));

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
  var verify = function (id) {
    return doFetch(BASE + "/api/v1/store/orders/" + encodeURIComponent(id) + "?group=" + encodeURIComponent(GROUP), null, 10000)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { return d && d.paid ? d.order : null; })
      .catch(function () { return null; });
  };
  window.groupStoreVerify = verify;

  var back = (location.search.match(/[?&]d8a_order=([A-Za-z0-9_-]+)/) || [])[1];
  if (back) verify(back).then(function (o) {
    if (!o) return;
    window.groupStorePaid = o;
    els.forEach(function (el) {
      if (!el) return;
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

      // Use doFetch for the checkout POST so a hung request won't leave the UI stuck
      // and so environments without fetch still work.
      doFetch(s.checkout.url, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group: GROUP, item: a.getAttribute("data-item"), quantity: q, returnUrl: location.href.replace(/([?&])d8a_order=[^&#]*&?/, "$1").replace(/[?&](#|$)/, "$1") }) }, 10000)
        .then(function (r) {
          // Try to parse JSON; if that fails, fall back to redirecting to the anchor href.
          return r.json ? r.json() : Promise.resolve(null);
        })
        .then(function (d) {
          if (d && d.url) {
            location.href = d.url;
          } else {
            try { a.textContent = prevText || "Buy"; } catch (e) {}
            location.href = a.href;
          }
        })
        .catch(function () {
          try { a.textContent = prevText || "Buy"; } catch (e) {}
          location.href = a.href;
        })
        .finally(function () {
          // Always clear busy state on the container when the flow finishes (if the page hasn't navigated away).
          try { el.removeAttribute('aria-busy'); } catch (e) {}
        });
    });
    el.setAttribute('data-d8a-listener', '1');
  };

  // Fetch and render only for a specific container.
  var fetchAndRender = function (el) {
    try { el.setAttribute('aria-live', el.getAttribute('aria-live') || 'polite'); } catch (e) {}
    try { el.setAttribute('aria-busy', 'true'); } catch (e) {}
    // Show a small loading message so users know something is happening.
    try {
      // Create a <p> element and set its textContent to avoid inserting control characters via innerHTML.
      var p = document.createElement('p');
      p.style.cssText = "font:13px system-ui,sans-serif;color:#9ca3af";
      p.textContent = 'Loading store\u2026';
      // Clear the container and insert the loading node.
      el.innerHTML = '';
      try { el.insertBefore(p, el.firstChild); } catch (e) { el.appendChild(p); }
    } catch (e) {
      // Fallback: if DOM creation fails, use a safe innerHTML literal with the ellipsis.
      el.innerHTML = '<p style="font:13px system-ui,sans-serif;color:#9ca3af">Loading store\u2026</p>';
    }

    // Use a shared in-memory promise cache so multiple containers reuse the same
    // in-flight request and avoid duplicate network traffic.
    var cacheKey = GROUP;
    var fetchPromise = storeFetchCache[cacheKey];
    if (!fetchPromise) {
      fetchPromise = doFetch(BASE + "/api/v1/store/items?group=" + encodeURIComponent(GROUP))
        .then(function (r) { return r.json(); });
      storeFetchCache[cacheKey] = fetchPromise;
    }

    fetchPromise.then(function (s) {
      // Store the fetched data on the element for the buy handler to use.
      el._d8a_store = s;
      if (!s || !s.items) {
        renderMessageWithRetry(el, '<p style="font:13px system-ui,sans-serif;color:#9ca3af">Unable to load store right now. <a href="' + esc(BASE + '/g/' + GROUP) + '" target="_blank" rel="noopener noreferrer" style="color:#7c5cff">Visit the storefront</a></p>');
        ensureRetryListener(el);
        ensureBuyListener(el);
        return;
      }
      if (!s.items.length) {
        renderMessageWithRetry(el, '<p style="font:13px system-ui,sans-serif;color:#9ca3af">Nothing for sale right now. <a href="' + esc(BASE + '/g/' + GROUP) + '" target="_blank" rel="noopener noreferrer" style="color:#7c5cff">Visit the storefront</a></p>');
        ensureRetryListener(el);
        ensureBuyListener(el);
        return;
      }

      el.innerHTML = s.items.map(function (it) {
        return '<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid #e5e7eb;font:14px system-ui,sans-serif">' +
          '<div style="flex:1"><b>' + esc(it.name) + '</b>' +
          (it.description ? '<div style="font-size:12px;color:#6b7280">' + esc(it.description) + '</div>' : '') + '</div>' +
          '<span>' + esc(it.price) + '</span>' +
          '<a href="' + esc(it.payUrl) + '" data-item="' + esc(it.id) + '" aria-label="' + esc('Buy ' + it.name + ' for ' + it.price) + '" role="button" style="background:#7c5cff;color:#fff;border-radius:999px;padding:6px 14px;text-decoration:none">Buy</a></div>';
      }).join('') + '<p style="font:11px system-ui,sans-serif;color:#9ca3af">Sold by <a href="' + esc(s.group.url) + '" style="color:#7c5cff">' + esc(s.group.name) + '</a></p>';

      ensureBuyListener(el);
      ensureRetryListener(el);
    }).catch(function () {
      // Clear the cached promise on failure so a subsequent Retry gets a fresh attempt.
      try { delete storeFetchCache[cacheKey]; } catch (e) { storeFetchCache[cacheKey] = undefined; }
      renderMessageWithRetry(el, '<p style="font:13px system-ui,sans-serif;color:#9ca3af">Unable to load store right now. <a href="' + esc(BASE + '/g/' + GROUP) + '" target="_blank" rel="noopener noreferrer" style="color:#7c5cff">Visit the storefront</a></p>');
      ensureRetryListener(el);
      ensureBuyListener(el);
    }).finally(function () {
      try { el.removeAttribute('aria-busy'); } catch (e) {}
    });
  };

  // Initialize each container by fetching and rendering its store.
  els.forEach(function (el) {
    fetchAndRender(el);
  });
})();
