import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { ListCatalogContext } from '../useSharedLists'
import { OlderCopies } from '../components/OlderCopies'
import { ViewActions } from '../components/ViewActions'
import { useUnsavedEdit } from '../pageEdits'
import { PageNameField } from '../components/PageDialogs'
import { usePageNameClash } from '../usePageNames'
import { recordJob, runInBackground } from '../backgroundJobs'
import { DataTable, type DataColumn } from '../components/DataTable'
import { ResultTabs } from '../components/ResultTabs'
import { Drawer, EmptyState, Info, Modal, Notice, Page, Pill, SaveQueueStatus, TablePanel, WriteBlocked } from '../components/ui'
import { outcomeText, type QueuedOutcome } from '../gitSaveQueue'
import { formatDateTime } from '../format'
import { applyColumns, hasTable, isRowHidden, withoutHidden, hasRowKeys, setKeyPrefix, cellProblem, cellSortValue, cellText, columnDrafts, columnEffects, columnsError, currencyCodes, defaultCurrency, displayText, filterRows, hasOptions, lastUpdate, maxLog, maxLongValue, moneyOf, newId, onDemandPath, pageFileBytes, suggestRowFiles, renamePage, rowError, rowId, rowSave, valuesOf, type ColumnDraft, type OnDemandColumn, type OnDemandPage as PageFile, type OnDemandRow, type OnDemandValue } from '../onDemand'
import { useWriteBlock } from '../useCan'
import type { GitStorage } from '../useGitStorage'
import type { OnDemandStore } from '../useOnDemand'
import { deleteReason, findGroup, hideReason, isHidden, pageMenuReason, pageRights, placementOf, removePlacement, setHidden, type PageKind, type Viewer } from '../menuLayout'
import type { MenuLayoutStore } from '../useMenuLayout'
import { InsightsTab } from './OnDemandInsights'
import type { PersonalViewsStore } from '../usePersonalViews'
import { countdown, draftRestore, editPhase, heldBy, shouldRenew, type RowDraft, type RowLock } from '../rowLocks'
import { useRowLocks } from '../useRowLocks'
import { useNow } from '../useNow'
import type { DataModeStore } from '../useDataMode'
import { isSamplePage, sampleNotice, sampleReason, sampleRowCount } from '../sampleRows'
import { ExportNoteContext, sampleExportNote } from '../exportNote'
import { PublishDialog } from '../components/PublishDialog'
import { prepareTable, useSchedules, viewerChoice, type PublishAuthorization } from '../publishRun'
import { publishKey } from '../publishSchedule'
import { ReplaceDialog } from '../components/ReplaceDialog'
import { ColumnListEditor } from '../components/ColumnListEditor'
import { applyOnDemandReplace, distinctValues, onDemandReplaceCommit, onDemandReplacePlan, replaceError, replaceMessage, replaceableColumns } from '../replaceValues'
import { TemplateDialog, UploadDialog } from '../components/BulkUploadDialogs'
import { applyUpload, uploadCommit, uploadResult, type UploadDone, type UploadPlan } from '../bulkUpload'

// OND-03…OND-07 One On-Demand page (CoNQ, or one added under On-Demand): a work table in the shared DataTable — one
// column per configured column, search, sort, the row count and Export. OND-27: a click on a row (or Enter / Space on it)
// opens the row in a drawer from the right — its ID, key, who added it and when, every value with its column's
// description, and its History; Edit there (and ＋ Add row, an empty drawer) turns the values into fields. OND-28: every
// change is saved to Git at once — the drawer's Save to Git, Remove row (after a pop-up), Set up columns…, Rename page…
// and each Insights change — through the queued, merged save of GIT-17, its progress and result in Background jobs (§8);
// no unsaved-changes bar any more. Add, rename and remove a page with the setup right. OND-11: two tabs, Data (the table)
// and Insights (charts and tables from its rows, src/pages/OnDemandInsights.tsx), the choice remembered per page.
// OND-19…25: each row's readable ID (given when the row is saved), who added it and when, its update log (History in
// the drawer, Last updated by / on as columns hidden at first); Long text and Currency columns; a description per column.
// me: who is editing — the viewer's work email, else their name (OND-20).
// PGB-01: kind — a Table page has the Data table only; a Table + Insights page (CoNQ and every page from before the
// page builder) has both tabs. PGB-09…PGB-11: the rights follow the role rights (CON-103) or a co-ownership of the page
// or its group (menu-layout.json); Add page… opens the shared Add page pop-up (PGB-05).
// OND-63…OND-67: dataMode — the viewer's Live | Sample toggle of the page (src/useDataMode.ts); in Sample the store gives
// the page with its sample rows, every change is disabled with the reason and exports are marked.
// OND-73…OND-79, OND-90: publisherName — the name a published interactive HTML file says it was published by.
// TVL-15: embedded — the page shown as an owners' tab of Tool Validations: no page frame, and nothing of the menu (＋ Add
// page…, Rename page…, Hide page, Delete page… and the hidden-page notice): the tab is renamed, moved and removed on
// Tool Validations → Setup → Tabs.
export function OnDemandPage({ git, store, pageId, me, onOpen, kind = 'table-insights', menu, viewer, addPageReason = '', onAddPage, views, dataMode, publisherName = '', publisher, embedded = false }: { git: GitStorage; store: OnDemandStore; pageId: string; me: string; onOpen: (id: string) => void; kind?: PageKind; menu: MenuLayoutStore; viewer: Viewer; addPageReason?: string; onAddPage: () => void; views?: PersonalViewsStore; dataMode?: DataModeStore; publisherName?: string; publisher: PublishAuthorization; embedded?: boolean }) {
  // OND-39: the page with its hidden rows (listed only with Show hidden rows); the Insights get it without them.
  const listed = store.pages.find((entry) => entry.id === pageId) ?? store.pages[0]
  const page = (listed && store.full(listed.id)) || listed
  const [showHidden, setShowHidden] = useState(() => { try { return (JSON.parse(localStorage.getItem(showHiddenKey) ?? '[]') as string[]).includes(pageId) } catch { return false } })
  const toggleHiddenRows = (on: boolean) => { setShowHidden(on); try { const list = (JSON.parse(localStorage.getItem(showHiddenKey) ?? '[]') as string[]).filter((id) => id !== pageId); localStorage.setItem(showHiddenKey, JSON.stringify(on ? [...list, pageId] : list)) } catch { /* this visit only */ } }
  const [search, setSearch] = useState('')
  // UI-29: the rows the table shows (search, column filters, closed groups left out), for the Edit button's Previous / Next.
  const shownRef = useRef<OnDemandRow[]>([])
  // OND-27: the row open in the drawer (by id; a new row until it is saved), the rows in the order shown when it was
  // opened (‹ ›), and whether it opens for editing.
  const [drawer, setDrawer] = useState<{ id: string; order: string[]; draft?: OnDemandRow; edit: boolean } | null>(null)
  const [removing, setRemoving] = useState<OnDemandRow | null>(null)
  const [columnsOpen, setColumnsOpen] = useState(false)
  const [pageDialog, setPageDialog] = useState<'rename' | 'remove' | null>(null)
  // OND-73, OND-90: the Publish interactive HTML pop-up, and the page's schedule on this computer (its last failure shown, OND-79).
  const [publishing, setPublishing] = useState<string | null>(null)
  const publishScope = publishKey(publisher.repository, publisher.publisher, pageId)
  const schedules = useSchedules()
  const schedule = publishScope ? schedules[publishScope] : undefined
  // OND-100: the Replace… pop-up (a value of one column replaced in every row that holds it).
  const [replacing, setReplacing] = useState(false)
  // OND-103…OND-108: the Download Excel template and Upload Excel pop-ups (bulk upload).
  const [bulk, setBulk] = useState<'template' | 'upload' | null>(null)
  const block = useWriteBlock()
  // OND-07: what may be changed — the rights of the viewer's roles, a Git token that can save, no synthetic sample.
  const gitReason = !git.connected ? 'Connect Git storage (Admin → Data & sharing) to change the On-Demand pages; they are shared through Git.' : git.readOnly ? 'View only: your Git token can read but not save.' : git.isSample ? 'Synthetic sample data is loaded. Saving to Git is disabled.' : ''
  // OND-66: in Sample nothing of the page is saved — rows, columns, charts, its name, converting or deleting it.
  const sample = isSamplePage(page)
  const sampleBlock = sample && page ? sampleReason(page.name) : ''
  const rights = page ? pageRights(viewer, menu.layout, page.id) : { setup: false, rows: false, owner: false }
  const rowsReason = gitReason || sampleBlock || (rights.rows ? '' : block.noteFor('on this page', 'ondemand.edit'))
  const setupReason = gitReason || sampleBlock || (rights.setup ? '' : block.noteFor('on this page', 'ondemand.setup'))
  const canRows = !rowsReason, canSetup = !setupReason
  // PGB-07: renaming and removing the page is a change of the menu: a Tool Owner, a co-owner of its group, or in
  // On-Demand a role allowed "Set up On-Demand pages".
  const menuReason = gitReason || sampleBlock || (page ? pageMenuReason(viewer, menu.layout, page.id) : '')
  // PGB-19, PGB-20: hide / show the page (Tool Owner, its or its group's co-owners, in On-Demand "Set up On-Demand
  // pages"); delete it with its files — the Tool Owner only.
  const hidingReason = gitReason || (page ? hideReason(viewer, menu.layout, page.id) : '')
  const removeReason = gitReason || sampleBlock || deleteReason(viewer)
  // OND-73, OND-75, OND-90: publishing the page as an interactive HTML file — the Tool Owner and the page's (or its
  // group's) co-owners; never from Sample.
  const publishReason = publisher.reason(pageId)
  const hidden = page ? isHidden(menu.layout, page.id) : false
  const toggleHidden = () => { if (!page) return; const next = !hidden; void inBackground(`${next ? 'Hide' : 'Show'} page · ${page.name}`, async () => { const saved = await menu.save(setHidden(menu.layout, page.id, next, store.pages.map((entry) => entry.id)), `Pages & menu: ${next ? 'hide' : 'show'} the page ${page.name}`); return { value: saved, text: `${next ? 'Hidden from the menu, Home and search for everyone; its data stays in Git.' : 'Shown in the menu again.'} ${menu.path}` } }).catch(() => undefined) }
  const blocked = [...(rights.rows ? [] : ['ondemand.edit' as const]), ...(rights.setup ? [] : ['ondemand.setup' as const])]
  const rows = useMemo(() => page ? filterRows(showHidden ? page : withoutHidden(page), search) : [], [page, search, showHidden])
  // OND-35: the row locks of a row-file page — listed when the page opens, when the drawer opens a row and on the
  // open-app check (GIT-18).
  const locking = useRowLocks(git, page, me, store.lockSettings.timeoutMinutes)
  const refreshLocks = locking.refresh
  const drawerRow = drawer?.id
  useEffect(() => { if (drawerRow) void refreshLocks() }, [drawerRow, refreshLocks])
  // OND-101: the row locks are read again when Replace… opens, so its preview skips the rows being edited now.
  useEffect(() => { if (replacing) void refreshLocks() }, [replacing, refreshLocks])
  // OND-106: and when Upload Excel… opens, so its preview skips the rows being edited now.
  useEffect(() => { if (bulk === 'upload') void refreshLocks() }, [bulk, refreshLocks])
  const [converting, setConverting] = useState(false)
  // OND-62: the suggestion to convert a large single-file page, dismissed per page and person in this browser.
  const hintKey = `${me}|${pageId}`
  const [hintDismissed, setHintDismissed] = useState(() => readList(convertHintKey).includes(hintKey))
  const dismissHint = () => { setHintDismissed(true); try { localStorage.setItem(convertHintKey, JSON.stringify([...readList(convertHintKey).filter((entry) => entry !== hintKey), hintKey].slice(-200))) } catch { /* this visit only */ } }
  const singleFile = Boolean(page && page.storage !== 'rows' && hasTable(kind))
  const fileBytes = useMemo(() => page && singleFile ? pageFileBytes(page) : 0, [page, singleFile])
  // A lock is shown until it expires (checked every 30 seconds).
  const now = useNow().getTime()
  // GIT-18: what Load the newer data would drop: the columns or the name being set up (a change kept after a failed
  // save stays: it is applied on top of the page read again).
  useUnsavedEdit(!page ? false : columnsOpen ? `the columns you are setting up on ${page.name}` : pageDialog === 'rename' ? `the new name of ${page.name}` : false)
  if (!page) return <Page><EmptyState title="No On-Demand page yet." /></Page>
  const placement = placementOf(menu.layout, page.id)
  const groupName = findGroup(menu.layout, placement.group)?.name ?? 'On-Demand'
  const owners = [...placement.owners, ...(findGroup(menu.layout, placement.group)?.acceptsPages ? findGroup(menu.layout, placement.group)!.owners : [])]
  const queue = store.queue(page.id)
  const pending = store.pending(page.id)
  const rowFiles = page.storage === 'rows'
  // OND-120: where the page is kept in Git now (named after the page; looked up again after each save, OND-124).
  const path = store.filePath(page.id)
  // OND-35: on a row-file page a row another person is editing cannot be edited or removed here (viewing stays free);
  // the lock names the editor by their work email, so Edit needs one. OND-38: the Tool Owner and the page's co-owners
  // (also a co-owner of its group, who holds the page's rights, PGB-10) may release a stuck lock.
  const holderOf = (row: OnDemandRow) => locking.active && row.key ? heldBy(locking.locks[row.key]?.lock, me, now) : null
  const timeoutMinutes = store.lockSettings.timeoutMinutes
  const lockReason = (row: OnDemandRow) => { const lock = holderOf(row); return lock ? lockedText(lock, rowId(page, row) || row.key || 'this row', timeoutMinutes) : '' }
  const meReason = rowFiles && !me ? 'Set your work email in My settings to edit rows of this page: the row lock names who is editing.' : ''
  const editRowsReason = rowsReason || meReason
  const canRelease = !gitReason && !viewer.readOnly && (viewer.manager || rights.owner)
  // OND-32: Convert to row files — a Tool Owner, on a table page in Git that is still one file.
  const convertReason = gitReason || sampleBlock || (!store.inGit(page.id) ? `${page.name} is not in Git yet.` : viewer.manager ? '' : 'Only a Tool Owner (“Manage pages and menu groups”) converts a page to row files.')
  const showConvert = !rowFiles && hasTable(kind) && (viewer.manager || rights.setup)
  // OND-62: only the Tool Owner, who can convert, sees the suggestion; everyone else nothing.
  const suggestConvert = showConvert && viewer.manager && !convertReason && !hintDismissed && suggestRowFiles(page.rows.length, fileBytes)
  const resultText = (saved: QueuedOutcome, what = '') => `${outcomeText(saved)} ${store.filePath(page.id)}${what ? ` — ${what}` : ''}${saved.commitUrl ? ` — ${saved.commitUrl}` : ''}`

  // OND-28: one change of the page saved to Git at once, as a Background job (§8): "Saving to Git…", then its result.
  const saveChange = (what: string, change: (page: PageFile) => PageFile, message: string, keep = '') => inBackground(`Save to Git · ${page.name} · ${what}`, async () => {
    const saved = await store.update(page.id, change, message, { keep })
    return { value: saved, text: resultText(saved) }
  })
  // The drawer's Save to Git: the row added or changed, its log entry and (a new row) its ID given in this save.
  async function saveRow(row: OnDemandRow, isNew: boolean) {
    const action = isNew ? 'add' : 'update'
    const named = rowSave(store.stored(page.id) ?? page, row, action, { by: me })
    // A new row's key is made once, so the commit message names the key the row is saved with (OND-18).
    const keyed = { ...row, key: row.key ?? named.page.rows.find((entry) => entry.id === row.id)?.key }
    const known = page.rows.find((entry) => entry.id === row.id) ?? row
    return inBackground(`Save to Git · ${page.name} · ${isNew ? 'add row' : `row ${rowId(page, known) || known.key || ''}`}`, async () => {
      const saved = await store.update(page.id, (base) => rowSave(base, keyed, action, { by: me }).page, named.message)
      const after = saved.page.rows.find((entry) => entry.id === row.id)
      return { value: saved, text: resultText(saved, after ? `${isNew ? 'added' : 'updated'} ${rowId(saved.page, after) || after.key}` : '') }
    })
  }
  // OND-40: Delete row (the Tool Owner, a hidden row only): the row goes for good; its number is never given again.
  async function removeRowNow(row: OnDemandRow) {
    const { message } = rowSave(store.stored(page.id) ?? page, row, 'delete')
    await inBackground(`Delete row · ${page.name} · ${rowId(page, row) || row.key || rowLabel(page, row)}`, async () => {
      const saved = await store.update(page.id, (base) => rowSave(base, row, 'delete').page, message)
      return { value: saved, text: resultText(saved, `deleted ${rowId(page, row) || row.key || ''}`) }
    })
    if (drawer?.id === row.id) setDrawer(null)
  }
  // OND-39: Hide row / Show row — a change of the row, saved at once like an edit (its History says who and when).
  const hideRowNow = (row: OnDemandRow, hide: boolean) => {
    const action = hide ? 'hide' : 'show'
    const { message } = rowSave(store.stored(page.id) ?? page, row, action, { by: me })
    return inBackground(`${hide ? 'Hide' : 'Show'} row · ${page.name} · ${rowId(page, row) || row.key || rowLabel(page, row)}`, async () => {
      const saved = await store.update(page.id, (base) => rowSave(base, row, action, { by: me }).page, message)
      return { value: saved, text: resultText(saved, `${hide ? 'hidden' : 'shown'} ${rowId(page, row) || row.key || ''}`) }
    })
  }
  // OND-100…OND-102 Replace…: the right to edit the page's rows (OND-07, PGB-09, PGB-10); fails closed — without Git
  // that can save, in Sample, while viewing as someone else, before the roles are loaded, or without such a right.
  const replaceColumns = replaceableColumns(page)
  const replaceReason = editRowsReason || (viewer.viewingAs ? 'Read only while viewing as someone else: nothing is saved. Exit View as to replace values.' : '') || (!page.columns.length ? 'The page has no columns yet.' : !replaceColumns.length ? 'The page has no Text, Long text, Dropdown or Multi-select column.' : !page.rows.some((row) => !row.hidden) ? 'The page has no rows.' : '')
  // OND-101: rows being edited by someone else (row locks, OND-35) are skipped and counted; hidden rows are left as they are.
  const lockedKeys = new Set(page.rows.flatMap((row) => row.key && holderOf(row) ? [row.key] : []))
  const replaceLabel = (row: OnDemandRow) => rowId(page, row) || row.key || rowLabel(page, row)
  async function replaceNow(columnId: string, find: string, to: string) {
    const column = page.columns.find((entry) => entry.id === columnId)
    if (!column) return
    const preview = onDemandReplacePlan(page, columnId, find, to, { locked: lockedKeys })
    let done = { changed: 0, locked: 0 }
    await inBackground(`Replace · ${page.name} · ${column.name}`, async () => {
      const saved = await store.update(page.id, (base) => { const next = applyOnDemandReplace(base, columnId, find, to, { by: me, locked: lockedKeys }); done = next; return next.page }, onDemandReplaceCommit(page, column.name, find, to, preview.changes.length))
      return { value: saved, text: resultText(saved, `${replaceMessage(find, to, column.name)}: ${done.changed} row${done.changed === 1 ? '' : 's'}${done.locked ? `; ${done.locked} row${done.locked === 1 ? '' : 's'} being edited by someone else skipped` : ''}`) }
    })
    setReplacing(false)
  }
  // OND-103: the template — any viewer of a page with columns; not in Sample (made-up rows with real-looking IDs must
  // never come back as updates). OND-107: Upload Excel… — the right to edit the page's rows, failing closed as Replace….
  const templateReason = sample ? `Switch ${page.name} to Live to download its template: sample rows are made up.` : !page.columns.length ? 'The page has no columns yet.' : ''
  const uploadReason = editRowsReason || (viewer.viewingAs ? 'Read only while viewing as someone else: nothing is saved. Exit View as to upload.' : '') || (!page.columns.length ? 'The page has no columns yet.' : '')
  async function uploadNow(plan: UploadPlan, fileName: string) {
    let done: Omit<UploadDone, 'page'> = { added: 0, updated: 0, locked: 0, missing: 0 }
    await inBackground(`Bulk upload · ${page.name} · ${fileName}`, async () => {
      const saved = await store.update(page.id, (base) => { const next = applyUpload(base, plan, { by: me, fileName, locked: lockedKeys }); done = next; return next.page }, uploadCommit(page, fileName, plan))
      return { value: saved, text: resultText(saved, uploadResult(done, plan.errors.length)) }
    })
    setBulk(null)
  }
  const canDelete = !gitReason && !sample && viewer.manager && !viewer.readOnly
  const hiddenCount = page.rows.filter(isRowHidden).length
  const visibleCount = page.rows.length - hiddenCount
  const retry = () => inBackground(`Retry · ${page.name}`, async () => { await store.retry(page.id); return { value: null, text: `Saved to Git. ${store.filePath(page.id)}` } }).catch(() => undefined)

  const onSave = <small className="muted" title="Given when the row is saved to Git">on save</small>
  const open = (row: OnDemandRow, shown: OnDemandRow[], edit = false) => setDrawer({ id: row.id, order: shown.map((entry) => entry.id), edit })
  const columns: DataColumn<OnDemandRow>[] = [
    // OND-19: the readable ID, given when the row is saved to Git (sorted by its number).
    // OND-132: Group by and Filter by column use each value as shown; the ID and the key are filtered, not grouped (one row each).
    { id: 'od-id', label: 'ID', groupable: false, shown: (row) => rowId(page, row), value: (row) => row.seq ?? Number.MAX_SAFE_INTEGER, exportValue: (row) => rowId(page, row), render: (row) => { const lock = holderOf(row); return <>{row.seq ? <code className="od-key">{rowId(page, row)}</code> : onSave}{row.hidden && <>{' '}<Pill tone="neutral">Hidden</Pill></>}{lock && <>{' '}<LockBadge lock={lock} /></>}</> } },
    // OND-18: the row's key, made when the row is added; rows from before keys get theirs on their next save.
    { id: 'od-key', label: 'Key', groupable: false, value: (row) => row.key ?? '', render: (row) => row.key ? <code className="od-key">{row.key}</code> : onSave },
    ...page.columns.map((column): DataColumn<OnDemandRow> => ({
      id: column.id, label: column.name, hint: column.description, align: column.type === 'number' || column.type === 'currency' ? 'right' : undefined,
      value: (row) => cellSortValue(column, row.cells[column.id]),
      // OND-132: a Multi-select row is in the group of each of its values; a Date and a Currency as shown ("1,200.00 EUR").
      shown: (row) => column.type === 'multi' ? valuesOf(row.cells[column.id]) : displayText(column, row.cells[column.id]),
      filterOptions: hasOptions(column.type) ? column.options : undefined,
      exportValue: (row) => column.type === 'currency' ? displayText(column, row.cells[column.id]) : cellSortValue(column, row.cells[column.id]),
      title: (row) => { const text = cellText(row.cells[column.id]); return text.length > 40 ? text : undefined },
      render: (row) => { const value = row.cells[column.id], problem = cellProblem(column, value); return <>{column.type === 'longtext' ? <span className="od-long">{cellText(value)}</span> : displayText(column, value)}{problem && <>{' '}<small className="od-flag" title={`Kept as it was: ${problem} of “${column.name}”`}>{problem}</small></>}</> },
    })),
    // OND-20, OND-21: who added the row and when (in the viewer's time zone; exported in UTC); the last change, hidden at first.
    { id: 'od-added-by', label: 'Added by', value: (row) => row.addedBy ?? '', render: (row) => row.addedBy || <span className="muted">—</span> },
    { id: 'od-added-on', label: 'Added on', firstSortDesc: true, shown: (row) => row.addedAt ? formatDateTime(row.addedAt) : '', value: (row) => row.addedAt ?? '', render: (row) => row.addedAt ? formatDateTime(row.addedAt) : <span className="muted">—</span> },
    { id: 'od-updated-by', label: 'Last updated by', defaultHidden: true, export: 'always', value: (row) => lastUpdate(row)?.by ?? '', render: (row) => lastUpdate(row)?.by || <span className="muted">—</span> },
    { id: 'od-updated-on', label: 'Last updated on', defaultHidden: true, export: 'always', firstSortDesc: true, shown: (row) => { const last = lastUpdate(row); return last ? formatDateTime(last.at) : '' }, value: (row) => lastUpdate(row)?.at ?? '', render: (row) => { const last = lastUpdate(row); return last ? formatDateTime(last.at) : <span className="muted">—</span> } },
    // OND-27: Edit opens the row's drawer for editing; OND-39: Hide (Show for a hidden row) saves at once.
    { id: '@actions', label: 'Actions', sortable: false, export: false, render: (row) => <span className="button-row nowrap">
      <button type="button" className="ghost" disabled={Boolean(editRowsReason || lockReason(row))} title={editRowsReason || lockReason(row) || undefined} aria-label={`Edit row ${rowLabel(page, row)}`} onClick={() => open(row, shownRef.current.length ? shownRef.current : rows, true)}>Edit</button>
      <button type="button" className="text-button" disabled={!canRows || Boolean(lockReason(row))} title={rowsReason || lockReason(row) || undefined} aria-label={`${row.hidden ? 'Show' : 'Hide'} row ${rowLabel(page, row)}`} onClick={() => void hideRowNow(row, !row.hidden).catch(() => undefined)}>{row.hidden ? 'Show' : 'Hide'}</button>
    </span> },
  ]

  // OND-28: no unsaved-changes bar — the save queue of the page (waiting saves, a save kept after the retries with Retry)
  // and, only when a save failed before it was queued, the change kept here with Retry and Discard. On both tabs.
  const saveBar = <>
    <SaveQueueStatus state={queue} onRetry={() => void retry()} />
    {pending.length > 0 && <Notice tone="warning" className="od-pending">Not saved to Git: {pending.length === 1 ? `the change to the ${pending[0].label}` : `${pending.length} changes`} of {page.name}, kept here — {pending[pending.length - 1].error}{' '}
      <span className="button-row"><button type="button" className="ghost" onClick={() => { if (window.confirm(`Discard the changes to ${page.name} that are not saved to Git?`)) store.discard(page.id) }}>Discard</button><button type="button" className="primary" onClick={() => void retry()}>Retry</button></span>
    </Notice>}
  </>
  const current = drawer ? page.rows.find((entry) => entry.id === drawer.id) ?? drawer.draft : undefined
  const step = (by: number) => { if (!drawer) return; const at = drawer.order.indexOf(drawer.id) + by; const id = drawer.order[at]; if (id && page.rows.some((entry) => entry.id === id)) setDrawer({ ...drawer, id, draft: undefined, edit: false }) }

  // OND-63: the Live | Sample toggle (UI-STANDARDS §7, a segmented control), first in the page actions.
  const mode = dataMode?.modeOf(page.id) ?? 'live'
  const modeToggle = dataMode && <div className="view-switch od-data-mode" role="group" aria-label={`Data shown on ${page.name}`} title="Live: the page’s rows from Git. Sample: 50 made-up rows from its columns, for you only — nothing is saved.">
    <span>Data</span>
    <div className="segmented">{(['live', 'sample'] as const).map((value) => <button key={value} type="button" aria-pressed={mode === value} onClick={() => { if (value !== mode) { setDrawer(null); dataMode.setMode(page.id, value) } }}>{value === 'live' ? 'Live' : 'Sample'}</button>)}</div>
  </div>

  return <ExportNoteContext.Provider value={sample ? sampleExportNote : null}><Page className="on-demand-page" embedded={embedded} intro={embedded ? undefined : 'A table the team sets up itself, shared with everyone through Git.'}
    // OND-61: one main action (＋ Add page… for those who may add pages), the others in the page's ⋯ menu — each
    // disabled item with its reason as its tooltip, Delete page… in the danger colour.
    actions={<>{modeToggle}<ViewActions label={`page ${page.name}`} primary={embedded || gitReason || addPageReason ? undefined : <button type="button" className="ghost" onClick={onAddPage}>＋ Add page…</button>} items={[
      ...(!embedded && (gitReason || addPageReason) ? [{ key: 'add', label: '＋ Add page…', disabled: true, title: gitReason || addPageReason }] : []),
      ...(embedded ? [] : [
        { key: 'rename', label: 'Rename page…', disabled: Boolean(menuReason), title: menuReason || undefined, onClick: () => setPageDialog('rename') },
        { key: 'hide', label: hidden ? 'Show page' : 'Hide page', disabled: Boolean(hidingReason), title: hidingReason || undefined, onClick: toggleHidden },
        { key: 'delete', label: 'Delete page…', danger: true, disabled: Boolean(removeReason), title: removeReason || undefined, onClick: () => setPageDialog('remove') },
      ]),
      { key: 'template', label: 'Download Excel template…', disabled: Boolean(templateReason), title: templateReason || 'An Excel file of the page’s columns with drop-down lists and checks, to fill and upload', onClick: () => setBulk('template') },
      { key: 'upload', label: 'Upload Excel…', disabled: Boolean(uploadReason), title: uploadReason || 'Add and update rows from the filled template, after a preview', onClick: () => setBulk('upload') },
      { key: 'replace', label: 'Replace…', disabled: Boolean(replaceReason), title: replaceReason || 'Replace a value of one column in every row that holds it', onClick: () => setReplacing(true) },
      { key: 'publish', label: 'Publish interactive HTML…', disabled: Boolean(publishReason), title: publishReason || undefined, onClick: () => setPublishing(publishScope) },
      ...(showConvert ? [{ key: 'convert', label: 'Convert to row files…', disabled: Boolean(convertReason), title: convertReason || undefined, onClick: () => setConverting(true) }] : []),
      ...(git.connected ? [{ key: 'reload', label: '↻ Reload from Git', onClick: () => { if (pending.length && !window.confirm(`Discard the changes to ${page.name} that are not saved to Git?`)) return; store.discard(page.id); void store.reload() } }] : []),
    ]} /></>}>
    {/* OND-65: the banner of a page in Sample — on both tabs, above everything else. */}
    {sample && <Notice tone="warning" className="od-sample-banner"><strong>{sampleNotice}.</strong> You see {sampleRowCount} made-up rows generated from the columns of {page.name} — only you, here, in the Insights and in the On-Demand Dashboards that read {page.name}. Changes, charts and the page setup cannot be saved, and exports are marked “Sample”. Choose <strong>Live</strong> to see and change the real rows.</Notice>}
    {schedule && schedule.mode !== 'off' && schedule.lastOk === false && <Notice tone="warning" className="od-publish-failed">The scheduled publish of {page.name}{schedule.lastRun ? ` at ${formatDateTime(schedule.lastRun)}` : ''} failed: {schedule.lastText} {!publishReason && <button type="button" className="ghost" onClick={() => setPublishing(publishScope)}>Publish interactive HTML…</button>}</Notice>}
    {suggestConvert && !sample && <Notice tone="info" className="od-convert-hint">This page has {page.rows.length.toLocaleString('en-US')} rows; converting it to row files keeps it fast and lets several people edit at once.{' '}<button type="button" className="ghost" onClick={() => setConverting(true)}>Convert to row files…</button>{' '}<button type="button" className="text-button" onClick={dismissHint}>Dismiss</button></Notice>}
    {gitReason && <Notice tone={git.isSample ? 'warning' : 'info'}>{gitReason}{!git.connected && store.inGit(page.id) ? ' The page last loaded in this browser is shown.' : ''}</Notice>}
    {store.errors.map((error) => <Notice key={error} tone="error">On-Demand: {error}</Notice>)}
    {hidden && !embedded && <Notice tone="info" className="od-hidden-note">{page.name} is hidden: it is not in the menu, on Home or in search for anyone. Its rows stay in Git and dashboards keep reading them; it opens from Admin → Pages & menu.{!hidingReason && <>{' '}<button type="button" className="ghost" onClick={toggleHidden}>Show page</button></>}</Notice>}
    {store.loaded && !store.inGit(page.id) && <Notice tone="info">{page.name} is not in Git yet: it is created with its first save to Git.</Notice>}
    <OlderCopies store={store} git={git} viewer={viewer} id={page.id} name={page.name} />
    {locking.active && git.lockFallback && <Notice tone="info">Row locks are kept in the folder locks/ of the data branch: the data repository did not allow a branch “locks”. They work the same.</Notice>}
    {locking.error && <Notice tone="warning">The row locks of {page.name} could not be read ({locking.error}). Who is editing a row is not shown; two edits of the same row are still merged field by field.</Notice>}
    {(() => { const table = <TablePanel className="od-panel" eyebrow={groupName.toUpperCase()} title={page.name} detail={page.description || undefined}
      info={<>Click a row (or press Enter on it) to open it on the right: its ID, key, who added it and when, every value with its column’s description, and its History; Edit there changes it, and Save to Git saves it for everyone at once. Each column has a type — Text, Long text (a paragraph), Number, Currency (an amount and its currency), Date, Dropdown (one value) or Multi-select with the options of its list — and may have a description (ⓘ on its heading) saying how or what to fill. A value that no longer fits its column (an option removed, the type changed) is kept and marked, e.g. “not in the list”, until it is changed. Every row gets a readable ID such as {page.keyPrefix}-0001 when it is saved to Git, and records who added it and when; every saved change is logged in the row’s History (who, when, what changed — the last {maxLog}). Last updated by / on can be shown with Columns. The export holds the IDs, values, Added by / on and Last updated by / on (in UTC), not the History. Every change — a row, the columns, the name, a chart — is saved to Git {rowFiles ? <>in {path} the moment it is saved: each row is its own file, so two people adding or editing rows at the same time never get in each other’s way. Edit takes the row’s lock — others see who is editing it and cannot edit that row until it is saved, cancelled or {timeoutMinutes} minutes pass without activity (the unsaved values are then kept in that browser as a draft for one day)</> : <>as {path} the moment it is saved (no separate Save to Git); two saves at the same time are merged row by row and column by column, the later one winning where both changed the same</>}.{store.history(page.id) && <> <a href={store.history(page.id)} target="_blank" rel="noreferrer">History in GitHub</a></>}{owners.length > 0 && <> Co-owners (set up the page and edit its rows): {[...new Set(owners)].join(', ')}.</>}</>}
      action={<button type="button" className="ghost" disabled={!canSetup} title={setupReason || undefined} onClick={() => setColumnsOpen(true)}>Set up columns…</button>}>
      {!gitReason && <WriteBlocked reason={block.noteFor('on this page', ...blocked)} />}
      {page.columns.length ? <DataTable id={`on-demand:${page.id}`} columns={columns} rows={rows} rowKey={(row) => row.id} exportName={page.name} groupFilter shownRef={shownRef}
        onRowOpen={(row, shown) => open(row, shown)} rowLabel={(row) => `Open row ${rowId(page, row) || row.key || rowLabel(page, row)}`}
        toolbar={<><input className="search" type="search" aria-label={`Search ${page.name}`} placeholder="Search all columns" value={search} onChange={(event) => setSearch(event.target.value)} />
          <button type="button" className="ghost" disabled={Boolean(editRowsReason)} title={editRowsReason || undefined} onClick={() => { const draft = { id: newId('r'), cells: {} }; setDrawer({ id: draft.id, order: [], draft, edit: true }) }}>＋ Add row</button>
          {(hiddenCount > 0 || showHidden) && <label className="check od-show-hidden"><input type="checkbox" checked={showHidden} onChange={(event) => toggleHiddenRows(event.target.checked)} />Show hidden rows ({hiddenCount})</label>}</>}
        rowClassName={(row) => row.hidden ? 'od-row-hidden' : undefined}
        status={(shown) => `${shown} of ${showHidden ? page.rows.length : visibleCount} row${(showHidden ? page.rows.length : visibleCount) === 1 ? '' : 's'}${hiddenCount ? ` (${hiddenCount} hidden${showHidden ? ', shown' : ''})` : ''}`}
        empty={<EmptyState title={visibleCount || (showHidden && page.rows.length) ? 'No row matches the search.' : 'No rows yet.'} detail={page.rows.length ? undefined : canRows ? 'Add the first one with ＋ Add row.' : undefined} />} />
        : <EmptyState title="No columns yet." detail={canSetup ? 'Add them with Set up columns…: a name and a type for each, and the options of a Dropdown or Multi-select.' : 'Someone allowed to set up On-Demand pages adds the columns.'} />}
      {saveBar}
    </TablePanel>
      // PGB-01: a Table page is the Data table alone; Table + Insights adds the Insights tab (OND-11).
      return kind === 'table' ? table : <ResultTabs id={`on-demand:${page.id}`} mainLabel="Data" rawLabel="Insights" rawCount={page.insights.length}
        raw={<InsightsTab page={withoutHidden(page)} canSetup={canSetup} setupReason={setupReason} blockNote={gitReason || rights.setup ? '' : block.noteFor('on this tab', 'ondemand.setup')} saveBar={saveBar} views={views}
          onChange={(next, message) => { void saveChange('insights', (base) => { const out = { ...base, insights: next.insights }; if (next.colors) out.colors = next.colors; else delete out.colors; if (next.insightFilters !== page.insightFilters) { if (next.insightFilters) out.insightFilters = next.insightFilters; else delete out.insightFilters } return out }, message ?? `${page.name}: change the charts and tables`, 'charts and tables').catch(() => undefined) }} />}
        main={table} />
    })()}
    {drawer && current && <RowDrawer key={drawer.draft ? drawer.draft.id : 'row'} page={page} row={current} isNew={!page.rows.some((entry) => entry.id === current.id)} startEditing={drawer.edit}
      canEdit={!editRowsReason} editReason={editRowsReason} queueFailed={queue.failed > 0}
      locking={locking.active && current.key && page.rows.some((entry) => entry.id === current.id) ? (() => { const key = current.key; const held = locking.locks[key]; return {
        holder: holderOf(current), canRelease, timeoutMs: locking.timeoutMs,
        // OND-35: Edit takes the lock, then reads the page again (only its changed rows), so the edit starts from the row as it is in Git.
        take: async () => { const result = await locking.take(key); if (!result.ok) return result; const fresh = await store.reloadPage(page.id).catch(() => null); return { ok: true as const, row: fresh?.rows.find((entry) => entry.key === key) } }, renew: () => locking.renew(key), release: () => locking.release(key),
        releaseOther: async () => { if (!held) return; const done = await locking.releaseOther(key, held); recordJob(`ondemand:lock:${page.id}:${key}`, `Release lock · ${page.name} · ${rowId(page, current) || key}`, { text: done ? `Released the lock of ${rowId(page, current) || key} held by ${held.lock.name} since ${formatDateTime(held.lock.at)}; the row can be edited again.` : `The lock of ${rowId(page, current) || key} was already released.` }) },
        findDraft: () => locking.draft.find(key), keepDraft: (cells, base) => locking.draft.keep(key, cells, base), dropDraft: () => locking.draft.drop(key),
      } })() : undefined}
      position={drawer.draft ? null : { at: drawer.order.indexOf(current.id), of: drawer.order.length }} onStep={step}
      onSave={(row, isNew) => saveRow(row, isNew)} onRetryQueue={() => store.retry(page.id)} onHide={(hide) => hideRowNow(current, hide)} onRemove={canDelete && current.hidden ? () => setRemoving(current) : undefined}
      onClose={() => setDrawer(null)} />}
    {replacing && <ReplaceDialog eyebrow={eyebrowOf(page)} columns={replaceColumns}
      values={(id) => { const column = page.columns.find((entry) => entry.id === id); return distinctValues(page.rows.filter((row) => !row.hidden).map((row) => column?.type === 'multi' ? valuesOf(row.cells[id]) : [cellText(row.cells[id])])) }}
      suggestions={(id) => { const column = page.columns.find((entry) => entry.id === id); return column && hasOptions(column.type) ? column.options : distinctValues(page.rows.filter((row) => !row.hidden).map((row) => [cellText(row.cells[id])])).map((entry) => entry.value) }}
      plan={(id, find, to) => onDemandReplacePlan(page, id, find, to, { locked: lockedKeys, label: replaceLabel })}
      check={(id, find, to) => replaceError(page.columns.find((entry) => entry.id === id), find, to)}
      note={<p className="muted">Hidden rows are not changed. Each changed row gets an entry in its History; saved to Git at once{rowFiles ? ', every changed row file in one commit' : ''}.</p>}
      onReplace={replaceNow} onCancel={() => setReplacing(false)} />}
    {bulk === 'template' && <TemplateDialog eyebrow={eyebrowOf(page)} page={page} shown={rows} onCancel={() => setBulk(null)} />}
    {bulk === 'upload' && <UploadDialog eyebrow={eyebrowOf(page)} page={page} locked={lockedKeys} rowFiles={rowFiles} onSave={uploadNow} onCancel={() => setBulk(null)} />}
    {/* OND-91: Publish now cuts the rows with the publisher's Insights filter row as it is now. */}
    {publishing && publishing === publishScope && !publishReason && (() => { const cut = { kind: 'table' as const, choice: viewerChoice(page.id, views) }; return <PublishDialog pageId={page.id} name={page.name} publishScope={publishing} authorization={publisher} publishedBy={publisherName || me} cut={cut} prepare={prepareTable(page, kind, cut, publisherName || me)} onClose={() => setPublishing(null)} /> })()}
    {converting && <ConvertDialog page={page} file={path} onCancel={() => setConverting(false)} onConvert={async () => {
      await inBackground(`Convert to row files · ${page.name}`, async () => { const from = store.filePath(page.id), done = await store.convert(page.id); return { value: done, text: `Converted ${from} to ${store.filePath(page.id)} — ${done.page.rows.length} row file${done.page.rows.length === 1 ? '' : 's'}, page.json and counter.json in one commit. — ${done.commitUrl}` } })
      setConverting(false)
    }} />}
    {removing && <RemoveRowDialog page={page} row={removing} path={path} onCancel={() => setRemoving(null)} onRemove={async () => { await removeRowNow(removing); setRemoving(null) }} />}
    {columnsOpen && <ColumnsDialog page={page} onCancel={() => setColumnsOpen(false)} onSave={async (change) => { await saveChange('columns', change, `${page.name}: set up the columns`); setColumnsOpen(false) }} />}
    {pageDialog === 'rename' && <PageNameDialog title="Rename the page" action="Save to Git" name={page.name} description={page.description} except={`ondemand:${page.id}`} note="Saved to Git for everyone at once." onCancel={() => setPageDialog(null)} onSave={async (name, description) => { await saveChange('rename', (base) => renamePage(base, name, description), `On-Demand: rename ${page.name} to ${name.trim()}`); setPageDialog(null) }} />}
    {pageDialog === 'remove' && <RemovePageDialog page={page} inGit={store.inGit(page.id)} path={path} onCancel={() => setPageDialog(null)} onRemove={async () => {
      await store.remove(page.id, `On-Demand: delete the page ${page.name} (${page.rows.length} rows)`)
      // PGB-07: its place in the menu goes with it.
      if (menu.layout.pages[page.id]) await menu.save(removePlacement(menu.layout, page.id), `Pages & menu: remove the page ${page.name}`)
      recordRemoved(page, path)
      setPageDialog(null); const next = store.pages.find((entry) => entry.id !== page.id); if (next) onOpen(next.id)
    }} />}
  </Page></ExportNoteContext.Provider>
}

// OND-28 (UI-STANDARDS §8): a save as a Background job — "Saving to Git…" while it runs, then its result (or the error);
// the caller gets the value or the error as well, to keep a form open with it. Each save is its own job.
let jobCount = 0
function inBackground<T>(label: string, work: () => Promise<{ value: T; text: string }>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    runInBackground(`ondemand:${jobCount++}`, label, async (progress) => {
      progress('Saving to Git…')
      try { const done = await work(); resolve(done.value); return { text: done.text } }
      catch (failure) { reject(failure); throw failure }
    })
  })
}
const recordRemoved = (page: PageFile, path: string) => recordJob(`ondemand:${page.id}`, `Delete page · ${page.name}`, { text: `Deleted ${path} with its ${page.rows.length} row${page.rows.length === 1 ? '' : 's'}; its history stays in GitHub.` })

const showHiddenKey = 'demand-planning-od-show-hidden-v1'
// OND-62: the convert suggestions dismissed in this browser, as "{work email}|{page id}".
const convertHintKey = 'demand-planning-od-convert-hint-v1'
const readList = (key: string): string[] => { try { const value = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown; return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [] } catch { return [] } }
const rowLabel = (page: PageFile, row: OnDemandRow) => { const first = page.columns.find((column) => cellText(row.cells[column.id])); return first ? cellText(row.cells[first.id]).slice(0, 60) : row.id }
const eyebrowOf = (page: PageFile) => `ON-DEMAND · ${page.name.toUpperCase()}`
const sameCells = (columns: OnDemandColumn[], a: Record<string, OnDemandValue>, b: Record<string, OnDemandValue>) => columns.every((column) => cellText(a[column.id]) === cellText(b[column.id]))

// OND-35: who is editing a row — the badge in the table's ID cell (the full text as its tooltip and accessible name).
function LockBadge({ lock }: { lock: RowLock }) {
  const text = `Being edited by ${lock.name} since ${formatDateTime(lock.at)}`
  return <span className="od-lock" title={text} aria-label={text}><Pill tone="warning">✎ {lock.name.split('@')[0]}</Pill></span>
}
const lockedText = (lock: RowLock, title: string, minutes: number) => `${lock.name} is editing ${title} since ${formatDateTime(lock.at)}. You can view it; Edit is free again when they save or cancel, or ${minutes} minute${minutes === 1 ? '' : 's'} after their last activity.`

// OND-35…OND-38: the lock of the row open in the drawer (row-file pages only): someone else's (holder), taking,
// renewing and releasing this window's, an owner's release of a stuck lock, and the row's draft in this browser.
interface DrawerLocking {
  holder: RowLock | null; canRelease: boolean; timeoutMs: number
  take: () => Promise<{ ok: true; row?: OnDemandRow } | { ok: false; holder: RowLock | null }>
  renew: () => Promise<boolean>; release: () => Promise<void>; releaseOther: () => Promise<void>
  findDraft: () => RowDraft | null; keepDraft: (cells: RowDraft['cells'], base: RowDraft['base']) => void; dropDraft: () => void
}

// OND-27: one row in a drawer from the right (UI-STANDARDS: Drawer, a deliberate addition). View: the row's ID, key,
// who added it and when and its last change, every column's value with the column's description, and its History,
// newest first; ‹ › move to the previous / next row in the table's order. Edit (with the right to edit rows, PGB-09/10;
// disabled with the reason otherwise, CON-102) turns the values into the fields of OND-04 in place; Save to Git saves the
// row at once (OND-28) and shows it saved, with its ID; a failed save keeps the edit with the error and Retry. Closing
// or moving to another row with unsaved edits asks first. ＋ Add row opens it empty, for editing.
// OND-35…OND-38 (a row-file page): Edit first takes the row's lock — when someone else holds it, the drawer says who and
// since when and Edit stays disabled (a Tool Owner or page co-owner may Release lock); while editing, input keeps the
// lock (renewed every 2 minutes when there was input), a warning comes 2 minutes before the timeout (Keep editing),
// and at the timeout the edit closes, its unsaved values kept as a draft in this browser for one day and the lock
// released; the next Edit of the row offers the draft back, saying what changed in Git meanwhile.
function RowDrawer({ page, row, isNew, startEditing, canEdit, editReason, queueFailed, position, onStep, onSave, onRetryQueue, onHide, onRemove, onClose, locking }: { page: PageFile; row: OnDemandRow; isNew: boolean; startEditing: boolean; canEdit: boolean; editReason: string; queueFailed: boolean; position: { at: number; of: number } | null; onStep: (by: number) => void; onSave: (row: OnDemandRow, isNew: boolean) => Promise<unknown>; onRetryQueue: () => Promise<void>; onHide: (hide: boolean) => Promise<unknown>; onRemove?: () => void; onClose: () => void; locking?: DrawerLocking }) {
  // The form follows the row shown: moving to another row starts again from its values.
  const [form, setForm] = useState({ id: row.id, editing: !locking && canEdit && (isNew || startEditing), cells: row.cells })
  if (form.id !== row.id) setForm({ id: row.id, editing: !locking && canEdit && startEditing, cells: row.cells })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [asking, setAsking] = useState<(() => void) | null>(null)
  const [note, setNote] = useState<{ row: string; kind: 'timeout' | 'lost'; kept: boolean } | null>(null)
  const [offer, setOffer] = useState<RowDraft | null>(null)
  const [warning, setWarning] = useState<number | null>(null)
  const [releasing, setReleasing] = useState(false)
  // A restored draft puts new values into the fields: they start afresh (a Currency field keeps its own state).
  const [restored, setRestored] = useState(0)
  const bodyStart = useRef<HTMLDivElement>(null)
  const editing = form.editing && canEdit
  const dirty = editing && !sameCells(page.columns, form.cells, isNew ? {} : row.cells)
  // GIT-18: a row being edited is dropped by Load the newer data, which asks first.
  useUnsavedEdit(dirty ? `the ${isNew ? 'new row' : `row ${rowId(page, row) || row.key || ''}`} you are editing in ${page.name}` : false)
  const title = isNew ? 'New row' : rowId(page, row) || row.key || 'Row'
  const holder = editing ? null : locking?.holder ?? null
  const minutes = Math.round((locking?.timeoutMs ?? 0) / 60_000)
  const reason = editReason || (holder ? lockedText(holder, title, minutes) : '')
  const guard = (action: () => void) => { if (busy) return; if (dirty) setAsking(() => action); else action() }
  const set = (id: string, value: OnDemandValue) => { setForm({ ...form, cells: { ...form.cells, [id]: value } }); setError('') }
  // OND-35: the time of the last input in the drawer and of the lock's last renewal (this window's edit only).
  const activity = useRef(0), renewed = useRef(0)
  async function startEdit() {
    setError(''); setNote(null)
    if (!locking) { setForm({ ...form, editing: true, cells: row.cells }); return }
    setBusy(true)
    try {
      const result = await locking.take()
      if (!result.ok) { setError(result.holder ? lockedText(result.holder, title, minutes) : `Someone else is editing ${title}. You can view it.`); return }
      activity.current = renewed.current = Date.now()
      setForm({ id: row.id, editing: true, cells: result.row?.cells ?? row.cells })
      setOffer(locking.findDraft())
    } catch (failure) { setError(`Edit could not take the row’s lock: ${failure instanceof Error ? failure.message : String(failure)}`) }
    finally { setBusy(false) }
  }
  // Edit in the table opens the drawer for editing: on a row-file page that takes the lock first.
  const opened = useRef('')
  useEffect(() => {
    if (opened.current === row.id) return
    opened.current = row.id
    if (locking && startEditing && canEdit && !locking.holder) void Promise.resolve().then(startEdit)
  })
  const cancel = () => { if (isNew) onClose(); else { setForm({ ...form, editing: false, cells: row.cells }); setError(''); setOffer(null); setWarning(null) } }
  // OND-36, OND-37: the edit holding the lock — input keeps it; a warning before the timeout; at the timeout (or when the
  // lock was released by an owner or taken over) the edit closes and the unsaved values are kept as a draft.
  const latest = useRef({ dirty, cells: form.cells, base: row.cells, locking })
  useEffect(() => { latest.current = { dirty, cells: form.cells, base: row.cells, locking } })
  const lockedEdit = Boolean(locking) && editing
  const timeoutMs = locking?.timeoutMs ?? 0
  useEffect(() => {
    if (!lockedEdit) return
    const release = latest.current.locking?.release
    const panel = bodyStart.current?.closest<HTMLElement>('.drawer')
    const mark = () => { activity.current = Date.now(); setWarning(null) }
    const stop = (kind: 'timeout' | 'lost') => {
      const { dirty: changed, cells, base, locking: current } = latest.current
      if (changed) current?.keepDraft(cells, base)
      setForm((value) => ({ ...value, editing: false, cells: base }))
      setWarning(null); setOffer(null); setAsking(null)
      setNote({ row: row.id, kind, kept: changed })
    }
    const timer = window.setInterval(() => {
      const now = Date.now(), state = editPhase(activity.current, now, timeoutMs)
      if (state.phase === 'expired') { stop('timeout'); return }
      setWarning(state.phase === 'warning' ? state.left : null)
      if (shouldRenew(renewed.current, activity.current, now)) { renewed.current = now; void latest.current.locking?.renew().then((ok) => { if (!ok) stop('lost') }, () => undefined) }
    }, 1000)
    for (const type of ['input', 'keydown', 'pointerdown']) panel?.addEventListener(type, mark)
    return () => {
      window.clearInterval(timer)
      for (const type of ['input', 'keydown', 'pointerdown']) panel?.removeEventListener(type, mark)
      // Save, Cancel, the timeout, another row or closing the drawer: the lock is released.
      void release?.()
    }
  }, [lockedEdit, row.id, timeoutMs])
  async function save(retryQueue = false) {
    const problem = rowError(page.columns, form.cells)
    if (problem) { setError(problem); return }
    if (!isNew && sameCells(page.columns, form.cells, row.cells) && !retryQueue) { setForm({ ...form, editing: false }); return }
    setBusy(true); setError('')
    try {
      if (retryQueue) await onRetryQueue()
      else await onSave({ id: row.id, ...(row.key ? { key: row.key } : {}), cells: form.cells }, isNew)
      locking?.dropDraft()
      setForm((current) => ({ ...current, editing: false })); setOffer(null); setWarning(null)
      bodyStart.current?.closest<HTMLElement>('.drawer')?.focus()
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)) }
    finally { setBusy(false) }
  }
  const keepEditing = () => { activity.current = Date.now(); setWarning(null) }
  const footer = editing ? <>
    {warning != null && <Notice tone="warning" className="od-timeout"><span>No activity: your changes to {title} will be discarded in <strong aria-hidden="true">{countdown(warning)}</strong><span className="sr-only">{Math.max(1, Math.ceil(warning / 60_000))} minute{Math.ceil(warning / 60_000) > 1 ? 's' : ''}</span> and kept as a draft in this browser for one day.</span>{' '}<button type="button" className="ghost" onClick={keepEditing}>Keep editing</button></Notice>}
    {error && <Notice tone="error" className="drawer-error">{error}{' '}<button type="button" className="ghost" disabled={busy} onClick={() => void save(queueFailed)}>Retry</button></Notice>}
    <div className="drawer-actions" key="editing"><button type="button" className="ghost" disabled={busy} onClick={cancel}>Cancel</button><button type="submit" form="od-row-form" className="primary" disabled={busy}>{busy ? 'Saving to Git…' : 'Save to Git'}</button></div>
  </> : <>
    {error && <Notice tone="error" className="drawer-error">{error}</Notice>}
    <WriteBlocked reason={reason} />
    {/* Keyed apart from the editing buttons: Edit must not turn into the Save to Git (submit) button under the click. */}
    <div className="drawer-actions" key="viewing">
      {!isNew && <button type="button" className="text-button drawer-remove" disabled={!canEdit || Boolean(holder) || busy} title={reason || undefined} onClick={() => { setBusy(true); setError(''); void onHide(!row.hidden).catch((failure: unknown) => setError(failure instanceof Error ? failure.message : String(failure))).finally(() => setBusy(false)) }}>{row.hidden ? 'Show row' : 'Hide row'}</button>}
      {!isNew && row.hidden && onRemove && <button type="button" className="text-button danger-text" disabled={busy} onClick={onRemove}>Delete row…</button>}
      <button type="button" className="primary" disabled={!canEdit || Boolean(holder) || busy} title={reason || undefined} onClick={() => void startEdit()}>{busy ? 'Taking the row…' : 'Edit'}</button>
    </div>
  </>
  const restore = offer && editing ? draftRestore(offer, row.cells, page.columns) : null
  const shownNote = note?.row === row.id && !editing ? note : null
  return <Drawer eyebrow={eyebrowOf(page)} title={title} className="od-drawer" onClose={() => guard(onClose)}
    restoreFocus={() => document.querySelector<HTMLElement>(`tr[data-row-key="${CSS.escape(row.id)}"]`)}
    headerActions={position && position.of > 1 && <span className="button-row drawer-steps">
      <button type="button" className="ghost" aria-label="Previous row" disabled={busy || position.at <= 0} onClick={() => guard(() => onStep(-1))}>‹</button>
      <small className="muted">{position.at + 1} of {position.of}</small>
      <button type="button" className="ghost" aria-label="Next row" disabled={busy || position.at < 0 || position.at >= position.of - 1} onClick={() => guard(() => onStep(1))}>›</button>
    </span>}
    footer={footer}>
    <div ref={bodyStart} />
    {row.hidden && <Notice tone="info" className="od-hidden-row">Hidden by {row.hidden.by} on {formatDateTime(row.hidden.at)}: left out of the table, the charts, the exports and the dashboards for everyone. Show row brings it back.</Notice>}
    {holder && <Notice tone="info" className="od-lock-note"><strong>Being edited by {holder.name}</strong> since {formatDateTime(holder.at)}.{locking?.canRelease && <>{' '}<button type="button" className="text-button" onClick={() => setReleasing(true)}>Release lock</button></>}</Notice>}
    {shownNote && <Notice tone="warning" className="od-timeout-note">{shownNote.kind === 'timeout' ? `Your edit of ${title} was closed after ${minutes} minute${minutes === 1 ? '' : 's'} without activity, and the row is free for others again.` : `Your edit of ${title} was closed: its lock was released by a page owner or taken over by someone else.`}{shownNote.kept ? ' Your changes are kept in this browser as a draft for one day: choose Edit to restore them.' : ' Nothing had been changed.'}</Notice>}
    {restore && offer && <Notice tone="info" className="od-draft">
      <p><strong>Restore your draft from {formatDateTime(offer.at)}?</strong> It holds your unsaved change{restore.mine.length === 1 ? '' : 's'} to {restore.mine.map((column) => `“${column.name}”`).join(', ') || 'no field'}.</p>
      {restore.changed.length > 0 && <><p>Changed in Git since that edit started:</p><ul>{restore.changed.map((column) => <li key={column.id}>{column.name}: {displayText(column, offer.base[column.id]) || '(empty)'} → {displayText(column, row.cells[column.id]) || '(empty)'}{restore.both.includes(column) ? ` — your draft has “${displayText(column, offer.cells[column.id]) || '(empty)'}”, which replaces it when restored` : ''}</li>)}</ul></>}
      <div className="button-row"><button type="button" className="ghost" onClick={() => { locking?.dropDraft(); setOffer(null) }}>Discard draft</button><button type="button" className="primary" onClick={() => { setForm({ ...form, cells: restore.cells }); setRestored((count) => count + 1); locking?.dropDraft(); setOffer(null) }}>Restore draft</button></div>
    </Notice>}
    <dl className="od-row-facts">
      <div><dt>ID</dt><dd>{row.seq ? <code className="od-key">{rowId(page, row)}</code> : <span className="muted">{isNew ? 'given when the row is saved to Git (the next number, it never changes)' : 'given on its next save'}</span>}</dd></div>
      <div><dt>Key</dt><dd>{row.key ? <code className="od-key">{row.key}</code> : <span className="muted">{isNew ? 'given when the row is saved (unique, it never changes)' : 'given on its next save'}</span>}</dd></div>
      {!isNew && <div><dt>Added</dt><dd>{row.addedAt ? `${formatDateTime(row.addedAt)} by ${row.addedBy || 'unknown'}` : <span className="muted">— (before this was recorded)</span>}</dd></div>}
    </dl>
    {editing ? <form id="od-row-form" className="od-row-form" noValidate onSubmit={(event) => { event.preventDefault(); void save() }}>
      {page.columns.map((column, index) => <Field key={`${column.id}:${restored}`} column={column} value={form.cells[column.id]} first={index === 0} onChange={(value) => set(column.id, value)} />)}
      {!page.columns.length && <EmptyState title="No columns yet." detail="Set up the page’s columns first." />}
    </form> : <dl className="od-row-values">{page.columns.map((column) => { const value = row.cells[column.id], problem = cellProblem(column, value); return <div key={column.id}>
      <dt>{column.name}{column.description && <small className="od-help">{column.description}</small>}</dt>
      <dd className={column.type === 'longtext' ? 'od-long-full' : undefined}>{cellText(value) ? displayText(column, value) : <span className="muted">—</span>}{problem && <>{' '}<small className="od-flag">{problem}</small></>}</dd>
    </div> })}</dl>}
    {!isNew && <History page={page} row={row} />}
    {asking && <Modal eyebrow={eyebrowOf(page)} title="Discard your changes?" onClose={() => setAsking(null)}>
      <form onSubmit={(event) => { event.preventDefault(); const action = asking; setAsking(null); setForm({ ...form, editing: false, cells: row.cells }); action() }}>
        <p>Your changes to {title} are not saved to Git. Discard them?</p>
        <div className="modal-actions"><button type="button" className="ghost" onClick={() => setAsking(null)}>Keep editing</button><button className="danger-button">Discard changes</button></div>
      </form>
    </Modal>}
    {releasing && holder && locking && <ReleaseLockDialog page={page} title={title} lock={holder} onCancel={() => setReleasing(false)} onRelease={async () => { await locking.releaseOther(); setReleasing(false) }} />}
  </Drawer>
}

// OND-38: releasing someone else's lock asks first in a pop-up (UI-STANDARDS §4) naming who holds it and since when.
function ReleaseLockDialog({ page, title, lock, onCancel, onRelease }: { page: PageFile; title: string; lock: RowLock; onCancel: () => void; onRelease: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const release = async () => { setBusy(true); setError(''); try { await onRelease() } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); setBusy(false) } }
  return <Modal eyebrow={eyebrowOf(page)} title="Release the lock" onClose={() => { if (!busy) onCancel() }}>
    <form onSubmit={(event) => { event.preventDefault(); void release() }}>
      <p>Release the lock of <strong>{title}</strong> held by <strong>{lock.name}</strong> since {formatDateTime(lock.at)}? Use it when the lock is stuck (they left without saving). Anyone allowed to edit rows can then edit the row; if {lock.name} is still editing, their edit is closed at its next check and their unsaved values are kept as a draft in their browser.</p>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="modal-actions"><button type="button" className="ghost" disabled={busy} onClick={onCancel}>Cancel</button><button className="danger-button" disabled={busy}>{busy ? 'Releasing…' : 'Release lock'}</button></div>
    </form>
  </Modal>
}

// OND-32: converting a page to row files asks first in a pop-up naming its rows and what changes.
export function ConvertDialog({ page, file = onDemandPath(page.id), onCancel, onConvert }: { page: PageFile; file?: string; onCancel: () => void; onConvert: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const convert = async () => { setBusy(true); setError(''); try { await onConvert() } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); setBusy(false) } }
  const count = `${page.rows.length} row${page.rows.length === 1 ? '' : 's'}`
  return <Modal eyebrow={eyebrowOf(page)} title="Convert to row files" onClose={() => { if (!busy) onCancel() }}>
    <form onSubmit={(event) => { event.preventDefault(); void convert() }}>
      <p>Convert <strong>{page.name}</strong> with its <strong>{count}</strong> from the single file {file} to one file per row in {file.replace(/\.json$/, '')}/, as one commit? Keys, IDs, values, History, columns and charts stay as they are; rows without a key or ID get one now, as their next save would.</p>
      <p>Afterwards two people can add and edit rows at the same time, and Edit takes the row’s lock. <strong>Older app builds cannot open the page any more</strong> (they say the file is not an On-Demand page): update every app first. This cannot be undone in the app.</p>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="modal-actions"><button type="button" className="ghost" disabled={busy} onClick={onCancel}>Cancel</button><button className="primary" disabled={busy}>{busy ? 'Converting…' : `Convert ${count}`}</button></div>
    </form>
  </Modal>
}

// OND-40: deleting a hidden row (the Tool Owner) asks first in a pop-up naming it (UI-STANDARDS §4), then deletes it from Git at once.
function RemoveRowDialog({ page, row, path, onCancel, onRemove }: { page: PageFile; row: OnDemandRow; path: string; onCancel: () => void; onRemove: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const name = rowId(page, row) || row.key || rowLabel(page, row)
  const remove = async () => { setBusy(true); setError(''); try { await onRemove() } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); setBusy(false) } }
  return <Modal eyebrow={eyebrowOf(page)} title="Delete the row" onClose={() => { if (!busy) onCancel() }}>
    <form onSubmit={(event) => { event.preventDefault(); void remove() }}>
      <p>Delete <strong>{name}</strong>{rowLabel(page, row) !== name ? ` (${rowLabel(page, row)})` : ''} for good, for everyone? It is deleted from {page.storage === 'rows' ? `${path}rows/` : path} in Git at once; its number {name} is never given again and its history stays in GitHub. To keep it, leave it hidden.</p>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="modal-actions"><button type="button" className="ghost" disabled={busy} onClick={onCancel}>Cancel</button><button className="danger-button" disabled={busy}>{busy ? 'Deleting…' : `Delete ${name}`}</button></div>
    </form>
  </Modal>
}

// OND-21: the row's update log, newest first — when (the viewer's time zone), who and what changed (old → new). A
// comment written into an entry by hand (or by an earlier build) is shown as well.
function History({ page, row }: { page: PageFile; row: OnDemandRow }) {
  const log = [...(row.log ?? [])].reverse()
  const nameOf = (id: string) => page.columns.find((column) => column.id === id)?.name ?? '(removed column)'
  const shown = (id: string, text: string) => { const column = page.columns.find((entry) => entry.id === id); return text === '' ? '(empty)' : column ? displayText(column, text) : text }
  return <section className="od-history" aria-label="History">
    <h3>History</h3>
    {log.length ? <ol>{log.map((entry) => <li key={entry.id}>
      <p className="od-history-head"><strong>{entry.added ? 'Added' : entry.action === 'hidden' ? 'Hidden' : entry.action === 'shown' ? 'Shown again' : 'Changed'}</strong> · {formatDateTime(entry.at)} · {entry.by}</p>
      {entry.changes.length > 0 && <ul>{entry.changes.map((change) => <li key={change.column}><span className="od-history-field">{nameOf(change.column)}</span>: {entry.added ? shown(change.column, change.to) : <><del>{shown(change.column, change.from)}</del> → <ins>{shown(change.column, change.to)}</ins></>}</li>)}</ul>}
      {entry.comment && <p className="od-history-comment">{entry.comment}</p>}
    </li>)}</ol> : <p className="muted">No changes recorded yet: the row was added before its History was kept. Its next saved change is the first entry.</p>}
    <small className="muted">Every saved change is logged on its own. The last {maxLog} changes of a row are kept, each value up to 500 characters; saved with the page in Git.</small>
  </section>
}

function Field({ column, value, first, onChange }: { column: OnDemandColumn; value: OnDemandValue | undefined; first: boolean; onChange: (value: OnDemandValue) => void }) {
  const label = `${column.name}${column.required ? '' : ' (optional)'}`
  const problem = cellProblem(column, value)
  const extra = valuesOf(value).filter((entry) => !column.options.includes(entry))
  // OND-25: the column's description under the field, as help (UI-STANDARDS §3).
  const help = column.description ? <small className="od-help">{column.description}</small> : null
  const flag = problem ? <small className="od-flag">Kept as it was: {problem}</small> : null
  // LST-11: a built-in list that is not found (removed, or not read yet): the choices last saved, marked.
  const missing = column.listMissing ? <small className="od-flag">The built-in list of this column is not found: the choices are those last saved.</small> : null
  if (column.type === 'multi') return <fieldset className="od-multi"><legend>{label}</legend>
    {missing}
    {[...column.options, ...extra].map((option) => <label key={option} className="check"><input type="checkbox" checked={valuesOf(value).includes(option)} onChange={(event) => onChange(event.target.checked ? [...valuesOf(value), option] : valuesOf(value).filter((entry) => entry !== option))} />{option}{!column.options.includes(option) && <small className="od-flag">not in the list</small>}</label>)}
    {help}
  </fieldset>
  if (column.type === 'currency') return <CurrencyField column={column} label={label} value={value} first={first} onChange={onChange} help={help} flag={flag} />
  if (column.type === 'longtext') return <label>{label}
    <textarea autoFocus={first} aria-label={column.name} required={column.required} rows={5} maxLength={maxLongValue} value={cellText(value)} onChange={(event) => onChange(event.target.value)} />
    {help}<small className="muted">{cellText(value).length.toLocaleString('en')} of {maxLongValue.toLocaleString('en')} characters.</small>
  </label>
  return <label>{label}
    {column.type === 'dropdown'
      ? <select autoFocus={first} aria-label={column.name} required={column.required} value={cellText(value)} onChange={(event) => onChange(event.target.value)}><option value="">— Choose —</option>{column.options.map((option) => <option key={option} value={option}>{option}</option>)}{extra.map((option) => <option key={option} value={option}>{option} (not in the list)</option>)}</select>
      : <input autoFocus={first} aria-label={column.name} required={column.required} type={column.type === 'number' ? 'number' : column.type === 'date' ? 'date' : 'text'} step={column.type === 'number' ? 'any' : undefined} maxLength={column.type === 'text' ? 2000 : undefined} value={cellText(value)} onChange={(event) => onChange(event.target.value)} />}
    {help}{missing}
    {column.type !== 'dropdown' && flag}
  </label>
}

// OND-23: an amount and its currency, the column's default currency to start with.
function CurrencyField({ column, label, value, first, onChange, help, flag }: { column: OnDemandColumn; label: string; value: OnDemandValue | undefined; first: boolean; onChange: (value: OnDemandValue) => void; help: React.ReactNode; flag: React.ReactNode }) {
  const money = moneyOf(value, column.currency)
  const [amount, setAmount] = useState(money ? String(money.amount) : '')
  const [code, setCode] = useState(money?.currency ?? column.currency ?? defaultCurrency)
  const codes = [...new Set([column.currency ?? defaultCurrency, code, ...currencyCodes])]
  const put = (nextAmount: string, nextCode: string) => { setAmount(nextAmount); setCode(nextCode); onChange(nextAmount.trim() ? `${nextAmount.trim()} ${nextCode}` : '') }
  return <fieldset className="od-money"><legend>{label}</legend>
    <div className="od-money-inputs">
      <input autoFocus={first} aria-label={column.name} required={column.required} type="number" step="any" inputMode="decimal" value={amount} onChange={(event) => put(event.target.value, code)} />
      <select aria-label={`${column.name} currency`} value={code} onChange={(event) => put(amount, event.target.value)}>{codes.map((entry) => <option key={entry} value={entry}>{entry}</option>)}</select>
    </div>
    {help}
    {flag}
  </fieldset>
}

// OND-05, OND-06: the columns of the page in a pop-up — add, rename, reorder (↑ ↓), remove (✕); per column its type,
// required, and for a Dropdown or Multi-select its options (add, rename, reorder, remove). Save first says what it does
// to the values already in the rows, and asks; Save columns then saves the columns to Git at once (OND-28), applied to
// the page as last read from Git; a failed save keeps the pop-up open with the reason.
function ColumnsDialog({ page, onCancel, onSave }: { page: PageFile; onCancel: () => void; onSave: (change: (page: PageFile) => PageFile) => Promise<void> }) {
  const [drafts, setDrafts] = useState<ColumnDraft[]>(() => columnDrafts(page.columns))
  const [prefix, setPrefix] = useState(page.keyPrefix)
  const prefixFixed = hasRowKeys(page)
  const [error, setError] = useState('')
  const [effects, setEffects] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  // LST-08: the built-in lists a column can take its choices from (team lists and Value lists).
  const catalog = useContext(ListCatalogContext)
  const lists = useMemo(() => catalog.map((entry) => ({ ref: entry.ref, name: entry.name, detail: entry.detail, values: [...new Set(entry.items.map((item) => item.name))] })), [catalog])
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const problem = columnsError(drafts)
    if (problem) { setError(problem); return }
    try { setKeyPrefix(page, prefix) } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); return }
    const lines = columnEffects(page, drafts)
    if (lines.length && !effects) { setEffects(lines); return }
    setBusy(true); setError('')
    try { await onSave((base) => applyColumns(setKeyPrefix(base, prefix), drafts)) }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); setBusy(false) }
  }
  return <Modal eyebrow={eyebrowOf(page)} title="Set up columns" wide onClose={() => { if (!busy) onCancel() }}>
    <form onSubmit={(event) => void submit(event)} className="od-columns-form">
      {effects ? <div className="od-effects" role="alert">
        <p><strong>Saving the columns changes values already in the rows:</strong></p>
        <ul>{effects.map((line) => <li key={line}>{line}</li>)}</ul>
        <p className="muted">Nothing is lost by a type change or a removed option: those values are kept and marked. Saved to Git for everyone at once.</p>
      </div> : <>
        <label className="od-prefix">Row key prefix<input aria-label="Row key prefix" required maxLength={8} pattern="[A-Za-z0-9]{1,8}" value={prefix} disabled={prefixFixed} onChange={(event) => { setPrefix(event.target.value.toUpperCase()); setError('') }} />
          <small>{prefixFixed ? `Fixed: rows already have keys such as ${page.rows.find((row) => row.key)?.key}.` : `Every row gets a key such as ${prefix || page.keyPrefix}-261123-K7Q2 (prefix, date, 4 random characters) the moment it is added. 1 to 8 letters or digits; it cannot change once rows have keys.`}</small></label>
        {/* OND-05, OND-06: the shared column-list editor (also the PI Review form setup's, PIR-22). */}
        <ColumnListEditor drafts={drafts} lists={lists} onChange={(next, change) => { setDrafts(next); if (change === 'edit' || change === 'remove') setError(''); setEffects(null) }}
          newDraft={() => ({ id: newId('c'), name: '', type: 'text', required: false, options: [], isNew: true })}
          extra={(draft, index, edit) => draft.type === 'currency' && <CurrencyDefault index={index} value={draft.currency ?? defaultCurrency} onChange={(currency) => edit({ currency })} />}
          addNote={<Info label="Types">Text: any text on one line (up to 2,000 characters). Long text: a paragraph (up to 10,000 characters), shown in 3 lines in the table, in full in the row drawer and in the export. Number: a number (right-aligned, sorted as a number). Currency: an amount and its currency, the column’s default currency to start with (shown “1,200.00 EUR”; Insights never add up different currencies). Date: a date. Dropdown (one value): one option of its list. Multi-select: any number of options of its list. Dropdown (built-in list) and Multi-select (built-in list): one or more values of a shared list — the members of an Azure DevOps team or a Value list (Admin → Epic & Feature setup → Value lists) — as the list is now; a person keeps their rows when renamed, and a value the list no longer has is kept and marked. Changing a type keeps the values: one that does not fit is marked until changed.</Info>} />
      </>}
      {error && <Notice tone="error">{error}</Notice>}
      <div className="modal-actions">
        {effects ? <button type="button" className="ghost" disabled={busy} onClick={() => setEffects(null)}>Back</button> : <button type="button" className="ghost" disabled={busy} onClick={onCancel}>Cancel</button>}
        <button className="primary" disabled={busy}>{busy ? 'Saving to Git…' : effects ? 'Save columns' : 'Save'}</button>
      </div>
    </form>
  </Modal>
}

// OND-23: the default currency of a Currency column — a common ISO code from the list, or another 3-letter code typed in.
function CurrencyDefault({ index, value, onChange }: { index: number; value: string; onChange: (value: string) => void }) {
  const [other, setOther] = useState(!currencyCodes.includes(value))
  return <div className="form-row od-currency-default">
    <label>Default currency<select aria-label={`Column ${index + 1} default currency`} value={other ? 'other' : value} onChange={(event) => { if (event.target.value === 'other') { setOther(true); onChange('') } else { setOther(false); onChange(event.target.value) } }}>{currencyCodes.map((code) => <option key={code} value={code}>{code}</option>)}<option value="other">Other code…</option></select><small>Each row may choose another; Insights show one currency at a time.</small></label>
    {other && <label>Currency code<input aria-label={`Column ${index + 1} currency code`} required maxLength={3} pattern="[A-Za-z]{3}" placeholder="e.g. THB" value={value} onChange={(event) => onChange(event.target.value.toUpperCase())} /><small>3 letters (ISO 4217).</small></label>}
  </div>
}

// OND-10: add a page (name and description; created in Git at once) or rename one (saved to Git at once, OND-28).
// PGB-16: the name must not be another page's in the menu (except: this page's key, 'ondemand:<id>').
export function PageNameDialog({ title, action, name = '', description = '', note, except = '', onCancel, onSave }: { title: string; action: string; name?: string; description?: string; note?: string; except?: string; onCancel: () => void; onSave: (name: string, description: string) => void | Promise<void> }) {
  const [value, setValue] = useState(name)
  const [text, setText] = useState(description)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const clash = usePageNameClash(value, except)
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!value.trim()) { setError('Give the page a name.'); return }
    if (clash) return
    setBusy(true); setError('')
    try { await onSave(value, text) } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); setBusy(false) }
  }
  return <Modal eyebrow="ON-DEMAND · PAGES" title={title} onClose={() => { if (!busy) onCancel() }}>
    <form onSubmit={(event) => void submit(event)}>
      <PageNameField value={value} clash={clash} onChange={(next) => { setValue(next); setError('') }} />
      <label>Description (optional)<input maxLength={300} value={text} onChange={(event) => setText(event.target.value)} /><small>Shown under the page name, e.g. “Cost of Non-Quality”.</small></label>
      {note && <p className="muted">{note}</p>}
      {error && <Notice tone="error">{error}</Notice>}
      <div className="modal-actions"><button type="button" className="ghost" disabled={busy} onClick={onCancel}>Cancel</button><button className="primary" disabled={busy || Boolean(clash)}>{busy ? 'Saving to Git…' : action}</button></div>
    </form>
  </Modal>
}

// OND-10, PGB-20: deleting a page (the Tool Owner) asks first, naming how many rows and columns go with it.
export function RemovePageDialog({ page, inGit, path = onDemandPath(page.id), onCancel, onRemove }: { page: PageFile; inGit: boolean; path?: string; onCancel: () => void; onRemove: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const remove = async () => { setBusy(true); setError(''); try { await onRemove() } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); setBusy(false) } }
  return <Modal eyebrow={eyebrowOf(page)} title="Delete the page" onClose={() => { if (!busy) onCancel() }}>
    <form onSubmit={(event) => { event.preventDefault(); void remove() }}>
      <p>Delete <strong>{page.name}</strong> with its {page.rows.length} row{page.rows.length === 1 ? '' : 's'} and {page.columns.length} column{page.columns.length === 1 ? '' : 's'}, for everyone?{inGit ? page.storage === 'rows' ? <> Its folder {path} (every row file) is deleted from Git in one commit; its history stays in GitHub.</> : <> Its file {path} is deleted from Git; its history stays in GitHub.</> : ' It is not in Git yet.'} To take it out of the menu and keep its data, hide it instead.</p>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="modal-actions"><button type="button" className="ghost" disabled={busy} onClick={onCancel}>Cancel</button><button className="danger-button" disabled={busy}>{busy ? 'Deleting…' : `Delete page and ${page.rows.length} row${page.rows.length === 1 ? '' : 's'}`}</button></div>
    </form>
  </Modal>
}
