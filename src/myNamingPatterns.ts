import { normalizeNamingPatterns, type NamingPattern, type NamingPatterns } from './namingPatterns.ts'

// QV-60: my own release naming patterns for IOCC, Content and Tool Validations (never DP or CP, whose release naming
// is locked to the Tool Owner, CON-93), kept on this computer only. Where I set a stream's patterns they are used for
// me instead of the shared (or built-in) ones; everyone else, and every stream I did not set, is unchanged.
export const personalPatternStreams = ['IOCC', 'Content', 'Tool Validations'] as const
const storageKey = 'demand-planning-my-naming-patterns-v1'
let mine: NamingPatterns = {}
let version = 0
const listeners = new Set<() => void>()

function clean(value: unknown): NamingPatterns {
  const all = normalizeNamingPatterns(value) ?? {}
  return Object.fromEntries(Object.entries(all).filter(([stream]) => (personalPatternStreams as readonly string[]).includes(stream)))
}
export function loadMyNamingPatterns(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage) {
  try { mine = clean(JSON.parse(storage?.getItem(storageKey) ?? '{}')) } catch { mine = {} }
  version += 1
  return mine
}
loadMyNamingPatterns()
export const myNamingPatterns = () => mine
export const myPatternsVersion = () => version
export const myPatternsFor = (stream: string): NamingPattern[] | undefined => mine[stream]
// Sets (or, with undefined, removes) my patterns of one stream; refused for streams other than IOCC, Content, Tool Validations.
export function setMyNamingPatterns(stream: string, patterns: NamingPattern[] | undefined, storage: Pick<Storage, 'setItem'> | undefined = globalThis.localStorage) {
  if (!(personalPatternStreams as readonly string[]).includes(stream)) throw new Error(`Your own naming patterns are for IOCC, Content and Tool Validations only, not ${stream}.`)
  const next = { ...mine }
  if (patterns) next[stream] = patterns.map((row) => ({ label: row.label.trim(), pattern: row.pattern.trim() })); else delete next[stream]
  mine = clean(next)
  version += 1
  try { storage?.setItem(storageKey, JSON.stringify(mine)) } catch { /* this visit only */ }
  for (const listener of listeners) listener()
}
export function subscribeMyPatterns(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } }
