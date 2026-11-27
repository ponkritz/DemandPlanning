import test from 'node:test'
import assert from 'node:assert/strict'
import { changeRights, pageSettingsFor, pageSettingsLabel, pageSettingsTable, settingsPageOf, showsPageSettings } from '../src/pageSettings.ts'
import { adminSections } from '../src/settingsTabs.ts'
import { defaultPolicy } from '../src/access.ts'

// SET-32…SET-35 (TC-SET-17, TC-SET-18): a page's ⚙ settings — which sections each page offers, and to whom (the rights
// of a role of the starting matrix; View as uses the viewed role's rights the same way). Synthetic data only.
const roleCan = (role) => { const actions = defaultPolicy().roles[role].actions; return (action) => actions.includes(action) }
const labels = (list) => list.map((entry) => entry.label)
const toolOwner = roleCan('Tool Owner'), scrumMaster = roleCan('Scrum Master'), teamMember = roleCan('Team Member'), admin = roleCan('Admin'), productOwner = roleCan('Product Owner')

test('SET-33: the sections of each page, in order, all Admin sections (TC-SET-17)', () => {
  assert.deepEqual(labels(pageSettingsTable.activities), ['Month locks'], 'SET-36: Time Writing — the period locks only')
  assert.deepEqual(labels(pageSettingsTable.mywork), ['Month locks', 'Hour classification', 'Capacity', 'Setup per Epic', 'User Story templates'])
  assert.deepEqual(labels(pageSettingsTable.release), ['Stream mapping', 'Release counts', 'Release Classification'])
  assert.deepEqual(labels(pageSettingsTable.overview), ['Capacity', 'Thresholds', 'Calculation profiles', 'Table & chart defaults'])
  assert.deepEqual(labels(pageSettingsTable.mydash), labels(pageSettingsTable.overview), 'My dashboard as Team overview')
  assert.deepEqual(labels(pageSettingsTable.pulse), ['Monthly pack', 'Table & chart defaults'])
  for (const list of Object.values(pageSettingsTable)) for (const entry of list) {
    const section = adminSections[entry.tab].find((item) => item.key === entry.section)
    assert.ok(section, `${entry.tab}:${entry.section} is an Admin section (the same panel, no second implementation)`)
    assert.equal(entry.scope, section.scope, 'with its scope')
    assert.ok(entry.change.length > 0, `${entry.label}: a right changes it`)
    // A right that changes a section with permissions in Admin is one of them (the shared part only).
    if (section.needs) for (const action of entry.change) assert.ok(section.needs.includes(action), `${entry.label}: ${action} is one of its Admin permissions`)
  }
  assert.deepEqual(changeRights('epics', 'setup'), ['setup.feature', 'setup.epic'], 'not “Create work items”: the person’s own version is not a shared setting')
  assert.deepEqual(changeRights('connections', 'mapping'), ['streams.manage', 'streams.options'])
  assert.deepEqual(changeRights('epics', 'templates'), ['setup.values'], 'the shared templates; My templates stay in Admin')
  assert.equal(pageSettingsLabel('Time Writing'), 'Settings for Time Writing')
})

test('SET-32, SET-34: a Tool Owner gets every section of every page; a Team Member none (no ⚙) (TC-SET-17)', () => {
  for (const page of ['activities', 'mywork', 'overview', 'mydash', 'pulse']) {
    assert.deepEqual(pageSettingsFor(page, toolOwner), pageSettingsTable[page], `${page}: every section`)
    assert.deepEqual(pageSettingsFor(page, teamMember), [], `${page}: nothing for a Team Member`)
    assert.equal(showsPageSettings(page, teamMember), false)
  }
  assert.deepEqual(labels(pageSettingsFor('release', toolOwner, 'DP')), ['Stream mapping', 'Release counts', 'Release Classification'])
  assert.deepEqual(labels(pageSettingsFor('release', toolOwner, 'CP')), ['Stream mapping', 'Release counts'], 'CP: no bulk creation Epic')
  assert.deepEqual(labels(pageSettingsFor('release', toolOwner, 'Content')), ['Stream mapping', 'Release Classification'], 'Content: no Release counts')
  assert.deepEqual(labels(pageSettingsFor('release', toolOwner, 'S&S IT')), ['Stream mapping'], 'a Windchill stream: its row only')
  assert.deepEqual(pageSettingsFor('release', toolOwner), [], 'a read-only view that is not a stream has no settings')
  for (const stream of ['DP', 'CP', 'IOCC', 'Content', 'S&S IT']) assert.equal(showsPageSettings('release', teamMember, stream), false, `${stream}: no ⚙ for a Team Member`)
})

test('SET-34: a Scrum Master, an Admin and a Product Owner see only the sections their role may change; View as follows the viewed role (TC-SET-17)', () => {
  // Scrum Master (starting matrix): Edit the shared Feature setup and the Epic setup — Setup per Epic, nothing else.
  assert.deepEqual(pageSettingsFor('activities', scrumMaster), [], 'Time Writing: the Month locks only (SET-36), not a Scrum Master\'s')
  assert.deepEqual(labels(pageSettingsFor('mywork', scrumMaster)), ['Setup per Epic'])
  assert.deepEqual(labels(pageSettingsFor('release', scrumMaster, 'DP')), ['Release Classification'])
  assert.deepEqual(pageSettingsFor('release', scrumMaster, 'CP'), [], 'CP: nothing a Scrum Master may change')
  for (const page of ['overview', 'mydash', 'pulse']) assert.equal(showsPageSettings(page, scrumMaster), false, `${page}: no ⚙ for a Scrum Master`)
  // Admin: everything but the stream mapping itself (Tool Owner) — the Epics to match keep Stream mapping in.
  assert.deepEqual(labels(pageSettingsFor('activities', admin)), labels(pageSettingsTable.activities))
  assert.deepEqual(labels(pageSettingsFor('release', admin, 'IOCC')), ['Stream mapping', 'Release counts', 'Release Classification'])
  // Product Owner: none of these settings.
  for (const page of ['activities', 'mywork', 'overview', 'mydash', 'pulse']) assert.equal(showsPageSettings(page, productOwner), false)
  // A role changed in Role rights counts: only Month locks.
  const locksOnly = (action) => action === 'capacity.periods'
  assert.deepEqual(labels(pageSettingsFor('activities', locksOnly)), ['Month locks'])
  assert.equal(showsPageSettings('overview', locksOnly), false)
  // View as: the app passes the viewed role's rights — a Tool Owner viewing as a Team Member sees no ⚙.
  assert.deepEqual(pageSettingsFor('activities', teamMember), [])
  // Fail closed: no roles file loaded → no right → no ⚙.
  assert.equal(showsPageSettings('activities', () => false), false)
})

test('SET-32: which app pages have settings (TC-SET-17)', () => {
  assert.equal(settingsPageOf('activities'), 'activities')
  assert.equal(settingsPageOf('mywork'), 'mywork')
  assert.equal(settingsPageOf('overview'), 'overview')
  assert.equal(settingsPageOf('mydash'), 'mydash')
  assert.equal(settingsPageOf('pulse'), 'pulse')
  assert.equal(settingsPageOf('board', 'DP'), 'release', 'a stream’s Release Details page')
  assert.equal(settingsPageOf('windchill', 'S&S IT'), 'release', 'a Windchill export of a stream')
  assert.equal(settingsPageOf('board'), null, 'the backlog or another view')
  for (const page of ['home', 'admin', 'pireview', 'mypireview', 'docs', 'ondemand']) assert.equal(settingsPageOf(page), null, `${page}: no page settings (PI Review keeps its own ⚙)`)
})
