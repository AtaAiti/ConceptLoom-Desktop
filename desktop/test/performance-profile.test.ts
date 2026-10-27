import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { emptyWorkspace, type Attempt } from '../src/types/state';
import { createCourse } from '../src/learning/courses';
import { newCard } from '../src/learning/reviews';
import { validateWorkspace } from '../src/db/repository';
import { changesBetween } from '../src/db/changes';
import { statistics } from '../src/learning/planner';

// Diagnostic only: no hardware-dependent timing assertions in CI.
it.skipIf(process.env.PERFORMANCE_PROFILE !== '1')(
  'profiles synthetic full-state work without touching storage',
  () => {
    const results = [];
    for (const scale of [1, 10, 50]) {
      let state = emptyWorkspace();
      const course = createCourse({
        name: 'Synthetic profiling',
        goal: 'Measure local overhead',
        knowledge: '',
        currentLevel: 'Beginner',
        targetLevel: 'Apply',
        explanationLanguage: 'Russian',
      });
      state.courses = [course];
      state.libraries = [
        {
          id: 'profile-library',
          workspaceId: state.activeWorkspaceId,
          name: 'Synthetic library',
          createdAt: course.createdAt,
        },
      ];
      state.topics = Array.from({ length: 100 }, (_, i) => ({
        id: `topic-${i}`,
        courseId: course.id,
        title: `Topic ${i}`,
        description: '',
        dependsOn: [],
        approved: true,
      }));
      state.sources = Array.from({ length: scale }, (_, i) => ({
        id: `source-${i}`,
        workspaceId: state.activeWorkspaceId,
        title: `Synthetic source ${i}`,
        type: 'pasted' as const,
        importedAt: course.createdAt,
        tags: [],
        libraryIds: ['profile-library'],
        courseIds: [course.id],
        pages: [{ page: null, text: 'Synthetic reference text. '.repeat(40000).slice(0, 1000000) }],
      }));
      state.attempts = Array.from({ length: scale * 200 }, (_, i): Attempt => ({
        id: `attempt-${i}`,
        courseId: course.id,
        topicId: state.topics[i % 100].id,
        exerciseId: 'e',
        dimension: (['recognition', 'recall', 'application', 'transfer'] as const)[
          Math.floor(i / 100) % 4
        ],
        response: 'Synthetic response',
        accurate: i % 5 !== 0,
        gap: false,
        hintUsed: false,
        confidence: 60,
        feedback: 'Synthetic feedback',
        elapsedSeconds: 10,
        createdAt: new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString(),
      }));
      state.cards = Array.from({ length: scale * 20 }, (_, i) => ({
        ...newCard(course.id, state.topics[i % 100].id, 'Question', 'Answer'),
        id: `card-${i}`,
      }));
      // Match a snapshot loaded through the repository, including canonical schema field order.
      state = validateWorkspace(state);
      const next = { ...state, settings: { ...state.settings, dailyMinutes: 35 } };
      const samples = {
        validationMs: [] as number[],
        diffMs: [] as number[],
        statisticsMs: [] as number[],
      };
      for (let repeat = 0; repeat < 4; repeat++) {
        let started = performance.now();
        const parsed = validateWorkspace(next);
        const validationMs = performance.now() - started;
        started = performance.now();
        const patch = changesBetween(state, parsed, next);
        const diffMs = performance.now() - started;
        expect(patch.upserts.sources).toHaveLength(0);
        expect(patch.upserts.attempts).toHaveLength(0);
        started = performance.now();
        statistics(state, new Date('2026-10-27T00:00:00.000Z'));
        const statisticsMs = performance.now() - started;
        if (repeat) {
          samples.validationMs.push(validationMs);
          samples.diffMs.push(diffMs);
          samples.statisticsMs.push(statisticsMs);
        }
      }
      const median = (values: number[]) =>
        Math.round([...values].sort((a, b) => a - b)[1] * 10) / 10;
      results.push({
        sources: scale,
        sourceCharacters: scale * 1000000,
        attempts: state.attempts.length,
        cards: state.cards.length,
        validationMs: median(samples.validationMs),
        diffMs: median(samples.diffMs),
        statisticsMs: median(samples.statisticsMs),
      });
    }
    mkdirSync('releases', { recursive: true });
    writeFileSync(
      'releases/performance-profile-latest.json',
      JSON.stringify(
        {
          runAt: new Date().toISOString(),
          node: process.version,
          platform: process.platform,
          results,
          limits:
            'In-memory synthetic median of 3 warm runs; excludes SQLite IPC, disk and rendering.',
        },
        null,
        2,
      ),
    );
    console.info(JSON.stringify(results));
  },
  120000,
);
