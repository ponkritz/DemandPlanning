# Clinical Platform Release Reporting — Implementation Brief

## Task for Codex / Claude

Add monthly Clinical Platform release reporting to the existing application using the business rules below. Inspect the application's repository instructions, architecture, import flows, models, tests and UI before implementing. Follow its existing conventions and reuse existing functionality. Integrate the feature into the main application rather than creating a separate demo.

This document specifies behavior; it does not prescribe a framework or database. Resolve routine implementation choices using the existing app. Do not invent source data, custom Azure DevOps field reference names, approval history or undocumented business decisions. Report unresolved data issues explicitly.

## Goal and scope

For a selected month, identify:

1. Releases supported by QA/QE.
2. Releases completed according to the main Release Notes QA/QE signature rule.
3. Release names/codenames where available.
4. Traceable signature evidence behind every reported release.

Level 1 counts main release containers. Asset counts and individual asset release completeness are outside this implementation's required scope. All asset and release-level documents contribute to the main release's support activity.

Example: Cupid 26.6 is one release even when its folder contains twelve assets.

## Inputs

### Required: CP release folder export

Example filename: `CP_Release_Folder (1).csv`.

Relevant columns:

| Columns | Meaning |
| --- | --- |
| `ID` | Work item identifier; retain as text |
| `Parent` | Immediate parent work item ID |
| `Title 1` through `Title 5` | Tree export title columns |
| `Work Item Type` | Includes Release, Folder, Artifact, Document and Artifact Review |
| `Type` | Document classification, including Release Notes |
| `State` | Current state; contextual evidence, not a signature-month filter |
| `Area Path`, `Iteration Path` | Context; not release identity keys |
| `Author Approval Date` | Context only; not the reporting date |
| `ApproverNameN` | Approver identity in slot N |
| `ApproverFunctionN` | Approver role in slot N |
| `ApproverApprovalDateN` | Signature date in slot N |

The supplied export has slots 1–20. Discover numbered slots dynamically so future exports with additional slots work without code changes. Match the three fields by the same slot number.

### Optional enrichment: CP release export

Example filename: `CP_Releases.csv`.

| Column | Meaning |
| --- | --- |
| `ID` | Asset-specific CP release work item ID |
| `Release` | Structured release version |
| `PsName` | Asset/component name |
| `Content` | Release codename, when populated |
| `Title` | Additional context and potential name evidence |

This export is needed for reliable codename enrichment where the folder title omits the name. It is not required to calculate monthly support and completion.

These exports have different work item identities. Do not join their `ID` columns directly.

## Release identity and hierarchy

1. Normalize IDs and Parent values by trimming surrounding whitespace; retain them as strings.
2. Read a work item's title from its populated `Title N` column. Normally exactly one is populated. Flag multiple populated title fields rather than silently constructing a title or selecting an arbitrary conflicting value.
3. Build an index from ID to work item.
4. Follow `Parent -> ID` to associate each document with its nearest ancestor whose `Work Item Type` is `Release`.
5. Group by release container ID. Never group releases by codename alone, version alone, asset name or title alone.
6. Preserve the path of IDs and titles for evidence.

Validate duplicate IDs, missing parents, cycles and documents without a Release ancestor. Never silently drop affected rows or report an incomplete import as a verified zero. Unaffected reporting may continue if the app clearly indicates partial coverage and identifies the affected data.

Use the source collection/project context with IDs if the app supports multiple Azure DevOps/TFS environments. Treat an ID as unique only within its source environment.

## QA/QE signature extraction

For every document, inspect every discovered approver slot as a triplet:

```text
(ApproverNameN, ApproverFunctionN, ApproverApprovalDateN)
```

Use an explicit configurable role allowlist. Initial labels:

```text
QAQE for Software
Quality Engineer
QA
QE
QA/QE
QE Software
```

Compare after trimming whitespace and ignoring case. Add other spelling variants through explicit reviewed aliases. Do not use broad substring matching or silently equate Quality & Regulatory, Q&R Head, or Q&R Lead with QA/QE. In the supplied October snapshot, qualifying signatures use `QAQE for Software`.

A qualifying signature needs:

- A document work item: `Artifact` or `Document`.
- A recognized QA/QE role.
- A populated approver name.
- A valid populated signature date in the corresponding slot.
- An established release-container relationship.

Blank dates mean no recorded signature. Dated slots with missing names or roles must be reported as data issues. Do not infer a missing role from a person's name or organizational history.

Artifact Review work items are not counted again as separate signed documents. A dated QA/QE slot on a different work item type should be surfaced as an exception for investigation.

**Do not filter signatures by current document state.** A valid QA/QE signature on an `InReview` document counts even if other approvers or the author have not completed their actions. Preserve State and Author Approval Date as evidence only.

## Date handling

- The supplied CSV uses day-first dates, for example `21/10/2026 1:00:00 pm`.
- Parse the format explicitly; do not rely on locale inference.
- The reporting month is a calendar month: start inclusive, next month start exclusive.
- If the source does not specify a timezone, use the exported calendar dates without an invented conversion and state that timezone metadata was absent.
- If future inputs have timezone offsets, use the app's configured reporting timezone consistently and record it.
- Do not derive the reporting month from the version number. The interpretation of versions as year/month is unconfirmed and is unnecessary for these calculations.
- The QA/QE signature date determines activity, not Author Approval Date, Changed Date, closure date, release work item state or another role's approval date.

## Monthly metrics

### Supported releases

For month M:

```text
Supported(M) = distinct eligible ReleaseContainerIDs
               with at least one qualifying QA/QE document signature in M
```

Include signatures on documents anywhere under the release, including asset folders and main Plan/Plans, Reports, Risk, Implementation and Supporting Documents folders.

Count a release once per month regardless of its number of documents, assets, signatures or QA/QE approvers. The same release can be supported in multiple months when it has qualifying activity in those months.

### Completed releases

The business definition is a qualifying QA/QE signature on the **main release-level Release Notes**. This is a reporting convention, not an independent verification that every required document is complete.

Identify main Release Notes using all of the following:

1. The item is an Artifact or Document.
2. Its `Type`, trimmed and compared case-insensitively, is `Release Notes`.
3. It is located in the main release's `Reports` folder; accept `Report` as an explicit folder-label alias.
4. Its path matches `Release container -> Reports/Report folder -> Release Notes document`.

Do not close the main release using an asset-level Release Notes document, a review-comments child, or a name-only match. Flag alternative legacy structures, multiple main notes documents, or unmatched Release Notes locations for explicit scope mapping. Do not force them into this rule.

For month M, a main Release Notes qualifying signature in M is completion evidence. For a single snapshot without prior history, report completion according to the available signature evidence and disclose that historical uniqueness cannot be proven.

For recurring reporting, persist a completion record keyed by release identity. Once a release is completed, a later Release Notes reapproval must be identified as reapproval rather than counted as a new release completion. Keep the original evidenced completion month unless an explicit correction is made with an audit trail. Do not claim to know an earlier signature absent from the imported evidence.

If multiple QA/QE approvers or main notes documents imply different completion months and no established historical record resolves the conflict, flag the completion month as requiring review. Do not silently select the earliest or latest date as a new business rule. Support activity remains reportable from the known signatures.

### Relationship between metrics

```text
SupportedWithoutCompletionInMonth(M) = Supported(M) minus Completed(M)
```

Completed releases normally also appear in supported releases for that month because their Release Notes signature is itself support activity. Do not add supported and completed counts to produce a total. Do not label the set difference as "all open releases": a previously completed release may receive later support activity.

### Shared/global work

Maintain an explicit release-container exclusion list for shared work, with an explanation. Preserve excluded signatures and report them separately rather than deleting them.

For the supplied snapshot, container `614437`, `Clinical Platform Global`, is reported separately. Its source work item type is Release; excluding it from release totals is a stated reporting scope choice based on its shared/global purpose, not a source field proving it is not a Release. Make this setting visible and configurable. Do not auto-exclude unrelated containers merely because their titles contain a keyword.

## Release name enrichment

1. Extract the release version from the release container title using an explicit parser.
2. Prioritize a leading version after optional `Release`, such as `Release 26.2 ClinicalPlatform`. Other title patterns must be supported by explicit rules; do not mistake dependent-product versions in parentheses for the release version.
3. Match that version to the structured `Release` field in the CP release export.
4. Support an explicit configuration that treats omitted trailing segments as zero: `26.2 == 26.2.0.0` and `25.6.1 == 25.6.1.0`. Make this convention visible; it is not evidence of a calendar month. Never merge `26.2.0.1` into `26.2.0.0`.
5. Collect distinct nonblank `Content` values from all matching CP release records, trimming whitespace and comparing case-insensitively. Preserve an original source spelling for display.

| Distinct names | Result |
| --- | --- |
| One | Populate release name and record the supporting CP release IDs |
| None | Name unavailable; retain the original container title |
| Multiple | Conflicting names; retain the candidates and flag for review |

Repeated asset rows with the same codename represent one distinct name. Do not require every asset to have a corresponding CP release record for Level 1 reporting. Missing or conflicting names must not suppress monthly counts.

Do not use a codename as a unique release key: the same codename can be reused for a later release version. A name inferred from `Title` when Content is empty is a candidate for review, not an automatic confirmed match. Explicit reviewed ID-to-name mappings may resolve legacy or incomplete names; record their provenance separately from source values.

Confirmed examples from the supplied CP release export:

| Container version | CP version | Name | Display label |
| --- | --- | --- | --- |
| 26.2 | 26.2.0.0 | Setebos | Setebos 26.2 |
| 26.5 | 26.5.0.0 | Stephano | Stephano 26.5 |
| 26.6 | 26.6.0.0 | Cupid | Cupid 26.6 |

### Name detection implementation contract

Name enrichment is part of this feature, not a future task. Implement it as a separately testable function so its result cannot alter release counting.

Suggested return shape:

```json
{
  "releaseContainerId": "2494293",
  "sourceTitle": "Release 26.2 ClinicalPlatform",
  "rawVersion": "26.2",
  "normalizedVersion": "26.2.0.0",
  "name": "Setebos",
  "displayLabel": "Setebos 26.2",
  "nameStatus": "resolved_from_content",
  "nameSource": "CP_Releases.Content",
  "supportingCPReleaseIds": [],
  "candidateNames": [],
  "warnings": []
}
```

The empty arrays in this schema example are placeholders; populate them from actual matching records. Do not invent IDs. Keep full versions in labels for patch releases: `Carpo 22.8.5.4` must not become `Carpo 22.8`.

Use explicit statuses such as:

| Status | Meaning |
| --- | --- |
| `resolved_from_content` | Exactly one distinct nonblank Content name for the matched version |
| `resolved_from_override` | Explicit reviewed mapping for this source and container ID |
| `candidate_from_title` | Potential name from a title, pending review |
| `name_unavailable` | No usable name evidence |
| `conflicting_names` | More than one distinct Content name for the version |
| `version_unavailable` | Container title has no unambiguous supported version pattern |
| `enrichment_not_supplied` | CP release export was not provided and no reviewed override exists |

#### Version parser and comparison

Accept numeric versions with two to four dot-separated integer segments. Suggested leading-title pattern:

```regex
^\s*(?:Release\s+)?(?<version>\d+(?:\.\d+){1,3})(?![\d.])
```

Use the equivalent supported syntax in the app's language. An explicitly supported alternate pattern may accept a version immediately after `Clinical Platform`/`ClinicalPlatform`, such as `Helene PU Clinical Platform 25.5.2.0`. It must not perform a global first-number match on the title.

Normalize by parsing segments as integers and, when the explicit zero-padding setting is enabled, appending zeros to reach four segments. With padding disabled, different segment counts are different version keys. Preserve the original title/version strings for display and evidence.

Unparseable versions in CP release rows are enrichment exceptions. Do not fuzzy-match versions. A container with several plausible release versions needs review unless a supported positional parser unambiguously selects the release version.

#### Content consensus and missing values

Build a reusable version-to-name index once per CP release import, instead of rescanning the complete export for every release container.

For each version key, retain:

- All matching CP release work item IDs.
- Distinct name candidates and the IDs supporting each candidate.
- The number of blank Content rows.

Use trimming, case-insensitive comparison and whitespace normalization to recognize repeated spellings. Do not merge different codenames through fuzzy spelling or punctuation removal. If candidate spellings differ only by case/whitespace, preserve an actual source spelling for display.

One nonblank name plus several blanks still resolves to that name; record the blank-row coverage warning. Several different nonblank names remain a conflict even if one appears more often. Never choose a name by majority vote, latest/highest ID or asset count.

#### Reviewed overrides and title candidates

An explicit reviewed mapping keyed by source environment and ReleaseContainerID may override incomplete or conflicting automatic enrichment. Store the mapped name, optional mapped version, rationale, reviewer and decision date. Keep automatic candidates visible alongside the override so it does not erase conflicting evidence. Do not treat an override as a value from the CSV.

Titles may contain a recognizable name, such as `Release 22.8.5.4 Carpo MLD Clinical Platform`. Preserve the original title regardless of enrichment. When no Content consensus exists, only extract a title candidate using explicit patterns or a reviewed codename vocabulary. Do not assume that every remaining word after removing version numbers is a codename. Do not label a candidate as resolved until reviewed.

If the folder title explicitly suggests a different codename from Content, flag the discrepancy. Keep the original title and both pieces of evidence; do not hide the mismatch by overwriting the title.

#### Pseudocode

```text
buildNameIndex(cpReleaseRows, versionPolicy):
    index = map of versionKey -> {names, allMatchingIds, blankContentCount}
    for row in cpReleaseRows:
        key = parseStructuredVersion(row.Release, versionPolicy)
        if invalid:
            record enrichment exception for row.ID
            continue
        entry = index.getOrCreate(key)
        entry.allMatchingIds.add(row.ID)
        if Content is blank:
            entry.blankContentCount += 1
        else:
            entry.names[normalizeNameForComparison(row.Content)]
                .addOriginalSpellingAndEvidence(row.Content, row.ID)
    return index

detectName(container, indexOrMissing, overrides, versionPolicy):
    automatic = detectFromVersionAndContent(container, indexOrMissing, versionPolicy)
    if reviewed override exists for this source + container.ID:
        return reviewed override + automatic evidence and discrepancies
    if automatic has exactly one name:
        return resolved_from_content + supporting IDs + any coverage warnings
    if automatic has several names:
        return conflicting_names + all candidates and their supporting IDs
    if explicit title-pattern/vocabulary rule yields a candidate:
        return candidate_from_title + title evidence
    return explicit unavailable status with original container title
```

#### Name detection acceptance cases

| Input | Expected behavior |
| --- | --- |
| Container 26.2; matching Content rows all Setebos | Setebos 26.2, resolved from Content |
| Container 26.5; matching Content row Stephano | Stephano 26.5, resolved from Content |
| Container 26.6; eleven matching rows Cupid | Cupid 26.6, one name regardless of asset count |
| One Cupid Content value and ten blanks | Cupid, with incomplete Content coverage warning |
| Cupid and CUPID with surrounding whitespace | One distinct name; preserve a source spelling |
| Two different nonblank codenames for the same version | Conflicting names; no automatic selection |
| Missing Content, title suggests Carpo | Title candidate pending review |
| No CP export and no reviewed name mapping | Counts still work; name enrichment unavailable or title candidate only |
| Same codename at 25.9 and 26.6 | Two versions remain distinct |
| Same version in two separate folder containers | Enrich each container independently; never merge their counting keys |
| Version 26.2.0.1 | Must not retrieve the 26.2.0.0 mapping |
| Version-like text only in a dependent-product parenthesis | Do not use it as the container version |

## Data and provenance to retain

Adapt these logical entities to the app's existing data model:

### Release

- Source environment and ReleaseContainerID.
- Original title, parsed version, normalized version and version-rule configuration.
- Resolved name, name status, candidate names, supporting CP release IDs and any explicit override provenance.
- Inclusion/exclusion setting and reason.

### Signature evidence

- Source import identifier and source row/work item ID.
- ReleaseContainerID and document ID, title, Type and current State.
- Full hierarchy path of IDs and titles.
- Approver slot number, name, original role and normalized role.
- Original signature date, parsed date and reporting timezone/date interpretation.
- Author Approval Date for comparison only.
- Main-release Release Notes classification and reason.

### Completion history

- Release identity, completion month/date evidence and Release Notes document ID.
- Evidence source, first observed import and historical coverage status.
- Reapprovals and explicitly approved corrections, preserving original evidence.

Import repeated snapshots idempotently. The same source signature must not accumulate each time an export is uploaded. Preserve snapshots/provenance and changed evidence without inventing a revision identity that the CSV does not supply. Use distinct document IDs per release for document counts, and distinct release identities for release counts.

## Required report behavior

Use the application's existing report/import controls. Provide:

- A reporting-month selector.
- Supported and completed release counts, with their overlap explained.
- A release summary table.
- An evidence view or export showing the signatures supporting each result.
- Shared/global activity separately.
- Visible unresolved data-quality and name-resolution issues.

Suggested release summary columns:

| Column | Meaning |
| --- | --- |
| Month | Selected reporting month |
| ReleaseContainerID | Stable counting key within its source environment |
| Release name | Resolved codename or explicit unavailable/conflicting status |
| Version | Source/parsed version for display |
| Supported | Qualifying activity this month |
| Completed | Completion attributed to this month using the stated evidence/history rules |
| QA/QE-signed document count | Distinct qualifying documents in the month |
| Release Notes signature date | Completion evidence when applicable |
| Included in release count | Explicit scope setting |

Keep implementation details out of the main user flow unless they explain a meaningful limitation or resolve an exception. The interface must not imply that QA/QE completion verifies the full controlled-document set independently.

## Query and API integration

If the app already accepts CSV imports, support these exports through that flow. If it fetches from Azure DevOps/TFS, preserve the existing authentication and integration patterns.

The source tree query uses:

```sql
FROM WorkItemLinks
WHERE
    (
        [Source].[System.TeamProject] = @project
        AND [Source].[System.WorkItemType] = 'Release'
        AND
        (
            [Source].[System.AreaPath] UNDER 'DHP.Vault\Dev\clinical platforms'
            OR [Source].[System.AreaPath] UNDER 'DHP.Vault\Dev\ClinicalPlatform'
            OR [Source].[System.AreaPath] UNDER 'DHP.Vault\DevX\ClinicalPlatform'
            OR [Source].[System.AreaPath] UNDER 'DHP.Vault\xDev\ClinicalPlatform'
        )
    )
    AND [System.Links.LinkType] = 'System.LinkTypes.Hierarchy-Forward'
    AND [Target].[System.TeamProject] = @project
MODE (Recursive)
```

This is the query filter/tree fragment, not a complete SELECT statement. Select the input fields listed above using the source environment's real field reference names. The CSV headers identify display names only. Do not invent a `Custom.` prefix. Resolve custom field mappings through existing app configuration or the server's fields metadata. Use an API version supported by that server.

For a direct API integration, preserve returned parent/child relationships, retrieve all required field values for the returned IDs, and handle the source's limits and batching. A WIQL result alone is not a populated CSV export. Do not add approval-date or current-state filters that remove intermediate hierarchy items or signed InReview documents.

## Processing outline

```text
validate and index folder export
resolve document hierarchy and release containers
discover approver slot triplets
extract qualifying QA/QE signatures
persist/deduplicate evidence using existing app patterns
filter signature activity to selected month
group by release identity
calculate support activity
classify main Release Notes and evaluate completion evidence/history
apply explicit shared-container exclusions to release totals
enrich names from CP release export when supplied
produce summaries, evidence and exceptions
```

## Acceptance criteria

1. Twelve asset folders under Cupid still produce one supported release.
2. Multiple signatures/documents within the same release/month do not inflate its release count.
3. QA/QE signature on 21 October with author closure on 3 November belongs to October. November author closure does not create support or completion activity.
4. A signature on an ordinary document supports a release but does not complete it.
5. A signature on the main release-level Release Notes supports and completes the release according to the evidence/history rules.
6. An asset's Release Notes do not complete the main release.
7. A valid QA/QE signature on an InReview document counts; an unsigned listed approver does not.
8. A dated non-QA/QE approval does not count. Name, role and date from different slots are never mixed.
9. October boundaries are respected using explicit day-first parsing and the configured date interpretation.
10. No CP release enrichment file still permits correct support/completion counts.
11. Repeated asset rows with identical Content give one codename. Missing/conflicting names are visible and do not affect release counts.
12. Zero-padding, when enabled, equates 26.2 with 26.2.0.0 but never with 26.2.0.1.
13. Two different release container IDs are not merged merely because they have the same name or version.
14. Reimporting the same source does not duplicate evidence or totals.
15. Later reapproval of already completed Release Notes is retained as reapproval, not a second new release completion. Missing historical coverage is disclosed.
16. Invalid hierarchy or incomplete signature information is reported explicitly, with traceable affected IDs.
17. Global/shared activity is retained separately under the configured exclusion rules.

## Reference snapshot for regression verification

These are expected results only for the supplied revised export, not constants to hardcode. Check the files are the same snapshot before asserting exact totals.

- CP release folder export: 11,149 rows; 173 Release work item containers; slots 1–20.
- Reporting month: October 2026.
- Shared container 614437 excluded from main release totals.
- Five releases supported; two completed; 131 distinct qualifying signed documents.
- All qualifying October signatures use role QAQE for Software.
- Five of the 131 documents are still InReview and must remain included.

| ReleaseContainerID | Source release title | Signed documents | Completed in October |
| --- | --- | ---: | --- |
| 3306043 | Release 22.8.5.4 Carpo MLD Clinical Platform | 9 | Yes |
| 3225961 | Release 26.7 ClinicalPlatform | 25 | No |
| 3150247 | Release 26.6 ClinicalPlatform | 3 | No |
| 2818847 | Release 26.5 ClinicalPlatform | 13 | Yes |
| 2494293 | Release 26.2 ClinicalPlatform | 81 | No |

Completion evidence:

- Carpo 22.8.5.4: Release Notes ID 3306197; Anusha Guddad; QAQE for Software; 30/10/2026 6:12:24 pm.
- Release 26.5: Release Notes ID 2818862; Ashutosh Mishra; QAQE for Software; 16/10/2026 10:04:23 pm.

Separate shared activity: Clinical Platform Global, container 614437; Verification Plan document 614495; one QA/QE signature on 27 October. Including this container yields six containers with activity and 132 signed documents. It does not change the two completed releases.

## Implementation handoff

Implement the feature, run focused tests for the rules and boundary cases, and verify the app's normal build/checks. Report the changed files, how the feature is used, validation performed and any remaining data limitations. Do not claim validation against these CSV snapshots unless they are available and actually processed in the target environment.
