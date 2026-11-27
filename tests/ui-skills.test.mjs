// CI-13: the UI design skills (.claude/skills/ui-*/SKILL.md) are the how-to of docs/UI-STANDARDS.md for every coding
// agent. They must not drift from the code: every building block a skill names under "## Building blocks" exists where it
// says (an export, a CSS class or a CSS token), every skill has its name and description, and the index skill routes to
// every skill and every section of the standard.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, posix } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const skillsDir = join(root, '.claude/skills')
const skills = readdirSync(skillsDir).filter((name) => name.startsWith('ui-')).sort()
// Line endings as checked out (CRLF on Windows) are read as LF.
const read = (name) => readFileSync(join(skillsDir, name, 'SKILL.md'), 'utf8').replace(/\r\n/g, '\n')

test('CI-13: standalone preview imports match the app stylesheet order (TC-CI-09)', () => {
  const imports = (source) => [...source.matchAll(/^import\s+['"]([^'"]+\.css)['"]/gm)].map((match) => match[1])
  const expected = ['src/main.tsx', 'src/App.tsx'].flatMap((file) =>
    imports(readFileSync(join(root, file), 'utf8')).map((path) => posix.resolve('/', posix.dirname(file), path)))
  const example = /## Standalone previews\n[^#]*?```ts\n([\s\S]*?)```/.exec(read('ui-design-system'))
  assert.ok(example && expected.length, 'Preview example and application CSS imports exist')
  assert.deepEqual(imports(example[1]), expected)
})

// `Name` — `path` pairs in the "## Building blocks" section of a skill.
export function buildingBlocks(text) {
  const section = /^## Building blocks\n([\s\S]*?)(?=^## )/m.exec(text)?.[1] ?? ''
  return [...section.matchAll(/`([^`]+)` — `([^`]+)`/g)].map(([, name, path]) => ({ name, path }))
}

// Where a named block is defined in its file: an export, a CSS class selector or a CSS custom property.
export function defines(source, name) {
  if (name.startsWith('--')) return source.includes(`${name}:`)
  if (name.startsWith('.')) return new RegExp(`\\${name}(?![\\w-])`).test(source)
  return new RegExp(`export (?:default )?(?:async )?(?:function|const|let|class|interface|type) ${name}\\b`).test(source)
}

test('CI-13: there is one UI design skill per kind of component, each with its name and a description (TC-CI-09)', () => {
  assert.ok(skills.length >= 14, `expected the index and a skill per UI-STANDARDS section, found ${skills.length}`)
  for (const name of skills) {
    const text = read(name)
    const front = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? ''
    assert.match(front, new RegExp(`^name: ${name}$`, 'm'), `${name}: front matter name`)
    assert.match(front, /^description: .{40,}$/m, `${name}: a description that says when to use it`)
    assert.match(text, /^## Checklist$/m, `${name}: a checklist`)
  }
})

test('CI-13: every building block a skill names exists in the code where the skill says (TC-CI-09)', () => {
  for (const name of skills) {
    const blocks = buildingBlocks(read(name))
    assert.ok(blocks.length, `${name}: names its building blocks`)
    for (const block of blocks) {
      const file = join(root, block.path)
      assert.ok(existsSync(file), `${name}: ${block.path} exists`)
      assert.ok(defines(readFileSync(file, 'utf8'), block.name), `${name}: ${block.name} is defined in ${block.path}`)
    }
  }
})

test('CI-13: the index skill routes to every UI skill and every section of UI-STANDARDS (TC-CI-09)', () => {
  const index = read('ui-design-system')
  for (const name of skills.filter((skill) => skill !== 'ui-design-system')) assert.match(index, new RegExp(`\`${name}\``), `index names ${name}`)
  const standard = readFileSync(join(root, 'docs/UI-STANDARDS.md'), 'utf8').replace(/\r\n/g, '\n')
  const sections = [...standard.matchAll(/^## (\d+a?)\. /gm)].map(([, number]) => number)
  assert.ok(sections.length >= 12)
  for (const number of sections) assert.match(index, new RegExp(`\\| §${number} \\|`), `index routes §${number}`)
})

test('CI-13: the checker finds a missing block and accepts each kind of definition (TC-CI-09)', () => {
  assert.equal(defines('export function Page() {}', 'Page'), true)
  assert.equal(defines('export const recordJob = () => 1', 'recordJob'), true)
  assert.equal(defines('function Page() {}', 'Page'), false)
  assert.equal(defines('.segmented{display:flex}', '.segmented'), true)
  assert.equal(defines('.segmented-x{display:flex}', '.segmented'), false)
  assert.equal(defines(':root{--viz-series-1:#000}', '--viz-series-1'), true)
  assert.equal(defines('color:var(--viz-series-1)', '--viz-series-1'), false)
  assert.deepEqual(buildingBlocks('## Building blocks\n\n- `Page` — `src/components/ui.tsx` (x), `Metric` — `src/a.tsx`\n\n## Rules\n- `Not` — `here`\n'), [{ name: 'Page', path: 'src/components/ui.tsx' }, { name: 'Metric', path: 'src/a.tsx' }])
})
