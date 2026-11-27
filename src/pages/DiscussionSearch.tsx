import { useState } from 'react'
import { DataTable, type DataColumn } from '../components/DataTable'
import { EmptyState, Info, Modal, Pill } from '../components/ui'
import { formatDateTime } from '../format'
import { discussionOf, oneLine } from '../piReview'
import { oldFormatLabel, oldFormatNote, searchComments, type SearchHit } from '../piReviewOldFormat'
import { shownDateOf } from '../azureDevOps'
import type { AzureWorkItem } from '../domain'

// PIR-78 (temporary, LIM-235): Search Discussions… on PI Review — a pop-up (UI-STANDARDS §4) with a free-text search over
// the comments of the Discussions read in this page load (the PI's Features), each matching comment with its Feature,
// author, date and the Old format flag; a row opens the Feature's drawer. A Feature whose Discussion is not read is not
// searched: the pop-up says how many, and ↻ Read all Discussions reads them.
type Hit = SearchHit<AzureWorkItem>
export function DiscussionSearch({ items, onOpen, onClose }: { items: readonly AzureWorkItem[]; onOpen: (item: AzureWorkItem) => void; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const read = items.flatMap((item) => { const entry = discussionOf(item.key); return entry?.state === 'done' ? [{ item, comments: entry.comments }] : [] })
  const unread = items.length - read.length
  const { hits, more } = searchComments(read, query)
  const columns: DataColumn<Hit>[] = [
    { id: 'id', label: 'ID', align: 'right', value: (hit) => hit.item.id },
    { id: 'title', label: 'Feature', value: (hit) => hit.item.title },
    { id: 'author', label: 'Author', value: (hit) => hit.comment.author },
    { id: 'date', label: 'Date and Time of Comment', firstSortDesc: true, value: (hit) => shownDateOf(hit.comment), render: (hit) => formatDateTime(shownDateOf(hit.comment)) },
    { id: 'old', label: 'Old format', hint: oldFormatNote, value: (hit) => hit.old ? oldFormatLabel : '', render: (hit) => hit.old ? <Pill tone="warning">{oldFormatLabel}</Pill> : <span className="muted">—</span> },
    { id: 'text', label: 'Comment', value: (hit) => hit.comment.text, title: (hit) => hit.comment.text, render: (hit) => <span className="pir-clip">{oneLine(hit.comment.text)}</span> },
  ]
  const toolbar = <span className="people-filters pir-filters">
    <input type="search" className="search" aria-label="Search Discussions" placeholder="Search comments, e.g. Struggles" title="Every word typed, in the comment or its author (letter case ignored)" value={query} onChange={(event) => setQuery(event.target.value)} />
    <button type="button" className="ghost" disabled={!query} onClick={() => setQuery('')}>Reset filters</button>
  </span>
  const readNote = unread ? `${unread.toLocaleString()} of ${items.length.toLocaleString()} Discussions not read yet: they are not searched — ↻ Read all Discussions first.` : ''
  const about = `Searches the comments of the Discussions read in this page load (the Features of the chosen PI; on or after “PI Review starts from”), for every word typed. Each matching comment is listed with its Feature, author and date; Old format marks a comment written as “Struggles / Learnings / Moving to next PI” without the heading “Feature Review for PI …” — it does not count as a review until its author converts it (My PI Review or the Feature’s drawer). Temporary, until every old-format review is converted.`
  return <Modal title="Search Discussions" eyebrow="PI REVIEW · DISCUSSIONS" wide onClose={onClose}>
    <p className="muted pir-search-note"><Info iconOnly label="About Search Discussions">{about}</Info> {readNote ? <span role="status">{readNote}</span> : `All ${items.length.toLocaleString()} Discussions of the PI are read.`}</p>
    <DataTable id="pireview:search" className="pir-search" columns={columns} rows={hits} rowKey={(hit) => `${hit.item.key}|${hit.comment.id}`} onRowOpen={(hit) => onOpen(hit.item)} rowLabel={(hit) => `Comment of ${hit.comment.author} on Feature ${hit.item.id}: open the Feature`} toolbar={toolbar} exportName="PI Review search"
      status={query.trim() ? `${hits.length.toLocaleString()}${more ? '+' : ''} matching comment${hits.length === 1 ? '' : 's'} in ${read.length.toLocaleString()} of ${items.length.toLocaleString()} Discussions` : `${read.length.toLocaleString()} of ${items.length.toLocaleString()} Discussions read`} defaultSort={{ id: 'date', desc: true }}
      empty={<EmptyState title={query.trim() ? 'No comment matches the search.' : 'Type to search the comments.'} detail={query.trim() ? (unread ? 'Read all Discussions to search them all, or change the words.' : 'Change the words, or Reset filters.') : 'For example “Struggles” finds the reviews written in the old format.'} />} />
  </Modal>
}
