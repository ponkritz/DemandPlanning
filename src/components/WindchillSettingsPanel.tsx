import { useState } from 'react'
import { windchillBookmarklet } from '../windchillBridge'
import { Notice, Panel, Pill } from './ui'
import { testWindchillInBrowser } from '../windchillBrowser'
import { loadWindchillSettings, normalizeServicePath, normalizeWindchillHost, saveWindchillSettings, windchillServiceUrl, type WindchillSettings, type WindchillTestResult } from '../windchill'

// Windchill host setup: where Windchill is and which search to run. Saved in this browser only; the connection
// test and the searches run from the browser itself with its own Windchill sign-in (as the Azure DevOps cloud views do),
// or from the desktop app (Windows single sign-on or its sign-in window). The app never sees a password.
export function WindchillSettingsPanel() {
  const [saved, setSaved] = useState<WindchillSettings>(loadWindchillSettings)
  const [draft, setDraft] = useState<WindchillSettings>(saved)
  const [notice, setNotice] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [test, setTest] = useState<WindchillTestResult | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (patch: Partial<WindchillSettings>) => { setNotice(null); setDraft((current) => ({ ...current, ...patch })) }
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      const next = { ...draft, host: normalizeWindchillHost(draft.host), servicePath: normalizeServicePath(draft.servicePath), objectType: draft.objectType.trim(), filter: draft.filter.trim(), fields: draft.fields.trim() }
      saveWindchillSettings(next); setSaved(next); setDraft(next); setTest(null)
      setNotice({ tone: 'success', text: 'Windchill settings saved in this browser.' })
    } catch (failure) { setNotice({ tone: 'error', text: failure instanceof Error ? failure.message : 'Could not save the Windchill settings.' }) }
  }

  async function run(action: 'test' | 'signIn') {
    const call = window.windchill?.[action] ?? (action === 'test' ? () => testWindchillInBrowser(windchillServiceUrl(saved)) : undefined)
    if (!call || !saved.host) return
    setBusy(true); setTest(null)
    try { setTest(await call({ host: saved.host, servicePath: saved.servicePath })) }
    catch (failure) { setTest({ ok: false, status: 0, message: failure instanceof Error ? failure.message : 'The test failed.', services: [] }) }
    finally { setBusy(false) }
  }

  async function signOut() {
    if (!window.windchill?.signOut) return
    setBusy(true); setTest(null)
    try { await window.windchill.signOut(); setNotice({ tone: 'info', text: 'Signed out of Windchill in the desktop app.' }) }
    catch (failure) { setNotice({ tone: 'error', text: failure instanceof Error ? failure.message : 'Could not sign out.' }) }
    finally { setBusy(false) }
  }

  return <Panel className="connection-panel" eyebrow="WINDCHILL" title="Windchill host" info="Where Windchill is; the searches are the Windchill views below. Saved in this browser only; no password is stored. In the web app, the test and the searches run from this browser with your Windchill sign-in here (sign in to Windchill in another tab first); this works only if Windchill allows this app's address. Otherwise use Open in browser and Import on the views below."
    action={<Pill tone={saved.host ? test?.ok ? 'open' : test ? 'danger' : 'info' : 'neutral'}>{saved.host ? test?.ok ? 'Connected' : test ? 'Test failed' : 'Saved' : 'Not set'}</Pill>}>
    <form className="connection-form" onSubmit={save}>
      <label>Host<input required value={draft.host} onChange={(event) => set({ host: event.target.value })} placeholder="plm.example.com" /></label>
      <label>Service path<input required value={draft.servicePath} onChange={(event) => set({ servicePath: event.target.value })} placeholder="/Windchill/servlet/odata" /></label>
      <label>Login<select value={draft.login} onChange={() => set({ login: 'sso' })}><option value="sso">Company sign-in (this browser's Windchill session)</option></select></label>
      <div className="connection-actions"><button className="primary" disabled={!dirty}>Save</button><button type="button" className="ghost" disabled={!saved.host || dirty || busy} onClick={() => void run('test')}>{busy ? 'Working…' : 'Test connection'}</button>
        {window.windchill?.signIn && <button type="button" className={test?.signIn ? 'primary' : 'ghost'} disabled={!saved.host || dirty || busy} onClick={() => void run('signIn')}>Sign in</button>}
        {window.windchill?.signOut && <button type="button" className="ghost" disabled={busy} onClick={() => void signOut()}>Sign out</button>}</div>
    </form>
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    {saved.host && <p className="muted">Service address: {windchillServiceUrl(saved)}{dirty ? ' · Save first to test the new values.' : ''}</p>}
    {test && <Notice tone={test.ok ? 'success' : 'error'}>{test.message}{test.services.length > 0 && <> Services: {test.services.join(', ')}.</>}</Notice>}
    {!window.windchill && <WindchillBookmark />}
  </Panel>
}

// The "Windchill → app" bookmark for Fetch via Windchill tab: dragged to the favourites bar, or created by hand with the
// copied code as its address. React does not render javascript: links, so the address is set on the element directly.
function WindchillBookmark() {
  const code = windchillBookmarklet(window.location.origin)
  const [copied, setCopied] = useState('')
  const copy = () => { void navigator.clipboard?.writeText(code).then(() => setCopied('Copied.'), () => setCopied('Could not copy; select the code below instead.')) }
  return <div className="windchill-bookmark">
    <p><strong>Windchill → app bookmark</strong> (Windchill does not let this app read it directly): drag this button to your favourites bar, <a className="ghost" ref={(element) => { element?.setAttribute('href', code) }} onClick={(event) => event.preventDefault()}>Windchill → app</a>, or add a favourite named “Windchill → app” and paste the copied code as its address. <button type="button" className="ghost" onClick={copy}>Copy bookmark code</button> {copied && <small>{copied}</small>}</p>
    <p className="muted">Then on a Windchill view click Fetch via Windchill tab, sign in to Windchill in the tab that opens if asked, and click the bookmark there once: the searches run on Windchill and the results come back here. The bookmark only reads, and only answers this app ({window.location.origin}).</p>
  </div>
}
