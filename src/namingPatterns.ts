// QV-55: release naming patterns per stream, editable in Settings and shared in Git with the release-source settings.
// A pattern is matched against a document's Title, ignoring case: * is any text, {…} marks the release name (it may
// hold * and text, e.g. {*_RELEASE}), spaces match any spaces. The first pattern that fits names the release; the label
// (optional) is its group, e.g. "Conformance Verification". A Title no pattern fits keeps the stream's own rule.
export interface NamingPattern { label: string; pattern: string }
export type NamingPatterns = Record<string, NamingPattern[]>

export const defaultNamingPatterns: NamingPatterns = {
  Content: [{ label: '', pattern: '{*_RELEASE}*' }],
  IOCC: [{ label: 'Conformance Verification', pattern: '*Conformance Verification {*}' }, { label: 'Test Tools', pattern: '*Test Tools {*}' }],
}
export const maxPatterns = 10, maxPatternLength = 200

const escape = (text: string) => text.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
const literal = (text: string, lazy: boolean) => text.split('*').map((part) => escape(part).replace(/\s+/g, '\\s+')).join(lazy ? '.*?' : '.*')
// The pattern as a regular expression, or the reason it cannot be used.
export function compilePattern(pattern: string): { regex: RegExp } | { error: string } {
  const text = pattern.trim()
  if (!text) return { error: 'Type a pattern, e.g. {*_RELEASE}* or *Test Tools {*}.' }
  if (text.length > maxPatternLength) return { error: `A pattern is at most ${maxPatternLength} characters.` }
  const open = text.indexOf('{'), close = text.indexOf('}')
  if (open < 0 || close < open || text.indexOf('{', open + 1) >= 0 || text.indexOf('}', close + 1) >= 0) return { error: 'Mark the release name once with { and }, e.g. {*_RELEASE}* or *Test Tools {*}.' }
  const inside = text.slice(open + 1, close)
  if (!inside.trim()) return { error: 'Put * or text inside { } for the release name.' }
  return { regex: new RegExp(`^\\s*${literal(text.slice(0, open), true)}(${literal(inside, true)})${literal(text.slice(close + 1), false)}\\s*$`, 'i') }
}

export interface PatternMatch { group: string; name: string; document: string }
// The release of a Title by the first pattern that fits (a name made only of spaces and punctuation does not count).
export function matchPatterns(title: string, patterns: NamingPattern[]): PatternMatch | undefined {
  const text = title.replace(/\s+/g, ' ').trim()
  for (const entry of patterns) {
    const compiled = compilePattern(entry.pattern)
    if (!('regex' in compiled)) continue
    const found = compiled.regex.exec(text)
    const name = found?.[1]?.replace(/^[\s|:–-]+|[\s|:–-]+$/g, '').trim() ?? ''
    if (!found || !/[\p{L}\p{N}]/u.test(name)) continue
    const at = (found.index ?? 0) + found[0].indexOf(found[1])
    const document = `${text.slice(0, at)}${text.slice(at + found[1].length)}`.replace(/^[\s|:_–-]+|[\s|:_–-]+$/g, '').trim()
    return { group: entry.label.trim(), name, document }
  }
  return undefined
}

// Read from the shared settings: per stream (name up to 60 characters), at most 10 patterns with a label up to 60 and a
// pattern that compiles; an empty list is kept (it turns the stream's patterns off).
export function normalizeNamingPatterns(value: unknown): NamingPatterns | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const result: NamingPatterns = {}
  for (const [stream, list] of Object.entries(value as Record<string, unknown>).slice(0, 30)) {
    const name = stream.trim().slice(0, 60)
    if (!name || !Array.isArray(list)) continue
    result[name] = list.slice(0, maxPatterns).flatMap((raw: unknown) => {
      const entry = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
      const pattern = typeof entry.pattern === 'string' ? entry.pattern.trim() : ''
      return pattern && 'regex' in compilePattern(pattern) ? [{ label: typeof entry.label === 'string' ? entry.label.trim().slice(0, 60) : '', pattern }] : []
    })
  }
  return Object.keys(result).length ? result : undefined
}
// The patterns of a stream: the saved ones, else the built-in ones of that stream, else none.
export const patternsFor = (saved: NamingPatterns | undefined, stream: string) => saved?.[stream] ?? defaultNamingPatterns[stream] ?? []
