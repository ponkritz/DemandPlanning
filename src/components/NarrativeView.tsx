import type { Insight, NarrativeTone, OnDemandPage } from '../onDemand'
import { narrativeLines, toneLabels } from '../narratives'
import '../narratives.css'

// CHT-60, CHT-65 A Narrative drawn: its sentences as a list, each with its tone — a coloured left border and an icon,
// and the tone in words for a screen reader ("Warning: …") — in the chart grid like a summary table (the height of its
// content). Plain text only: React writes the sentences as text, never as markup (SM-130). Several currencies: the
// one shown is chosen as on a chart (OND-24).
const icons: Record<NarrativeTone, string> = { info: 'ℹ', good: '✓', warning: '⚠', bad: '✕' }

export function NarrativeView({ page, insight, compare, currency, onCurrency }: { page: OnDemandPage; insight: Insight; compare?: OnDemandPage; currency: string; onCurrency: (code: string) => void }) {
  const { lines, facts } = narrativeLines(page, insight, { compare, currency })
  return <div className="narrative">
    {facts.currencies.length > 1 && <label className="od-currency-pick">Currency<select aria-label={`Currency of ${insight.title || 'the narrative'}`} value={facts.currency} onChange={(event) => onCurrency(event.target.value)}>{facts.currencies.map((entry) => <option key={entry.code} value={entry.code}>{entry.code} ({entry.rows} row{entry.rows === 1 ? '' : 's'})</option>)}</select></label>}
    {lines.length ? <ul className="narrative-list">
      {lines.map((line, index) => <li key={index} className={`narrative-line narrative-${line.tone}`} data-tone={line.tone}>
        <span className="narrative-icon" aria-hidden="true">{icons[line.tone]}</span>
        <span className="narrative-text"><span className="sr-only">{toneLabels[line.tone]}: </span>{line.text}</span>
      </li>)}
    </ul> : <p className="muted narrative-empty">Nothing to report for this selection.</p>}
  </div>
}
