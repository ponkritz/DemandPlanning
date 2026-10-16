const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('azureDevOps', {
  request: (request) => ipcRenderer.invoke('azure-devops:request', request),
})
