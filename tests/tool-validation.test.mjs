import test from 'node:test'
import assert from 'node:assert/strict'
import { listValidationDocuments, readValidationDocument, validationPath, validationRoot, validationMime } from '../src/toolValidation.ts'

const config = { owner: 'example', repo: 'private-docs', branch: 'test/branch', path: 'nested/planning-data.json' }
const token = 'synthetic-private-token'
const file = (path) => ({ name: path.split('/').at(-1), path, size: 12, sha: 'a'.repeat(40), type: 'file' })

test('TC-DOC-04: package listing uses configured repository and read-only authenticated GETs in fixed folders', async () => {
  const calls = []
  const docs = await listValidationDocuments(config, token, async (url, init) => {
    calls.push(url)
    assert.equal(init.headers.Authorization, `Bearer ${token}`)
    assert.equal(init.method, undefined)
    assert.equal(init.cache, 'no-store')
    assert.equal(init.credentials, 'omit')
    assert.equal(init.redirect, 'error')
    assert.ok(url.startsWith('https://api.github.com/repos/example/private-docs/contents/tool-validation/demandplanning'))
    assert.ok(url.endsWith('?ref=test%2Fbranch'))
    assert.ok(!url.includes(token))
    const folder = decodeURIComponent(new URL(url).pathname.split('/contents/')[1])
    return Response.json([file(`${folder}/Document.docx`), file('planning-data.json'), { ...file(`${folder}/Link.pdf`), type: 'symlink' }, file(`${folder}/unsafe.exe`), file(`${folder}/../escape.md`)])
  })
  assert.equal(calls.length, 6)
  assert.equal(docs.length, 6)
  assert.ok(docs.some((doc) => doc.category === 'Blank templates'))
  assert.ok(docs.some((doc) => doc.category === 'Draft records'))
  assert.ok(docs.every((doc) => doc.format === 'DOCX'))
})

test('TC-DOC-04: PDF and Office bytes above 1 MB are fetched raw without transformations', async () => {
  const binary = Uint8Array.from({ length: 1_200_000 }, (_, index) => index % 256)
  for (const extension of ['pdf', 'docx', 'xlsx']) {
    const bytes = await readValidationDocument(config, token, `${validationRoot}/records/Example.${extension}`, async (_url, init) => {
      assert.equal(init.headers.Accept, 'application/vnd.github.raw+json')
      assert.equal(init.headers.Authorization, `Bearer ${token}`)
      return new Response(binary)
    })
    assert.deepEqual(bytes, binary)
  }
  assert.equal(validationMime('x.pdf'), 'application/pdf')
  assert.match(validationMime('x.docx'), /wordprocessingml/)
  assert.match(validationMime('x.xlsx'), /spreadsheetml/)
})

test('TC-DOC-04: out-of-scope paths fail before any request', async () => {
  for (const path of ['planning-data.json', `${validationRoot}/../access.json`, `${validationRoot}/records/../../data.md`, `${validationRoot}/records/x\\y.pdf`, `${validationRoot}/other/x.md`, `${validationRoot}/records/nested/x.md`, `${validationRoot}/records/file.html`]) {
    assert.throws(() => validationPath(path), /Tool Validation/)
    await assert.rejects(readValidationDocument(config, token, path, () => { throw Error('Must not fetch') }), /Tool Validation/)
  }
})

test('TC-DOC-04: denied credentials and network failures give actionable errors without secrets', async () => {
  for (const [status, pattern] of [[401, /rejected the PAT/], [403, /Contents: Read/], [404, /not found/], [500, /HTTP 500/]]) {
    await assert.rejects(readValidationDocument(config, token, `${validationRoot}/README.md`, async () => new Response(token, { status })), (error) => pattern.test(error.message) && !error.message.includes(token))
  }
  await assert.rejects(listValidationDocuments(config, '', () => { throw Error('Must not fetch') }), /Configure/)
  await assert.rejects(listValidationDocuments(config, token, () => { throw Error(token) }), (error) => /network/.test(error.message) && !error.message.includes(token))
  await assert.rejects(listValidationDocuments(config, token, async () => Response.json({})), /invalid/)
})
