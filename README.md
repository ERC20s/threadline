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
| `product.html` | One piece, chosen with the `?id=` query parameter (`/product/<id>` and `#<id>` also resolve): the garment as a lit 3D mesh you can drag to turn (with a Garment / Fabric toggle), description, details, size selection, Buy |
| `lookbook.html` | Six looks rendered from the catalogue: each is a rail of the garments it wears, drawn, and every piece named is linked with its price |
| `size-guide.html` | Body measurements, garment measurements (tops, bottoms, dresses, outerwear and knitwear), the one-size pieces and how to measure |

## How it fits together

- `scripts/products.js` is the single catalogue. It defines `window.Threadline`
  (`products`, `byId`, `featured`, `related`, `money`, `renderGrid`). Add, remove
  or reprice a garment there and every page follows — and list it for sale in the
  `items:` block of the root `.d8a` in the same change, with the same name and
  price, because that block is what the group actually sells. Images are placeholder URLs
  (picsum.photos, seeded); `scripts/garment.js` wraps them onto a drawn garment
  rather than passing them off as one, so a piece with no photography still
  looks like the thing it is. Replace the `image` values with real photography
  when there is some — nothing else has to change.
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
- `scripts/garment.js` draws the garments. The `image` values in the
  catalogue are placeholder photographs (picsum, seeded), so a card that
  simply showed one was a picture of the wrong thing: a sunset stood in for
  the Everyday Tee and a night skyline for the Relaxed Shirt. This file draws
  the piece in its own shape instead and wraps that photograph onto it as the
  cloth. It runs on every page that shows a piece — the grids, the product
  page and the lookbook — and it must be loaded **after** `scripts/products.js`,
  which assigns `window.Threadline` outright and would wipe these helpers.
  Its surface: `garmentShape(product)`, `garment3d(product, opts)` (the
  layered scene), `garmentSVG(product)` (one flat `<svg>`), `renderGarment(el,
  product)`, `lookRack(pieces)` and `GARMENT_SHAPES`.

  What is drawn is four planes in a `transform-style: preserve-3d` scene —
  the rear panel, the body carrying the cloth through a clip path, the
  sleeves, and the seams, buttons and cuffs nearest the viewer — so the
  sleeves and the collar move against the body as it turns. It turns towards
  the pointer on the product page, follows a drag, and answers the arrow keys
  (Home or Escape re-centres it). `prefers-reduced-motion` takes away the
  hover chase and the easing and nothing else: a drag or an arrow key is the
  reader's own doing and still turns the garment.

  Geometry is parametric, not eleven hand-drawn silhouettes: one torso builder
  takes shoulder, chest, waist and hem half-widths plus a sleeve length and
  returns the torso and the two sleeves as separate paths, so every top — tee,
  longsleeve, shirt, overshirt, knit, hoodie, jacket, dress — is that builder
  with different numbers and a fix to the armhole fixes all of them. Pants,
  the cap and the scarf have their own small builders. Which shape a piece is
  drawn as comes from `GARMENT_SHAPES`, keyed by catalogue id, with the
  category as the fallback: **a new garment needs a line there in the same
  change**, and `tests/payments-widget.test.html` fails
  (`garment-shape-per-piece`) if one is missing. `garment-every-piece-drawn`
  fails if any catalogue entry does not render a body path and its cloth, and
  `garment-clip-ids-unique` guards the per-instance clip ids — two cards in
  one grid sharing an id would make the second wear the first's shape.

  Everything is built with `createElementNS`, never `innerHTML`, and every
  page keeps a fallback: with `garment.js` absent the cards render the plain
  `<img>` they always did, the lookbook renders its placeholder photograph,
  and `product.html` shows the photograph with no toggle.

- `scripts/garment3d.js` builds the same garments as real geometry, with
  three.js. The SVG renderer stacks flat panels on parallel planes, which is a
  good trick but still a trick; this one lofts a torso with a front, a back
  and two sides, tubes for the sleeves, a shell for a hood, and lights the lot
  in a scene. Turning one turns an object.

  It is an **upgrade, never a requirement**. `garment.js` draws first and this
  module runs after it, replacing the SVG scene inside a stage only once the
  mesh and its texture are both ready — and only then is the drawing stood
  down (`.g3d[data-mode="webgl"]`), so there is never a moment with nothing on
  screen. No WebGL, a texture the image host will not share cross-origin, a
  lost context: every one of those leaves the drawn garment exactly where it
  was. That is the whole reason `garment.js` is still the renderer every page
  loads first, and why it must stay.

  Geometry is parametric here too. `loft()` skins a stack of rings — half
  width, half depth, roundness, centre offset — smoothed with a Catmull-Rom;
  a torso, a sleeve, a trouser leg and a dress skirt are all that one
  function. `surface()` is a parametric patch for the rest: a hood, a cap
  crown and peak, a scarf. The shapes live in `SHAPES`, keyed exactly as
  `Threadline.garmentShape` keys the drawings, so the two renderers can never
  disagree about what a piece is. **A garment added to the catalogue needs a
  shape in `garment.js` and rings here, under the same key** — the
  `garment3d-shapes-cover-catalogue` assertion fails if the second is missing,
  because without it the piece is quietly built as a tee.

  UVs are the interesting part. Cloth is cut flat and then wrapped, so `u`
  runs by **arc length** around each ring rather than by x — no pinching where
  the surface turns away from the viewer — and it runs as a triangle wave, so
  the whole photograph lies across the front and again, mirrored, across the
  back. That is what an all-over print looks like. Trims are cut from the
  cloth they sit on (`bodyUVRect`): without that a chest pocket carries a
  complete copy of the picture shrunk to pocket size.

  One `WebGLRenderer` serves the whole page. A browser hands out roughly a
  dozen WebGL contexts before it starts discarding the oldest, and the shop
  page wants thirteen garments at once, so the shared renderer draws into its
  own canvas and every view copies that frame into a plain 2D canvas of its
  own. Frames are drawn **on demand** — turned, resized, first revealed —
  never on a loop, and a garment is not built at all until it is near the
  viewport.

  Input is not duplicated. `garment.js` owns the pointer, the drag and the
  arrow keys and calls `stage.__garmentTurn(rx, ry)` on every change; this
  module installs that hook. One input implementation, two renderers, and the
  `garment3d-turn-reaches-the-mesh` assertion holds them together.

  Two doors exist for callers that cannot wait for the browser:
  `Threadline.garment3dNow(stage)` builds and draws one stage immediately, and
  `Threadline.garment3dDraw()` draws every garment waiting for a frame. A tab
  that is not the visible one is given neither IntersectionObserver callbacks
  nor animation frames — right for a shop opened in a background tab, fatal
  for a test page, which usually is not the visible tab either.

- `vendor/three.module.min.js` is three.js r160, checked in rather than pulled
  from a CDN, with its MIT licence beside it in `vendor/three.LICENSE`. The
  promise at the top of this file is that serving the folder is enough; a shop
  whose product images go flat when someone else's CDN is unreachable would
  not keep it. It is the only third-party code here, it is loaded by exactly
  one file, and there is still no build step: `garment3d.js` is a
  `<script type="module">`, which is also why it always runs after the classic
  scripts that build `window.Threadline`.

- `styles/main.css` also carries a dark theme. The palette is a block of
  custom properties on `:root` and a `prefers-color-scheme: dark` block that
  repoints them; nothing else in the file names a colour that is not a token,
  with one deliberate exception. `#group-store` stays a light card because
  `payments-widget.js` writes inline `#111` and `#6b7280` into it and this
  repository does not own that file — so keep new rules on the tokens.
  The product grid names a minimum track width rather than a column count
  (`repeat(auto-fill, minmax(…))`, 150px on a phone and 220px from 560px up),
  which is what stopped a card's blurb running out of its column on a narrow
  screen; `.card` carries `min-width:0` for the same reason.

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

## Running the tests

Serve the repository root and open `tests/payments-widget.test.html`. It is a
browser-run suite: every assertion prints PASS or FAIL on the page, and the
fixtures mock `fetch`, so nothing leaves the machine.

The fixture items deliberately carry pay URLs that point back at the test page
with a fragment. They used to be absolute `d8a.com` URLs, and because the
checkout mock never settles the widget reached its href fallback and the
browser left for `d8a.com/pay/c1` — taking every result on the page with it, so
the suite could not actually be read. Nothing asserts on those URLs; they only
have to be somewhere the widget is willing to send a shopper.

`tests/product-page-sanity.test.html` is the other, smaller guardrail: it
fetches `product.html` and `scripts/cart.js` as text and checks for markers a
past change removed by accident.

.d8a declares the group, the run entry and the payments block. Do not hand-edit
its generated blocks.
