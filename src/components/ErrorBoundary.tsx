import { Component, type ErrorInfo, type ReactNode } from 'react'
import { freshLoadUrl, isStaleBuildError } from '../appUpdate'

// A render error in one view no longer blanks the whole app: the page shows what failed and a way back. Data stays
// where it is (IndexedDB, Git); reloading retries with the same data, so the message names the view to check.
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Render failed', error, info.componentStack) }
  render() {
    if (!this.state.error) return this.props.children
    // UPD-07: a newer version was published while this page was open — its code for this view is gone from the server.
    // Load the new version (a fresh address, not the browser's cached page, which would ask for the old code again).
    if (isStaleBuildError(this.state.error)) return <main className="content"><h1>I&amp;D Quality Demand Planning</h1>
      <div className="notice warning" role="alert"><p><strong>A newer version of the app was published.</strong> This page was opened before it, and the code for this view is no longer on the server.</p>
        <p>Load the new version to go on. Your data stays where it is (this browser and Git).</p>
        <div className="button-row"><button type="button" className="primary" onClick={() => window.location.assign(freshLoadUrl(window.location.href))}>Load the new version</button></div>
      </div>
    </main>
    return <main className="content"><h1>I&amp;D Quality Demand Planning</h1>
      <div className="notice error" role="alert"><p><strong>This view could not be drawn.</strong> {this.state.error.message}</p>
        <p>Reload the app to try again. If it fails again on the same page, a loaded work item holds a value the page cannot show: refresh that connection from Azure DevOps, or load the data saved to Git.</p>
        <div className="button-row"><button type="button" className="primary" onClick={() => window.location.reload()}>Reload</button><button type="button" className="ghost" onClick={() => this.setState({ error: null })}>Try to continue</button></div>
      </div>
    </main>
  }
}
