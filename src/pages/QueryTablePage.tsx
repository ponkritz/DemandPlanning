import { useRef, useState } from 'react'
import { ViewActions } from '../components/ViewActions'
import { runInBackground, recordJob } from '../backgroundJobs'
import { DataTable, type DataColumn } from '../components/DataTable'
import { ResultTabs } from '../components/ResultTabs'
import { EmptyState, Notice, Page, SaveQueueStatus, TablePanel, WriteBlocked } from '../components/ui'
import { outcomeText } from '../gitSaveQueue'
import { formatDateTime } from '../format'
import { cellSortValue, cellText, displayText, filterRows, hasOptions, renamePage, valuesOf, type OnDemandPage as PageFile, type OnDemandRow } from '../onDemand'
import { fieldIdOf, maxQueryColumns, maxQueryRows } from '../azureQuerySources'
import { serverLabel, type AzureQueryRef } from '../azureQueryRef'
import { useAzureQueries } from '../useAzureQueries'
import { useWriteBlock } from '../useCan'
import type { GitStorage } from '../useGitStorage'
import type { OnDemandStore } from '../useOnDemand'
import { deleteReason, findGroup, hideReason, isHidden, pageMenuReason, pageRights, removePlacement, setHidden, placementOf, type PageKind, type Viewer } from '../menuLayout'
import type { MenuLayoutStore } from '../useMenuLayout'
import type { PersonalViewsStore } from '../usePersonalViews'
import type { AzureConnectionProfileSummary } from '../azureCredentials'
import { ExportNoteContext } from '../exportNote'
import { sourceProblem } from '../pageType'
import { InsightsTab } from './OnDemandInsights'
import { PageNameDialog, RemovePageDialog } from './OnDemandPage'

// PGB-24, PGB-25 A Table (Query) page: the rows and columns of a saved Azure DevOps query (its reference in the page's
// file, PGB-23), read when the page opens and again with ↻ Refresh — with each viewer's own PAT, read only, nothing
// written to Azure DevOps (the read of DSH-19, useAzureQueries). The rows stay in this page's memory only: never in
// Git, a backup or the browser. Search, sort, Columns, Export and Group by / Filter by column work on them; there is no
// ＋ Add row, no row drawer, no Edit / Hide, no Set up columns, Replace…, Excel template / upload, row files or Sample —
// those controls do not exist for this source. A Table + Insights page's Insights tab reads the same rows (the "linked"
// data); its charts and tables are kept in the page's file like a Build your own page's (OND-16). PGB-27: a source the
// app cannot use is shown with its reason, and no rows are read.
export interface QueryPageAzure { profiles: AzureConnectionProfileSummary[]; viewingAs: boolean }
export function QueryTablePage({ git, store, pageId, onOpen, kind = 'table', menu, viewer, addPageReason = '', onAddPage, views, azure, embedded = false }: { git: GitStorage; store: OnDemandStore; pageId: string; onOpen: (id: string) => void; kind?: PageKind; menu: MenuLayoutStore; viewer: Viewer; addPageReason?: string; onAddPage: () => void; views?: PersonalViewsStore; azure?: QueryPageAzure; embedded?: boolean }) {
  const listed = store.pages.find((entry) => entry.id === pageId)
  const page = (listed && store.full(listed.id)) || listed
  const source = page?.source
  // The one reference read (useAzureQueries keys its reads by server, project and query id, so a new list is harmless).
  const refs: AzureQueryRef[] = source?.kind === 'query' ? [source.query] : []
  const queries = useAzureQueries(refs, () => true, { profiles: azure?.profiles ?? [], viewingAs: azure?.viewingAs })
  const [search, setSearch] = useState('')
  const [pageDialog, setPageDialog] = useState<'rename' | 'remove' | null>(null)
  const shownRef = useRef<OnDemandRow[]>([])
  const block = useWriteBlock()
  const data = queries.datasets[0]
  const rows = data && !data.problem ? filterRows(data.page, search) : []
  if (!page) return <Page><EmptyState title="No On-Demand page yet." /></Page>
  const gitReason = !git.connected ? 'Connect Git storage (Admin → Data & history) to change the On-Demand pages; they are shared through Git.' : git.readOnly ? 'View only: your Git token can read but not save.' : git.isSample ? 'Synthetic sample data is loaded. Saving to Git is disabled.' : ''
  const rights = pageRights(viewer, menu.layout, page.id)
  const menuReason = gitReason || pageMenuReason(viewer, menu.layout, page.id)
  const hidingReason = gitReason || hideReason(viewer, menu.layout, page.id)
  const removeReason = gitReason || deleteReason(viewer)
  const hidden = isHidden(menu.layout, page.id)
  const placement = placementOf(menu.layout, page.id)
  const groupName = findGroup(menu.layout, placement.group)?.name ?? 'On-Demand'
  const path = store.filePath(page.id)
  const invalid = sourceProblem(source)
  const ref = source?.kind === 'query' ? source.query : null
  const columnsRead = Boolean(data && !data.problem && data.page.columns.length)
  const setupReason = gitReason || (rights.setup ? '' : block.noteFor('on this page', 'ondemand.setup')) || (columnsRead ? '' : 'The query’s columns are not read yet: its rows are read from Azure DevOps with your own PAT.')
  const queue = store.queue(page.id)
  const pending = store.pending(page.id)
  const retry = () => void inBackground(`Retry · ${page.name}`, async () => { await store.retry(page.id); return { value: null, text: `Saved to Git. ${path}` } }).catch(() => undefined)
  const saveBar = <>
    <SaveQueueStatus state={queue} onRetry={retry} />
    {pending.length > 0 && <Notice tone="warning" className="od-pending">Not saved to Git: {pending.length === 1 ? `the change to the ${pending[0].label}` : `${pending.length} changes`} of {page.name}, kept here — {pending[pending.length - 1].error}{' '}
      <span className="button-row"><button type="button" className="ghost" onClick={() => store.discard(page.id)}>Discard</button><button type="button" className="primary" onClick={retry}>Retry</button></span>
    </Notice>}
  </>
  const toggleHidden = () => { const next = !hidden; void inBackground(`${next ? 'Hide' : 'Show'} page · ${page.name}`, async () => { const saved = await menu.save(setHidden(menu.layout, page.id, next, store.pages.map((entry) => entry.id)), `Pages & menu: ${next ? 'hide' : 'show'} the page ${page.name}`); return { value: saved, text: `${next ? 'Hidden from the menu, Home and search for everyone; its query reference stays in Git.' : 'Shown in the menu again.'} ${menu.path}` } }).catch(() => undefined) }

  // The query's columns as the table's columns: values as Azure DevOps gives them (identities by name, DSH-20); the ID
  // links to the work item in Azure DevOps.
  const idColumn = fieldIdOf('System.Id')
  const linkOf = (row: OnDemandRow) => row.link ? <a href={row.link} target="_blank" rel="noreferrer">{row.key ?? row.id}</a> : row.key ?? ''
  const columns: DataColumn<OnDemandRow>[] = data && !data.problem ? [
    ...(data.page.columns.some((column) => column.id === idColumn) ? [] : [{ id: '@work-item', label: 'Work item', groupable: false, value: (row: OnDemandRow) => Number((row.key ?? '').slice(1)) || 0, exportValue: (row: OnDemandRow) => row.key ?? '', render: linkOf } satisfies DataColumn<OnDemandRow>]),
    ...data.page.columns.map((column): DataColumn<OnDemandRow> => ({
      id: column.id, label: column.name, align: column.type === 'number' ? 'right' : undefined, groupable: column.id === idColumn ? false : undefined,
      value: (row) => column.id === idColumn ? Number(cellText(row.cells[column.id])) || 0 : cellSortValue(column, row.cells[column.id]),
      shown: (row) => column.type === 'multi' ? valuesOf(row.cells[column.id]) : displayText(column, row.cells[column.id]),
      filterOptions: hasOptions(column.type) ? column.options : undefined,
      exportValue: (row) => cellSortValue(column, row.cells[column.id]),
      title: (row) => { const text = cellText(row.cells[column.id]); return text.length > 40 ? text : undefined },
      render: (row) => column.id === idColumn ? linkOf(row) : displayText(column, row.cells[column.id]),
    })),
  ] : []
  const readText = ref && data && !data.problem ? `Rows of the saved query ${ref.name} on ${serverLabel(ref.server)}, project ${ref.project}, read from Azure DevOps with your own PAT${data.readAt ? ` at ${formatDateTime(data.readAt)}` : ''}.` : ref ? `Rows of the saved query ${ref.name} on ${serverLabel(ref.server)}, project ${ref.project}, read from Azure DevOps with each viewer’s own PAT.` : undefined
  const loading = Boolean(data?.problem && queries.reading)

  const table = <TablePanel className="od-panel" eyebrow={groupName.toUpperCase()} title={page.name} detail={page.description || readText}
    info={<>The rows and columns of a saved Azure DevOps query, read when the page opens and again with ↻ Refresh — with your own PAT, so Azure DevOps decides what you may see. Read only: rows are changed in Azure DevOps, not here, and nothing is written to Azure DevOps. Only the query’s reference (server, project, query id and name) is kept in {path} in Git — never a PAT, never rows. At most {maxQueryRows.toLocaleString('en-US')} rows and {maxQueryColumns} columns are read.{page.description && readText ? ` ${readText}` : ''}</>}
    action={ref ? <button type="button" className="ghost" aria-label={`Read ${ref.name} again from Azure DevOps`} disabled={queries.reading} onClick={queries.refresh}>↻ Refresh</button> : undefined}>
    {invalid ? <EmptyState title="The rows cannot be read." detail={`${invalid} A Tool Owner fixes ${path} in Git, or adds a new Table (Query) page.`} />
      : loading ? <p className="muted" role="status">Loading the rows of {ref?.name} from Azure DevOps…</p>
      : !data || data.problem ? <EmptyState title="The rows cannot be shown." detail={data?.problem ?? 'The query is not read yet.'} />
      : <>
        {data.capped && <Notice tone="warning">{data.capped}</Notice>}
        <DataTable id={`on-demand:${page.id}`} columns={columns} rows={rows} rowKey={(row) => row.id} exportName={page.name} groupFilter shownRef={shownRef}
          toolbar={<input className="search" type="search" aria-label={`Search ${page.name}`} placeholder="Search all columns" value={search} onChange={(event) => setSearch(event.target.value)} />}
          status={(shown) => `${shown} of ${data.page.rows.length} row${data.page.rows.length === 1 ? '' : 's'}`}
          empty={<EmptyState title={data.page.rows.length ? 'No row matches the search.' : 'The query returns no rows.'} detail={data.page.rows.length ? 'Change the search, or Reset filters.' : 'Change the query in Azure DevOps, then read it again with ↻ Refresh.'} />} />
      </>}
    {saveBar}
  </TablePanel>
  // PGB-25: the Insights tab over the same rows — the query's columns, by their field ids (DSH-20), so a chart follows the
  // query for every viewer; the charts are saved in the page's file.
  const insightsPage: PageFile = { ...page, columns: data && !data.problem ? data.page.columns : [], rows: data && !data.problem ? data.page.rows : [] }
  const saveInsights = (next: PageFile, message?: string) => void inBackground(`Save to Git · ${page.name} · charts and tables`, async () => {
    const saved = await store.update(page.id, (base) => { const out = { ...base, insights: next.insights }; if (next.colors) out.colors = next.colors; else delete out.colors; if (next.insightFilters) out.insightFilters = next.insightFilters; else delete out.insightFilters; return out }, message ?? `${page.name}: change the charts and tables`)
    return { value: saved, text: `${outcomeText(saved)} ${store.filePath(page.id)}${saved.commitUrl ? ` — ${saved.commitUrl}` : ''}` }
  }).catch(() => undefined)

  return <ExportNoteContext.Provider value={data?.capped ? { prefix: 'Capped-', line: data.capped } : null}><Page className="on-demand-page od-query-page" embedded={embedded} intro={embedded ? undefined : 'A table of a saved Azure DevOps query, read with your own PAT; read only.'}
    actions={<ViewActions label={`page ${page.name}`} primary={embedded || gitReason || addPageReason ? undefined : <button type="button" className="ghost" onClick={onAddPage}>＋ Add page…</button>} items={[
      ...(!embedded && (gitReason || addPageReason) ? [{ key: 'add', label: '＋ Add page…', disabled: true, title: gitReason || addPageReason }] : []),
      ...(embedded ? [] : [
        { key: 'rename', label: 'Rename page…', disabled: Boolean(menuReason), title: menuReason || undefined, onClick: () => setPageDialog('rename') },
        { key: 'hide', label: hidden ? 'Show page' : 'Hide page', disabled: Boolean(hidingReason), title: hidingReason || undefined, onClick: toggleHidden },
        { key: 'delete', label: 'Delete page…', danger: true, disabled: Boolean(removeReason), title: removeReason || undefined, onClick: () => setPageDialog('remove') },
      ]),
      ...(git.connected ? [{ key: 'reload', label: '↻ Reload from Git', onClick: () => { store.discard(page.id); void store.reload() } }] : []),
    ]} />}>
    {gitReason && <Notice tone={git.isSample ? 'warning' : 'info'}>{gitReason}</Notice>}
    {store.errors.map((error) => <Notice key={error} tone="error">On-Demand: {error}</Notice>)}
    {invalid && <Notice tone="warning">{invalid}</Notice>}
    {hidden && !embedded && <Notice tone="info" className="od-hidden-note">{page.name} is hidden: it is not in the menu, on Home or in search for anyone. Its query reference stays in Git; it opens from Admin → Pages & reports → Menu groups & pages.{!hidingReason && <>{' '}<button type="button" className="ghost" onClick={toggleHidden}>Show page</button></>}</Notice>}
    {!gitReason && !rights.setup && kind === 'table-insights' && <WriteBlocked reason={block.noteFor('on this page', 'ondemand.setup')} />}
    {kind === 'table' ? table : <ResultTabs id={`on-demand:${page.id}`} mainLabel="Data" rawLabel="Insights" rawCount={page.insights.length}
      raw={<InsightsTab page={insightsPage} canSetup={!setupReason} setupReason={setupReason} blockNote={gitReason || rights.setup ? '' : block.noteFor('on this tab', 'ondemand.setup')} saveBar={saveBar} views={views} onChange={saveInsights} />}
      main={table} />}
    {pageDialog === 'rename' && <PageNameDialog title="Rename the page" action="Save to Git" name={page.name} description={page.description} except={`ondemand:${page.id}`} note="Saved to Git for everyone at once." onCancel={() => setPageDialog(null)} onSave={async (name, description) => {
      await inBackground(`Save to Git · ${page.name} · rename`, async () => { const saved = await store.update(page.id, (base) => renamePage(base, name, description), `On-Demand: rename ${page.name} to ${name.trim()}`); return { value: saved, text: `${outcomeText(saved)} ${store.filePath(page.id)}` } })
      setPageDialog(null)
    }} />}
    {pageDialog === 'remove' && <RemovePageDialog page={page} inGit={store.inGit(page.id)} path={path} onCancel={() => setPageDialog(null)} onRemove={async () => {
      await store.remove(page.id, `On-Demand: delete the page ${page.name} (a Table (Query) page)`)
      if (menu.layout.pages[page.id]) await menu.save(removePlacement(menu.layout, page.id), `Pages & menu: remove the page ${page.name}`)
      recordJob(`ondemand:${page.id}`, `Delete page · ${page.name}`, { text: `Deleted ${path} (the query’s reference); the query in Azure DevOps is not changed and its history stays in GitHub.` })
      setPageDialog(null); const next = store.pages.find((entry) => entry.id !== page.id); if (next) onOpen(next.id)
    }} />}
  </Page></ExportNoteContext.Provider>
}

// A save as a Background job (UI-STANDARDS §8), as on a Build your own page.
let jobCount = 0
function inBackground<T>(label: string, work: () => Promise<{ value: T; text: string }>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    runInBackground(`ondemand-query:${jobCount++}`, label, async (progress) => {
      progress('Saving to Git…')
      try { const done = await work(); resolve(done.value); return { text: done.text } }
      catch (failure) { reject(failure); throw failure }
    })
  })
}
