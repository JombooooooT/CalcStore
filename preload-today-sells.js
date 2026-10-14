const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sellsApi', {
  list: (date) => ipcRenderer.invoke('sales:list', date),
  remove: (id) => ipcRenderer.invoke('sales:delete', id),
  close: () => ipcRenderer.send('todaySells:close'),
});
