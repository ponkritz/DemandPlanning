# Verification Plan

## Automated checks

- TypeScript production compilation
- Vite production bundle
- Static lint with zero errors
- Unit tests for month classification, extensions, effective baselines, variance threshold and utilization
- Adapter contract tests using synthetic fixtures

## Functional verification

| ID | Scenario | Expected result |
|---|---|---|
| V-01 | Add activity with valid dates | Activity appears with owner, QE, band and complexity |
| V-02 | Add activity after locked planning deadline | Current-month effort is Ad-hoc; future open month remains Planned |
| V-03 | Edit planned hours while planning locked | Entry is disabled unless a valid extension is active |
| V-04 | Edit past actuals after actuals lock | Entry is disabled unless an authorized extension is active |
| V-05 | Actual differs from baseline by exactly 25% | No flag |
| V-06 | Actual differs by more than 25% | Visible non-blocking flag |
| V-07 | Change baseline | New effective version is recorded; historical comparison remains reproducible |
| V-08 | Import valid and invalid rows | Valid rows stage; invalid rows show actionable errors; totals reconcile |
| V-09 | Contributor attempts admin action | Action is unavailable and rejected by the data layer |
| V-10 | Snapshot created | Frozen input, timestamp, owner and month are retained |

## Security verification

- Confirm no secret in source, packaged files or logs.
- Verify delegated permission scope and SharePoint group mapping.
- Verify server-side authorization, not UI visibility alone.
- Verify audit events cannot be edited by Contributors.
- Scan packaged executable and validate enterprise signature before distribution.

## Evidence

Store build log, checksums, screenshots, test results, migration reconciliation and UAT sign-off under the controlled project evidence location.
