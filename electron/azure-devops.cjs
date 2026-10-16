// Tokens live in request memory only. Feature creation has a separate, constrained payload builder.
function azureReadRequest(input) {
  if (!input || typeof input !== 'object') throw new Error('Invalid Azure DevOps request.')
  for (const field of ['organization', 'project', 'team', 'pat']) {
    if (typeof input[field] !== 'string' || !input[field].trim() || input[field].length > 4096) throw new Error('Invalid connection details.')
  }
  const base = `https://dev.azure.com/${encodeURIComponent(input.organization)}/${encodeURIComponent(input.project)}`
  let endpoint, body
  if (input.operation === 'identity') {
    return { url: `https://dev.azure.com/${encodeURIComponent(input.organization)}/_apis/connectionData?api-version=7.1-preview.1`, options: { method: 'GET', redirect: 'error', headers: { Authorization: `Basic ${Buffer.from(`:${input.pat.trim()}`).toString('base64')}`, Accept: 'application/json' } } }
  }
  if (input.operation === 'areas') endpoint = `${encodeURIComponent(input.team)}/_apis/work/teamsettings/teamfieldvalues`
  else if (input.operation === 'iterations') endpoint = `${encodeURIComponent(input.team)}/_apis/work/teamsettings/iterations`
  else if (input.operation === 'iteration-tree') endpoint = '_apis/wit/classificationnodes/iterations'
  else if (input.operation === 'query') {
    if (typeof input.query !== 'string' || !/^SELECT \[System.Id\] FROM WorkItems WHERE /i.test(input.query) || input.query.length > 100000) throw new Error('Invalid read query.')
    endpoint = '_apis/wit/wiql'; body = { query: input.query }
  } else if (input.operation === 'items') {
    if (!Array.isArray(input.ids) || !input.ids.length || input.ids.length > 200 || input.ids.some((id) => !Number.isSafeInteger(id) || id < 1)) throw new Error('Invalid work-item batch.')
    endpoint = '_apis/wit/workitemsbatch'; body = { ids: input.ids, errorPolicy: 'Fail', $expand: 'Relations' }
  } else throw new Error('Only read operations are supported.')
  return { url: `${base}/${endpoint}?api-version=7.1${input.operation === 'query' ? '&$top=1000' : ''}${input.operation === 'iteration-tree' ? '&$depth=10' : ''}`, options: {
    method: body ? 'POST' : 'GET', redirect: 'error',
    headers: { Authorization: `Basic ${Buffer.from(`:${input.pat.trim()}`).toString('base64')}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  } }
}

function azureFeatureRequest(input) {
  if (!input || !['create-feature', 'create-child'].includes(input.operation) || typeof input.validateOnly !== 'boolean') throw new Error('Invalid work-item creation request.')
  const type = input.operation === 'create-feature' ? 'Feature' : input.workItemType
  if (!['Feature', 'User Story', 'Task'].includes(type) || (input.operation === 'create-child' && type === 'Feature')) throw new Error('Unsupported child type.')
  // Reuse connection validation; callers never supply an arbitrary URL or JSON patch.
  const connection = azureReadRequest({ ...input, operation: 'areas' })
  const feature = input.feature
  if (!feature || !Number.isSafeInteger(feature.parentId) || feature.parentId < 1 || typeof feature.title !== 'string' || !feature.title.trim() || feature.title.length > 255 || typeof feature.areaPath !== 'string' || !feature.areaPath.trim()) throw new Error('A parent Epic, title and area path are required.')
  for (const field of ['description', 'acceptanceCriteria']) if (typeof feature[field] !== 'string' || feature[field].length > 100000) throw new Error('Invalid Feature text.')
  if (feature.assignedTo != null && (typeof feature.assignedTo !== 'string' || feature.assignedTo.length > 320)) throw new Error('Invalid assignee.')
  if (feature.targetDate && !/^\d{4}-\d{2}-\d{2}$/.test(feature.targetDate)) throw new Error('Invalid target date.')
  if (feature.iterationPath != null && (typeof feature.iterationPath !== 'string' || feature.iterationPath.length > 4096)) throw new Error('Invalid iteration path.')
  const htmlText = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('\n', '<br>')
  const base = `https://dev.azure.com/${encodeURIComponent(input.organization)}/${encodeURIComponent(input.project)}`
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
  return { url: `${base}/_apis/wit/workitems/$${encodeURIComponent(type)}?api-version=7.1&validateOnly=${input.validateOnly}`, options: {
    method: 'POST', redirect: 'error', headers: { ...connection.options.headers, 'Content-Type': 'application/json-patch+json' }, body: JSON.stringify(patch),
  } }
}

async function requestAzureDevOps(input) {
  const writing = input?.operation === 'create-feature' || input?.operation === 'create-child'
  const request = writing ? azureFeatureRequest(input) : azureReadRequest(input)
  let response
  try { response = await fetch(request.url, { ...request.options, signal: AbortSignal.timeout(45000) }) }
  catch { throw new Error(writing && !input.validateOnly ? 'Creation could not be confirmed. Check the backlog before retrying; a Feature may have been created.' : 'Azure DevOps could not be reached. Check network/VPN access and the organization URL.') }
  if (response.status === 401) throw new Error('PAT rejected or expired. Check Work Items (Read) access.')
  if (response.status === 403) throw new Error(`Access denied by Azure DevOps. Check Work Items (${writing ? 'Read & Write' : 'Read'}) scope and project permissions.`)
  if (writing && (response.status === 400 || response.status === 422)) {
    const detail = await response.json().catch(() => ({}))
    throw new Error(`Azure DevOps rejected the Feature: ${String(detail.message ?? 'Check required fields and project rules.').replaceAll(input.pat, '[redacted]').slice(0, 1200)}`)
  }
  if (response.status === 404) throw new Error('Project or team not found. Check connection details.')
  if (!response.ok) throw new Error(writing && !input.validateOnly ? `Create returned ${response.status}. Check the backlog before retrying to avoid duplicates.` : `Azure DevOps returned ${response.status}. No data was imported.`)
  if (!(response.headers.get('content-type') ?? '').includes('application/json')) throw new Error('Azure DevOps returned a sign-in page. Check the PAT.')
  return response.json()
}

module.exports = { azureReadRequest, azureFeatureRequest, requestAzureDevOps }
