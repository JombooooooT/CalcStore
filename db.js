/* =========================================================
   CalcStore — Database Module (Main Process Only)
   ========================================================= */

const Database = require('better-sqlite3');
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const stats = require('./stats.js');
const { round2 } = require('./lib/money.js');
const { getLocalDateStr } = require('./lib/dates.js');

let db = null;
let currentDbPath = null;

function getDb() {
  return db;
}

// Absolute path of the open database file, or null when uninitialized.
function getDbPath() {
  return (db && currentDbPath && currentDbPath !== ':memory:') ? currentDbPath : null;
}

// ── Database Initialization & Migrations ───────────────────
function initDb(customPath = null) {
  if (db) {
    try { db.close(); } catch (_) {}
    db = null;
  }

  let dbPath = customPath || process.env.CALCSTORE_DB_PATH;
  if (!dbPath) {
    const dbDir = app.getPath('userData');
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    dbPath = path.join(dbDir, 'sales.db');
  }

  console.log('Database path:', dbPath);

  db = new Database(dbPath);
  currentDbPath = dbPath;

  // Enforce WAL mode (if not memory) and foreign key constraints
  db.pragma('foreign_keys = ON');
  if (dbPath !== ':memory:') {
    db.pragma('journal_mode = WAL');
  }

  try {
    migrate(dbPath);
  } catch (err) {
    closeDb();
    throw err;
  }
  return db;
}

function closeDb() {
  if (db) {
    try { db.close(); } catch (_) {}
    db = null;
  }
  currentDbPath = null;
}

// Backup the live database to destinationPath using SQLite's native backup
// API. Unlike fs.copyFileSync, this reads through the SQLite connection, so it
// captures transactions still sitting in the WAL file and produces a
// consistent snapshot even while the database is in use.
function backup(destinationPath) {
  const conn = getDb();
  if (!conn) {
    return Promise.reject(new Error('Database is not initialized'));
  }
  return conn.backup(destinationPath);
}

function migrate(dbPath) {
  let userVersion = db.pragma('user_version', { simple: true });

  if (userVersion < 1) {
    const migrationTx = db.transaction(() => {
      // Products table
      db.exec(`
        CREATE TABLE IF NOT EXISTS products (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          name        TEXT NOT NULL,
          buy_price   REAL NOT NULL CHECK (buy_price > 0),
          sell_price  REAL NOT NULL CHECK (sell_price > 0),
          is_active   INTEGER NOT NULL DEFAULT 1,
          created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
          updated_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_products_name_active
          ON products(name COLLATE NOCASE) WHERE is_active = 1;
      `);

      // Sales table
      db.exec(`
        CREATE TABLE IF NOT EXISTS sales (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          product_id   INTEGER REFERENCES products(id),
          product_name TEXT NOT NULL,
          quantity     REAL NOT NULL CHECK (quantity > 0),
          unit_price   REAL NOT NULL,
          unit_cost    REAL NOT NULL,
          discount     REAL NOT NULL DEFAULT 0 CHECK (discount >= 0),
          sold_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );

        CREATE INDEX IF NOT EXISTS idx_sales_sold_at ON sales(sold_at);
      `);

      db.pragma('user_version = 1');
    });

    migrationTx();
    console.log('Database migrated to version 1');
    userVersion = 1;
  }

  if (userVersion < 2) {
    console.log('Migrating database to version 2 (buy price >= 0, sales_calc view)...');

    // 1. Snapshot the v1 database to sales.db.bak-v1 if not already present.
    //    db.serialize() reads through the live connection (WAL included), so
    //    this is a consistent, WAL-safe replacement for fs.copyFileSync.
    if (dbPath && dbPath !== ':memory:' && fs.existsSync(dbPath)) {
      const bakPath = path.join(path.dirname(dbPath), 'sales.db.bak-v1');
      if (!fs.existsSync(bakPath)) {
        try {
          fs.writeFileSync(bakPath, db.serialize());
          console.log('Created database backup at:', bakPath);
        } catch (bakErr) {
          console.error('Failed to create backup:', bakErr);
        }
      }
    }

    // 2. Rebuild products table: PRAGMA foreign_keys = OFF outside transaction
    db.pragma('foreign_keys = OFF');

    try {
      const migrationV2Tx = db.transaction(() => {
        db.exec(`
          CREATE TABLE products_new (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL,
            buy_price   REAL NOT NULL CHECK (buy_price >= 0),
            sell_price  REAL NOT NULL CHECK (sell_price > 0),
            is_active   INTEGER NOT NULL DEFAULT 1,
            created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
          );

          INSERT INTO products_new (id, name, buy_price, sell_price, is_active, created_at, updated_at)
          SELECT id, name, buy_price, sell_price, is_active, created_at, updated_at
          FROM products;

          DROP TABLE products;

          ALTER TABLE products_new RENAME TO products;

          CREATE UNIQUE INDEX IF NOT EXISTS idx_products_name_active
            ON products(name COLLATE NOCASE) WHERE is_active = 1;
        `);

        const fkErrors = db.pragma('foreign_key_check');
        if (fkErrors && fkErrors.length > 0) {
          throw new Error('Foreign key check failed: ' + JSON.stringify(fkErrors));
        }

        // Create / recreate VIEW sales_calc
        db.exec(`
          DROP VIEW IF EXISTS sales_calc;
          CREATE VIEW sales_calc AS
          SELECT
            id,
            product_id,
            product_name,
            quantity,
            unit_price,
            unit_cost,
            discount,
            sold_at,
            date(sold_at) AS sold_date,
            ROUND(quantity * unit_price - discount, 2) AS paid,
            ROUND(ROUND(quantity * unit_price - discount, 2) - quantity * unit_cost, 2) AS profit
          FROM sales;
        `);

        db.pragma('user_version = 2');
      });

      migrationV2Tx();
    } catch (err) {
      db.pragma('foreign_keys = ON');
      console.error('MIGRATION V2 FAILED:', err);
      throw err;
    }

    // Re-enable foreign keys outside transaction
    db.pragma('foreign_keys = ON');

    console.log('Database migrated to version 2 successfully');
  }
}

// ── Product Validation ─────────────────────────────────────
function validateProduct(data, existingId = null) {
  const errors = {};

  // Name validation
  let name = typeof data.name === 'string' ? data.name.trim().replace(/\s+/g, ' ') : '';
  if (!name) {
    errors.name = 'Name is required';
  } else if (name.length > 60) {
    errors.name = 'Name must be at most 60 characters';
  } else {
    // Unique among active products (case-insensitive)
    let duplicate;
    if (existingId) {
      const stmt = db.prepare('SELECT id FROM products WHERE name = ? COLLATE NOCASE AND is_active = 1 AND id != ?');
      duplicate = stmt.get(name, existingId);
    } else {
      const stmt = db.prepare('SELECT id FROM products WHERE name = ? COLLATE NOCASE AND is_active = 1');
      duplicate = stmt.get(name);
    }

    if (duplicate) {
      errors.name = 'A product with this name already exists';
    }
  }

  // Price validation helper
  function parsePrice(val, fieldName, allowZero = false) {
    if (val === undefined || val === null || String(val).trim() === '') {
      return { error: `${fieldName} is required` };
    }
    const cleanStr = String(val).trim().replace(',', '.');
    const num = Number(cleanStr);
    if (isNaN(num)) {
      return { error: `${fieldName} must be a valid number` };
    }
    if (allowZero) {
      if (num < 0) {
        return { error: `${fieldName} must be 0 or more` };
      }
    } else {
      if (num <= 0) {
        return { error: `${fieldName} must be above 0` };
      }
    }
    if (num > 9999999.99) {
      return { error: `${fieldName} cannot exceed 9,999,999.99` };
    }
    return { value: round2(num) };
  }

  const buyInput = data.buy !== undefined ? data.buy : data.buy_price;
  const buyRes = parsePrice(buyInput, 'Buy price', true);
  if (buyRes.error) {
    errors.buy = buyRes.error;
  }

  const sellInput = data.sell !== undefined ? data.sell : data.sell_price;
  const sellRes = parsePrice(sellInput, 'Sell price', false);
  if (sellRes.error) {
    errors.sell = sellRes.error;
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    cleanData: {
      name,
      buy_price: buyRes.value,
      sell_price: sellRes.value,
    },
  };
}

// ── Product CRUD Operations ────────────────────────────────
function listProducts() {
  const stmt = db.prepare(`
    SELECT id, name, buy_price, sell_price, is_active, created_at, updated_at
    FROM products
    WHERE is_active = 1
    ORDER BY id ASC
  `);
  return stmt.all();
}

function addProduct(data) {
  const validation = validateProduct(data);
  if (!validation.valid) {
    return { ok: false, errors: validation.errors };
  }

  const { name, buy_price, sell_price } = validation.cleanData;
  const stmt = db.prepare(`
    INSERT INTO products (name, buy_price, sell_price, is_active, created_at, updated_at)
    VALUES (?, ?, ?, 1, datetime('now','localtime'), datetime('now','localtime'))
  `);

  const info = stmt.run(name, buy_price, sell_price);
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid);
  return { ok: true, product };
}

function updateProduct(id, data) {
  const numId = Number(id);
  if (!numId) {
    return { ok: false, errors: { name: 'Invalid product ID' } };
  }

  const validation = validateProduct(data, numId);
  if (!validation.valid) {
    return { ok: false, errors: validation.errors };
  }

  const { name, buy_price, sell_price } = validation.cleanData;
  const stmt = db.prepare(`
    UPDATE products
    SET name = ?, buy_price = ?, sell_price = ?, updated_at = datetime('now','localtime')
    WHERE id = ? AND is_active = 1
  `);

  const info = stmt.run(name, buy_price, sell_price, numId);
  if (info.changes === 0) {
    return { ok: false, errors: { name: 'Product not found or inactive' } };
  }

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(numId);
  return { ok: true, product };
}

function deleteProduct(id) {
  const numId = Number(id);
  if (!numId) {
    return { ok: false, errors: { id: 'Invalid product ID' } };
  }

  const stmt = db.prepare(`
    UPDATE products
    SET is_active = 0, updated_at = datetime('now','localtime')
    WHERE id = ? AND is_active = 1
  `);

  const info = stmt.run(numId);
  return { ok: info.changes > 0, deleted: info.changes > 0, id: numId };
}

// ── Sales Operations ───────────────────────────────────────
function addSale({ productId, inputType, value, discount }) {
  const numId = Number(productId);
  if (!numId) {
    return { ok: false, errors: { product: 'Select a product' } };
  }

  const product = db.prepare('SELECT id, name, buy_price, sell_price, is_active FROM products WHERE id = ? AND is_active = 1').get(numId);
  if (!product) {
    return { ok: false, errors: { product: 'Product not found or inactive' } };
  }

  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return { ok: false, errors: { value: 'Enter a price or an amount above 0' } };
  }

  const numVal = value;

  let quantity;
  if (inputType === 'price') {
    if (numVal > 9999999.99) {
      return { ok: false, errors: { value: 'Price cannot exceed 9,999,999.99' } };
    }
    const cleanPrice = round2(numVal);
    // Quantity stored unrounded (full precision)
    quantity = cleanPrice / product.sell_price;
  } else if (inputType === 'amount') {
    if (numVal > 999999) {
      return { ok: false, errors: { value: 'Quantity cannot exceed 999,999' } };
    }
    // Typed amounts rounded to 4 decimals
    quantity = Math.round((numVal + Number.EPSILON) * 10000) / 10000;
  } else {
    return { ok: false, errors: { value: 'Invalid input type' } };
  }

  // Discount validation
  let cleanDiscount = 0;
  if (discount !== undefined && discount !== null) {
    if (typeof discount !== 'number' || !Number.isFinite(discount) || discount < 0) {
      return { ok: false, errors: { discount: "Discount must be 0 or more" } };
    }
    cleanDiscount = round2(discount);
  }

  const priceBeforeDiscount = round2(quantity * product.sell_price);
  if (cleanDiscount > priceBeforeDiscount) {
    return { ok: false, errors: { discount: "Discount can't be more than the price" } };
  }

  const insertStmt = db.prepare(`
    INSERT INTO sales (product_id, product_name, quantity, unit_price, unit_cost, discount, sold_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now','localtime'))
  `);

  const info = insertStmt.run(product.id, product.name, quantity, product.sell_price, product.buy_price, cleanDiscount);
  const sale = db.prepare('SELECT * FROM sales_calc WHERE id = ?').get(info.lastInsertRowid);

  if (process.argv.includes('--log-sales')) {
    console.log('Sale recorded:', sale);
  }

  return { ok: true, sale };
}

function getDayStats(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') {
    return { items: 0, income: 0, profit: 0 };
  }

  const stmt = db.prepare(`
    SELECT
      COUNT(*) AS items,
      COALESCE(SUM(paid), 0) AS income,
      COALESCE(SUM(profit), 0) AS profit
    FROM sales_calc
    WHERE sold_date = ?
  `);

  const row = stmt.get(dateStr) || {};
  return {
    items: Number(row.items || 0),
    income: round2(row.income || 0),
    profit: round2(row.profit || 0),
  };
}

function listSales(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') {
    return { sales: [], totals: { items: 0, income: 0, profit: 0 } };
  }

  const salesStmt = db.prepare(`
    SELECT
      id,
      sold_at,
      product_name,
      quantity,
      unit_price,
      discount,
      paid,
      profit
    FROM sales_calc
    WHERE sold_date = ?
    ORDER BY sold_at DESC, id DESC
  `);

  const totalsStmt = db.prepare(`
    SELECT
      COUNT(*) AS items,
      COALESCE(SUM(paid), 0) AS income,
      COALESCE(SUM(profit), 0) AS profit
    FROM sales_calc
    WHERE sold_date = ?
  `);

  const sales = salesStmt.all(dateStr) || [];
  const totalsRow = totalsStmt.get(dateStr) || {};

  return {
    sales,
    totals: {
      items: Number(totalsRow.items || 0),
      income: round2(totalsRow.income || 0),
      profit: round2(totalsRow.profit || 0),
    },
  };
}

function deleteSale(id) {
  // Deleting a wrongly entered sale is intentional, so it stops counting in every statistic.
  const stmt = db.prepare('DELETE FROM sales WHERE id = ?');
  const result = stmt.run(id);
  return {
    ok: result.changes > 0,
    deleted: result.changes > 0,
  };
}

// ── Dev Seed Functions ─────────────────────────────────────
function seedIfEmpty() {
  const countRow = db.prepare('SELECT COUNT(*) as count FROM products WHERE is_active = 1').get();
  if (countRow.count > 0) {
    return;
  }

  const samples = [
    { name: 'كصبر مرحي',                                             buy_price: 600.00,  sell_price: 1000.00 },
    { name: 'طماطم',                                                 buy_price: 120.00,  sell_price: 200.00 },
    { name: 'بطاطا',                                                 buy_price: 75.00,   sell_price: 120.00 },
    { name: 'بصل',                                                   buy_price: 100.00,  sell_price: 160.00 },
    { name: 'جزر',                                                   buy_price: 90.00,   sell_price: 150.00 },
    { name: 'ثوم',                                                   buy_price: 350.00,  sell_price: 550.00 },
    { name: 'فلفل',                                                  buy_price: 180.00,  sell_price: 280.00 },
    { name: 'خيار',                                                  buy_price: 110.00,  sell_price: 170.00 },
    { name: 'ليمون',                                                 buy_price: 220.00,  sell_price: 320.00 },
    { name: 'تفاح',                                                  buy_price: 300.00,  sell_price: 450.00 },
    // One very long name (~55 characters) to test table ellipsis
    { name: 'زيت زيتون بكر ممتاز طبيعي معصور على البارد عبوة 5 لتر', buy_price: 3800.00, sell_price: 4800.00 },
    // One product whose sell price is lower than its buy price (negative profit margin)
    { name: 'سكر أبيض مدعم',                                         buy_price: 500.00,  sell_price: 400.00 },
    // One product with buy price 0
    { name: 'خبز تقليدي مدعم',                                       buy_price: 0.00,    sell_price: 15.00 },
  ];

  const insertStmt = db.prepare(`
    INSERT INTO products (name, buy_price, sell_price, is_active, created_at, updated_at)
    VALUES (?, ?, ?, 1, datetime('now','localtime'), datetime('now','localtime'))
  `);

  const seedTx = db.transaction(() => {
    for (const item of samples) {
      insertStmt.run(item.name, item.buy_price, item.sell_price);
    }
  });

  seedTx();
}

// Fixed-seed pseudo-random generator (Mulberry32) for deterministic seeding
function mulberry32(seed) {
  return function() {
    let t = (seed += 0x6D2D79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedSalesIfEmpty() {
  const countRow = db.prepare('SELECT COUNT(*) as count FROM sales').get();
  if (countRow.count > 0) {
    return;
  }

  const activeProducts = db.prepare('SELECT * FROM products WHERE is_active = 1').all();
  if (!activeProducts || activeProducts.length === 0) {
    return;
  }

  const rng = mulberry32(42);
  const now = new Date();

  // 35 days spread (days 0..34), skipping 3 days (days 7, 19, 29) to test days without sales
  const skipDays = new Set([7, 19, 29]);
  const insertStmt = db.prepare(`
    INSERT INTO sales (product_id, product_name, quantity, unit_price, unit_cost, discount, sold_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const salesToInsert = [];

  for (let dayOffset = 34; dayOffset >= 0; dayOffset--) {
    if (skipDays.has(dayOffset)) continue;

    const dayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOffset);
    const dateStr = getLocalDateStr(dayDate);

    // 3 to 6 sales per active day (avg ~4.7 * 32 active days = ~150 sales)
    const salesToday = 3 + Math.floor(rng() * 4);
    const times = [];

    const maxHourToday = (dayOffset === 0) ? Math.min(20, Math.max(8, now.getHours())) : 20;
    const maxMinToday = (dayOffset === 0 && now.getHours() <= 20) ? Math.max(0, now.getMinutes() - 1) : 59;

    for (let s = 0; s < salesToday; s++) {
      let hour, minute, second;
      if (dayOffset === 0) {
        // Today: only times before the current time
        const startMin = 8 * 60;
        const endMin = Math.max(startMin + 1, maxHourToday * 60 + maxMinToday);
        const randMin = startMin + Math.floor(rng() * (endMin - startMin));
        hour = Math.floor(randMin / 60);
        minute = randMin % 60;
        second = Math.floor(rng() * 60);
      } else {
        hour = 8 + Math.floor(rng() * 12); // 8..19
        minute = Math.floor(rng() * 60);
        second = Math.floor(rng() * 60);
      }
      times.push({ hour, minute, second });
    }

    times.sort((a, b) => (a.hour * 3600 + a.minute * 60 + a.second) - (b.hour * 3600 + b.minute * 60 + b.second));

    for (const t of times) {
      const prod = activeProducts[Math.floor(rng() * activeProducts.length)];
      const hh = String(t.hour).padStart(2, '0');
      const mi = String(t.minute).padStart(2, '0');
      const ss = String(t.second).padStart(2, '0');
      const soldAt = `${dateStr} ${hh}:${mi}:${ss}`;

      const qType = Math.floor(rng() * 4);
      let quantity;
      if (qType === 0) {
        quantity = 1 + Math.floor(rng() * 5); // whole: 1, 2, 3, 4, 5
      } else if (qType === 1) {
        quantity = (1 + Math.floor(rng() * 4)) + 0.5; // halves: 1.5, 2.5, 3.5, 4.5
      } else if (qType === 2) {
        quantity = 0.5;
      } else {
        // unrounded (as if typed in price field): e.g. 500 / sellPrice
        const typedPrice = [250, 500, 750, 1000, 1200, 1500, 2500][Math.floor(rng() * 7)];
        quantity = prod.sell_price > 0 ? (typedPrice / prod.sell_price) : 1;
      }

      const priceBeforeDiscount = round2(quantity * prod.sell_price);

      let discount = 0;
      if (rng() < 0.20 && priceBeforeDiscount >= 10) {
        const rawDisc = 10 + Math.floor(rng() * 10) * 10;
        discount = Math.min(rawDisc, priceBeforeDiscount);
      }

      salesToInsert.push({
        productId: prod.id,
        productName: prod.name,
        quantity,
        unitPrice: prod.sell_price,
        unitCost: prod.buy_price,
        discount,
        soldAt,
      });
    }
  }

  const seedTx = db.transaction(() => {
    for (const s of salesToInsert) {
      insertStmt.run(s.productId, s.productName, s.quantity, s.unitPrice, s.unitCost, s.discount, s.soldAt);
    }
  });

  seedTx();
}

function getStats(period, todayStr) {
  return stats.getStats(db, period, todayStr);
}

function getAllSalesCalc() {
  const stmt = db.prepare(`
    SELECT
      id,
      product_id,
      product_name,
      quantity,
      unit_price,
      unit_cost,
      discount,
      sold_at,
      sold_date,
      paid,
      profit
    FROM sales_calc
    ORDER BY sold_at DESC, id DESC
  `);
  return stmt.all() || [];
}

// ── Factory Reset ──────────────────────────────────────────
// Wipes all sales and products, and resets the AUTOINCREMENT
// counters so ids start again from 1.
function clearAllData() {
  const tx = db.transaction(() => {
    db.exec('DELETE FROM sales;');
    db.exec('DELETE FROM products;');

    // sqlite_sequence exists only once an AUTOINCREMENT table has been
    // written to; guard the reset so a fresh database does not throw.
    const seq = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sqlite_sequence'")
      .get();
    if (seq) {
      db.exec('DELETE FROM sqlite_sequence;');
    }
  });

  tx();
  return { ok: true };
}

module.exports = {
  initDb,
  closeDb,
  getDb,
  getDbPath,
  backup,
  clearAllData,
  listProducts,
  addProduct,
  updateProduct,
  deleteProduct,
  addSale,
  getDayStats,
  getStats,
  listSales,
  deleteSale,
  getAllSalesCalc,
  seedIfEmpty,
  seedSalesIfEmpty,
};

