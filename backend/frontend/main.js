let WHATSAPP = "212600000000";

const qs = (s) => document.querySelector(s);
const qsa = (s) => [...document.querySelectorAll(s)];

function money(n) {
  return `${Number(n).toFixed(2)} DH`;
}

function getCart() {
  try {
    return JSON.parse(localStorage.getItem("bk_cart") || "[]");
  } catch {
    return [];
  }
}

function setCart(c) {
  localStorage.setItem("bk_cart", JSON.stringify(c));
}

function cartCount() {
  return getCart().reduce((a, b) => a + (b.qty || 0), 0);
}

function cartTotal() {
  return getCart().reduce(
    (a, b) => a + (Number(b.unitPrice) || 0) * (Number(b.qty) || 0),
    0
  );
}

async function loadConfig() {
  try {
    const r = await fetch(`/api/config`);
    const d = await r.json();
    if (d.whatsapp) WHATSAPP = d.whatsapp;
  } catch {}
}

async function isAdminLogged() {
  try {
    const res = await fetch(`/api/admin/me`, { credentials: "include" });
    const data = await res.json();
    return !!data.admin;
  } catch {
    return false;
  }
}

function kitLabel(k) {
  return ({ home: "HOME", away: "AWAY", third: "THIRD", fourth: "FOURTH" }[k] || "HOME");
}

function kitKeys() {
  return ["home", "away", "third", "fourth"];
}

function safeArr(x) {
  return Array.isArray(x) ? x : [];
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function initStore() {
  await loadConfig();

  const cc = qs("#cartCount");
  if (cc) cc.textContent = cartCount();

  const adminBtn = qs("#adminBtn");
  if (adminBtn) adminBtn.style.display = "none";

  const loginBtn = qs("#loginPublicBtn");
  if (loginBtn) loginBtn.style.display = "none";

  const res = await fetch(`/api/products`);
  const products = await res.json();

  const grid = qs("#productsGrid");
  if (!grid) return;
  grid.innerHTML = "";

  products.forEach((p) => {
    const sizes = p.sizes || { S: 0, M: 0, L: 0, XL: 0, XXL: 0 };
    const kits = p.kits || { home: [], away: [], third: [], fourth: [] };

    const totalStock = Object.values(sizes).reduce((a, b) => a + (b || 0), 0);
    const out = totalStock <= 0;

    let activeKit = kitKeys().find((k) => safeArr(kits[k]).length) || "home";
    let activeImg = (safeArr(kits[activeKit])[0]) || "";

    const sizeOptions = ["S", "M", "L", "XL", "XXL"]
      .map((s) => {
        const st = Number(sizes[s] || 0);
        return `<option value="${s}" ${st <= 0 ? "disabled" : ""}>${s} (${st})</option>`;
      })
      .join("");

    const card = document.createElement("div");
    card.className = "card";

    card.innerHTML = `
      ${out ? `<div class="out">OUT OF STOCK</div>` : ``}
      <div class="img">
        ${activeImg ? `<img class="mainimg" src="${activeImg}" alt="">` : ``}
      </div>
      <div class="body">
        <h3>${escapeHtml(p.title)}</h3>
        <div class="price">${money(p.price)}</div>

        <div class="kv">
          ${kitKeys()
            .map((k) => {
              const count = safeArr(kits[k]).length;
              const active = k === activeKit ? "active" : "";
              return `<span class="pill ${active}" data-kit="${k}">${kitLabel(k)} (${count})</span>`;
            })
            .join("")}
        </div>

        <div class="thumbs">
          ${safeArr(kits[activeKit])
            .map((src, i) => `<img class="${i === 0 ? "active" : ""}" data-src="${src}" src="${src}" />`)
            .join("")}
        </div>

        <div class="kv" style="margin-top:10px">
          <span class="pill">S:${sizes.S || 0}</span>
          <span class="pill">M:${sizes.M || 0}</span>
          <span class="pill">L:${sizes.L || 0}</span>
          <span class="pill">XL:${sizes.XL || 0}</span>
          <span class="pill">XXL:${sizes.XXL || 0}</span>
        </div>

        <div style="margin-top:10px">
          <select class="select" id="size-${p.id}">
            <option value="">Select size</option>
            ${sizeOptions}
          </select>
        </div>

        <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap">
          <button class="btn red" ${out ? "disabled" : ""} data-add>Add</button>
          <a class="btn" href="cart.html">Cart</a>
        </div>
      </div>
    `;

    card.querySelectorAll("[data-kit]").forEach((el) => {
      el.onclick = () => {
        activeKit = el.getAttribute("data-kit");
        card.querySelectorAll("[data-kit]").forEach((x) => x.classList.remove("active"));
        el.classList.add("active");

        const imgs = safeArr(kits[activeKit]);
        activeImg = imgs[0] || "";

        const main = card.querySelector(".mainimg");
        if (main) main.src = activeImg;

        const thumbs = card.querySelector(".thumbs");
        thumbs.innerHTML = imgs
          .map((src, i) => `<img class="${i === 0 ? "active" : ""}" data-src="${src}" src="${src}" />`)
          .join("");

        thumbs.querySelectorAll("img").forEach((im) => {
          im.onclick = () => {
            thumbs.querySelectorAll("img").forEach((x) => x.classList.remove("active"));
            im.classList.add("active");
            activeImg = im.getAttribute("data-src");
            if (main) main.src = activeImg;
          };
        });
      };
    });

    card.querySelectorAll(".thumbs img").forEach((im) => {
      im.onclick = () => {
        card.querySelectorAll(".thumbs img").forEach((x) => x.classList.remove("active"));
        im.classList.add("active");
        activeImg = im.getAttribute("data-src");
        const main = card.querySelector(".mainimg");
        if (main) main.src = activeImg;
      };
    });

    card.querySelector("[data-add]").onclick = () => {
      const size = qs(`#size-${p.id}`).value;
      if (!size) return alert("Select size first");
      if ((sizes[size] || 0) <= 0) return alert("This size is out of stock");

      const cart = getCart();
      const key = `${p.id}-${activeKit}-${size}`;
      const found = cart.find((x) => x.key === key);

      if (found) {
        found.qty += 1;
      } else {
        cart.push({
          key,
          productId: p.id,
          title: p.title,
          kit: activeKit,
          image: activeImg,
          size,
          qty: 1,
          unitPrice: Number(p.price)
        });
      }

      setCart(cart);

      const cc2 = qs("#cartCount");
      if (cc2) cc2.textContent = cartCount();

      alert("Added ✅");
    };

    grid.appendChild(card);
  });
}

function renderCart() {
  const list = qs("#cartList");
  const totalEl = qs("#total");
  const cart = getCart();

  if (totalEl) totalEl.textContent = money(cartTotal());
  if (!list) return;

  list.innerHTML = "";

  if (cart.length === 0) {
    list.innerHTML = `
      <div class="panel">
        <div class="muted">Cart is empty.</div>
        <div style="margin-top:10px">
          <a class="btn" href="index.html">Back to store</a>
        </div>
      </div>
    `;
    return;
  }

  cart.forEach((item) => {
    const row = document.createElement("div");
    row.className = "card";

    row.innerHTML = `
      <div class="img">${item.image ? `<img src="${item.image}" alt="">` : ""}</div>
      <div class="body">
        <h3>${escapeHtml(item.title)}</h3>
        <div class="muted">Kit: <b>${kitLabel(item.kit)}</b></div>
        <div class="muted">Size: <b>${escapeHtml(item.size)}</b></div>
        <div class="muted">Unit: <b>${money(item.unitPrice)}</b></div>

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
      const f = c.find((x) => x.key === item.key);
      if (!f) return;
      f.qty -= 1;
      const next = c.filter((x) => x.qty > 0);
      setCart(next);
      renderCart();
    };

    row.querySelector("[data-plus]").onclick = () => {
      const c = getCart();
      const f = c.find((x) => x.key === item.key);
      if (!f) return;
      f.qty += 1;
      setCart(c);
      renderCart();
    };

    row.querySelector("[data-remove]").onclick = () => {
      const next = getCart().filter((x) => x.key !== item.key);
      setCart(next);
      renderCart();
    };

    list.appendChild(row);
  });
}

async function submitOrder() {
  await loadConfig();

  const name = qs("#cname")?.value.trim();
  const phone = qs("#cphone")?.value.trim();
  const address = qs("#caddress")?.value.trim();
  const payment_method = qs("#paymentMethod")?.value || "COD";

  const cart = getCart();

  if (!name || !phone || !address) return alert("Fill name / phone / address");
  if (cart.length === 0) return alert("Cart is empty");

  const items = cart.map((x) => ({
    productId: x.productId,
    title: x.title,
    kit: x.kit,
    size: x.size,
    qty: x.qty,
    unitPrice: x.unitPrice
  }));

  const res = await fetch(`/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, phone, address, payment_method, items })
  });

  const data = await res.json();
  if (!res.ok) return alert(data.error || "Order failed");

  const lines = [];
  lines.push("✅ New Order - BK STORE");
  lines.push(`Name: ${name}`);
  lines.push(`Phone: ${phone}`);
  lines.push(`Address: ${address}`);
  lines.push(`Payment: ${payment_method}`);
  lines.push("----------------------");

  cart.forEach((it) => {
    lines.push(
      `• ${it.title} | ${kitLabel(it.kit)} | ${it.size} x${it.qty} = ${money(it.unitPrice * it.qty)}`
    );
  });

  lines.push("----------------------");
  lines.push(`TOTAL: ${money(data.total || cartTotal())}`);

  setCart([]);

  const url = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(lines.join("\n"))}`;
  window.location.href = url;
}

async function adminLogin() {
  const username = qs("#username")?.value.trim();
  const password = qs("#password")?.value.trim();

  const res = await fetch(`/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ username, password })
  });

  const data = await res.json();
  if (!res.ok) return alert(data.error || "Login failed");

  window.location.href = "admin.html";
}

async function adminLogout() {
  await fetch(`/api/admin/logout`, {
    method: "POST",
    credentials: "include"
  });

  window.location.href = "index.html";
}

function showMsg(txt) {
  const el = qs("#saveMsg");
  if (!el) return;
  el.textContent = txt;
  el.style.display = "inline-flex";
  setTimeout(() => (el.style.display = "none"), 2000);
}

async function loadAdminStats() {
  const res = await fetch(`/api/admin/stats`, { credentials: "include" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Stats failed");

  if (qs("#stProducts")) qs("#stProducts").textContent = data.productsCount ?? 0;
  if (qs("#stOrders")) qs("#stOrders").textContent = data.ordersCount ?? 0;
  if (qs("#stSales")) qs("#stSales").textContent = money(data.totalSales ?? 0);
  if (qs("#stToday")) qs("#stToday").textContent = data.todayOrders ?? 0;
  if (qs("#stTodaySales")) qs("#stTodaySales").textContent = money(data.todaySales ?? 0);

  if (qs("#perDay")) {
    qs("#perDay").innerHTML = (data.perDay || [])
      .map((x) => `<div class="pill">${x.d}: <b>${x.c}</b> (${money(x.s)})</div>`)
      .join("");
  }

  if (qs("#lowStock")) {
    qs("#lowStock").innerHTML = (data.lowStock || [])
      .map((x) => `<div class="pill">${escapeHtml(x.title)}: <b>${x.total}</b></div>`)
      .join("");
  }
}

let ORDERS_PAGE = 1;
let ORDERS_PAGES = 1;
let ORDERS_Q = "";

async function loadAdminProducts() {
  const res = await fetch(`/api/products`);
  const products = await res.json();

  const box = qs("#adminProducts");
  if (!box) return;
  box.innerHTML = "";

  products.forEach((p) => {
    const s = p.sizes || { S: 0, M: 0, L: 0, XL: 0, XXL: 0 };
    const total = Object.values(s).reduce((a, b) => a + (b || 0), 0);

    const firstImg =
      p.kits?.home?.[0] ||
      p.kits?.away?.[0] ||
      p.kits?.third?.[0] ||
      p.kits?.fourth?.[0] ||
      "";

    const card = document.createElement("div");
    card.className = "card";

    card.innerHTML = `
      <div class="img">${firstImg ? `<img src="${firstImg}">` : ""}</div>
      <div class="body">
        <h3>${escapeHtml(p.title)}</h3>
        <div class="row" style="align-items:center; justify-content:space-between">
          <div class="price">${money(p.price)}</div>
          <span class="badge">Total: ${total}</span>
        </div>

        <div class="kv">
          <span class="pill">S:${s.S || 0}</span>
          <span class="pill">M:${s.M || 0}</span>
          <span class="pill">L:${s.L || 0}</span>
          <span class="pill">XL:${s.XL || 0}</span>
          <span class="pill">XXL:${s.XXL || 0}</span>
        </div>

        <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap">
          <button class="btn" data-edit>Edit</button>
          <button class="btn red" data-del>Delete</button>
        </div>
      </div>
    `;

    card.querySelector("[data-del]").onclick = async () => {
      if (!confirm("Delete this product?")) return;

      const r = await fetch(`/api/products/${p.id}`, {
        method: "DELETE",
        credentials: "include"
      });

      const d = await r.json();
      if (!r.ok) return alert(d.error || "Delete failed");

      await refreshAdmin();
    };

    card.querySelector("[data-edit]").onclick = () => fillEditForm(p);

    box.appendChild(card);
  });
}

function fillEditForm(p) {
  if (qs("#pid")) qs("#pid").value = p.id;
  if (qs("#ptitle")) qs("#ptitle").value = p.title;
  if (qs("#pprice")) qs("#pprice").value = p.price;

  const s = p.sizes || { S: 0, M: 0, L: 0, XL: 0, XXL: 0 };
  if (qs("#sS")) qs("#sS").value = s.S || 0;
  if (qs("#sM")) qs("#sM").value = s.M || 0;
  if (qs("#sL")) qs("#sL").value = s.L || 0;
  if (qs("#sXL")) qs("#sXL").value = s.XL || 0;
  if (qs("#sXXL")) qs("#sXXL").value = s.XXL || 0;

  renderEditImages(p);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderEditImages(p) {
  const wrap = qs("#editImages");
  if (!wrap) return;

  const kits = p.kits || { home: [], away: [], third: [], fourth: [] };

  wrap.innerHTML = kitKeys()
    .map((k) => {
      const imgs = safeArr(kits[k]);
      return `
        <div class="panel" style="margin-top:12px">
          <div class="muted">${kitLabel(k)} images</div>
          <div class="thumbs" data-kitwrap="${k}">
            ${imgs
              .map(
                (src) => `
                <div style="display:flex; flex-direction:column; gap:6px; align-items:center">
                  <img src="${src}" style="width:70px;height:70px;border-radius:12px;object-fit:cover;border:1px solid rgba(255,255,255,.12)">
                  <button class="btn" data-rmkit="${k}" data-src="${src}" type="button">Remove</button>
                </div>
              `
              )
              .join("")}
          </div>
        </div>
      `;
    })
    .join("");

  qsa("[data-rmkit]").forEach((btn) => {
    btn.onclick = () => {
      btn.closest("div").remove();
      showMsg("Image marked to remove. Save to apply ✅");
    };
  });
}

async function loadAdminOrders() {
  const res = await fetch(
    `/api/orders?page=${ORDERS_PAGE}&limit=20&q=${encodeURIComponent(ORDERS_Q)}`,
    { credentials: "include" }
  );

  const data = await res.json();
  if (!res.ok) return;

  ORDERS_PAGES = data.pages || 1;
  if (qs("#pg")) qs("#pg").textContent = data.page;
  if (qs("#pgMax")) qs("#pgMax").textContent = data.pages;

  const tbody = qs("#ordersBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  data.rows.forEach((o) => {
    const itemsTxt = (o.items || [])
      .map((it) => `#${it.productId} ${it.title || ""} (${kitLabel(it.kit || "home")}/${it.size}) x${it.qty}`)
      .join(" | ");

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${o.id}</td>
      <td>${escapeHtml(o.name)}</td>
      <td>${escapeHtml(o.phone)}</td>
      <td>${escapeHtml(o.payment_method || "COD")}</td>
      <td class="right"><b>${money(o.total || 0)}</b></td>
      <td class="small">${escapeHtml(o.created_at || "")}</td>
      <td class="small">${escapeHtml(itemsTxt)}</td>
    `;
    tbody.appendChild(tr);
  });
}

async function saveProduct() {
  const pid = qs("#pid")?.value.trim() || "";
  const title = qs("#ptitle")?.value.trim() || "";
  const price = qs("#pprice")?.value.trim() || "";

  if (!title || !price) return alert("Title and price required");

  const sizes = {
    S: Number(qs("#sS")?.value || 0),
    M: Number(qs("#sM")?.value || 0),
    L: Number(qs("#sL")?.value || 0),
    XL: Number(qs("#sXL")?.value || 0),
    XXL: Number(qs("#sXXL")?.value || 0)
  };

  const keepKits = { home: [], away: [], third: [], fourth: [] };
  if (pid) {
    kitKeys().forEach((k) => {
      const kitPanel = qsa(`[data-kitwrap="${k}"] img`);
      keepKits[k] = kitPanel.map((im) => im.getAttribute("src"));
    });
  }

  const fd = new FormData();
  fd.append("title", title);
  fd.append("price", price);
  fd.append("sizes", JSON.stringify(sizes));

  if (pid) fd.append("keepKits", JSON.stringify(keepKits));

  const homeFiles = qs("#imgHome")?.files || [];
  const awayFiles = qs("#imgAway")?.files || [];
  const thirdFiles = qs("#imgThird")?.files || [];
  const fourthFiles = qs("#imgFourth")?.files || [];

  for (const f of homeFiles) fd.append("homeImages", f);
  for (const f of awayFiles) fd.append("awayImages", f);
  for (const f of thirdFiles) fd.append("thirdImages", f);
  for (const f of fourthFiles) fd.append("fourthImages", f);

  let url = `/api/products`;
  let method = "POST";

  if (pid) {
    url = `/api/products/${pid}`;
    method = "PUT";
  }

  const res = await fetch(url, {
    method,
    body: fd,
    credentials: "include"
  });

  const data = await res.json();
  if (!res.ok) return alert(data.error || "Save failed");

  showMsg("Saved ✅");
  clearForm();
  await refreshAdmin();
}

function clearForm() {
  if (qs("#productForm")) qs("#productForm").reset();
  if (qs("#pid")) qs("#pid").value = "";
  if (qs("#editImages")) qs("#editImages").innerHTML = "";
}

async function refreshAdmin() {
  await loadAdminStats();
  await loadAdminProducts();
  await loadAdminOrders();
}

document.addEventListener("DOMContentLoaded", async () => {
  const page = document.body.getAttribute("data-page");

  if (page === "store") {
    await initStore();
  }

  if (page === "cart") {
    renderCart();
    const btn = qs("#confirmBtn");
    if (btn) btn.onclick = submitOrder;
  }

  if (page === "login") {
    const btn = qs("#loginBtn");
    if (btn) btn.onclick = adminLogin;
  }

  if (page === "admin") {
    const meRes = await fetch(`/api/admin/me`, { credentials: "include" });
    const me = await meRes.json();

    if (!me.admin) {
      window.location.href = "secret-admin-8473.html";
      return;
    }

    if (qs("#logoutBtn")) qs("#logoutBtn").onclick = adminLogout;
    if (qs("#saveBtn")) qs("#saveBtn").onclick = saveProduct;
    if (qs("#clearBtn")) qs("#clearBtn").onclick = clearForm;

    if (qs("#searchBtn")) {
      qs("#searchBtn").onclick = async () => {
        ORDERS_Q = qs("#qSearch")?.value.trim() || "";
        ORDERS_PAGE = 1;
        await loadAdminOrders();
      };
    }

    if (qs("#resetBtn")) {
      qs("#resetBtn").onclick = async () => {
        if (qs("#qSearch")) qs("#qSearch").value = "";
        ORDERS_Q = "";
        ORDERS_PAGE = 1;
        await loadAdminOrders();
      };
    }

    if (qs("#prevPage")) {
      qs("#prevPage").onclick = async () => {
        ORDERS_PAGE = Math.max(1, ORDERS_PAGE - 1);
        await loadAdminOrders();
      };
    }

    if (qs("#nextPage")) {
      qs("#nextPage").onclick = async () => {
        ORDERS_PAGE = Math.min(ORDERS_PAGES, ORDERS_PAGE + 1);
        await loadAdminOrders();
      };
    }

    await refreshAdmin();
  }
});
