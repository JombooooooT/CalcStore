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
      requestAnimationFrame(plScrollbar.update);
    } else if (target === 'sales') {
      loadCalculatorProducts();
      loadDayCards();
    }
  });
});

// ── Calculator Tab ─────────────────────────────────────────
const {
  round2,
  formatMoney,
  getLocalDateStr,
  formatDateDisplay,
  parseDateStr,
  normalizeArabic,
  TRASH_SVG,
} = window.CalcUtils;

// ── Cards Metric Loading & Auto-fit ────────────────────────
const cardItemsEl       = document.getElementById('card-items');
const cardIncomeEl      = document.getElementById('card-income');
const cardProfitEl      = document.getElementById('card-profit');
const cardLabelItemsEl  = document.getElementById('card-label-items');
const cardLabelIncomeEl = document.getElementById('card-label-income');
const cardLabelProfitEl = document.getElementById('card-label-profit');

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

async function loadDayCards(targetDate = null) {
  try {
    const todayStr = getLocalDateStr(new Date());
    const queryDate = targetDate || selectedDate || todayStr;
    const isTargetToday = queryDate === todayStr;

    // Update card labels dynamically
    if (cardLabelItemsEl)  cardLabelItemsEl.textContent  = isTargetToday ? "Items Sold Today:" : "Items Sold:";
    if (cardLabelIncomeEl) cardLabelIncomeEl.textContent = isTargetToday ? "Today's Income:"   : "Income:";
    if (cardLabelProfitEl) cardLabelProfitEl.textContent = isTargetToday ? "Today's Profit:"   : "Profit:";

    const stats = await window.api.getDayStats(queryDate);
    if (!stats || stats.ok === false) {
      // Leave cards unchanged on failure
      return;
    }
    if (cardItemsEl)  cardItemsEl.textContent = String(stats.items ?? 0);
    if (cardIncomeEl) cardIncomeEl.textContent = formatMoney(stats.income ?? 0);
    if (cardProfitEl) cardProfitEl.textContent = formatMoney(stats.profit ?? 0);

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
    if (typeof invalidateStatsCache === 'function') {
      invalidateStatsCache();
    }
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
      loadDayCards();
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

// Fetch the active product list once; null signals a load failure.
async function fetchProducts() {
  try {
    const list = await window.api.listProducts();
    return Array.isArray(list) ? list : null;
  } catch (err) {
    console.error('Failed to load products:', err);
    return null;
  }
}

async function loadCalculatorProducts(list = null) {
  const items = list !== null ? list : await fetchProducts();
  if (items === null) {
    calcProducts = [];
    return;
  }

  // Active products sorted by name
  calcProducts = items.slice().sort((a, b) => a.name.localeCompare(b.name, 'ar'));

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

      // Cards refresh (and the stats cache is invalidated) via the
      // 'sales:changed' broadcast emitted by main.js on a successful add.
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
    plScrollbar.update();
  },
  timeout: 3000,
});

// Render rows into #pl-tbody
function renderProductList(products) {
  plDeleteConfirm.disarm();

  if (!products || products.length === 0) {
    if (plEmptyEl) {
      plEmptyEl.textContent = 'No products yet. Click Add product to start.';
      plEmptyEl.style.display = 'flex';
    }
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

    const safeName = window.escapeHtml(p.name);

    tr.innerHTML =
      `<td>${formatProductId(p.id)}</td>` +
      `<td class="pl-name"><span dir="auto" title="${safeName}">${safeName}</span></td>` +
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

  plScrollbar.update();
}

// ── Custom scrollbar ───────────────────────────────────────
const plScrollbar = CustomScrollbar.attach({
  scrollArea,
  track: sbTrack,
  thumb: sbThumb,
});

function renderProductListError(msg) {
  if (plEmptyEl) {
    plEmptyEl.textContent = msg;
    plEmptyEl.style.display = 'flex';
  }
  scrollArea.style.display = 'none';
  sbTrack.style.display    = 'none';
  _editBtn.disabled        = true;
}

// ── Load Products from DB ──────────────────────────────────
async function loadProducts(selectId = null, list = null) {
  const products = list !== null ? list : await fetchProducts();
  if (products === null) {
    currentProducts = [];
    renderProductListError("Couldn't load products");
    return;
  }

  currentProducts = products;
  renderProductList(currentProducts);

  if (selectId) {
    const targetRow = plTbody.querySelector(`tr[data-id="${selectId}"]`);
    if (targetRow) {
      const prev = plTbody.querySelector('tr.pl-row.selected');
      if (prev) prev.classList.remove('selected');

      targetRow.classList.add('selected');
      _editBtn.disabled = false;
      targetRow.scrollIntoView({ block: 'nearest' });
      requestAnimationFrame(plScrollbar.update);
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
window.api.onProductsChanged(async (affectedId) => {
  const list = await fetchProducts();
  await loadProducts(affectedId, list);
  await loadCalculatorProducts(list);
  if (typeof invalidateStatsCache === 'function') {
    invalidateStatsCache();
  }
});

// Refresh today's cards when sales change (e.g. sale added or deleted)
if (window.api && typeof window.api.onSalesChanged === 'function') {
  window.api.onSalesChanged(() => {
    loadDayCards();
    if (typeof invalidateStatsCache === 'function') {
      invalidateStatsCache();
    }
  });
}

// Initial product and calculator loads on startup
loadProducts();
loadCalculatorProducts();
loadDayCards();
updateDateUI();
setupMidnightTimer();


// ── Stats Tab ──────────────────────────────────────────────

/* ---- DOM references (declared before use) ---------------- */
const _secStats      = document.getElementById('section-stats');
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

/* ---- Chart.js — single instance updated on demand -------- */
const _appFont = "'Cairo', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
let _stChart = null;

function getOrInitChart(labels, income, profit, period) {
  if (_stChart) return _stChart;
  const canvas = document.getElementById('st-chart-canvas');
  if (!canvas) return null;

  const initWidth = period === 'month' ? 2 : 3;

  _stChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: labels || [],
      datasets: [
        {
          label: 'Income',
          data: income || [],
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
          data: profit || [],
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

/* ---- Cache & Request Tracking ---------------------------- */
const statsCache = {
  day: null,
  week: null,
  month: null,
};
let statsRequestId = 0;

function getSelectedPeriod() {
  const el = document.querySelector('input[name="period"]:checked');
  return el ? el.value : 'week';
}

function getSelectedMetric() {
  const el = document.querySelector('input[name="top-metric"]:checked');
  return el ? el.value : 'profit';
}

function formatChartLabels(labels) {
  if (!labels || !Array.isArray(labels)) return [];
  return labels.map((l) => {
    const parts = l.split('-');
    if (parts.length >= 3) {
      return `${parts[1]}/${parts[2]}`;
    }
    return l;
  });
}

function renderTop5Empty() {
  _stTop5Tbody.innerHTML = `
    <tr>
      <td colspan="2" class="st-empty-table-cell">No sales yet</td>
    </tr>
  `;
}

function renderTop5Table(data) {
  const isProfit = getSelectedMetric() === 'profit';
  _stTop5Header.textContent = isProfit ? 'Profit' : 'Quantity';

  if (!data || !data.hasData) {
    renderTop5Empty();
    return;
  }

  const items = isProfit ? (data.topByProfit || []) : (data.topByQty || []);
  if (items.length === 0) {
    renderTop5Empty();
    return;
  }

  _stTop5Tbody.innerHTML = '';
  items.forEach((item) => {
    const tr = document.createElement('tr');
    let valStr;
    let isNeg = false;
    if (isProfit) {
      valStr = `${Number(item.value).toFixed(2)} dzd`;
      if (Number(item.value) < 0) {
        isNeg = true;
      }
    } else {
      valStr = parseFloat(Number(item.value).toFixed(4)).toString();
    }

    const safeName = window.escapeHtml(item.name);
    const valClass = isNeg ? 'st-top5-val st-val-neg' : 'st-top5-val';

    tr.innerHTML =
      `<td><span class="st-top5-name" dir="auto" title="${safeName}">${safeName}</span></td>` +
      `<td><span class="${valClass}">${valStr}</span></td>`;
    _stTop5Tbody.appendChild(tr);
  });
}

function resetStatsPanels(period) {
  _stMargin.textContent    = '—';
  _stDiscounts.textContent = '—';
  if (period === 'day') {
    _stBestDayCol.style.visibility = 'hidden';
  } else {
    _stBestDayCol.style.visibility = 'visible';
    _stBestDay.textContent = '—';
  }
}

function showStatsLoading(period) {
  _stChartWrap.style.display = 'none';
  if (_stLegendRow) _stLegendRow.style.display = 'none';
  _stDayMsg.style.display    = 'none';
  if (_stEmptyMsg) _stEmptyMsg.style.display = 'none';

  renderTop5Empty();

  resetStatsPanels(period);
}

function showStatsFailure(period) {
  _stChartWrap.style.display = 'none';
  if (_stLegendRow) _stLegendRow.style.display = 'none';
  if (_stEmptyMsg) _stEmptyMsg.style.display = 'none';

  _stDayMsg.textContent = "Couldn't load statistics";
  _stDayMsg.style.display = 'block';

  renderTop5Empty();

  resetStatsPanels(period);
}

function displayStats(data, period) {
  const isProfit = getSelectedMetric() === 'profit';
  _stTop5Header.textContent = isProfit ? 'Profit' : 'Quantity';

  /* ── 1. Empty State (no sales) ──────────────────────────── */
  if (!data || data.hasData === false) {
    _stChartWrap.style.display = 'none';
    if (_stLegendRow) _stLegendRow.style.display = 'none';
    _stDayMsg.style.display    = 'none';
    if (_stEmptyMsg) {
      _stEmptyMsg.textContent = 'No sales in this period';
      _stEmptyMsg.style.display = 'block';
    }

    renderTop5Empty();

    resetStatsPanels(period);
    return;
  }

  /* ── 2. Active State (has data) ─────────────────────────── */
  if (_stEmptyMsg) _stEmptyMsg.style.display = 'none';

  /* -- Chart Card -- */
  if (period === 'day') {
    _stChartWrap.style.display = 'none';
    if (_stLegendRow) _stLegendRow.style.display = 'none';
    _stDayMsg.textContent = "Can't display data of a day!";
    _stDayMsg.style.display = 'block';
  } else {
    _stDayMsg.style.display = 'none';
    _stChartWrap.style.display = 'block';
    if (_stLegendRow) _stLegendRow.style.display = 'flex';

    if (_secStats.classList.contains('active')) {
      const formattedLabels = formatChartLabels(data.labels);
      const chart = getOrInitChart(formattedLabels, data.income, data.profit, period);
      if (chart) {
        const lineWidth = period === 'month' ? 2 : 3;
        chart.data.datasets[0].borderWidth = lineWidth;
        chart.data.datasets[1].borderWidth = lineWidth;
        chart.data.labels = formattedLabels;
        chart.data.datasets[0].data = data.income;
        chart.data.datasets[1].data = data.profit;
        chart.update(); // Smooth Chart.js morphing animation
      }
    }
  }

  /* -- Top 5 Table -- */
  renderTop5Table(data);

  /* -- Summary Line -- */
  _stMargin.textContent = data.marginPct !== null ? `${data.marginPct}%` : '—';
  _stDiscounts.textContent = `${Number(data.totals.discounts || 0).toFixed(2)} dzd`;

  if (period === 'day') {
    _stBestDayCol.style.visibility = 'hidden';
  } else if (data.bestDay) {
    _stBestDayCol.style.visibility = 'visible';
    const parts = data.bestDay.split('-');
    if (parts.length >= 3) {
      _stBestDay.textContent = `${parts[1]}/${parts[2]}/${parts[0]}`;
    } else {
      _stBestDay.textContent = data.bestDay;
    }
  } else {
    _stBestDayCol.style.visibility = 'visible';
    _stBestDay.textContent = '—';
  }
}

async function renderStats() {
  const period = getSelectedPeriod();

  if (statsCache[period]) {
    displayStats(statsCache[period], period);
    return;
  }

  showStatsLoading(period);

  const reqId = ++statsRequestId;

  try {
    const res = await window.api.getStats(period);

    // Stale response check: user switched periods while request was in-flight
    if (reqId !== statsRequestId) {
      return;
    }

    if (!res || res.ok === false) {
      showStatsFailure(period);
      return;
    }

    statsCache[period] = res;
    displayStats(res, period);
  } catch (err) {
    if (reqId !== statsRequestId) return;
    console.error('Failed to load statistics:', err);
    showStatsFailure(period);
  }
}

function invalidateStatsCache() {
  statsCache.day = null;
  statsCache.week = null;
  statsCache.month = null;

  if (_secStats && _secStats.classList.contains('active')) {
    renderStats();
  }
}

/* ---- Event listeners -------------------------------------- */
document.querySelectorAll('input[name="period"]').forEach((r) => {
  r.addEventListener('change', () => {
    renderStats();
  });
});

document.querySelectorAll('input[name="top-metric"]').forEach((r) => {
  r.addEventListener('change', () => {
    const period = getSelectedPeriod();
    renderTop5Table(statsCache[period]);
  });
});

/* ---- Re-render & resize chart when Stats tab is activated - */
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

// ── Global Keyboard Shortcuts ──────────────────────────────
document.addEventListener('keydown', async (e) => {
  // 1. CSV Export: Ctrl+E (or Ctrl+e)
  if (e.ctrlKey && (e.key === 'e' || e.key === 'E')) {
    e.preventDefault();
    try {
      const res = await window.api.exportCsv();
      if (res && res.ok) {
        alert('Export Complete');
      } else if (res && res.error) {
        alert('Export Failed: ' + res.error);
      }
    } catch (err) {
      console.error('Failed to export CSV:', err);
      alert('Export Failed');
    }
    return;
  }

  // 2. Escape: Close any open modal / dropdown
  if (e.key === 'Escape') {
    // If the calculator combobox is open, close it
    if (typeof isComboboxOpen !== 'undefined' && isComboboxOpen) {
      e.preventDefault();
      closeCombobox(true);
      return;
    }
  }

  // 3. Tab Switching: AZERTY (1/&, 2/é, 3/") & QWERTY (1, 2, 3)
  // Only trigger when user is NOT typing inside an input or textarea
  const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
  const isInputActive = activeTag === 'input' || activeTag === 'textarea' || (document.activeElement && document.activeElement.isContentEditable);
  if (!isInputActive && !e.ctrlKey && !e.altKey && !e.metaKey) {
    if (e.code === 'Digit1' || ['1', '&'].includes(e.key)) {
      e.preventDefault();
      const tab1 = document.getElementById('tab-sales');
      if (tab1) tab1.click();
    } else if (e.code === 'Digit2' || ['2', 'é', 'É'].includes(e.key)) {
      e.preventDefault();
      const tab2 = document.getElementById('tab-products');
      if (tab2) tab2.click();
    } else if (e.code === 'Digit3' || ['3', '"'].includes(e.key)) {
      e.preventDefault();
      const tab3 = document.getElementById('tab-stats');
      if (tab3) tab3.click();
    }
  }
});

