/* scripts/products.js — the Threadline catalogue.
 *
 * One source of truth for every page: index.html renders the featured cards
 * from it, products.html renders the full grid, product.html renders a single
 * item chosen with ?id=<id>, and lookbook.html renders the LOOKS list below
 * (every piece a look wears is linked from here, never hand-copied).
 * Plain browser JS, no build step, no framework.
 */
(function (global) {
  "use strict";

  var img = function (seed, w, h) {
    return "https://picsum.photos/seed/threadline-" + seed + "/" + w + "/" + h;
  };

  var CLOTHING_SIZES = ["XS", "S", "M", "L", "XL"];
  var ONE_SIZE = ["One size"];

  var PRODUCTS = [
    { id: "everyday-tee", name: "Everyday Tee", price: 38, category: "Tops", featured: true, image: img("tee",900,1100), alt: "Model wearing the Threadline Everyday Tee", blurb: "Soft combed cotton, cut for a modern relaxed fit.", description: "The tee we make first every season.", details: ["100% combed organic cotton"], sizes: CLOTHING_SIZES, sizeGuide: "tops", fitNote: "Cut relaxed with a dropped shoulder — size down for a closer fit." },
    { id: "relaxed-shirt", name: "Relaxed Shirt", price: 48, category: "Shirts", featured: true, image: img("relaxed-shirt",900,1100), alt: "Threadline Relaxed Shirt on a hanger", blurb: "An easy overshirt-weight button-down for every season.", description: "Washed cotton poplin.", details: ["Washed cotton poplin"], sizes: CLOTHING_SIZES, sizeGuide: "tops", fitNote: "Boxy and roomy enough to layer over a tee — take your usual size." },
    { id: "lightweight-hoodie", name: "Lightweight Hoodie", price: 68, category: "Knitwear", featured: true, image: img("hoodie",900,1100), alt: "Threadline Lightweight Hoodie folded on a bench", blurb: "Loopback cotton that works indoors and out.", description: "A three-season hoodie in loopback cotton.", details: ["100% loopback cotton"], sizes: CLOTHING_SIZES, sizeGuide: "outerwear", fitNote: "Unisex and cut to layer — take your usual size." },
    { id: "casual-pant", name: "Casual Pant", price: 58, category: "Bottoms", featured: true, image: img("pant",900,1100), alt: "Threadline Casual Pant photographed against a plain wall", blurb: "A tapered everyday trouser with a comfortable waist.", description: "Cotton twill with a touch of stretch.", details: ["97% cotton, 3% elastane twill"], sizes: CLOTHING_SIZES, sizeGuide: "bottoms", fitNote: "The half-elastic waist gives about an inch — take your usual size." },
    { id: "woven-shirt", name: "Woven Shirt", price: 52, category: "Shirts", featured: false, image: img("woven-shirt",900,1100), alt: "Threadline Woven Shirt with a textured weave", blurb: "Textured yarn-dyed cotton with a soft, lived-in hand.", description: "Yarn-dyed on a slow loom.", details: ["Yarn-dyed cotton"], sizes: CLOTHING_SIZES, sizeGuide: "tops", fitNote: "A regular fit — take your usual size." },
    { id: "classic-cap", name: "Classic Cap", price: 22, category: "Accessories", featured: false, image: img("cap",900,1100), alt: "Threadline Classic Cap in washed cotton", blurb: "Washed cotton six-panel with a soft, unstructured crown.", description: "An unstructured cap in washed cotton canvas.", details: ["Washed cotton canvas"], sizes: ONE_SIZE, sizeGuide: "one-size", fitNote: "One size — the brass slider covers a 22\" to 24\" head." },
    { id: "merino-crew", name: "Merino Crew Knit", price: 88, category: "Knitwear", featured: false, image: img("merino",900,1100), alt: "Threadline Merino Crew Knit sweater", blurb: "Fine-gauge merino that layers under anything.", description: "Fine-gauge merino spun by a small mill.", details: ["100% extra-fine merino wool"], sizes: CLOTHING_SIZES, sizeGuide: "outerwear", fitNote: "Fine-gauge and closer than our canvas layers." },
    { id: "canvas-overshirt", name: "Canvas Overshirt", price: 94, category: "Outerwear", featured: true, image: img("overshirt",900,1100), alt: "Threadline Canvas Overshirt worn open", blurb: "The layer between a shirt and a coat.", description: "Heavy cotton canvas that softens as you wear it.", details: ["10oz cotton canvas"], sizes: CLOTHING_SIZES, sizeGuide: "outerwear", fitNote: "Cut to go over a shirt or a knit." },
    { id: "linen-dress", name: "Linen Summer Dress", price: 76, category: "Dresses", featured: false, image: img("linen-dress",900,1100), alt: "Threadline Linen Summer Dress", blurb: "Washed European linen, cut long and loose.", description: "A simple column in washed linen.", details: ["100% washed European linen"], sizes: CLOTHING_SIZES, sizeGuide: "dresses", fitNote: "Long and loose — take your usual size." },
    { id: "ribbed-longsleeve", name: "Ribbed Longsleeve", price: 44, category: "Tops", featured: false, image: img("longsleeve",900,1100), alt: "Threadline Ribbed Longsleeve top", blurb: "A close-fitting rib that holds its shape.", description: "A 2x1 cotton rib with long sleeves.", details: ["2x1 cotton rib"], sizes: CLOTHING_SIZES, sizeGuide: "tops", fitNote: "A close rib that stretches to fit — size up if you want it loose." },
    { id: "wool-scarf", name: "Lambswool Scarf", price: 46, category: "Accessories", featured: false, image: img("scarf",900,1100), alt: "Threadline Lambswool Scarf", blurb: "Woven in a small mill, finished with a hand-tied fringe.", description: "Lambswool woven in a single colourway.", details: ["100% lambswool"], sizes: ONE_SIZE, sizeGuide: "one-size", fitNote: "One size — long enough to double over." },
    { id: "denim-jacket", name: "Rigid Denim Jacket", price: 118, category: "Outerwear", featured: false, image: img("denim",900,1100), alt: "Threadline Rigid Denim Jacket", blurb: "Raw 12oz denim that fades to your own pattern.", description: "Unwashed 12oz selvedge denim.", details: ["12oz raw selvedge denim"], sizes: CLOTHING_SIZES, sizeGuide: "outerwear", fitNote: "Raw denim: stiff at first — size up if you plan to wash it hot." }
  ];

  var byId = function (id) {
    for (var i = 0; i < PRODUCTS.length; i++) {
      if (PRODUCTS[i].id === id) return PRODUCTS[i];
    }
    return null;
  };

  var productUrl = function (p) {
    var id = (p && typeof p === "object") ? p.id : p;
    return "product.html?id=" + encodeURIComponent(String(id == null ? "" : id));
  };

  var ALL_CATEGORIES = "All";

  var categories = function () {
    var out = [ALL_CATEGORIES];
    PRODUCTS.forEach(function (p) {
      if (p.category && out.indexOf(p.category) === -1) out.push(p.category);
    });
    return out;
  };

  var resolveCategory = function (query) {
    try {
      var q = query || (typeof location !== 'undefined' ? location.search : '');
      if (typeof URLSearchParams === 'function') {
        var sp = new URLSearchParams(q);
        var c = sp.get('category');
        if (c) return c;
      }
      var m = String(q).match(/[?&]category=([^&]+)/);
      if (m) return decodeURIComponent(m[1]);
    } catch (e) {}
    return ALL_CATEGORIES;
  };

  var LOOKS = [];
  var looks = function () { return LOOKS; };

  var money = function (n) {
    var x = Number(n) || 0;
    var out = "$" + (Math.round(x) === x ? String(x) : x.toFixed(2));
    if (out.indexOf('.00') !== -1) out = out.replace(/\.00$/, '');
    return out;
  };

  var decodeId = function (value) {
    var raw = String(value == null ? "" : value).trim();
    if (!raw) return "";
    try { return decodeURIComponent(raw.replace(/\+/g, " ")).trim(); }
    catch (err) { return raw; }
  };

  var productIdFromLocation = function (loc) {
    var l = loc || (typeof location !== 'undefined' ? location : null);
    if (!l) return null;
    var candidates = [];
    var search = String(l.search || '');
    if (search) {
      try {
        var fromQuery = null;
        if (typeof URLSearchParams === 'function') fromQuery = new URLSearchParams(search).get('id');
        if (fromQuery == null) {
          var m = search.match(/[?&]id=([^&#]*)/);
          fromQuery = m ? m[1] : null;
        }
        if (fromQuery != null) candidates.push(decodeId(fromQuery));
      } catch (e) { /* ignore */ }
    }
    var path = String(l.pathname || '');
    if (path) {
      var parts = path.split('/');
      for (var i = parts.length - 1; i >= 0; i--) {
        var seg = parts[i];
        if (!seg || seg.indexOf('.') !== -1) continue;
        candidates.push(decodeId(seg));
        break;
      }
    }
    var hash = String(l.hash || '').replace(/^#/, '');
    if (hash) candidates.push(decodeId(hash));
    for (var c = 0; c < candidates.length; c++) {
      if (candidates[c] && byId(candidates[c])) return candidates[c];
    }
    return null;
  };

  var productFromLocation = function (loc) {
    return byId(productIdFromLocation(loc) || '');
  };

  /* Build one catalogue card with DOM APIs (no innerHTML, no escaping bugs). */
  var card = function (p) {
    var a = document.createElement('a');
    a.className = 'card';
    a.href = productUrl(p);
    a.dataset.productId = p.id;

    var thumb = document.createElement('div');
    thumb.className = 'thumb';
    var image = document.createElement('img');
    image.src = p.image;
    image.alt = p.alt || p.name;
    image.loading = 'lazy';
    image.width = 900;
    image.height = 1100;
    thumb.appendChild(image);
    a.appendChild(thumb);

    var body = document.createElement('div');
    body.className = 'card-body';

    var kicker = document.createElement('div');
    kicker.className = 'kicker';
    kicker.textContent = p.category;
    body.appendChild(kicker);

    var h = document.createElement('h3');
    h.className = 'name';
    h.textContent = p.name;
    body.appendChild(h);

    var blurb = document.createElement('p');
    blurb.className = 'card-blurb';
    blurb.textContent = p.blurb;
    body.appendChild(blurb);

    var price = document.createElement('div');
    price.className = 'price';
    price.textContent = money(p.price);
    body.appendChild(price);

    // Add a small, defensive Add-to-cart control inside the card.
    try {
      var controls = document.createElement('div');
      controls.className = 'card-controls';

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Add';
      btn.setAttribute('aria-label', 'Add ' + (p.name || '') + ' to cart');

      btn.addEventListener('click', function (ev) {
        try {
          ev.preventDefault();
        } catch (e) {}
        try {
          ev.stopPropagation();
        } catch (e) {}

        var detail = { id: p.id, name: p.name, price: p.price };

        try {
          if (window && window.ThreadlineCart && typeof window.ThreadlineCart.add === 'function') {
            try { window.ThreadlineCart.add(detail); return; } catch (err) { /* fall through to event fallback */ }
          }
        } catch (e) { /* ignore */ }

        try {
          var evObj = new CustomEvent('threadline:add-to-cart', { detail: detail, bubbles: true });
          (a && a.dispatchEvent) ? a.dispatchEvent(evObj) : document.dispatchEvent(evObj);
        } catch (err) { /* never throw from handler */ }
      }, false);

      controls.appendChild(btn);
      body.appendChild(controls);
    } catch (err) {
      // If DOM creation fails for any reason, silently continue — defensive.
    }

    a.appendChild(body);
    return a;
  };

  var renderGrid = function (el, list) {
    if (!el) return;
    el.innerHTML = '';
    (list || PRODUCTS).forEach(function (p) { el.appendChild(card(p)); });
  };

  var lookFigure = function (look) {
    var fig = document.createElement('figure');
    fig.className = 'look';
    var image = document.createElement('img');
    image.src = look.image;
    image.alt = look.alt || '';
    image.loading = 'lazy';
    image.width = 800; image.height = 1000;
    fig.appendChild(image);
    var caption = document.createElement('figcaption');
    if (look.note) { var note = document.createElement('span'); note.className = 'look-note'; note.textContent = look.note; caption.appendChild(note); }
    var listEl = document.createElement('ul'); listEl.className = 'look-pieces';
    (look.pieces || []).forEach(function (piece) {
      var li = document.createElement('li');
      if (piece.product) {
        var a = document.createElement('a'); a.href = productUrl(piece.product); a.dataset.productId = piece.product.id; a.textContent = piece.product.name; li.appendChild(a);
        var price = document.createElement('span'); price.className = 'look-price'; price.textContent = money(piece.product.price); li.appendChild(document.createTextNode(' ')); li.appendChild(price);
      } else {
        li.className = 'look-piece-missing'; li.textContent = piece.name;
      }
      listEl.appendChild(li);
    });
    caption.appendChild(listEl); fig.appendChild(caption); return fig;
  };

  var renderLooks = function (el, list) { if (!el) return 0; el.innerHTML = ''; var resolved = looks(list); resolved.forEach(function (l) { el.appendChild(lookFigure(l)); }); return resolved.length; };

  var featured = function () { return PRODUCTS.filter(function (p) { return p.featured; }); };

  global.Threadline = global.Threadline || {};
  global.Threadline.products = PRODUCTS;
  global.Threadline.byId = byId;
  global.Threadline.categories = categories;
  global.Threadline.resolveCategory = resolveCategory;
  global.Threadline.ALL_CATEGORIES = ALL_CATEGORIES;
  global.Threadline.featured = featured;
  global.Threadline.related = function () { return []; };
  global.Threadline.RELATED_LIMIT = 4;
  global.Threadline.productUrl = productUrl;
  global.Threadline.productIdFromLocation = productIdFromLocation;
  global.Threadline.productFromLocation = productFromLocation;
  global.Threadline.card = card;
  global.Threadline.renderGrid = renderGrid;
  global.Threadline.LOOKS = LOOKS;
  global.Threadline.looks = looks;
  global.Threadline.lookFigure = lookFigure;
  global.Threadline.renderLooks = renderLooks;

  if (!global.Threadline.money) {
    try { Object.defineProperty(global.Threadline, 'money', { value: money, enumerable: false, configurable: true }); }
    catch (err) { global.Threadline.money = money; }
  }

})(window);
