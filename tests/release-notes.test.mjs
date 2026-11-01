import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
// "## v1.3.0 — 2026-11-01" headings, newest first.
export const releaseHeadings = (markdown) => [...markdown.matchAll(/^## v(\d+)\.(\d+)\.(\d+) — (\d{4}-\d{2}-\d{2})\s*$/gm)].map((match) => ({ version: `${match[1]}.${match[2]}.${match[3]}`, parts: [Number(match[1]), Number(match[2]), Number(match[3])], date: match[4], at: match.index }))
const newer = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]

test('release notes: the newest version is the package version; versions unique, descending, each with an entry (TC-CI-05)', () => {
  const notes = read('docs/RELEASE-NOTES.md')
  const { version } = JSON.parse(read('package.json'))
  const releases = releaseHeadings(notes)
  assert.ok(releases.length > 0, 'RELEASE-NOTES.md lists at least one version')
  assert.equal(releases[0].version, version, `bump package.json and add "## v${version} — date" at the top of RELEASE-NOTES.md together`)
  for (let index = 1; index < releases.length; index += 1) {
    assert.ok(newer(releases[index - 1].parts, releases[index].parts) > 0, `v${releases[index - 1].version} comes before (is newer than) v${releases[index].version}`)
    assert.ok(releases[index - 1].date >= releases[index].date, `v${releases[index - 1].version} is not dated before v${releases[index].version}`)
  }
  releases.forEach((release, index) => {
    const end = releases[index + 1]?.at ?? notes.indexOf('\n## ', release.at + 1)
    const body = notes.slice(release.at, end > 0 ? end : undefined)
    assert.match(body, /^- \S/m, `v${release.version} has at least one change listed`)
  })
})

test('release-notes headings are read exactly (TC-CI-05)', () => {
  const sample = '# Release notes\n\n## v2.0.0 — 2026-12-01\n\n- A\n\n## v1.10.1 — 2026-11-02\n\n- B\n\n## Before v1.3.0 — summary\n'
  assert.deepEqual(releaseHeadings(sample).map((release) => [release.version, release.date]), [['2.0.0', '2026-12-01'], ['1.10.1', '2026-11-02']])
  assert.ok(newer([1, 10, 1], [1, 9, 9]) > 0, '1.10.1 is newer than 1.9.9 (numbers, not text)')
})
