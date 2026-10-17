/* =========================================================
   CalcStore — Shared Money Helpers (Main Process)
   ========================================================= */

'use strict';

// Round money to 2 decimals
function round2(val) {
  return Math.round((Number(val) + Number.EPSILON) * 100) / 100;
}

// Round quantity to 4 decimals
function round4(val) {
  return Math.round((Number(val) + Number.EPSILON) * 10000) / 10000;
}

module.exports = { round2, round4 };
