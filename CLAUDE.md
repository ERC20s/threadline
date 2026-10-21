# CLAUDE.md

Threadline is the static website of Threadline Clothing Co. (home, catalogue, product page, lookbook, size guide).
Plain HTML/CSS/JS with no build step; the shop panel is the d8a group-store widget (`payments-widget.js`).

## Commands

```
npm ci        # install dev tooling (serve, playwright) from package-lock.json
npm start     # serve the site on http://localhost:5004/ (same as the `site` entry in .d8a's run: block)
npm test      # serve the site, run tests/*.test.html headlessly in Chromium, then the Playwright flows in tests/*.flow.js; non-zero on any FAIL
```

`npm test` needs a Chromium for Playwright (`npx playwright install chromium` once, unless one is preinstalled)
and port 5004 free. The test pages can also be opened by hand at
`http://localhost:5004/tests/<name>.test.html` while `npm start` runs. CI (`.github/workflows/ci.yml`) runs
`npm ci` and `npm test` on every push and pull request.

## Ground rules

- Work on a branch from `main`; one pull request per task, whose description lists the commands run and their results before and after.
- Never modify `.d8a` or `.d8a-governance`. Never modify the group-store widget markup/script copied from the `payments:` block of `.d8a` (`id="group-store"`, `groupStoreVerify` — i.e. `payments-widget.js`, `payments-block.js` and the `#group-store` markup in the pages).
- Ignore open pull requests by `d8a[bot]`: do not merge, close, rebase, cherry-pick from or comment on them.
- Do not add a LICENSE file or any licence text.
- Install dependencies and run the checks above before and after a change. Never report a result you did not get by running the command.
- Every new test must be able to fail: no `require(x >= 0)` on unsigned values, no bare `vm.expectRevert()`, no `try/catch` that accepts any error, no asserting a value equals itself. Import every symbol you use. If a test is wrong rather than the code, fix the test so it tests the real behaviour and say so.
- Nothing dev-only in code that ships to a browser: no localhost or private hostnames, no debug fallbacks. No secrets, tokens or keys in the repo.
- CI runs exactly the declared checks and must fail when one fails: no `continue-on-error`, no `|| true`, no skipped jobs counted as passing. Pin GitHub Actions to their current major versions.
- Keep changes focused: no reformatting of untouched files, no dependency upgrades you do not need, no renaming of public files or URLs, no rewriting of git history.
