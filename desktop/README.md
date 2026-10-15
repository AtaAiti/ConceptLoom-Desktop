# ConceptLoom Desktop

A Windows desktop implementation of ConceptLoom's connection-first
learning workflow. Free, MIT licensed, local-first, powered by Ollama. No account,
subscription, paid API, telemetry or cloud backend.

## New in 0.2.0

- Independent workspaces with switcher, global Home, pinning, recent order, descriptions, goals, archive/restore and typed-name deletion.
- Safe v1 migration into My Learning; existing IDs, cards, review scheduling and evidence are preserved.
- Subject-independent study paths: general, language, programming, STEM, humanities, exam, professional and custom.
- Workspace libraries with PDF pages, source metadata, tags, text previews and study-path attachments.
- Native SQLite FTS5/BM25 search, page-bounded chunks and explicit source selection. Browser preview uses simpler lexical scoring.
- Source-grounded routes, lessons, generated cards and tutor answers; validated citation IDs open saved excerpts. Sources-only and mixed modes are explicit.
- Dedicated Roadmap, Today plan, Study Hub, saved graph positions, minimap and Ctrl+K local search.
- Reduced motion preference plus operating-system reduced-motion support.

See [iteration scope, architecture and remaining work](../docs/workspaces-sources-status.md). This release implements the workspace/source foundation and the first vertical slice; it does not claim all later phases of the product roadmap.

## Features preserved

- Five-step first-run onboarding and original dark dashboard; optional light theme.
- English/Korean starter dependency routes and arbitrary custom courses.
- Course creation, editing, goals, prior knowledge, explanation language and deletion.
- Interactive React Flow map, manual concept/dependency editing, validated DAGs,
  learner acceptance of AI-proposed routes, evidence-gated prerequisites.
- Local structured lessons: concept, explanation, connections, examples, practice,
  mini quiz, mistakes, summary, generated cards and next concept.
- Diagnose prior knowledge before showing lesson explanations. Recognition,
  recall, application and transfer evidence determine mastery; reading earns none.
- Deterministic answer checks where possible, local rubric grading for open
  responses, explicit “I don't know yet” and confidence calibration.
- Manual/automatic flashcards and real `ts-fsrs` scheduling with Again/Hard/Good/Easy.
- Course-aware tutor with mistakes, evidence, resume points and due reviews. Source context is explicitly selected; notes are no longer automatically concatenated into prompts.
- Actual activity, streaks, practice time, accuracy, weak areas and calendar.
- Local PDF/TXT/Markdown library, pasted text without a required title, and model discovery/selection in Settings.
- Native SQLite migrations and transactional save-before-continue persistence.

This is an initial implementation, not an audited stable release. AI-generated
subject matter still needs human judgment. Responses are schema-validated; this
does not establish factual correctness. No PDF OCR, voice exercises, LM Studio
adapter, export/import of legacy MCP notebooks, or automatic model downloads in
the app yet. Build downloads require internet; installed runtime needs only the
already downloaded Ollama model. Browser preview uses separate browser storage.

## Screenshot

Screenshot placeholder: capture the dashboard at 1366×768 after creating your own
course. Automated UI checks write `test-results/dashboard.png` (not tracked).

## Windows requirements

For use: Windows 11 with WebView2, Ollama, and a downloaded model. Recommended
starting point: 16 GB RAM and `qwen3:4b`. Actual speed depends on Ollama's hardware
support; AMD graphics acceleration is not assumed.

For building: Node.js 22.13+ (Node 22 recommended), Rust stable MSVC toolchain,
Visual Studio C++ Build Tools, Windows SDK, WebView2. See the official
[Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/#windows).

This checkout also provides `scripts/start-desktop.ps1`, which locates the usual
per-user Cargo installation when it has not yet been added to the current PATH.

## Setup and run

```powershell
# Install Ollama separately if needed, then download the model once:
ollama pull qwen3:4b
ollama list

# From the repository root:
cd desktop
npm ci
npm run desktop
```

The Ollama desktop app normally serves the API at `http://localhost:11434`.
If it is stopped, start Ollama; for command-line serving use `ollama serve`.
Settings → Test AI connection detects installed models. The default model and
local port can be changed. Only HTTP loopback addresses are allowed, and native
requests disable proxies and redirects. Structured calls use Ollama's
[local chat API](https://docs.ollama.com/api/chat).

```powershell
npm run dev      # browser development preview, http://127.0.0.1:1420
npm run build    # strict TypeScript + production frontend
npm run package  # native Windows NSIS installer
```

For an initial debug installer use `npx tauri build --debug`. It is written to
`src-tauri/target/debug/bundle/nsis/ConceptLoom_0.2.0_x64-setup.exe`.
The default release package is written under `src-tauri/target/release/bundle/nsis`.
Installers are unsigned local development builds.

Browser preview proxies Ollama at its default local port. Another port requires
the native app. Browser data is separate from native SQLite; closing the browser
does not migrate data into the desktop app. There is no hosted web backend.

## Data and privacy

Tauri uses its resolved OS application data directory for
`org.conceptloom.desktop/conceptloom.sqlite3`. Settings displays the actual path.
SQLite uses foreign keys, WAL mode and one transaction per workspace update,
so attempts, mistakes and resume points are committed together. Records have
normalized identifiers/relationships and validated JSON payloads. Version 2 sends entity deltas and upserts only changed rows; changing one card does
not rewrite courses, lessons or source indexes. The compatibility React layer still
loads an application snapshot; lazy workspace reads remain planned.

Do not move or edit a live database. Back up the database directory after closing
the app, including WAL/SHM files if present. Storage is private by locality, not
encrypted at rest. Native diagnostics go to stderr during development and never
send data anywhere. Imported notes and AI conversations remain local.

Library → Import PDF / TXT / Markdown reads PDF text locally using a bundled
PDF.js worker, fonts and CMaps. No document is uploaded and no CDN is contacted.
PDF limits: 25 MB and 300 pages. Scanned PDFs without selectable text need OCR
before importing; password-protected PDFs need an unlocked copy. The extracted
text is saved in SQLite; the original PDF binary is not copied into the library.
TXT/Markdown files can be up to 2 MB. Each saved text can contain up to 1,000,000
characters. Paste copied text into “Copied text / notes” and click “Add text to
library”; an empty title uses the first line automatically.

## Architecture

- `src/components`, `src/features`: UI and feature workflows.
- `src/learning/conceptloom`: adaptation of upstream checkpoint/frontier rules.
- `src/learning/mastery`, `planner`, `reviews`: evidence, real statistics, FSRS.
- `src/ai/providers`, `prompts`, `schemas`: replaceable provider boundary,
  dedicated task prompts and structured validation.
- `src/db`, `src/hooks`: validated serialized repository writes.
- `src-tauri/src`: local HTTP boundary and SQLite transactions.
- `src-tauri/migrations`: versioned schema.

Methodology provenance: `../shared/coaching-reference.md`, `../src/checkpoints.mjs`
and `../src/progress.mjs`. The original MCP system is preserved and independent.
See [architecture and phased plan](../docs/desktop-plan.md).

## Verification

```powershell
npm run check
npm test
npx playwright install chromium
npx playwright test
cargo test --manifest-path src-tauri/Cargo.toml

# Optional real local-model test; requires qwen3:4b and running Ollama:
$env:OLLAMA_INTEGRATION = '1'
npm test -- test/ollama.integration.test.ts
```

The normal suite mocks AI transport and never requires an internet connection or
model. The integration test uses only localhost. Run original MCP tests from the
repository root with `npm run verify`.
