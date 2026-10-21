/*
 * Shared set-up for the Playwright flows (tests/*.flow.js).
 *
 * A flow drives the real pages the way a shopper does, so nothing it loads may
 * leave the machine: mockPlatform() answers the group shop's API (items and
 * checkout) from the items: block of .d8a, answers the placeholder photographs
 * with a small local PNG, and aborts every other request that is not this
 * server — an aborted request logs a console error, so a page that starts
 * depending on some new outside host fails the smoke flow instead of passing
 * by luck.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// A 2x2 opaque PNG, so a texture or an <image> really decodes.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP4z8DwHwxRGEBmUjIDAwB7Rgf5LWSO5gAAAABJRU5ErkJggg==',
  'base64'
);

/* The group's items, read from the items: block of .d8a — the list the shop
   actually sells. Ids are slugs of the names; the pages match rows to the
   catalogue by id or by name, so these resolve exactly as live rows do. */
function shopItems() {
  const text = fs.readFileSync(path.join(ROOT, '.d8a'), 'utf8');
  const block = text.split(/^items:\s*$/m)[1].split(/^\S/m)[0];
  return block.split('\n')
    .map((line) => line.match(/^\s+(.+?) = (\$[\d.]+) — (.*)$/))
    .filter(Boolean)
    .map((m) => ({
      id: m[1].toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name: m[1],
      price: m[2],
      description: m[3],
    }));
}

const CORS = { 'access-control-allow-origin': '*' };

/*
 * opts.origin    this server, e.g. http://localhost:5004
 * opts.payUrl    (id) => the row's href (default: the product grid, same origin)
 * opts.checkout  async (route, request) => fulfil a checkout POST yourself;
 *                default answers at once with a url on this server.
 * opts.slow      { match: RegExp, ms } — hold matching files from this server
 *                back by ms, the way a slow connection would.
 * Returns { checkoutPosts, imageRequests, blocked } — live arrays.
 */
async function mockPlatform(page, opts) {
  const origin = opts.origin;
  const payUrl = opts.payUrl || ((id) => '/products.html#pay-' + id);
  const seen = { checkoutPosts: [], imageRequests: [], blocked: [] };

  await page.route(/^https?:\/\//, async (route) => {
    const req = route.request();
    const url = req.url();
    if (url.startsWith(origin + '/')) {
      if (opts.slow && opts.slow.match.test(url)) await new Promise((r) => setTimeout(r, opts.slow.ms));
      return route.continue();
    }

    if (/^https:\/\/picsum\.photos\//.test(url)) {
      seen.imageRequests.push(url);
      return route.fulfill({ body: PNG, contentType: 'image/png', headers: CORS });
    }

    if (/\/api\/v1\/store\/items\?/.test(url)) {
      return route.fulfill({
        json: {
          items: shopItems().map((it) => Object.assign({ payUrl: payUrl(it.id) }, it)),
          group: { name: 'Threadline', url: '/index.html#group' },
          checkout: { enabled: true, url: 'https://d8a.com/api/v1/store/checkout' },
        },
        headers: CORS,
      });
    }

    if (/\/api\/v1\/store\/checkout$/.test(url)) {
      if (req.method() === 'OPTIONS') {
        return route.fulfill({
          status: 204,
          headers: Object.assign({ 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type' }, CORS),
        });
      }
      seen.checkoutPosts.push({ url, body: req.postData(), headers: req.headers() });
      if (opts.checkout) return opts.checkout(route, req);
      return route.fulfill({ json: { url: origin + '/index.html#checkout-opened' }, headers: CORS });
    }

    seen.blocked.push(url);
    return route.abort();
  });

  return seen;
}

/* Console errors and uncaught exceptions on a page, as readable strings. */
function collectErrors(page) {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text() + ' @ ' + page.url()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e) + ' @ ' + page.url()));
  return errors;
}

module.exports = { mockPlatform, collectErrors, shopItems, PNG };
