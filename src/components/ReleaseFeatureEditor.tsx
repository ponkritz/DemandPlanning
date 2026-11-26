import { useState } from 'react'
import type { FeatureSetups } from '../featureSetup'
import type { AzureWorkItem } from '../domain'
import type { AzureWorkspace } from '../useAzureWorkspace'
import type { BoardHit } from '../dpBoardMatch'
import { FeatureEditor } from './FeatureEditor'
import { useWriteBlock } from '../useCan'
import { boardPeople } from '../contentBulk'
import { utcMonthLabel } from '../azureDevOps'
import { useDpCreateContext } from '../useDpCreateContext'
import { dpCreateLines, dpFormPrefill } from '../dpCreatePlan'

// Create Feature from Release Details (DP rows, CP / IOCC / … releases): always the one default Create Feature form
// (FeatureEditor, as on the QMS-0025 board and My Tasks [Board]), pre-filled with the release's title and the Epic named
// like the stream (else the first Epic). items: the release's on-prem work items, which fill the Epic setup's title
// fields. The button says why it is disabled.
// DPF-17: dp — opened from one DP release, the form starts from the same rules as DP Create Features (dpCreatePlan): the
// DP bulk creation Epic, the title and Release Classification, the QE, the Start and Target dates, the Time Writing
// months and the Sprint of each User Story. Only DP has these: other streams keep the form as it was.
export function ReleaseFeatureButton({ stream, title, items, azure, assign, featureSetup, dp, onCreated }: { stream: string; title: string; items?: AzureWorkItem[]; azure: AzureWorkspace; assign?: { me: string; canChoose: boolean }; featureSetup?: FeatureSetups | null; dp?: { row: AzureWorkItem; hit?: BoardHit }; onCreated?: () => void }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const epics = azure.items.filter((item) => item.workItemType === 'Epic' && item.state.trim().toLowerCase() !== 'removed').sort((a, b) => a.id - b.id)
  const key = stream.trim().toLowerCase()
  const word = new RegExp(`(^|[^a-z0-9])${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`)
  const epic = epics.find((item) => item.title.trim().toLowerCase() === key) ?? epics.find((item) => word.test(item.title.toLowerCase())) ?? epics[0]
  const me = (assign?.me || azure.creatorEmail).trim().toLowerCase()
  // CON-102: creating needs "Create Features, User Stories and Tasks"; without it the button is disabled and says why.
  const blocked = useWriteBlock().why('azure.write') || (azure.isSample ? 'Synthetic sample data is loaded: creating in Azure DevOps is disabled.' : !azure.config ? 'Connect the QMS-0025 Time Writing connection first (Admin → Streams).' : !epic ? 'Load the QMS-0025 board first: no Epic to put the Feature under.' : '')
  const close = () => setOpen(false)
  const editor = { mode: { parent: epic! }, initialTitle: title, releaseItems: items, items: azure.items, config: azure.config!, savedPat: azure.pat, me, canChoose: Boolean(assign?.canChoose), featureSetup, onSavePat: azure.rememberPat, onCreated: azure.featureCreated, onClose: close,
    onDone: () => { setOpen(false); onCreated?.() }, onPartial: (text: string) => { setOpen(false); setNote(text) } }
  return <>
    <button type="button" className="ghost small" disabled={Boolean(blocked)} title={blocked || `Create a Feature “${title}” on QMS-0025`} onClick={() => { setNote(''); setOpen(true) }}>Create Feature</button>
    {blocked && <small className="muted">{blocked}</small>}
    {note && <small className="negative">{note}</small>}
    {open && azure.config && epic && (dp ? <DpFeatureEditor {...editor} row={dp.row} hit={dp.hit} board={azure.items} /> : <FeatureEditor {...editor} />)}
  </>
}

// DPF-17: the New Feature form for one DP release, prefilled by the bulk plan of that one row (dpCreateLines).
type EditorProps = Parameters<typeof FeatureEditor>[0]
function DpFeatureEditor({ row, hit, board, ...editor }: EditorProps & { row: AzureWorkItem; hit?: BoardHit; board: AzureWorkItem[] }) {
  const context = useDpCreateContext(editor.featureSetup)
  const prefill = dpFormPrefill(dpCreateLines([row], context, { board, featureMatch: () => hit, people: boardPeople(board), fromStart: false, currentMonth: utcMonthLabel() })[0], context, board)
  return <FeatureEditor {...editor} initialTitle={prefill.title} dp={prefill} />
}
