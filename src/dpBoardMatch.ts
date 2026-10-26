import type { AzureWorkItem } from './domain'
import { isTimeWritingStory } from './azureInsights.ts'
import { fieldOf } from './dpReleases.ts'
import { matchScore, prepareName, prepareTitle, releaseFeatureTitle, type PreparedName, type PreparedTitle } from './releaseSource.ts'

// DP row → QMS-0025 board: the Feature and the User Story whose title matches the row's SourceProgram and Title.
// Not everyone writes the SourceProgram into the board title, so the score is the better of Title alone and
// SourceProgram + Title. The Title holds both the name and the version, and both must match (matchScore, as NAV-26:
// name 60% — whole in the title or a "|" part, else bigram similarity — and version 40% — the exact version 1, the
// same major.minor 0.25, the same major 0.1); the version is the one in the Title, else the Release field. A board
// title without the version or with another one stays below 80%. A match needs the threshold (80% by default);
// the closest item below it is kept as a hint. Time Writing stories and removed items are not candidates.
export interface BoardHit { item: AzureWorkItem; score: number }
export interface BoardMatch { feature?: BoardHit; story?: BoardHit; closest?: BoardHit }

export const dpProgramOf = (item: AzureWorkItem) => fieldOf(item, 'SourceProgram')?.trim() ?? ''
const versions = /\bv?\d+(\.\d+)+\b/gi
// The row's Title without its version, as the Service part of a new Feature title.
export const dpServiceOf = (item: AzureWorkItem) => item.title.replace(versions, ' ').replace(/\s+/g, ' ').trim()
// The row's version: the last one in its Title, else its Release field.
export const dpVersionOf = (item: Pick<AzureWorkItem, 'title' | 'fields'>) => [...item.title.matchAll(versions)].at(-1)?.[0].replace(/^v/i, '') ?? fieldOf(item, 'Release')?.trim() ?? ''

// Create Feature from a DP row: Program (SourceProgram, else DP) | Service (PsName, else the Title without its version)
// | vRelease (the Release field, else the Title's version).
export const dpFeatureTitle = (row: AzureWorkItem) => releaseFeatureTitle(dpProgramOf(row) || 'DP', fieldOf(row, 'PsName')?.trim() || dpServiceOf(row), fieldOf(row, 'Release')?.trim() || dpVersionOf(row))

const names = (title: string, program: string): PreparedName[] => program && !title.toLowerCase().includes(program.toLowerCase()) ? [prepareName(title), prepareName(title, program)] : [prepareName(title)]
export function dpTitleScore(boardTitle: string | PreparedTitle, title: string, program = '', version = dpVersionOf({ title, fields: {} })) {
  const ready = typeof boardTitle === 'string' ? prepareTitle(boardTitle) : boardTitle
  return Math.max(0, ...names(title, program).map((name) => matchScore(ready, name, version)))
}

export function dpBoardCandidates(board: AzureWorkItem[]) {
  return board.filter((item) => (item.workItemType === 'Feature' || item.workItemType === 'User Story') && item.state.trim().toLowerCase() !== 'removed' && !isTimeWritingStory(item)).map((item) => ({ item, ready: prepareTitle(item.title) }))
}
export type DpBoardCandidates = ReturnType<typeof dpBoardCandidates>

export function dpBoardMatch(row: AzureWorkItem, candidates: DpBoardCandidates, threshold = 80): BoardMatch {
  const program = dpProgramOf(row), version = dpVersionOf(row), wanted = names(row.title, program)
  // Only items sharing a telling word (or the squashed name) with the row are scored.
  const keys = [...new Set(wanted.flatMap((name) => name.words.length ? name.words : name.wanted.length >= 2 ? [name.wanted] : []))]
  if (!keys.length) return {}
  const hits = candidates.filter(({ ready }) => keys.some((key) => ready.flat.includes(key)))
    .map(({ item, ready }) => ({ item, score: Math.max(...wanted.map((name) => matchScore(ready, name, version))) }))
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score || a.item.id - b.item.id)
  const best = (type: string) => hits.find((hit) => hit.item.workItemType === type && hit.score >= threshold)
  const feature = best('Feature'), story = best('User Story')
  return { ...(feature ? { feature } : {}), ...(story ? { story } : {}), ...(!feature && !story && hits[0] ? { closest: hits[0] } : {}) }
}

export const boardMatchText = (match: BoardMatch) => [match.feature && `Feature ${match.feature.item.id} (${match.feature.score}%)`, match.story && `User Story ${match.story.item.id} (${match.story.score}%)`].filter(Boolean).join('; ') || (match.closest ? `No match (closest ${match.closest.item.workItemType} ${match.closest.item.id}, ${match.closest.score}%)` : 'No match')
