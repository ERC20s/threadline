/*
 * Smoke flow: the path a shopper takes through the site, driven in Chromium.
 *
 *   home → product grid → product page → size guide → lookbook → about
 *
 * Every step is a click on a real link, and every step must render what it is
 * for. Across the whole walk there must be no console error and no uncaught
 * exception, and the product page must render its checkout button.
 */
const { mockPlatform, collectErrors } = require('./flow-helpers');

module.exports = async function smoke(browser, origin) {
  const results = [];
  const check = (name, ok, detail) => results.push({ name, ok: !!ok, detail: detail || '' });

  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const errors = collectErrors(page);
  const seen = await mockPlatform(page, { origin });
  const nav = (label) => page.locator('header nav a', { hasText: label }).first();

  try {
    // Home
    await page.goto(origin + '/');
    const featured = await page.locator('#featured-grid a.card').count();
    check('smoke-home-renders-featured', featured > 0, 'featured cards=' + featured);

    // Product grid
    await Promise.all([page.waitForURL(/\/products\.html$/), nav('Shop').click()]);
    const expected = await page.evaluate(() => window.Threadline.products.length);
    const cards = page.locator('#catalogue-grid a.card');
    const count = await cards.count();
    check('smoke-grid-renders-every-piece', count === expected && count > 0, 'cards=' + count + ' catalogue=' + expected);

    // Product page, from the first card
    const firstId = await cards.first().getAttribute('data-product-id');
    await Promise.all([page.waitForURL(/\/product\.html\?id=/), cards.first().click()]);
    const name = await page.evaluate((id) => window.Threadline.byId(id).name, firstId);
    await page.waitForFunction((n) => document.getElementById('product-name').textContent === n, name, { timeout: 5000 }).catch(() => {});
    const h1 = await page.locator('#product-name').textContent();
    check('smoke-product-page-names-the-piece', h1 === name, 'id=' + firstId + ' h1=' + h1 + ' expected=' + name);

    const buy = page.locator('#buy');
    const buyVisible = await buy.isVisible();
    const buyText = (await buy.textContent() || '').trim();
    check('smoke-checkout-button-rendered', buyVisible && buyText === 'Buy', 'visible=' + buyVisible + ' text=' + JSON.stringify(buyText));
    await page.waitForSelector('#group-store a[data-item]', { state: 'attached' });
    check('smoke-shop-panel-rendered', await page.locator('#group-store a[data-item]').count() > 0, 'rows rendered');

    // Size guide, from the product page's own link
    await Promise.all([page.waitForURL(/\/size-guide\.html/), page.locator('#size-guide-link').click()]);
    const guide = (await page.locator('h1').first().textContent() || '').trim();
    const tables = await page.locator('table').count();
    check('smoke-size-guide-renders', guide === 'Size guide' && tables > 0, 'h1=' + guide + ' tables=' + tables);

    // Lookbook
    await Promise.all([page.waitForURL(/\/lookbook\.html$/), nav('Lookbook').click()]);
    await page.waitForSelector('#lookbook figure');
    const looks = await page.locator('#lookbook figure').count();
    check('smoke-lookbook-renders', looks > 0, 'looks=' + looks);

    // About, on the home page
    await Promise.all([page.waitForURL(/\/index\.html#about$/), nav('About').click()]);
    const about = await page.locator('#about').isVisible();
    check('smoke-about-renders', about, 'about visible=' + about);
  } catch (e) {
    check('smoke-walk-completes', false, String(e).split('\n')[0] + ' @ ' + page.url());
  }

  check('smoke-no-console-errors', errors.length === 0, errors.join(' | '));
  check('smoke-no-outside-requests', seen.blocked.length === 0, seen.blocked.join(' | '));
  await context.close();
  return results;
};
