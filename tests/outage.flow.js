/*
 * Outage flow: the shop is down when the page loads, and the shopper's Retry
 * brings it back.
 *
 * Every page that hosts the shop panel says so while it is down, and every
 * one of them has to take that notice back and fall in with the shop once a
 * Retry succeeds — the price it shows, and the "isn't answering" line. The
 * home page and the product grid did; the product page did not: it went on
 * saying the shop was down, at the catalogue price, under a panel full of
 * rows. The mocked platform sells the Everyday Tee for a dollar more than the
 * catalogue, so taking the shop's price is something that can be seen.
 */
const { mockPlatform, collectErrors, shopItems } = require('./flow-helpers');

const CORS = { 'access-control-allow-origin': '*' };
const SHOP_TEE_PRICE = '$39.00';

/* Every items request fails until `state.up`; after that the shop answers,
   with the tee repriced. Registered after mockPlatform so it is asked first. */
async function platformDownUntilRetry(page, origin) {
  const state = { up: false, aborted: 0 };
  await mockPlatform(page, { origin });
  await page.route(/\/api\/v1\/store\/items\?/, (route) => {
    if (!state.up) { state.aborted += 1; return route.abort(); }
    return route.fulfill({
      json: {
        items: shopItems().map((it) => Object.assign({ payUrl: '/products.html#pay-' + it.id }, it,
          it.id === 'everyday-tee' ? { price: SHOP_TEE_PRICE } : {})),
        group: { name: 'Threadline', url: '/index.html#group' },
        checkout: { enabled: true, url: 'https://d8a.com/api/v1/store/checkout' },
      },
      headers: CORS,
    });
  });
  return state;
}

const until = async (page, fn, arg, ms) => page.waitForFunction(fn, arg, { timeout: ms || 4000 }).then(() => true, () => false);

/* The aborted items requests are the outage, and the browser logs each one as
   a failed resource: those, and only as many of them as were aborted, are
   expected. Anything else on the console is a real error. */
function unexpectedErrors(errors, platform) {
  let aborted = 0;
  return errors.filter((e) => {
    if (/^console: Failed to load resource: net::ERR_FAILED/.test(e) && aborted < platform.aborted) { aborted += 1; return false; }
    return true;
  });
}

module.exports = async function outage(browser, origin) {
  const results = [];
  const check = (name, ok, detail) => results.push({ name, ok: !!ok, detail: detail || '' });
  const errors = [];

  // ---- product.html ----
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    const pageErrors = collectErrors(page);
    const platform = await platformDownUntilRetry(page, origin);
    try {
      await page.goto(origin + '/product.html?id=everyday-tee&size=M');
      await page.waitForSelector('#group-store [data-d8a-retry]');
      const said = await until(page, () => !!document.querySelector('#buy-status [data-shop-down]'));
      check('outage-product-says-shop-is-down', said, 'status=' + await page.$eval('#buy-status', (s) => s.textContent.trim()));

      platform.up = true;
      await page.click('#group-store [data-d8a-retry]');
      await page.waitForSelector('#group-store a[data-item]', { state: 'attached' });

      const cleared = await until(page, () => !document.querySelector('#buy-status [data-shop-down]'));
      check('outage-product-notice-cleared-after-retry', cleared,
        'status=' + JSON.stringify(await page.$eval('#buy-status', (s) => s.textContent.trim())));
      const priced = await until(page, (p) => document.getElementById('product-price').textContent.trim() === p
        && !document.getElementById('price-source').hidden, SHOP_TEE_PRICE);
      check('outage-product-takes-shop-price-after-retry', priced,
        'price=' + await page.$eval('#product-price', (e) => e.textContent.trim()) + ' expected ' + SHOP_TEE_PRICE);
      const buy = await page.$eval('#buy', (b) => ({ disabled: b.disabled, busy: b.getAttribute('aria-busy') }));
      check('outage-product-buy-enabled-after-retry', !buy.disabled && !buy.busy, JSON.stringify(buy));
    } catch (e) {
      check('outage-product-flow-completes', false, String(e).split('\n')[0] + ' @ ' + page.url());
    }
    errors.push(...unexpectedErrors(pageErrors, platform));
    await context.close();
  }

  // ---- index.html: the featured cards ----
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    const pageErrors = collectErrors(page);
    const platform = await platformDownUntilRetry(page, origin);
    try {
      await page.goto(origin + '/index.html');
      await page.waitForSelector('#group-store [data-d8a-retry]');
      const said = await until(page, () => !!document.querySelector('#featured-status [data-shop-down]'));
      check('outage-home-says-shop-is-down', said, 'status=' + await page.$eval('#featured-status', (s) => s.textContent.trim()));

      platform.up = true;
      await page.click('#group-store [data-d8a-retry]');
      await page.waitForSelector('#group-store a[data-item]', { state: 'attached' });

      const cleared = await until(page, () => !document.querySelector('#featured-status [data-shop-down]'));
      check('outage-home-notice-cleared-after-retry', cleared,
        'status=' + JSON.stringify(await page.$eval('#featured-status', (s) => s.textContent.trim())));
      const card = '#featured-grid a.card[data-product-id="everyday-tee"]';
      const repainted = await until(page, (sel) => {
        const c = document.querySelector(sel);
        return !!c && c.querySelector('.price').textContent.trim() === '$39.00'
          && /Price from the group shop/.test((c.querySelector('[data-shop-note]') || {}).textContent || '');
      }, card);
      check('outage-home-card-takes-shop-price-after-retry', repainted,
        'card price=' + await page.$eval(card + ' .price', (e) => e.textContent.trim()) + ' expected ' + SHOP_TEE_PRICE);
    } catch (e) {
      check('outage-home-flow-completes', false, String(e).split('\n')[0] + ' @ ' + page.url());
    }
    errors.push(...unexpectedErrors(pageErrors, platform));
    await context.close();
  }

  check('outage-no-page-errors', errors.length === 0, errors.join(' | '));
  return results;
};
