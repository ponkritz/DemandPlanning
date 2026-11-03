import type { GitConfig } from './gitStorage'

// Read on request from the private data repository, never bundled or cached in app data.
export const validationRoot = 'tool-validation/demandplanning'
export const validationFolders = ['', 'process-references', 'blank-templates', 'records', 'supporting', 'planning']
export interface ValidationDocument { name: string; path: string; sha: string; size: number; category: string; format: string }
type Fetch = (url: string, init?: RequestInit) => Promise<Response>
const formats = ['pdf', 'docx', 'xlsx', 'csv', 'md', 'json', 'txt']

export function validationPath(path: string) {
  if (!path.startsWith(`${validationRoot}/`) || path.split('/').some((part) => !part || part === '.' || part === '..') || path.includes('\\') || [...path].some((char) => char.charCodeAt(0) < 32)) throw new Error('Not a Tool Validation Package file.')
  const relative = path.slice(validationRoot.length + 1).split('/')
  if (relative.length > 2 || (relative.length === 2 && !validationFolders.includes(relative[0])) || !formats.includes(relative.at(-1)!.split('.').at(-1)!.toLowerCase())) throw new Error('Not a supported Tool Validation Package file.')
  return path
}

async function request(config: GitConfig, token: string, path: string, raw: boolean, fetchImpl: Fetch) {
  if (!token.trim()) throw new Error('Configure a GitHub PAT in Settings → Storage → Git storage first.')
  const url = `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(config.branch)}`
  let response: Response
  try { response = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}`, Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, cache: 'no-store', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' }) }
  catch { throw new Error('Could not reach GitHub. Check your network and try again.') }
  if (!response.ok) {
    if (response.status === 401) throw new Error('GitHub rejected the PAT. Update it in Settings → Storage.')
    if (response.status === 403) throw new Error('GitHub refused access. Check Contents: Read permission, organisation SSO approval and the API rate limit.')
    if (response.status === 404) throw new Error('Package file or folder not found. Check the repository, branch and PAT access.')
    throw new Error(`GitHub document request failed (HTTP ${response.status}). Try again later.`)
  }
  return response
}

export async function listValidationDocuments(config: GitConfig, token: string, fetchImpl: Fetch = fetch): Promise<ValidationDocument[]> {
  const documents: ValidationDocument[] = []
  // Fixed folders prevent browsing operational data or following repository-supplied links/symlinks.
  for (const folder of validationFolders) {
    const path = folder ? `${validationRoot}/${folder}` : validationRoot
    const response = await request(config, token, path, false, fetchImpl)
    let entries: unknown
    try { entries = await response.json() } catch { throw new Error('GitHub returned an invalid document listing. Try again later.') }
    if (!Array.isArray(entries) || entries.length >= 1000) throw new Error('The package folder is invalid or too large to list completely.')
    for (const entry of entries) {
      if (entry?.type !== 'file' || typeof entry.name !== 'string' || entry.path !== `${path}/${entry.name}` || typeof entry.sha !== 'string' || !/^[a-f0-9]{40,64}$/i.test(entry.sha) || !Number.isSafeInteger(entry.size) || entry.size < 0) continue
      try { validationPath(entry.path) } catch { continue }
      documents.push({ name: entry.name, path: entry.path, sha: entry.sha, size: entry.size, category: folder === 'blank-templates' ? 'Blank templates' : folder === 'records' ? 'Draft records' : folder === 'process-references' ? 'Process references' : folder === 'supporting' ? 'Supporting records' : folder === 'planning' ? 'Planning' : 'Package index', format: entry.name.split('.').at(-1)!.toUpperCase() })
    }
  }
  return documents.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
}

export async function readValidationDocument(config: GitConfig, token: string, path: string, fetchImpl: Fetch = fetch) {
  validationPath(path)
  // Raw Contents works above the 1 MB base64-JSON limit, preserving PDF/Office bytes unchanged.
  return new Uint8Array(await (await request(config, token, path, true, fetchImpl)).arrayBuffer())
}

export function validationMime(name: string) {
  const ext = name.split('.').at(-1)?.toLowerCase()
  return ext === 'pdf' ? 'application/pdf' : ext === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : ext === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : ext === 'csv' ? 'text/csv;charset=utf-8' : ext === 'json' ? 'application/json' : 'text/plain;charset=utf-8'
}
