# ConceptLoom Desktop 0.2.0 — delivered scope

This iteration implements the workspace/source foundation and the first learning slice. The complete 62-section product specification remains a multi-release roadmap; sections below distinguish delivered behavior from follow-up work.

## Workspace and storage

Workspaces are persistent entities: name, description, goal, icon, accent metadata, pin/archive flags and timestamps. Global Home lists recent/pinned workspaces and aggregate review/streak counts. The switcher scopes courses, sources, lessons, tutor context, cards, review queues and statistics. Rename/edit/archive/restore and typed-name deletion are available. At least one unarchived workspace must remain.

`workspaceView` creates a scoped compatibility view. `mergeWorkspace` captures the workspace identity, rejects foreign course records and preserves other workspaces. An in-flight operation can finish in its original workspace after switching; deletion or archival rejects its write. It cannot append the result to the newly selected workspace. A failed operation leaves stored evidence unchanged.

SQLite migration 002 adds real workspace keys, libraries, sources, source-library/source-course relationships, page-aware chunks and FTS5. Composite foreign keys prevent source membership across workspace boundaries. Existing course IDs, lessons, attempts, FSRS values, reviews, notes, messages and sessions survive. Old notes become sources in per-course libraries inside My Learning; original notes remain archived records. Old flattened PDF notes keep their original text; historical page metadata is not fabricated. The transaction rolls back on migration failure. Reopening is idempotent. Browser migration keeps a v1 backup key before saving v2.

Production writes now use validated entity deltas and transactional UPSERTs instead of deleting/reinserting all courses. Topic edges, derived exercises/mistakes and source indexes update with their parent entity. A card review updates the card, review record and small settings/active-workspace metadata only. Original full-save code exists solely behind Rust `cfg(test)` to construct legacy test fixtures.

**Remaining storage work:** the frontend still materializes the application snapshot and computes deltas in memory. Source bodies are in source JSON plus indexed chunk rows. Per-workspace lazy reads, paginated repositories, separate document-page bodies and background job cancellation should precede very large libraries. This is an incremental compatibility boundary, not a claim that full normalization/pagination is complete.

## Subjects and sources

Study paths have workspace ownership, subject kind, description, difficulty, optional target date, explanation language and optional language-domain metadata. Compatibility names `name`, `knowledge` and `targetLevel` currently represent title, current knowledge and desired outcome. The legacy target-language field is optional on input and retained as a compatibility mirror. Generic paths create no automatic language curriculum. English/Korean starter paths remain available when explicitly selected.

PDF/TXT/Markdown/pasted text imports work before creating a study path. New PDFs preserve every page number, including empty pages. Original filename, size, type, import time, page count, tags, library membership and path attachments are stored. Preview shows extracted text one page at a time. Source rename, tags, move-to-library and confirmed deletion are functional. Source cards render in batches of 30. Original binaries are not copied, and OCR is not implemented.

Native retrieval uses FTS5 `unicode61` and BM25, with workspace/source filters applied in SQL before the six-result limit. Queries are tokenized and quoted to prevent FTS syntax injection. Source pages are split into at most 1,200 Unicode characters, preferring whitespace boundaries after 600 characters. Chunks never cross a page. Metadata-only source edits do not rebuild the index. Browser preview uses deterministic lexical scoring, not BM25 or semantic search. No embedding model is downloaded.

## Source-grounded learning

Each path stores a visible context choice: none, all workspace sources, a library or selected sources, plus sources-only/mixed mode. Route suggestions retrieve relevant excerpts; overview generation may sample the first two chunks per selected document when there is no lexical hit. This is a bounded sample, not exhaustive document understanding.

Route and lesson generation use schema-validated `{result, citationIds}` responses. Citations resolve only to the chunks actually sent. Unknown citation IDs reject the result. Sources-only requests with no matching lesson evidence fail with an actionable message; tutor requests return an explicit no-evidence response without calling the model. General model knowledge has a separate section in mixed tutor answers. A supplied passage can still be misinterpreted by a model: citation validation proves provenance, not factual entailment.

Source text is placed in a separate user-role JSON data message. System instructions explicitly prohibit following embedded instructions/links. No web tool or shell capability is exposed. Excerpts are rendered as React text, never executable HTML. No external learning-content requests were introduced.

Accepted routes retain source citations; generated lessons and cards retain excerpt snapshots. Citation buttons open the saved excerpt with its real source title/page. Deleting a source removes its index while existing generated artifacts retain the excerpts needed to inspect their provenance. A path's selected-source IDs may refer to a removed source; retrieval excludes it and the UI shows no selected chip.

## Learning and UX

Dedicated Roadmap orders concepts by prerequisites and shows evidence-based progress and next actions. React Flow has a minimap and durable dragged node positions. The existing proposal-acceptance step preserves completed paths/evidence.

Today prioritizes due FSRS reviews, unfinished sessions, a recent mistake and available frontier concepts. Study Hub groups lessons, card management and review. Ctrl+K searches current-workspace paths, source titles, concepts, card fronts and chat text, plus global workspace names. Source results open their preview; other results navigate to the corresponding course view. Results are capped at 40. Card review adds Space/1–4 shortcuts outside editable controls; existing button keyboard operation remains available.

Generated cards support text/example blocks, source citations and AI provenance; review still uses their existing front/back with genuine FSRS. This is not the full rich-card/deck editor. Reduced-motion support respects both system preference and an application setting. The new stylesheet adds shared tokens; the original stylesheet is retained incrementally.

Mastery algorithm remains unchanged: recognition 15%, recall 30%, application 30%, transfer 25%; up to five recent attempts per dimension with linearly increasing recency weights, half credit with hints, zero for gaps/wrong answers. FSRS outcomes contribute recall evidence. Mastery is capped at 80 until a successful delayed review at least 24 hours after the first attempt. Reading, generation and navigation add no evidence or XP.

## Verification

Local release verification: 18 upstream tests, 23 desktop unit tests, 6 native tests and 5 production-build Playwright tests passed. Two opt-in Ollama tests are skipped by the default unit command; the source-grounded integration test was also run separately against real qwen3:4b and passed. TypeScript/Vite and the optimized Windows NSIS release build passed. The production dependency audit reported no vulnerabilities. UI screenshots were inspected at 1366×768 and 1920×1080. Native migration was exercised on test databases; the user's installed database was not opened or modified by these tests.

- Existing upstream MCP tests retained.
- Desktop unit tests cover migration, isolation including late writes, delta granularity, source chunking, selection, citation validation and untrusted-source prompt boundaries, alongside existing learning/FSRS/AI/PDF tests.
- Native tests exercise a real populated v1 database migration/reopen, FTS5 page-aware search and workspace isolation, source foreign keys, transactional rollback and unchanged course rows on a card edit.
- Playwright covers onboarding, legacy lesson/review flows, long pasted text, actual offline PDF parsing, and the new workspace → library → PDF → route → lesson → checkpoint → FSRS → reopen → isolation flow. AI is deterministic test data in these UI tests; no production statistics are seeded.
- Separate opt-in real Ollama test uses qwen3:4b and checks a source-grounded answer plus valid citation. The local run passed in approximately 32 seconds.

## Next phases

Remaining P0/P1 depth: lazy repositories, native payload validation beyond foreign keys, library rename/archive/delete management, source collections, persisted indexing-job status/cancellation, more precise claim-level citations, source-generated standalone summaries/glossaries/tests, path-domain adapters and full interface/explanation/subject-language separation.

P2: universal assessment engine and 15-question mixed tests, deterministic grading for new question types, richer rubrics, dedicated decks, rich media/math/code rendering and editing, adaptive Learn, graph modules/focus/search and richer roadmap checkpoints.

P3: full RU/EN localization, broader keyboard/focus/accessibility coverage, achievements/XP/quests, games and a refined time-budgeted adaptive planner. Workspace accents already apply to primary controls and selected navigation.

P4: explicit opt-in web providers, attributed media, local attachment store, speech, exam profiles, versioned workspace export/import and additional document formats. Until implemented, no buttons imply these features exist.
