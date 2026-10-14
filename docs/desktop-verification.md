# Desktop initial milestone verification

Verified on Windows against the original ConceptLoom commit `6cc52df`.

- All 18 original MCP tests and syntax checks pass without source modifications.
- Strict TypeScript checks and Vite production build pass.
- 14 desktop tests pass: evidence/mastery (including delayed retrieval), course
  validation/deletion, dependency cycles/orphans, answer concealment/mixing,
  deterministic checks, FSRS round trips, AI parsing/local-only transport,
  SQLite migrations/foreign keys/cascades/rollback.
- Two Playwright workflows pass at 1366×768: onboarding/course persistence/card
  creation/FSRS review, and lesson diagnosis/grading/evidence/resume after reload.
- Real `qwen3:4b` produces a schema-valid Korean lesson with Russian explanations
  through localhost. Verified with `OLLAMA_INTEGRATION=1`; no mock in this test.
- Cargo native checks and transactional repository tests pass.
- A Tauri Windows x64 NSIS debug installer is produced successfully.
- The packaged native executable starts, creates its SQLite database in the
  resolved application data directory, and exposes a responsive ConceptLoom
  window. The smoke-test instance was closed after verification.
- `npm audit` reports no known vulnerabilities at verification time.

The first cold CPU-only generation timed out at three minutes while compiling.
After compact prompts and JSON-schema constrained output, the actual-model test
completed in approximately 85 seconds. Calls are now bounded to ten minutes,
with a token cap, and timeouts receive friendly messages. AMD GPU acceleration
has not been configured or asserted.

Native SQLite and browser preview use separate storage. The application is an
initial implementation; PDF parsing, speech, alternate local provider adapters,
and legacy MCP data import remain future milestones. Native UI automation and
signed release distribution have not been verified. No release has been pushed
or published. The debug installer is intended for local evaluation.

## Library update 0.1.1

Fixed the inherited 20,000-character validation ceiling for library text. Notes
now accept up to 1,000,000 characters, and pasted text can be saved without a
title. PDF.js extracts selectable PDF text locally; its worker, CMaps, standard
fonts and license are shipped in the installer. Limits are 25 MB / 300 PDF pages
and 2 MB for TXT/Markdown. Scans without text layers and protected/corrupt files
receive clear errors, with existing notes preserved. No OCR is included.

Added three regression tests for long multilingual text, empty/oversized inputs
and file validation, plus browser scenarios for paste/save/reload and offline
PDF import/corrupt PDF handling. Production preview exercises the bundled worker
with the application's content security policy. Run with
`PLAYWRIGHT_PREVIEW=1 npx playwright test` after the frontend build.
