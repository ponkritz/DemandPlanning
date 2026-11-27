// SET-19, CON-118: the delete item in the ⋯ of a page listed under Other views in the menu (product owner,
// 2026-11-25: "No option to delete a shared view; only Other Views can be deleted").
// - A view of the person's own (My views, SET-17): "Delete this view…", the same deletion as My settings → My views;
//   disabled with the reason while viewing as someone else (View as is read-only).
// - A Windchill export listed under Other views (CON-118): "Delete this export…" for whoever may import Windchill
//   exports (`windchill.import`); disabled with the reason in View as, with the synthetic sample, without Git storage
//   and with a read-only Git token (it deletes the export's files in Git).
// - A shared Azure DevOps view, a stream, the Time Writing backlog: no delete item on the page, for every role (the
//   Tool Owner's Remove / Delete for everyone stay in Admin → Data & history → Other views, CON-109…CON-112). Nobody
//   without the right sees an item (the per-object exception of UI-STANDARDS §3).
export type ViewPageActionKey = 'delete-mine' | 'delete-export'
export interface ViewPageAction { key: ViewPageActionKey; label: string; danger: true; blocked: string; title: string }
export interface GitState { connected: boolean; readOnly: boolean; isSample?: boolean }

export const viewAsBlocked = 'Not while viewing as someone else: View as is read-only.'

export function viewPageActions(viewer: { other: boolean; mine: boolean; viewingAs: boolean }): ViewPageAction[] {
  if (!viewer.other || !viewer.mine) return []
  const blocked = viewer.viewingAs ? viewAsBlocked : ''
  return [{ key: 'delete-mine', label: 'Delete this view…', danger: true, blocked, title: blocked || 'Delete your own view from this browser or desktop app (as My settings → My views does)' }]
}

// Why Delete this export… cannot be used now, or '' (fail closed).
export function exportDeleteBlocked({ viewingAs, isSample, git }: { viewingAs: boolean; isSample: boolean; git?: GitState }) {
  if (viewingAs) return viewAsBlocked
  if (isSample || git?.isSample) return 'Not while the synthetic sample data is loaded.'
  if (!git?.connected) return 'Connect Git storage (Admin → Data & history) first: the export is saved in Git.'
  if (git.readOnly) return 'Your Git token is read-only, so the export cannot be deleted from Git.'
  return ''
}
export function exportPageActions(viewer: { other: boolean; canImport: boolean; viewingAs: boolean; isSample: boolean; git?: GitState }): ViewPageAction[] {
  if (!viewer.other || !viewer.canImport) return []
  const blocked = exportDeleteBlocked(viewer)
  return [{ key: 'delete-export', label: 'Delete this export…', danger: true, blocked, title: blocked || 'Delete this Windchill export here and its files in Git (one commit; the history stays in GitHub)' }]
}

// The confirmation shown on the page the app opens after the view or export is gone (Home, or the start page).
export const myViewDeletedText = (name: string) => `Your view “${name}” was deleted from this browser with its saved data. Your server's PAT is kept; nothing was changed in Azure DevOps or Git. Add a view again in My settings → My views.`
export const exportDeletedText = (name: string, deleted: string[]) => `The Windchill export “${name}” was deleted here${deleted.length ? ` and in Git in one commit (${deleted.join(', ')}; the history stays in GitHub)` : '; it had no files in Git'}. Import it again from Release Details → Import Windchill export.`
