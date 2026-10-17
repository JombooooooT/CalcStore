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
const { getLocalDateStr, TRASH_SVG } = window.CalcUtils;

const urlParams = new URLSearchParams(window.location.search);
const queryDate = urlParams.get('date'); // 'YYYY-MM-DD'

const todayLocalStr = getLocalDateStr();
const isToday = !queryDate || queryDate === todayLocalStr;
const currentDateStr = queryDate || todayLocalStr;

const titleEl = document.querySelector('.ts-title');
if (titleEl) {
  titleEl.textContent = isToday ? "Today's Sells" : "Sells";
}
document.title = isToday ? "Today's Sells" : "Sells";

const dateEl = document.getElementById('ts-date');
if (dateEl) {
  dateEl.textContent = window.CalcUtils.formatDateDisplay(window.CalcUtils.parseDateStr(currentDateStr));
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
        tsScrollbar.update();
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
      `<td class="ts-col-product"><span class="ts-product-name" dir="auto" title="${window.escapeHtml(s.product_name)}">${window.escapeHtml(s.product_name)}</span></td>` +
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

  requestAnimationFrame(tsScrollbar.update);
}

// ── Custom Scrollbar Logic ─────────────────────────────────
const tsScrollbar = CustomScrollbar.attach({
  scrollArea,
  track: sbTrack,
  thumb: sbThumb,
});

// ── Initial Fetch ──────────────────────────────────────────
loadSales();
