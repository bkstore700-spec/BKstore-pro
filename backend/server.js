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

// Railway proxy fix
app.set("trust proxy", 1);

// ENV
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "1234";
const SESSION_SECRET = process.env.SESSION_SECRET || "change_me";
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || "212600000000";

const frontendPath = path.join(__dirname, "../frontend");
const uploadsPath = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}

// Middlewares
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
      secure: true
    }
  })
);

// Static
app.use("/uploads", express.static(uploadsPath));
app.use(express.static(frontendPath));

// ---------- Helpers ----------
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
  const obj = typeof input === "string" ? safeJsonParse(input || "{}", {}) : (input || {});
  for (const k of Object.keys(base)) {
    const v = Number(obj[k] ?? 0);
    base[k] = Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
  }
  return base;
}

function normalizeKits(input) {
  const base = { home: [], away: [], third: [], fourth: [] };
  const obj = typeof input === "string" ? safeJsonParse(input || "{}", {}) : (input || {});
  for (const k of Object.keys(base)) {
    const arr = Array.isArray(obj[k]) ? obj[k] : [];
    base[k] = arr.map(x => String(x || "").trim()).filter(Boolean);
  }
  return base;
}

function fileToUrl(f) {
  return `/uploads/${f.filename}`;
}

// ---------- Multer ----------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsPath),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^\w.\-]+/g, "_");
    cb(null, Date.now() + "_" + Math.random().toString(16).slice(2) + "_" + safe);
  }
});

const upload = multer({ storage });

// ---------- Config ----------
app.get("/api/config", (req, res) => {
  res.json({ whatsapp: WHATSAPP_NUMBER });
});

// ---------- Auth ----------
app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body || {};

  const okUser = username === ADMIN_USER;
  const okPass =
    ADMIN_PASS.startsWith("$2")
      ? bcrypt.compareSync(password, ADMIN_PASS)
      : password === ADMIN_PASS;

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

// ---------- Products PUBLIC ----------
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

// ---------- Create Product ----------
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
      const { title, price, sizes } = req.body;

      const kits = {
        home: (req.files?.homeImages || []).map(fileToUrl),
        away: (req.files?.awayImages || []).map(fileToUrl),
        third: (req.files?.thirdImages || []).map(fileToUrl),
        fourth: (req.files?.fourthImages || []).map(fileToUrl)
      };

      const info = db
        .prepare(
          `INSERT INTO products (title,price,sizes,kits)
           VALUES (?,?,?,?)`
        )
        .run(
          title,
          price,
          JSON.stringify(normalizeSizes(sizes)),
          JSON.stringify(normalizeKits(kits))
        );

      res.json({ ok: true, id: info.lastInsertRowid });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

// ---------- Orders ----------
app.post("/api/orders", (req, res) => {
  const { name, phone, address, items } = req.body;

  if (!name || !phone || !address) {
    return res.status(400).json({ error: "Missing info" });
  }

  db.prepare(
    `INSERT INTO orders (name,phone,address,items)
     VALUES (?,?,?,?)`
  ).run(name, phone, address, JSON.stringify(items));

  res.json({ ok: true });
});

// ---------- Stats ----------
app.get("/api/admin/stats", isAdmin, (req, res) => {
  const productsCount = db.prepare("SELECT COUNT(*) c FROM products").get().c;
  const ordersCount = db.prepare("SELECT COUNT(*) c FROM orders").get().c;
  const totalSales = db.prepare("SELECT SUM(total) s FROM orders").get().s || 0;

  res.json({
    productsCount,
    ordersCount,
    totalSales
  });
});

// ---------- SPA fallback ----------
app.get("*", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

// ---------- Start Server ----------
app.listen(PORT, () => {
  console.log("✅ BK STORE PRO LIVE");
  console.log(`Server running on port ${PORT}`);
});
