const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { Readable } = require('stream')

// Desktop self-update from the rolling "desktop-latest" GitHub release. CI publishes latest.json next to the
// installers; the app compares build numbers, downloads only the installer for this platform from the fixed
// release address, verifies its SHA-256 against latest.json, then starts it (Windows) or opens it (macOS).
const releaseBase = 'https://github.com/neurolooom-eng/Test2/releases/download/desktop-latest/'
const installerNames = { win32: 'Demand-Planning-Hub-Setup.exe', darwin: 'Demand-Planning-Hub-mac.dmg' }

function validateManifest(value) {
  if (!value || typeof value !== 'object' || value.app !== 'demandplanning' || value.formatVersion !== 1) throw new Error('The update information is not recognised.')
  if (!Number.isSafeInteger(value.buildNumber) || value.buildNumber < 1) throw new Error('The update information has no valid build number.')
  if (typeof value.revision !== 'string' || !/^[0-9a-f]{7,40}$/.test(value.revision)) throw new Error('The update information has no valid revision.')
  const files = {}
  for (const [platform, name] of Object.entries(installerNames)) {
    const file = value.files?.[platform]
    if (!file) continue
    if (file.name !== name || typeof file.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(file.sha256) || !Number.isSafeInteger(file.size) || file.size < 1) throw new Error(`The update information for ${platform} is invalid.`)
    // Optional per-platform build number and revision (installers are published per platform); else the manifest's.
    if ((file.buildNumber !== undefined && (!Number.isSafeInteger(file.buildNumber) || file.buildNumber < 1)) || (file.revision !== undefined && (typeof file.revision !== 'string' || !/^[0-9a-f]{7,40}$/.test(file.revision)))) throw new Error(`The update information for ${platform} is invalid.`)
    files[platform] = { name, sha256: file.sha256, size: file.size, buildNumber: file.buildNumber ?? value.buildNumber, revision: file.revision ?? value.revision, builtAt: typeof file.builtAt === 'string' ? file.builtAt : (typeof value.builtAt === 'string' ? value.builtAt : '') }
  }
  return { buildNumber: value.buildNumber, revision: value.revision, version: typeof value.version === 'string' ? value.version : '', builtAt: typeof value.builtAt === 'string' ? value.builtAt : '', files }
}

function currentBuild(distDir) {
  try { const info = JSON.parse(fs.readFileSync(path.join(distDir, 'build-info.json'), 'utf8')); return { buildNumber: Number(info.buildNumber) || 0, revision: String(info.revision || ''), version: String(info.version || '') } }
  catch { return { buildNumber: 0, revision: '', version: '' } }
}

async function checkForUpdate(fetch, distDir, platform = process.platform) {
  const response = await fetch(`${releaseBase}latest.json?t=${Date.now()}`, { cache: 'no-store' })
  if (response.status === 404) throw new Error('No published desktop build was found (or the repository is private). Download the installer from the website instead.')
  if (!response.ok) throw new Error(`Could not check for updates (${response.status}).`)
  const latest = validateManifest(await response.json())
  const current = currentBuild(distDir)
  const file = latest.files[platform]
  return { current, latest: { buildNumber: file?.buildNumber ?? latest.buildNumber, revision: file?.revision ?? latest.revision, version: latest.version, builtAt: file?.builtAt || latest.builtAt }, supported: Boolean(file), available: Boolean(file) && file.buildNumber > current.buildNumber }
}

// Streams the installer to disk while hashing it; the file is removed unless size and SHA-256 both match.
async function downloadUpdate(fetch, distDir, targetDir, onProgress = () => {}, platform = process.platform) {
  const response = await fetch(`${releaseBase}latest.json?t=${Date.now()}`, { cache: 'no-store' })
  if (!response.ok) throw new Error(`Could not read the update information (${response.status}).`)
  const latest = validateManifest(await response.json())
  const file = latest.files[platform]
  if (!file) throw new Error('No installer is published for this operating system.')
  if (file.buildNumber <= currentBuild(distDir).buildNumber) throw new Error('This is already the latest build.')
  const download = await fetch(releaseBase + file.name, { cache: 'no-store' })
  if (!download.ok || !download.body) throw new Error(`The installer could not be downloaded (${download.status}).`)
  fs.mkdirSync(targetDir, { recursive: true })
  const target = path.join(targetDir, file.name)
  const hash = crypto.createHash('sha256'), out = fs.createWriteStream(target)
  let received = 0
  try {
    for await (const chunk of Readable.fromWeb(download.body)) {
      received += chunk.length
      if (received > file.size) throw new Error('The installer is larger than expected.')
      hash.update(chunk)
      if (!out.write(chunk)) await new Promise((resolve) => out.once('drain', resolve))
      onProgress(received, file.size)
    }
    await new Promise((resolve, reject) => out.end((error) => error ? reject(error) : resolve()))
    if (received !== file.size || hash.digest('hex') !== file.sha256) throw new Error('The downloaded installer failed its checksum. Nothing was installed.')
  } catch (error) {
    out.destroy(); fs.rmSync(target, { force: true })
    throw error
  }
  return { path: target, buildNumber: file.buildNumber }
}

module.exports = { releaseBase, installerNames, validateManifest, currentBuild, checkForUpdate, downloadUpdate }
