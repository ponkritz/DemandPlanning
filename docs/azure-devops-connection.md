# Azure DevOps work-item trial

Open **Azure DevOps** in the app. The supplied organization/project/team are prefilled from the backlog URL. Fetch and preview only read Azure DevOps. Feature creation is an explicit, separate action.

## Connect

1. In Azure DevOps User settings → Personal access tokens, create a token for the required organization. Select custom scopes → **Work Items → Read** and a short expiry (seven days for the trial), subject to organization policy.
2. Paste the token into the app's password field and choose **Save PAT on this browser**, or fetch once to save it. Never paste it in chat, a repository, a URL, or a GitHub Actions variable.
3. Select **Fetch preview**. The app reads the team's configured area paths, queries all work-item types in that scope, and reads their details in batches of at most 200. **Include all accessible project Epics** is enabled by default, adding Epics outside team areas without duplicate IDs. Their out-of-team children are not fetched automatically. Parent IDs and hierarchy relations are preserved.
4. Open **Board** from the sidebar or **Review in Board**. Review the hierarchy, states and source dates. Select **Save fetched work items** to retain the source records. Unsaved previews survive navigation between Board and connection settings within the app session. Re-fetching upserts by organization/project/ID without creating duplicate source records. Previously saved items missing from a later fetch are retained for review.

The PAT is saved in a separate localStorage entry scoped to the organization/project, as requested for this trial. Fetch and create reuse it across sessions on the same browser profile. It is never included in AppState, JSON backups, SharePoint state sync or audit records. **Forget PAT** removes that local copy; revocation must be done in Azure DevOps. Anyone with access to the browser profile can use the saved token. It is not a managed credential vault. GitHub Secrets are not needed.

## Hierarchy and Feature creation

The separate **Board** view shows fetched Epics, Features, User Stories, Tasks and other work-item types using real parent IDs (with reverse hierarchy relations as a fallback). Expand individual branches or use Expand all. Active / New / Closed filters match the source state exactly. Matching children keep their ancestors as context; custom states remain visible under All. Parents outside the fetched team scope are labelled, rather than guessed. **Azure DevOps** only contains connection, PAT, fetch and preview-save controls; source details and Feature creation live in Board.

Select **+ Feature** on an Epic or **New Feature** to choose from all fetched Epics in the project. Enter a title, optional assignee/date/acceptance criteria and a PAT with **Work Items → Read & Write**. The PU description preset is `Feature DoD: DT finished. This is a PU release.` The Release preset is `Feature DoD: IQOQ finished and Checklist uploaded into the Feature.` Preset text is editable before creation.

Review Area Path (defaults to the Epic's area but can be overridden) and Iteration Path. **Load iteration paths** combines team iterations and the project's iteration tree; choose the actual full path in the picker. Short names resolve only when they have one unambiguous match. "Current PI" is a name, not a built-in Azure DevOps macro. If no actual iteration has that name, select the correct full PI path. Internal classification-node `Iteration` segments are removed when constructing work-item paths. Missing/ambiguous names stop before Feature creation. The connector reads the parent to confirm it is an Epic, validates the payload with `validateOnly=true`, creates one Feature with a reverse hierarchy link, then reads it back to verify the type, parent, area and iteration. It does not bypass project rules or set an invented initial state. Custom required fields may block validation and will be reported.

The saved PAT is reused for creation. There is no automatic retry of a create request. If a response is lost, check the Azure DevOps backlog before retrying. Successful operations display source links and save verified records in the app.

### Automatic children

Feature titles use `Program | Service | vRelease`. The review identifier is `Service Release` (without the version prefix `v`).

- PU: optional SFV, DT and IQOQ review User Stories.
- Full Release: optional PRD, SFV, DT and IQOQ review User Stories.
- Each selected review is named `<Milestone> : Review of Deliverables (<Service> <Release>)`.
- Both types always include `<Feature title> - Time Writing` as a User Story, even if all milestones are skipped.
- That story always gets a Task named `<Month Year> | <Feature title>`, for the current calendar month in Asia/Kolkata.
- User Stories inherit the Feature's area and resolved iteration. The Time Writing Task inherits its area but uses the **project-root iteration** (`Patient Safety and Quality` for the configured project).

Every child is validated, saved, linked and read back. Multi-item creation is not atomic: Azure DevOps cannot create this entire hierarchy in one transaction. If a later child fails, known successful IDs are retained and reported. **Complete children** on the existing Feature checks direct children by type/title/parent and creates only missing selected stories and the current month Task. Duplicates or conflicting area/iteration values stop completion for review. Using it in a later month creates only that missing Task. No rollback or deletion is performed automatically.

## Web and desktop transport

The web app sends HTTPS requests directly to `dev.azure.com`; organization/network/browser restrictions can block cross-origin requests. The desktop package uses a narrow preload/IPC bridge for source reads and explicitly requested Feature creation. Neither mode sends tokens through GitHub. Requests do not follow redirects with credentials; errors are shown without logging tokens.

Saved source records use the existing app store: local browser/device storage by default, or the central SharePoint file when already connected. Azure DevOps connectivity does not by itself centralize planning data or enforce app roles.

## Mapping still to confirm with live evidence

This initial connector reads Azure Boards work items, not Azure Pipelines deployments. An Epic is not assumed to be a release. It stores work-item types and states verbatim and preserves standard Target Date, Closed Date, iteration and parent fields when supplied. It does not infer closure from Changed Date or assign missing dates.

Custom release types, milestone fields, cross-team descendants and historical state revisions require project-specific mapping. Per-release feature/bug totals and historical YoY trends are not claimed by this initial source preview. The existing manual release dashboard stays separate until that mapping is confirmed.

Live reading was confirmed by the user. No production PAT was available to the coding agent for creating a Feature. Contract tests cover area scoping, paging, batching, missing fields, refreshes, incomplete responses, parent/type verification, hierarchy/state filters, iteration resolution, PU/Release descriptions and web/desktop payload parity. A real write still requires the user's PAT in the app.

## Sharing connections and data through Git

With Git storage connected (Settings → Storage), **Settings → Views in Git → Save N connections to Git** writes the connection setup (names, view names, queries, URLs, roles — never PATs) to `azure-views.json` in the data repository. Every app that connects to the same repository takes it as its default at start: missing connections are added, unchanged ones follow Git, ones changed locally are kept; **Restore from Git** brings a connection back to Git's version. A restored connection without a PAT shows the data saved to Git (view only) until a PAT is entered.

The desktop app saves each on-prem fetch to `azure-data/<connection>.json`. The web app loads it at start; each on-prem view has **Load from Git**, and a fetch that fails or has no PAT falls back to it.

## One Time Writing connection

Only the active Time Writing (QMS-0025) connection is used. If there is more than one, Settings → Connections names the duplicates and offers **Keep "…", remove the others**; with a Git token that can save, the connection setup in Git is updated in the same step so they do not come back. Removing a connection does not revoke its PAT in Azure DevOps.

## References

- https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/wiql/query-by-wiql?view=azure-devops-rest-7.1
- https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/work-items/get-work-items-batch?view=azure-devops-rest-7.1
- https://learn.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate?view=azure-devops
