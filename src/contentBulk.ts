import type { AzureWorkItem } from './domain'
import type { ReleaseEntry } from './releaseSource.ts'
import type { BoardHit } from './dpBoardMatch.ts'
import { fullMatch, similarNote } from './dpBulk.ts'

// CNB-01…02: Content releases (one per document Title, QV-52) get their Features in bulk: under Epic 22919, Release
// Classification NA, DoD "All Documents are approved", one User Story "Review of Deliverables - <Feature title>" in the
// current Sprint, the Time Writing story and the month Task with 4 h Original Estimate, all assigned to one person
// chosen in the pop-up.
export const contentEpicId = 22919
export const contentBulk = { classification: 'NA', featureDoD: 'All Documents are approved', taskEstimate: 4 } as const

export interface ContentLine { release: ReleaseEntry; title: string; skip: string; note: string }
export function contentPlan(releases: ReleaseEntry[], featureTitle: (release: ReleaseEntry) => string, featureMatch: (release: ReleaseEntry) => BoardHit | undefined): ContentLine[] {
  return releases.map((release) => {
    const title = featureTitle(release).trim()
    const hit = featureMatch(release)
    const skip = fullMatch(hit) ? `Feature #${hit!.item.id} on QMS-0025 matches it 100%` : !title ? 'no title' : title.length > 255 ? 'the Feature title is longer than 255 characters' : ''
    return { release, title, skip, note: skip ? '' : similarNote(hit) }
  })
}

// The people the pop-up offers: everyone with an email on the loaded QMS-0025 board, by name.
export function boardPeople(board: AzureWorkItem[]): { name: string; email: string }[] {
  const people = new Map<string, { name: string; email: string }>()
  for (const item of board) {
    const email = item.assignedToEmail?.trim().toLowerCase()
    if (!email || people.has(email)) continue
    people.set(email, { name: (item.assignedTo ?? '').replace(/\s*<[^>]*>\s*$/, '').trim() || email, email })
  }
  return [...people.values()].sort((a, b) => a.name.localeCompare(b.name))
}
// The email for what was typed or picked: an email as it is, "Name <email>", or a name on the board (case ignored).
export function personEmail(text: string, people: { name: string; email: string }[]): string {
  const value = text.trim()
  const inside = /<([^>]+)>\s*$/.exec(value)?.[1] ?? value
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inside)) return inside.toLowerCase()
  return people.find((person) => person.name.toLowerCase() === value.toLowerCase())?.email ?? ''
}
