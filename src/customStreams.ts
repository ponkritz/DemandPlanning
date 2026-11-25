import { dataSets, defaultStreams, sameStream, type ReleaseRule, type StreamDef } from './streams.ts'

// STR-01…06: streams of our own, added by the Tool Owner (streams.manage, CON-93) without a release of the app. They are
// kept in the shared setup in Git next to the stream mapping (azure-views.json), in a file of their own
// (custom-streams.json), so that an older app that rewrites azure-views.json never drops them. Each names its source
// (an Azure DevOps query connection, or a Windchill export, found by the stream's name as the built-in ones are) and
// one of the release rules the app already has, offered by the built-in stream that uses it.
export const customStreamsFile = 'custom-streams.json'
const kind = 'custom-streams'
export const maxCustomStreams = 30
export const maxAliases = 5
export const maxEpics = 100

// The rules a custom stream may use (STR-01), by the built-in stream that has it. CP's release-folder tree rule is not
// offered: it needs CP's tree query and its second names connection (cpReporting).
export type CustomRule = 'dp' | 'iocc' | 'title' | 'tool' | 'windchill' | 'windchill-project'
export interface RuleOption { key: CustomRule; source: StreamDef['source']; rule: ReleaseRule; project?: boolean; label: string; example: string; gives: string; bulk: boolean; counts: string; epics: boolean; fuzzy: boolean }
export const ruleOptions: RuleOption[] = [
  { key: 'dp', source: 'azure', rule: 'dp', label: 'Like DP — release from Area/Iteration path', example: 'Area Path …\\DoseNav, Iteration Path …\\2.1.0\\Sprint 3 → DoseNav 2.1.0', gives: 'One release per Area Path name and Iteration Path number; its documents under it.', bulk: false, counts: 'Releases in the month', epics: true, fuzzy: true },
  { key: 'iocc', source: 'azure', rule: 'iocc', label: 'Like IOCC — grouped by area, name from title', example: 'Area Path …\\IOCC\\Mobile, Title “Mobile Release 2.3.1 - Notes” → Mobile: Mobile 2.3.1', gives: 'Type of Release from the Area Path segment after the stream’s area, name and number from the Title; Completed and Supported from the signed Release Plan, Release Notes and Verification Report.', bulk: true, counts: 'Releases in the month, Completed, Supported', epics: true, fuzzy: true },
  { key: 'title', source: 'azure', rule: 'title', label: 'Like Content — each document is a release by its title', example: 'Title “Label Set ABC_RELEASE v4” → release “Label Set ABC_RELEASE v4”', gives: 'Every document is a release named by its Title (or by the stream’s naming patterns).', bulk: true, counts: 'Releases in the month', epics: true, fuzzy: false },
  { key: 'tool', source: 'azure', rule: 'tool', label: 'Like Tool Validations — one per tool', example: 'Area Path …\\Tools\\Minitab, Title “Minitab 21 Validation Report” → Minitab', gives: 'One entry per tool (its Area Path folder, else the Title before its version or document word), whatever the number of its documents.', bulk: false, counts: 'Releases in the month, Supported', epics: false, fuzzy: false },
  { key: 'windchill', source: 'windchill', rule: 'path', label: 'Like S&S IT — Windchill path', example: 'Location /Products/Service Tool/Release 3.1 → Service Tool, Release 3.1', gives: 'Releases from the Windchill export’s Location and document names.', bulk: false, counts: 'Releases in the month, Supported', epics: false, fuzzy: false },
  { key: 'windchill-project', source: 'windchill', rule: 'path', project: true, label: 'Like ECP — Windchill projects', example: 'Location /Parent/123456 Patient Monitor/Phase → project 123456 Patient Monitor', gives: 'Projects “<number> <name>” from the Location’s project folder (2nd by default); each export named after the stream on its own.', bulk: false, counts: 'Projects in the month, Supported', epics: false, fuzzy: false },
]
export const ruleOf = (stream: Pick<StreamDef, 'source' | 'rule' | 'project'>): RuleOption | undefined => ruleOptions.find((option) => option.source === stream.source && option.rule === stream.rule && Boolean(option.project) === Boolean(stream.project))

// One custom stream as kept in the file: name, source, rule (by key), fuzzy Feature matching, aliases (earlier names: a
// connection or export named after one still belongs to it — a rename keeps the old name as one), Epics.
export interface CustomStreamEntry { name: string; rule: CustomRule; fuzzy: boolean; aliases?: string[]; epics?: number[] }
export interface CustomStreamsFile { schema: 1; kind: typeof kind; streams: CustomStreamEntry[] }

const reserved = () => [...defaultStreams.flatMap((stream) => [stream.name, ...(stream.aliases ?? [])]), ...dataSets.map((set) => set.name), 'Time Writing', 'QMS-0025', 'BRITE']
const cleanName = (value: unknown) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
// The checks of one stream against the others (STR-05): a name of 2 to 40 characters with a letter or digit, not a
// built-in stream, data set or other reserved name (nor one of their earlier names), not another custom stream's name
// or alias; a known rule. Returns the problem, '' when it is fine.
export function customStreamProblem(entry: { name: unknown; rule: unknown; aliases?: unknown }, others: Pick<CustomStreamEntry, 'name' | 'aliases'>[] = []): string {
  const name = cleanName(entry.name)
  if (!name) return 'Give the stream a name.'
  if (name.length < 2 || name.length > 40 || !/[a-z0-9]/i.test(name)) return `“${name}”: a stream name has 2 to 40 characters with a letter or digit.`
  const clash = reserved().find((known) => sameStream(known, name))
  if (clash) return `“${name}” is the name of the built-in ${dataSets.some((set) => set.name === clash) ? 'data set' : 'stream or page'} “${clash}”: choose another name.`
  const rule = typeof entry.rule === 'string' ? entry.rule : ''
  if (!ruleOptions.some((option) => option.key === rule)) return rule === 'cp' ? `“${name}”: CP’s release-folder tree rule cannot be used by a custom stream; choose another rule.` : `“${name}”: unknown release rule “${String(entry.rule ?? '')}”. The rules are ${ruleOptions.map((option) => option.key).join(', ')}.`
  const aliases = Array.isArray(entry.aliases) ? entry.aliases.map(cleanName).filter(Boolean) : []
  for (const alias of aliases) {
    const known = reserved().find((other) => sameStream(other, alias))
    if (known) return `“${name}”: the earlier name “${alias}” is the built-in “${known}”.`
  }
  for (const other of others) {
    const names = [other.name, ...(other.aliases ?? [])]
    if ([name, ...aliases].some((mine) => names.some((theirs) => sameStream(mine, theirs)))) return `“${name}” clashes with the custom stream “${other.name}” (its name or an earlier name).`
  }
  return ''
}

// A stream from the file, checked and cleaned: aliases (up to 5, 2…40 characters, not the name itself) and Epics (up to
// 100 positive IDs) where its rule offers them; fuzzy only where the rule allows it.
function clean(raw: Record<string, unknown>): CustomStreamEntry {
  const name = cleanName(raw.name), rule = raw.rule as CustomRule, option = ruleOptions.find((entry) => entry.key === rule)!
  const aliases = (Array.isArray(raw.aliases) ? raw.aliases : []).map(cleanName).filter((alias, index, all) => alias.length >= 2 && alias.length <= 40 && !sameStream(alias, name) && all.findIndex((other) => sameStream(other, alias)) === index).slice(0, maxAliases)
  const epics = option.epics ? [...new Set((Array.isArray(raw.epics) ? raw.epics : []).map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))].slice(0, maxEpics) : []
  return { name, rule, fuzzy: option.source === 'azure' ? raw.fuzzy === true : false, ...(aliases.length ? { aliases } : {}), ...(epics.length ? { epics } : {}) }
}

// STR-01: the last good file read from Git, kept in this browser (useCustomStreams), so the custom streams are there at
// the next start before Git answers and while it cannot be read.
export const customStreamsCacheKey = 'demand-planning-custom-streams-v1'
export function cachedCustomStreams(storage: Pick<Storage, 'getItem'> = localStorage): CustomStreamEntry[] { try { return parseCustomStreams(storage.getItem(customStreamsCacheKey)).streams } catch { return [] } }
export function rememberCustomStreams(text: string | null, storage: Pick<Storage, 'setItem' | 'removeItem'> = localStorage) { try { if (text) storage.setItem(customStreamsCacheKey, text); else storage.removeItem(customStreamsCacheKey) } catch { /* this visit only */ } }
// Reads the file and keeps it as the last good one. GIT-25 (KB-92): a read that fails — the repository cannot be read,
// the file is broken — throws before anything is kept or removed, so the cached streams stay; only a file that is
// really missing in a readable repository (text null) clears them.
export async function readCustomStreamsInto(read: () => Promise<{ text: string | null; sha: string | null }>, storage: Pick<Storage, 'setItem' | 'removeItem'> = localStorage) {
  const file = await read()
  const parsed = parseCustomStreams(file.text)
  rememberCustomStreams(file.text, storage)
  return { ...parsed, sha: file.sha }
}

// STR-05: the file read from Git. A file that is not JSON or not a custom-streams file is refused as a whole (the
// last good list stays in use); each stream is checked on its own: an unknown rule, a clash with a built-in stream or
// with an earlier custom stream refuses that stream, with the reason, and the others are used.
export function parseCustomStreams(text: string | null | undefined): { streams: CustomStreamEntry[]; refused: { name: string; reason: string }[] } {
  if (text == null || !text.trim()) return { streams: [], refused: [] }
  let raw: unknown
  try { raw = JSON.parse(text) } catch { throw new Error(`${customStreamsFile} in Git is not valid JSON: the custom streams were not changed.`) }
  const file = raw as Partial<CustomStreamsFile>
  if (!file || typeof file !== 'object' || file.schema !== 1 || file.kind !== kind || !Array.isArray(file.streams)) throw new Error(`${customStreamsFile} in Git is not a custom streams file (schema 1): the custom streams were not changed.`)
  const streams: CustomStreamEntry[] = [], refused: { name: string; reason: string }[] = []
  for (const entry of file.streams.slice(0, maxCustomStreams * 2)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) { refused.push({ name: '(unnamed)', reason: 'Not a stream: ignored.' }); continue }
    const record = entry as unknown as Record<string, unknown>
    const problem = customStreamProblem({ name: record.name, rule: record.rule, aliases: record.aliases }, streams)
    if (problem) { refused.push({ name: cleanName(record.name) || '(unnamed)', reason: problem }); continue }
    if (streams.length >= maxCustomStreams) { refused.push({ name: cleanName(record.name), reason: `At most ${maxCustomStreams} custom streams: ignored.` }); continue }
    streams.push(clean(record))
  }
  return { streams, refused }
}
export const serializeCustomStreams = (streams: CustomStreamEntry[]) => `${JSON.stringify({ schema: 1, kind, streams: streams.map((entry) => clean(entry as unknown as Record<string, unknown>)) } satisfies CustomStreamsFile, null, 2)}\n`

// The stream definitions the app works with (streams.ts), from the file's entries.
export function customStreamDefs(entries: CustomStreamEntry[]): StreamDef[] {
  return entries.flatMap((entry) => {
    const option = ruleOptions.find((rule) => rule.key === entry.rule)
    if (!option) return []
    return [{ name: entry.name, source: option.source, rule: option.rule, fuzzy: entry.fuzzy, custom: true, ...(option.project ? { project: true } : {}), ...(entry.aliases?.length ? { aliases: entry.aliases } : {}), ...(entry.epics?.length ? { epics: entry.epics } : {}) }]
  })
}

// Add, change (rename) and remove (STR-01, STR-06): each returns the new list or throws the problem. A rename keeps
// the old name as an earlier name (alias), so the connection or export named after it, and its data, stay with the
// stream. Removing a stream takes only its definition: its connection, export and data are kept (then under Other views).
export function addCustomStream(list: CustomStreamEntry[], entry: CustomStreamEntry): CustomStreamEntry[] {
  if (list.length >= maxCustomStreams) throw new Error(`At most ${maxCustomStreams} custom streams.`)
  const problem = customStreamProblem(entry, list)
  if (problem) throw new Error(problem)
  return [...list, clean(entry as unknown as Record<string, unknown>)]
}
export function changeCustomStream(list: CustomStreamEntry[], name: string, entry: CustomStreamEntry): CustomStreamEntry[] {
  const at = list.findIndex((item) => sameStream(item.name, name))
  if (at < 0) throw new Error(`“${name}” is not a custom stream.`)
  const old = list[at], renamed = !sameStream(old.name, entry.name)
  const aliases = renamed ? [old.name, ...(entry.aliases ?? [])] : entry.aliases
  const next = { ...entry, ...(aliases?.length ? { aliases } : {}) }
  const problem = customStreamProblem(next, list.filter((_, index) => index !== at))
  if (problem) throw new Error(problem)
  return list.map((item, index) => index === at ? clean(next as unknown as Record<string, unknown>) : item)
}
export const removeCustomStream = (list: CustomStreamEntry[], name: string) => list.filter((item) => !sameStream(item.name, name))
