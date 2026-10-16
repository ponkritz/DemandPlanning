const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('azureDevOps', {
  request: (request) => ipcRenderer.invoke('azure-devops:request', request),
})
contextBridge.exposeInMainWorld('appUpdates', { reloadIgnoringCache: () => ipcRenderer.invoke('app-update:reload') })
