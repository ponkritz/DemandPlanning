import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { idsIn, readKnownIssues, readRequirements, readTestCases } from '../scripts/traceability.mjs'

// The Validation Package documents (DOC-09, DOC-11): each has its required sections, its own IDs are unique, and every
// requirement, test case, mitigation, DFMEA row, finding, risk or issue it cites exists in the document that owns it.
const doc = (file) => readFileSync(new URL(`../docs/${file}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const rowIds = (text, prefix) => [...text.matchAll(new RegExp(String.raw`^\| (${prefix}-\d+) \|`, 'gm'))].map((m) => m[1])
const unique = (ids, what) => assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), [], `${what} IDs are unique`)

const sections = {
  'VALIDATION-PACKAGE.md': ['## 1. Documents of the package', '## 2. How the package is kept valid', '## 3. Validation summary for this build', '## 4. Intended use statement', '## 5. Approval'],
  'SECURITY-ASSESSMENT.md': ['## 1. Scope and assets', '## 2. Code analysis and penetration test', '### 2.2 Findings', '### 2.3 Controls confirmed working', '## 3. Product security risk assessment', '## 4. Mitigations and their trace to the requirements', '## 5. Re-assessment'],
  'DFMEA.md': ['## 1. Credentials and connections', '## 2. Reading and writing Azure DevOps', '## 3. Capacity, baselines and releases', '## 4. Storage, sharing and recovery', '## 5. Exports, imports and rendering', '## 6. Update and deployment', '## 7. Summary'],
  'DEVELOPMENT-PROCESS.md': ['## 1. Intended use and classification', '## 2. Roles', '## 3. Life-cycle model', '## 4. Change procedure (one pull request)', '## 5. Verification strategy', '## 6. Computer Software Assurance (FDA CSA) approach', '## 7. Risk management file', '## 8. Configuration management', '## 9. Problem resolution', '## 10. Training and competence', '## 11. Gaps against the standards (as of this revision)'],
  'KNOWN-ISSUES.md': ['## 1. Known bugs (KB)', '## 2. Open issues (OI)', '## 3. Accepted residual risks', '## 4. Accepted limitations'],
  'SOFTWARE-COMPONENTS.md': ['## 1. In-house components', '## 2. Third-party components (SOUP)', '## 3. Platforms and services', '## 4. Known vulnerabilities in third-party components'],
  'REQUIREMENTS-SPECIFICATION.md': ['## 2. Stakeholders and use cases', '## 3. User requirements', '## 4. System requirements', '## 5. Detailed requirements', '## 6. Non-functional requirements', '## 7. Interface requirements', '## 8. Open issues', '## 9. Traceability'],
}

test('every package document has its required sections', () => {
  for (const [file, headings] of Object.entries(sections)) {
    const text = doc(file)
    for (const heading of headings) assert.ok(text.includes(`\n${heading}\n`), `${file} has "${heading}"`)
  }
})

test('mitigations, DFMEA rows, findings, risks and issues have unique IDs and the summary counts match', () => {
  const security = doc('SECURITY-ASSESSMENT.md'), dfmea = doc('DFMEA.md'), issues = doc('KNOWN-ISSUES.md')
  unique(rowIds(security, 'PT'), 'finding'); unique(rowIds(security, 'R'), 'risk'); unique(rowIds(security, 'SM'), 'mitigation')
  unique(rowIds(dfmea, 'DF'), 'DFMEA'); unique([...rowIds(issues, 'KB'), ...rowIds(issues, 'OI'), ...rowIds(issues, 'LIM'), ...rowIds(issues, 'R')], 'issue')
  assert.equal(rowIds(dfmea, 'DF').length, Number(/\| Failure modes analysed \| (\d+) \|/.exec(dfmea)[1]), 'DFMEA summary counts the rows')
  assert.ok(rowIds(security, 'SM').length >= 20 && rowIds(security, 'R').length >= 15 && rowIds(security, 'PT').length >= 10)
})

test('every ID cited in the package exists where it is defined', () => {
  const { useCases, userReqs, systemReqs, detailed } = readRequirements()
  const security = doc('SECURITY-ASSESSMENT.md'), dfmea = doc('DFMEA.md'), issues = doc('KNOWN-ISSUES.md')
  const known = new Map([
    ...[...useCases, ...userReqs, ...systemReqs, ...detailed].map((item) => [item.id, 'REQUIREMENTS-SPECIFICATION.md']),
    ...readTestCases().map((tc) => [tc.id, 'TEST-PLAN.md']),
    ...readKnownIssues().map((issue) => [issue.id, 'KNOWN-ISSUES.md']),
    ...[...rowIds(issues, 'LIM'), ...rowIds(issues, 'R')].map((id) => [id, 'KNOWN-ISSUES.md']),
    ...[...rowIds(security, 'PT'), ...rowIds(security, 'R'), ...rowIds(security, 'SM')].map((id) => [id, 'SECURITY-ASSESSMENT.md']),
    ...rowIds(dfmea, 'DF').map((id) => [id, 'DFMEA.md']),
  ])
  // Prefixes that are not cross-references: asset and boundary labels, test data, environments, document IDs.
  const local = /^(A|B|TD|ENV|S|O|D|RPN|DPH|SRS|TP|VP|SA|KI|SC|SDP|DFMEA|CFR|ISO|IEC|GHSA|CVE|SHA|QMS|L|X|Q)$/
  for (const file of ['VALIDATION-PACKAGE.md', 'SECURITY-ASSESSMENT.md', 'DFMEA.md', 'DEVELOPMENT-PROCESS.md', 'KNOWN-ISSUES.md', 'SOFTWARE-COMPONENTS.md']) {
    const text = doc(file).replace(/`[^`]*`/g, '').replace(/\d+ CFR \d+\.\d+\(\w\)/g, '').replace(/ISO \d+(:\d+)?/g, '').replace(/IEC \d+/g, '')
    // Test-case IDs are matched whole first, so that "INS-01" inside "TC-INS-01" is not read as a requirement.
    const cited = [...new Set([...idsIn(text.replace(/\bTC-[A-Z]+-\d+\b/g, '')), ...[...text.matchAll(/\b(TC-[A-Z]+-\d+)\b/g)].map((m) => m[1])])]
    for (const id of cited) {
      const prefix = id.split('-')[0]
      if (local.test(prefix)) continue
      assert.ok(known.has(id), `${file} cites ${id}, which is defined nowhere`)
    }
  }
})

test('the package index lists every document in docs/, and the app bundles them all', () => {
  const index = doc('VALIDATION-PACKAGE.md')
  const bundled = readFileSync(new URL('../src/docs/index.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  for (const file of Object.keys(sections)) {
    if (file !== 'VALIDATION-PACKAGE.md') assert.ok(index.includes(`[${file}](${file})`), `VALIDATION-PACKAGE.md lists ${file}`)
    assert.ok(bundled.includes(`docs/${file}?raw`), `${file} is bundled for the Documentation page`)
  }
})
