import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { normalizeWindchillHost, normalizeServicePath, normalizeWindchillSettings, windchillServiceUrl } from '../src/windchill.ts'
const { windchillUrl, testWindchill } = createRequire(import.meta.url)('../electron/windchill.cjs')

test('Windchill host and service path are normalised; https only, no credentials, path under /Windchill/', () => {
  assert.equal(normalizeWindchillHost('plm.example.com'), 'https://plm.example.com')
  assert.equal(normalizeWindchillHost(' https://plm.example.com/Windchill/app/ '), 'https://plm.example.com')
  assert.throws(() => normalizeWindchillHost('http://plm.example.com'), /https/)
  assert.throws(() => normalizeWindchillHost('https://me:pw@plm.example.com'), /password/)
  assert.equal(normalizeServicePath('Windchill/servlet/odata/'), '/Windchill/servlet/odata')
  assert.throws(() => normalizeServicePath('/other/api'), /Windchill/)
  assert.throws(() => normalizeServicePath('/Windchill/../admin'), /Windchill/)
  const settings = normalizeWindchillSettings({ host: 'plm.example.com', servicePath: '', objectType: ' DocMgmt/Documents ', login: 'basic' })
  assert.deepEqual(settings, { host: 'https://plm.example.com', servicePath: '/Windchill/servlet/odata', login: 'sso', objectType: 'DocMgmt/Documents', filter: '', fields: '' })
  assert.equal(windchillServiceUrl(settings), 'https://plm.example.com/Windchill/servlet/odata')
  assert.equal(normalizeWindchillSettings(null).host, '')
})

test('desktop connection test: one GET to the service root; clear messages for refused sign-on and redirects', async () => {
  assert.throws(() => windchillUrl({ host: 'http://plm.example.com', servicePath: '/Windchill/servlet/odata' }), /https/)
  assert.throws(() => windchillUrl({ host: 'https://plm.example.com/x', servicePath: '/Windchill/servlet/odata' }), /no path/)
  assert.throws(() => windchillUrl({ host: 'https://plm.example.com', servicePath: '/api' }), /Windchill/)
  const calls = []
  const ok = await testWindchill({ host: 'https://plm.example.com', servicePath: '/Windchill/servlet/odata' }, async (url, options) => { calls.push([url, options.method]); return Response.json({ value: [{ name: 'ProdMgmt' }, { name: 'DocMgmt' }] }) })
  const req = { host: 'https://plm.example.com', servicePath: '/Windchill/servlet/odata' }
  const domains = await testWindchill(req, async () => Response.json([{ path: 'https://plm.example.com/Windchill/servlet/odata/v7/DocMgmt', name: 'PTC Document Management Domain', id: 'DocMgmt' }, { path: 'https://plm.example.com/Windchill/servlet/odata/v8/ChangeMgmt', name: 'PTC Change Management Domain', id: 'ChangeMgmt' }]))
  assert.deepEqual([domains.ok, domains.services], [true, ['v7/DocMgmt', 'v8/ChangeMgmt']], 'Windchill REST domain list with versioned paths')
  const xml = await testWindchill(req, async () => new Response('<service><workspace><collection href="ProdMgmt"/><collection href="DocMgmt"/></workspace></service>', { headers: { 'content-type': 'application/xml' } }))
  assert.deepEqual([xml.ok, xml.services], [true, ['ProdMgmt', 'DocMgmt']], 'an XML service list is accepted')
  const login = await testWindchill(req, async () => new Response('<html><title>Windchill Login</title></html>', { headers: { 'content-type': 'text/html' } }))
  assert.match(login.message, /text\/html from \/Windchill\/servlet\/odata \(page title “Windchill Login”\).*sign-in page.*Sign in/)
  assert.equal(login.signIn, true, 'a login page offers the sign-in window')
  const other = await testWindchill(req, async () => new Response('<html><title>Windchill</title></html>', { headers: { 'content-type': 'text/html' } }))
  assert.match(other.message, /may not be enabled at this path/)
  assert.equal(other.signIn, undefined)
  assert.deepEqual(calls, [['https://plm.example.com/Windchill/servlet/odata', 'GET']])
  assert.deepEqual([ok.ok, ok.services], [true, ['ProdMgmt', 'DocMgmt']])
  assert.match((await testWindchill({ host: 'https://plm.example.com', servicePath: '/Windchill/servlet/odata' }, async () => new Response('', { status: 401 }))).message, /single sign-on/)
  const followed = []
  const sameHost = await testWindchill({ host: 'https://plm.example.com', servicePath: '/Windchill/servlet/odata' }, async (url, options) => { followed.push(options.redirect); return { ok: true, status: 200, url: 'https://plm.example.com/Windchill/servlet/odata/', text: async () => JSON.stringify({ value: [{ name: 'DocMgmt' }] }) } })
  assert.deepEqual([followed, sameHost.ok, sameHost.services], [['follow'], true, ['DocMgmt']], 'a redirect on the same host is followed, as in a browser')
  assert.match((await testWindchill({ host: 'https://plm.example.com', servicePath: '/Windchill/servlet/odata' }, async () => ({ ok: true, status: 200, url: 'https://login.example.com/sso', json: async () => ({}) }))).message, /sign-in page on login\.example\.com/)
  assert.match((await testWindchill({ host: 'https://plm.example.com', servicePath: '/Windchill/servlet/odata' }, async () => { throw new Error('ENOTFOUND') })).message, /Could not reach/)
})
