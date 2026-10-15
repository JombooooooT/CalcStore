const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const db = require('./db.js');

// Set language switch to en-US for date picker before app is ready
app.commandLine.appendSwitch('lang', 'en-US');

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
  try {
    dialog.showErrorBox('Error', 'An unexpected error occurred. The app will close.');
  } catch (e) {
    console.error('Failed to show error box:', e);
  }
  app.quit();
});

process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason);
});

let mainWindow;
let formWindow = null;       // Only one product-form instance at a time
let todaySellsWindow = null; // Only one today-sells instance at a time

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    useContentSize: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    frame: false,
    transparent: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    console.error(`Main window failed to load: ${errorDescription} (${errorCode}) at ${validatedURL} [mainFrame=${isMainFrame}]`);
  });

  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('Main window render process gone:', details);
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function openModal(htmlFile, { width, height, query, preload }) {
  if (!mainWindow || mainWindow.isDestroyed()) return null;

  // Center over the main window
  const parentBounds = mainWindow.getBounds();
  const x = Math.round(parentBounds.x + (parentBounds.width  - width)  / 2);
  const y = Math.round(parentBounds.y + (parentBounds.height - height) / 2);

  const modalWin = new BrowserWindow({
    parent: mainWindow,
    modal: true,
    width,
    height,
    useContentSize: true,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, preload),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  let failureHandled = false;
  function handleModalFailure(reason) {
    if (failureHandled) return;
    failureHandled = true;
    console.error(`Modal failure for ${htmlFile}:`, reason);
    if (!modalWin.isDestroyed()) {
      modalWin.destroy();
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('ui:blur', false);
    }
    dialog.showErrorBox('Error', "Couldn't open this window");
  }

  modalWin.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    console.error(`Modal did-fail-load: ${errorDescription} (${errorCode}) at ${validatedURL} [mainFrame=${isMainFrame}]`);
    if (isMainFrame) {
      handleModalFailure(errorDescription);
    }
  });

  modalWin.webContents.on('render-process-gone', (event, details) => {
    console.error('Modal render process gone:', details);
    handleModalFailure(details.reason || 'Render process gone');
  });

  const loadOpts = query ? { query } : {};
  modalWin.loadFile(path.join(__dirname, 'renderer', htmlFile), loadOpts).catch((err) => {
    console.error(`Modal loadFile rejected:`, err);
    handleModalFailure(err && err.message);
  });

  // Show without flash, apply blur to main window
  modalWin.once('ready-to-show', () => {
    if (failureHandled) return;
    modalWin.show();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('ui:blur', true);
    }
  });

  // Clean up on close — always remove blur
  modalWin.on('closed', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('ui:blur', false);
    }
  });

  return modalWin;
}

// ── Product Form Window ────────────────────────────────────────
function openProductForm(data) {
  // If already open, just focus
  if (formWindow && !formWindow.isDestroyed()) {
    formWindow.focus();
    return;
  }

  // Build query string from data
  const params = new URLSearchParams();
  params.set('mode', (data && data.mode) || 'add');
  if (data && data.id)   params.set('id',   data.id);
  if (data && data.name) params.set('name', data.name);
  if (data && data.buy)  params.set('buy',  data.buy);
  if (data && data.sell) params.set('sell', data.sell);

  formWindow = openModal('product-form.html', {
    width: 396,
    height: 393,
    query: Object.fromEntries(params),
    preload: 'preload-form.js',
  });

  if (formWindow) {
    formWindow.on('closed', () => {
      formWindow = null;
    });
  }
}

// ── Today's Sells Window ───────────────────────────────────────
function openTodaySells(data) {
  // If already open, just focus
  if (todaySellsWindow && !todaySellsWindow.isDestroyed()) {
    todaySellsWindow.focus();
    return;
  }

  const query = {};
  if (data && data.date) {
    query.date = data.date;
  }

  todaySellsWindow = openModal('today-sells.html', {
    width: 760,
    height: 480,
    query,
    preload: 'preload-today-sells.js',
  });

  if (todaySellsWindow) {
    todaySellsWindow.on('closed', () => {
      todaySellsWindow = null;
    });
  }
}

// ── App lifecycle ──────────────────────────────────────────────
app.whenReady().then(() => {
  try {
    // Initialize SQLite database
    db.initDb();

    // If launched with --seed flag, populate sample products if empty
    if (process.argv.includes('--seed')) {
      db.seedIfEmpty();
    }

    // If launched with --seed-sales flag, populate sample sales if empty
    if (process.argv.includes('--seed-sales')) {
      db.seedSalesIfEmpty();
    }

    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  } catch (err) {
    console.error('ERROR IN WHENREADY:', err);
    try {
      dialog.showErrorBox('Startup Error', `The application failed to start:\n\n${err && (err.message || String(err))}`);
    } catch (e) {
      console.error('Failed to show startup error box:', e);
    }
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── IPC handlers ───────────────────────────────────────────────
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});

// Open the product form (from the main renderer)
ipcMain.on('productForm:open', (_event, data) => {
  if (mainWindow) openProductForm(data);
});

// Close the product form (from the form renderer)
ipcMain.on('productForm:close', () => {
  if (formWindow && !formWindow.isDestroyed()) formWindow.close();
});

// Open Today's Sells (from the main renderer)
ipcMain.on('todaySells:open', (_event, data) => {
  if (mainWindow) openTodaySells(data);
});

// Close Today's Sells (from the today-sells renderer)
ipcMain.on('todaySells:close', () => {
  if (todaySellsWindow && !todaySellsWindow.isDestroyed()) todaySellsWindow.close();
});

// ── Safe IPC handler wrapper ───────────────────────────────────
function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await fn(event, ...args);
    } catch (err) {
      console.error(`Unexpected error in IPC channel "${channel}":`, err);
      return { ok: false, error: 'Unexpected error' };
    }
  });
}

// ── Validation Helpers ─────────────────────────────────────────
function isPlainObject(val) {
  return val !== null && typeof val === 'object' && !Array.isArray(val);
}

function isValidDateStr(str) {
  if (typeof str !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const [y, m, d] = str.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && (date.getMonth() + 1) === m && date.getDate() === d;
}

function isValidPositiveInt(id) {
  return typeof id === 'number' && Number.isInteger(id) && id > 0;
}

function parsePositiveInt(val) {
  if (typeof val === 'number') {
    return isValidPositiveInt(val) ? val : null;
  }
  if (typeof val === 'string' && /^\d+$/.test(val.trim())) {
    const n = Number(val.trim());
    return isValidPositiveInt(n) ? n : null;
  }
  return null;
}

// ── Database Product IPC Handlers ──────────────────────────────
handle('products:list', () => {
  return db.listProducts();
});

handle('products:delete', (_event, id) => {
  const numId = parsePositiveInt(id);
  if (numId === null) {
    return { ok: false, error: 'Invalid id' };
  }
  const result = db.deleteProduct(numId);
  if (result.ok && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('products:changed', numId);
  }
  return result;
});

handle('productForm:save', (_event, payload) => {
  if (
    !isPlainObject(payload) ||
    typeof payload.name !== 'string' ||
    (typeof payload.buy !== 'string' && typeof payload.buy !== 'number') ||
    (typeof payload.sell !== 'string' && typeof payload.sell !== 'number')
  ) {
    return { ok: false, errors: { name: 'Invalid request' } };
  }

  let result;
  if (payload.mode === 'edit') {
    result = db.updateProduct(payload.id, payload);
  } else {
    result = db.addProduct(payload);
  }

  if (result && result.ok) {
    // Close modal form
    if (formWindow && !formWindow.isDestroyed()) {
      formWindow.close();
    }
    // Notify main window to reload list
    if (mainWindow && !mainWindow.isDestroyed() && result.product) {
      mainWindow.webContents.send('products:changed', result.product.id);
    }
  }

  return result;
});

// ── Database Sales IPC Handlers ────────────────────────────────
handle('sales:add', (_event, data) => {
  if (
    !isPlainObject(data) ||
    !isValidPositiveInt(data.productId) ||
    (data.inputType !== 'price' && data.inputType !== 'amount') ||
    typeof data.value !== 'number' ||
    !Number.isFinite(data.value) ||
    (data.discount !== undefined && (typeof data.discount !== 'number' || !Number.isFinite(data.discount)))
  ) {
    return { ok: false, errors: { value: 'Invalid request' } };
  }
  return db.addSale(data);
});

handle('sales:getDayStats', (_event, dateStr) => {
  if (!isValidDateStr(dateStr)) {
    return { ok: false, error: 'Invalid date' };
  }
  return db.getDayStats(dateStr);
});

handle('sales:list', (_event, dateStr) => {
  if (!isValidDateStr(dateStr)) {
    return { ok: false, error: 'Invalid date format' };
  }
  const result = db.listSales(dateStr);
  return { ok: true, sales: result.sales, totals: result.totals };
});

handle('sales:delete', (_event, id) => {
  const numId = parsePositiveInt(id);
  if (numId === null) {
    return { ok: false, error: 'Invalid sale id' };
  }
  const result = db.deleteSale(numId);
  if (result.ok && result.deleted && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('sales:changed');
  }
  return result;
});

// ── Database Stats IPC Handler ─────────────────────────────────
function getLocalDateStr(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

handle('stats:get', (_event, period) => {
  if (period !== 'day' && period !== 'week' && period !== 'month') {
    return { ok: false, error: 'Invalid period' };
  }
  const todayStr = getLocalDateStr(new Date());
  return db.getStats(period, todayStr);
});


