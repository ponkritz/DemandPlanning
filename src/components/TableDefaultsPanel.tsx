import { excelDateFormats, normalizeTableDefaults, tableDefaults, type ExcelDateFormat, type ExportFormat, type TableDefaults } from '../tableDefaults'
import type { useAppStore } from '../store'
import type { GitStorage } from '../useGitStorage'
import { GitSyncBar } from './GitStorage'
import { Panel } from './ui'

// Settings → Table defaults (UI-12): the design default every table follows, shared with everyone (saved with the
// shared app data; Save to Git shares it) and audited. Changing it changes every table at once.
export function TableDefaultsPanel({ store, git, canEdit }: { store: ReturnType<typeof useAppStore>; git: GitStorage; canEdit: boolean }) {
  const current = normalizeTableDefaults(store.state.tableDefaults)
  const change = (patch: Partial<TableDefaults>, detail: string) => store.update((draft) => {
    draft.tableDefaults = normalizeTableDefaults({ ...normalizeTableDefaults(draft.tableDefaults), ...patch })
    draft.audits.unshift({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), actor: 'u-owner', action: 'Update', entity: 'TableDefaults', entityId: 'tables', detail })
    return draft
  })
  const flag = (key: 'resize' | 'reorder' | 'chooseColumns' | 'wrapToggle' | 'densityToggle' | 'defaultWrap', label: string, hint: string) =>
    <label className="check" key={key}><input type="checkbox" disabled={!canEdit} checked={current[key]} onChange={(event) => change({ [key]: event.target.checked }, `${label} = ${event.target.checked ? 'on' : 'off'}`)} /><span><strong>{label}</strong> <small className="muted">{hint}</small></span></label>
  const format = (entry: ExportFormat, label: string) => <label className="check" key={entry}><input type="checkbox" disabled={!canEdit} checked={current.exportFormats.includes(entry)} onChange={(event) => change({ exportFormats: event.target.checked ? [...current.exportFormats, entry] : current.exportFormats.filter((item) => item !== entry) }, `Export ${label} = ${event.target.checked ? 'on' : 'off'}`)} />{label}</label>
  return <Panel className="admin-section" eyebrow="SHARED" title="Table defaults" info="The design default of every table: what each table offers and how it starts. Changing it here changes every table for everyone (after Save to Git). Each person's own widths, column order, hidden columns, wrap and density per table stay in their browser.">
    <GitSyncBar git={git} />
    <div className="table-defaults">
      <fieldset><legend>Every table offers</legend>
        {flag('resize', 'Resize columns', 'drag the edge of a heading; double-click resets it')}
        {flag('reorder', 'Move columns', 'drag a heading onto another, or ↑ ↓ in the Columns list')}
        {flag('chooseColumns', 'Choose columns', 'tick columns on or off in the Columns list')}
        {flag('wrapToggle', 'Wrap text', 'a switch between wrapped and one-line cells')}
        {flag('densityToggle', 'Compact / Comfortable', 'a switch between tight and roomy rows')}
      </fieldset>
      <fieldset><legend>Export</legend>
        {format('xlsx', 'Excel (.xlsx)')}{format('csv', 'CSV (.csv)')}
        <small className="muted">One Export button per table offers the formats ticked here (none: no Export). Dates are written as real date-times in both, so Excel can show them as a long date and time.</small>
        <label>Date format in Excel<select disabled={!canEdit} value={current.excelDateFormat} onChange={(event) => change({ excelDateFormat: event.target.value as ExcelDateFormat }, `Excel date format = ${event.target.value}`)}>{excelDateFormats.map((entry) => <option key={entry} value={entry}>{entry}</option>)}</select></label>
      </fieldset>
      <fieldset><legend>A table starts</legend>
        <label>Row density<select disabled={!canEdit} value={current.defaultDensity} onChange={(event) => change({ defaultDensity: event.target.value as TableDefaults['defaultDensity'] }, `Default density = ${event.target.value}`)}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label>
        {flag('defaultWrap', 'Wrapped', 'text wraps until someone switches it off for a table')}
      </fieldset>
      {canEdit && <div className="button-row"><button type="button" className="ghost" onClick={() => change(tableDefaults, 'Reset to the built-in defaults')}>Reset to the built-in defaults</button></div>}
    </div>
  </Panel>
}
