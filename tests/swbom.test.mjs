import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { components, readLockfile, splitKey } from '../scripts/swbom.mjs'

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

test('the SWBOM lists exactly the components of pnpm-lock.yaml, with scope and licence (TC-CI-04)', () => {
  const list = components(readLockfile(read('pnpm-lock.yaml')))
  const bom = JSON.parse(read('docs/swbom.cdx.json'))
  const pkg = JSON.parse(read('package.json'))
  const key = (entry) => `${entry.name}@${entry.version}:${entry.scope}`
  assert.deepEqual(bom.components.map((entry) => `${entry.name}@${entry.version}:${entry.properties.find((p) => p.name === 'swbom:scope').value}`).sort(), list.map(key).sort(), 'run pnpm swbom and commit docs/SWBOM.md and docs/swbom.cdx.json')
  assert.deepEqual([bom.bomFormat, bom.specVersion, bom.metadata.component.name, bom.metadata.component.version], ['CycloneDX', '1.5', pkg.name, pkg.version])
  for (const [name, spec] of Object.entries(pkg.dependencies)) assert.ok(list.some((entry) => entry.name === name && entry.scope === 'runtime' && entry.direct), `${name} (${spec}) is a direct runtime component`)
  for (const name of Object.keys(pkg.devDependencies)) assert.ok(list.some((entry) => entry.name === name && entry.direct && entry.scope !== 'runtime'), `${name} is a direct build / test component`)
  assert.equal(list.find((entry) => entry.name === 'electron').scope, 'desktop runtime')
  assert.ok(bom.components.every((entry) => entry.licenses?.length), 'every component has a licence')
  assert.ok(bom.components.filter((entry) => entry.scope === 'required').every((entry) => entry.hashes?.[0]?.alg === 'SHA-512'), 'shipped components carry their integrity hash')
  const markdown = read('docs/SWBOM.md')
  assert.match(markdown, new RegExp(`\\*\\*${list.length} third-party components\\*\\*`))
  for (const entry of list.filter((item) => item.scope !== 'build / test')) assert.ok(markdown.includes(`| ${entry.name} | ${entry.version} |`), `${entry.name} in SWBOM.md`)
})

test('lockfile keys: scoped names and peer suffixes (TC-CI-04)', () => {
  assert.deepEqual(splitKey("'@azure/msal-browser@5.27.0'"), ['@azure/msal-browser', '5.27.0'])
  assert.deepEqual(splitKey('react-dom@19.3.1(react@19.3.1)'), ['react-dom', '19.3.1'])
  const lock = readLockfile(`lockfileVersion: '9.0'\n\nimporters:\n\n  .:\n    dependencies:\n      a:\n        specifier: ^1.0.0\n        version: 1.0.0\n    devDependencies:\n      t:\n        specifier: ^2.0.0\n        version: 2.0.0\n\npackages:\n\n  a@1.0.0:\n    resolution: {integrity: sha512-AAAA}\n\n  b@3.0.0:\n    resolution: {integrity: sha512-BBBB}\n\n  t@2.0.0:\n    resolution: {integrity: sha512-CCCC}\n\nsnapshots:\n\n  a@1.0.0:\n    dependencies:\n      b: 3.0.0\n\n  b@3.0.0: {}\n\n  t@2.0.0:\n    dependencies:\n      b: 3.0.0\n`)
  assert.deepEqual(components(lock).map((entry) => [entry.name, entry.scope, entry.direct]), [['a', 'runtime', true], ['b', 'runtime', false], ['t', 'build / test', true]], 'a dependency of a runtime package ships, even when a tool uses it too')
})
