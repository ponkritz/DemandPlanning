# Documentation

**Route:** `docs`, under Data & governance. [App.tsx](../../src/App.tsx) lazy-loads this route and passes the Git storage context and the Connection settings action.

## Default design

**Project documentation** opens first. Tabs select a bundled Markdown document. The first-time document is the Validation package. A page with more than one second-level heading shows an On this page list. **Download .md** gives the exact bundled source. The last valid document selection is remembered in the browser. **Tool Validation Package** starts with a connection and load action, then shows a searchable table of file name, category, format and size with a per-file download button.

## Logic and implementation

- [DocsPage.tsx](../../src/pages/DocsPage.tsx) manages area and document selection. [docs/index.ts](../../src/docs/index.ts) provides the explicit build-time document list. [markdown.ts](../../src/markdown.ts) parses blocks. [Markdown.tsx](../../src/components/Markdown.tsx) renders the blocks and handles document/heading navigation through the page.
- [ToolValidationPackage.tsx](../../src/components/ToolValidationPackage.tsx) loads the private package on demand via [useGitStorage.ts](../../src/useGitStorage.ts). It prevents concurrent load/download and shows API failures in the panel. The list is held in UI state. Changing the storage scope remounts the panel.
- [toolValidation.ts](../../src/toolValidation.ts) uses authenticated GitHub Contents reads under the configured repository and branch, restricted to `tool-validation/demandplanning` and its supported folders and formats. It validates returned file entries, sorts by category and name, fetches original bytes and selects a MIME type for download. The GitHub PAT needs Contents read access. The draft status remains visible in the panel.

## Design documents

**Design documents** opens the design index on first use. The selector lists all bundled design files under Application and views or Settings, and the Design index button returns to the overview. The last design selection is remembered independently of the project-document tab.

[docs/index.ts](../../src/docs/index.ts) loads the nested design files when the Documentation page loads. [markdown.ts](../../src/markdown.ts) resolves relative links using the selected document’s full path. Bundled pages open inside Documentation. Source and test links open in the DemandPlanning GitHub repository. Each document can be downloaded as its original Markdown.

See [document browser tests](../../e2e/documents-and-data.e2e.mjs) and [package API tests](../../tests/tool-validation.test.mjs).
