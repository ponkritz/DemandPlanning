# Settings

Route ID `admin`. This design covers the Settings host, Admin menu and separate My settings entry.

## Default design

- The Admin area has one page per shared configuration area. Home tiles and the sidebar open Admin pages, while the profile menu opens My settings.
- The ordinary fallback is Streams (`connections`) when a saved Settings destination is invalid or unavailable. The Admin tile’s landing is Overview.
- Where several sections are available, the host shows a tab strip and one active section. It omits tabs when only one section remains. Scope chips say whether settings apply to the individual, device, whole team, or Tool Owner governance.
- Opening a destination via a deep link or setting search records the section before remounting the Settings host. The last chosen page and section stay in local storage. If a saved section is no longer available, the first available section is shown.
- Ctrl+K or Command+K opens Settings search. Search checks every query word against labels, page names and keywords and ranks matches by words in the label. The search filters by allowed page; the Settings host separately filters available sections. A search hit can therefore fall back to another section if the requested one is unavailable.

## Views

| Settings key | Page | Section designs |
| --- | --- | --- |
| `home` | Overview | [Overview](settings/home.md) |
| `my` | My settings | [Your work email](settings/my-email.md), [Servers and PATs](settings/my-servers.md), [My views](settings/my-myviews.md), [My naming patterns](settings/my-patterns.md), [My page usage](settings/my-usage.md) |
| `connections` | Streams | [Stream mapping](settings/connections-mapping.md) |
| `options` | Stream options | [Epics to match Features in](settings/options-epics.md), [Bulk creation Epics](settings/options-bulk.md), [Release counts](settings/options-counts.md) |
| `epics` | Epic & Feature setup | [Setup per Epic](settings/epics-setup.md), [Value lists](settings/epics-lists.md), [User Story templates](settings/epics-templates.md) |
| `resources` | People & roles | [People](settings/resources-people.md), [Capacity roles](settings/resources-capacity-roles.md), [Role rights](settings/resources-rights.md) |
| `capacity` | Capacity & time | [Capacity and absence](settings/capacity-capacity.md), [Calculation profiles](settings/capacity-profiles.md), [Bucket rules](settings/capacity-rules.md), [Insight thresholds](settings/capacity-insights.md), [Holidays and common activities](settings/capacity-time.md), [Period control](settings/capacity-period.md), [Historical hours](settings/capacity-history.md) |
| `pack` | Reports | [Monthly pack](settings/pack-pack.md), [Table and chart defaults](settings/pack-tables.md) |
| `storage` | Data & sharing | [Git storage](settings/storage-git.md), [Load from Git](settings/storage-load.md), [Shared setup in Git](settings/storage-shared.md), [SharePoint](settings/storage-sharepoint.md), [Other views](settings/storage-views.md), [Read-only sources](settings/storage-sources.md), [Synthetic sample](settings/storage-sample.md) |
| `audit` | History | [History](settings/audit.md) |

Legacy keys are translated before rendering. `access` maps to People & roles, `masters` and `features` to Setup per Epic, `tables` to Reports, and the legacy `history` key to Historical hours. The current audit page uses the separate key `audit`.

## Behavior and storage

The registry hides Capacity & time without any of its five permissions, Reports without report or layout permissions, and audit History without `storage.shared`. Capacity & time, Reports, People & roles, and Data & sharing also apply section or connection-state checks. My settings is personal. Use the section design for the exact edit guard, target file and whether a local edit requires a subsequent shared save. Azure work-item rights, the Git token’s access, and SharePoint access still govern their respective writes.

## Implementation

- [`App.tsx`](../../src/App.tsx) wires the navigation, settings search, profile menu and route props.
- [`settingsTabs.ts`](../../src/settingsTabs.ts) registers pages, resolves legacy aliases and persists navigation choices.
- [`AdminPage.tsx`](../../src/pages/AdminPage.tsx) picks the requested route, gates/assembles sections and owns local draft actions and the audit view.
- [`SectionTabs.tsx`](../../src/components/SectionTabs.tsx) renders the active section. [`ScopeChip.tsx`](../../src/components/ScopeChip.tsx) explains who is affected.
- [`adminOverview.ts`](../../src/adminOverview.ts) owns health calculations and setting search metadata. [`SettingsSearch.tsx`](../../src/components/SettingsSearch.tsx) presents and routes results.
- [`access.ts`](../../src/access.ts) and [`useAccess.ts`](../../src/useAccess.ts) calculate and load effective local rights from the shared access file.
