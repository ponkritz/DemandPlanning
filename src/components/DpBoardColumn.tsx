import type { AzureWorkItem } from '../domain'
import type { AzureWorkspace } from '../useAzureWorkspace'
import type { FeatureSetups } from '../featureSetup'
import { dpFeatureTitle, type BoardHit, type BoardMatch } from '../dpBoardMatch'
import { ReleaseFeatureButton } from './ReleaseFeatureEditor'

// DP table: a "QMS-0025 match" column — the Feature and User Story on the Time Writing board whose title matches the
// row's SourceProgram + Title at the threshold (dpBoardMatch) — and, when neither matches, Create Feature in the
// default Create Feature form, titled Program (SourceProgram, else DP) | Service (PsName) | Release (the number, no "v").
function Hit({ hit, label }: { hit: BoardHit; label: string }) {
  return <a href={hit.item.url} target="_blank" rel="noreferrer" title={`${hit.item.title} — ${hit.score}% match`}>{label} {hit.item.id} <small>{hit.score}%</small></a>
}

export function DpBoardCell({ row, match, azure, assign, featureSetup }: { row: AzureWorkItem; match: BoardMatch; azure: AzureWorkspace; assign?: { me: string; canChoose: boolean }; featureSetup?: FeatureSetups | null }) {
  return <BoardMatchCell match={match} azure={azure} stream="DP" title={dpFeatureTitle(row)} items={[row]} assign={assign} featureSetup={featureSetup} dpRow={row} />
}

// The cell shared by the DP table and the Windchill releases (S&S IT): the matched Feature / Story, else the closest
// item and Create Feature with the given title.
// DPF-17: dpRow — a DP release: its Create Feature starts from the DP bulk rules.
export function BoardMatchCell({ match, azure, stream, title, items, assign, featureSetup, dpRow }: { match: BoardMatch; azure: AzureWorkspace; stream: string; title: string; items?: AzureWorkItem[]; assign?: { me: string; canChoose: boolean }; featureSetup?: FeatureSetups | null; dpRow?: AzureWorkItem }) {
  if (match.feature || match.story) return <span className="board-match">{match.feature && <Hit hit={match.feature} label="Feature" />}{match.story && <Hit hit={match.story} label="Story" />}</span>
  return <span className="board-match">
    {match.closest ? <small className="muted" title={match.closest.item.title}>closest {match.closest.item.workItemType} {match.closest.item.id} · {match.closest.score}%</small> : <small className="muted">{azure.items.length ? 'no match' : 'board not loaded'}</small>}
    <ReleaseFeatureButton stream={stream} title={title} items={items} azure={azure} assign={assign} featureSetup={featureSetup} {...(dpRow ? { dp: { row: dpRow, ...(match.feature ? { hit: match.feature } : {}) } } : {})} />
  </span>
}
