let WHATSAPP = "212600000000";

const qs = (s) => document.querySelector(s);
const qsa = (s) => [...document.querySelectorAll(s)];

function money(n){
  return `${Number(n).toFixed(2)} DH`;
}

function getCart(){
  try{
    return JSON.parse(localStorage.getItem("bk_cart") || "[]");
  }catch{
    return [];
  }
}

function setCart(c){
  localStorage.setItem("bk_cart", JSON.stringify(c));
}

function cartCount(){
  return getCart().reduce((a,b)=>a+(b.qty||0),0);
}

function cartTotal(){
  return getCart().reduce((a,b)=>a+(Number(b.unitPrice)||0)*(Number(b.qty)||0),0);
}

async function loadConfig(){
  try{
    const r = await fetch(`/api/config`);
    const d = await r.json();
    if(d.whatsapp) WHATSAPP = d.whatsapp;
  }catch{}
}

async function isAdminLogged(){
  try{
    const res = await fetch(`/api/admin/me`,{credentials:"include"});
    const data = await res.json();
    return !!data.admin;
  }catch{
    return false;
  }
}

function kitLabel(k){
  return ({
    home:"HOME",
    away:"AWAY",
    third:"THIRD",
    fourth:"FOURTH"
  }[k] || "HOME");
}

function kitKeys(){
  return ["home","away","third","fourth"];
}

function safeArr(x){
  return Array.isArray(x) ? x : [];
}

async function initStore(){

  await loadConfig();

  const cc = qs("#cartCount");
  if(cc) cc.textContent = cartCount();

  const adminBtn = qs("#adminBtn");
  if(adminBtn){
    adminBtn.style.display =
      (await isAdminLogged()) ? "inline-flex" : "none";
  }

  const res = await fetch(`/api/products`);
  const products = await res.json();

  const grid = qs("#productsGrid");
  grid.innerHTML = "";

  products.forEach(p=>{

    const sizes = p.sizes || {S:0,M:0,L:0,XL:0,XXL:0};
    const kits = p.kits || {home:[],away:[],third:[],fourth:[]};

    const totalStock =
      Object.values(sizes).reduce((a,b)=>a+(b||0),0);

    const out = totalStock<=0;

    let activeKit =
      kitKeys().find(k=>safeArr(kits[k]).length) || "home";

    let activeImg =
      (safeArr(kits[activeKit])[0]) || "";

    const sizeOptions = ["S","M","L","XL","XXL"]
    .map(s=>{
      const st = Number(sizes[s]||0);
      return `<option value="${s}" ${st<=0?"disabled":""}>${s} (${st})</option>`;
    }).join("");

    const card = document.createElement("div");
    card.className="card";

    card.innerHTML=`

      ${out?`<div class="out">OUT OF STOCK</div>`:""}

      <div class="img">
        ${activeImg?`<img class="mainimg" src="${activeImg}">`:""}
      </div>

      <div class="body">

        <h3>${escapeHtml(p.title)}</h3>

        <div class="price">
          ${money(p.price)}
        </div>

        <div class="kv">

          ${kitKeys().map(k=>{
            const count = safeArr(kits[k]).length;
            const active = k===activeKit?"active":"";
            return `<span class="pill ${active}" data-kit="${k}">
            ${kitLabel(k)} (${count})
            </span>`;
          }).join("")}

        </div>

        <div class="thumbs">

          ${safeArr(kits[activeKit])
          .map((src,i)=>`
          <img class="${i===0?"active":""}" data-src="${src}" src="${src}">
          `).join("")}

        </div>

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

        <div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap">

          <button class="btn red" ${out?"disabled":""} data-add>
            Add
          </button>

          <a class="btn" href="cart.html">
            Cart
          </a>

        </div>

      </div>
    `;

    card.querySelectorAll("[data-kit]").forEach(el=>{

      el.onclick=()=>{

        activeKit = el.getAttribute("data-kit");

        card.querySelectorAll("[data-kit]")
        .forEach(x=>x.classList.remove("active"));

        el.classList.add("active");

        const imgs = safeArr(kits[activeKit]);
        activeImg = imgs[0]||"";

        const main = card.querySelector(".mainimg");
        if(main) main.src = activeImg;

        const thumbs = card.querySelector(".thumbs");

        thumbs.innerHTML =
        imgs.map((src,i)=>`
        <img class="${i===0?"active":""}" data-src="${src}" src="${src}">
        `).join("");

        thumbs.querySelectorAll("img").forEach(im=>{
          im.onclick=()=>{
            thumbs.querySelectorAll("img")
            .forEach(x=>x.classList.remove("active"));

            im.classList.add("active");

            activeImg = im.getAttribute("data-src");

            if(main) main.src = activeImg;
          };
        });

      };

    });

    card.querySelector("[data-add]").onclick=()=>{

      const size = qs(`#size-${p.id}`).value;

      if(!size) return alert("Select size");

      if((sizes[size]||0)<=0)
      return alert("Out of stock");

      const cart = getCart();

      const key = `${p.id}-${activeKit}-${size}`;

      const found = cart.find(x=>x.key===key);

      if(found){
        found.qty+=1;
      }else{
        cart.push({
          key,
          productId:p.id,
          title:p.title,
          kit:activeKit,
          image:activeImg,
          size,
          qty:1,
          unitPrice:Number(p.price)
        });
      }

      setCart(cart);

      const cc2 = qs("#cartCount");
      if(cc2) cc2.textContent = cartCount();

      alert("Added ✅");
    };

    grid.appendChild(card);

  });

}

function renderCart(){

  const list = qs("#cartList");
  const totalEl = qs("#total");

  const cart = getCart();

  if(totalEl) totalEl.textContent = money(cartTotal());

  if(!list) return;

  list.innerHTML="";

  if(cart.length===0){

    list.innerHTML=`
    <div class="panel">
      <div class="muted">
        Cart is empty
      </div>
    </div>
    `;

    return;
  }

  cart.forEach(item=>{

    const row = document.createElement("div");

    row.className="card";

    row.innerHTML=`

      <div class="img">
        ${item.image?`<img src="${item.image}">`:""}
      </div>

      <div class="body">

        <h3>${escapeHtml(item.title)}</h3>

        <div class="muted">
        Kit: ${kitLabel(item.kit)}
        </div>

        <div class="muted">
        Size: ${item.size}
        </div>

        <div class="muted">
        Unit: ${money(item.unitPrice)}
        </div>

        <div class="row">

          <button class="btn" data-minus>-</button>

          <span class="badge">
            Qty: ${item.qty}
          </span>

          <button class="btn" data-plus>+</button>

          <button class="btn red" data-remove>
            Remove
          </button>

        </div>

      </div>
    `;

    row.querySelector("[data-minus]").onclick=()=>{

      const c = getCart();

      const f = c.find(x=>x.key===item.key);

      f.qty--;

      setCart(c.filter(x=>x.qty>0));

      renderCart();
    };

    row.querySelector("[data-plus]").onclick=()=>{

      const c = getCart();

      const f = c.find(x=>x.key===item.key);

      f.qty++;

      setCart(c);

      renderCart();
    };

    row.querySelector("[data-remove]").onclick=()=>{

      setCart(getCart().filter(x=>x.key!==item.key));

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

  const cart = getCart();

  if(!name||!phone||!address)
  return alert("Fill info");

  if(cart.length===0)
  return alert("Cart empty");

  const items = cart.map(x=>({
    productId:x.productId,
    title:x.title,
    kit:x.kit,
    size:x.size,
    qty:x.qty,
    unitPrice:x.unitPrice
  }));

  const res = await fetch(`/api/orders`,{

    method:"POST",

    headers:{
      "Content-Type":"application/json"
    },

    body:JSON.stringify({
      name,
      phone,
      address,
      items
    })

  });

  const data = await res.json();

  if(!res.ok)
  return alert("Order failed");

  const lines=[];

  lines.push("✅ New Order BK STORE");
  lines.push(`Name: ${name}`);
  lines.push(`Phone: ${phone}`);
  lines.push(`Address: ${address}`);
  lines.push("--------------------");

  cart.forEach(it=>{

    lines.push(
      `${it.title} | ${kitLabel(it.kit)} | ${it.size} x${it.qty} = ${money(it.unitPrice*it.qty)}`
    );

  });

  lines.push("--------------------");

  lines.push(`TOTAL: ${money(cartTotal())}`);

  setCart([]);

  const url =
  `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(lines.join("\n"))}`;

  window.location.href = url;

}

function escapeHtml(s){

  return String(s ?? "")
  .replaceAll("&","&amp;")
  .replaceAll("<","&lt;")
  .replaceAll(">","&gt;")
  .replaceAll('"',"&quot;")
  .replaceAll("'","&#039;");
}

document.addEventListener("DOMContentLoaded",()=>{

  const page =
  document.body.getAttribute("data-page");

  if(page==="store")
  initStore();

  if(page==="cart"){

    renderCart();

    qs("#confirmBtn").onclick =
    submitOrder;

  }

});
