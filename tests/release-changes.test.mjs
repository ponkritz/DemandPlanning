import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { nextVersion, parseChange, prOf, setVersion, withEntry } from '../scripts/release-changes.mjs'
import { releaseEntry } from '../scripts/release-entry.mjs'

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

test('CI-09: every waiting change note is valid — a bump type and at least one change (TC-CI-05)', () => {
  const files = readdirSync(new URL('../docs/changes/', import.meta.url)).filter((name) => name.endsWith('.md') && name !== 'README.md')
  for (const name of files) assert.doesNotThrow(() => parseChange(read(`docs/changes/${name}`), name), name)
  assert.ok(read('docs/changes/README.md').includes('bump: minor'), 'the folder explains the format')
})

test('CI-09: a change note is read exactly; malformed ones are refused (TC-CI-05)', () => {
  assert.deepEqual(parseChange('---\nbump: patch\n---\n**Fixed**\n- A fix (X-01).\n', 'a-fix.md'), { file: 'a-fix.md', bump: 'patch', body: '**Fixed**\n- A fix (X-01).' })
  assert.equal(parseChange('---\r\nbump: major\r\n---\r\n- Breaks it.\r\n', 'b.md').bump, 'major', 'Windows line ends')
  assert.throws(() => parseChange('- no front matter', 'c.md'), /front matter/)
  assert.throws(() => parseChange('---\nbump: huge\n---\n- x', 'c.md'), /major, minor or patch/)
  assert.throws(() => parseChange('---\nbump: minor\n---\nNo list.', 'c.md'), /"- " line/)
  assert.throws(() => parseChange('---\nbump: minor\n---\n## v9.9.9 — 2026-01-01\n- x', 'c.md'), /headings/, 'a heading would cut the release entry')
  assert.throws(() => parseChange('---\nbump: minor\n---\n- x', 'Bad Name.md'), /lower-case/)
})

test('CI-11: the highest bump of the waiting notes gives the next version (TC-CI-07)', () => {
  assert.equal(nextVersion('7.42.4', ['patch']), '7.42.5')
  assert.equal(nextVersion('7.42.4', ['patch', 'minor', 'patch']), '7.43.0')
  assert.equal(nextVersion('7.42.4', ['minor', 'major']), '8.0.0')
  assert.equal(nextVersion('7.9.9', ['minor']), '7.10.0', 'numbers, not text')
  assert.equal(setVersion('{\n  "name": "x",\n  "version": "7.42.4",\n  "a": 1\n}\n', '7.43.0'), '{\n  "name": "x",\n  "version": "7.43.0",\n  "a": 1\n}\n', 'only the version changes')
})

test('CI-11: the notes become the new version’s entry at the top, each with its pull request (TC-CI-07)', () => {
  assert.equal(prOf('Story templates (v7.40.0) (#316)'), '316')
  assert.equal(prOf('Release v7.43.0 [skip ci]'), undefined)
  const notes = '# Release notes\n\nIntro.\n\n## v7.42.4 — 2026-11-21\n\n- Old.\n'
  const out = withEntry(notes, '7.43.0', '2026-11-22', [{ body: '**Added**\n- A (X-01).', pr: '325' }, { body: '- B, PR #326.', pr: '326' }, { body: '- C.' }])
  assert.equal(out, '# Release notes\n\nIntro.\n\n## v7.43.0 — 2026-11-22\n\n**Added**\n- A (X-01).\n\nPR #325.\n\n- B, PR #326.\n\n- C.\n\n## v7.42.4 — 2026-11-21\n\n- Old.\n')
  assert.equal(releaseEntry(out, '7.43.0'), '**Added**\n- A (X-01).\n\nPR #325.\n\n- B, PR #326.\n\n- C.', 'the tagged release takes exactly this entry')
})

test('CI-11: the release commit is written after every merge by a job that installs nothing; builds use that commit (TC-CI-07)', () => {
  const workflow = read('.github/workflows/build-and-deploy.yml')
  const job = workflow.slice(workflow.indexOf('  release-commit:'), workflow.indexOf('\n  validate-and-package:'))
  assert.match(job, /if: github\.event_name != 'pull_request' && github\.ref == 'refs\/heads\/main'/, 'only on main')
  assert.match(job, /contents: write/)
  assert.match(job, /group: release-commit\n\s+cancel-in-progress: false/, 'one release commit at a time')
  assert.doesNotMatch(job, /pnpm|npm (ci|install)|npx/, 'no dependency is installed or run where the token can push (CI-07)')
  assert.match(job, /persist-credentials: false/)
  assert.match(job, /node scripts\/release-changes\.mjs --apply/)
  assert.match(job, /node scripts\/swbom\.mjs/); assert.match(job, /node scripts\/traceability\.mjs/)
  assert.doesNotMatch(job.split('run: |')[1] ?? '', /\$\{\{/, 'the script reads environment variables, not expressions (CI-07)')
  assert.match(workflow, /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/, 'a run on main is not cancelled by the next merge')
  const jobs = workflow.split(/\n(?=  [a-z-]+:\n)/)
  for (const name of ['validate-and-package', 'end-to-end', 'package-macos', 'publish-tagged-release', 'build-web-site']) {
    const block = jobs.find((part) => part.startsWith(`  ${name}:\n`)) ?? ''
    assert.match(block, /needs\.release-commit\.outputs\.sha \|\| github\.sha/, `${name} builds the release commit`)
  }
  assert.match(workflow, /node scripts\/release-changes\.mjs --pr-check "\$BASE_SHA"/, 'a pull request must add a note and leave the version alone')
})
