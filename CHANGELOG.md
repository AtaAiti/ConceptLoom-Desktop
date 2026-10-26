# Changelog

All notable changes to Concept Loom are documented here.

## Desktop 0.3.2 — 2026-10-25

- Add “Разобрать с репетитором” to source pages, previews and saved citation excerpts; long pages offer an explicit fragment choice.
- Keep a bounded source fragment and question in the tutor, send only after submission, and return to the same source page.
- Preserve failed contextual questions across reload and retry without duplicating the question. Late answers cannot clear a newer draft; workspace/course drafts and running requests stay isolated.
- Reject deleted, changed or foreign source context before inference; preserve course source settings. Bound mixed answers to the persisted message limit.
- Record the [NotebookLM product review](docs/notebooklm-product-review.md) and [P1 implementation / verification](docs/p1-source-tutor.md). P2–P6 remain future sessions.

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
