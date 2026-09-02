/* scripts/products.js — the Threadline catalogue.
 *
 * One source of truth for every page: index.html renders the featured cards
 * from it, products.html renders the full grid, product.html renders a single
 * item chosen with ?id=<id>, and lookbook.html renders the LOOKS list below
 * (every piece a look wears is linked from here, never hand-copied).
 * Plain browser JS, no build step, no framework.
 *
 * Images are placeholder URLs (picsum.photos, seeded so each item keeps the
 * same picture). Swap the `image` values for real photography before launch —
 * nothing else has to change.
 *
 * Two optional fields carry sizing help to product.html:
 *   sizeGuide — the id of a section in size-guide.html ("tops", "bottoms",
 *               "dresses", "outerwear", "one-size"). product.html links
 *               "Open the size guide" at size-guide.html#<sizeGuide>; with no
 *               value it links the page itself. Renaming a section id there
 *               means changing the values here.
 *   fitNote   — one short sentence about how this piece fits, shown above the
 *               size buttons. With no value the page falls back to
 *               "Fits run relaxed."
 */
(function (global) {
  "use strict";

  var img = function (seed, w, h) {
    return "https://picsum.photos/seed/threadline-" + seed + "/" + w + "/" + h;
  };

  var CLOTHING_SIZES = ["XS", "S", "M", "L", "XL"];
  var ONE_SIZE = ["One size"];

  var PRODUCTS = [
    {
      id: "everyday-tee",
      name: "Everyday Tee",
      price: 38,
      category: "Tops",
      featured: true,
      image: img("tee", 900, 1100),
      alt: "Model wearing the Threadline Everyday Tee",
      blurb: "Soft combed cotton, cut for a modern relaxed fit.",
      description: "The tee we make first every season. Mid-weight combed cotton that keeps its shape through the wash, with a slightly dropped shoulder and a clean twin-needle hem.",
      details: ["100% combed organic cotton, 180gsm", "Relaxed fit — size down for a closer cut", "Machine wash cold, dry flat"],
      sizes: CLOTHING_SIZES,
      sizeGuide: "tops",
      fitNote: "Cut relaxed with a dropped shoulder — size down for a closer fit."
    },
    {
      id: "relaxed-shirt",
      name: "Relaxed Shirt",
      price: 48,
      category: "Shirts",
      featured: true,
      image: img("relaxed-shirt", 900, 1100),
      alt: "Threadline Relaxed Shirt on a hanger",
      blurb: "An easy overshirt-weight button-down for every season.",
      description: "Washed cotton poplin with a soft collar and a single chest pocket. Roomy enough to layer over a tee, tidy enough to wear on its own.",
      details: ["Washed cotton poplin", "Boxy body, straight hem", "Corozo buttons"],
      sizes: CLOTHING_SIZES,
      sizeGuide: "tops",
      fitNote: "Boxy and roomy enough to layer over a tee — take your usual size."
    },
    {
      id: "lightweight-hoodie",
      name: "Lightweight Hoodie",
      price: 68,
      category: "Knitwear",
      featured: true,
      image: img("hoodie", 900, 1100),
      alt: "Threadline Lightweight Hoodie folded on a bench",
      blurb: "Loopback cotton that works indoors and out.",
      description: "A three-season hoodie in loopback cotton — warm without the bulk. Ribbed cuffs, a lined hood and a flat drawcord that stays put.",
      details: ["100% loopback cotton, 300gsm", "Ribbed cuffs and hem", "Unisex sizing"],
      sizes: CLOTHING_SIZES,
      sizeGuide: "outerwear",
      fitNote: "Unisex and cut to layer — take your usual size, or size up to wear a knit under it."
    },
    {
      id: "casual-pant",
      name: "Casual Pant",
      price: 58,
      category: "Bottoms",
      featured: true,
      image: img("pant", 900, 1100),
      alt: "Threadline Casual Pant photographed against a plain wall",
      blurb: "A tapered everyday trouser with a comfortable waist.",
      description: "Cotton twill with a touch of stretch, a half-elastic waistband and a taper that lands just above the ankle. Deep pockets, no fuss.",
      details: ["97% cotton, 3% elastane twill", "Half-elastic waistband", "Tapered leg, unfinished 32\" inseam"],
      sizes: CLOTHING_SIZES,
      sizeGuide: "bottoms",
      fitNote: "The half-elastic waist gives about an inch — take your usual size."
    },
    {
      id: "woven-shirt",
      name: "Woven Shirt",
      price: 52,
      category: "Shirts",
      featured: false,
      image: img("woven-shirt", 900, 1100),
      alt: "Threadline Woven Shirt with a textured weave",
      blurb: "Textured yarn-dyed cotton with a soft, lived-in hand.",
      description: "Yarn-dyed on a slow loom so the weave shows its texture. It arrives already soft and only gets better with wear.",
      details: ["Yarn-dyed cotton", "Regular fit", "Curved shirttail hem"],
      sizes: CLOTHING_SIZES,
      sizeGuide: "tops",
      fitNote: "A regular fit — closer than the Relaxed Shirt, so take your usual size."
    },
    {
      id: "classic-cap",
      name: "Classic Cap",
      price: 22,
      category: "Accessories",
      featured: false,
      image: img("cap", 900, 1100),
      alt: "Threadline Classic Cap in washed cotton",
      blurb: "Washed cotton six-panel with a soft, unstructured crown.",
      description: "An unstructured cap in washed cotton canvas with an embroidered Threadline stitch mark and a brass adjuster.",
      details: ["Washed cotton canvas", "Unstructured six-panel", "Brass slider, one size"],
      sizes: ONE_SIZE,
      sizeGuide: "one-size",
      fitNote: "One size — the brass slider covers a 22\" to 24\" head."
    },
    {
      id: "merino-crew",
      name: "Merino Crew Knit",
      price: 88,
      category: "Knitwear",
      featured: false,
      image: img("merino", 900, 1100),
      alt: "Threadline Merino Crew Knit sweater",
      blurb: "Fine-gauge merino that layers under anything.",
      description: "Fine-gauge merino spun by a small mill, knitted to a true crew neck. Warm, breathable and thin enough to sit under an overshirt.",
      details: ["100% extra-fine merino wool", "Fully fashioned shoulders", "Hand wash cool, dry flat"],
      sizes: CLOTHING_SIZES,
      sizeGuide: "outerwear",
      fitNote: "Fine-gauge and closer than our canvas layers — take your usual size, or size up to wear it over a shirt."
    },
    {
      id: "canvas-overshirt",
      name: "Canvas Overshirt",
      price: 94,
      category: "Outerwear",
      featured: true,
      image: img("overshirt", 900, 1100),
      alt: "Threadline Canvas Overshirt worn open",
      blurb: "The layer between a shirt and a coat.",
      description: "Heavy cotton canvas that softens as you wear it, with two patch pockets and a shirt collar. Our most-repaired, longest-lived piece.",
      details: ["10oz cotton canvas", "Two patch pockets", "Free repairs for five years"],
      sizes: CLOTHING_SIZES,
      sizeGuide: "outerwear",
      fitNote: "Cut to go over a shirt or a knit — take your usual size; size down if you want it as a shirt."
    },
    {
      id: "linen-dress",
      name: "Linen Summer Dress",
      price: 76,
      category: "Dresses",
      featured: false,
      image: img("linen-dress", 900, 1100),
      alt: "Threadline Linen Summer Dress",
      blurb: "Washed European linen, cut long and loose.",
      description: "A simple column in washed linen with side seam pockets and a hem that falls mid-calf. Cool in high summer, easy over a knit in autumn.",
      details: ["100% washed European linen", "Side seam pockets", "Machine wash cold"],
      sizes: CLOTHING_SIZES,
      sizeGuide: "dresses",
      fitNote: "Long and loose — take your usual size; the hem falls mid-calf at 5′7\"."
    },
    {
      id: "ribbed-longsleeve",
      name: "Ribbed Longsleeve",
      price: 44,
      category: "Tops",
      featured: false,
      image: img("longsleeve", 900, 1100),
      alt: "Threadline Ribbed Longsleeve top",
      blurb: "A close-fitting rib that holds its shape.",
      description: "A 2x1 cotton rib with long sleeves and a neat neckband — the base layer that carries the rest of the wardrobe through winter.",
      details: ["2x1 cotton rib", "Close fit", "Ribbed neckband"],
      sizes: CLOTHING_SIZES,
      sizeGuide: "tops",
      fitNote: "A close rib that stretches to fit — size up if you want it loose."
    },
    {
      id: "wool-scarf",
      name: "Lambswool Scarf",
      price: 46,
      category: "Accessories",
      featured: false,
      image: img("scarf", 900, 1100),
      alt: "Threadline Lambswool Scarf",
      blurb: "Woven in a small mill, finished with a hand-tied fringe.",
      description: "Lambswool woven in a single colourway with a hand-tied fringe. Generous enough to double over without bulk.",
      details: ["100% lambswool", "180cm x 30cm", "Hand-tied fringe"],
      sizes: ONE_SIZE,
      sizeGuide: "one-size",
      fitNote: "One size — 180cm x 30cm, long enough to double over."
    },
    {
      id: "denim-jacket",
      name: "Rigid Denim Jacket",
      price: 118,
      category: "Outerwear",
      featured: false,
      image: img("denim", 900, 1100),
      alt: "Threadline Rigid Denim Jacket",
      blurb: "Raw 12oz denim that fades to your own pattern.",
      description: "Unwashed 12oz selvedge denim, chain-stitched at the hem. It starts stiff and dark and becomes yours within a season.",
      details: ["12oz raw selvedge denim", "Chain-stitched hem", "Expect shrinkage on first wash"],
      sizes: CLOTHING_SIZES,
      sizeGuide: "outerwear",
      fitNote: "Raw denim: stiff at first and it shrinks about half a size on the first wash — size up if you plan to wash it hot."
    }
  ];

  var byId = function (id) {
    for (var i = 0; i < PRODUCTS.length; i++) {
      if (PRODUCTS[i].id === id) return PRODUCTS[i];
    }
    return null;
  };

  /* ---- the lookbook ------------------------------------------------------
     lookbook.html used to hard-code six <figure> blocks. Every caption named
     two garments but linked only one, and the names were copied by hand — so
     half the collection was named and unclickable, and a renamed id sent a
     shopper to the "not found" panel in product.html.

     The looks now live here, next to the catalogue they point at: each entry
     is a photo (seed + alt text) and the catalogue ids the look wears, in the
     order the caption should read them. Threadline.looks() resolves those ids
     through byId, so a name or a price only ever comes from the catalogue.
     An id we no longer make is kept as plain text (never a dead link), and
     tests/payments-widget.test.html fails if any id here does not resolve or
     if a catalogue piece appears in no look at all. */
  var LOOKS = [
    {
      seed: "look-1",
      alt: "Tee worn under an open canvas overshirt",
      note: "The tee under an open overshirt — the whole autumn, photographed in the studio.",
      image: img("look-1", 800, 1000),
      pieces: [ { product: byId("everyday-tee") }, { product: byId("canvas-overshirt") } ]
    },
    {
      seed: "look-2",
      alt: "Shirt tucked into casual pants",
      note: "A tidy shirt and tapered pant — city and country.",
      image: img("look-2", 800, 1000),
      pieces: [ { product: byId("relaxed-shirt") }, { product: byId("casual-pant") } ]
    },
    {
      seed: "look-3",
      alt: "Merino crew with denim jacket",
      note: "Layer the merino under the denim for the colder months.",
      image: img("look-3", 800, 1000),
      pieces: [ { product: byId("merino-crew") }, { product: byId("denim-jacket") } ]
    },
    {
      seed: "look-4",
      alt: "Linen dress with scarf",
      note: "Cool linen and a generous scarf — summer evenings.",
      image: img("look-4", 800, 1000),
      pieces: [ { product: byId("linen-dress") }, { product: byId("wool-scarf") } ]
    },
    {
      seed: "look-5",
      alt: "Lightweight hoodie and cap",
      note: "Casual and comfortable — the hoodie works all year.",
      image: img("look-5", 800, 1000),
      pieces: [ { product: byId("lightweight-hoodie") }, { product: byId("classic-cap") } ]
    },
    {
      seed: "look-6",
      alt: "Ribbed long sleeve under overshirt",
      note: "A close rib sits under a roomy overshirt — layering done right.",
      image: img("look-6", 800, 1000),
      pieces: [ { product: byId("ribbed-longsleeve") }, { product: byId("canvas-overshirt") } ]
    }
  ];

  var looks = function (list) {
    var src = list || LOOKS;
    return src.map(function (l) {
      var pieces = (l.pieces || []).map(function (p) {
        if (p && p.product) return { product: p.product };
        if (p && p.id) return { product: byId(p.id) };
        return { name: p && p.name ? p.name : String(p) };
      });
      return { seed: l.seed, image: l.image, alt: l.alt, note: l.note, pieces: pieces };
    });
  };

  var categories = function () {
    var cats = {};
    PRODUCTS.forEach(function (p) { cats[p.category] = true; });
    return Object.keys(cats).sort();
  };

  var ALL_CATEGORIES = categories();

  var resolveCategory = function (name) {
    if (!name) return null;
    name = String(name).trim();
    for (var i = 0; i < PRODUCTS.length; i++) {
      if (PRODUCTS[i].category === name) return name;
    }
    return null;
  };

  var related = function (p) {
    var cat = p && p.category ? p.category : null;
    if (!cat) return [];
    return PRODUCTS.filter(function (q) { return q.id !== p.id && q.category === cat; }).slice(0, 6);
  };

  var RELATED_LIMIT = 6;

  /*  Every link the site builds is productUrl(p) — "product.html?id=<id>" — and
      product.html used to read that id from the query string and nothing else:

        var params = new URLSearchParams(location.search);
        var product = T.byId(params.get("id") || "");

      A static server with clean URLs switched on answers /product.html with a
      redirect to the extensionless /product and drops the query on the way, so
      a shopper following a card or a shared link landed on the "We couldn't
      find that piece" panel. serve.json at the repository root turns that
      redirect off ("cleanUrls": false, plus internal rewrites so /product still
      serves product.html); this helper is the belt to that pair of braces and,
      as a bonus, makes /product/everyday-tee and product.html#everyday-tee
      resolve too.

      Order of preference: ?id= (what we link), then the last path segment, then
      the fragment. Each candidate is decoded and only returned when byId
      resolves it, so nothing a shopper types can put an unknown id on the page —
      an id we do not make still falls through to the not-found panel. */
  var decodeId = function (value) {
    var raw = String(value == null ? "" : value).trim();
    if (!raw) return "";
    try { return decodeURIComponent(raw.replace(/\+/g, " ")).trim(); }
    catch (err) { return raw; }
  };

  var productIdFromLocation = function (loc) {
    var l = loc || (typeof location !== "undefined" ? location : null);
    if (!l) return null;

    var candidates = [];

    /* 1. the query string, the way every link on the site is written. */
    var search = String(l.search || "");
    if (search) {
      var fromQuery = null;
      if (typeof URLSearchParams === "function") {
        try { fromQuery = new URLSearchParams(search).get("id"); } catch (err) { fromQuery = null; }
      }
      if (fromQuery == null) {
        var m = search.match(/[?&]id=([^&#]*)/);
        fromQuery = m ? m[1] : null;
      }
      if (fromQuery != null) candidates.push(decodeId(fromQuery));
    }

    /* 2. a trailing path segment: /product/everyday-tee. Segments that look
          like a file (product.html, index.html) are skipped — byId would
          refuse them anyway, this just keeps the intent readable. */
    var path = String(l.pathname || "");
    if (path) {
      var parts = path.split("/");
      for (var i = parts.length - 1; i >= 0; i--) {
        var seg = parts[i];
        if (!seg || seg.indexOf(".") !== -1) continue;
        candidates.push(decodeId(seg));
        break;
      }
    }

    /* 3. a fragment: product.html#everyday-tee. */
    var hash = String(l.hash || "").replace(/^#/, "");
    if (hash) candidates.push(decodeId(hash));

    for (var c = 0; c < candidates.length; c++) {
      if (candidates[c] && byId(candidates[c])) return candidates[c];
    }
    return null;
  };

  /* The piece a URL asks for, or null. product.html renders the not-found
     panel on null exactly as it did when it read ?id= itself. */
  var productFromLocation = function (loc) {
    return byId(productIdFromLocation(loc) || "");
  };

  /* money(value) — small, defensive USD-only formatter.
     - If a global Threadline.money already exists, use that (do not clobber).
     - null/undefined -> "" (empty string)
     - numeric values -> "$<int>" or "$<n.nn>" (two decimals when needed)
     - numeric strings parsed like numbers ("38" -> "$38")
     - strings containing a currency symbol or letters are returned unchanged
     - other non-numeric inputs fall back to String(value)
     This is intentionally locale-free and minimal; if you need localization
     or currencies, replace with an Intl-backed implementation. */
  var money = (global && global.Threadline && global.Threadline.money) ? global.Threadline.money : function (v) {
    if (v == null) return "";

    // If it's already a number, use it; if it's a string, try to coerce.
    if (typeof v === 'number') {
      if (!isFinite(v)) return String(v);
      // Integers shown without decimals, fractional with two decimals.
      return (v % 1 === 0) ? ('$' + String(Math.round(v))) : ('$' + v.toFixed(2));
    }

    if (typeof v === 'string') {
      var s = v.trim();
      if (s === '') return '';
      // If it already contains a currency symbol or alphabetic characters, pass through.
      try {
        // Use Unicode currency symbol class and letters; the 'u' flag allows \p{Sc}.
        if ((/\p{Sc}|[A-Za-z]/u).test(s)) return s;
      } catch (e) {
        // If the environment doesn't support \p{Sc}, fall back to common symbols.
        if (/[\$£€¥₹]|[A-Za-z]/.test(s)) return s;
      }
      // Try to parse as number.
      var n = parseFloat(s.replace(/,/g, ''));
      if (!isNaN(n)) {
        return (n % 1 === 0) ? ('$' + String(Math.round(n))) : ('$' + n.toFixed(2));
      }
      return s;
    }

    // Fallback for other types (boolean, object, etc.).
    try { return String(v); } catch (e) { return ''; }
  };

  /* Build one catalogue card with DOM APIs (no innerHTML, no escaping bugs). */
  var card = function (p) {
    var a = document.createElement("a");
    a.className = "card";
    a.href = productUrl(p);
    /* The catalogue id travels with the card so a rendered grid can be matched
       back to this entry — products.html uses it to reconcile the grid with the
       live shop panel (Threadline.shopPriceIndex). */
    a.dataset.productId = p.id;

    var thumb = document.createElement("div");
    thumb.className = "thumb";
    var image = document.createElement("img");
    image.src = p.image;
    image.alt = p.alt || p.name;
    image.loading = "lazy";
    image.width = 900;
    image.height = 1100;
    thumb.appendChild(image);
    a.appendChild(thumb);

    var body = document.createElement("div");
    body.className = "card-body";

    var kicker = document.createElement("div");
    kicker.className = "kicker";
    kicker.textContent = p.category;
    body.appendChild(kicker);

    var h = document.createElement("h3");
    h.className = "name";
    h.textContent = p.name;
    body.appendChild(h);

    var blurb = document.createElement("p");
    blurb.className = "card-blurb";
    blurb.textContent = p.blurb;
    body.appendChild(blurb);

    var price = document.createElement("div");
    price.className = "price";
    price.textContent = money(p.price);
    body.appendChild(price);

    a.appendChild(body);
    return a;
  };

  /* Render a list of products into a container element. */
  var renderGrid = function (el, list) {
    if (!el) return;
    el.innerHTML = "";
    (list || PRODUCTS).forEach(function (p) {
      el.appendChild(card(p));
    });
  };

  /* One lookbook figure, built with the same DOM-only style as card(). The
     caption is the look's note plus a list of the pieces it wears: every
     known piece is a link to its product page with the catalogue price, so
     nothing on the lookbook is hand-copied any more. */
  var lookFigure = function (look) {
    var fig = document.createElement("figure");
    fig.className = "look";
    fig.dataset.look = look.seed;

    var image = document.createElement("img");
    image.src = look.image;
    image.alt = look.alt || "";
    image.loading = "lazy";
    image.width = 800;
    image.height = 1000;
    fig.appendChild(image);

    var caption = document.createElement("figcaption");

    if (look.note) {
      var note = document.createElement("span");
      note.className = "look-note";
      note.textContent = look.note;
      caption.appendChild(note);
    }

    var list = document.createElement("ul");
    list.className = "look-pieces";

    look.pieces.forEach(function (piece) {
      var li = document.createElement("li");

      if (piece.product) {
        var a = document.createElement("a");
        a.href = productUrl(piece.product);
        a.dataset.productId = piece.product.id;
        a.textContent = piece.product.name;
        li.appendChild(a);

        var price = document.createElement("span");
        price.className = "look-price";
        price.textContent = money(piece.product.price);
        li.appendChild(document.createTextNode(" "));
        li.appendChild(price);
      } else {
        /* An id the catalogue no longer has: name it, never link it. */
        li.className = "look-piece-missing";
        li.textContent = piece.name;
      }

      list.appendChild(li);
    });

    caption.appendChild(list);
    fig.appendChild(caption);
    return fig;
  };

  /* Render the looks into a container element (lookbook.html's .lookbook). */
  var renderLooks = function (el, list) {
    if (!el) return 0;
    el.innerHTML = "";
    var resolved = looks(list);
    resolved.forEach(function (look) {
      el.appendChild(lookFigure(look));
    });
    return resolved.length;
  };

  var featured = function () {
    return PRODUCTS.filter(function (p) { return p.featured; });
  };

  global.Threadline = {
    products: PRODUCTS,
    byId: byId,
    categories: categories,
    resolveCategory: resolveCategory,
    ALL_CATEGORIES: ALL_CATEGORIES,
    featured: featured,
    related: related,
    RELATED_LIMIT: RELATED_LIMIT,
    money: money,
    productUrl: productUrl,
    productIdFromLocation: productIdFromLocation,
    productFromLocation: productFromLocation,
    card: card,
    renderGrid: renderGrid,
    LOOKS: LOOKS,
    looks: looks,
    lookFigure: lookFigure,
    renderLooks: renderLooks
  };
})(window);
