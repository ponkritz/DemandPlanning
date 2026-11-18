import { useLayoutEffect, useRef } from 'react'
import { checkFormula, formulaFigures, formulaFunctions, maxFormulaLength } from '../formula'

// CAP-55: the fx bar — the formula typed as in Excel, with buttons that insert a figure, an operator or a function at
// the cursor, and a check as you type (valid with the figures it uses, or the problem).
const operators: [string, string, string][] = [['+', ' + ', 'Plus'], ['−', ' - ', 'Minus'], ['×', ' * ', 'Times'], ['÷', ' / ', 'Divide by'], ['(', '(', 'Open bracket'], [')', ')', 'Close bracket']]
export function FormulaBar({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const input = useRef<HTMLInputElement>(null)
  // The cursor after an insert, placed as soon as the new value is on screen (before the next keystroke).
  const caret = useRef<number | null>(null)
  useLayoutEffect(() => {
    const field = input.current, at = caret.current
    if (field && at != null) { caret.current = null; field.focus(); field.setSelectionRange(at, at) }
  }, [value])
  const check = checkFormula(value)
  const insert = (text: string) => {
    const field = input.current
    const start = field?.selectionStart ?? value.length, end = field?.selectionEnd ?? value.length
    const next = `${value.slice(0, start)}${text}${value.slice(end)}`.slice(0, maxFormulaLength)
    caret.current = Math.min(start + text.length, next.length)
    onChange(next)
  }
  return <div className="fx">
    <div className={`fx-bar${check.ok ? '' : ' fx-bar-error'}`}>
      <span className="fx-label" aria-hidden="true">fx</span>
      <input ref={input} aria-label="Utilization formula (fx)" spellCheck={false} autoComplete="off" value={value} maxLength={maxFormulaLength} onChange={(event) => onChange(event.target.value)} />
    </div>
    {check.ok ? <p className="fx-status positive" role="status">Valid formula · uses {check.used.join(', ')}</p> : <p className="fx-status negative" role="alert">{check.error}</p>}
    <div className="fx-chips" role="group" aria-label="Insert a figure">{formulaFigures.map(([name, meaning]) => <button key={name} type="button" className="fx-chip" title={meaning} onClick={() => insert(`[${name}]`)}>[{name}]</button>)}</div>
    <div className="fx-chips" role="group" aria-label="Insert an operator or function">
      {operators.map(([label, text, name]) => <button key={label} type="button" className="fx-chip fx-op" aria-label={name} onClick={() => insert(text)}>{label}</button>)}
      {formulaFunctions.map((name) => <button key={name} type="button" className="fx-chip fx-op" onClick={() => insert(`${name}(`)}>{name}()</button>)}
      <button type="button" className="fx-chip" onClick={() => onChange('=')}>Clear</button>
    </div>
    <small className="muted">Figures in [square brackets]; + − * / and ( ); MAX(a, b), MIN(a, b), ROUND(x, digits), IF(test, then, else) with &gt; &lt; &gt;= &lt;= = &lt;&gt;. Actual uses Completed Work, Planned the planned source below; dividing by 0 gives blank.</small>
  </div>
}
