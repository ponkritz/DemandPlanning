import { useMemo, useState } from 'react'
import { recordJob } from '../backgroundJobs'
import { DataTable, type DataColumn } from '../components/DataTable'
import { ResultTabs } from '../components/ResultTabs'
import { EmptyState, Info, Modal, Notice, Page, SaveQueueStatus, TablePanel, WriteBlocked } from '../components/ui'
import { outcomeText } from '../gitSaveQueue'
import { formatDateTime } from '../format'
import { applyColumns, hasRowKeys, setKeyPrefix, cellProblem, cellSortValue, cellText, columnDrafts, columnEffects, columnsError, currencyCodes, defaultCurrency, displayText, filterRows, hasOptions, lastUpdate, maxDescription, maxLog, maxLongValue, moneyOf, newId, onDemandPath, onDemandTypes, removeRow, renamePage, rowError, rowId, upsertRow, valuesOf, type ColumnDraft, type OnDemandColumn, type OnDemandPage as PageFile, type OnDemandRow, type OnDemandValue } from '../onDemand'
import { useWriteBlock } from '../useCan'
import type { GitStorage } from '../useGitStorage'
import type { OnDemandStore } from '../useOnDemand'
import { findGroup, pageMenuReason, pageRights, placementOf, removePlacement, type PageKind, type Viewer } from '../menuLayout'
import type { MenuLayoutStore } from '../useMenuLayout'
import { InsightsTab } from './OnDemandInsights'

// OND-03…OND-07 One On-Demand page (CoNQ, or one added under On-Demand): a work table in the shared DataTable — one
// column per configured column, ＋ Add row and Edit in a row pop-up (one way for every row, UI-STANDARDS §3/§4), Remove,
// search, sort, the row count and Export. Set up columns… (the setup right) sets the columns, their type and options. Every
// change is a draft of this page until Save to Git (the unsaved-changes bar, as on QE Mapping), whose result goes to
// Background jobs (§8). Add, rename and remove a page with the setup right. OND-11: two tabs, Data (the table) and
// Insights (charts and tables from its rows, src/pages/OnDemandInsights.tsx), the choice remembered per page.
// OND-19…25: each row's readable ID (given on Save to Git), who added it and when, its update log (History in the row
// pop-up, Last updated by / on as columns hidden at first); Long text and Currency columns; a description per column.
// me: who is editing — the viewer's work email, else their name (OND-20).
// PGB-01: kind — a Table page has the Data table only; a Table + Insights page (CoNQ and every page from before the
// page builder) has both tabs. PGB-09…PGB-11: the rights follow the role rights (CON-103) or a co-ownership of the page
// or its group (menu-layout.json); Add page… opens the shared Add page pop-up (PGB-05).
export function OnDemandPage({ git, store, pageId, me, onOpen, kind = 'table-insights', menu, viewer, addPageReason = '', onAddPage }: { git: GitStorage; store: OnDemandStore; pageId: string; me: string; onOpen: (id: string) => void; kind?: PageKind; menu: MenuLayoutStore; viewer: Viewer; addPageReason?: string; onAddPage: () => void }) {
  const page = store.pages.find((entry) => entry.id === pageId) ?? store.pages[0]
  const draft = page ? store.drafts[page.id] : undefined
  const [search, setSearch] = useState('')
  const [rowDialog, setRowDialog] = useState<{ row: OnDemandRow; isNew: boolean } | null>(null)
  const [columnsOpen, setColumnsOpen] = useState(false)
  const [pageDialog, setPageDialog] = useState<'rename' | 'remove' | null>(null)
  const [commit, setCommit] = useState('')
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState('')
  const block = useWriteBlock()
  // OND-07: what may be changed — the rights of the viewer's roles, a Git token that can save, no synthetic sample.
  const gitReason = !git.connected ? 'Connect Git storage (Admin → Data & sharing) to change the On-Demand pages; they are shared through Git.' : git.readOnly ? 'View only: your Git token can read but not save.' : git.isSample ? 'Synthetic sample data is loaded. Saving to Git is disabled.' : ''
  const rights = page ? pageRights(viewer, menu.layout, page.id) : { setup: false, rows: false, owner: false }
  const rowsReason = gitReason || (rights.rows ? '' : block.noteFor('on this page', 'ondemand.edit'))
  const setupReason = gitReason || (rights.setup ? '' : block.noteFor('on this page', 'ondemand.setup'))
  const canRows = !rowsReason, canSetup = !setupReason
  // PGB-07: renaming and removing the page is a change of the menu: a Tool Owner, a co-owner of its group, or in
  // On-Demand a role allowed "Set up On-Demand pages".
  const menuReason = gitReason || (page ? pageMenuReason(viewer, menu.layout, page.id) : '')
  const blocked = [...(rights.rows ? [] : ['ondemand.edit' as const]), ...(rights.setup ? [] : ['ondemand.setup' as const])]
  const rows = useMemo(() => page ? filterRows(page, search) : [], [page, search])
  if (!page) return <Page><EmptyState title="No On-Demand page yet." /></Page>
  const placement = placementOf(menu.layout, page.id)
  const groupName = findGroup(menu.layout, placement.group)?.name ?? 'On-Demand'
  const owners = [...placement.owners, ...(findGroup(menu.layout, placement.group)?.acceptsPages ? findGroup(menu.layout, placement.group)!.owners : [])]
  const change = (next: PageFile) => { store.setDraft(page.id, next); setSaveError('') }
  const queue = store.queue(page.id)

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!draft) return
    setBusy(true); setSaveError('')
    const label = `Save to Git · ${draft.name}`
    try {
      const saved = await store.save(draft, commit.trim() || `On-Demand ${draft.name}: update`)
      setCommit('')
      recordJob(`ondemand:${page.id}`, label, { text: `${outcomeText(saved)} ${onDemandPath(page.id)}${saved.commitUrl ? ` — ${saved.commitUrl}` : ''}` })
    } catch (failure) {
      const text = failure instanceof Error ? failure.message : String(failure)
      setSaveError(text); recordJob(`ondemand:${page.id}`, label, { text, failed: true })
    } finally { setBusy(false) }
  }
  const discard = () => { store.setDraft(page.id, null); setSaveError('') }

  const onSave = <small className="muted" title="Given on the next Save to Git">on save</small>
  const columns: DataColumn<OnDemandRow>[] = [
    // OND-19: the readable ID, given on Save to Git (sorted by its number).
    { id: 'od-id', label: 'ID', value: (row) => row.seq ?? Number.MAX_SAFE_INTEGER, exportValue: (row) => rowId(page, row), render: (row) => row.seq ? <code className="od-key">{rowId(page, row)}</code> : onSave },
    // OND-18: the row's key, made when the row is added; rows from before keys get theirs on the next Save to Git.
    { id: 'od-key', label: 'Key', value: (row) => row.key ?? '', render: (row) => row.key ? <code className="od-key">{row.key}</code> : onSave },
    ...page.columns.map((column): DataColumn<OnDemandRow> => ({
      id: column.id, label: column.name, hint: column.description, align: column.type === 'number' || column.type === 'currency' ? 'right' : undefined,
      value: (row) => cellSortValue(column, row.cells[column.id]),
      exportValue: (row) => column.type === 'currency' ? displayText(column, row.cells[column.id]) : cellSortValue(column, row.cells[column.id]),
      title: (row) => { const text = cellText(row.cells[column.id]); return text.length > 40 ? text : undefined },
      render: (row) => { const value = row.cells[column.id], problem = cellProblem(column, value); return <>{column.type === 'longtext' ? <span className="od-long">{cellText(value)}</span> : displayText(column, value)}{problem && <>{' '}<small className="od-flag" title={`Kept as it was: ${problem} of “${column.name}”`}>{problem}</small></>}</> },
    })),
    // OND-20, OND-21: who added the row and when (in the viewer's time zone; exported in UTC); the last change, hidden at first.
    { id: 'od-added-by', label: 'Added by', value: (row) => row.addedBy ?? '', render: (row) => row.addedBy || <span className="muted">—</span> },
    { id: 'od-added-on', label: 'Added on', firstSortDesc: true, value: (row) => row.addedAt ?? '', render: (row) => row.addedAt ? formatDateTime(row.addedAt) : <span className="muted">—</span> },
    { id: 'od-updated-by', label: 'Last updated by', defaultHidden: true, export: 'always', value: (row) => lastUpdate(row)?.by ?? '', render: (row) => lastUpdate(row)?.by || <span className="muted">—</span> },
    { id: 'od-updated-on', label: 'Last updated on', defaultHidden: true, export: 'always', firstSortDesc: true, value: (row) => lastUpdate(row)?.at ?? '', render: (row) => { const last = lastUpdate(row); return last ? formatDateTime(last.at) : <span className="muted">—</span> } },
    { id: '@actions', label: 'Actions', sortable: false, export: false, render: (row) => <span className="button-row nowrap">
      <button type="button" className="ghost" disabled={!canRows} title={rowsReason || undefined} aria-label={`Edit row ${rowLabel(page, row)}`} onClick={() => setRowDialog({ row, isNew: false })}>Edit</button>
      <button type="button" className="text-button danger-text" disabled={!canRows} title={rowsReason || undefined} aria-label={`Remove row ${rowLabel(page, row)}`} onClick={() => change(removeRow(page, row.id))}>Remove</button>
    </span> },
  ]

  // The unsaved-changes bar, on both tabs: changes to rows, columns and insights are one draft of the page (OND-09).
  const saveBar = <>
    <SaveQueueStatus state={queue} onRetry={() => void store.retry(page.id)} />
    {draft && (canRows || canSetup) && <form className="git-bar git-bar-dirty" onSubmit={(event) => void save(event)}>
      <span><strong>Unsaved changes to {draft.name}</strong> — not yet in Git</span>
      <input aria-label="Change description" value={commit} onChange={(event) => setCommit(event.target.value)} placeholder="Describe the change (optional)" />
      {saveError && <Notice tone="error">{saveError}</Notice>}
      <button type="button" className="ghost" disabled={busy} onClick={discard}>Discard</button>
      <button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save to Git'}</button>
    </form>}
  </>

  return <Page className="on-demand-page" intro="A table the team sets up itself, shared with everyone through Git."
    actions={<>
      <button type="button" className="ghost" disabled={Boolean(gitReason || addPageReason)} title={gitReason || addPageReason || undefined} onClick={onAddPage}>＋ Add page…</button>
      <button type="button" className="ghost" disabled={Boolean(menuReason)} title={menuReason || undefined} onClick={() => setPageDialog('rename')}>Rename page…</button>
      <button type="button" className="danger-button od-remove-page" disabled={Boolean(menuReason)} title={menuReason || undefined} onClick={() => setPageDialog('remove')}>Remove page…</button>
      {git.connected && <button type="button" className="ghost" onClick={() => { if (draft && !window.confirm(`Discard the unsaved changes to ${page.name}?`)) return; discard(); void store.reload() }}>↻ Reload from Git</button>}
    </>}>
    {gitReason && <Notice tone={git.isSample ? 'warning' : 'info'}>{gitReason}{!git.connected && store.inGit(page.id) ? ' The page last loaded in this browser is shown.' : ''}</Notice>}
    {store.errors.map((error) => <Notice key={error} tone="error">On-Demand: {error}</Notice>)}
    {store.loaded && !store.inGit(page.id) && !draft && <Notice tone="info">{page.name} is not in Git yet: it is created with its first Save to Git.</Notice>}
    {(() => { const table = <TablePanel className="od-panel" eyebrow={groupName.toUpperCase()} title={page.name} detail={page.description || undefined}
      info={<>Each column has a type — Text, Long text (a paragraph), Number, Currency (an amount and its currency), Date, Dropdown (one value) or Multi-select with the options of its list — and may have a description (ⓘ on its heading) saying how or what to fill. A value that no longer fits its column (an option removed, the type changed) is kept and marked, e.g. “not in the list”, until it is changed. Every row gets a readable ID such as {page.keyPrefix}-0001 when it is first saved to Git, and records who added it and when; every saved change is logged in the row’s History (who, when, what changed — the last {maxLog}): open it with Edit. Last updated by / on can be shown with Columns. The export holds the IDs, values, Added by / on and Last updated by / on (in UTC), not the History. Saved in Git as {onDemandPath(page.id)}; two saves at the same time are merged row by row and column by column, the later one winning where both changed the same.{store.history(page.id) && <> <a href={store.history(page.id)} target="_blank" rel="noreferrer">History in GitHub</a></>}{owners.length > 0 && <> Co-owners (set up the page and edit its rows): {[...new Set(owners)].join(', ')}.</>}</>}
      action={<button type="button" className="ghost" disabled={!canSetup} title={setupReason || undefined} onClick={() => setColumnsOpen(true)}>Set up columns…</button>}>
      {!gitReason && <WriteBlocked reason={block.noteFor('on this page', ...blocked)} />}
      {page.columns.length ? <DataTable id={`on-demand:${page.id}`} columns={columns} rows={rows} rowKey={(row) => row.id} exportName={page.name}
        toolbar={<><input className="search" type="search" aria-label={`Search ${page.name}`} placeholder="Search all columns" value={search} onChange={(event) => setSearch(event.target.value)} />
          <button type="button" className="ghost" disabled={!canRows} title={rowsReason || undefined} onClick={() => setRowDialog({ row: { id: newId('r'), cells: {} }, isNew: true })}>＋ Add row</button></>}
        status={`${rows.length} of ${page.rows.length} row${page.rows.length === 1 ? '' : 's'}`}
        empty={<EmptyState title={page.rows.length ? 'No row matches the search.' : 'No rows yet.'} detail={page.rows.length ? undefined : canRows ? 'Add the first one with ＋ Add row.' : undefined} />} />
        : <EmptyState title="No columns yet." detail={canSetup ? 'Add them with Set up columns…: a name and a type for each, and the options of a Dropdown or Multi-select.' : 'Someone allowed to set up On-Demand pages adds the columns.'} />}
      {saveBar}
    </TablePanel>
      // PGB-01: a Table page is the Data table alone; Table + Insights adds the Insights tab (OND-11).
      return kind === 'table' ? table : <ResultTabs id={`on-demand:${page.id}`} mainLabel="Data" rawLabel="Insights" rawCount={page.insights.length}
        raw={<InsightsTab page={page} canSetup={canSetup} setupReason={setupReason} blockNote={gitReason || rights.setup ? '' : block.noteFor('on this tab', 'ondemand.setup')} saveBar={saveBar} onChange={change} />}
        main={table} />
    })()}
    {rowDialog && <RowDialog page={page} row={rowDialog.row} isNew={rowDialog.isNew} pending={Boolean(draft)} onCancel={() => setRowDialog(null)} onSave={(row) => { change(upsertRow(page, row, { by: me })); setRowDialog(null) }} />}
    {columnsOpen && <ColumnsDialog page={page} onCancel={() => setColumnsOpen(false)} onSave={(next) => { change(next); setColumnsOpen(false) }} />}
    {pageDialog === 'rename' && <PageNameDialog title="Rename the page" action="Save" name={page.name} description={page.description} note="Saved for everyone with Save to Git." onCancel={() => setPageDialog(null)} onSave={(name, description) => { change(renamePage(page, name, description)); setPageDialog(null) }} />}
    {pageDialog === 'remove' && <RemovePageDialog page={page} inGit={store.inGit(page.id)} onCancel={() => setPageDialog(null)} onRemove={async () => {
      await store.remove(page.id, `On-Demand: remove the page ${page.name} (${page.rows.length} rows)`)
      // PGB-07: its place in the menu goes with it.
      if (menu.layout.pages[page.id]) await menu.save(removePlacement(menu.layout, page.id), `Pages & menu: remove the page ${page.name}`)
      recordJob(`ondemand:${page.id}`, `Remove page · ${page.name}`, { text: `Removed ${onDemandPath(page.id)} with its ${page.rows.length} row${page.rows.length === 1 ? '' : 's'}; its history stays in GitHub.` })
      setPageDialog(null); const next = store.pages.find((entry) => entry.id !== page.id); if (next) onOpen(next.id)
    }} />}
  </Page>
}

const rowLabel = (page: PageFile, row: OnDemandRow) => { const first = page.columns.find((column) => cellText(row.cells[column.id])); return first ? cellText(row.cells[first.id]).slice(0, 60) : row.id }
const eyebrowOf = (page: PageFile) => `ON-DEMAND · ${page.name.toUpperCase()}`

// OND-04: one row in a pop-up — a field per column by its type, its description under it (OND-25); required columns
// must be filled. OND-19…21: the row's ID, key, who added it and when, and on Edit the row's History, newest first.
// Save puts the row in the unsaved changes of the page; the change is logged on its own (no comment to type).
function RowDialog({ page, row, isNew, pending, onCancel, onSave }: { page: PageFile; row: OnDemandRow; isNew: boolean; pending: boolean; onCancel: () => void; onSave: (row: OnDemandRow) => void }) {
  const [cells, setCells] = useState<Record<string, OnDemandValue>>(row.cells)
  const [error, setError] = useState('')
  const set = (id: string, value: OnDemandValue) => { setCells({ ...cells, [id]: value }); setError('') }
  const submit = (event: React.FormEvent) => { event.preventDefault(); const problem = rowError(page.columns, cells); if (problem) { setError(problem); return } onSave({ id: row.id, ...(row.key ? { key: row.key } : {}), cells }) }
  return <Modal eyebrow={eyebrowOf(page)} title={isNew ? 'Add a row' : 'Edit the row'} onClose={onCancel}>
    <form onSubmit={submit} className="od-row-form" noValidate>
      <dl className="od-row-facts">
        <div><dt>ID</dt><dd>{row.seq ? <code className="od-key">{rowId(page, row)}</code> : <span className="muted">{isNew ? 'given on Save to Git (the next number, it never changes)' : 'given on the next Save to Git'}</span>}</dd></div>
        <div><dt>Key</dt><dd>{row.key ? <code className="od-key">{row.key}</code> : isNew ? <span className="muted">given when the row is added (unique, it never changes)</span> : <span className="muted">given on the next Save to Git</span>}</dd></div>
        {!isNew && <div><dt>Added</dt><dd>{row.addedAt ? `${formatDateTime(row.addedAt)} by ${row.addedBy || 'unknown'}` : <span className="muted">— (before this was recorded)</span>}</dd></div>}
      </dl>
      {page.columns.map((column, index) => <Field key={column.id} column={column} value={cells[column.id]} first={index === 0} onChange={(value) => set(column.id, value)} />)}
      {pending && <p className="muted">The page has other unsaved changes; this row is saved to Git with them.</p>}
      {error && <Notice tone="error">{error}</Notice>}
      <div className="modal-actions"><button type="button" className="ghost" onClick={onCancel}>Cancel</button><button className="primary">{isNew ? 'Add row' : 'Save'}</button></div>
      {!isNew && <History page={page} row={row} />}
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
      <p className="od-history-head"><strong>{entry.added ? 'Added' : 'Changed'}</strong> · {formatDateTime(entry.at)} · {entry.by}</p>
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
  if (column.type === 'multi') return <fieldset className="od-multi"><legend>{label}</legend>
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
    {help}
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
// to the values already in the rows, and asks; Save columns then puts the change in the page's unsaved changes.
function ColumnsDialog({ page, onCancel, onSave }: { page: PageFile; onCancel: () => void; onSave: (page: PageFile) => void }) {
  const [drafts, setDrafts] = useState<ColumnDraft[]>(() => columnDrafts(page.columns))
  const [prefix, setPrefix] = useState(page.keyPrefix)
  const prefixFixed = hasRowKeys(page)
  const [error, setError] = useState('')
  const [effects, setEffects] = useState<string[] | null>(null)
  const edit = (index: number, change: Partial<ColumnDraft>) => { setDrafts(drafts.map((draft, at) => at === index ? { ...draft, ...change } : draft)); setError(''); setEffects(null) }
  const move = <T,>(list: T[], at: number, by: number) => { const to = at + by; if (to < 0 || to >= list.length) return list; const next = [...list];[next[at], next[to]] = [next[to], next[at]]; return next }
  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const problem = columnsError(drafts)
    if (problem) { setError(problem); return }
    let keyed: PageFile
    try { keyed = setKeyPrefix(page, prefix) } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); return }
    const lines = columnEffects(page, drafts)
    if (lines.length && !effects) { setEffects(lines); return }
    onSave(applyColumns(keyed, drafts))
  }
  return <Modal eyebrow={eyebrowOf(page)} title="Set up columns" wide onClose={onCancel}>
    <form onSubmit={submit} className="od-columns-form">
      {effects ? <div className="od-effects" role="alert">
        <p><strong>Saving the columns changes values already in the rows:</strong></p>
        <ul>{effects.map((line) => <li key={line}>{line}</li>)}</ul>
        <p className="muted">Nothing is lost by a type change or a removed option: those values are kept and marked. Saved for everyone with Save to Git.</p>
      </div> : <>
        <label className="od-prefix">Row key prefix<input aria-label="Row key prefix" required maxLength={8} pattern="[A-Za-z0-9]{1,8}" value={prefix} disabled={prefixFixed} onChange={(event) => { setPrefix(event.target.value.toUpperCase()); setError('') }} />
          <small>{prefixFixed ? `Fixed: rows already have keys such as ${page.rows.find((row) => row.key)?.key}.` : `Every row gets a key such as ${prefix || page.keyPrefix}-261123-K7Q2 (prefix, date, 4 random characters) the moment it is added. 1 to 8 letters or digits; it cannot change once rows have keys.`}</small></label>
        {!drafts.length && <EmptyState title="No columns yet." detail="Add the first one with ＋ Add column." />}
        <ol className="od-columns">{drafts.map((draft, index) => <li key={draft.id} className="od-column">
          <div className="od-column-head">
            <label>Name<input aria-label={`Column ${index + 1} name`} autoFocus={index === drafts.length - 1 && draft.isNew} required maxLength={120} value={draft.name} onChange={(event) => edit(index, { name: event.target.value })} /></label>
            <label>Type<select aria-label={`Column ${index + 1} type`} value={draft.type} onChange={(event) => edit(index, { type: event.target.value as ColumnDraft['type'] })}>{onDemandTypes.map((type) => <option key={type.key} value={type.key}>{type.label}</option>)}</select></label>
            <label className="check"><input type="checkbox" checked={draft.required} onChange={(event) => edit(index, { required: event.target.checked })} />Required</label>
            <span className="button-row od-column-moves">
              <button type="button" className="ghost" aria-label={`Move ${draft.name || `column ${index + 1}`} up`} disabled={index === 0} onClick={() => { setDrafts(move(drafts, index, -1)); setEffects(null) }}>↑</button>
              <button type="button" className="ghost" aria-label={`Move ${draft.name || `column ${index + 1}`} down`} disabled={index === drafts.length - 1} onClick={() => { setDrafts(move(drafts, index, 1)); setEffects(null) }}>↓</button>
              <button type="button" className="text-button danger-text" aria-label={`Remove column ${draft.name || index + 1}`} onClick={() => { setDrafts(drafts.filter((_, at) => at !== index)); setError(''); setEffects(null) }}>✕</button>
            </span>
          </div>
          {draft.type === 'currency' && <CurrencyDefault index={index} value={draft.currency ?? defaultCurrency} onChange={(currency) => edit(index, { currency })} />}
          <label className="od-description">Description (optional)<textarea aria-label={`Column ${index + 1} description`} rows={2} maxLength={maxDescription} value={draft.description ?? ''} placeholder="How or what to fill, e.g. “The cost in the supplier’s currency, without VAT.”" onChange={(event) => edit(index, { description: event.target.value })} /><small>Shown under the field in the row pop-up and behind ⓘ on the column heading; up to {maxDescription} characters.</small></label>
          {hasOptions(draft.type) && <div className="od-options"><small>Options of “{draft.name || `column ${index + 1}`}”</small>
            {draft.options.map((option, at) => <div key={at} className="od-option">
              <input aria-label={`${draft.name || `Column ${index + 1}`} option ${at + 1}`} maxLength={120} value={option.label} onChange={(event) => edit(index, { options: draft.options.map((entry, i) => i === at ? { ...entry, label: event.target.value } : entry) })} />
              <button type="button" className="ghost" aria-label={`Move option ${option.label || at + 1} up`} disabled={at === 0} onClick={() => edit(index, { options: move(draft.options, at, -1) })}>↑</button>
              <button type="button" className="ghost" aria-label={`Move option ${option.label || at + 1} down`} disabled={at === draft.options.length - 1} onClick={() => edit(index, { options: move(draft.options, at, 1) })}>↓</button>
              <button type="button" className="text-button danger-text" aria-label={`Remove option ${option.label || at + 1}`} onClick={() => edit(index, { options: draft.options.filter((_, i) => i !== at) })}>✕</button>
            </div>)}
            <button type="button" className="text-button" onClick={() => edit(index, { options: [...draft.options, { label: '' }] })}>＋ Add option</button>
          </div>}
        </li>)}</ol>
        <div><button type="button" className="ghost" onClick={() => { setDrafts([...drafts, { id: newId('c'), name: '', type: 'text', required: false, options: [], isNew: true }]); setEffects(null) }}>＋ Add column</button> <Info label="Types">Text: any text on one line (up to 2,000 characters). Long text: a paragraph (up to 10,000 characters), shown in 3 lines in the table, in full in the row pop-up and in the export. Number: a number (right-aligned, sorted as a number). Currency: an amount and its currency, the column’s default currency to start with (shown “1,200.00 EUR”; Insights never add up different currencies). Date: a date. Dropdown (one value): one option of its list. Multi-select: any number of options of its list. Changing a type keeps the values: one that does not fit is marked until changed.</Info></div>
      </>}
      {error && <Notice tone="error">{error}</Notice>}
      <div className="modal-actions">
        {effects ? <button type="button" className="ghost" onClick={() => setEffects(null)}>Back</button> : <button type="button" className="ghost" onClick={onCancel}>Cancel</button>}
        <button className="primary">{effects ? 'Save columns' : 'Save'}</button>
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

// OND-10: add a page (name and description; created in Git at once) or rename one (a change saved with Save to Git).
function PageNameDialog({ title, action, name = '', description = '', note, onCancel, onSave }: { title: string; action: string; name?: string; description?: string; note?: string; onCancel: () => void; onSave: (name: string, description: string) => void | Promise<void> }) {
  const [value, setValue] = useState(name)
  const [text, setText] = useState(description)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!value.trim()) { setError('Give the page a name.'); return }
    setBusy(true); setError('')
    try { await onSave(value, text) } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); setBusy(false) }
  }
  return <Modal eyebrow="ON-DEMAND · PAGES" title={title} onClose={() => { if (!busy) onCancel() }}>
    <form onSubmit={(event) => void submit(event)}>
      <label>Page name<input autoFocus required maxLength={80} value={value} onChange={(event) => { setValue(event.target.value); setError('') }} /></label>
      <label>Description (optional)<input maxLength={300} value={text} onChange={(event) => setText(event.target.value)} /><small>Shown under the page name, e.g. “Cost of Non-Quality”.</small></label>
      {note && <p className="muted">{note}</p>}
      {error && <Notice tone="error">{error}</Notice>}
      <div className="modal-actions"><button type="button" className="ghost" disabled={busy} onClick={onCancel}>Cancel</button><button className="primary" disabled={busy}>{busy ? 'Saving to Git…' : action}</button></div>
    </form>
  </Modal>
}

// OND-10: removing a page asks first, naming how many rows go with it.
export function RemovePageDialog({ page, inGit, onCancel, onRemove }: { page: PageFile; inGit: boolean; onCancel: () => void; onRemove: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const remove = async () => { setBusy(true); setError(''); try { await onRemove() } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); setBusy(false) } }
  return <Modal eyebrow={eyebrowOf(page)} title="Remove the page" onClose={() => { if (!busy) onCancel() }}>
    <form onSubmit={(event) => { event.preventDefault(); void remove() }}>
      <p>Remove <strong>{page.name}</strong> with its {page.rows.length} row{page.rows.length === 1 ? '' : 's'} and {page.columns.length} column{page.columns.length === 1 ? '' : 's'}, for everyone?{inGit ? <> Its file {onDemandPath(page.id)} is deleted from Git; its history stays in GitHub.</> : ' It is not in Git yet.'}</p>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="modal-actions"><button type="button" className="ghost" disabled={busy} onClick={onCancel}>Cancel</button><button className="danger-button" disabled={busy}>{busy ? 'Removing…' : `Remove page and ${page.rows.length} row${page.rows.length === 1 ? '' : 's'}`}</button></div>
    </form>
  </Modal>
}
