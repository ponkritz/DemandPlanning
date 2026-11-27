# Settings

Route ID `admin`. This design covers the Settings host, Admin menu and separate My settings entry.

## Default design

- Seven Admin pages group shared settings. Home tiles and the sidebar open Admin pages, while the profile menu opens My settings. The gear on a supported work page opens only that page’s relevant shared settings.
- The ordinary fallback is Streams (`connections`) when a saved Settings destination is invalid or unavailable. The Admin tile’s landing is Overview.
- Where several sections are available, the host shows a tab strip and one active section. It omits tabs when only one section remains. Scope chips say whether settings apply to the individual, device, whole team, or Tool Owner governance.
- Opening a destination via a deep link or setting search records the section before remounting the Settings host. The last chosen page and section stay in local storage. If a saved section is no longer available, the first available section is shown.
- Ctrl+K or Command+K opens Settings search. Search checks every query word against labels, page names and keywords and ranks matches by words in the label. The search filters by allowed page; the Settings host separately filters available sections. A search hit can therefore fall back to another section if the requested one is unavailable.

## Views

| Settings key | Page | Section designs |
| --- | --- | --- |
| `home` | Overview | [Overview](settings/home.md) |
| `my` | My settings | [Your work email](settings/my-email.md), [Servers and PATs](settings/my-servers.md), [My views](settings/my-myviews.md), [My naming patterns](settings/my-patterns.md), [My page usage](settings/my-usage.md) |
| `connections` | Streams | [Stream mapping](settings/connections-mapping.md), [Release counts](settings/options-counts.md), [Bulk creation](settings/options-bulk.md) |
| `epics` | Feature & PI setup | [Setup per Epic](settings/epics-setup.md), [Lists](settings/epics-lists.md), [User Story templates](settings/epics-templates.md), [PI Review form](pireview.md) |
| `resources` | People & access | [People and Team tree](settings/resources-people.md), [Role rights](settings/resources-rights.md) |
| `capacity` | Capacity & time | [Capacity](settings/capacity-capacity.md), [Calculation profiles](settings/capacity-profiles.md), [Hour classification](settings/capacity-rules.md), [Thresholds](settings/capacity-insights.md), [Month locks](settings/capacity-period.md) |
| `pages` | Pages & reports | Menu groups & pages, [Monthly pack](settings/pack-pack.md), [Table & chart defaults](settings/pack-tables.md) |
| `storage` | Data & history | [Git storage](settings/storage-git.md), [Load everything from Git](settings/storage-load.md), [Other views](settings/storage-views.md), [Connections in Git](settings/storage-shared.md), [Historical hours](settings/capacity-history.md), [Changes](settings/audit.md), [Demo data](settings/storage-sample.md) |

Legacy keys are translated before rendering. For example, former Stream options open the relevant section on Streams, and former PI Review Setup opens the PI Review form under Feature & PI setup. The resolver in `settingsTabs.ts` also maps saved sections and older deep links.

## Behavior and storage

The registry shows each page when the viewer can open at least one of its sections. Each section applies its own permission and connection checks. My settings is personal. Use the section design for the edit guard, target file and save behavior. Azure work-item rights, Git repository access, and SharePoint permissions govern their respective writes.

## Implementation

- [`App.tsx`](../../src/App.tsx) wires the navigation, settings search, profile menu and route props.
- [`settingsTabs.ts`](../../src/settingsTabs.ts) registers pages, resolves legacy aliases and persists navigation choices.
- [`AdminPage.tsx`](../../src/pages/AdminPage.tsx) picks the requested route, gates/assembles sections and owns local draft actions and the audit view.
- [`SectionTabs.tsx`](../../src/components/SectionTabs.tsx) renders the active section. [`ScopeChip.tsx`](../../src/components/ScopeChip.tsx) explains who is affected.
- [`adminOverview.ts`](../../src/adminOverview.ts) owns health calculations and setting search metadata. [`SettingsSearch.tsx`](../../src/components/SettingsSearch.tsx) presents and routes results.
- [`access.ts`](../../src/access.ts) and [`useAccess.ts`](../../src/useAccess.ts) calculate and load effective local rights from the shared access file.
