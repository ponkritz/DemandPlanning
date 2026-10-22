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
