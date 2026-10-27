// Generates docs/TRACEABILITY-MATRIX.md from the other documents: use case → user requirement (UR) → system requirement
// (SR) → detailed requirement → test case → UAT day → software component. Run `node scripts/traceability.mjs` after
// changing a document; `node scripts/traceability.mjs --check` (what `pnpm test` runs) fails when the committed matrix is
// out of date or when a requirement, test case or use case is not traced. Open issues (OI-NN) are not requirements.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const docs = new URL('../docs/', import.meta.url)
// Line endings are normalised: a Windows checkout (CI) may have CRLF.
const read = (file) => readFileSync(new URL(file, docs), 'utf8').replace(/\r\n/g, '\n')
const out = fileURLToPath(new URL('TRACEABILITY-MATRIX.md', docs))

const cells = (line) => line.slice(1, -1).split(/(?<!\\)\|/).map((cell) => cell.trim())
const idPattern = /\b([A-Z]{2,4})-(\d{2,3})(?:\s*(?:…|\.\.\.|–)\s*(?:\1-)?(\d{2,3}))?/g
// Every requirement ID in a text, with ranges ("ATM-07…09", "NAV-01…04") expanded.
export function idsIn(text) {
  const ids = new Set()
  for (const match of text.matchAll(idPattern)) {
    const [, prefix, from, to] = match
    for (let n = Number(from); n <= Number(to ?? from); n += 1) ids.add(`${prefix}-${String(n).padStart(from.length, '0')}`)
  }
  return [...ids]
}
const idNumber = (id) => { const [prefix, n] = id.split('-'); return [prefix, Number(n)] }
const byId = (a, b) => { const [pa, na] = idNumber(a), [pb, nb] = idNumber(b); return pa.localeCompare(pb) || na - nb }
const tcKey = (tc) => { const [, prefix, n] = tc.split('-'); return [prefix, Number(n)] }
const byTc = (a, b) => { const [pa, na] = tcKey(a), [pb, nb] = tcKey(b); return pa.localeCompare(pb) || na - nb }
const list = (ids, sort = byId) => [...new Set(ids)].sort(sort).join(', ') || '—'

export function readRequirements() {
  const srs = read('REQUIREMENTS-SPECIFICATION.md')
  const useCases = [], userReqs = [], systemReqs = [], detailed = []
  for (const line of srs.split('\n')) {
    if (!line.startsWith('| ')) continue
    const row = cells(line)
    const id = row[0]
    if (/^UC-\d+$/.test(id)) useCases.push({ id, text: row[1], actor: row[2] })
    else if (/^UR-\d+$/.test(id)) userReqs.push({ id, text: row[1], stakeholder: row[2], useCases: idsIn(row[3]), systemReqs: idsIn(row[4]) })
    else if (/^SR-\d+$/.test(id)) systemReqs.push({ id, text: row[1], userReqs: idsIn(row[2]), refinedBy: row[3] })
    else if (/^[A-Z]{2,4}-\d+$/.test(id) && !/^(OI|TC|TD|ENV|UC|UR|SR)-/.test(id)) {
      detailed.push({ id, text: row[1], verification: row[2] ?? '', priority: row[3] ?? '', trace: row[4] ?? '', retired: /^\*\(Retired/.test(row[1]) })
    }
  }
  // A detailed requirement refines the system requirement whose "Refined by" names its ID, else its prefix.
  const srOfId = new Map(), srOfPrefix = new Map()
  for (const sr of systemReqs) {
    const refined = sr.refinedBy.replace(/\(.*?\)/g, '')
    for (const id of idsIn(refined)) srOfId.set(id, sr.id)
    for (const prefix of refined.replace(idPattern, '').match(/[A-Z]{2,4}/g) ?? []) srOfPrefix.set(prefix, sr.id)
  }
  for (const req of detailed) req.systemReq = srOfId.get(req.id) ?? srOfPrefix.get(req.id.split('-')[0]) ?? ''
  return { useCases, userReqs, systemReqs, detailed }
}

export function readTestCases() {
  const plan = read('TEST-PLAN.md')
  const cases = []
  for (const match of plan.matchAll(/^\*\*(TC-[A-Z]+-\d+) ([^*]+)\*\* — (\*\(Retired[^)]*\)\* )?Req ([^\n]*)$/gm)) {
    const [, id, title, retired, rest] = match
    const [reqText] = rest.split(' — ')
    const l1 = [...rest.matchAll(/L1 `([^`]+)`/g)].map((m) => m[1])
    cases.push({ id, title: title.trim(), retired: Boolean(retired), requirements: idsIn(reqText).filter((req) => !req.startsWith('OI-')), uat: /\*\*UAT\*\*/.test(rest), l1, browser: /browser check/i.test(rest) || /- Steps:/.test(plan.slice(match.index, match.index + 400)) })
  }
  return cases
}

export function readUat() {
  const uat = read('UAT-PLAN.md')
  const days = []
  for (const line of uat.split('\n')) {
    if (!/^\| \d+ \|/.test(line)) continue
    const row = cells(line)
    days.push({ day: Number(row[0]), focus: row[1], cases: idsIn(row[2]).filter((id) => id.startsWith('TC-')).map((id) => id) })
  }
  // idsIn drops the "TC-" prefix pattern (three parts), so read the cases directly.
  for (const [index, line] of uat.split('\n').filter((line) => /^\| \d+ \|/.test(line)).entries()) {
    const ids = new Set()
    for (const m of cells(line)[2].matchAll(/TC-([A-Z]+)-(\d+)(?:…(\d+))?/g)) {
      for (let n = Number(m[2]); n <= Number(m[3] ?? m[2]); n += 1) ids.add(`TC-${m[1]}-${String(n).padStart(2, '0')}`)
    }
    days[index].cases = [...ids]
  }
  return days
}

export function readComponents() {
  const text = read('SOFTWARE-COMPONENTS.md')
  const components = []
  let section = ''
  for (const line of text.split('\n')) {
    if (line.startsWith('## ')) section = line.slice(3).trim()
    if (!line.startsWith('| ') || !/^\| [^|]+ \| `[^`]+` \|/.test(line)) continue
    const row = cells(line)
    components.push({ name: row[0], path: row[1].replace(/`/g, ''), section, areas: (row[3] ?? '').split(',').map((area) => area.trim()).filter((area) => /^[A-Z]{2,4}$/.test(area)) })
  }
  return components
}

export function readKnownIssues() {
  return read('KNOWN-ISSUES.md').split('\n').filter((line) => /^\| (OI|KB)-\d+ \|/.test(line)).map((line) => { const row = cells(line); return { id: row[0], affects: idsIn(row.at(-1)) } })
}

export function build() {
  const { useCases, userReqs, systemReqs, detailed } = readRequirements()
  const cases = readTestCases(), days = readUat(), components = readComponents(), issues = readKnownIssues()
  const casesOf = new Map()
  for (const tc of cases) for (const req of tc.requirements) casesOf.set(req, [...(casesOf.get(req) ?? []), tc.id])
  const dayOf = new Map()
  for (const day of days) for (const tc of day.cases) dayOf.set(tc, day.day)
  const issuesOf = new Map()
  for (const issue of issues) for (const req of issue.affects) issuesOf.set(req, [...(issuesOf.get(req) ?? []), issue.id])
  const componentsOf = (prefix) => components.filter((c) => c.areas.includes(prefix) || (prefix === 'OV' && c.areas.includes('OVR'))).map((c) => c.name)
  const detailedOf = (sr) => detailed.filter((req) => req.systemReq === sr)
  const live = detailed.filter((req) => !req.retired)

  const gaps = []
  const untested = live.filter((req) => !casesOf.has(req.id))
  for (const req of untested) gaps.push(`${req.id} has no test case`)
  for (const req of detailed.filter((req) => !req.systemReq)) gaps.push(`${req.id} refines no system requirement (no SR names its prefix)`)
  const unknownReqs = new Set(detailed.map((req) => req.id))
  for (const tc of cases) {
    if (!tc.requirements.length) gaps.push(`${tc.id} traces to no requirement`)
    for (const req of tc.requirements) if (!unknownReqs.has(req)) gaps.push(`${tc.id} traces to unknown requirement ${req}`)
  }
  for (const day of days) for (const tc of day.cases) {
    const known = cases.find((c) => c.id === tc)
    if (!known) gaps.push(`UAT day ${day.day} names unknown test case ${tc}`)
    else if (known.retired) gaps.push(`UAT day ${day.day} names retired test case ${tc}`)
  }
  for (const tc of cases.filter((tc) => tc.uat && !tc.retired && !dayOf.has(tc.id))) gaps.push(`${tc.id} is marked UAT but is on no UAT day`)
  const coveredUcs = new Set(userReqs.flatMap((ur) => ur.useCases))
  for (const uc of useCases.filter((uc) => !coveredUcs.has(uc.id))) gaps.push(`${uc.id} is covered by no user requirement`)
  const coveredUrs = new Set(systemReqs.flatMap((sr) => sr.userReqs))
  for (const ur of userReqs.filter((ur) => !coveredUrs.has(ur.id))) gaps.push(`${ur.id} is refined by no system requirement`)
  for (const sr of systemReqs.filter((sr) => !detailedOf(sr.id).length)) gaps.push(`${sr.id} is refined by no detailed requirement`)
  for (const ur of userReqs) for (const sr of ur.systemReqs) if (!systemReqs.some((s) => s.id === sr && s.userReqs.includes(ur.id))) gaps.push(`${ur.id} names ${sr} but ${sr} does not derive from it`)
  const ids = detailed.map((req) => req.id)
  for (const id of ids.filter((id, i) => ids.indexOf(id) !== i)) gaps.push(`${id} is defined twice`)
  const tcIds = cases.map((tc) => tc.id)
  for (const id of tcIds.filter((id, i) => tcIds.indexOf(id) !== i)) gaps.push(`${id} is defined twice`)

  const lines = []
  const push = (...text) => lines.push(...text)
  push('# I&D Quality Demand Planning — Requirements Traceability Matrix', '',
    'Generated by `node scripts/traceability.mjs` from [REQUIREMENTS-SPECIFICATION.md](REQUIREMENTS-SPECIFICATION.md), [TEST-PLAN.md](TEST-PLAN.md), [UAT-PLAN.md](UAT-PLAN.md), [SOFTWARE-COMPONENTS.md](SOFTWARE-COMPONENTS.md) and [KNOWN-ISSUES.md](KNOWN-ISSUES.md). Do not edit by hand: `pnpm test` fails when this file differs from the generated one, so it always matches the documents of the build that shows it.', '',
    `| | |`, `|---|---|`, `| Use cases | ${useCases.length} |`, `| User requirements (UR) | ${userReqs.length} |`, `| System requirements (SR) | ${systemReqs.length} |`,
    `| Detailed requirements | ${detailed.length} (${live.length} in force, ${detailed.length - live.length} retired) |`, `| Test cases | ${cases.length} (${cases.filter((tc) => tc.retired).length} retired, ${cases.filter((tc) => tc.uat && !tc.retired).length} UAT, ${cases.filter((tc) => tc.l1.length).length} with automated L1 tests) |`,
    `| UAT days | ${days.length} |`, `| Software components | ${components.length} |`, `| Requirements in force without a test case | ${untested.length} |`, `| Trace gaps | ${gaps.length} |`, '')
  push('## 1. Use case → user requirement → system requirement', '', '| Use case | User requirements | System requirements |', '|---|---|---|')
  for (const uc of useCases) {
    const urs = userReqs.filter((ur) => ur.useCases.includes(uc.id))
    push(`| ${uc.id} ${uc.text} | ${list(urs.map((ur) => ur.id))} | ${list(urs.flatMap((ur) => ur.systemReqs))} |`)
  }
  push('', '## 2. User requirement → system requirements → detailed requirements → test cases', '', '| User requirement | System requirements | Detailed requirements | Test cases |', '|---|---|---|---|')
  for (const ur of userReqs) {
    const srs = systemReqs.filter((sr) => sr.userReqs.includes(ur.id))
    const reqs = srs.flatMap((sr) => detailedOf(sr.id)).filter((req) => !req.retired)
    push(`| ${ur.id} ${ur.text} | ${list(srs.map((sr) => sr.id))} | ${reqs.length} (${list([...new Set(reqs.map((req) => req.id.split('-')[0]))], (a, b) => a.localeCompare(b))}) | ${list(reqs.flatMap((req) => casesOf.get(req.id) ?? []), byTc)} |`)
  }
  push('', '## 3. System requirement → detailed requirements → test cases → components', '', '| System requirement | From | Detailed requirements | Test cases | Components |', '|---|---|---|---|---|')
  for (const sr of systemReqs) {
    const reqs = detailedOf(sr.id)
    const prefixes = [...new Set(reqs.map((req) => req.id.split('-')[0]))]
    push(`| ${sr.id} ${sr.text} | ${list(sr.userReqs)} | ${list(reqs.filter((req) => !req.retired).map((req) => req.id))} | ${list(reqs.flatMap((req) => casesOf.get(req.id) ?? []), byTc)} | ${[...new Set(prefixes.flatMap(componentsOf))].sort().join(', ') || '—'} |`)
  }
  push('', '## 4. Detailed requirement → test cases → UAT → automated tests', '', 'Ver. = verification method (T test, D demonstration, I inspection, A analysis); Pri. = priority (M must, S should, C could). UAT gives the UAT day of each test case marked UAT. L1 names the automated test file(s) of the test cases. Retired requirements are kept for traceability and need no test.', '',
    '| Requirement | SR | UR | Ver. | Pri. | Test cases | UAT day | L1 automated | Issues |', '|---|---|---|---|---|---|---|---|---|')
  for (const req of detailed) {
    const tcs = (casesOf.get(req.id) ?? []).sort(byTc)
    const sr = systemReqs.find((sr) => sr.id === req.systemReq)
    const uatDays = [...new Set(tcs.map((tc) => dayOf.get(tc)).filter(Boolean))].sort((a, b) => a - b)
    const l1 = [...new Set(tcs.flatMap((tc) => cases.find((c) => c.id === tc)?.l1 ?? []))]
    push(`| ${req.id}${req.retired ? ' *(retired)*' : ''} | ${req.systemReq || '—'} | ${list(sr?.userReqs ?? [])} | ${req.verification} | ${req.priority} | ${tcs.join(', ') || (req.retired ? '—' : '**none**')} | ${uatDays.join(', ') || '—'} | ${l1.map((f) => `\`${f}\``).join(', ') || '—'} | ${list(issuesOf.get(req.id) ?? [])} |`)
  }
  push('', '## 5. Test case → requirements (backward trace)', '', '| Test case | Title | Requirements | Level | UAT day |', '|---|---|---|---|---|')
  for (const tc of cases) push(`| ${tc.id}${tc.retired ? ' *(retired)*' : ''} | ${tc.title} | ${list(tc.requirements)} | ${[tc.l1.length ? 'L1' : '', tc.browser ? 'L3' : '', tc.uat ? 'L4' : ''].filter(Boolean).join(', ') || 'L3'} | ${dayOf.get(tc.id) ?? '—'} |`)
  push('', '## 6. UAT day → test cases → requirements', '', '| Day | Focus | Test cases | Requirements |', '|---|---|---|---|')
  for (const day of days) push(`| ${day.day} | ${day.focus} | ${day.cases.join(', ')} | ${list(day.cases.flatMap((tc) => cases.find((c) => c.id === tc)?.requirements ?? []))} |`)
  push('', '## 7. Software component → requirement areas → system requirements', '', '| Component | Path | Areas | System requirements |', '|---|---|---|---|')
  const srOfPrefix = new Map(detailed.map((req) => [req.id.split('-')[0], req.systemReq]))
  for (const c of components) push(`| ${c.name} | \`${c.path}\` | ${c.areas.join(', ') || '—'} | ${list([...new Set(c.areas.map((area) => srOfPrefix.get(area)).filter(Boolean))])} |`)
  push('', '## 8. Trace gaps', '', gaps.length ? gaps.map((gap) => `- ${gap}`).join('\n') : 'None: every use case has a user requirement, every user requirement a system requirement, every system requirement detailed requirements, every requirement in force at least one test case, every test case known requirements, and every UAT day known test cases.', '')
  return { text: lines.join('\n'), gaps, untested }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  const { text, gaps } = build()
  if (process.argv.includes('--check')) {
    let current = ''
    try { current = readFileSync(out, 'utf8').replace(/\r\n/g, '\n') } catch { /* missing: reported below */ }
    const problems = [...gaps]
    if (current !== text) problems.push('docs/TRACEABILITY-MATRIX.md is out of date: run `node scripts/traceability.mjs`')
    if (problems.length) { console.error(problems.join('\n')); process.exit(1) }
    console.log('Traceability: complete and current.')
  } else {
    writeFileSync(out, text)
    console.log(`Wrote ${out}${gaps.length ? `\n${gaps.length} gap(s):\n${gaps.join('\n')}` : ''}`)
  }
}
