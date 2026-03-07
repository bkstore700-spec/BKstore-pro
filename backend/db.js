const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(__dirname, "store.db"));

db.pragma("journal_mode = WAL");

db.prepare(`
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  price REAL NOT NULL DEFAULT 0,
  sizes TEXT NOT NULL DEFAULT '{}',
  kits TEXT NOT NULL DEFAULT '{}',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
)
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  payment_method TEXT DEFAULT 'COD',
  items TEXT NOT NULL,
  total REAL NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
)
`).run();

try {
  db.prepare(`ALTER TABLE orders ADD COLUMN payment_method TEXT DEFAULT 'COD'`).run();
} catch {}

try {
  db.prepare(`ALTER TABLE orders ADD COLUMN total REAL NOT NULL DEFAULT 0`).run();
} catch {}

module.exports = db;
