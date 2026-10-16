import { Heading, Panel, Pill } from '../components/ui'
import type { AzureWorkspace } from '../useAzureWorkspace'

export function AzureDevOpsPage({ azure, onOpenBoard }: { azure: AzureWorkspace; onOpenBoard: () => void }) {
  const { projectUrl, changeProjectUrl, team, setTeam, includeProjectEpics, setIncludeProjectEpics, pat, setPat, busy, error, setError, message, setMessage, preview, setPreview, saved, fetchPreview, rememberPat, forgetPat, savePreview } = azure
  return <section className="content"><Heading eyebrow="SOURCE CONNECTION" title="Azure DevOps" detail="Configure the connection, save your PAT and fetch data. Browse and manage work items in Board." action={<button className="primary" onClick={onOpenBoard}>Open Board →</button>} />
    <Panel className="connection-panel"><div className="panel-heading"><div><h2>Connect work-item data</h2><p className="muted">Fetch the team's configured area paths and work items, including Epics, Features and Bugs. Preview before saving.</p></div><Pill tone={busy ? 'info' : saved.length ? 'open' : 'neutral'}>{busy ? 'Fetching…' : saved.length ? 'Saved data available' : 'Not connected'}</Pill></div>
      <form className="azure-form" onSubmit={fetchPreview}>
        <label>Azure DevOps project or backlog URL<input type="url" required disabled={busy} value={projectUrl} onChange={(event) => changeProjectUrl(event.target.value)} /></label>
        <div className="form-row"><label>Team<input required disabled={busy} value={team} onChange={(event) => { setTeam(event.target.value); setPreview(null) }} /></label><label>Personal access token<input type="password" required autoComplete="off" disabled={busy} value={pat} onChange={(event) => setPat(event.target.value)} placeholder="Configure once on this browser" /></label></div>
        <div className="button-row"><button type="button" className="ghost" disabled={busy || !pat.trim()} onClick={() => { try { rememberPat() } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to save the PAT.') } }}>Save PAT on this browser</button><button type="button" className="ghost" disabled={busy} onClick={forgetPat}>Forget PAT</button></div>
        <label className="checkbox-label"><input type="checkbox" disabled={busy} checked={includeProjectEpics} onChange={(event) => { setIncludeProjectEpics(event.target.checked); setPreview(null) }} />Include all accessible project Epics (children are fetched from the selected team scope)</label>
        <div className="button-row"><button className="primary" disabled={busy}>{busy ? 'Fetching team work items…' : 'Fetch preview'}</button>{preview && <><button type="button" className="primary" disabled={!preview.items.length} onClick={savePreview}>Save {preview.items.length} work items</button><button type="button" className="ghost" onClick={onOpenBoard}>Review in Board →</button><button type="button" className="ghost" onClick={() => { setPreview(null); setMessage('Preview discarded. Previously saved work items are unchanged.') }}>Discard preview</button></>}</div>
      </form>
      <p className="muted">Use Work Items → Read &amp; Write for creation. The PAT is saved separately in this browser profile for reuse, excluded from app backups, SharePoint sync and GitHub. Anyone with access to this profile can use it. Forget PAT removes the saved copy.</p>
      {error && <div className="notice error" role="alert">{error}</div>}{message && <div className="notice" role="status">{message}</div>}
    </Panel>
  </section>
}
