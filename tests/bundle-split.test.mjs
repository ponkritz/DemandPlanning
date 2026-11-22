import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('NFR-08: pages load on demand — the shell imports only the start pages; the documents come with the Documentation page (TC-PERF-01)', () => {
  const app = read('src/App.tsx')
  const eager = [...app.matchAll(/^import \{([^}]*)\} from '\.\/pages\/([A-Za-z]+)'/gm)].map((m) => m[2]).filter((name) => name !== 'registry')
  assert.deepEqual(eager.filter((name) => !['MyDashboardPage', 'HomePage'].includes(name)), [], 'only the start pages are imported eagerly')
  const pages = readdirSync(new URL('../src/pages/', import.meta.url)).filter((file) => file.endsWith('Page.tsx')).map((file) => file.replace('.tsx', ''))
  for (const page of pages.filter((name) => !['MyDashboardPage', 'HomePage'].includes(name) && app.includes(`<${name}`))) assert.match(app, new RegExp(`const ${page} = lazy\\(`), `${page} loads on demand`)
  assert.match(app, /<Suspense fallback=\{<p className="muted page-loading"/, 'a loading note while a page loads')
  // The bundled documents are imported only by the Documentation page.
  const users = [...readdirSync(new URL('../src/', import.meta.url), { recursive: true })].filter((file) => /\.tsx?$/.test(file) && read(`src/${file}`).match(/from '(\.\.?\/)+docs'/)).map((file) => String(file).replaceAll('\\', '/'))
  assert.deepEqual(users, ['pages/DocsPage.tsx'], 'any OS path separator')
})
