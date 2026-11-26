import type { EpicSetup, QePageSetting } from '../featureSetup'
import { defaultQePageName, matchColumnChoices, needsQePage, oldQeColumnsHint, qeColumnChoices, resolveQePage } from '../qePage'
import { useQePages } from '../useQeSource'

// EPS-09, DPF-02: the QE page of the DP / IOCC bulk Epic — "QE from page" (an On-Demand Table page; the page named
// Resource Mapping is the default until one is chosen), "Column with the Platform / Product" and "Column with the QE"
// (by column id, so renaming a column keeps the choice). An older setup with only the QE Mapping column names says to
// choose them again; nothing is guessed.
export function QePageFields({ entry, disabled, onChange }: { entry: Pick<EpicSetup, 'qePage' | 'qeColumns'> | undefined; disabled: boolean; onChange: (next: QePageSetting) => void }) {
  const env = useQePages()
  const { setting, defaulted } = resolveQePage(entry?.qePage, env.pages)
  const page = env.pages.find((item) => item.id === setting?.pageId)
  const current: QePageSetting = setting ?? { pageId: '', matchColumn: '', qeColumn: '' }
  const pick = (change: Partial<QePageSetting>) => onChange({ ...current, ...change })
  return <div className="qe-page-fields" role="group" aria-label="QE page">
    <div className="form-row">
      <label>QE from page<select value={current.pageId} disabled={disabled} onChange={(event) => pick({ pageId: event.target.value, matchColumn: '', qeColumn: '' })}>
        <option value="">Not set</option>
        {env.pages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        {current.pageId && !page && <option value={current.pageId}>{current.pageId} (no longer there)</option>}
      </select>{defaulted && <small className="muted">Default: the page named “{defaultQePageName}”. Choose its columns to use it.</small>}{!env.pages.length && <small className="muted">No On-Demand Table page yet.</small>}</label>
      <label>Column with the Platform / Product<select value={current.matchColumn} disabled={disabled || !page} onChange={(event) => pick({ matchColumn: event.target.value })}>
        <option value="">Not set</option>
        {matchColumnChoices(page).map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}
      </select></label>
      <label>Column with the QE<select value={current.qeColumn} disabled={disabled || !page} onChange={(event) => pick({ qeColumn: event.target.value })}>
        <option value="">Not set</option>
        {qeColumnChoices(page).map((column) => <option key={column.id} value={column.id}>{column.name}{column.list ? ' (built-in list)' : ''}</option>)}
      </select></label>
    </div>
    {needsQePage(entry) && entry?.qeColumns && <small className="muted qe-page-hint" role="note">{oldQeColumnsHint(entry.qeColumns)}</small>}
  </div>
}
