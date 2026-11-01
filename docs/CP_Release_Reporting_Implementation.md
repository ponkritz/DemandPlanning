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

### Canonical query names

| Query | Export filename | Meaning and responsibility |
| --- | --- | --- |
| `CP_Docs` | `CP_Docs.csv` | Recursive release folder/document hierarchy, QA/QE signatures, monthly counts and folder-derived name evidence |
| `CP_Releases` | `CP_Releases.csv` | Asset-specific release metadata, version-to-codename fallback and name cross-checks |

Use these exact query names in application configuration, source selectors, documentation and evidence provenance. `CP_Docs` is the folder export, not a flat list of asset release metadata. `CP_Releases` is the release metadata export, not the document hierarchy. Keep their import roles distinct and validate their expected columns; filenames alone do not establish schema validity.

Earlier supplied files named `CP_Release_Folder.csv` and `CP_Release_Folder (1).csv` are legacy filenames for the `CP_Docs` source. Accept them through the same schema mapping where needed; do not require the user to rename an existing file or create a third logical source.

### Required: `CP_Docs` — folder/document export

Canonical export filename: `CP_Docs.csv`. The revised reference snapshot was supplied as `CP_Release_Folder (1).csv`.

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

### Optional enrichment: `CP_Releases` — release metadata export

Example filename: `CP_Releases.csv`.

| Column | Meaning |
| --- | --- |
| `ID` | Asset-specific CP release work item ID |
| `Release` | Structured release version |
| `PsName` | Asset/component name |
| `Content` | Release codename, when populated |
| `Title` | Additional context and potential name evidence |

Use this export as fallback name enrichment when the folder CSV does not provide an unambiguous codename in the release title or Area Path. Folder-only reporting must work without this export. It is not required to calculate monthly support and completion.

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

## Release name enrichment — folder CSV first

Implement name detection as part of this feature, independently of release counting. Use this order for automatic evidence:

1. Release container title from the folder CSV.
2. That release container's Area Path from the folder CSV.
3. Matching `CP_Releases` export `Content`, as fallback when folder evidence is missing.
4. Name unavailable when none supplies an unambiguous name.

An explicit reviewed mapping for the source environment and ReleaseContainerID can resolve missing/conflicting names. Record it as an override, preserving the automatic evidence. Never infer an absent codename from the version number alone.

### Folder CSV name detection

Read the release container's own populated Title field and Area Path. Do not scan arbitrary descendant document titles or other release containers to choose the release name.

Use explicit title patterns or a reviewed codename vocabulary. For example, `Release 22.8.5.4 Carpo MLD Clinical Platform` explicitly identifies Carpo. Remove only structural tokens defined by the matching pattern, such as Release, version, MLD/PU and Clinical Platform. Do not turn all leftover free text into a confirmed name; unsupported patterns produce a candidate requiring review.

Inspect Area Path by path segment. Normalize path separators for parsing while preserving the raw value. For example, `DHP.Vault\xDev\ClinicalPlatform\Carpo` identifies a codename in the known ClinicalPlatform/codename position. A segment such as `Release 26.2` supplies a version, not a codename. Project names, Dev/xDev/DevX, ClinicalPlatform, asset names, generic folder names and document names are not release codenames. Use explicit path rules or a reviewed vocabulary; do not assume every terminal segment is a codename.

Folder-source decision rules:

| Title evidence | Area Path evidence | Result |
| --- | --- | --- |
| One unambiguous name | Same name or no name | Resolve from folder title; retain path corroboration if present |
| No name | One unambiguous name | Resolve from folder Area Path |
| Different explicit names | Different explicit names | Conflicting folder evidence; no silent winner |
| Ambiguous title candidate | Explicit path evidence that corroborates it | Resolve if the supported extraction rules establish one name |
| Ambiguous or unsupported text | No corroborating explicit name | Candidate only; do not confirm automatically |
| No name | No name | Try Release Data fallback if supplied |

If an optional future release-name field is added to the folder export, support it through an explicit field mapping and documented precedence. Such a field does not exist in the supplied snapshot; do not pretend it is already available.

### Verified availability in the supplied folder CSV

The complete revised folder CSV was searched, including titles and paths:

| Release | Folder CSV evidence | Folder-only result |
| --- | --- | --- |
| Carpo 22.8.5.4 | Carpo appears in the release title and Area Path | Carpo 22.8.5.4 |
| 26.2 | Setebos does not occur anywhere in the file | Name unavailable without fallback or reviewed mapping |
| 26.5 | Stephano does not occur anywhere in the file | Name unavailable without fallback or reviewed mapping |
| 26.6 | Cupid does not occur anywhere in the file | Name unavailable without fallback or reviewed mapping |

These are observations about this snapshot, not values to hardcode into automatic detection. The app must not claim it fetched Setebos, Stephano or Cupid from the folder CSV.

### Release Data fallback

When folder evidence has no confirmed name, extract the container's release version using an explicit positional parser, then match the structured `Release` field in `CP_Releases.csv`.

Accept numeric versions with two to four dot-separated integer segments. A leading version after optional `Release` is supported, for example `Release 26.2 ClinicalPlatform`. A version immediately following Clinical Platform may be supported by a separate explicit pattern. Do not use a global first-number search: dependent-product versions in parentheses must not become the release version.

Support an explicit configuration for omitted trailing zeros: `26.2 == 26.2.0.0`, `25.6.1 == 25.6.1.0`. When disabled, differing segment counts remain different version keys. Preserve the original version strings for display. Never merge `26.2.0.1` with `26.2.0.0`, and never interpret normalization as a reporting date.

Build a version-to-name index once per CP release import. For each version retain all matching CP release IDs, distinct nonblank Content names and their supporting IDs, and the count of blank Content rows.

Normalize names for comparison by trimming, collapsing repeated whitespace and ignoring case. Preserve an actual source spelling. Do not fuzzy-match or remove punctuation to merge different names.

| Distinct nonblank Content names | Fallback result |
| --- | --- |
| One | Resolve from Content; retain supporting CP release IDs |
| None | Name unavailable, or retain an explicit title/path candidate for review |
| Multiple | Conflicting names; retain all candidates and supporting IDs |

Repeated asset rows with the same name represent one distinct codename. One nonblank value plus blanks still resolves to that name, with an incomplete-coverage warning. Do not select a name by majority vote, highest/latest ID or asset count.

If folder sources conflict, fallback data may be shown as additional evidence but must not silently resolve the conflict. If a weak folder candidate is corroborated by exactly one Content name, resolve from Content and retain the candidate as corroboration. If they disagree, show the discrepancy and require review.

If a confirmed folder name already exists and Release Data is supplied, use Content as a cross-check. Matching Content corroborates the folder result. A different explicit Content name creates a visible conflict; do not overwrite either source. Missing Content is only a missing cross-check and does not invalidate a confirmed folder name.

Confirmed fallback examples from the supplied `CP_Releases` export:

| Container version | Matching CP version | Content | Display label |
| --- | --- | --- | --- |
| 26.2 | 26.2.0.0 | Setebos | Setebos 26.2 |
| 26.5 | 26.5.0.0 | Stephano | Stephano 26.5 |
| 26.6 | 26.6.0.0 | Cupid | Cupid 26.6 |

### Name result and provenance

Suggested return shape for a folder-resolved example:

```json
{
  "releaseContainerId": "3306043",
  "sourceTitle": "Release 22.8.5.4 Carpo MLD Clinical Platform",
  "rawVersion": "22.8.5.4",
  "normalizedVersion": "22.8.5.4",
  "name": "Carpo",
  "displayLabel": "Carpo 22.8.5.4",
  "nameStatus": "resolved_from_folder_title",
  "nameSource": "CP_Docs.Title 1",
  "folderEvidence": [
    {"field": "Title 1", "value": "Release 22.8.5.4 Carpo MLD Clinical Platform"}
  ],
  "supportingCPReleaseIds": [],
  "candidateNames": [],
  "warnings": []
}
```

Populate evidence from actual records. Do not invent supporting IDs. Preserve full versions for patch releases: Carpo 22.8.5.4 must not become Carpo 22.8. If version extraction fails but folder evidence identifies a name, the name can still resolve; track the unavailable version separately and do not invent it for the display label.

| Name status | Meaning |
| --- | --- |
| `resolved_from_folder_title` | Unambiguous supported title extraction, no unresolved contradictory evidence |
| `resolved_from_folder_area_path` | Unambiguous supported Area Path extraction, no unresolved contradictory evidence |
| `resolved_from_content` | Folder name absent/uncertain; matched Content provides one nonconflicting name |
| `resolved_from_override` | Explicit reviewed mapping for this source and release container |
| `candidate_from_folder` | Unsupported or ambiguous folder text pending review |
| `name_unavailable` | No usable name evidence |
| `conflicting_names` | Contradictory explicit names within or across the sources |

Also retain fallback availability and version status separately. A missing enrichment file or unparseable version must not suppress a name explicitly available in the folder CSV.

Store each automatic candidate's source file/import, row/container ID, field, original value, extraction rule and supporting IDs. For reviewed overrides store rationale, reviewer and decision date. Keep automatic evidence alongside an override instead of replacing the original source values.

Missing/conflicting names must not alter support/completion counts. Never group releases by name: the same codename can recur across versions, and multiple containers can have the same name/version while remaining separate counting identities.

### Pseudocode

```text
buildNameIndex(cpReleaseRows, versionPolicy):
    for each CP release row:
        key = parseStructuredVersion(row.Release, versionPolicy)
        if invalid:
            record enrichment exception
            continue
        retain row.ID under key
        retain distinct normalized nonblank Content names and evidence under key
        record blank Content coverage
    return index

detectName(container, optionalNameIndex, reviewedOverrides, rules):
    folder = detectTitleAndAreaPathEvidence(container, rules)
    version = parseContainerVersion(container.title, rules.versionPolicy)
    fallback = lookupContentEvidence(optionalNameIndex, version)

    automatic = reconcileEvidence(
        folderFirst = folder,
        contentFallbackOrCrossCheck = fallback
    )
    # Conflicting explicit evidence remains unresolved.
    # Ambiguous folder text alone remains a candidate.

    if reviewed override exists for source environment + container.ID:
        return override + automatic evidence and discrepancies
    if automatic has a confirmed folder name:
        return folder-derived name with title/path provenance
    if automatic has no unresolved conflict and one usable Content fallback:
        return Content-derived name with matching CP release IDs
    if automatic has contradictory explicit names:
        return conflicting_names with all evidence
    if automatic has a folder candidate:
        return candidate_from_folder with evidence
    return name_unavailable with original container title
```

### Name detection acceptance cases

| Input | Expected behavior |
| --- | --- |
| Folder title explicitly says Carpo; no CP export | Resolve Carpo from the folder title |
| Folder title omits name; supported Area Path explicitly says Carpo | Resolve Carpo from Area Path |
| Folder title and Area Path both say Carpo | One name with both pieces of evidence |
| Title says Carpo but Area Path explicitly says another name | Conflict; no silent choice |
| Supplied 26.2 folder; no CP export | Name unavailable; support/completion counts still work |
| Supplied 26.5 folder; no CP export | Name unavailable; do not invent Stephano |
| Supplied 26.6 folder; no CP export | Name unavailable; do not invent Cupid |
| Supplied 26.2 folder plus matching Content Setebos | Resolve Setebos from Release Data fallback |
| Supplied 26.5 folder plus matching Content Stephano | Resolve Stephano from Release Data fallback |
| Supplied 26.6 folder plus repeated matching Content Cupid | Resolve Cupid once, independent of asset count |
| One Cupid Content value and ten blanks | Cupid, with incomplete Content coverage warning |
| Cupid and CUPID with surrounding whitespace | One distinct name; preserve a source spelling |
| Several distinct Content names and no folder name | Conflict; no majority vote |
| Confirmed folder name differs from matched Content | Cross-source conflict; retain both |
| Area Path ends in Release 26.2 | Version evidence only, not a codename |
| Folder name is explicit but version is unavailable | Resolve name; flag version separately |
| Same codename across different versions | Keep release identities distinct |
| Same version in separate containers | Never merge counting keys |
| Version 26.2.0.1 | Do not retrieve 26.2.0.0 fallback |
| Version-like text only in dependent-product parentheses | Do not use it as the container version |

## Data and provenance to retain

Adapt these logical entities to the app's existing data model:

### Release

- Source environment and ReleaseContainerID.
- Original title, parsed version, normalized version and version-rule configuration.
- Resolved name, name status, folder title/Area Path evidence, candidate names, supporting CP release IDs, version/fallback availability and any explicit override provenance.
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

The `CP_Docs` query is the recursive folder/document query. Its filter/tree fragment is:

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
validate and index CP_Docs folder/document export
resolve document hierarchy and release containers
discover approver slot triplets
extract qualifying QA/QE signatures
persist/deduplicate evidence using existing app patterns
filter signature activity to selected month
group by release identity
calculate support activity
classify main Release Notes and evaluate completion evidence/history
apply explicit shared-container exclusions to release totals
detect names from folder title and Area Path first
use CP_Releases Content as fallback or cross-check when supplied
retain name provenance, conflicts and unavailable statuses
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
11. Name detection uses folder title/Area Path first, with Release Data Content fallback. Repeated asset rows with identical Content give one codename. Missing/conflicting names are visible and do not affect release counts.
12. Zero-padding, when enabled, equates 26.2 with 26.2.0.0 but never with 26.2.0.1.
13. Two different release container IDs are not merged merely because they have the same name or version.
14. Reimporting the same source does not duplicate evidence or totals.
15. Later reapproval of already completed Release Notes is retained as reapproval, not a second new release completion. Missing historical coverage is disclosed.
16. Invalid hierarchy or incomplete signature information is reported explicitly, with traceable affected IDs.
17. Global/shared activity is retained separately under the configured exclusion rules.

## Reference snapshot for regression verification

These are expected results only for the supplied revised export, not constants to hardcode. Check the files are the same snapshot before asserting exact totals.

- `CP_Docs` reference export: 11,149 rows; 173 Release work item containers; slots 1–20.
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
