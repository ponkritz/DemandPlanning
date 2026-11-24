import { assertNotViewingAs } from './viewAs.ts'
import type { AppState } from './domain'
import { normalizeRules, normalizeScopes, type BaselineRule, type ReleaseScope } from './baseline.ts'
import { normalizeCapacitySettings, normalizeProfiles, type CapacitySettings, type ResourceProfile } from './capacity.ts'
import { normalizeTableDefaults, type TableDefaults } from './tableDefaults.ts'
import { normalizeReleaseSourceSettings, type ReleaseSourceSettings } from './releaseSource.ts'

// Planning data kept in a private GitHub repository: estimation rules, release scopes, the resource
// region/role mapping and the capacity settings (absence Epic, hours per day, thresholds, holidays and common
// activities), so everyone who loads the file gets the same ones. One JSON file; every save is a commit, so the repository history is the audit trail.
// The token stays in this browser (like the Azure PAT) and is never written to app data or exports.
export interface GitConfig { owner: string; repo: string; branch: string; path: string }
export type StoredCapacity = Omit<CapacitySettings, 'profiles'>
export interface PlanningData { schema: 1; baselineRules: BaselineRule[]; releaseScopes: ReleaseScope[]; resourceProfiles: Record<string, ResourceProfile>; capacitySettings?: StoredCapacity; setupLinks?: SetupLinks; tableDefaults?: TableDefaults; releaseSourceSettings?: ReleaseSourceSettings }
// NAV-40: where each token is created (GitHub, Azure DevOps, TFS APAC), linked from Get started; https only.
export type SetupLinks = { github?: string; azure?: string; tfs?: string }
export function normalizeSetupLinks(value: unknown): SetupLinks | undefined {
  if (!value || typeof value !== 'object') return undefined
  const links: SetupLinks = {}
  for (const key of ['github', 'azure', 'tfs'] as const) {
    const text = (value as Record<string, unknown>)[key]
    if (typeof text !== 'string' || text.length > 2000) continue
    try { const url = new URL(text.trim()); if (url.protocol === 'https:') links[key] = url.toString() } catch { /* not a link: dropped */ }
  }
  return Object.keys(links).length ? links : undefined
}

export const defaultGitPath = 'planning-data.json'
// The team's data repository, prefilled in the Connect Git storage form (GIT-13): a user adds only the token.
export const defaultGitRepository: GitConfig = { owner: 'ponkritz', repo: 'DemandPlanningStorage', branch: 'main', path: defaultGitPath }
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

// Capacity settings are written once they exist (an older file without them loads as before and keeps this browser's).
// GIT-14: Table defaults (UI-12) and the release-source settings (fuzzy match threshold, approval date field) are shared
// in the same file, each written once set (an older file without them leaves this browser's alone).
export function planningData(state: Pick<AppState, 'baselineRules' | 'releaseScopes' | 'resourceProfiles' | 'capacitySettings'> & { setupLinks?: unknown; tableDefaults?: unknown; releaseSourceSettings?: unknown }): PlanningData {
  const profiles = normalizeProfiles(state.resourceProfiles)
  const capacity = state.capacitySettings == null ? undefined : normalizeCapacitySettings(state.capacitySettings)
  if (capacity?.sharedTime) capacity.sharedTime = [...capacity.sharedTime].sort((a, b) => a.id - b.id)
  return { schema: 1, baselineRules: normalizeRules(state.baselineRules), releaseScopes: normalizeScopes(state.releaseScopes), resourceProfiles: Object.fromEntries(Object.keys(profiles).sort().map((key) => [key, profiles[key]])), ...(capacity ? { capacitySettings: capacity } : {}), ...(normalizeSetupLinks(state.setupLinks) ? { setupLinks: normalizeSetupLinks(state.setupLinks) } : {}), ...(state.tableDefaults != null ? { tableDefaults: normalizeTableDefaults(state.tableDefaults) } : {}), ...(releaseSettingsOf(state.releaseSourceSettings) ? { releaseSourceSettings: releaseSettingsOf(state.releaseSourceSettings) } : {}) }
}
function releaseSettingsOf(value: unknown) { const settings = normalizeReleaseSourceSettings(value); return Object.keys(settings).length ? settings : undefined }
// Stable, diff-friendly text: the same data always serialises to the same file.
export const serializePlanning = (data: PlanningData) => `${JSON.stringify(data, null, 2)}\n`

export function parsePlanning(text: string): PlanningData {
  let raw: unknown
  try { raw = JSON.parse(text) } catch { throw new Error('The Git data file is not valid JSON. Fix or revert it in the repository; nothing was loaded.') }
  if (!raw || typeof raw !== 'object' || (raw as { schema?: unknown }).schema !== 1) throw new Error('The Git data file is not a Demand Planning data file (schema 1). Nothing was loaded.')
  const input = raw as Record<string, unknown>
  return planningData({ baselineRules: (Array.isArray(input.baselineRules) ? input.baselineRules : []) as BaselineRule[], releaseScopes: input.releaseScopes as ReleaseScope[], resourceProfiles: input.resourceProfiles as Record<string, ResourceProfile>, capacitySettings: input.capacitySettings == null ? undefined : input.capacitySettings as AppState['capacitySettings'], setupLinks: input.setupLinks, tableDefaults: input.tableDefaults ?? undefined, releaseSourceSettings: input.releaseSourceSettings })
}

export function encodeBase64(text: string) { let binary = ''; for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte); return btoa(binary) }
export function decodeBase64(value: string) { const binary = atob(value.replace(/\s/g, '')); return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0))) }

export class GitConflictError extends Error {}
export type Fetch = (input: string, init?: RequestInit) => Promise<Response>
export const api = 'https://api.github.com'
export const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/')
const fileUrl = (config: GitConfig) => `${api}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${encodePath(config.path)}`
export const headers = (token: string) => ({ Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' })
async function isPrivateGitRepository(config: GitConfig, token: string, fetchImpl: Fetch): Promise<boolean> {
  try {
    const repo = await fetchImpl(`${api}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`, { headers: headers(token), cache: 'no-store' })
    return repo.ok && ((await repo.json()) as { visibility?: unknown } | null)?.visibility === 'private'
  } catch {
    return false
  }
}

export function privateGitWrites(config: GitConfig, token: string, fetchImpl: typeof fetch = fetch): typeof fetch {
  return async (url, init) => {
    const method = (init?.method ?? 'GET').toUpperCase()
    const writes = method === 'PUT' || method === 'PATCH' || method === 'DELETE' || (method === 'POST' && url !== `${api}/graphql`)
    if (writes && !await isPrivateGitRepository(config, token, fetchImpl)) {
      throw new Error('Connect a private Git data repository before saving.')
    }
    return fetchImpl(url, init)
  }
}

export const historyUrl = (config: GitConfig) => `https://github.com/${config.owner}/${config.repo}/commits/${config.branch}/${encodePath(config.path)}`

export async function failure(response: Response, config: GitConfig, action: string): Promise<Error> {
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

// CON-99: the commits that changed a file, newest first (at most `count`), and the file as it was at one of them.
// Read only: nothing is written.
export async function fileCommits(config: GitConfig, token: string, count = 30, fetchImpl: Fetch = fetch): Promise<{ sha: string; date: string; message: string }[]> {
  const url = `${api}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/commits?path=${encodeURIComponent(config.path)}&sha=${encodeURIComponent(config.branch)}&per_page=${Math.max(1, Math.min(100, count))}`
  const response = await fetchImpl(url, { headers: headers(token), cache: 'no-store' })
  if (!response.ok) throw await failure(response, config, `read the history of ${config.path}`)
  const body = (await response.json()) as { sha?: unknown; commit?: { message?: unknown; committer?: { date?: unknown }; author?: { date?: unknown } } }[]
  return (Array.isArray(body) ? body : []).flatMap((entry) => typeof entry?.sha === 'string' && /^[0-9a-f]{40}$/.test(entry.sha) ? [{ sha: entry.sha, date: String(entry.commit?.committer?.date ?? entry.commit?.author?.date ?? ''), message: String(entry.commit?.message ?? '').split('\n')[0].slice(0, 200) }] : [])
}
// GIT-18: who saved a file last and when (the app user of its latest commit, GIT-22, else its author name; its date), for the page notice; null when
// the history cannot be read. Read only.
export async function lastCommit(config: GitConfig, token: string, fetchImpl: Fetch = fetch): Promise<{ by: string; at: string; inApp?: boolean } | null> {
  const url = `${api}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/commits?path=${encodeURIComponent(config.path)}&sha=${encodeURIComponent(config.branch)}&per_page=1`
  try {
    const response = await fetchImpl(url, { headers: headers(token), cache: 'no-store' })
    if (!response.ok) return null
    const [entry] = (await response.json()) as { commit?: { message?: unknown; author?: { name?: unknown; date?: unknown }; committer?: { date?: unknown } } }[]
    if (!entry?.commit) return null
    // GIT-22: the app user named in the commit message; the GitHub author only for a commit made outside the app.
    const saver = saverOf(String(entry.commit.message ?? ''))
    return { by: saver?.name || saver?.email || String(entry.commit.author?.name ?? '').slice(0, 100), at: String(entry.commit.author?.date ?? entry.commit.committer?.date ?? ''), ...(saver ? { inApp: true } : {}) }
  } catch { return null }
}
// GIT-22: who saved, in every commit message the app writes — "[by {name} <{work email}>]" after the message (and its
// [saved …] stamp, GIT-17): the app user's display name (from Azure DevOps) and work email (My settings), set by App;
// never a token or anything of the GitHub account. A notice names this person (GIT-18); a commit made outside the app
// (no tag) is named by its GitHub author.
export interface Saver { name?: string; email?: string }
const cleanName = (value: string | undefined) => (value ?? '').replace(/[[\]<>\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
const cleanEmail = (value: string | undefined) => { const email = (value ?? '').trim().toLowerCase(); return /^[^\s@<>[\]]+@[^\s@<>[\]]+\.[^\s@<>[\]]+$/.test(email) && email.length <= 200 ? email : '' }
export function saverTag(saver: Saver): string {
  const name = cleanName(saver.name), email = cleanEmail(saver.email)
  if (name && email && name.toLowerCase() !== email) return `[by ${name} <${email}>]`
  return email || name ? `[by ${email || name}]` : ''
}
const saverPattern = /\[by ([^\]<>]*?)\s*(?:<([^<>\]\s]+)>)?\]/
// The app user named in a commit message, or null for a commit made outside the app.
export function saverOf(message: string): Saver | null {
  const found = saverPattern.exec(message)
  if (!found) return null
  const first = cleanName(found[1]), email = cleanEmail(found[2]) || cleanEmail(first)
  const name = cleanEmail(first) ? '' : first
  return name || email ? { ...(name ? { name } : {}), ...(email ? { email } : {}) } : null
}
let currentSaver = ''
export function setCommitSaver(saver: Saver) { currentSaver = saverTag(saver) }
export const signMessage = (message: string, tag = currentSaver) => !tag || saverPattern.test(message) ? message : `${message.trim()} ${tag}`

export async function signedGitMessage(config: GitConfig, token: string, message: string, fetchImpl: Fetch): Promise<string> {
  const saver = currentSaver
  return saver && await isPrivateGitRepository(config, token, fetchImpl) ? signMessage(message, saver) : message
}

export async function readTextAt(config: GitConfig, token: string, ref: string, fetchImpl: Fetch = fetch): Promise<string | null> {
  if (!/^[0-9a-f]{40}$/.test(ref)) throw new Error('Unknown version.')
  const response = await fetchImpl(`${fileUrl(config)}?ref=${ref}`, { headers: headers(token), cache: 'no-store' })
  if (response.status === 404) return null
  if (!response.ok) throw await failure(response, config, `read ${config.path}`)
  const body = (await response.json()) as { content?: string; encoding?: string; type?: string }
  if (body.type !== 'file' || body.encoding !== 'base64' || typeof body.content !== 'string') return null
  return decodeBase64(body.content)
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
  assertNotViewingAs()
  const response = await fetchImpl(fileUrl(config), { method: 'PUT', headers: { ...headers(token), 'Content-Type': 'application/json' }, body: JSON.stringify({ message: await signedGitMessage(config, token, message.trim() || `Update ${config.path}`, fetchImpl), content: encodeBase64(text), branch: config.branch, ...(sha ? { sha } : {}) }) })
  if (!response.ok) throw await failure(response, config, `save ${config.path}`)
  const body = (await response.json()) as { content?: { sha?: string }; commit?: { html_url?: string } }
  if (typeof body.content?.sha !== 'string') throw new Error(`GitHub saved ${config.path} but returned no version id.`)
  return { sha: body.content.sha, commitUrl: body.commit?.html_url ?? historyUrl(config) }
}

// A binary file (the Monthly pack's PowerPoint template): written as base64 like a text file, read raw as bytes.
export function bytesToBase64(bytes: Uint8Array) { let binary = ''; for (let at = 0; at < bytes.length; at += 0x8000) binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000)); return btoa(binary) }
export async function writeBinaryFile(config: GitConfig, token: string, bytes: Uint8Array, sha: string | null, message: string, fetchImpl: Fetch = fetch): Promise<{ sha: string; commitUrl: string }> {
  assertNotViewingAs()
  const response = await fetchImpl(fileUrl(config), { method: 'PUT', headers: { ...headers(token), 'Content-Type': 'application/json' }, body: JSON.stringify({ message: await signedGitMessage(config, token, message.trim() || `Update ${config.path}`, fetchImpl), content: bytesToBase64(bytes), branch: config.branch, ...(sha ? { sha } : {}) }) })
  if (!response.ok) throw await failure(response, config, `save ${config.path}`)
  const body = (await response.json()) as { content?: { sha?: string }; commit?: { html_url?: string } }
  if (typeof body.content?.sha !== 'string') throw new Error(`GitHub saved ${config.path} but returned no version id.`)
  return { sha: body.content.sha, commitUrl: body.commit?.html_url ?? historyUrl(config) }
}
export async function readBinaryFile(config: GitConfig, token: string, fetchImpl: Fetch = fetch): Promise<Uint8Array | null> {
  const response = await fetchImpl(`${fileUrl(config)}?ref=${encodeURIComponent(config.branch)}`, { headers: { ...headers(token), Accept: 'application/vnd.github.raw+json' }, cache: 'no-store' })
  if (response.status === 404) return null
  if (!response.ok) throw await failure(response, config, `read ${config.path}`)
  return new Uint8Array(await response.arrayBuffer())
}

// Deletes a file as one commit; false when it does not exist. The version id is read first, so the delete is of the
// file as it is now.
export async function deleteFile(config: GitConfig, token: string, message: string, fetchImpl: Fetch = fetch): Promise<boolean> {
  assertNotViewingAs()
  const sha = await fileSha(config, token, fetchImpl)
  if (!sha) return false
  const response = await fetchImpl(fileUrl(config), { method: 'DELETE', headers: { ...headers(token), 'Content-Type': 'application/json' }, body: JSON.stringify({ message: await signedGitMessage(config, token, message.trim() || `Delete ${config.path}`, fetchImpl), sha, branch: config.branch }) })
  if (response.status === 404) return false
  if (!response.ok) throw await failure(response, config, `delete ${config.path}`)
  return true
}

// Folder listing (files only); a missing folder is empty.
export async function listFolder(config: GitConfig, token: string, fetchImpl: Fetch = fetch): Promise<{ name: string; path: string; sha: string }[]> {
  return (await listEntries(config, token, fetchImpl)).filter((entry) => entry.type === 'file').map(({ name, path, sha }) => ({ name, path, sha }))
}
// OND-31: a folder listing with its folders too (a folder's sha is its tree's: it changes when anything inside changes).
export async function listEntries(config: GitConfig, token: string, fetchImpl: Fetch = fetch): Promise<{ name: string; path: string; sha: string; type: 'file' | 'dir' }[]> {
  const response = await fetchImpl(`${fileUrl(config)}?ref=${encodeURIComponent(config.branch)}`, { headers: headers(token), cache: 'no-store' })
  if (response.status === 404) return []
  if (!response.ok) throw await failure(response, config, `list ${config.path}`)
  const body = await response.json() as unknown
  return Array.isArray(body) ? body.filter((entry) => (entry?.type === 'file' || entry?.type === 'dir') && typeof entry.name === 'string' && typeof entry.path === 'string' && typeof entry.sha === 'string').map(({ name, path, sha, type }) => ({ name, path, sha, type })) : []
}
// A file deleted with the version id already known (a lock, OND-38): one call; keepalive lets it finish while the page
// closes. False when the file was not there (or changed meanwhile).
export async function deleteFileAt(config: GitConfig, token: string, sha: string, message: string, fetchImpl: Fetch = fetch, keepalive = false): Promise<boolean> {
  assertNotViewingAs()
  const response = await fetchImpl(fileUrl(config), { method: 'DELETE', keepalive, headers: { ...headers(token), 'Content-Type': 'application/json' }, body: JSON.stringify({ message: await signedGitMessage(config, token, message.trim() || `Delete ${config.path}`, fetchImpl), sha, branch: config.branch }) })
  if (response.status === 404 || response.status === 409 || response.status === 422) return false
  if (!response.ok) throw await failure(response, config, `delete ${config.path}`)
  return true
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
  assertNotViewingAs()
  const response = await fetchImpl(fileUrl(config), { method: 'PUT', headers: { ...headers(token), 'Content-Type': 'application/json' }, body: JSON.stringify({ message: await signedGitMessage(config, token, message.trim() || 'Update planning data', fetchImpl), content: encodeBase64(serializePlanning(data)), branch: config.branch, ...(sha ? { sha } : {}) }) })
  if (!response.ok) throw await failure(response, config, 'save the data file')
  const body = (await response.json()) as { content?: { sha?: string }; commit?: { html_url?: string } }
  if (typeof body.content?.sha !== 'string') throw new Error('GitHub saved the file but returned no version id. Load the latest version before saving again.')
  return { sha: body.content.sha, commitUrl: body.commit?.html_url ?? historyUrl(config) }
}

// GIT-16: loading the planning data from Git replaces what is in this browser. With unsaved changes the person is asked
// first, naming what goes; on a save conflict (someone else saved first) the text says so.
export function replaceUnsavedText(conflict = false) {
  return `${conflict ? 'Someone else saved the planning data in Git after you started editing. ' : ''}Your changes to the planning data are not saved to Git yet (baselines, release scope, the region / role mapping, the capacity settings with holidays and common activities, table defaults). Loading the latest from Git replaces them with the copy in Git, and they are lost.\n\nLoad from Git anyway?`
}
export function confirmReplace(dirty: boolean, conflict = false, ask: (text: string) => boolean = (text) => window.confirm(text)) {
  return !dirty || ask(replaceUnsavedText(conflict))
}
