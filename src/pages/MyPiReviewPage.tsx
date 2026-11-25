import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { DataTable, type DataColumn } from '../components/DataTable'
import { EmptyState, Notice, Page, Pill, TablePanel, WriteBlocked } from '../components/ui'
import { formatDate, formatDateTime } from '../format'
import { isMine, type Me } from '../myWork'
import { PersonPicker } from '../components/PersonPicker'
import { discussionOf, discussionsVersion, moveLabel, oneLine, piFeatures, piLabel, readDiscussions, reviewModeLabel, samePi, subscribeDiscussions, type ReviewSplit } from '../piReview'
import { rateLimitWait } from '../azureDevOps'
import { myReviewOf, otherPersonBlock, otherPiHint, personOf, readDiscussionInto, reviewCountOf, reviewPageBlock, reviewPeriodOf, reviewPostBlock, type ReviewCount, type ReviewPeriod } from '../piReviewPost'
import { ReviewDialog } from './PiReviewForm'
import { PiSetupGear } from '../components/PiFormSetupPanel'
import { formSetupOf, useReviewViewer, useReviewWriter } from '../piReviewWriter'
import type { PiFormSetup } from '../piReviewSetup'
import { usePiChoice } from './usePiChoice'
import type { WorkItemComment } from '../azureDevOps'
import type { AzureWorkItem } from '../domain'
import type { AzureWorkspace } from '../useAzureWorkspace'
import type { MyWork } from '../useMyWork'

// My PI Review (PIR-17, My Work group): the Features assigned to me in a PI (the current PI first, a PI picker), each
// with my review status — my latest review comment (a comment I wrote with the review headings) and its date, its Move
// to next PI and Review mode — and Write review… (the PI Review form, PIR-13). My Features' Discussions are read when the
// page opens (only mine, 3 at a time) and kept for this page load, shared with PI Review.
// PIR-24: the filter row — PI (default the current PI) and Person (default me; another person only for a lead with
// "PI Review: post the review of a Feature", everyone else sees the control disabled with the reason) — and Reset
// filters. Another person's Features are their Assigned To, matched by work email where known; their review status is
// the review comment they wrote. Write review… keeps its own rights (CON-113).
// PIR-26, PIR-28: a review counts for the PI chosen in the PI filter — its heading names that PI, or (without a PI in
// its headings) it is dated in that PI's dates — or when the Feature is Closed and the review is dated on or after its
// Closed Date; otherwise the Feature is Not reviewed (other: my latest review, written for another PI, with its hint).
const piKey = 'demand-planning-my-pi-review-pi-v1'
type Status = { state: 'unread' | 'loading' | 'error' | 'none' | 'reviewed' | 'other'; comment?: WorkItemComment; split?: ReviewSplit; error?: string; count?: ReviewCount }
function statusOf(item: AzureWorkItem, name: string | undefined, period: ReviewPeriod | null, setup?: PiFormSetup): Status {
  const entry = discussionOf(item.key)
  if (!entry) return { state: 'unread' }
  if (entry.state === 'loading') return { state: 'loading' }
  if (entry.state === 'error') return { state: 'error', error: entry.error }
  const mine = myReviewOf([...entry.comments].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id), name, setup)
  if (!mine) return { state: 'none' }
  if (!period) return { state: 'loading' }
  const count = reviewCountOf({ date: mine.comment.date, reviewedPi: mine.split.reviewedPi }, item, period)
  return { state: count.counts ? 'reviewed' : 'other', ...mine, count }
}
const statusLabel: Record<Status['state'], string> = { unread: 'Not read', loading: 'Reading…', error: 'Not read', none: 'Not reviewed', reviewed: 'Reviewed', other: 'Not reviewed' }
const statusText = (status: Status) => status.state === 'other' && status.comment && status.count ? `${statusLabel.other} — ${otherPiHint(status.comment.date, status.count)}` : status.state === 'reviewed' && status.count?.why === 'closed' ? 'Reviewed — at close' : statusLabel[status.state]

export function MyPiReviewPage({ azure, my }: { azure: AzureWorkspace; my: MyWork }) {
  const { config, pat, items, isSample } = azure
  const poster = useReviewViewer()
  // PIR-19: my review is found by the headings of the form setup in use (and the built-in ones).
  const setup = formSetupOf(poster.env)
  useSyncExternalStore(subscribeDiscussions, discussionsVersion)
  const { options, current, pi, choose, fallback, remembered, iterations } = usePiChoice(azure, piKey)
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
  const rows = useMemo(() => shownMe ? piRows.filter((item) => isMine(item, shownMe)) : [], [piRows, shownMe])
  const filtered = Boolean(who) || Boolean(remembered && !samePi(remembered, fallback.pi))
  const resetFilters = () => { setPerson(''); choose('') }
  const readBlocked = isSample ? 'Synthetic sample data is loaded: the Discussions are not read from Azure DevOps.' : !config || !pat.trim() ? 'Connect the Time Writing connection (with its PAT) to read the Discussions.' : ''
  // PIR-17, PIR-24: read the shown Features' Discussions not read yet (3 at a time), once per Feature list.
  const readKey = useRef('')
  const listKey = rows.map((item) => item.key).join(',')
  useEffect(() => {
    if (readBlocked || !config || !listKey || readKey.current === listKey) return
    readKey.current = listKey
    const targets = rows.filter((item) => !discussionOf(item.key))
    if (targets.length) void readDiscussions(targets.map((item) => item.id), (id) => readDiscussionInto(config, pat, targets.find((item) => item.id === id)!), { rateWait: rateLimitWait })
  }, [listKey, readBlocked, config, pat, rows])
  const writer = useReviewWriter(pi, { list: iterations.list, reading: !iterations.done })
  // PIR-26: the dates of the chosen PI (recomputed when the PI filter changes); null while the iterations are read.
  const period = useMemo(() => !iterations.done ? null : reviewPeriodOf(pi, iterations.list, { problem: iterations.problem }), [pi, iterations.done, iterations.list, iterations.problem])
  const status = (item: AzureWorkItem) => statusOf(item, name, period, setup)
  const pageBlock = reviewPageBlock(poster)

  const columns: DataColumn<AzureWorkItem>[] = [
    { id: 'id', label: 'ID', value: (item) => item.id, align: 'right', render: (item) => item.url ? <a href={item.url} target="_blank" rel="noreferrer" title={`Open Feature #${item.id} in Azure DevOps`}>{item.id}</a> : item.id },
    { id: 'title', label: 'Title', value: (item) => item.title },
    { id: 'state', label: 'State', value: (item) => item.state },
    { id: 'status', label: who ? 'Their review' : 'My review', hint: `Reviewed: ${who ? `${who} wrote` : 'you wrote'} a review comment (with the review headings) for the chosen PI — its headings name that PI (“Learnings of PI 26.4:”), or, without a PI in them, it is dated within the PI’s Azure DevOps dates (UTC) — or the Feature is Closed and the review is dated on or after its Closed Date. Not reviewed: none yet, or only a review for another PI (its date and PI shown)${who ? '; a review posted by someone else does not count' : ''}. Read from Azure DevOps when the page opens.`,
      value: (item) => statusText(status(item)), title: (item) => status(item).error,
      render: (item) => { const shown = status(item); return <span className="pir-status"><Pill tone={shown.state === 'reviewed' ? 'open' : shown.state === 'none' || shown.state === 'other' ? 'warning' : shown.state === 'error' ? 'danger' : 'neutral'}>{statusLabel[shown.state]}</Pill>{shown.state === 'other' && shown.comment && shown.count && <small className="muted">{otherPiHint(shown.comment.date, shown.count)}</small>}{shown.state === 'reviewed' && shown.count?.why === 'closed' && <small className="muted">At close ({formatDate(shown.comment?.date)})</small>}</span> } },
    { id: 'date', label: who ? 'Date of their review' : 'Date of my review', firstSortDesc: true, value: (item) => status(item).comment?.date ?? '', render: (item) => { const shown = status(item); return shown.comment ? formatDateTime(shown.comment.date) : <span className="muted">—</span> } },
    { id: 'move', label: 'Move to Next PI', value: (item) => { const split = status(item).split; return split ? moveLabel(split) : '' }, render: (item) => { const split = status(item).split; return split ? <span className="pir-clip">{oneLine(moveLabel(split))}</span> : <span className="muted">—</span> } },
    { id: 'review-mode', label: 'Review mode', value: (item) => { const split = status(item).split; return split ? reviewModeLabel(split) : '' } },
    { id: 'actions', label: 'Actions', export: false, sortable: false,
      render: (item) => { const why = reviewPostBlock(poster, item); return <button type="button" className="ghost" disabled={Boolean(why)} title={why || `Write the PI review of Feature #${item.id}`} aria-label={`Write review of Feature ${item.id}`} onClick={() => void writer.start(item)}>Write review…</button> } },
  ]
  const reviewed = rows.filter((item) => status(item).state === 'reviewed').length
  const notice = !iterations.done ? '' : fallback.why === 'overlap' || ((fallback.why === 'fallback' || fallback.why === 'none') && !remembered) ? fallback.note : ''
  // PIR-26: the chosen PI has no dates (or they are not read): every review counts, said on the page.
  const periodNote = rows.length && !readBlocked ? period?.note ?? '' : ''
  const toolbar = <span className="people-filters pir-filters">
    <label className="inline-select">PI<select aria-label="PI" value={pi} onChange={(event) => choose(event.target.value)}>
      {!pi && <option value="">Choose a PI…</option>}
      {options.map((entry) => <option key={entry} value={entry}>{piLabel(entry)}{samePi(entry, current) ? ' (current)' : ''}</option>)}
    </select></label>
    {pi && samePi(pi, current) && <Pill tone="info">Current PI</Pill>}
    <label className="inline-select pir-person">Person<PersonPicker label="Person" value={who} people={people} onChange={setPerson} meLabel={self.known ? `Me (${self.me.name ?? self.me.email})` : 'Choose a person…'} disabled={Boolean(personBlock)} title={personBlock || undefined} /></label>
    <button type="button" className="ghost" disabled={!filtered} onClick={resetFilters}>Reset filters</button>
    <WriteBlocked reason={personBlock} />
  </span>
  // PIR-30: ⚙ PI Review Setup in the page actions, when the page is in the viewer's menu (UI-STANDARDS §6).
  return <Page intro="The Features assigned to you (a lead can choose another person) in a PI and whether their PI review is written. Write review… posts it as a new comment in the Feature’s Discussion in Azure DevOps." actions={<PiSetupGear />}>
    {notice && <Notice tone="warning">{notice}</Notice>}
    {periodNote && <Notice tone="warning">{periodNote}</Notice>}
    {!shownMe ? <EmptyState title="Who are you in Azure DevOps?" detail="Enter your work email on the Time Writing connection, or choose your name in My Tasks [Board]." />
      : <TablePanel title={who ? `Features of ${who}` : 'My Features'} info="The Features of the chosen PI assigned to you — or, for a lead, to the person chosen (Assigned To, matched by work email where known) — not Removed, not under the absence Epic. Their Discussions are read from Azure DevOps when the page opens and kept for this page load; the review column says whether that person wrote a review comment (with the review headings) for the chosen PI, and when. A review counts for the chosen PI when its headings name that PI, or — without a PI in them — when it is dated within the PI’s dates in Azure DevOps (its own, else its Sprints’; compared in UTC), or when the Feature is Closed and the review is dated on or after its Closed Date. A review for another PI shows as Not reviewed with its date and PI; choosing another PI recomputes the column. When the chosen PI has no dates, every review counts, and the page says so.">
        <WriteBlocked reason={readBlocked || pageBlock} />
        <DataTable id="mypireview:features" className="pir-table" columns={columns} rows={rows} rowKey={(item) => item.key} exportName={`My PI Review ${pi ? piLabel(pi) : ''}${who ? ` ${who}` : ''}`.trim()} toolbar={toolbar}
          status={`${reviewed} of ${rows.length} reviewed`} defaultSort={{ id: 'id' }}
          empty={<EmptyState title={!pi ? 'Choose a PI.' : `No Features assigned to ${who || 'you'} in ${piLabel(pi)}.`} detail={!pi ? 'Pick the PI in the PI list.' : who ? 'Choose another PI or person, or Reset filters.' : 'Choose another PI, or fetch the data again.'} />} />
      </TablePanel>}
    {writer.writing && <ReviewDialog key={`review:${writer.writing.item.key}`} writing={writer.writing} blocked={reviewPostBlock(poster, writer.writing.item)} onPost={writer.post} onClose={writer.cancel} />}
  </Page>
}
