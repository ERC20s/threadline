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
 *   Threadline.resolveQuantity(requested, max)            -> whole number 1..max
 *   Threadline.guardBuyClicks(container, decide)          -> dispose()
 *   Threadline.productForOrder(order)                     -> catalogue product | null
 *   Threadline.renderReceipt(target, order, options)      -> element | null
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
 *
 * resolveQuantity(requested, max) is the same "never believe the URL" rule for
 * ?qty= on product.html. The site could only ever sell one of anything: every
 * checkout it started asked for quantity 1. payments-widget.js has always read
 * data-quantity off the row it is about to post ("var qAttr = a.getAttribute(
 * 'data-quantity')"), so the page that owns the choice only has to make one and
 * stamp it. The helper answers with a whole number between 1 and `max`
 * (ns.MAX_QUANTITY when no max is given):
 *
 *   - "3" -> 3, " 3 " -> 3;
 *   - "0", "-2", "2.5", "three", "", null, undefined -> 1, because a shopper
 *     who followed a mangled link still means "one";
 *   - "99" -> max, so a hand-edited URL cannot post a hundred-piece order.
 *
 * A quantity is never a reason to refuse a checkout — unlike a missing size,
 * there is always a sane answer — so callers can use the result directly.
 *
 * productForOrder(order) / renderReceipt(target, order, options) are the paid
 * receipt. payments-widget.js verifies a returning ?d8a_order=<id> and fires
 * "group-store:paid" with the order — but its own line inside #group-store is
 * only "Paid: <name> — order <id>", which on the home page and the shop grid
 * sits far below the fold. These two build one real confirmation, so index
 * .html, products.html and product.html all say the same thing:
 *
 *   - productForOrder maps the order back to the catalogue the way
 *     productForAnchor maps a widget row: the normalised platform item id
 *     (order.itemId / order.item) first, the normalised order.itemName second.
 *     No match gives null and the receipt falls back to the platform's own
 *     wording (order.itemName), never to a guess;
 *   - renderReceipt writes "Thank you — order <id> is paid: <piece> [×qty]
 *     [, size <S>]. A confirmation email is on its way." into `target` and
 *     appends a prefilled mailto to hello@threadline.example carrying the order
 *     id, the piece and the size, so an order can be fulfilled even if the
 *     platform dropped the size field.
 *
 * The receipt element is stamped data-receipt-order="<id>"; a second call for
 * the same order id into the same target returns the element already there
 * instead of a second receipt (the event can fire again on a re-render, and a
 * page may host more than one #group-store). Callers can also read that stamp
 * to stop their own status line overwriting a receipt. Options:
 * { product, size, focus, tone, mailText }.
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

  /* How many of one piece a single checkout may ask for. Five is a shop
     decision, not a platform limit: a bigger order is a conversation with us
     (hello@threadline.example), not a silently accepted URL. */
  var MAX_QUANTITY = 5;

  /* The quantity a page may actually use, given whatever a URL or a stray
     attribute asked for. Only a whole number survives; everything else is 1,
     and anything above the ceiling is the ceiling. */
  var resolveQuantity = function (requested, max) {
    var ceiling = Math.floor(Number(max));
    if (!ceiling || ceiling < 1 || !isFinite(ceiling)) ceiling = MAX_QUANTITY;

    if (requested === null || requested === undefined) return 1;
    var text = String(requested).replace(/\s+/g, "");
    if (!/^\+?[0-9]+$/.test(text)) return 1;

    var n = parseInt(text, 10);
    if (!isFinite(n) || n < 1) return 1;
    return n > ceiling ? ceiling : n;
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

  /* ---- the paid-order receipt --------------------------------------------
     payments-widget.js verifies the ?d8a_order= a buyer comes back with and
     fires "group-store:paid". Every page that hosts a #group-store panel can
     end a purchase properly with these two, instead of leaving the shopper
     with the widget's own small green line. */

  var CONTACT_EMAIL = "hello@threadline.example";
  var RECEIPT_ATTR = "data-receipt-order";

  /* The platform item the order was for. Different platforms have named this
     field differently, so all three spellings are read before we give up. */
  var orderItemId = function (order) {
    if (!order) return "";
    return String(order.itemId || order.item || order.item_id || "");
  };

  /* The catalogue entry a paid order stands for, or null. Same two keys, same
     precedence as productForAnchor: id outright, first title match second. */
  var productForOrder = function (order) {
    var list = ns.products;
    if (!order || !list || !list.length) return null;

    var idKey = normaliseKey(orderItemId(order));
    var nameKey = normaliseKey(order.itemName || order.name || "");
    var nameHit = null;

    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p) continue;
      if (idKey && normaliseKey(p.id) === idKey) return p;
      if (!nameHit && nameKey && normaliseKey(p.name) === nameKey) nameHit = p;
    }
    return nameHit;
  };

  /* A prefilled email that carries everything we need to pack the order. The
     size is sent with the checkout, but the platform only stores it if it
     accepted the extra field — this is the fallback that always works. */
  var receiptMailto = function (order, pieceName, size) {
    var orderId = (order && order.id) ? String(order.id) : "";
    var lines = [
      "Order: " + (orderId || "(no order id)"),
      "Piece: " + (pieceName || "(not named)"),
      "Size: " + (size || "not chosen"),
      "",
      "Please confirm my order."
    ].join("\n");
    return "mailto:" + CONTACT_EMAIL +
      "?subject=" + encodeURIComponent("Threadline order " + orderId) +
      "&body=" + encodeURIComponent(lines);
  };

  var receiptIn = function (target, orderId) {
    try {
      if (!target || !target.querySelector) return null;
      return orderId
        ? target.querySelector("[" + RECEIPT_ATTR + "=\"" + orderId + "\"]")
        : target.querySelector("[" + RECEIPT_ATTR + "]");
    } catch (e) { return null; }
  };

  var renderReceipt = function (target, order, options) {
    if (!target || !target.appendChild || !order) return null;
    var opts = options || {};
    var orderId = order.id ? String(order.id) : "";

    /* Already shown here: the event fires once per verified order, but a page
       with two panels — or a handler re-registered on a re-render — must not
       hand the shopper two receipts. */
    var already = receiptIn(target, orderId);
    if (already) return already;

    var product = opts.product || productForOrder(order);
    var pieceName = (product && product.name) || (order.itemName ? String(order.itemName) : "");
    var size = (opts.size !== undefined && opts.size !== null)
      ? String(opts.size)
      : String(order.size || "");
    var quantity = Number(order.quantity) > 1 ? Number(order.quantity) : 0;

    var sentence = "Thank you — order " + (orderId || "(no order id)") + " is paid";
    if (pieceName) sentence += ": " + pieceName;
    if (quantity) sentence += " ×" + quantity;
    if (size) sentence += ", size " + size;
    sentence += ". A confirmation email is on its way.";

    /* The receipt replaces whatever the status line was saying: a leftover
       "Opening checkout…" under a paid order reads as a failure. */
    target.textContent = "";

    var box = document.createElement("span");
    box.setAttribute(RECEIPT_ATTR, orderId);
    box.appendChild(document.createTextNode(sentence + " "));

    var mail = document.createElement("a");
    mail.href = receiptMailto(order, pieceName, size);
    mail.textContent = opts.mailText ||
      (size ? "Email us the size for this order" : "Email us about this order");
    box.appendChild(mail);
    target.appendChild(box);

    if (target.setAttribute) target.setAttribute("data-tone", opts.tone || "ok");

    /* Only when the caller asks: the product page says it in place, the home
       page and the grid move the shopper to the line they came back for. */
    if (opts.focus && target.focus) {
      try {
        if (target.hasAttribute && !target.hasAttribute("tabindex")) {
          target.setAttribute("tabindex", "-1");
        }
        target.focus();
      } catch (e) {}
    }

    return box;
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
  ns.resolveQuantity = resolveQuantity;
  ns.MAX_QUANTITY = MAX_QUANTITY;
  ns.guardBuyClicks = guardBuyClicks;
  ns.productForOrder = productForOrder;
  ns.renderReceipt = renderReceipt;
  ns.receiptIn = receiptIn;
  ns.receiptMailto = receiptMailto;
  ns.RECEIPT_ATTR = RECEIPT_ATTR;
  ns.CONTACT_EMAIL = CONTACT_EMAIL;
  ns.whenBuyAnchor = whenBuyAnchor;
  ns.BUY_ANCHOR_TIMEOUT = DEFAULT_TIMEOUT;
})(window);
