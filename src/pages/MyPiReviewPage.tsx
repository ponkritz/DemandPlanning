import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { DataTable, type DataColumn } from '../components/DataTable'
import { EmptyState, Notice, Page, Pill, TablePanel, WriteBlocked } from '../components/ui'
import { formatDateTime } from '../format'
import { isMine, type Me } from '../myWork'
import { PersonPicker } from '../components/PersonPicker'
import { discussionOf, discussionStuck, discussionStuckAfterMs, discussionsVersion, moveLabel, oneLine, piFeatures, piLabel, reviewHeadingNote, reviewModeLabel, samePi, subscribeDiscussions, type ReviewSplit } from '../piReview'
import { discussionReadBlock, readDiscussionInto, myReviewOf, otherPersonBlock, otherPiHint, personOf, reviewCountOf, reviewPageBlock, reviewPeriodOf, reviewPostBlock, type ReviewCount, type ReviewPeriod } from '../piReviewPost'
import { ReviewAction, ReviewDialog } from './PiReviewForm'
import { BulkReviewDialog } from './BulkReviewDialog'
import { PiSetupGear } from '../components/PiFormSetupPanel'
import { formSetupOf, useBulkReview, useDiscussionsReadState, useOwnReview, useReviewViewer, useReviewWriter } from '../piReviewWriter'
import { bulkBlock, inBulkJob } from '../piReviewBulk'
import { listJobs, subscribeJobs } from '../backgroundJobs'
import type { PiFormSetup } from '../piReviewSetup'
import { usePiChoice } from './usePiChoice'
import { cutoffNote, reviewStartOf } from '../piReviewStart'
import { shownDateOf, type WorkItemComment } from '../azureDevOps'
import type { AzureWorkItem } from '../domain'
import type { AzureWorkspace } from '../useAzureWorkspace'
import type { MyWork } from '../useMyWork'
import { useEpicSetupFile } from '../useEpicSetup'
import { ownedEpics, ownedFeatures } from '../epicOwners'
import { epicOf } from '../piReview'
import { convertBlock, convertTargetOf, oldFormatComments, oldFormatSearch } from '../piReviewOldFormat'
import { ConvertButton, OldFormatFlag } from './OldFormatParts'

// My PI Review (PIR-17, My Work group): the Features assigned to me in a PI (the current PI first, a PI picker), each
// with my review status — my latest review comment (a comment I wrote with the review headings) and its date, its Move
// to next PI and Review mode — and Write review… (the PI Review form, PIR-13). My Features' Discussions are read when the
// page opens (only mine, 3 at a time) and kept for this page load, shared with PI Review.
// PIR-24: the filter row — PI (default the current PI) and Person (default me; another person only for a lead with
// "PI Review: post the review of a Feature", everyone else sees the control disabled with the reason) — and Reset
// filters. Another person's Features are their Assigned To, matched by work email where known; their review status is
// the review comment they wrote. Write review… keeps its own rights (CON-113).
// PIR-49: a review counts for the PI chosen in the PI filter only when it is headed "Feature Review for <that PI>";
// otherwise the Feature is Not reviewed (other: my latest review, headed for another PI, with its hint). A comment
// without the heading is no review (PIR-50: older reviews included).
const piKey = 'demand-planning-my-pi-review-pi-v1'
// PIR-71: which Features — assigned to me, or those of the Epics I am the Product Owner of; remembered in this browser.
type Show = 'assigned' | 'epics'
const showKey = 'demand-planning-my-pi-review-show-v1'
const readShow = (): Show => { try { return localStorage.getItem(showKey) === 'epics' ? 'epics' : 'assigned' } catch { return 'assigned' } }
const writeShow = (value: Show) => { try { localStorage.setItem(showKey, value) } catch { /* this visit only */ } }
type Status = { state: 'unread' | 'loading' | 'error' | 'none' | 'reviewed' | 'other'; comment?: WorkItemComment; split?: ReviewSplit; error?: string; count?: ReviewCount }
// KB-140: now — a read still running after discussionStuckAfterMs is shown as not read (with Retry).
function statusOf(item: AzureWorkItem, name: string | undefined, period: ReviewPeriod, setup?: PiFormSetup, now = Date.now()): Status {
  const entry = discussionOf(item.key)
  if (!entry) return { state: 'unread' }
  if (discussionStuck(entry, now)) return { state: 'error', error: `Azure DevOps did not answer within ${discussionStuckAfterMs / 1000} s.` }
  if (entry.state === 'loading') return { state: 'loading' }
  if (entry.state === 'error') return { state: 'error', error: entry.error }
  const newest = [...entry.comments].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
  const mine = myReviewOf(newest, name, setup, period.pi) ?? myReviewOf(newest, name, setup)
  if (!mine) return { state: 'none' }
  const count = reviewCountOf({ reviewedPi: mine.split.reviewedPi }, period)
  return { state: count.counts ? 'reviewed' : 'other', ...mine, count }
}
const statusLabel: Record<Status['state'], string> = { unread: 'Not read', loading: 'Reading…', error: 'Not read', none: 'Not reviewed', reviewed: 'Reviewed', other: 'Not reviewed' }
const statusText = (status: Status) => status.state === 'other' && status.comment && status.count ? `${statusLabel.other} — ${otherPiHint(status.comment.date, status.count)}` : statusLabel[status.state]

export function MyPiReviewPage({ azure, my }: { azure: AzureWorkspace; my: MyWork }) {
  const { config, pat, items, isSample } = azure
  const poster = useReviewViewer()
  // PIR-19: my review is found by the headings of the form setup in use (and the built-in ones).
  const setup = formSetupOf(poster.env)
  const version = useSyncExternalStore(subscribeDiscussions, discussionsVersion)
  // PIR-33: only the PIs that did not end before "PI Review starts from" (the form setup's date).
  const { options, current, pi, choose, fallback, remembered, iterations, cutoff } = usePiChoice(azure, piKey, reviewStartOf(setup))
  // PIR-24: whose Features — me (my own work email, else my name; not the top bar's Person of other pages) or, for a
  // lead, the person chosen. The person list: the assignees of the PI's Features.
  const [person, setPerson] = useState('')
  const personBlock = otherPersonBlock(poster)
  const who = personBlock ? '' : person
  const self = my.self
  const shownMe: Me | undefined = useMemo(() => who ? personOf(items, who) : self.known ? self.me : undefined, [who, items, self.known, self.me])
  const name = shownMe?.name
  const piRows = useMemo(() => piFeatures(items, pi), [items, pi])
  const people = useMemo(() => [...new Set(piRows.filter((item) => !(self.known && isMine(item, self.me))).map((item) => item.assignedTo.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [piRows, self.known, self.me])
  // PIR-71: My Epics (as Product Owner) — the PI's Features under the Epics whose Product Owner (Setup per Epic) is the
  // person shown, matched by work email; offered once any Epic has a Product Owner.
  const epicFile = useEpicSetupFile()
  const [show, setShowState] = useState<Show>(readShow)
  const setShow = (value: Show) => { setShowState(value); writeShow(value) }
  const ownerEmail = shownMe?.email || (who ? '' : poster.email)
  const owns = ownedEpics(epicFile, ownerEmail)
  const offersEpics = (epicFile?.epics ?? []).some((entry) => entry.productOwner)
  const asOwner = offersEpics && show === 'epics'
  const rows = useMemo(() => !shownMe ? [] : asOwner ? ownedFeatures(epicFile, items, piRows, ownerEmail) : piRows.filter((item) => isMine(item, shownMe)), [piRows, shownMe, asOwner, epicFile, items, ownerEmail])
  // PIR-77: the filter Old format (n) — part of the filter row, cleared by Reset filters.
  const [oldOnly, setOldOnly] = useState(false)
  const filtered = Boolean(who) || asOwner || Boolean(remembered && !samePi(remembered, fallback.pi)) || oldOnly
  const resetFilters = () => { setPerson(''); choose(''); setShow('assigned'); setOldOnly(false) }
  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])
  const epicName = (item: AzureWorkItem) => { const epic = epicOf(items, item, byId); return epic ? epic.title || `#${epic.id}` : '' }
  const readBlocked = discussionReadBlock({ isSample, config, pat })
  // PIR-17, PIR-24: read the shown Features' Discussions not read yet (3 at a time), once per Feature list — and again
  // when "PI Review starts from" changed (PIR-33: the Discussions read before are forgotten). PIR-35: the same read as PI
  // Review's automatic read of my own Features (useDiscussionsRead).
  const reading = useDiscussionsReadState(config, pat, rows, readBlocked)
  // KB-140: a read that does not answer turns into Not read with Retry after discussionStuckAfterMs (re-rendered then).
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const since = rows.map((item) => discussionOf(item.key)).flatMap((entry) => entry?.state === 'loading' && entry.since != null && !discussionStuck(entry) ? [entry.since] : [])
    if (!since.length) return
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, Math.min(...since) + discussionStuckAfterMs - Date.now()) + 50)
    return () => clearTimeout(timer)
  }, [rows, version, now])
  // KB-140: Retry — a Discussion not read (an error, a read that did not answer, or left unread when the read stopped).
  const retryOf = (item: AzureWorkItem, shown: Status) => !readBlocked && config && (shown.state === 'error' || (shown.state === 'unread' && reading.settled)) ? () => { void readDiscussionInto(config, pat, item, { fresh: true }).catch(() => { /* shown in the row */ }) } : undefined
  const writer = useReviewWriter(pi, { list: iterations.list, reading: !iterations.done })
  // PIR-49: the chosen PI — a review counts when its heading names it.
  const period = useMemo(() => reviewPeriodOf(pi), [pi])
  const status = (item: AzureWorkItem) => statusOf(item, name, period, setup, now)
  // PIR-34: Edit review… — my own review comment that counts for the chosen PI (useOwnReview, shared with PI Review);
  // never when a lead shows another person (their comments are theirs to edit).
  const ownOptions = { others: Boolean(who) || !self.known, me: { email: poster.email || self.me.email, name: self.me.name } }
  const reviewIterations = { list: iterations.list, reading: !iterations.done, problem: iterations.problem }
  const editTarget = useOwnReview(pi, ownOptions)
  const pageBlock = reviewPageBlock(poster)
  // PIR-36, PIR-37: tick several Features and write one review for them all — a row that cannot take it is not tickable,
  // with the reason (bulkBlock); a Feature in the running job waits for it. The table re-renders as the job moves on.
  useSyncExternalStore(subscribeJobs, listJobs)
  const bulk = useBulkReview(pi, reviewIterations, ownOptions)
  const [selected, setSelected] = useState<string[]>([])
  const busyOf = (item: AzureWorkItem) => inBulkJob(item.key) ? `Feature #${item.id} is in the running “PI review for …” job: wait for it.` : ''
  const actionBlock = (item: AzureWorkItem) => reviewPostBlock(poster, item) || busyOf(item)
  const tickBlock = (item: AzureWorkItem) => bulkBlock(reviewPostBlock(poster, item), { discussion: discussionOf(item.key), busy: busyOf(item) })
  const picked = rows.filter((item) => selected.includes(item.key) && !tickBlock(item))
  // PIR-77 (temporary, LIM-235): the old-format comments of each Feature (read Discussions only), Convert… for their
  // author, and the filter "Old format (n)".
  const oldOf = (item: AzureWorkItem) => { const entry = discussionOf(item.key); return oldFormatComments(entry?.state === 'done' ? entry.comments : undefined) }
  const oldCount = rows.filter((item) => oldOf(item).length > 0).length
  const shownRows = oldFormatSearch && oldOnly ? rows.filter((item) => oldOf(item).length > 0) : rows
  const convertMe = ownOptions.me
  const convertOf = (item: AzureWorkItem) => { const entry = discussionOf(item.key); return convertTargetOf(entry?.state === 'done' ? entry.comments : undefined, convertMe) }

  const columns: DataColumn<AzureWorkItem>[] = [
    { id: 'id', label: 'ID', value: (item) => item.id, align: 'right', render: (item) => item.url ? <a href={item.url} target="_blank" rel="noreferrer" title={`Open Feature #${item.id} in Azure DevOps`}>{item.id}</a> : item.id },
    { id: 'title', label: 'Title', value: (item) => item.title },
    { id: 'state', label: 'State', value: (item) => item.state },
    // PIR-71: in My Epics (as Product Owner), the Feature's Epic and assignee.
    ...(asOwner ? [{ id: 'epic', label: 'Epic', value: (item: AzureWorkItem) => epicName(item) }, { id: 'assigned', label: 'Assigned to', value: (item: AzureWorkItem) => item.assignedTo }] : []),
    { id: 'status', label: who ? 'Their review' : 'My review', hint: `Reviewed: ${who ? `${who} wrote` : 'you wrote'} a review comment for the chosen PI — a comment headed “Feature Review for PI 26.4” counts for PI 26.4 only. Not reviewed: none yet, or only a review for another PI (its date and PI shown)${who ? '; a review posted by someone else does not count' : ''}. ${reviewHeadingNote} Read from Azure DevOps when the page opens.`,
      value: (item) => statusText(status(item)), title: (item) => status(item).error,
      render: (item) => { const shown = status(item); return <span className="pir-status"><Pill tone={shown.state === 'reviewed' ? 'open' : shown.state === 'none' || shown.state === 'other' ? 'warning' : shown.state === 'error' ? 'danger' : 'neutral'}>{statusLabel[shown.state]}</Pill>{retryOf(item, shown) && <button type="button" className="ghost" aria-label={`Read the Discussion of Feature ${item.id} again`} title={shown.error ? `${shown.error} Read it again.` : 'Read the Discussion again.'} onClick={retryOf(item, shown)}>Retry</button>}{shown.state === 'other' && shown.comment && shown.count && <small className="muted">{otherPiHint(shown.comment.date, shown.count)}</small>}<OldFormatFlag comments={oldOf(item)} /></span> } },
    { id: 'date', label: who ? 'Date of their review' : 'Date of my review', firstSortDesc: true, value: (item) => { const comment = status(item).comment; return comment ? shownDateOf(comment) : '' }, render: (item) => { const shown = status(item); return shown.comment ? <span title={shown.comment.updated ? `Written ${formatDateTime(shown.comment.date)}, updated ${formatDateTime(shown.comment.updated)}` : undefined}>{formatDateTime(shownDateOf(shown.comment))}</span> : <span className="muted">—</span> } },
    { id: 'move', label: 'Move to Next PI', value: (item) => { const split = status(item).split; return split ? moveLabel(split) : '' }, render: (item) => { const split = status(item).split; return split ? <span className="pir-clip">{oneLine(moveLabel(split))}</span> : <span className="muted">—</span> } },
    { id: 'review-mode', label: 'Review mode', value: (item) => { const split = status(item).split; return split ? reviewModeLabel(split) : '' } },
    { id: 'actions', label: 'Actions', export: false, sortable: false,
      // PIR-34: one action per row — Edit review… in place of Write review… when my own review counts for the PI.
      // PIR-77: Convert… beside it when the Feature has an old-format comment (only its author can convert it).
      render: (item) => { const own = editTarget(item), old = convertOf(item); return <span className="button-row"><ReviewAction item={item} own={own} why={actionBlock(item)} onWrite={() => void writer.start(item)} onEdit={() => { if (own) writer.startEdit(item, own.comment) }} />{old && <ConvertButton itemId={item.id} why={convertBlock(poster, item, old, convertMe) || busyOf(item)} onConvert={() => writer.startConvert(item, old, options)} />}</span> } },
  ]
  const reviewed = rows.filter((item) => status(item).state === 'reviewed').length
  const notice = !iterations.done ? '' : fallback.why === 'overlap' || ((fallback.why === 'fallback' || fallback.why === 'none') && !remembered) ? fallback.note : ''
  const toolbar = <span className="people-filters pir-filters">
    <label className="inline-select">PI<select aria-label="PI" value={pi} onChange={(event) => choose(event.target.value)}>
      {!pi && <option value="">Choose a PI…</option>}
      {options.map((entry) => <option key={entry} value={entry}>{piLabel(entry)}{samePi(entry, current) ? ' (current)' : ''}</option>)}
    </select></label>
    {pi && samePi(pi, current) && <Pill tone="info">Current PI</Pill>}
    {offersEpics && <div className="segmented" role="radiogroup" aria-label="Show">{([['assigned', who ? `Features assigned to ${who}` : 'Features assigned to me'], ['epics', who ? `Epics of ${who} (as Product Owner)` : 'My Epics (as Product Owner)']] as [Show, string][]).map(([key, label]) => <button key={key} type="button" role="radio" aria-checked={show === key} className={show === key ? 'active' : ''} onClick={() => setShow(key)}>{label}</button>)}</div>}
    <label className="inline-select pir-person">Person<PersonPicker label="Person" value={who} people={people} onChange={setPerson} meLabel={self.known ? `Me (${self.me.name ?? self.me.email})` : 'Choose a person…'} disabled={Boolean(personBlock)} title={personBlock || undefined} /></label>
    {oldFormatSearch && (oldCount > 0 || oldOnly) && <span className="segmented" role="group" aria-label="Show Features">
      <button type="button" aria-pressed={!oldOnly} onClick={() => setOldOnly(false)}>All</button>
      <button type="button" aria-pressed={oldOnly} title="Features with a comment in the old format (Struggles / Learnings / Moving to next PI, without the heading “Feature Review for PI …”): it does not count as a review until its author converts it." onClick={() => setOldOnly(true)}>Old format ({oldCount})</button>
    </span>}
    <button type="button" className="ghost" disabled={!filtered} onClick={resetFilters}>Reset filters</button>
    <WriteBlocked reason={personBlock} />
  </span>
  // PIR-30: ⚙ PI Review Setup in the page actions, when the page is in the viewer's menu (UI-STANDARDS §6).
  return <Page intro="The Features assigned to you (a lead can choose another person) — or, as an Epic’s Product Owner, the Features of your Epics — in a PI and whether their PI review is written. Review… posts it as a new comment in the Feature’s Discussion in Azure DevOps; Edit review… changes your own review of the chosen PI in place. Tick several Features to write one review for them all." actions={<PiSetupGear />}>
    {notice && <Notice tone="warning">{notice}</Notice>}
    {!shownMe ? <EmptyState title="Who are you in Azure DevOps?" detail="Enter your work email on the Time Writing connection, or choose your name in My Tasks [Board]." />
      : <TablePanel title={asOwner ? who ? `Features of the Epics of ${who} (Product Owner)` : 'Features of my Epics (as Product Owner)' : who ? `Features of ${who}` : 'My Features'} info={`The Features of the chosen PI assigned to you — or, for a lead, to the person chosen (Assigned To, matched by work email where known) — not Removed, not under the absence Epic. Their Discussions are read from Azure DevOps when the page opens and kept for this page load; the review column says whether that person wrote a review comment for the chosen PI, and when. A review counts for the chosen PI only when it is headed “Feature Review for” that PI (e.g. “Feature Review for PI 26.4” counts for PI 26.4, not for PI 26.5) — whatever its date. A review for another PI shows as Not reviewed with its date and PI; choosing another PI recomputes the column. ${reviewHeadingNote} ${cutoffNote(cutoff)}`}>
        <WriteBlocked reason={readBlocked || pageBlock} />
        {/* KB-155, PIR-80: Update review for N… reads the ticked Features' Discussions again before the pop-up opens. */}
        {(picked.length > 0 || bulk.opening) && <div className="bulk-bar" role="region" aria-label="Selected Features">
          <strong>{(bulk.opening ?? picked).length} selected</strong>
          <button type="button" className="ghost" disabled={Boolean(bulk.opening)} onClick={() => void bulk.start(picked)}>{bulk.opening ? `Reading ${bulk.opening.length} Discussion${bulk.opening.length === 1 ? '' : 's'}…` : `Update review for ${picked.length}…`}</button>
          <button type="button" className="text-button" disabled={Boolean(bulk.opening)} onClick={() => setSelected([])}>Clear selection</button>
        </div>}
        <DataTable id="mypireview:features" className="pir-table" columns={columns} rows={shownRows} rowKey={(item) => item.key}
          selection={{ selected, onChange: setSelected, label: (item) => `Feature ${item.id}`, blocked: tickBlock }} exportName={`My PI Review ${pi ? piLabel(pi) : ''}${who ? ` ${who}` : ''}${asOwner ? ' Product Owner' : ''}`.trim()} toolbar={toolbar}
          status={`${reviewed} of ${rows.length} reviewed${shownRows.length !== rows.length ? ` · ${shownRows.length} shown` : ''}`} defaultSort={{ id: 'id' }}
          empty={<EmptyState title={!pi ? 'Choose a PI.' : asOwner ? owns.length ? `No Features of ${who ? `${who}’s` : 'your'} Epics in ${piLabel(pi)}.` : `${who || 'You'} ${who ? 'is' : 'are'} not the Product Owner of any Epic${ownerEmail ? '' : ' (no work email known)'}.` : `No Features assigned to ${who || 'you'} in ${piLabel(pi)}.`} detail={!pi ? 'Pick the PI in the PI list.' : asOwner && !owns.length ? 'The Product Owner of an Epic is set in Admin → Feature & PI setup → Setup per Epic (matched by work email).' : who ? 'Choose another PI or person, or Reset filters.' : 'Choose another PI, or fetch the data again.'} />} />
      </TablePanel>}
    {bulk.writing && <BulkReviewDialog key={`bulk:${bulk.writing.targets.map((target) => target.item.key).join(',')}`} writing={bulk.writing} blocked={pageBlock} blockOf={tickBlock} onPost={(jobs, skipped) => { setSelected([]); bulk.post(jobs, skipped) }} onClose={bulk.cancel} />}
    {writer.writing && <ReviewDialog key={`review:${writer.writing.item.key}`} writing={writer.writing} blocked={reviewPostBlock(poster, writer.writing.item)} onPost={writer.post} onPostNew={writer.postNew} onClose={writer.cancel} />}
  </Page>
}
