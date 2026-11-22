#!/usr/bin/env node
// CI-09 / CI-11: change notes → version and release notes. Every pull request adds its own `docs/changes/<name>.md`
// (front matter `bump: major | minor | patch`, then its release-notes text) instead of editing the version in
// package.json and the top of docs/RELEASE-NOTES.md, so two open pull requests never conflict on them. After a merge to
// main the job "Write release commit" runs `--apply`: the highest bump of the notes waiting gives the next version, their
// texts (each with "PR #N." taken from the squash commit that added it) become that version's entry at the top of
// RELEASE-NOTES.md, package.json takes the version and the notes are removed; the job then regenerates the SWBOM and the
// traceability matrix and pushes one release commit. It runs only this repository's scripts with Node.js; nothing is
// installed (CI-07).
// Usage: node scripts/release-changes.mjs --check            validate the waiting notes
//        node scripts/release-changes.mjs --apply [date]     write the release; prints the new version, or nothing
//        node scripts/release-changes.mjs --pr-check <base>  a pull request adds a note and leaves the version alone
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const bumps = ['patch', 'minor', 'major']
const root = new URL('../', import.meta.url)
const path = (file) => fileURLToPath(new URL(file, root))
export const changesDir = 'docs/changes'

// A note: "---\nbump: minor\n---\n" then the text (at least one "- " line). The name: lower-case letters, digits, hyphens.
export function parseChange(text, file = 'note') {
  if (!/^[a-z0-9][a-z0-9-]{0,79}\.md$/.test(file.split('/').pop())) throw new Error(`${file}: name it with lower-case letters, digits and hyphens, ending .md`)
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text)
  if (!match) throw new Error(`${file}: start with front matter "---\\nbump: minor\\n---"`)
  const fields = Object.fromEntries(match[1].split(/\r?\n/).filter((line) => line.trim()).map((line) => { const at = line.indexOf(':'); return [line.slice(0, at).trim(), line.slice(at + 1).trim()] }))
  if (!bumps.includes(fields.bump)) throw new Error(`${file}: bump must be major, minor or patch`)
  const body = match[2].replace(/\r\n/g, '\n').trim()
  if (!/^- \S/m.test(body)) throw new Error(`${file}: list at least one change as a "- " line`)
  if (/^#{1,2} /m.test(body)) throw new Error(`${file}: use **bold** labels, not "#" or "##" headings (they would end the release entry)`)
  return { file, bump: fields.bump, body }
}

export function nextVersion(version, kinds) {
  const [major, minor, patch] = version.split('.').map(Number)
  const top = Math.max(...kinds.map((kind) => bumps.indexOf(kind)))
  if (top === 2) return `${major + 1}.0.0`
  if (top === 1) return `${major}.${minor + 1}.0`
  if (top === 0) return `${major}.${minor}.${patch + 1}`
  return version
}

export const prOf = (subject) => /\(#(\d+)\)\s*$/.exec(subject ?? '')?.[1]

// The new entry goes above the newest "## vX.Y.Z — date" heading; each note ends with its PR unless it names it.
export function withEntry(notes, version, date, changes) {
  const body = changes.map((change) => change.pr && !new RegExp(`#${change.pr}\\b`).test(change.body) ? `${change.body}\n\nPR #${change.pr}.` : change.body).join('\n\n')
  const at = notes.search(/^## v\d+\.\d+\.\d+ — /m)
  const entry = `## v${version} — ${date}\n\n${body}\n\n`
  return at < 0 ? `${notes.trimEnd()}\n\n${entry}` : `${notes.slice(0, at)}${entry}${notes.slice(at)}`
}

export const setVersion = (packageText, version) => packageText.replace(/("version":\s*")\d+\.\d+\.\d+(")/, `$1${version}$2`)

const noteFiles = () => existsSync(path(changesDir)) ? readdirSync(path(changesDir)).filter((name) => name.endsWith('.md') && name !== 'README.md').sort() : []
const readNotes = () => noteFiles().map((name) => parseChange(readFileSync(path(`${changesDir}/${name}`), 'utf8'), `${changesDir}/${name}`))
const git = (...args) => execFileSync('git', args, { cwd: path('.'), encoding: 'utf8' }).trim()

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const mode = process.argv[2]
  try {
    if (mode === '--check') {
      const notes = readNotes()
      console.log(`Change notes: ${notes.length} waiting${notes.length ? ` (${notes.map((note) => `${note.file.split('/').pop()}: ${note.bump}`).join(', ')})` : ''}.`)
    } else if (mode === '--apply') {
      const date = process.argv[3] ?? new Date().toISOString().slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('date must be YYYY-MM-DD')
      const notes = readNotes()
      if (!notes.length) process.exit(0)
      // The pull request of a note: the squash commit "Title (#N)" that added it.
      const changes = notes.map((note) => ({ ...note, pr: prOf(git('log', '--diff-filter=A', '-1', '--format=%s', '--', note.file)) }))
      const pkgText = readFileSync(path('package.json'), 'utf8')
      const version = nextVersion(JSON.parse(pkgText).version, changes.map((change) => change.bump))
      writeFileSync(path('package.json'), setVersion(pkgText, version))
      writeFileSync(path('docs/RELEASE-NOTES.md'), withEntry(readFileSync(path('docs/RELEASE-NOTES.md'), 'utf8'), version, date, changes))
      for (const note of notes) rmSync(path(note.file))
      console.log(version)
    } else if (mode === '--pr-check') {
      const base = process.argv[3] ?? ''
      if (!/^[0-9a-f]{40}$/.test(base)) throw new Error('give the base commit (40 hex characters)')
      const added = git('diff', '--name-only', '--diff-filter=A', `${base}...HEAD`, '--', changesDir).split('\n').filter((file) => file.endsWith('.md') && !file.endsWith('/README.md'))
      const before = JSON.parse(git('show', `${base}:package.json`)).version
      const now = JSON.parse(readFileSync(path('package.json'), 'utf8')).version
      const problems = []
      if (!added.length) problems.push(`Add a change note ${changesDir}/<name>.md (see ${changesDir}/README.md).`)
      if (before !== now) problems.push(`Leave the version in package.json at ${before}: CI sets it from the change notes after the merge.`)
      readNotes()
      if (problems.length) throw new Error(problems.join('\n'))
      console.log(`Change note${added.length === 1 ? '' : 's'}: ${added.join(', ')}.`)
    } else {
      throw new Error('Usage: release-changes.mjs --check | --apply [YYYY-MM-DD] | --pr-check <base sha>')
    }
  } catch (failure) {
    console.error(failure instanceof Error ? failure.message : String(failure))
    process.exit(1)
  }
}
