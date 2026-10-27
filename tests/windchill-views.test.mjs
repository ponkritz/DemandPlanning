import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { buildWindchillQuery, validateWindchillView, windchillCell, windchillCsv, windchillSearchUrl, parseWindchillPage } from '../src/windchillViews.ts'
import { windchillSnapshotFile, parseWindchillSnapshot, applyWindchillSnapshots } from '../src/windchillSnapshots.ts'
const { queryWindchill } = createRequire(import.meta.url)('../electron/windchill.cjs')

const view = { id: 'dhf', name: 'Released DHF', entitySet: 'DocMgmt/Documents', filters: [{ field: 'Number', op: 'startswith', value: 'DHF' }, { field: 'State/Value', op: 'eq', value: 'RELEASED' }, { field: 'LastModified', op: 'ge', value: '2026-09-01' }, { field: 'Name', op: 'contains', value: "O'Brien" }], columns: ['Number', 'Name', 'State/Value'], showInMenu: true }

test('Option A: filter rows become one OData query; values escaped; columns selected', () => {
  const path = buildWindchillQuery(view)
  assert.equal(decodeURIComponent(path), "DocMgmt/Documents?$filter=startswith(Number,'DHF') and State/Value eq 'RELEASED' and LastModified ge 2026-09-01T00:00:00Z and contains(Name,'O''Brien')&$select=Number,Name,State")
  assert.equal(decodeURIComponent(buildWindchillQuery({ ...view, filters: [] })), 'DocMgmt/Documents?$select=Number,Name,State')
  assert.throws(() => validateWindchillView({ ...view, entitySet: 'Documents' }), /Domain\/Set/)
  assert.ok(decodeURIComponent(buildWindchillQuery({ ...view, entitySet: 'v7/DocMgmt/Documents' })).startsWith('v7/DocMgmt/Documents?$filter='), 'versioned domain')
  assert.throws(() => validateWindchillView({ ...view, filters: [{ field: 'Number) or (1', op: 'eq', value: 'x' }] }), /not a field name/)
  assert.throws(() => validateWindchillView({ ...view, filters: [{ field: 'Number', op: 'eq', value: '' }] }), /Enter a value/)
  assert.throws(() => validateWindchillView({ ...view, columns: [] }), /at least one column/)
  assert.equal(windchillCell({ Number: 'DHF-1', State: { Value: 'RELEASED', Display: 'Released' } }, 'State/Value'), 'RELEASED')
  assert.equal(windchillCell({ State: { Value: 'RELEASED', Display: 'Released' } }, 'State'), 'Released')
  assert.equal(windchillCell({}, 'Missing/Path'), '')
})

test('desktop query: GET under the service root, next pages on the same host only, clear errors', async () => {
  const request = { host: 'https://plm.example.com', servicePath: '/Windchill/servlet/odata', path: buildWindchillQuery(view) }
  const calls = []
  const fetch = async (url, options) => { calls.push([url, options.method]); return calls.length === 1 ? { ok: true, status: 200, url, json: async () => ({ value: [{ Number: 'DHF-1' }], '@odata.nextLink': 'https://plm.example.com/Windchill/servlet/odata/DocMgmt/Documents?$skiptoken=2' }) } : { ok: true, status: 200, url, json: async () => ({ value: [{ Number: 'DHF-2' }] }) } }
  const result = await queryWindchill(request, fetch)
  assert.deepEqual(result.rows.map((row) => row.Number), ['DHF-1', 'DHF-2'])
  assert.ok(calls[0][0].startsWith('https://plm.example.com/Windchill/servlet/odata/DocMgmt/Documents?')); assert.deepEqual(calls.map((call) => call[1]), ['GET', 'GET'])
  await assert.rejects(queryWindchill(request, async (url) => ({ ok: true, status: 200, url, json: async () => ({ value: [], '@odata.nextLink': 'https://evil.example.com/x' }) })), /outside the service/)
  await assert.rejects(queryWindchill(request, async () => new Response('<html><title>Sign in to your account</title></html>', { headers: { 'content-type': 'text/html; charset=utf-8' } })), /sign-in page\). Click Sign in under Settings/, 'a login page is reported, not a JSON parse error')
  await assert.rejects(queryWindchill({ ...request, path: '../admin' }, fetch), /valid object type/)
  const versioned = []
  await queryWindchill({ ...request, path: 'v7/DocMgmt/Documents?$select=Number' }, async (url) => { versioned.push(url); return { ok: true, status: 200, url, json: async () => ({ value: [] }) } })
  assert.equal(versioned[0], 'https://plm.example.com/Windchill/servlet/odata/v7/DocMgmt/Documents?$select=Number')
  await assert.rejects(queryWindchill(request, async (url) => ({ ok: false, status: 400, url, json: async () => ({ error: { message: 'Property Numbr not found' } }) })), /status 400: Property Numbr not found/)
  await assert.rejects(queryWindchill(request, async () => ({ ok: true, status: 200, url: 'https://login.example.com/sso', json: async () => ({}) })), /sign-in page on login\.example\.com/)
})

test('Windchill results through Git: no credentials, newer results replace older ones', () => {
  const source = (at, n) => ({ viewId: 'dhf', name: 'Released DHF', fetchedAt: at, query: 'q', columns: ['Number'], rows: Array.from({ length: n }, (_, i) => ({ Number: `DHF-${i}` })) })
  const file = parseWindchillSnapshot(JSON.stringify(windchillSnapshotFile(view, { ...source('2026-10-20T10:00:00Z', 3), fromGit: true })))
  assert.equal('fromGit' in file.source, false)
  assert.deepEqual(applyWindchillSnapshots([source('2026-10-19T10:00:00Z', 1)], [file]).sources.map((entry) => [entry.rows.length, entry.fromGit]), [[3, true]])
  assert.deepEqual(applyWindchillSnapshots([source('2026-10-21T10:00:00Z', 1)], [file]).applied, [])
  assert.throws(() => parseWindchillSnapshot('{"schema":1,"kind":"azure-view-snapshot"}'), /not a Windchill view snapshot/)
})

test('browser route: the search address to open, and results saved or copied from the browser', () => {
  const service = 'https://plm.example.com/Windchill/servlet/odata'
  assert.equal(windchillSearchUrl(`${service}/`, view), `${service}/${buildWindchillQuery(view)}`)
  const page = parseWindchillPage('\uFEFF{"@odata.context":"x","value":[{"Number":"DHF-1"},null,{"Number":"DHF-2"}],"@odata.nextLink":"v7/DocMgmt/Documents?$skiptoken=2"}', service)
  assert.deepEqual(page.rows, [{ Number: 'DHF-1' }, { Number: 'DHF-2' }])
  assert.equal(page.next, `${service}/v7/DocMgmt/Documents?$skiptoken=2`, 'a relative next link resolves under the service')
  assert.equal(parseWindchillPage('{"value":[],"@odata.nextLink":"https://evil.example.com/Windchill/servlet/odata/x"}', service).next, '', 'a next link to another host is dropped')
  assert.equal(parseWindchillPage('{"value":[],"@odata.nextLink":"https://plm.example.com/other/x"}', service).next, '', 'a next link outside the service is dropped')
  assert.equal(parseWindchillPage('{"value":[]}', service).next, '')
  assert.throws(() => parseWindchillPage('<html><title>Sign in to your account</title></html>', service), /web page, not the search results/)
  assert.throws(() => parseWindchillPage('not json', service), /not the JSON/)
  assert.throws(() => parseWindchillPage('[{"id":"DocMgmt"}]', service), /domain list/)
  assert.throws(() => parseWindchillPage('{"error":{"message":"Invalid property Foo"}}', service), /error: Invalid property Foo/)
})

test('CSV export neutralises formulas in the header row as well as in cells, and quotes column names (CON-69, PT-01)', () => {
  const csv = windchillCsv(['=cmd|\' /C calc\'!A0', 'Name, full', 'Number'], [{ '=cmd|\' /C calc\'!A0': 'x', 'Name, full': '=1+1', Number: '-3' }])
  const [header, row] = csv.split('\r\n')
  assert.equal(header, `'=cmd|' /C calc'!A0,"Name, full",Number`)
  assert.equal(row, `x,'=1+1,-3`)
})

test('a Windchill snapshot from Git drops rows that are not plain objects instead of crashing the view (CON-70, PT-07)', () => {
  const source = { viewId: 'dhf', name: 'Released DHF', fetchedAt: '2026-10-20T10:00:00Z', query: 'q', columns: ['Number'], rows: [{ Number: 'DHF-1' }, null, 5, 'text', ['a'], { Number: 'DHF-2' }] }
  const file = parseWindchillSnapshot(JSON.stringify(windchillSnapshotFile(view, source)))
  assert.deepEqual(file.source.rows.map((row) => windchillCell(row, 'Number')), ['DHF-1', 'DHF-2'])
})
