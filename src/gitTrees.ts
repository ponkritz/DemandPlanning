import { api, decodeBase64, encodePath, failure, GitConflictError, headers, signedGitMessage, type Fetch, type GitConfig } from './gitStorage.ts'
import { GitQueueError } from './gitSaveQueue.ts'
import { assertNotViewingAs } from './viewAs.ts'

// OND-31…OND-35: the parts of GitHub's Git Data API the row-file pages need — a folder's entries by its tree, many small
// files (blobs) read in a few batched calls, one commit of many files (a conversion, a column change touching values,
// removing a page), and a branch (the locks of OND-35). Reads use the same token as every other Git read; every write is
// refused while View as is on (CON-90).

const repoUrl = (config: GitConfig) => `${api}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`
const shaPattern = /^[0-9a-f]{40}$/
async function getJson<T>(fetchImpl: Fetch, url: string, token: string, config: GitConfig, action: string): Promise<T> {
  const response = await fetchImpl(url, { headers: headers(token), cache: 'no-store' })
  if (!response.ok) throw await failure(response, config, action)
  return await response.json() as T
}
async function sendJson<T>(fetchImpl: Fetch, method: string, url: string, token: string, body: unknown, config: GitConfig, action: string): Promise<T> {
  const response = await fetchImpl(url, { method, headers: { ...headers(token), 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!response.ok) throw await failure(response, config, action)
  return await response.json() as T
}

// The entries of a tree (a folder), by its sha: name, blob sha and type. One call for up to 100,000 entries.
export async function readTree(config: GitConfig, token: string, sha: string, fetchImpl: Fetch = fetch): Promise<{ name: string; sha: string; type: string }[]> {
  if (!shaPattern.test(sha)) throw new Error('Unknown folder version.')
  const body = await getJson<{ tree?: { path?: unknown; sha?: unknown; type?: unknown }[]; truncated?: boolean }>(fetchImpl, `${repoUrl(config)}/git/trees/${sha}`, token, config, 'list the rows')
  if (body.truncated) throw new Error('GitHub cut the list of rows short: too many rows in one page.')
  return (body.tree ?? []).flatMap((entry) => typeof entry.path === 'string' && typeof entry.sha === 'string' && typeof entry.type === 'string' ? [{ name: entry.path, sha: entry.sha, type: entry.type }] : [])
}

// Many blobs by their sha: batched through GitHub's GraphQL API (up to 100 per call, 4 calls at a time), each blob that
// GraphQL does not return in full (or every blob, when GraphQL is refused) read on its own through the REST API (8 at a
// time). Text only (the rows are JSON).
export const blobBatch = 100, graphParallel = 4, restParallel = 8
async function inParallel<T>(items: T[], limit: number, work: (item: T) => Promise<void>) {
  let next = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (next < items.length) await work(items[next++]) }))
}
export async function readBlobs(config: GitConfig, token: string, shas: string[], fetchImpl: Fetch = fetch): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const wanted = [...new Set(shas.filter((sha) => shaPattern.test(sha)))]
  const batches = Array.from({ length: Math.ceil(wanted.length / blobBatch) }, (_, index) => wanted.slice(index * blobBatch, (index + 1) * blobBatch))
  let graphql = true
  await inParallel(batches, graphParallel, async (batch) => {
    if (!graphql) return
    const query = `query { repository(owner: ${JSON.stringify(config.owner)}, name: ${JSON.stringify(config.repo)}) { ${batch.map((sha, index) => `b${index}: object(oid: "${sha}") { ... on Blob { text isTruncated } }`).join(' ')} } }`
    try {
      const response = await fetchImpl(`${api}/graphql`, { method: 'POST', headers: { ...headers(token), 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) })
      if (!response.ok) { graphql = false; return }
      const body = await response.json() as { data?: { repository?: Record<string, { text?: unknown; isTruncated?: unknown } | null> } }
      const repository = body.data?.repository
      if (!repository) { graphql = false; return }
      batch.forEach((sha, index) => { const blob = repository[`b${index}`]; if (blob && typeof blob.text === 'string' && blob.isTruncated !== true) out.set(sha, blob.text) })
    } catch { graphql = false }
  })
  await inParallel(wanted.filter((sha) => !out.has(sha)), restParallel, async (sha) => {
    const body = await getJson<{ content?: unknown; encoding?: unknown }>(fetchImpl, `${repoUrl(config)}/git/blobs/${sha}`, token, config, 'read a row')
    if (body.encoding === 'base64' && typeof body.content === 'string') out.set(sha, decodeBase64(body.content))
  })
  return out
}

// The commit a branch points to now, and its tree.
export async function headOf(config: GitConfig, token: string, branch: string, fetchImpl: Fetch = fetch): Promise<{ commit: string; tree: string }> {
  const ref = await getJson<{ object?: { sha?: unknown } }>(fetchImpl, `${repoUrl(config)}/git/ref/heads/${encodePath(branch)}`, token, config, `read the branch ${branch}`)
  const commit = String(ref.object?.sha ?? '')
  if (!shaPattern.test(commit)) throw new Error(`GitHub returned no commit for the branch ${branch}.`)
  const body = await getJson<{ tree?: { sha?: unknown } }>(fetchImpl, `${repoUrl(config)}/git/commits/${commit}`, token, config, 'read the latest commit')
  const tree = String(body.tree?.sha ?? '')
  if (!shaPattern.test(tree)) throw new Error('GitHub returned no tree for the latest commit.')
  return { commit, tree }
}

// OND-32, OND-33: many files as ONE commit on the data branch — files written (text) or deleted (null) — or nothing at
// all. build(commit) makes the files from the repository as it is at that commit (read with ref = that commit); the
// commit is made on top of it and the branch moved only if nobody committed meanwhile (no force). When someone did, it
// starts again from their commit, at most `tries` times. The texts travel inside the tree (one request for all files,
// not one per file: GitHub limits requests that create content).
export async function commitFiles(config: GitConfig, token: string, build: (commit: string) => Promise<{ files: Record<string, string | null>; message: string }>, fetchImpl: Fetch = fetch, tries = 3): Promise<{ commit: string; commitUrl: string }> {
  assertNotViewingAs()
  for (let attempt = 1; attempt <= tries; attempt++) {
    const head = await headOf(config, token, config.branch, fetchImpl)
    const { files, message } = await build(head.commit)
    const tree = Object.entries(files).map(([path, text]) => text == null ? { path, mode: '100644', type: 'blob', sha: null } : { path, mode: '100644', type: 'blob', content: text })
    const made = await sendJson<{ sha?: unknown }>(fetchImpl, 'POST', `${repoUrl(config)}/git/trees`, token, { base_tree: head.tree, tree }, config, 'prepare the commit')
    const commit = await sendJson<{ sha?: unknown; html_url?: unknown }>(fetchImpl, 'POST', `${repoUrl(config)}/git/commits`, token, { message: await signedGitMessage(config, token, message, fetchImpl), tree: made.sha, parents: [head.commit] }, config, 'make the commit')
    const response = await fetchImpl(`${repoUrl(config)}/git/refs/heads/${encodePath(config.branch)}`, { method: 'PATCH', headers: { ...headers(token), 'Content-Type': 'application/json' }, body: JSON.stringify({ sha: commit.sha, force: false }) })
    if (response.ok) return { commit: String(commit.sha), commitUrl: typeof commit.html_url === 'string' ? commit.html_url : `https://github.com/${config.owner}/${config.repo}/commit/${String(commit.sha)}` }
    const error = await failure(response, config, 'move the branch to the commit')
    if (!(error instanceof GitConflictError)) throw error
  }
  throw new GitQueueError(`${config.branch} kept changing in Git while saving (${tries} tries). Nothing was changed: try again.`)
}

export async function branchExists(config: GitConfig, token: string, branch: string, fetchImpl: Fetch = fetch): Promise<boolean> {
  const found = await fetchImpl(`${repoUrl(config)}/git/ref/heads/${encodePath(branch)}`, { headers: headers(token), cache: 'no-store' })
  if (found.ok) return true
  if (found.status === 404) return false
  throw await failure(found, config, `read the branch ${branch}`)
}
// OND-35: the branch for the locks, made from the data branch when it is missing. 'refused': the token or the
// repository's rules do not allow a new branch (the locks are then kept in a folder of the data branch).
export async function ensureBranch(config: GitConfig, token: string, branch: string, fetchImpl: Fetch = fetch): Promise<'exists' | 'created' | 'refused'> {
  const url = `${repoUrl(config)}/git/ref/heads/${encodePath(branch)}`
  const found = await fetchImpl(url, { headers: headers(token), cache: 'no-store' })
  if (found.ok) return 'exists'
  if (found.status !== 404) throw await failure(found, config, `read the branch ${branch}`)
  assertNotViewingAs()
  const head = await headOf(config, token, config.branch, fetchImpl)
  const made = await fetchImpl(`${repoUrl(config)}/git/refs`, { method: 'POST', headers: { ...headers(token), 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: head.commit }) })
  if (made.ok) return 'created'
  // Made by someone else at the same moment: it exists now.
  if ((await fetchImpl(url, { headers: headers(token), cache: 'no-store' })).ok) return 'exists'
  if (made.status === 403 || made.status === 404 || made.status === 409 || made.status === 422) return 'refused'
  throw await failure(made, config, `create the branch ${branch}`)
}
