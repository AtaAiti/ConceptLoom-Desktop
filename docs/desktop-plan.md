# ConceptLoom Desktop implementation plan

## Repository inspection

Inspected upstream commit `6cc52df`, all source modules, installer, adapters,
coaching references, English/Russian guides, tests, configuration and CI.
The original project is a dependency-free Node.js stdio MCP server (18 passing
baseline tests), not a web application. It delegates inference and interaction
to the host agent. There is no existing desktop UI or SQLite database to migrate.

Keep `src/*.mjs`, `scripts/setup.mjs`, `adapters/`, original documentation and
tests compatible. `shared/coaching-reference.md` is the methodology source.
`checkpoints.mjs` provides private answers, choice mixing, exact-set assessment,
admitted gaps and confidence calibration. `progress.mjs` supplies the evidence
ledger, route extensions and save-before-continue invariant. `notebook.mjs`
provides durable notes; `diagrams.mjs` supplies portable diagrams. Filesystem and
Node crypto dependencies prevent importing these modules into a WebView as-is.
Adapt their pure rules into TypeScript, with explicit provenance and tests.
Host adapter skills, MCP transport, native questions, web research and installer
configuration remain available to original users but are not desktop dependencies.

## Proposed boundaries

- `desktop/src/components` and `features`: React UI, reusable controls and pages.
- `desktop/src/learning/conceptloom`: frontier, DAG validation, checkpoint rules
  and Locate/Weave/Build evidence. Reading a lesson never grants mastery.
- `desktop/src/learning/mastery` and `reviews`: evidence scoring and MIT ts-fsrs.
- `desktop/src/ai`: provider interface, loopback-only Ollama, dedicated prompts
  and strict Zod schemas. Generated maps require learner acceptance.
- `desktop/src/db`: validated application state and repository boundary.
- `desktop/src-tauri`: SQLite migrations, atomic persistence and bounded local
  HTTP requests. No telemetry, accounts, cloud inference or external assets.

Tauri resolves its application data directory; no absolute user paths. A small
first-version repository persists normalized entities with JSON payloads in one
SQLite transaction. This keeps attempts, mistakes, evidence and resume points
consistent. Future scaling can replace whole-state transactions with targeted
writes behind the same repository. Browser preview is explicitly separate and
uses browser storage; it never claims to be the native SQLite runtime.

## Ordered milestones and verification

1. Inspect and preserve original source; record architecture before coding.
2. Add isolated Tauri 2 + React/TypeScript/Vite/Tailwind desktop workspace and
   original dark navigation. Keep root MCP commands unchanged.
3. Establish SQLite migrations, course CRUD, settings and first-run onboarding.
4. Add local-only Ollama status/model discovery, validated structured output,
   timeout/error handling, and course-aware tutor context.
5. Add dependency maps with manual editing and accepted AI suggestions, one
   concept lessons, practice/checkpoints and atomic saved progress.
6. Add editable cards and real FSRS reviews; mistakes, plans, real statistics,
   and TXT/Markdown library notes.
7. Run original tests, strict TypeScript checks, learning/database/provider tests,
   production frontend build and native checks where toolchain is available.
8. Document setup, privacy, limitations and reproducible Windows packaging.

Ship these as separable files and milestones, not a replacement of the MCP
project. English/Korean course templates contain starting routes, never invented
learner progress. Unknown knowledge is assessed rather than assumed mastered.

## References

- https://v2.tauri.app/start/prerequisites/
- https://docs.ollama.com/api/chat
- https://github.com/open-spaced-repetition/ts-fsrs
