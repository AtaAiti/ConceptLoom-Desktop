# CAPYBARA desktop design — 0.2.1

Source: [CAPYBARA in Figma](https://www.figma.com/design/tChHABYWCAsPj4AKXQKZa9/CAPYBARA?node-id=0-1).

The implementation uses the design context and renders of the following frames: Home `2005:24619`, Today `2005:24785`, Sources `2005:24956`, Roadmap `2005:25183`, Knowledge Map `2005:25358`, Tutor `2005:25591`, Study Hub `2005:25764`, Review `2005:25938`, Assessment `2005:26032`, and light Today `2005:26166`.

## Delivered

- Shared 224 px navigation, 30 px native window bar, 58 px toolbar, compact typography, lavender accents, surface/border tokens and light/dark themes. Window controls invoke the native Tauri window API; the title bar supports dragging. Theme preference is saved locally.
- Home with real workspace summaries, recent learning/source activity and a daily practice goal. Resume navigation opens the workspace that owns the displayed learning session.
- Today with real due reviews, unfinished sessions, frontier concepts, previous mistakes and evidence counts. The displayed queue is based on available work, without invented time estimates or progress.
- Sources with library navigation, format filtering, local passage search, a source list, page-aware text preview, file import and a pasted-text dialog. Existing source edit, attachment and confirmed removal actions are retained.
- Roadmap and Knowledge Map with a selected-concept panel, prerequisite/evidence details, stored node positions and existing route proposal/acceptance/editing.
- Tutor and lesson checkpoints styled to the shared design. The tutor continues to use the existing local conversation and source-citation behavior.
- Study Hub connected to actual lessons, card editing, FSRS review, tutor and map. Reviews use a focused layout with answer reveal, genuine scheduling previews and keyboard ratings.

Figma's example names, dates, scores, document contents and B+ tree illustrations are demonstration data, not seeded application content. All production records come from the user's saved state. The design's standalone 15-question exam, games, web access and rich media were not implemented as part of this visual change; no decorative controls imply that they work. Existing lesson checkpoints remain the working assessment flow. Settings/onboarding retain some legacy English copy, so this release is not full RU/EN localization.

## Assets and storage

SVG icons were downloaded from the design-context asset URLs into `desktop/src/assets/capybara`; no temporary Figma URLs are used at runtime. The `DesignIcon` component preserves each SVG's intrinsic dimensions and selects the supplied light/dark variants. Inter is bundled through `@fontsource-variable/inter` (SIL Open Font License), so fonts require no external request. Existing Lucide icons remain in legacy forms and editing actions. Font and icon license notices are included in `desktop/public/licenses` and the application bundle.

There is no database schema change in 0.2.1. Workspace isolation, migration, source retrieval, grading, saved attempts and FSRS storage use the 0.2.0 implementation.

## Verification

UI coverage checks both themes and persistence, source pagination, focused review and return navigation, no horizontal overflow at 1366 px, a 1920 px layout, and loaded icon dimensions. Existing end-to-end tests continue to cover long pasted text, real offline PDF extraction and corrupt PDF errors, lesson evidence/resume, card scheduling, source citations and workspace isolation. UI AI responses are deterministic fixtures; this visual change does not alter the model protocol.

Release validation: 23 desktop unit tests, 6 native database/endpoint tests and all 6 production-build Playwright flows passed. Two model-dependent integration tests remain opt-in and were skipped in the default unit run. TypeScript/Vite passed and the production dependency audit reported zero vulnerabilities. Screenshots were inspected at 1366×768 and 1920×1080, including the light theme, source preview, map and focused review.
