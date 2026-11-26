# DemandPlanning as-built design

Baseline: DemandPlanning v3.20.1, commit `86f07bc`. These documents describe the application defaults, the behavior implemented in that revision, and how to locate the implementation. Configured deployments can differ because of permissions, saved preferences, connection mappings, and available data.

## Shared design

- [Application architecture](architecture.md) — runtime, routing, data paths, and release pipeline.
- [Default UI and table design](ui-defaults.md) — layout, interaction, persistence, density, columns, exports, and responsive behavior.
- [Module catalog](module-catalog.md) — file-level source and implementation map. The [software component inventory](../SOFTWARE-COMPONENTS.md) also covers tests and requirement areas.

## Views

| Area | Design documents |
|---|---|
| Navigation | [Home](home.md) |
| Insights | [My dashboard](mydash.md), [Team overview](overview.md), [Pulse Check](pulse.md), [PI Review](pireview.md), [KPI tracker](kpitracker.md) |
| Work | [Time Writing](activities.md), [My Tasks](mywork.md), [Sprint check](bulk.md) |
| Planning | [Planning Overview](planover.md), [Capacity vs Actual](capactual.md), [Baselines](baselines.md) |
| Backlogs and releases | [Backlogs and Azure query views](board.md), [Release view variants](release-views.md), [Backlog Health](health.md), [Windchill](windchill.md), [BRITE](brite.md) |
| Governance | [Resource Mapping](qemapping.md), [Snapshots](snapshots.md), [Documentation](docs.md) |
| Configuration | [Admin and My settings](admin.md) |

The [route registry](../../src/pages/registry.ts) defines the fixed route IDs. Azure queries and Windchill exports can add named entries at runtime. Those entries have shared renderer designs and use configuration for data and labels. The [requirements](../REQUIREMENTS-SPECIFICATION.md), [test plan](../TEST-PLAN.md), and [traceability matrix](../TRACEABILITY-MATRIX.md) record formal coverage separately.
