const { app, BrowserWindow, shell, ipcMain, net, session } = require('electron')
const path = require('path')
const { pathToFileURL } = require('url')
const { spawn } = require('child_process')
const { requestAzureDevOps } = require('./azure-devops.cjs')
const { checkForUpdate, downloadUpdate } = require('./desktop-update.cjs')
const { windchillUrl, testWindchill, queryWindchill } = require('./windchill.cjs')
const distDir = path.join(__dirname, '..', 'dist')
const bundledUrl = pathToFileURL(path.join(distDir, 'index.html')).href
const trustedSender = (event) => {
  const source = event.senderFrame?.url, devUrl = process.env.VITE_DEV_SERVER_URL
  return event.senderFrame === event.sender.mainFrame && (source === bundledUrl || Boolean(devUrl && source && new URL(source).origin === new URL(devUrl).origin))
}

ipcMain.handle('app-update:reload', (event) => {
  const source = event.senderFrame?.url, devUrl = process.env.VITE_DEV_SERVER_URL
  if (event.senderFrame !== event.sender.mainFrame || !(source === bundledUrl || (devUrl && source && new URL(source).origin === new URL(devUrl).origin))) throw new Error('Untrusted update request.')
  setImmediate(() => { if (!event.sender.isDestroyed()) event.sender.reloadIgnoringCache() })
})

// Desktop update: check the published build, then download, verify and start the installer for this platform.
ipcMain.handle('desktop-update:check', async (event) => {
  if (!trustedSender(event)) throw new Error('Untrusted update request.')
  return checkForUpdate((url, options) => net.fetch(url, options), distDir)
})
let installing = false
ipcMain.handle('desktop-update:install', async (event) => {
  if (!trustedSender(event)) throw new Error('Untrusted update request.')
  if (!['win32', 'darwin'].includes(process.platform)) throw new Error('Updates from the app are available on Windows and macOS only.')
  if (installing) throw new Error('An update is already downloading.')
  installing = true
  try {
    let last = 0
    const result = await downloadUpdate((url, options) => net.fetch(url, options), distDir, path.join(app.getPath('temp'), 'demand-planning-hub-update'), (received, total) => {
      const percent = Math.floor(received / total * 100)
      if (percent !== last && !event.sender.isDestroyed()) { last = percent; event.sender.send('desktop-update:progress', { received, total }) }
    })
    if (process.platform === 'win32') {
      // The installer replaces the app files; saved data and PATs live in the user profile and are kept.
      spawn(result.path, [], { detached: true, stdio: 'ignore' }).unref()
      setTimeout(() => app.quit(), 800)
      return { status: 'installer-started', buildNumber: result.buildNumber }
    }
    const error = await shell.openPath(result.path)
    if (error) throw new Error(`The disk image was downloaded to ${result.path} but could not be opened: ${error}`)
    return { status: 'disk-image-opened', buildNumber: result.buildNumber }
  } finally { installing = false }
})

ipcMain.handle('azure-devops:request', async (event, request) => {
  const source = event.senderFrame?.url
  const devUrl = process.env.VITE_DEV_SERVER_URL
  const trusted = source === bundledUrl || (devUrl && source && new URL(source).origin === new URL(devUrl).origin)
  if (!trusted || event.senderFrame !== event.sender.mainFrame) throw new Error('Untrusted request source.')
  // Chromium's network stack: uses the Windows certificate store and system proxy (needed for on-prem servers).
  return requestAzureDevOps(request, (url, options) => net.fetch(url, options))
})

// Windchill requests use their own persistent session: Windows single sign-on (Negotiate/NTLM) is offered only to
// the configured Windchill host, and a web sign-in (e.g. the company's Microsoft login) completed in the app's sign-in
// window leaves its cookies there for the test and the searches. The app never sees a password.
const windchillSession = () => session.fromPartition('persist:windchill')
const windchillFetch = (request) => {
  const ses = windchillSession()
  ses.allowNTLMCredentialsForDomains(windchillUrl(request).hostname)
  return (url, options) => ses.fetch(url, options)
}

ipcMain.handle('windchill:test', async (event, request) => {
  if (!trustedSender(event)) throw new Error('Untrusted request source.')
  return testWindchill(request, windchillFetch(request))
})

ipcMain.handle('windchill:query', async (event, request) => {
  if (!trustedSender(event)) throw new Error('Untrusted request source.')
  return queryWindchill(request, windchillFetch(request))
})

// Sign-in window: opens the service address in the Windchill session, so the user completes the login page there
// (sandboxed, no app access, https only, no pop-ups). After each page that loads on the Windchill host the connection
// is tested; once the service answers, the window closes and the test result is returned.
let signInWindow = null
ipcMain.handle('windchill:sign-in', async (event, request) => {
  if (!trustedSender(event)) throw new Error('Untrusted request source.')
  const url = windchillUrl(request)
  const fetch = windchillFetch(request)
  if (signInWindow && !signInWindow.isDestroyed()) { signInWindow.focus(); throw new Error('The Windchill sign-in window is already open.') }
  const window = new BrowserWindow({
    parent: BrowserWindow.fromWebContents(event.sender) ?? undefined,
    width: 960,
    height: 760,
    title: 'Sign in to Windchill',
    autoHideMenuBar: true,
    webPreferences: { session: windchillSession(), contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  signInWindow = window
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (navigation, target) => { if (!target.startsWith('https://')) navigation.preventDefault() })
  return new Promise((resolve) => {
    let done = false, checking = false
    const finish = (result) => {
      if (done) return
      done = true
      clearTimeout(timer)
      if (!window.isDestroyed()) window.close()
      resolve(result)
    }
    const timer = setTimeout(() => finish({ ok: false, status: 0, message: 'The Windchill sign-in was not completed within 10 minutes; try again.', services: [] }), 10 * 60 * 1000)
    window.on('closed', () => { signInWindow = null; finish({ ok: false, status: 0, message: 'The sign-in window was closed before Windchill answered.', services: [], signIn: true }) })
    window.webContents.on('did-finish-load', async () => {
      let host = ''
      try { host = new URL(window.webContents.getURL()).host } catch { /* not loaded */ }
      if (checking || done || host.toLowerCase() !== url.host.toLowerCase()) return
      checking = true
      try {
        const result = await testWindchill(request, fetch)
        if (result.ok) finish({ ...result, message: `Signed in. ${result.message}` })
      } catch { /* keep the window open */ } finally { checking = false }
    })
    window.loadURL(url.href).catch(() => { /* a redirect to the login page aborts the first load; the window stays */ })
  })
})

ipcMain.handle('windchill:sign-out', async (event) => {
  if (!trustedSender(event)) throw new Error('Untrusted request source.')
  const ses = windchillSession()
  await ses.clearStorageData()
  await ses.clearAuthCache()
  return { ok: true }
})

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#f2f5f8',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })
  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) window.loadURL(devUrl)
  else window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
