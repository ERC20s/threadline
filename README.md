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
| `lookbook.html` | Six looks rendered from the catalogue, every piece named in a look linked with its price |
| `size-guide.html` | Body measurements, garment measurements (tops, bottoms, dresses, outerwear and knitwear), the one-size pieces and how to measure |

## How it fits together

- `scripts/products.js` is the single catalogue. It defines `window.Threadline`
  (`products`, `byId`, `featured`, `related`, `money`, `renderGrid`). Add, remove
  or reprice a garment there and every page follows — and list it for sale in the
  `items:` block of the root `.d8a` in the same change, with the same name and
  price, because that block is what the group actually sells. Images are placeholder URLs
  (picsum.photos, seeded) — replace the `image` values with real photography.
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
  it to a look: assertion 14 in `tests/payments-widget.test.html` fails if a
  look names an unknown id or if a catalogue piece appears in no look.
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
- `product.html`'s "You might also like" grid comes from
  `Threadline.related(product, limit, list)` in `scripts/products.js`. It fills
  four slots in three passes, each in catalogue order: the piece's own category
  first, then featured pieces, then whatever is left — never the piece itself,
  never a duplicate. The old inline filter
  (`p.id !== product.id && (p.category === product.category || p.featured)`)
  kept catalogue order, and the first four entries in the catalogue are all
  featured, so those four filled the grid on nearly every page and the Rigid
  Denim Jacket never suggested the Canvas Overshirt. The page also runs the
  shared reconcile pass over `#related-grid` (and over `#fallback-grid` on the
  "not found" branch) once the shop panel has rendered, so suggestion cards
  carry live shop prices and "Not in the shop yet." like every other grid.
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
  to the home page with `?d8a_order=…` has the order verified, and a
  `group-store:paid` handler renders the full receipt into `#featured-status`
  (see the shared receipt below).
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
- A `?size=` on `product.html` is only used when the piece is really made in it.
  `Threadline.resolveSize(product, requested)` (in
  `scripts/checkout-intent.js`) returns a size from `product.sizes` or `""`: a
  one-size piece always resolves to its single size, so nothing can override
  `One size`; otherwise the request is matched case- and punctuation-blind
  through `normaliseKey`, so `?size=m` selects `M` and `?size=XXL` selects
  nothing. `product.html` resolves the parameter before it paints the size
  buttons, then corrects the URL with `history.replaceState` (via the shared
  `putSizeOnUrl`, which also drops the parameter entirely when there is no
  size) so `payments-widget.js` cannot copy a refused value into its
  `returnUrl`. A rejected size says "We don't make that size — choose one
  below." and leaves Buy in its existing "Choose a size first." state.
- A category can be linked to. `products.html` builds its filter buttons from
  `Threadline.categories()` (in `scripts/products.js`: `"All"` first, then every
  category the catalogue really has, in catalogue order) and carries the chosen
  one in `?category=`. The parameter is shopper input, so it goes through
  `Threadline.resolveCategory(requested)` first — matched case- and
  punctuation-blind, exactly like `resolveSize` — which answers with a real
  category or with `"All"`: `?category=outerwear` opens Outerwear,
  `?category=nonsense` (or a category we stopped making) opens the whole
  collection instead of an empty grid. Clicking a filter rewrites the URL with
  `history.replaceState` through `putCategoryOnUrl`, which sets or **deletes
  only the `category` key** — every other parameter, above all a returning
  buyer's `?d8a_order=…`, is carried over untouched — and `All` drops the
  parameter rather than writing `?category=All`. A value that had to be
  corrected is rewritten on load, so the next link shared is one that works.
  The kicker on `product.html` is now a link to
  `products.html?category=<category>`, so a piece leads back to its own shelf.
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
  An anchor with no attributes posts an unchanged body. The receipt (see the
  next point) also offers a prefilled `mailto:hello@threadline.example` carrying
  the order id, the piece and the size, so fulfilment is possible even if the
  platform stored no note.
- A paid buyer gets a real confirmation wherever they come back. `payments-
  widget.js` verifies `?d8a_order=<id>` and fires `group-store:paid`, but its own
  line inside `#group-store` is only `Paid: <name> — order <id>` — on
  `products.html` that sits far below the fold, and `index.html` and
  `products.html` had no handler at all, although one-size pieces (Classic Cap,
  Lambswool Scarf) pass the size guard and really do check out there. Two shared
  helpers in `scripts/checkout-intent.js` now do it once for all three pages:
  `Threadline.productForOrder(order)` maps the order back to the catalogue
  (normalised `order.itemId`/`order.item` first, `order.itemName` second, `null`
  when we do not sell it), and `Threadline.renderReceipt(target, order, options)`
  writes `Thank you — order <id> is paid: <piece> [×qty][, size <S>]. A
  confirmation email is on its way.` into the page's status line, appends the
  prefilled `mailto:`, and sets `data-tone="ok"`. Options are `{ product, size,
  focus, tone, mailText }`. The element is stamped
  `data-receipt-order="<id>"`, so a second call for the same order returns the
  element already there instead of a second receipt, and
  `Threadline.receiptIn(target[, id])` lets a page check before it overwrites its
  own status line — `index.html`, `products.html` and `product.html` all use that
  so a late grid reconcile ("12 pieces in the collection.", "isn't listed in the
  shop panel yet") cannot wipe a confirmation. `index.html` renders into
  `#featured-status` and `products.html` into `#catalogue-status`, both with
  `focus: true`; `product.html` renders into `#buy-status` and passes the piece
  and the size it has on screen. An order for something not in the catalogue
  degrades to the platform's own `itemName`, never to a guess.
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
  missing) index leaves the grid untouched and returns `0`. Its `resolve-size`
  cases need no fixture at all: `"m"` must resolve to `"M"`, `"XXL"` and
  `"One size"` on a sized piece must resolve to `""`, a one-size piece must
  answer `"One size"` whatever is asked, and a missing or sizeless product must
  answer `""`. Its `resolve-category` cases need no fixture either (the page
  loads `scripts/products.js` before `scripts/checkout-intent.js` for them):
  `categories()` must start with `All` and list each category once,
  `"outerwear"` must resolve to `"Outerwear"`, junk/empty/`null` must resolve to
  `"All"`, every answer must be a category the filter buttons have, and the
  `?category=` rewrite must leave `?d8a_order=` alone. Its lookbook cases
  (assertion 14) render into a detached element: every id in `Threadline.LOOKS`
  must resolve through `byId`, every catalogue piece must be worn by at least
  one look, `looks()` must carry the catalogue name through, a stub look naming
  an id we do not make must print it without a link, and the real render must
  produce one `figure.look` per look with one priced link per named piece. Its
  receipt cases (assertion 16) render into a detached element against a
  two-entry catalogue stub that is restored immediately: a known item must be
  named from the catalogue and show `×2`, an item we do not sell must fall back
  to the order's own `itemName` and still show the size, the `mailto:` must carry
  `Order:`, `Piece:` and `Size:` correctly encoded, and a second
  `renderReceipt` for the same order id must return the element already there
  rather than a second receipt.

`.d8a` declares the group, the run entry and the payments block. Do not hand-edit
its generated blocks.
