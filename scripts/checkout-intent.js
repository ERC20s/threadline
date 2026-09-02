/* scripts/checkout-intent.js — queue a Buy click until the shop panel is ready.
 *
 * payments-widget.js fills #group-store only after its items request comes
 * back (a 10 second fetch timeout inside the widget). A shopper who clicks Buy
 * in those first seconds used to be told the piece "isn't listed in the shop
 * panel yet" — when it is, it just had not rendered.
 *
 * This file adds a small waiting helper on the shared window.Threadline
 * namespace (created by scripts/products.js; created here too so the helper can
 * be loaded on its own, e.g. from tests/payments-widget.test.html):
 *
 *   Threadline.findBuyAnchor(container, matchFn)          -> anchor | null
 *   Threadline.storePanelFailed(container)                -> boolean
 *   Threadline.whenBuyAnchor(container, matchFn, timeout) -> Promise<anchor>
 *   Threadline.buyRowPrice(anchor)                        -> string ("" if none)
 *   Threadline.samePrice(a, b)                            -> boolean
 *   Threadline.shopPriceIndex(container)                  -> index (see below)
 *   Threadline.reconcileGrid(grid, index, options)        -> unlisted count
 *   Threadline.productForAnchor(anchor)                   -> catalogue product | null
 *   Threadline.needsSize(product)                         -> boolean
 *   Threadline.resolveSize(product, requested)            -> size ("" if none)
 *   Threadline.guardBuyClicks(container, decide)          -> dispose()
 *
 * whenBuyAnchor resolves with the first matching `a[data-item]` already inside
 * the container, otherwise it watches the container (MutationObserver, with a
 * polling fallback) and resolves as soon as one appears. It rejects with
 * "store-error" when the widget has drawn its failure line (the Retry control)
 * and with "timeout" when neither happens in time.
 *
 * Called with no matchFn — findBuyAnchor(container) or
 * whenBuyAnchor(container, null, timeout) — the answer means only "the panel
 * has rendered its rows". That is how product.html tells "the shop is loaded
 * but does not sell this piece" (rows, no match) apart from "the shop has not
 * answered yet" (no rows at all), which is the case #113/#114 must keep
 * queueing.
 *
 * buyRowPrice reads the price the shop itself is showing for a row.
 * payments-widget.js builds every row as
 *
 *   div > [ div(b name, div description), span(price), a[data-item] ]
 *
 * so the price is the Buy anchor's previous element sibling; if that is ever
 * reshuffled we fall back to the first <span> in the row. The text is returned
 * exactly as the platform sent it (whitespace collapsed) — no parsing, no
 * currency guessing.
 *
 * samePrice is the tolerant compare a page needs before repainting its own
 * price: "$38", "38", "$38.00" are the same money, "$38" and "€38" are not.
 *
 * shopPriceIndex(container) reads every rendered row once and returns
 *
 *   { size, rows: [ { anchor, id, name, price } ],
 *     byId: {…}, byName: {…},
 *     lookup(id, name) -> row | null,
 *     priceFor(id, name) -> string ("" when unmatched or priceless) }
 *
 * keyed on the normalised platform item id and on the normalised row title
 * (the row's <b>). products.html builds it once when the panel has rendered and
 * repaints the whole grid from it: id first, name only as a fallback, and no
 * match at all means "not in the shop yet". A container with no rows gives
 * size 0, which callers must read as "the shop said nothing" — never as
 * "nothing is on sale".
 *
 * reconcileGrid(grid, index, options) is the other half of that pass: it walks
 * the cards scripts/products.js rendered (a.card, each stamped with
 * data-product-id) and makes each one agree with the index —
 *
 *   - a shop row whose price really differs from the card's .price repaints the
 *     .price and adds the note "Price from the group shop.";
 *   - a card the shop has no row for gets "Not in the shop yet." and counts
 *     towards the returned number;
 *   - a card that already agrees loses any note it was carrying.
 *
 * It returns the number of unlisted cards, so a page can say "2 are not in the
 * shop yet" in its own status line. An index of size 0 (or no index at all)
 * means the shop has not spoken: the grid is left exactly as written and the
 * answer is 0. The card link itself is never disabled — the product page and
 * the shop panel are both still reachable. index.html and products.html both
 * call this, so there is one implementation of "reconcile a grid".
 *
 * productForAnchor maps a rendered widget row back to an entry in the catalogue
 * (scripts/products.js, window.Threadline.products): the normalised platform
 * item id first, the normalised row title second — the same two keys
 * shopPriceIndex and product.html already match on. No catalogue loaded, or no
 * entry for the row, gives null, which every caller must read as "not ours to
 * touch".
 *
 * guardBuyClicks(container, decide) is the sized-garment guard. payments-widget
 * .js listens for Buy clicks on the container in the bubbling phase; this
 * attaches a listener on the same container in the CAPTURE phase, so it sees
 * the click first. For every plain left-click on an a[data-item] it calls
 *
 *   decide({ anchor, product, needsSize, event }) -> truthy to stop the click
 *
 * and, when the answer is truthy, calls preventDefault() plus stopPropagation()
 * — which ends the dispatch before the widget's own bubble listener runs, so no
 * checkout is posted and the anchor's href is not followed. Modified clicks
 * (ctrl/cmd/shift/alt, a non-primary button) and target="_blank" rows are
 * passed through untouched, exactly as the widget passes them through. It
 * returns a dispose() that detaches the guard again.
 *
 * resolveSize(product, requested) is the gate on ?size=. The value on the URL is
 * shopper input and used to be trusted as written, so product.html?id=classic-
 * cap&size=XL gave a one-size piece the size XL and Buy stamped it onto the
 * checkout row. The helper answers with a size from product.sizes or with "":
 *
 *   - a piece made in one size always resolves to that size, whatever was
 *     asked, so nothing can override "One size";
 *   - otherwise the request is matched against product.sizes through the same
 *     normaliseKey ids and titles are compared on, so "m" and " M " resolve to
 *     the catalogue's "M";
 *   - anything the piece is not made in — "XXL", junk, empty, no catalogue
 *     entry at all — resolves to "", which callers must read as "no size chosen
 *     yet", the state in which Buy already refuses to open checkout.
 *
 * It never posts to checkout itself: the caller clicks the widget's own Buy
 * link, so payments-widget.js keeps ownership of the checkout POST and of its
 * duplicate-checkout guard.
 */
(function (global) {
  "use strict";

  var ns = global.Threadline = global.Threadline || {};

  /* Matches the widget's own 10s items timeout with a little headroom. */
  var DEFAULT_TIMEOUT = 12000;

  var anchorsIn = function (container) {
    if (!container || !container.querySelectorAll) return [];
    try {
      return Array.prototype.slice.call(container.querySelectorAll("a[data-item]"));
    } catch (e) { return []; }
  };

  /* First anchor in `container` for which matchFn returns true. No matchFn
     means "any Buy link". A throwing matchFn skips that anchor rather than
     breaking the whole search. */
  var findBuyAnchor = function (container, matchFn) {
    var list = anchorsIn(container);
    for (var i = 0; i < list.length; i++) {
      try {
        if (!matchFn || matchFn(list[i])) return list[i];
      } catch (e) {}
    }
    return null;
  };

  /* payments-widget.js draws its failure line with a [data-d8a-retry] button;
     that is the one reliable signal that this load is not going to produce
     anchors, so we stop waiting instead of sitting out the full timeout. */
  var storePanelFailed = function (container) {
    try {
      return !!(container && container.querySelector && container.querySelector("[data-d8a-retry]"));
    } catch (e) { return false; }
  };

  /* The price text the shop panel is showing next to this Buy link. Returns ""
     when there is no anchor or no price cell — callers treat "" as "the shop
     said nothing", i.e. leave the page's own price alone. */
  var buyRowPrice = function (anchor) {
    if (!anchor) return "";
    var cell = null;
    try {
      cell = anchor.previousElementSibling || null;
      if (!cell || !cell.textContent) {
        var row = anchor.parentNode;
        cell = (row && row.querySelector) ? row.querySelector("span") : null;
      }
    } catch (e) { cell = null; }
    var text = (cell && cell.textContent) ? cell.textContent : "";
    return String(text).replace(/\s+/g, " ").trim();
  };

  /* "$38" vs "$38.00" vs "38" is the same money. Only a real difference is
     worth repainting a price the page already shows. Two prices that carry
     different currency marks are never "the same"; a price with no mark at all
     is compared on the number only. */
  var samePrice = function (a, b) {
    var x = String(a || "").replace(/\s+/g, "").toLowerCase();
    var y = String(b || "").replace(/\s+/g, "").toLowerCase();
    if (x === y) return true;
    var nx = (x.match(/-?\d+(\.\d+)?/) || [])[0];
    var ny = (y.match(/-?\d+(\.\d+)?/) || [])[0];
    if (nx === undefined || ny === undefined) return false;
    var cx = x.replace(/[\d.,\s]/g, ""), cy = y.replace(/[\d.,\s]/g, "");
    return Number(nx) === Number(ny) && (!cx || !cy || cx === cy);
  };

  /* Ids and names are compared the way product.html compares them: case and
     punctuation are noise ("Everyday Tee" === "everyday-tee"). */
  var normaliseKey = function (s) {
    return String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]+/g, "");
  };

  /* The row title payments-widget.js renders as <b> next to the Buy link. */
  var buyRowName = function (anchor) {
    try {
      var row = anchor ? anchor.parentNode : null;
      var label = (row && row.querySelector) ? row.querySelector("b") : null;
      var text = (label && label.textContent) ? label.textContent : "";
      return String(text).replace(/\s+/g, " ").trim();
    } catch (e) { return ""; }
  };

  /* One pass over the panel's rendered rows -> a lookup a whole grid can be
     repainted from without searching the DOM per card. */
  var shopPriceIndex = function (container) {
    var list = anchorsIn(container);
    var rows = [];
    var byId = {};
    var byName = {};

    for (var i = 0; i < list.length; i++) {
      var anchor = list[i];
      var entry = {
        anchor: anchor,
        id: anchor.getAttribute ? (anchor.getAttribute("data-item") || "") : "",
        name: buyRowName(anchor),
        price: buyRowPrice(anchor)
      };
      rows.push(entry);
      var idKey = normaliseKey(entry.id);
      if (idKey && !byId[idKey]) byId[idKey] = entry;
      var nameKey = normaliseKey(entry.name);
      /* First row wins: two rows sharing a title must not make a page flip
         between two prices on re-render. */
      if (nameKey && !byName[nameKey]) byName[nameKey] = entry;
    }

    var lookup = function (id, name) {
      var idKey = normaliseKey(id);
      if (idKey && byId[idKey]) return byId[idKey];
      var nameKey = normaliseKey(name);
      if (nameKey && byName[nameKey]) return byName[nameKey];
      return null;
    };

    return {
      size: rows.length,
      rows: rows,
      byId: byId,
      byName: byName,
      lookup: lookup,
      priceFor: function (id, name) {
        var hit = lookup(id, name);
        return hit ? hit.price : "";
      }
    };
  };

  /* ---- repainting a rendered grid from that index -------------------------
     Lifted verbatim from the paintCard/paintGrid/setNote block that used to
     live inline in products.html, so index.html can do the same thing without
     a second copy. */

  var PRICE_NOTE = "Price from the group shop.";
  var UNLISTED_NOTE = "Not in the shop yet.";

  /* One soft line under a card. Empty text removes the line again, so a card
     that stops disagreeing with the shop stops carrying a note. */
  var setCardNote = function (cardEl, text) {
    if (!cardEl || !cardEl.querySelector) return;
    var body = cardEl.querySelector(".card-body") || cardEl;
    var note = cardEl.querySelector("[data-shop-note]");
    if (!text) {
      if (note && note.parentNode) note.parentNode.removeChild(note);
      return;
    }
    if (!note) {
      note = document.createElement("p");
      note.className = "hint";
      note.setAttribute("data-shop-note", "");
      body.appendChild(note);
    }
    note.textContent = text;
  };

  /* The catalogue entry a rendered card stands for. scripts/products.js stamps
     every card with data-product-id, so ns.byId is the direct answer; when the
     catalogue is not loaded (the test page loads this file on its own) we fall
     back to the id on the card plus the title it is showing, which is all
     index.lookup needs. */
  var cardProduct = function (cardEl) {
    var id = "";
    try {
      id = (cardEl.dataset && cardEl.dataset.productId) ||
        (cardEl.getAttribute ? (cardEl.getAttribute("data-product-id") || "") : "");
    } catch (e) { id = ""; }
    if (!id) return null;
    if (typeof ns.byId === "function") {
      var hit = ns.byId(id);
      if (hit) return hit;
    }
    var label = cardEl.querySelector ? cardEl.querySelector(".name") : null;
    var name = (label && label.textContent) ? String(label.textContent).replace(/\s+/g, " ").trim() : "";
    return { id: id, name: name };
  };

  /* true when this card is not sold by the shop at all. */
  var reconcileCard = function (cardEl, index, opts) {
    var product = cardProduct(cardEl);
    if (!product) return false;
    var row = index.lookup(product.id, product.name);
    var priceEl = cardEl.querySelector ? cardEl.querySelector(".price") : null;

    if (!row) {
      setCardNote(cardEl, opts.unlistedNote);
      return true;
    }
    if (priceEl && row.price && !samePrice(row.price, priceEl.textContent)) {
      priceEl.textContent = row.price;
      setCardNote(cardEl, opts.priceNote);
    } else {
      setCardNote(cardEl, "");
    }
    return false;
  };

  var reconcileGrid = function (grid, index, options) {
    if (!grid || !grid.querySelectorAll) return 0;
    /* No index, or a panel that rendered nothing, means "the shop said
       nothing" — never "nothing is on sale". Leave the grid as written. */
    if (!index || !index.size || typeof index.lookup !== "function") return 0;

    var settings = options || {};
    var opts = {
      priceNote: settings.priceNote || PRICE_NOTE,
      unlistedNote: settings.unlistedNote || UNLISTED_NOTE
    };

    var cards = [];
    try {
      cards = Array.prototype.slice.call(grid.querySelectorAll(settings.cardSelector || ".card"));
    } catch (e) { cards = []; }

    var unlisted = 0;
    for (var i = 0; i < cards.length; i++) {
      try {
        if (reconcileCard(cards[i], index, opts)) unlisted++;
      } catch (e) {}
    }
    return unlisted;
  };

  /* ---- the sized-garment guard -------------------------------------------
     The shop panel sells a platform item; the catalogue knows whether that
     item is a garment that has to be ordered in a size. These three pieces
     join the two so a page can stop a sizeless checkout before it starts. */

  /* The catalogue entry this widget row is selling, or null. Read from
     ns.products at call time, so it works whether scripts/products.js loaded
     before this file or not at all (tests load this file on its own). */
  var productForAnchor = function (anchor) {
    var list = ns.products;
    if (!anchor || !list || !list.length) return null;

    var idKey = normaliseKey(anchor.getAttribute ? anchor.getAttribute("data-item") : "");
    var nameKey = normaliseKey(buyRowName(anchor));
    var nameHit = null;

    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p) continue;
      /* Id wins outright; a title match is only the fallback, and only the
         first one, so two pieces sharing a name cannot flip the answer. */
      if (idKey && normaliseKey(p.id) === idKey) return p;
      if (!nameHit && nameKey && normaliseKey(p.name) === nameKey) nameHit = p;
    }
    return nameHit;
  };

  /* A piece with one size (Classic Cap, Lambswool Scarf: ONE_SIZE) can be
     bought straight from the panel; anything with a real size range cannot. */
  var needsSize = function (product) {
    return !!(product && product.sizes && product.sizes.length > 1);
  };

  /* The size a page may actually use for `product`, given whatever a URL asked
     for. One size in the catalogue wins outright; otherwise only a size the
     piece is really made in comes back, matched case- and punctuation-blind.
     "" means "no size chosen" — never "use what was asked". */
  var resolveSize = function (product, requested) {
    var sizes = (product && product.sizes && product.sizes.length) ? product.sizes : null;
    if (!sizes) return "";
    if (sizes.length === 1) return sizes[0];

    var key = normaliseKey(requested);
    if (!key) return "";
    for (var i = 0; i < sizes.length; i++) {
      if (normaliseKey(sizes[i]) === key) return sizes[i];
    }
    return "";
  };

  /* Only ordinary left-clicks are ours: a ctrl/cmd/shift/alt click or a middle
     click is the shopper opening the row in a tab, which the widget also lets
     through. An event something else already handled is left alone too. */
  var isPlainClick = function (e) {
    if (!e || e.defaultPrevented) return false;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
    if (typeof e.button === "number" && e.button !== 0) return false;
    return true;
  };

  var guardBuyClicks = function (container, decide) {
    var noop = function () {};
    if (!container || !container.addEventListener || typeof decide !== "function") return noop;
    /* One guard per container: a second call would ask twice and could stop a
       click the first guard already let through. */
    if (container.getAttribute && container.getAttribute("data-threadline-buy-guard")) return noop;

    var onClick = function (e) {
      var anchor = null;
      try {
        anchor = (e.target && e.target.closest) ? e.target.closest("a[data-item]") : null;
      } catch (err) { anchor = null; }
      if (!anchor) return;
      if (container.contains && !container.contains(anchor)) return;
      if (anchor.getAttribute && anchor.getAttribute("target") === "_blank") return;
      if (!isPlainClick(e)) return;

      var product = productForAnchor(anchor);
      var stop = false;
      try {
        stop = !!decide({
          anchor: anchor,
          product: product,
          needsSize: needsSize(product),
          event: e
        });
      } catch (err) { stop = false; }
      if (!stop) return;

      /* preventDefault stops the href being followed; stopPropagation ends the
         dispatch here, before payments-widget.js's bubble listener on this same
         container can post a checkout. stopImmediatePropagation is deliberately
         not used: other capture listeners on the page are none of our business. */
      if (e.preventDefault) e.preventDefault();
      if (e.stopPropagation) e.stopPropagation();
    };

    container.addEventListener("click", onClick, true);
    if (container.setAttribute) container.setAttribute("data-threadline-buy-guard", "1");

    return function dispose() {
      try { container.removeEventListener("click", onClick, true); } catch (err) {}
      try { if (container.removeAttribute) container.removeAttribute("data-threadline-buy-guard"); } catch (err) {}
    };
  };

  var whenBuyAnchor = function (container, matchFn, timeoutMs) {
    var limit = (typeof timeoutMs === "number" && timeoutMs > 0) ? timeoutMs : DEFAULT_TIMEOUT;

    return new Promise(function (resolve, reject) {
      if (!container) { reject(new Error("no-container")); return; }

      var settled = false;
      var observer = null;
      var poll = null;
      var timer = null;

      var stop = function () {
        settled = true;
        if (observer) { try { observer.disconnect(); } catch (e) {} }
        if (poll) { clearInterval(poll); poll = null; }
        if (timer) { clearTimeout(timer); timer = null; }
      };

      /* Returns true once the wait is over, either way. */
      var tick = function () {
        if (settled) return true;
        var hit = findBuyAnchor(container, matchFn);
        if (hit) { stop(); resolve(hit); return true; }
        if (storePanelFailed(container)) { stop(); reject(new Error("store-error")); return true; }
        return false;
      };

      /* Already rendered: resolve synchronously, no observer, no waiting text. */
      if (tick()) return;

      if (typeof MutationObserver !== "undefined") {
        try {
          observer = new MutationObserver(function () { tick(); });
          observer.observe(container, { childList: true, subtree: true });
        } catch (e) { observer = null; }
      }

      /* Interval fallback — and a cheap safety net even when the observer
         works, in case a render replaces the container's contents in a way we
         do not see. */
      poll = setInterval(tick, observer ? 400 : 120);

      timer = setTimeout(function () {
        if (settled) return;
        stop();
        reject(new Error("timeout"));
      }, limit);
    });
  };

  ns.findBuyAnchor = findBuyAnchor;
  ns.buyRowPrice = buyRowPrice;
  ns.buyRowName = buyRowName;
  ns.samePrice = samePrice;
  ns.shopPriceIndex = shopPriceIndex;
  ns.reconcileGrid = reconcileGrid;
  ns.GRID_PRICE_NOTE = PRICE_NOTE;
  ns.GRID_UNLISTED_NOTE = UNLISTED_NOTE;
  ns.normaliseKey = normaliseKey;
  ns.storePanelFailed = storePanelFailed;
  ns.productForAnchor = productForAnchor;
  ns.needsSize = needsSize;
  ns.resolveSize = resolveSize;
  ns.guardBuyClicks = guardBuyClicks;
  ns.whenBuyAnchor = whenBuyAnchor;
  ns.BUY_ANCHOR_TIMEOUT = DEFAULT_TIMEOUT;
})(window);
