/* scripts/account.js — the sign-up half of the accounts service.
 *
 * The site had nowhere for a visitor to become a known customer: the only way
 * to reach us was mailto:hello@threadline.example. This file wires the account
 * form on index.html to server/index.js, which stores every person in MongoDB
 * (the `users` collection named by MONGODB_DB / MONGODB_URI).
 *
 * It adds to the shared window.Threadline namespace (created by
 * scripts/products.js; created here too so this file can be loaded on its own,
 * e.g. from tests/payments-widget.test.html):
 *
 *   Threadline.normaliseEmail(value)            -> lower-cased, trimmed string
 *   Threadline.validEmail(value)                -> boolean
 *   Threadline.accountsBase(el)                 -> "" (same origin) or an origin
 *   Threadline.accountsUrl(path, el)            -> full URL for a call
 *   Threadline.signUp(details, options)         -> Promise<{ ok, status, data }>
 *   Threadline.wireAccountForm(form)            -> dispose()
 *
 * normaliseEmail/validEmail are exactly the rule server/index.js applies, so
 * the browser refuses what the service would refuse instead of showing a green
 * line for an address that never landed.
 *
 * WHERE THE SERVICE IS: the form carries data-accounts-base. Empty (the
 * default) means "same origin" — nginx on the group's box proxies /api to the
 * `api` run entry — and an absolute http(s) origin is used as written, which is
 * what a developer serving the static site on :5004 and the service on :4010
 * needs. Nothing is read from a global, so a page can host two forms.
 *
 * FAILURE IS EXPECTED. The accounts service is a separate process; it can be
 * down, unconfigured (no MONGODB_URI) or simply not deployed yet. Every failure
 * path ends at the same honest sentence plus the mailto we already use for a
 * shop outage — the form never claims an account was created.
 */
(function (global) {
  "use strict";

  var ns = global.Threadline = global.Threadline || {};

  var CONTACT_EMAIL = ns.CONTACT_EMAIL || "hello@threadline.example";
  var TIMEOUT = 12000;

  /* Same loose rule as server/index.js: one @, something either side, a dot in
     the domain. Anything stricter refuses real addresses. */
  var EMAIL_RE = /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/;

  var cleanText = function (value, max) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, max || 200);
  };

  var normaliseEmail = function (value) {
    return cleanText(value, 200).toLowerCase();
  };

  var validEmail = function (value) {
    var email = normaliseEmail(value);
    return !!email && EMAIL_RE.test(email);
  };

  /* Only an absolute http(s) origin or "" is ever used — the same rule
     payments-widget.js applies to platform URLs. */
  var accountsBase = function (el) {
    var raw = "";
    try {
      if (el && el.getAttribute) raw = el.getAttribute("data-accounts-base") || "";
      if (!raw && global.document && document.body && document.body.getAttribute) {
        raw = document.body.getAttribute("data-accounts-base") || "";
      }
    } catch (e) { raw = ""; }
    raw = String(raw).trim().replace(/\/+$/, "");
    if (!raw) return "";
    if (!/^https?:\/\/[^\s]+$/i.test(raw)) return "";
    return raw;
  };

  var accountsUrl = function (path, el) {
    var p = String(path || "");
    if (p.charAt(0) !== "/") p = "/" + p;
    return accountsBase(el) + p;
  };

  /* A prefilled email for the visitor whose sign-up could not be stored, built
     the way checkout-intent.js builds its receipt and outage mailtos. */
  var accountMailto = function (email, name) {
    var lines = [
      "Name: " + (name || "(not given)"),
      "Email: " + (email || "(not given)"),
      "",
      "The sign-up form on the site couldn't reach your accounts service. Please add me."
    ].join("\n");
    return "mailto:" + CONTACT_EMAIL +
      "?subject=" + encodeURIComponent("Threadline account") +
      "&body=" + encodeURIComponent(lines);
  };

  /* POST /api/users. Resolves with { ok, status, data, error } — it never
     rejects for an answer we understood, so callers have one code path. */
  var signUp = function (details, options) {
    var opts = options || {};
    var payload = {
      email: normaliseEmail(details && details.email),
      name: cleanText(details && details.name, 80),
      consent: !!(details && details.consent),
      source: cleanText((details && details.source) || "website", 60)
    };

    if (!validEmail(payload.email)) {
      return Promise.resolve({
        ok: false, status: 0, data: null,
        error: "Enter an email address we can reach you at."
      });
    }

    var url = opts.url || accountsUrl("/api/users", opts.element);
    var ctrl = global.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () {
      if (ctrl) { try { ctrl.abort(); } catch (e) {} }
    }, opts.timeout || TIMEOUT);

    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl ? ctrl.signal : undefined
    })
      .then(function (r) {
        return r.json().catch(function () { return null; }).then(function (data) {
          return { response: r, data: data };
        });
      })
      .then(function (answer) {
        clearTimeout(timer);
        var data = answer.data;
        if (!answer.response.ok || !data || data.ok !== true) {
          return {
            ok: false,
            status: answer.response.status,
            data: data,
            error: (data && data.error) ? String(data.error) : "We couldn't save that just now."
          };
        }
        return { ok: true, status: answer.response.status, data: data, error: "" };
      })
      .catch(function () {
        clearTimeout(timer);
        return {
          ok: false, status: 0, data: null,
          error: "The accounts service isn't answering."
        };
      });
  };

  var setStatus = function (target, text, tone) {
    if (!target) return;
    target.textContent = text;
    if (target.setAttribute) target.setAttribute("data-tone", tone || "");
  };

  var withMail = function (target, text, email, name) {
    if (!target) return;
    setStatus(target, text + " ", "error");
    var mail = document.createElement("a");
    mail.href = accountMailto(email, name);
    mail.textContent = "Email " + CONTACT_EMAIL;
    target.appendChild(mail);
  };

  /* One form -> one sign-up. The submit is always cancelled: this is a
     scripted post, and a plain form GET would put the address in the URL. */
  var wireAccountForm = function (form) {
    var noop = function () {};
    if (!form || !form.addEventListener) return noop;
    if (form.getAttribute && form.getAttribute("data-account-form-wired")) return noop;

    var status = form.querySelector("[data-account-status]");
    var button = form.querySelector("button[type=submit], button:not([type])");

    var onSubmit = function (e) {
      if (e && e.preventDefault) e.preventDefault();

      var emailField = form.querySelector("[name=email]");
      var nameField = form.querySelector("[name=name]");
      var consentField = form.querySelector("[name=consent]");
      var email = normaliseEmail(emailField && emailField.value);
      var name = cleanText(nameField && nameField.value, 80);

      if (!validEmail(email)) {
        setStatus(status, "Enter an email address we can reach you at.", "error");
        if (emailField && emailField.focus) emailField.focus();
        return;
      }

      if (button) { button.disabled = true; }
      setStatus(status, "Creating your account…", "");

      signUp({
        email: email,
        name: name,
        consent: !!(consentField && consentField.checked),
        source: (form.getAttribute && form.getAttribute("data-account-source")) || "website"
      }, { element: form }).then(function (result) {
        if (button) { button.disabled = false; }
        if (result.ok) {
          var returning = !!(result.data && result.data.user && result.data.user.returning);
          setStatus(status, returning
            ? "You're already with us — we've refreshed your details, " + email + "."
            : "Thank you" + (name ? ", " + name : "") + " — " + email + " is on the list. " +
              "We'll email you about restocks and new pieces, and nothing else.", "ok");
          if (!returning && form.reset) form.reset();
          return;
        }
        /* A 400 is about what was typed; anything else is about the service. */
        if (result.status === 400 || result.status === 429) {
          setStatus(status, result.error, "error");
          return;
        }
        withMail(status, "We couldn't save that just now — " + result.error, email, name);
      });
    };

    form.addEventListener("submit", onSubmit);
    if (form.setAttribute) form.setAttribute("data-account-form-wired", "1");

    return function dispose() {
      try { form.removeEventListener("submit", onSubmit); } catch (e) {}
      try { if (form.removeAttribute) form.removeAttribute("data-account-form-wired"); } catch (e) {}
    };
  };

  var wireAll = function () {
    if (!global.document || !document.querySelectorAll) return;
    var forms = document.querySelectorAll("form[data-account-form]");
    for (var i = 0; i < forms.length; i++) wireAccountForm(forms[i]);
  };

  if (global.document) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", wireAll);
    } else {
      wireAll();
    }
  }

  ns.normaliseEmail = normaliseEmail;
  ns.validEmail = validEmail;
  ns.accountsBase = accountsBase;
  ns.accountsUrl = accountsUrl;
  ns.accountMailto = accountMailto;
  ns.signUp = signUp;
  ns.wireAccountForm = wireAccountForm;
  ns.ACCOUNT_TIMEOUT = TIMEOUT;
})(window);
