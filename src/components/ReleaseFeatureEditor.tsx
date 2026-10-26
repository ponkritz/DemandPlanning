import { useState } from 'react'
import type { FeatureSetups } from '../featureSetup'
import type { AzureWorkspace } from '../useAzureWorkspace'
import { FeatureEditor } from './FeatureEditor'

// Create Feature from Release Details (DP rows, CP / IOCC / … releases): always the one default Create Feature form
// (FeatureEditor, as on the QMS-0025 board and Assigned to Me), pre-filled with the release's title and the Epic named
// like the stream (else the first Epic). The button says why it is disabled.
export function ReleaseFeatureButton({ stream, title, azure, assign, featureSetup, onCreated }: { stream: string; title: string; azure: AzureWorkspace; assign?: { me: string; canChoose: boolean }; featureSetup?: FeatureSetups | null; onCreated?: () => void }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const epics = azure.items.filter((item) => item.workItemType === 'Epic' && item.state.trim().toLowerCase() !== 'removed').sort((a, b) => a.id - b.id)
  const key = stream.trim().toLowerCase()
  const word = new RegExp(`(^|[^a-z0-9])${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`)
  const epic = epics.find((item) => item.title.trim().toLowerCase() === key) ?? epics.find((item) => word.test(item.title.toLowerCase())) ?? epics[0]
  const me = (assign?.me || azure.creatorEmail).trim().toLowerCase()
  const blocked = azure.isSample ? 'Synthetic sample data is loaded: creating in Azure DevOps is disabled.' : !azure.config ? 'Connect the QMS-0025 Time Writing connection first (Settings → Azure DevOps).' : !epic ? 'Load the QMS-0025 board first: no Epic to put the Feature under.' : ''
  return <>
    <button type="button" className="ghost small" disabled={Boolean(blocked)} title={blocked || `Create a Feature “${title}” on QMS-0025`} onClick={() => { setNote(''); setOpen(true) }}>Create Feature</button>
    {blocked && <small className="muted">{blocked}</small>}
    {note && <small className="negative">{note}</small>}
    {open && azure.config && epic && <FeatureEditor mode={{ parent: epic }} initialTitle={title} items={azure.items} config={azure.config} savedPat={azure.pat} me={me} canChoose={Boolean(assign?.canChoose)} featureSetup={featureSetup} onSavePat={azure.rememberPat} onCreated={azure.featureCreated} onClose={() => setOpen(false)}
      onDone={() => { setOpen(false); onCreated?.() }} onPartial={(text) => { setOpen(false); setNote(text) }} />}
  </>
}
