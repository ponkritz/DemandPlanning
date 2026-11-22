# Insight thresholds

[Back to Settings](../admin.md)

## Default design

Grouped numeric controls for forecast, plan accuracy, stream momentum, resilience, unusual months, plan health, persistent overload and concentration, with a reset to defaults.

## Behavior and storage

Requires `capacity.rules`. Defaults include forecast ±10%, reliable error ≤15% and bias ±20%; momentum 3 months per window with 20% and 8 h thresholds; resilience 80%/90%; unusual 50%, 8 h and at least 3 elapsed months; plan health 75/50 points; persistent overload 3 months and top 20% concentration. The input model validates each range including whole months and amber below green. Edits are audited and take effect in Team overview; Save to Git shares them.

## Implementation

- [`components/InsightThresholdsPanel.tsx`](../../../src/components/InsightThresholdsPanel.tsx)
- [`insightThresholds.ts`](../../../src/insightThresholds.ts)
- [`pages/AdminPage.tsx`](../../../src/pages/AdminPage.tsx)
- [`pages/DashboardPage.tsx`](../../../src/pages/DashboardPage.tsx)
