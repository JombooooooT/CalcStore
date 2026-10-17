/**
 * CalcStore Automated Test Suite
 * Step 5A: Database, Money Math, and Stats Logic
 * Uses node:test and node:assert/strict
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const dbModule = require('../db.js');
const statsModule = require('../stats.js');
const calcUtils = require('../renderer/shared/utils.js');

describe('CalcStore Test Suite', () => {
  let db;

  beforeEach(() => {
    // Isolated in-memory database for every test
    db = dbModule.initDb(':memory:');
  });

  afterEach(() => {
    dbModule.closeDb();
  });

  // =========================================================================
  // A. Schema & Product Rules (db.js)
  // =========================================================================
  describe('A. Schema & Product Rules', () => {
    it('1. Seed & Schema v2: initializes with PRAGMA user_version = 2, 13 active products, and 0 sales', () => {
      const userVersion = db.pragma('user_version', { simple: true });
      assert.equal(userVersion, 2, 'user_version must be 2');

      dbModule.seedIfEmpty();

      const activeProducts = dbModule.listProducts();
      assert.equal(activeProducts.length, 13, 'Expected 13 active products after seed');

      const salesCount = db.prepare('SELECT COUNT(*) AS count FROM sales').get().count;
      assert.equal(salesCount, 0, 'Expected 0 sales in clean seed');

      const calcCount = db.prepare('SELECT COUNT(*) AS count FROM sales_calc').get().count;
      assert.equal(calcCount, 0, 'Expected 0 rows in sales_calc view in clean seed');
    });

    it('2. Validation & Constraints: buy_price = 0 allowed, negative buy_price / zero sell_price rejected, sell_price < buy_price allowed', () => {
      // buy_price = 0 is allowed (e.g., subsidized bread)
      const resZeroBuy = dbModule.addProduct({
        name: 'خبز مدعم جديد',
        buy: 0,
        sell: 15,
      });
      assert.equal(resZeroBuy.ok, true, 'buy_price = 0 must be allowed');
      assert.equal(resZeroBuy.product.buy_price, 0);

      // buy_price < 0 is rejected by validation
      const resNegBuy = dbModule.addProduct({
        name: 'منتج غير صالح 1',
        buy: -10,
        sell: 50,
      });
      assert.equal(resNegBuy.ok, false, 'Negative buy_price must fail validation');
      assert.ok(resNegBuy.errors && resNegBuy.errors.buy);

      // sell_price <= 0 is rejected by validation
      const resZeroSell = dbModule.addProduct({
        name: 'منتج غير صالح 2',
        buy: 20,
        sell: 0,
      });
      assert.equal(resZeroSell.ok, false, 'sell_price = 0 must fail validation');
      assert.ok(resZeroSell.errors && resZeroSell.errors.sell);

      const resNegSell = dbModule.addProduct({
        name: 'منتج غير صالح 3',
        buy: 20,
        sell: -5,
      });
      assert.equal(resNegSell.ok, false, 'Negative sell_price must fail validation');
      assert.ok(resNegSell.errors && resNegSell.errors.sell);

      // sell_price < buy_price is allowed (e.g., negative margin / subsidized promo)
      const resNegativeMargin = dbModule.addProduct({
        name: 'سكر مدعم تجريبي',
        buy: 500,
        sell: 400,
      });
      assert.equal(resNegativeMargin.ok, true, 'sell_price < buy_price must be allowed');
      assert.equal(resNegativeMargin.product.buy_price, 500);
      assert.equal(resNegativeMargin.product.sell_price, 400);

      // Direct SQL table constraint checks (CHECK (buy_price >= 0) and CHECK (sell_price > 0))
      assert.throws(() => {
        db.prepare('INSERT INTO products (name, buy_price, sell_price) VALUES (?, ?, ?)')
          .run('Direct SQL Neg Buy', -1, 100);
      }, /CHECK constraint failed/i);

      assert.throws(() => {
        db.prepare('INSERT INTO products (name, buy_price, sell_price) VALUES (?, ?, ?)')
          .run('Direct SQL Zero Sell', 50, 0);
      }, /CHECK constraint failed/i);
    });

    it('3. Soft Delete & Case-Insensitive Unique Active Name', () => {
      const p1 = dbModule.addProduct({ name: 'Milk Powder', buy: 100, sell: 150 });
      assert.equal(p1.ok, true);

      // Duplicate active name (exact and case-insensitive) is rejected
      const dupExact = dbModule.addProduct({ name: 'Milk Powder', buy: 120, sell: 160 });
      assert.equal(dupExact.ok, false);
      assert.ok(dupExact.errors && dupExact.errors.name);

      const dupCase = dbModule.addProduct({ name: 'milk powder', buy: 120, sell: 160 });
      assert.equal(dupCase.ok, false);
      assert.ok(dupCase.errors && dupCase.errors.name);

      // Soft delete sets is_active = 0
      const delRes = dbModule.deleteProduct(p1.product.id);
      assert.equal(delRes.ok, true);

      const deletedRow = db.prepare('SELECT id, name, is_active FROM products WHERE id = ?').get(p1.product.id);
      assert.ok(deletedRow, 'Row must still exist in DB');
      assert.equal(deletedRow.is_active, 0, 'Product must be soft-deleted (is_active = 0)');

      // Once soft-deleted, adding a new active product with that same name succeeds
      const reAdd = dbModule.addProduct({ name: 'milk powder', buy: 130, sell: 170 });
      assert.equal(reAdd.ok, true, 'Can re-add name once old one is soft-deleted');
      assert.notEqual(reAdd.product.id, p1.product.id);
    });
  });

  // =========================================================================
  // B. Calculator Money Math & Snapshot Rules (sales + sales_calc)
  // =========================================================================
  describe('B. Calculator Money Math & Snapshot Rules', () => {
    it('1. Standard Sale & Discount Formula: paid = ROUND(quantity * unit_price - discount, 2) and profit = ROUND(paid - quantity * unit_cost, 2)', () => {
      const prodRes = dbModule.addProduct({ name: 'Couscous', buy: 600, sell: 1000 });
      assert.equal(prodRes.ok, true);
      const prod = prodRes.product;

      // quantity = 2.5, unit_price = 1000, unit_cost = 600, discount = 100
      // paid = 2.5 * 1000 - 100 = 2400.00
      // profit = 2400.00 - (2.5 * 600 = 1500.00) = 900.00
      const saleRes = dbModule.addSale({
        productId: prod.id,
        inputType: 'amount',
        value: 2.5,
        discount: 100,
      });
      assert.equal(saleRes.ok, true);

      const calcRow = db.prepare('SELECT paid, profit, quantity, discount FROM sales_calc WHERE id = ?').get(saleRes.sale.id);
      assert.equal(calcRow.paid, 2400.00);
      assert.equal(calcRow.profit, 900.00);
      assert.equal(calcRow.quantity, 2.5);
      assert.equal(calcRow.discount, 100.00);
    });

    it('2. Unrounded Quantity When Typing Price (no rounding drift in paid & profit)', () => {
      const p1 = dbModule.addProduct({ name: 'Apples 320', buy: 220, sell: 320 }).product;
      // Customer asks for 100 DZD of a 320 DZD/kg item => quantity = 100 / 320 = 0.3125
      const s1 = dbModule.addSale({
        productId: p1.id,
        inputType: 'price',
        value: 100,
        discount: 0,
      }).sale;

      const r1 = db.prepare('SELECT paid, profit, quantity FROM sales_calc WHERE id = ?').get(s1.id);
      assert.equal(r1.paid, 100.00, 'Paid should equal exactly 100.00');
      // cost = 0.3125 * 220 = 68.75; profit = 100 - 68.75 = 31.25
      assert.equal(r1.profit, 31.25);

      const p2 = dbModule.addProduct({ name: 'Pears 300', buy: 200, sell: 300 }).product;
      // Customer asks for 100 DZD of a 300 DZD/kg item => quantity = 100 / 300 = 0.3333333333333333
      const s2 = dbModule.addSale({
        productId: p2.id,
        inputType: 'price',
        value: 100,
        discount: 0,
      }).sale;

      const r2 = db.prepare('SELECT paid, profit, quantity FROM sales_calc WHERE id = ?').get(s2.id);
      assert.equal(r2.paid, 100.00, 'Paid should round cleanly to 100.00');
      // cost = (100/300) * 200 = 66.66666667; profit = 100 - 66.66666667 = 33.33
      assert.equal(r2.profit, 33.33);
    });

    it('3. Zero Buy Price & Negative Profit Edge Cases', () => {
      // Zero buy price: cost = 0, sell = 15, qty = 4, disc = 0 => paid = 60.00, profit = 60.00
      const pZero = dbModule.addProduct({ name: 'Free Bread', buy: 0, sell: 15 }).product;
      const sZero = dbModule.addSale({
        productId: pZero.id,
        inputType: 'amount',
        value: 4,
        discount: 0,
      }).sale;

      const rZero = db.prepare('SELECT paid, profit FROM sales_calc WHERE id = ?').get(sZero.id);
      assert.equal(rZero.paid, 60.00);
      assert.equal(rZero.profit, 60.00);

      // Negative profit: cost = 500, sell = 400, qty = 1, disc = 0 => paid = 400.00, profit = -100.00
      const pNeg = dbModule.addProduct({ name: 'Subsidized Sugar', buy: 500, sell: 400 }).product;
      const sNeg = dbModule.addSale({
        productId: pNeg.id,
        inputType: 'amount',
        value: 1,
        discount: 0,
      }).sale;

      const rNeg = db.prepare('SELECT paid, profit FROM sales_calc WHERE id = ?').get(sNeg.id);
      assert.equal(rNeg.paid, 400.00);
      assert.equal(rNeg.profit, -100.00);
    });

    it('4. Historical Snapshot Immunity: updates or soft deletion of product do NOT alter past sales_calc', () => {
      const prod = dbModule.addProduct({ name: 'Original Flour', buy: 50, sell: 80 }).product;

      const sale = dbModule.addSale({
        productId: prod.id,
        inputType: 'amount',
        value: 2,
        discount: 10,
      }).sale;

      // Update product name, buy_price, sell_price
      dbModule.updateProduct(prod.id, { name: 'Renamed Flour Premium', buy: 120, sell: 200 });

      // Soft delete product
      dbModule.deleteProduct(prod.id);

      // Verify the past row in sales_calc is completely unchanged
      const pastCalc = db.prepare('SELECT * FROM sales_calc WHERE id = ?').get(sale.id);
      assert.equal(pastCalc.product_name, 'Original Flour');
      assert.equal(pastCalc.unit_price, 80);
      assert.equal(pastCalc.unit_cost, 50);
      assert.equal(pastCalc.discount, 10);
      assert.equal(pastCalc.paid, 150.00); // 2 * 80 - 10
      assert.equal(pastCalc.profit, 50.00); // 150 - (2 * 50)
    });

    it('5. Sale Deletion & Date-Filtered Sells List', () => {
      const p = dbModule.addProduct({ name: 'Oil', buy: 500, sell: 700 }).product;

      // Insert two sales on 2026-10-10 and one on 2026-10-11
      db.prepare(`
        INSERT INTO sales (product_id, product_name, quantity, unit_price, unit_cost, discount, sold_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(p.id, p.name, 1, 700, 500, 0, '2026-10-10 10:00:00');

      const s2 = db.prepare(`
        INSERT INTO sales (product_id, product_name, quantity, unit_price, unit_cost, discount, sold_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(p.id, p.name, 2, 700, 500, 50, '2026-10-10 14:00:00');

      db.prepare(`
        INSERT INTO sales (product_id, product_name, quantity, unit_price, unit_cost, discount, sold_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(p.id, p.name, 1, 700, 500, 0, '2026-10-11 09:00:00');

      // Query for 2026-10-10
      const listRes10 = dbModule.listSales('2026-10-10');
      assert.equal(listRes10.sales.length, 2);
      assert.equal(listRes10.totals.items, 2);
      // Sale 1: paid 700, profit 200. Sale 2: paid 1350, profit 350. Total: income 2050, profit 550.
      assert.equal(listRes10.totals.income, 2050.00);
      assert.equal(listRes10.totals.profit, 550.00);

      // Query for 2026-10-11
      const listRes11 = dbModule.listSales('2026-10-11');
      assert.equal(listRes11.sales.length, 1);
      assert.equal(listRes11.totals.items, 1);

      // Real deletion of s2
      const delSale = dbModule.deleteSale(Number(s2.lastInsertRowid));
      assert.equal(delSale.ok, true);
      assert.equal(delSale.deleted, true);

      // Verify list on 2026-10-10 now has only 1 sale and updated totals
      const afterDel = dbModule.listSales('2026-10-10');
      assert.equal(afterDel.sales.length, 1);
      assert.equal(afterDel.totals.items, 1);
      assert.equal(afterDel.totals.income, 700.00);
      assert.equal(afterDel.totals.profit, 200.00);
    });

    it('6. Date-Filtered Card Stats (getDayStats): returns correct items, income, and profit for past dates, and zero totals for empty dates', () => {
      const p = dbModule.addProduct({ name: 'Milk', buy: 80, sell: 120 }).product;

      // Seed 2 sales on 2026-10-12
      // Sale 1: qty = 2, sell = 120, cost = 80, disc = 0 -> paid = 240, profit = 80
      // Sale 2: qty = 1, sell = 120, cost = 80, disc = 20 -> paid = 100, profit = 20
      db.prepare(`
        INSERT INTO sales (product_id, product_name, quantity, unit_price, unit_cost, discount, sold_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(p.id, p.name, 2, 120, 80, 0, '2026-10-12 10:00:00');

      db.prepare(`
        INSERT INTO sales (product_id, product_name, quantity, unit_price, unit_cost, discount, sold_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(p.id, p.name, 1, 120, 80, 20, '2026-10-12 15:30:00');

      // 1. Stats for date with sales (2026-10-12)
      const stats12 = dbModule.getDayStats('2026-10-12');
      assert.equal(stats12.items, 2, 'Must have 2 items sold on 2026-10-12');
      assert.equal(stats12.income, 340.00, 'Income must be 240 + 100 = 340.00');
      assert.equal(stats12.profit, 100.00, 'Profit must be 80 + 20 = 100.00');

      // 2. Stats for date with 0 sales (2026-10-13)
      const stats13 = dbModule.getDayStats('2026-10-13');
      assert.equal(stats13.items, 0, 'Items must be 0 for empty day');
      assert.equal(stats13.income, 0, 'Income must be 0 for empty day');
      assert.equal(stats13.profit, 0, 'Profit must be 0 for empty day');
    });
  });

  // =========================================================================
  // C. Stats Engine Rules (stats.js)
  // =========================================================================
  describe('C. Stats Engine Rules', () => {
    const fixedToday = '2026-10-15';

    // Helper to insert sale on fixed date relative to fixedToday
    function insertRelativeSale(prod, daysAgo, qty, unitPrice, unitCost, discount = 0) {
      const dt = new Date(2026, 9, 15 - daysAgo); // 2026-10-15 minus daysAgo
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, '0');
      const d = String(dt.getDate()).padStart(2, '0');
      const soldAt = `${y}-${m}-${d} 12:00:00`;

      return db.prepare(`
        INSERT INTO sales (product_id, product_name, quantity, unit_price, unit_cost, discount, sold_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(prod.id, prod.name, qty, unitPrice, unitCost, discount, soldAt);
    }

    it('1. Today Never Counts in Stats: sales on today (daysAgo = 0) are excluded from day, week, and month', () => {
      const prod = dbModule.addProduct({ name: 'Bread', buy: 10, sell: 20 }).product;

      // Insert sale TODAY (2026-10-15)
      insertRelativeSale(prod, 0, 10, 20, 10, 0); // paid = 200, profit = 100

      // All stats queries for fixedToday must have 0 data and 0 totals
      const dayStats = statsModule.getStats(db, 'day', fixedToday);
      assert.equal(dayStats.hasData, false);
      assert.equal(dayStats.totals.items, 0);
      assert.equal(dayStats.totals.income, 0);
      assert.equal(dayStats.totals.profit, 0);

      const weekStats = statsModule.getStats(db, 'week', fixedToday);
      assert.equal(weekStats.hasData, false);
      assert.equal(weekStats.totals.items, 0);

      const monthStats = statsModule.getStats(db, 'month', fixedToday);
      assert.equal(monthStats.hasData, false);
      assert.equal(monthStats.totals.items, 0);
    });

    it('2. Period Boundaries Ending Yesterday: day (yesterday only), week (-7 to -1), month (-30 to -1)', () => {
      const prod = dbModule.addProduct({ name: 'Coffee', buy: 50, sell: 100 }).product;

      // Seed sales on various days:
      // - yesterday (1 day ago: 2026-10-14): 1 sale, paid 100, profit 50
      insertRelativeSale(prod, 1, 1, 100, 50, 0);

      // - 7 days ago (2026-10-08): 1 sale, paid 100, profit 50
      insertRelativeSale(prod, 7, 1, 100, 50, 0);

      // - 8 days ago (2026-10-07): 1 sale, paid 100, profit 50
      insertRelativeSale(prod, 8, 1, 100, 50, 0);

      // - 30 days ago (2026-09-15): 1 sale, paid 100, profit 50
      insertRelativeSale(prod, 30, 1, 100, 50, 0);

      // - 31 days ago (2026-09-14): 1 sale, paid 100, profit 50 (OUTSIDE 30-day window)
      insertRelativeSale(prod, 31, 1, 100, 50, 0);

      // DAY: covers ONLY yesterday (1 day ago)
      const day = statsModule.getStats(db, 'day', fixedToday);
      assert.equal(day.from, '2026-10-14');
      assert.equal(day.to, '2026-10-14');
      assert.equal(day.totals.items, 1);
      assert.equal(day.totals.income, 100.00);
      assert.equal(day.totals.profit, 50.00);
      assert.equal(day.labels, undefined, 'Day mode should not return chart series');

      // WEEK: covers 7 days (daysAgo 1..7: 2026-10-08 to 2026-10-14)
      // Contains daysAgo 1 and 7, excludes daysAgo 8
      const week = statsModule.getStats(db, 'week', fixedToday);
      assert.equal(week.from, '2026-10-08');
      assert.equal(week.to, '2026-10-14');
      assert.equal(week.totals.items, 2, 'Week includes 1 and 7 days ago, excludes 8');
      assert.equal(week.totals.income, 200.00);
      assert.equal(week.labels.length, 7);

      // MONTH: covers 30 days (daysAgo 1..30: 2026-09-15 to 2026-10-14)
      // Contains daysAgo 1, 7, 8, 30; excludes daysAgo 31
      const month = statsModule.getStats(db, 'month', fixedToday);
      assert.equal(month.from, '2026-09-15');
      assert.equal(month.to, '2026-10-14');
      assert.equal(month.totals.items, 4, 'Month includes 1, 7, 8, 30; excludes 31');
      assert.equal(month.totals.income, 400.00);
      assert.equal(month.labels.length, 30);
    });

    it('3. Zero-Filled Missing Days in Month (days -7, -19, -29 skipped)', () => {
      const prod = dbModule.addProduct({ name: 'Juice', buy: 60, sell: 120 }).product;
      const skipDays = new Set([7, 19, 29]);

      // Insert 1 sale on all days 1..30 except 7, 19, 29
      for (let d = 1; d <= 30; d++) {
        if (!skipDays.has(d)) {
          insertRelativeSale(prod, d, 1, 120, 60, 0);
        }
      }

      const month = statsModule.getStats(db, 'month', fixedToday);
      assert.equal(month.labels.length, 30);
      assert.equal(month.income.length, 30);
      assert.equal(month.profit.length, 30);

      // Determine date strings for skipped days:
      const range = statsModule.getDateRange('month', fixedToday);
      assert.equal(range.days.length, 30);

      const skipDates = [7, 19, 29].map((daysAgo) => {
        const dt = new Date(2026, 9, 15 - daysAgo);
        const y = dt.getFullYear();
        const m = String(dt.getMonth() + 1).padStart(2, '0');
        const d = String(dt.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      });

      for (const sDate of skipDates) {
        const idx = month.labels.indexOf(sDate);
        assert.ok(idx !== -1, `Date ${sDate} must be present in chart labels`);
        assert.equal(month.income[idx], 0, `Date ${sDate} must have 0 income`);
        assert.equal(month.profit[idx], 0, `Date ${sDate} must have 0 profit`);
      }
    });

    it('4. Items Sold (COUNT(*) lines, not SUM(qty)) and Best Day Logic (highest profit, not highest revenue)', () => {
      const p1 = dbModule.addProduct({ name: 'Big Qty Low Margin', buy: 98, sell: 100 }).product;
      const p2 = dbModule.addProduct({ name: 'Small Qty High Margin', buy: 10, sell: 100 }).product;

      // On Day 2 ago (2026-10-13): 1 sale line with quantity = 50
      // Revenue = 50 * 100 = 5000 DZD; Profit = 5000 - 4900 = 100 DZD
      insertRelativeSale(p1, 2, 50, 100, 98, 0);

      // On Day 3 ago (2026-10-12): 2 sale lines with small quantities but huge profit
      // Line A: qty = 5, rev = 500, profit = 450
      // Line B: qty = 5, rev = 500, profit = 450
      // Total Day 3 rev = 1000 DZD; Total Day 3 profit = 900 DZD
      insertRelativeSale(p2, 3, 5, 100, 10, 0);
      insertRelativeSale(p2, 3, 5, 100, 10, 0);

      const week = statsModule.getStats(db, 'week', fixedToday);

      // Items Sold must be 3 sale lines (1 from Day 2 + 2 from Day 3), NOT 50 + 5 + 5 = 60
      assert.equal(week.totals.items, 3, 'Items sold must equal count of sale lines, not sum of quantities');

      // Best Day must select Day 3 ('2026-10-12') because profit is 900 > 100, despite revenue being 1000 < 5000
      assert.equal(week.bestDay, '2026-10-12', 'Best Day must pick highest profit day');
    });

    it('5. Empty State (0 Sales): returns clean zero totals, no exceptions, no NaN/null values', () => {
      for (const period of ['day', 'week', 'month']) {
        const res = statsModule.getStats(db, period, fixedToday);
        assert.equal(res.ok, true);
        assert.equal(res.hasData, false);
        assert.equal(res.totals.items, 0);
        assert.equal(res.totals.income, 0);
        assert.equal(res.totals.profit, 0);
        assert.equal(res.totals.discounts, 0);
        assert.equal(res.marginPct, null);
        assert.equal(res.bestDay, null);
        assert.deepEqual(res.topByProfit, []);
        assert.deepEqual(res.topByQty, []);
        if (period !== 'day') {
          assert.ok(Array.isArray(res.labels));
          assert.ok(Array.isArray(res.income));
          assert.ok(Array.isArray(res.profit));
          assert.ok(res.income.every((v) => v === 0));
          assert.ok(res.profit.every((v) => v === 0));
        }
      }
    });
  });

  // =========================================================================
  // D. Shared Renderer Utilities (utils.js)
  // =========================================================================
  describe('D. Shared Renderer Utilities (utils.js)', () => {
    it('1. round2: floating-point edge cases (1.005, 0.1 + 0.2, negative numbers)', () => {
      assert.equal(calcUtils.round2(1.005), 1.01, '1.005 rounds to 1.01 with Number.EPSILON');
      assert.equal(calcUtils.round2(0.1 + 0.2), 0.3, '0.1 + 0.2 rounds to 0.3');
      assert.equal(calcUtils.round2(100.554), 100.55);
      assert.equal(calcUtils.round2(100.555), 100.56);
      assert.equal(calcUtils.round2(-10.256), -10.26);
      assert.equal(calcUtils.round2(0), 0);
    });

    it('2. formatMoney: formatting integers and decimals with dzd suffix', () => {
      assert.equal(calcUtils.formatMoney(100), '100 dzd');
      assert.equal(calcUtils.formatMoney(120.5), '120.5 dzd');
      assert.equal(calcUtils.formatMoney(120.55), '120.55 dzd');
      assert.equal(calcUtils.formatMoney(0), '0 dzd');
      assert.equal(calcUtils.formatMoney(null), '0 dzd');
      assert.equal(calcUtils.formatMoney(-50.25), '-50.25 dzd');
    });

    it('3. getLocalDateStr, formatDateDisplay, and parseDateStr round-trip consistency', () => {
      const testDate = new Date(2026, 9, 15); // 2026-10-15
      const dateStr = calcUtils.getLocalDateStr(testDate);
      assert.equal(dateStr, '2026-10-15');

      const displayStr = calcUtils.formatDateDisplay(testDate);
      assert.equal(displayStr, '10/15/2026');

      const parsedDate = calcUtils.parseDateStr('2026-10-15');
      assert.equal(parsedDate.getFullYear(), 2026);
      assert.equal(parsedDate.getMonth(), 9);
      assert.equal(parsedDate.getDate(), 15);

      // Round-trip check
      assert.equal(calcUtils.getLocalDateStr(parsedDate), '2026-10-15');
      assert.equal(calcUtils.formatDateDisplay(parsedDate), '10/15/2026');
    });

    it('4. normalizeArabic: stripping tashkeel and normalizing Alef variants (أ, إ, آ -> ا)', () => {
      // Strips tashkeel (fat-hah, dammah, kasrah, sukoon, shaddah, etc.)
      const withTashkeel = 'طَمَاطِمٌ';
      assert.equal(calcUtils.normalizeArabic(withTashkeel), 'طماطم');

      // Normalizes all Alef variants to bare Alef
      assert.equal(calcUtils.normalizeArabic('أحمد'), 'احمد');
      assert.equal(calcUtils.normalizeArabic('إبراهيم'), 'ابراهيم');
      assert.equal(calcUtils.normalizeArabic('آمال'), 'امال');

      // Normalizes ة -> ه and ى -> ي
      assert.equal(calcUtils.normalizeArabic('مكتبة'), 'مكتبه');
      assert.equal(calcUtils.normalizeArabic('مستشفى'), 'مستشفي');

      // Trims and handles null/empty
      assert.equal(calcUtils.normalizeArabic('   بصل   '), 'بصل');
      assert.equal(calcUtils.normalizeArabic(''), '');
      assert.equal(calcUtils.normalizeArabic(null), '');
    });
  });
});
