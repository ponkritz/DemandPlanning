import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { validateBuildInfo, updateUrls, readLatestBuild, prepareWebReload, reloadBlockReason, formatBuildDate } from '../src/appUpdate.ts'

const build = { app: 'demandplanning', formatVersion: 1, version: '0.2.0', buildId: '123456789.1', revision: 'a'.repeat(40), builtAt: '2026-10-16T18:30:00.000Z' }

test('build metadata uses strict x.y.z versions and rejects malformed or executable fields', () => {
  assert.deepEqual(validateBuildInfo(build), build)
  for (const version of ['v1.2.3', '1.2', '01.2.3', '1.2.3-beta', '1.2.3.4']) assert.throws(() => validateBuildInfo({ ...build, version }))
  for (const change of [{ app: 'other' }, { buildId: '../evil' }, { builtAt: 'not a date' }, { revision: '<script>' }]) assert.throws(() => validateBuildInfo({ ...build, ...change }))
  assert.match(formatBuildDate(build.builtAt, 'Asia/Kolkata'), /\b17\b/)
  assert.match(formatBuildDate(build.builtAt, 'UTC'), /UTC/)
})

test('cache-busting URLs remain on the app origin and preserve path, other parameters and fragment', () => {
  const urls = updateUrls('https://example.test/DemandPlanning/?existing=1&_dp_refresh=old#backlogs', 'nonce', build.buildId)
  const manifest = new URL(urls.manifest), reload = new URL(urls.reload)
  assert.equal(manifest.pathname, '/DemandPlanning/build-info.json')
  assert.equal(manifest.searchParams.get('_dp_refresh'), 'nonce')
  assert.equal(reload.origin, 'https://example.test')
  assert.equal(reload.searchParams.get('existing'), '1')
  assert.equal(reload.searchParams.getAll('_dp_refresh').length, 1)
  assert.equal(reload.hash, '#backlogs')
  assert.equal(reload.searchParams.get('_dp_build'), build.buildId)
  assert.throws(() => updateUrls('file:///app/index.html', 'nonce'))
  assert.throws(() => updateUrls('javascript:alert(1)', 'nonce'))
})

test('update checks bypass HTTP cache and omit credentials; reload only follows matching fresh HTML', async () => {
  const requests = []
  const request = async (url, options) => {
    requests.push({ url, options })
    if (url.includes('build-info.json')) return new Response(JSON.stringify(build), { headers: { 'Content-Type': 'application/json' } })
    return new Response(`<html><head><meta name="app-build-id" content="${build.buildId}"></head></html>`, { headers: { 'Content-Type': 'text/html' } })
  }
  const result = await prepareWebReload('https://example.test/DemandPlanning/', request, 'nonce')
  assert.equal(result.latest.version, '0.2.0')
  assert.equal(new URL(result.url).searchParams.get('_dp_build'), build.buildId)
  assert.equal(requests.length, 2)
  for (const { options } of requests) { assert.equal(options.cache, 'no-store'); assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error') }
})

test('offline checks, invalid manifests and an older cached index prevent reload preparation', async () => {
  await assert.rejects(readLatestBuild('https://example.test/app/', async () => new Response('', { status: 503 })), /503/)
  await assert.rejects(readLatestBuild('https://example.test/app/', async () => new Response('{}')), /metadata/)
  await assert.rejects(prepareWebReload('https://example.test/app/', async (url) => url.includes('build-info.json') ? new Response(JSON.stringify(build)) : new Response('<meta name="app-build-id" content="older">', { headers: { 'Content-Type': 'text/html' } })), /propagating/)
})

test('reload blocks pending saves and active fetches; failed saves and previews require backup plus acknowledgment', () => {
  const safe = { pending: false, failed: false, busy: false, preview: false, exported: false, acknowledged: true }
  assert.equal(reloadBlockReason(safe), '')
  assert.match(reloadBlockReason({ ...safe, pending: true }), /pending saves/)
  assert.match(reloadBlockReason({ ...safe, busy: true }), /Azure fetch/)
  assert.match(reloadBlockReason({ ...safe, acknowledged: false }), /Confirm/)
  assert.match(reloadBlockReason({ ...safe, failed: true }), /backup/)
  assert.match(reloadBlockReason({ ...safe, preview: true }), /backup/)
  assert.equal(reloadBlockReason({ ...safe, failed: true, pending: true, exported: true }), '')
})

test('release version check accepts only matching vX.Y.Z tags', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  const run = (tag) => spawnSync(process.execPath, ['scripts/verify-version.mjs'], { cwd: new URL('..', import.meta.url), env: { ...process.env, GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: tag }, encoding: 'utf8' })
  assert.equal(run(`v${pkg.version}`).status, 0)
  assert.notEqual(run('v99.0.0').status, 0)
})

test('build number is optional and must be a non-negative integer when present', () => {
  const base = { app: 'demandplanning', formatVersion: 1, version: '1.2.2', buildId: '1.1', builtAt: '2026-10-16T21:00:00.000Z', revision: 'abcdef1' }
  assert.equal(validateBuildInfo(base).buildNumber, undefined)
  assert.equal(validateBuildInfo({ ...base, buildNumber: 42 }).buildNumber, 42)
  assert.throws(() => validateBuildInfo({ ...base, buildNumber: -1 }))
  assert.throws(() => validateBuildInfo({ ...base, buildNumber: '42' }))
})
