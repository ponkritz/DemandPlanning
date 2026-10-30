// Tokens live in request memory only. Feature creation has a separate, constrained payload builder.
// Base: Azure DevOps Services (https://dev.azure.com/<org>) or an Azure DevOps Server collection URL (https only).
function collectionBase(input) {
  if (input.baseUrl == null || input.baseUrl === '') return `https://dev.azure.com/${encodeURIComponent(input.organization)}`
  if (typeof input.baseUrl !== 'string' || input.baseUrl.length > 2048) throw new Error('Invalid base URL.')
  let url
  try { url = new URL(input.baseUrl) } catch { throw new Error('Invalid base URL.') }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('The base URL must be an https address without credentials, query or fragment.')
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
  return url.hostname === 'dev.azure.com' ? `https://dev.azure.com/${encodeURIComponent(parts[0] ?? input.organization)}` : `${url.origin}${parts.map((part) => `/${encodeURIComponent(part)}`).join('')}`
}
const projectBase = (input) => `${collectionBase(input)}/${encodeURIComponent(input.project)}`
// Writes go to Azure DevOps Services (dev.azure.com) only: on-premises servers are read-only, whatever the connection's role.
const writeOperations = ['create-feature', 'create-child', 'update-time-writing-effort', 'update-work-item']
function assertWritableBase(input) {
  if (!writeOperations.includes(input?.operation)) return
  if (new URL(collectionBase(input)).hostname !== 'dev.azure.com') throw new Error('Changes are written to Azure DevOps Services (dev.azure.com) only; on-premises servers are read-only. Nothing was changed.')
}
const apiVersion = (input) => typeof input.apiVersion === 'string' && /^\d{1,2}\.\d(-preview(\.\d)?)?$/.test(input.apiVersion) ? input.apiVersion : '7.1'

function azureReadRequest(input) {
  if (!input || typeof input !== 'object') throw new Error('Invalid Azure DevOps request.')
  for (const field of ['organization', 'project', 'team', 'pat']) {
    if (typeof input[field] !== 'string' || !input[field].trim() || input[field].length > 4096) throw new Error('Invalid connection details.')
  }
  const base = projectBase(input)
  let endpoint, body
  if (input.operation === 'areas') endpoint = `${encodeURIComponent(input.team)}/_apis/work/teamsettings/teamfieldvalues`
  else if (input.operation === 'backlog-epics') endpoint = `${encodeURIComponent(input.team)}/_apis/work/backlogs/Microsoft.EpicCategory/workItems`
  else if (input.operation === 'iterations') endpoint = `${encodeURIComponent(input.team)}/_apis/work/teamsettings/iterations`
  else if (input.operation === 'iteration-tree') endpoint = '_apis/wit/classificationnodes/iterations'
  else if (input.operation === 'fields') endpoint = '_apis/wit/fields'
  else if (input.operation === 'query') {
    if (typeof input.query !== 'string' || !/^SELECT \[System.Id\] FROM WorkItems WHERE /i.test(input.query) || input.query.length > 100000) throw new Error('Invalid read query.')
    endpoint = '_apis/wit/wiql'; body = { query: input.query }
  } else if (input.operation === 'items') {
    if (!Array.isArray(input.ids) || !input.ids.length || input.ids.length > 200 || input.ids.some((id) => !Number.isSafeInteger(id) || id < 1)) throw new Error('Invalid work-item batch.')
    endpoint = '_apis/wit/workitemsbatch'; body = { ids: input.ids, errorPolicy: 'Fail', $expand: 'Relations' }
  } else throw new Error('Only read operations are supported.')
  return { url: `${base}/${endpoint}?api-version=${apiVersion(input)}${input.operation === 'query' ? '&$top=1000' : ''}${input.operation === 'iteration-tree' ? '&$depth=10' : ''}`, options: {
    method: body ? 'POST' : 'GET', redirect: 'error',
    headers: { Authorization: `Basic ${Buffer.from(`:${input.pat.trim()}`).toString('base64')}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  } }
}

function azureFeatureRequest(input) {
  if (!input || !['create-feature', 'create-child'].includes(input.operation) || typeof input.validateOnly !== 'boolean') throw new Error('Invalid work-item creation request.')
  assertWritableBase(input)
  const type = input.operation === 'create-feature' ? 'Feature' : input.workItemType
  if (!['Feature', 'User Story', 'Task'].includes(type) || (input.operation === 'create-child' && type === 'Feature')) throw new Error('Unsupported child type.')
  // Reuse connection validation; callers never supply an arbitrary URL or JSON patch.
  const connection = azureReadRequest({ ...input, operation: 'areas' })
  const feature = input.feature
  if (!feature || !Number.isSafeInteger(feature.parentId) || feature.parentId < 1 || typeof feature.title !== 'string' || !feature.title.trim() || feature.title.length > 255 || typeof feature.areaPath !== 'string' || !feature.areaPath.trim()) throw new Error('A parent Epic, title and area path are required.')
  for (const field of ['description', 'acceptanceCriteria']) if (typeof feature[field] !== 'string' || feature[field].length > 100000) throw new Error('Invalid Feature text.')
  // Every created work item is assigned to someone (an email); never blank.
  if (typeof feature.assignedTo !== 'string' || feature.assignedTo.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(feature.assignedTo.trim())) throw new Error('A new work item must be assigned to someone (an email). Nothing was created.')
  if (feature.targetDate && !/^\d{4}-\d{2}-\d{2}$/.test(feature.targetDate)) throw new Error('Invalid target date.')
  if (feature.iterationPath != null && (typeof feature.iterationPath !== 'string' || feature.iterationPath.length > 4096)) throw new Error('Invalid iteration path.')
  for (const field of ['taskOriginalEstimate', 'taskCompletedWork']) if (feature[field] != null && (!Number.isFinite(feature[field]) || feature[field] < 0 || feature[field] > 1000000)) throw new Error('Invalid Task effort.')
  // The only tag a new work item can carry: 'ad-hoc' on a Time Writing Task created after planning has locked.
  if (feature.adhoc != null && (feature.adhoc !== true || type !== 'Task')) throw new Error('Only a new Task can be tagged ad-hoc. Nothing was created.')
  // A new User Story's Planning / Classification fields: fixed values only, on a new User Story only.
  const storyFields = ['storyPoints', 'priority', 'risk', 'valueArea'].filter((field) => feature[field] != null)
  if (storyFields.length && (type !== 'User Story' || input.operation !== 'create-child')) throw new Error('Story Points, Priority, Risk and Value area are set on a new User Story only. Nothing was created.')
  if (feature.storyPoints != null && (typeof feature.storyPoints !== 'number' || !Number.isFinite(feature.storyPoints) || feature.storyPoints < 0 || feature.storyPoints > 1000)) throw new Error('Story Points must be a number from 0 to 1,000. Nothing was created.')
  if (feature.priority != null && ![1, 2, 3, 4].includes(feature.priority)) throw new Error('Priority must be 1, 2, 3 or 4. Nothing was created.')
  if (feature.risk != null && !['1 - High', '2 - Medium', '3 - Low'].includes(feature.risk)) throw new Error('Risk must be 1 - High, 2 - Medium or 3 - Low. Nothing was created.')
  if (feature.valueArea != null && !['Business', 'Architectural'].includes(feature.valueArea)) throw new Error('Value area must be Business or Architectural. Nothing was created.')
  const htmlText = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('\n', '<br>')
  const base = projectBase(input)
  const patch = [
    { op: 'add', path: '/fields/System.Title', value: feature.title },
    { op: 'add', path: '/fields/System.AreaPath', value: feature.areaPath },
    { op: 'add', path: '/fields/System.Description', value: htmlText(feature.description) },
    { op: 'add', path: '/relations/-', value: { rel: 'System.LinkTypes.Hierarchy-Reverse', url: `${base}/_apis/wit/workItems/${feature.parentId}` } },
  ]
  if (feature.acceptanceCriteria.trim()) patch.push({ op: 'add', path: '/fields/Microsoft.VSTS.Common.AcceptanceCriteria', value: htmlText(feature.acceptanceCriteria) })
  if (feature.iterationPath) patch.push({ op: 'add', path: '/fields/System.IterationPath', value: feature.iterationPath })
  if (feature.assignedTo?.trim()) patch.push({ op: 'add', path: '/fields/System.AssignedTo', value: feature.assignedTo.trim() })
  if (feature.targetDate) patch.push({ op: 'add', path: '/fields/Microsoft.VSTS.Scheduling.TargetDate', value: `${feature.targetDate}T00:00:00Z` })
  if (feature.adhoc === true) patch.push({ op: 'add', path: '/fields/System.Tags', value: 'ad-hoc' })
  if (feature.storyPoints != null) patch.push({ op: 'add', path: '/fields/Microsoft.VSTS.Scheduling.StoryPoints', value: feature.storyPoints })
  if (feature.priority != null) patch.push({ op: 'add', path: '/fields/Microsoft.VSTS.Common.Priority', value: feature.priority })
  if (feature.risk != null) patch.push({ op: 'add', path: '/fields/Microsoft.VSTS.Common.Risk', value: feature.risk })
  if (feature.valueArea != null) patch.push({ op: 'add', path: '/fields/Microsoft.VSTS.Common.ValueArea', value: feature.valueArea })
  return { url: `${base}/_apis/wit/workitems/$${encodeURIComponent(type)}?api-version=${apiVersion(input)}&validateOnly=${input.validateOnly}`, options: {
    method: 'POST', redirect: 'error', headers: { ...connection.options.headers, 'Content-Type': 'application/json-patch+json' }, body: JSON.stringify(patch),
  } }
}

// Deliberately constrained write: Monthly effort can update only the two scheduling
// fields on a known Time Writing User Story; it cannot send an arbitrary JSON patch.
function azureTimeWritingEffortRequest(input) {
  if (!input || input.operation !== 'update-time-writing-effort') throw new Error('Invalid monthly effort request.')
  const connection = azureReadRequest({ ...input, operation: 'areas' })
  if (!Number.isSafeInteger(input.workItemId) || input.workItemId < 1 || (input.planHours == null && input.actualHours == null) || (input.planHours != null && (!Number.isFinite(input.planHours) || input.planHours < 0 || input.planHours > 1000000)) || (input.actualHours != null && (!Number.isFinite(input.actualHours) || input.actualHours < 0 || input.actualHours > 1000000)) || (input.tags != null && (typeof input.tags !== 'string' || input.tags.length > 100000))) throw new Error('Invalid Original Estimate or Completed Work.')
  const base = projectBase(input)
  const patch = [
    ...(input.planHours == null ? [] : [{ op: 'add', path: '/fields/Microsoft.VSTS.Scheduling.OriginalEstimate', value: input.planHours }]),
    ...(input.actualHours == null ? [] : [{ op: 'add', path: '/fields/Microsoft.VSTS.Scheduling.CompletedWork', value: input.actualHours }]),
    ...(input.tags ? [{ op: 'add', path: '/fields/System.Tags', value: input.tags }] : []),
  ]
  return { url: `${base}/_apis/wit/workitems/${input.workItemId}?api-version=${apiVersion(input)}`, options: {
    method: 'PATCH', redirect: 'error', headers: { ...connection.options.headers, 'Content-Type': 'application/json-patch+json' }, body: JSON.stringify(patch),
  } }
}

// Deliberately constrained write: only State and Iteration Path of one known work item.
function azureWorkItemUpdateRequest(input) {
  if (!input || input.operation !== 'update-work-item') throw new Error('Invalid work-item update.')
  const connection = azureReadRequest({ ...input, operation: 'areas' })
  if (!Number.isSafeInteger(input.workItemId) || input.workItemId < 1) throw new Error('Invalid work item.')
  const state = input.state == null ? undefined : input.state, iterationPath = input.iterationPath == null ? undefined : input.iterationPath
  if (state === undefined && iterationPath === undefined) throw new Error('Nothing to update.')
  if (state !== undefined && (typeof state !== 'string' || !state.trim() || state.length > 64 || !/^[\p{L}\p{N} _-]+$/u.test(state))) throw new Error('Invalid state.')
  if (iterationPath !== undefined && (typeof iterationPath !== 'string' || !iterationPath.trim() || iterationPath.length > 4096 || /\p{Cc}/u.test(iterationPath))) throw new Error('Invalid iteration path.')
  const patch = [
    ...(state === undefined ? [] : [{ op: 'add', path: '/fields/System.State', value: state }]),
    ...(iterationPath === undefined ? [] : [{ op: 'add', path: '/fields/System.IterationPath', value: iterationPath }]),
  ]
  return { url: `${projectBase(input)}/_apis/wit/workitems/${input.workItemId}?api-version=${apiVersion(input)}`, options: {
    method: 'PATCH', redirect: 'error', headers: { ...connection.options.headers, 'Content-Type': 'application/json-patch+json' }, body: JSON.stringify(patch),
  } }
}

// api-version negotiation: explicit version as is; otherwise 7.1, then 6.0 and 5.0 for older Azure DevOps Server.
const detectedVersions = new Map()
const isApiVersionError = (text) => /api[- ]?version|version of the api|VssVersionOutOfRange|out of range/i.test(text) && /version/i.test(text)

// fetchImpl: the main process passes Electron's net.fetch (Chromium network stack: Windows certificate store, system
// proxy), which on-prem servers with a company certificate need; tests pass a stub. Redirects are never followed.
async function requestAzureDevOps(input, fetchImpl = fetch) {
  const creating = input?.operation === 'create-feature' || input?.operation === 'create-child'
  const updating = input?.operation === 'update-time-writing-effort' || input?.operation === 'update-work-item'
  const writing = creating || updating
  if (writing) assertWritableBase(input)
  const request = creating ? azureFeatureRequest(input) : input?.operation === 'update-time-writing-effort' ? azureTimeWritingEffortRequest(input) : input?.operation === 'update-work-item' ? azureWorkItemUpdateRequest(input) : azureReadRequest(input)
  const collection = projectBase(input).split('/').slice(0, -1).join('/').toLowerCase()
  const explicit = typeof input.apiVersion === 'string' && apiVersion(input) === input.apiVersion
  const versions = explicit ? [input.apiVersion] : detectedVersions.has(collection) ? [detectedVersions.get(collection)] : ['7.1', '6.0', '5.0']
  let response
  for (const [attempt, version] of versions.entries()) {
    const url = request.url.replace(/api-version=[^&]*/, `api-version=${version}`)
    try { response = await fetchImpl(url, { ...request.options, redirect: 'manual', signal: AbortSignal.timeout(45000) }) }
    catch (error) {
      const detail = String(error?.cause?.code ?? error?.code ?? error?.message ?? '')
      const certificate = /CERT|SSL|TLS|self.signed|issuer/i.test(detail)
      throw new Error(writing && !input.validateOnly ? `${creating ? 'Creation' : 'Update'} could not be confirmed. Check the Azure DevOps work item before retrying.` : certificate ? `The server's certificate was not accepted (${detail.slice(0, 120)}). Ask IT whether the company root certificate is installed in Windows.` : `Azure DevOps could not be reached at ${new URL(url).host}. Check VPN, the server URL and the collection.${detail ? ` (${detail.slice(0, 120)})` : ''}`)
    }
    if (response.status === 400 && attempt < versions.length - 1) {
      const text = await response.clone().text().catch(() => '')
      if (isApiVersionError(text)) continue
    }
    if (response.ok && attempt > 0) detectedVersions.set(collection, version)
    break
  }
  if (response.status >= 300 && response.status < 400) throw new Error('Azure DevOps redirected the request (usually to a sign-in page). Check the PAT and that PATs are enabled on this server.')
  if (response.status === 401) throw new Error('PAT rejected or expired. Check Work Items (Read) access.')
  if (response.status === 403) throw new Error(`Access denied by Azure DevOps. Check Work Items (${writing ? 'Read & Write' : 'Read'}) scope and project permissions.`)
  if (writing && (response.status === 400 || response.status === 422)) {
    const detail = await response.json().catch(() => ({}))
    throw new Error(`Azure DevOps rejected the ${creating ? 'Feature' : 'update'}: ${String(detail.message ?? 'Check required fields and project rules.').replaceAll(input.pat.trim(), '[redacted]').slice(0, 1200)}`)
  }
  if (response.status === 404) throw new Error(`Not found at ${projectBase(input).replace(/^https:\/\//, '')}. Check the collection, project and team names.`)
  if (response.status === 400) {
    const detail = await response.json().catch(() => ({}))
    if (detail.message) throw new Error(`Azure DevOps refused the request: ${String(detail.message).replaceAll(input.pat.trim(), '[redacted]').slice(0, 600)}`)
  }
  if (!response.ok) throw new Error(writing && !input.validateOnly ? `${creating ? 'Create' : 'Update'} returned ${response.status}. Check Azure DevOps before retrying.` : `Azure DevOps returned ${response.status}. No data was imported.`)
  if (!(response.headers.get('content-type') ?? '').includes('application/json')) throw new Error('Azure DevOps returned a sign-in page. Check the PAT.')
  return response.json()
}

module.exports = { assertWritableBase, azureReadRequest, azureFeatureRequest, azureTimeWritingEffortRequest, azureWorkItemUpdateRequest, requestAzureDevOps }
