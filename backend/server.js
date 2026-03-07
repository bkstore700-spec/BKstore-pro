require("dotenv").config();

const express = require("express");
const session = require("express-session");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 4000;

app.set("trust proxy", 1);

const frontendPath = path.join(__dirname, "frontend");
const uploadsPath = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}

const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "1234";
const SESSION_SECRET = process.env.SESSION_SECRET || "secret123";
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || "212600000000";

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

function safeParse(x, fallback) {
  try {
    return JSON.parse(x);
  } catch {
    return fallback;
  }
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsPath),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^\w.\-]+/g, "_");
    cb(null, Date.now() + "_" + safe);
  }
});

const upload = multer({ storage });

app.get("/api/config", (req, res) => {
  res.json({ whatsapp: WHATSAPP_NUMBER });
});

app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body || {};

  const okUser = String(username || "") === ADMIN_USER;

  const okPass =
    ADMIN_PASS.startsWith("$2")
      ? bcrypt.compareSync(String(password || ""), ADMIN_PASS)
      : String(password || "") === ADMIN_PASS;

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
  res.json({ admin: !!req.session.admin });
});

app.get("/api/products", (req, res) => {
  const rows = db.prepare("SELECT * FROM products ORDER BY id DESC").all();

  const products = rows.map((p) => ({
    ...p,
    sizes: safeParse(p.sizes, {}),
    kits: safeParse(p.kits, {})
  }));

  res.json(products);
});

app.post(
  "/api/products",
  isAdmin,
  upload.fields([
    { name: "homeImages" },
    { name: "awayImages" },
    { name: "thirdImages" },
    { name: "fourthImages" }
  ]),
  (req, res) => {
    try {
      const { title, price, sizes } = req.body || {};

      const kits = {
        home: (req.files?.homeImages || []).map((f) => "/uploads/" + f.filename),
        away: (req.files?.awayImages || []).map((f) => "/uploads/" + f.filename),
        third: (req.files?.thirdImages || []).map((f) => "/uploads/" + f.filename),
        fourth: (req.files?.fourthImages || []).map((f) => "/uploads/" + f.filename)
      };

      const info = db
        .prepare(
          `INSERT INTO products (title, price, sizes, kits)
           VALUES (?, ?, ?, ?)`
        )
        .run(
          title,
          price,
          sizes,
          JSON.stringify(kits)
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
    { name: "homeImages" },
    { name: "awayImages" },
    { name: "thirdImages" },
    { name: "fourthImages" }
  ]),
  (req, res) => {
    try {
      const id = Number(req.params.id);
      const old = db.prepare("SELECT * FROM products WHERE id=?").get(id);

      if (!old) {
        return res.status(404).json({ error: "Product not found" });
      }

      const { title, price, sizes, keepKits } = req.body || {};

      const oldKits = safeParse(old.kits, {
        home: [],
        away: [],
        third: [],
        fourth: []
      });

      const kept = keepKits
        ? safeParse(keepKits, { home: [], away: [], third: [], fourth: [] })
        : oldKits;

      const added = {
        home: (req.files?.homeImages || []).map((f) => "/uploads/" + f.filename),
        away: (req.files?.awayImages || []).map((f) => "/uploads/" + f.filename),
        third: (req.files?.thirdImages || []).map((f) => "/uploads/" + f.filename),
        fourth: (req.files?.fourthImages || []).map((f) => "/uploads/" + f.filename)
      };

      const finalKits = {
        home: [...(kept.home || []), ...added.home],
        away: [...(kept.away || []), ...added.away],
        third: [...(kept.third || []), ...added.third],
        fourth: [...(kept.fourth || []), ...added.fourth]
      };

      db.prepare(`
        UPDATE products
        SET title=?, price=?, sizes=?, kits=?
        WHERE id=?
      `).run(
        title || old.title,
        price || old.price,
        sizes || old.sizes,
        JSON.stringify(finalKits),
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

        const product = db.prepare("SELECT * FROM products WHERE id=?").get(productId);
        if (!product) throw new Error("Product not found");

        const sizes = safeParse(product.sizes, {
          S: 0, M: 0, L: 0, XL: 0, XXL: 0
        });

        if (!sizes[size] || sizes[size] < qty) {
          throw new Error(`Out of stock for size ${size}`);
        }

        sizes[size] -= qty;
        db.prepare("UPDATE products SET sizes=? WHERE id=?").run(
          JSON.stringify(sizes),
          productId
        );

        total += Number(item.unitPrice || 0) * qty;
      }

      db.prepare(`
        INSERT INTO orders (name, phone, address, items, total, payment_method)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        name,
        phone,
        address,
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
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/orders", isAdmin, (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.max(1, Number(req.query.limit || 20));
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
      rows: rows.map((o) => ({
        ...o,
        items: safeParse(o.items, [])
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
      .map((p) => {
        const sizes = safeParse(p.sizes, {});
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