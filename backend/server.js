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

/* ---------- PATHS ---------- */

// frontend داخل backend
const frontendPath = path.join(__dirname, "frontend");
const uploadsPath = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}

/* ---------- ENV ---------- */

const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "1234";
const SESSION_SECRET = process.env.SESSION_SECRET || "secret123";
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || "212600000000";

/* ---------- MIDDLEWARE ---------- */

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

/* ---------- STATIC ---------- */

app.use("/uploads", express.static(uploadsPath));
app.use(express.static(frontendPath));

/* ---------- HELPERS ---------- */

function isAdmin(req, res, next) {
  if (req.session && req.session.admin) return next();
  res.status(401).json({ error: "Unauthorized" });
}

function safeParse(x, fallback) {
  try {
    return JSON.parse(x);
  } catch {
    return fallback;
  }
}

/* ---------- MULTER ---------- */

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsPath),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^\w.\-]+/g, "_");
    cb(null, Date.now() + "_" + safe);
  }
});

const upload = multer({ storage });

/* ---------- CONFIG ---------- */

app.get("/api/config", (req, res) => {
  res.json({ whatsapp: WHATSAPP_NUMBER });
});

/* ---------- AUTH ---------- */

app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body;

  const okUser = username === ADMIN_USER;
  const okPass =
    ADMIN_PASS.startsWith("$2")
      ? bcrypt.compareSync(password, ADMIN_PASS)
      : password === ADMIN_PASS;

  if (okUser && okPass) {
    req.session.admin = true;
    return res.json({ ok: true });
  }

  res.status(401).json({ error: "Wrong credentials" });
});

app.post("/api/admin/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/admin/me", (req, res) => {
  res.json({ admin: !!req.session.admin });
});

/* ---------- PRODUCTS ---------- */

app.get("/api/products", (req, res) => {
  const rows = db.prepare("SELECT * FROM products ORDER BY id DESC").all();

  const products = rows.map(p => ({
    ...p,
    sizes: safeParse(p.sizes, {}),
    kits: safeParse(p.kits, {})
  }));

  res.json(products);
});

/* ---------- CREATE PRODUCT ---------- */

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
      const { title, price, sizes } = req.body;

      const kits = {
        home: (req.files.homeImages || []).map(f => "/uploads/" + f.filename),
        away: (req.files.awayImages || []).map(f => "/uploads/" + f.filename),
        third: (req.files.thirdImages || []).map(f => "/uploads/" + f.filename),
        fourth: (req.files.fourthImages || []).map(f => "/uploads/" + f.filename)
      };

      const info = db
        .prepare(
          `INSERT INTO products (title,price,sizes,kits)
           VALUES (?,?,?,?)`
        )
        .run(title, price, sizes, JSON.stringify(kits));

      res.json({ ok: true, id: info.lastInsertRowid });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

/* ---------- ORDERS ---------- */

app.post("/api/orders", (req, res) => {
  try {
    const { name, phone, address, items } = req.body;

    const total = items.reduce(
      (a, b) => a + Number(b.unitPrice) * Number(b.qty),
      0
    );

    db.prepare(
      `INSERT INTO orders (name,phone,address,items,total)
       VALUES (?,?,?,?,?)`
    ).run(name, phone, address, JSON.stringify(items), total);

    res.json({ ok: true, total });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ---------- STATS ---------- */

app.get("/api/admin/stats", isAdmin, (req, res) => {
  const productsCount = db.prepare("SELECT COUNT(*) c FROM products").get().c;
  const ordersCount = db.prepare("SELECT COUNT(*) c FROM orders").get().c;
  const totalSales =
    db.prepare("SELECT SUM(total) s FROM orders").get().s || 0;

  res.json({
    productsCount,
    ordersCount,
    totalSales
  });
});

/* ---------- HOME ---------- */

app.get("/", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

/* ---------- FALLBACK ---------- */

app.get("*", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

/* ---------- START SERVER ---------- */

app.listen(PORT, () => {
  console.log("BK STORE PRO running on port", PORT);
});
