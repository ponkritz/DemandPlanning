import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { linkTarget, parseInline, parseMarkdown, slug, tableCells } from '../src/markdown.ts'

test('headings get GitHub-style anchors, unique within a document', () => {
  const blocks = parseMarkdown('# Title\n\n## 7. Requirements coverage matrix\n\n### 6.1 Navigation and layout\n\n## Notes\n\n## Notes')
  assert.deepEqual(blocks.map((block) => block.id), ['title', '7-requirements-coverage-matrix', '61-navigation-and-layout', 'notes', 'notes-1'])
  assert.equal(slug('**TC-NAV-01** Sidebar'), 'tc-nav-01-sidebar')
})

test('tables keep escaped bars inside cells', () => {
  assert.deepEqual(tableCells('| `a \\| b` | x \\| y |'), ['`a | b`', 'x | y'])
  const [table] = parseMarkdown('| A | B |\n|---|---|\n| 1 | 2 |\n| 3 |')
  assert.equal(table.kind, 'table')
  assert.deepEqual(table.header, ['A', 'B'])
  assert.deepEqual(table.rows, [['1', '2'], ['3']])
})

test('lists nest by indentation and mix bullets and numbers', () => {
  const [list] = parseMarkdown('- Steps:\n  1. Open.\n  2. Read.\n- Expected:\n  - Shown\n    continued')
  assert.equal(list.kind, 'list')
  assert.equal(list.ordered, false)
  assert.equal(list.items.length, 2)
  assert.equal(list.items[0].children[0].ordered, true)
  assert.deepEqual(list.items[0].children[0].items.map((item) => item.text), ['Open.', 'Read.'])
  assert.equal(list.items[1].children[0].items[0].text, 'Shown continued')
})

test('paragraphs join lines and stop at the next block', () => {
  const blocks = parseMarkdown('One\ntwo\n- item\n\n---\nThree')
  assert.deepEqual(blocks.map((block) => block.kind), ['paragraph', 'list', 'rule', 'paragraph'])
  assert.equal(blocks[0].text, 'One two')
})

test('inline code, bold, italic and links', () => {
  assert.deepEqual(parseInline('Use `a_b` and **T** or *Guide* _x_ [Plan](TEST-PLAN.md#7-x) u-owner snake_case'), [
    { kind: 'text', text: 'Use ' }, { kind: 'code', text: 'a_b' }, { kind: 'text', text: ' and ' }, { kind: 'strong', text: 'T' },
    { kind: 'text', text: ' or ' }, { kind: 'em', text: 'Guide' }, { kind: 'text', text: ' ' }, { kind: 'em', text: 'x' }, { kind: 'text', text: ' ' },
    { kind: 'link', text: 'Plan', href: 'TEST-PLAN.md#7-x' }, { kind: 'text', text: ' u-owner snake_case' },
  ])
  assert.deepEqual(parseInline('2 × 8 = 16 h, a*b'), [{ kind: 'text', text: '2 × 8 = 16 h, a*b' }])
})

test('links resolve to bundled documents, anchors or https pages only', () => {
  const docs = ['TEST-PLAN.md', 'azure-devops-connection.md']
  assert.deepEqual(linkTarget('TEST-PLAN.md#7-requirements-coverage-matrix', docs), { kind: 'doc', doc: 'TEST-PLAN.md', anchor: '7-requirements-coverage-matrix' })
  assert.deepEqual(linkTarget('docs/azure-devops-connection.md', docs), { kind: 'doc', doc: 'azure-devops-connection.md', anchor: '' })
  assert.deepEqual(linkTarget('#top', docs), { kind: 'anchor', anchor: 'top' })
  assert.deepEqual(linkTarget('https://example.com/x', docs), { kind: 'external', href: 'https://example.com/x' })
  assert.deepEqual(linkTarget('javascript:alert(1)', docs), { kind: 'none' })
  assert.deepEqual(linkTarget('http://example.com', docs), { kind: 'none' })
})

test('every bundled document parses, and its in-app links point at existing sections', () => {
  const files = readdirSync(new URL('../docs/', import.meta.url)).filter((file) => file.endsWith('.md'))
  const parsed = Object.fromEntries(files.map((file) => [file, parseMarkdown(readFileSync(new URL(`../docs/${file}`, import.meta.url), 'utf8'))]))
  const bundled = readFileSync(new URL('../src/docs/index.ts', import.meta.url), 'utf8')
  for (const file of files) assert.ok(bundled.includes(`docs/${file}?raw`), `${file} is shown on the Documentation page`)
  const texts = (blocks) => blocks.flatMap((block) => block.kind === 'list' ? block.items.flatMap((item) => [item.text, ...texts(item.children)]) : block.kind === 'table' ? [...block.header, ...block.rows.flat()] : 'text' in block ? [block.text] : [])
  for (const [file, blocks] of Object.entries(parsed)) {
    assert.ok(blocks.some((block) => block.kind === 'heading' && block.level === 1), `${file} has a title`)
    for (const text of texts(blocks)) for (const part of parseInline(text)) {
      if (part.kind !== 'link') continue
      const target = linkTarget(part.href, files)
      if (target.kind === 'external' || !target.anchor) continue
      const doc = target.kind === 'doc' ? parsed[target.doc] : blocks
      assert.ok(doc.some((block) => block.kind === 'heading' && block.id === target.anchor), `${file}: ${part.href} points at a section`)
    }
  }
})
