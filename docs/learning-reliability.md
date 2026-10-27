# Learning reliability follow-up — 2026-10-27

Packaged as Desktop 0.3.8 on 2026-10-28 after Desktop 0.3.7. This follow-up keeps the existing product
name, storage format, evidence history and provider choice. No database migration,
new dependency or automatic cloud inference is introduced.

## Learning rules

- FSRS Again contributes zero recall evidence; Hard contributes half; Good/Easy
  contribute full recall evidence. This is the app's scoring heuristic, not an
  FSRS requirement. The scheduler receives the original rating unchanged.
- The existing provisional ceiling of 80 remains until a Good/Easy review occurs
  at least 24 hours after the earliest lesson attempt. A score of 81+ is Mastered.
  A Hard review alone does not lift that ceiling. New lessons already create at
  least one topic-linked flashcard.
- Recent evidence is chronological, using the latest five records per dimension,
  regardless of the order in which records were loaded. Existing records are not
  rewritten.
- Approval still gates all topics. Prerequisite scores gate first practice; after
  a lesson attempt or topic-linked review, a prerequisite lapse does not lock the
  topic again. Its own mastery can still fall. Generated explanations or unreviewed
  cards alone do not bypass prerequisites. The lesson offers buttons to revisit
  low-scoring prerequisites.
- Confidence helps the learner/tutor notice high-confidence mistakes. It is not
  a mastery multiplier or a validated calibration score. The FSRS-to-evidence
  adapter's placeholder confidence is transient and unused by scoring; reviews do
  not record a fabricated learner confidence.

Changed: `learning/mastery`, `learning/conceptloom`, `learning/planner`, lesson,
review, onboarding and Settings copy. Regression tests first failed on Hard,
attempt order and retroactive locking, then passed after their fixes.

## Local-model regression set

Run from `desktop` in PowerShell after downloading a local model:

```powershell
$env:MODEL_QUALITY_EVAL='1'
$env:EVAL_MODEL='qwen3:4b'
npx vitest run test/model-quality.integration.test.ts
Remove-Item Env:MODEL_QUALITY_EVAL
Remove-Item Env:EVAL_MODEL
```

Normal tests skip this suite. It uses the real `OllamaProvider`, current production
prompts and Zod schemas, with only its browser-relative transport redirected to
loopback Ollama. It sends synthetic tasks, never a user's database or documents.
There is no paid-service fallback or model download. The JSON result, model digest,
verdicts and generated maps are saved in ignored `desktop/releases/model-quality-latest.json`.

Eight human-labelled grading cases cover Russian paraphrases, false explanations,
an instruction-injection answer, correct and incorrect fraction arithmetic,
missing required reasoning, and English transfer reasoning. Two beginner maps
check SQL tables → joins and Python variables → functions, including structural
validity and an explicit prerequisite path. Map titles are matched against small
English/Russian alias sets; this rubric is intentionally narrow and may flag a
valid unfamiliar synonym. It cannot establish the semantic quality of an entire
map. No model judges itself, and the expected labels are not sent to the model.

The first qwen3:4b run passed all eight verdicts and the SQL map, but the Python
map hid foundations inside “Basic Python Syntax” without naming variables. The
map instruction was tightened to require concrete, testable prerequisites and
learning-order edges, avoiding broad “basics” nodes. On the second complete run,
all ten cases passed. No criteria were relaxed. The model digest was
`359d7dd4bcdab3d86b87d73ac27966f4dbb9f5efdfcc75d34a8764a09474fae7`.

This is a small regression set and one post-fix sample per case, not an accuracy
estimate or proof of reliable grading. Citation-ID checks still establish only
which supplied passage was cited, not whether a claim follows from it. User
approval of map drafts and inspection of AI feedback remain necessary.

## Persistence and statistics

The native database already writes changed rows transactionally. The avoidable
cost was serialising every record, including unchanged source text, merely to
decide which rows changed. `changesBetween` now uses identity from immutable
before/next snapshots to skip unchanged collections/records, while returning the
schema-validated new records for changed data. `repository.save` still validates
the complete candidate before computing this patch. Adds, deletes, normalisation,
workspace boundaries and failed-write behaviour remain covered by tests.

Statistics now group daily activity once and compute each topic score once per
call, preserving counts, minutes and streak rules. There is no long-lived mastery
cache that could become stale after a review or import.

The opt-in synthetic profile uses 100 topics and scales from one 1-million-character
source/200 attempts to 50 such sources/10,000 attempts/1,000 cards. On this Windows
Node 22.15 environment, the largest settings-only diff fell from about 626 ms to
0.1 ms; statistics fell from about 486 ms to 109 ms. Both use medians of three warm
runs. Machine load differs between runs, so these numbers are illustrative.
The profile excludes IPC, SQLite writes, disk and React rendering and is not an
end-to-end save benchmark. Full-state validation still took about 70 ms in the
larger post-fix sample. Loading all workspaces and source text remains a scaling
limit; lazy loading or command-level saves should follow measured usage, not an
unrelated storage rewrite in this patch.

```powershell
$env:PERFORMANCE_PROFILE='1'
npx vitest run test/performance-profile.test.ts
Remove-Item Env:PERFORMANCE_PROFILE
```

Results are in ignored `desktop/releases/performance-profile-latest.json`.
Normal CI skips the hardware-dependent profile and makes no timing assertions.

## Provider conditions and remaining work

Claude Code account integration stays experimental. The current account-only
restriction needs clarification against Anthropic's conditions for running its
official client in another product. Settings and the
[provider guide](account-providers.md#claude-code-distribution-conditions--checked-2026-10-27)
state this limitation. No vendor approval, subscription inclusion or full
compliance is claimed; no silent API billing was enabled. Clarification must come
from Anthropic, or the app needs a separately consented API/cloud integration.

Remaining work: broader independently labelled model tasks and repeated samples,
native UI search E2E and shared chunking contract fixtures, Russian morphology and
retrieval evaluation, measured lazy loading, and complete UI localisation. An
arbitrary rename, automatic confidence-based scoring and a full database rewrite
are deliberately outside this fix.

## Verification

Local verification on 2026-10-27: 82 TypeScript tests, 48 production-browser tests,
18 Rust tests and 25 MCP tests passed. The ten local-model cases and the synthetic
performance profile passed separately. The normal suite skips 16 opt-in test
cases (including this new model set/profile); Rust skips one account-inference
test. TypeScript/Vite build, Rust formatting and 53 relative documentation links
were checked. No cloud-account inference or user-data migration was performed.

```powershell
# From desktop
npm test
npm run build
$env:PLAYWRIGHT_PREVIEW='1'
npx playwright test --workers=1
Remove-Item Env:PLAYWRIGHT_PREVIEW
cd src-tauri
cargo fmt --check
cargo test --lib
```

Browser tests use preview storage and mocked inference; they do not validate the
native FTS ranking. The new case checks that a practised dependent concept still
opens, offers a prerequisite shortcut and preserves existing evidence. Native
SQLite/index checks remain in Rust. Development and production Playwright runs in
CI are intentional; both now have descriptive step names. Desktop CI also uses a
read-only repository token and checks Rust formatting.
