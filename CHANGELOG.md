# Changelog

All notable changes to Concept Loom are documented here.

## Unreleased — Desktop learning reliability

- Count FSRS Hard as partial recall evidence instead of total failure; keep Good/Easy delayed recall as the requirement for lifting the provisional mastery ceiling.
- Compute recent evidence and the first attempt chronologically, independent of storage order.
- Preserve access to practised topics when prerequisite scores fall, with a shortcut to revisit the foundation. Unpractised topics still require prerequisites and approval.
- Add a synthetic local-model regression set for open-answer grading and prerequisite maps, and an opt-in full-state performance profile.
- Tighten map prerequisites after a missed foundation in the local-model set; all ten synthetic cases passed in the post-fix run. Skip serialisation of unchanged immutable records and aggregate statistics once per day/topic.
- See [learning reliability rules, model checks, profiling and remaining work](docs/learning-reliability.md).
- Clarify upstream attribution, confidence and mastery rules, and the unresolved conditions for Claude Code account integration. Remove a machine-specific onboarding memory claim.
- Restrict desktop CI token permissions, label development/production browser checks and check Rust formatting.

## Desktop 0.3.7 — 2026-10-25

- P6: compare two concepts using separately retrieved source evidence, citations per supported side and explicit missing evidence.
- Save comparisons atomically in the tutor conversation; reuse bookmarks and source-fragment questions without changing learning evidence.
- P1–P6 and refreshed English/Russian READMEs reached `main` on 2026-10-27. Scope MCP test discovery to its own tests on Node 20/22.

## Desktop 0.3.6 — 2026-10-25

- P5: cache a guide for a complete 1–5-page section, with three points, terms and questions, bounded coverage and stale-source detection.

## Desktop 0.3.5 — 2026-10-25

- P4: generate two source-backed flashcard drafts; edit/select before explicitly adding them to FSRS, with idempotent save retries.

## Desktop 0.3.4 — 2026-10-25

- P3: ask the tutor about a selected map concept and its prerequisites, with concept-scoped history and no automatic mastery changes.

## Desktop 0.3.3 — 2026-10-25

- P2: bookmark tutor explanations in Study Hub with source citations and course filters; removing a bookmark preserves the conversation.

## Desktop 0.3.2 — 2026-10-25

- Add “Разобрать с репетитором” to source pages, previews and saved citation excerpts; long pages offer an explicit fragment choice.
- Keep a bounded source fragment and question in the tutor, send only after submission, and return to the same source page.
- Preserve failed contextual questions across reload and retry without duplicating the question. Late answers cannot clear a newer draft; workspace/course drafts and running requests stay isolated.
- Reject deleted, changed or foreign source context before inference; preserve course source settings. Bound mixed answers to the persisted message limit.
- Record the [NotebookLM product review](docs/notebooklm-product-review.md) and [P1 implementation / verification](docs/p1-source-tutor.md). P2–P6 were future sessions at this milestone and are delivered in 0.3.3–0.3.7 above.

## Desktop 0.3.1 — 2026-10-22

- Allow account-context consent to be revoked and preserve concurrent theme edits when saving settings.
- Keep delayed AI assessment in its original lesson; require all four mastery dimensions in new lessons and repair incomplete legacy lessons without deleting evidence.
- Memoize graph depth; add keyboard-accessible dialogs with visible save errors, clearer light-theme feedback, and window controls during startup/failure.
- Protect MCP state from concurrent writers and workspace junction escapes; retain checkpoints after failed persistence and correctly escape Windows installer paths.
- Respect central Gemini system settings and bound Codex login-status processes.
- Add regression coverage and [audit findings, remaining work and verification](docs/production-audit.md).

## 1.1.0 — 2026-10-06

### Added

- DeepSeek Harness adapter with native `.dsh/skills` discovery.
- Generated Harness MCP patch for Web and headless profiles.
- Installer coverage for normal and `--skip-mcp` DeepSeek Harness setup.
- Open-response checkpoints for free recall, prediction, debugging, and transfer.
- Confidence calibration and per-concept evidence for recognition, recall, application, and transfer.
- Guided, practice, review, and challenge session modes.
- Delayed review scheduling and due-review discovery across sessions.
- Explicit route extensions for prerequisites discovered during Build.

## 1.0.0 — 2026-10-01

First public release.

### Included

- Portable Concept Coach skill for Codex, Claude Code, and OpenCode.
- Locate → Weave → Build learning workflow.
- Concealed-answer checkpoints with explicit knowledge-gap handling.
- Persistent Markdown notebooks and resumable learning state.
- Save-before-continue behavior after learner responses.
- Terminal-readable text and Mermaid diagrams without image renderers.
- Learning workflows for both supplied source materials and foundational topics.
- Safe workspace installer and bilingual English/Russian documentation.
