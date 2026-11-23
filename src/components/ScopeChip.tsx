// SET-16: who a setting affects, shown before a change is made. you: only you, kept on this computer (never in Git);
// computer: this computer (browser or desktop app) only; everyone: shared in Git with everyone; both: yours on this
// computer, or everyone's in Git, as chosen on the panel; tool-owner: everyone, changed by the Tool Owner only.
export type Scope = 'you' | 'computer' | 'everyone' | 'both' | 'tool-owner'
const scopes: Record<Scope, { label: string; detail: string }> = {
  you: { label: 'Only you · This computer', detail: 'Kept in this browser or desktop app only: never saved to Git or backups.' },
  computer: { label: 'This computer', detail: 'Applies to this browser or desktop app only.' },
  everyone: { label: 'Everyone · Shared in Git', detail: 'Saved to the Git data repository: a change applies to everyone at their next start.' },
  both: { label: 'Yours or everyone’s', detail: 'Your own choice is kept on this computer; the shared one is saved to Git for everyone. Yours wins for you.' },
  'tool-owner': { label: 'Everyone · Tool Owner only', detail: 'Shared in Git and changed only by the Tool Owner; read-only for everyone else.' },
}

export function ScopeChip({ scope }: { scope: Scope }) {
  return <span className={`scope-chip scope-${scope}`} title={scopes[scope].detail}><span className="sr-only">Applies to: </span>{scopes[scope].label}</span>
}
