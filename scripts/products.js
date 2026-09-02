/* scripts/products.js — the Threadline catalogue.
 *
 * One source of truth for every page: index.html renders the featured cards
 * from it, products.html renders the full grid, product.html renders a single
 * item chosen with ?id=<id>. Plain browser JS, no build step, no framework.
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
      fitNote: "One size — the brass slider covers a 22″ to 24″ head."
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
      fitNote: "Long and loose — take your usual size; the hem falls mid-calf at 5′7″."
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

  /* ---- categories, and the gate on ?category= -----------------------------
     products.html filters the grid by category and now carries the choice on
     the URL, so a category can be linked to and shared. The value on the URL
     is shopper input and is never believed as written: it is resolved against
     the catalogue the same way scripts/checkout-intent.js resolves ?size=
     against product.sizes — case- and punctuation-blind, with a safe default
     ("All") for anything we do not have. That way a renamed or deleted
     category degrades to the whole collection instead of an empty grid. */

  var ALL_CATEGORIES = "All";

  /* The same normalisation Threadline.normaliseKey uses, kept here so this
     file stays standalone (products.js is loaded before checkout-intent.js,
     and on pages that load it alone). */
  var categoryKey = function (value) {
    return String(value == null ? "" : value).toLowerCase().replace(/[^a-z0-9]+/g, "");
  };

  /* Every category the catalogue actually has, in catalogue order, with "All"
     first. `list` is only for tests and for a caller filtering a subset; with
     no argument it answers for the real catalogue. */
  var categories = function (list) {
    var source = (list && list.length) ? list : PRODUCTS;
    var out = [ALL_CATEGORIES];
    for (var i = 0; i < source.length; i++) {
      var c = source[i] && source[i].category;
      if (c && out.indexOf(c) === -1) out.push(c);
    }
    return out;
  };

  /* The category a page may actually show, given whatever a URL asked for.
     "outerwear" and " OUTERWEAR " both answer "Outerwear"; "", null, "nonsense"
     and a category we no longer make all answer "All". Never returns a value
     that is not in categories(). */
  var resolveCategory = function (requested, list) {
    var known = categories(list);
    var key = categoryKey(requested);
    if (!key) return ALL_CATEGORIES;
    for (var i = 0; i < known.length; i++) {
      if (categoryKey(known[i]) === key) return known[i];
    }
    return ALL_CATEGORIES;
  };

  var money = function (n) {
    return "$" + Number(n).toFixed(0);
  };

  var productUrl = function (p) {
    return "product.html?id=" + encodeURIComponent(p.id);
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
    money: money,
    productUrl: productUrl,
    card: card,
    renderGrid: renderGrid
  };
})(window);
