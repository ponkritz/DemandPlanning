# Azure DevOps work-item trial

Open **Azure DevOps** in the app. The supplied organization/project/team are prefilled from the backlog URL. Source access is read-only; saving a preview only updates Demand Planning data.

## Connect

1. In Azure DevOps User settings → Personal access tokens, create a token for the required organization. Select custom scopes → **Work Items → Read** and a short expiry (seven days for the trial), subject to organization policy.
2. Paste the token into the app's password field. Never paste it in chat, a repository, a URL, or a GitHub Actions variable.
3. Select **Fetch preview**. The app reads the team's configured area paths, queries all work-item types in that scope, and reads their details in batches of at most 200. It preserves parent IDs for later hierarchy mapping.
4. Review the titles, types, states, assignees and available dates. Select **Save work items** to retain the source records. Re-fetching upserts by organization/project/ID without creating duplicate source records. Previously saved items missing from a later fetch are retained for review.

The PAT is cleared from the form when a fetch starts, retained only in request memory during the operation, and never saved to localStorage, JSON backups or audit records. Re-enter it to refresh. GitHub Secrets are not needed. Browser password managers are outside the app's storage controls.

## Web and desktop

The web app sends HTTPS requests directly to `dev.azure.com`; organization/network/browser restrictions can block cross-origin requests. The desktop package uses a narrow preload/IPC bridge to make the same read requests from its main process. Neither mode sends tokens through GitHub. Requests do not follow redirects with credentials; errors are shown without logging tokens.

Saved source records use the existing app store: local browser/device storage by default, or the central SharePoint file when already connected. Azure DevOps connectivity does not by itself centralize planning data or enforce app roles.

## Mapping still to confirm with live evidence

This initial connector reads Azure Boards work items, not Azure Pipelines deployments. An Epic is not assumed to be a release. It stores work-item types and states verbatim and preserves standard Target Date, Closed Date, iteration and parent fields when supplied. It does not infer closure from Changed Date or assign missing dates.

Custom release types, milestone fields, cross-team descendants and historical state revisions require project-specific mapping. Per-release feature/bug totals and historical YoY trends are not claimed by this initial source preview. The existing manual release dashboard stays separate until that mapping is confirmed.

No production PAT was available during implementation. Contract tests cover area scoping, paging, batching, missing fields, repeat refreshes, incomplete responses and request restrictions; a real PAT fetch is still required for tenant validation.

## References

- https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/wiql/query-by-wiql?view=azure-devops-rest-7.1
- https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/work-items/get-work-items-batch?view=azure-devops-rest-7.1
- https://learn.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate?view=azure-devops
