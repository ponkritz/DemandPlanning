// The Azure DevOps request client: connection settings and URLs, the transport (browser fetch or the desktop proxy),
// api-version negotiation, the write guards every request passes (CON-94, OI-10, on-premises read-only) and the
// constrained request bodies it sends (Feature / child create, effort, state and iteration, edit, comments).
import { assertNotViewingAs } from './viewAs.ts'
import { editPatch, editProblem, type WorkItemEdit } from './workItemEdit.ts'

// baseUrl is the organization (https://dev.azure.com/<org>) or, on premises, the Azure DevOps Server collection
// (e.g. https://tfs.example.com/tfs/DefaultCollection). Omitted means Azure DevOps Services for organization.
export interface AzureConfig { organization: string; project: string; team: string; baseUrl?: string; apiVersion?: string }

// Normalises a base URL: https only, no credentials, query or fragment. A dev.azure.com address keeps only the
// organization segment, so a pasted project URL also works; an on-prem collection URL is kept as given.
export function normalizeBaseUrl(value: string) {
  let url: URL
  try { url = new URL(value.trim()) } catch { throw new Error('Enter the base URL: https://dev.azure.com/<organization>, or your Azure DevOps Server collection URL.') }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('The base URL must use https and must not contain a user name or password.')
  if (url.search || url.hash) throw new Error('Remove the ? or # part from the base URL.')
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
  if (url.hostname === 'dev.azure.com') {
    if (!parts[0]) throw new Error('The base URL must include the organization: https://dev.azure.com/<organization>.')
    return `https://dev.azure.com/${encodeURIComponent(parts[0])}`
  }
  return `${url.origin}${parts.map(encodeURIComponent).map((part) => `/${part}`).join('')}`
}
export const isCloudBase = (baseUrl: string) => new URL(baseUrl).hostname === 'dev.azure.com'
export function collectionUrl(config: Pick<AzureConfig, 'organization' | 'baseUrl'>) { return config.baseUrl ? normalizeBaseUrl(config.baseUrl) : `https://dev.azure.com/${encodeURIComponent(config.organization)}` }
export const projectApiBase = (config: Pick<AzureConfig, 'organization' | 'project' | 'baseUrl'>) => `${collectionUrl(config)}/${encodeURIComponent(config.project)}`
// Azure DevOps Services accepts 7.1; older Azure DevOps Server versions need a lower version (e.g. 6.0 or 5.0).
export const apiVersionOf = (config: Pick<AzureConfig, 'apiVersion'>) => config.apiVersion && /^\d{1,2}\.\d(-preview(\.\d)?)?$/.test(config.apiVersion) ? config.apiVersion : '7.1'
export interface AzureRequest extends AzureConfig {
  operation: 'backlog-epics' | 'updates' | 'areas' | 'team-members' | 'iterations' | 'iteration-tree' | 'fields' | 'query' | 'items' | 'create-feature' | 'create-child' | 'update-time-writing-effort' | 'update-work-item' | 'edit-work-item' | 'comments' | 'add-comment' | 'update-comment' | 'saved-query' | 'saved-queries'
  pat: string
  // saved-query (DSH-19, SM-200): the saved query to run by its id (a GUID) — read only, as the other reads.
  queryId?: string
  query?: string
  ids?: number[]
  // adhoc: a new Time Writing Task created after planning has locked carries the 'ad-hoc' tag (Tasks only).
  // The Planning / Classification fields of a new User Story (＋ User Story only).
  feature?: FeatureInput & { areaPath: string; adhoc?: boolean } & StoryFields
  validateOnly?: boolean
  workItemType?: 'User Story' | 'Task'
  workItemId?: number
  planHours?: number
  actualHours?: number
  tags?: string
  state?: string
  expectedState?: string
  iterationPath?: string
  // edit-work-item: the fields to change and the revision they were read at (WorkItemEdit, workItemEdit.ts).
  edit?: WorkItemEdit
  rev?: number
  // add-comment: the comment as plain text (escaped, line breaks as <br>) — or, with htmlComment (PIR-14, a PI Review post
  // only), the app-built review list, sent as it is once safeCommentHtml accepts it.
  comment?: string
  htmlComment?: boolean
  // add-comment, PIR-13 (CON-113): a PI Review post — the reviewed Feature's Assigned To email ('' when not known). It
  // needs "PI Review: post the review of a Feature", or "Add a comment" when the writer is that assignee.
  reviewOf?: string
  // update-comment (PIR-34): the comment to replace — a PI review the viewer wrote, edited with Edit review… (only an
  // app-built review list: htmlComment and reviewOf are required, the same checks as add-comment).
  commentId?: number
  // comments (DSK-11, PIR-05): the next page of the Discussion, as Azure DevOps returned it (at most 2,048 characters).
  continuationToken?: string
}
export interface FeatureInput { parentId: number; title: string; description: string; acceptanceCriteria: string; areaPath?: string; iterationPath?: string; assignedTo?: string; startDate?: string; targetDate?: string; assignToCreator?: boolean; storyIterationPath?: string; taskOriginalEstimate?: number; taskCompletedWork?: number; priority?: number }

export const featureAcceptanceMessage = 'A new Feature keeps its Acceptance Criteria (Feature DoD) in the Description: the Acceptance Criteria field is not written. Nothing was created.'
export const validStoryPoints = (value: number) => Number.isFinite(value) && value >= 0 && value <= 1000
// The Azure DevOps User Story fields under Planning and Classification (Agile process): Story Points, Priority 1–4
// (Azure's default 2), Risk and Value area (default Business). Only these values can be written.
export const storyPriorities = [1, 2, 3, 4] as const
export const storyRisks = ['1 - High', '2 - Medium', '3 - Low'] as const
export const storyValueAreas = ['Business', 'Architectural'] as const
export interface StoryFields { storyPoints?: number; priority?: number; risk?: string; valueArea?: string }
// BKL-52: a new Feature (create-feature) may carry its Priority only (Microsoft.VSTS.Common.Priority, 1–4; the New
// Feature form's default 2, as Azure's); Story Points, Risk and Value area stay User Story fields.
export function featureFieldsProblem(fields: StoryFields | undefined) {
  if (!fields) return ''
  const { priority, ...rest } = fields
  if (priority != null && !(storyPriorities as readonly number[]).includes(priority)) return 'Priority must be 1, 2, 3 or 4.'
  return storyFieldsProblem(rest, false)
}
// '' when the fields are valid for a new User Story, else why not; any of them on another create is refused.
export function storyFieldsProblem(fields: StoryFields | undefined, isNewStory: boolean) {
  if (!fields) return ''
  const { storyPoints, priority, risk, valueArea } = fields
  if (storyPoints == null && priority == null && risk == null && valueArea == null) return ''
  if (!isNewStory) return 'Story Points, Priority, Risk and Value area are set on a new User Story only.'
  if (storyPoints != null && (typeof storyPoints !== 'number' || !validStoryPoints(storyPoints))) return 'Story Points must be a number from 0 to 1,000.'
  if (priority != null && !(storyPriorities as readonly number[]).includes(priority)) return 'Priority must be 1, 2, 3 or 4.'
  if (risk != null && !(storyRisks as readonly string[]).includes(risk)) return 'Risk must be 1 - High, 2 - Medium or 3 - Low.'
  if (valueArea != null && !(storyValueAreas as readonly string[]).includes(valueArea)) return 'Value area must be Business or Architectural.'
  return ''
}
export const validHours = (value: number) => Number.isFinite(value) && value >= 0 && value <= 1_000_000
// Every work item the app creates is assigned to someone: the person chosen, else the person creating it. Never blank.
export const isAssignee = (value: unknown): value is string => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())

const htmlText = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('\n', '<br>')
// BKL-20, PIR-14: what a comment is sent as — its text with & < > escaped and line breaks as <br>; no markup is ever
// taken from the user (the desktop proxy does the same).
export const commentHtml = htmlText
// PIR-14 (SM-183): the only HTML the app sends as a comment — its own review list: the tags <ul>, <ol>, <li> and <p>
// without attributes, every other character escaped (& only as &amp; &lt; &gt; &quot; &#39;; no raw < > " ').
// Checked in the web transport and again in the desktop proxy (electron/azure-devops.cjs) before anything is sent.
export const safeCommentHtml = (html: string) => /^(?:<\/?(?:ul|ol|li|p)>|&(?:amp|lt|gt|quot|#39);|[^<>&"'])*$/.test(html)

export function featurePatch(config: AzureConfig, feature: FeatureInput & { areaPath: string; adhoc?: boolean } & StoryFields) {
  const patch: { op: string; path: string; value: unknown }[] = [
    { op: 'add', path: '/fields/System.Title', value: feature.title },
    { op: 'add', path: '/fields/System.AreaPath', value: feature.areaPath },
    { op: 'add', path: '/fields/System.Description', value: htmlText(feature.description) },
    { op: 'add', path: '/relations/-', value: { rel: 'System.LinkTypes.Hierarchy-Reverse', url: `${projectApiBase(config)}/_apis/wit/workItems/${feature.parentId}` } },
  ]
  if (feature.acceptanceCriteria.trim()) patch.push({ op: 'add', path: '/fields/Microsoft.VSTS.Common.AcceptanceCriteria', value: htmlText(feature.acceptanceCriteria) })
  if (feature.iterationPath) patch.push({ op: 'add', path: '/fields/System.IterationPath', value: feature.iterationPath })
  if (feature.assignedTo?.trim()) patch.push({ op: 'add', path: '/fields/System.AssignedTo', value: feature.assignedTo.trim() })
  // BKL-31: the Feature's Start Date (Azure DevOps Start Date field), when one was entered.
  if (feature.startDate) patch.push({ op: 'add', path: '/fields/Microsoft.VSTS.Scheduling.StartDate', value: `${feature.startDate}T00:00:00Z` })
  if (feature.targetDate) patch.push({ op: 'add', path: '/fields/Microsoft.VSTS.Scheduling.TargetDate', value: `${feature.targetDate}T00:00:00Z` })
  if (feature.adhoc === true) patch.push({ op: 'add', path: '/fields/System.Tags', value: 'ad-hoc' })
  if (feature.storyPoints != null) patch.push({ op: 'add', path: '/fields/Microsoft.VSTS.Scheduling.StoryPoints', value: feature.storyPoints })
  if (feature.priority != null) patch.push({ op: 'add', path: '/fields/Microsoft.VSTS.Common.Priority', value: feature.priority })
  if (feature.risk != null) patch.push({ op: 'add', path: '/fields/Microsoft.VSTS.Common.Risk', value: feature.risk })
  if (feature.valueArea != null) patch.push({ op: 'add', path: '/fields/Microsoft.VSTS.Common.ValueArea', value: feature.valueArea })
  return patch
}

// Constrained write: only System.State and System.IterationPath can change through this path.
export function workItemUpdatePatch(request: Pick<AzureRequest, 'state' | 'iterationPath' | 'expectedState'>) {
  const patch: { op: 'add' | 'test'; path: string; value: string }[] = []
  if (request.expectedState != null) {
    if (!request.state || typeof request.expectedState !== 'string' || !request.expectedState.trim() || request.expectedState.length > 64) throw new Error('Invalid expected state.')
    patch.push({ op: 'test', path: '/fields/System.State', value: request.expectedState })
  }
  if (request.state != null) patch.push({ op: 'add', path: '/fields/System.State', value: request.state })
  if (request.iterationPath != null) patch.push({ op: 'add', path: '/fields/System.IterationPath', value: request.iterationPath })
  return patch
}

export const conflictMessage = (id: number) => `#${id} was changed in Azure DevOps since you opened it. Nothing was saved: open it again to see the changes, then edit.`
// Work-item Discussion: read the comments and add one (Azure DevOps work-item Comments API, a preview API on
// dev.azure.com). The comment is sent as text: line breaks become <br>, no markup is taken from the user.
export const commentsApiVersion = '7.1-preview.4'
// DSK-11, PIR-05: a Discussion page token is only accepted on the read, as a non-empty text of at most 2,048 characters,
// and is sent URL-encoded in the query string (never in the path or as a host).
export const maxContinuationToken = 2048
export function continuationTokenProblem(request: Pick<AzureRequest, 'operation' | 'continuationToken'>) {
  if (request.continuationToken == null) return ''
  if (request.operation !== 'comments') return 'A page token is accepted only when reading the Discussion.'
  return typeof request.continuationToken === 'string' && request.continuationToken.length > 0 && request.continuationToken.length <= maxContinuationToken ? '' : 'Invalid Discussion page token.'
}
// PIR-06: Azure DevOps asked to slow down (HTTP 429). The message carries the status and the Retry-After seconds, so the
// reason survives the desktop proxy (only the message crosses IPC); rateLimitWait reads them back.
export const rateLimitMessage = (retryAfter: string | null) => { const seconds = Number(retryAfter); return `Azure DevOps is limiting requests (429).${Number.isFinite(seconds) && seconds >= 0 && retryAfter?.trim() ? ` Retry after ${Math.ceil(seconds)} s.` : ''}` }
export function rateLimitWait(failure: unknown): number | null {
  const text = failure instanceof Error ? failure.message : String(failure ?? '')
  if (!/\(429\)/.test(text)) return null
  const seconds = /Retry after (\d+) s\./.exec(text)
  return seconds ? Number(seconds[1]) : 0
}
// PIR-34: update-comment — PATCH …/comments/{commentId} with the new text (the Work Items Comments "Update Comment" call,
// the same preview api-version as the read and the add; LIM-94 records that it was not verified against the docs here).
async function requestComments(request: AzureRequest) {
  const updating = request.operation === 'update-comment'
  const adding = request.operation === 'add-comment' || updating
  const url = `${projectApiBase(request)}/_apis/wit/workItems/${request.workItemId}/comments${updating ? `/${request.commentId}` : ''}?api-version=${commentsApiVersion}${adding ? '' : `&order=desc&$top=200${request.continuationToken ? `&continuationToken=${encodeURIComponent(request.continuationToken)}` : ''}`}`
  let response: Response
  try {
    response = await fetch(url, { method: updating ? 'PATCH' : adding ? 'POST' : 'GET', redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(45000),
      headers: { Authorization: `Basic ${btoa(`:${request.pat}`)}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      ...(adding ? { body: JSON.stringify({ text: request.htmlComment ? request.comment! : htmlText(request.comment!) }) } : {}) })
  } catch { throw new Error(adding ? `The comment on #${request.workItemId} could not be confirmed. Check the Discussion in Azure DevOps before retrying.` : 'Azure DevOps could not be reached. Check your network/VPN.') }
  if (response.status === 401) throw new Error('The PAT was rejected or has expired. Check your PAT.')
  if (response.status === 403) throw new Error(`Access denied. Check project access and PAT Work Items (${adding ? 'Read & Write' : 'Read'}) scope.`)
  if (response.status === 429) throw new Error(`${rateLimitMessage(response.headers.get('Retry-After'))}${adding ? ' The comment was not added: post it again later.' : ''}`)
  if (!response.ok) { const detail = await response.json().catch(() => ({})) as { message?: string }; throw new Error(`Azure DevOps ${updating ? 'did not update the comment' : adding ? 'did not add the comment' : 'did not return the Discussion'} (${response.status})${detail.message ? `: ${detail.message.replaceAll(request.pat.trim(), '[redacted]').slice(0, 600)}` : '.'}`) }
  if (!(response.headers.get('content-type') ?? '').includes('application/json')) throw new Error('Azure DevOps returned a sign-in page. Check the PAT and organization access.')
  return response.json()
}

export type AzureTransport = (request: AzureRequest) => Promise<unknown>
// DSH-19, SM-200: a saved query is run by its id only (a GUID, sent in the path of the fixed wiql endpoint, GET) with at
// most 5,001 ids back, so a result over the 5,000-row cap is known; the list of saved queries is two folder levels deep.
export const savedQueryId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const savedQueryTop = 5001

declare global {
  interface Window { azureDevOps?: { request: AzureTransport } }
}

// api-version negotiation: an explicit version is used as is; otherwise 7.1, then 6.0 and 5.0 for older Azure DevOps
// Server releases. The version that worked is remembered per collection for the rest of the session.
const detectedVersions = new Map<string, string>()
export function versionsToTry(config: Pick<AzureConfig, 'apiVersion' | 'organization' | 'baseUrl'>) {
  if (config.apiVersion && apiVersionOf(config) === config.apiVersion) return [config.apiVersion]
  const known = detectedVersions.get(collectionUrl(config).toLowerCase())
  return known ? [known] : ['7.1', '6.0', '5.0']
}
export const isApiVersionError = (text: string) => /api[- ]?version|version of the api|VssVersionOutOfRange|out of range/i.test(text) && /version/i.test(text)

// Set by the app from the viewer's access roles; while it returns false, nothing is changed in Azure DevOps.
// CON-94: each change needs its own permission (a request that changes the state and the iteration needs both).
// CON-101 (fail closed): nothing is allowed until the app sets the guard; refused tells why (no roles file loaded).
let writesAllowed: (permission: AzureWritePermission) => boolean = () => false
let refusedBecause = 'The access roles are not loaded yet, so the app is read-only. Nothing was changed.'
// CON-113: the writer's work email (the Time Writing connection's), for a PI Review post on their own Feature.
let writerEmail = ''
export function guardAzureWrites(check: (permission: AzureWritePermission) => boolean, refused = 'Your role does not allow this change in Azure DevOps. An Admin can change this in Admin → People & access → Role rights.', email = '') { writesAllowed = check; refusedBecause = refused; writerEmail = email.trim().toLowerCase() }
// PIR-70: the work email of the Product Owner of the Epic a work item is under ('' for none), set by the app from the
// fetched items and the shared Epic setup in Git (EPS-11) — never taken from the request.
let epicOwnerEmail: (workItemId: number) => string = () => ''
export function guardEpicOwners(lookup: (workItemId: number) => string) { epicOwnerEmail = lookup }
// CON-113, PIR-13: a PI Review post is allowed with "PI Review: post the review of a Feature" (the leads), or with "Add a
// comment" for the Feature's own assignee (the writer's work email is the Feature's Assigned To email). PIR-70: or with
// "Add a comment" for the Product Owner of the Feature's Epic (the writer's work email is the Epic's Product Owner's).
export function reviewPostAllowed(reviewOf: string, allowed: (permission: AzureWritePermission) => boolean = writesAllowed, email = writerEmail, owner = '') {
  const assignee = reviewOf.trim().toLowerCase(), me = email.trim().toLowerCase(), po = owner.trim().toLowerCase()
  return allowed('pireview.post') || (allowed('work.comment') && Boolean(me) && ((Boolean(assignee) && assignee === me) || (Boolean(po) && po === me)))
}
// OI-10: with the synthetic sample loaded nothing is written to Azure DevOps, from any page (set by the workspace).
let sampleLoaded = () => false
export function guardSampleWrites(isSample: () => boolean) { sampleLoaded = isSample }
export type AzureWritePermission = 'azure.write' | 'work.edit' | 'work.state' | 'work.move' | 'work.hours' | 'work.comment' | 'pireview.post'
export function writePermissions(request: Pick<AzureRequest, 'operation' | 'state' | 'iterationPath'>): AzureWritePermission[] {
  switch (request.operation) {
    case 'create-feature': case 'create-child': return ['azure.write']
    case 'edit-work-item': return ['work.edit']
    case 'update-time-writing-effort': return ['work.hours']
    case 'add-comment': case 'update-comment': return ['work.comment']
    case 'update-work-item': return [...(request.state ? ['work.state' as const] : []), ...(request.iterationPath || !request.state ? ['work.move' as const] : [])]
    default: return []
  }
}
export const changesAzure = (operation: AzureRequest['operation']) => operation === 'create-feature' || operation === 'create-child' || operation === 'update-time-writing-effort' || operation === 'update-work-item' || operation === 'edit-work-item' || operation === 'add-comment' || operation === 'update-comment'

// Writes go to Azure DevOps Services (dev.azure.com) only: on-premises servers are read-only, whatever the connection's
// role. Checked here and again in the desktop proxy.
export function assertWritableBase(config: Pick<AzureConfig, 'organization' | 'baseUrl'>, operation: AzureRequest['operation']) {
  if (changesAzure(operation) && !isCloudBase(collectionUrl(config))) throw new Error('Changes are written to Azure DevOps Services (dev.azure.com) only; on-premises servers are read-only. Nothing was changed.')
}
export async function requestAzure(request: AzureRequest): Promise<unknown> {
  if (changesAzure(request.operation)) assertNotViewingAs()
  if (changesAzure(request.operation) && sampleLoaded()) throw new Error('Synthetic sample data is loaded: nothing is written to Azure DevOps. Fetch your data first.')
  const review = request.operation === 'add-comment' || request.operation === 'update-comment'
  if (request.reviewOf != null && (!review || typeof request.reviewOf !== 'string')) throw new Error('Invalid PI Review post.')
  // PIR-34: an update is only ever a PI review edited from My PI Review: the review's rights, its HTML check, its comment id.
  if (request.operation === 'update-comment' && (request.reviewOf == null || request.htmlComment !== true || !Number.isSafeInteger(request.commentId) || request.commentId! < 1)) throw new Error('Only a PI review can be edited. Nothing was changed.')
  if (request.commentId != null && request.operation !== 'update-comment') throw new Error('Invalid comment.')
  if (changesAzure(request.operation) && !(review && request.reviewOf != null ? reviewPostAllowed(request.reviewOf, writesAllowed, writerEmail, Number.isSafeInteger(request.workItemId) ? epicOwnerEmail(request.workItemId!) : '') : writePermissions(request).every((permission) => writesAllowed(permission)))) throw new Error(request.reviewOf != null && writesAllowed('work.comment') ? 'Only the Feature’s assignee, the Product Owner of its Epic or a lead with “PI Review: post the review of a Feature” can post its review. Nothing was posted.' : refusedBecause)
  assertWritableBase(request, request.operation)
  if ((request.operation === 'create-feature' || request.operation === 'create-child') && !isAssignee(request.feature?.assignedTo)) throw new Error('A new work item must be assigned to someone (an email). Nothing was created.')
  // BKL-53 (SM-295): a new Feature has one acceptance field, the Acceptance Criteria (Feature DoD) at the top of its
  // Description; the Azure DevOps Acceptance Criteria field is never written on a Feature create (User Stories keep it).
  if (request.operation === 'create-feature' && request.feature?.acceptanceCriteria?.trim()) throw new Error(featureAcceptanceMessage)
  const storyProblem = request.operation === 'create-feature' ? featureFieldsProblem(request.feature) : storyFieldsProblem(request.feature, request.operation === 'create-child' && request.workItemType === 'User Story')
  if (storyProblem) throw new Error(`${storyProblem} Nothing was created.`)
  if (request.feature?.adhoc != null && (request.feature.adhoc !== true || request.operation !== 'create-child' || request.workItemType !== 'Task')) throw new Error('Only a new Task can be tagged ad-hoc. Nothing was created.')
  if (request.operation === 'edit-work-item') { const problem = !Number.isSafeInteger(request.workItemId) || request.workItemId! < 1 || !Number.isSafeInteger(request.rev) || request.rev! < 1 ? 'Invalid work item or revision.' : editProblem(request.edit ?? {}); if (problem) throw new Error(`${problem} Nothing was changed.`) }
  if ((request.operation === 'comments' || review || request.operation === 'updates') && (!Number.isSafeInteger(request.workItemId) || request.workItemId! < 1)) throw new Error('Invalid work item.')
  if (request.operation === 'saved-query' && !savedQueryId.test(request.queryId ?? '')) throw new Error('Invalid saved query id.')
  if (request.queryId != null && request.operation !== 'saved-query') throw new Error('Invalid saved query id.')
  const tokenProblem = continuationTokenProblem(request)
  if (tokenProblem) throw new Error(tokenProblem)
  if (review && (typeof request.comment !== 'string' || !request.comment.trim() || request.comment.length > 100_000)) throw new Error('Enter a comment (at most 100,000 characters). Nothing was added.')
  if (request.htmlComment != null && (request.htmlComment !== true || !review || request.reviewOf == null || !safeCommentHtml(request.comment ?? ''))) throw new Error('The review comment holds markup the app does not send. Nothing was posted.')
  if (window.azureDevOps) return window.azureDevOps.request(request)
  if (request.operation === 'comments' || review) return requestComments(request)
  const base = projectApiBase(request)
  const updating = request.operation === 'update-time-writing-effort' || request.operation === 'update-work-item' || request.operation === 'edit-work-item'
  const writing = request.operation === 'create-feature' || request.operation === 'create-child' || updating
  const readingMetadata = request.operation === 'updates' || request.operation === 'backlog-epics' || request.operation === 'areas' || request.operation === 'team-members' || request.operation === 'iterations' || request.operation === 'iteration-tree' || request.operation === 'fields' || request.operation === 'saved-query' || request.operation === 'saved-queries'
  const create = request.operation === 'create-feature' || request.operation === 'create-child'
  const endpoint = request.operation === 'updates' ? `_apis/wit/workItems/${request.workItemId}/updates` : updating ? `_apis/wit/workitems/${request.workItemId}` : create ? `_apis/wit/workitems/$${request.operation === 'create-feature' ? 'Feature' : encodeURIComponent(request.workItemType!)}` : request.operation === 'backlog-epics' ? `${encodeURIComponent(request.team)}/_apis/work/backlogs/Microsoft.EpicCategory/workItems` : request.operation === 'iteration-tree' ? '_apis/wit/classificationnodes/iterations' : request.operation === 'fields' ? '_apis/wit/fields' : request.operation === 'saved-query' ? `_apis/wit/wiql/${request.queryId!.toLowerCase()}` : request.operation === 'saved-queries' ? '_apis/wit/queries' : readingMetadata ? `${encodeURIComponent(request.team)}/_apis/work/teamsettings/${request.operation === 'areas' ? 'teamfieldvalues' : 'iterations'}` : request.operation === 'query' ? '_apis/wit/wiql' : '_apis/wit/workitemsbatch'
  const body = request.operation === 'edit-work-item' ? editPatch(request.edit!, request.rev!) : request.operation === 'update-work-item' ? workItemUpdatePatch(request) : request.operation === 'update-time-writing-effort' ? [{ ...(request.planHours == null ? {} : { op: 'add', path: '/fields/Microsoft.VSTS.Scheduling.OriginalEstimate', value: request.planHours }) }, { ...(request.actualHours == null ? {} : { op: 'add', path: '/fields/Microsoft.VSTS.Scheduling.CompletedWork', value: request.actualHours }) }, ...(request.tags ? [{ op: 'add', path: '/fields/System.Tags', value: request.tags }] : [])].filter(patch => 'op' in patch) : create ? featurePatch(request, request.feature!) : request.operation === 'query' ? { query: request.query } : { ids: request.ids, errorPolicy: 'Fail', $expand: 'Relations' }
  const versions = versionsToTry(request)
  let response: Response | undefined
  for (const [attempt, version] of versions.entries()) {
    try {
      const url = request.operation === 'team-members' ? `${collectionUrl(request)}/_apis/projects/${encodeURIComponent(request.project)}/teams/${encodeURIComponent(request.team)}/members?api-version=${version}&$top=1000` : `${base}/${endpoint}?api-version=${version}${request.operation === 'query' ? `&$top=${/\bFROM\s+WorkItemLinks\b/i.test(request.query ?? '') ? 20000 : 1000}` : ''}${request.operation === 'iteration-tree' ? '&$depth=10' : ''}${request.operation === 'updates' ? '&$top=200' : ''}${request.operation === 'saved-query' ? `&$top=${savedQueryTop}` : ''}${request.operation === 'saved-queries' ? '&$depth=2' : ''}${create ? `&validateOnly=${request.validateOnly === true}` : ''}`
      response = await fetch(url, {
        method: readingMetadata ? 'GET' : updating ? 'PATCH' : 'POST', redirect: 'error', credentials: 'omit',
        headers: { Authorization: `Basic ${btoa(`:${request.pat}`)}`, 'Content-Type': writing ? 'application/json-patch+json' : 'application/json', Accept: 'application/json' },
        body: readingMetadata ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(45000),
      })
    } catch {
      const host = new URL(base).hostname
      throw new Error(updating ? `The update of #${request.workItemId} could not be confirmed. Check it in Azure DevOps before retrying.` : writing && !request.validateOnly ? 'The create request could not be confirmed. Check the Azure DevOps backlog before retrying; a Feature may have been created.'
        : host === 'dev.azure.com' ? 'Azure DevOps could not be reached. Check your network/VPN. If browser cross-origin access is blocked, use the desktop package with the same PAT.'
          : `The browser could not reach ${host}. On-premises servers usually block requests from other websites (CORS) or use a company certificate the browser page cannot use. Use the Windows app for on-prem connections (on VPN); it sends requests itself.`)
    }
    // An older Azure DevOps Server rejects a newer api-version with HTTP 400; try the next lower version once.
    if (response.status === 400 && attempt < versions.length - 1) {
      const text = await response.clone().text().catch(() => '')
      if (isApiVersionError(text)) continue
    }
    if (response.ok && attempt > 0) detectedVersions.set(collectionUrl(request).toLowerCase(), version)
    break
  }
  if (!response) throw new Error('Azure DevOps could not be reached.')
  if (response.status === 401) throw new Error('The PAT was rejected or has expired. Check your PAT.')
  if (response.status === 403) throw new Error(`Access denied. Check project access and PAT Work Items (${writing ? 'Read & Write' : 'Read'}) scope.`)
  if (request.operation === 'edit-work-item' && (response.status === 412 || response.status === 409)) throw new Error(conflictMessage(request.workItemId!))
  if (writing && (response.status === 400 || response.status === 422)) {
    const detail = await response.json().catch(() => ({})) as { message?: string }
    throw new Error(`Azure DevOps rejected the work item: ${(detail.message ?? 'Check required fields and project rules.').replaceAll(request.pat.trim(), '[redacted]').slice(0, 1200)}`)
  }
  if (response.status === 404) throw new Error(`Not found at ${projectApiBase(request).replace(/^https:\/\//, '')}. Check the organization / collection, project and team names.`)
  if (!response.ok && response.status === 400) {
    const detail = await response.json().catch(() => ({})) as { message?: string }
    if (detail.message) throw new Error(`Azure DevOps refused the request: ${detail.message.replaceAll(request.pat.trim(), '[redacted]').slice(0, 600)}`)
  }
  if (!response.ok) throw new Error(updating ? `Update of #${request.workItemId} returned ${response.status}. Check it in Azure DevOps.` : writing && !request.validateOnly ? `Create request returned ${response.status}. Check the backlog before retrying to avoid duplicates.` : `Azure DevOps request failed (${response.status}). No data was imported.`)
  if (!(response.headers.get('content-type') ?? '').includes('application/json')) throw new Error('Azure DevOps returned a sign-in page. Check the PAT and organization access.')
  return response.json()
}
