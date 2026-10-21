/*
 * SEO and performance flow.
 *
 *   - every page at the root carries a meta description and the Open Graph
 *     tags a link preview is built from;
 *   - the product grids do not move what is on screen as they fill — measured
 *     with the browser's own layout-shift entries, while scripts/products.js
 *     arrives late, as it does on a slow connection (which is when the grid is
 *     filled after the first paint);
 *   - the cloth photographs of cards below the fold are not fetched until the
 *     reader scrolls towards them;
 *   - every <img> the pages build carries width and height, a srcset sized to
 *     its layout, and lazy loading unless it is above the fold.
 */
const fs = require('fs');
const path = require('path');
const { mockPlatform, collectErrors } = require('./flow-helpers');

const ROOT = path.join(__dirname, '..');
const OG = ['og:title', 'og:description', 'og:type', 'og:url', 'og:site_name'];

function metaContent(html, attr, key) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const k = tag.match(new RegExp('\\b' + attr + '="([^"]*)"', 'i'));
    if (k && k[1] === key) {
      const c = tag.match(/\bcontent="([^"]*)"/i);
      return c ? c[1].trim() : '';
    }
  }
  return null;
}

async function layoutShift(browser, origin, target, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__shift = { score: 0, sources: [] };
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.hadRecentInput) continue;
        window.__shift.score += e.value;
        e.sources.forEach((s) => window.__shift.sources.push(s.node ? (s.node.id || s.node.className || s.node.nodeName) : '?'));
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await mockPlatform(page, { origin, slow: { match: /\/scripts\/products\.js$/, ms: 400 } });
  await page.goto(origin + target);
  await page.waitForSelector('#catalogue-grid a.card, #featured-grid a.card');
  await page.waitForTimeout(2500); // the shop panel answers and reconciles
  const shift = await page.evaluate(() => window.__shift);
  await context.close();
  return shift;
}

module.exports = async function seoPerf(browser, origin) {
  const results = [];
  const check = (name, ok, detail) => results.push({ name, ok: !!ok, detail: detail || '' });

  // ---- meta description and Open Graph on every page ----
  const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')).sort();
  check('seo-pages-found', pages.length >= 6, pages.join(' '));
  for (const file of pages) {
    const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const missing = [];
    if (!metaContent(html, 'name', 'description')) missing.push('description');
    OG.forEach((key) => { if (!metaContent(html, 'property', key)) missing.push(key); });
    const url = metaContent(html, 'property', 'og:url') || '';
    if (url && !/^https:\/\/[^/]+\//.test(url)) missing.push('og:url not absolute https: ' + url);
    const title = (html.match(/<title>([^<]*)<\/title>/i) || [])[1];
    if (title && metaContent(html, 'property', 'og:title') !== title) missing.push('og:title differs from <title>');
    check('seo-meta-' + file, missing.length === 0, missing.length ? 'missing: ' + missing.join(', ') : '');
  }

  // ---- no layout shift as the product grids fill ----
  const cases = [
    ['/products.html', { width: 390, height: 844 }],
    ['/products.html', { width: 1280, height: 800 }],
    ['/index.html', { width: 390, height: 844 }],
    ['/index.html', { width: 1280, height: 800 }],
  ];
  for (const [target, vp] of cases) {
    const s = await layoutShift(browser, origin, target, vp);
    check('perf-no-layout-shift' + target.replace(/\W+/g, '-') + vp.width + 'x' + vp.height,
      s.score < 0.001, 'CLS=' + s.score.toFixed(4) + ' moved: ' + s.sources.join(', '));
  }

  // ---- cloth below the fold waits for the scroll ----
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const errors = collectErrors(page);
    const seen = await mockPlatform(page, { origin });
    await page.goto(origin + '/products.html');
    await page.waitForSelector('#catalogue-grid a.card');
    await page.waitForTimeout(1500);
    const total = await page.evaluate(() => window.Threadline.products.length);
    const atLoad = new Set(seen.imageRequests).size;
    check('perf-cloth-below-fold-not-fetched-on-load', atLoad > 0 && atLoad < total,
      'photographs fetched on load=' + atLoad + ' of ' + total);
    for (let y = 0; y < 8; y++) {
      await page.mouse.wheel(0, 700);
      await page.waitForTimeout(250);
    }
    await page.waitForTimeout(800);
    const scrolled = new Set(seen.imageRequests).size;
    const unworn = await page.$$eval('#catalogue-grid svg image', (els) => els.filter((i) => !i.getAttribute('href')).length);
    check('perf-cloth-fetched-on-scroll', scrolled === total && unworn === 0,
      'after scrolling=' + scrolled + ' of ' + total + ', drawn garments without cloth=' + unworn);
    check('perf-no-console-errors', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // ---- <img>: dimensions, srcset, lazy below the fold ----
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await mockPlatform(page, { origin });
    await page.goto(origin + '/product.html?id=everyday-tee');
    await page.waitForFunction(() => document.getElementById('product-image').getAttribute('src'));
    const hero = await page.$eval('#product-image', (i) => ({
      w: i.getAttribute('width'), h: i.getAttribute('height'), srcset: i.srcset, sizes: i.sizes, loading: i.loading,
    }));
    check('perf-product-image-responsive',
      hero.w && hero.h && hero.srcset.split(',').length >= 2 && hero.sizes && hero.loading !== 'lazy',
      JSON.stringify(hero));

    // The plain <img> a card and a look fall back to without garment.js.
    const fallbacks = await page.evaluate(() => {
      const T = window.Threadline;
      const draw = T.garment3d, rack = T.lookRack;
      T.garment3d = undefined; T.lookRack = undefined;
      try {
        const card = T.card(T.products[0]).querySelector('img');
        const look = T.lookFigure(T.looks()[0]).querySelector('img');
        return [card, look].map((i) => i && ({
          w: i.getAttribute('width'), h: i.getAttribute('height'), srcset: i.srcset, sizes: i.sizes, loading: i.loading,
        }));
      } finally { T.garment3d = draw; T.lookRack = rack; }
    });
    const goodFallback = (i) => i && i.w && i.h && i.srcset.split(',').length >= 2 && i.sizes && i.loading === 'lazy';
    check('perf-card-fallback-image-responsive', goodFallback(fallbacks[0]), JSON.stringify(fallbacks[0]));
    check('perf-look-fallback-image-responsive', goodFallback(fallbacks[1]), JSON.stringify(fallbacks[1]));
    await context.close();
  }

  return results;
};
