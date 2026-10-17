const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  minimize: () => ipcRenderer.send('window-minimize'),
  close: () => ipcRenderer.send('window-close'),

  // Open the product form (add or edit mode)
  openProductForm: (data) => ipcRenderer.send('productForm:open', data),

  // Open Today's Sells window
  openTodaySells: (data) => ipcRenderer.send('todaySells:open', data),

  // Products CRUD & events
  listProducts: () => ipcRenderer.invoke('products:list'),
  deleteProduct: (id) => ipcRenderer.invoke('products:delete', id),
  onProductsChanged: (callback) => {
    const listener = (_event, productId) => callback(productId);
    ipcRenderer.on('products:changed', listener);
    return () => ipcRenderer.removeListener('products:changed', listener);
  },

  // Sales operations
  addSale: (data) => ipcRenderer.invoke('sales:add', data),
  getDayStats: (date) => ipcRenderer.invoke('sales:getDayStats', date),
  getStats: (period) => ipcRenderer.invoke('stats:get', period),
  onSalesChanged: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('sales:changed', listener);
    return () => ipcRenderer.removeListener('sales:changed', listener);
  },

  // Listen for blur toggle from the main process
  onBlur: (callback) => {
    const listener = (_event, blurred) => callback(blurred);
    ipcRenderer.on('ui:blur', listener);
    return () => ipcRenderer.removeListener('ui:blur', listener);
  },

  // CSV Export
  exportCsv: () => ipcRenderer.invoke('export-csv'),

  // App version
  getAppVersion: () => ipcRenderer.invoke('app:version'),

  // Factory reset (wipes all products & sales)
  clearAllData: () => ipcRenderer.invoke('app:clear-data'),

  // Auto-update (user-controlled)
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  getUpdateStatus: () => ipcRenderer.invoke('update:status'),
  onUpdateStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('update:status', listener);
    return () => ipcRenderer.removeListener('update:status', listener);
  },
});
