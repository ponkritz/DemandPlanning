import { useState } from 'react'
import { defaultStreams } from '../streams'
import { compilePattern, defaultNamingPatterns, matchPatterns, maxPatterns, type NamingPattern } from '../namingPatterns'
import { normalizeReleaseSourceSettings } from '../releaseSource'
import type { PageProps } from '../pages/types'
import { Panel, Notice } from './ui'

// QV-55: Settings → Azure DevOps → Stream mapping → Release naming patterns. Per stream, the patterns that name a
// release from a document's Title (built in: Content {*_RELEASE}*, IOCC *Conformance Verification {*} and *Test Tools
// {*}); edited here, tried on a Title, applied to the shared settings and saved to Git with the planning data.
const streams = defaultStreams.filter((stream) => stream.source === 'azure' && stream.rule !== 'dp' && stream.rule !== 'cp').map((stream) => stream.name)
export function NamingPatternsPanel({ store, canManage }: { store: PageProps['store']; canManage: boolean }) {
  const saved = normalizeReleaseSourceSettings(store.state.releaseSourceSettings).namingPatterns
  const [stream, setStream] = useState(streams.includes('Content') ? 'Content' : streams[0] ?? '')
  const current = saved?.[stream] ?? defaultNamingPatterns[stream] ?? []
  const [draft, setDraft] = useState<{ stream: string; rows: NamingPattern[] } | null>(null)
  const rows = draft?.stream === stream ? draft.rows : current
  const [sample, setSample] = useState('')
  const problems = rows.map((row) => { const compiled = compilePattern(row.pattern); return 'error' in compiled ? compiled.error : '' })
  const edit = (next: NamingPattern[]) => setDraft({ stream, rows: next })
  const apply = (next: NamingPattern[] | undefined) => {
    store.update((state) => {
      const settings = normalizeReleaseSourceSettings(state.releaseSourceSettings)
      const patterns = { ...(settings.namingPatterns ?? {}) }
      if (next) patterns[stream] = next.map((row) => ({ label: row.label.trim(), pattern: row.pattern.trim() })); else delete patterns[stream]
      state.releaseSourceSettings = { ...settings, ...(Object.keys(patterns).length ? { namingPatterns: patterns } : { namingPatterns: undefined }) }
      state.audits.unshift({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), actor: 'u-owner', action: 'Update', entity: 'ReleaseSourceSettings', entityId: `naming:${stream}`, detail: next ? `${stream} naming patterns: ${next.map((row) => row.pattern).join(' · ') || 'none'}` : `${stream} naming patterns reset to the built-in ones` })
      return state
    })
    setDraft(null)
  }
  const tried = sample.trim() ? matchPatterns(sample, rows.filter((_, index) => !problems[index])) : undefined
  const isBuiltIn = !saved?.[stream]
  return <Panel className="connection-panel naming-patterns" eyebrow="RELEASE NAMES" title="Release naming patterns" info={<ul><li>How a release is named from a document’s Title, per stream, tried in order; the first that fits wins. A Title no pattern fits keeps the stream’s own rule.</li><li><code>*</code> is any text, <code>{'{…}'}</code> marks the release name (it may hold <code>*</code> and text), spaces match any spaces; case is ignored.</li><li>Content: <code>{'{*_RELEASE}*'}</code> — the name is the Title up to and including _RELEASE; the rest is the document. IOCC: <code>{'*Conformance Verification {*}'}</code> and <code>{'*Test Tools {*}'}</code>, each with its label as the group.</li><li>Shared with everyone in the planning data: Save to Git after applying.</li></ul>}>
    <div className="form-row">
      <label>Stream<select aria-label="Stream for naming patterns" value={stream} onChange={(event) => { setStream(event.target.value); setDraft(null) }}>{streams.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
      <span className="muted">{isBuiltIn ? (defaultNamingPatterns[stream] ? 'Built-in patterns' : 'No patterns: the stream’s own rule') : 'Saved patterns'}</span>
    </div>
    <div className="naming-rows">
      {rows.map((row, index) => <div key={index} className="naming-row">
        <label>Label (group)<input aria-label={`Pattern ${index + 1} label`} value={row.label} maxLength={60} placeholder="Optional, e.g. Test Tools" disabled={!canManage} onChange={(event) => edit(rows.map((entry, at) => at === index ? { ...entry, label: event.target.value } : entry))} /></label>
        <label>Pattern<input aria-label={`Pattern ${index + 1}`} className="naming-pattern" value={row.pattern} maxLength={200} placeholder="e.g. {*_RELEASE}*" spellCheck={false} disabled={!canManage} onChange={(event) => edit(rows.map((entry, at) => at === index ? { ...entry, pattern: event.target.value } : entry))} />{problems[index] && <small className="negative">{problems[index]}</small>}</label>
        {canManage && <div className="button-row">
          <button type="button" className="ghost" aria-label={`Move pattern ${index + 1} up`} disabled={index === 0} onClick={() => { const next = [...rows]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; edit(next) }}>↑</button>
          <button type="button" className="ghost" aria-label={`Remove pattern ${index + 1}`} onClick={() => edit(rows.filter((_, at) => at !== index))}>✕</button>
        </div>}
      </div>)}
      {!rows.length && <p className="muted">No patterns: every Title follows the stream’s own rule.</p>}
    </div>
    {canManage && <div className="button-row">
      <button type="button" className="ghost" disabled={rows.length >= maxPatterns} onClick={() => edit([...rows, { label: '', pattern: '' }])}>＋ Add pattern</button>
      <button type="button" className="primary" disabled={!draft || problems.some(Boolean)} onClick={() => apply(rows)}>Apply</button>
      {draft && <button type="button" className="ghost" onClick={() => setDraft(null)}>Discard</button>}
      {!isBuiltIn && <button type="button" className="ghost" onClick={() => apply(undefined)}>Reset to built-in</button>}
    </div>}
    <label>Try a Title<input aria-label="Try a Title" value={sample} placeholder="e.g. ABC_Labeling_RELEASE_IFU_v2" onChange={(event) => setSample(event.target.value)} /></label>
    {sample.trim() && <p role="status" className="muted">{tried ? <>Release <strong>{tried.name}</strong>{tried.group && <> in <strong>{tried.group}</strong></>}{tried.document && <> · document “{tried.document}”</>}</> : 'No pattern fits: the stream’s own rule names it.'}</p>}
    {draft && <Notice tone="info">Not applied yet: Apply, then Save to Git to share it.</Notice>}
  </Panel>
}
