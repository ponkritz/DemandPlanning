import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

test('CI-12: the E2E scenarios also run on a 4x slower CPU, in their own read-only job (TC-CI-08)', () => {
  const workflow = read('.github/workflows/build-and-deploy.yml')
  const job = workflow.split(/\n(?=  [a-z-]+:\n)/).find((part) => part.startsWith('  end-to-end-slow:\n')) ?? ''
  assert.match(job, /name: End-to-end tests \(slow machine\)/)
  assert.match(job, /E2E_CPU_SLOWDOWN: '4'\n\s+run: pnpm test:e2e/)
  assert.match(job, /permissions:\n\s+contents: read/, 'it runs dependency code: read-only token (CI-07)')
  assert.match(job, /persist-credentials: false/)
  assert.match(job, /needs\.release-commit\.outputs\.sha \|\| github\.sha/, 'the same commit as the other builds (CI-11)')
  const helpers = read('e2e/helpers.mjs')
  assert.match(helpers, /process\.env\.E2E_CPU_SLOWDOWN/)
  assert.match(helpers, /newCDPSession\(page\)\)\.send\('Emulation\.setCPUThrottlingRate', \{ rate: slowdown \}\)/, 'every page the scenarios open is throttled')
})
