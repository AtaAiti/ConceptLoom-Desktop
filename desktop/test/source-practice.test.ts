import { describe, expect, it, vi } from 'vitest';
import { emptyWorkspace } from '../src/types/state';
import { defaultWorkspace } from '../src/types/sources';
import { createCourse, deleteCourse } from '../src/learning/courses';
import { topicMastery } from '../src/learning/mastery';
import { newCard, Rating, reviewCard } from '../src/learning/reviews';
import { validateWorkspace } from '../src/db/repository';
import { mergeWorkspace, workspaceView } from '../src/db/workspaces';
import { changesBetween } from '../src/db/changes';
import { sourceSelectionOptions } from '../src/features/library/sourceSelection';
import {
  appendSourceCards,
  generateSourcePractice,
  sourcePracticeSchema,
} from '../src/ai/sourcePractice';

const now = new Date('2026-10-25T10:00:00.000Z');
function fixture() {
  const state = emptyWorkspace();
  const course = createCourse({
    name: 'Databases',
    goal: 'Understand',
    knowledge: '',
    currentLevel: 'Beginner',
    targetLevel: 'Apply',
    explanationLanguage: 'Russian',
  });
  state.workspaces.push({ ...defaultWorkspace(), id: 'other', name: 'Other' });
  state.courses = [course, { ...course, id: 'foreign-course', workspaceId: 'other' }];
  state.topics = [
    {
      id: 'topic',
      courseId: course.id,
      title: 'Atomicity',
      description: '',
      dependsOn: [],
      approved: true,
    },
  ];
  state.libraries = [
    {
      id: 'lib',
      workspaceId: state.activeWorkspaceId,
      name: 'Lectures',
      createdAt: now.toISOString(),
    },
  ];
  state.sources = [
    {
      id: 's',
      workspaceId: state.activeWorkspaceId,
      libraryIds: ['lib'],
      courseIds: [],
      title: 'Lecture',
      type: 'pdf',
      importedAt: now.toISOString(),
      tags: [],
      pages: [
        { page: 1, text: 'OTHER_PAGE_PRIVATE_SENTINEL' },
        {
          page: 7,
          text: 'Atomicity means all operations complete or none apply. A rollback undoes changes after failure.',
        },
      ],
    },
  ];
  state.cards = [
    reviewCard(newCard(course.id, 'topic', 'Existing?', 'Keep', now), Rating.Good, now),
  ];
  const pinned = sourceSelectionOptions(state, { sourceId: 's', pageIndex: 1 })[0];
  const target = { workspaceId: state.activeWorkspaceId, courseId: course.id, topicId: null };
  const result = {
    cards: [
      { front: 'What is atomicity?', back: 'All or nothing.', citationIds: [pinned.chunkId] },
      { front: 'What does rollback do?', back: 'Undoes changes.', citationIds: [pinned.chunkId] },
    ],
  };
  const drafts = result.cards.map(({ front, back }, i) => ({ id: `draft-${i}`, front, back }));
  return { state, course, target, pinned, result, drafts };
}

describe('source practice', () => {
  it('makes one bounded structured request with only the chosen passage and returns two stable app-authored IDs without writes', async () => {
    const { state, target, pinned, result } = fixture();
    const before = JSON.stringify(state);
    const provider = {
      chat: vi.fn(),
      models: vi.fn(),
      structured: vi.fn().mockResolvedValue(result),
    };
    const drafts = await generateSourcePractice(provider, state, target, pinned);
    expect(provider.structured).toHaveBeenCalledTimes(1);
    expect(provider.chat).not.toHaveBeenCalled();
    const prompt = JSON.stringify(provider.structured.mock.calls[0][0]);
    expect(prompt).toContain(pinned.excerpt);
    expect(prompt).not.toContain('OTHER_PAGE_PRIVATE_SENTINEL');
    expect(drafts).toHaveLength(2);
    expect(new Set(drafts.map((d) => d.id)).size).toBe(2);
    expect(JSON.stringify(state)).toBe(before);
  });
  it('rejects the wrong number, empty/oversized answers, duplicate questions or invented citations without saving', async () => {
    const { state, target, pinned, result } = fixture();
    const bad = [
      { cards: result.cards.slice(0, 1) },
      { cards: [...result.cards, result.cards[0]] },
      { cards: [result.cards[0], { ...result.cards[1], front: '  WHAT  is atomicity? ' }] },
      { cards: [{ ...result.cards[0], back: '' }, result.cards[1]] },
      { cards: [{ ...result.cards[0], back: 'x'.repeat(4001) }, result.cards[1]] },
      { cards: [{ ...result.cards[0], citationIds: ['not-supplied'] }, result.cards[1]] },
    ];
    for (const value of bad) {
      const provider = {
        chat: vi.fn(),
        models: vi.fn(),
        structured: vi.fn().mockResolvedValue(value),
      };
      await expect(generateSourcePractice(provider, state, target, pinned)).rejects.toThrow();
      expect(state.cards).toHaveLength(1);
    }
    expect(sourcePracticeSchema.safeParse(result).success).toBe(true);
    expect(sourcePracticeSchema.safeParse({ cards: result.cards.slice(0, 1) }).success).toBe(false);
  });
  it('blocks foreign/deleted courses/topics and changed/deleted/foreign snippets before inference', async () => {
    const { state, target, pinned } = fixture();
    const provider = { chat: vi.fn(), models: vi.fn(), structured: vi.fn() };
    for (const candidate of [
      { ...target, courseId: 'foreign-course' },
      { ...target, topicId: 'missing' },
      { ...target, workspaceId: 'other' },
    ])
      await expect(generateSourcePractice(provider, state, candidate, pinned)).rejects.toThrow();
    for (const candidate of [
      { ...pinned, excerpt: 'Changed' },
      { ...pinned, sourceId: 'missing' },
      { ...pinned, workspaceId: 'other' },
    ])
      await expect(generateSourcePractice(provider, state, target, candidate)).rejects.toThrow();
    await expect(
      generateSourcePractice(provider, deleteCourse(state, target.courseId), target, pinned),
    ).rejects.toThrow();
    expect(provider.structured).not.toHaveBeenCalled();
  });
  it('saves only the selected edited card with evidence, no topic by default and pristine FSRS; preserves existing schedules and mastery', () => {
    const { state, target, pinned, drafts } = fixture();
    drafts[0].front = 'Edited question';
    drafts[0].back = 'Edited answer';
    const saved = validateWorkspace(
      appendSourceCards(state, target, pinned, drafts, [drafts[0].id], now),
    );
    expect(saved.cards).toHaveLength(2);
    expect(saved.cards[0]).toEqual(state.cards[0]);
    expect(saved.cards[1]).toMatchObject({
      id: drafts[0].id,
      front: 'Edited question',
      back: 'Edited answer',
      createdBy: 'ai',
      topicId: null,
      reps: 0,
      lapses: 0,
      stability: 0,
      state: 0,
      due: now.toISOString(),
      citations: [{ sourceId: pinned.sourceId, page: 7, excerpt: pinned.excerpt }],
    });
    expect(topicMastery(saved, 'topic')).toBe(topicMastery(state, 'topic'));
    for (const key of ['attempts', 'reviews', 'sessions', 'lessons', 'sources'] as const)
      expect(saved[key]).toEqual(state[key]);
    const patch = changesBetween(validateWorkspace(state), saved);
    expect(patch.upserts.cards).toEqual([saved.cards[1]]);
    expect(patch.upserts.sources).toEqual([]);
    expect(patch.upserts.reviews).toEqual([]);
  });
  it('retry is idempotent even after the created card has been reviewed, and cannot overwrite another course', () => {
    const { state, target, pinned, drafts } = fixture();
    const selected = drafts.map((d) => d.id);
    const saved = appendSourceCards(
      state,
      { ...target, topicId: 'topic' },
      pinned,
      drafts,
      selected,
      now,
    );
    saved.cards[1] = reviewCard(saved.cards[1], Rating.Good, now);
    drafts[0].back = 'Must not overwrite';
    expect(
      appendSourceCards(saved, { ...target, topicId: 'topic' }, pinned, drafts, selected, now),
    ).toBe(saved);
    const conflict = {
      ...state,
      cards: [{ ...state.cards[0], id: drafts[0].id, courseId: 'foreign-course' }],
    };
    expect(() => appendSourceCards(conflict, target, pinned, drafts, selected, now)).toThrow(
      /другому/,
    );
  });
  it('invalid selection/empty edited cards/stale source produce no partial writes and preserve draft IDs for retry', () => {
    const { state, target, pinned, drafts } = fixture();
    for (const ids of [[], ['unknown'], [drafts[0].id, drafts[0].id]])
      expect(() => appendSourceCards(state, target, pinned, drafts, ids, now)).toThrow();
    expect(() =>
      appendSourceCards(
        state,
        target,
        pinned,
        [{ ...drafts[0], back: '' }, drafts[1]],
        drafts.map((d) => d.id),
        now,
      ),
    ).toThrow();
    expect(() =>
      appendSourceCards({ ...state, sources: [] }, target, pinned, drafts, [drafts[0].id], now),
    ).toThrow();
    expect(state.cards).toHaveLength(1);
    expect(appendSourceCards(state, target, pinned, drafts, [drafts[0].id], now).cards[1].id).toBe(
      drafts[0].id,
    );
  });
  it('a late scoped save stays in its original workspace and cannot resurrect deleted data', () => {
    const { state, target, pinned, drafts } = fixture();
    state.activeWorkspaceId = 'other';
    const saved = mergeWorkspace(state, 'my-learning', (view) =>
      appendSourceCards(view, target, pinned, drafts, [drafts[0].id], now),
    );
    expect(saved.activeWorkspaceId).toBe('other');
    expect(workspaceView(saved, 'other').cards).toEqual([]);
    expect(workspaceView(saved, 'my-learning').cards).toHaveLength(2);
    expect(() =>
      appendSourceCards(
        deleteCourse(state, target.courseId),
        target,
        pinned,
        drafts,
        [drafts[0].id],
        now,
      ),
    ).toThrow();
  });
});
