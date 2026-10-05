import { useState } from 'react'
import readXlsxFile from 'read-excel-file/browser'
import { downloadTemplateCsv } from '../download'
import type { Activity, MonthlyEffort, PersonRef } from '../domain'
import { isTransformedDataSheet, parseTransformedCsv, parseTransformedMatrix, toNumber, type MigrationPreviewRow } from '../migration'
import { Heading, Panel, Pill } from '../components/ui'
import type { PageProps } from './types'

export function MigrationPage({ store }: PageProps) {
  const [preview, setPreview] = useState<MigrationPreviewRow[]>([])
  const [message, setMessage] = useState('')
  const [fileName, setFileName] = useState('')

  async function read(file?: File) {
    if (!file) return
    let result
    let source = file.name
    try {
      if (file.name.toLowerCase().endsWith('.xlsx')) {
        const workbook = await readXlsxFile(file)
        const sheet = workbook.find((item) => item.sheet.replaceAll(' ', '').toLowerCase() === 'transformeddata') ?? workbook.find((item) => isTransformedDataSheet(item.data))
        if (!sheet) { setPreview([]); setMessage('Template mismatch. No TransformedData sheet with the required headers was found.'); return }
        result = parseTransformedMatrix(sheet.data)
        source = `${file.name} → ${sheet.sheet}`
      } else result = parseTransformedCsv(await file.text())
    } catch (error) {
      setPreview([]); setMessage(error instanceof Error ? `Unable to read the selected file: ${error.message}` : 'Unable to read the selected file.'); return
    }
    setFileName(source)
    setPreview(result.rows)
    if (result.missingHeaders.length) setMessage(`Template mismatch. Missing columns: ${result.missingHeaders.join(', ')}`)
    else setMessage(result.extraHeaders.length ? `Loaded ${source}. Extra columns will be ignored: ${result.extraHeaders.join(', ')}` : `Loaded ${source}.`)
  }

  function importRows() {
    const validRows = preview.filter((row) => !row.errors.length)
    let activityCount = 0
    let effortCount = 0
    let peopleCount = 0
    const now = new Date().toISOString()
    store.update((draft) => {
      const peopleByName = new Map(draft.people.map((person) => [person.name.trim().toLowerCase(), person]))
      const activityBySourceKey = new Map<string, Activity>()
      for (const row of validRows) {
        let resource: PersonRef | undefined
        if (row.resourceName) {
          const personKey = row.resourceName.toLowerCase()
          resource = peopleByName.get(personKey)
          if (!resource) {
            resource = { id: crypto.randomUUID(), name: row.resourceName, email: '', role: 'Contributor', active: true, region: row.raw.Region, discipline: row.raw.Role }
            draft.people.push(resource); peopleByName.set(personKey, resource); peopleCount += 1
          } else {
            if (!resource.region && row.raw.Region) resource.region = row.raw.Region
            if (!resource.discipline && row.raw.Role) resource.discipline = row.raw.Role
          }
        }
        const sourceKey = `${row.name.toLowerCase()}|${resource?.id ?? 'unassigned'}`
        let activity = activityBySourceKey.get(sourceKey) ?? draft.activities.find((item) => item.source === 'Migration' && item.name.toLowerCase() === row.name.toLowerCase() && (item.resourceId ?? '') === (resource?.id ?? ''))
        if (!activity) {
          activity = {
            id: crypto.randomUUID(), name: row.name, type: row.type, processOwnerId: 'u-owner', resourceId: resource?.id,
            status: row.status, startDate: `${row.month}-01`, endDate: `${row.month}-01`, band: 'Not Applicable', complexity: 'Low',
            stream: row.raw['Stream(Features)'], sourceCategory: row.raw['Service/Project/Release'], releaseType: row.raw['Project / Release Type'],
            currentMilestone: row.raw['Current Milestone'], sourceNote: row.raw.Column1, region: row.raw.Region, discipline: row.raw.Role,
            source: 'Migration', createdAt: now, createdBy: 'u-owner',
          }
          draft.activities.push(activity); activityBySourceKey.set(sourceKey, activity); activityCount += 1
        } else {
          if (`${row.month}-01` < activity.startDate) activity.startDate = `${row.month}-01`
          if (`${row.month}-01` > activity.endDate) activity.endDate = `${row.month}-01`
          activity.currentMilestone = row.raw['Current Milestone'] || activity.currentMilestone
          activity.status = row.status
        }
        const existingEffort = draft.efforts.find((effort) => effort.activityId === activity.id && effort.month === row.month)
        const effortData = {
          plannedHours: row.plannedHours, actualHours: row.actualHours, notes: row.raw.Column1,
          totalWorkingHours: toNumber(row.raw['Total Working Hours']), standardHours: toNumber(row.raw['Standard Hours (Meetings + Break)']),
          netWorkingHours: toNumber(row.raw['Total Working Hrs - Break']), regionalHolidayHours: toNumber(row.raw['Regional Holiday Hours']),
          updatedAt: now, updatedBy: 'u-owner',
        }
        if (existingEffort) Object.assign(existingEffort, effortData)
        else {
          const effort: MonthlyEffort = { id: crypto.randomUUID(), activityId: activity.id, month: row.month, classification: 'Planned', baselineHours: null, learnings: '', struggles: '', ...effortData }
          draft.efforts.push(effort); effortCount += 1
        }
      }
      draft.audits.unshift({ id: crypto.randomUUID(), timestamp: now, actor: 'u-owner', action: 'Import', entity: 'Migration', entityId: fileName || 'csv', detail: `${activityCount} activities, ${effortCount} monthly effort rows and ${peopleCount} resources imported` })
      return draft
    })
    setMessage(`Imported ${activityCount} activities and ${effortCount} monthly effort rows. ${peopleCount} new resources were added automatically.`)
    setPreview([])
  }

  const invalidCount = preview.filter((row) => row.errors.length).length
  const warningCount = preview.filter((row) => row.warnings.length).length
  return <section className="content"><Heading eyebrow="CONTROLLED ONBOARDING" title="Migration" detail="Load the TransformedData tab directly from the current P&S demand-planning Excel workbook or its CSV export." action={<button className="ghost" onClick={downloadTemplateCsv}>Download CSV template</button>} />
    <div className="migration-steps"><Panel><span className="step">1</span><h3>Select Excel</h3><p>Choose the shared-drive .xlsx workbook. The app locates TransformedData automatically; CSV is also supported.</p></Panel><Panel><span className="step">2</span><h3>Validate</h3><p>The app checks the 17 required headers, month dates and numeric Expected/Actual values before import.</p></Panel><Panel><span className="step">3</span><h3>Import</h3><p>Rows become activity-resource records plus monthly effort. Re-import updates existing matching records.</p></Panel></div>
    <Panel className="upload-zone"><input id="migration-file" type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" onChange={(event) => read(event.target.files?.[0])} /><label htmlFor="migration-file"><strong>Choose Excel workbook or CSV</strong><span>The selected file is read locally in the app and is not uploaded to GitHub.</span></label></Panel>
    {message && <div className={message.startsWith('Template mismatch') || message.startsWith('Unable') ? 'notice error' : 'notice success'}>{message}</div>}
    {preview.length > 0 && <Panel className="table-panel"><div className="panel-heading"><div><h2>Validation preview</h2><p className="muted">{preview.length} source rows · {invalidCount} invalid · {warningCount} warnings · showing first 50</p></div><button className="primary" disabled={invalidCount === preview.length} onClick={importRows}>Import {preview.length - invalidCount} valid rows</button></div><table><thead><tr><th>Source row</th><th>Activity / Resource</th><th>Type</th><th>Month</th><th>Expected</th><th>Actual</th><th>Validation</th></tr></thead><tbody>{preview.slice(0, 50).map((row) => <tr key={row.sourceRow}><td>{row.sourceRow}</td><td><strong>{row.name || 'Missing title'}</strong><small>{row.resourceName || 'Unassigned'}</small></td><td>{row.type}</td><td>{row.month || row.raw['Month(Date)'] || 'Missing'}</td><td>{row.plannedHours ?? '—'}</td><td>{row.actualHours ?? '—'}</td><td><Pill tone={row.errors.length ? 'danger' : row.warnings.length ? 'warning' : 'open'}>{row.errors[0] ?? row.warnings[0] ?? 'Ready'}</Pill></td></tr>)}</tbody></table></Panel>}
  </section>
}
