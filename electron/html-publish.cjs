// OND-76 Publish standalone HTML in the desktop app: the file each page publishes to, chosen by the person in the save
// dialog and remembered per page on this computer (a small JSON file in the app's user data folder — never in Git).
// The page can only ask to choose (the dialog) and to write the page's HTML; it never names a path itself, so a
// compromised page cannot write anywhere else. Each publish overwrites that one file (written next to it, then renamed).
const path = require('path')
const { randomUUID } = require('node:crypto')

const pageIdPattern = /^[a-z0-9][a-z0-9-]{0,39}$/
const maxBytes = 50 * 1024 * 1024
// Control characters are removed from file names on purpose (SM-122).
// eslint-disable-next-line no-control-regex
const safeName = (name) => String(name ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().replace(/^[.\s-]+/, '').slice(0, 80) || 'Page'

function checkedKey(key) {
  if (typeof key === 'string' && key.length <= 2200) {
    try {
      const value = JSON.parse(key)
      if (Array.isArray(value) && value.length === 3) {
        const [repository, publisher, pageId] = value
        if (typeof repository === 'string' && repository.length <= 1024 && /^\S+$/.test(repository) &&
          typeof publisher === 'string' && publisher.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(publisher) && publisher === publisher.toLowerCase() &&
          typeof pageId === 'string' && pageIdPattern.test(pageId) && JSON.stringify(value) === key) return key
      }
    } catch { /* Invalid JSON. */ }
  }
  throw new Error('Invalid publishing repository, person or page.')
}

// storeFile: the JSON of { scoped key: absolute path }. Legacy page-only keys are never used for a write.
function publishTargets({ storeFile, fs, showSaveDialog, documentsDir }) {
  async function read() {
    try {
      const raw = JSON.parse(await fs.readFile(storeFile, 'utf8'))
      return Object.fromEntries(Object.entries(raw && typeof raw === 'object' ? raw : {}).filter(([key, file]) => {
        try { checkedKey(key) } catch { return false }
        return typeof file === 'string' && path.isAbsolute(file) && /\.html?$/i.test(file)
      }))
    } catch { return {} }
  }
  async function remember(key, file) { const all = await read(); all[key] = file; await fs.writeFile(storeFile, JSON.stringify(all, null, 2)) }
  return {
    // The remembered file of a page, or null.
    async target(key) { const file = (await read())[checkedKey(key)]; return file ? { path: file } : null },
    // The save dialog, starting at the remembered file (else Documents/{Page}.html); null when cancelled.
    async choose(key, defaultName) {
      checkedKey(key)
      const known = (await read())[key]
      const name = /\.html?$/i.test(String(defaultName ?? '')) ? safeName(defaultName) : `${safeName(defaultName)}.html`
      const choice = await showSaveDialog({ title: 'Publish standalone HTML', defaultPath: known ?? path.join(documentsDir, name), filters: [{ name: 'Web page (HTML)', extensions: ['html'] }] })
      if (choice.canceled || !choice.filePath) return null
      const file = /\.html?$/i.test(choice.filePath) ? choice.filePath : `${choice.filePath}.html`
      await remember(key, file)
      return { path: file }
    },
    // Overwrite the page's file with the HTML (a complete document, at most 50 MB).
    async write(key, html) {
      const file = (await read())[checkedKey(key)]
      if (!file) throw new Error('No file is chosen for this page yet: choose Publish now to pick one.')
      if (typeof html !== 'string' || !/^<!doctype html>/i.test(html) || Buffer.byteLength(html) > maxBytes) throw new Error('Invalid HTML file.')
      try { if (!(await fs.stat(path.dirname(file))).isDirectory()) throw new Error('not a folder') }
      catch { throw new Error(`The folder ${path.dirname(file)} is missing: choose the file again (Publish standalone HTML… → Choose another file…).`) }
      const temporary = path.join(path.dirname(file), `.demand-planning-${randomUUID()}.tmp`)
      const handle = await fs.open(temporary, 'wx', 0o600)
      try {
        try { await handle.writeFile(html, 'utf8') } finally { await handle.close() }
        await fs.rename(temporary, file)
      } catch (error) { await fs.unlink(temporary).catch(() => undefined); throw error }
      return { path: file, bytes: Buffer.byteLength(html) }
    },
  }
}

module.exports = { publishTargets, safeName, maxBytes }
