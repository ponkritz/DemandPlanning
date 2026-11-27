// PI Review form setup (PIR-19…PIR-24, CON-114): the fields of the "Write review…" form — their order, label, the
// heading written in the comment, type (paragraph or choice), options, required, default and help — shared in the Git
// data repository as pi-review-form.json, queued and merged like the other shared setup (GIT-17), read strictly, and
// changed by the roles with "PI Review: set up the review form" (Scrum Master and Tool Owner by default). Without the
// file the built-in form applies (the form of PIR-13). The field "Move to next PI" keeps its special behaviour: Yes /
// No, the PI it moves to ({PI} in its heading) and the reason; it can be relabelled but not removed.
import { mergeKeyed, merge3, type Merge } from './gitSaveQueue.ts'
import { builtInSectionOf, piPlaceholder, reviewedPiPlaceholder } from './piReview.ts'
import { writeBlockedReason } from './access.ts'
import { columnsError, typeLabel, type ColumnDraft, type OnDemandType } from './onDemand.ts'
import { meetingSettingsProblems, parseMeetingSettings, sameMeetingSettings, serializeMeetingSettings, type MeetingSettings } from './piMeetingSettings.ts'

export const piFormFile = 'pi-review-form.json'
export const piFormKind = 'pi-review-form'
// PIR-22: the types are those of the On-Demand columns (OND-05), so the fields share their editor: a paragraph is
// Long text ('longtext'), a choice is Dropdown (one value) ('dropdown').
export type PiFieldType = Extract<OnDemandType, 'longtext' | 'dropdown'>
export const piFieldTypes: { key: PiFieldType; label: string }[] = [{ key: 'longtext', label: typeLabel('longtext') }, { key: 'dropdown', label: typeLabel('dropdown') }]
export const isChoice = (field: Pick<PiFormField, 'type'>) => field.type === 'dropdown'
export type BuiltInFieldId = 'learnings' | 'struggles' | 'move' | 'review' | 'remarks'
export const builtInFieldIds: readonly BuiltInFieldId[] = ['learnings', 'struggles', 'move', 'review', 'remarks']
export const isBuiltInField = (id: string): id is BuiltInFieldId => (builtInFieldIds as readonly string[]).includes(id)
export interface PiFormField { id: string; label: string; heading: string; type: PiFieldType; options: string[]; required: boolean; defaultValue: string; help: string }
// PIR-33: reviewStart — "PI Review starts from" (YYYY-MM-DD): PIs that ended before it are not offered and comments
// before it are ignored; missing in older files (and without the file), then defaultReviewStart applies.
// PIR-58: meeting — the Meeting presentation settings (piMeetingSettings.ts); a file holding them is schema 2, one without
// them stays schema 1 (so an older app still reads it), and a schema 1 file loads with the default settings.
export interface PiFormSetup { schema: 1 | 2; kind: typeof piFormKind; fields: PiFormField[]; reviewStart?: string; meeting?: MeetingSettings; changedAt?: string; changedBy?: string }
// PIR-33: the default start (21 Sep 2026), defined with the Discussions it filters.
export { defaultReviewStart } from './piReview.ts'
// PIR-33: a calendar day written YYYY-MM-DD (a real day of 2000…2099).
export const isReviewStartDay = (value: unknown): value is string => typeof value === 'string' && /^20\d{2}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value

// PIR-22: the limits of the setup.
export const maxFormFields = 15
export const maxOptions = 10
export const maxLabel = 80
export const maxHeading = 100
export const maxOption = 60
export const maxHelp = 200
export const moveOptions = ['Yes', 'No'] as const
export const listHelp = 'One point per line; start a line with - or 1. for a list.'
// The built-in type of each built-in field: Learnings, Struggles and Additional Remarks are paragraphs; Move to next PI
// and the Review meeting advice are choices.
export const builtInType: Record<BuiltInFieldId, PiFieldType> = { learnings: 'longtext', struggles: 'longtext', move: 'dropdown', review: 'dropdown', remarks: 'longtext' }

// PIR-19: the built-in form — exactly the form and comment of PIR-13 and PIR-14 (Move to next PI = No pre-selected).
// PIR-28: Learnings and Struggles name the reviewed PI ("Learnings of PI 26.4:"; "Learnings" when it is not known).
export const builtInFields = (): PiFormField[] => [
  { id: 'learnings', label: 'Learnings', heading: `Learnings of ${reviewedPiPlaceholder}`, type: 'longtext', options: [], required: true, defaultValue: '', help: listHelp },
  { id: 'struggles', label: 'Struggles', heading: `Struggles of ${reviewedPiPlaceholder}`, type: 'longtext', options: [], required: true, defaultValue: '', help: listHelp },
  { id: 'move', label: 'Move to next PI', heading: `Whether the feature needs to be shifted to ${piPlaceholder}`, type: 'dropdown', options: [...moveOptions], required: true, defaultValue: 'No', help: '' },
  { id: 'review', label: 'Advise to discuss the Feature during the Review meeting?', heading: 'Advise to discuss the Feature during the Review meeting', type: 'dropdown', options: ['Discuss during Meeting', 'Offline Review'], required: true, defaultValue: '', help: '' },
  { id: 'remarks', label: 'Additional Remarks', heading: 'Additional Remarks', type: 'longtext', options: [], required: false, defaultValue: '', help: 'Anything else for the review.' },
]
export const builtInFormSetup = (): PiFormSetup => ({ schema: 1, kind: piFormKind, fields: builtInFields() })
// One shared instance of the built-in form, for the pages (a split is cached per comment and setup).
export const builtInSetup: PiFormSetup = builtInFormSetup()
export const fieldOf = (setup: PiFormSetup, id: string) => setup.fields.find((field) => field.id === id)
export const customFields = (setup: PiFormSetup) => setup.fields.filter((field) => !isBuiltInField(field.id))
// A new field's id: "f-" and a short unique part.
export const customIdPattern = /^f-[a-z0-9]{1,20}$/
export function newFieldId(taken: readonly string[]) { for (let index = taken.length + 1; ; index += 1) { const id = `f-${index}`; if (!taken.includes(id)) return id } }

// PIR-21: a heading compared with another — letter case, spaces and a final "?" ignored; {PI} as one PI.
const headingKey = (heading: string) => heading.trim().replace(/\s+/g, ' ').replace(/\s*\?$/, '').replace(piPlaceholder, 'PI 1').replace(reviewedPiPlaceholder, 'PI 1').toLowerCase()
const fieldName: Record<BuiltInFieldId, string> = { learnings: 'Learnings', struggles: 'Struggles', move: 'Move to next PI', review: 'the Review meeting advice', remarks: 'Additional Remarks' }

// PIR-21, PIR-22: the problems of a setup, each naming the field — the shape (limits, types, options, default), empty or
// duplicate headings, a heading that collides with another field (one that older reviews already use for another field,
// e.g. "Issues" is read as Struggles), and Move to next PI with {PI} once. The read-back check of the comment comes on
// top (formSetupProblems, piReviewPost.ts).
export function setupProblems(setup: PiFormSetup): string[] {
  // OND-05: the checks shared with the On-Demand columns (names, options) first.
  const shared = columnsError(fieldDrafts(setup.fields), 'field')
  const problems: string[] = shared ? [shared] : []
  const fields = setup.fields
  if (!fields.length) problems.push('The form needs at least Move to next PI.')
  if (fields.length > maxFormFields) problems.push(`The form has ${fields.length} fields; at most ${maxFormFields}.`)
  if (setup.reviewStart !== undefined && !isReviewStartDay(setup.reviewStart)) problems.push(`PI Review starts from: “${setup.reviewStart}” is not a date (YYYY-MM-DD).`)
  if (setup.meeting) problems.push(...meetingSettingsProblems(setup.meeting))
  if (!fields.some((field) => field.id === 'move')) problems.push('Move to next PI cannot be removed: it is the PI decision PI Review filters by.')
  const ids = new Set<string>(), headings = new Map<string, string>()
  for (const [index, field] of fields.entries()) {
    const name = field.label.trim() || `Field ${index + 1}`
    if (ids.has(field.id)) problems.push(`${name}: the field is in the form twice.`)
    ids.add(field.id)
    if (!isBuiltInField(field.id) && !customIdPattern.test(field.id)) problems.push(`${name}: the field id “${field.id}” is not valid.`)
    if (field.label.length > maxLabel) problems.push(`${name}: the label is longer than ${maxLabel} characters.`)
    if (field.help.length > maxHelp) problems.push(`${name}: the help text is longer than ${maxHelp} characters.`)
    if (/[\r\n]/.test(field.label) || /[\r\n]/.test(field.help)) problems.push(`${name}: the label and the help text are one line each.`)
    // The heading: written as "{heading} :" at the start of a line, so it starts with a letter and holds no colon, line
    // break, # or bold marker; unique (ignoring letter case and spaces).
    const heading = field.heading.trim()
    if (!heading) problems.push(`${name}: enter the heading written in the comment.`)
    else if (heading.length > maxHeading) problems.push(`${name}: the heading is longer than ${maxHeading} characters.`)
    else if (!/^\p{L}/u.test(heading) || /[:\r\n#*_<>]/.test(heading)) problems.push(`${name}: the heading “${heading}” must start with a letter and hold no colon, line break, #, *, _, < or >.`)
    else if (!/[\p{L}\p{N}]$|\?$|\)$/u.test(heading.replace(piPlaceholder, 'PI').replaceAll(reviewedPiPlaceholder, 'PI'))) problems.push(`${name}: the heading “${heading}” must end with a letter, a digit, “?” or “)”.`)
    else {
      const key = headingKey(heading)
      const other = headings.get(key)
      if (other) problems.push(`${name}: the heading “${heading}” is also the heading of ${other}. Each field needs its own heading.`)
      else headings.set(key, name)
      const count = heading.split(piPlaceholder).length - 1
      if (field.id === 'move' && count !== 1) problems.push(`${name}: the heading must contain ${piPlaceholder} once, where the PI it moves to is written (e.g. “Whether the feature needs to be shifted to ${piPlaceholder}”).`)
      if (field.id !== 'move' && count) problems.push(`${name}: only the Move to next PI heading may contain ${piPlaceholder}.`)
      // PIR-28: the reviewed PI at most once, and with a word of the heading besides it.
      const reviewed = heading.split(reviewedPiPlaceholder).length - 1
      if (reviewed > 1) problems.push(`${name}: the heading may contain ${reviewedPiPlaceholder} (the reviewed PI) once only.`)
      else if (reviewed && !heading.replace(reviewedPiPlaceholder, '').replace(/\b(?:of|for|in)\b/gi, '').trim()) problems.push(`${name}: the heading needs words besides ${reviewedPiPlaceholder}.`)
      // PIR-21: a heading older reviews already use for another field would read those reviews into this field.
      const reads = builtInSectionOf(heading.replace(piPlaceholder, 'PI 1').replace(reviewedPiPlaceholder, 'PI 1'))
      if (reads && reads !== field.id) problems.push(`${name}: the heading “${heading}” is already read as ${fieldName[reads]} (one of its headings), so reviews written with it would land in the wrong column. Choose another heading.`)
    }
    // The type: a built-in field keeps its own; Move to next PI is Yes / No, required.
    if (field.type !== 'longtext' && field.type !== 'dropdown') problems.push(`${name}: the type must be ${typeLabel('longtext')} or ${typeLabel('dropdown')}.`)
    if (isBuiltInField(field.id) && field.type !== builtInType[field.id]) problems.push(`${name}: a built-in field keeps its type (${typeLabel(builtInType[field.id])}).`)
    if (field.id === 'move' && (field.options.join('|') !== moveOptions.join('|') || !field.required)) problems.push(`${name}: Move to next PI is always Yes / No and required.`)
    if (field.type === 'dropdown') {
      const options = field.options.map((option) => option.trim())
      if (options.length < 2) problems.push(`${name}: a ${typeLabel('dropdown')} field needs at least two options.`)
      if (options.length > maxOptions) problems.push(`${name}: at most ${maxOptions} options.`)
      if (options.some((option) => option.length > maxOption)) problems.push(`${name}: an option is longer than ${maxOption} characters.`)
      if (options.some((option) => /[:\r\n<>]/.test(option) || /^[-*•+–]|^\d{1,2}[.)]/.test(option))) problems.push(`${name}: an option must not hold a colon, a line break, < or >, nor start with a bullet or a number.`)
      if (field.defaultValue && !options.includes(field.defaultValue)) problems.push(`${name}: the default “${field.defaultValue}” is not one of its options.`)
    } else {
      if (field.options.length) problems.push(`${name}: a ${typeLabel('longtext')} field has no options.`)
      if (field.defaultValue) problems.push(`${name}: a ${typeLabel('longtext')} field has no default.`)
    }
  }
  return problems
}

// ---- the file: strict reader, writer, merge (PIR-19, GIT-17) ----
const record = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
const text = (value: unknown) => typeof value === 'string' ? value : ''
// The strict reader: anything that is not a valid setup is refused as a whole with the reason (the form in use stays as
// it was); a valid one is returned cleaned (trimmed texts, options as listed).
export function parsePiFormSetup(source: string): PiFormSetup {
  let raw: unknown
  try { raw = JSON.parse(source) } catch { throw new Error(`${piFormFile} is not valid JSON.`) }
  const input = record(raw)
  if (!input || (input.schema !== 1 && input.schema !== 2) || input.kind !== piFormKind || !Array.isArray(input.fields)) throw new Error(`${piFormFile} is not a PI Review form setup (schema 1 or 2, kind “${piFormKind}”, fields).`)
  if (input.schema === 1 && input.meeting !== undefined) throw new Error(`${piFormFile}: a schema 1 file has no meeting settings (they need schema 2).`)
  const fields = input.fields.map((entry, index): PiFormField => {
    const field = record(entry)
    if (!field) throw new Error(`${piFormFile}: field ${index + 1} is not an object.`)
    if (typeof field.id !== 'string' || (field.type !== 'longtext' && field.type !== 'dropdown')) throw new Error(`${piFormFile}: field ${index + 1} has no id or no type (longtext or dropdown).`)
    if (field.options !== undefined && !(Array.isArray(field.options) && field.options.every((option) => typeof option === 'string'))) throw new Error(`${piFormFile}: the options of field ${index + 1} are not a list of texts.`)
    return { id: field.id, label: text(field.label).trim(), heading: text(field.heading).trim(), type: field.type, options: ((field.options as string[] | undefined) ?? []).map((option) => option.trim()), required: field.required === true, defaultValue: text(field.defaultValue).trim(), help: text(field.help).trim() }
  })
  if (input.reviewStart !== undefined && !isReviewStartDay(input.reviewStart)) throw new Error(`${piFormFile}: reviewStart (PI Review starts from) is not a date written YYYY-MM-DD.`)
  const meeting = input.meeting === undefined ? undefined : parseMeetingSettings(input.meeting, piFormFile)
  const setup: PiFormSetup = { schema: meeting ? 2 : 1, kind: piFormKind, fields, ...(typeof input.reviewStart === 'string' ? { reviewStart: input.reviewStart } : {}), ...(meeting ? { meeting } : {}), ...(typeof input.changedAt === 'string' && input.changedAt ? { changedAt: input.changedAt } : {}), ...(typeof input.changedBy === 'string' && input.changedBy.trim() ? { changedBy: input.changedBy.trim().slice(0, 200) } : {}) }
  const problems = setupProblems(setup)
  if (problems.length) throw new Error(`${piFormFile} cannot be used: ${problems.join(' ')}`)
  return setup
}
export function serializePiFormSetup(setup: PiFormSetup): string {
  const fields = setup.fields.map((field) => ({ id: field.id, label: field.label.trim(), heading: field.heading.trim(), type: field.type, ...(field.type === 'dropdown' ? { options: field.options.map((option) => option.trim()) } : {}), required: field.required, ...(field.defaultValue ? { defaultValue: field.defaultValue } : {}), ...(field.help.trim() ? { help: field.help.trim() } : {}) }))
  // PIR-58: schema 2 only when the meeting settings differ from the defaults.
  const meeting = setup.meeting ? serializeMeetingSettings(setup.meeting) : undefined
  return `${JSON.stringify({ schema: meeting ? 2 : 1, kind: piFormKind, fields, ...(setup.reviewStart ? { reviewStart: setup.reviewStart } : {}), ...(meeting ? { meeting } : {}), ...(setup.changedAt ? { changedAt: setup.changedAt } : {}), ...(setup.changedBy ? { changedBy: setup.changedBy } : {}) }, null, 2)}\n`
}
const safeParse = (source: string | null) => { if (!source) return null; try { return parsePiFormSetup(source) } catch { return null } }
// GIT-17: two saves of the form setup meanwhile — the fields by id (both sides' changes kept; where both changed one
// field, the later save wins), the order of the side that changed it (the later one when both did), fields only one side
// has added kept at the end. A merge that is not a valid setup (e.g. both added the same heading) keeps the later save.
export const mergePiFormText: Merge = (baseText, mineText, theirsText, mineLater) => {
  const base = safeParse(baseText), mine = safeParse(mineText), theirs = safeParse(theirsText)
  if (!mine || !theirs) return mineText
  const byId = (setup: PiFormSetup | null) => setup ? Object.fromEntries(setup.fields.map((field) => [field.id, field])) : null
  const fields = mergeKeyed(byId(base), byId(mine)!, byId(theirs)!, mineLater)
  const order = merge3(base?.fields.map((field) => field.id), mine.fields.map((field) => field.id), theirs.fields.map((field) => field.id), mineLater) ?? mine.fields.map((field) => field.id)
  const ordered = [...order.filter((id) => fields[id]), ...Object.keys(fields).filter((id) => !order.includes(id))]
  const later = mineLater ? mine : theirs
  // PIR-33: the start date of the side that changed it (the later save when both did).
  const reviewStart = mine.reviewStart === theirs.reviewStart ? mine.reviewStart : mine.reviewStart === base?.reviewStart ? theirs.reviewStart : theirs.reviewStart === base?.reviewStart ? mine.reviewStart : later.reviewStart
  // PIR-58: the meeting settings of the side that changed them (the later save when both did).
  const meeting = sameMeetingSettings(mine.meeting, theirs.meeting) ? mine.meeting : sameMeetingSettings(mine.meeting, base?.meeting) ? theirs.meeting : sameMeetingSettings(theirs.meeting, base?.meeting) ? mine.meeting : later.meeting
  const merged: PiFormSetup = { schema: meeting ? 2 : 1, kind: piFormKind, fields: ordered.map((id) => fields[id]), ...(reviewStart ? { reviewStart } : {}), ...(meeting ? { meeting } : {}), ...(later.changedAt ? { changedAt: later.changedAt } : {}), ...(later.changedBy ? { changedBy: later.changedBy } : {}) }
  try { return serializePiFormSetup(parsePiFormSetup(serializePiFormSetup(merged))) } catch { return mineLater ? mineText : theirsText }
}

// ---- who may change it (CON-114) ----
// PIR-31: why the viewer cannot change the form setup ('' when they can): View as, the roles not loaded (CON-101), the
// permission, the synthetic sample, Git storage (not connected, a read-only token), the file unreadable or still loading.
export interface FormSetupViewer { viewingAs: string; readOnly: boolean; can: (action: 'pireview.setup') => boolean }
export interface FormSetupGit { connected: boolean; readOnly: boolean; isSample: boolean }
export function formSetupBlock(viewer: FormSetupViewer, git: FormSetupGit, state: { loaded: boolean; error: string }): string {
  if (viewer.viewingAs) return `Read only while viewing as ${viewer.viewingAs}: nothing is saved to Git. Exit View as to change the PI Review form.`
  if (viewer.readOnly) return writeBlockedReason(true, ['pireview.setup'], 'in the PI Review form')
  if (!viewer.can('pireview.setup')) return `${writeBlockedReason(false, ['pireview.setup'])} Scrum Masters and Tool Owners set up the form.`
  if (git.isSample) return 'Synthetic sample data is loaded: the PI Review form is not saved to Git. Fetch your data first.'
  if (!git.connected) return 'Connect Git storage (Admin → Data & history) to change the PI Review form; it is shared through Git.'
  if (git.readOnly) return 'View only: your Git token can read but not save.'
  if (state.error) return `${piFormFile} could not be read from Git, so the form cannot be changed here: ${state.error}`
  if (!state.loaded) return 'The PI Review form is still being read from Git.'
  return ''
}

// PIR-30: the ⚙ PI Review Setup button in the headers of My PI Review and PI Review — shown exactly when Admin → Feature & PI setup → PI
// Review form is among the viewer's sections (PIR-29, SET-27): to a holder of "PI Review: set up the review form" (decided by the
// permission, so Role rights changes count; Scrum Master and Tool Owner by default). In View as it follows the viewed
// role, as the menu does, and with the synthetic sample it stays, as the menu entries do; the page then opens read only
// with the reason (PIR-31). Nobody without the right, and nobody before the roles file is loaded (CON-101), sees it.
export const setupGearLabel = 'PI Review Setup'
export function showsSetupGear(viewer: { can: (action: 'pireview.setup') => boolean }): boolean {
  return viewer.can('pireview.setup')
}

// PIR-22: what changed between two setups, for the commit message and the Background jobs entry.
export function setupChanges(before: PiFormSetup, after: PiFormSetup): string[] {
  const was = new Map(before.fields.map((field) => [field.id, field]))
  const now = new Map(after.fields.map((field) => [field.id, field]))
  const changes = [
    ...after.fields.filter((field) => !was.has(field.id)).map((field) => `added ${field.label}`),
    ...before.fields.filter((field) => !now.has(field.id)).map((field) => `removed ${field.label}`),
    ...after.fields.filter((field) => was.has(field.id) && JSON.stringify({ ...field }) !== JSON.stringify({ ...was.get(field.id) })).map((field) => `changed ${field.label}`),
  ]
  const order = (setup: PiFormSetup, keep: Map<string, PiFormField>) => setup.fields.filter((field) => keep.has(field.id)).map((field) => field.id).join('|')
  if (order(before, now) !== order(after, was)) changes.push('new order')
  return changes
}

// PIR-22: the fields as the shared column-list editor's drafts (OND-05) and back — label as the name, help as the
// description; the heading and the default are kept by the editor beside them.
export const fieldDrafts = (fields: PiFormField[]): ColumnDraft[] => fields.map((field) => ({ id: field.id, name: field.label, type: field.type, required: field.required, options: field.options.map((label) => ({ label, was: label })), description: field.help }))
export function fieldsOf(drafts: ColumnDraft[], extras: Record<string, { heading: string; defaultValue: string }>): PiFormField[] {
  return drafts.map((draft) => {
    const type: PiFieldType = draft.type === 'dropdown' ? 'dropdown' : 'longtext'
    const options = type === 'dropdown' ? draft.options.map((option) => option.label.trim()) : []
    const extra = extras[draft.id] ?? { heading: draft.name, defaultValue: '' }
    return { id: draft.id, label: draft.name.trim(), heading: extra.heading.trim(), type, options, required: draft.required, defaultValue: type === 'dropdown' && options.includes(extra.defaultValue) ? extra.defaultValue : '', help: (draft.description ?? '').trim() }
  })
}
