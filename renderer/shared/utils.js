/* ==========================================================================
   CalcStore — Shared Formatting & Date Utilities (window.CalcUtils)
   --------------------------------------------------------------------------
   Pure helper functions for currency, quantity, date strings, and Arabic
   text normalization across renderer windows.
   ========================================================================== */

(function () {
  'use strict';

  // Helper: Round money to 2 decimals
  function round2(val) {
    return Math.round((Number(val) + Number.EPSILON) * 100) / 100;
  }

  // Helper: Format money to string with 'dzd' suffix
  function formatMoney(num) {
    const n = Number(num || 0);
    const formatted = parseFloat(n.toFixed(2)).toString();
    return `${formatted} dzd`;
  }

  // Helper: Get local date formatted as 'YYYY-MM-DD'
  function getLocalDateStr(d = new Date()) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  // Helper: Format date for UI display ('MM/DD/YYYY')
  function formatDateDisplay(d = new Date()) {
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  }

  // Helper: Parse 'YYYY-MM-DD' into local Date object
  function parseDateStr(str) {
    if (!str) return new Date();
    const [yyyy, mm, dd] = str.split('-').map(Number);
    return new Date(yyyy, mm - 1, dd);
  }

  // Helper: Normalize Arabic string for search/filtering
  function normalizeArabic(text) {
    if (!text) return '';
    return text
      .toLowerCase()
      .replace(/[\u064B-\u065F\u0670\u0640]/g, '') // remove tashkeel / diacritics / tatweel
      .replace(/[أإآا]/g, 'ا')               // normalize alefs
      .replace(/[ةه]/g, 'ه')                 // ة = ه
      .replace(/[ىي]/g, 'ي')                 // ى = ي
      .trim();
  }

  // Standard inline trash SVG icon used in product and sale deletion rows
  const TRASH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"
  width="20" height="20" fill="currentColor">
  <path d="M448,85.333h-66.133C371.66,35.703,328.002,0.064,277.333,0h-42.667
    c-50.669,0.064-94.327,35.703-104.533,85.333H64c-11.782,0-21.333,9.551-21.333,21.333
    S52.218,128,64,128h21.333v277.333C85.404,464.214,133.119,511.93,192,512h128
    c58.881-0.07,106.596-47.786,106.667-106.667V128H448c11.782,0,21.333-9.551,21.333-21.333
    S459.782,85.333,448,85.333z
    M234.667,362.667c0,11.782-9.551,21.333-21.333,21.333C201.551,384,192,374.449,192,362.667
    v-128c0-11.782,9.551-21.333,21.333-21.333c11.782,0,21.333,9.551,21.333,21.333V362.667z
    M320,362.667c0,11.782-9.551,21.333-21.333,21.333c-11.782,0-21.333-9.551-21.333-21.333
    v-128c0-11.782,9.551-21.333,21.333-21.333c11.782,0,21.333,9.551,21.333,21.333V362.667z
    M174.315,85.333c9.074-25.551,33.238-42.634,60.352-42.667h42.667
    c27.114,0.033,51.278,17.116,60.352,42.667H174.315z"/>
</svg>`;

  const CalcUtils = {
    round2,
    formatMoney,
    getLocalDateStr,
    formatDateDisplay,
    parseDateStr,
    normalizeArabic,
    TRASH_SVG,
  };

  if (typeof window !== 'undefined') {
    window.CalcUtils = CalcUtils;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = CalcUtils;
  }
})();
