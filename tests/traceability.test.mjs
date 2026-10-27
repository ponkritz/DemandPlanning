import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { build, idsIn, readComponents, readKnownIssues, readRequirements, readTestCases, readUat } from '../scripts/traceability.mjs'

// The Validation Package documents must stay consistent with each other: every requirement in force has a test case,
// every test case names known requirements, every UAT day names live test cases, the three requirement levels chain
// without gaps, and the committed traceability matrix is the generated one (DOC-09, DOC-10).

test('requirement IDs expand ranges and keep their width', () => {
  assert.deepEqual(idsIn('ATM-07…09, NAV-01…04, OV-10 and QV-31'), ['ATM-07', 'ATM-08', 'ATM-09', 'NAV-01', 'NAV-02', 'NAV-03', 'NAV-04', 'OV-10', 'QV-31'])
  assert.deepEqual(idsIn('CON-68…CON-70'), ['CON-68', 'CON-69', 'CON-70'])
})

test('the requirements have three levels, chained without gaps, with unique IDs', () => {
  const { useCases, userReqs, systemReqs, detailed } = readRequirements()
  assert.ok(useCases.length >= 20 && userReqs.length >= 15 && systemReqs.length >= 20 && detailed.length >= 300)
  const ids = [...useCases, ...userReqs, ...systemReqs, ...detailed].map((item) => item.id)
  assert.deepEqual(ids.filter((id, index) => ids.indexOf(id) !== index), [], 'every requirement ID is unique')
  for (const ur of userReqs) {
    assert.ok(ur.useCases.length, `${ur.id} comes from a use case`)
    for (const uc of ur.useCases) assert.ok(useCases.some((item) => item.id === uc), `${ur.id} names the existing use case ${uc}`)
  }
  for (const sr of systemReqs) {
    assert.ok(sr.userReqs.length, `${sr.id} derives from a user requirement`)
    for (const ur of sr.userReqs) assert.ok(userReqs.some((item) => item.id === ur), `${sr.id} derives from the existing ${ur}`)
  }
  for (const req of detailed) assert.ok(req.systemReq, `${req.id} refines a system requirement`)
  for (const req of detailed.filter((req) => !req.retired)) {
    assert.match(req.verification, /^[TDIA](, [TDIA])*$/, `${req.id} has a verification method`)
    assert.match(req.priority, /^[MSC]$/, `${req.id} has a priority`)
  }
})

test('every test case names known requirements, every UAT day live test cases, every known issue known requirements', () => {
  const { detailed } = readRequirements()
  const known = new Set(detailed.map((req) => req.id))
  const cases = readTestCases()
  const caseIds = cases.map((tc) => tc.id)
  assert.deepEqual(caseIds.filter((id, index) => caseIds.indexOf(id) !== index), [], 'every test case ID is unique')
  for (const tc of cases) {
    assert.ok(tc.requirements.length, `${tc.id} traces to a requirement`)
    for (const req of tc.requirements) assert.ok(known.has(req), `${tc.id} traces to the existing ${req}`)
  }
  for (const day of readUat()) for (const id of day.cases) {
    const tc = cases.find((item) => item.id === id)
    assert.ok(tc && !tc.retired, `UAT day ${day.day} names the live test case ${id}`)
  }
  const issues = readKnownIssues()
  assert.ok(issues.length >= 10)
  for (const issue of issues) for (const req of issue.affects) assert.ok(known.has(req), `${issue.id} affects the existing ${req}`)
})

test('every source file is a listed software component, with requirement areas that exist', () => {
  const components = readComponents()
  const paths = components.map((component) => component.path)
  assert.deepEqual(paths.filter((path, index) => paths.indexOf(path) !== index), [], 'each path is listed once')
  const { detailed } = readRequirements()
  const prefixes = new Set(detailed.map((req) => req.id.split('-')[0]))
  for (const component of components) for (const area of component.areas) assert.ok(prefixes.has(area), `${component.path}: area ${area} is a requirement prefix`)
  for (const file of ['src/App.tsx', 'src/windchillReleases.ts', 'electron/main.cjs', 'scripts/traceability.mjs', 'tests/traceability.test.mjs']) assert.ok(paths.includes(file), `${file} is listed`)
})

test('the committed traceability matrix is complete and current', () => {
  const { text, gaps, untested } = build()
  assert.deepEqual(gaps, [], 'no trace gap')
  assert.deepEqual(untested.map((req) => req.id), [], 'every requirement in force has a test case')
  assert.equal(readFileSync(new URL('../docs/TRACEABILITY-MATRIX.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n'), text, 'docs/TRACEABILITY-MATRIX.md is current: run `node scripts/traceability.mjs`')
})
