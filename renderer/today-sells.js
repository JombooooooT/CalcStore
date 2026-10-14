/* =========================================================
   Today's Sells — Renderer Logic (Real Data)
   ========================================================= */

// ── Close window & Escape key ─────────────────────────────
document.getElementById('ts-close').addEventListener('click', () => {
  window.sellsApi.close();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    // If a delete confirmation was armed, DeleteConfirm's capturing listener
    // cancels it and stops propagation. Only the second Escape reaches here.
    e.preventDefault();
    window.sellsApi.close();
  }
});

// ── Query string & Title / Date Setup ──────────────────────
const urlParams = new URLSearchParams(window.location.search);
const queryDate = urlParams.get('date'); // 'YYYY-MM-DD'

function getLocalDateString(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const todayLocalStr = getLocalDateString();
const isToday = !queryDate || queryDate === todayLocalStr;
const currentDateStr = queryDate || todayLocalStr;

const titleEl = document.querySelector('.ts-title');
if (titleEl) {
  titleEl.textContent = isToday ? "Today's Sells" : "Sells";
}
document.title = isToday ? "Today's Sells" : "Sells";

const dateEl = document.getElementById('ts-date');
if (currentDateStr && currentDateStr.includes('-')) {
  const [yyyy, mm, dd] = currentDateStr.split('-');
  dateEl.textContent = `${mm}/${dd}/${yyyy}`;
} else {
  dateEl.textContent = new Date().toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });
}

// ── Trash SVG Icon ─────────────────────────────────────────
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

// ── Helper: Escape HTML string ─────────────────────────────
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── DOM Elements ───────────────────────────────────────────
const tbodyEl       = document.getElementById('ts-tbody');
const scrollArea    = document.getElementById('ts-scroll-area');
const emptyEl       = document.getElementById('ts-empty');
const sbTrack       = document.getElementById('ts-sb-track');
const sbThumb       = document.getElementById('ts-sb-thumb');

const totalItemsEl  = document.getElementById('ts-total-items');
const totalIncomeEl = document.getElementById('ts-total-income');
const totalProfitEl = document.getElementById('ts-total-profit');

// ── Shared Delete Confirmation Attachment ──────────────────
DeleteConfirm.attach({
  container: tbodyEl,
  onConfirm: async (id) => {
    const savedScroll = scrollArea.scrollTop;
    try {
      await window.sellsApi.remove(Number(id));
    } catch (err) {
      console.error('Failed to delete sale:', err);
    }
    await loadSales(savedScroll);
  },
  timeout: 3000,
});

// ── Load & Render Sales from Database ──────────────────────
async function loadSales(restoreScrollTop = null) {
  try {
    const res = await window.sellsApi.list(currentDateStr);
    if (!res || !res.ok) {
      renderError("Couldn't load sales");
      return;
    }

    const { sales, totals } = res;
    renderSalesList(sales, totals);

    if (restoreScrollTop !== null) {
      requestAnimationFrame(() => {
        const maxScroll = Math.max(0, scrollArea.scrollHeight - scrollArea.clientHeight);
        scrollArea.scrollTop = Math.min(restoreScrollTop, maxScroll);
        updateScrollbar();
      });
    }
  } catch (err) {
    console.error('Error fetching sales:', err);
    renderError("Couldn't load sales");
  }
}

function renderError(msg) {
  if (emptyEl) {
    emptyEl.textContent = msg;
    emptyEl.style.display = 'flex';
  }
  scrollArea.style.display = 'none';
  sbTrack.style.display    = 'none';

  totalItemsEl.textContent  = '0';
  totalIncomeEl.textContent = '0.00 dzd';
  totalProfitEl.textContent = '0.00 dzd';
}

function renderSalesList(sales, totals) {
  if (!sales || sales.length === 0) {
    if (emptyEl) {
      emptyEl.textContent = isToday ? 'No sales today yet' : 'No sales on this day';
      emptyEl.style.display = 'flex';
    }
    scrollArea.style.display = 'none';
    sbTrack.style.display    = 'none';

    totalItemsEl.textContent  = '0';
    totalIncomeEl.textContent = '0.00 dzd';
    totalProfitEl.textContent = '0.00 dzd';
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';
  scrollArea.style.display = 'block';

  tbodyEl.innerHTML = '';

  sales.forEach((s) => {
    // Time = sold_at sliced to "HH:mm" (e.g. "2026-10-14 17:42:00" -> "17:42")
    const timeStr = s.sold_at ? s.sold_at.slice(11, 16) : '';

    // Amount = quantity with up to 4 decimals and trailing zeros removed
    const amountStr = parseFloat(Number(s.quantity).toFixed(4)).toString();

    // Paid, Discount, Profit = 2 decimals + " dzd" from database values
    const paidStr     = `${Number(s.paid).toFixed(2)} dzd`;
    const discountStr = `${Number(s.discount).toFixed(2)} dzd`;
    const profitStr   = `${Number(s.profit).toFixed(2)} dzd`;

    const tr = document.createElement('tr');
    tr.className = 'ts-row';
    tr.dataset.id = String(s.id);

    tr.innerHTML =
      `<td class="ts-col-time">${timeStr}</td>` +
      `<td class="ts-col-product"><span class="ts-product-name" dir="auto" title="${escapeHtml(s.product_name)}">${escapeHtml(s.product_name)}</span></td>` +
      `<td class="ts-col-amount">${amountStr}</td>` +
      `<td class="ts-col-paid">${paidStr}</td>` +
      `<td class="ts-col-discount">${discountStr}</td>` +
      `<td class="ts-col-profit">${profitStr}</td>` +
      `<td class="ts-col-del">` +
        `<button class="ts-del-btn del-btn" type="button" data-id="${s.id}" aria-label="Delete sale" title="Delete">` +
          `<span class="del-icon">${TRASH_SVG}</span>` +
          `<span class="del-label">Delete?</span>` +
        `</button>` +
      `</td>`;

    tbodyEl.appendChild(tr);
  });

  // Footer: Items sold = totals.items, Income = totals.income, Profit = totals.profit
  const itemsCount = totals ? Number(totals.items || 0) : 0;
  const incomeVal  = totals ? Number(totals.income || 0) : 0;
  const profitVal  = totals ? Number(totals.profit || 0) : 0;

  totalItemsEl.textContent  = String(itemsCount);
  totalIncomeEl.textContent = `${incomeVal.toFixed(2)} dzd`;
  totalProfitEl.textContent = `${profitVal.toFixed(2)} dzd`;

  requestAnimationFrame(updateScrollbar);
}

// ── Custom Scrollbar Logic ─────────────────────────────────
function updateScrollbar() {
  const { scrollHeight, clientHeight, scrollTop } = scrollArea;
  if (!scrollHeight || clientHeight >= scrollHeight) {
    sbTrack.style.display = 'none';
    return;
  }

  sbTrack.style.display = 'block';
  const trackH   = sbTrack.clientHeight;
  const thumbH   = Math.max(24, (clientHeight / scrollHeight) * trackH);
  const maxTop   = trackH - thumbH;
  const thumbTop = (scrollTop / (scrollHeight - clientHeight)) * maxTop;

  sbThumb.style.height = `${thumbH}px`;
  sbThumb.style.top    = `${thumbTop}px`;
}

scrollArea.addEventListener('scroll', updateScrollbar, { passive: true });

// Click track to jump scroll position
sbTrack.addEventListener('click', (e) => {
  if (e.target === sbThumb) return;
  const rect    = sbTrack.getBoundingClientRect();
  const thumbH  = sbThumb.offsetHeight;
  const ratio   = (e.clientY - rect.top - thumbH / 2) / (rect.height - thumbH);
  const clamped = Math.max(0, Math.min(1, ratio));
  scrollArea.scrollTop = clamped * (scrollArea.scrollHeight - scrollArea.clientHeight);
});

// Drag thumb
let _tsDrag = false;
let _tsStartY = 0;
let _tsStartScroll = 0;

sbThumb.addEventListener('mousedown', (e) => {
  _tsDrag        = true;
  _tsStartY      = e.clientY;
  _tsStartScroll = scrollArea.scrollTop;
  sbThumb.classList.add('dragging');
  e.preventDefault();
  e.stopPropagation();
});

document.addEventListener('mousemove', (e) => {
  if (!_tsDrag) return;
  const trackH  = sbTrack.clientHeight;
  const thumbH  = sbThumb.offsetHeight;
  const maxTop  = trackH - thumbH;
  const deltaPx = e.clientY - _tsStartY;
  const ratio   = maxTop > 0 ? deltaPx / maxTop : 0;
  scrollArea.scrollTop = _tsStartScroll + ratio * (scrollArea.scrollHeight - scrollArea.clientHeight);
});

document.addEventListener('mouseup', () => {
  if (_tsDrag) {
    _tsDrag = false;
    sbThumb.classList.remove('dragging');
  }
});

// ── Initial Fetch ──────────────────────────────────────────
loadSales();
