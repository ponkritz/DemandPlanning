// Updates latest.json on the rolling desktop-latest release for ONE platform, so the Windows and macOS installers
// can be published separately (macOS runners often queue for a long time). Each file entry carries its own build
// number and revision; the top-level build number is the oldest of them, so older apps, which read only the
// top-level number, never see an update whose installer for their platform is not yet published.
// Usage: node scripts/desktop-manifest.cjs <win32|darwin> <installer file> <existing latest.json or -> <output>
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const installerNames = { win32: 'Demand-Planning-Hub-Setup.exe', darwin: 'Demand-Planning-Hub-mac.dmg' }

function mergeManifest(existing, platform, entry) {
  if (!installerNames[platform]) throw new Error(`Unknown platform ${platform}.`)
  const files = {}
  const usable = existing && existing.app === 'demandplanning' && existing.formatVersion === 1 && existing.files && typeof existing.files === 'object'
  if (usable) for (const [key, file] of Object.entries(existing.files)) {
    if (!installerNames[key] || !file) continue
    // Entries written before per-platform numbers existed take the manifest's own number and revision.
    files[key] = { ...file, buildNumber: Number.isSafeInteger(file.buildNumber) ? file.buildNumber : existing.buildNumber, revision: typeof file.revision === 'string' ? file.revision : existing.revision, builtAt: typeof file.builtAt === 'string' ? file.builtAt : existing.builtAt }
  }
  files[platform] = { name: installerNames[platform], ...entry }
  const oldest = Object.values(files).reduce((low, file) => !low || file.buildNumber < low.buildNumber ? file : low, null)
  return { app: 'demandplanning', formatVersion: 1, buildNumber: oldest.buildNumber, revision: oldest.revision, builtAt: oldest.builtAt, files }
}

if (require.main === module) {
  const [platform, installer, existingPath, output] = process.argv.slice(2)
  const data = fs.readFileSync(installer)
  if (path.basename(installer) !== installerNames[platform]) throw new Error(`Expected ${installerNames[platform]}, got ${path.basename(installer)}.`)
  let existing = null
  if (existingPath && existingPath !== '-' && fs.existsSync(existingPath)) { try { existing = JSON.parse(fs.readFileSync(existingPath, 'utf8')) } catch { existing = null } }
  const manifest = mergeManifest(existing, platform, { size: data.length, sha256: crypto.createHash('sha256').update(data).digest('hex'), buildNumber: Number(process.env.GITHUB_RUN_NUMBER), revision: process.env.GITHUB_SHA, builtAt: new Date().toISOString() })
  fs.writeFileSync(output, JSON.stringify(manifest, null, 2))
  console.log(JSON.stringify(manifest, null, 2))
}

module.exports = { mergeManifest }
