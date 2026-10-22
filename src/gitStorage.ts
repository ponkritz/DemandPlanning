import type { AppState } from './domain'
import { normalizeRules, normalizeScopes, type BaselineRule, type ReleaseScope } from './baseline.ts'
import { normalizeProfiles, type ResourceProfile } from './capacity.ts'

// Planning data kept in a private GitHub repository: estimation rules, release scopes and the resource
// region/role mapping. One JSON file; every save is a commit, so the repository history is the audit trail.
// The token stays in this browser (like the Azure PAT) and is never written to app data or exports.
export interface GitConfig { owner: string; repo: string; branch: string; path: string }
export interface PlanningData { schema: 1; baselineRules: BaselineRule[]; releaseScopes: ReleaseScope[]; resourceProfiles: Record<string, ResourceProfile> }

export const defaultGitPath = 'planning-data.json'
const configKey = 'demand-planning-git-storage-v1'
const tokenKey = 'demand-planning-git-token-v1'
const name = /^[A-Za-z0-9_.-]{1,100}$/

export function validateGitConfig(input: Partial<Record<keyof GitConfig, unknown>>): GitConfig {
  const owner = String(input.owner ?? '').trim(), repo = String(input.repo ?? '').trim().replace(/\.git$/, '')
  const branch = String(input.branch ?? '').trim() || 'main', path = String(input.path ?? '').trim().replace(/^\/+/, '') || defaultGitPath
  if (!name.test(owner) || !name.test(repo)) throw new Error('Enter the GitHub owner (user or organisation) and repository name.')
  if (!/^[A-Za-z0-9._/-]{1,200}$/.test(branch) || branch.includes('..')) throw new Error('Enter a valid branch name.')
  if (!/^[A-Za-z0-9._/ -]{1,200}\.json$/.test(path) || path.split('/').some((part) => !part || part === '..')) throw new Error('The data file path must end in .json, e.g. planning-data.json.')
  return { owner, repo, branch, path }
}

export function loadGitConfig(storage: Pick<Storage, 'getItem'> = localStorage): GitConfig | null {
  try { const raw = storage.getItem(configKey); return raw ? validateGitConfig(JSON.parse(raw)) : null } catch { return null }
}
export function saveGitConfig(config: GitConfig, storage: Pick<Storage, 'setItem'> = localStorage) { storage.setItem(configKey, JSON.stringify(config)) }
export function loadGitToken(storage: Pick<Storage, 'getItem'> = localStorage) { try { return storage.getItem(tokenKey) ?? '' } catch { return '' } }
export function saveGitToken(token: string, storage: Pick<Storage, 'setItem'> = localStorage) { storage.setItem(tokenKey, token) }
export function forgetGitStorage(storage: Pick<Storage, 'removeItem'> = localStorage) { storage.removeItem(tokenKey); storage.removeItem(configKey) }

export function planningData(state: Pick<AppState, 'baselineRules' | 'releaseScopes' | 'resourceProfiles'>): PlanningData {
  const profiles = normalizeProfiles(state.resourceProfiles)
  return { schema: 1, baselineRules: normalizeRules(state.baselineRules), releaseScopes: normalizeScopes(state.releaseScopes), resourceProfiles: Object.fromEntries(Object.keys(profiles).sort().map((key) => [key, profiles[key]])) }
}
// Stable, diff-friendly text: the same data always serialises to the same file.
export const serializePlanning = (data: PlanningData) => `${JSON.stringify(data, null, 2)}\n`

export function parsePlanning(text: string): PlanningData {
  let raw: unknown
  try { raw = JSON.parse(text) } catch { throw new Error('The Git data file is not valid JSON. Fix or revert it in the repository; nothing was loaded.') }
  if (!raw || typeof raw !== 'object' || (raw as { schema?: unknown }).schema !== 1) throw new Error('The Git data file is not a Demand Planning data file (schema 1). Nothing was loaded.')
  const input = raw as Record<string, unknown>
  return planningData({ baselineRules: (Array.isArray(input.baselineRules) ? input.baselineRules : []) as BaselineRule[], releaseScopes: input.releaseScopes as ReleaseScope[], resourceProfiles: input.resourceProfiles as Record<string, ResourceProfile> })
}

export function encodeBase64(text: string) { let binary = ''; for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte); return btoa(binary) }
export function decodeBase64(value: string) { const binary = atob(value.replace(/\s/g, '')); return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0))) }

export class GitConflictError extends Error {}
type Fetch = (input: string, init?: RequestInit) => Promise<Response>
const api = 'https://api.github.com'
const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/')
const fileUrl = (config: GitConfig) => `${api}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${encodePath(config.path)}`
const headers = (token: string) => ({ Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' })
export const historyUrl = (config: GitConfig) => `https://github.com/${config.owner}/${config.repo}/commits/${config.branch}/${encodePath(config.path)}`

async function failure(response: Response, config: GitConfig, action: string): Promise<Error> {
  if (response.status === 401) return new Error('GitHub rejected the token. Create a fine-grained token with Contents: Read and write on this repository.')
  if (response.status === 403) return new Error(`GitHub refused to ${action}: the token needs Contents: Read and write on ${config.owner}/${config.repo}, or the rate limit was reached.`)
  if (response.status === 409 || response.status === 422) return new GitConflictError('The data file changed in Git since it was loaded here. Load the latest version, then make your change again.')
  if (response.status === 404) return new Error(`Repository ${config.owner}/${config.repo} or branch ${config.branch} was not found, or the token cannot access it.`)
  let detail = ''
  try { detail = String(((await response.json()) as { message?: unknown }).message ?? '') } catch { /* no JSON body */ }
  return new Error(`GitHub could not ${action} (HTTP ${response.status})${detail ? `: ${detail}` : ''}.`)
}

// Whether the token may write to the repository (null when unknown). The repository's permissions say what the user
// may do; a fine-grained token can still be read-only, so an empty write follows: GitHub refuses it (403) for a token
// without write access, and rejects it as incomplete (422) otherwise. It has no content, so nothing is ever written.
export async function canWrite(config: GitConfig, token: string, fetchImpl: Fetch = fetch): Promise<boolean | null> {
  const repo = await fetchImpl(`${api}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`, { headers: headers(token), cache: 'no-store' })
  if (!repo.ok) return null
  const permissions = ((await repo.json()) as { permissions?: { push?: unknown } }).permissions
  if (permissions?.push === false) return false
  const probe = await fetchImpl(fileUrl({ ...config, path: '.demand-planning-write-check' }), { method: 'PUT', headers: { ...headers(token), 'Content-Type': 'application/json' }, body: '{}' })
  if (probe.status === 403 || probe.status === 404) return false
  if (probe.status === 400 || probe.status === 422) return true
  return null
}

// Reads the data file. A missing file (with an accessible repository) returns data null so it can be created.
export async function readPlanningFile(config: GitConfig, token: string, fetchImpl: Fetch = fetch): Promise<{ data: PlanningData | null; sha: string | null }> {
  const response = await fetchImpl(`${fileUrl(config)}?ref=${encodeURIComponent(config.branch)}`, { headers: headers(token), cache: 'no-store' })
  if (response.status === 404) {
    const repo = await fetchImpl(`${api}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/branches/${encodeURIComponent(config.branch)}`, { headers: headers(token) })
    if (repo.ok) return { data: null, sha: null }
    throw await failure(repo, config, 'open the repository')
  }
  if (!response.ok) throw await failure(response, config, 'read the data file')
  const body = (await response.json()) as { content?: string; encoding?: string; sha?: string; type?: string }
  if (body.type !== 'file' || body.encoding !== 'base64' || typeof body.content !== 'string' || typeof body.sha !== 'string') throw new Error(`${config.path} is not a readable file in ${config.owner}/${config.repo}.`)
  return { data: parsePlanning(decodeBase64(body.content)), sha: body.sha }
}

// Another JSON file in the same repository and folder as the planning data (e.g. the Azure DevOps views).
export function siblingConfig(config: GitConfig, file: string): GitConfig {
  const folder = config.path.includes('/') ? config.path.slice(0, config.path.lastIndexOf('/') + 1) : ''
  return { ...config, path: `${folder}${file}` }
}

// Plain text read / commit of a file, with the same errors and conflict check as the planning data file.
export async function readTextFile(config: GitConfig, token: string, fetchImpl: Fetch = fetch): Promise<{ text: string | null; sha: string | null }> {
  const response = await fetchImpl(`${fileUrl(config)}?ref=${encodeURIComponent(config.branch)}`, { headers: headers(token), cache: 'no-store' })
  if (response.status === 404) return { text: null, sha: null }
  if (!response.ok) throw await failure(response, config, `read ${config.path}`)
  const body = (await response.json()) as { content?: string; encoding?: string; sha?: string; type?: string }
  if (body.type !== 'file' || body.encoding !== 'base64' || typeof body.content !== 'string' || typeof body.sha !== 'string') throw new Error(`${config.path} is not a readable file in ${config.owner}/${config.repo}.`)
  return { text: decodeBase64(body.content), sha: body.sha }
}
export async function writeTextFile(config: GitConfig, token: string, text: string, sha: string | null, message: string, fetchImpl: Fetch = fetch): Promise<{ sha: string; commitUrl: string }> {
  const response = await fetchImpl(fileUrl(config), { method: 'PUT', headers: { ...headers(token), 'Content-Type': 'application/json' }, body: JSON.stringify({ message: message.trim() || `Update ${config.path}`, content: encodeBase64(text), branch: config.branch, ...(sha ? { sha } : {}) }) })
  if (!response.ok) throw await failure(response, config, `save ${config.path}`)
  const body = (await response.json()) as { content?: { sha?: string }; commit?: { html_url?: string } }
  if (typeof body.content?.sha !== 'string') throw new Error(`GitHub saved ${config.path} but returned no version id.`)
  return { sha: body.content.sha, commitUrl: body.commit?.html_url ?? historyUrl(config) }
}

// Folder listing (files only); a missing folder is empty.
export async function listFolder(config: GitConfig, token: string, fetchImpl: Fetch = fetch): Promise<{ name: string; path: string; sha: string }[]> {
  const response = await fetchImpl(`${fileUrl(config)}?ref=${encodeURIComponent(config.branch)}`, { headers: headers(token), cache: 'no-store' })
  if (response.status === 404) return []
  if (!response.ok) throw await failure(response, config, `list ${config.path}`)
  const body = await response.json() as unknown
  return Array.isArray(body) ? body.filter((entry) => entry?.type === 'file' && typeof entry.name === 'string' && typeof entry.path === 'string' && typeof entry.sha === 'string').map(({ name, path, sha }) => ({ name, path, sha })) : []
}
// Raw file text (works for files above 1 MB, which the JSON form returns without content); null when missing.
export async function readRawFile(config: GitConfig, token: string, fetchImpl: Fetch = fetch): Promise<string | null> {
  const response = await fetchImpl(`${fileUrl(config)}?ref=${encodeURIComponent(config.branch)}`, { headers: { ...headers(token), Accept: 'application/vnd.github.raw+json' }, cache: 'no-store' })
  if (response.status === 404) return null
  if (!response.ok) throw await failure(response, config, `read ${config.path}`)
  return response.text()
}
// Version id of a file (needed to replace it), whatever its size; null when it does not exist yet.
export async function fileSha(config: GitConfig, token: string, fetchImpl: Fetch = fetch): Promise<string | null> {
  const response = await fetchImpl(`${fileUrl(config)}?ref=${encodeURIComponent(config.branch)}`, { headers: headers(token), cache: 'no-store' })
  if (response.status === 404) return null
  if (!response.ok) throw await failure(response, config, `read ${config.path}`)
  const body = await response.json() as { sha?: unknown }
  return typeof body.sha === 'string' ? body.sha : null
}

// Writes the data file as one commit. The sha of the version that was loaded is required, so a concurrent change
// is refused (GitConflictError) instead of being overwritten.
export async function writePlanningFile(config: GitConfig, token: string, data: PlanningData, sha: string | null, message: string, fetchImpl: Fetch = fetch): Promise<{ sha: string; commitUrl: string }> {
  const response = await fetchImpl(fileUrl(config), { method: 'PUT', headers: { ...headers(token), 'Content-Type': 'application/json' }, body: JSON.stringify({ message: message.trim() || 'Update planning data', content: encodeBase64(serializePlanning(data)), branch: config.branch, ...(sha ? { sha } : {}) }) })
  if (!response.ok) throw await failure(response, config, 'save the data file')
  const body = (await response.json()) as { content?: { sha?: string }; commit?: { html_url?: string } }
  if (typeof body.content?.sha !== 'string') throw new Error('GitHub saved the file but returned no version id. Load the latest version before saving again.')
  return { sha: body.content.sha, commitUrl: body.commit?.html_url ?? historyUrl(config) }
}
