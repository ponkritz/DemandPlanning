// A small GitHub for the row-file and row-lock tests (OND-31…OND-38), shared by the unit tests (as a fetch) and the
// E2E scenarios (as a Playwright route): one repository with branches of text files, the contents API (read, list with
// folders, create — refused when the file exists — update with the version id, delete), the Git Data API (refs, commits,
// trees with folders by their real git object ids, blobs, a commit of many files, a branch made from another), GraphQL
// blob batches and the commit list of a file. Nothing leaves the process. As GitHub, a file above `largeAbove` bytes (1 MB)
// is answered in the JSON form with `encoding: "none"` and no content; the raw media type and the blob API give its text.
import { createHash } from 'node:crypto'

const sha1 = (text) => createHash('sha1').update(text).digest('hex')
const json = (status, body) => ({ status, body })

export function fakeGitHub({ owner = 'example', repo = 'storage', files = {}, branch = 'main', refuseBranches = false, graphql = true, delay = 0, largeAbove = 1024 * 1024 } = {}) {
  const blobShas = new Map()
  const blobs = new Map()
  const blobSha = (text) => {
    let sha = blobShas.get(text)
    if (!sha) { sha = sha1(`blob ${Buffer.byteLength(text)}\0${text}`); blobShas.set(text, sha); blobs.set(sha, text) }
    return sha
  }
  // A folder's tree id from its files (registered, so the trees API can list it).
  const trees = new Map()
  function treeOf(map, prefix) {
    const names = new Map()
    for (const path of Object.keys(map)) {
      if (prefix && !path.startsWith(`${prefix}/`)) continue
      const rest = prefix ? path.slice(prefix.length + 1) : path
      const [name, ...more] = rest.split('/')
      names.set(name, more.length ? 'tree' : 'blob')
    }
    if (!names.size && prefix) return null
    const entries = [...names].sort(([a], [b]) => a.localeCompare(b)).map(([name, type]) => {
      const path = prefix ? `${prefix}/${name}` : name
      return { path: name, type, mode: type === 'tree' ? '040000' : '100644', sha: type === 'tree' ? treeOf(map, path) : blobSha(map[path]) }
    })
    const sha = sha1(`tree ${entries.map((entry) => `${entry.type} ${entry.path} ${entry.sha}`).join('\n')}`)
    trees.set(sha, { map, prefix, entries })
    return sha
  }
  let counter = 0
  const commits = new Map()
  const history = []
  const heads = {}
  function commit(branchName, map, message, parent) {
    const sha = sha1(`commit ${++counter} ${message}`)
    commits.set(sha, { map: { ...map }, tree: treeOf(map, ''), parent, message, date: new Date(Date.UTC(2026, 10, 23, 8, 0, counter)).toISOString() })
    return sha
  }
  function setBranch(name, sha, changed) {
    const before = heads[name] ? commits.get(heads[name]).map : {}
    heads[name] = sha
    const after = commits.get(sha).map
    const paths = changed ?? [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((path) => before[path] !== after[path])
    history.unshift({ branch: name, sha, paths, message: commits.get(sha).message, date: commits.get(sha).date })
  }
  setBranch(branch, commit(branch, files, 'initial', null), [])
  const state = { calls: [], writes: [], heads, files: (name = branch) => commits.get(heads[name])?.map ?? null }
  const mapOf = (ref) => heads[ref] ? commits.get(heads[ref]).map : commits.get(ref)?.map ?? null
  const write = (name, map, message, paths) => { setBranch(name, commit(name, map, message, heads[name]), paths); state.writes.push({ branch: name, message, paths }) }

  // accept: the request's Accept header — `application/vnd.github.raw+json` answers a file's text itself (readRawFile).
  function handle(method, url, bodyText, accept = '') {
    const target = new URL(url)
    const body = bodyText ? JSON.parse(bodyText) : null
    const path = target.pathname
    state.calls.push(`${method} ${path}`)
    if (path === '/graphql' && method === 'POST') {
      if (!graphql) return json(403, { message: 'GraphQL is not allowed' })
      const repository = {}
      for (const match of body.query.matchAll(/(b\d+): object\(oid: "([0-9a-f]{40})"\)/g)) repository[match[1]] = blobs.has(match[2]) ? { text: blobs.get(match[2]), isTruncated: false } : null
      return json(200, { data: { repository } })
    }
    const base = `/repos/${owner}/${repo}`
    if (!path.startsWith(base)) return json(404, { message: 'Not Found' })
    const rest = path.slice(base.length)
    if (rest === '' && method === 'GET') return json(200, { visibility: 'private', permissions: { push: true } })
    if (rest === '/commits' && method === 'GET') {
      const file = target.searchParams.get('path') ?? '', ref = target.searchParams.get('sha') ?? branch
      // A commit as the ref (a read at a commit): the commits that lead to it.
      const ancestors = new Set()
      for (let at = commits.has(ref) ? ref : null; at; at = commits.get(at)?.parent) ancestors.add(at)
      return json(200, history.filter((entry) => (ancestors.size ? ancestors.has(entry.sha) : entry.branch === ref) && entry.paths.includes(file)).slice(0, Number(target.searchParams.get('per_page') ?? 30)).map((entry) => ({ sha: entry.sha, commit: { message: entry.message, author: { name: 'someone', date: entry.date }, committer: { date: entry.date } } })))
    }
    const branchRead = /^\/branches\/(.+)$/.exec(rest)
    if (branchRead && method === 'GET') return heads[branchRead[1]] ? json(200, { name: branchRead[1], commit: { sha: heads[branchRead[1]] } }) : json(404, { message: 'Branch not found' })
    // GIT-25: a commit read (the probe of a 404 at a commit: is the repository readable?).
    const commitProbe = /^\/commits\/([0-9a-f]{40})$/.exec(rest)
    if (commitProbe && method === 'GET') return commits.has(commitProbe[1]) ? json(200, { sha: commitProbe[1] }) : json(404, { message: 'No commit found for SHA' })
    const contents = /^\/contents\/?(.*)$/.exec(rest)
    if (contents) {
      const file = decodeURIComponent(contents[1])
      if (method === 'GET') {
        const map = mapOf(target.searchParams.get('ref') ?? branch)
        if (!map) return json(404, { message: 'No commit found for the ref' })
        if (map[file] != null && /raw/.test(accept)) return { status: 200, body: map[file], raw: true }
        if (map[file] != null && Buffer.byteLength(map[file]) > largeAbove) return json(200, { type: 'file', name: file.split('/').pop(), path: file, size: Buffer.byteLength(map[file]), encoding: 'none', content: '', sha: blobSha(map[file]) })
        if (map[file] != null) return json(200, { type: 'file', name: file.split('/').pop(), path: file, size: Buffer.byteLength(map[file]), encoding: 'base64', content: Buffer.from(map[file]).toString('base64'), sha: blobSha(map[file]) })
        const sha = treeOf(map, file)
        if (!sha) return json(404, { message: 'Not Found' })
        return json(200, trees.get(sha).entries.map((entry) => ({ type: entry.type === 'tree' ? 'dir' : 'file', name: entry.path, path: file ? `${file}/${entry.path}` : entry.path, sha: entry.sha })))
      }
      if (file === '.demand-planning-write-check') return json(422, { message: 'Invalid request' })
      const name = body.branch ?? branch
      if (!heads[name]) return json(404, { message: 'Branch not found' })
      const map = { ...commits.get(heads[name]).map }
      const exists = map[file] != null
      if (method === 'PUT') {
        if (!body.sha && exists) return json(422, { message: 'Invalid request. "sha" wasn\'t supplied.' })
        if (body.sha && (!exists || blobSha(map[file]) !== body.sha)) return json(409, { message: `${file} does not match ${body.sha}` })
        map[file] = Buffer.from(body.content, 'base64').toString()
        write(name, map, body.message, [file])
        return json(exists ? 200 : 201, { content: { sha: blobSha(map[file]), path: file }, commit: { sha: heads[name], html_url: `https://github.com/${owner}/${repo}/commit/${heads[name]}` } })
      }
      if (method === 'DELETE') {
        if (!exists) return json(404, { message: 'Not Found' })
        if (blobSha(map[file]) !== body.sha) return json(409, { message: 'does not match' })
        delete map[file]
        write(name, map, body.message, [file])
        return json(200, { commit: { sha: heads[name] } })
      }
    }
    const ref = /^\/git\/refs?\/heads\/(.+)$/.exec(rest)
    if (ref && method === 'GET') return heads[ref[1]] ? json(200, { ref: `refs/heads/${ref[1]}`, object: { sha: heads[ref[1]], type: 'commit' } }) : json(404, { message: 'Not Found' })
    if (ref && method === 'PATCH') {
      const made = commits.get(body.sha)
      if (!made || !heads[ref[1]]) return json(422, { message: 'Reference does not exist' })
      if (made.parent !== heads[ref[1]] && !body.force) return json(422, { message: 'Update is not a fast forward' })
      setBranch(ref[1], body.sha)
      state.writes.push({ branch: ref[1], message: made.message, paths: history[0].paths })
      return json(200, { object: { sha: body.sha } })
    }
    if (rest === '/git/refs' && method === 'POST') {
      const name = body.ref.replace(/^refs\/heads\//, '')
      if (refuseBranches) return json(403, { message: 'Resource not accessible by personal access token' })
      if (heads[name]) return json(422, { message: 'Reference already exists' })
      heads[name] = body.sha
      return json(201, { ref: body.ref, object: { sha: body.sha } })
    }
    const commitRead = /^\/git\/commits\/([0-9a-f]{40})$/.exec(rest)
    if (commitRead && method === 'GET') { const found = commits.get(commitRead[1]); return found ? json(200, { sha: commitRead[1], tree: { sha: found.tree } }) : json(404, { message: 'Not Found' }) }
    const treeRead = /^\/git\/trees\/([0-9a-f]{40})$/.exec(rest)
    if (treeRead && method === 'GET') { const found = trees.get(treeRead[1]); return found ? json(200, { sha: treeRead[1], tree: found.entries, truncated: false }) : json(404, { message: 'Not Found' }) }
    if (rest === '/git/trees' && method === 'POST') {
      const from = trees.get(body.base_tree)
      if (!from || from.prefix) return json(422, { message: 'base_tree is not a root tree' })
      const map = { ...from.map }
      for (const entry of body.tree) { if (entry.sha === null) delete map[entry.path]; else if (typeof entry.sha === 'string') { if (!blobs.has(entry.sha)) return json(422, { message: 'Unknown blob' }); map[entry.path] = blobs.get(entry.sha) } else map[entry.path] = entry.content }
      return json(201, { sha: treeOf(map, '') })
    }
    if (rest === '/git/commits' && method === 'POST') {
      const tree = trees.get(body.tree)
      if (!tree) return json(422, { message: 'Tree not found' })
      const sha = sha1(`commit ${++counter} ${body.message}`)
      commits.set(sha, { map: { ...tree.map }, tree: body.tree, parent: body.parents[0], message: body.message, date: new Date(Date.UTC(2026, 10, 23, 8, 0, counter)).toISOString() })
      return json(201, { sha, html_url: `https://github.com/${owner}/${repo}/commit/${sha}` })
    }
    const blobRead = /^\/git\/blobs\/([0-9a-f]{40})$/.exec(rest)
    if (blobRead && method === 'GET' && /raw/.test(accept)) return blobs.has(blobRead[1]) ? { status: 200, body: blobs.get(blobRead[1]), raw: true } : json(404, { message: 'Not Found' })
    if (blobRead && method === 'GET') return blobs.has(blobRead[1]) ? json(200, { sha: blobRead[1], encoding: 'base64', content: Buffer.from(blobs.get(blobRead[1])).toString('base64') }) : json(404, { message: 'Not Found' })
    return json(404, { message: 'Not Found' })
  }
  // As a fetch (unit tests): a Response for every call, after `delay` ms.
  const fetchImpl = async (url, init = {}) => {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay))
    const accept = init.headers?.Accept ?? init.headers?.accept ?? ''
    const { status, body, raw } = handle(init.method ?? 'GET', url, init.body ?? null, accept)
    if (raw) return new Response(body, { status, headers: { 'Content-Type': 'text/plain' } })
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  }
  // As a Playwright route handler (E2E): every call to api.github.com.
  const route = (route) => { const request = route.request(); const { status, body, raw } = handle(request.method(), request.url(), request.postData(), request.headers().accept ?? ''); return route.fulfill({ status, contentType: raw ? 'text/plain' : 'application/json', body: raw ? body : JSON.stringify(body) }) }
  return { ...state, handle, fetch: fetchImpl, route, read: (path, name = branch) => state.files(name)?.[path] ?? null, put: (path, text, name = branch, message = `set ${path}`) => { const map = { ...state.files(name) }; if (text == null) delete map[path]; else map[path] = text; write(name, map, message, [path]) } }
}
