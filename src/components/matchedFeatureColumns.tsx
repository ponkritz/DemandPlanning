import { formatHours } from '../format'
import type { BoardHit } from '../dpBoardMatch'
import type { FeatureHours } from '../releaseSource'
import type { DataColumn } from './DataTable'
import { Pill } from './ui'

// (4) The Time Writing Feature, Planned (h) and Booked (h) of a release matched on QMS-0025 (QV-65: DP, CP, S&S IT,
// ECP): the Feature of its QMS-0025 match (at the match threshold) with the match %, and the hours of that Feature's
// Time Writing Tasks (timeWritingHours: Original Estimate and Completed Work, all months, each Task once). No matched
// Feature (a User Story only, or nothing at the threshold): — in all three.
export function matchedFeatureColumns<T>(featureOf: (row: T) => BoardHit | undefined, hoursOf: (featureIds: readonly number[]) => FeatureHours): DataColumn<T>[] {
  const hours = (row: T) => { const hit = featureOf(row); return hit ? hoursOf([hit.item.id]) : undefined }
  return [
    { id: 'feature', label: 'Time Writing Feature', value: (row) => { const hit = featureOf(row); return hit ? `#${hit.item.id} ${hit.item.title}` : '' }, render: (row) => { const hit = featureOf(row); return hit ? <><Pill tone="open">{hit.score}% match</Pill><a className="feature-link" href={hit.item.url} target="_blank" rel="noreferrer">#{hit.item.id} {hit.item.title}</a></> : <span className="muted">—</span> } },
    { id: 'planned', label: 'Planned (h)', align: 'right', firstSortDesc: true, value: (row) => { const found = hours(row); return found?.hourTasks ? found.planned : '' }, render: (row) => { const found = hours(row); return found?.hourTasks ? formatHours(found.planned) : '—' } },
    { id: 'booked', label: 'Booked (h)', align: 'right', firstSortDesc: true, value: (row) => { const found = hours(row); return found?.hourTasks ? found.booked : '' }, render: (row) => { const found = hours(row); return <>{found?.hourTasks ? <>{formatHours(found.booked)}{found.planned > 0 && found.booked > found.planned && <small className="negative">+{formatHours(found.booked - found.planned)} over plan</small>}</> : '—'}<small>{found?.hourTasks ? `${found.hourTasks} task${found.hourTasks === 1 ? '' : 's'}` : ''}</small></> } },
  ]
}
