let WHATSAPP = "212693621297";

const qs = (s) => document.querySelector(s);
function money(n){ return `${Number(n).toFixed(2)} DH`; }

function getCart(){
  try { return JSON.parse(localStorage.getItem("cart") || "[]"); } catch { return []; }
}
function setCart(c){ localStorage.setItem("cart", JSON.stringify(c)); }
function cartCount(){ return getCart().reduce((a,b)=>a + (b.qty||0), 0); }
function cartTotal(){ return getCart().reduce((a,b)=>a + (Number(b.price)||0) * (Number(b.qty)||0), 0); }

async function loadConfig(){
  try{
    const r = await fetch(`/api/config`);
    const d = await r.json();
    if(d.whatsapp) WHATSAPP = d.whatsapp;
  }catch{}
}

async function isAdminLogged(){
  const res = await fetch(`/api/admin/me`, { credentials:"include" });
  const data = await res.json();
  return !!data.admin;
}

// ===== STORE =====
async function initStore(){
  await loadConfig();

  const cc = qs("#cartCount");
  if(cc) cc.textContent = cartCount();

  const adminBtn = qs("#adminBtn");
  if(adminBtn){
    adminBtn.style.display = (await isAdminLogged()) ? "inline-flex" : "none";
  }

  const res = await fetch(`/api/products`);
  const products = await res.json();

  const grid = qs("#productsGrid");
  grid.innerHTML = "";

  products.forEach(p => {
    const sizes = p.sizes || {S:0,M:0,L:0,XL:0,XXL:0};
    const totalStock = Object.values(sizes).reduce((a,b)=>a+(b||0),0);
    const out = totalStock <= 0;

    const sizeOptions = ["S","M","L","XL","XXL"].map(s => {
      const st = Number(sizes[s] || 0);
      return `<option value="${s}" ${st<=0 ? "disabled":""}>${s} (${st})</option>`;
    }).join("");

    const el = document.createElement("div");
    el.className = "card";
    el.innerHTML = `
      ${out ? `<div class="out">OUT OF STOCK</div>` : ``}
      <div class="img">
        ${p.image ? `<img src="/uploads/${p.image}" alt="">` : ``}
      </div>
      <div class="body">
        <h3>${p.title}</h3>
        <div class="price">${money(p.price)}</div>
        <div class="kv">
          <span class="pill">S:${sizes.S||0}</span>
          <span class="pill">M:${sizes.M||0}</span>
          <span class="pill">L:${sizes.L||0}</span>
          <span class="pill">XL:${sizes.XL||0}</span>
          <span class="pill">XXL:${sizes.XXL||0}</span>
        </div>

        <div style="margin-top:10px">
          <select class="select" id="size-${p.id}">
            <option value="">Select size</option>
            ${sizeOptions}
          </select>
        </div>

        <div style="margin-top:12px; display:flex; gap:10px">
          <button class="btn red" ${out ? "disabled":""} data-add>Add</button>
          <a class="btn" href="cart.html">Cart</a>
        </div>
      </div>
    `;

    el.querySelector("[data-add]").onclick = () => {
      const size = qs(`#size-${p.id}`).value;
      if(!size) return alert("Select size first");
      if((sizes[size]||0) <= 0) return alert("This size is out of stock");

      const cart = getCart();
      const key = `${p.id}-${size}`;
      const found = cart.find(x => x.key === key);
      if(found) found.qty += 1;
      else cart.push({ key, productId:p.id, title:p.title, price:p.price, image:p.image, size, qty:1 });
      setCart(cart);

      const cc2 = qs("#cartCount");
      if(cc2) cc2.textContent = cartCount();
      alert("Added ✅");
    };

    grid.appendChild(el);
  });
}

// ===== CART =====
function renderCart(){
  const list = qs("#cartList");
  const totalEl = qs("#total");
  const cart = getCart();

  if(totalEl) totalEl.textContent = money(cartTotal());
  if(!list) return;

  list.innerHTML = "";

  if(cart.length === 0){
    list.innerHTML = `<div class="panel"><div class="muted">Cart is empty.</div><div style="margin-top:10px"><a class="btn" href="index.html">Back to store</a></div></div>`;
    return;
  }

  cart.forEach(item => {
    const row = document.createElement("div");
    row.className = "card";
    row.innerHTML = `
      <div class="img">${item.image ? `<img src="/uploads/${item.image}" alt="">` : ""}</div>
      <div class="body">
        <h3>${item.title}</h3>
        <div class="muted">Size: <b>${item.size}</b></div>
        <div class="muted">Unit: <b>${money(item.price)}</b></div>

        <div class="row" style="margin-top:10px; align-items:center">
          <button class="btn" data-minus>-</button>
          <span class="badge">Qty: ${item.qty}</span>
          <button class="btn" data-plus>+</button>
          <button class="btn red" data-remove>Remove</button>
        </div>
      </div>
    `;

    row.querySelector("[data-minus]").onclick = () => {
      const c = getCart();
      const f = c.find(x => x.key === item.key);
      if(!f) return;
      f.qty -= 1;
      const next = c.filter(x => x.qty > 0);
      setCart(next);
      renderCart();
    };

    row.querySelector("[data-plus]").onclick = () => {
      const c = getCart();
      const f = c.find(x => x.key === item.key);
      if(!f) return;
      f.qty += 1;
      setCart(c);
      renderCart();
    };

    row.querySelector("[data-remove]").onclick = () => {
      const next = getCart().filter(x => x.key !== item.key);
      setCart(next);
      renderCart();
    };

    list.appendChild(row);
  });
}

async function submitOrder(){
  await loadConfig();

  const name = qs("#cname").value.trim();
  const phone = qs("#cphone").value.trim();
  const address = qs("#caddress").value.trim();
  const payment_method = qs("#paymentMethod")?.value || "COD";

  const cart = getCart();
  if(!name || !phone || !address) return alert("Fill name/phone/address");
  if(cart.length === 0) return alert("Cart is empty");

  const items = cart.map(x => ({ productId: x.productId, size: x.size, qty: x.qty }));

  const res = await fetch(`/api/orders`,{
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ name, phone, address, payment_method, items })
  });

  const data = await res.json();
  if(!res.ok) return alert(data.error || "Order failed");

  const lines = [];
  lines.push(`✅ New Order - BK STORE`);
  lines.push(`Name: ${name}`);
  lines.push(`Phone: ${phone}`);
  lines.push(`Address: ${address}`);
  lines.push(`Payment: Cash On Delivery (COD)`);
  lines.push(`----------------------`);
  cart.forEach(it => lines.push(`• ${it.title} (${it.size}) x${it.qty} = ${money(it.price*it.qty)}`));
  lines.push(`----------------------`);
  lines.push(`TOTAL: ${money(data.total)}`);

  setCart([]);
  const url = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(lines.join("\n"))}`;
  window.location.href = url;
}

// ===== LOGIN =====
async function adminLogin(){
  const username = qs("#username").value.trim();
  const password = qs("#password").value.trim();

  const res = await fetch(`/api/admin/login`, {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    credentials:"include",
    body: JSON.stringify({ username, password })
  });

  const data = await res.json();
  if(!res.ok) return alert(data.error || "Login failed");
  window.location.href = "admin.html";
}

async function adminLogout(){
  await fetch(`/api/admin/logout`, { method:"POST", credentials:"include" });
  window.location.href = "index.html";
}

// ===== ADMIN =====
async function loadAdminStats(){
  const res = await fetch(`/api/admin/stats`, { credentials:"include" });
  const data = await res.json();
  if(!res.ok) throw new Error(data.error || "Stats failed");

  qs("#stProducts").textContent = data.productsCount;
  qs("#stOrders").textContent = data.ordersCount;
  qs("#stSales").textContent = money(data.totalSales);
  qs("#stToday").textContent = data.todayOrders;

  qs("#lowStock").innerHTML = (data.lowStock||[]).map(x => `<div class="pill">${x.title}: <b>${x.total}</b></div>`).join("");
}

let ADMIN_PRODUCTS_CACHE = [];

async function loadAdminProducts(){
  const res = await fetch(`/api/products`);
  const products = await res.json();
  ADMIN_PRODUCTS_CACHE = products;

  const box = qs("#adminProducts");
  box.innerHTML = "";

  products.forEach(p => {
    const s = p.sizes || {S:0,M:0,L:0,XL:0,XXL:0};
    const total = Object.values(s).reduce((a,b)=>a+(b||0),0);

    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="img">${p.image ? `<img src="/uploads/${p.image}">` : ""}</div>
      <div class="body">
        <h3>${p.title}</h3>
        <div class="row" style="align-items:center; justify-content:space-between">
          <div class="price">${money(p.price)}</div>
          <span class="badge">Total: ${total}</span>
        </div>

        <div class="kv">
          <span class="pill">S:${s.S||0}</span>
          <span class="pill">M:${s.M||0}</span>
          <span class="pill">L:${s.L||0}</span>
          <span class="pill">XL:${s.XL||0}</span>
          <span class="pill">XXL:${s.XXL||0}</span>
        </div>

        <div style="margin-top:12px; display:flex; gap:10px">
          <button class="btn" data-edit>Edit</button>
          <button class="btn red" data-del>Delete</button>
        </div>
      </div>
    `;

    card.querySelector("[data-del]").onclick = async () => {
      if(!confirm("Delete this product?")) return;
      const r = await fetch(`/api/products/${p.id}`, { method:"DELETE", credentials:"include" });
      const d = await r.json();
      if(!r.ok) return alert(d.error || "Delete failed");
      await refreshAdmin();
    };

    card.querySelector("[data-edit]").onclick = () => {
      qs("#pid").value = p.id;
      qs("#ptitle").value = p.title;
      qs("#pprice").value = p.price;
      qs("#sS").value = s.S||0;
      qs("#sM").value = s.M||0;
      qs("#sL").value = s.L||0;
      qs("#sXL").value = s.XL||0;
      qs("#sXXL").value = s.XXL||0;
      window.scrollTo({ top: 0, behavior:"smooth" });
    };

    box.appendChild(card);
  });
}

async function loadAdminOrders(){
  const res = await fetch(`/api/orders`, { credentials:"include" });
  const data = await res.json();
  if(!res.ok) return;

  const tbody = qs("#ordersBody");
  tbody.innerHTML = "";

  data.forEach(o => {
    const itemsTxt = (o.items||[]).map(it => `#${it.productId} (${it.size}) x${it.qty}`).join(" | ");
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${o.id}</td>
      <td>${o.name}</td>
      <td>${o.phone}</td>
      <td>${o.payment_method}</td>
      <td class="right"><b>${money(o.total)}</b></td>
      <td class="small">${o.created_at}</td>
      <td class="small">${itemsTxt}</td>
    `;
    tbody.appendChild(tr);
  });
}

async function saveProduct(){
  const pid = qs("#pid").value.trim();
  const title = qs("#ptitle").value.trim();
  const price = qs("#pprice").value.trim();

  if(!title || !price) return alert("Title and price required");

  const sizes = {
    S: Number(qs("#sS").value||0),
    M: Number(qs("#sM").value||0),
    L: Number(qs("#sL").value||0),
    XL: Number(qs("#sXL").value||0),
    XXL: Number(qs("#sXXL").value||0)
  };

  const fd = new FormData();
  fd.append("title", title);
  fd.append("price", price);
  fd.append("sizes", JSON.stringify(sizes));

  const file = qs("#pimg").files[0];
  if(file) fd.append("image", file);

  let url = `/api/products`;
  let method = "POST";
  if(pid){
    url = `/api/products/${pid}`;
    method = "PUT";
  }

  const res = await fetch(url, { method, body: fd, credentials:"include" });
  const data = await res.json();
  if(!res.ok) return alert(data.error || "Save failed");

  alert("Saved ✅");
  qs("#productForm").reset();
  qs("#pid").value = "";
  await refreshAdmin();
}

function clearForm(){
  qs("#productForm").reset();
  qs("#pid").value = "";
}

async function refreshAdmin(){
  await loadAdminStats();
  await loadAdminProducts();
  await loadAdminOrders();
}

// Router
document.addEventListener("DOMContentLoaded", async () => {
  const page = document.body.getAttribute("data-page");

  if(page === "store") initStore();

  if(page === "cart"){
    renderCart();
    qs("#confirmBtn").onclick = submitOrder;
  }

  if(page === "login"){
    qs("#loginBtn").onclick = adminLogin;
  }

  if(page === "admin"){
    const me = await fetch(`/api/admin/me`, { credentials:"include" }).then(r=>r.json());
    if(!me.admin) return window.location.href = "login.html";

    qs("#logoutBtn").onclick = adminLogout;
    qs("#saveBtn").onclick = saveProduct;
    qs("#clearBtn").onclick = clearForm;

    await refreshAdmin();
  }
});
