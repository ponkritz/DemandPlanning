import { useMemo, useState } from 'react'
import { Page, Panel } from '../components/ui'
import { Markdown } from '../components/Markdown'
import { parseMarkdown, plainText } from '../markdown'
import { projectDocs } from '../docs'
import { downloadMarkdown } from '../download'

// Documentation: the requirements, test plan and other project documents of this build, read in the app. The chosen
// document is remembered in this browser; links between documents and to sections stay in the page.
const docKey = 'demand-planning-docs-tab-v1'
const files = projectDocs.map((doc) => doc.file)
const initialDoc = () => { try { const saved = localStorage.getItem(docKey); return saved && files.includes(saved) ? saved : files[0] } catch { return files[0] } }

export function DocsPage() {
  const [file, setFileState] = useState(initialDoc)
  const doc = projectDocs.find((entry) => entry.file === file) ?? projectDocs[0]
  const blocks = useMemo(() => parseMarkdown(doc.source), [doc])
  const sections = blocks.filter((block) => block.kind === 'heading' && block.level === 2)
  const open = (next: string) => { setFileState(next); try { localStorage.setItem(docKey, next) } catch { /* convenience only */ } }
  // Scroll after the chosen document has rendered, so links into another document land on the section.
  const go = (next: string | null, target: string) => {
    if (next && next !== file) open(next)
    requestAnimationFrame(() => { const element = target ? document.getElementById(target) : null; if (element) element.scrollIntoView({ block: 'start' }); else window.scrollTo({ top: 0 }) })
  }
  return <Page className="docs-page">
    <div className="overview-tabs" role="tablist" aria-label="Documents">{projectDocs.map((entry) => <button key={entry.file} type="button" role="tab" aria-selected={entry.file === file} className={`backlog-tab ${entry.file === file ? 'backlog-tab-active' : ''}`} onClick={() => { open(entry.file); window.scrollTo({ top: 0 }) }}>{entry.label}</button>)}</div>
    <div className="docs-layout">
      {sections.length > 1 && <nav className="docs-toc" aria-label="Sections"><p className="eyebrow">ON THIS PAGE</p><ul>{sections.map((section) => section.kind === 'heading' && <li key={section.id}><a href={`#${section.id}`} onClick={(event) => { event.preventDefault(); go(null, section.id) }}>{plainText(section.text)}</a></li>)}</ul></nav>}
      <Panel className="docs-panel" action={<div className="button-row"><span className="muted">docs/{doc.file} · this build</span><button type="button" className="ghost" onClick={() => downloadMarkdown(doc.source, doc.file)}>Download .md</button></div>}>
        <Markdown blocks={blocks} docs={files} onLink={go} />
      </Panel>
    </div>
  </Page>
}
