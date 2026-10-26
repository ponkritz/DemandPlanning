import { useState } from 'react'
import type { AzureWorkItem } from '../domain'
import type { AzureWorkspace } from '../useAzureWorkspace'
import { dpProgramOf, dpServiceOf, dpTitleScore, dpVersionOf, type BoardHit, type BoardMatch } from '../dpBoardMatch'
import type { ReleaseEntry } from '../releaseSource'
import { CreateReleaseFeature } from './ReleaseView'
import { Modal } from './ui'

// DP table: a "QMS-0025 match" column — the Feature and User Story on the Time Writing board whose title matches the
// row's SourceProgram + Title at the threshold (dpBoardMatch) — and, when neither matches, Create Feature.
function Hit({ hit, label }: { hit: BoardHit; label: string }) {
  return <a href={hit.item.url} target="_blank" rel="noreferrer" title={`${hit.item.title} — ${hit.score}% match`}>{label} {hit.item.id} <small>{hit.score}%</small></a>
}

export function DpBoardCell({ row, match, azure, assign, threshold }: { row: AzureWorkItem; match: BoardMatch; azure: AzureWorkspace; assign?: { me: string; canChoose: boolean }; threshold: number }) {
  const [creating, setCreating] = useState(false)
  const program = dpProgramOf(row), service = dpServiceOf(row), release = dpVersionOf(row)
  const entry: ReleaseEntry = { key: `dp-${row.id}`, name: service, release, documents: 0, items: [row], tracked: false, trackedBy: [], features: [], planned: 0, booked: 0, hourTasks: 0 }
  if (match.feature || match.story) return <span className="board-match">{match.feature && <Hit hit={match.feature} label="Feature" />}{match.story && <Hit hit={match.story} label="Story" />}</span>
  return <span className="board-match">
    {match.closest ? <small className="muted" title={match.closest.item.title}>closest {match.closest.item.workItemType} {match.closest.item.id} · {match.closest.score}%</small> : <small className="muted">{azure.items.length ? 'no match' : 'board not loaded'}</small>}
    <button type="button" className="ghost small" onClick={() => setCreating(true)}>Create Feature</button>
    {creating && <Modal eyebrow={`DP · #${row.id}`} title="Create Feature on QMS-0025" onClose={() => setCreating(false)} form wide>
      <p className="muted">No Feature or User Story on the board matches “{[program, row.title].filter(Boolean).join(' ')}” at {threshold}% or more. The new title must match back at {threshold}%.</p>
      <CreateReleaseFeature stream="DP" program={program || 'DP'} release={entry} azure={azure} assign={assign} threshold={threshold} scoreOf={(title) => dpTitleScore(title, row.title, program, release)} note={`DP release #${row.id} ${row.title}${program ? ` (${program})` : ''}; created from the DP release view.`} onDone={() => setCreating(false)} />
    </Modal>}
  </span>
}
