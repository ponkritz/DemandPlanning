// This bridge only reads team metadata and work items. Tokens live in request memory only.
function azureReadRequest(input) {
  if (!input || typeof input !== 'object') throw new Error('Invalid Azure DevOps request.')
  for (const field of ['organization', 'project', 'team', 'pat']) {
    if (typeof input[field] !== 'string' || !input[field].trim() || input[field].length > 4096) throw new Error('Invalid connection details.')
  }
  const base = `https://dev.azure.com/${encodeURIComponent(input.organization)}/${encodeURIComponent(input.project)}`
  let endpoint, body
  if (input.operation === 'areas') endpoint = `${encodeURIComponent(input.team)}/_apis/work/teamsettings/teamfieldvalues`
  else if (input.operation === 'query') {
    if (typeof input.query !== 'string' || !/^SELECT \[System.Id\] FROM WorkItems WHERE /i.test(input.query) || input.query.length > 100000) throw new Error('Invalid read query.')
    endpoint = '_apis/wit/wiql'; body = { query: input.query }
  } else if (input.operation === 'items') {
    if (!Array.isArray(input.ids) || !input.ids.length || input.ids.length > 200 || input.ids.some((id) => !Number.isSafeInteger(id) || id < 1)) throw new Error('Invalid work-item batch.')
    endpoint = '_apis/wit/workitemsbatch'; body = { ids: input.ids, errorPolicy: 'Fail' }
  } else throw new Error('Only read operations are supported.')
  return { url: `${base}/${endpoint}?api-version=7.1${input.operation === 'query' ? '&$top=1000' : ''}`, options: {
    method: body ? 'POST' : 'GET', redirect: 'error',
    headers: { Authorization: `Basic ${Buffer.from(`:${input.pat.trim()}`).toString('base64')}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  } }
}

async function readAzureDevOps(input) {
  const request = azureReadRequest(input)
  let response
  try { response = await fetch(request.url, { ...request.options, signal: AbortSignal.timeout(45000) }) }
  catch { throw new Error('Azure DevOps could not be reached. Check network/VPN access and the organization URL.') }
  if (response.status === 401) throw new Error('PAT rejected or expired. Check Work Items (Read) access.')
  if (response.status === 403) throw new Error('Access denied by Azure DevOps. Check project permissions and PAT policy.')
  if (response.status === 404) throw new Error('Project or team not found. Check connection details.')
  if (!response.ok) throw new Error(`Azure DevOps returned ${response.status}. No data was imported.`)
  if (!(response.headers.get('content-type') ?? '').includes('application/json')) throw new Error('Azure DevOps returned a sign-in page. Check the PAT.')
  return response.json()
}

module.exports = { azureReadRequest, readAzureDevOps }
