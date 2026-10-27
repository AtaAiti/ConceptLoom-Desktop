# ConceptLoom Desktop

**Desktop 0.3.7 · Windows · MIT · local-first**

An independent desktop app based on [Zproger/ConceptLoom](https://github.com/Zproger/ConceptLoom).
The original MIT attribution is retained in [LICENSE](../LICENSE).

Learn from your own materials: organise workspaces and libraries, build a concept
map, study one connection, check understanding and review flashcards with FSRS.
The CAPYBARA interface includes Home, Today, Sources, Roadmap, Study Hub, local
search, light/dark themes and focused card review.

Use Ollama locally with an already downloaded model, or connect ChatGPT, Claude
or Gemini through the app's official-client account integrations. Account access,
models and usage limits depend on the selected service and require internet and
explicit consent. See [account setup and privacy](../docs/account-providers.md).

[Repository overview](../README.md) · [Русское руководство](../docs/ru/README.md)

## Version

This guide covers **Desktop 0.3.7 on `main`**, including all six P1–P6 MVP slices.
The version agrees with `package.json` and the Tauri/Cargo manifests. Historical
implementation notes document each milestone's scope and verification.

The original MCP package has its own **1.1.0** version and Node.js 20+ workflow.
Its adapters and Markdown notebooks are independent of the desktop SQLite data.
They are not prerequisites for running this app.

## Current capabilities

- Independent workspaces and libraries, archive/restore and local Ctrl+K search.
- PDF/TXT/Markdown import, pasted text with an optional title, page previews,
  metadata, tags and source selection for a study direction.
- Native SQLite FTS5/BM25 source search; simpler lexical search in browser preview.
- Editable dependency maps, validated prerequisites and learner approval of AI routes.
- Structured lessons, initial diagnosis, practice and checks for recognition,
  recall, application and transfer. Reading alone does not increase mastery.
- Course-aware tutoring, manual/generated flashcards, `ts-fsrs` reviews, real
  activity statistics, weak areas and saved resume points.
- Ollama model discovery and remembered model selection per AI provider.

All six source-learning MVP slices are implemented:

1. **P1 — tutor a passage:** Sources or a citation → “Разобрать с репетитором”.
   Long pages require a fragment choice; sending the editable question is explicit.
   Retry preserves contextual questions and blocks stale/deleted fragments.
   [Scope and verification](../docs/p1-source-tutor.md).
2. **P2 — save explanations:** bookmark an assistant reply and reopen it in Study
   Hub with its original citations. No new AI request is needed.
   [Scope and verification](../docs/p2-saved-explanations.md).
3. **P3 — tutor a map concept:** start from a selected node with its prerequisite
   context, then return to the map. [Scope and verification](../docs/p3-map-tutor.md).
4. **P4 — practise a passage:** “Закрепить · 2 карточки” generates two drafts.
   Edit/select them before adding new cards to FSRS; existing schedules are preserved.
   [Scope and verification](../docs/p4-source-flashcards.md).
5. **P5 — guide a section:** “Обзор раздела” creates three points, three terms and
   three tutor questions for a selected range. Coverage is explicit; the last guide
   is cached and marked stale when the document text changes.
   [Scope and verification](../docs/p5-source-guide.md).
6. **P6 — compare concepts:** Tutor → “Сравнить понятия”. Separate searches feed
   three criteria with per-side citations, explicit missing evidence and an
   ungraded application question. The result enters the conversation and can be
   bookmarked through P2. [Scope and verification](../docs/p6-source-comparison.md).

![Concept comparison with per-side source citations](../assets/desktop-source-comparison.png)

This production-browser screenshot uses synthetic notes and a mocked AI response.
It illustrates the interface, not a model-quality benchmark.

## Windows requirements

Development and native packaging have been verified on Windows 11 with WebView2.
For use, install either Ollama with a downloaded model or a supported official
account client. The default local model is `qwen3:4b`; inference speed and memory
needs depend on the model and your hardware. GPU acceleration is not assumed.

To build from source, install Node.js 22 with npm, Rust stable with the MSVC
toolchain, Visual Studio C++ Build Tools, Windows SDK and WebView2. The desktop CI
also uses Node.js 22. See the [Tauri Windows prerequisite guide](https://v2.tauri.app/start/prerequisites/#windows).

## Setup and run

For a fresh checkout of the current implemented version:

```powershell
git clone https://github.com/AtaAiti/ConceptLoom-Desktop.git
cd ConceptLoom-Desktop/desktop
npm ci
npm run desktop
```

In an existing checkout, update `main` before installing dependencies. The
commands below assume your working directory is `desktop`.

For local inference, install Ollama separately, then download and check the model:

```powershell
ollama pull qwen3:4b
ollama list
```

The default local endpoint is `http://localhost:11434`. Start Ollama if it is not
running; `ollama serve` can start command-line serving. Test the connection in
Settings, choose an installed model and save. The native app accepts only HTTP
loopback endpoints and disables redirects/proxies for Ollama requests.

If Cargo is installed in its usual per-user directory but absent from the current
PATH, run the existing helper **from the repository root**, after `npm ci` in
`desktop`:

```powershell
.\desktop\scripts\start-desktop.ps1
```

For an account provider, open Settings, select the provider, install/update its
client if needed, sign in, test a generic response, allow context transfer and
save. The bridge does not copy account tokens into SQLite. Full setup, compatibility
and consent details are in the [account-provider guide](../docs/account-providers.md).

Other commands, from `desktop`:

```powershell
npm run dev      # browser preview at http://127.0.0.1:1420
npm run check    # TypeScript check
npm run build    # TypeScript check and production frontend
npm run package  # Windows release NSIS installer
```

Release installers are written to `src-tauri/target/release/bundle/nsis/`.
`npx tauri build --debug` instead writes to `src-tauri/target/debug/bundle/nsis/`.
The filename follows `ConceptLoom_<version>_x64-setup.exe` (currently 0.3.7).
Copies, checksums and build logs in `desktop/releases/` are Git-ignored local
artifacts. Local development installers are unsigned; building does not run them.

Browser preview supports Ollama at its default port. Other ports and account
connections require the native app. Browser storage and native SQLite are separate;
closing the browser does not migrate its data into the desktop app. There is no
hosted web backend.

## Import and feature limits

Open **Источники → Импортировать** for PDF/TXT/Markdown, or select **Вставить текст**,
paste into **Скопированный текст / заметки**, then **Добавить в библиотеку**.
The title is optional; an empty title uses the first non-empty text line.

- PDF: up to 25 MiB, 300 pages and 1,000,000 extracted text characters.
- TXT/Markdown: up to 2 MiB and 1,000,000 text characters; pasted text has the same
  character limit.
- PDFs need a readable text layer. Scans need OCR beforehand; protected files need
  an unlocked copy. PDF.js, its worker, fonts and CMaps are bundled locally.
- Import saves extracted text and page information, not the original PDF binary.
  Citations open saved text excerpts, not highlighted coordinates on PDF images.
- P5 reads a complete short range: 1–5 consecutive pages, at most 7,200 Unicode
  characters and six chunks. It does not silently summarise the first pages of an
  entire book; empty/oversized ranges must be changed by the user.
- P6 retrieves at most three full chunks per concept. It always uses sources only,
  even when ordinary tutoring allows general knowledge. No match is a search gap,
  not proof that information is absent from the whole document. Try the wording
  used by the source; there is no synonym/semantic search or automatic translation
  of search queries.
- No built-in OCR, direct EPUB/audio/video import, Audio/Video Overviews, LM Studio
  adapter, automatic model downloads or legacy MCP-notebook import/export.

Schema checks and valid citation IDs do not establish that every generated claim
is correct. Review the cited text and AI-generated drafts. Generating, reading or
saving explanations/comparisons does not create attempts, FSRS reviews or mastery.

Development changes after 0.3.7 fix Hard recall scoring, chronological evidence
and prerequisite relocking. See [learning rules, local-model checks and performance
profiling](../docs/learning-reliability.md) for exact semantics and verification.

## Data and privacy

The native app saves `conceptloom.sqlite3` in Tauri's application data directory
for `org.conceptloom.desktop`. Settings displays the actual database path.
SQLite uses foreign keys, WAL and transactional entity updates. Only changed rows
are upserted; metadata-only source changes do not rebuild its text index. The UI
still loads an application snapshot rather than lazy workspace reads.

Close the app before backing up its database directory, including WAL/SHM files
if present. There is no in-app portable backup/restore wizard. Local storage is
not encrypted at rest. Sources, progress, tutor history, bookmarks and source
guides persist locally; the original MCP workflow has separate files and storage.

Import itself uploads nothing and contacts no CDN. Ollama processes inference
locally. With an account provider, the context selected by each feature goes to
that service only after consent. The bridge does not upload the original PDF
binary or synchronise SQLite to a hosted backend. Official clients may retain
their own logs/history under their service rules. See [provider privacy and limits](../docs/account-providers.md).

## Architecture

- `src/components`, `src/features`: interface and learning workflows.
- `src/learning`: checkpoints, prerequisites, mastery, planning and FSRS.
- `src/ai`: provider boundary, prompts, structured responses, passage practice,
  section guides and concept comparisons.
- `src/db`, `src/hooks`: validation, workspace scoping and serialised persistence.
- `src-tauri/src`: native account-client isolation, local HTTP and SQLite.
- `src-tauri/migrations`: versioned database schema.

Methodology originates in [coaching-reference.md](../shared/coaching-reference.md),
[checkpoints.mjs](../src/checkpoints.mjs) and [progress.mjs](../src/progress.mjs).
Historical plans describe their original milestones; current scope is in
[P1–P6 notes](../docs/notebooklm-product-review.md), [the audit](../docs/production-audit.md)
and [CAPYBARA design notes](../docs/capybara-design.md).

## Verification

Run from `desktop` with the native build prerequisites installed:

```powershell
npm run check
npm test
npm run build
npx playwright install chromium
npx playwright test
$env:PLAYWRIGHT_PREVIEW = '1'
npx playwright test
Remove-Item Env:PLAYWRIGHT_PREVIEW
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo test --manifest-path src-tauri/Cargo.toml --lib
```

The standard suite uses test fixtures/mocked AI and skips opt-in live integrations.
On the 0.3.7 milestone, 75 TypeScript unit tests, 18 Rust tests and 47 production
browser scenarios passed. A separate real local `qwen3:4b` comparison smoke passed
with synthetic notes. These are historical milestone results, not a claim that
every cloud provider, account or output language was tested. See [P6 verification](../docs/p6-source-comparison.md#проверка).

Optional local-model checks require a running Ollama and downloaded `qwen3:4b`.
Each flag enables a different group; remove it after use:

```powershell
$env:OLLAMA_INTEGRATION = '1'
npm test -- test/ollama.integration.test.ts test/source-ollama.integration.test.ts test/source-handoff.test.ts
Remove-Item Env:OLLAMA_INTEGRATION

$env:GUIDE_OLLAMA_INTEGRATION = '1'
npm test -- source-guide-ollama.integration.test.ts
Remove-Item Env:GUIDE_OLLAMA_INTEGRATION

$env:COMPARISON_OLLAMA_INTEGRATION = '1'
npm test -- source-comparison-ollama.integration.test.ts
Remove-Item Env:COMPARISON_OLLAMA_INTEGRATION
```

Run the independent original MCP checks from the repository root with
`npm run verify`.
