import { useRef, useState } from 'react'
import type { GitStorage } from '../useGitStorage'
import type { ValidationDocument } from '../toolValidation'
import { validationMime } from '../toolValidation'
import { downloadFile } from '../download'
import { DataTable, type DataColumn } from './DataTable'
import { Notice, Panel } from './ui'

export function ToolValidationPackage({ git, onConfigure }: { git: GitStorage; onConfigure: () => void }) {
  const [documents, setDocuments] = useState<ValidationDocument[]>([])
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [search, setSearch] = useState('')
  const pending = useRef(false)
  async function load() {
    if (pending.current) return
    pending.current = true; setBusy('list'); setMessage(''); setDocuments([]); setLoaded(false)
    try { setDocuments(await git.listValidationDocuments()); setLoaded(true) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to load the package.') }
    finally { pending.current = false; setBusy('') }
  }
  async function download(doc: ValidationDocument) {
    if (pending.current) return
    pending.current = true; setBusy(doc.path); setMessage('')
    try { downloadFile(await git.readValidationDocument(doc.path), validationMime(doc.name), doc.name) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to download the document.') }
    finally { pending.current = false; setBusy('') }
  }
  const columns: DataColumn<ValidationDocument>[] = [
    { id: 'name', label: 'Document', value: (doc) => doc.name },
    { id: 'category', label: 'Category', value: (doc) => doc.category },
    { id: 'format', label: 'Format', value: (doc) => doc.format },
    { id: 'size', label: 'Size (KB)', value: (doc) => Math.ceil(doc.size / 1024) },
    { id: 'download', label: 'Download', sortable: false, export: false, render: (doc) => <button type="button" className="ghost" disabled={Boolean(busy)} onClick={() => void download(doc)} aria-label={`Download ${doc.name}`}>{busy === doc.path ? 'Downloading…' : 'Download'}</button> },
  ]
  return <Panel title="Tool Validation Package" action={<div className="button-row"><button className="ghost" type="button" onClick={onConfigure}>Connection settings</button><button className="primary" type="button" disabled={!git.connected || Boolean(busy)} onClick={() => void load()}>{busy === 'list' ? 'Loading…' : loaded ? 'Refresh documents' : 'Load documents'}</button></div>}>
    <p>Private repository: {git.config ? `${git.config.owner}/${git.config.repo} · ${git.config.branch}` : 'not configured'} · tool-validation/demandplanning</p>
    <Notice tone="info">Draft validation package. Downloading a document does not make it approved or executed. Blank Word templates, draft Markdown records and CSV registers are labelled separately; downloads retain their original format.</Notice>
    {!git.connected && <Notice tone="info">Configure your GitHub PAT in Connection settings. Select the private storage repository with Contents: Read permission; write permission is not required for downloads.</Notice>}
    {message && <Notice tone="error">{message}</Notice>}
    <DataTable id="tool-validation-documents" columns={columns} rows={documents.filter((doc) => `${doc.name} ${doc.category} ${doc.format}`.toLowerCase().includes(search.toLowerCase()))} rowKey={(doc) => doc.path} caption="Private Tool Validation Package documents" toolbar={<label>Find document <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, category or format" /></label>} empty={loaded ? 'No matching documents.' : 'Load documents to browse the private package.'} />
  </Panel>
}
