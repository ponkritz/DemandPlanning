import type { AzureConnectionProfileSummary } from './azureCredentials.ts'

// The release streams the team works with, in this order. DP, CP, IOCC, Content and Tool Validations come from an
// Azure DevOps connection with a query (connection named like the stream); S&S IT and ECP from a Windchill export. Release Details and Pulse Check show exactly these. Each stream reads its releases
// with its own rule (see releasePath): DP — release name from the Area Path, number from the Iteration Path; IOCC —
// grouped by the Area Path segment after "IOCC", release name from the document Title; Tool Validations — one entry
// per tool (the tool's Area Path folder, else the Title before its version or document word), whatever the number of
// its documents; CP — Release containers of the release-folder tree query, Supported / Completed from QA/QE signatures
// (cpReporting); the others keep the general path rule. DP and IOCC releases are matched to QMS-0025 Features by a
// fuzzy match with a percentage.
// title (QV-52): every document is a release named by its Title (Content); no name and number from the paths.
export type ReleaseRule = 'path' | 'dp' | 'iocc' | 'tool' | 'cp' | 'title'
// aliases: earlier names of the stream; an export or connection named after one still belongs to it (QRE → ECP).
// custom (STR-01): a stream a Tool Owner added in the shared setup (custom-streams.json), not built in; epics: the
// QMS-0025 Epics its releases are matched in (STR-04; [] or none = the whole board).
export interface StreamDef { name: string; source: 'azure' | 'windchill'; rule: ReleaseRule; fuzzy: boolean; project?: boolean; aliases?: string[]; custom?: boolean; epics?: number[] }
export const defaultStreams: StreamDef[] = [
  { name: 'DP', source: 'azure', rule: 'dp', fuzzy: true },
  { name: 'CP', source: 'azure', rule: 'cp', fuzzy: true },
  { name: 'IOCC', source: 'azure', rule: 'iocc', fuzzy: true },
  { name: 'Content', source: 'azure', rule: 'title', fuzzy: false },
  { name: 'Tool Validations', source: 'azure', rule: 'tool', fuzzy: false },
  { name: 'S&S IT', source: 'windchill', rule: 'path', fuzzy: false },
  // ECP (formerly QRE): projects "<number> <name>" from the Location's second folder (CON-83).
  { name: 'ECP', source: 'windchill', rule: 'path', fuzzy: false, project: true, aliases: ['QRE'] },
]
export const defaultMatchThreshold = 80

// STR-02: the streams of the app — the built-in ones above, then the custom ones from the shared setup in Git
// (custom-streams.json, read by useCustomStreams), in the order they were added. Everything that lists or looks up
// streams goes through allStreams(), so a custom stream gets its menu entry, Release page, Pulse Check line, counts and
// mapping row without a code change. The custom list is kept here (one per app) so that plain functions see it too;
// streamsVersion() changes with it, for caches and React (subscribeStreams).
let customList: StreamDef[] = []
let version = 0
const listeners = new Set<() => void>()
export const customStreams = () => customList
export const allStreams = (custom: StreamDef[] = customList): StreamDef[] => custom.length ? [...defaultStreams, ...custom] : defaultStreams
export const streamsVersion = () => version
export function subscribeStreams(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } }
export function setCustomStreams(list: StreamDef[]) {
  if (JSON.stringify(list) === JSON.stringify(customList)) return
  customList = list.map((stream) => ({ ...stream, custom: true }))
  version += 1
  for (const listener of [...listeners]) listener()
}

const key = (text: string | undefined) => (text ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '')
const tokens = (text: string | undefined) => (text ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
export const sameStream = (a: string | undefined, b: string | undefined) => Boolean(key(a)) && key(a) === key(b)
// A connection or export belongs to a stream when its name is the stream's name, or starts with it as whole words —
// e.g. "DP [Completed Releases]", "DP_Completed" or "S&S IT export" — ignoring case and punctuation.
export function namesStream(name: string | undefined, stream: string) {
  if (sameStream(name, stream)) return true
  const words = tokens(name), wanted = tokens(stream)
  return wanted.length > 0 && words.length > wanted.length && wanted.every((word, index) => words[index] === word)
}
// STR-03: the Area Path names a custom stream "Like IOCC" groups after (its own name and earlier names); built-in
// streams keep their own rule (IOCC: the "IOCC" segment).
// The same list for the same stream, so that tables keyed on it are not worked out again on every render.
const areas = new WeakMap<StreamDef, string[]>()
export function streamArea(stream: StreamDef | undefined) {
  if (!stream?.custom || stream.rule !== 'iocc') return undefined
  let area = areas.get(stream)
  if (!area) { area = [stream.name, ...(stream.aliases ?? [])]; areas.set(stream, area) }
  return area
}
export const streamNamed = (name: string | undefined) => allStreams().find((stream) => sameStream(stream.name, name))
// The stream a name (a connection's view name or name, an export's name) belongs to: the stream whose name — or an
// earlier name (alias) — it is or starts with as whole words; where several fit, the longest name wins, so a custom
// stream "DP Labels" keeps its connection "DP Labels" from DP (STR-02).
export function streamNamedBy(names: (string | undefined)[], source?: StreamDef['source'], streams: StreamDef[] = allStreams()): StreamDef | undefined {
  let best: StreamDef | undefined, bestLength = 0
  for (const stream of streams) {
    if (source && stream.source !== source) continue
    for (const known of [stream.name, ...(stream.aliases ?? [])]) {
      const length = tokens(known).length
      if (length > bestLength && names.some((name) => namesStream(name, known))) { best = stream; bestLength = length }
    }
  }
  return best
}

// The connection of an Azure stream: a non-Time-Writing connection whose view name (or name) is the stream's name.
// CP's is its release-folder tree: the CP connection with a tree / links query (FROM WorkItemLinks), else the first one.
export function profileForStream<P extends AzureConnectionProfileSummary>(stream: StreamDef, profiles: P[]): P | undefined {
  // The shared setup's connection (from Git) comes before one set up only here, so the admin's mapping is used.
  const found = profilesForStream(stream, profiles), all = [...found.filter((profile) => profile.shared), ...found.filter((profile) => !profile.shared)]
  return stream.rule === 'cp' ? all.find((profile) => /\bFROM\s+WorkItemLinks\b/i.test(profile.query ?? '')) ?? all[0] : all[0]
}
// Every connection of an Azure stream, in the connections' order; CP's others (e.g. "CP Releases") can enrich the
// release names (cpReporting).
export function profilesForStream<P extends AzureConnectionProfileSummary>(stream: StreamDef, profiles: P[]): P[] {
  if (stream.source !== 'azure') return []
  return profiles.filter((profile) => streamOfProfile(profile)?.name === stream.name)
}
// The stream a connection belongs to, if any.
export const streamOfProfile = (profile: Pick<AzureConnectionProfileSummary, 'viewName' | 'reason' | 'role' | 'mine'>) => profile.role === 'time-tracking' || profile.mine ? undefined : streamNamedBy([profile.viewName, profile.reason], 'azure')
// The Windchill export of a Windchill stream, by its name.
export function exportForStream<T extends { name: string; exportFile?: string }>(stream: StreamDef, views: T[]) {
  if (stream.source !== 'windchill') return undefined
  const own = views.filter((view) => view.exportFile && streamNamedBy([view.name], 'windchill')?.name === stream.name)
  return own.find((view) => namesStream(view.name, stream.name)) ?? own[0]
}

// Data sets that feed a stream without being one: DP combines the Pedestal release register (DHP, Release work items)
// with the DHFI documents (see dpReleases). Each is the connection whose view name (or name) carries the data set's
// name as a word — "Releases (Pedestal)", "DHFI [Approved]" — or the shared setup's connection for it.
export interface DataSetDef { name: string; aliases: string[]; presetKey?: string; presetId?: string }
export const dataSets: DataSetDef[] = [
  { name: 'Pedestal', aliases: ['pedestal', 'pedastal'], presetKey: 'dhp-on-prem', presetId: 'd382a4ad433a4f09b102f2f3e0e5a870' },
  { name: 'DHFI', aliases: ['dhfi'], presetKey: 'dhfi-approved', presetId: 'f4de17f3cc0ad4d5d0d23493ab5900e5' },
]
export const dataSetNamed = (name: string) => dataSets.find((set) => set.name.toLowerCase() === name.toLowerCase())
export function namesDataSet(name: string | undefined, set: DataSetDef) { const words = tokens(name); return set.aliases.some((alias) => words.includes(alias)) }
export function profileForDataSet(name: string, profiles: AzureConnectionProfileSummary[]) {
  const set = dataSetNamed(name)
  if (!set) return undefined
  return profiles.find((profile) => profile.role !== 'time-tracking' && (profile.id === set.presetId || namesDataSet(profile.viewName, set) || namesDataSet(profile.reason, set)))
}
export const dataSetOfProfile = (profile: Pick<AzureConnectionProfileSummary, 'id' | 'viewName' | 'reason' | 'role' | 'mine'>) => profile.role === 'time-tracking' || profile.mine ? undefined : dataSets.find((set) => profile.id === set.presetId || namesDataSet(profile.viewName, set) || namesDataSet(profile.reason, set))

// How a Windchill export is read (CON-83, CON-87): an export set up with the ECP logic (or, without a setup, one named
// ECP / QRE) by project at its project folder (2nd by default); the others by release (S&S IT's rules).
type SetupView = { name: string; exportFile?: string; logic?: 'standard' | 'ecp'; projectLevel?: number }
// STR-03: a custom stream "Like ECP" reads its exports by project too, like ECP.
export const isEcpExport = (view: SetupView) => view.logic === 'ecp' || (view.logic === undefined && Boolean(streamNamedBy([view.name], 'windchill')?.project))
export const windchillOptionsFor = (name: string): { project?: boolean } => streamNamedBy([name], 'windchill')?.project ? { project: true } : {}
export const windchillOptionsForView = (view: SetupView): { project?: boolean; projectLevel?: number } => isEcpExport(view) ? { project: true, projectLevel: view.projectLevel ?? 2 } : {}
// The Windchill exports of the streams, each on its own (CON-87): S&S IT's one export, then every ECP export under its
// own name ("ECP - Type 1", "ECP - Type 2"), or one empty ECP entry while there is none; then the custom Windchill
// streams the same way (STR-03): a stream "Like S&S IT" has its one export, a stream "Like ECP" every export named after
// it. stream is the stream ("ECP"), name the label of the entry. An export named after a custom stream is that
// stream's, even when it is read with the ECP logic.
export function windchillStreamExports<T extends SetupView & { id: string }>(views: T[]): { stream: StreamDef; name: string; view?: T }[] {
  const streams = allStreams().filter((stream) => stream.source === 'windchill')
  const ownerOf = (view: T) => streamNamedBy([view.name], 'windchill', streams)
  const ecpBuiltIn = defaultStreams.find((stream) => stream.source === 'windchill' && stream.project)
  return streams.flatMap((stream) => {
    // ECP (built in): every export read with the ECP logic that no custom stream names.
    const mine = stream === ecpBuiltIn ? views.filter((entry) => entry.exportFile && isEcpExport(entry) && !ownerOf(entry)?.custom)
      : views.filter((entry) => entry.exportFile && ownerOf(entry) === stream && (stream.custom || !isEcpExport(entry)))
    if (!stream.project) { const view = mine.find((entry) => namesStream(entry.name, stream.name)) ?? mine[0]; return [{ stream, name: stream.name, view }] }
    return mine.length ? mine.map((view) => ({ stream, name: view.name, view })) : [{ stream, name: stream.name }]
  })
}
