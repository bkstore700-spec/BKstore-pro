const express = require("express");
const session = require("express-session");
const multer = require("multer");
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 4000;

const ADMIN_USER = process.env.ADMIN_USER || "Amine bk";
const ADMIN_PASS = process.env.ADMIN_PASS || "121007";
const SESSION_SECRET = process.env.SESSION_SECRET || "bkstore_secret_change_me";
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || "212693621297"; // بدون 0 وبكود الدولة

const frontendPath = path.join(__dirname, "../frontend");
const uploadsPath = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadsPath)) fs.mkdirSync(uploadsPath);

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false // على https (Render) يمكن نخليه true
    }
  })
);

// Static
app.use("/uploads", express.static(uploadsPath));
app.use(express.static(frontendPath));

// DB
const db = new Database(path.join(__dirname, "store.db"));
db.exec(`
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  price REAL NOT NULL,
  image TEXT,
  sizes TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'COD',
  items TEXT NOT NULL,
  total REAL NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

function isAdmin(req, res, next) {
  if (req.session && req.session.admin) return next();
  res.status(401).json({ error: "Unauthorized" });
}

function safeJsonParse(str, fallback) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

function normalizeSizes(s) {
  const base = { S: 0, M: 0, L: 0, XL: 0, XXL: 0 };
  const obj = typeof s === "string" ? safeJsonParse(s || "{}", {}) : (s || {});
  for (const k of Object.keys(base)) {
    const v = Number(obj[k] ?? 0);
    base[k] = Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
  }
  return base;
}

// Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsPath),
  filename: (req, file, cb) => cb(null, Date.now() + "_" + Math.random().toString(16).slice(2) + path.extname(file.originalname))
});
const upload = multer({ storage });

// Config
app.get("/api/config", (req, res) => {
  res.json({ whatsapp: WHATSAPP_NUMBER });
});

// Auth
app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body || {};
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    req.session.admin = true;
    return res.json({ ok: true });
  }
  res.status(401).json({ error: "Wrong credentials" });
});

app.post("/api/admin/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/admin/me", (req, res) => {
  res.json({ admin: !!(req.session && req.session.admin) });
});

// Products (public)
app.get("/api/products", (req, res) => {
  const rows = db.prepare("SELECT * FROM products ORDER BY id DESC").all();
  res.json(rows.map(p => ({
    ...p,
    sizes: normalizeSizes(p.sizes)
  })));
});

// Products (admin) create
app.post("/api/products", isAdmin, upload.single("image"), (req, res) => {
  const { title, price, sizes } = req.body || {};
  if (!title || price === undefined) return res.status(400).json({ error: "Missing title/price" });

  const img = req.file ? req.file.filename : "";
  const sizesObj = normalizeSizes(sizes);

  const info = db.prepare(
    "INSERT INTO products (title, price, image, sizes) VALUES (?,?,?,?)"
  ).run(String(title).trim(), Number(price), img, JSON.stringify(sizesObj));

  res.json({ ok: true, id: info.lastInsertRowid });
});

// Products (admin) update
app.put("/api/products/:id", isAdmin, upload.single("image"), (req, res) => {
  const id = Number(req.params.id);
  const old = db.prepare("SELECT * FROM products WHERE id=?").get(id);
  if (!old) return res.status(404).json({ error: "Not found" });

  const { title, price, sizes } = req.body || {};
  const newTitle = title !== undefined ? String(title).trim() : old.title;
  const newPrice = price !== undefined ? Number(price) : Number(old.price);
  const newSizes = sizes !== undefined ? normalizeSizes(sizes) : normalizeSizes(old.sizes);

  let newImage = old.image || "";
  if (req.file) {
    // delete old image file
    if (newImage) {
      const p = path.join(uploadsPath, path.basename(newImage));
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    newImage = req.file.filename;
  }

  db.prepare(
    "UPDATE products SET title=?, price=?, image=?, sizes=? WHERE id=?"
  ).run(newTitle, newPrice, newImage, JSON.stringify(newSizes), id);

  res.json({ ok: true });
});

// Products (admin) delete
app.delete("/api/products/:id", isAdmin, (req, res) => {
  const id = Number(req.params.id);
  const old = db.prepare("SELECT * FROM products WHERE id=?").get(id);
  if (!old) return res.status(404).json({ error: "Not found" });

  if (old.image) {
    const p = path.join(uploadsPath, path.basename(old.image));
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }

  db.prepare("DELETE FROM products WHERE id=?").run(id);
  res.json({ ok: true });
});

// Orders (public) create + stock decrement
app.post("/api/orders", (req, res) => {
  const { name, phone, address, payment_method, items } = req.body || {};
  if (!name || !phone || !address) return res.status(400).json({ error: "Missing fields" });
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: "No items" });

  const tx = db.transaction(() => {
    let total = 0;

    for (const it of items) {
      const productId = Number(it.productId);
      const size = String(it.size || "").toUpperCase();
      const qty = Number(it.qty || 0);

      if (!productId || !["S","M","L","XL","XXL"].includes(size) || !Number.isFinite(qty) || qty <= 0) {
        throw new Error("Invalid cart item");
      }

      const p = db.prepare("SELECT * FROM products WHERE id=?").get(productId);
      if (!p) throw new Error("Product not found");

      const sizesObj = normalizeSizes(p.sizes);
      if ((sizesObj[size] || 0) < qty) throw new Error(`Out of stock: ${p.title} size ${size}`);

      sizesObj[size] -= qty;
      db.prepare("UPDATE products SET sizes=? WHERE id=?").run(JSON.stringify(sizesObj), productId);

      total += Number(p.price) * qty;
    }

    db.prepare(
      "INSERT INTO orders (name, phone, address, payment_method, items, total) VALUES (?,?,?,?,?,?)"
    ).run(
      String(name).trim(),
      String(phone).trim(),
      String(address).trim(),
      String(payment_method || "COD"),
      JSON.stringify(items),
      total
    );

    return total;
  });

  try {
    const total = tx();
    res.json({ ok: true, total });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

// Orders (admin) list
app.get("/api/orders", isAdmin, (req, res) => {
  const rows = db.prepare("SELECT * FROM orders ORDER BY id DESC").all();
  res.json(rows.map(o => ({
    ...o,
    items: safeJsonParse(o.items, [])
  })));
});

// Stats (admin)
app.get("/api/admin/stats", isAdmin, (req, res) => {
  const productsCount = db.prepare("SELECT COUNT(*) AS c FROM products").get().c;
  const ordersCount = db.prepare("SELECT COUNT(*) AS c FROM orders").get().c;
  const totalSales = db.prepare("SELECT COALESCE(SUM(total),0) AS s FROM orders").get().s;

  const todayOrders = db.prepare(`
    SELECT COUNT(*) AS c
    FROM orders
    WHERE date(created_at) = date('now')
  `).get().c;

  const products = db.prepare("SELECT id,title,sizes FROM products").all().map(p => {
    const s = normalizeSizes(p.sizes);
    const total = Object.values(s).reduce((a,b)=>a+(b||0),0);
    return { id: p.id, title: p.title, total };
  }).sort((a,b)=>a.total-b.total).slice(0,5);

  res.json({
    productsCount,
    ordersCount,
    totalSales,
    todayOrders,
    lowStock: products
  });
});

// Start
app.listen(PORT, () => {
  console.log("✅ BK STORE LIVE");
  console.log("http://localhost:" + PORT);
});
