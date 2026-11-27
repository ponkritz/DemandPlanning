import { DataTable, type DataColumn } from '../components/DataTable'
import { EmptyState, Notice, TablePanel, WriteBlocked } from '../components/ui'
import { meetingBuiltOf } from '../piMeeting'
import type { MeetingGit, PiMeeting } from '../usePiMeeting'

// PIR-40, PIR-47 The parts of Conduct PI Meeting on PI Review: the page action and the PI Review Meetings panel. The
// logic: src/usePiMeeting.ts.
const fileOf = (path: string) => path.slice(path.lastIndexOf('/') + 1)
// PIR-40: the page action — shown to the PI Review leads and PI Review Setup holders only (like ⚙, UI-STANDARDS §6),
// disabled with the reason next to it.
export function MeetingButton({ meeting }: { meeting: PiMeeting }) {
  if (!meeting.shown) return null
  return <><button type="button" className="primary" disabled={Boolean(meeting.why)} title={meeting.why || 'Build the PI Review Meeting presentation of this PI: one HTML file, downloaded and kept in Git.'} onClick={meeting.build}>Conduct PI Meeting</button>{meeting.why && !meeting.building && meeting.why !== 'Choose a PI first.' && <WriteBlocked reason={meeting.why} />}</>
}

// PIR-47: the PI's saved meetings (Git), newest first, with Open and Download.
export function SavedMeetings({ meeting, git }: { meeting: PiMeeting; git?: MeetingGit }) {
  const { saved, listable } = meeting
  const columns: DataColumn<string>[] = [
    { id: 'built', label: 'Built', value: (path) => meetingBuiltOf(path), firstSortDesc: true },
    { id: 'file', label: 'File', value: (path) => fileOf(path) },
    { id: 'actions', label: 'Actions', export: false, sortable: false, render: (path) => <span className="button-row"><button type="button" className="text-button" aria-label={`Open ${fileOf(path)}`} onClick={() => void meeting.open(path)}>Open</button><button type="button" className="text-button" aria-label={`Download ${fileOf(path)}`} onClick={() => void meeting.download(path)}>Download</button></span> },
  ]
  const unavailable = !git?.connected ? 'Git storage is not connected: saved meetings are listed here once it is (Admin → Data & history).' : git.isSample || !listable ? 'Synthetic sample data is loaded: saved meetings are not read from Git.' : ''
  return <TablePanel title="PI Review Meetings" count={saved.state === 'done' ? `${saved.paths.length}` : undefined}
    info={`The PI Review Meeting presentations of ${meeting.name} kept in the Git data repository (pi-review/meetings/), newest first. Each is a snapshot taken when it was built — it does not update. Conduct PI Meeting builds a new one: it is downloaded, and a copy is saved here unless you view as someone else, sample data is loaded, Git storage is not connected or your Git token is read-only. Open shows a file of this app version in a new tab, every slide one after another (to read or print); to present it with the keyboard, Download it and open the file — it opens in any browser, without the app or a login.`}
    action={listable ? <button type="button" className="ghost" disabled={saved.state === 'loading'} onClick={meeting.refresh}>↻ Refresh</button> : undefined}>
    {meeting.shown && <WriteBlocked reason={meeting.saveWhy} />}
    {meeting.note && <Notice tone={meeting.note.tone}>{meeting.note.text}</Notice>}
    {unavailable ? <EmptyState title={unavailable} /> : saved.state === 'error' ? <Notice tone="error">The saved meetings could not be listed: {saved.error}</Notice>
      : saved.state === 'loading' && !saved.paths.length ? <p className="muted" role="status">Reading the saved meetings…</p>
      : <DataTable id="pireview:meetings" columns={columns} rows={saved.paths} rowKey={(path) => path} defaultSort={{ id: 'built', desc: true }} empty={<EmptyState title={`No saved PI Review Meeting of ${meeting.name} yet.`} detail={meeting.shown ? 'Conduct PI Meeting builds one.' : 'A PI Review lead builds one with Conduct PI Meeting.'} />} />}
  </TablePanel>
}
