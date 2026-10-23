import type { AzureConnectionProfileSummary } from './azureCredentials.ts'

// The release streams the team works with, in this order. DP, CP, IOCC, Content and Tool Validations come from an
// Azure DevOps connection with a query (connection named like the stream); S&S IT from a Windchill export (ECP will
// follow as a Windchill export). Release Details and Pulse Check show exactly these. Each stream reads its releases
// with its own rule (see releasePath): DP — release name from the Area Path, number from the Iteration Path; IOCC —
// grouped by the Area Path segment after "IOCC", release name from the document Title; the others keep the general
// path rule. DP and IOCC releases are matched to QMS-0025 Features by a fuzzy match with a percentage.
export type ReleaseRule = 'path' | 'dp' | 'iocc'
export interface StreamDef { name: string; source: 'azure' | 'windchill'; rule: ReleaseRule; fuzzy: boolean }
export const defaultStreams: StreamDef[] = [
  { name: 'DP', source: 'azure', rule: 'dp', fuzzy: true },
  { name: 'CP', source: 'azure', rule: 'path', fuzzy: false },
  { name: 'IOCC', source: 'azure', rule: 'iocc', fuzzy: true },
  { name: 'Content', source: 'azure', rule: 'path', fuzzy: false },
  { name: 'Tool Validations', source: 'azure', rule: 'path', fuzzy: false },
  { name: 'S&S IT', source: 'windchill', rule: 'path', fuzzy: false },
]
export const defaultMatchThreshold = 80

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
export const streamNamed = (name: string | undefined) => defaultStreams.find((stream) => sameStream(stream.name, name))

// The connection of an Azure stream: a non-Time-Writing connection whose view name (or name) is the stream's name.
export function profileForStream(stream: StreamDef, profiles: AzureConnectionProfileSummary[]) {
  if (stream.source !== 'azure') return undefined
  return profiles.find((profile) => profile.role !== 'time-tracking' && (namesStream(profile.viewName, stream.name) || namesStream(profile.reason, stream.name)))
}
// The stream a connection belongs to, if any.
export const streamOfProfile = (profile: Pick<AzureConnectionProfileSummary, 'viewName' | 'reason' | 'role'>) => profile.role === 'time-tracking' ? undefined : defaultStreams.find((stream) => stream.source === 'azure' && (namesStream(profile.viewName, stream.name) || namesStream(profile.reason, stream.name)))
// The Windchill export of a Windchill stream, by its name.
export function exportForStream<T extends { name: string; exportFile?: string }>(stream: StreamDef, views: T[]) {
  return stream.source === 'windchill' ? views.find((view) => view.exportFile && namesStream(view.name, stream.name)) : undefined
}

// Data sets that feed a stream without being one: DP combines the Pedestal release register (DHP, Release work items)
// with the DHFI documents (see dpReleases). Each is the connection whose view name (or name) carries the data set's
// name as a word — "Releases (Pedestal)", "DHFI [Approved]" — or the shared setup's connection for it.
export interface DataSetDef { name: string; aliases: string[]; presetKey?: string; presetId?: string }
export const dataSets: DataSetDef[] = [
  { name: 'Pedestal', aliases: ['pedestal', 'pedastal'], presetKey: 'dhp-on-prem', presetId: 'd382a4ad433a4f09b102f2f3e0e5a870' },
  { name: 'DHFI', aliases: ['dhfi'] },
]
export const dataSetNamed = (name: string) => dataSets.find((set) => set.name.toLowerCase() === name.toLowerCase())
export function namesDataSet(name: string | undefined, set: DataSetDef) { const words = tokens(name); return set.aliases.some((alias) => words.includes(alias)) }
export function profileForDataSet(name: string, profiles: AzureConnectionProfileSummary[]) {
  const set = dataSetNamed(name)
  if (!set) return undefined
  return profiles.find((profile) => profile.role !== 'time-tracking' && (profile.id === set.presetId || namesDataSet(profile.viewName, set) || namesDataSet(profile.reason, set)))
}
export const dataSetOfProfile = (profile: Pick<AzureConnectionProfileSummary, 'id' | 'viewName' | 'reason' | 'role'>) => profile.role === 'time-tracking' ? undefined : dataSets.find((set) => profile.id === set.presetId || namesDataSet(profile.viewName, set) || namesDataSet(profile.reason, set))
