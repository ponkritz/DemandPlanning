// PI Review, the review form (PIR-13…PIR-15, CON-113): who may post a Feature's review, the next PI, the form's checks,
// the comment built from it in the standard format PI Review reads back (splitReviewComment), and the post itself — a
// new comment in the Feature's Discussion, written with the person's own PAT to dev.azure.com only.
import { commentHtml, isCloudBase, collectionUrl, requestAzure, type AzureConfig, type AzureTransport } from './azureClient.ts'
import { writeBlockedReason, type Action } from './access.ts'
import { laterPi, piName, piPathOf, type Me } from './myWork.ts'
import { formatDate } from './format.ts'
import { commentText } from './workItemEdit.ts'
import { readDiscussion } from './azureDevOps.ts'
import { piPlaceholder, reviewFooter, reviewSplit, setDiscussion, tidyReviewText, type ReviewSplit } from './piReview.ts'
import { builtInFormSetup, fieldOf, setupProblems, type PiFormField, type PiFormSetup } from './piReviewSetup.ts'
import type { AzureWorkItem } from './domain'
import type { WorkItemComment } from './azureDevOps.ts'
import type { AzureIteration } from './azureRead.ts'

// PIR-13: the form. move: Yes or No only (an older comment's Partly is read, never offered), **No** pre-selected (the
// product owner's choice, UI-STANDARDS §12 exception of 2026-11-25); movePi: the PI it moves to. mode: the Review
// meeting advice (one of its options), no default. PIR-20: extra — the fields added in the form setup, by id.
// PIR-19: the defaults come from the form setup in use (the built-in form without one): Move = its default (No).
export type ReviewMove = 'Yes' | 'No'
export interface ReviewForm { learnings: string; struggles: string; move: ReviewMove | ''; moveReason: string; movePi: string; mode: string; remarks: string; extra?: Record<string, string> }
const choiceDefault = (field: PiFormField | undefined) => field?.type === 'dropdown' ? field.defaultValue : ''
export function emptyReviewForm(movePi = '', setup: PiFormSetup = builtInFormSetup()): ReviewForm {
  const move = choiceDefault(fieldOf(setup, 'move'))
  const extra = Object.fromEntries(setup.fields.filter((field) => !builtIn.has(field.id)).map((field) => [field.id, choiceDefault(field)]))
  return { learnings: '', struggles: '', move: move === 'Yes' || move === 'No' ? move : '', moveReason: '', movePi, mode: choiceDefault(fieldOf(setup, 'review')), remarks: '', ...(Object.keys(extra).length ? { extra } : {}) }
}
const builtIn = new Set(['learnings', 'struggles', 'move', 'review', 'remarks'])

// PIR-13: the PI written in the Move question — "PI" and its number ("PI 26.5", "PI 2026.5").
const piPattern = /^pi[ \t]*(\d+(?:\.\d+)*)$/i
export const piText = (name: string) => { const match = piPattern.exec(name.trim()); return match ? `PI ${match[1]}` : '' }
// PIR-13: the PI after the reviewed one — the next later PI in the PI list (by laterPi), else the reviewed PI's last
// number increased by one ("PI 26.4" → "PI 26.5"); as "PI <number>", '' when the reviewed PI has no number.
export function nextPi(reviewed: string, options: readonly string[]): string {
  const later = options.filter((pi) => laterPi(pi, reviewed) && piText(piName(pi))).reduce<string | undefined>((next, pi) => !next || laterPi(next, pi) ? pi : next, undefined)
  if (later) return piText(piName(later))
  const name = piText(piName(reviewed))
  return name ? name.replace(/(\d+)$/, (last) => String(Number(last) + 1)) : ''
}

// PIR-25: the PI after the reviewed one from the Azure DevOps iteration tree by its dates. A PI's dates are those of
// its PI-level iteration (the path ending at the PI segment, ATM-30), else the span of the dated iterations under it
// (teams often date only the Sprints). The next PI is the dated PI with a PI number that starts earliest after the
// reviewed PI's start — the first one starting after the reviewed PI ends, or, when the dates overlap, the overlapping
// one. Without the iterations, without the reviewed PI's dates or without a later dated PI, the number order of nextPi
// applies. `note` says which source was used, for the form.
export type NextPi = { pi: string; source: 'dates' | 'number'; note: string }
type PiSpan = { path: string; start: string; finish: string }
const isoDay = (value: string | undefined) => { const day = value?.slice(0, 10) ?? ''; return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : '' }
export function piDates(iterations: readonly AzureIteration[]): Map<string, PiSpan> {
  const own = new Map<string, PiSpan>(), span = new Map<string, PiSpan>()
  for (const iteration of iterations) {
    const pi = piPathOf(iteration.path), start = isoDay(iteration.attributes?.startDate), finish = isoDay(iteration.attributes?.finishDate)
    if (!pi || !start || !finish || finish < start) continue
    const key = pi.toLowerCase()
    if (key === iteration.path.toLowerCase()) { own.set(key, { path: iteration.path, start, finish }); continue }
    const seen = span.get(key)
    span.set(key, seen ? { path: seen.path, start: start < seen.start ? start : seen.start, finish: finish > seen.finish ? finish : seen.finish } : { path: pi, start, finish })
  }
  return new Map([...span, ...own])
}
export function nextPiOf(reviewed: string, iterations: readonly AzureIteration[] | null | undefined, options: readonly string[], { reading = false }: { reading?: boolean } = {}): NextPi {
  const byNumber = (why: string): NextPi => { const pi = nextPi(reviewed, options); return { pi, source: 'number', note: pi ? `${why}: worked out from the PI number.` : '' } }
  if (!reviewed) return { pi: '', source: 'number', note: '' }
  const label = piName(reviewed), name = label.toLowerCase(), path = reviewed.toLowerCase()
  if (!iterations) return byNumber(reading ? 'The PI dates are still being read from Azure DevOps' : 'The PI dates are not read from Azure DevOps here')
  const dates = piDates(iterations)
  const own = dates.get(path) ?? [...dates.values()].find((entry) => piName(entry.path).toLowerCase() === name)
  if (!own) {
    const inTree = iterations.some((iteration) => piPathOf(iteration.path)?.toLowerCase() === path || piName(piPathOf(iteration.path) ?? '').toLowerCase() === name)
    return byNumber(inTree ? `${label} has no dates in Azure DevOps` : `${label} is not in the Azure DevOps iteration tree`)
  }
  const later = [...dates.values()].filter((entry) => piName(entry.path).toLowerCase() !== name && piText(piName(entry.path)) && entry.start > own.start)
    .sort((a, b) => a.start.localeCompare(b.start) || (laterPi(a.path, b.path) ? 1 : laterPi(b.path, a.path) ? -1 : 0))
  const next = later[0]
  if (!next) return byNumber('No later PI with dates in Azure DevOps')
  const overlap = next.start <= own.finish
  return { pi: piText(piName(next.path)), source: 'dates', note: `From Azure DevOps iteration dates: ${piName(next.path)} starts ${formatDate(next.start)}, ${overlap ? `while ${label} runs until ${formatDate(own.finish)} (the PIs overlap)` : `after ${label} ends ${formatDate(own.finish)}`}.` }
}

// PIR-24: who may show another person's Features in My PI Review — a lead with "PI Review: post the review of a
// Feature" (CON-113), who may also post their reviews; everyone else sees their own ('' when they may choose).
export function otherPersonBlock(viewer: Pick<ReviewViewer, 'can'>): string {
  return isReviewLead(viewer) ? '' : 'You see your own Features: showing another person’s needs “PI Review: post the review of a Feature” (a lead). An Admin can change this in Admin → People & roles → Role rights.'
}
// PIR-24: a person chosen by name (a Feature's Assigned To) — with their work email when a fetched item assigned to
// them carries one, so their Features are matched by email where it is known (isMine, as CON-113's assignee rule).
export function personOf(items: readonly Pick<AzureWorkItem, 'assignedTo' | 'assignedToEmail'>[], name: string): Me {
  const wanted = name.trim().toLowerCase()
  const email = items.find((item) => item.assignedTo.trim().toLowerCase() === wanted && item.assignedToEmail?.trim())?.assignedToEmail?.trim().toLowerCase()
  return { name: name.trim(), ...(email ? { email } : {}) }
}

// CON-113, PIR-13: who may post the review of a Feature — a lead ("PI Review: post the review of a Feature") on every
// Feature; the Feature's assignee (their work email is the Feature's Assigned To email) with "Add a comment".
export interface ReviewViewer { can: (action: Action) => boolean; readOnly: boolean; viewingAs: string; email: string; isSample: boolean; config: AzureConfig | null; pat: string }
const sameEmail = (a: string | undefined, b: string | undefined) => Boolean(a?.trim() && b?.trim() && a.trim().toLowerCase() === b.trim().toLowerCase())
export const isReviewLead = (viewer: Pick<ReviewViewer, 'can'>) => viewer.can('pireview.post')
export const isFeatureAssignee = (viewer: Pick<ReviewViewer, 'email'>, feature: Pick<AzureWorkItem, 'assignedToEmail'>) => sameEmail(viewer.email, feature.assignedToEmail)
// PIR-13: why nothing can be posted on this page ('' when posting may be possible): the roles not loaded, View as,
// sample data, no Time Writing connection or PAT, an on-premises server.
export function reviewPageBlock(viewer: ReviewViewer): string {
  if (viewer.readOnly) return writeBlockedReason(true, ['pireview.post'])
  if (viewer.viewingAs) return `Read only while viewing as ${viewer.viewingAs}: nothing is posted to Azure DevOps. Exit View as to post a review.`
  if (viewer.isSample) return 'Synthetic sample data is loaded: nothing is posted to Azure DevOps. Fetch your data first.'
  if (!viewer.config || !viewer.pat.trim()) return 'Connect the Time Writing connection (with its PAT) to post a review.'
  let cloud = false
  try { cloud = isCloudBase(collectionUrl(viewer.config)) } catch { cloud = false }
  if (!cloud) return 'Reviews are posted to Azure DevOps Services (dev.azure.com) only: this connection is on premises and read only.'
  return ''
}
// PIR-13: why this Feature's review cannot be posted ('' when it can): the page's reason, else the right.
export function reviewPostBlock(viewer: ReviewViewer, feature: Pick<AzureWorkItem, 'assignedTo' | 'assignedToEmail'>): string {
  const page = reviewPageBlock(viewer)
  if (page) return page
  if (isReviewLead(viewer)) return ''
  if (!isFeatureAssignee(viewer, feature)) return `Only the Feature’s assignee (${feature.assignedTo.trim() || 'nobody'}) or a lead with “PI Review: post the review of a Feature” can post its review${viewer.email ? '' : ' (enter your work email on the Time Writing connection: the assignee is matched by it)'}. An Admin can change this in Admin → People & roles → Role rights.`
  return viewer.can('work.comment') ? '' : writeBlockedReason(false, ['work.comment'])
}

// PIR-14: a paragraph as comment lines — each non-empty line trimmed; a line starting with a bullet (- * • + –) kept as a
// list item "- …", a numbered line (1. or 1)) kept as it is, any other line kept as a paragraph line.
export function reviewLines(text: string): string[] {
  return text.split(/\r?\n/).map((line) => line.trim().replace(/\s+/g, ' ')).filter(Boolean).map((line) => line.replace(/^[-*•+–][ \t]*(?=\S)/, '- '))
}
// PIR-14: the Move question names the PI it moves to ("Whether the feature needs to be shifted to PI 26.5").
// PIR-19: the heading of the form setup in use, {PI} replaced by the PI.
export const moveQuestion = (pi: string, heading = `Whether the feature needs to be shifted to ${piPlaceholder}`) => heading.replace(piPlaceholder, piText(pi) || 'the next PI')
export const reviewQuestion = 'Advise to discuss the Feature during the Review meeting'
// PIR-13: the decision in words, for the audit, the confirmation and Background jobs — "Move to next PI Yes (to PI 26.5),
// Offline Review" (the advice left out when the form has none).
export const reviewSummary = (form: ReviewForm) => `Move to next PI ${form.move} (to ${form.movePi.trim()})${form.mode.trim() ? `, ${form.mode.trim()}` : ''}`
// PIR-13: what Move to next PI starts with, said in the form (UI-STANDARDS §12: a default that matters is visible).
// PIR-19: the default of the form setup in use (No in the built-in form).
export function moveDefaultNote(setup: PiFormSetup) {
  const value = fieldOf(setup, 'move')?.defaultValue
  return value ? `${fieldOf(setup, 'move')?.label || 'Move to next PI'} is pre-selected ${value}.` : ''
}

// PIR-20: the value of a field of the form (a built-in one by its key, an added one from extra).
export function fieldValue(form: ReviewForm, id: string): string {
  if (id === 'learnings' || id === 'struggles' || id === 'remarks' || id === 'moveReason') return form[id]
  if (id === 'move') return form.move
  if (id === 'review') return form.mode
  return form.extra?.[id] ?? ''
}
export function withFieldValue(form: ReviewForm, id: string, value: string): ReviewForm {
  if (id === 'learnings' || id === 'struggles' || id === 'remarks') return { ...form, [id]: value }
  if (id === 'move') return { ...form, move: value === 'Yes' || value === 'No' ? value : '' }
  if (id === 'review') return { ...form, mode: value }
  return { ...form, extra: { ...form.extra, [id]: value } }
}
// PIR-14: the comment posted — plain lines (sent as text: & < > escaped, line breaks kept, commentHtml), in the standard
// format: "Learnings :", "Struggles :" (each when given), the Move question with its answer and reason, the Review meeting advice,
// "Additional Remarks :" (when given) and the footer line, which the split ignores.
// PIR-19, PIR-20: the fields, their order and their headings are those of the form setup in use: a paragraph as
// "{heading} :" and its lines (left out when empty), a choice as "{heading} : {answer}" (left out when not answered),
// Move to next PI as its heading with the PI, the answer and the reason.
export function buildReviewComment(form: ReviewForm, setup: PiFormSetup = builtInFormSetup()): string {
  const lines = setup.fields.flatMap((field): string[] => {
    if (field.id === 'move') {
      const reason = reviewLines(form.moveReason)
      const first = reason[0]?.replace(/^- /, '')
      return [`${moveQuestion(form.movePi, field.heading)} : ${form.move}${first ? ` - ${first}` : ''}`, ...reason.slice(1)]
    }
    const value = fieldValue(form, field.id)
    if (field.type === 'dropdown') return value.trim() ? [`${field.heading} : ${value.trim()}`] : []
    const paragraph = reviewLines(value)
    return paragraph.length ? [`${field.heading} :`, ...paragraph] : []
  })
  return [...lines, reviewFooter].join('\n')
}

// PIR-14: the comment as PI Review will read it back — sent as Azure DevOps stores it (commentHtml), read as plain text
// (commentText) and split (reviewSplit).
export const readBackReview = (text: string, setup?: PiFormSetup): ReviewSplit => reviewSplit(commentText(commentHtml(text)), setup)
// PIR-13: the form's problems, each naming its field — the required fields, the PI, the length, and any field PI Review
// would read back differently (a line that looks like a heading, e.g. "Issues: …").
export const maxReviewLength = 30_000
// optionalTexts (PIR-18, the Close flow): Learnings and Struggles — every paragraph — may stay empty.
// PIR-19…PIR-21: the fields of the form setup in use — its required fields and its choices — and the read-back of each.
export function reviewFormProblems(form: ReviewForm, { optionalTexts = false, setup = builtInFormSetup() }: { optionalTexts?: boolean; setup?: PiFormSetup } = {}): string[] {
  const problems: string[] = []
  for (const field of setup.fields) {
    const value = fieldValue(form, field.id).trim()
    if (field.id === 'move') {
      if (form.move !== 'Yes' && form.move !== 'No') problems.push(`Choose whether the Feature moves to the next PI (${field.label}): Yes or No.`)
      if (!piText(form.movePi)) problems.push('Enter the PI it moves to as “PI” and its number, e.g. PI 26.5.')
    } else if (field.type === 'longtext') {
      if (field.required && !optionalTexts && !reviewLines(value).length) problems.push(`Enter the ${field.label} (write “None” when there are none).`)
    } else if (value && !field.options.includes(value)) problems.push(`Choose ${field.label}: ${field.options.join(' or ')}.`)
    else if (!value && field.required) problems.push(field.id === 'review' && field.label === 'Advise to discuss the Feature during the Review meeting?' ? 'Choose whether to discuss the Feature during the Review meeting or review it offline.' : `Choose ${field.label}: ${field.options.join(' or ')}.`)
  }
  if (problems.length) return problems
  const text = buildReviewComment(form, setup)
  if (text.length > maxReviewLength) return [`The review is too long (${text.length.toLocaleString()} characters; at most ${maxReviewLength.toLocaleString()}).`]
  const differs = readBackDiffers(form, setup, readBackReview(text, setup))
  if (differs.length) problems.push(`PI Review would read ${differs.join(', ')} back differently: a line looks like a heading (e.g. “Issues:”, “Next PI:” or “Remarks”). Reword that line, e.g. without the colon.`)
  return problems
}
// PIR-14, PIR-21: the fields the split reads back differently from what the form holds (by their labels).
function readBackDiffers(form: ReviewForm, setup: PiFormSetup, back: ReviewSplit): string[] {
  const expected = (value: string) => tidyReviewText(reviewLines(value).join('\n'))
  return setup.fields.filter((field) => {
    if (field.id === 'move') {
      const [first = '', ...rest] = reviewLines(form.moveReason)
      const reason = [first.replace(/^- /, ''), tidyReviewText(rest.join('\n'))].filter(Boolean).join('\n')
      return back.moveValue !== form.move || (back.moveRest ?? '') !== reason || back.movePi !== piText(form.movePi)
    }
    const value = fieldValue(form, field.id)
    const read = field.id === 'learnings' || field.id === 'struggles' || field.id === 'remarks' || field.id === 'review' ? back[field.id] ?? '' : back.extra?.[field.id] ?? ''
    return read !== (field.type === 'dropdown' ? value.trim() : expected(value))
  }).map((field) => field.id === 'move' ? 'Move to next PI' : field.id === 'review' && field.label === 'Advise to discuss the Feature during the Review meeting?' ? 'Review meeting' : field.label)
}

// PIR-21: the read-back check of a form setup — a sample review with every field filled (each choice with each of its
// options in turn) is built, sent as Azure DevOps stores it and split again with the setup's headings: every field must
// come back as written. Together with setupProblems (the shape, empty, duplicate and colliding headings, the limits).
export function formSetupProblems(setup: PiFormSetup): string[] {
  const shape = setupProblems(setup)
  if (shape.length) return shape
  const rounds = Math.max(1, ...setup.fields.map((field) => field.type === 'dropdown' ? field.options.length : 1))
  const differs = new Set<string>()
  for (let round = 0; round < rounds; round += 1) {
    let form: ReviewForm = { ...emptyReviewForm('PI 26.5', setup), move: round % 2 ? 'Yes' : 'No', moveReason: round % 2 ? 'sample reason\n- second point' : '' }
    for (const [index, field] of setup.fields.entries()) {
      if (field.id === 'move') continue
      form = withFieldValue(form, field.id, field.type === 'dropdown' ? field.options[round % field.options.length] : `Sample answer ${index + 1}\n- sample point ${index + 1}`)
    }
    for (const field of readBackDiffers(form, setup, readBackReview(buildReviewComment(form, setup), setup))) differs.add(field)
  }
  return differs.size ? [`A review written with this form would not be read back as written: ${[...differs].join(', ')}. A heading probably contains or looks like another field's heading; change it.`] : []
}

// PIR-13: the form prefilled from the Feature's latest review comment split by its headings (a correction starts from
// what was posted); Partly (from an older comment) is not offered, so Move starts at No (the caller says so). Otherwise
// the empty form (Move No).
// PIR-19, PIR-20: only the fields of the form setup in use; a choice takes the answer written when it is one of its
// options (letter case ignored; the advice also by its normalized value), else its default.
export function reviewFormFrom(split: ReviewSplit | undefined, movePi: string, setup: PiFormSetup = builtInFormSetup()): ReviewForm {
  const empty = emptyReviewForm(movePi, setup)
  if (!split || split.from !== 'Headings') return empty
  const option = (field: PiFormField, ...written: (string | undefined)[]) => { for (const text of written) { const found = field.options.find((entry) => entry.toLowerCase() === (text ?? '').trim().toLowerCase()); if (found) return found } return field.defaultValue }
  let form: ReviewForm = { ...empty, move: split.moveValue === 'Yes' ? 'Yes' : 'No', moveReason: split.moveValue ? split.moveRest ?? '' : split.move ?? '', movePi: split.movePi ?? movePi }
  for (const field of setup.fields) {
    if (field.id === 'move') continue
    const written = field.id === 'learnings' || field.id === 'struggles' || field.id === 'remarks' || field.id === 'review' ? split[field.id] : split.extra?.[field.id]
    form = withFieldValue(form, field.id, field.type === 'dropdown' ? option(field, written, field.id === 'review' ? split.reviewMode : undefined) : written ?? '')
  }
  return form
}

// PIR-13: post the review as a new comment on the Feature (the add-comment write, with the Feature's Assigned To email
// for the rights check, CON-113). Returns the new comment's ID.
export async function postReview(config: AzureConfig, pat: string, feature: Pick<AzureWorkItem, 'id' | 'assignedToEmail'>, text: string, transport: AzureTransport = requestAzure): Promise<number> {
  if (!text.trim() || text.length > maxReviewLength) throw new Error('The review is empty or too long. Nothing was posted.')
  const response = await transport({ ...config, pat, operation: 'add-comment', workItemId: feature.id, comment: text, reviewOf: feature.assignedToEmail ?? '' }) as { id?: unknown }
  if (typeof response?.id !== 'number') throw new Error(`The review on #${feature.id} could not be confirmed. Check the Discussion in Azure DevOps before posting again.`)
  return response.id
}

// PIR-05, PIR-13: read one Feature's Discussion into PI Review's memory (the error kept for the drawer and the table).
export async function readDiscussionInto(config: AzureConfig, pat: string, item: Pick<AzureWorkItem, 'key' | 'id'>) {
  setDiscussion(item.key, { state: 'loading' })
  try { const { comments, capped } = await readDiscussion(config, pat, item.id); setDiscussion(item.key, { state: 'done', comments, capped, readAt: new Date().toISOString() }) }
  catch (failure) { setDiscussion(item.key, { state: 'error', error: failure instanceof Error ? failure.message : 'Could not read the Discussion.' }); throw failure }
}
// PIR-17: the PI of a Feature (its Iteration Path's PI part), for the Move question's next PI.
export { piPathOf as featurePi } from './myWork.ts'

// PIR-17: my latest review — the newest comment written by me (author = my name, ignoring case) split by headings.
export function myReviewOf(comments: WorkItemComment[], name: string | undefined, setup?: PiFormSetup): { comment: WorkItemComment; split: ReviewSplit } | undefined {
  const me = name?.trim().toLowerCase()
  if (!me) return undefined
  for (const comment of comments) { // newest first
    if (comment.author.trim().toLowerCase() !== me) continue
    const split = reviewSplit(comment.text, setup)
    if (split.from === 'Headings') return { comment, split }
  }
  return undefined
}
