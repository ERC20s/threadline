/* scripts/d8a-account.js — the D8A account on every page that sells, so a
   signed-in shopper buys in one click.

   Two things make Buy a single click:

   1. Who is paying. d8a-login.js (the login: block of .d8a) keeps the
      shopper's D8A session in this browser and exposes window.d8aLogin. Only
      account.html used to load it, so a shopper who had signed in was a
      stranger again on product.html: payments-widget.js posted the checkout
      with no account on it and the card checkout asked for everything again.
      This file loads the same script on any page that includes it, and
      payments-widget.js now sends window.d8aLogin.bearer with the checkout
      POST, so the platform knows the buyer and the order lands on their
      account.

   2. What they want. A size chosen once is remembered per fit family (the
      piece's `sizeGuide`, else its category), so the next tee opens with the
      shopper's size already picked and Buy is the only click left.

   Exposes Threadline.d8a:
     ready          Promise -> the signed-in user object, or null. Never rejects;
                    a missing or slow login script resolves null.
     user()         the signed-in user now, or null.
     who(user)      a short display name.
     signInHref(u)  account.html?return=<u>; account.html signs in and comes back.
     rememberSize(product, size) / rememberedSize(product)
   Load it ABOVE payments-widget.js, as the login: block asks. */
(function (global) {
  "use strict";

  var T = global.Threadline = global.Threadline || {};
  if (T.d8a) return;

  /* The same host the payments widget talks to: window.D8A_BASE, then the
     local platform when the site itself is served locally, then d8a.com. This
     is account.html's resolver, now in one place. */
  var resolveBase = function () {
    try {
      var o = String(global.D8A_BASE || "");
      if (o.indexOf("http://") === 0 || o.indexOf("https://") === 0) {
        while (o.length > 1 && o.slice(-1) === "/") o = o.slice(0, -1);
        return o;
      }
    } catch (e) {}
    try {
      var h = String(location.hostname || "").toLowerCase();
      if (location.protocol === "file:" || h === "localhost" || h === "127.0.0.1" ||
          h === "::1" || h === "[::1]" || h.slice(-10) === ".localhost") return "http://localhost:3004";
    } catch (e) {}
    return "https://d8a.com";
  };

  /* Load d8a-login.js once per page, whoever asks first. */
  if (!global.__d8aLoginReady) {
    global.__d8aLoginReady = new Promise(function (resolve) {
      if (global.d8aLogin) { resolve(); return; }
      try {
        var s = document.createElement("script");
        s.src = resolveBase() + "/d8a-login.js";
        s.setAttribute("data-client", "d8a_app_b3a35968bf907e64");
        s.onload = function () { resolve(); };
        s.onerror = function () { resolve(); };
        (document.head || document.documentElement).appendChild(s);
      } catch (e) { resolve(); }
    });
  }

  var user = function () {
    try {
      var l = global.d8aLogin;
      return (l && typeof l.user === "function" && l.user()) || null;
    } catch (e) { return null; }
  };

  /* A page must never sit waiting on sign-in to draw its Buy button: after
     four seconds the shopper is treated as signed out, and a later
     "d8a-login:signed-in" event still upgrades the page. */
  var ready = new Promise(function (resolve) {
    var done = false;
    var finish = function () { if (!done) { done = true; resolve(user()); } };
    setTimeout(finish, 4000);
    global.__d8aLoginReady.then(function () {
      var l = global.d8aLogin;
      if (l && l.ready && typeof l.ready.then === "function") l.ready.then(finish, finish);
      else finish();
    }, finish);
  });

  var who = function (u) {
    if (!u) return "";
    if (u.preferred_username) return "@" + u.preferred_username;
    return u.name || u.email || "your D8A account";
  };

  /* Only a path on this site may be a return target: account.html redirects
     to it after sign-in, and an absolute URL there would be an open redirect. */
  var safeReturn = function (target) {
    var t = String(target || "");
    if (!t || t.charAt(0) !== "/" || t.charAt(1) === "/" || t.charAt(1) === "\\") return "";
    return t;
  };

  var signInHref = function (target) {
    var t = safeReturn(target);
    return "account.html" + (t ? "?return=" + encodeURIComponent(t) : "");
  };

  /* ---- the shopper's size, remembered per fit family ---- */
  var SIZE_KEY = "threadline:size:";
  var family = function (p) {
    if (!p) return "";
    return String(p.sizeGuide || p.category || "").toLowerCase();
  };
  var rememberSize = function (p, size) {
    var f = family(p);
    if (!f || !size || !p.sizes || p.sizes.length < 2) return;
    try { global.localStorage.setItem(SIZE_KEY + f, String(size)); } catch (e) {}
  };
  var rememberedSize = function (p) {
    var f = family(p);
    if (!f || !p.sizes || p.sizes.length < 2) return "";
    var saved = "";
    try { saved = String(global.localStorage.getItem(SIZE_KEY + f) || ""); } catch (e) { return ""; }
    /* Only a size this piece is really made in. */
    for (var i = 0; i < p.sizes.length; i++) if (p.sizes[i] === saved) return saved;
    return "";
  };

  T.d8a = {
    ready: ready,
    user: user,
    who: who,
    safeReturn: safeReturn,
    signInHref: signInHref,
    rememberSize: rememberSize,
    rememberedSize: rememberedSize
  };
})(window);
