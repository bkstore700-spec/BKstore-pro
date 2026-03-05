const path = require("path");
const Database = require("better-sqlite3");

const db = new Database(path.join(__dirname, "store.db"));

db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  price REAL NOT NULL,
  sizes TEXT NOT NULL,              -- JSON {S,M,L,XL,XXL}
  kits TEXT NOT NULL,               -- JSON {home:[], away:[], third:[], fourth:[]}
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'COD',
  items TEXT NOT NULL,              -- JSON [{productId,title,kit,size,qty,unitPrice}]
  total REAL NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

module.exports = db;
