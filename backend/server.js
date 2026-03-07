require("dotenv").config();

const express = require("express");
const session = require("express-session");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const db = require("./db");

const app = express();
const PORT = Number(process.env.PORT || 4000);

app.set("trust proxy", 1);

const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "1234";
const SESSION_SECRET = process.env.SESSION_SECRET || "change_me";
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || "212600000000";

const frontendPath = path.join(__dirname, "frontend");
const uploadsPath = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false
    }
  })
);

app.use("/uploads", express.static(uploadsPath));
app.use(express.static(frontendPath));

function isAdmin(req, res, next) {
  if (req.session && req.session.admin) return next();
  return res.status(401).json({ error: "Unauthorized" });
}

function safeJsonParse(str, fallback) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

function normalizeSizes(input) {
  const base = { S: 0, M: 0, L: 0, XL: 0, XXL: 0 };
  const obj =
    typeof input === "string"
      ? safeJsonParse(input || "{}", {})
      : (input || {});

  for (const k of Object.keys(base)) {
    const v = Number(obj[k] ?? 0);
    base[k] = Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
  }

  return base;
}

function normalizeKits(input) {
  const base = { home: [], away: [], third: [], fourth: [] };
  const obj =
    typeof input === "string"
      ? safeJsonParse(input || "{}", {})
      : (input || {});

  for (const k of Object.keys(base)) {
    const arr = Array.isArray(obj[k]) ? obj[k] : [];
    base[k] = arr.map(x => String(x || "").trim()).filter(Boolean);
  }

  return base;
}

function fileToUrl(f) {
  return `/uploads/${f.filename}`;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsPath),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^\w.\-]+/g, "_");
    cb(
      null,
      `${Date.now()}_${Math.random().toString(16).slice(2)}_${safe}`
    );
  }
});

const upload = multer({ storage });

app.get("/api/config", (req, res) => {
  res.json({ whatsapp: WHATSAPP_NUMBER });
});

app.get("/secret-admin-8473.html", (req, res) => {
  res.sendFile(path.join(frontendPath, "secret-admin-8473.html"));
});

app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body || {};

  const okUser = String(username || "") === ADMIN_USER;

  const okPass =
    ADMIN_PASS.startsWith("$2")
      ? bcrypt.compareSync(String(password || ""), ADMIN_PASS)
      : String(password || "") === String(ADMIN_PASS);

  if (okUser && okPass) {
    req.session.admin = true;
    return res.json({ ok: true });
  }

  return res.status(401).json({ error: "Wrong credentials" });
});

app.post("/api/admin/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/admin/me", (req, res) => {
  res.json({ admin: !!(req.session && req.session.admin) });
});

app.get("/api/products", (req, res) => {
  const rows = db.prepare("SELECT * FROM products ORDER BY id DESC").all();

  res.json(
    rows.map(p => ({
      ...p,
      sizes: normalizeSizes(p.sizes),
      kits: normalizeKits(p.kits)
    }))
  );
});

app.post(
  "/api/products",
  isAdmin,
  upload.fields([
    { name: "homeImages", maxCount: 20 },
    { name: "awayImages", maxCount: 20 },
    { name: "thirdImages", maxCount: 20 },
    { name: "fourthImages", maxCount: 20 }
  ]),
  (req, res) => {
    try {
      const { title, price, sizes } = req.body || {};

      if (!title || price === undefined) {
        return res.status(400).json({ error: "Missing title/price" });
      }

      const kits = {
        home: (req.files?.homeImages || []).map(fileToUrl),
        away: (req.files?.awayImages || []).map(fileToUrl),
        third: (req.files?.thirdImages || []).map(fileToUrl),
        fourth: (req.files?.fourthImages || []).map(fileToUrl)
      };

      const info = db.prepare(`
        INSERT INTO products (title, price, sizes, kits)
        VALUES (?, ?, ?, ?)
      `).run(
        String(title).trim(),
        Number(price),
        JSON.stringify(normalizeSizes(sizes)),
        JSON.stringify(normalizeKits(kits))
      );

      res.json({ ok: true, id: info.lastInsertRowid });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  }
);

app.put(
  "/api/products/:id",
  isAdmin,
  upload.fields([
    { name: "homeImages", maxCount: 20 },
    { name: "awayImages", maxCount: 20 },
    { name: "thirdImages", maxCount: 20 },
    { name: "fourthImages", maxCount: 20 }
  ]),
  (req, res) => {
    try {
      const id = Number(req.params.id);
      const old = db.prepare("SELECT * FROM products WHERE id=?").get(id);

      if (!old) {
        return res.status(404).json({ error: "Product not found" });
      }

      const oldKits = normalizeKits(old.kits);
      const oldSizes = normalizeSizes(old.sizes);

      const { title, price, sizes, keepKits } = req.body || {};

      const nextTitle = title !== undefined ? String(title).trim() : old.title;
      const nextPrice = price !== undefined ? Number(price) : Number(old.price);
      const nextSizes = sizes !== undefined ? normalizeSizes(sizes) : oldSizes;
      const keep = keepKits ? normalizeKits(keepKits) : oldKits;

      const added = {
        home: (req.files?.homeImages || []).map(fileToUrl),
        away: (req.files?.awayImages || []).map(fileToUrl),
        third: (req.files?.thirdImages || []).map(fileToUrl),
        fourth: (req.files?.fourthImages || []).map(fileToUrl)
      };

      const kitsFinal = { home: [], away: [], third: [], fourth: [] };

      for (const k of Object.keys(kitsFinal)) {
        const previous = oldKits[k] || [];
        const kept = keep[k] || [];

        const removed = previous.filter(x => !kept.includes(x));
        removed.forEach(url => {
          const filename = path.basename(url);
          const filePath = path.join(uploadsPath, filename);
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        });

        kitsFinal[k] = [...kept, ...added[k]];
      }

      db.prepare(`
        UPDATE products
        SET title=?, price=?, sizes=?, kits=?
        WHERE id=?
      `).run(
        nextTitle,
        nextPrice,
        JSON.stringify(nextSizes),
        JSON.stringify(normalizeKits(kitsFinal)),
        id
      );

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  }
);

app.delete("/api/products/:id", isAdmin, (req, res) => {
  try {
    const id = Number(req.params.id);
    const old = db.prepare("SELECT * FROM products WHERE id=?").get(id);

    if (!old) {
      return res.status(404).json({ error: "Product not found" });
    }

    const kits = normalizeKits(old.kits);

    for (const k of Object.keys(kits)) {
      for (const url of kits[k]) {
        const filename = path.basename(url);
        const filePath = path.join(uploadsPath, filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
    }

    db.prepare("DELETE FROM products WHERE id=?").run(id);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/orders", (req, res) => {
  try {
    const { name, phone, address, items, payment_method } = req.body || {};

    if (!name || !phone || !address || !Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: "Missing info" });
    }

    const tx = db.transaction(() => {
      let total = 0;

      for (const item of items) {
        const productId = Number(item.productId);
        const qty = Number(item.qty || 0);
        const size = String(item.size || "").toUpperCase();
        const kit = String(item.kit || "home").toLowerCase();

        if (!productId || qty <= 0) {
          throw new Error("Invalid item");
        }

        const product = db.prepare("SELECT * FROM products WHERE id=?").get(productId);
        if (!product) throw new Error("Product not found");

        const sizesObj = normalizeSizes(product.sizes);
        if (!sizesObj[size] || sizesObj[size] < qty) {
          throw new Error(`Out of stock: ${product.title} size ${size}`);
        }

        sizesObj[size] -= qty;

        db.prepare("UPDATE products SET sizes=? WHERE id=?").run(
          JSON.stringify(sizesObj),
          productId
        );

        total += Number(item.unitPrice || 0) * qty;

        if (!["home", "away", "third", "fourth"].includes(kit)) {
          throw new Error("Invalid kit");
        }
      }

      db.prepare(`
        INSERT INTO orders (name, phone, address, items, total, payment_method)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        String(name).trim(),
        String(phone).trim(),
        String(address).trim(),
        JSON.stringify(items),
        total,
        payment_method || "COD"
      );

      return total;
    });

    const total = tx();
    res.json({ ok: true, total });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || "Order failed" });
  }
});

app.get("/api/orders", isAdmin, (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
    const q = String(req.query.q || "").trim();

    const where = q ? `WHERE name LIKE ? OR phone LIKE ?` : ``;
    const params = q ? [`%${q}%`, `%${q}%`] : [];

    const totalRow = db.prepare(`SELECT COUNT(*) c FROM orders ${where}`).get(...params);
    const total = Number(totalRow.c || 0);
    const pages = Math.max(1, Math.ceil(total / limit));
    const offset = (page - 1) * limit;

    const rows = db.prepare(`
      SELECT * FROM orders
      ${where}
      ORDER BY id DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    res.json({
      page,
      pages,
      total,
      rows: rows.map(o => ({
        ...o,
        items: safeJsonParse(o.items, [])
      }))
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/admin/stats", isAdmin, (req, res) => {
  try {
    const productsCount = db.prepare("SELECT COUNT(*) c FROM products").get().c;
    const ordersCount = db.prepare("SELECT COUNT(*) c FROM orders").get().c;
    const totalSales = db.prepare("SELECT COALESCE(SUM(total),0) s FROM orders").get().s || 0;

    const todayOrders = db.prepare(`
      SELECT COUNT(*) c
      FROM orders
      WHERE date(created_at)=date('now','localtime')
    `).get().c;

    const todaySales = db.prepare(`
      SELECT COALESCE(SUM(total),0) s
      FROM orders
      WHERE date(created_at)=date('now','localtime')
    `).get().s || 0;

    const perDay = db.prepare(`
      SELECT date(created_at) d, COUNT(*) c, COALESCE(SUM(total),0) s
      FROM orders
      GROUP BY date(created_at)
      ORDER BY d DESC
      LIMIT 7
    `).all().reverse();

    const lowStock = db.prepare("SELECT id,title,sizes FROM products").all()
      .map(p => {
        const sizes = normalizeSizes(p.sizes);
        const total = Object.values(sizes).reduce((a, b) => a + Number(b || 0), 0);
        return { id: p.id, title: p.title, total };
      })
      .sort((a, b) => a.total - b.total)
      .slice(0, 8);

    res.json({
      productsCount,
      ordersCount,
      totalSales,
      todayOrders,
      todaySales,
      perDay,
      lowStock
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

app.get("*", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

app.listen(PORT, () => {
  console.log("BK STORE PRO LIVE");
  console.log(`Server running on port ${PORT}`);
});
