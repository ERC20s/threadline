# threadline

Website for Threadline Clothing Co., a small clothing brand: home page, product
grid, product page, lookbook, size guide and contact.

## Run it

No build step, no dependencies. Serve the repository root:

```
npx --yes serve -l 5004 .
```

Then open http://localhost:5004/ — this is the `site` entry declared in `.d8a`.

`serve.json` at the repository root is that server's configuration and `serve`
reads it from the folder it serves. It exists for one reason: with clean URLs on
(the default) a request for `/product.html?id=everyday-tee` is answered with a
redirect to `/product`, and the query — the id of the piece — is dropped on the
way, so every product link lands on the not-found panel. The file therefore sets

```
"cleanUrls": false
```

and adds internal `rewrites` so `/`, `/index`, `/product`, `/product/<id>`,
`/products`, `/lookbook` and `/size-guide` still serve their `.html` files
without a redirect — extensionless links people already have keep working, and
nothing is redirected, so no query string is lost. If a run entry ever serves the
site from another directory, pass the config explicitly with
`serve -c serve.json`. A public host in front of the site can redirect on its
own; the fallback in `Threadline.productIdFromLocation` (below) is what saves the
link when it does.

## The pages

| File | What it is |
| --- | --- |
| `index.html` | Landing page: header and nav, hero, featured products reconciled with the live shop, the group shop panel, about, size-guide link, contact, footer |
| `products.html` | The catalogue: all pieces in a responsive grid with a category filter, each card links to `product.html?id=<id>` |
| `product.html` | One piece, chosen with the `?id=` query parameter (`/product/<id>` and `#<id>` also resolve): photo, description, details, size selection, Buy |
| `lookbook.html` | Six looks rendered from the catalogue, every piece named in a look linked with its price |
| `size-guide.html` | Body measurements, garment measurements (tops, bottoms, dresses, outerwear and knitwear), the one-size pieces and how to measure |

## How it fits together

- `scripts/products.js` is the single catalogue. It defines `window.Threadline`
  (`products`, `byId`, `featured`, `related`, `money`, `renderGrid`). Add, remove
  or reprice a garment there and every page follows — and list it for sale in the
  `items:` block of the root `.d8a` in the same change, with the same name and
  price, because that block is what the group actually sells. Images are placeholder URLs
  (picsum.photos, seeded) — replace the `image` values with real photography.
- Which piece `product.html` shows is decided by
  `Threadline.productIdFromLocation(location)` in `scripts/products.js`. Every
  link the site builds is `productUrl(p)` — `product.html?id=<id>` — so the query
  string is read first; when it is missing the helper falls back to the last path
  segment (`/product/everyday-tee`) and then to the fragment
  (`product.html#everyday-tee`). A candidate is only returned when `byId`
  resolves it, so an id we do not make still shows the not-found panel and the
  catalogue. `product.html` keeps its own inline `params.get("id")` read as a
  second fallback. `productFromLocation(loc)` is the same thing returning the
  piece. This is the belt to `serve.json`'s braces: it is what keeps a shared
  link working if a host outside this repository strips the query.
- Sizing help is part of the catalogue. Every entry in `scripts/products.js` may
  carry two optional fields: `sizeGuide`, the id of a section in
  `size-guide.html` (`body`, `tops`, `bottoms`, `dresses`, `outerwear`,
  `one-size`, `how`), and `fitNote`, one short sentence about how that piece
  fits. `product.html` rewrites the hint above the size buttons from them —
  the note, then a link to `size-guide.html#<sizeGuide>` — and falls back to
  "Fits run relaxed." plus a plain `size-guide.html` link when a piece names
  neither, so nothing breaks if the fields are dropped. An unknown `sizeGuide`
  value is treated as "no value". A one-size piece (Classic Cap, Lambswool
  Scarf) shows the label "One size" instead of "Choose a size" and links "See
  the one-size measurements". The section ids in `size-guide.html` are the
  contract between the two files: rename a section there and update the
  `sizeGuide` values here in the same change. `size-guide.html` also carries a
  jump list (`.guide-jump`) linking the same ids, and the dresses, outerwear /
  knitwear and one-size sections cover the Linen Summer Dress, the Canvas
  Overshirt, the Rigid Denim Jacket, the Merino Crew Knit and the two one-size
  pieces. As on the older tables, the numbers are illustrative — the note at
  the top of the page says so and must stay until real specs replace them.
- The lookbook is part of the catalogue too. `scripts/products.js` carries a
  `LOOKS` list — photo seed, alt text, a short note and the catalogue ids each
  look wears — plus `Threadline.looks()` (resolves the ids through `byId`) and
  `Threadline.renderLooks(el)` (builds the figures with DOM APIs, same style as
  `card`/`renderGrid`). `lookbook.html` is now an empty `.lookbook` container
  filled on load, so every piece named in a look is a link to
  `product.html?id=<id>` with the catalogue price, and nothing on the page is
  hand-copied. An id the catalogue no longer has is printed as plain text
  (`.look-piece-missing`) rather than as a dead link, and a `<noscript>` list of
  direct links mirrors the one in `products.html`. Adding a garment means adding
  it to a look: the `lookbook-pieces-resolve` and `lookbook-covers-catalogue`
  assertions in `tests/payments-widget.test.html` fail if a look names an
  unknown id or if a catalogue piece appears in no look. The same block
  (`catalogue-namespace-present`) fails if `window.Threadline` is missing or
  advertises a helper that is not defined — the way the whole site went blank
  when `productUrl`, `categories`, `related` and `looks` were lost from
  `scripts/products.js`.
- `styles/main.css` is the only stylesheet; every page links it. No frameworks.
  `styles/size-guide.css` is retired and simply imports `main.css`.
- `payments-widget.js` is the group's shop widget. Pages that sell carry the
  `<div id="group-store">` container from the `payments:` block in `.d8a`; the
  widget renders the group's items into it and owns the checkout POST, including
  its duplicate-click guard. The Buy button on `product.html` requires a size and
  then clicks the widget's own Buy link for that item, so there is still exactly
  one checkout request per purchase. The chosen size is written to the URL
  (`?id=…&size=M`) so it survives the round trip to checkout and back.
  The widget sells for one group slug: `GROUP` at the top of `payments-widget.js`
  must equal the slug in `.d8a` (`group: d8a:d8aaaa-batch_threadline`), and the
  shop pages repeat it as `data-d8a-group`. If they ever disagree the panel says
  "There was an error loading the store (group …)" and names the slug it tried.
- `scripts/checkout-intent.js` closes the early-click race. The widget only fills
  `#group-store` once its items request returns, so a shopper who clicks Buy in
  the first seconds used to be told the piece was not listed. The helper adds
  `Threadline.whenBuyAnchor(container, matchFn, timeoutMs)` (plus
  `findBuyAnchor` and `storePanelFailed`): it resolves with a matching
  `a[data-item]` that is already there, otherwise watches the container with a
  `MutationObserver` (interval fallback) and resolves when one appears, rejecting
  on the widget's failure line or after 12s. `product.html` queues the click,
  says "Fetching the shop — checkout will open in a moment…" and disables Buy
  while one intent is pending. It never posts to checkout itself — it clicks the
  widget's own link, so the widget's duplicate-checkout guard still applies.
- The same helper reconciles the page with the live shop on load, before anyone
  clicks. `Threadline.buyRowPrice(anchor)` returns the price the panel is
  showing for a row (the widget builds each row as
  `div > [div(name, description), span(price), a[data-item]]`, so the price is
  the anchor's previous sibling). `product.html` waits for
  `whenBuyAnchor(panel, null, …)` — no matchFn, meaning "rows have rendered" —
  and then: shows the shop's price in `#product-price` with a short note when it
  differs from the catalogue, or, when rows rendered but none match this piece,
  disables Buy and says it is not listed. If the panel fails or times out the
  page is left exactly as written and the queued-click path still applies.
  Prices are set on the group's Admin tab, so the shop always wins.

---

Payments widget: per-container base support

- The payments widget now allows a page author to opt a specific #group-store
  container into talking to a different platform base by adding
  `data-d8a-base="https://example.com"` on the element. The value is
  validated: only absolute http(s) URLs, protocol-relative `//host` URLs and
  same-origin absolute paths starting with `/` are accepted. Trailing slashes
  are dropped. If the value is absent or invalid no per-container base is used
  and the widget falls back to the global BASE (legacy behaviour).

- When a container declares a base the widget uses it for the items request
  that populates that container and for any relative checkout POST the widget
  must perform directly. The in-memory store fetch cache is now namespaced by
  `group::base` so containers talking to different bases do not share cached
  responses. The Retry control clears only the `group::base` cache entry for
  the container it was clicked in.

- Order verification (the `?d8a_order=` on-load flow and
  `window.groupStoreVerify(id[, group])`) is tightened so the widget only
  verifies against bases declared on containers that resolve to the same group
  being checked. For a given unnamed verification the widget builds the set of
  distinct (group, base) pairs from containers on the page and tries them
  sequentially; if no containers declare bases for that group the widget falls
  back to the global BASE for that group. When a receipt is rendered after a
  successful verification it is inserted only into containers whose resolved
  group and base match the verification result; a verification that matched the
  global BASE inserts receipts only into containers without a declared base.

- The existing public API `window.groupStoreVerify(id[, group])` is preserved;
  calling it with a group string still verifies against the global BASE only.

Risks and trade-offs

- Opt-in: page authors must add data-d8a-base to get per-container behaviour.
- Network surface: while this avoids blind probes of arbitrary hosts by only
  checking bases explicitly declared on containers, authors can still point a
  container at any host that passes the widget's validation. The platform side
  must respond as usual.

How to test

- Serve the site locally, add `data-d8a-base="https://staging.example"` to
  a `#group-store` container and confirm the GET `/api/v1/store/items` and any
  relative checkout POST use that base. Confirm storeFetch cache keys are
  `group::base` and that Retry clears only that entry.
- Return to the site with `?d8a_order=<id>` from a payment made at a
  per-container base: verify the widget checks only the declared bases for
  containers resolving to the order's group and that the receipt is inserted
  only into matching containers.

---

Read-only shop fallback (opt-in, on for the home and product pages)

- When the items request fails, a `#group-store` container that carries
  `data-d8a-fallback="readonly"` is filled by
  `renderReadOnlyCatalogue()` in `payments-widget.js` instead of the bare error
  line: one paragraph saying the shop is not answering and that this is a
  read-only catalogue whose prices may be out of date, then one row per piece
  from `window.Threadline.products` (name, one-line `blurb`, catalogue price,
  a "View" link to `product.html?id=…`), then a footer link to the group's page.
  Fallback rows deliberately carry no `data-item`, so nothing can be bought from
  them and the widget's buy listener ignores them.
- That paragraph also holds a real `[data-d8a-retry]` Retry button, the same
  control `renderMessageWithRetry()` draws. Clicking it clears this container's
  `group::base` cache entry and re-fetches, so a shopper can get back to the
  live shop without reloading. It is also the signal
  `Threadline.storePanelFailed()` (`scripts/checkout-intent.js`) reads, so
  `whenBuyAnchor` rejects at once instead of sitting out the 12s timeout.
- `index.html` and `product.html` opt in. `products.html` does not: its grid
  already lists every piece, so a second copy inside the panel would be noise.
- Covered in `tests/payments-widget.test.html` by the `fallback-test` fixture,
  whose items request fails once and then succeeds: the assertions check the
  outage wording, that no fallback row carries `data-item`, that a
  `[data-d8a-retry]` button is present, that `storePanelFailed()` sees it, and
  that clicking it re-fetches and renders the live row.

.d8a declares the group, the run entry and the payments block. Do not hand-edit
its generated blocks.
