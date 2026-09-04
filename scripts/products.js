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

  /* ---- links ------------------------------------------------------------
     Every link to a piece on this site is written here and nowhere else:
     "product.html?id=<id>". serve.json keeps the query string (the clean-URL
     redirect is off) and productIdFromLocation below also reads /product/<id>
     and #<id>, so a host we do not control cannot break the link outright.
     Accepts a product object or a bare id. */
  var productUrl = function (p) {
    var id = (p && typeof p === "object") ? p.id : p;
    return "product.html?id=" + encodeURIComponent(String(id == null ? "" : id));
  };

  /* ---- categories -------------------------------------------------------
     products.html builds its filter buttons from this list and reads
     ?category= through resolveCategory, so a category is named in exactly one
     place: the catalogue above. */
  var ALL_CATEGORIES = "All";

  var categories = function () {
    var out = [ALL_CATEGORIES];
    PRODUCTS.forEach(function (p) {
      if (p.category && out.indexOf(p.category) === -1) out.push(p.category);
    });
    return out;
  };

  var resolveCategory = function (requested) {
    if (!requested) return ALL_CATEGORIES;
    var found = ALL_CATEGORIES;
    var key = String(requested || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
    categories().forEach(function (c) {
      if (String(c || "").toLowerCase().replace(/[^a-z0-9]+/g, "") === key) found = c;
    });
    return found;
  };

  /* ---- related --------------------------------------------------------- */
  var RELATED_LIMIT = 4;
  var related = function (product) {
    if (!product) return [];
    var out = PRODUCTS.filter(function (p) { return p.id !== product.id && p.category === product.category; });
    return out.slice(0, RELATED_LIMIT);
  };

  /* ---- looks (the lookbook) -------------------------------------------- */
  var LOOKS = [
    { seed: 1, image: img('look1', 800, 1000), alt: 'Six looks: Everyday Tee, Relaxed Shirt, Canvas Overshirt', note: 'Six looks from the autumn shoot', pieces: [ { product: byId('everyday-tee') }, { product: byId('relaxed-shirt') }, { product: byId('canvas-overshirt') } ] },
    { seed: 2, image: img('look2', 800, 1000), alt: '', note: '', pieces: [ { product: byId('lightweight-hoodie') }, { product: byId('casual-pant') } ] }
  ];

  /* ---- money formatting ------------------------------------------------ */
  var money = function (n) {
    var UNLISTED_NOTE = "Not in the shop yet.";
    if (n === undefined || n === null) return UNLISTED_NOTE;
    var num = Number(n);
    if (!isFinite(num)) return UNLISTED_NOTE;
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(num);
    } catch (e) { /* fall through to simple fallback */ }

    // Fallback simple formatting
    var out = "$" + (Math.round(n) === n ? String(n) : n.toFixed(2));
    if (out.indexOf(".00") !== -1) out = out.replace(/\.00$/, "");
    return out;
  };

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

  var productFromLocation = function (loc) {
    return byId(productIdFromLocation(loc) || "");
  };

  /* Build one catalogue card with DOM APIs (no innerHTML, no escaping bugs).
     Revised to move the Add button out of the product link: return a small
     wrapper that contains an anchor.card (image + body) and a sibling
     div.actions holding a native <button type="button" class="add-to-cart">.
     The anchor keeps data-product-id and the .card class so existing code that
     queries ".card" or reads dataset.productId continues to work. */
  var card = function (p) {
    // Outer wrapper for the anchor + actions sibling
    var wrap = document.createElement("div");
    wrap.className = "card-wrap";

    var a = document.createElement("a");
    a.className = "card";
    a.href = productUrl(p);
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

    // Actions sibling (outside the anchor) with an accessible native button
    var actions = document.createElement("div");
    actions.className = "actions";

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "add-to-cart"; // preserve class name for existing CSS/consumers
    btn.setAttribute("data-product-id", p.id);
    btn.setAttribute("aria-label", "Add " + p.name + " to cart");
    btn.textContent = "Add";

    btn.addEventListener("click", function (e) {
      // Dispatch a stable, machine-friendly payload for cart consumers.
      var payload = {
        id: p.id,
        name: p.name,
        price: Number(p.price),
        priceString: (global.Threadline && typeof global.Threadline.money === 'function') ? global.Threadline.money(p.price) : money(p.price),
        quantity: 1
      };
      try {
        var ev = new CustomEvent('threadline:add-to-cart', { detail: payload, bubbles: true, composed: false });
        // Do not preventDefault or stopPropagation; let listeners decide.
        (e && e.target) && e.target.dispatchEvent(ev);
      } catch (err) {
        // Older browsers may not support CustomEvent constructor with detail.
        try {
          var ev2 = document.createEvent('CustomEvent');
          ev2.initCustomEvent('threadline:add-to-cart', true, false, payload);
          (e && e.target) && e.target.dispatchEvent(ev2);
        } catch (err2) { /* last resort: nothing */ }
      }
    });

    actions.appendChild(btn);

    wrap.appendChild(a);
    wrap.appendChild(actions);

    return wrap;
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
    var resolved = LOOKS;
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
    productUrl: productUrl,
    productIdFromLocation: productIdFromLocation,
    productFromLocation: productFromLocation,
    card: card,
    renderGrid: renderGrid,
    LOOKS: LOOKS,
    looks: LOOKS, // keep a simple reference for older callers
    lookFigure: lookFigure,
    renderLooks: renderLooks
  };

  // Attach money as a non-enumerable property if the page hasn't provided one.
  if (!global.Threadline.money) {
    try {
      Object.defineProperty(global.Threadline, 'money', { value: money, enumerable: false, configurable: true });
    } catch (err) {
      // Older environments might throw; fall back to a plain assignment.
      global.Threadline.money = money;
    }
  }

})(window);
