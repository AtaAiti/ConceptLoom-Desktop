# Workspace and source foundation — 0.2 iteration

## Inspection

Based on main `5c5a152`. Original MCP modules and shared coaching reference retain Locate → Weave → Build → Check → Transfer. Existing desktop has validated DAGs, evidence-based mastery, FSRS, atomic save-before-continue, local-only Ollama and offline PDF parsing. Preserve them.

Current constraints: `Workspace` means the entire application snapshot; all entities belong to courses; every save deletes/reinserts courses; notes flatten PDF pages; tutor concatenates the latest notes; language templates drive course defaults; React components directly orchestrate AI calls. No real workspace boundary or indexed retrieval exists.

## Implementation sequence

1. Add versioned workspace/library/source models and an explicit v1 migration into My Learning. Preserve IDs, evidence, scheduling and original SQL tables. Use transactional delta upserts, never database resets. Keep a copy of the pre-migration browser value.
2. Scope views and commits to a captured workspace identity, including in-flight AI requests. Add workspace lifecycle, global home and a switcher. Generalize course metadata without breaking old records.
3. Preserve PDF pages, chunk within pages, store source membership and provenance, index native chunks with SQLite FTS5/BM25. Provide a deterministic lexical preview fallback. Keep all retrieval scoped to workspace and explicit source selection.
4. Connect selected source excerpts to roadmap/lesson/tutor generation. Treat excerpts as untrusted data; validate citations against retrieved IDs. Persist citations on generated artifacts/cards. Keep original assessment and FSRS flow.
5. Add a dedicated roadmap/Today experience, durable node positions, migration/isolation/retrieval/prompt-boundary tests and an end-to-end source flow. Build and verify native storage and browser UI.

## Boundaries and follow-up

This iteration prioritizes P0 and the first source-grounded vertical slice. Full exam engine, games/XP, multimedia attachment store, web research, embeddings, extra document formats, complete RU localization and comprehensive rich card editing remain later phases. No inert buttons or automatic model downloads. Keep source-only mode honest when no matching evidence exists. Original file preview initially means extracted page text; do not claim binary archival or OCR.

The compatibility React view can temporarily materialize a workspace snapshot, but database writes must carry changed entities only. Pagination/lazy per-entity reads and database-side entity validation are tracked separately if not completed. Preserve explicit tests and accurately document these limits.
