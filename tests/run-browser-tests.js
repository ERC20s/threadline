#!/usr/bin/env node
/*
 * Headless runner for the browser test pages in tests/.
 *
 * Serves the repository root exactly as the `site` run entry in .d8a does
 * (serve on port 5004, which reads serve.json), opens each *.test.html page in
 * Chromium and collects the "PASS — name" / "FAIL — name" rows the pages print
 * into #results.
 * A page is done once no new result has appeared for a few seconds.
 *
 * Exits non-zero when any assertion fails, when a page reports no results at
 * all, when a page throws an uncaught error, or when a page navigates away
 * (which would take its results with it).
 *
 * Then it runs the Playwright flows in FLOWS (tests/<name>.flow.js): each
 * module drives the real pages itself and resolves with its own
 * { name, ok, detail } results, reported and counted the same way.
 *
 *   npm test
 */
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PORT = 5004;
const ORIGIN = 'http://localhost:' + PORT;
const PAGES = ['cart', 'product-page-sanity', 'payments-widget'];
const FLOWS = ['smoke', 'checkout', 'seo-perf'];
const QUIET_MS = 4000;     // no new result for this long = page finished
const MAX_MS = 60000;      // hard limit per page

function startServer() {
  const bin = path.join(ROOT, 'node_modules', '.bin', 'serve');
  // --no-port-switching: never test against some other server on PORT.
  return spawn(bin, ['-l', String(PORT), '--no-port-switching', '.'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
}

async function portInUse() {
  try { await fetch(ORIGIN + '/'); return true; } catch (e) { return false; }
}

async function waitForServer(timeoutMs) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const r = await fetch(ORIGIN + '/');
      if (r.ok) return;
    } catch (e) { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('serve did not answer on ' + ORIGIN + ' within ' + timeoutMs + 'ms');
}

async function runPage(browser, name) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const url = ORIGIN + '/tests/' + name + '.test.html';
  await page.goto(url);

  let results = [];
  let lastChange = Date.now();
  const started = Date.now();
  while (Date.now() - started < MAX_MS && Date.now() - lastChange < QUIET_MS) {
    await page.waitForTimeout(500);
    const now = await page.$$eval('#results > .case', (rows) => rows
      .map((r) => r.textContent.trim())
      .filter((t) => /^(PASS|FAIL) — /.test(t)));
    if (now.length !== results.length) { results = now; lastChange = Date.now(); }
  }

  const problems = results.filter((r) => r.startsWith('FAIL'));
  if (!results.length) problems.push('FAIL — no results: the page printed no PASS/FAIL lines');
  const landed = page.url().split('#')[0];
  if (landed !== url) problems.push('FAIL — navigated away: page ended on ' + page.url());
  errors.forEach((e) => problems.push('FAIL — uncaught page error: ' + e));
  await page.close();
  return { name, passed: results.length - results.filter((r) => r.startsWith('FAIL')).length, problems };
}

async function runFlow(browser, name) {
  let results;
  try {
    results = await require('./' + name + '.flow.js')(browser, ORIGIN);
  } catch (e) {
    results = [{ name: name + '-flow-runs', ok: false, detail: String(e) }];
  }
  const problems = results.filter((r) => !r.ok).map((r) => 'FAIL — ' + r.name + (r.detail ? ' — ' + r.detail : ''));
  if (!results.length) problems.push('FAIL — no results: the flow returned no assertions');
  return { name: name + ' (flow)', passed: results.filter((r) => r.ok).length, problems };
}

(async () => {
  if (await portInUse()) {
    console.error('Port ' + PORT + ' is already in use; stop that server first so the tests run against this checkout.');
    process.exit(1);
  }
  const server = startServer();
  let failed = false;
  try {
    await waitForServer(20000);
    const browser = await chromium.launch();
    try {
      const report = (r) => {
        console.log(r.name + ': ' + r.passed + ' passed, ' + r.problems.length + ' failed');
        r.problems.forEach((p) => console.log('  ' + p));
        if (r.problems.length) failed = true;
      };
      for (const name of PAGES) report(await runPage(browser, name));
      for (const name of FLOWS) report(await runFlow(browser, name));
    } finally {
      await browser.close();
    }
  } catch (e) {
    console.error(e);
    failed = true;
  } finally {
    server.kill();
  }
  process.exit(failed ? 1 : 0);
})();
