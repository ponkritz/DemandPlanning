// A small Markdown reader for the documents shown in the app (docs/*.md): headings, paragraphs, nested bullet and
// numbered lists, tables, horizontal rules and inline code, bold, italic and links. It returns plain data that the
// Markdown component renders as React elements, so no HTML from the documents is ever injected.
export type Inline = { kind: 'text' | 'code' | 'strong' | 'em'; text: string } | { kind: 'link'; text: string; href: string }
export interface ListItem { text: string; children: ListBlock[] }
export interface ListBlock { kind: 'list'; ordered: boolean; items: ListItem[] }
export type Block =
  | { kind: 'heading'; level: number; text: string; id: string }
  | { kind: 'paragraph'; text: string }
  | ListBlock
  | { kind: 'table'; header: string[]; rows: string[][] }
  | { kind: 'rule' }

// Heading anchors as GitHub makes them, so links such as TEST-PLAN.md#7-requirements-coverage-matrix work in the app too.
export function slug(text: string) {
  return plainText(text).trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-')
}
export const plainText = (text: string) => parseInline(text).map((part) => part.text).join('')

const listLine = /^(\s*)([-*]|\d+\.)\s+(.*)$/
const isTableLine = (line: string) => line.trim().startsWith('|')
const isSeparator = (line: string) => /^\s*\|?(\s*:?-{3,}:?\s*\|)+\s*:?-*:?\s*\|?\s*$/.test(line)
// Cells split on "|" that is not escaped as "\|"; the escaped bar stays as text.
export function tableCells(line: string) {
  const inner = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return inner.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, '|'))
}

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  const used = new Map<string, number>()
  let index = 0
  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim()) { index += 1; continue }
    const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line)
    if (heading) {
      const base = slug(heading[2]) || 'section', count = used.get(base) ?? 0
      used.set(base, count + 1)
      blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2], id: count ? `${base}-${count}` : base })
      index += 1; continue
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { blocks.push({ kind: 'rule' }); index += 1; continue }
    if (isTableLine(line) && index + 1 < lines.length && isSeparator(lines[index + 1])) {
      const header = tableCells(line), rows: string[][] = []
      index += 2
      while (index < lines.length && isTableLine(lines[index])) { rows.push(tableCells(lines[index])); index += 1 }
      blocks.push({ kind: 'table', header, rows }); continue
    }
    if (listLine.test(line)) {
      const start = index
      while (index < lines.length && lines[index].trim() && (listLine.test(lines[index]) || /^\s+\S/.test(lines[index]))) index += 1
      blocks.push(parseList(lines.slice(start, index))); continue
    }
    const text: string[] = []
    while (index < lines.length && lines[index].trim() && !/^#{1,6}\s/.test(lines[index]) && !listLine.test(lines[index]) && !(isTableLine(lines[index]) && isSeparator(lines[index + 1] ?? ''))) { text.push(lines[index].trim()); index += 1 }
    blocks.push({ kind: 'paragraph', text: text.join(' ') })
  }
  return blocks
}

// Items nest by indentation: a line indented deeper than the current item's marker starts a child list; an indented
// line without a marker continues the item's text.
function parseList(lines: string[]): ListBlock {
  type Entry = { indent: number; ordered: boolean; text: string }
  const entries: Entry[] = []
  for (const line of lines) {
    const match = listLine.exec(line)
    if (match) entries.push({ indent: match[1].replace(/\t/g, '    ').length, ordered: /\d/.test(match[2]), text: match[3].trim() })
    else if (entries.length) entries[entries.length - 1].text += ` ${line.trim()}`
  }
  let position = 0
  const build = (indent: number): ListBlock => {
    const list: ListBlock = { kind: 'list', ordered: entries[position].ordered, items: [] }
    while (position < entries.length && entries[position].indent >= indent) {
      const entry = entries[position]
      if (entry.indent > indent && list.items.length) { list.items[list.items.length - 1].children.push(build(entry.indent)); continue }
      list.items.push({ text: entry.text, children: [] })
      position += 1
    }
    return list
  }
  return build(entries[0]?.indent ?? 0)
}

// Inline: `code`, **bold**, *italic* or _italic_ (word-bounded), [text](href) and "\|" escapes.
export function parseInline(text: string): Inline[] {
  const parts: Inline[] = []
  const pattern = /`([^`]+)`|\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)|(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])|(?<!\w)_(?!\s)(.+?)(?<!\s)_(?!\w)/g
  let last = 0
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) parts.push({ kind: 'text', text: text.slice(last, match.index) })
    if (match[1] != null) parts.push({ kind: 'code', text: match[1] })
    else if (match[2] != null) parts.push({ kind: 'strong', text: match[2] })
    else if (match[3] != null) parts.push({ kind: 'link', text: match[3], href: match[4] })
    else parts.push({ kind: 'em', text: match[5] ?? match[6] })
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) })
  return parts.map((part) => part.kind === 'code' ? part : { ...part, text: part.text.replace(/\\\|/g, '|') })
}

// Where a link in a document goes: another document in the app (by file name, with an optional anchor), an anchor in
// this document, or an external https page. Anything else is shown as text.
export type LinkTarget = { kind: 'doc'; doc: string; anchor: string } | { kind: 'anchor'; anchor: string } | { kind: 'external'; href: string } | { kind: 'none' }
export function linkTarget(href: string, docs: string[]): LinkTarget {
  if (href.startsWith('#')) return { kind: 'anchor', anchor: href.slice(1) }
  if (/^https:\/\//i.test(href)) return { kind: 'external', href }
  const [path, anchor = ''] = href.split('#')
  const file = path.split('/').pop() ?? ''
  if (docs.includes(file)) return { kind: 'doc', doc: file, anchor }
  return { kind: 'none' }
}
