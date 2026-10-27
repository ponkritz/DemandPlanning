import type { AzureWorkItem } from './domain'

// Release information read from a work item's paths. A segment "Release x.y.z" gives the release.
// - When the Iteration Path has one, the release comes from it and the name from the Area Path: its last segment (or,
//   if the Area Path itself has a release segment, the segment above that), e.g. Area "DHP\DoseNav" + Iteration
//   "DHP\Release 2.1.0\Sprint 4" → DoseNav, 2.1.0. An Area Path of the project alone falls back to the segment above
//   the release in the Iteration Path.
// - Otherwise the Area Path alone: the release segment and the segment above it, e.g. "DHP\DoseNav\Release 2.1.0".
// Used by the read-only Azure DevOps views, not the QMS-0025 backlog.
export interface PathRelease { name: string; release: string }
const releaseSegment = /^release\s*[-_:]?\s*v?(\d+(?:\.\d+)*[\w.-]*)$/i

export function releaseFromPath(path?: string): PathRelease | undefined {
  const parts = (path ?? '').split('\\').map((part) => part.trim()).filter(Boolean)
  for (let index = 1; index < parts.length; index += 1) {
    const match = releaseSegment.exec(parts[index])
    if (match) return { name: parts[index - 1], release: match[1] }
  }
  return undefined
}

const segments = (path?: string) => (path ?? '').split('\\').map((part) => part.trim()).filter(Boolean)

export function releaseOf(item: Pick<AzureWorkItem, 'areaPath' | 'iterationPath'>): PathRelease | undefined {
  const iteration = segments(item.iterationPath)
  const at = iteration.findIndex((part) => releaseSegment.test(part))
  if (at < 0) return releaseFromPath(item.areaPath)
  const release = releaseSegment.exec(iteration[at])![1]
  const area = segments(item.areaPath)
  const name = releaseFromPath(item.areaPath)?.name ?? (area.length > 1 ? area.at(-1) : undefined) ?? (at > 0 ? iteration[at - 1] : area[0])
  return name ? { name, release } : undefined
}

// Per-stream rules (see streams.ts). The result may carry a group shown before the name.
export interface StreamRelease extends PathRelease { group?: string }
const versionPart = /(?:^|[^\d.])(?:v\.?\s*|rel(?:ease)?\s*[-_:.]?\s*)?(\d+(?:\.\d+)+)(?![\d.]*\d)/i
// DP: the release name is the Area Path's last segment (below the project); the number comes from the Iteration
// Path — a "Release x.y.z" segment, else the last segment holding a version such as "2.1.0" or "v2.1".
export function dpRelease(item: Pick<AzureWorkItem, 'areaPath' | 'iterationPath'>): StreamRelease | undefined {
  const area = segments(item.areaPath), iteration = segments(item.iterationPath)
  const name = area.length > 1 ? area.at(-1) : undefined
  let release: string | undefined
  for (const part of iteration) { const exact = releaseSegment.exec(part); if (exact) release = exact[1] }
  if (!release) for (const part of iteration.slice(1)) { const found = versionPart.exec(part); if (found) release = found[1] }
  return name && release ? { name, release } : releaseOf(item)
}
// IOCC: grouped by the Area Path segment right after "IOCC"; the release name is the document Title, with a version in
// it (e.g. "… 2.3.1") taken as the release number.
export function ioccRelease(item: Pick<AzureWorkItem, 'areaPath' | 'title'>): StreamRelease | undefined {
  const area = segments(item.areaPath), at = area.findIndex((part) => part.toLowerCase() === 'iocc')
  const group = at >= 0 ? area[at + 1] : undefined
  const title = (item.title ?? '').trim()
  if (!group || !title) return undefined
  const found = versionPart.exec(title)
  if (!found) return { group, name: title, release: '' }
  const index = title.indexOf(found[1], found.index)
  const before = title.slice(0, index).replace(/(?:\bv\.?|\brel(?:ease)?)\s*[-_:.]?\s*$/i, ''), after = title.slice(index + found[1].length)
  const name = `${before} ${after}`.replace(/\s*[|:_–-]\s*$/, '').replace(/^\s*[|:_–-]\s*/, '').replace(/\s+/g, ' ').trim() || title
  return { group, name, release: found[1] }
}
// Tool Validations: a validation has several documents (plan, protocol, report, …) for the same tool, so the unique
// list is per tool, not per document. The tool is the Area Path's deepest segment below the project that is neither a
// release segment nor the stream's own folder ("Tool Validations", "Validation"); without one, the Title before its version, else
// before its first document word (Validation, Plan, Protocol, Report, Summary, Record, Checklist, IQ, OQ, PQ, Test).
// The version is the Iteration Path's "Release x" or the Title's version when there is one. Documents of the same
// tool (and version) are one entry.
const documentWord = /\s*[-–:|_]?\s*\b(?:validation|plan|protocol|report|summary|record|checklist|iq|oq|pq|test|assessment)\b.*$/i
const streamFolder = (segment: string) => /^(?:tools?(?:\s*validations?)?|validations?)$/i.test(segment.replace(/[^a-z0-9 ]+/gi, ' ').replace(/\s+/g, ' ').trim())
export function toolRelease(item: Pick<AzureWorkItem, 'areaPath' | 'iterationPath' | 'title'>): StreamRelease | undefined {
  const title = (item.title ?? '').replace(/\s+/g, ' ').trim()
  const folders = segments(item.areaPath).slice(1).filter((part) => !releaseSegment.test(part) && !streamFolder(part))
  const fromPath = releaseOf(item)?.release
  const inTitle = versionPart.exec(title)
  const release = fromPath ?? inTitle?.[1] ?? ''
  if (folders.length) return { name: folders.at(-1)!, release }
  if (!title) return undefined
  if (inTitle) {
    const index = title.indexOf(inTitle[1], inTitle.index)
    const name = title.slice(0, index).replace(/(?:\bv\.?|\brel(?:ease)?)\s*[-_:.]?\s*$/i, '').replace(/\s*[|:_–-]\s*$/, '').trim()
    if (name) return { name, release }
  }
  const name = title.replace(documentWord, '').replace(/\s*[|:_–-]\s*$/, '').trim() || title
  return { name, release }
}
export function releaseFor(item: Pick<AzureWorkItem, 'areaPath' | 'iterationPath' | 'title'>, rule: 'path' | 'dp' | 'iocc' | 'tool' = 'path'): StreamRelease | undefined {
  return rule === 'dp' ? dpRelease(item) : rule === 'iocc' ? ioccRelease(item) : rule === 'tool' ? toolRelease(item) : releaseOf(item)
}
