import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { normalizeProfiles, resourceRows } from '../src/capacity.ts'
import { fetchTeamMembers } from '../src/azureDevOps.ts'

const resource = (name) => ({ name, firstMonth: '2026-10', lastMonth: '2026-11', months: 2, tasks: 4, work: 80, absence: 8, streams: ['Alpha'], status: 'Balanced', utilization: 90 })

test('Resources list everyone who can be given a region: Time Writing, assignees, historical hours, team members, added by name (CAP-29, CAP-31)', () => {
  const profiles = normalizeProfiles({ 'Dan Eve': { listed: 'team' }, 'Eli Fox': { listed: 'added' }, 'Gus Hay': { region: 'India' }, 'Bad Entry': { listed: 'x' } })
  assert.deepEqual(Object.keys(profiles).sort(), ['Dan Eve', 'Eli Fox', 'Gus Hay'], 'an unknown listed value is dropped, an empty profile is not kept')
  const rows = resourceRows([resource('Ana Costa')], ['Ana Costa', 'Ben Ode', 'Unassigned', ''], ['Cleo Dunn', 'Ana Costa'], profiles)
  assert.deepEqual(rows.map((row) => [row.name, row.sources.join('+'), row.months]), [
    ['Ana Costa', 'time writing+assigned+history', 2],
    ['Ben Ode', 'assigned', 0],
    ['Cleo Dunn', 'history', 0],
    ['Dan Eve', 'team', 0],
    ['Eli Fox', 'added', 0],
    ['Gus Hay', 'profile', 0],
  ])
})

test('Team members are read from Azure DevOps (read only), groups left out, one entry per name (CAP-30)', async () => {
  const seen = []
  const transport = async (request) => { seen.push(request.operation); return { value: [{ identity: { displayName: 'Ben Ode', uniqueName: 'Ben.Ode@example.com' } }, { identity: { displayName: 'QA Team', isContainer: true } }, { identity: { displayName: 'Ana Costa', uniqueName: 'EXAMPLE\\\\acosta' } }, { identity: { displayName: 'Ben Ode' } }] } }
  const members = await fetchTeamMembers({ organization: 'org', project: 'Quality', team: 'QMS' }, 'pat', transport)
  assert.deepEqual(seen, ['team-members'])
  assert.deepEqual(members, [{ name: 'Ana Costa' }, { name: 'Ben Ode' }])
  await assert.rejects(fetchTeamMembers({ organization: 'org', project: 'Quality', team: 'QMS' }, ' ', transport), /PAT/)
  const { azureReadRequest } = createRequire(import.meta.url)('../electron/azure-devops.cjs')
  const request = azureReadRequest({ organization: 'org', project: 'Quality Team', team: 'QMS 0025', pat: 'pat', operation: 'team-members' })
  assert.equal(request.url, 'https://dev.azure.com/org/_apis/projects/Quality%20Team/teams/QMS%200025/members?api-version=7.1&$top=1000')
  assert.equal(request.options.method, 'GET', 'the desktop proxy reads the team with a GET only')
})
