/* =========================================================
   CalcStore — Renderer Logic
   ========================================================= */

// ── Window Controls ────────────────────────────────────────
document.getElementById('btn-minimize').addEventListener('click', () => {
  window.api.minimize();
});

document.getElementById('btn-close').addEventListener('click', () => {
  window.api.close();
});

// ── Blur toggle (when product form modal is open) ──────────
window.api.onBlur((blurred) => {
  document.getElementById('app').classList.toggle('blurred', blurred);
});

// ── Tab Switching ──────────────────────────────────────────
const tabButtons  = document.querySelectorAll('.tab-btn');
const sections    = document.querySelectorAll('.section');

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.target;

    // Update tab buttons
    tabButtons.forEach((b) => {
      const isActive = b === btn;
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-selected', String(isActive));
    });

    // Show matching section
    sections.forEach((sec) => {
      sec.classList.toggle('active', sec.id === `section-${target}`);
    });

    // Refresh product-list when its tab is opened
    if (target === 'products') {
      loadProducts();
      requestAnimationFrame(updatePLThumb);
    } else if (target === 'sales') {
      loadCalculatorProducts();
      loadDayCards();
    }
  });
});

// ── Calculator Tab ─────────────────────────────────────────

// Helper: Round money to 2 decimals
function round2(val) {
  return Math.round((Number(val) + Number.EPSILON) * 100) / 100;
}

function formatMoney(num) {
  const n = Number(num || 0);
  const formatted = parseFloat(n.toFixed(2)).toString();
  return `${formatted} dzd`;
}

function getLocalDateStr(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatDateDisplay(d = new Date()) {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

function parseDateStr(str) {
  if (!str) return new Date();
  const [yyyy, mm, dd] = str.split('-').map(Number);
  return new Date(yyyy, mm - 1, dd);
}

// ── Arabic Normalization Helper ────────────────────────────
function normalizeArabic(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '') // remove tashkeel / diacritics
    .replace(/[أإآا]/g, 'ا')               // normalize alefs
    .replace(/[ةه]/g, 'ه')                 // ة = ه
    .replace(/[ىي]/g, 'ي')                 // ى = ي
    .trim();
}

// ── Cards Metric Loading & Auto-fit ────────────────────────
const cardItemsEl  = document.getElementById('card-items');
const cardIncomeEl = document.getElementById('card-income');
const cardProfitEl = document.getElementById('card-profit');

function fitCardValue(el) {
  if (!el) return;
  const card = el.closest('.calc-card');
  if (!card) return;
  const maxW = card.clientWidth - 28; // width minus 14px padding each side
  let size = 32;
  el.style.fontSize = `${size}px`;
  while (el.scrollWidth > maxW && size > 20) {
    size -= 1;
    el.style.fontSize = `${size}px`;
  }
}

async function loadDayCards() {
  try {
    const todayStr = getLocalDateStr(new Date());
    const stats = await window.api.getDayStats(todayStr);
    if (cardItemsEl)  cardItemsEl.textContent = String(stats.items || 0);
    if (cardIncomeEl) cardIncomeEl.textContent = formatMoney(stats.income || 0);
    if (cardProfitEl) cardProfitEl.textContent = formatMoney(stats.profit || 0);

    requestAnimationFrame(() => {
      if (cardItemsEl)  fitCardValue(cardItemsEl);
      if (cardIncomeEl) fitCardValue(cardIncomeEl);
      if (cardProfitEl) fitCardValue(cardProfitEl);
    });
  } catch (err) {
    console.error('Failed to load day cards:', err);
  }
}

// ── Date Control (bottom-left) ─────────────────────────────
let selectedDate = getLocalDateStr(new Date());
const dateBtnEl     = document.getElementById('calc-date-btn');
const datePickerEl  = document.getElementById('calc-date-picker');
const sellsBtn      = document.getElementById('sells-btn');

function updateDateLimit() {
  const todayStr = getLocalDateStr(new Date());
  if (datePickerEl) {
    datePickerEl.max = todayStr;
  }
}

function updateDateUI() {
  const todayStr = getLocalDateStr(new Date());
  if (dateBtnEl) {
    dateBtnEl.textContent = formatDateDisplay(parseDateStr(selectedDate));
    const isCustom = selectedDate !== todayStr;
    dateBtnEl.classList.toggle('date-custom', isCustom);
  }
  if (datePickerEl) {
    datePickerEl.max = todayStr;
    datePickerEl.value = selectedDate;
  }
  if (sellsBtn) {
    sellsBtn.textContent = (selectedDate === todayStr) ? "Today's Sells" : "Day's Sells";
  }
}

// ── Midnight Timer & Re-check on Focus ─────────────────────
let lastCheckedDay = getLocalDateStr(new Date());

function setupMidnightTimer() {
  const now = new Date();
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
  const msUntilMidnight = Math.max(1000, nextMidnight.getTime() - now.getTime());

  setTimeout(() => {
    handleDayRollover();
    setupMidnightTimer();
  }, msUntilMidnight);
}

function handleDayRollover() {
  const currentDay = getLocalDateStr(new Date());
  updateDateLimit();

  if (currentDay !== lastCheckedDay) {
    // If selectedDate was today before midnight (equal to lastCheckedDay), follow to the new day; otherwise stay
    if (selectedDate === lastCheckedDay) {
      selectedDate = currentDay;
    }
    lastCheckedDay = currentDay;
    updateDateUI();
    loadDayCards();
  }
}

window.addEventListener('focus', () => {
  handleDayRollover();
  updateDateLimit();
});

if (dateBtnEl && datePickerEl) {
  dateBtnEl.addEventListener('click', () => {
    try {
      if (typeof datePickerEl.showPicker === 'function') {
        datePickerEl.showPicker();
      } else {
        datePickerEl.focus();
        datePickerEl.click();
      }
    } catch (e) {
      datePickerEl.focus();
    }
  });

  datePickerEl.addEventListener('change', () => {
    const val = datePickerEl.value;
    const todayStr = getLocalDateStr(new Date());
    if (val && val <= todayStr) {
      selectedDate = val;
      updateDateUI();
    } else {
      datePickerEl.value = selectedDate;
    }
  });
}

if (sellsBtn) {
  sellsBtn.addEventListener('click', () => {
    window.api.openTodaySells({ date: selectedDate });
  });
}

// ── Inline Messages (y = 312px) ────────────────────────────
const calcMsgEl = document.getElementById('calc-msg');
let calcMsgTimer = null;

function showCalcMessage(text, isError = false) {
  if (!calcMsgEl) return;
  if (calcMsgTimer) {
    clearTimeout(calcMsgTimer);
    calcMsgTimer = null;
  }

  calcMsgEl.textContent = text;
  calcMsgEl.className = `calc-msg ${isError ? 'error' : 'success'}`;
  calcMsgEl.style.opacity = '1';

  const timeoutMs = isError ? 4000 : 2000;
  calcMsgTimer = setTimeout(() => {
    clearCalcMessage();
  }, timeoutMs);
}

function clearCalcMessage() {
  if (!calcMsgEl) return;
  if (calcMsgTimer) {
    clearTimeout(calcMsgTimer);
    calcMsgTimer = null;
  }
  calcMsgEl.style.opacity = '0';
  calcMsgEl.textContent = '';
}

// ── Combobox State & Implementation ────────────────────────
let calcProducts = [];
let selectedProduct = null;
let filteredCalcProducts = [];
let comboboxHighlightIndex = -1;
let isComboboxOpen = false;

const dropdownContainer = document.getElementById('product-dropdown');
const dropdownWrap      = document.getElementById('dropdown-wrap');
const dropdownInput     = document.getElementById('dropdown-input');
const dropdownList      = document.getElementById('dropdown-list');

async function loadCalculatorProducts() {
  try {
    const list = await window.api.listProducts();
    // Active products sorted by name
    calcProducts = (list || []).slice().sort((a, b) => a.name.localeCompare(b.name, 'ar'));

    // Check if selected product was updated or deleted
    if (selectedProduct) {
      const match = calcProducts.find(p => p.id === selectedProduct.id);
      if (!match) {
        // Deleted
        selectedProduct = null;
        dropdownInput.value = '';
        recalcInputs();
      } else {
        // Renamed or price changed
        const nameChanged = selectedProduct.name !== match.name;
        selectedProduct = match;
        if (nameChanged && !isComboboxOpen) {
          dropdownInput.value = match.name;
        }
        recalcInputs();
      }
    }

    if (isComboboxOpen) {
      filterCombobox(dropdownInput.value);
    }
  } catch (err) {
    console.error('Failed to load calculator products:', err);
    calcProducts = [];
  }
}

function openCombobox() {
  if (isComboboxOpen) return;
  isComboboxOpen = true;
  dropdownContainer.classList.add('open');
  dropdownInput.setAttribute('aria-expanded', 'true');
  dropdownList.hidden = false;
  filterCombobox(dropdownInput.value);
}

function closeCombobox(restoreSelected = true) {
  if (!isComboboxOpen) return;
  isComboboxOpen = false;
  dropdownContainer.classList.remove('open');
  dropdownInput.setAttribute('aria-expanded', 'false');
  dropdownList.hidden = true;
  comboboxHighlightIndex = -1;

  if (restoreSelected) {
    dropdownInput.value = selectedProduct ? selectedProduct.name : '';
  }
}

function filterCombobox(query) {
  const normQuery = normalizeArabic(query);
  if (!normQuery) {
    filteredCalcProducts = calcProducts.slice();
  } else {
    filteredCalcProducts = calcProducts.filter(p => normalizeArabic(p.name).includes(normQuery));
  }

  comboboxHighlightIndex = filteredCalcProducts.length > 0 ? 0 : -1;
  renderComboboxList();
}

function renderComboboxList() {
  dropdownList.innerHTML = '';

  if (calcProducts.length === 0) {
    const emptyLi = document.createElement('li');
    emptyLi.className = 'dropdown-empty';
    emptyLi.textContent = 'No products yet';
    dropdownList.appendChild(emptyLi);
    return;
  }

  if (filteredCalcProducts.length === 0) {
    const emptyLi = document.createElement('li');
    emptyLi.className = 'dropdown-empty';
    emptyLi.textContent = 'No matching product';
    dropdownList.appendChild(emptyLi);
    return;
  }

  filteredCalcProducts.forEach((p, idx) => {
    const li = document.createElement('li');
    li.className = 'dropdown-item' + (idx === comboboxHighlightIndex ? ' highlighted' : '');
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', String(idx === comboboxHighlightIndex));
    li.setAttribute('dir', 'auto');
    li.title = p.name;
    li.textContent = p.name;

    li.addEventListener('mousedown', (e) => {
      e.preventDefault(); // keep focus
      selectComboboxProduct(p);
    });

    dropdownList.appendChild(li);
  });

  scrollHighlightIntoView();
}

function updateComboboxHighlight() {
  const items = dropdownList.querySelectorAll('.dropdown-item');
  items.forEach((item, idx) => {
    const isHigh = idx === comboboxHighlightIndex;
    item.classList.toggle('highlighted', isHigh);
    item.setAttribute('aria-selected', String(isHigh));
  });
  scrollHighlightIntoView();
}

function scrollHighlightIntoView() {
  const items = dropdownList.querySelectorAll('.dropdown-item');
  const highItem = items[comboboxHighlightIndex];
  if (highItem) {
    highItem.scrollIntoView({ block: 'nearest' });
  }
}

function selectComboboxProduct(p) {
  selectedProduct = p;
  dropdownInput.value = p.name;
  closeCombobox(false);
  recalcInputs();
  clearCalcMessage();
}

if (dropdownWrap && dropdownInput && dropdownList) {
  dropdownWrap.addEventListener('click', () => {
    dropdownInput.focus();
    if (!isComboboxOpen) {
      openCombobox();
    }
  });

  dropdownInput.addEventListener('focus', () => {
    if (!isComboboxOpen) {
      openCombobox();
    }
  });

  dropdownInput.addEventListener('input', () => {
    clearCalcMessage();
    if (!isComboboxOpen) {
      openCombobox();
    }
    filterCombobox(dropdownInput.value);
  });

  dropdownInput.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isComboboxOpen) {
        openCombobox();
      } else if (filteredCalcProducts.length > 0) {
        comboboxHighlightIndex = Math.min(comboboxHighlightIndex + 1, filteredCalcProducts.length - 1);
        updateComboboxHighlight();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (isComboboxOpen && filteredCalcProducts.length > 0) {
        comboboxHighlightIndex = Math.max(comboboxHighlightIndex - 1, 0);
        updateComboboxHighlight();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (isComboboxOpen && comboboxHighlightIndex >= 0 && comboboxHighlightIndex < filteredCalcProducts.length) {
        selectComboboxProduct(filteredCalcProducts[comboboxHighlightIndex]);
      } else {
        handleAddSale();
      }
    } else if (e.key === 'Escape') {
      if (isComboboxOpen) {
        e.preventDefault();
        e.stopPropagation();
        closeCombobox(true);
      }
    } else if (e.key === 'Tab') {
      closeCombobox(true);
    }
  });

  document.addEventListener('click', (e) => {
    if (!dropdownContainer.contains(e.target)) {
      closeCombobox(true);
    }
  });
}

// ── Price, Amount, Discount Inputs & Calculations ──────────
const priceInput    = document.getElementById('price-input');
const amountInput   = document.getElementById('amount-input');
const discountInput = document.getElementById('discount-input');
const addSaleBtn    = document.getElementById('add-btn');

let lastTyped = null; // 'price' | 'amount'
let rawPriceValue = null;
let rawAmountValue = null;
let rawDiscountValue = 0;

function sanitizeInputPrice(str) {
  let val = str.replace(/[^0-9.,]/g, '');
  const match = val.match(/[.,]/);
  if (match) {
    const idx = match.index;
    const sep = match[0];
    const before = val.slice(0, idx).replace(/[.,]/g, '');
    const after  = val.slice(idx + 1).replace(/[.,]/g, '').slice(0, 2);
    val = before + sep + after;
  }
  return val;
}

function sanitizeInputAmount(str) {
  let val = str.replace(/[^0-9.,]/g, '');
  const match = val.match(/[.,]/);
  if (match) {
    const idx = match.index;
    const sep = match[0];
    const before = val.slice(0, idx).replace(/[.,]/g, '');
    const after  = val.slice(idx + 1).replace(/[.,]/g, '').slice(0, 4);
    val = before + sep + after;
  }
  return val;
}

function recalcInputs() {
  if (!selectedProduct) {
    return;
  }

  const sellPrice = selectedProduct.sell_price;
  if (!sellPrice || sellPrice <= 0) return;

  if (lastTyped === 'price' && rawPriceValue !== null && rawPriceValue > 0) {
    // amount = price / sell_price (exact)
    rawAmountValue = rawPriceValue / sellPrice;
    amountInput.value = parseFloat(rawAmountValue.toFixed(4)).toString();
  } else if (lastTyped === 'amount' && rawAmountValue !== null && rawAmountValue > 0) {
    // price = round2(amount * sell_price)
    rawPriceValue = round2(rawAmountValue * sellPrice);
    priceInput.value = rawPriceValue.toFixed(2);
  }
}

if (priceInput) {
  priceInput.addEventListener('input', () => {
    clearCalcMessage();
    const cleanStr = sanitizeInputPrice(priceInput.value);
    priceInput.value = cleanStr;

    if (!cleanStr.trim()) {
      lastTyped = 'price';
      rawPriceValue = null;
      rawAmountValue = null;
      amountInput.value = '';
      return;
    }

    const num = Number(cleanStr.replace(',', '.'));
    if (!isNaN(num) && num > 0) {
      lastTyped = 'price';
      rawPriceValue = round2(num);
      if (selectedProduct && selectedProduct.sell_price > 0) {
        rawAmountValue = rawPriceValue / selectedProduct.sell_price;
        amountInput.value = parseFloat(rawAmountValue.toFixed(4)).toString();
      }
    } else {
      rawPriceValue = null;
    }
  });

  priceInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddSale();
    }
  });
}

if (amountInput) {
  amountInput.addEventListener('input', () => {
    clearCalcMessage();
    const cleanStr = sanitizeInputAmount(amountInput.value);
    amountInput.value = cleanStr;

    if (!cleanStr.trim()) {
      lastTyped = 'amount';
      rawPriceValue = null;
      rawAmountValue = null;
      priceInput.value = '';
      return;
    }

    const num = Number(cleanStr.replace(',', '.'));
    if (!isNaN(num) && num > 0) {
      lastTyped = 'amount';
      rawAmountValue = Math.round((num + Number.EPSILON) * 10000) / 10000;
      if (selectedProduct && selectedProduct.sell_price > 0) {
        rawPriceValue = round2(rawAmountValue * selectedProduct.sell_price);
        priceInput.value = rawPriceValue.toFixed(2);
      }
    } else {
      rawAmountValue = null;
    }
  });

  amountInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddSale();
    }
  });
}

if (discountInput) {
  discountInput.addEventListener('input', () => {
    clearCalcMessage();
    const cleanStr = sanitizeInputPrice(discountInput.value);
    discountInput.value = cleanStr;

    if (!cleanStr.trim()) {
      rawDiscountValue = 0;
      return;
    }

    const num = Number(cleanStr.replace(',', '.'));
    rawDiscountValue = (!isNaN(num) && num >= 0) ? round2(num) : 0;
  });

  discountInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddSale();
    }
  });
}

// ── Sale Submission (+ Button) ─────────────────────────────
let isSavingSale = false;

async function handleAddSale() {
  if (isSavingSale) return;

  // 1. Validation in renderer
  if (!selectedProduct) {
    showCalcMessage('Select a product', true);
    return;
  }

  let typedVal;
  if (lastTyped === 'price') {
    typedVal = rawPriceValue;
  } else if (lastTyped === 'amount') {
    typedVal = rawAmountValue;
  }

  if (typedVal === null || typedVal === undefined || typedVal <= 0) {
    showCalcMessage('Enter a price or an amount above 0', true);
    return;
  }

  // Calculate price before discount
  let priceBeforeDiscount;
  if (lastTyped === 'price') {
    priceBeforeDiscount = round2(rawPriceValue);
  } else {
    priceBeforeDiscount = round2(rawAmountValue * selectedProduct.sell_price);
  }

  const discount = rawDiscountValue || 0;
  if (discount > priceBeforeDiscount) {
    showCalcMessage("Discount can't be more than the price", true);
    return;
  }

  isSavingSale = true;
  if (addSaleBtn) addSaleBtn.disabled = true;

  try {
    const res = await window.api.addSale({
      productId: selectedProduct.id,
      inputType: lastTyped,
      value: typedVal,
      discount: discount,
    });

    if (!res || !res.ok) {
      const errMsg = (res && res.errors && (res.errors.product || res.errors.value || res.errors.discount)) || 'Failed to add sale';
      showCalcMessage(errMsg, true);
    } else {
      // Success: show message in #59e5d0 for 2 seconds
      showCalcMessage('Sale added', false);

      // Clear fields and selection
      selectedProduct = null;
      lastTyped = null;
      rawPriceValue = null;
      rawAmountValue = null;
      rawDiscountValue = 0;

      dropdownInput.value = '';
      priceInput.value = '';
      amountInput.value = '';
      discountInput.value = '';

      dropdownInput.focus();

      // Refresh cards
      await loadDayCards();
    }
  } catch (err) {
    console.error('Error adding sale:', err);
    showCalcMessage('Failed to add sale', true);
  } finally {
    isSavingSale = false;
    if (addSaleBtn) addSaleBtn.disabled = false;
  }
}

if (addSaleBtn) {
  addSaleBtn.addEventListener('click', handleAddSale);
}


// ── Product List Tab ───────────────────────────────────────

// Trash-can icon — sourced from renderer/icons/trash.svg
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

// Profit Margin helper: (sell - buy) / buy * 100 rounded to whole number
// When buy is 0, return null and show "—" in the Product list
function profitMarginPct(buy, sell) {
  const b = Number(buy);
  if (b === 0) return null;
  if (!b || b < 0) return 0;
  return Math.round(((sell - b) / b) * 100);
}

function formatProductId(id) {
  return id >= 1000 ? String(id) : String(id).padStart(3, '0');
}

let currentProducts = [];

// DOM References
const plEmptyEl  = document.getElementById('pl-empty');
const scrollArea = document.getElementById('pl-scroll-area');
const sbTrack    = document.getElementById('pl-sb-track');
const sbThumb    = document.getElementById('pl-sb-thumb');
const _editBtn   = document.getElementById('pl-edit-btn');
const _addBtn    = document.getElementById('pl-add-btn');
const plTbody    = document.getElementById('pl-tbody');

// Shared Delete Confirmation for Product List
const plDeleteConfirm = DeleteConfirm.attach({
  container: plTbody,
  onConfirm: async (id) => {
    const savedScroll = scrollArea.scrollTop;
    await window.api.deleteProduct(Number(id));

    // Clear selection after delete
    _editBtn.disabled = true;

    await loadProducts();
    scrollArea.scrollTop = savedScroll;
    updatePLThumb();
  },
  timeout: 3000,
});

// Render rows into #pl-tbody
function renderProductList(products) {
  plDeleteConfirm.disarm();

  if (!products || products.length === 0) {
    if (plEmptyEl) plEmptyEl.style.display = 'flex';
    scrollArea.style.display = 'none';
    sbTrack.style.display    = 'none';
    _editBtn.disabled        = true;
    return;
  }

  if (plEmptyEl) plEmptyEl.style.display = 'none';
  scrollArea.style.display = 'block';

  plTbody.innerHTML = '';

  products.forEach((p) => {
    const margin = profitMarginPct(p.buy_price, p.sell_price);
    const marginCls = (margin !== null && margin < 0) ? ' class="pl-margin-neg"' : '';
    const marginStr = margin === null ? '—' : `${margin}%`;

    const tr = document.createElement('tr');
    tr.className = 'pl-row';
    tr.dataset.id = String(p.id);

    tr.innerHTML =
      `<td>${formatProductId(p.id)}</td>` +
      `<td class="pl-name"><span dir="auto" title="${p.name}">${p.name}</span></td>` +
      `<td>${Number(p.buy_price).toFixed(2)} dzd</td>` +
      `<td>${Number(p.sell_price).toFixed(2)} dzd</td>` +
      `<td${marginCls}>${marginStr}</td>` +
      `<td class="col-del">` +
        `<button class="pl-del-btn del-btn" type="button" data-id="${p.id}" aria-label="Delete product" title="Delete">` +
          `<span class="del-icon">${TRASH_SVG}</span>` +
          `<span class="del-label">Delete?</span>` +
        `</button>` +
      `</td>`;

    plTbody.appendChild(tr);
  });

  updatePLThumb();
}

// ── Custom scrollbar ───────────────────────────────────────
function updatePLThumb() {
  const { scrollHeight, clientHeight, scrollTop } = scrollArea;
  if (!scrollHeight || clientHeight >= scrollHeight) {
    sbTrack.style.display = 'none';
    return;
  }

  sbTrack.style.display = 'block';
  const trackH  = sbTrack.clientHeight;
  const thumbH  = Math.max(24, (clientHeight / scrollHeight) * trackH);
  const maxTop  = trackH - thumbH;
  const thumbTop = (scrollTop / (scrollHeight - clientHeight)) * maxTop;
  sbThumb.style.height = `${thumbH}px`;
  sbThumb.style.top    = `${thumbTop}px`;
}

scrollArea.addEventListener('scroll', updatePLThumb, { passive: true });

// Click track to jump scroll position
sbTrack.addEventListener('click', e => {
  if (e.target === sbThumb) return;
  const rect    = sbTrack.getBoundingClientRect();
  const thumbH  = sbThumb.offsetHeight;
  const ratio   = (e.clientY - rect.top - thumbH / 2) / (rect.height - thumbH);
  const clamped = Math.max(0, Math.min(1, ratio));
  scrollArea.scrollTop = clamped * (scrollArea.scrollHeight - scrollArea.clientHeight);
});

// Drag the thumb
let _plDrag = false, _plStartY = 0, _plStartScroll = 0;

sbThumb.addEventListener('mousedown', e => {
  _plDrag        = true;
  _plStartY      = e.clientY;
  _plStartScroll = scrollArea.scrollTop;
  sbThumb.classList.add('dragging');
  e.preventDefault();
  e.stopPropagation();
});

document.addEventListener('mousemove', e => {
  if (!_plDrag) return;
  const trackH   = sbTrack.clientHeight;
  const thumbH   = sbThumb.offsetHeight;
  const maxTop   = trackH - thumbH;
  const deltaPx  = e.clientY - _plStartY;
  const ratio    = maxTop > 0 ? deltaPx / maxTop : 0;
  scrollArea.scrollTop = _plStartScroll + ratio * (scrollArea.scrollHeight - scrollArea.clientHeight);
});

document.addEventListener('mouseup', () => {
  if (_plDrag) { _plDrag = false; sbThumb.classList.remove('dragging'); }
});

// ── Load Products from DB ──────────────────────────────────
async function loadProducts(selectId = null) {
  try {
    currentProducts = await window.api.listProducts();
  } catch (err) {
    console.error('Failed to load products:', err);
    currentProducts = [];
  }

  renderProductList(currentProducts);

  if (selectId) {
    const targetRow = plTbody.querySelector(`tr[data-id="${selectId}"]`);
    if (targetRow) {
      const prev = plTbody.querySelector('tr.pl-row.selected');
      if (prev) prev.classList.remove('selected');

      targetRow.classList.add('selected');
      _editBtn.disabled = false;
      targetRow.scrollIntoView({ block: 'nearest' });
      requestAnimationFrame(updatePLThumb);
    }
  } else {
    const selected = plTbody.querySelector('tr.pl-row.selected');
    _editBtn.disabled = !selected;
  }
}

// ── Row selection ──────────────────────────────────────────
plTbody.addEventListener('click', e => {
  // Delete button must never change the selection
  if (e.target.closest('.col-del')) return;

  const row = e.target.closest('tr.pl-row');
  if (!row) return;

  const wasSelected = row.classList.contains('selected');

  // Clear existing selection
  const prev = plTbody.querySelector('tr.pl-row.selected');
  if (prev) prev.classList.remove('selected');

  // Toggle selection
  if (!wasSelected) row.classList.add('selected');

  // Enable edit button only when a row is selected
  _editBtn.disabled = wasSelected;
});

// ── Product Form — Add / Edit buttons ──────────────────────
_addBtn.addEventListener('click', () => {
  window.api.openProductForm({ mode: 'add' });
});

_editBtn.addEventListener('click', () => {
  const selectedRow = plTbody.querySelector('tr.pl-row.selected');
  if (!selectedRow) return;

  const id = Number(selectedRow.dataset.id);
  const product = currentProducts.find(p => p.id === id);
  if (!product) return;

  window.api.openProductForm({
    mode: 'edit',
    id:   product.id,
    name: product.name,
    buy:  String(product.buy_price),
    sell: String(product.sell_price),
  });
});

// Listen for updates from modal window saves
window.api.onProductsChanged((affectedId) => {
  loadProducts(affectedId);
  loadCalculatorProducts();
});

// Refresh today's cards when sales change (e.g. sale added or deleted)
if (window.api && typeof window.api.onSalesChanged === 'function') {
  window.api.onSalesChanged(() => {
    loadDayCards();
  });
}

// Initial product and calculator loads on startup
loadProducts();
loadCalculatorProducts();
loadDayCards();
updateDateUI();
setupMidnightTimer();


// ── Stats Tab ──────────────────────────────────────────────

/* ---- Temporary debug flag: set to true to test empty state - */
const DEBUG_EMPTY = false;

/* ---- Helper: generate MM/DD date labels ending yesterday -- */
function generateDateLabels(count) {
  const labels = [];
  const now = new Date();
  for (let i = count; i >= 1; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    labels.push(`${mm}/${dd}`);
  }
  return labels;
}

/* ---- Sample data ------------------------------------------ */
/* All sample values are static. Replace with real DB results.  */
const statsData = {
  day: {
    hasData: true,
    topByProfit: [
      { name: '\u0643\u0635\u0628\u0631 \u0645\u0631\u062d\u064a', value: 1800 },
      { name: '\u0637\u0645\u0627\u0637\u0645',                   value: 1400 },
      { name: '\u0628\u0637\u0627\u0637\u0627',                   value: 1100 },
      { name: '\u0628\u0635\u0644',                               value: 900 },
      { name: '\u062c\u0632\u0631',                               value: 650 },
    ],
    topByQty: [
      { name: '\u0628\u0637\u0627\u0637\u0627',                   value: 38 },
      { name: '\u0637\u0645\u0627\u0637\u0645',                   value: 34 },
      { name: '\u0643\u0635\u0628\u0631 \u0645\u0631\u062d\u064a', value: 28 },
      { name: '\u062c\u0632\u0631',                               value: 22 },
      { name: '\u0628\u0635\u0644',                               value: 18 },
    ],
    marginPct: 45,
    totalDiscounts: 300,
  },

  week: {
    hasData: true,
    labels: generateDateLabels(7),
    income: [12400, 15800, 13200, 16254, 14700, 17300, 15100],
    profit: [ 5900,  7500,  6400,  8002,  7100,  8400,  7200],
    topByProfit: [
      { name: '\u0643\u0635\u0628\u0631 \u0645\u0631\u062d\u064a', value: 3200 },
      { name: '\u0637\u0645\u0627\u0637\u0645',                   value: 2800 },
      { name: '\u0628\u0637\u0627\u0637\u0627',                   value: 2100 },
      { name: '\u0628\u0635\u0644',                               value: 1700 },
      { name: '\u062c\u0632\u0631',                               value: 1200 },
    ],
    topByQty: [
      { name: '\u0628\u0637\u0627\u0637\u0627',                   value: 72 },
      { name: '\u0637\u0645\u0627\u0637\u0645',                   value: 65 },
      { name: '\u0643\u0635\u0628\u0631 \u0645\u0631\u062d\u064a', value: 58 },
      { name: '\u062c\u0632\u0631',                               value: 42 },
      { name: '\u0628\u0635\u0644',                               value: 35 },
    ],
    marginPct: 49,
    bestDay: (() => {
      const d = new Date(); d.setDate(d.getDate() - 3);
      return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
    })(),
    totalDiscounts: 1200,
  },

  month: {
    hasData: true,
    labels: generateDateLabels(30),
    /* Real retail profile: gentle growth with weekend bumps, profit always ~47-49% */
    income: [
      11800, 12400, 12100, 12900, 14200, 15500, 13400,
      12600, 13100, 12800, 13700, 15100, 16400, 14100,
      13500, 14200, 13900, 14800, 16300, 17600, 15200,
      14400, 15100, 14700, 15800, 17200, 18500, 16100,
      15300, 16200,
    ],
    profit: [
      5600,  5900,  5700,  6100,  6800,  7400,  6300,
      6000,  6200,  6100,  6500,  7200,  7900,  6700,
      6400,  6800,  6600,  7100,  7800,  8400,  7300,
      6900,  7200,  7000,  7600,  8300,  8900,  7700,
      7300,  7800,
    ],
    topByProfit: [
      { name: '\u0643\u0635\u0628\u0631 \u0645\u0631\u062d\u064a', value: 9600 },
      { name: '\u0637\u0645\u0627\u0637\u0645',                   value: 8200 },
      { name: '\u0628\u0637\u0627\u0637\u0627',                   value: 6800 },
      { name: '\u0628\u0635\u0644',                               value: 5500 },
      { name: '\u062c\u0632\u0631',                               value: 4100 },
    ],
    topByQty: [
      { name: '\u0628\u0637\u0627\u0637\u0627',                   value: 210 },
      { name: '\u0637\u0645\u0627\u0637\u0645',                   value: 195 },
      { name: '\u0643\u0635\u0628\u0631 \u0645\u0631\u062d\u064a', value: 170 },
      { name: '\u062c\u0632\u0631',                               value: 130 },
      { name: '\u0628\u0635\u0644',                               value: 105 },
    ],
    marginPct: 52,
    bestDay: (() => {
      const d = new Date(); d.setDate(d.getDate() - 4);
      return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
    })(),
    totalDiscounts: 4850,
  },
};

/* ---- DOM references --------------------------------------- */
const _stChartWrap   = document.getElementById('st-chart-wrap');
const _stDayMsg      = document.getElementById('st-day-msg');
const _stEmptyMsg    = document.getElementById('st-empty-msg');
const _stLegendRow   = document.getElementById('st-legend-row');
const _stTop5Header  = document.getElementById('st-top5-header');
const _stTop5Tbody   = document.getElementById('st-top5-tbody');
const _stMargin      = document.getElementById('st-margin');
const _stBestDay     = document.getElementById('st-best-day');
const _stBestDayCol  = document.getElementById('st-best-day-col');
const _stDiscounts   = document.getElementById('st-discounts');

/* ---- Chart.js — create on demand when visible, animate on updates - */
const _appFont = "'Cairo', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
let _stChart = null;

function getOrInitChart(data, period) {
  if (_stChart) return _stChart;
  const canvas = document.getElementById('st-chart-canvas');
  if (!canvas) return null;

  const initWidth = period === 'month' ? 2 : 3;

  _stChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: data ? data.labels : [],
      datasets: [
        {
          label: 'Income',
          data: data ? data.income : [],
          borderColor: '#59e5d0',
          backgroundColor: 'rgba(89,229,208,0.12)',
          borderWidth: initWidth,
          cubicInterpolationMode: 'monotone',
          fill: true,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: '#59e5d0',
        },
        {
          label: 'Profit',
          data: data ? data.profit : [],
          borderColor: '#ffffff',
          backgroundColor: 'transparent',
          borderWidth: initWidth,
          cubicInterpolationMode: 'monotone',
          fill: false,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: '#ffffff',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 650,
        easing: 'easeInOutQuart',
      },
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          display: false, /* built-in legend disabled in favor of HTML legend */
        },
        tooltip: {
          backgroundColor: '#002323',
          titleColor: '#fff',
          bodyColor: '#fff',
          titleFont: { family: _appFont, size: 13 },
          bodyFont: { family: _appFont, size: 13 },
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y} dzd`,
          },
        },
      },
      scales: {
        x: {
          ticks: {
            autoSkip: false,
            maxRotation: 0,
            minRotation: 0,
            color: 'rgba(255,255,255,0.75)',
            font: { family: _appFont, size: 12 },
            callback: function(val, index) {
              const labels = this.chart.data.labels;
              if (!labels || labels.length <= 7) {
                return this.getLabelForValue(val);
              }
              // Month: show yesterday and every 5th day back
              if ((labels.length - 1 - index) % 5 === 0) {
                return this.getLabelForValue(val);
              }
              return '';
            },
          },
          grid: {
            color: 'rgba(255,255,255,0.10)',
          },
          border: { display: false },
        },
        y: {
          beginAtZero: true,
          grace: '5%',
          ticks: {
            color: 'rgba(255,255,255,0.75)',
            font: { family: _appFont, size: 12 },
          },
          grid: {
            color: 'rgba(255,255,255,0.10)',
          },
          border: { display: false },
        },
      },
    },
  });

  return _stChart;
}

/* ---- renderStats() — single function to update everything - */
function renderStats() {
  const period = document.querySelector('input[name="period"]:checked').value;
  const metric = document.querySelector('input[name="top-metric"]:checked').value;
  const rawData = statsData[period];
  const isEmpty = DEBUG_EMPTY || (rawData && rawData.hasData === false);

  const isProfit = metric === 'profit';
  _stTop5Header.textContent = isProfit ? 'Profit' : 'Quantity';

  /* ── 1. Empty State ─────────────────────────────────────── */
  if (isEmpty) {
    _stChartWrap.style.display = 'none';
    if (_stLegendRow) _stLegendRow.style.display = 'none';
    _stDayMsg.style.display    = 'none';
    if (_stEmptyMsg) _stEmptyMsg.style.display  = 'block';

    _stTop5Tbody.innerHTML = `
      <tr class="st-empty-table-row">
        <td colspan="2" class="st-empty-table-cell">No sales yet</td>
      </tr>
    `;

    _stMargin.textContent    = '—';
    _stDiscounts.textContent = '—';

    if (period === 'day') {
      _stBestDayCol.style.visibility = 'hidden';
    } else {
      _stBestDayCol.style.visibility = 'visible';
      _stBestDay.textContent = '—';
    }
    return;
  }

  /* ── 2. Active State (has data) ─────────────────────────── */
  if (_stEmptyMsg) _stEmptyMsg.style.display = 'none';

  /* -- Chart Card -- */
  if (period === 'day') {
    _stChartWrap.style.display = 'none';
    if (_stLegendRow) _stLegendRow.style.display = 'none';
    _stDayMsg.style.display    = 'block';
  } else {
    _stChartWrap.style.display = 'block';
    if (_stLegendRow) _stLegendRow.style.display = 'flex';
    _stDayMsg.style.display    = 'none';

    if (_secStats.classList.contains('active')) {
      const chart = getOrInitChart(rawData, period);
      if (chart) {
        const lineWidth = period === 'month' ? 2 : 3;
        chart.data.datasets[0].borderWidth = lineWidth;
        chart.data.datasets[1].borderWidth = lineWidth;
        chart.data.labels = rawData.labels;
        chart.data.datasets[0].data = rawData.income;
        chart.data.datasets[1].data = rawData.profit;
        chart.update(); // Smooth Chart.js morphing animation on period switch
      }
    }
  }

  /* -- Top 5 Table -- */
  const items = isProfit ? (rawData.topByProfit || []) : (rawData.topByQty || []);
  _stTop5Tbody.innerHTML = '';
  items.forEach((item) => {
    const tr = document.createElement('tr');
    const valStr = isProfit ? `${item.value.toFixed(2)} dzd` : String(item.value);
    tr.innerHTML =
      `<td><span class="st-top5-name" dir="auto" title="${item.name}">${item.name}</span></td>` +
      `<td><span class="st-top5-val">${valStr}</span></td>`;
    _stTop5Tbody.appendChild(tr);
  });

  /* -- Summary Line -- */
  _stMargin.textContent    = `${rawData.marginPct}%`;
  _stDiscounts.textContent = `${rawData.totalDiscounts.toFixed(2)} dzd`;

  if (period === 'day') {
    _stBestDayCol.style.visibility = 'hidden';
  } else if (rawData.bestDay) {
    _stBestDayCol.style.visibility = 'visible';
    _stBestDay.textContent = rawData.bestDay;
  } else {
    _stBestDayCol.style.visibility = 'hidden';
  }
}

/* ---- Wire up radio changes -------------------------------- */
document.querySelectorAll('input[name="period"]').forEach((r) => {
  r.addEventListener('change', renderStats);
});
document.querySelectorAll('input[name="top-metric"]').forEach((r) => {
  r.addEventListener('change', renderStats);
});

/* ---- Re-render & resize chart when Stats tab is activated - */
const _secStats = document.getElementById('section-stats');
const _statsObserver = new MutationObserver(() => {
  if (_secStats.classList.contains('active')) {
    requestAnimationFrame(() => {
      if (_stChart) {
        _stChart.resize();
      }
      renderStats();
    });
  }
});
_statsObserver.observe(_secStats, { attributes: true, attributeFilter: ['class'] });

/* ---- Initial render --------------------------------------- */
renderStats();


