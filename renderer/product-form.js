/* =========================================================
   Product Form — Renderer Logic
   ========================================================= */

// ── Parse query string ─────────────────────────────────────
const params = new URLSearchParams(window.location.search);
const mode   = params.get('mode') || 'add';
const prodId = params.get('id')   || null;

// ── DOM References ─────────────────────────────────────────
const titleEl   = document.getElementById('pf-title');
const nameInput = document.getElementById('pf-name');
const buyInput  = document.getElementById('pf-buy');
const sellInput = document.getElementById('pf-sell');
const submitBtn = document.getElementById('pf-submit');
const errorEl   = document.getElementById('pf-error');
const closeBtn  = document.getElementById('pf-close');

// ── Pre-fill inputs in edit mode ───────────────────────────
if (mode === 'edit') {
  nameInput.value = params.get('name') || '';
  buyInput.value  = params.get('buy')  || '';
  sellInput.value = params.get('sell') || '';
  submitBtn.textContent = 'Save changes';
} else {
  submitBtn.textContent = 'Add product';
}

// ── Auto-focus name input on load ──────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  nameInput.focus();
  if (nameInput.value) {
    nameInput.select();
  }
});

// ── Price Input Formatting while typing ────────────────────
// Strip every character except digits and one "." or ","; allow at most 2 decimals
function sanitizePrice(input) {
  let val = input.value;
  // Keep only digits, periods, and commas
  val = val.replace(/[^0-9.,]/g, '');

  const firstSepMatch = val.match(/[.,]/);
  if (firstSepMatch) {
    const sepIdx = firstSepMatch.index;
    const sepChar = firstSepMatch[0];
    const before = val.slice(0, sepIdx).replace(/[.,]/g, '');
    const after  = val.slice(sepIdx + 1).replace(/[.,]/g, '').slice(0, 2);
    val = before + sepChar + after;
  }

  input.value = val;
}

// ── Clear Errors on User Input ─────────────────────────────
function clearErrors() {
  errorEl.style.display = 'none';
  errorEl.textContent = '';
  nameInput.classList.remove('has-error');
  buyInput.classList.remove('has-error');
  sellInput.classList.remove('has-error');
}

nameInput.addEventListener('input', () => {
  clearErrors();
});

buyInput.addEventListener('input', () => {
  sanitizePrice(buyInput);
  clearErrors();
});

sellInput.addEventListener('input', () => {
  sanitizePrice(sellInput);
  clearErrors();
});

// ── Save Operation ─────────────────────────────────────────
let isSubmitting = false;

async function handleSave() {
  if (isSubmitting) return;

  const payload = {
    mode,
    id: prodId,
    name: nameInput.value,
    buy:  buyInput.value,
    sell: sellInput.value,
  };

  isSubmitting = true;
  submitBtn.disabled = true;

  try {
    const result = await window.formApi.saveProduct(payload);

    if (result && !result.ok && result.errors) {
      clearErrors();

      // Find first error message
      const firstKey = ['name', 'buy', 'sell'].find(k => result.errors[k]);
      const firstMsg = firstKey ? result.errors[firstKey] : 'Validation failed';

      errorEl.textContent = firstMsg;
      errorEl.style.display = 'block';

      // Ring invalid fields
      if (result.errors.name) nameInput.classList.add('has-error');
      if (result.errors.buy)  buyInput.classList.add('has-error');
      if (result.errors.sell) sellInput.classList.add('has-error');

      // Focus first invalid field
      if (result.errors.name) {
        nameInput.focus();
      } else if (result.errors.buy) {
        buyInput.focus();
      } else if (result.errors.sell) {
        sellInput.focus();
      }
    }
  } catch (err) {
    console.error('Error saving product:', err);
    errorEl.textContent = 'An unexpected error occurred';
    errorEl.style.display = 'block';
  } finally {
    isSubmitting = false;
    submitBtn.disabled = false;
  }
}

submitBtn.addEventListener('click', handleSave);

// Enter key in any input triggers save
[nameInput, buyInput, sellInput].forEach((input) => {
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    }
  });
});

// ── Close button ───────────────────────────────────────────
closeBtn.addEventListener('click', () => {
  window.formApi.close();
});

// ── Escape key closes the window without saving ───────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    window.formApi.close();
  }
});
