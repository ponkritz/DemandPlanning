import { useEffect, useState, useSyncExternalStore } from 'react'
import { clearFinishedJobs, listJobs, subscribeJobs, type Job } from '../backgroundJobs'

const stateLabel: Record<Job['state'], string> = { running: 'Running', done: 'Done', error: 'Needs a look' }
const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

// Top bar: the background jobs of this page load (New Feature, Bulk actions, Monthly Time Writing). Hidden until the
// first job; "n running" while any runs, else the last result. Leaving the page while a job runs asks first.
export function JobsIndicator() {
  const jobs = useSyncExternalStore(subscribeJobs, listJobs)
  const [open, setOpen] = useState(false)
  const running = jobs.filter((job) => job.state === 'running').length
  const failed = jobs.filter((job) => job.state === 'error').length
  useEffect(() => {
    if (!running) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [running])
  if (!jobs.length) return null
  const label = running ? `⟳ ${running} running` : failed ? `⚠ ${failed} to check` : '✓ Jobs done'
  return <div className="jobs-indicator">
    <button type="button" className={`ghost jobs-button${running ? ' jobs-running' : failed ? ' jobs-failed' : ''}`} aria-expanded={open} aria-live="polite" onClick={() => setOpen(!open)}>{label}</button>
    {open && <div className="jobs-panel" role="dialog" aria-label="Background jobs">
      <div className="jobs-head"><strong>Background jobs</strong><span className="muted">This page load only</span></div>
      <ul>{jobs.map((job) => <li key={job.id} className={`job job-${job.state}`}>
        <div><strong>{job.label}</strong> <small className="muted">{stateLabel[job.state]} · {time(job.started)}{job.finished ? `–${time(job.finished)}` : ''}</small></div>
        <p>{job.detail}</p>
      </li>)}</ul>
      <div className="button-row"><button type="button" className="text-button" disabled={jobs.every((job) => job.state === 'running')} onClick={clearFinishedJobs}>Clear finished</button><button type="button" className="text-button" onClick={() => setOpen(false)}>Close</button></div>
    </div>}
  </div>
}
