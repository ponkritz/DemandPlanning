import test from 'node:test'
import assert from 'node:assert/strict'
import { adminSections, readSettingsTab, rememberedSection, resolveSettings, sectionAllowed, sectionsFor, settingsLabel, settingsPages, settingsPagesFor, settingsSectionKey, settingsTabKey, shownSettingsTab } from '../src/settingsTabs.ts'
import { settingsIndex } from '../src/adminOverview.ts'
import { defaultPolicy, rightsFor } from '../src/access.ts'

// SET-26…SET-29: Admin in seven pages — the pages and their sections, who sees which (the union of the sections'
// rights), and every former page and section opening where it lives now. Synthetic data only.
const can = (...allowed) => (action) => allowed.includes(action)
const memory = (entries = {}) => { const data = { ...entries }; return { getItem: (key) => data[key] ?? null, setItem: (key, value) => { data[key] = String(value) }, removeItem: (key) => { delete data[key] } } }

test('SET-26: seven Admin pages in order, each with its sections (TC-SET-13)', () => {
  assert.deepEqual(settingsPages.map((page) => page.label), ['Overview', 'Streams', 'Feature & PI setup', 'People & access', 'Capacity & time', 'Pages & reports', 'Data & history'])
  assert.deepEqual(settingsPages.map((page) => page.key), ['home', 'connections', 'epics', 'resources', 'capacity', 'pages', 'storage'], 'the keys of the pages that stay are kept')
  const labels = (key) => adminSections[key].map((section) => section.label)
  assert.deepEqual(labels('connections'), ['Stream mapping', 'Release counts', 'Bulk creation'])
  assert.deepEqual(labels('epics'), ['Setup per Epic', 'Lists', 'User Story templates', 'PI Review form'])
  assert.deepEqual(labels('resources'), ['People', 'Team tree', 'Role rights'])
  assert.deepEqual(labels('capacity'), ['Capacity', 'Calculation profiles', 'Hour classification', 'Thresholds', 'Month locks'])
  assert.deepEqual(labels('pages'), ['Menu groups & pages', 'Monthly pack', 'Table & chart defaults'])
  assert.deepEqual(labels('storage'), ['Git storage', 'Other views', 'Connections in Git', 'Historical hours', 'Changes', 'Demo data'])
  assert.ok(!Object.values(adminSections).flat().some((section) => /Read-only sources|Period control|Capacity roles|History$/.test(section.label)), 'no section of the old names (Read-only sources removed)')
})

test('SET-27: a page for the holders of a right of one of its sections; sections without the right hidden (TC-SET-14)', () => {
  // A role with only “PI Review: set up the review form”: Feature & PI setup with only the PI Review form.
  const only = can('pireview.setup')
  assert.ok(settingsPagesFor(only).some((page) => page.key === 'epics'))
  assert.deepEqual(sectionsFor('epics', only).map((section) => section.key), ['lists', 'templates', 'pireview'], 'Lists and User Story templates are shown to everyone, read only (SET-31)')
  assert.equal(shownSettingsTab('pireview', only), 'epics')
  // Capacity & time: the union of its sections' rights (Capacity roles count).
  assert.deepEqual(settingsPages.find((page) => page.key === 'capacity').needs.sort(), ['capacity.periods', 'capacity.rules', 'capacity.settings', 'capacity.time', 'people.capacityRoles'])
  assert.deepEqual(sectionsFor('capacity', can('people.capacityRoles')).map((section) => section.key), ['capacity'])
  assert.deepEqual(sectionsFor('capacity', can('capacity.time')).map((section) => section.key), ['classification'])
  assert.equal(shownSettingsTab('capacity', can()), 'home', 'a page the viewer may not see opens the Overview (no longer Streams)')
  // Changes, Connections in Git and Historical hours need their rights; Demo data and Git storage are everyone's.
  assert.deepEqual(sectionsFor('storage', can()).map((section) => section.key), ['git', 'views', 'sample'])
  assert.deepEqual(sectionsFor('storage', can('storage.shared')).map((section) => section.key), ['git', 'views', 'shared', 'changes', 'sample'])
  assert.equal(sectionAllowed('my', 'bulk', can()), true, 'My settings is everyone’s')
  // The starting matrix: a Team Member sees Setup per Epic (their own version of the Feature setup) and, read only, Lists and User Story templates (SET-31).
  const policy = defaultPolicy(); policy.members = { 'tm@example.com': ['Team Member'], 'sm@example.com': ['Scrum Master'] }
  const of = (email) => { const rights = rightsFor(policy, email); return (key) => rights.actions.has(key) }
  assert.deepEqual(sectionsFor('epics', of('tm@example.com')).map((section) => section.key), ['setup', 'lists', 'templates'])
  assert.deepEqual(sectionsFor('epics', of('sm@example.com')).map((section) => section.key), ['setup', 'lists', 'templates', 'pireview'])
  assert.deepEqual(sectionsFor('connections', of('tm@example.com')).map((section) => section.key), ['mapping', 'counts'], 'the shared Bulk creation needs “Streams: …”')
})

test('SET-28: every former page and section opens where it lives now (TC-SET-15)', () => {
  const where = (tab, section) => resolveSettings(tab, section)
  const cases = [
    [['options'], { tab: 'connections', section: 'mapping' }], [['options', 'epics'], { tab: 'connections', section: 'mapping' }],
    [['options', 'counts'], { tab: 'connections', section: 'counts' }], [['options', 'bulk'], { tab: 'connections', section: 'bulk' }],
    [['pireview'], { tab: 'epics', section: 'pireview' }], [['resources', 'capacity-roles'], { tab: 'capacity', section: 'capacity' }],
    [['capacity', 'rules'], { tab: 'capacity', section: 'classification' }], [['capacity', 'time'], { tab: 'capacity', section: 'classification' }],
    [['capacity', 'insights'], { tab: 'capacity', section: 'thresholds' }], [['capacity', 'period'], { tab: 'capacity', section: 'locks' }],
    [['capacity', 'history'], { tab: 'storage', section: 'history' }], [['history'], { tab: 'storage', section: 'history' }],
    [['pack'], { tab: 'pages', section: 'pack' }], [['pack', 'pack'], { tab: 'pages', section: 'pack' }], [['look', 'tables'], { tab: 'pages', section: 'tables' }], [['tables'], { tab: 'pages', section: 'tables' }],
    [['storage', 'sources'], { tab: 'storage', section: 'views' }], [['connections', 'sources'], { tab: 'storage', section: 'views' }],
    [['storage', 'sample'], { tab: 'storage', section: 'sample' }], [['audit'], { tab: 'storage', section: 'changes' }],
  ]
  for (const [[tab, section], expected] of cases) assert.deepEqual(where(tab, section), expected, `${tab}${section ? `:${section}` : ''}`)
  // Every redirect lands on a section that exists.
  for (const [, { tab, section }] of cases) assert.ok(adminSections[tab].some((entry) => entry.key === section), `${tab}:${section} exists`)
  assert.equal(settingsLabel('audit'), 'Data & history'); assert.equal(settingsLabel('options'), 'Streams'); assert.equal(settingsLabel('pack'), 'Pages & reports')
  // Every Search settings entry opens a page and section that exist (or My settings / Look & feel).
  for (const entry of settingsIndex) if (adminSections[entry.tab] && entry.section) assert.ok(adminSections[entry.tab].some((section) => section.key === entry.section), `${entry.label} → ${entry.tab}:${entry.section}`)
})

test('SET-28: a remembered page or section of before opens where it lives now; the Overview by default (TC-SET-15)', () => {
  const saved = globalThis.localStorage
  try {
    globalThis.localStorage = memory({ [settingsTabKey]: 'audit', [settingsSectionKey]: JSON.stringify({ capacity: 'period', storage: 'sources', epics: 'lists', resources: 'capacity-roles' }) })
    assert.equal(readSettingsTab(), 'storage')
    assert.equal(rememberedSection('capacity'), 'locks')
    assert.equal(rememberedSection('storage'), 'views')
    assert.equal(rememberedSection('epics'), 'lists')
    assert.equal(rememberedSection('resources'), undefined, 'moved to another page: the first section of this one')
    globalThis.localStorage = memory()
    assert.equal(readSettingsTab(), 'home', 'nothing remembered: the Overview')
  } finally { globalThis.localStorage = saved }
})
