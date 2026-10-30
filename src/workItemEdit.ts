import { timeWritingMonth, isTimeWritingStory } from './azureInsights.ts'

// Editing an existing Feature, User Story or Task (the Edit form on Backlogs and Assigned to Me). Only these fields can
// change; Work Item Type, Parent and Area Path never do (the Area Path stays the parent's), the Time Writing story and
// a month Task stay where they are (the project root), and a month Task keeps the month in its title. Every edit is
// sent with the revision it was read at, so a change made in Azure DevOps meanwhile is never overwritten.
export interface WorkItemEdit {
  title?: string
  description?: string
  acceptanceCriteria?: string
  assignedTo?: string
  iterationPath?: string
  state?: string
  storyPoints?: number
  priority?: number
  risk?: string
  valueArea?: string
  targetDate?: string
  originalEstimate?: number
  completedWork?: number
  tags?: string
}
export const editableTypes = ['Feature', 'User Story', 'Task'] as const
// The states offered (Agile process); the current state is always offered too.
export const statesFor = (type: string) => type === 'Task' ? ['New', 'Active', 'Closed'] : ['New', 'Active', 'Resolved', 'Closed']
const risks = ['1 - High', '2 - Medium', '3 - Low'], valueAreas = ['Business', 'Architectural']
const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
const hours = (value: number) => Number.isFinite(value) && value >= 0 && value <= 1_000_000

// '' when every value in the edit is acceptable, else why not. The desktop proxy checks the same (electron/azure-devops.cjs).
export function editProblem(edit: WorkItemEdit) {
  const keys = Object.keys(edit).filter((key) => edit[key as keyof WorkItemEdit] !== undefined)
  if (!keys.length) return 'Nothing to change.'
  const allowed = ['title', 'description', 'acceptanceCriteria', 'assignedTo', 'iterationPath', 'state', 'storyPoints', 'priority', 'risk', 'valueArea', 'targetDate', 'originalEstimate', 'completedWork', 'tags']
  if (keys.some((key) => !allowed.includes(key))) return 'Only the listed fields can be changed.'
  if (edit.title != null && (typeof edit.title !== 'string' || !edit.title.trim() || edit.title.trim().length > 255)) return 'Enter a title of 1–255 characters.'
  for (const field of ['description', 'acceptanceCriteria'] as const) if (edit[field] != null && (typeof edit[field] !== 'string' || edit[field]!.length > 100_000)) return 'The text is too long.'
  if (edit.assignedTo != null && (typeof edit.assignedTo !== 'string' || !isEmail(edit.assignedTo))) return 'Assigned to must be an email.'
  if (edit.iterationPath != null && (typeof edit.iterationPath !== 'string' || !edit.iterationPath.trim() || edit.iterationPath.length > 4096 || /\p{Cc}/u.test(edit.iterationPath))) return 'Invalid iteration path.'
  if (edit.state != null && (typeof edit.state !== 'string' || !edit.state.trim() || edit.state.length > 64 || !/^[\p{L}\p{N} _-]+$/u.test(edit.state))) return 'Invalid state.'
  if (edit.storyPoints != null && (typeof edit.storyPoints !== 'number' || !Number.isFinite(edit.storyPoints) || edit.storyPoints < 0 || edit.storyPoints > 1000)) return 'Story Points must be a number from 0 to 1,000.'
  if (edit.priority != null && ![1, 2, 3, 4].includes(edit.priority)) return 'Priority must be 1, 2, 3 or 4.'
  if (edit.risk != null && !risks.includes(edit.risk) && edit.risk !== '') return 'Risk must be 1 - High, 2 - Medium or 3 - Low.'
  if (edit.valueArea != null && !valueAreas.includes(edit.valueArea)) return 'Value area must be Business or Architectural.'
  if (edit.targetDate != null && edit.targetDate !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(edit.targetDate)) return 'Invalid target date.'
  for (const field of ['originalEstimate', 'completedWork'] as const) if (edit[field] != null && (typeof edit[field] !== 'number' || !hours(edit[field]!))) return 'Original Estimate and Completed Work must be numbers from 0 to 1,000,000 hours.'
  if (edit.tags != null && (typeof edit.tags !== 'string' || edit.tags.length > 100_000)) return 'Invalid tags.'
  return ''
}

const htmlText = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('\n', '<br>')
// The JSON patch of an edit: first a test of the revision (Azure DevOps refuses the patch when the item changed since),
// then only the fields in the edit. Text fields are sent as HTML text (no markup from the user); a blank Target date or
// Risk removes the value.
export function editPatch(edit: WorkItemEdit, rev: number) {
  const patch: { op: string; path: string; value?: unknown }[] = [{ op: 'test', path: '/rev', value: rev }]
  const set = (field: string, value: unknown) => patch.push({ op: 'add', path: `/fields/${field}`, value })
  if (edit.title != null) set('System.Title', edit.title.trim())
  if (edit.description != null) set('System.Description', htmlText(edit.description))
  if (edit.acceptanceCriteria != null) set('Microsoft.VSTS.Common.AcceptanceCriteria', htmlText(edit.acceptanceCriteria))
  if (edit.assignedTo != null) set('System.AssignedTo', edit.assignedTo.trim().toLowerCase())
  if (edit.iterationPath != null) set('System.IterationPath', edit.iterationPath.trim())
  if (edit.state != null) set('System.State', edit.state.trim())
  if (edit.storyPoints != null) set('Microsoft.VSTS.Scheduling.StoryPoints', edit.storyPoints)
  if (edit.priority != null) set('Microsoft.VSTS.Common.Priority', edit.priority)
  if (edit.risk != null) { if (edit.risk) set('Microsoft.VSTS.Common.Risk', edit.risk); else patch.push({ op: 'remove', path: '/fields/Microsoft.VSTS.Common.Risk' }) }
  if (edit.valueArea != null) set('Microsoft.VSTS.Common.ValueArea', edit.valueArea)
  if (edit.targetDate != null) { if (edit.targetDate) set('Microsoft.VSTS.Scheduling.TargetDate', `${edit.targetDate}T00:00:00Z`); else patch.push({ op: 'remove', path: '/fields/Microsoft.VSTS.Scheduling.TargetDate' }) }
  if (edit.originalEstimate != null) set('Microsoft.VSTS.Scheduling.OriginalEstimate', edit.originalEstimate)
  if (edit.completedWork != null) set('Microsoft.VSTS.Scheduling.CompletedWork', edit.completedWork)
  if (edit.tags != null) set('System.Tags', edit.tags)
  return patch
}

// A rich-text field as editable text: one line per line break, a blank line between paragraphs, the tags removed and
// the common entities decoded. Formatting made in Azure DevOps (bold, lists, tables) is not kept when the field is saved.
const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
export function editableText(html: string | undefined) {
  if (!html) return ''
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
      if (code[0] !== '#') return entities[code.toLowerCase()] ?? match
      const point = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return Number.isFinite(point) && point >= 0 && point <= 0x10ffff ? String.fromCodePoint(point) : match
    })
    .split('\n').map((line) => line.replace(/[ \t]+/g, ' ').trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n').trim()
}
// A Feature's Description as its DoD ("Feature DoD: …", the first paragraph) and the rest; joined back the same way.
export function splitDoD(text: string) {
  const [first, ...rest] = text.split(/\n\n/)
  const match = /^\s*feature\s+dod\s*:\s*([\s\S]*)$/i.exec(first ?? '')
  return match ? { dod: match[1].trim(), rest: rest.join('\n\n').trim() } : { dod: '', rest: text.trim() }
}
export const joinDoD = (dod: string, rest: string) => [`Feature DoD: ${dod.trim()}`, rest.trim()].filter((part) => part && part !== 'Feature DoD: ').join('\n\n')

// What the edit form locks for an item: the iteration of the Time Writing story and of a month Task (project root),
// the month in a month Task's title.
export function editLocks(item: { workItemType: string; title: string }) {
  const monthTask = item.workItemType === 'Task' ? timeWritingMonth(item.title) : undefined
  const timeWritingStory = isTimeWritingStory(item)
  return { monthTask, timeWritingStory, iterationLocked: Boolean(monthTask) || timeWritingStory }
}
const hasTag = (tags: string, tag: string) => tags.split(';').some((entry) => entry.trim().toLowerCase() === tag)
export const isAdhocTask = (tags: string) => hasTag(tags, 'ad-hoc')
export const withAdhocTag = (tags: string) => [...tags.split(';').map((tag) => tag.trim()).filter(Boolean), 'ad-hoc'].join('; ')
