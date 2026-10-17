/* =========================================================
   CalcStore — Shared Date Helpers (Main Process)
   ========================================================= */

'use strict';

// Format a Date as a local 'YYYY-MM-DD' string
function getLocalDateStr(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Shift a 'YYYY-MM-DD' date string by N days
function shiftDateStr(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return getLocalDateStr(dt);
}

module.exports = { getLocalDateStr, shiftDateStr };
