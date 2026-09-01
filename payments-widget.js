(function () {
  // Idempotent guard: if the widget has already initialized, stop.
  if (window.__d8aPaymentsWidgetInstalled) return;
  window.__d8aPaymentsWidgetInstalled = true;

  var BASE = "https://d8a.com";
  var GROUP = "batch-threadline";
  var esc = function (s) {
    return String(s).replace(/[&<>\"']/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; });
  };

  var els = Array.prototype.slice.call(document.querySelectorAll('#group-store'));

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
      // Ensure the container is an aria-live region so announcements are made.
      if (!el.hasAttribute('aria-live')) el.setAttribute('aria-live', 'polite');
      // Skip if we've already shown this paid message inside this container.
      if (el.querySelector('[data-paid="' + o.id + '"]')) return;
      var p = document.createElement("p");
      p.setAttribute("data-paid", o.id);
      // role=status helps some ATs treat the content as an assertion inside the live region.
      p.setAttribute('role', 'status');
      p.style.cssText = "font:13px system-ui,sans-serif;color:#059669";
      p.innerHTML = "Paid: " + esc(o.itemName) + (o.quantity > 1 ? " \u00d7" + o.quantity : "") + " \u2014 order " + esc(o.id);
      // Insert inside the live region so it is announced; add to the start so it is visible above the items.
      try { el.insertBefore(p, el.firstChild); } catch (e) { el.appendChild(p); }
    });
    document.dispatchEvent(new CustomEvent("group-store:paid", { detail: o }));
  });

  // Load items, render widget into every matching container. If the network or API fails, show a friendly message.
  // Mark containers busy while fetching so assistive tech knows content is loading.
  if (els.length) els.forEach(function (el) { if (!el.hasAttribute('aria-live')) el.setAttribute('aria-live', 'polite'); el.setAttribute('aria-busy', 'true'); });

  fetch(BASE + "/api/v1/store/items?group=" + encodeURIComponent(GROUP))
    .then(function (r) { return r.json(); })
    .then(function (s) {
      if (!els.length || !s.items) return;
      els.forEach(function (el) {
        if (!s.items.length) {
          el.innerHTML = '<p style="font:13px system-ui,sans-serif;color:#9ca3af">Nothing for sale right now.</p>';
          el.removeAttribute('aria-busy');
          return;
        }
        el.innerHTML = s.items.map(function (it) {
          return '<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid #e5e7eb;font:14px system-ui,sans-serif">' +
            '<div style="flex:1"><b>' + esc(it.name) + '</b>' +
            (it.description ? '<div style="font-size:12px;color:#6b7280">' + esc(it.description) + '</div>' : '') + '</div>' +
            '<span>' + esc(it.price) + '</span>' +
            '<a href="' + esc(it.payUrl) + '" data-item="' + esc(it.id) + '" style="background:#7c5cff;color:#fff;border-radius:999px;padding:6px 14px;text-decoration:none">Buy</a></div>';
        }).join("") + '<p style="font:11px system-ui,sans-serif;color:#9ca3af">Sold by <a href="' + esc(s.group.url) + '" style="color:#7c5cff">' + esc(s.group.name) + '</a></p>';

        // Clear busy now that we've rendered.
        el.removeAttribute('aria-busy');

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
    })
    .catch(function () {
      if (els.length) els.forEach(function (el) {
        el.innerHTML = '<p style="font:13px system-ui,sans-serif;color:#9ca3af">Unable to load store right now.</p>';
        el.removeAttribute('aria-busy');
      });
    });
})();
