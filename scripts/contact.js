(function () {
  "use strict";

  var form = document.getElementById("contact-form");
  if (!form) return;

  var fields = ["name", "email", "subject", "message"];

  function showError(id, message) {
    var errorEl = document.getElementById(id + "-error");
    var inputEl = document.getElementById(id);
    if (errorEl) errorEl.textContent = message || "";
    if (inputEl) {
      if (message) {
        inputEl.setAttribute("aria-invalid", "true");
      } else {
        inputEl.removeAttribute("aria-invalid");
      }
    }
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function validate() {
    var valid = true;

    fields.forEach(function (id) {
      var el = document.getElementById(id);
      var value = el.value.trim();

      if (!value) {
        showError(id, "This field is required.");
        valid = false;
        return;
      }

      if (id === "email" && !isValidEmail(value)) {
        showError(id, "Enter a valid email address.");
        valid = false;
        return;
      }

      showError(id, "");
    });

    return valid;
  }

  function buildMailtoUrl() {
    var name = document.getElementById("name").value.trim();
    var email = document.getElementById("email").value.trim();
    var subject = document.getElementById("subject").value.trim();
    var message = document.getElementById("message").value.trim();

    var body = "From: " + name + " (" + email + ")\n\n" + message;
    var url = "mailto:hello@threadline.example" +
      "?subject=" + encodeURIComponent(subject) +
      "&body=" + encodeURIComponent(body);

    return url;
  }

  form.addEventListener("submit", function (event) {
    // Honeypot: if filled in, silently treat as spam and stop submission.
    var honeypot = document.getElementById("company");
    if (honeypot && honeypot.value.trim() !== "") {
      event.preventDefault();
      return;
    }

    if (!validate()) {
      event.preventDefault();
      var firstInvalid = form.querySelector('[aria-invalid="true"]');
      if (firstInvalid) firstInvalid.focus();
      return;
    }

    // Progressive enhancement: compose a richer mailto: link with a
    // formatted body, then let the browser open the mail client.
    event.preventDefault();
    window.location.href = buildMailtoUrl();
  });

  fields.forEach(function (id) {
    var el = document.getElementById(id);
    el.addEventListener("blur", function () {
      var value = el.value.trim();
      if (!value) {
        showError(id, "This field is required.");
      } else if (id === "email" && !isValidEmail(value)) {
        showError(id, "Enter a valid email address.");
      } else {
        showError(id, "");
      }
    });
  });
})();
