# Change notes

Every pull request adds **one note here** instead of editing the version in `package.json` or the top of
`docs/RELEASE-NOTES.md` (CI-09). Name it after the change, with lower-case letters, digits and hyphens, for example
`docs/changes/story-templates.md`:

```markdown
---
bump: minor
---
**Added**
- **Story templates** — save a User Story's title and description as a template … (STT-01).

DF-123, SM-80; TC-STT-01.
```

- **bump:** `major` for a change that breaks existing data, the shared setup files or the way users work; `minor` for a
  new or changed feature; `patch` for a fix, a dependency update or documentation only.
- **Text:** the release-notes text of the change, with its requirement IDs; at least one `- ` line; `**bold**` labels,
  no `#` headings. The pull request number is added by CI.

After the merge, the job *Write release commit* (CI-11) takes the highest bump of the notes waiting, sets the new
version in `package.json`, writes their texts (each with "PR #N.") as that version's entry at the top of
`docs/RELEASE-NOTES.md`, removes the notes, regenerates `docs/SWBOM.md`, `docs/swbom.cdx.json` and
`docs/TRACEABILITY-MATRIX.md`, and pushes one release commit to `main`; the rest of the run builds, tags and publishes
that commit (CI-10). `pnpm test` checks the notes; CI fails a pull request without a note, or one that changes the
version itself.
