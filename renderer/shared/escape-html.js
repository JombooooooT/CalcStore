/* ==========================================================================
   Shared HTML Escaping Helper (window.escapeHtml)
   --------------------------------------------------------------------------
   Safely escapes &, <, >, ", and ' characters to prevent HTML/XSS injection
   when rendering user-supplied strings into HTML attributes or innerHTML.
   ========================================================================== */

window.escapeHtml = function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};
