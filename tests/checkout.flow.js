/*
 * Checkout flow: one click is one checkout POST, and nothing a shopper does
 * while that POST is open can start another.
 *
 * The checkout endpoint is mocked and held open until the flow releases it, so
 * "in flight" is a state the assertions can look at rather than a race. Clicks
 * made while it is held are synthetic element.click() calls: a disabled button
 * ignores them, and anything else reaches the page's listeners exactly as a
 * real click would.
 */
const { mockPlatform, collectErrors } = require('./flow-helpers');

const CORS = { 'access-control-allow-origin': '*' };

/* Answer each checkout POST once the flow says so: { url } opens the
   checkout, {} is the platform declining without one. */
function heldCheckout(answers) {
  return async (route) => {
    const answer = await answers.next();
    return route.fulfill({ json: answer, headers: CORS });
  };
}

function answerQueue() {
  const waiting = [];
  const ready = [];
  return {
    next: () => (ready.length ? Promise.resolve(ready.shift()) : new Promise((r) => waiting.push(r))),
    give: (answer) => (waiting.length ? waiting.shift()(answer) : ready.push(answer)),
  };
}

const until = async (page, fn, arg, ms) => page.waitForFunction(fn, arg, { timeout: ms || 3000 }).then(() => true, () => false);

/* Answer the checkout POST at once with a page on this server, and hold that
   page's response back for a while: the time a real checkout takes to arrive,
   during which the shop page is still on screen. */
function slowCheckoutPage(page, origin) {
  const url = origin + '/checkout-page.html';
  let armed = null;
  return async (route) => {
    // Registered now, not when the handler is built: a route added later is
    // asked first, and mockPlatform's own route would otherwise pass this URL
    // straight through to the server, which has no such page.
    if (!armed) {
      armed = page.route((u) => u.href === url, async (r) => {
        await new Promise((done) => setTimeout(done, 2500));
        return r.fulfill({ body: '<!doctype html><title>Checkout</title>', contentType: 'text/html' });
      });
    }
    await armed;
    return route.fulfill({ json: { url }, headers: CORS });
  };
}

module.exports = async function checkout(browser, origin) {
  const results = [];
  const check = (name, ok, detail) => results.push({ name, ok: !!ok, detail: detail || '' });
  const errors = [];

  // ---- product.html: the page's own Buy button ----
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    const pageErrors = collectErrors(page);
    const answers = answerQueue();
    const seen = await mockPlatform(page, { origin, checkout: heldCheckout(answers) });
    try {
      await page.goto(origin + '/product.html?id=everyday-tee');
      await page.waitForSelector('#group-store a[data-item]', { state: 'attached' });
      await page.locator('#sizes button').first().click();
      await page.locator('#buy').click();
      await page.waitForTimeout(600); // give a POST time to arrive
      check('checkout-product-one-click-one-post', seen.checkoutPosts.length === 1,
        'POSTs after one click=' + seen.checkoutPosts.length);

      const state = await page.$eval('#buy', (b) => ({ disabled: b.disabled, busy: b.getAttribute('aria-busy') }));
      check('checkout-product-buy-disabled-in-flight', state.disabled === true && state.busy === 'true', JSON.stringify(state));

      const before = page.url();
      await page.$eval('#buy', (b) => { b.click(); b.click(); b.click(); });
      await page.$$eval('#group-store a[data-item]', (rows) => rows.forEach((a) => a.click()));
      await page.waitForTimeout(600);
      check('checkout-product-no-second-post-in-flight', seen.checkoutPosts.length === 1 && page.url() === before,
        'POSTs=' + seen.checkoutPosts.length + ' url=' + page.url());

      const body = JSON.parse(seen.checkoutPosts[0] ? seen.checkoutPosts[0].body : '{}');
      check('checkout-product-post-carries-size', body.size && body.item === 'everyday-tee', JSON.stringify(body));

      answers.give({ url: origin + '/index.html#checkout-opened' });
      const opened = await page.waitForURL(/#checkout-opened$/, { timeout: 5000 }).then(() => true, () => false);
      check('checkout-product-opens-checkout', opened, 'url=' + page.url());
    } catch (e) {
      check('checkout-product-flow-completes', false, String(e).split('\n')[0]);
    }
    errors.push(...pageErrors);
    await context.close();
  }

  // ---- product.html: the checkout page is slow to arrive ----
  // The widget drops its guard the moment the POST answers with a URL and only
  // then navigates; the browser keeps this page alive and clickable until the
  // checkout page's response commits. A shopper who clicked again in that
  // window used to post a second checkout. The re-click is scheduled from
  // inside the page, because nothing can be evaluated in a document with a
  // navigation pending, and the state at that moment is reported the same way
  // (console.log, read back here).
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    const pageErrors = collectErrors(page);
    const reports = [];
    page.on('console', (m) => { if (m.text().indexOf('flow:') === 0) reports.push(m.text()); });
    const seen = await mockPlatform(page, { origin, checkout: slowCheckoutPage(page, origin) });
    try {
      await page.goto(origin + '/product.html?id=everyday-tee&size=M');
      await page.waitForSelector('#group-store a[data-item]', { state: 'attached' });
      await page.evaluate(() => {
        const b = document.getElementById('buy');
        setTimeout(() => {
          console.log('flow:before-reclick disabled=' + b.disabled + ' busy=' + b.getAttribute('aria-busy'));
          b.click(); b.click();
        }, 1200);
        b.click();
      });
      await page.waitForTimeout(2000);
      check('checkout-product-buy-held-while-checkout-page-loads',
        reports.some((r) => /^flow:before-reclick disabled=true busy=true/.test(r)), reports.join(' | ') || 'no report');
      check('checkout-product-no-second-post-while-checkout-page-loads', seen.checkoutPosts.length === 1,
        'POSTs=' + seen.checkoutPosts.length);
    } catch (e) {
      check('checkout-product-slow-checkout-page-flow-completes', false, String(e).split('\n')[0]);
    }
    errors.push(...pageErrors);
    await context.close();
  }

  // ---- index.html: the panel's rows, same window ----
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    const pageErrors = collectErrors(page);
    const reports = [];
    page.on('console', (m) => { if (m.text().indexOf('flow:') === 0) reports.push(m.text()); });
    const seen = await mockPlatform(page, { origin, checkout: slowCheckoutPage(page, origin), payUrl: (id) => '/index.html#pay-' + id });
    try {
      await page.goto(origin + '/index.html');
      await page.waitForSelector('#group-store a[data-item="classic-cap"]');
      await page.evaluate(() => {
        const cap = document.querySelector('#group-store a[data-item="classic-cap"]');
        const scarf = document.querySelector('#group-store a[data-item="lambswool-scarf"]');
        setTimeout(() => {
          console.log('flow:before-reclick other-row-held=' + scarf.getAttribute('aria-disabled'));
          cap.click(); scarf.click();
        }, 1200);
        cap.click();
      });
      await page.waitForTimeout(2000);
      check('checkout-panel-rows-held-while-checkout-page-loads',
        reports.some((r) => /^flow:before-reclick other-row-held=true/.test(r)), reports.join(' | ') || 'no report');
      check('checkout-panel-no-second-post-while-checkout-page-loads', seen.checkoutPosts.length === 1,
        'POSTs=' + seen.checkoutPosts.length);
    } catch (e) {
      check('checkout-panel-slow-checkout-page-flow-completes', false, String(e).split('\n')[0]);
    }
    errors.push(...pageErrors);
    await context.close();
  }

  // ---- product.html: a declined attempt gives Buy back ----
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    const pageErrors = collectErrors(page);
    const answers = answerQueue();
    const here = '/product.html?id=everyday-tee&size=M';
    // The widget falls back to the row's href when no checkout url comes back;
    // this one only changes the fragment, so the page and its state stay.
    const seen = await mockPlatform(page, { origin, checkout: heldCheckout(answers), payUrl: (id) => here + '#pay-' + id });
    try {
      await page.goto(origin + here);
      await page.waitForSelector('#group-store a[data-item]', { state: 'attached' });
      await page.locator('#buy').click();
      await page.waitForTimeout(400);
      const posted = seen.checkoutPosts.length;
      answers.give({});
      answers.give({});
      const back = await until(page, () => {
        const b = document.getElementById('buy');
        return b && !b.disabled && !b.hasAttribute('aria-busy');
      }, null, 5000);
      check('checkout-product-buy-back-after-declined-attempt', posted === 1 && back,
        'POSTs when held=' + posted + ' buy enabled again=' + back);
    } catch (e) {
      check('checkout-product-declined-flow-completes', false, String(e).split('\n')[0]);
    }
    errors.push(...pageErrors);
    await context.close();
  }

  // ---- product.html: an email link is not a checkout leaving ----
  // Chromium fires beforeunload for a mailto: link, and the page stays. After
  // an attempt that ended on the page, a click on the address in the footer
  // used to count as the page leaving for a checkout, and the next Buy was
  // swallowed for twenty seconds: "Opening checkout…" and no POST.
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    const pageErrors = collectErrors(page);
    const answers = answerQueue();
    const here = '/product.html?id=everyday-tee&size=M';
    const seen = await mockPlatform(page, { origin, checkout: heldCheckout(answers), payUrl: (id) => here + '#pay-' + id });
    try {
      await page.goto(origin + here);
      await page.waitForSelector('#group-store a[data-item]', { state: 'attached' });
      await page.locator('#buy').click();
      await page.waitForTimeout(400);
      answers.give({});
      answers.give({});
      const back = await until(page, () => {
        const b = document.getElementById('buy');
        return b && !b.disabled && !b.hasAttribute('aria-busy');
      }, null, 5000);
      await page.waitForTimeout(1500); // the shopper reads the page, then writes to us
      await page.locator('footer a[href^="mailto:"]').click();
      await page.waitForTimeout(300);
      const before = seen.checkoutPosts.length;
      answers.give({ url: origin + '/index.html#checkout-opened' });
      await page.locator('#buy').click();
      const deadline = Date.now() + 3000;
      while (seen.checkoutPosts.length === before && Date.now() < deadline) await page.waitForTimeout(100);
      check('checkout-product-buy-posts-after-email-link', back && seen.checkoutPosts.length === before + 1,
        'buy back after declined attempt=' + back + ' POSTs after the email link and Buy=' + (seen.checkoutPosts.length - before));
    } catch (e) {
      check('checkout-product-email-link-flow-completes', false, String(e).split('\n')[0]);
    }
    errors.push(...pageErrors);
    await context.close();
  }

  // ---- index.html: the shop panel's own rows ----
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    const pageErrors = collectErrors(page);
    const answers = answerQueue();
    const seen = await mockPlatform(page, { origin, checkout: heldCheckout(answers), payUrl: (id) => '/index.html#pay-' + id });
    try {
      await page.goto(origin + '/index.html');
      const cap = '#group-store a[data-item="classic-cap"]';
      const scarf = '#group-store a[data-item="lambswool-scarf"]';
      await page.waitForSelector(cap);
      const before = page.url();
      await page.$eval(cap, (a) => a.click());
      await page.waitForTimeout(300);
      const held = await page.$eval(scarf, (a) => a.getAttribute('aria-disabled'));
      check('checkout-panel-rows-held-in-flight', held === 'true', 'other row aria-disabled=' + held);

      await page.$eval(cap, (a) => a.click());
      await page.$eval(scarf, (a) => a.click());
      await page.waitForTimeout(600);
      check('checkout-panel-no-second-post-in-flight', seen.checkoutPosts.length === 1,
        'POSTs=' + seen.checkoutPosts.length);
      check('checkout-panel-no-navigation-in-flight', page.url() === before, 'url=' + page.url());

      answers.give({});
      const released = await until(page, () => !document.querySelector('#group-store [aria-disabled="true"]'), null, 5000);
      check('checkout-panel-rows-back-after-attempt', held === 'true' && released,
        'rows were held=' + (held === 'true') + ' released=' + released);
    } catch (e) {
      check('checkout-panel-flow-completes', false, String(e).split('\n')[0]);
    }
    errors.push(...pageErrors);
    await context.close();
  }

  // ---- products.html: the Buy button on a one-size card ----
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    const pageErrors = collectErrors(page);
    const answers = answerQueue();
    const seen = await mockPlatform(page, { origin, checkout: heldCheckout(answers) });
    try {
      await page.goto(origin + '/products.html');
      const btn = '#catalogue-grid [data-product-id="classic-cap"] button[data-item]';
      await page.waitForSelector(btn);
      const before = page.url();
      await page.$eval(btn, (b) => b.click());
      await page.waitForTimeout(300);
      const disabled = await page.$eval(btn, (b) => b.disabled);
      check('checkout-card-button-disabled-in-flight', disabled === true, 'disabled=' + disabled);
      await page.$eval(btn, (b) => { b.click(); b.click(); });
      await page.waitForTimeout(600);
      check('checkout-card-no-second-post-in-flight', seen.checkoutPosts.length === 1 && page.url() === before,
        'POSTs=' + seen.checkoutPosts.length + ' url=' + page.url());
      answers.give({ url: origin + '/index.html#checkout-opened' });
    } catch (e) {
      check('checkout-card-flow-completes', false, String(e).split('\n')[0]);
    }
    errors.push(...pageErrors);
    await context.close();
  }

  check('checkout-no-page-errors', errors.length === 0, errors.join(' | '));
  return results;
};
