const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const db = require('./db.js');

// Set language switch to en-US for date picker before app is ready
app.commandLine.appendSwitch('lang', 'en-US');

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
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
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
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

  const loadOpts = query ? { query } : {};
  modalWin.loadFile(path.join(__dirname, 'renderer', htmlFile), loadOpts);

  // Show without flash, apply blur to main window
  modalWin.once('ready-to-show', () => {
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
app.commandLine.appendSwitch('lang', 'en-US');

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

// ── Database Product IPC Handlers ──────────────────────────────
ipcMain.handle('products:list', () => {
  return db.listProducts();
});

ipcMain.handle('products:delete', (_event, id) => {
  const result = db.deleteProduct(id);
  if (result.ok && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('products:changed', id);
  }
  return result;
});

ipcMain.handle('productForm:save', (_event, payload) => {
  let result;
  if (payload.mode === 'edit') {
    result = db.updateProduct(payload.id, payload);
  } else {
    result = db.addProduct(payload);
  }

  if (result.ok) {
    // Close modal form
    if (formWindow && !formWindow.isDestroyed()) {
      formWindow.close();
    }
    // Notify main window to reload list
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('products:changed', result.product.id);
    }
  }

  return result;
});

// ── Database Sales IPC Handlers ────────────────────────────────
function isValidDateStr(str) {
  if (typeof str !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const [y, m, d] = str.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && (date.getMonth() + 1) === m && date.getDate() === d;
}

function isValidPositiveInt(id) {
  return typeof id === 'number' && Number.isInteger(id) && id > 0;
}

ipcMain.handle('sales:add', (_event, data) => {
  return db.addSale(data);
});

ipcMain.handle('sales:getDayStats', (_event, dateStr) => {
  return db.getDayStats(dateStr);
});

ipcMain.handle('sales:list', (_event, dateStr) => {
  if (!isValidDateStr(dateStr)) {
    return { ok: false, error: 'Invalid date format' };
  }
  const result = db.listSales(dateStr);
  return { ok: true, sales: result.sales, totals: result.totals };
});

ipcMain.handle('sales:delete', (_event, id) => {
  const numId = Number(id);
  if (!isValidPositiveInt(numId)) {
    return { ok: false, error: 'Invalid sale id' };
  }
  const result = db.deleteSale(numId);
  if (result.ok && result.deleted && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('sales:changed');
  }
  return result;
});

