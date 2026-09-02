/* server/index.js — the Threadline accounts service.
 *
 * The site itself is static HTML served by the `site` run entry. This is the
 * one small back end it has: it takes a sign-up from the account form on
 * index.html and keeps the person in MongoDB, so "all the users of the
 * website" live in one collection instead of in a pile of emails.
 *
 * Endpoints (JSON in, JSON out):
 *
 *   GET  /api/health        -> { ok, database, collection, users }  (no PII)
 *   POST /api/users         -> { ok, user: { email, name, createdAt, returning } }
 *   GET  /api/users/count   -> { ok, count }
 *
 * There is deliberately NO endpoint that lists the users: the site is public,
 * the service answers cross-origin, and a public list of customer emails is a
 * leak, not a feature. Read the collection with a Mongo client when you need
 * the list.
 *
 * Settings (names are declared in the root .d8a `keys:` block and in
 * .env.example; values live on the box in /etc/d8a/keys.env and reach this
 * process through `d8a run -- npm start`):
 *
 *   MONGODB_URI               the connection string (required to store anyone)
 *   MONGODB_DB                database name          (default "threadline")
 *   ACCOUNTS_PORT             port to listen on      (default 4010)
 *   ACCOUNTS_ALLOWED_ORIGINS  comma-separated origins allowed to post, or "*"
 *
 * Nothing here throws on a missing setting or a missing driver: the service
 * still starts and answers 503 with a sentence saying what is not configured,
 * because a site whose sign-up box says "we couldn't save that, email us" is
 * better than a deploy that crash-loops.
 */
"use strict";

var http = require("http");

/* The driver is a dependency (server/package.json). If `npm install` has not
   been run in this folder yet we say so once and keep serving 503s. */
var MongoClient = null;
var driverError = "";
try {
  MongoClient = require("mongodb").MongoClient;
} catch (e) {
  driverError = "the mongodb driver is not installed — run `npm install` in server/";
}

var DB_NAME = process.env.MONGODB_DB || "threadline";
var COLLECTION = "users";
var PORT = (function () {
  var n = parseInt(process.env.ACCOUNTS_PORT || "", 10);
  return (n && n > 0 && n < 65536) ? n : 4010;
})();
var ALLOWED_ORIGINS = String(process.env.ACCOUNTS_ALLOWED_ORIGINS || "*")
  .split(",")
  .map(function (s) { return s.trim(); })
  .filter(Boolean);

var MAX_BODY = 8 * 1024;          /* a sign-up is a few hundred bytes */
var RATE_WINDOW_MS = 10 * 60 * 1000;
var RATE_MAX = 20;                /* sign-ups per IP per window */

/* ---- validation ---------------------------------------------------------
   Deliberately the same shape as Threadline.validEmail in scripts/account.js,
   so the browser and the service agree on what an address is. The rule is
   loose on purpose: one @, something either side, a dot in the domain. */
var EMAIL_RE = /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/;

var cleanText = function (value, max) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, max);
};

var normaliseEmail = function (value) {
  return cleanText(value, 200).toLowerCase();
};

var validEmail = function (value) {
  var email = normaliseEmail(value);
  return !!email && email.length <= 200 && EMAIL_RE.test(email);
};

/* ---- mongo --------------------------------------------------------------
   One client for the process, connected on the first request that needs it.
   A failed connection clears the cached promise, so the next sign-up tries
   again instead of the service being poisoned by one bad minute. */
var clientPromise = null;

var connect = function () {
  if (!MongoClient) return Promise.reject(new Error(driverError));
  if (!process.env.MONGODB_URI) {
    return Promise.reject(new Error("MONGODB_URI is not set — set it on the group's Admin tab"));
  }
  if (!clientPromise) {
    var client = new MongoClient(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000
    });
    clientPromise = client.connect()
      .then(function (connected) {
        var users = connected.db(DB_NAME).collection(COLLECTION);
        /* One person, one row. The unique index is what makes the upsert
           below safe when two tabs submit at the same moment. */
        return users.createIndex({ email: 1 }, { unique: true })
          .catch(function () { /* an existing index of another shape: not fatal */ })
          .then(function () { return connected; });
      })
      .catch(function (err) {
        clientPromise = null;
        throw err;
      });
  }
  return clientPromise;
};

var usersCollection = function () {
  return connect().then(function (client) {
    return client.db(DB_NAME).collection(COLLECTION);
  });
};

/* ---- http plumbing ------------------------------------------------------ */

var originAllowed = function (origin) {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.indexOf("*") !== -1) return true;
  return ALLOWED_ORIGINS.indexOf(origin) !== -1;
};

var corsHeaders = function (origin) {
  var headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Vary": "Origin"
  };
  if (origin && originAllowed(origin)) {
    headers["Access-Control-Allow-Origin"] =
      ALLOWED_ORIGINS.indexOf("*") !== -1 ? "*" : origin;
    headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type";
    headers["Access-Control-Max-Age"] = "600";
  }
  return headers;
};

var send = function (res, status, payload, origin) {
  var body = JSON.stringify(payload);
  res.writeHead(status, corsHeaders(origin));
  res.end(body);
};

var readBody = function (req) {
  return new Promise(function (resolve, reject) {
    var chunks = [];
    var size = 0;
    req.on("data", function (chunk) {
      size += chunk.length;
      if (size > MAX_BODY) { reject(new Error("body-too-large")); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on("end", function () {
      var text = Buffer.concat(chunks).toString("utf8").trim();
      if (!text) { resolve({}); return; }
      try { resolve(JSON.parse(text)); } catch (e) { reject(new Error("bad-json")); }
    });
    req.on("error", function (err) { reject(err); });
  });
};

/* A crude per-IP throttle so a script cannot fill the collection. In memory
   on purpose: one box, one process, and nothing here is worth a second store. */
var hits = Object.create(null);
var rateLimited = function (ip) {
  var now = Date.now();
  var entry = hits[ip];
  if (!entry || now - entry.start > RATE_WINDOW_MS) {
    hits[ip] = { start: now, count: 1 };
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_MAX;
};
setInterval(function () {
  var now = Date.now();
  Object.keys(hits).forEach(function (ip) {
    if (now - hits[ip].start > RATE_WINDOW_MS) delete hits[ip];
  });
}, RATE_WINDOW_MS).unref();

/* ---- the sign-up itself ------------------------------------------------- */

var saveUser = function (payload, req) {
  var email = normaliseEmail(payload.email);
  var name = cleanText(payload.name, 80);
  var source = cleanText(payload.source, 60) || "website";
  var consent = payload.consent === true || payload.consent === "yes" || payload.consent === "on";
  var now = new Date();

  /* Only fields we really have are written: an empty name must not wipe the
     name a returning shopper gave us the first time. */
  var set = {
    marketingConsent: consent,
    updatedAt: now,
    userAgent: cleanText(req.headers["user-agent"], 200)
  };
  if (name) set.name = name;

  return usersCollection().then(function (users) {
    return users.findOneAndUpdate(
      { email: email },
      {
        $setOnInsert: { email: email, createdAt: now, source: source },
        $set: set
      },
      { upsert: true, returnDocument: "after" }
    ).then(function (result) {
      /* driver 6 returns the document itself; older shapes wrap it in .value */
      var doc = (result && result.value) ? result.value : result;
      return {
        email: email,
        name: (doc && doc.name) || name,
        createdAt: (doc && doc.createdAt) ? doc.createdAt : now,
        returning: !!(doc && doc.createdAt && doc.createdAt.getTime &&
          doc.createdAt.getTime() < now.getTime())
      };
    });
  });
};

var routes = function (req, res, url, origin) {
  var path = url.pathname.replace(/\/+$/, "") || "/";

  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders(origin));
    res.end();
    return;
  }

  if (path === "/api/health" && req.method === "GET") {
    usersCollection()
      .then(function (users) { return users.estimatedDocumentCount(); })
      .then(function (count) {
        send(res, 200, {
          ok: true, database: DB_NAME, collection: COLLECTION, users: count
        }, origin);
      })
      .catch(function (err) {
        send(res, 503, {
          ok: false, database: DB_NAME, collection: COLLECTION,
          error: String(err && err.message ? err.message : err)
        }, origin);
      });
    return;
  }

  if (path === "/api/users/count" && req.method === "GET") {
    usersCollection()
      .then(function (users) { return users.estimatedDocumentCount(); })
      .then(function (count) { send(res, 200, { ok: true, count: count }, origin); })
      .catch(function () {
        send(res, 503, { ok: false, error: "the accounts database isn't available" }, origin);
      });
    return;
  }

  if (path === "/api/users" && req.method === "POST") {
    if (!originAllowed(origin)) {
      send(res, 403, { ok: false, error: "this origin may not sign people up" }, origin);
      return;
    }
    var ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
      (req.socket && req.socket.remoteAddress) || "unknown";
    if (rateLimited(ip)) {
      send(res, 429, { ok: false, error: "too many sign-ups from here — try again later" }, origin);
      return;
    }
    readBody(req)
      .then(function (payload) {
        if (!validEmail(payload && payload.email)) {
          send(res, 400, { ok: false, error: "that doesn't look like an email address" }, origin);
          return null;
        }
        return saveUser(payload, req).then(function (user) {
          send(res, user.returning ? 200 : 201, { ok: true, user: user }, origin);
        });
      })
      .catch(function (err) {
        var reason = String(err && err.message ? err.message : err);
        if (reason === "bad-json" || reason === "body-too-large") {
          send(res, 400, { ok: false, error: "we couldn't read that sign-up" }, origin);
          return;
        }
        console.error("[accounts] sign-up failed:", reason);
        send(res, 503, {
          ok: false,
          error: "the accounts database isn't available right now — email hello@threadline.example"
        }, origin);
      });
    return;
  }

  send(res, 404, { ok: false, error: "no such endpoint" }, origin);
};

var server = http.createServer(function (req, res) {
  var origin = req.headers.origin || "";
  var url;
  try {
    url = new URL(req.url, "http://localhost");
  } catch (e) {
    send(res, 400, { ok: false, error: "bad request" }, origin);
    return;
  }
  try {
    routes(req, res, url, origin);
  } catch (err) {
    console.error("[accounts] unhandled:", err);
    send(res, 500, { ok: false, error: "something went wrong" }, origin);
  }
});

/* Required so `npm run check` (and any future test) can load this file
   without opening a port. */
if (require.main === module) {
  server.listen(PORT, function () {
    console.log("[accounts] listening on http://localhost:" + PORT);
    console.log("[accounts] database " + DB_NAME + "." + COLLECTION +
      (process.env.MONGODB_URI ? "" : " — MONGODB_URI is NOT set, sign-ups will answer 503"));
    if (driverError) console.log("[accounts] " + driverError);
  });
}

module.exports = {
  server: server,
  normaliseEmail: normaliseEmail,
  validEmail: validEmail,
  cleanText: cleanText,
  PORT: PORT,
  DB_NAME: DB_NAME,
  COLLECTION: COLLECTION
};
