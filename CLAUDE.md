# I&D Quality Demand Planning — working notes

## Keep the documents current with every change

Update the documents **in the same commit / pull request** as the code, never as a follow-up:

- `docs/REQUIREMENTS-SPECIFICATION.md`: add or change the requirement row(s) (`| ID | text | Ver. | Pri. | Trace |`). Retire a row by prefixing its text with `*(Retired — see …)*` instead of deleting it.
- `docs/TEST-PLAN.md`: a test case in §6 for each new or changed requirement (`**TC-AREA-NN Title** — Req … — L1 \`file.test.mjs\` ("test name") ; browser check …`), plus its row in the §7 coverage matrix and, when relevant, the use-case table. Test-case IDs must stay unique.
- `docs/UAT-PLAN.md`: when a case is marked **UAT**, or a UAT case is retired.
- `README.md`: the user-facing description of the feature.
- Other files in `docs/` when they describe the changed area (`azure-devops-connection.md`, `VERIFICATION-PLAN.md`).
- The Validation Package documents: `docs/SOFTWARE-COMPONENTS.md` when a source, script, test or E2E file is added, removed or repurposed (every file must be listed once, with its requirement areas); `docs/KNOWN-ISSUES.md` when a bug, open issue or limitation is opened, fixed or accepted (keep the row, add the fixing PR); `docs/DFMEA.md` and `docs/SECURITY-ASSESSMENT.md` when a function, control, import/export format or trust boundary changes (name the DF / R / SM rows in the PR); `docs/DEVELOPMENT-PROCESS.md` when the process changes.
- Requirements have three levels: a new area needs a user requirement (UR) and a system requirement (SR) whose "Refined by" names the area's prefix; detailed rows need `Ver. | Pri. | Trace` filled.
- Regenerate the traceability matrix with `pnpm trace` (`node scripts/traceability.mjs`) and commit `docs/TRACEABILITY-MATRIX.md`; `pnpm test` fails when it is stale or has a gap. Never edit the matrix by hand.
- An E2E scenario in `e2e/*.e2e.mjs` (named after its UAT test case) for user-facing scenarios; `pnpm test:e2e` needs `pnpm build:web` first and runs in CI.

The Documentation page bundles `docs/*.md` at build time (`src/docs/index.ts`), so the app shows the documents of its own build.

Check that every requirement is covered before pushing: each `| XXX-NN |` row of the requirements must appear in TEST-PLAN.md (ranges like `ATM-07…09` count); `node scripts/traceability.mjs --check` does this and more (levels, UAT days, components, cited IDs).

## Checks before every push

```
npx tsc -b
pnpm lint
pnpm test
pnpm -s build:web
pnpm test:e2e   # after build:web, when the UI changed
```

## Constraints

- PATs stay in browser / desktop local storage; never in Git, backups or SharePoint. One PAT per server.
- Writes go to dev.azure.com only; on-premises servers are read-only (web app and desktop proxy).
- The desktop updater downloads only from the fixed `desktop-latest` release and verifies SHA-256.
