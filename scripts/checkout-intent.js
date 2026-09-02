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
 *
 * whenBuyAnchor resolves with the first matching `a[data-item]` already inside
 * the container, otherwise it watches the container (MutationObserver, with a
 * polling fallback) and resolves as soon as one appears. It rejects with
 * "store-error" when the widget has drawn its failure line (the Retry control)
 * and with "timeout" when neither happens in time.
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
  ns.storePanelFailed = storePanelFailed;
  ns.whenBuyAnchor = whenBuyAnchor;
  ns.BUY_ANCHOR_TIMEOUT = DEFAULT_TIMEOUT;
})(window);
