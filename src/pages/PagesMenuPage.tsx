import { useState } from 'react'
import { recordJob } from '../backgroundJobs'
import { DataTable, type DataColumn } from '../components/DataTable'
import { EditPageDialog, GroupDialog, type GroupEdit, type PageEdit } from '../components/PageDialogs'
import { Modal, Notice, Page, Pill, SaveQueueStatus, SettingsSummary, Panel, TablePanel, WriteBlocked } from '../components/ui'
import { outcomeText } from '../gitSaveQueue'
import { addGroup, addPageReason, deleteReason, findGroup, hideReason, isHidden, setHidden, gitReasonOf, groupReason, groupsForAdding, isDashboard, isGroupOwner, isPageOwner, kindLabel, kindOf, menuGroups, moveGroup, movePage, pageMenuReason, pagesOfGroup, placePage, placementOf, removeGroup, removeGroupReason, removePlacement, renameGroup, setGroupSettings, type MenuGroup, type MenuLayout, type Viewer } from '../menuLayout'
import { hasTable, onDemandPath, renamePage, type OnDemandPage } from '../onDemand'
import { pageFolder } from '../rowFiles'
import { maxTimeoutMinutes, minTimeoutMinutes, timeoutError } from '../rowLocks'
import { dashboardPath } from '../dashboardPages'
import type { GitStorage } from '../useGitStorage'
import type { MenuLayoutStore } from '../useMenuLayout'
import type { OnDemandStore } from '../useOnDemand'
import type { MenuPageName } from '../pageNames'
import { useToolValidationsEnv } from '../useToolValidations'
import { ConvertDialog, RemovePageDialog } from './OnDemandPage'

// PGB-12: Admin → Pages & menu — the menu groups (built-in and custom) and the added pages, each a list in the shared
// table (UI-STANDARDS §5) with its row actions; add and edit in pop-ups (§3/§4). Who may change what is shown: every
// button the viewer may not use is disabled with the reason (CON-102), one line above each table and as the tooltip.
// PGB-17: duplicates — page names two or more pages share (saved at the same time, or older files in Git): both pages
// are kept and listed here, each with its group, with the suggestion to rename one.
export function PagesMenuPage({ git, store, menu, viewer, onOpen, onAddPage, duplicates = [] }: { git: GitStorage; store: OnDemandStore; menu: MenuLayoutStore; viewer: Viewer; onOpen: (id: string) => void; onAddPage: (group?: string) => void; duplicates?: MenuPageName[][] }) {
  // TVL-15: the pages that live as an owners' tab of Tool Validations are marked so (hidden from the menu).
  const toolTabs = useToolValidationsEnv()?.store.shown.tabs ?? []
  const layout = menu.layout
  const groups = menuGroups(layout)
  const pageIds = store.pages.map((page) => page.id)
  const [groupDialog, setGroupDialog] = useState<MenuGroup | 'new' | null>(null)
  const [pageDialog, setPageDialog] = useState<OnDemandPage | null>(null)
  const [removing, setRemoving] = useState<OnDemandPage | null>(null)
  const [removingGroup, setRemovingGroup] = useState<MenuGroup | null>(null)
  const [converting, setConverting] = useState<OnDemandPage | null>(null)
  const [timeoutOpen, setTimeoutOpen] = useState(false)
  const [error, setError] = useState('')
  const gitReason = gitReasonOf(git)
  const groupsReason = gitReason || groupReason(viewer)
  const addable = groupsForAdding(viewer, layout)
  // OND-32: converting a table page to row files — Tool Owner only. OND-36: the row lock timeout — the Admin role and
  // the Tool Owner (“Shared setup in Git …” or “Manage pages and menu groups”); nobody without the roles file (CON-101).
  // PGB-20: deleting a page — the Tool Owner only (others hide it, PGB-19).
  const deleteBlock = gitReason || deleteReason(viewer)
  const convertReason = gitReason || (viewer.manager && !viewer.readOnly ? '' : 'Only a Tool Owner (“Manage pages and menu groups”) converts a page to row files.')
  const timeoutReason = gitReason || (viewer.readOnly ? 'Read only: the access roles are not loaded yet, so nothing can be changed here.' : viewer.manager || viewer.can('storage.shared') ? '' : 'Only an Admin (“Shared setup in Git, master data, audit, KPI tracker”) or a Tool Owner changes the row lock timeout.')
  const addReason = gitReason || (addable.length || (viewer.manager && !viewer.readOnly) ? '' : viewer.readOnly ? addPageReason(viewer, layout, 'on-demand') : 'You co-own no group that accepts added pages. A Tool Owner adds pages anywhere and names the co-owners of each group.')

  async function saveLayout(next: MenuLayout, label: string, message: string) {
    setError('')
    try {
      const saved = await menu.save(next, message)
      recordJob('pages-menu', label, { text: `${outcomeText(saved)} ${menu.path}` })
    } catch (failure) {
      const text = failure instanceof Error ? failure.message : String(failure)
      setError(text); recordJob('pages-menu', label, { text, failed: true })
      throw failure
    }
  }
  const run = (action: () => Promise<void>) => { void action().catch(() => undefined) }

  const pagesIn = (group: MenuGroup) => pagesOfGroup(layout, store.pages, group.id)
  const groupColumns: DataColumn<MenuGroup>[] = [
    { id: 'pg-order', label: 'Order', align: 'right', value: (group) => groups.indexOf(group) + 1 },
    { id: 'pg-group', label: 'Group', value: (group) => group.name, render: (group) => <strong>{group.name}</strong> },
    { id: 'pg-kind', label: 'Kind', value: (group) => group.builtIn ? 'Built-in' : 'Custom', render: (group) => <Pill tone={group.builtIn ? 'neutral' : 'info'}>{group.builtIn ? 'Built-in' : 'Custom'}</Pill> },
    { id: 'pg-accepts', label: 'Accepts added pages', value: (group) => group.acceptsPages ? 'Yes' : 'No' },
    { id: 'pg-owners', label: 'Co-owners', value: (group) => group.owners.join(', '), render: (group) => group.owners.length ? group.owners.join(', ') : <span className="muted">—</span> },
    { id: 'pg-pages', label: 'Added pages', align: 'right', value: (group) => pagesIn(group).length },
    { id: '@actions', label: 'Actions', sortable: false, export: false, render: (group) => {
      const custom = groups.filter((entry) => !entry.builtIn), at = custom.indexOf(group)
      const removeReason = groupsReason || removeGroupReason(layout, group.id, pageIds)
      const add = gitReason || addPageReason(viewer, layout, group.id)
      return <span className="button-row nowrap">
        <button type="button" className="ghost" disabled={Boolean(add)} title={add || undefined} aria-label={`Add a page to ${group.name}`} onClick={() => onAddPage(group.id)}>＋ Page</button>
        <button type="button" className="ghost" disabled={Boolean(groupsReason)} title={groupsReason || undefined} aria-label={`Edit group ${group.name}`} onClick={() => setGroupDialog(group)}>Edit</button>
        {!group.builtIn && <>
          <button type="button" className="ghost" disabled={Boolean(groupsReason) || at === 0} title={groupsReason || undefined} aria-label={`Move group ${group.name} up`} onClick={() => run(() => saveLayout(moveGroup(layout, group.id, -1), `Move group · ${group.name}`, `Pages & menu: move the group ${group.name} up`))}>↑</button>
          <button type="button" className="ghost" disabled={Boolean(groupsReason) || at === custom.length - 1} title={groupsReason || undefined} aria-label={`Move group ${group.name} down`} onClick={() => run(() => saveLayout(moveGroup(layout, group.id, 1), `Move group · ${group.name}`, `Pages & menu: move the group ${group.name} down`))}>↓</button>
          <button type="button" className="text-button danger-text" disabled={Boolean(removeReason)} title={removeReason || undefined} aria-label={`Remove group ${group.name}`} onClick={() => setRemovingGroup(group)}>Remove</button>
        </>}
      </span>
    } },
  ]

  interface Row { page: OnDemandPage; group: MenuGroup; position: number; count: number }
  const rows: Row[] = groups.flatMap((group) => { const list = pagesIn(group); return list.map((page, index) => ({ page, group, position: index, count: list.length })) })
  const pageColumns: DataColumn<Row>[] = [
    { id: 'pp-group', label: 'Group', value: (row) => `${String(groups.indexOf(row.group)).padStart(3, '0')} ${row.group.name}`, exportValue: (row) => row.group.name, render: (row) => row.group.name },
    { id: 'pp-order', label: 'Order', align: 'right', value: (row) => row.position + 1 },
    { id: 'pp-page', label: 'Page', value: (row) => row.page.name, render: (row) => <><span aria-hidden="true">{placementOf(layout, row.page.id).icon}</span> <strong>{row.page.name}</strong>{isHidden(layout, row.page.id) && <> <Pill tone="neutral">Hidden</Pill></>}{toolTabs.some((tab) => tab.pageId === row.page.id) && <> <Pill tone="info">Tab of Tool Validations</Pill></>}{row.page.description && <><br /><small className="muted">{row.page.description}</small></>}</> },
    { id: 'pp-type', label: 'Type', value: (row) => kindLabel(placementOf(layout, row.page.id).type) },
    { id: 'pp-owners', label: 'Co-owners', value: (row) => placementOf(layout, row.page.id).owners.join(', '), render: (row) => { const placed = placementOf(layout, row.page.id), listed = placed.ownersFromList?.length ?? 0
      // TVL-25: the co-owners written from the Tool Validations list (a tab's page) are said so.
      return placed.owners.length ? <>{placed.owners.join(', ')}{listed > 0 && <><br /><small className="muted">{listed} from the Tool Validations list</small></>}</> : <span className="muted">—</span> } },
    { id: 'pp-columns', label: 'Columns', align: 'right', value: (row) => row.page.columns.length },
    { id: 'pp-rows', label: 'Rows', align: 'right', value: (row) => store.full(row.page.id)?.rows.length ?? row.page.rows.length },
    // OND-31: how the page is kept in Git — one file, or one file per row.
    { id: 'pp-storage', label: 'Storage', value: (row) => row.page.storage === 'rows' ? 'Row files' : isDashboard(layout, row.page.id) ? 'Dashboard' : 'One file', render: (row) => row.page.storage === 'rows' ? <Pill tone="open">Row files</Pill> : isDashboard(layout, row.page.id) ? <span className="muted">—</span> : 'One file' },
    { id: '@actions', label: 'Actions', sortable: false, export: false, render: (row) => {
      const reason = gitReason || pageMenuReason(viewer, layout, row.page.id)
      return <span className="button-row nowrap">
        <button type="button" className="text-button" aria-label={`Open ${row.page.name}`} onClick={() => onOpen(row.page.id)}>Open →</button>
        <button type="button" className="ghost" disabled={Boolean(reason)} title={reason || undefined} aria-label={`Edit page ${row.page.name}`} onClick={() => setPageDialog(row.page)}>Edit</button>
        <button type="button" className="ghost" disabled={Boolean(reason) || row.position === 0} title={reason || undefined} aria-label={`Move page ${row.page.name} up`} onClick={() => run(() => saveLayout(movePage(layout, store.pages, row.page.id, -1), `Move page · ${row.page.name}`, `Pages & menu: move ${row.page.name} up in ${row.group.name}`))}>↑</button>
        <button type="button" className="ghost" disabled={Boolean(reason) || row.position === row.count - 1} title={reason || undefined} aria-label={`Move page ${row.page.name} down`} onClick={() => run(() => saveLayout(movePage(layout, store.pages, row.page.id, 1), `Move page · ${row.page.name}`, `Pages & menu: move ${row.page.name} down in ${row.group.name}`))}>↓</button>
        {row.page.storage !== 'rows' && hasTable(kindOf(layout, row.page.id)) && store.inGit(row.page.id) && <button type="button" className="ghost" disabled={Boolean(convertReason)} title={convertReason || undefined} aria-label={`Convert ${row.page.name} to row files`} onClick={() => setConverting(row.page)}>Convert…</button>}
        {(() => { const hide = gitReason || hideReason(viewer, layout, row.page.id), hidden = isHidden(layout, row.page.id); return <button type="button" className="ghost" disabled={Boolean(hide)} title={hide || undefined} aria-label={`${hidden ? 'Show' : 'Hide'} page ${row.page.name}`} onClick={() => run(() => saveLayout(setHidden(layout, row.page.id, !hidden, pageIds), `${hidden ? 'Show' : 'Hide'} page · ${row.page.name}`, `Pages & menu: ${hidden ? 'show' : 'hide'} the page ${row.page.name}`))}>{hidden ? 'Show' : 'Hide'}</button> })()}
        <button type="button" className="text-button danger-text" disabled={Boolean(deleteBlock)} title={deleteBlock || undefined} aria-label={`Delete page ${row.page.name}`} onClick={() => setRemoving(row.page)}>Delete</button>
      </span>
    } },
  ]

  // What the viewer may do, said once at the top.
  const ownGroups = groups.filter((group) => isGroupOwner(layout, group.id, viewer.email)).map((group) => group.name)
  const ownPages = store.pages.filter((page) => isPageOwner(layout, page.id, viewer.email)).map((page) => page.name)
  const pageRowsReason = gitReason || (rows.some((row) => !pageMenuReason(viewer, layout, row.page.id)) ? '' : rows.length ? pageMenuReason(viewer, layout, rows[0].page.id) : '')

  return <Page className="pages-menu-page" intro="The menu groups and the pages added to them without a release of the tool — shared with everyone through Git."
    actions={<>
      <button type="button" className="ghost" disabled={Boolean(addReason)} title={addReason || undefined} onClick={() => onAddPage()}>＋ Add page…</button>
      <button type="button" className="ghost" disabled={Boolean(groupsReason)} title={groupsReason || undefined} onClick={() => setGroupDialog('new')}>＋ New group…</button>
      {git.connected && <button type="button" className="ghost" onClick={() => { void menu.reload(); void store.reload() }}>↻ Reload from Git</button>}
    </>}>
    {gitReason && <Notice tone={git.isSample ? 'warning' : 'info'}>{gitReason}</Notice>}
    {menu.error && <Notice tone="error">Pages & menu: {menu.error} The menu last read is kept.</Notice>}
    {store.errors.map((entry) => <Notice key={entry} tone="error">On-Demand: {entry}</Notice>)}
    {error && <Notice tone="error">{error}</Notice>}
    {duplicates.length > 0 && <Notice tone="warning" className="pgb-duplicates"><p><strong>Pages with the same name:</strong> {duplicates.map((set) => `“${set[0].name}” (${set.map((entry) => entry.group).join(', ')})`).join('; ')}. Both pages are kept and the menu shows each with its group; rename one with Edit so everyone can tell them apart.</p></Notice>}
    <SaveQueueStatus state={menu.queue} onRetry={() => void menu.retry()} />
    <Panel eyebrow="PAGES & MENU" title="Your rights here" info={<>A <strong>Tool Owner</strong> (the role right “Manage pages and menu groups”) creates, renames, reorders, configures and removes groups — built-in groups only configured — and adds, moves, hides, shows and deletes any page. A <strong>group co-owner</strong>, while the group accepts added pages, adds, renames, reorders, hides and shows the group’s pages (only a Tool Owner deletes a page), names their co-owners, sets them up and edits their rows. A <strong>page co-owner</strong> sets up that page, edits its rows and hides or shows it. A hidden page leaves the menu, Home and search for everyone; its data stays in Git and dashboards keep reading it. The role rights “Set up On-Demand pages” and “Edit On-Demand data (rows)” apply to every such page. Saved in Git as {menu.path} (the pages’ tables as {onDemandPath('<page-id>')}); two saves at the same time are merged group by group and page by page.{menu.history && <> <a href={menu.history} target="_blank" rel="noreferrer">History in GitHub</a></>}</>}>
      <SettingsSummary rows={[
        ['Groups', viewer.readOnly ? 'Read only (the access roles are not loaded).' : viewer.manager ? 'You manage every group and page (Tool Owner).' : 'View only: a Tool Owner changes the groups.'],
        ['Groups you co-own', ownGroups.join(', ')],
        ['Pages you co-own', ownPages.join(', ')],
        ['Your work email', viewer.email || 'Not set: ownership is matched by the work email in My settings.'],
      ]} />
    </Panel>
    <TablePanel className="pgb-groups" eyebrow="PAGES & MENU" title="Menu groups" detail="Built-in groups keep their name and place; groups of your own follow On-Demand in the menu."
      info="Accepts added pages: whether pages can be added to (or moved into) the group. Co-owners: people who manage the group’s pages. A group of your own can be removed only when it holds no page.">
      <WriteBlocked reason={groupsReason && !gitReason ? groupsReason : ''} />
      <DataTable id="pages-menu:groups" columns={groupColumns} rows={groups} rowKey={(group) => group.id} exportName="Menu groups" status={`${groups.length} of ${groups.length} groups`} />
    </TablePanel>
    <TablePanel className="pgb-pages" eyebrow="PAGES & MENU" title="Pages" detail="Each added page in its group, in menu order.">
      <WriteBlocked reason={pageRowsReason && !gitReason ? pageRowsReason : ''} />
      <DataTable id="pages-menu:pages" columns={pageColumns} rows={rows} rowKey={(row) => row.page.id} exportName="Pages" status={`${rows.length} of ${rows.length} page${rows.length === 1 ? '' : 's'}`} />
    </TablePanel>
    <Panel className="pgb-row-locks" eyebrow="PAGES & MENU" title="Row locks" action={<button type="button" className="ghost" disabled={Boolean(timeoutReason)} title={timeoutReason || undefined} onClick={() => setTimeoutOpen(true)}>Change…</button>}
      info={<>On a table page converted to row files, Edit takes the row’s lock: others see who is editing and cannot edit that row; viewing, other rows, adding rows, Insights and dashboards never wait. After this many minutes without activity the edit is closed (a warning comes 2 minutes before), its unsaved values are kept as a draft in that browser for one day, and the lock is released. A Tool Owner or the page’s co-owners can release a stuck lock in the row’s drawer. Saved in Git as row-locks.json for everyone.{git.rowLocksHistory && <> <a href={git.rowLocksHistory} target="_blank" rel="noreferrer">History in GitHub</a></>}</>}>
      <WriteBlocked reason={timeoutReason && !gitReason ? timeoutReason : ''} />
      <SettingsSummary rows={[
        ['Inactivity timeout', `${store.lockSettings.timeoutMinutes} minute${store.lockSettings.timeoutMinutes === 1 ? '' : 's'}`],
        ['Pages with row files', store.pages.filter((page) => page.storage === 'rows').map((page) => page.name).join(', ')],
      ]} />
    </Panel>
    {timeoutOpen && <TimeoutDialog minutes={store.lockSettings.timeoutMinutes} onCancel={() => setTimeoutOpen(false)} onSave={async (minutes) => {
      try {
        const saved = await store.saveLockSettings({ timeoutMinutes: minutes }, `Row locks: inactivity timeout ${minutes} minutes`)
        recordJob('pages-menu', 'Row lock timeout', { text: `${outcomeText(saved)} row-locks.json — ${minutes} minute${minutes === 1 ? '' : 's'}` })
      } catch (failure) { recordJob('pages-menu', 'Row lock timeout', { text: failure instanceof Error ? failure.message : String(failure), failed: true }); throw failure }
      setTimeoutOpen(false)
    }} />}
    {converting && <ConvertDialog page={store.full(converting.id) ?? converting} onCancel={() => setConverting(null)} onConvert={async () => {
      try {
        const done = await store.convert(converting.id)
        recordJob(`pages:${converting.id}`, `Convert to row files · ${converting.name}`, { text: `Converted ${onDemandPath(converting.id)} to ${pageFolder(converting.id)}/ — ${done.page.rows.length} row file${done.page.rows.length === 1 ? '' : 's'}, page.json and counter.json in one commit. — ${done.commitUrl}` })
      } catch (failure) { recordJob(`pages:${converting.id}`, `Convert to row files · ${converting.name}`, { text: failure instanceof Error ? failure.message : String(failure), failed: true }); throw failure }
      setConverting(null)
    }} />}
    {groupDialog && <GroupDialog layout={layout} group={groupDialog === 'new' ? null : groupDialog} onCancel={() => setGroupDialog(null)} onSave={async (edit: GroupEdit) => {
      if (groupDialog === 'new') { const added = addGroup(layout, edit.name, { acceptsPages: edit.acceptsPages, owners: edit.owners }); await saveLayout(added.layout, `Add group · ${edit.name.trim()}`, `Pages & menu: add the group ${edit.name.trim()}`) }
      else {
        let next = setGroupSettings(layout, groupDialog.id, { acceptsPages: edit.acceptsPages, owners: edit.owners })
        if (!groupDialog.builtIn && edit.name.trim() !== groupDialog.name) next = renameGroup(next, groupDialog.id, edit.name)
        await saveLayout(next, `Edit group · ${groupDialog.name}`, `Pages & menu: change the group ${groupDialog.name}`)
      }
      setGroupDialog(null)
    }} />}
    {pageDialog && <EditPageDialog viewer={viewer} layout={layout} page={pageDialog} pending={store.pending(pageDialog.id).length > 0} onCancel={() => setPageDialog(null)} onSave={async (edit: PageEdit) => {
      const stored = store.pages.find((entry) => entry.id === pageDialog.id) ?? pageDialog
      if (edit.name.trim() !== stored.name || edit.description.trim() !== stored.description) {
        const saved = await store.save(renamePage(stored, edit.name, edit.description), `Pages & menu: rename ${stored.name} to ${edit.name.trim()}`)
        recordJob(`pages:${stored.id}`, `Rename page · ${stored.name}`, { text: `${outcomeText(saved)} ${onDemandPath(stored.id)}` })
      }
      const before = placementOf(layout, stored.id)
      if (!before.placed || before.type !== edit.kind || before.icon !== edit.icon || before.group !== edit.group || before.owners.join() !== edit.owners.join() || Boolean(before.hidden) !== edit.hidden) {
        const target = findGroup(layout, edit.group)?.name ?? edit.group
        await saveLayout(placePage(layout, stored.id, { type: edit.kind, icon: edit.icon, group: edit.group, owners: edit.owners, hidden: edit.hidden }, pageIds), `Edit page · ${edit.name.trim()}`, `Pages & menu: ${before.group !== edit.group ? `move ${edit.name.trim()} to ${target}` : `change ${edit.name.trim()}`}`)
      }
      setPageDialog(null)
    }} />}
    {removing && <RemovePageDialog page={store.full(removing.id) ?? removing} inGit={store.inGit(removing.id)} onCancel={() => setRemoving(null)} onRemove={async () => {
      await store.remove(removing.id, `Pages & menu: delete the page ${removing.name} (${removing.rows.length} rows)`)
      // DSH-01: a Dashboard page's blocks (dashboards/<page-id>.json) go with it.
      const dashboard = isDashboard(layout, removing.id) && await git.removeDashboard(removing.id, `Pages & menu: remove the dashboard ${removing.name}`)
      recordJob(`pages:${removing.id}`, `Delete page · ${removing.name}`, { text: `Deleted ${removing.storage === 'rows' ? `${pageFolder(removing.id)}/` : onDemandPath(removing.id)}${dashboard ? ` and ${dashboardPath(removing.id)}` : ` with its ${removing.rows.length} row${removing.rows.length === 1 ? '' : 's'}`}; its history stays in GitHub.` })
      if (layout.pages[removing.id]) await saveLayout(removePlacement(layout, removing.id), `Remove page · ${removing.name}`, `Pages & menu: remove the page ${removing.name}`)
      setRemoving(null)
    }} />}
    {removingGroup && <RemoveGroupDialog group={removingGroup} onCancel={() => setRemovingGroup(null)} onRemove={async () => {
      await saveLayout(removeGroup(layout, removingGroup.id, pageIds), `Remove group · ${removingGroup.name}`, `Pages & menu: remove the group ${removingGroup.name}`)
      setRemovingGroup(null)
    }} />}
  </Page>
}

// PGB-06: removing a group asks first (only an empty group of your own can be removed).
function RemoveGroupDialog({ group, onCancel, onRemove }: { group: MenuGroup; onCancel: () => void; onRemove: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const remove = async () => { setBusy(true); setError(''); try { await onRemove() } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); setBusy(false) } }
  return <Modal eyebrow="PAGES & MENU · GROUPS" title="Remove the group" onClose={() => { if (!busy) onCancel() }}>
    <form onSubmit={(event) => { event.preventDefault(); void remove() }}>
      <p>Remove the group <strong>{group.name}</strong> from the menu, for everyone? It holds no page{group.owners.length ? `; its ${group.owners.length} co-owner${group.owners.length === 1 ? '' : 's'} lose${group.owners.length === 1 ? 's' : ''} it` : ''}.</p>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="modal-actions"><button type="button" className="ghost" disabled={busy} onClick={onCancel}>Cancel</button><button className="danger-button" disabled={busy}>{busy ? 'Removing…' : 'Remove group'}</button></div>
    </form>
  </Modal>
}

// OND-36: the row lock timeout in a pop-up (UI-STANDARDS §4): whole minutes, 1 to 240; saved to Git for everyone.
function TimeoutDialog({ minutes, onCancel, onSave }: { minutes: number; onCancel: () => void; onSave: (minutes: number) => Promise<void> }) {
  const [value, setValue] = useState(String(minutes))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async () => {
    const problem = timeoutError(value)
    if (problem) { setError(problem); return }
    setBusy(true); setError('')
    try { await onSave(Number(value)) } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); setBusy(false) }
  }
  return <Modal eyebrow="PAGES & MENU · ROW LOCKS" title="Row lock timeout" onClose={() => { if (!busy) onCancel() }}>
    <form onSubmit={(event) => { event.preventDefault(); void submit() }}>
      <label>Inactivity timeout (minutes)<input type="number" min={minTimeoutMinutes} max={maxTimeoutMinutes} step={1} required value={value} onChange={(event) => { setValue(event.target.value); setError('') }} /><small>An edit holding a row’s lock is closed after this many minutes without activity; its unsaved values are kept as a draft in that browser for one day. {minTimeoutMinutes} to {maxTimeoutMinutes}; 15 by default.</small></label>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="modal-actions"><button type="button" className="ghost" disabled={busy} onClick={onCancel}>Cancel</button><button className="primary" disabled={busy}>{busy ? 'Saving to Git…' : 'Save to Git'}</button></div>
    </form>
  </Modal>
}
