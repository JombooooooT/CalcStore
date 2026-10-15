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
  onProductsChanged: (callback) => ipcRenderer.on('products:changed', (_event, productId) => callback(productId)),

  // Sales operations
  addSale: (data) => ipcRenderer.invoke('sales:add', data),
  getDayStats: (date) => ipcRenderer.invoke('sales:getDayStats', date),
  getStats: (period) => ipcRenderer.invoke('stats:get', period),
  onSalesChanged: (callback) => ipcRenderer.on('sales:changed', () => callback()),

  // Listen for blur toggle from the main process
  onBlur: (callback) => ipcRenderer.on('ui:blur', (_event, blurred) => callback(blurred)),
});
