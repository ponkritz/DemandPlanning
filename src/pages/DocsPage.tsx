import { useMemo, useState } from 'react'
import { Page, Panel } from '../components/ui'
import { Markdown } from '../components/Markdown'
import { parseMarkdown, plainText } from '../markdown'
import { designDocs, designIndex, mediaUrl, projectDocs, type ProjectDoc } from '../docs'
import { downloadMarkdown } from '../download'
import { ToolValidationPackage } from '../components/ToolValidationPackage'
import type { GitStorage } from '../useGitStorage'

// Documentation: the requirements, test plan and other project documents of this build, read in the app. The chosen
// document is remembered in this browser; links between documents and to sections stay in the page.
const docKey = 'demand-planning-docs-tab-v1'
const designKey = 'demand-planning-design-doc-v1'
const files = [...projectDocs, ...designDocs].map((doc) => doc.file)
const designGroups = [
  { label: 'Application and views', docs: designDocs.filter((doc) => !doc.file.startsWith('design/settings/')) },
  { label: 'Settings', docs: designDocs.filter((doc) => doc.file.startsWith('design/settings/')) },
]
const areas = [
  { id: 'project', label: 'Project documentation' },
  { id: 'design', label: 'Design documents' },
  { id: 'validation', label: 'Tool Validation Package' },
] as const

function savedDocument(key: string, documents: ProjectDoc[], fallback: string) {
  try {
    const saved = localStorage.getItem(key)
    return documents.some((doc) => doc.file === saved) ? saved! : fallback
  } catch {
    return fallback
  }
}

export function DocsPage({ git, onConfigure }: { git: GitStorage; onConfigure: () => void }) {
  const [view, setView] = useState<(typeof areas)[number]['id']>('project')
  const [projectFile, setProjectFile] = useState(() => savedDocument(docKey, projectDocs, projectDocs[0].file))
  const [designFile, setDesignFile] = useState(() => savedDocument(designKey, designDocs, designIndex))
  const documents = view === 'design' ? designDocs : projectDocs
  const file = view === 'design' ? designFile : projectFile
  const doc = documents.find((entry) => entry.file === file) ?? documents[0]
  const blocks = useMemo(() => parseMarkdown(doc.source), [doc])
  const sections = blocks.filter((block) => block.kind === 'heading' && block.level === 2)
  const open = (next: string) => {
    const design = next.startsWith('design/')
    setView(design ? 'design' : 'project')
    if (design) setDesignFile(next)
    else setProjectFile(next)
    try { localStorage.setItem(design ? designKey : docKey, next) } catch { /* convenience only */ }
  }
  // Scroll after the chosen document has rendered, so links into another document land on the section.
  const go = (next: string | null, target: string) => {
    if (next && next !== file) open(next)
    requestAnimationFrame(() => { const element = target ? document.getElementById(target) : null; if (element) element.scrollIntoView({ block: 'start' }); else window.scrollTo({ top: 0 }) })
  }
  return <Page className="docs-page">
    <div className="button-row" aria-label="Documentation area">{areas.map((area) => <button key={area.id} type="button" className={view === area.id ? 'primary' : 'ghost'} aria-pressed={view === area.id} onClick={() => setView(area.id)}>{area.label}</button>)}</div>
    {view === 'validation' ? <ToolValidationPackage key={git.accessScope} git={git} onConfigure={onConfigure} /> : <>
    {view === 'design' ? <div className="button-row">
      <button type="button" className="ghost" onClick={() => go(designIndex, '')}>Design index</button>
      <div className="inline-select"><label htmlFor="design-document">Design document</label> <select id="design-document" value={file} onChange={(event) => go(event.target.value, '')}>
        {designGroups.map((group) => <optgroup key={group.label} label={group.label}>
          {group.docs.map((entry) => <option key={entry.file} value={entry.file}>{entry.label}</option>)}
        </optgroup>)}
      </select></div>
    </div> : <div className="overview-tabs" role="tablist" aria-label="Documents">{projectDocs.map((entry) => <button key={entry.file} type="button" role="tab" aria-selected={entry.file === file} className={`backlog-tab ${entry.file === file ? 'backlog-tab-active' : ''}`} onClick={() => go(entry.file, '')}>{entry.label}</button>)}</div>}
    <div className="docs-layout">
      {sections.length > 1 && <nav className="docs-toc" aria-label="Sections"><p className="eyebrow">ON THIS PAGE</p><ul>{sections.map((section) => section.kind === 'heading' && <li key={section.id}><a href={`#${section.id}`} onClick={(event) => { event.preventDefault(); go(null, section.id) }}>{plainText(section.text)}</a></li>)}</ul></nav>}
      <Panel className="docs-panel" action={<div className="button-row"><span className="muted">docs/{doc.file} · this build</span><button type="button" className="ghost" onClick={() => downloadMarkdown(doc.source, doc.file.split('/').at(-1)!)}>Download .md</button></div>}>
        <Markdown blocks={blocks} docs={files} currentDoc={doc.file} onLink={go} media={mediaUrl} />
      </Panel>
    </div>
    </>}
  </Page>
}
