// QV-66, QV-67: Pulse Check's Streams filter — the release streams not counted on Pulse Check. Kept as a list of the
// excluded stream names (so a stream added later is counted), compared case-insensitively; a name no stream has any
// more is ignored. The team default is an entry of the shared views defaults (personal-views-defaults.json), each
// person's own choice an entry of their personal views (UI-23), both under the key below.
export const pulseStreamsKey = 'pulse-streams'
export interface PulseStreamsChoice { excluded: string[] }

const norm = (name: string) => name.trim().toLowerCase()

// Read from Git or the browser like any other input: only a list of short names is kept (at most 200, each once).
export function readPulseStreams(value: unknown): PulseStreamsChoice | undefined {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { excluded?: unknown }).excluded)) return undefined
  const seen = new Set<string>(), excluded: string[] = []
  for (const entry of (value as { excluded: unknown[] }).excluded) {
    if (typeof entry !== 'string') continue
    const name = entry.trim().slice(0, 120)
    if (!name || seen.has(norm(name))) continue
    seen.add(norm(name)); excluded.push(name)
    if (excluded.length >= 200) break
  }
  return { excluded }
}

// Every stream name once (case-insensitive, first spelling kept), in the order given.
export function streamNames(...lists: string[][]): string[] {
  const seen = new Set<string>(), names: string[] = []
  for (const list of lists) for (const name of list) { const clean = name.trim(); if (clean && !seen.has(norm(clean))) { seen.add(norm(clean)); names.push(clean) } }
  return names
}

export function isCounted(excluded: string[], name: string) {
  const key = norm(name)
  return !excluded.some((entry) => norm(entry) === key)
}

// The streams of the list that are not counted, in the list's spelling (unknown names ignored).
export const notCounted = (excluded: string[], names: string[]) => streamNames(names).filter((name) => !isCounted(excluded, name))

// Only the counted entries of a list (each period uses the same exclusion, so the change compares like with like).
export const countedOnly = <T extends { name: string }>(list: T[], excluded: string[]) => list.filter((entry) => isCounted(excluded, entry.name))

// The filter's ticked values in the known streams' spelling, and a change that keeps the names not offered now (e.g. a
// custom stream not read yet), so they are not dropped by a change to another stream.
export const chosenOf = (excluded: string[], names: string[]) => names.filter((name) => !isCounted(excluded, name))
export function withChosen(excluded: string[], names: string[], chosen: string[]): PulseStreamsChoice {
  const unknown = excluded.filter((entry) => isCounted(names, entry))
  return readPulseStreams({ excluded: [...chosen, ...unknown] }) ?? { excluded: [] }
}

// The sentence for ⓘ and exports: "Not counted (Streams filter): ECP, S&S IT." or '' when every stream counts.
export function notCountedNote(excluded: string[], names: string[]) {
  const list = notCounted(excluded, names)
  return list.length ? `Not counted (Streams filter): ${list.join(', ')}.` : ''
}
