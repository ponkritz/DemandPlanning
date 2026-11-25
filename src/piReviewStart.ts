// PIR-33: "PI Review starts from" (product owner, 25 Nov 2026: "Let's do the read discussions from 26.4, older PIs don't
// show [as an] option. Date filter is set to 21-September-2026. Anything earlier than that, don't show.") — the PIs the
// PI pickers of PI Review and My PI Review offer, and the next PI never suggested before the date. The date itself is
// part of the PI Review form setup (pi-review-form.json, `reviewStart`; the default when the file or the key is missing).
// Pure: the date, the iterations and the PI names are passed in. The comments before the date: piReview.ts (commentsFrom).
import { comparable, comparePiNumbers, piParts, piPeriods, pisPerYear, type NextPi, type PiPeriod } from './piReviewPost.ts'
import { defaultReviewStart, type PiFormSetup } from './piReviewSetup.ts'
import { formatDate } from './format.ts'
import { piPathOf } from './myWork.ts'
import type { AzureIteration } from './azureRead.ts'

// PIR-33: the date in use — the setup's, else the default (21 Sep 2026).
export const reviewStartOf = (setup: Pick<PiFormSetup, 'reviewStart'> | null | undefined) => setup?.reviewStart || defaultReviewStart
export const reviewStartLabel = (start: string) => formatDate(start)

// PIR-33: how a PI is judged against the date —
//  a PI with dates (piPeriods of PIR-25: its PI-level iteration's dates, else the span of its Sprints'): left out when
//    that period ended before the date;
//  a PI without dates, when other PIs have dates ('dates'): left out when its number is not above the highest-numbered
//    dated PI that ended before the date;
//  no PI has dates ('quarter': the iterations not read, sample data, an undated tree): by the PI number of the date's
//    place in its year — with n PIs a year (pisPerYear, at least 4) the date falls in PI yy.k, k = floor(month × n / 12)
//    + 1 (21 Sep 2026: PI 26.3, so its dates being unknown it is still offered); a PI below that number is left out.
// A name without a PI number is never left out (it cannot be placed).
export interface PiCutoff { start: string; how: 'dates' | 'quarter'; periods: Map<string, PiPeriod>; lastEnded: number[] | null; quarterPi: number[] | null }
export function piCutoff(start: string, iterations: readonly AzureIteration[] | null | undefined, known: readonly string[] = []): PiCutoff {
  const dated = iterations ? piPeriods(iterations).dated : []
  const periods = new Map(dated.map((entry) => [comparable(entry.parts).join('.'), entry]))
  const ended = dated.filter((entry) => entry.finish < start).sort((a, b) => comparePiNumbers(b.parts, a.parts))[0]
  if (dated.length) return { start, how: 'dates', periods, lastEnded: ended ? ended.parts : null, quarterPi: null }
  const year = Number(start.slice(0, 4)), month = Number(start.slice(5, 7)) - 1
  const valid = Number.isInteger(year) && year > 0 && month >= 0 && month < 12
  return { start, how: 'quarter', periods, lastEnded: null, quarterPi: valid ? [year, Math.floor(month * pisPerYear(known) / 12) + 1] : null }
}
// PIR-33: whether a PI (a PI path, a Sprint's path under it, or a name) is offered — false when it is before the date.
export function shownFrom(pi: string, cutoff: PiCutoff): boolean {
  const all = piParts(piPathOf(pi) ?? pi)
  if (!all) return true
  const parts = all.length > 2 ? all.slice(0, 2) : all
  const period = cutoff.periods.get(comparable(parts).join('.'))
  if (period) return period.finish >= cutoff.start
  if (cutoff.how === 'dates') return !cutoff.lastEnded || comparePiNumbers(parts, cutoff.lastEnded) > 0
  return !cutoff.quarterPi || comparePiNumbers(parts, cutoff.quarterPi) >= 0
}
// PIR-33: the PI list without the PIs before the date, and those left out.
export function piOptionsFrom(options: readonly string[], cutoff: PiCutoff): { shown: string[]; hidden: string[] } {
  const shown: string[] = [], hidden: string[] = []
  for (const pi of options) (shownFrom(pi, cutoff) ? shown : hidden).push(pi)
  return { shown, hidden }
}
// PIR-33: the sentence for the pages' Info.
export function cutoffNote(cutoff: PiCutoff): string {
  const how = cutoff.how === 'dates' ? 'by their dates in Azure DevOps; a PI without dates by its number' : 'by their numbers, as no PI has dates here'
  return `PI Review starts from ${reviewStartLabel(cutoff.start)}: PIs that ended before it are not offered (${how}), and comments written before it are ignored — the latest review, the review status and the form’s prefill use only the comments on or after it.`
}

// PIR-33: the next PI is never one before "PI Review starts from" — such a suggestion is dropped (Moves to left empty for
// the person to choose) and the note says why.
export function notBeforeStart(next: NextPi, cutoff: PiCutoff): NextPi {
  if (!next.pi || shownFrom(next.pi, cutoff)) return next
  return { ...next, pi: '', note: `${next.note} ${next.pi} is before PI Review starts (${reviewStartLabel(cutoff.start)}), so it is not suggested: choose the PI.`.trim(), short: 'The next PI would be before PI Review starts — choose the PI.', missing: true }
}
