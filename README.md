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
| `index.html` | Landing page: header and nav, hero, featured products reconciled with the live shop, the group shop panel, about, size-guide link, contact, footer |
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
- The repaint itself is one shared helper: `Threadline.reconcileGrid(grid,
  index, options)` in `scripts/checkout-intent.js`. It walks the `.card`
  elements in a rendered grid, looks each one up in a `shopPriceIndex` (id
  first, title second), repaints `.price` when the shop's price really differs
  and adds `Price from the group shop.`, marks a card the shop has no row for
  with `Not in the shop yet.`, clears the note from a card that agrees, and
  returns the number of unlisted cards. No index, or an index of size 0, means
  "the shop said nothing": the grid is left exactly as written and the answer is
  `0`. `index.html` and `products.html` both call it, so there is one
  implementation.
- `index.html` is wired into the shop the same way. It loads
  `scripts/checkout-intent.js` and `payments-widget.js` after
  `scripts/products.js`, carries its own `<div id="group-store"
  data-d8a-group="d8aaaa-batch_threadline" data-default-quantity="1">` in a
  store panel below the featured grid (the widget fills every `#group-store` it
  finds), waits for `whenBuyAnchor(panel, null, …)`, builds
  `shopPriceIndex(panel)` and calls `reconcileGrid` on `#featured-grid`,
  reporting any unlisted pieces in `#featured-status`. The panel is guarded with
  `guardBuyClicks`, so a featured sized garment goes to its product page instead
  of a sizeless checkout. Loading the widget here also means a buyer who returns
  to the home page with `?d8a_order=…` has the order verified and the receipt
  line shown, which only happened on the shop pages before.
- No sized garment can be bought without a size, from either page. The panel's
  own Buy links post a checkout for the platform item alone, so a click there
  used to pay for an Everyday Tee with no size on the order and none in the
  return URL. `Threadline.guardBuyClicks(container, decide)` (in
  `scripts/checkout-intent.js`) attaches a **capture-phase** click listener to
  `#group-store`, so it runs before `payments-widget.js`'s own bubbling handler;
  when `decide` returns true it calls `preventDefault()` and `stopPropagation()`
  and the checkout is never posted. `Threadline.productForAnchor(anchor)` maps a
  row back to the catalogue (normalised item id first, row title second) and
  `Threadline.needsSize(product)` is true when `product.sizes.length > 1`.
  `products.html` sends a sized row to `product.html?id=…`; `product.html` says
  "Choose a size first." and focuses the size buttons for this piece, sends
  another sized piece to its own page, and lets the click through once a size is
  chosen — so the Buy button's own path is unchanged. One-size pieces (Classic
  Cap, Lambswool Scarf) and rows with no catalogue match behave exactly as
  before, and modified clicks (ctrl/cmd/shift/alt, middle click, `target=_blank`)
  are always passed through.
- The chosen size now travels with the money. The platform item is sizeless, so
  a paid order used to reach the group's Admin tab as "Everyday Tee ×1" with no
  size on it. `product.html` stamps the widget's own row immediately before it
  is clicked — `data-size="M"` and `data-d8a-note="Everyday Tee - size M"` — in
  `openCheckout` and on the pass-through branch of the panel guard, so the value
  posted is always the size on screen. `payments-widget.js` reads those two
  attributes off the anchor (trimmed, whitespace-collapsed, capped at 40 and 140
  characters), adds `size` and `note` to the checkout JSON **only when present**,
  and includes the note in the duplicate-checkout key
  (`group::item::qty::note`), so a second click for a different size is a
  different purchase. If the first POST answers without a `url` the widget
  retries **once** with exactly the body it used to send, before the existing
  anchor-href fallback — the cover for a platform that refuses unknown fields.
  An anchor with no attributes posts an unchanged body. The receipt line on
  `product.html` also offers a prefilled `mailto:hello@threadline.example`
  carrying the order id, the piece and the size, so fulfilment is possible even
  if the platform stored no note.
- `tests/payments-widget.test.html` is the browser test for the widget; open it
  at http://localhost:5004/tests/payments-widget.test.html while the site is
  served. Its `intent-group` fixture answers late on purpose, to prove a queued
  Buy intent still opens exactly one checkout; the `checkout-group` fixture is
  also read (not clicked) to check `buyRowPrice`, the "rows, but not this
  piece" case, `shopPriceIndex` (matched by id and by name, unlisted piece,
  empty panel) and `samePrice`'s tolerance. Its `guard-group` fixture lists one
  sized row and one one-size row against a stub catalogue: the sized row must
  produce no checkout POST and leave the anchor untouched, the one-size row must
  still post exactly once. Its `note-group` fixture stamps a row with
  `data-size`/`data-d8a-note` and clicks it, then reads the recorded request
  bodies: the first POST must carry `size` and `note`, a url-less answer must
  produce exactly one plain retry, and the unstamped `checkout-group` body must
  still have only `group,item,quantity,returnUrl`. Its `reconcile-grid`
  fixture builds catalogue-shaped cards and reconciles them against the
  `checkout-group` index: a stale price is repainted and noted, a card showing
  the same money in another shape is left alone, an unlisted card is flagged and
  counted, a card that stops disagreeing loses its note, and an empty (or
  missing) index leaves the grid untouched and returns `0`.

`.d8a` declares the group, the run entry and the payments block. Do not hand-edit
its generated blocks.
