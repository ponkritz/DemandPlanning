// GIT-28: shared files in the Git data repository that the app no longer uses, because the page that kept them was
// removed (QE Mapping, NAV-54). The code of this app cannot reach anyone's data repository by itself, so the Tool Owner
// deletes each one once, in Admin → Data & history → Connections in Git: a notice while the file exists, Download a copy first,
// then a confirmation pop-up and one commit that deletes the file at the version downloaded. Its history stays in GitHub.
// Only the names listed here can be read or deleted this way (useGitStorage refuses any other).
export interface RetiredFile { name: string; label: string }
export const retiredFiles: RetiredFile[] = [{ name: 'qe-mapping.json', label: 'QE Mapping' }]
export const isRetiredFile = (name: string) => retiredFiles.some((file) => file.name === name)

// The notice's text.
export const retiredNotice = (file: RetiredFile) => `${file.name} is no longer used by the app — Delete it from Git`
// The downloaded copy: the file as read from Git, named after it and the day.
export const retiredCopyName = (file: RetiredFile, at: Date) => `${file.name.replace(/\.json$/, '')}-copy-${at.toISOString().slice(0, 10)}.json`
// The commit that deletes it.
export const retiredDeleteMessage = (file: RetiredFile) => `Delete ${file.name}: no longer used by the app (${file.label} removed)`

// Why Delete it from Git is not offered yet ('' when it is): blocked in View as, with the synthetic sample and with a
// read-only Git token, for anyone but the Tool Owner (the role, not only the permission that shows the section); and only
// after Download a copy in this visit.
export interface RetiredDeleteState { connected: boolean; viewingAs: boolean; isSample: boolean; readOnly: boolean; toolOwner: boolean; downloaded: boolean }
export function retiredDeleteBlock(state: RetiredDeleteState): string {
  if (!state.connected) return 'Connect Git storage first.'
  if (state.viewingAs) return 'View as is read only: nothing is deleted.'
  if (state.isSample) return 'Synthetic sample data is loaded: nothing is deleted from Git.'
  if (state.readOnly) return 'Your Git token is read-only: it cannot delete files.'
  if (!state.toolOwner) return 'Only the Tool Owner deletes it.'
  if (!state.downloaded) return 'Download a copy first.'
  return ''
}

// GIT-28, EPS-09: the bulk Epics whose setup still names only the old QE Mapping columns (no QE page yet), named in the
// delete pop-up; the delete is not blocked by them.
export const staleQeLine = (epics: string[]) => epics.length ? `Set the QE page in each bulk Epic's Feature setup first: ${epics.join(', ')} still use${epics.length === 1 ? 's' : ''} the old QE Mapping columns only.` : ''
