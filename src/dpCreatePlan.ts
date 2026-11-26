import type { AzureWorkItem } from './domain'
import type { AzureIteration } from './azureRead.ts'
import { sprintOfDay } from './azureRead.ts'
import { fieldOf } from './dpReleases.ts'
import type { BoardHit } from './dpBoardMatch.ts'
import { bulkPlan, fullMatch, pickQe } from './dpBulk.ts'
import { dpDateShort, dpRowDates, dpTaskMonths, utcDay, type DpBulkDates } from './dpBulkDates.ts'
import { withEpicFields, type Classification, type EpicFields } from './epicSetup.ts'
import type { EpicSetup, StoryTemplate } from './featureSetup.ts'
import type { QeSource } from './qePage.ts'

// DPF-17: the one set of rules for making the Feature of a DP release — used by DP Create Features (bulk, DPF-04) and by
// the New Feature form opened from one DP release (Create Feature on its row), so the same release gives the same
// Feature either way: the DP bulk creation Epic as parent (QV-59), the title and the Release Classification with its
// DoD and User Stories (DPF-07, DPF-08, DPF-11, EPS-03), the QE from the QE page (DPF-02), the Start and Target dates
// from the mapped date columns (DPF-13…DPF-15), the Time Writing months (DPF-16) and the Sprint of each User Story
// (EPS-10). Only DP has these columns and the QE page rule: IOCC, CP, Content and Windchill releases keep their own.

// The settings the plan reads (useDpCreateContext gives them): the DP bulk Epic and its setup (shared first, as bulk
// has always used it), the QE page, the Release Classification of its Epic setup and the date columns.
export interface DpCreateContext { epicId: number; setup?: EpicSetup; qe: QeSource | null; classes: Classification; epicFields?: EpicFields; dateColumns: DpBulkDates }

// One line per DP row: the bulk plan (title, classification and its set, QE and email, or why it is skipped), the QE
// picked on the row (DPF-06), the Epic setup's fields (EPS-03), the dates and the Time Writing months.
export function dpCreateLines(rows: AzureWorkItem[], context: DpCreateContext, options: { board: AzureWorkItem[]; featureMatch: (row: AzureWorkItem) => BoardHit | undefined; classPicks?: Record<string, string>; qePicks?: Record<string, string>; people?: { name: string; email: string }[]; fromStart: boolean; currentMonth: string }) {
  const { setup, qe, classes, epicFields, dateColumns } = context
  const mapped = bulkPlan(rows, { setup, qe, board: options.board, featureMatch: options.featureMatch, classes: options.classPicks ?? {}, classValues: classes.values, classRules: classes.rules }).map((line) => ({ ...line, mappedQe: line.qe }))
  const picked = pickQe(mapped, options.qePicks ?? {}, (line) => String(line.row.id), options.people ?? [])
  return withEpicFields(picked, epicFields, (line) => [line.row], { index: classes.fieldIndex, of: (line) => line.classification }).map((line) => {
    const dates = dpRowDates(line.row, dateColumns)
    const { months, note: monthsNote } = dates.error ? { months: [] as string[], note: '' } : dpTaskMonths(options.fromStart, dates, options.currentMonth)
    return { ...line, dates, months, monthsNote, skip: line.baseSkip || dates.error || line.skip }
  })
}
export type DpCreateLine = ReturnType<typeof dpCreateLines>[number]

// EPS-10: the milestone a date column stands for, as the notes name it: RPE, PRD, SFV, DT (QV-26), else its short name.
const milestones: Record<string, string> = { drpedate: 'RPE', drpcdate: 'PRD', drfhdate: 'SFV', ddtdate: 'DT' }
export const dpMilestoneOf = (field: string) => milestones[(field.split('.').pop() ?? '').toLowerCase()] ?? dpDateShort(field)
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dayText = (day: string) => `${Number(day.slice(8, 10))} ${months[Number(day.slice(5, 7)) - 1]} ${day.slice(0, 4)}`

// EPS-10: the Sprint of each User Story of a DP release — the story's "Sprint from" date column of the row, read as its
// UTC day (DPF-14's rule, a prefix allowed), placed in the current or future Sprint whose dates hold it (sprintOfDay).
// Without "Sprint from", or when the date gives no Sprint (no date, not a date, a finished Sprint, no Sprint holding it),
// the story keeps the Sprint chosen (path empty) and the note says why: "SFV: no DRfH Date — default Sprint".
export interface StorySprint { sprintFrom: string; path: string; sprint: string; note: string }
export function dpStorySprints(stories: Pick<StoryTemplate, 'sprintFrom'>[], row: Pick<AzureWorkItem, 'fields'>, iterations: AzureIteration[] | null | undefined, now = new Date()): StorySprint[] {
  return stories.map(({ sprintFrom = '' }) => {
    if (!sprintFrom) return { sprintFrom, path: '', sprint: '', note: '' }
    const name = dpMilestoneOf(sprintFrom), short = dpDateShort(sprintFrom), raw = fieldOf(row, sprintFrom), day = utcDay(raw)
    const fallback = (why: string) => ({ sprintFrom, path: '', sprint: '', note: `${why} — default Sprint` })
    if (!raw) return fallback(`${name}: no ${short}`)
    if (!day) return fallback(`${name}: ${short} “${raw.slice(0, 40)}” is not a date`)
    if (!iterations?.length) return fallback(`${name} ${dayText(day)}: the Sprint schedule is not loaded`)
    const found = sprintOfDay(iterations, day, now)
    if (found.sprint) return { sprintFrom, path: found.sprint.path, sprint: found.sprint.name, note: '' }
    return fallback(found.past ? `${name} ${dayText(day)} is in a past Sprint` : `${name} ${dayText(day)}: no Sprint holds it`)
  })
}
// The stories to create with their Sprint (iterationPath only when the milestone gives one).
export const withStorySprints = <S extends { title: string; description: string }>(stories: S[], sprints: StorySprint[]) => stories.map((story, index) => sprints[index]?.path ? { ...story, iterationPath: sprints[index].path } : story)
// The compact line of a bulk row: "SFV → Sprint 3 · PRD → default Sprint".
export const storySprintText = (sprints: StorySprint[]) => sprints.filter((entry) => entry.sprintFrom).map((entry) => `${dpMilestoneOf(entry.sprintFrom)} → ${entry.sprint || 'default Sprint'}`).join(' · ')

// DPF-17: what the New Feature form starts from for one DP release — the same line as bulk: the DP bulk Epic (when it
// is on the loaded board), the title, the Release Classification detected, the QE (with the reason when there is none),
// the dates with a short note per missing date, and the warning bulk gives for a 100% or similar Feature.
export interface DpPrefill { row: AzureWorkItem; epic?: AzureWorkItem; epicNote: string; title: string; classification: string; email: string; qe: string; qeNote: string; start: string; target: string; startNote: string; targetNote: string; startLabel: string; targetLabel: string; warning: string }
export function dpFormPrefill(line: DpCreateLine, context: Pick<DpCreateContext, 'epicId' | 'dateColumns'>, board: AzureWorkItem[]): DpPrefill {
  const epic = context.epicId ? board.find((item) => item.id === context.epicId && item.workItemType === 'Epic' && item.state.trim().toLowerCase() !== 'removed') : undefined
  const epicNote = !context.epicId ? 'No DP bulk creation Epic is set (Admin → Stream options → Bulk creation Epics): choose the parent Epic.' : !epic ? `The DP bulk creation Epic #${context.epicId} is not on the loaded QMS-0025 board: choose the parent Epic.` : ''
  const qeNote = line.email ? `QE from the QE page: ${line.qe}` : line.qe ? `No email found for ${line.qe} (not assigned anything on QMS-0025 yet): assigned to you unless you choose` : `${line.skip && !line.baseSkip ? line.skip.replace(/^./, (first) => first.toUpperCase()) : 'No QE on the QE page for this product'}: assigned to you unless you choose`
  const warning = fullMatch(line.hit) ? `Feature #${line.hit!.item.id} on QMS-0025 matches this release 100%: bulk creation skips it.` : line.note ? `Bulk creation names it too: ${line.note}.` : ''
  return { row: line.row, ...(epic ? { epic } : {}), epicNote, title: line.title, classification: line.classification, email: line.email, qe: line.qe, qeNote, start: line.dates.start ?? '', target: line.dates.target ?? '', startNote: line.dates.fieldNotes.start ?? '', targetNote: line.dates.fieldNotes.target ?? '', startLabel: dpDateShort(context.dateColumns.start), targetLabel: dpDateShort(context.dateColumns.target), warning }
}
