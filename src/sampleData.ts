import type { AzureWorkItem, ReleasePlan } from './domain'
import type { AzureBacklogScope, AzureConfig } from './azureDevOps'
import type { ReleaseSourceSnapshot } from './releaseSource'
import type { Region, ResourceProfile } from './capacity'
import type { ReleaseScope } from './baseline'

// Deterministic synthetic dataset in the exact shape the app reads from Azure DevOps, so every page can be
// exercised without a connection. Clearly labelled as sample data wherever it is shown; never written to Azure.
//
// Time Writing project: Epics are the streams; each Feature has milestone User Stories, a "… - Time Writing"
// User Story and one "<Month YYYY> | <Feature>" Task per person per month carrying Original Estimate and Completed Work.
const people = ['Ana Costa', 'Ben Okafor', 'Chen Wei', 'Diya Sharma', 'Emil Novak', 'Fatima Zahra']
const streams = [
  { epic: 'DP', features: ['DP | Dose Planning | v4.2', 'DP | Dose Planning | v4.1'], npra: false },
  { epic: 'CP', features: ['CP | Care Pathways | v3.1', 'CP | Care Pathways | v2.8'], npra: true },
  { epic: 'Serviceability', features: ['Serviceability | Remote Diagnostics | v1.6'], npra: false },
  { epic: 'Content', features: ['Content | Clinical Library | v7.0', 'Content | Clinical Library | v6.4'], npra: false },
  { epic: 'IOCC', features: ['IOCC | Operations Console | v2.3', 'IOCC | Operations Console | v2.2'], npra: true },
  { epic: 'ECP 1', features: ['ECP 1 | Complaint Handling | v1.0'], npra: false },
  { epic: 'ECP 2', features: ['ECP 2 | Field Actions | v1.2'], npra: false },
  { epic: 'QMS', features: ['QMS | Procedure Updates | 2026-Q4'], npra: true },
  { epic: 'CAPA', features: ['CAPA | CAPA-2026-031'], npra: false },
]
const absenceEpicId = 37778
// Synthetic team structure: one manager, two leads (one also a people manager), specialists in three regions.
export const sampleProfiles: Record<string, ResourceProfile> = {
  'Emil Novak': { region: 'Netherlands', role: 'Manager', peopleManager: true },
  'Ana Costa': { region: 'Netherlands', role: 'Lead', peopleManager: true, reportsTo: 'Emil Novak' },
  'Ben Okafor': { region: 'US', role: 'Lead', reportsTo: 'Ana Costa' },
  'Chen Wei': { region: 'India', role: 'QE', reportsTo: 'Ben Okafor' },
  'Diya Sharma': { region: 'India', role: 'QMS', reportsTo: 'Ana Costa' },
  'Fatima Zahra': { region: 'US', role: 'CAPA', reportsTo: 'Ana Costa' },
}
// Synthetic release scopes for the example estimation rules; CP v3.1 is re-baselined after two assets were scoped in.
export function sampleReleaseScopes(month: string): ReleaseScope[] {
  const at = (offset: number, dayOfMonth: number) => day(shiftMonth(month, offset), dayOfMonth).replace('T09:', 'T10:')
  return [
    { release: 'DP | Dose Planning | v4.2', stream: 'DP', history: [{ at: at(-3, 3), drivers: { documents: 15 }, reason: 'Initial scope' }] },
    { release: 'DP | Dose Planning | v4.1', stream: 'DP', history: [{ at: at(-5, 3), drivers: { documents: 8 }, reason: 'Initial scope' }, { at: at(-4, 12), drivers: { documents: 12 }, reason: 'Labeling changes added 4 documents' }] },
    { release: 'CP | Care Pathways | v3.1', stream: 'CP', history: [{ at: at(-4, 2), drivers: { assets: 8 }, reason: 'Initial scope' }, { at: at(-1, 14), drivers: { assets: 10 }, reason: '2 assets scoped in after SFV' }] },
    { release: 'CP | Care Pathways | v2.8', stream: 'CP', history: [{ at: at(-5, 2), drivers: { assets: 6 }, reason: 'Initial scope' }] },
    { release: 'Serviceability | Remote Diagnostics | v1.6', stream: 'Serviceability', history: [{ at: at(-4, 5), drivers: { documents: 22 }, reason: 'Initial scope' }, { at: at(-2, 9), drivers: { documents: 34 }, reason: 'Field-service documents added' }] },
  ]
}
// Synthetic public holidays by region and calendar month (1–12); 8h each. Illustrative only, not a holiday calendar.
const regionalHolidays: Array<[Region, Record<number, string[]>]> = [
  ['India', { 1: ['Republic Day'], 8: ['Independence Day'], 10: ['Gandhi Jayanti'] }],
  ['Netherlands', { 4: ["King's Day"], 5: ['Ascension Day', 'Whit Monday'], 12: ['Christmas Day', 'Second Christmas Day'] }],
  ['US', { 7: ['Independence Day'], 9: ['Labor Day'], 11: ['Thanksgiving Day'] }],
]
const absenceKinds = ['PTO', 'Sick leave', 'Unplanned leave']
const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// Small seeded generator so the sample is stable between loads and screenshots.
function random(seed: number) { let state = seed >>> 0; return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296 } }

function monthLabel(month: string) { const [year, index] = month.split('-').map(Number); return `${months[index - 1]} ${year}` }
function shiftMonth(month: string, offset: number) { const date = new Date(`${month}-01T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() + offset); return date.toISOString().slice(0, 7) }
const day = (month: string, dayOfMonth: number) => `${month}-${String(Math.min(28, Math.max(1, dayOfMonth))).padStart(2, '0')}T09:00:00Z`

export function sampleDataset(config: AzureConfig, month: string): { items: AzureWorkItem[]; scope: AzureBacklogScope; releaseSource: ReleaseSourceSnapshot; releasePlans: ReleasePlan[] } {
  const next = random(20261017)
  const nextAdhoc = random(4242)
  // Likelihood per month that a stream's first Feature receives unplanned (ad-hoc) support work, by stream index.
  const adhocChance: Record<number, number> = { 0: 0.3, 1: 0.2, 2: 0.85, 5: 0.75, 6: 0.55, 8: 0.9 }
  const team = config.team || 'Sample Team'
  const areaPath = `${config.project}\\${team}`
  const fetchedAt = new Date().toISOString()
  const items: AzureWorkItem[] = []
  let id = 100000
  const make = (partial: Partial<AzureWorkItem> & { title: string; workItemType: string }): AzureWorkItem => {
    const itemId = ++id
    const item: AzureWorkItem = {
      key: `${config.organization.toLowerCase()}/${config.project.toLowerCase()}/${itemId}`, id: itemId, organization: config.organization, project: config.project,
      state: 'Active', assignedTo: '', areaPath, iterationPath: `${config.project}\\PI 2026.4`, tags: '', syncedAt: fetchedAt,
      description: '',
      url: `https://dev.azure.com/${encodeURIComponent(config.organization)}/${encodeURIComponent(config.project)}/_workitems/edit/${itemId}`,
      ...partial,
    }
    items.push(item)
    return item
  }
  const monthKeys = Array.from({ length: 6 }, (_, index) => shiftMonth(month, index - 5))
  let personIndex = 0
  streams.forEach((stream, streamIndex) => {
    const epic = make({ title: stream.epic, workItemType: 'Epic', state: 'Active', description: `${stream.epic} stream of work` })
    stream.features.forEach((title, featureIndex) => {
      const owner = people[personIndex++ % people.length]
      const closed = featureIndex === 1 || streamIndex === 8
      const feature = make({ title, workItemType: 'Feature', parentId: epic.id, assignedTo: owner, state: closed ? 'Closed' : 'Active', description: `Feature DoD: ${closed ? 'IQOQ finished and checklist uploaded' : 'DT finished'}.`, tags: stream.npra && featureIndex === 0 ? 'NPRA Hours' : '', originalEstimate: stream.npra && featureIndex === 0 ? 120 : undefined, targetDate: day(shiftMonth(month, closed ? 0 : 1), 10 + featureIndex * 7), closedDate: closed ? day(month, 6 + streamIndex * 2) : undefined })
      for (const milestone of ['SFV', 'DT']) make({ title: `${title} | ${milestone} review of deliverables`, workItemType: 'User Story', parentId: feature.id, assignedTo: owner, state: milestone === 'SFV' ? 'Closed' : 'Active', iterationPath: `${config.project}\\PI 2026.4\\Sprint 2` })
      const story = make({ title: `${title} - Time Writing`, workItemType: 'User Story', parentId: feature.id, assignedTo: owner, iterationPath: `${config.project}\\PI 2026.4\\Sprint 2` })
      const helpers = [owner, people[(personIndex + 2) % people.length]]
      monthKeys.forEach((key, monthOffset) => {
        helpers.forEach((person, helperIndex) => {
          if (helperIndex === 1 && (streamIndex + monthOffset) % 3 === 0) return
          if (streamIndex >= 5 && helperIndex === 1) return
          const base = helperIndex === 0 ? (streamIndex < 5 ? 36 + streamIndex * 8 : 12 + streamIndex * 2) : 16 + streamIndex * 3
          const plan = Math.round((base + next() * 20) * 4) / 4
          const ratio = 0.8 + next() * (streamIndex === 1 ? 0.7 : 0.45)
          const actual = key > month ? undefined : Math.round(plan * ratio * 4) / 4
          make({ title: `${monthLabel(key)} | ${title}`, workItemType: 'Task', parentId: story.id, assignedTo: person, state: key < month ? 'Closed' : 'Active', iterationPath: config.project, description: `Time writing for ${monthLabel(key)}`, originalEstimate: plan, completedWork: actual, tags: streamIndex === 8 && monthOffset === 5 && helperIndex === 0 ? 'ad-hoc' : '' })
        })
        // Unplanned support: no Original Estimate, tagged ad-hoc (the app's rule for work that arrives after planning locks).
        if (featureIndex === 0 && key <= month && nextAdhoc() < (adhocChance[streamIndex] ?? 0)) {
          const person = helpers[Math.floor(nextAdhoc() * helpers.length)]
          make({ title: `${monthLabel(key)} | ${title} - unplanned support`, workItemType: 'Task', parentId: story.id, assignedTo: person, state: key < month ? 'Closed' : 'Active', iterationPath: config.project, description: 'Escalation / field support not in the monthly plan', completedWork: Math.round((4 + nextAdhoc() * 20) * 4) / 4, tags: 'ad-hoc' })
        }
      })
    })
  })
  // Absence: one Feature per person under the absence Epic, a Time Writing story, and month Tasks per leave kind.
  const absenceEpic = make({ title: 'Absence & Leave', workItemType: 'Epic', state: 'Active' })
  items[items.length - 1] = { ...absenceEpic, id: absenceEpicId, key: `${config.organization.toLowerCase()}/${config.project.toLowerCase()}/${absenceEpicId}`, url: absenceEpic.url.replace(String(absenceEpic.id), String(absenceEpicId)) }
  people.forEach((person, index) => {
    const feature = make({ title: `${person} - Absence`, workItemType: 'Feature', parentId: absenceEpicId, assignedTo: person })
    const story = make({ title: `${person} - Time Writing`, workItemType: 'User Story', parentId: feature.id, assignedTo: person })
    monthKeys.forEach((key, monthOffset) => {
      absenceKinds.forEach((kind, kindIndex) => {
        const hours = kindIndex === 0 ? (index + monthOffset) % 3 === 0 ? 16 : (index + monthOffset) % 4 === 0 ? 40 : 0 : kindIndex === 1 ? ((index * 7 + monthOffset * 3) % 5 === 0 ? 8 : 0) : ((index + monthOffset) % 7 === 0 ? 4 : 0)
        if (!hours || key > month) return
        make({ title: `${monthLabel(key)} | ${person} - ${kind}`, workItemType: 'Task', parentId: story.id, assignedTo: person, state: key < month ? 'Closed' : 'Active', iterationPath: config.project, completedWork: hours })
      })
    })
  })
  // Regional holidays: one Feature per region under the absence Epic; each holiday is a month Task that applies to
  // everyone mapped to that region, not to the assignee.
  for (const [region, byMonth] of regionalHolidays) {
    const feature = make({ title: `Public Holidays - ${region}`, workItemType: 'Feature', parentId: absenceEpicId })
    const story = make({ title: `Public Holidays - ${region} - Time Writing`, workItemType: 'User Story', parentId: feature.id })
    for (const key of monthKeys) for (const holiday of byMonth[Number(key.slice(5, 7))] ?? []) {
      make({ title: `${monthLabel(key)} | ${holiday}`, workItemType: 'Task', parentId: story.id, state: key < month ? 'Closed' : 'Active', iterationPath: config.project, originalEstimate: 8, completedWork: key > month ? undefined : 8 })
    }
  }
  const scope: AzureBacklogScope = { organization: config.organization, project: config.project, team, itemKeys: items.map((item) => item.key), areaPaths: [areaPath], fetchedAt }

  // Read-only release source (DHFI): approved documents whose Area Path carries the release ("DHFI\<Name>\Release x.y");
  // only the DP, CP, IOCC and Content products release. Author Approval Date decides the month a release counts as completed.
  const productNames: Record<string, string> = { DP: 'Dose Planning', CP: 'Care Pathways', IOCC: 'Operations Console', Content: 'Clinical Library' }
  const releases: Array<[string, Array<[string, number]>]> = [
    ['DP', [['v4.2', 0], ['v4.1', -1], ['v3.9', -3]]], ['CP', [['v3.1', 0], ['v2.8', -2], ['v2.7', -4]]],
    ['IOCC', [['v2.3', 0], ['v2.2', -1], ['v2.0', -5]]], ['Content', [['v7.0', 0], ['v6.4', -1], ['v6.3', -2], ['v6.0', -4]]],
  ]
  const docs: AzureWorkItem[] = []
  let docId = 500000
  for (const [stream, versions] of releases) for (const [version, offset] of versions) for (let copy = 0; copy < (offset === 0 ? 2 : 1); copy++) {
    const itemId = ++docId
    const approvalMonth = shiftMonth(month, offset)
    docs.push({ key: `${config.organization.toLowerCase()}/dhfi/${itemId}`, id: itemId, organization: config.organization, project: 'DHFI', title: `${copy ? 'Verification Summary' : 'Design Review Approval'} — ${stream} ${version}`, workItemType: 'Document', state: 'Approved', assignedTo: '', areaPath: `DHFI\\${productNames[stream]}\\Release ${version.replace(/^v/, '')}`, iterationPath: `DHFI\\${approvalMonth.slice(0, 4)}`, tags: '', syncedAt: fetchedAt, approvalDate: day(approvalMonth, 4 + docId % 20 + copy * 3), url: `https://dev.azure.com/${encodeURIComponent(config.organization)}/DHFI/_workitems/edit/${itemId}` })
  }
  // Release planning records (Source, Program, Title, Type, milestone dates); kept separate from Azure data.
  const plans: ReleasePlan[] = [
    ['TFS', 'DP', 'DP | Dose Planning | v4.2', 'Release', 'DP'], ['TFS', 'DP', 'DP | Dose Planning | v4.3', 'PU', 'DP'], ['Windchill', 'CP', 'CP | Care Pathways | v3.1', 'Release', 'CP'],
    ['Windchill', 'IOCC', 'IOCC | Operations Console | v2.3', 'PU', 'IOCC'], ['Manual', 'Content', 'Content | Clinical Library | v7.0', 'Release', 'Content'], ['Manual', 'Content', 'Content | Clinical Library | v7.1', 'PU', 'Content'],
  ].map(([source, program, title, type, stream], index) => ({
    id: `sample-plan-${index + 1}`, source: source as ReleasePlan['source'], program, title, type: type as ReleasePlan['type'], stream,
    milestones: { PRD: day(shiftMonth(month, -2), 3 + index), SFV: day(shiftMonth(month, -1), 8 + index), DT: day(month, 2 + index * 3), PR: index % 2 ? undefined : day(month, 18 + index), 'Design Review': index < 3 ? day(month, 20 + index) : undefined },
    updatedAt: fetchedAt, sample: true,
  }))
  return { items, scope, releaseSource: { organization: config.organization, project: 'DHFI', query: "SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.State] = 'Approved'", fetchedAt, items: docs }, releasePlans: plans }
}
