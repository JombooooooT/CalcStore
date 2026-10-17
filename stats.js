/* =========================================================
   CalcStore — Stats Logic (Pure Functions, Main Process)
   ========================================================= */

const { round2, round4 } = require('./lib/money.js');
const { getLocalDateStr, shiftDateStr } = require('./lib/dates.js');

// Helper: Compute date range ending yesterday (TODAY IS NEVER INCLUDED)
function getDateRange(period, todayStr) {
  const yesterday = shiftDateStr(todayStr, -1);
  if (period === 'day') {
    return { from: yesterday, to: yesterday, days: [yesterday] };
  }

  const count = period === 'week' ? 7 : 30;
  const from = shiftDateStr(yesterday, -(count - 1));
  const days = [];
  let curr = from;
  for (let i = 0; i < count; i++) {
    days.push(curr);
    curr = shiftDateStr(curr, 1);
  }
  return { from, to: yesterday, days };
}

// Cache prepared statements per db instance (WeakMap avoids leaks)
const stmtCache = new WeakMap();

function getStatements(db) {
  let stmts = stmtCache.get(db);
  if (!stmts) {
    stmts = {
      totals: db.prepare(`
        SELECT
          COUNT(*) AS items,
          COALESCE(SUM(paid), 0) AS income,
          COALESCE(SUM(profit), 0) AS profit,
          COALESCE(SUM(discount), 0) AS discounts
        FROM sales_calc
        WHERE sold_date BETWEEN ? AND ?
      `),

      bestDay: db.prepare(`
        SELECT
          sold_date,
          SUM(profit) AS p
        FROM sales_calc
        WHERE sold_date BETWEEN ? AND ?
        GROUP BY sold_date
        ORDER BY p DESC, sold_date DESC
        LIMIT 1
      `),

      dailySeries: db.prepare(`
        SELECT
          sold_date,
          COALESCE(SUM(paid), 0) AS daily_income,
          COALESCE(SUM(profit), 0) AS daily_profit
        FROM sales_calc
        WHERE sold_date BETWEEN ? AND ?
        GROUP BY sold_date
      `),

      topByProfit: db.prepare(`
        SELECT
          (
            SELECT product_name
            FROM sales_calc s2
            WHERE s2.product_id = s.product_id AND s2.sold_date BETWEEN ? AND ?
            ORDER BY s2.sold_at DESC, s2.id DESC
            LIMIT 1
          ) AS name,
          ROUND(SUM(profit), 2) AS value
        FROM sales_calc s
        WHERE sold_date BETWEEN ? AND ?
        GROUP BY product_id
        ORDER BY value DESC, name ASC
        LIMIT 5
      `),

      topByQty: db.prepare(`
        SELECT
          (
            SELECT product_name
            FROM sales_calc s2
            WHERE s2.product_id = s.product_id AND s2.sold_date BETWEEN ? AND ?
            ORDER BY s2.sold_at DESC, s2.id DESC
            LIMIT 1
          ) AS name,
          ROUND(SUM(quantity), 4) AS value
        FROM sales_calc s
        WHERE sold_date BETWEEN ? AND ?
        GROUP BY product_id
        ORDER BY value DESC, name ASC
        LIMIT 5
      `),
    };
    stmtCache.set(db, stmts);
  }
  return stmts;
}

/**
 * Pure stats query function.
 * Reads ONLY from the sales_calc view.
 *
 * @param {object} db - better-sqlite3 database instance
 * @param {'day'|'week'|'month'} period
 * @param {string} todayStr - 'YYYY-MM-DD' local today
 * @returns {object} result shape
 */
function getStats(db, period, todayStr) {
  if (!todayStr) {
    todayStr = getLocalDateStr();
  }

  const { from, to, days } = getDateRange(period, todayStr);
  const stmts = getStatements(db);

  // 1. Totals
  const totalsRow = stmts.totals.get(from, to);
  const items = totalsRow.items;
  const income = round2(totalsRow.income);
  const profit = round2(totalsRow.profit);
  const discounts = round2(totalsRow.discounts);
  const hasData = items > 0;
  const totals = { items, income, profit, discounts };

  // 2. Margin Percentage: round(profit / income * 100), or null if income is 0 or no sales
  let marginPct = null;
  if (hasData && income !== 0) {
    marginPct = Math.round((profit / income) * 100);
  }

  // 3. Best Day: week and month only, null for day or when no sales
  let bestDay = null;
  if (period !== 'day' && hasData) {
    const bestRow = stmts.bestDay.get(from, to);
    bestDay = bestRow ? bestRow.sold_date : null;
  }

  // 4. Daily series (week & month only)
  let labels;
  let incomeSeries;
  let profitSeries;

  if (period !== 'day') {
    labels = [];
    incomeSeries = [];
    profitSeries = [];

    const dailyRows = stmts.dailySeries.all(from, to);
    const dayMap = new Map();
    for (const r of dailyRows) {
      dayMap.set(r.sold_date, {
        income: round2(r.daily_income),
        profit: round2(r.daily_profit),
      });
    }

    for (const dayStr of days) {
      labels.push(dayStr);
      const d = dayMap.get(dayStr);
      incomeSeries.push(d ? d.income : 0);
      profitSeries.push(d ? d.profit : 0);
    }
  }

  // 5. Top products
  const profitRows = stmts.topByProfit.all(from, to, from, to);
  const topByProfit = profitRows.map((r) => ({
    name: r.name,
    value: round2(r.value),
  }));

  const qtyRows = stmts.topByQty.all(from, to, from, to);
  const topByQty = qtyRows.map((r) => ({
    name: r.name,
    value: round4(r.value),
  }));

  const result = {
    ok: true,
    period,
    from,
    to,
    hasData,
    totals,
    marginPct,
    bestDay,
    topByProfit,
    topByQty,
  };

  if (period !== 'day') {
    result.labels = labels;
    result.income = incomeSeries;
    result.profit = profitSeries;
  }

  return result;
}

module.exports = {
  getStats,
  // Exported for the test suite (tests/calcstore.test.js) to verify date ranges.
  getDateRange,
};
