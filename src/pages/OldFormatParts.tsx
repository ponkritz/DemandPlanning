import { formatDateTime } from '../format'
import { Pill } from '../components/ui'
import { piLabel } from '../piReview'
import { piText, type ReviewForm } from '../piReviewPost'
import { oldFormatLabel, oldFormatNote } from '../piReviewOldFormat'
import { shownDateOf, type WorkItemComment } from '../azureDevOps'

// PIR-75…PIR-78 (temporary, LIM-235): the parts of the old-format mechanism shared by My PI Review, PI Review and the
// review form — the flag, the Convert… button and the reviewed PI chosen while converting.

// PIR-75: the flag "Old format — convert", with who wrote it (PI Review: leads see who still has to convert).
export function OldFormatFlag({ comments, withAuthor = false }: { comments: readonly WorkItemComment[]; withAuthor?: boolean }) {
  if (!comments.length) return null
  const authors = [...new Set(comments.map((comment) => comment.author.trim() || 'Unknown'))]
  return <span className="pir-old-format" title={`${oldFormatNote}\n${comments.map((comment) => `${comment.author}, ${formatDateTime(shownDateOf(comment))}`).join('\n')}`}>
    <Pill tone="warning">{oldFormatLabel}</Pill>{withAuthor && <small className="muted">{authors.join(', ')}</small>}
  </span>
}

// PIR-77: Convert… — disabled with the reason (only the author can convert, then the review rights).
export function ConvertButton({ itemId, why, onConvert, primary = false }: { itemId: number; why: string; onConvert: () => void; primary?: boolean }) {
  return <button type="button" className={primary ? 'primary' : 'ghost'} disabled={Boolean(why)} title={why || `Convert the old-format comment of Feature #${itemId} into the review format`} aria-label={`Convert old-format comment of Feature ${itemId}`} onClick={onConvert}>Convert…</button>
}

// PIR-76: in the review form while converting — what saving does and the reviewed PI (default the page's PI): the
// heading "Feature Review for" it is written with, so the comment counts for that PI.
export function ConvertPi({ form, options, date, onChange }: { form: ReviewForm; options: readonly string[]; date: string; onChange: (form: ReviewForm) => void }) {
  const value = options.find((option) => piText(piLabel(option)).toLowerCase() === (form.reviewedPi ?? '').toLowerCase()) ?? ''
  return <div className="pir-convert">
    <p className="muted pir-review-note">Converting the old-format comment of {formatDateTime(date)}: prefilled from it (text under no field is in Additional Remarks). Saving replaces that comment in the review format, headed “Feature Review for {form.reviewedPi || 'PI …'}”, so it counts as the PI review of that PI.</p>
    <label className="inline-select">Reviewed PI<select aria-label="Reviewed PI" value={value} onChange={(event) => onChange({ ...form, reviewedPi: piText(piLabel(event.target.value)) })}>
      {!value && <option value="">{form.reviewedPi || 'Choose a PI…'}</option>}
      {options.map((option) => <option key={option} value={option}>{piLabel(option)}</option>)}
    </select></label>
  </div>
}
