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
  it to a look: assertion 14 in `tests/payments-widget.test.html` fails if a
  look names an unknown id or if a catalogue piece appears in no look.
- `styles/main.css` is the only stylesheet; every page links it. No frameworks.
  `styles/size-guide.css` is retired and simply imports `main.css`.
- `payments-widget.js` is the group's shop widget. Pages that sell carry the
  `<div id="group-store">` container from the `payments:` block in `.d8a`;
  the widget renders the group's items into it and owns the checkout POST,
  including its duplicate-click guard. The Buy button on `product.html` requires a size and
  then clicks the widget's own Buy link for that item, so there is still exactly
  one checkout request per purchase. The chosen size is written to the URL
  (`?id=…&size=M`) so it survives the round trip to checkout and back.
  The widget sells for one group slug: `GROUP` at the top of `payments-widget.js`
  must equal the slug in `.d8a` (`group: d8a:d8aaaa-batch_threadline`), and the
  shop pages repeat it as `data-d8a-group`. If they ever disagree the panel says
  "There was an error loading the store (group …)" and names the slug it tried.

- New in the widget: a page author may optionally set a per-container platform
  base URL on the `#group-store` element using `data-d8a-base`. When present
  the widget uses that base for its API requests (items, checkout, verification)
  instead of the default hardcoded platform base. The attribute is validated
  and trimmed by the widget — only absolute http(s) URLs, protocol-relative
  URLs starting with `//`, and same-origin absolute paths starting with `/`
  are accepted. Example:

  <div id="group-store" data-d8a-group="d8aaaa-batch_threadline" data-d8a-base="https://staging.example">

  The attribute is optional and only used when it passes validation; otherwise
  the widget falls back to the global platform base. This is useful for local
  testing or pointing the widget at a staging platform instance.


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
