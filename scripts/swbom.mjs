#!/usr/bin/env node
// Software Bill of Materials (SWBOM): every third-party component of the app, read from pnpm-lock.yaml (the exact
// versions CI installs), with its licence, integrity hash, how it is used and whether it ships.
// - docs/SWBOM.md: the readable list (also on the Documentation page);
// - docs/swbom.cdx.json: the same in CycloneDX 1.5 JSON, for tools.
// Scope: "runtime" = shipped in the web app and the desktop app (the dependencies of package.json and everything they
// pull in); "desktop runtime" = Electron (shipped in the desktop app, with its own Chromium and Node.js); "build / test"
// = tools that build, test or package the app and are not shipped. Licences come from the installed packages; a
// platform-specific package not installed on this computer keeps the licence recorded before.
// Usage: node scripts/swbom.mjs           write both files
//        node scripts/swbom.mjs --check   fail when the files do not list exactly the components of the lockfile
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const root = new URL('..', import.meta.url)
const path = (relative) => fileURLToPath(new URL(relative, root))
const unquote = (text) => text.trim().replace(/^'(.*)'$/, '$1')
// "name@1.2.3" or "@scope/name@1.2.3(peer@1)" → [name, version]
export function splitKey(key) {
  const bare = unquote(key).replace(/\(.*$/, '')
  const at = bare.lastIndexOf('@')
  return [bare.slice(0, at), bare.slice(at + 1)]
}

// The parts of a pnpm v9 lockfile the SWBOM needs: direct dependencies, packages (integrity) and their dependencies.
export function readLockfile(text) {
  const direct = new Map(), packages = new Map(), deps = new Map()
  let section = '', current = '', group = '', directGroup = '', directName = ''
  for (const line of text.split(/\r?\n/)) {
    if (/^\S/.test(line)) { section = line.replace(/:.*$/, ''); current = ''; continue }
    if (section === 'importers') {
      const group4 = /^ {4}(dependencies|devDependencies|optionalDependencies):\s*$/.exec(line)
      if (group4) { directGroup = group4[1]; continue }
      const name6 = /^ {6}(\S.*):\s*$/.exec(line)
      if (name6) { directName = unquote(name6[1]); continue }
      const version8 = /^ {8}version:\s*(.+)$/.exec(line)
      if (version8 && directName) direct.set(directName, { version: version8[1].trim().replace(/\(.*$/, ''), dev: directGroup === 'devDependencies' })
    } else if (section === 'packages') {
      const key2 = /^ {2}(\S.*):\s*$/.exec(line)
      if (key2) { current = unquote(key2[1]); const [name, version] = splitKey(current); packages.set(current, { name, version }); continue }
      const integrity = /^ {4}resolution:\s*\{integrity:\s*([^,}]+)/.exec(line)
      if (integrity && current) packages.get(current).integrity = integrity[1].trim()
    } else if (section === 'snapshots') {
      const key2 = /^ {2}(\S.*):/.exec(line)
      if (key2) { const [name, version] = splitKey(key2[1]); current = `${name}@${version}`; if (!deps.has(current)) deps.set(current, new Set()); continue }
      const group4 = /^ {4}(dependencies|optionalDependencies):\s*$/.exec(line)
      if (group4) { group = group4[1]; continue }
      if (/^ {4}\S/.test(line)) { group = ''; continue }
      const dep6 = /^ {6}(\S.*?):\s*(\S.*)$/.exec(line)
      if (dep6 && group && current) deps.get(current).add(`${unquote(dep6[1])}@${dep6[2].trim().replace(/\(.*$/, '')}`)
    }
  }
  return { direct, packages, deps }
}

const runtimeRoots = (direct) => [...direct].filter(([, entry]) => !entry.dev).map(([name, entry]) => `${name}@${entry.version}`)
export function components(lock) {
  // Everything the runtime dependencies pull in ships; Electron itself ships in the desktop app; the rest is tooling.
  const runtime = new Set(), queue = runtimeRoots(lock.direct)
  while (queue.length) { const id = queue.shift(); if (runtime.has(id)) continue; runtime.add(id); for (const next of lock.deps.get(id) ?? []) queue.push(next) }
  const electron = lock.direct.get('electron')
  const directIds = new Map([...lock.direct].map(([name, entry]) => [`${name}@${entry.version}`, entry]))
  return [...lock.packages.values()].map(({ name, version, integrity }) => {
    const id = `${name}@${version}`
    const scope = runtime.has(id) ? 'runtime' : electron && id === `electron@${electron.version}` ? 'desktop runtime' : 'build / test'
    return { name, version, integrity, scope, direct: directIds.has(id) }
  }).sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version, undefined, { numeric: true }))
}

const licenceOf = (value) => typeof value === 'string' ? value : value && typeof value === 'object' && typeof value.type === 'string' ? value.type : Array.isArray(value) ? value.map(licenceOf).filter(Boolean).join(' OR ') : ''
// pnpm's store folders are "<name>@<version>", with "_<peers>" appended when the package has peer dependencies.
let storeFolders
function installedLicence(name, version) {
  storeFolders ??= existsSync(path('node_modules/.pnpm')) ? readdirSync(path('node_modules/.pnpm')) : []
  const base = `${name.replace('/', '+')}@${version}`
  const folder = storeFolders.find((entry) => entry === base) ?? storeFolders.find((entry) => entry.startsWith(`${base}_`))
  const file = folder ? path(`node_modules/.pnpm/${folder}/node_modules/${name}/package.json`) : ''
  if (!file || !existsSync(file)) return ''
  try { const pkg = JSON.parse(readFileSync(file, 'utf8')); return licenceOf(pkg.license) || licenceOf(pkg.licenses) } catch { return '' }
}
const purl = (name, version) => `pkg:npm/${name.startsWith('@') ? `%40${name.slice(1)}` : name}@${version}`
const hexOf = (integrity) => { const found = /^sha512-(.+)$/.exec(integrity ?? ''); return found ? Buffer.from(found[1], 'base64').toString('hex') : '' }

export function render(list, app, previous = new Map()) {
  const rows = list.map((entry) => ({ ...entry, licence: installedLicence(entry.name, entry.version) || previous.get(`${entry.name}@${entry.version}`) || 'not recorded (package not installed on this computer)' }))
  const count = (scope) => rows.filter((row) => row.scope === scope).length
  const table = (subset) => ['| Component | Version | Licence | Scope | Direct |', '|---|---|---|---|---|', ...subset.map((row) => `| ${row.name} | ${row.version} | ${row.licence} | ${row.scope} | ${row.direct ? 'yes' : ''} |`)].join('\n')
  const licences = Object.entries(rows.reduce((all, row) => ({ ...all, [row.licence]: (all[row.licence] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1])
  const markdown = `# Software Bill of Materials (SWBOM)

Generated by \`pnpm swbom\` (\`scripts/swbom.mjs\`) from \`pnpm-lock.yaml\` — do not edit by hand. \`pnpm test\` fails when it no longer lists exactly the components of the lockfile; the daily package update regenerates it. The same list in CycloneDX 1.5 JSON is \`docs/swbom.cdx.json\`. The in-house modules are listed in [SOFTWARE-COMPONENTS.md](SOFTWARE-COMPONENTS.md) §1, the purpose and failure effect of each direct dependency in §2, and known vulnerabilities in §4.

**Product:** ${app.name} ${app.version} · **${rows.length} third-party components** — ${count('runtime')} runtime (shipped in the web and desktop app), ${count('desktop runtime')} desktop runtime (Electron, with its own Chromium and Node.js), ${count('build / test')} build / test only (not shipped).

**Scope.** *runtime*: a dependency of \`package.json\` or anything it pulls in; part of the web bundle and the desktop app. *desktop runtime*: shipped only in the desktop app. *build / test*: builds, tests, lints or packages the app; never part of what users run. **Direct** marks the components named in \`package.json\`.

**Licences:** ${licences.map(([licence, n]) => `${licence} (${n})`).join(', ')}.

## 1. Shipped components

${table(rows.filter((row) => row.scope !== 'build / test'))}

## 2. Direct build and test tools

${table(rows.filter((row) => row.scope === 'build / test' && row.direct))}

## 3. All components

${table(rows)}
`
  const bom = {
    bomFormat: 'CycloneDX', specVersion: '1.5', version: 1,
    metadata: { component: { type: 'application', name: app.name, version: app.version }, tools: [{ name: 'scripts/swbom.mjs' }] },
    components: rows.map((row) => ({
      type: 'library', name: row.name, version: row.version, purl: purl(row.name, row.version), scope: row.scope === 'build / test' ? 'excluded' : 'required',
      ...(row.licence.startsWith('not recorded') ? {} : { licenses: [/^[\w.+-]+$/.test(row.licence) ? { license: { id: row.licence } } : { expression: row.licence }] }),
      ...(hexOf(row.integrity) ? { hashes: [{ alg: 'SHA-512', content: hexOf(row.integrity) }] } : {}),
      properties: [{ name: 'swbom:scope', value: row.scope }, { name: 'swbom:direct', value: String(row.direct) }],
    })),
  }
  return { markdown, json: `${JSON.stringify(bom, null, 2)}\n` }
}

const identity = (entries) => entries.map((entry) => `${entry.name}@${entry.version}:${entry.scope}`).sort().join('\n')
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const lock = readLockfile(readFileSync(path('pnpm-lock.yaml'), 'utf8'))
  const list = components(lock)
  const pkg = JSON.parse(readFileSync(path('package.json'), 'utf8'))
  const jsonFile = path('docs/swbom.cdx.json'), mdFile = path('docs/SWBOM.md')
  const before = existsSync(jsonFile) ? JSON.parse(readFileSync(jsonFile, 'utf8')) : { components: [] }
  if (process.argv.includes('--check')) {
    const recorded = before.components.map((entry) => ({ name: entry.name, version: entry.version, scope: entry.properties?.find((p) => p.name === 'swbom:scope')?.value }))
    if (identity(recorded) !== identity(list) || before.metadata?.component?.version !== pkg.version || !existsSync(mdFile)) { console.error('SWBOM is out of date: run pnpm swbom and commit docs/SWBOM.md and docs/swbom.cdx.json.'); process.exit(1) }
    console.log(`SWBOM: ${list.length} components, current.`)
  } else {
    const previous = new Map(before.components.map((entry) => [`${entry.name}@${entry.version}`, entry.licenses?.[0]?.license?.id ?? entry.licenses?.[0]?.expression ?? '']).filter(([, licence]) => licence))
    const { markdown, json } = render(list, { name: pkg.name, version: pkg.version }, previous)
    writeFileSync(mdFile, markdown); writeFileSync(jsonFile, json)
    console.log(`SWBOM: ${list.length} components written (${createHash('sha256').update(json).digest('hex').slice(0, 12)}).`)
  }
}
