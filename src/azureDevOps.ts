import type { AzureWorkItem } from './domain'
import { featureDoD, fillTitle, missingValues, reviewStoryTitle, titleValues, fieldPlaceholders, type TitleField } from './featureSetup.ts'
import { isTimeWritingStory, planMonthStory, timeWritingMonth } from './azureInsights.ts'
import { editLocks, editProblem, editableText, isAdhocTask, withAdhocTag, type WorkItemEdit } from './workItemEdit.ts'

export * from './azureClient.ts'
export * from './azureRead.ts'
import { conflictMessage, isAssignee, requestAzure, storyFieldsProblem, validHours, type AzureConfig, type AzureRequest, type AzureTransport, type FeatureInput, type StoryFields } from './azureClient.ts'
import { currentIterationPairs, futureIterationPairs, identityName, literal, mapAzureWorkItem, readAzureIterations, type RawItem } from './azureRead.ts'
// The Feature DoD (Definition of Done) is mandatory. It opens the Feature's Description as "Feature DoD: …", where
// Backlog Health looks for it; these are the defaults per release classification.
export { featureDoD }
export const featureDescription = (kind: 'PU' | 'Release') => `Feature DoD: ${featureDoD(kind)}`
export const missingDoDMessage = 'Enter the Feature DoD (Definition of Done): a Feature is not created without it.'
// The Description sent for a new Feature: the DoD first ("Feature DoD: " added unless typed), then any other text.
export const releaseClassifications = ['Major', 'Minor', 'MLD', 'Platform Update', 'Service Pack'] as const
// The New Feature form passes the optional Release Classification ('' when left blank): the line is always written
// below the Feature DoD, so a blank choice still shows in the Description.
// lines: the Epic setup's title fields ("Platform : …"), below it.
export function withFeatureDoD(dod: string, description = '', releaseClassification?: string, lines: string[] = []) {
  const value = dod.trim().replace(/^feature\s+dod\s*:\s*/i, '').trim()
  if (!value) throw new Error(missingDoDMessage)
  const classification = releaseClassification === undefined ? '' : `Release Classification : ${releaseClassification.trim()}`.trimEnd()
  return [`Feature DoD: ${value}`, classification, ...lines.map((line) => line.trim()), description.trim()].filter(Boolean).join('\n\n')
}
const hasFeatureDoD = (description: string) => /\bDoD\b\s*:?\s*[^\s:]/i.test(description.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' '))

export async function createAzureFeature(config: AzureConfig, pat: string, feature: FeatureInput, transport: AzureTransport = requestAzure): Promise<AzureWorkItem> {
  if (!pat.trim()) throw new Error('Enter a Work Items (Read & Write) PAT.')
  if (!Number.isSafeInteger(feature.parentId) || feature.parentId < 1 || !feature.title.trim() || feature.title.trim().length > 255) throw new Error('Choose a parent Epic and enter a title of 1–255 characters.')
  if (feature.assignToCreator) throw new Error('Configure a Feature creator email in the ADS configuration. Azure DevOps does not accept the PAT identity GUID as Assigned To.')
  if (!feature.assignedTo?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(feature.assignedTo.trim())) throw new Error('A valid Feature creator email is required for Assigned To.')
  if (!hasFeatureDoD(feature.description)) throw new Error(missingDoDMessage)
  if (feature.startDate && !/^\d{4}-\d{2}-\d{2}$/.test(feature.startDate)) throw new Error('Invalid start date.')
  const parentResponse = await transport({ ...config, pat, operation: 'items', ids: [feature.parentId] }) as { value: RawItem[] }
  const parent = parentResponse.value?.find((item) => item.id === feature.parentId)
  if (!parent || parent.fields['System.WorkItemType'] !== 'Epic') throw new Error('The selected parent is not an accessible Epic. Refresh and select an Epic.')
  const parentProject = parent.fields['System.TeamProject']
  if (typeof parentProject === 'string' && parentProject.toLowerCase() !== config.project.toLowerCase()) throw new Error('The parent Epic belongs to a different project.')
  const areaPath = feature.areaPath?.trim() || parent.fields['System.AreaPath']
  if (typeof areaPath !== 'string' || !areaPath) throw new Error('The parent Epic has no area path. Check it in Azure DevOps.')
  let iterationPath = feature.iterationPath?.trim()
  if (iterationPath && !iterationPath.includes('\\')) {
    const iterations = await readAzureIterations(config, pat, transport)
    const matches = iterations.filter((iteration) => iteration.name.toLowerCase() === iterationPath!.toLowerCase())
    if (matches.length !== 1) throw new Error(`Iteration "${iterationPath}" ${matches.length ? 'is ambiguous' : 'was not found in team or project iterations'}. Use Load iteration paths and select its actual full path. Available paths: ${iterations.slice(0, 8).map((iteration) => iteration.path).join('; ')}`)
    iterationPath = matches[0].path
  }
  const request: AzureRequest = { ...config, pat, operation: 'create-feature', feature: { ...feature, title: feature.title.trim(), areaPath, iterationPath } }
  // Ask Azure DevOps to validate project-specific required fields before persisting anything.
  await transport({ ...request, validateOnly: true })
  const created = await transport({ ...request, validateOnly: false }) as RawItem
  if (!Number.isSafeInteger(created.id) || created.id < 1) throw new Error('Creation returned an unexpected response. Check the backlog before retrying to avoid duplicates.')
  try {
    const checked = await transport({ ...config, pat, operation: 'items', ids: [created.id] }) as { value: RawItem[] }
    const item = checked.value?.find((entry) => entry.id === created.id)
    if (!item) throw new Error('Verification response did not include the created Feature.')
    const assigned = item.fields['System.AssignedTo']
    const assignedName = typeof assigned === 'string' ? assigned : assigned && typeof assigned === 'object' && 'uniqueName' in assigned ? String(assigned.uniqueName) : assigned && typeof assigned === 'object' && 'mailAddress' in assigned ? String(assigned.mailAddress) : assigned && typeof assigned === 'object' && 'id' in assigned ? String(assigned.id) : ''
    if (assignedName && assignedName.toLowerCase() !== feature.assignedTo.trim().toLowerCase()) throw new Error('Configured creator email assignment verification failed.')
    const mapped = mapAzureWorkItem(item, config)
    if (mapped.parentId !== feature.parentId || mapped.workItemType !== 'Feature') throw new Error('Parent/type verification failed.')
    if (mapped.areaPath.toLowerCase() !== areaPath.toLowerCase() || (iterationPath && mapped.iterationPath.toLowerCase() !== iterationPath.toLowerCase())) throw new Error('Area/iteration verification failed.')
    return mapped
  } catch {
    throw new Error(`Feature #${created.id} was created, but its parent, area, iteration or assignee could not be verified. Check it in Azure DevOps before creating another.`)
  }
}

const hasAdhocTag = (tags: string) => tags.split(';').some((tag) => tag.trim().toLowerCase() === 'ad-hoc')

/** Updates only the two Azure scheduling fields on a selected-month Task. */
export async function updateAzureTimeWritingEffort(config: AzureConfig, pat: string, workItemId: number, planHours: number | undefined, actualHours: number | undefined, markAdhoc = false, transport: AzureTransport = requestAzure): Promise<AzureWorkItem> {
  if (!pat.trim()) throw new Error('Select a PAT profile with Work Items (Read & Write) before saving Plan or Actual.')
  if (!Number.isSafeInteger(workItemId) || workItemId < 1 || (planHours == null && actualHours == null) || (planHours != null && !validHours(planHours)) || (actualHours != null && !validHours(actualHours))) throw new Error('Original Estimate and Completed Work must be numbers from 0 to 1,000,000 hours.')
  const source = await transport({ ...config, pat, operation: 'items', ids: [workItemId] }) as { value?: RawItem[] }
  const raw = source.value?.find((item) => item.id === workItemId)
  // Only a Task whose title starts or ends with a month and year (any delimiter, any parent story name) can be edited here.
  if (!raw || raw.fields['System.WorkItemType'] !== 'Task' || !timeWritingMonth(String(raw.fields['System.Title'] ?? ''))) throw new Error('Only a month-named Time Writing Task can be updated from Monthly effort.')
  const existingTags = typeof raw.fields['System.Tags'] === 'string' ? raw.fields['System.Tags'] : ''
  const tags = markAdhoc && !existingTags.split(';').some(tag => tag.trim().toLowerCase() === 'ad-hoc') ? [...existingTags.split(';').map(tag => tag.trim()).filter(Boolean), 'ad-hoc'].join('; ') : undefined
  const response = await transport({ ...config, pat, operation: 'update-time-writing-effort', workItemId, planHours, actualHours, tags }) as RawItem
  if (response.id !== workItemId) throw new Error('Azure DevOps returned an unexpected work item after saving effort.')
  const updated = mapAzureWorkItem(response, config)
  if ((planHours != null && updated.originalEstimate !== planHours) || (actualHours != null && updated.completedWork !== actualHours) || (tags && !updated.tags.split(';').some(tag => tag.trim().toLowerCase() === 'ad-hoc'))) throw new Error('Azure DevOps did not confirm the saved fields. Refresh before retrying.')
  return updated
}

export function mergeAzureWorkItems(current: AzureWorkItem[], incoming: AzureWorkItem[]) {
  const merged = new Map(current.map((item) => [item.key, item]))
  for (const item of incoming) merged.set(item.key, item)
  return [...merged.values()]
}

export function releaseHierarchyTitles(title: string, kind: 'PU' | 'Release', monthLabel: string) {
  // BKL-04: the title is free text; a "Program | Service | Release" title names the milestone stories by its service and
  // release, any other title by the whole title.
  const clean = title.trim(), parts = clean.split('|').map((part) => part.trim())
  if (!clean) throw new Error('Enter the Feature title.')
  const identifier = parts.length === 3 && parts.every(Boolean) ? `${parts[1]} ${parts[2].replace(/^v/i, '')}` : clean
  return {
    reviews: (kind === 'PU' ? ['SFV', 'DT', 'IQOQ'] : ['PRD', 'SFV', 'DT', 'IQOQ']).map((milestone) => ({ milestone, title: `${milestone} : Review of Deliverables (${identifier})` })),
    review: reviewStoryTitle(title),
    timeWriting: `${title.trim()} - Time Writing`,
    task: `${monthLabel} | ${title.trim()}`,
  }
}

export function currentIndiaMonth(date = new Date()) {
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(date)
}

export class HierarchyCreationError extends Error {
  createdItems: AzureWorkItem[]
  constructor(message: string, createdItems: AzureWorkItem[]) { super(message); this.name = 'HierarchyCreationError'; this.createdItems = createdItems }
}

async function directChildren(config: AzureConfig, pat: string, parentId: number, transport: AzureTransport) {
  const page = await transport({ ...config, pat, operation: 'query', query: `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = ${literal(config.project)} AND [System.Parent] = ${parentId} ORDER BY [System.Id] ASC` }) as { workItems?: { id: number }[] }
  if (!Array.isArray(page.workItems)) throw new Error('Could not check existing children. No child creation was attempted.')
  if (page.workItems.length >= 1000) throw new Error('This parent has too many children to verify safely. Review it in Azure DevOps.')
  const items: AzureWorkItem[] = []
  for (let index = 0; index < page.workItems.length; index += 200) {
    const ids = page.workItems.slice(index, index + 200).map((item) => item.id)
    const batch = await transport({ ...config, pat, operation: 'items', ids }) as { value?: RawItem[] }
    if (batch.value?.length !== ids.length) throw new Error('Could not read all existing children. Refresh before retrying.')
    items.push(...batch.value.map((item) => mapAzureWorkItem(item, config)))
  }
  return items
}

// options: a Description, and an Area Path other than the parent's (both from the per-Epic Feature setup).
async function ensureChild(config: AzureConfig, pat: string, parent: AzureWorkItem, type: 'User Story' | 'Task', title: string, existing: AzureWorkItem[], assignedTo: string, transport: AzureTransport, iterationPath = parent.iterationPath, taskOriginalEstimate?: number, taskCompletedWork?: number, options: { anyPlace?: boolean; description?: string; areaPath?: string; adhoc?: boolean } = {}) {
  const areaPath = options.areaPath?.trim() || parent.areaPath
  const matches = existing.filter((item) => item.parentId === parent.id && item.workItemType === type && item.title.trim() === title)
  if (matches.length > 1) throw new Error(`Multiple matching ${type} items already exist under #${parent.id}. Review duplicates before continuing.`)
  if (matches.length === 1) {
    // The Time Writing story is not tied to a PI or Sprint: an existing one is used wherever it is.
    if (options.anyPlace) return matches[0]
    if (matches[0].areaPath !== areaPath || matches[0].iterationPath !== iterationPath) throw new Error(`Existing ${type} #${matches[0].id} has a different area or iteration. Review it before continuing.`)
    return matches[0]
  }
  if (title.length > 255) throw new Error('An automatic child title exceeds 255 characters. Shorten the Feature title.')
  if (!isAssignee(assignedTo)) throw new Error(`Choose who the ${type} is assigned to (an email). Nothing was created.`)
  const request: AzureRequest = { ...config, pat, operation: 'create-child', workItemType: type,
    feature: { parentId: parent.id, title, description: options.description ?? '', acceptanceCriteria: '', areaPath, iterationPath, assignedTo: assignedTo.trim(), ...(type === 'Task' && taskOriginalEstimate != null ? { taskOriginalEstimate } : {}), ...(type === 'Task' && taskCompletedWork != null ? { taskCompletedWork } : {}), ...(type === 'Task' && options.adhoc ? { adhoc: true } : {}) } }
  await transport({ ...request, validateOnly: true })
  const response = await transport({ ...request, validateOnly: false }) as RawItem
  if (!Number.isSafeInteger(response.id) || response.id < 1) throw new Error(`${type} creation could not be confirmed. Check children under #${parent.id} before retrying.`)
  try {
    const read = await transport({ ...config, pat, operation: 'items', ids: [response.id] }) as { value: RawItem[] }
    const raw = read.value?.find((item) => item.id === response.id)
    if (!raw) throw new Error('Missing work item.')
    const item = mapAzureWorkItem(raw, config)
    if (item.parentId !== parent.id || item.workItemType !== type || item.areaPath !== areaPath || item.iterationPath !== iterationPath || (taskOriginalEstimate != null && item.originalEstimate !== taskOriginalEstimate) || (taskCompletedWork != null && item.completedWork !== taskCompletedWork) || (type === 'Task' && options.adhoc && !hasAdhocTag(item.tags))) throw new Error('Child verification failed.')
    return item
  } catch { throw new Error(`${type} #${response.id} was created but could not be verified. Check the source before using Complete children.`) }
}

// A User Story under a Feature, or a Task under a User Story, from the Backlogs: assigned to the chosen person, in the
// iteration given (default: the parent's); the parent is re-read first.
export async function addChildWorkItem(config: AzureConfig, pat: string, parentId: number, type: 'User Story' | 'Task', title: string, assignedTo: string, iterationPath?: string, transport: AzureTransport = requestAzure): Promise<AzureWorkItem> {
  if (!pat.trim()) throw new Error('Enter a Work Items (Read & Write) PAT.')
  const clean = title.trim()
  if (!clean || clean.length > 255) throw new Error('Enter a title of 1–255 characters.')
  if (!isAssignee(assignedTo)) throw new Error(`Choose who the ${type} is assigned to (an email). Nothing was created.`)
  const source = await transport({ ...config, pat, operation: 'items', ids: [parentId] }) as { value?: RawItem[] }
  const raw = source.value?.find((item) => item.id === parentId)
  const expected = type === 'User Story' ? 'Feature' : 'User Story'
  if (!raw || raw.fields['System.WorkItemType'] !== expected) throw new Error(`#${parentId} is not an accessible ${expected}; a ${type} goes under a ${expected}.`)
  const parent = mapAzureWorkItem(raw, config)
  return createChildItem(config, pat, parent, type, clean, iterationPath?.trim() || parent.iterationPath, assignedTo.trim().toLowerCase(), transport)
}

// ＋ User Story under a Feature (Backlogs, My Tasks [Board]), the New Feature form's counterpart: title, Description,
// Acceptance criteria, the Sprint chosen and optional Story Points; the Feature is re-read first and the story takes its
// Area Path. Assigned to the person chosen (an email), never blank; read back and verified.
export interface StoryInput extends StoryFields { parentId: number; title: string; description: string; acceptanceCriteria: string; iterationPath: string; assignedTo: string }
export async function createUserStory(config: AzureConfig, pat: string, input: StoryInput, transport: AzureTransport = requestAzure): Promise<AzureWorkItem> {
  if (!pat.trim()) throw new Error('Enter a Work Items (Read & Write) PAT.')
  const title = input.title.trim()
  if (!title || title.length > 255) throw new Error('Enter a title of 1–255 characters.')
  if (!isAssignee(input.assignedTo)) throw new Error('Choose who the User Story is assigned to (an email). Nothing was created.')
  const problem = storyFieldsProblem(input, true)
  if (problem) throw new Error(problem)
  if (!input.iterationPath.trim()) throw new Error('Select a PI → Sprint for the User Story.')
  const source = await transport({ ...config, pat, operation: 'items', ids: [input.parentId] }) as { value?: RawItem[] }
  const raw = source.value?.find((item) => item.id === input.parentId)
  if (!raw || raw.fields['System.WorkItemType'] !== 'Feature') throw new Error(`#${input.parentId} is not an accessible Feature; a User Story goes under a Feature.`)
  const project = raw.fields['System.TeamProject']
  if (typeof project === 'string' && project.toLowerCase() !== config.project.toLowerCase()) throw new Error('The Feature belongs to a different project.')
  const parent = mapAzureWorkItem(raw, config)
  const iterationPath = input.iterationPath.trim(), assignedTo = input.assignedTo.trim().toLowerCase()
  const request: AzureRequest = { ...config, pat, operation: 'create-child', workItemType: 'User Story', feature: { parentId: parent.id, title, description: input.description, acceptanceCriteria: input.acceptanceCriteria, areaPath: parent.areaPath, iterationPath, assignedTo, ...(input.storyPoints != null ? { storyPoints: input.storyPoints } : {}), ...(input.priority != null ? { priority: input.priority } : {}), ...(input.risk != null ? { risk: input.risk } : {}), ...(input.valueArea != null ? { valueArea: input.valueArea } : {}) } }
  await transport({ ...request, validateOnly: true })
  const response = await transport({ ...request, validateOnly: false }) as RawItem
  if (!Number.isSafeInteger(response.id) || response.id < 1) throw new Error(`User Story creation under #${parent.id} could not be confirmed. Check it in Azure DevOps before retrying.`)
  const read = await transport({ ...config, pat, operation: 'items', ids: [response.id] }) as { value?: RawItem[] }
  const created = read.value?.find((item) => item.id === response.id)
  if (!created) throw new Error(`User Story #${response.id} was created but could not be read back.`)
  const item = mapAzureWorkItem(created, config)
  if (item.parentId !== parent.id || item.workItemType !== 'User Story' || item.title.trim() !== title || item.iterationPath !== iterationPath || (input.storyPoints != null && item.storyPoints !== input.storyPoints) || (input.priority != null && created.fields['Microsoft.VSTS.Common.Priority'] !== input.priority) || (input.risk != null && created.fields['Microsoft.VSTS.Common.Risk'] !== input.risk) || (input.valueArea != null && created.fields['Microsoft.VSTS.Common.ValueArea'] !== input.valueArea)) throw new Error(`User Story #${response.id} was created but does not match what was requested. Check it in Azure DevOps.`)
  return item
}

// BKL-27: the one way the app adds a User Story (New User Story form, Time Writing, Your own User Story on New Feature):
// the Sprint must be a current or future one of the team's schedule (checked fresh, nothing written otherwise), the
// story is created under the Feature in the Feature's Area Path (createUserStory) and the optional comment is added to
// its Discussion; a comment that fails is reported in commentError without undoing the story.
export async function addUserStory(config: AzureConfig, pat: string, input: StoryInput & { comment?: string }, transport: AzureTransport = requestAzure): Promise<{ story: AzureWorkItem; commentError?: string }> {
  const iterations = await readAzureIterations(config, pat, transport)
  if (![...currentIterationPairs(iterations), ...futureIterationPairs(iterations)].some((pair) => pair.sprint.path === input.iterationPath.trim())) throw new Error('The selected PI/Sprint is no longer current. Reload the schedule and review it before creating. No write was attempted.')
  const { comment, ...fields } = input
  const story = await createUserStory(config, pat, fields, transport)
  if (!comment?.trim()) return { story }
  try { await addComment(config, pat, story.id, comment.trim(), transport); return { story } }
  catch (failure) { return { story, commentError: failure instanceof Error ? failure.message : 'the comment was not added' } }
}

// ACT-17: a work Task (not a month Time Writing Task) under a User Story, by the same rules as addUserStory (BKL-27):
// a current or future Sprint (checked fresh), the parent story's Area Path, the person, the title and description,
// read back and verified, then the optional comment. Time Writing stories and month titles are refused, so it never
// becomes a Time Writing Task.
export async function addTask(config: AzureConfig, pat: string, input: { storyId: number; title: string; description: string; iterationPath: string; assignedTo: string; comment?: string }, transport: AzureTransport = requestAzure): Promise<{ task: AzureWorkItem; commentError?: string }> {
  if (!pat.trim()) throw new Error('Enter a Work Items (Read & Write) PAT.')
  const title = input.title.trim(), assignedTo = input.assignedTo.trim().toLowerCase(), iterationPath = input.iterationPath.trim()
  if (!title || title.length > 255) throw new Error('Enter a title of 1–255 characters.')
  if (timeWritingMonth(title)) throw new Error('A title with a month (e.g. "November 2026 | …") is a Time Writing Task: use Time Writing task instead.')
  if (!isAssignee(assignedTo)) throw new Error('Choose who the Task is assigned to (an email). Nothing was created.')
  if (!iterationPath) throw new Error('Select a Sprint for the Task.')
  const iterations = await readAzureIterations(config, pat, transport)
  if (![...currentIterationPairs(iterations), ...futureIterationPairs(iterations)].some((pair) => pair.sprint.path === iterationPath)) throw new Error('The selected PI/Sprint is no longer current. Reload the schedule and review it before creating. No write was attempted.')
  const source = await transport({ ...config, pat, operation: 'items', ids: [input.storyId] }) as { value?: RawItem[] }
  const raw = source.value?.find((item) => item.id === input.storyId)
  if (!raw || raw.fields['System.WorkItemType'] !== 'User Story') throw new Error(`#${input.storyId} is not an accessible User Story; a Task goes under a User Story.`)
  const story = mapAzureWorkItem(raw, config)
  if (isTimeWritingStory(story)) throw new Error('This is a Time Writing story: use Time Writing task for month Tasks.')
  const request: AzureRequest = { ...config, pat, operation: 'create-child', workItemType: 'Task', feature: { parentId: story.id, title, description: input.description, acceptanceCriteria: '', areaPath: story.areaPath, iterationPath, assignedTo } }
  await transport({ ...request, validateOnly: true })
  const response = await transport({ ...request, validateOnly: false }) as RawItem
  if (!Number.isSafeInteger(response.id) || response.id < 1) throw new Error(`Task creation under #${story.id} could not be confirmed. Check it in Azure DevOps before retrying.`)
  const read = await transport({ ...config, pat, operation: 'items', ids: [response.id] }) as { value?: RawItem[] }
  const created = read.value?.find((item) => item.id === response.id)
  if (!created) throw new Error(`Task #${response.id} was created but could not be read back.`)
  const task = mapAzureWorkItem(created, config)
  if (task.parentId !== story.id || task.workItemType !== 'Task' || task.title.trim() !== title || task.iterationPath !== iterationPath) throw new Error(`Task #${response.id} was created but does not match what was requested. Check it in Azure DevOps.`)
  if (!input.comment?.trim()) return { task }
  try { await addComment(config, pat, task.id, input.comment.trim(), transport); return { task } }
  catch (failure) { return { task, commentError: failure instanceof Error ? failure.message : 'the comment was not added' } }
}

// NAV-39: the work email of the PAT's owner, read from work items rather than from an identity service (the
// connectionData lookup did not work in this setup, CON-41). WIQL's @Me is the token's owner: the most recent item
// assigned to them, else created by them, else changed by them, gives their identity as Azure DevOps stores it
// ("Name <email>" / uniqueName). Read-only (query + items); null when the person has no work item yet.
export async function detectWorkEmail(config: AzureConfig, pat: string, transport: AzureTransport = requestAzure): Promise<{ email: string; name: string; via: 'Assigned To' | 'Created By' | 'Changed By' } | null> {
  if (!pat.trim()) throw new Error('Enter your Azure DevOps token (PAT) first.')
  const fields = [['System.AssignedTo', 'Assigned To'], ['System.CreatedBy', 'Created By'], ['System.ChangedBy', 'Changed By']] as const
  for (const [field, via] of fields) {
    const page = await transport({ ...config, pat, operation: 'query', query: `SELECT [System.Id] FROM WorkItems WHERE [${field}] = @Me ORDER BY [System.ChangedDate] DESC` }) as { workItems?: { id: number }[] }
    const id = page.workItems?.find((entry) => Number.isSafeInteger(entry.id) && entry.id > 0)?.id
    if (!id) continue
    const read = await transport({ ...config, pat, operation: 'items', ids: [id] }) as { value?: RawItem[] }
    const value = read.value?.find((item) => item.id === id)?.fields[field]
    const identity = typeof value === 'string' ? { uniqueName: /<([^>]+)>/.exec(value)?.[1] ?? value, displayName: value.replace(/\s*<[^>]*>\s*$/, '') } : value && typeof value === 'object' ? value as { uniqueName?: unknown; displayName?: unknown } : null
    const email = typeof identity?.uniqueName === 'string' ? identity.uniqueName.trim().toLowerCase() : ''
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { email, name: typeof identity?.displayName === 'string' ? identity.displayName.trim() : '', via }
  }
  return null
}

// Month Time Writing task for one person on one Feature: "<Feature> - Time Writing" story (created if missing) and
// "<Month YYYY> | <Feature>" Task assigned to that person. Children are re-read from Azure first, so an existing task
// for the same person is reused rather than duplicated; another person's task with the same title is left alone.
// storyAssigned: an existing Time Writing story with no Assigned To was given the person (BKL-35).
export type MonthTaskResult = { status: 'exists' | 'created'; task: AzureWorkItem; story: AzureWorkItem; storyCreated: boolean; storyAssigned?: boolean }
// adhoc: the month's planning has locked, so a newly created Task is tagged 'ad-hoc' (an existing one is left as it is).
// BKL-28: the one Time Writing Task rule of every page — "<Month> | <Feature>" under "<Feature> - Time Writing" (the
// person's own story first), assigned to the person, in the Feature's Area Path and the project root; any month Task of
// theirs is reused. defaultHours: the Epic setup's Original Estimate, put on a newly created Task only.
export async function ensureMonthTask(config: AzureConfig, pat: string, featureId: number, assignee: string, monthLabel = currentIndiaMonth(), transport: AzureTransport = requestAzure, adhoc = false, defaultHours?: number): Promise<MonthTaskResult> {
  if (!pat.trim()) throw new Error('Enter a Work Items (Read & Write) PAT.')
  const email = assignee.trim().toLowerCase()
  if (!isAssignee(email)) throw new Error('Choose who the month Task is assigned to (an email), or set your Azure DevOps email (Feature creator email on the Time Writing connection).')
  const source = await transport({ ...config, pat, operation: 'items', ids: [featureId] }) as { value?: RawItem[] }
  const raw = source.value?.find((item) => item.id === featureId)
  if (!raw || raw.fields['System.WorkItemType'] !== 'Feature') throw new Error(`#${featureId} is not an accessible Feature.`)
  const feature = mapAzureWorkItem(raw, config)
  const storyTitle = `${feature.title.trim()} - Time Writing`, taskTitle = `${monthLabel} | ${feature.title.trim()}`
  if (taskTitle.length > 255 || storyTitle.length > 255) throw new Error(`#${feature.id}: the Feature title is too long for an automatic child title.`)
  // Every story under the Feature and its Tasks are re-read now, so a month Task of mine with any title or delimiter,
  // under any story, is found and reused rather than duplicated.
  const children = await directChildren(config, pat, feature.id, transport)
  const stories = []
  for (const story of children.filter((item) => item.workItemType === 'User Story' && item.state.toLowerCase() !== 'removed')) stories.push({ story, tasks: await directChildren(config, pat, story.id, transport) })
  const plan = planMonthStory(stories, children.filter((item) => item.workItemType === 'Task'), timeWritingMonth(monthLabel) ?? '', storyTitle, (item) => item.assignedToEmail === email)
  if (plan.status === 'exists') return { status: 'exists', task: plan.task, story: plan.story ?? feature, storyCreated: false }
  if (plan.status === 'conflict') throw new Error(`#${feature.id} has ${plan.stories.length} possible Time Writing stories (${plan.stories.map((item) => `#${item.id}`).join(', ')}). Add your month Task under the right one in Azure DevOps.`)
  let story: AzureWorkItem, storyCreated = false, storyAssigned = false
  if (plan.status === 'use') {
    story = plan.story
    // BKL-35: the story holding the person's Task is assigned to them too — a new one is created so; an existing one with
    // no Assigned To is given the person. Another person's story is never reassigned (ATM-23).
    if (!story.assignedToEmail) { story = await assignStory(config, pat, story.id, email, transport); storyAssigned = true }
  } else { story = await createChildItem(config, pat, feature, 'User Story', storyTitle, config.project, email, transport); storyCreated = true }
  let task = await createChildItem(config, pat, story, 'Task', taskTitle, config.project, email, transport, adhoc)
  if (defaultHours != null) task = await updateAzureTimeWritingEffort(config, pat, task.id, defaultHours, undefined, false, transport)
  return { status: 'created', task, story, storyCreated, storyAssigned }
}

// BKL-36: a Feature renamed after its Time Writing story and month Tasks were made leaves them with the old name. A story
// "<Old> - Time Writing" whose month Tasks are all exactly "<Month YYYY> | <Old>" (at least one) was made from the
// Feature's former title, so it becomes "<New> - Time Writing" and its Tasks "<Month YYYY> | <New>" — everyone's.
// Anything else is left alone: a story with no month Task, Tasks with another name after the month (leave kinds such as
// "Ana Costa - PTO", holidays), stories people titled themselves, Tasks directly under the Feature.
const monthTaskTitle = /^([A-Z][a-z]+ \d{4}) \| (.+)$/
const storySuffix = ' - Time Writing'
export function staleTimeWritingTitles(featureTitle: string, stories: { story: Pick<AzureWorkItem, 'id' | 'title' | 'state'>; tasks: Pick<AzureWorkItem, 'id' | 'title' | 'state' | 'workItemType'>[] }[]) {
  const name = featureTitle.trim()
  const live = (item: { state: string }) => item.state.trim().toLowerCase() !== 'removed'
  const renames: { id: number; from: string; title: string }[] = []
  if (!name || `${name}${storySuffix}`.length > 255) return renames
  for (const { story, tasks } of stories) {
    const title = story.title.trim()
    if (!live(story) || !title.endsWith(storySuffix)) continue
    const old = title.slice(0, -storySuffix.length).trim()
    if (!old || old === name) continue
    const months = tasks.filter((task) => live(task) && task.workItemType === 'Task').map((task) => ({ task, match: monthTaskTitle.exec(task.title.trim()) })).filter((entry) => entry.match && timeWritingMonth(entry.match[1]))
    if (!months.length || months.some((entry) => entry.match![2].trim() !== old)) continue
    if (months.some((entry) => `${entry.match![1]} | ${name}`.length > 255)) continue
    renames.push({ id: story.id, from: story.title, title: `${name}${storySuffix}` })
    for (const { task, match } of months) renames.push({ id: task.id, from: task.title, title: `${match![1]} | ${name}` })
  }
  return renames
}

// BKL-36: checks a Feature's Time Writing stories and month Tasks against its title now (re-read from Azure DevOps) and
// renames the stale ones, each at the revision just read. Returns what was renamed; stops at the first failure.
export async function syncTimeWritingTitles(config: AzureConfig, pat: string, featureId: number, transport: AzureTransport = requestAzure) {
  const source = await transport({ ...config, pat, operation: 'items', ids: [featureId] }) as { value?: RawItem[] }
  const raw = source.value?.find((item) => item.id === featureId)
  if (!raw || raw.fields['System.WorkItemType'] !== 'Feature') return []
  const feature = mapAzureWorkItem(raw, config)
  const children = await directChildren(config, pat, feature.id, transport)
  const stories = []
  for (const story of children.filter((item) => item.workItemType === 'User Story' && item.title.trim().endsWith(storySuffix))) stories.push({ story, tasks: await directChildren(config, pat, story.id, transport) })
  const renamed: AzureWorkItem[] = []
  for (const rename of staleTimeWritingTitles(feature.title, stories)) renamed.push(await editAtCurrentRevision(config, pat, rename.id, { title: rename.title }, transport))
  return renamed
}

// A change by the app itself (not a person's edit form), at the work item's current revision.
async function editAtCurrentRevision(config: AzureConfig, pat: string, workItemId: number, change: WorkItemEdit, transport: AzureTransport) {
  const read = await transport({ ...config, pat, operation: 'items', ids: [workItemId] }) as { value?: RawItem[] }
  const rev = read.value?.find((item) => item.id === workItemId)?.rev
  if (typeof rev !== 'number') throw new Error(`#${workItemId} could not be read to update it.`)
  return editWorkItem(config, pat, workItemId, rev, change, { planningLocked: () => false, actualsLocked: () => false }, transport)
}

// Assigned To of an unassigned Time Writing story, at its current revision (a change in between is refused).
function assignStory(config: AzureConfig, pat: string, storyId: number, email: string, transport: AzureTransport) {
  return editAtCurrentRevision(config, pat, storyId, { assignedTo: email }, transport)
}

// BKL-32: the month Tasks of a new Feature after its first month, one per month up to the Target date, each by the one
// rule of every page (ensureMonthTask: reused when it exists) with the hours typed for that month, else the Epic setup's
// default; Completed Work only where typed. Stops at the first failure with what was made so far.
export interface MonthHours { month: string; originalEstimate?: number; completedWork?: number; adhoc?: boolean }
export async function addMonthTasks(config: AzureConfig, pat: string, featureId: number, assignee: string, months: MonthHours[], defaultHours?: number, transport: AzureTransport = requestAzure, progress?: (text: string) => void) {
  const items: AzureWorkItem[] = []
  try {
    for (const entry of months) {
      progress?.(`Adding the ${entry.month} Task…`)
      const result = await ensureMonthTask(config, pat, featureId, assignee, entry.month, transport, entry.adhoc === true, entry.originalEstimate ?? defaultHours)
      let task = result.task
      // An existing Task keeps its hours unless new ones were typed; a new one already has its Original Estimate.
      const plan = result.status === 'exists' ? entry.originalEstimate : undefined
      if (plan != null || entry.completedWork != null) task = await updateAzureTimeWritingEffort(config, pat, task.id, plan, entry.completedWork, false, transport)
      if (result.storyCreated || result.storyAssigned) items.push(result.story)
      items.push(task)
    }
    return items
  } catch (failure) {
    throw new HierarchyCreationError(failure instanceof Error ? failure.message : 'A month Task could not be added.', items)
  }
}

// This month's Task for the person under one given User Story (ATM-26): a leave story ("PTO", "Sick Leave") of a
// person's own leave Feature, or a story chosen on its row. The story's children are re-read now: a month Task of theirs
// for the month (any title or delimiter) is reused, else "<Month> | <story title>" is created and assigned to them.
export async function ensureStoryMonthTask(config: AzureConfig, pat: string, storyId: number, assignee: string, monthLabel = currentIndiaMonth(), transport: AzureTransport = requestAzure, adhoc = false, defaultHours?: number): Promise<MonthTaskResult> {
  if (!pat.trim()) throw new Error('Enter a Work Items (Read & Write) PAT.')
  const email = assignee.trim().toLowerCase()
  if (!isAssignee(email)) throw new Error('Choose who the month Task is assigned to (an email), or set your work email (Admin → Streams → Your work email).')
  const source = await transport({ ...config, pat, operation: 'items', ids: [storyId] }) as { value?: RawItem[] }
  const raw = source.value?.find((item) => item.id === storyId)
  if (!raw || raw.fields['System.WorkItemType'] !== 'User Story') throw new Error(`#${storyId} is not an accessible User Story.`)
  const story = mapAzureWorkItem(raw, config)
  const taskTitle = `${monthLabel} | ${story.title.trim()}`
  if (taskTitle.length > 255) throw new Error(`#${story.id}: the story title is too long for an automatic Task title.`)
  const month = timeWritingMonth(monthLabel) ?? ''
  const existing = (await directChildren(config, pat, story.id, transport)).find((item) => item.workItemType === 'Task' && item.state.toLowerCase() !== 'removed' && item.assignedToEmail === email && timeWritingMonth(item.title) === month)
  if (existing) return { status: 'exists', task: existing, story, storyCreated: false }
  let task = await createChildItem(config, pat, story, 'Task', taskTitle, config.project, email, transport, adhoc)
  if (defaultHours != null) task = await updateAzureTimeWritingEffort(config, pat, task.id, defaultHours, undefined, false, transport)
  return { status: 'created', task, story, storyCreated: false }
}

// A person's leave or training story of one type under their own Feature of the absence Epic (ATM-27): the Feature's
// stories are re-read now; a story of theirs of that type (typeOf) is used, else "<Name> | <Type> | Time Writing" is
// created and assigned to them; then that month's Task goes under it, never duplicated.
export async function ensureAbsenceStoryMonthTask(config: AzureConfig, pat: string, featureId: number, kind: string, storyTitle: string, typeOf: (story: AzureWorkItem) => string | undefined, assignee: string, monthLabel = currentIndiaMonth(), transport: AzureTransport = requestAzure, adhoc = false): Promise<MonthTaskResult> {
  if (!pat.trim()) throw new Error('Enter a Work Items (Read & Write) PAT.')
  const email = assignee.trim().toLowerCase()
  if (!isAssignee(email)) throw new Error('Choose who the month Task is assigned to (an email), or set your work email (Admin → Streams → Your work email).')
  if (!storyTitle.trim() || storyTitle.length > 200) throw new Error(`#${featureId}: the story title is empty or too long.`)
  const source = await transport({ ...config, pat, operation: 'items', ids: [featureId] }) as { value?: RawItem[] }
  const raw = source.value?.find((item) => item.id === featureId)
  if (!raw || raw.fields['System.WorkItemType'] !== 'Feature') throw new Error(`#${featureId} is not an accessible Feature.`)
  const feature = mapAzureWorkItem(raw, config)
  const own = (await directChildren(config, pat, feature.id, transport)).filter((item) => item.workItemType === 'User Story' && item.state.toLowerCase() !== 'removed' && item.assignedToEmail === email && typeOf(item) === kind)
  if (own.length) return ensureStoryMonthTask(config, pat, own[0].id, assignee, monthLabel, transport, adhoc)
  const story = await createChildItem(config, pat, feature, 'User Story', storyTitle.trim(), config.project, email, transport)
  const task = await createChildItem(config, pat, story, 'Task', `${monthLabel} | ${storyTitle.trim()}`, config.project, email, transport, adhoc)
  return { status: 'created', task, story, storyCreated: true }
}

async function createChildItem(config: AzureConfig, pat: string, parent: AzureWorkItem, type: 'User Story' | 'Task', title: string, iterationPath: string, assignedTo: string, transport: AzureTransport, adhoc = false) {
  if (!isAssignee(assignedTo)) throw new Error(`Choose who the ${type} is assigned to (an email). Nothing was created.`)
  const request: AzureRequest = { ...config, pat, operation: 'create-child', workItemType: type, feature: { parentId: parent.id, title, description: '', acceptanceCriteria: '', areaPath: parent.areaPath, iterationPath, assignedTo: assignedTo.trim(), ...(type === 'Task' && adhoc ? { adhoc: true } : {}) } }
  await transport({ ...request, validateOnly: true })
  const response = await transport({ ...request, validateOnly: false }) as RawItem
  if (!Number.isSafeInteger(response.id) || response.id < 1) throw new Error(`${type} creation under #${parent.id} could not be confirmed. Check it in Azure DevOps before retrying.`)
  const read = await transport({ ...config, pat, operation: 'items', ids: [response.id] }) as { value?: RawItem[] }
  const raw = read.value?.find((item) => item.id === response.id)
  if (!raw) throw new Error(`${type} #${response.id} was created but could not be read back.`)
  const item = mapAzureWorkItem(raw, config)
  if (item.parentId !== parent.id || item.workItemType !== type || item.title.trim() !== title || (type === 'Task' && adhoc && !hasAdhocTag(item.tags))) throw new Error(`${type} #${response.id} was created but does not match what was requested. Check it in Azure DevOps.`)
  return item
}

// The children are assigned to `assignee`, else to whoever the Feature is assigned to; never left blank.
export async function completeReleaseHierarchy(config: AzureConfig, pat: string, featureId: number, kind: 'PU' | 'Release', milestones?: string[], monthLabel = currentIndiaMonth(), transport: AzureTransport = requestAzure, storyIterationPath?: string, assignee?: string, reviewStory = true, adhoc = false) {
  const items: AzureWorkItem[] = []
  try {
    if (!pat.trim()) throw new Error('Enter a Work Items (Read & Write) PAT.')
    const source = await transport({ ...config, pat, operation: 'items', ids: [featureId] }) as { value: RawItem[] }
    const raw = source.value?.find((item) => item.id === featureId)
    if (!raw || raw.fields['System.WorkItemType'] !== 'Feature') throw new Error('The selected item is not an accessible Feature.')
    const feature = mapAzureWorkItem(raw, config)
    items.push(feature)
    const owner = assignee?.trim() || feature.assignedToEmail || ''
    if (!isAssignee(owner)) throw new Error('Choose who the User Stories and Task are assigned to (an email); the Feature has no assignee with an email.')
    const titles = releaseHierarchyTitles(feature.title, kind, monthLabel)
    const selected = milestones ?? titles.reviews.map((review) => review.milestone)
    if (selected.some((milestone) => !titles.reviews.some((review) => review.milestone === milestone))) throw new Error('Unsupported milestone selection for this release classification.')
    const children = await directChildren(config, pat, feature.id, transport)
    for (const review of titles.reviews.filter((review) => selected.includes(review.milestone))) items.push(await ensureChild(config, pat, feature, 'User Story', review.title, children, owner, transport, storyIterationPath || feature.iterationPath))
    // The built-in "Review of Deliverables - <Feature>" story (optional, ticked by default): in the Sprint chosen (else the Feature's iteration); an existing one is reused wherever it sits.
    if (reviewStory) items.push(await ensureChild(config, pat, feature, 'User Story', titles.review, children, owner, transport, storyIterationPath || feature.iterationPath, undefined, undefined, { anyPlace: true }))
    // BKL-28: the Time Writing story and the month Task by the one rule of every page.
    const month = await ensureMonthTask(config, pat, feature.id, owner, monthLabel, transport, adhoc)
    items.push(month.story, month.task)
    return { feature, items }
  } catch (failure) {
    throw new HierarchyCreationError(failure instanceof Error ? failure.message : 'Unable to complete the release hierarchy.', items)
  }
}

export async function createAzureReleaseHierarchy(config: AzureConfig, pat: string, input: FeatureInput, kind: 'PU' | 'Release', milestones?: string[], monthLabel = currentIndiaMonth(), transport: AzureTransport = requestAzure, reviewStory = true, adhoc = false) {
  const titles = releaseHierarchyTitles(input.title.trim(), kind, monthLabel)
  if ([...titles.reviews.map((review) => review.title), titles.review, titles.timeWriting, titles.task].some((title) => title.length > 255)) throw new Error('An automatic child title exceeds 255 characters. Shorten the Feature title.')
  if (milestones?.some((milestone) => !titles.reviews.some((review) => review.milestone === milestone))) throw new Error('Unsupported milestone selection for this release classification.')
  const feature = await createAzureFeature(config, pat, input, transport)
  try {
    const bundle = await completeReleaseHierarchy(config, pat, feature.id, kind, milestones, monthLabel, transport, input.storyIterationPath, input.assignedTo, reviewStory, adhoc)
    // Initial effort is deliberately saved on the month-named Task, not the User Story.
    if (input.taskOriginalEstimate != null || input.taskCompletedWork != null) {
      const task = bundle.items.find((item) => item.workItemType === 'Task')
      if (!task) throw new Error('Time Writing Task was not created.')
      const updated = await updateAzureTimeWritingEffort(config, pat, task.id, input.taskOriginalEstimate, input.taskCompletedWork, false, transport)
      return { feature: bundle.feature, items: mergeAzureWorkItems(bundle.items, [updated]) }
    }
    return bundle
  }
  catch (failure) {
    const partial = failure instanceof HierarchyCreationError ? failure.createdItems : []
    const items = mergeAzureWorkItems([feature], partial)
    throw new HierarchyCreationError(`Feature #${feature.id} exists. ${failure instanceof Error ? failure.message : 'Child creation stopped.'} Use Complete children on that Feature after checking the source; do not recreate the Feature.`, items)
  }
}

// Area Path (BKL-26, BKL-28): User Stories, the Time Writing story and the Task take the Feature's.
// A Feature's children from the per-Epic setup: the selected optional User Stories, the Time Writing story (default
// "<Feature> - Time Writing"; its Iteration Path, when set, wins over the Sprint chosen in the dialog)
// and the month Task with the setup's defaults. Titles may carry placeholders ({feature}, {program}, {service},
// {version}, {month}). Existing children with the same title are reused, so it can also complete a Feature.
export interface SetupChildren { stories: { title: string; description: string }[]; reviewStory?: boolean; titleFields?: TitleField[]; fieldValues?: string[]; timeWritingStory?: { title: string; description: string; assignedTo: string; areaPath: string; iterationPath: string }; task: { title: string; description: string; originalEstimate?: number; assignedTo: string; areaPath: string; iterationPath: string } }
export async function completeFeatureFromSetup(config: AzureConfig, pat: string, featureId: number, setup: SetupChildren, monthLabel = currentIndiaMonth(), transport: AzureTransport = requestAzure, storyIterationPath?: string, assignee?: string, adhoc = false) {
  const items: AzureWorkItem[] = []
  try {
    if (!pat.trim()) throw new Error('Enter a Work Items (Read & Write) PAT.')
    const source = await transport({ ...config, pat, operation: 'items', ids: [featureId] }) as { value: RawItem[] }
    const raw = source.value?.find((item) => item.id === featureId)
    if (!raw || raw.fields['System.WorkItemType'] !== 'Feature') throw new Error('The selected item is not an accessible Feature.')
    const feature = mapAzureWorkItem(raw, config)
    items.push(feature)
    const owner = assignee?.trim() || feature.assignedToEmail || ''
    if (!isAssignee(owner)) throw new Error('Choose who the User Stories and Task are assigned to (an email); the Feature has no assignee with an email.')
    // The values typed in the form win; else a title of as many "|" parts as the setup's title fields fills them.
    const values = { ...titleValues(feature.title, monthLabel, setup.titleFields), ...(setup.titleFields?.length && setup.fieldValues?.length === setup.titleFields.length ? fieldPlaceholders(setup.titleFields, setup.fieldValues) : {}) }
    const shape = setup.titleFields?.length ? setup.titleFields.map((field) => field.label).join(' | ') : 'Program | Service | Release'
    const fill = (template: string, what: string) => {
      const missing = missingValues(template, values)
      if (missing.length) throw new Error(`${what} uses {${missing.join('}, {')}}, which this Feature title does not provide (use "${shape}"). Nothing more was created.`)
      const title = fillTitle(template, values)
      if (!title || title.length > 255) throw new Error(`${what} is empty or longer than 255 characters after filling in the placeholders.`)
      return title
    }
    const stories = setup.stories.map((story) => ({ ...story, title: fill(story.title, `User Story "${story.title}"`) }))
    const children = await directChildren(config, pat, feature.id, transport)
    for (const story of stories) items.push(await ensureChild(config, pat, feature, 'User Story', story.title, children, owner, transport, storyIterationPath || feature.iterationPath, undefined, undefined, { description: story.description }))
    // The built-in "Review of Deliverables - <Feature>" story (optional, ticked by default; reviewStory false skips it): in the Sprint chosen (else the Feature's iteration); an existing one is reused wherever it sits.
    const reviewTitle = reviewStoryTitle(feature.title)
    if (setup.reviewStory !== false && reviewTitle.length > 255) throw new Error('The Review of Deliverables title exceeds 255 characters. Shorten the Feature title.')
    if (setup.reviewStory !== false && !stories.some((story) => story.title === reviewTitle)) items.push(await ensureChild(config, pat, feature, 'User Story', reviewTitle, children, owner, transport, storyIterationPath || feature.iterationPath, undefined, undefined, { anyPlace: true }))
    // BKL-28: the Time Writing story and the month Task by the one rule of every page; only the setup's default hours.
    const month = await ensureMonthTask(config, pat, feature.id, owner, monthLabel, transport, adhoc, setup.task.originalEstimate)
    items.push(month.story)
    const task = month.task
    items.push(task)
    return { feature, items }
  } catch (failure) {
    throw new HierarchyCreationError(failure instanceof Error ? failure.message : 'Unable to complete the Feature children.', items)
  }
}

export async function createFeatureFromSetup(config: AzureConfig, pat: string, input: FeatureInput, setup: SetupChildren, monthLabel = currentIndiaMonth(), transport: AzureTransport = requestAzure, adhoc = false) {
  const feature = await createAzureFeature(config, pat, input, transport)
  try { return await completeFeatureFromSetup(config, pat, feature.id, setup, monthLabel, transport, input.storyIterationPath, input.assignedTo, adhoc) }
  catch (failure) {
    const partial = failure instanceof HierarchyCreationError ? failure.createdItems : []
    throw new HierarchyCreationError(`Feature #${feature.id} exists. ${failure instanceof Error ? failure.message : 'Child creation stopped.'} Use Complete children on that Feature after checking the source; do not recreate the Feature.`, mergeAzureWorkItems([feature], partial))
  }
}

// Changes a work item's state and/or iteration path, then reads it back and checks the change landed.
export async function updateAzureWorkItem(config: AzureConfig, pat: string, workItemId: number, update: { state?: string; iterationPath?: string }, transport: AzureTransport = requestAzure): Promise<AzureWorkItem> {
  if (!pat.trim()) throw new Error('Enter a Work Items (Read & Write) PAT.')
  if (!Number.isSafeInteger(workItemId) || workItemId < 1) throw new Error('Invalid work item.')
  const state = update.state?.trim(), iterationPath = update.iterationPath?.trim()
  if (!state && !iterationPath) throw new Error('Nothing to change.')
  if (state != null && (state.length > 64 || !/^[\p{L}\p{N} _-]+$/u.test(state))) throw new Error('Invalid state.')
  if (iterationPath != null && (iterationPath.length > 4096 || /\p{Cc}/u.test(iterationPath))) throw new Error('Invalid iteration path.')
  await transport({ ...config, pat, operation: 'update-work-item', workItemId, ...(state ? { state } : {}), ...(iterationPath ? { iterationPath } : {}) })
  const read = await transport({ ...config, pat, operation: 'items', ids: [workItemId] }) as { value?: RawItem[] }
  const raw = read.value?.find((item) => item.id === workItemId)
  if (!raw) throw new Error(`#${workItemId} was updated but could not be read back. Check it in Azure DevOps.`)
  const item = mapAzureWorkItem(raw, config)
  if ((state && item.state.toLowerCase() !== state.toLowerCase()) || (iterationPath && item.iterationPath.toLowerCase() !== iterationPath.toLowerCase())) throw new Error(`#${workItemId} was saved but Azure DevOps reports ${item.state} · ${item.iterationPath}. Check its rules in Azure DevOps.`)
  return item
}

// Edit an existing Feature, User Story or Task (the Edit form). The item is re-read first: a revision other than the
// one the form was opened at means it changed in Azure DevOps meanwhile, and nothing is sent. Locks: Type, Parent and
// Area Path are never written; the Time Writing story and a month Task keep their iteration; a month Task keeps the
// month in its title; a Feature keeps its DoD; Story fields only on a User Story, Target date only on a Feature,
// hours only on a Task. A month Task's hours follow Monthly Time Writing: Original Estimate is locked once planning
// has locked (or when tagged ad-hoc), Completed Work once actuals have locked, and Completed Work entered after the
// planning lock on a Task without an estimate tags it ad-hoc. The patch tests the revision, then the item is read back.
export interface EditLockRules { planningLocked: (month: string) => boolean; actualsLocked: (month: string) => boolean }
export async function editWorkItem(config: AzureConfig, pat: string, workItemId: number, rev: number, change: WorkItemEdit, rules: EditLockRules, transport: AzureTransport = requestAzure): Promise<AzureWorkItem> {
  if (!pat.trim()) throw new Error('Enter a Work Items (Read & Write) PAT.')
  const problem = editProblem(change)
  if (problem) throw new Error(problem)
  if (change.tags != null) throw new Error('Tags are not edited here.')
  const source = await transport({ ...config, pat, operation: 'items', ids: [workItemId] }) as { value?: RawItem[] }
  const raw = source.value?.find((item) => item.id === workItemId)
  const type = String(raw?.fields['System.WorkItemType'] ?? '')
  if (!raw || !['Feature', 'User Story', 'Task'].includes(type)) throw new Error(`#${workItemId} is not an accessible Feature, User Story or Task.`)
  if (raw.rev !== rev) throw new Error(conflictMessage(workItemId))
  const item = mapAzureWorkItem(raw, config)
  const locks = editLocks(item)
  if (change.iterationPath != null && locks.iterationLocked && change.iterationPath.trim() !== item.iterationPath) throw new Error(`The ${locks.monthTask ? 'month Task' : 'Time Writing story'} stays at ${item.iterationPath}; its iteration is not changed.`)
  if (change.title != null && locks.monthTask && timeWritingMonth(change.title) !== locks.monthTask) throw new Error('A month Task keeps its month in the title (e.g. “October 2026 | …”).')
  if (change.description != null && type === 'Feature' && !hasFeatureDoD(change.description)) throw new Error(missingDoDMessage)
  if ((change.storyPoints != null || change.priority != null || change.risk != null || change.valueArea != null) && type !== 'User Story') throw new Error('Story Points, Priority, Risk and Value area are edited on a User Story only.')
  if (change.targetDate != null && type !== 'Feature') throw new Error('Target date is edited on a Feature only.')
  if ((change.originalEstimate != null || change.completedWork != null) && type !== 'Task') throw new Error('Original Estimate and Completed Work are edited on a Task only.')
  const planChanged = change.originalEstimate != null && change.originalEstimate !== item.originalEstimate
  const actualChanged = change.completedWork != null && change.completedWork !== item.completedWork
  let tags: string | undefined
  if (locks.monthTask) {
    const adhoc = isAdhocTask(item.tags)
    if (planChanged && (rules.planningLocked(locks.monthTask) || adhoc)) throw new Error(`Original Estimate of a ${adhoc ? 'Task tagged ad-hoc' : 'month Task'} is locked${adhoc ? '' : ' (planning has locked for the month)'}. Unlock the period in Settings to change it.`)
    if (actualChanged && rules.actualsLocked(locks.monthTask)) throw new Error('Completed Work is locked (actuals have locked for the month). Unlock the period in Settings to change it.')
    if (actualChanged && rules.planningLocked(locks.monthTask) && !adhoc && item.originalEstimate == null) tags = withAdhocTag(item.tags)
  }
  await transport({ ...config, pat, operation: 'edit-work-item', workItemId, rev, edit: { ...change, ...(tags ? { tags } : {}) } })
  const read = await transport({ ...config, pat, operation: 'items', ids: [workItemId] }) as { value?: RawItem[] }
  const after = read.value?.find((entry) => entry.id === workItemId)
  if (!after) throw new Error(`#${workItemId} was saved but could not be read back. Check it in Azure DevOps.`)
  const updated = mapAzureWorkItem(after, config)
  const same = (a: string | undefined, b: string | undefined) => (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase()
  const mismatch = (change.title != null && updated.title.trim() !== change.title.trim()) || (change.iterationPath != null && !same(updated.iterationPath, change.iterationPath)) || (change.state != null && !same(updated.state, change.state))
    || (change.assignedTo != null && !same(updated.assignedToEmail, change.assignedTo)) || (change.storyPoints != null && updated.storyPoints !== change.storyPoints)
    || (change.originalEstimate != null && updated.originalEstimate !== change.originalEstimate) || (change.completedWork != null && updated.completedWork !== change.completedWork)
    || updated.areaPath !== item.areaPath || updated.parentId !== item.parentId || updated.workItemType !== item.workItemType
  if (mismatch) throw new Error(`#${workItemId} was saved but Azure DevOps reports other values. Check it in Azure DevOps.`)
  return updated
}
// The work item as the Edit form opens it: its fields now, with the revision to send back.
export async function readWorkItemForEdit(config: AzureConfig, pat: string, workItemId: number, transport: AzureTransport = requestAzure) {
  const source = await transport({ ...config, pat, operation: 'items', ids: [workItemId] }) as { value?: RawItem[] }
  const raw = source.value?.find((item) => item.id === workItemId)
  if (!raw || !Number.isSafeInteger(raw.rev)) throw new Error(`#${workItemId} could not be read from Azure DevOps.`)
  const text = (name: string) => typeof raw.fields[name] === 'string' ? raw.fields[name] as string : ''
  const number = (name: string) => typeof raw.fields[name] === 'number' ? raw.fields[name] as number : undefined
  return { item: mapAzureWorkItem(raw, config), rev: raw.rev!, description: editableText(text('System.Description')), acceptanceCriteria: editableText(text('Microsoft.VSTS.Common.AcceptanceCriteria')),
    priority: number('Microsoft.VSTS.Common.Priority'), risk: text('Microsoft.VSTS.Common.Risk'), valueArea: text('Microsoft.VSTS.Common.ValueArea') }
}
export interface WorkItemComment { id: number; text: string; author: string; date: string }
export async function readComments(config: AzureConfig, pat: string, workItemId: number, transport: AzureTransport = requestAzure): Promise<WorkItemComment[]> {
  const page = await transport({ ...config, pat, operation: 'comments', workItemId }) as { comments?: { id?: unknown; text?: unknown; createdBy?: unknown; createdDate?: unknown; isDeleted?: unknown }[] }
  if (!Array.isArray(page.comments)) throw new Error('Azure DevOps did not return the Discussion.')
  return page.comments.filter((comment) => comment.isDeleted !== true && typeof comment.id === 'number')
    .map((comment) => ({ id: comment.id as number, text: editableText(typeof comment.text === 'string' ? comment.text : ''), author: identityName(comment.createdBy) || 'Unknown', date: typeof comment.createdDate === 'string' ? comment.createdDate : '' }))
    .sort((a, b) => b.date.localeCompare(a.date))
}
export async function addComment(config: AzureConfig, pat: string, workItemId: number, text: string, transport: AzureTransport = requestAzure): Promise<WorkItemComment> {
  if (!pat.trim()) throw new Error('Enter a Work Items (Read & Write) PAT.')
  const comment = text.trim()
  if (!comment || comment.length > 100_000) throw new Error('Enter a comment (at most 100,000 characters).')
  const response = await transport({ ...config, pat, operation: 'add-comment', workItemId, comment }) as { id?: unknown; text?: unknown; createdBy?: unknown; createdDate?: unknown }
  if (typeof response.id !== 'number') throw new Error(`The comment on #${workItemId} could not be confirmed. Check the Discussion in Azure DevOps before retrying.`)
  return { id: response.id, text: editableText(typeof response.text === 'string' ? response.text : ''), author: identityName(response.createdBy) || 'You', date: typeof response.createdDate === 'string' ? response.createdDate : new Date().toISOString() }
}
