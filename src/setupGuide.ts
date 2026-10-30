import type { SettingsTab } from './settingsTabs'

// The "Get started" guide: the few things a first-time user configures, in order, each with a live status read from
// the app. The four required steps make the app work for one person; the optional ones add the release streams and
// the region-dependent views. The pop-up opens by itself while a required step is open (until dismissed).
export interface SetupFacts {
  gitConnected: boolean; gitReadOnly: boolean
  timeWriting: boolean; email: string; pat: boolean
  fetched: boolean; sample: boolean
  region?: string; canManage: boolean
  streams: { name: string; connected: boolean }[]
  // DP's background data sets (Pedestal releases, DHFI documents): the DP views are incomplete without them.
  dataSets?: { name: string; connected: boolean }[]
}
export type StepState = 'done' | 'todo' | 'blocked'
export interface SetupStep { id: string; title: string; why: string; how: string[]; state: StepState; required: boolean; tab?: SettingsTab; action?: 'fetch' }

export function setupSteps(facts: SetupFacts): SetupStep[] {
  const azureReady = facts.timeWriting && Boolean(facts.email) && facts.pat
  const views = [...facts.streams, ...(facts.dataSets ?? [])]
  const connected = views.filter((stream) => stream.connected).length
  const missing = views.filter((stream) => !stream.connected).map((stream) => stream.name)
  return [
    {
      id: 'git', title: 'Connect the shared Git storage', required: true, tab: 'storage',
      state: facts.gitConnected ? 'done' : 'todo',
      why: 'The team keeps its shared setup in one private GitHub repository: the Azure DevOps connections, Feature setup, holidays and common activities, regions and roles. Connecting it first fills most of the next steps for you.',
      how: ['Settings → Storage → Git storage.', 'The team\'s data repository is already filled in (ponkritz/DemandPlanningStorage, branch main); change it only if your team uses another.', 'Paste a GitHub fine-grained token limited to that repository (Contents: Read, or Read and write to save changes), tick “Remember token in this browser” and press Connect & load.', ...(facts.gitConnected && facts.gitReadOnly ? ['Your token can read but not save: that is enough to use the app.'] : [])],
    },
    {
      id: 'timewriting', title: 'Check the Time Writing connection and your email', required: true, tab: 'connections',
      state: facts.timeWriting && facts.email ? 'done' : 'todo',
      why: 'The QMS-0025 Time Writing backlog is where your Features, User Stories and month Tasks live. Your email tells the app which work is yours and who new work is assigned to.',
      how: ['Settings → Azure DevOps.', facts.gitConnected ? 'The connections from Git are already listed: open “Time Writing” and check it.' : 'Add a connection with the role Time Writing: server https://dev.azure.com, your organization, project and team.', 'Enter your work email (the one Azure DevOps shows for you) and save.'],
    },
    {
      id: 'pat', title: 'Enter your Azure DevOps token (PAT)', required: true, tab: 'connections',
      state: facts.pat ? 'done' : facts.timeWriting ? 'todo' : 'blocked',
      why: 'The app reads and updates Azure DevOps as you, with your own Personal Access Token. It stays in this browser only and is never saved to Git.',
      how: ['In Azure DevOps: User settings → Personal access tokens → New token, scope Work Items: Read & write.', 'Settings → Azure DevOps → the dev.azure.com server → paste the token and save. One token covers every connection on that server.'],
    },
    {
      id: 'fetch', title: 'Fetch your data', required: true, action: 'fetch',
      state: facts.fetched ? 'done' : azureReady ? 'todo' : 'blocked',
      why: facts.sample ? 'Sample data is loaded now. Fetching from Azure DevOps replaces it with your team’s real data.' : 'The first fetch loads the Time Writing backlog; after that the app refreshes by itself.',
      how: ['Press Fetch now (or the ↻ button in the top bar).'],
    },
    {
      id: 'region', title: 'Check your region and role', required: false, tab: facts.canManage ? 'resources' : undefined,
      state: facts.region ? 'done' : facts.fetched ? 'todo' : 'blocked',
      why: 'Your region decides which public holidays and regional activities lower your capacity; your role groups you on the Dashboard.',
      how: facts.canManage ? ['Settings → Resources: set your region and role, then Save to Git.'] : ['Ask your People Manager or Scrum Master to set your region and role in Settings → Resources.'],
    },
    {
      id: 'streams', title: 'Release streams (on-premises server)', required: false, tab: 'connections',
      state: views.length && connected === views.length ? 'done' : facts.pat ? 'todo' : 'blocked',
      why: `Release Details, Pulse Check and the Dashboard’s delivery counts read the DP, CP, IOCC, Content and Tool Validations views from the on-premises Azure DevOps Server; DP also needs its Pedestal releases and DHFI documents (${connected} of ${views.length} ready${missing.length ? `; missing: ${missing.join(', ')}` : ''}). Only needed if you look at releases.`,
      how: ['Settings → Azure DevOps → the on-premises server → paste a PAT created on that server (Work Items: Read). The stream connections come from Git.', 'Settings → Azure DevOps → Stream mapping: set up any row still marked missing (DP, Pedestal, DHFI) from its pre-filled default.'],
    },
  ]
}
export const requiredOpen = (steps: SetupStep[]) => steps.filter((step) => step.required && step.state !== 'done').length
export const guideKey = 'demand-planning-setup-guide-v1'
