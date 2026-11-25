import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { DataTable, type DataColumn } from '../components/DataTable'
import { MultiSelect } from '../components/MultiSelect'
import { Drawer, EmptyState, Notice, Page, Pill, TablePanel, WriteBlocked } from '../components/ui'
import { listJobs, runInBackground, subscribeJobs } from '../backgroundJobs'
import { rateLimitWait, readAzureIterations, readDiscussion, type AzureConfig, type AzureIteration } from '../azureDevOps'
import { capacityContext } from '../capacity'
import { formatDate, formatDateTime } from '../format'
import { useNow } from '../useNow'
import { defaultPi, discussionOf, discussionsVersion, epicOf, latestComment, moveLabel, oneLine, piFeatures, piLabel, piOptions, readDiscussions, samePi, setDiscussion, splitReviewComment, subscribeDiscussions, type ReviewSplit } from '../piReview'
import type { WorkItemComment } from '../azureDevOps'
import type { AzureWorkItem } from '../domain'
import type { AzureWorkspace } from '../useAzureWorkspace'
import type { PageProps } from './types'

// PI Review (PIR-01…PIR-10): choose a PI, see its Features, and read each Feature's Discussion (all pages, newest
// first, as plain text) in a drawer, or every Discussion at once as a background job; the latest comment of each read
// Discussion fills five columns, split by its Struggles / Learnings / Move to next PI headings. Read only: nothing is
// written to Azure DevOps, Git or this browser's database; the Discussions stay in memory for this page load.
const piKey = 'demand-planning-pi-review-pi-v1'
const readStored = () => { try { return localStorage.getItem(piKey) ?? '' } catch { return '' } }
const writeStored = (value: string) => { try { if (value) localStorage.setItem(piKey, value); else localStorage.removeItem(piKey) } catch { /* the choice is a convenience only */ } }
const jobKey = 'pireview:read-all'
const plural = (count: number, word: string, many = `${word}s`) => `${count.toLocaleString()} ${count === 1 ? word : many}`
type Row = { item: AzureWorkItem; epic?: AzureWorkItem }
interface Filters { epics: string[]; states: string[]; moves: string[]; text: string }
const noFilters: Filters = { epics: [], states: [], moves: [], text: '' }

// PIR-07, PIR-08: the newest comment of a Feature whose Discussion was read in this page load, split by its headings
// (cached per comment, so sorting and filtering do not parse again). undefined: not read (yet).
type Latest = { comment?: WorkItemComment; split: ReviewSplit }
const splits = new WeakMap<WorkItemComment, ReviewSplit>()
function latestOf(item: AzureWorkItem): Latest | undefined {
  const entry = discussionOf(item.key)
  if (entry?.state !== 'done') return undefined
  const comment = latestComment(entry.comments)
  if (!comment) return { split: {} }
  let split = splits.get(comment)
  if (!split) { split = splitReviewComment(comment.text); splits.set(comment, split) }
  return { comment, split }
}
// PIR-09: the Move to next PI filter — the normalized value, Other (text without one), Not given, Not read.
const moveOptions: [string, string][] = [['Yes', 'Yes'], ['No', 'No'], ['Partly', 'Partly'], ['other', 'Other text'], ['none', 'Not given'], ['unread', 'Discussion not read']]
const moveKey = (latest: Latest | undefined) => !latest ? 'unread' : latest.split.moveValue ?? (latest.split.move ? 'other' : 'none')
const unreadHint = 'The Discussion is not read yet: open the Feature, or ↻ Read all Discussions.'

// Reads one Feature's Discussion into the page's memory (PIR-05); the error is kept for the drawer and the table.
async function readInto(config: AzureConfig, pat: string, item: AzureWorkItem) {
  setDiscussion(item.key, { state: 'loading' })
  try { const { comments, capped } = await readDiscussion(config, pat, item.id); setDiscussion(item.key, { state: 'done', comments, capped, readAt: new Date().toISOString() }) }
  catch (failure) { setDiscussion(item.key, { state: 'error', error: failure instanceof Error ? failure.message : 'Could not read the Discussion.' }); throw failure }
}

export function PiReviewPage({ azure, store }: { azure: AzureWorkspace; store: PageProps['store'] }) {
  const { config, pat, items, isSample } = azure
  useSyncExternalStore(subscribeDiscussions, discussionsVersion)
  const jobs = useSyncExternalStore(subscribeJobs, listJobs)
  const reading = jobs.some((job) => job.key === jobKey && job.state === 'running')
  const absenceEpicId = capacityContext(store.state).absenceEpicId
  // PIR-02: the PIs of the Time Writing connection's iteration tree (list null when not read or when the read failed).
  const source = config && pat.trim() && !isSample ? [config.baseUrl ?? '', config.organization, config.project, config.team].join('|') : ''
  const [read, setRead] = useState<{ source: string; list: AzureIteration[] | null; problem: string } | null>(null)
  useEffect(() => {
    if (!source || !config) return
    let live = true
    readAzureIterations(config, pat).then((list) => { if (live) setRead({ source, list, problem: '' }) }, (failure: unknown) => { if (live) setRead({ source, list: null, problem: failure instanceof Error ? failure.message : 'the iterations could not be read' }) })
    return () => { live = false }
  }, [source, config, pat])
  const iterations = !source ? { list: null, problem: isSample ? 'synthetic sample data is loaded' : 'the Time Writing connection has no PAT here', done: true }
    : read?.source === source ? { ...read, done: true } : { list: null, problem: '', done: false }
  const today = useNow(3_600_000)
  const options = useMemo(() => piOptions(iterations.list ?? [], items), [iterations.list, items])
  const fallback = useMemo(() => defaultPi(iterations.list, items, today, iterations.problem), [iterations.list, items, today, iterations.problem])
  const current = fallback.why === 'current' ? fallback.pi : ''
  const [chosen, setChosen] = useState(readStored)
  const remembered = options.find((pi) => samePi(pi, chosen))
  const pi = remembered ?? (iterations.done ? fallback.pi : '')
  const choose = (value: string) => { setChosen(value); writeStored(value) }
  const [withStories, setWithStories] = useState(false)
  const [filters, setFilters] = useState<Filters>(noFilters)
  const [open, setOpen] = useState<{ key: string; order: string[] } | null>(null)

  // PIR-03: the PI's Features, with their Epic.
  const rows: Row[] = useMemo(() => { const byId = new Map(items.map((item) => [item.id, item])); return piFeatures(items, pi, { absenceEpicId, withStories }).map((item) => ({ item, epic: epicOf(items, item, byId) })) }, [items, pi, absenceEpicId, withStories])
  const epicOptions: [string, string][] = [...new Map(rows.map((row) => [row.epic ? String(row.epic.id) : '', row.epic ? row.epic.title || `#${row.epic.id}` : 'No Epic'])).entries()].sort((a, b) => a[1].localeCompare(b[1]))
  const stateOptions: [string, string][] = [...new Set(rows.map((row) => row.item.state))].sort().map((state) => [state, state])
  const text = filters.text.trim().toLowerCase()
  const shown = rows.filter(({ item, epic }) => (!filters.epics.length || filters.epics.includes(epic ? String(epic.id) : ''))
    && (!filters.states.length || filters.states.includes(item.state))
    && (!filters.moves.length || filters.moves.includes(moveKey(latestOf(item))))
    && (!text || [String(item.id), item.title, item.assignedTo, epic?.title ?? '', latestOf(item)?.comment?.text ?? ''].some((value) => value.toLowerCase().includes(text))))
  const filtered = filters.epics.length > 0 || filters.states.length > 0 || filters.moves.length > 0 || Boolean(filters.text)

  const readBlocked = isSample ? 'Synthetic sample data is loaded: the Discussions are not read from Azure DevOps.' : !config || !pat.trim() ? 'Connect the Time Writing connection (with its PAT) to read the Discussions.' : ''
  const unread = rows.filter((row) => discussionOf(row.item.key)?.state !== 'done')
  const readAllWhy = readBlocked || (reading ? 'Reading the Discussions — see Background jobs.' : !rows.length ? 'No Features in this PI.' : '')
  // PIR-06: every Discussion not read yet (all again when all are read), 3 at a time, as a background job.
  function readAll() {
    if (readAllWhy || !config) return
    const targets = (unread.length ? unread : rows).map((row) => row.item), byId = new Map(targets.map((item) => [item.id, item]))
    const label = `Reading Discussions · ${piLabel(pi)}`
    runInBackground(jobKey, label, async (progress) => {
      progress(`Reading Discussions · 0 of ${targets.length}`)
      const result = await readDiscussions(targets.map((item) => item.id), (id) => readInto(config, pat, byId.get(id)!), { rateWait: rateLimitWait, onProgress: (done, total) => progress(`Reading Discussions · ${done} of ${total}`) })
      const done = result.read + result.failed
      if (result.stopped === 'rate-limit') return { text: `${done} of ${targets.length} read: Azure DevOps kept limiting requests. ↻ Read all Discussions again later reads the other ${plural(result.unread.length, 'Feature')}.`, failed: true }
      if (result.stopped === 'access') return { text: `${done} of ${targets.length} read: Azure DevOps refused the read. Check the PAT (Work Items, Read).`, failed: true }
      return { text: `${done} of ${targets.length} read${result.failed ? `; ${plural(result.failed, 'Discussion')} could not be read (see the Comments column)` : ''}.`, failed: result.failed > 0 }
    })
  }

  const commentsCell = (item: AzureWorkItem) => { const entry = discussionOf(item.key); return entry?.state === 'done' ? entry.comments.length : null }
  const columns: DataColumn<Row>[] = [
    { id: 'id', label: 'ID', value: ({ item }) => item.id, align: 'right', render: ({ item }) => item.url ? <a href={item.url} target="_blank" rel="noreferrer" title={`Open Feature #${item.id} in Azure DevOps`}>{item.id}</a> : item.id },
    { id: 'title', label: 'Title', value: ({ item }) => item.title },
    { id: 'epic', label: 'Epic', value: ({ epic }) => epic?.title ?? '' },
    { id: 'state', label: 'State', value: ({ item }) => item.state },
    { id: 'assigned', label: 'Assigned to', value: ({ item }) => item.assignedTo },
    { id: 'target', label: 'Target date', value: ({ item }) => item.targetDate?.slice(0, 10) ?? '', render: ({ item }) => formatDate(item.targetDate), firstSortDesc: true },
    { id: 'iteration', label: 'Iteration', value: ({ item }) => item.iterationPath.split('\\').slice(1).join(' › ') || item.iterationPath },
    { id: 'comments', label: 'Comments', align: 'right', hint: 'The number of comments in the Feature’s Discussion, once read (open the Feature, or ↻ Read all Discussions). Read from Azure DevOps and kept for this page load only.', firstSortDesc: true,
      value: ({ item }) => commentsCell(item), render: ({ item }) => { const entry = discussionOf(item.key); return entry?.state === 'done' ? `${entry.comments.length.toLocaleString()}${entry.capped ? '+' : ''}` : entry?.state === 'loading' ? <span className="muted">…</span> : entry?.state === 'error' ? <span className="negative" title={entry.error}>Not read</span> : <span className="muted">—</span> } },
    // PIR-09: the latest comment and its split; "—" with the hint until the Discussion is read.
    { id: 'latest-date', label: 'Date and Time of Comment', firstSortDesc: true, hint: 'When the Feature’s newest comment was written (by its date and time, whoever wrote it), in your time zone. Filled once the Discussion is read: open the Feature, or ↻ Read all Discussions.',
      value: ({ item }) => latestOf(item)?.comment?.date ?? '', title: ({ item }) => { const latest = latestOf(item); return !latest ? unreadHint : latest.comment ? `By ${latest.comment.author}` : 'No comments in the Discussion.' },
      render: ({ item }) => { const latest = latestOf(item); return latest?.comment ? formatDateTime(latest.comment.date) : <span className="muted">—</span> } },
    textColumn('latest-comment', 'Comment', 'The whole newest comment, as plain text; the full text is in the tooltip and in the Feature’s drawer.', (latest) => latest.comment?.text),
    textColumn('struggles', 'Struggles', 'The text after the heading “Struggles:” in the newest comment (empty when the comment has no such heading).', (latest) => latest.split.struggles),
    textColumn('learnings', 'Learnings', 'The text after the heading “Learnings:” in the newest comment (empty when the comment has no such heading).', (latest) => latest.split.learnings),
    { id: 'move', label: 'Move to Next PI', hint: 'The text after the heading “Move to next PI:” in the newest comment; when it starts with Yes, No or Partly (or Y / N) that value comes first, e.g. “Yes — waiting for vendor”. Filter it with Move to next PI.',
      value: ({ item }) => { const latest = latestOf(item); return latest ? moveLabel(latest.split) : '' },
      title: ({ item }) => { const latest = latestOf(item); return !latest ? unreadHint : moveLabel(latest.split) || undefined },
      render: ({ item }) => { const latest = latestOf(item); if (!latest) return <span className="muted">—</span>; const label = moveLabel(latest.split); return label ? <span className="pir-clip">{oneLine(label)}</span> : '' } },
  ]

  const toolbar = <span className="people-filters pir-filters">
    <label className="inline-select">PI<select aria-label="PI" value={pi} onChange={(event) => choose(event.target.value)}>
      {!pi && <option value="">Choose a PI…</option>}
      {options.map((entry) => <option key={entry} value={entry}>{piLabel(entry)}{samePi(entry, current) ? ' (current)' : ''}</option>)}
    </select></label>
    {pi && samePi(pi, current) && <Pill tone="info">Current PI</Pill>}
    <MultiSelect label="Epic" options={epicOptions} value={filters.epics} onChange={(value) => setFilters({ ...filters, epics: value })} />
    <MultiSelect label="State" options={stateOptions} value={filters.states} onChange={(value) => setFilters({ ...filters, states: value })} />
    <MultiSelect label="Move to next PI" options={moveOptions} value={filters.moves} onChange={(value) => setFilters({ ...filters, moves: value })} />
    <label className="check"><input type="checkbox" checked={withStories} onChange={(event) => setWithStories(event.target.checked)} />Also Features with User Stories in this PI</label>
    <input type="search" className="search" aria-label="Search Features" placeholder="Search Features, comments" title="Searches the ID, title, Epic, person and the latest comment" value={filters.text} onChange={(event) => setFilters({ ...filters, text: event.target.value })} />
    <button type="button" className="ghost" disabled={!filtered} onClick={() => setFilters(noFilters)}>Reset filters</button>
  </span>

  const byKey = new Map(rows.map((row) => [row.item.key, row]))
  const openRow = open ? byKey.get(open.key) : undefined
  const step = (by: number) => { if (!open) return; const key = open.order[open.order.indexOf(open.key) + by]; if (key && byKey.has(key)) setOpen({ ...open, key }) }
  const notice = !iterations.done ? null : fallback.why === 'overlap' || ((fallback.why === 'fallback' || fallback.why === 'none') && !remembered) ? fallback.note : ''

  return <Page intro="The Features of a PI and their Discussions, read from Azure DevOps with your PAT. Nothing is saved: the Discussions are kept for this page load only."
    actions={<><button type="button" className="ghost" disabled={Boolean(readAllWhy)} title={readAllWhy || undefined} onClick={readAll}>↻ Read all Discussions</button>{readAllWhy && rows.length > 0 && !reading && <WriteBlocked reason={readAllWhy} />}</>}>
    {!items.length && <EmptyState title="No QMS-0025 data yet." detail="Fetch the Time Writing connection (↻ in the top bar) or load the synthetic sample; the PIs and Features come from that data." />}
    {notice && <Notice tone="warning">{notice}</Notice>}
    {items.length > 0 && <TablePanel title="Features" info="The Features whose Iteration Path is in the chosen PI (with the toggle also those with a User Story in the PI), without Removed Features and those under the absence Epic. The PIs come from the Time Writing connection’s iterations and the fetched data; the current PI (by the Sprint dates, UTC) is chosen first, and your last choice is remembered in this browser. Click a Feature to read its Discussion.">
      <DataTable id="pireview:features" className="pir-table" columns={columns} rows={shown} rowKey={(row) => row.item.key} exportName={`PI Review ${pi ? piLabel(pi) : ''}`.trim()} toolbar={toolbar}
        status={`${shown.length} of ${plural(rows.length, 'Feature')}`} defaultSort={{ id: 'id' }}
        onRowOpen={(row, order) => setOpen({ key: row.item.key, order: order.map((entry) => entry.item.key) })} rowLabel={(row) => `Feature ${row.item.id}: open`}
        empty={<EmptyState title={!pi ? 'Choose a PI.' : rows.length ? 'No Feature matches the filters.' : `No Features in ${piLabel(pi)}.`} detail={!pi ? 'Pick the PI to review in the PI list.' : rows.length ? 'Change the filters, or Reset filters.' : 'Tick “Also Features with User Stories in this PI”, choose another PI, or fetch the data again.'} />} />
    </TablePanel>}
    {open && openRow && <FeatureDrawer key={openRow.item.key} row={openRow} position={{ at: open.order.indexOf(open.key), of: open.order.length }} onStep={step} onClose={() => setOpen(null)} config={config} pat={pat} blocked={readBlocked} />}
  </Page>
}

// PIR-09: a text column of the latest comment — one line in the cell (line breaks as " · ", cut with …), the whole
// text in the tooltip and in the export (line breaks kept); "—" with the hint until the Discussion is read.
function textColumn(id: string, label: string, hint: string, pick: (latest: Latest) => string | undefined): DataColumn<Row> {
  const of = (row: Row) => { const latest = latestOf(row.item); return latest ? pick(latest) ?? '' : '' }
  return { id, label, hint: `${hint} Filled once the Discussion is read: open the Feature, or ↻ Read all Discussions.`, value: of,
    title: (row) => latestOf(row.item) ? of(row) || undefined : unreadHint,
    render: (row) => latestOf(row.item) ? <span className="pir-clip">{oneLine(of(row))}</span> : <span className="muted">—</span> }
}

// PIR-05: one Feature in a drawer (UI-STANDARDS §4a), read only: its details, then its Discussion, newest first, as
// plain text (mentions as @Name, images as [image]); read when the drawer opens unless read before, ↻ Read again.
function FeatureDrawer({ row, position, onStep, onClose, config, pat, blocked }: { row: Row; position: { at: number; of: number }; onStep: (by: number) => void; onClose: () => void; config: AzureConfig | null; pat: string; blocked: string }) {
  const { item, epic } = row
  const entry = discussionOf(item.key)
  const read = () => { if (!blocked && config) readInto(config, pat, item).catch(() => { /* shown from the entry */ }) }
  useEffect(() => { if (!discussionOf(item.key)) read() }, [item.key]) // eslint-disable-line react-hooks/exhaustive-deps
  return <Drawer eyebrow="PI REVIEW · FEATURE" title={`Feature #${item.id}`} className="pir-drawer" onClose={onClose}
    restoreFocus={() => document.querySelector<HTMLElement>(`tr[data-row-key="${CSS.escape(item.key)}"]`)}
    headerActions={position.of > 1 && <span className="button-row drawer-steps">
      <button type="button" className="ghost" aria-label="Previous Feature" disabled={position.at <= 0} onClick={() => onStep(-1)}>‹</button>
      <small className="muted">{position.at + 1} of {position.of}</small>
      <button type="button" className="ghost" aria-label="Next Feature" disabled={position.at < 0 || position.at >= position.of - 1} onClick={() => onStep(1)}>›</button>
    </span>}
    footer={<div className="drawer-actions">{item.url && <a className="text-button" href={item.url} target="_blank" rel="noreferrer">Open in Azure DevOps →</a>}</div>}>
    <p className="pir-title"><strong>{item.title}</strong></p>
    <dl className="od-row-facts">
      <div><dt>State</dt><dd>{item.state || '—'}</dd></div>
      <div><dt>Assigned to</dt><dd>{item.assignedTo || '—'}</dd></div>
    </dl>
    <dl className="od-row-values">
      <div><dt>Epic</dt><dd>{epic ? `#${epic.id} ${epic.title}` : '—'}</dd></div>
      <div><dt>Iteration</dt><dd>{item.iterationPath || '—'}</dd></div>
      <div><dt>Target date</dt><dd>{formatDate(item.targetDate)}</dd></div>
    </dl>
    {entry?.state === 'done' && <LatestComment comments={entry.comments} />}
    <section aria-label="Discussion" className="pir-discussion">
      <div className="pir-discussion-head"><h3>Discussion{entry?.state === 'done' ? ` (${entry.comments.length.toLocaleString()}${entry.capped ? '+' : ''})` : ''}</h3>
        <button type="button" className="ghost" disabled={Boolean(blocked) || entry?.state === 'loading'} title={blocked || undefined} onClick={read}>↻ Read again</button></div>
      {blocked && <WriteBlocked reason={blocked} />}
      {entry?.state === 'loading' && <p className="muted" role="status">Loading the Discussion…</p>}
      {entry?.state === 'error' && <Notice tone="error">The Discussion was not read: {entry.error} Use ↻ Read again.</Notice>}
      {entry?.state === 'done' && !entry.comments.length && <EmptyState title="No comments in the Discussion." />}
      {entry?.state === 'done' && entry.capped && <p className="muted">Showing the newest 1,000 comments; older ones are not read.</p>}
      {entry?.state === 'done' && entry.comments.length > 0 && <ol className="pir-comments">
        {entry.comments.map((comment) => <li key={comment.id}>
          <p className="pir-comment-head"><strong>{comment.author}</strong> <small className="muted">{formatDateTime(comment.date)}</small></p>
          <p className="pir-comment-text">{comment.text || <span className="muted">(no text)</span>}</p>
        </li>)}
      </ol>}
      {entry?.state === 'done' && <small className="muted">Read {formatDateTime(entry.readAt)} as plain text: formatting is not kept, mentions show as @Name and images as [image].</small>}
    </section>
  </Drawer>
}

// PIR-10: the newest comment's split in the drawer, above the Discussion: when and by whom, then Struggles, Learnings
// and Move to next PI (or that the comment has none of the headings; the whole comment is the first of the Discussion).
function LatestComment({ comments }: { comments: WorkItemComment[] }) {
  const comment = latestComment(comments)
  if (!comment) return null
  const split = splitReviewComment(comment.text)
  const any = Boolean(split.struggles || split.learnings || split.move)
  return <section aria-label="Latest comment" className="pir-latest">
    <h3>Latest comment</h3>
    <p className="pir-comment-head"><strong>{comment.author}</strong> <small className="muted">{formatDateTime(comment.date)}</small></p>
    {any ? <dl className="od-row-values pir-split">
      <div><dt>Struggles</dt><dd>{split.struggles || '—'}</dd></div>
      <div><dt>Learnings</dt><dd>{split.learnings || '—'}</dd></div>
      <div><dt>Move to Next PI</dt><dd>{moveLabel(split) || '—'}</dd></div>
    </dl> : <p className="muted">No Struggles, Learnings or Move to next PI heading in this comment: see the whole comment in the Discussion below.</p>}
  </section>
}
