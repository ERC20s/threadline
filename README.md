# threadline

Website for Threadline Clothing Co., a small clothing brand: home page, product
grid, product page, lookbook, size guide and contact.

## Run it

No build step, no dependencies. Serve the repository root:

```
npx --yes serve -l 5004 .
```

Then open http://localhost:5004/ — this is the `site` entry declared in `.d8a`.

## The pages

| File | What it is |
| --- | --- |
| `index.html` | Landing page: header and nav, hero, featured products, about, size-guide link, contact, footer |
| `products.html` | The catalogue: all pieces in a responsive grid with a category filter, each card links to `product.html?id=<id>` |
| `product.html` | One piece, chosen with the `?id=` query parameter: photo, description, details, size selection, Buy |
| `lookbook.html` | Six looks, each linking to the piece it shows |
| `size-guide.html` | Body measurements, garment measurements and how to measure |

## How it fits together

- `scripts/products.js` is the single catalogue. It defines `window.Threadline`
  (`products`, `byId`, `featured`, `money`, `renderGrid`). Add, remove or reprice
  a garment there and every page follows. Images are placeholder URLs
  (picsum.photos, seeded) — replace the `image` values with real photography.
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
- `products.html` does the same for the whole grid. It loads
  `scripts/checkout-intent.js` too, waits for the panel, then builds
  `Threadline.shopPriceIndex(panel)` once — a lookup keyed on the normalised
  platform item id and on the row title, so every card can be matched without
  searching the DOM per card. Cards carry `data-product-id` (set in
  `card()` in `scripts/products.js`); a card whose piece the shop prices
  differently is repainted with the shop's price, and a card with no matching
  row gets a soft "Not in the shop yet." note plus a count in the status line.
  The card link is never disabled and the grid is repainted after every filter
  click, because `renderGrid` rebuilds the cards each time. The tolerant price
  compare (`Threadline.samePrice`) is shared with `product.html`.
- `tests/payments-widget.test.html` is the browser test for the widget; open it
  at http://localhost:5004/tests/payments-widget.test.html while the site is
  served. Its `intent-group` fixture answers late on purpose, to prove a queued
  Buy intent still opens exactly one checkout; the `checkout-group` fixture is
  also read (not clicked) to check `buyRowPrice`, the "rows, but not this
  piece" case, `shopPriceIndex` (matched by id and by name, unlisted piece,
  empty panel) and `samePrice`'s tolerance.

`.d8a` declares the group, the run entry and the payments block. Do not hand-edit
its generated blocks.
