const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('azureDevOps', {
  request: (request) => ipcRenderer.invoke('azure-devops:request', request),
})
contextBridge.exposeInMainWorld('windchill', { test: (request) => ipcRenderer.invoke('windchill:test', request), query: (request) => ipcRenderer.invoke('windchill:query', request), signIn: (request) => ipcRenderer.invoke('windchill:sign-in', request), signOut: () => ipcRenderer.invoke('windchill:sign-out') })
contextBridge.exposeInMainWorld('appUpdates', { reloadIgnoringCache: () => ipcRenderer.invoke('app-update:reload') })
contextBridge.exposeInMainWorld('desktopUpdate', {
  check: () => ipcRenderer.invoke('desktop-update:check'),
  install: () => ipcRenderer.invoke('desktop-update:install'),
  onProgress: (listener) => {
    const handler = (_event, progress) => listener(progress)
    ipcRenderer.on('desktop-update:progress', handler)
    return () => ipcRenderer.removeListener('desktop-update:progress', handler)
  },
})
