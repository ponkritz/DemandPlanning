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

// AR-007 (KB-130, CON-140): a pattern is matched by a wildcard matcher whose time grows with the Title times the pattern,
// never by a regular expression (one `.*` per * backtracked catastrophically on a Title that does not fit). It gives the
// results of the former regex `^P(I)S$` (case ignored; spaces in the pattern match the one space between words of the
// Title): the release name starts as early as possible and, from there, ends as early as possible.
export const maxStars = 20
export interface CompiledPattern { prefix: string[]; inside: string[]; suffix: string[] }
// One UTF-16 unit as the former case-insensitive regex compared it (its upper case when that is one unit, not ASCII
// made from a non-ASCII letter).
const fold = (char: string) => { const upper = char.toUpperCase(); return upper.length === 1 && !(char.charCodeAt(0) >= 128 && upper.charCodeAt(0) < 128) ? upper : char }
const foldText = (text: string) => { let out = ''; for (let at = 0; at < text.length; at++) out += fold(text[at]); return out }
const fitsAt = (text: string, part: string, from: number) => from >= 0 && text.startsWith(part, from)
// The ends e where the wildcard pattern `parts` (the text between its *) matches text[start..e): every segment but the
// last at its earliest place; the last one ends anywhere it fits after them.
function endsFrom(text: string, parts: string[], start: number): number[] {
  if (!fitsAt(text, parts[0], start)) return []
  if (parts.length === 1) return [start + parts[0].length]
  let from = start + parts[0].length
  for (let index = 1; index < parts.length - 1; index++) { const found = text.indexOf(parts[index], from); if (found < 0) return []; from = found + parts[index].length }
  const last = parts[parts.length - 1], ends: number[] = []
  for (let begin = from; begin + last.length <= text.length; begin++) if (fitsAt(text, last, begin)) ends.push(begin + last.length)
  return ends
}
// For each start q, whether `parts` matches text[q..end): every segment but the first at its latest place.
function startsTo(text: string, parts: string[], end: number): boolean[] {
  const fits = new Array<boolean>(text.length + 1).fill(false)
  const first = parts[0]
  if (parts.length === 1) { if (fitsAt(text, first, end - first.length)) fits[end - first.length] = true; return fits }
  const last = parts[parts.length - 1]
  if (!fitsAt(text, last, end - last.length)) return fits
  let to = end - last.length
  for (let index = parts.length - 2; index >= 1; index--) { const part = parts[index]; if (to - part.length < 0) return fits; const found = text.lastIndexOf(part, to - part.length); if (found < 0) return fits; to = found }
  for (let begin = 0; begin + first.length <= to; begin++) if (fitsAt(text, first, begin)) fits[begin] = true
  return fits
}
// Where the release name is in a Title (its whitespace already one space, trimmed), or undefined when it does not fit.
export function matchCompiled(compiled: CompiledPattern, title: string): { start: number; end: number } | undefined {
  const text = foldText(title)
  const suffixFrom = startsTo(text, compiled.suffix, text.length)
  for (const start of endsFrom(text, compiled.prefix, 0)) for (const end of endsFrom(text, compiled.inside, start)) if (suffixFrom[end]) return { start, end }
  return undefined
}
// The pattern ready to match, or the reason it cannot be used.
export function compilePattern(pattern: string): { compiled: CompiledPattern } | { error: string } {
  const text = pattern.trim()
  if (!text) return { error: 'Type a pattern, e.g. {*_RELEASE}* or *Test Tools {*}.' }
  if (text.length > maxPatternLength) return { error: `A pattern is at most ${maxPatternLength} characters.` }
  if (text.split('*').length - 1 > maxStars) return { error: `A pattern has at most ${maxStars} *.` }
  const open = text.indexOf('{'), close = text.indexOf('}')
  if (open < 0 || close < open || text.indexOf('{', open + 1) >= 0 || text.indexOf('}', close + 1) >= 0) return { error: 'Mark the release name once with { and }, e.g. {*_RELEASE}* or *Test Tools {*}.' }
  const inside = text.slice(open + 1, close)
  if (!inside.trim()) return { error: 'Put * or text inside { } for the release name.' }
  const parts = (part: string) => part.split('*').map((segment) => foldText(segment.replace(/\s+/g, ' ')))
  return { compiled: { prefix: parts(text.slice(0, open)), inside: parts(inside), suffix: parts(text.slice(close + 1)) } }
}

export interface PatternMatch { group: string; name: string; document: string }
// The release of a Title by the first pattern that fits (a name made only of spaces and punctuation does not count).
export function matchPatterns(title: string, patterns: NamingPattern[]): PatternMatch | undefined {
  const text = title.replace(/\s+/g, ' ').trim()
  for (const entry of patterns) {
    const compiled = compilePattern(entry.pattern)
    if ('error' in compiled) continue
    const found = matchCompiled(compiled.compiled, text)
    const release = found ? text.slice(found.start, found.end) : ''
    const name = release.replace(/^[\s|:–-]+|[\s|:–-]+$/g, '').trim()
    if (!found || !/[\p{L}\p{N}]/u.test(name)) continue
    // As before: the document is the Title without the name's text where it first occurs.
    const at = text.indexOf(release)
    const document = `${text.slice(0, at)}${text.slice(at + release.length)}`.replace(/^[\s|:_–-]+|[\s|:_–-]+$/g, '').trim()
    return { group: entry.label.trim(), name, document }
  }
  return undefined
}

// Read from the shared settings: per stream (name up to 60 characters), at most 10 patterns with a label up to 60 and a
// pattern that compiles (at most 200 characters and 20 *); an empty list is kept (it turns the stream's patterns off).
export function normalizeNamingPatterns(value: unknown): NamingPatterns | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const result: NamingPatterns = {}
  for (const [stream, list] of Object.entries(value as Record<string, unknown>).slice(0, 30)) {
    const name = stream.trim().slice(0, 60)
    if (!name || !Array.isArray(list)) continue
    result[name] = list.slice(0, maxPatterns).flatMap((raw: unknown) => {
      const entry = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
      const pattern = typeof entry.pattern === 'string' ? entry.pattern.trim() : ''
      return pattern && !('error' in compilePattern(pattern)) ? [{ label: typeof entry.label === 'string' ? entry.label.trim().slice(0, 60) : '', pattern }] : []
    })
  }
  return Object.keys(result).length ? result : undefined
}
// The patterns of a stream: the saved ones, else the built-in ones of that stream, else none.
export const patternsFor = (saved: NamingPatterns | undefined, stream: string) => saved?.[stream] ?? defaultNamingPatterns[stream] ?? []
