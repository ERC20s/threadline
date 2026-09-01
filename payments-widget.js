(function () {
  // Idempotent guard: if the widget has already initialized, stop.
  if (window.__d8aPaymentsWidgetInstalled) return;
  window.__d8aPaymentsWidgetInstalled = true;

  var BASE = "https://d8a.com";
  var GROUP = "batch-threadline";
  var esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; });
  };

  var els = Array.prototype.slice.call(document.querySelectorAll('#group-store'));

  // Ensure each container is an aria-live region before we do anything.
  els.forEach(function (el) {
    if (!el.getAttribute('aria-live')) el.setAttribute('aria-live', 'polite');
  });

  // The handshake: an order id is only proof once the platform says so.
  var verify = function (id) {
    return fetch(BASE + "/api/v1/store/orders/" + encodeURIComponent(id) + "?group=" + encodeURIComponent(GROUP))
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

  // Before loading items mark the containers busy and ensure aria-live is present.
  if (els.length) els.forEach(function (el) { el.setAttribute('aria-live', el.getAttribute('aria-live') || 'polite'); el.setAttribute('aria-busy', 'true'); });

  // Load items, render widget into every matching container. If the network or API fails, show a friendly message.
  fetch(BASE + "/api/v1/store/items?group=" + encodeURIComponent(GROUP))
    .then(function (r) { return r.json(); })
    .then(function (s) {
      // We deliberately do not early-return here without allowing the final step to clear aria-busy.
      if (!els.length) return s;
      els.forEach(function (el) {
        if (!s || !s.items) {
          el.innerHTML = '<p style="font:13px system-ui,sans-serif;color:#9ca3af">Unable to load store right now.</p>';
          return;
        }
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

        // Avoid attaching the listener multiple times to the same element in case this file is executed more than once in contexts
        // where the guard might not apply; mark attached containers.
        if (!el.getAttribute('data-d8a-listener')) {
          el.addEventListener("click", function (e) {
            var a = e.target && e.target.closest ? e.target.closest("a[data-item]") : null;
            if (!a || !s.checkout.enabled) return;
            e.preventDefault();
            a.textContent = "Opening\u2026";
            // Come back to this page — minus any earlier receipt on the URL.
            var here = location.href.replace(/([?&])d8a_order=[^&#]*&?/, "$1").replace(/[?&](#|$)/, "$1");
            fetch(s.checkout.url, { method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ group: GROUP, item: a.getAttribute("data-item"), quantity: 1, returnUrl: here }) })
              .then(function (r) { return r.json(); })
              .then(function (d) { if (d.url) { location.href = d.url; } else { a.textContent = "Buy"; location.href = a.href; } })
              .catch(function () { location.href = a.href; });
          });
          el.setAttribute('data-d8a-listener', '1');
        }
      });
      return s;
    })
    .catch(function () {
      if (els.length) els.forEach(function (el) { el.innerHTML = '<p style="font:13px system-ui,sans-serif;color:#9ca3af">Unable to load store right now.</p>'; });
    })
    .then(function () {
      // Always clear aria-busy on every code path after the fetch completes.
      if (els.length) els.forEach(function (el) { try { el.removeAttribute('aria-busy'); } catch (e) {} });
    });
})();
