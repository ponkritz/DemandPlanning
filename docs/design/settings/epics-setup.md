# Setup per Epic

[Back to Settings](../admin.md)

## Default design

Starts at All Epics. A searchable Epic list sits beside a creation preview. The editor organizes Fields & title, Definition of Done, User Stories and Month Task. Per-Epic switches choose customized values or inherited defaults. Complete children starts enabled for each Epic; personal Feature setup can be selected for an individual Epic.

## Behavior and storage

Defaults and Feature sections resolve through personal Epic setup, shared Epic values and All Epics settings; extra fields use the separate Epic setup file. Field type can be text/list/number/date, destination can be title/description/both and an empty field can be optional, warn or block. A text field can draw from on-prem data. Applicable DP/IOCC targets support DoD and story overrides by configured Release Classification. The shared files are `feature-setup.json` and `epic-setup.json`; personal Feature setup uses an email-addressed file under `feature-setup/`. Each layer uses its own permission and versioned write. Saving changes across multiple files uses separate writes, so an earlier file may save before a later one fails.

## Implementation

- [`components/EpicFeatureEditor.tsx`](../../../src/components/EpicFeatureEditor.tsx)
- [`featureSetup.ts`](../../../src/featureSetup.ts)
- [`epicSetup.ts`](../../../src/epicSetup.ts)
- [`useFeatureSetup.ts`](../../../src/useFeatureSetup.ts)
- [`useEpicSetup.ts`](../../../src/useEpicSetup.ts)
- [`onPremValues.ts`](../../../src/onPremValues.ts)
