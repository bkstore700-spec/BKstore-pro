const Database = require("better-sqlite3");
const path = require("path");

const dbPath = path.join(__dirname, "store.db");

const db = new Database(dbPath);

// ===== PRODUCTS TABLE =====
db.prepare(`
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  price REAL,
  sizes TEXT,
  kits TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
)
`).run();

// ===== ORDERS TABLE =====
db.prepare(`
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  phone TEXT,
  address TEXT,
  items TEXT,
  total REAL,
  payment_method TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
)
`).run();

// ===== SAFE MIGRATION =====
try {
  db.prepare(`ALTER TABLE orders ADD COLUMN total REAL`).run();
} catch {}

try {
  db.prepare(`ALTER TABLE orders ADD COLUMN payment_method TEXT`).run();
} catch {}

module.exports = db;
