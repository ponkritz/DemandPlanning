import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { DataTable, type DataColumn } from '../components/DataTable'
import { MultiSelect } from '../components/MultiSelect'
import { Drawer, EmptyState, Notice, Page, Pill, TablePanel, WriteBlocked } from '../components/ui'
import { listJobs, recordJob, runInBackground, subscribeJobs } from '../backgroundJobs'
import { rateLimitWait, shownDateOf, type AzureConfig } from '../azureDevOps'
import { capacityContext } from '../capacity'
import { formatDate, formatDateTime } from '../format'
import { discussionOf, discussionsVersion, epicOf, latestReviewFor, moveLabel, oneLine, piFeatures, piLabel, readDiscussions, reviewHeadingNote, reviewHeadingOf, reviewModeLabel, reviewModes, reviewSplit, samePi, subscribeDiscussions, type ReviewSplit, type SplitFrom } from '../piReview'
import { discussionReadBlock, isReviewLead, ownFeatures, ownReadBlock, readDiscussionInto as readInto, reviewPageBlock, reviewPostBlock } from '../piReviewPost'
import { ReviewAction, ReviewDialog } from './PiReviewForm'
import { PiSetupGear } from '../components/PiFormSetupPanel'
import { formSetupOf, useDiscussionsRead, useOwnReview, useReviewViewer, useReviewWriter } from '../piReviewWriter'
import { customFields, type PiFormSetup } from '../piReviewSetup'
import { usePiChoice } from './usePiChoice'
import { cutoffNote, reviewStartLabel, reviewStartOf, shownFrom } from '../piReviewStart'
import { MeetingButton, SavedMeetings } from './PiMeeting'
import { usePiMeeting, type MeetingContext, type MeetingGit } from '../usePiMeeting'
import { useEpicSetupFile } from '../useEpicSetup'
import { ProductOwnerFilter } from '../components/ProductOwnerFilter'
import { useOwnerFilter } from '../useOwnerFilter'
import { ownedEpics, ownerName } from '../epicOwners'
import type { WorkItemComment } from '../azureDevOps'
import type { AzureWorkItem } from '../domain'
import type { AzureWorkspace } from '../useAzureWorkspace'
import type { PageProps } from './types'
import type { Me } from '../myWork'
import { convertBlock, isOldFormat, oldFormatComments, oldFormatNote, oldFormatSearch } from '../piReviewOldFormat'
import { ConvertButton, OldFormatFlag } from './OldFormatParts'
import { DiscussionSearch } from './DiscussionSearch'

// PI Review (PIR-01…PIR-16): choose a PI, see its Features, and read each Feature's Discussion (all pages, newest
// first, as plain text) in a drawer, or every Discussion at once as a background job; the latest review of each read
// Discussion for the chosen PI (PIR-49: the newest comment headed "Feature Review for <that PI>") fills the columns, split by its Struggles / Learnings / Move to next PI / Review meeting / Additional
// Remarks headings (or their synonyms), or — without any heading — suggested from keywords. The one write: **Write
// review…** (PIR-13) posts a Feature's review as a new comment in its Discussion (the Feature's assignee or a lead,
// CON-113). The Discussions stay in memory for this page load. PIR-40…PIR-47: Conduct PI Meeting builds the PI Review
// Meeting presentation (./PiMeeting) — downloaded, and a copy kept in the Git data repository (git).
const piKey = 'demand-planning-pi-review-pi-v1'
const jobKey = 'pireview:read-all'
const plural = (count: number, word: string, many = `${word}s`) => `${count.toLocaleString()} ${count === 1 ? word : many}`
type Row = { item: AzureWorkItem; epic?: AzureWorkItem }
// PIR-77: olds — the Old format filter (temporary, LIM-235).
interface Filters { epics: string[]; states: string[]; people: string[]; moves: string[]; modes: string[]; text: string; olds: string[] }
const noFilters: Filters = { epics: [], states: [], people: [], moves: [], modes: [], text: '', olds: [] }
// PIR-77: the Old format filter — a Feature with an old-format comment, without one, its Discussion not read.
const oldOptions: [string, string][] = [['old', 'Old format — convert'], ['none', 'No old-format comment'], ['unread', 'Discussion not read']]
const oldsOf = (item: AzureWorkItem) => { const entry = discussionOf(item.key); return entry?.state === 'done' ? oldFormatComments(entry.comments) : undefined }
const oldKey = (item: AzureWorkItem) => { const olds = oldsOf(item); return !olds ? 'unread' : olds.length ? 'old' : 'none' }

// PIR-07, PIR-08, PIR-11, PIR-49: the latest review for the chosen PI (the newest comment headed "Feature Review for
// <that PI>"; none: Not reviewed) of a Feature whose Discussion was read in this page load, split by its
// headings or suggested from keywords (cached per comment, so sorting and filtering do not parse again). undefined: not
// read (yet).
type Split = ReviewSplit & { from: SplitFrom }
type Latest = { comment?: WorkItemComment; split: Split }
// PIR-19: split with the headings of the form setup in use (cached per comment and setup).
const splits = new WeakMap<WorkItemComment, { setup: PiFormSetup; split: Split }>()
function latestFor(item: AzureWorkItem, setup: PiFormSetup, pi: string): Latest | undefined {
  const entry = discussionOf(item.key)
  if (entry?.state !== 'done') return undefined
  const comment = latestReviewFor(entry.comments, pi)
  if (!comment) return { split: { from: 'None' } }
  let cached = splits.get(comment)
  if (!cached || cached.setup !== setup) { cached = { setup, split: reviewSplit(comment.text, setup) }; splits.set(comment, cached) }
  return { comment, split: cached.split }
}
// PIR-09: the Move to next PI filter — the normalized value, Other (text without one), Not given, Not read.
const moveOptions: [string, string][] = [['Yes', 'Yes'], ['No', 'No'], ['Partly', 'Partly'], ['other', 'Other text'], ['none', 'Not given'], ['unread', 'Discussion not read']]
const moveKey = (latest: Latest | undefined) => !latest ? 'unread' : latest.split.moveValue ?? (latest.split.move ? 'other' : 'none')
// PIR-15: the Review mode filter — the normalized advice, Other (text without one), Not given, Not read.
const modeOptions: [string, string][] = [...reviewModes.map((mode): [string, string] => [mode, mode]), ['other', 'Other text'], ['none', 'Not given'], ['unread', 'Discussion not read']]
const modeKey = (latest: Latest | undefined) => !latest ? 'unread' : latest.split.reviewMode ?? (latest.split.review ? 'other' : 'none')
const unreadHint = 'The Discussion is not read yet: open the Feature, or ↻ Read all Discussions.'
// PIR-11: a text suggested from keywords (the review has no field heading) — marked "(suggested)", in italics, with the tooltip.
const suggestedHint = 'Suggested from keywords, not headings'
const suggestedTitle = (text: string) => `${suggestedHint}:\n${text}`
const keywordNote = 'Suggested texts are a guess: check them against the whole Comment.'
const Suggested = ({ text }: { text: string }) => <span className="pir-clip pir-suggested"><span className="pir-suggested-mark">(suggested)</span> {oneLine(text)}</span>

// PIR-35: self — who I am (my work email, else my name: My PI Review's "me"), for reading my own Features' Discussions.
export function PiReviewPage({ azure, store, self, git }: { azure: AzureWorkspace; store: PageProps['store']; self?: { me: Me; known: boolean }; git?: MeetingGit }) {
  const { config, pat, items, isSample } = azure
  const poster = useReviewViewer()
  // PIR-19, PIR-20: the form setup in use — its headings split the comments, its added fields are columns of their own.
  const setup = formSetupOf(poster.env)
  useSyncExternalStore(subscribeDiscussions, discussionsVersion)
  const jobs = useSyncExternalStore(subscribeJobs, listJobs)
  const reading = jobs.some((job) => job.key === jobKey && job.state === 'running')
  const absenceEpicId = capacityContext(store.state).absenceEpicId
  // PIR-02: the PIs, the default (current) PI and the remembered choice.
  // PIR-33: only the PIs that did not end before "PI Review starts from" (the form setup's date).
  const start = reviewStartOf(setup)
  const { iterations, options, cutoff, fallback, current, remembered, pi, choose } = usePiChoice(azure, piKey, start)
  const latestOf = (item: AzureWorkItem) => latestFor(item, setup, pi)
  const textColumn = (id: string, label: string, hint: string, pick: (latest: Latest) => string | undefined) => textColumnOf(id, label, hint, pick, latestOf)
  const [withStories, setWithStories] = useState(false)
  const [filters, setFilters] = useState<Filters>(noFilters)
  const [open, setOpen] = useState<{ key: string; order: string[] } | null>(null)
  // PIR-69: the Product Owner filter (the Product Owner of the Feature's Epic), remembered in this browser.
  const owners = useOwnerFilter('pireview')
  // PIR-78: the Search Discussions… pop-up.
  const [searching, setSearching] = useState(false)

  // PIR-03: the PI's Features, with their Epic.
  const rows: Row[] = useMemo(() => { const byId = new Map(items.map((item) => [item.id, item])); return piFeatures(items, pi, { absenceEpicId, withStories }).map((item) => ({ item, epic: epicOf(items, item, byId) })) }, [items, pi, absenceEpicId, withStories])
  const epicOptions: [string, string][] = [...new Map(rows.map((row) => [row.epic ? String(row.epic.id) : '', row.epic ? row.epic.title || `#${row.epic.id}` : 'No Epic'])).entries()].sort((a, b) => a[1].localeCompare(b[1]))
  const stateOptions: [string, string][] = [...new Set(rows.map((row) => row.item.state))].sort().map((state) => [state, state])
  // PIR-16: the Assigned to filter, from the Features' Assigned To ('' for nobody).
  const personOptions: [string, string][] = [...new Set(rows.map((row) => row.item.assignedTo.trim()))].sort((a, b) => a.localeCompare(b)).map((name) => [name, name || 'Unassigned'])

  const readBlocked = discussionReadBlock({ isSample, config, pat })
  // PIR-35: my own Features of the chosen PI (Assigned To by my work email, else my name — as My PI Review) have their
  // Discussions read when the page opens or the PI changes, so Edit review… shows without opening them; nobody else's.
  // Not with sample data, without a PAT, in View as or when who I am is not known. A Discussion read already (or being
  // read) is not read again, here or by the drawer, Read all Discussions and Write review… (readDiscussionInto).
  const me = self?.known ? self.me : undefined
  const ownBlock = ownReadBlock({ isSample, config, pat, viewingAs: poster.viewingAs }, me)
  const own = useMemo(() => ownFeatures(rows.map((row) => row.item), me), [rows, me])
  const ownReading = useDiscussionsRead(config, pat, own, ownBlock, (result, count) => {
    if (!result.stopped) return
    const done = result.read + result.failed
    recordJob('pireview:read-own', `Reading your Discussions · ${piLabel(pi)}`, { text: result.stopped === 'rate-limit' ? `${done} of ${count} read: Azure DevOps kept limiting requests. Open the Feature, or ↻ Read all Discussions later.` : `${done} of ${count} read: Azure DevOps refused the read. Check the PAT (Work Items, Read).`, failed: true })
  })
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
    // PIR-69: the Product Owner of the Feature's Epic (Setup per Epic), by name.
    ...(owners.options.length ? [{ id: 'product-owner', label: 'Product Owner', value: ({ epic }: Row) => ownerName(owners.ofEpic(epic?.id)) }] : []),
    { id: 'state', label: 'State', value: ({ item }) => item.state },
    { id: 'assigned', label: 'Assigned to', value: ({ item }) => item.assignedTo },
    { id: 'target', label: 'Target date', value: ({ item }) => item.targetDate?.slice(0, 10) ?? '', render: ({ item }) => formatDate(item.targetDate), firstSortDesc: true },
    { id: 'iteration', label: 'Iteration', value: ({ item }) => item.iterationPath.split('\\').slice(1).join(' › ') || item.iterationPath },
    { id: 'comments', label: 'Comments', align: 'right', hint: 'The number of comments in the Feature’s Discussion, once read (open the Feature, or ↻ Read all Discussions). Read from Azure DevOps and kept for this page load only.', firstSortDesc: true,
      value: ({ item }) => commentsCell(item), render: ({ item }) => { const entry = discussionOf(item.key); return entry?.state === 'done' ? `${entry.comments.length.toLocaleString()}${entry.capped ? '+' : ''}` : entry?.state === 'loading' ? <span className="muted">…</span> : entry?.state === 'error' ? <span className="negative" title={entry.error}>Not read</span> : <span className="muted">—</span> } },
    // PIR-09, PIR-49: the latest review for the chosen PI and its split; "—" with the hint until the Discussion is read,
    // "Not reviewed" when it has no comment headed "Feature Review for <the chosen PI>".
    { id: 'latest-date', label: 'Date and Time of Comment', firstSortDesc: true, hint: `When the Feature’s latest review for the chosen PI was written (the newest comment headed “Feature Review for ${pi ? piLabel(pi) : 'PI …'}”, whoever wrote it), in your time zone; Not reviewed when there is none. ${reviewHeadingNote} Filled once the Discussion is read: open the Feature, or ↻ Read all Discussions.`,
      value: ({ item }) => { const comment = latestOf(item)?.comment; return comment ? shownDateOf(comment) : '' }, title: ({ item }) => { const latest = latestOf(item); return !latest ? unreadHint : latest.comment ? `By ${latest.comment.author}` : `Not reviewed: no comment headed “${reviewHeadingOf(piLabel(pi))}”. ${reviewHeadingNote}` },
      render: ({ item }) => { const latest = latestOf(item); return latest?.comment ? formatDateTime(shownDateOf(latest.comment)) : latest ? <span className="muted">Not reviewed</span> : <span className="muted">—</span> } },
    textColumn('latest-comment', 'Comment', 'The whole latest review for the chosen PI, as plain text; the full text is in the tooltip and in the Feature’s drawer.', (latest) => latest.comment?.text),
    textColumn('struggles', 'Struggles', `The text after the heading “Struggles:” (or Challenges, Issues, Problems, Blockers, Impediments, Risks, Pain points, What went wrong, What didn’t go well) in the latest review. Without any heading in the comment, the sentences with words such as blocked, delayed, issue or risk, marked “(suggested)”. ${keywordNote}`, (latest) => latest.split.struggles),
    textColumn('learnings', 'Learnings', `The text after the heading “Learnings:” (or Lessons, Lessons learnt, Takeaways, What went well, Improvements, Next time) in the latest review. Without any heading in the comment, the sentences with words such as learned, lesson, next time or went well, marked “(suggested)”. ${keywordNote}`, (latest) => latest.split.learnings),
    { id: 'move', label: 'Move to Next PI', hint: `The text after the heading “Move to next PI:” (or Next PI, Spill over, Carry over, Moving to next PI, Continue in next PI) in the latest review; when it starts with Yes, No or Partly (or Y / N) that value comes first, e.g. “Yes — waiting for vendor”. Without any heading in the comment, the sentences with carry over, next PI, spill over or move to, marked “(suggested)”. Filter it with Move to next PI. ${keywordNote} Filled once the Discussion is read: open the Feature, or ↻ Read all Discussions.`,
      value: ({ item }) => { const latest = latestOf(item); return latest ? moveLabel(latest.split) : '' },
      title: ({ item }) => { const latest = latestOf(item); if (!latest) return unreadHint; const label = moveLabel(latest.split); return label && latest.split.from === 'Keywords' ? suggestedTitle(label) : label || undefined },
      render: ({ item }) => { const latest = latestOf(item); if (!latest) return <span className="muted">—</span>; const label = moveLabel(latest.split); return !label ? '' : latest.split.from === 'Keywords' ? <Suggested text={label} /> : <span className="pir-clip">{oneLine(label)}</span> } },
    // PIR-15: the Review meeting advice and the Additional Remarks of the latest comment.
    { id: 'review-mode', label: 'Review mode', hint: 'The answer after the heading “Advise to discuss the Feature during the Review meeting:” (or Review meeting, Discuss in meeting, Review mode) in the latest review: Discuss during Meeting or Offline Review (also from discuss / meeting / yes and offline / no), otherwise the text as written. Filter it with Review mode. Filled once the Discussion is read: open the Feature, or ↻ Read all Discussions.',
      value: ({ item }) => { const latest = latestOf(item); return latest ? reviewModeLabel(latest.split) : '' },
      title: ({ item }) => { const latest = latestOf(item); return !latest ? unreadHint : reviewModeLabel(latest.split) || undefined },
      render: ({ item }) => { const latest = latestOf(item); return !latest ? <span className="muted">—</span> : <span className="pir-clip">{oneLine(reviewModeLabel(latest.split))}</span> } },
    textColumn('remarks', 'Additional Remarks', 'The text after the heading “Additional Remarks:” (or Remarks, Additional comments) in the latest review.', (latest) => latest.split.remarks),
    // PIR-28, PIR-49: the reviewed PI the latest review's heading names ("Feature Review for PI 26.4"), also in the export.
    // PIR-77 (temporary): the Feature’s old-format comments and who wrote them — leads see who still has to convert (not
    // exported: the export keeps its columns while the mechanism is temporary).
    ...(oldFormatSearch ? [{ id: 'old-format', label: 'Old format', export: false, hint: `${oldFormatNote} The authors are named. Filter it with Old format.`,
      value: ({ item }: Row) => { const olds = oldsOf(item); return olds?.length ? `Old format — ${[...new Set(olds.map((comment) => comment.author))].join(', ')}` : '' },
      render: ({ item }: Row) => { const olds = oldsOf(item); return !olds ? <span className="muted">—</span> : <OldFormatFlag comments={olds} withAuthor /> } } satisfies DataColumn<Row>] : []),
    textColumn('reviewed-pi', 'Reviewed PI', 'The PI the latest review is headed for (“Feature Review for PI 26.4”) — the chosen PI; empty when the Feature is Not reviewed.', (latest) => latest.split.reviewedPi),
    // PIR-20: a column for each field added in the PI Review form setup, by its label.
    ...customFields(setup).map((field) => textColumn(`field-${field.id}`, field.label, `The text after the heading “${field.heading}:” in the latest review (a field added in the PI Review form setup, Admin → Feature & PI setup → PI Review form).`, (latest) => latest.split.extra?.[field.id])),
    { id: 'split-from', label: 'Split from', defaultHidden: true, export: 'always', hint: 'How Struggles, Learnings and Move to Next PI were filled from the latest review: Headings, Keywords (suggested: the comment has no heading) or None. Exported even while hidden.',
      value: ({ item }) => latestOf(item)?.split.from ?? '', title: ({ item }) => latestOf(item) ? undefined : unreadHint,
      render: ({ item }) => latestOf(item)?.split.from ?? <span className="muted">—</span> },
    // PIR-13: the row action — Write review…, disabled with the reason (the page's, or the Feature's right) as its tooltip;
    // PIR-34: Edit review… in its place when my own review of the Feature counts for the chosen PI.
    { id: 'actions', label: 'Actions', export: false, sortable: false,
      render: ({ item }) => { const own = ownReview(item); return <ReviewAction item={item} own={own} why={reviewPostBlock(poster, item)} onWrite={() => void writer.start(item)} onEdit={() => { if (own) writer.startEdit(item, own.comment) }} /> } },
  ]

  // PIR-16: the search covers every column shown (as the cells show it, and the whole latest review).
  const text = filters.text.trim().toLowerCase()
  const searched = columns.filter((column) => column.id !== 'actions' && column.id !== 'split-from')
  const searchText = (row: Row) => [...searched.map((column) => { const value = column.value?.(row); return value == null ? '' : String(value) }), latestOf(row.item)?.comment?.text ?? ''].join('\n').toLowerCase()
  const shown = rows.filter((row) => { const { item, epic } = row; return (!filters.epics.length || filters.epics.includes(epic ? String(epic.id) : ''))
    && (!filters.states.length || filters.states.includes(item.state))
    && (!filters.people.length || filters.people.includes(item.assignedTo.trim()))
    && (!filters.moves.length || filters.moves.includes(moveKey(latestOf(item))))
    && (!filters.modes.length || filters.modes.includes(modeKey(latestOf(item))))
    && owners.keeps([owners.ofEpic(epic?.id)])
    && (!filters.olds.length || filters.olds.includes(oldKey(item)))
    && (!text || searchText(row).includes(text)) })
  const filtered = owners.active || filters.epics.length > 0 || filters.states.length > 0 || filters.people.length > 0 || filters.moves.length > 0 || filters.modes.length > 0 || Boolean(filters.text) || filters.olds.length > 0

  const toolbar = <span className="people-filters pir-filters">
    <label className="inline-select">PI<select aria-label="PI" value={pi} onChange={(event) => choose(event.target.value)}>
      {!pi && <option value="">Choose a PI…</option>}
      {options.map((entry) => <option key={entry} value={entry}>{piLabel(entry)}{samePi(entry, current) ? ' (current)' : ''}</option>)}
    </select></label>
    {pi && samePi(pi, current) && <Pill tone="info">Current PI</Pill>}
    <MultiSelect label="Epic" options={epicOptions} value={filters.epics} onChange={(value) => setFilters({ ...filters, epics: value })} />
    <ProductOwnerFilter filter={owners} />
    <MultiSelect label="State" options={stateOptions} value={filters.states} onChange={(value) => setFilters({ ...filters, states: value })} />
    <MultiSelect label="Assigned to" options={personOptions} value={filters.people} onChange={(value) => setFilters({ ...filters, people: value })} />
    <MultiSelect label="Move to next PI" options={moveOptions} value={filters.moves} onChange={(value) => setFilters({ ...filters, moves: value })} />
    <MultiSelect label="Review mode" options={modeOptions} value={filters.modes} onChange={(value) => setFilters({ ...filters, modes: value })} />
    {oldFormatSearch && <MultiSelect label="Old format" options={oldOptions} value={filters.olds} onChange={(value) => setFilters({ ...filters, olds: value })} />}
    <label className="check"><input type="checkbox" checked={withStories} onChange={(event) => setWithStories(event.target.checked)} />Also Features with User Stories in this PI</label>
    <input type="search" className="search" aria-label="Search Features" placeholder="Search Features, comments" title="Searches every column shown and the whole latest review" value={filters.text} onChange={(event) => setFilters({ ...filters, text: event.target.value })} />
    <button type="button" className="ghost" disabled={!filtered} onClick={() => { setFilters(noFilters); owners.change([]) }}>Reset filters</button>
  </span>

  const byKey = new Map(rows.map((row) => [row.item.key, row]))
  const openRow = open ? byKey.get(open.key) : undefined
  const step = (by: number) => { if (!open) return; const key = open.order[open.order.indexOf(open.key) + by]; if (key && byKey.has(key)) setOpen({ ...open, key }) }
  // PIR-13: Write review… (the drawer and the row action) — the shared form and post (useReviewWriter).
  const writer = useReviewWriter(pi, { list: iterations.list, reading: !iterations.done })
  // PIR-34: my own review of a Feature that counts for the chosen PI (the rule of My PI Review), for Edit review….
  const ownReview = useOwnReview(pi)
  // PIR-77: Convert… of an old-format comment, by its author only (the drawer).
  const convertMe = { email: poster.env?.email || me?.email, name: poster.env?.name || me?.name }
  const pageBlock = reviewPageBlock(poster)
  const postNote = pageBlock || (rows.length && !isReviewLead(poster) ? `You can post the review of the Features assigned to you${poster.email ? ` (${poster.email})` : ''}${ownedEpics(owners.file, poster.email).length ? ' and of the Features of the Epics you are the Product Owner of' : ''}; a lead with “PI Review: post the review of a Feature” can post on every Feature.` : '')

  // PIR-40…PIR-47: Conduct PI Meeting — the Features of the PI (all of them, whatever the filters), the start date in use.
  // PIR-51…PIR-57: the data of the executive slides (all fetched items, the iterations, capacity, Release Details, Epic setup).
  const epicFile = useEpicSetupFile()
  const capacity = capacityContext(store.state)
  const context: MeetingContext = { items, iterations: iterations.list, capacity, absenceEpicId, withStories, releaseState: store.state, profiles: azure.connectionProfiles, epicFile, team: config?.project ?? '' }
  const meeting = usePiMeeting({ pi, rows, setup, start, inRange: !pi || shownFrom(pi, cutoff), config, pat, readBlocked, viewer: poster, git, context })
  const notice = !iterations.done ? null : fallback.why === 'overlap' || ((fallback.why === 'fallback' || fallback.why === 'none') && !remembered) ? fallback.note : ''

  return <Page intro="The Features of a PI and their Discussions, read from Azure DevOps with your PAT, kept for this page load only. Review… posts a Feature’s review to its Discussion as a new comment; Edit review… changes your own review in place."
    actions={<><MeetingButton meeting={meeting} /><button type="button" className="ghost" disabled={Boolean(readAllWhy)} title={readAllWhy || undefined} onClick={readAll}>↻ Read all Discussions</button>{readAllWhy && rows.length > 0 && !reading && <WriteBlocked reason={readAllWhy} />}{oldFormatSearch && <button type="button" className="ghost" disabled={!rows.length} title={rows.length ? 'Search the comments of the Discussions read (temporary: finds the reviews written in the old format)' : 'No Features in this PI.'} onClick={() => setSearching(true)}>Search Discussions…</button>}{/* PIR-30: ⚙ PI Review Setup, last (UI-STANDARDS §6), when the page is in the viewer's menu. */}<PiSetupGear /></>}>
    {!items.length && <EmptyState title="No QMS-0025 data yet." detail="Fetch the Time Writing connection (↻ in the top bar) or load the synthetic sample; the PIs and Features come from that data." />}
    {notice && <Notice tone="warning">{notice}</Notice>}
    {items.length > 0 && <TablePanel title="Features" info={`The Features whose Iteration Path is in the chosen PI (with the toggle also those with a User Story in the PI), without Removed Features and those under the absence Epic. The PIs come from the Time Writing connection’s iterations and the fetched data; the current PI (by the Sprint dates, UTC) is chosen first, and your last choice is remembered in this browser. ${cutoffNote(cutoff)} Click a Feature to read its Discussion; Review… posts the Feature’s review as a new comment in its Discussion, headed “Feature Review for ${pi ? piLabel(pi) : 'PI …'}”. The review columns show each Feature’s latest review for the chosen PI — the newest comment headed “Feature Review for” that PI (one headed for PI 26.4 counts for PI 26.4 only); without one the Feature is Not reviewed. ${reviewHeadingNote}`}>
      {rows.length > 0 && <WriteBlocked reason={postNote} />}
      <DataTable id="pireview:features" className="pir-table" columns={columns} rows={shown} rowKey={(row) => row.item.key} exportName={`PI Review ${pi ? piLabel(pi) : ''}`.trim()} toolbar={toolbar}
        status={<>{`${shown.length} of ${plural(rows.length, 'Feature')}`}{ownReading > 0 && <span role="status"> · {ownReading === 1 ? 'Reading your Feature’s Discussion…' : `Reading your ${ownReading.toLocaleString()} Features’ Discussions…`}</span>}</>} defaultSort={{ id: 'id' }}
        onRowOpen={(row, order) => setOpen({ key: row.item.key, order: order.map((entry) => entry.item.key) })} rowLabel={(row) => `Feature ${row.item.id}: open`}
        empty={<EmptyState title={!pi ? 'Choose a PI.' : rows.length ? 'No Feature matches the filters.' : `No Features in ${piLabel(pi)}.`} detail={!pi ? 'Pick the PI to review in the PI list.' : rows.length ? 'Change the filters, or Reset filters.' : 'Tick “Also Features with User Stories in this PI”, choose another PI, or fetch the data again.'} />} />
    </TablePanel>}
    {/* PIR-78 (temporary): Search Discussions… — the comments of the Discussions read. */}
    {searching && <DiscussionSearch items={rows.map((row) => row.item)} onClose={() => setSearching(false)} onOpen={(item) => { setSearching(false); setOpen({ key: item.key, order: shown.some((row) => row.item.key === item.key) ? shown.map((row) => row.item.key) : [item.key] }) }} />}
    {items.length > 0 && pi && <SavedMeetings meeting={meeting} git={git} />}
    {open && openRow && <FeatureDrawer key={openRow.item.key} row={openRow} setup={setup} pi={pi} position={{ at: open.order.indexOf(open.key), of: open.order.length }} onStep={step} onClose={() => setOpen(null)} config={config} pat={pat} blocked={readBlocked} postBlocked={reviewPostBlock(poster, openRow.item)} own={ownReview(openRow.item)} onWrite={() => void writer.start(openRow.item)} onEdit={(comment) => writer.startEdit(openRow.item, comment)}
      oldFormat={oldFormatSearch ? <OldFormatComments item={openRow.item} why={(comment) => convertBlock(poster, openRow.item, comment, convertMe)} onConvert={(comment) => writer.startConvert(openRow.item, comment, options)} /> : null} />}
    {writer.writing && byKey.get(writer.writing.item.key) && <ReviewDialog key={`review:${writer.writing.item.key}`} writing={writer.writing} blocked={reviewPostBlock(poster, writer.writing.item)} onPost={writer.post} onPostNew={writer.postNew} onClose={writer.cancel} />}
  </Page>
}

// PIR-09: a text column of the latest review — one line in the cell (line breaks as " · ", cut with …), the whole
// text in the tooltip and in the export (line breaks kept); "—" with the hint until the Discussion is read. PIR-11: a
// split text suggested from keywords is marked in the cell and the tooltip (the export has Split from).
function textColumnOf(id: string, label: string, hint: string, pick: (latest: Latest) => string | undefined, latestOf: (item: AzureWorkItem) => Latest | undefined): DataColumn<Row> {
  const of = (row: Row) => { const latest = latestOf(row.item); return latest ? pick(latest) ?? '' : '' }
  // PIR-49: the Reviewed PI comes from the review heading, never suggested.
  const suggested = (row: Row) => id !== 'latest-comment' && id !== 'reviewed-pi' && latestOf(row.item)?.split.from === 'Keywords'
  return { id, label, hint: `${hint} Filled once the Discussion is read: open the Feature, or ↻ Read all Discussions.`, value: of,
    title: (row) => !latestOf(row.item) ? unreadHint : !of(row) ? undefined : suggested(row) ? suggestedTitle(of(row)) : of(row),
    render: (row) => !latestOf(row.item) ? <span className="muted">—</span> : of(row) && suggested(row) ? <Suggested text={of(row)} /> : <span className="pir-clip">{oneLine(of(row))}</span> }
}

// PIR-05: one Feature in a drawer (UI-STANDARDS §4a), read only: its details, then its Discussion, newest first, as
// plain text (mentions as @Name, images as [image]); read when the drawer opens unless read before, ↻ Read again.
function FeatureDrawer({ row, position, onStep, onClose, config, pat, blocked, postBlocked, onWrite, setup, own, onEdit, pi, oldFormat }: { setup: PiFormSetup; pi: string; row: Row; position: { at: number; of: number }; onStep: (by: number) => void; onClose: () => void; config: AzureConfig | null; pat: string; blocked: string; postBlocked: string; onWrite: () => void; own?: { comment: WorkItemComment }; onEdit: (comment: WorkItemComment) => void; oldFormat?: ReactNode }) {
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
    footer={<><WriteBlocked reason={postBlocked} /><div className="drawer-actions">{item.url && <a className="text-button" href={item.url} target="_blank" rel="noreferrer">Open in Azure DevOps →</a>}<ReviewAction item={item} own={own} why={postBlocked} primary onWrite={onWrite} onEdit={() => { if (own) onEdit(own.comment) }} /></div></>}>
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
    {entry?.state === 'done' && <LatestComment comments={entry.comments} setup={setup} pi={pi} />}
    {entry?.state === 'done' && oldFormat}
    <section aria-label="Discussion" className="pir-discussion">
      <div className="pir-discussion-head"><h3>Discussion{entry?.state === 'done' ? ` (${entry.comments.length.toLocaleString()}${entry.capped ? '+' : ''})` : ''}</h3>
        <button type="button" className="ghost" disabled={Boolean(blocked) || entry?.state === 'loading'} title={blocked || undefined} onClick={read}>↻ Read again</button></div>
      {blocked && <WriteBlocked reason={blocked} />}
      {entry?.state === 'loading' && <p className="muted" role="status">Loading the Discussion…</p>}
      {entry?.state === 'error' && <Notice tone="error">The Discussion was not read: {entry.error} Use ↻ Read again.</Notice>}
      {entry?.state === 'done' && !entry.comments.length && <EmptyState title={entry.ignored ? `No comments since ${reviewStartLabel(entry.from ?? '')}.` : 'No comments in the Discussion.'} />}
      {entry?.state === 'done' && Boolean(entry.ignored) && <p className="muted">{entry.ignored === 1 ? '1 older comment' : `${entry.ignored?.toLocaleString()} older comments`} (before {reviewStartLabel(entry.from ?? '')}, when PI Review starts) {entry.ignored === 1 ? 'is' : 'are'} ignored.</p>}
      {entry?.state === 'done' && entry.capped && <p className="muted">Showing the newest 1,000 comments; older ones are not read.</p>}
      {entry?.state === 'done' && entry.comments.length > 0 && <ol className="pir-comments">
        {entry.comments.map((comment) => <li key={comment.id}>
          <p className="pir-comment-head"><strong>{comment.author}</strong> <small className="muted">{formatDateTime(shownDateOf(comment))}{comment.updated ? ' (updated)' : ''}</small>{oldFormatSearch && isOldFormat(comment) && <OldFormatFlag comments={[comment]} />}</p>
          <p className="pir-comment-text">{comment.text || <span className="muted">(no text)</span>}</p>
        </li>)}
      </ol>}
      {entry?.state === 'done' && <small className="muted">Read {formatDateTime(entry.readAt)} as plain text: formatting is not kept, mentions show as @Name and images as [image].</small>}
    </section>
  </Drawer>
}

// PIR-10, PIR-49: the latest review's split in the drawer (the newest comment headed "Feature Review for <the chosen
// PI>"; without one, Not reviewed and why), above the Discussion: when and by whom, then Struggles, Learnings
// and Move to next PI (or that the comment has none of the headings; the whole comment is the first of the Discussion).
// PIR-11: without a heading, the texts suggested from keywords, in italics after "Suggested from keywords".
// PIR-20: then the fields added in the PI Review form setup.
function LatestComment({ comments, setup, pi }: { comments: WorkItemComment[]; setup: PiFormSetup; pi: string }) {
  const comment = latestReviewFor(comments, pi)
  if (!comment) return <section aria-label="Latest review" className="pir-latest">
    <h3>Latest review</h3>
    <p className="muted">Not reviewed for {piLabel(pi)}: no comment in the Discussion is headed “{reviewHeadingOf(piLabel(pi))}”. {reviewHeadingNote}</p>
  </section>
  const split = reviewSplit(comment.text, setup)
  const any = Boolean(split.struggles || split.learnings || split.move || split.review || split.remarks || Object.keys(split.extra ?? {}).length)
  const suggested = split.from === 'Keywords'
  return <section aria-label="Latest review" className="pir-latest">
    <h3>Latest review</h3>
    <p className="pir-comment-head"><strong>{comment.author}</strong> <small className="muted">{formatDateTime(shownDateOf(comment))}{comment.updated ? ' (updated)' : ''}</small></p>
    {suggested && <p className="muted pir-suggested-note" title={`${suggestedHint}: the review has no Struggles, Learnings or Move to next PI heading, so its sentences with their keywords are shown.`}>Suggested from keywords — the review has no field heading: check them against the whole comment in the Discussion below.</p>}
    {any ? <dl className={`od-row-values pir-split${suggested ? ' pir-suggested' : ''}`}>
      <div><dt>Struggles</dt><dd>{split.struggles || '—'}</dd></div>
      <div><dt>Learnings</dt><dd>{split.learnings || '—'}</dd></div>
      <div><dt>Move to Next PI</dt><dd>{moveLabel(split) || '—'}</dd></div>
      {split.from === 'Headings' && <div><dt>Review mode</dt><dd>{reviewModeLabel(split) || '—'}</dd></div>}
      {split.from === 'Headings' && <div><dt>Additional Remarks</dt><dd>{split.remarks || '—'}</dd></div>}
      {split.from === 'Headings' && customFields(setup).map((field) => <div key={field.id}><dt>{field.label}</dt><dd>{split.extra?.[field.id] || '—'}</dd></div>)}
    </dl> : <p className="muted">No Struggles, Learnings or Move to next PI heading or keyword in this review: see the whole comment in the Discussion below.</p>}
  </section>
}

// PIR-77 (temporary, LIM-235): the Feature's old-format comments in the drawer — each flagged, with its author and date,
// and Convert… for its author (anyone else sees the reason: only the author can convert their comment).
function OldFormatComments({ item, why, onConvert }: { item: AzureWorkItem; why: (comment: WorkItemComment) => string; onConvert: (comment: WorkItemComment) => void }) {
  const entry = discussionOf(item.key)
  const olds = entry?.state === 'done' ? oldFormatComments(entry.comments) : []
  if (!olds.length) return null
  return <section aria-label="Old-format comments" className="pir-latest pir-old-formats">
    <h3>Old-format comments</h3>
    <p className="muted">{oldFormatNote}</p>
    <ul className="plain-list">{olds.map((comment) => { const reason = why(comment); return <li key={comment.id}>
      <OldFormatFlag comments={[comment]} /> <strong>{comment.author}</strong> <small className="muted">{formatDateTime(shownDateOf(comment))}</small>{' '}
      <ConvertButton itemId={item.id} why={reason} onConvert={() => onConvert(comment)} />{reason && <small className="muted pir-convert-why">{reason}</small>}
    </li> })}</ul>
  </section>
}
