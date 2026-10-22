import test from 'node:test'
import assert from 'node:assert/strict'
import { testWindchillInBrowser, queryWindchillInBrowser } from '../src/windchillBrowser.ts'

const service = 'https://plm.example.com/Windchill/servlet/odata'
const origin = 'https://app.example.github.io'

test('web app: Windchill test and search from the browser, with its own sign-in sent along', async () => {
  const calls = []
  const ok = await testWindchillInBrowser(service, async (url, init) => { calls.push([url, init.credentials]); return Response.json([{ path: `${service}/v7/DocMgmt`, id: 'DocMgmt' }]) }, origin)
  assert.deepEqual([ok.ok, ok.services, calls], [true, ['v7/DocMgmt'], [[service, 'include']]])
  const blocked = await testWindchillInBrowser(service, async () => { throw new TypeError('Failed to fetch') }, origin)
  assert.match(blocked.message, /does not allow requests from this app \(https:\/\/app\.example\.github\.io\).*Open in browser and Import/)
  const login = await testWindchillInBrowser(service, async () => new Response('<html><title>Sign in to your account</title></html>'), origin)
  assert.match(login.message, /web page \(likely its sign-in\)/)
  assert.match((await testWindchillInBrowser(service, async () => new Response('', { status: 401 }), origin)).message, /Sign in to Windchill in this browser/)

  const pages = { [`${service}/v7/DocMgmt/Documents?$select=Number`]: { value: [{ Number: 'A' }], '@odata.nextLink': `${service}/v7/DocMgmt/Documents?$skiptoken=1` }, [`${service}/v7/DocMgmt/Documents?$skiptoken=1`]: { value: [{ Number: 'B' }] } }
  const { rows } = await queryWindchillInBrowser(service, 'v7/DocMgmt/Documents?$select=Number', async (url) => Response.json(pages[url]), origin)
  assert.deepEqual(rows.map((row) => row.Number), ['A', 'B'], 'next pages on the same service are followed')
  await assert.rejects(queryWindchillInBrowser(service, 'v7/DocMgmt/Documents', async () => Response.json({ error: { message: 'Invalid property Foo' } }, { status: 400 }), origin), /status 400: Invalid property Foo/)
})
