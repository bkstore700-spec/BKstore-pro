const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(__dirname, "store.db"));

db.pragma("journal_mode = WAL");

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

db.prepare(`
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  phone TEXT,
  address TEXT,
  items TEXT,
  total REAL DEFAULT 0,
  payment_method TEXT DEFAULT 'COD',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
)
`).run();

try {
  db.prepare(`ALTER TABLE orders ADD COLUMN total REAL DEFAULT 0`).run();
} catch {}

try {
  db.prepare(`ALTER TABLE orders ADD COLUMN payment_method TEXT DEFAULT 'COD'`).run();
} catch {}

module.exports = db;
