#!/usr/bin/env node
// Prints the docs/RELEASE-NOTES.md entry of one version (the text under its "## vX.Y.Z — date" heading, up to the next
// "## " heading): the body of that version's tagged GitHub release (CI-10). Fails when the version has no entry.
// Usage: node scripts/release-entry.mjs 1.4.0
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export function releaseEntry(markdown, version) {
  const lines = markdown.split(/\r?\n/)
  const heading = new RegExp(`^## v${version.replace(/\./g, '\\.')} — \\d{4}-\\d{2}-\\d{2}\\s*$`)
  const start = lines.findIndex((line) => heading.test(line))
  if (start < 0) return undefined
  const next = lines.findIndex((line, index) => index > start && line.startsWith('## '))
  return lines.slice(start + 1, next < 0 ? undefined : next).join('\n').trim()
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const version = process.argv[2] ?? ''
  if (!/^\d+\.\d+\.\d+$/.test(version)) { console.error('Usage: node scripts/release-entry.mjs x.y.z'); process.exit(1) }
  const entry = releaseEntry(readFileSync(new URL('../docs/RELEASE-NOTES.md', import.meta.url), 'utf8'), version)
  if (!entry) { console.error(`docs/RELEASE-NOTES.md has no entry for v${version}.`); process.exit(1) }
  console.log(`${entry}\n\nFull history: docs/RELEASE-NOTES.md. Checksums: SHA256SUMS*.txt.`)
}
