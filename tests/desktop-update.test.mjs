import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
const { validateManifest, checkForUpdate, downloadUpdate, releaseBase } = createRequire(import.meta.url)('../electron/desktop-update.cjs')

const installer = Buffer.from('installer bytes '.repeat(500))
const sha = (data) => createHash('sha256').update(data).digest('hex')
const manifest = (buildNumber, extra = {}) => ({ app: 'demandplanning', formatVersion: 1, buildNumber, revision: 'abcdef1234567', files: { win32: { name: 'Demand-Planning-Hub-Setup.exe', size: installer.length, sha256: sha(installer) }, darwin: { name: 'Demand-Planning-Hub-mac.dmg', size: 5, sha256: sha('dmg!!') } }, ...extra })
const dist = (buildNumber) => { const dir = mkdtempSync(join(tmpdir(), 'dph-dist-')); writeFileSync(join(dir, 'build-info.json'), JSON.stringify({ buildNumber, revision: 'x', version: '1.2.2' })); return dir }
const fakeFetch = (latest, body = installer) => { const calls = []; const fetch = async (url) => { calls.push(url); if (url.startsWith(`${releaseBase}latest.json`)) return Response.json(latest); if (url === `${releaseBase}Demand-Planning-Hub-Setup.exe`) return new Response(body); return new Response('missing', { status: 404 }) }; return { fetch, calls } }

test('desktop update manifest: strict names, checksums and build number', () => {
  assert.equal(validateManifest(manifest(60)).buildNumber, 60)
  assert.throws(() => validateManifest({ ...manifest(60), app: 'other' }))
  assert.throws(() => validateManifest(manifest(0)))
  assert.throws(() => validateManifest(manifest(60, { files: { win32: { name: '../evil.exe', size: 1, sha256: 'a'.repeat(64) } } })), /invalid/)
  assert.throws(() => validateManifest(manifest(60, { files: { win32: { name: 'Demand-Planning-Hub-Setup.exe', size: 1, sha256: 'xyz' } } })), /invalid/)
})

test('desktop update check compares the installed build number with the published one', async () => {
  const newer = await checkForUpdate(fakeFetch(manifest(60)).fetch, dist(55), 'win32')
  assert.equal(newer.available, true); assert.equal(newer.current.buildNumber, 55); assert.equal(newer.latest.buildNumber, 60)
  assert.equal((await checkForUpdate(fakeFetch(manifest(60)).fetch, dist(60), 'win32')).available, false)
  const linux = await checkForUpdate(fakeFetch(manifest(60)).fetch, dist(1), 'linux')
  assert.equal(linux.supported, false); assert.equal(linux.available, false)
  await assert.rejects(checkForUpdate(async () => new Response('', { status: 404 }), dist(1), 'win32'), /private/)
})

test('desktop update download keeps only a verified installer from the fixed release address', async () => {
  const target = mkdtempSync(join(tmpdir(), 'dph-update-'))
  const { fetch, calls } = fakeFetch(manifest(60))
  const progress = []
  const result = await downloadUpdate(fetch, dist(55), target, (received, total) => progress.push([received, total]), 'win32')
  assert.equal(result.buildNumber, 60)
  assert.deepEqual(readFileSync(result.path), installer)
  assert.ok(calls.every((url) => url.startsWith(releaseBase)))
  assert.equal(progress.at(-1)[0], installer.length)
  const tampered = Buffer.from(installer); tampered[0] ^= 1
  const bad = mkdtempSync(join(tmpdir(), 'dph-update-'))
  await assert.rejects(downloadUpdate(fakeFetch(manifest(60), tampered).fetch, dist(55), bad, undefined, 'win32'), /checksum/)
  assert.equal(existsSync(join(bad, 'Demand-Planning-Hub-Setup.exe')), false, 'a file that fails the checksum is removed')
  await assert.rejects(downloadUpdate(fakeFetch(manifest(60)).fetch, dist(60), bad, undefined, 'win32'), /already the latest/)
})

const { mergeManifest } = createRequire(import.meta.url)('../scripts/desktop-manifest.cjs')
test('Windows and macOS publish separately: each platform has its own build; the top level is the oldest', async () => {
  const win = { size: installer.length, sha256: sha(installer), buildNumber: 101, revision: 'b'.repeat(40), builtAt: '2026-10-20T20:00:00Z' }
  const merged = mergeManifest(manifest(95), 'win32', win)
  assert.deepEqual([merged.buildNumber, merged.files.win32.buildNumber, merged.files.darwin.buildNumber, merged.files.darwin.revision], [95, 101, 95, 'abcdef1234567'], 'macOS still at 95, so older apps (top level only) see no update yet')
  const winCheck = await checkForUpdate(fakeFetch(merged).fetch, dist(95), 'win32')
  assert.equal(winCheck.available, true); assert.equal(winCheck.latest.buildNumber, 101)
  assert.equal((await checkForUpdate(fakeFetch(merged).fetch, dist(95), 'darwin')).available, false, 'macOS app: no update until its own installer is published')
  assert.equal((await downloadUpdate(fakeFetch(merged).fetch, dist(95), mkdtempSync(join(tmpdir(), 'dph-update-')), undefined, 'win32')).buildNumber, 101)
  const both = mergeManifest(merged, 'darwin', { size: 5, sha256: sha('dmg!!'), buildNumber: 101, revision: 'b'.repeat(40), builtAt: '2026-10-20T21:00:00Z' })
  assert.equal(both.buildNumber, 101)
  assert.equal(mergeManifest(null, 'darwin', { size: 5, sha256: sha('dmg!!'), buildNumber: 7, revision: 'c'.repeat(40), builtAt: '' }).buildNumber, 7, 'first publish with no manifest yet')
  assert.throws(() => validateManifest({ ...merged, files: { win32: { ...merged.files.win32, buildNumber: 0 } } }), /invalid/)
})
