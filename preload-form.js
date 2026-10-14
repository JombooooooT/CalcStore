const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('formApi', {
  saveProduct: (payload) => ipcRenderer.invoke('productForm:save', payload),
  close: () => ipcRenderer.send('productForm:close'),
});
