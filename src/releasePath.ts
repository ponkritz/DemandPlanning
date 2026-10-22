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
