import type { AppState } from './domain'

function saveBlob(contents: BlobPart, mime: string, filename: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: mime }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

const quote = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`

export function exportEffortCsv(state: AppState, month?: string) {
  const rows = state.efforts
    .filter((effort) => !month || effort.month === month)
    .map((effort) => {
      const activity = state.activities.find((item) => item.id === effort.activityId)
      const resource = state.people.find((person) => person.id === activity?.resourceId)
      return [activity?.name, activity?.type, resource?.name, effort.month, effort.classification, effort.plannedHours, effort.actualHours, effort.baselineHours, effort.notes]
    })
  const header = ['Activity', 'Type', 'Resource', 'Month', 'Classification', 'Planned Hours', 'Actual Hours', 'Baseline Hours', 'Notes']
  saveBlob([header, ...rows].map((row) => row.map(quote).join(',')).join('\r\n'), 'text/csv;charset=utf-8', `demand-planning-${month || 'all'}.csv`)
}

export function exportStateJson(state: AppState) {
  saveBlob(JSON.stringify(state, null, 2), 'application/json', `demand-planning-backup-${new Date().toISOString().slice(0, 10)}.json`)
}

export function downloadTemplateCsv() {
  const template = 'Activity Name,Activity Type,Process Owner,Assigned QE,Status,Start Date,End Date,Resource Band,Complexity,Month,Planned Hours,Actual Hours,Notes\r\n'
  saveBlob(template, 'text/csv;charset=utf-8', 'demand-planning-migration-template.csv')
}
