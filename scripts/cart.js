(function(){
  // scripts/cart.js — lightweight client-side cart for Threadline
  // Exposes window.ThreadlineCart { read, add, remove, setQuantity, open, close }
  var STORAGE_KEY = 'threadline_cart';
  var MAX_ITEMS = 5;
  var MAX_QTY = 5;

  function now() { return Date.now(); }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed;
    } catch (e) { return []; }
  }

  function save(items) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); }
    catch (e) { console.warn('threadline_cart save failed', e); }
  }

  function clampQty(n){
    n = Number(n) || 1;
    if (n < 1) n = 1;
    if (n > MAX_QTY) n = MAX_QTY;
    return Math.floor(n);
  }

  function findIndex(items, id){
    for (var i=0;i<items.length;i++) if (String(items[i].id) === String(id)) return i;
    return -1;
  }

  function buildUI(){
    // Button
    var btn = document.createElement('button');
    btn.className = 'cart-button';
    btn.type = 'button';
    btn.setAttribute('aria-expanded','false');
    btn.setAttribute('aria-controls','threadline-cart-drawer');
    btn.setAttribute('title','Open cart');
    btn.innerHTML = '<span class="cart-count">0</span> Cart';
    btn.addEventListener('click', function(){ toggle(); });

    // Overlay
    var overlay = document.createElement('div');
    overlay.className = 'cart-overlay';
    overlay.tabIndex = -1;
    overlay.addEventListener('click', function(e){ if (e.target === overlay) close(); });

    // Drawer
    var drawer = document.createElement('aside');
    drawer.id = 'threadline-cart-drawer';
    drawer.className = 'cart-drawer';
    drawer.setAttribute('role','dialog');
    drawer.setAttribute('aria-label','Shopping cart');
    drawer.tabIndex = -1;

    var header = document.createElement('div');
    header.className = 'cart-drawer-header';
    var h = document.createElement('h2'); h.textContent = 'Your cart';
    var closeBtn = document.createElement('button'); closeBtn.type='button'; closeBtn.className='cart-close'; closeBtn.textContent='Close';
    closeBtn.addEventListener('click', close);
    header.appendChild(h); header.appendChild(closeBtn);

    var list = document.createElement('div'); list.className = 'cart-list'; list.id = 'threadline-cart-list';
    var footer = document.createElement('div'); footer.className='cart-drawer-footer';
    var checkout = document.createElement('button'); checkout.type='button'; checkout.className='btn cart-checkout'; checkout.textContent='Go to checkout';
    checkout.addEventListener('click', function(){
      // delegate to platform checkout via payments widget: navigate user to group-store or let site owner handle
      // Here we simply close drawer — implementation of actual checkout is outside cart's scope.
      close();
    });
    footer.appendChild(checkout);

    drawer.appendChild(header);
    drawer.appendChild(list);
    drawer.appendChild(footer);
    overlay.appendChild(drawer);

    document.body.appendChild(btn);
    document.body.appendChild(overlay);

    return { btn: btn, overlay: overlay, drawer: drawer, list: list };
  }

  var ui = buildUI();

  function render(){
    var items = load();
    // update count on button
    var count = items.reduce(function(sum,it){ return sum + (it.quantity||0); }, 0);
    var distinct = items.length;
    var countEl = ui.btn.querySelector('.cart-count');
    if (countEl) countEl.textContent = count;
    ui.btn.setAttribute('aria-expanded', ui.overlay.style.display === 'block' ? 'true' : 'false');

    // render list
    var list = ui.list; list.innerHTML = '';
    if (!items.length){
      var p = document.createElement('p'); p.className='cart-empty'; p.textContent='Your cart is empty.'; list.appendChild(p); return;
    }
    items.forEach(function(it){
      var row = document.createElement('div'); row.className='cart-item';
      var name = document.createElement('div'); name.className='cart-item-name'; name.textContent = it.name || it.id || 'Item';
      var price = document.createElement('div'); price.className='cart-item-price'; price.textContent = formatPrice(it.price);
      var controls = document.createElement('div'); controls.className='cart-item-controls';
      var minus = document.createElement('button'); minus.type='button'; minus.className='cart-minus'; minus.textContent='−';
      var qty = document.createElement('span'); qty.className='cart-qty'; qty.textContent = it.quantity || 1;
      var plus = document.createElement('button'); plus.type='button'; plus.className='cart-plus'; plus.textContent='+';
      var remove = document.createElement('button'); remove.type='button'; remove.className='cart-remove'; remove.textContent='Remove';

      minus.addEventListener('click', function(){ setQuantity(it.id, clampQty((it.quantity||1)-1)); });
      plus.addEventListener('click', function(){ setQuantity(it.id, clampQty((it.quantity||1)+1)); });
      remove.addEventListener('click', function(){ remove(it.id); });

      controls.appendChild(minus); controls.appendChild(qty); controls.appendChild(plus); controls.appendChild(remove);

      row.appendChild(name); row.appendChild(price); row.appendChild(controls);
      list.appendChild(row);
    });
  }

  function formatPrice(p){
    try {
      var n = Number(p);
      if (!isFinite(n)) return ''+p;
      return '$' + (n%1? n.toFixed(2) : n.toString());
    } catch(e){ return ''+p; }
  }

  function dispatchUpdated(){
    try { document.dispatchEvent(new CustomEvent('threadline:cart-updated', { detail: read() })); }
    catch(e){}
  }

  function read(){
    // return a copy
    var items = load();
    return items.map(function(i){ return { id:i.id, name:i.name, price:i.price, quantity:i.quantity }; });
  }

  function add(item){
    if (!item || !item.id) return false;
    var items = load();
    var idx = findIndex(items, item.id);
    if (idx === -1){
      if (items.length >= MAX_ITEMS) {
        // ignore new distinct items beyond cap
        console.warn('threadline_cart: item limit reached (max '+MAX_ITEMS+')');
        return false;
      }
      var qty = clampQty(item.quantity || 1);
      items.push({ id:String(item.id), name:String(item.name||item.id), price: item.price===undefined?0:item.price, quantity: qty, added: now() });
    } else {
      var existing = items[idx];
      var newQty = clampQty((existing.quantity||0) + (item.quantity||1));
      existing.quantity = newQty;
    }
    save(items);
    render();
    dispatchUpdated();
    return true;
  }

  function remove(id){
    var items = load();
    var idx = findIndex(items, id);
    if (idx === -1) return false;
    items.splice(idx,1);
    save(items);
    render();
    dispatchUpdated();
    return true;
  }

  function setQuantity(id, q){
    var items = load();
    var idx = findIndex(items, id);
    if (idx === -1) return false;
    var qty = clampQty(q);
    items[idx].quantity = qty;
    save(items);
    render();
    dispatchUpdated();
    return true;
  }

  function open(){
    ui.overlay.style.display = 'block';
    // focus drawer
    try { ui.drawer.focus(); } catch(e){}
    ui.btn.setAttribute('aria-expanded','true');
    // key handler
    document.addEventListener('keydown', onKey);
  }
  function close(){
    ui.overlay.style.display = 'none';
    ui.btn.setAttribute('aria-expanded','false');
    document.removeEventListener('keydown', onKey);
  }
  function toggle(){ if (ui.overlay.style.display === 'block') close(); else open(); }

  function onKey(e){ if (e.key === 'Escape' || e.key === 'Esc') { close(); } }

  // Listen for events
  document.addEventListener('threadline:add-to-cart', function(e){
    try {
      var d = e && e.detail ? e.detail : null;
      if (!d) return;
      add({ id: d.id, name: d.name, price: d.price, quantity: d.quantity || 1 });
      // open drawer briefly so user sees it
      open();
    } catch (err) { console.warn('threadline_cart event handler error', err); }
  }, true);

  // Expose API
  window.ThreadlineCart = {
    read: read,
    add: add,
    remove: remove,
    setQuantity: setQuantity,
    open: open,
    close: close
  };

  // Initial render and ensure hidden
  ui.overlay.style.display = 'none';
  render();
})();
