import { describe, expect, it } from 'vitest';
import { emptyWorkspace } from '../src/types/state';
import { defaultWorkspace } from '../src/types/sources';
import { createCourse, deleteCourse } from '../src/learning/courses';
import { newCard } from '../src/learning/reviews';
import { validateWorkspace } from '../src/db/repository';
import { changesBetween } from '../src/db/changes';
import { mergeWorkspace, removeWorkspace, workspaceView } from '../src/db/workspaces';
import {
  hasChangedEvidence,
  savedExplanations,
  setExplanationSaved,
} from '../src/features/tutor/savedExplanations';

const now = '2026-10-25T10:00:00.000Z';
function fixture() {
  const state = emptyWorkspace();
  state.courses = [
    createCourse({
      name: 'Базы данных',
      goal: 'Понять',
      knowledge: '',
      currentLevel: 'Beginner',
      targetLevel: 'Apply',
      explanationLanguage: 'Russian',
    }),
  ];
  state.workspaces.push({ ...defaultWorkspace(), id: 'other', name: 'Other' });
  state.courses.push({ ...state.courses[0], id: 'foreign-course', workspaceId: 'other' });
  state.libraries = [
    { id: 'lib', workspaceId: state.activeWorkspaceId, name: 'Лекции', createdAt: now },
  ];
  state.sources = [
    {
      id: 'lecture',
      workspaceId: state.activeWorkspaceId,
      libraryIds: ['lib'],
      courseIds: [],
      title: 'Лекция',
      type: 'pasted',
      importedAt: now,
      tags: [],
      pages: [{ page: 7, text: 'Атомарность — всё или ничего.' }],
    },
  ];
  const citations = [
    {
      chunkId: 'lecture:0',
      sourceId: 'lecture',
      title: 'Лекция',
      page: 7,
      excerpt: state.sources[0].pages[0].text,
    },
  ];
  state.messages = [
    {
      id: 'q',
      courseId: state.courses[0].id,
      role: 'user',
      content: 'Почему откат?',
      createdAt: now,
    },
    {
      id: 'a',
      courseId: state.courses[0].id,
      role: 'assistant',
      content: 'Всё или ничего',
      replyTo: 'q',
      citations,
      provenance: 'source',
      createdAt: now,
    },
    {
      id: 'foreign',
      courseId: 'foreign-course',
      role: 'assistant',
      content: 'Private',
      savedAt: now,
      createdAt: now,
    },
  ];
  state.cards = [newCard(state.courses[0].id, null, 'Вопрос', 'Ответ')];
  return state;
}
const target = (state: ReturnType<typeof fixture>) => ({
  workspaceId: state.activeWorkspaceId,
  courseId: state.courses[0].id,
  messageId: 'a',
});

describe('saved tutor explanations', () => {
  it('round-trips old and saved messages, changes only the chosen answer and keeps evidence/FSRS intact', () => {
    const before = validateWorkspace(fixture());
    expect(before.messages[1].savedAt).toBeUndefined();
    const after = validateWorkspace(
      JSON.parse(JSON.stringify(setExplanationSaved(before, target(before), true, now))),
    );
    expect(after.messages[1]).toEqual({ ...before.messages[1], savedAt: now });
    const patch = changesBetween(before, after);
    expect(patch.upserts.messages).toEqual([after.messages[1]]);
    for (const key of Object.keys(patch.upserts).filter((k) => k !== 'messages'))
      expect(patch.upserts[key]).toEqual([]);
    expect(after.cards).toEqual(before.cards);
    expect(after.sources).toEqual(before.sources);
    expect(setExplanationSaved(after, target(after), true, '2026-10-26T10:00:00.000Z')).toBe(after);
    const unsaved = setExplanationSaved(after, target(after), false);
    expect(unsaved).toEqual(before);
  });
  it('lists only saved assistant answers owned by the current workspace, newest first', () => {
    const initial = fixture();
    const state = setExplanationSaved(initial, target(initial), true, now);
    state.messages.push({
      ...state.messages[1],
      id: 'newest',
      savedAt: '2026-10-26T10:00:00.000Z',
    });
    expect(savedExplanations(state).map((m) => m.id)).toEqual(['newest', 'a']);
    expect(savedExplanations(workspaceView(state, 'other')).map((m) => m.id)).toEqual(['foreign']);
  });
  it('rejects a deleted answer, deleted course, user question and foreign workspace without recreating data', () => {
    const state = fixture();
    const t = target(state);
    expect(() => setExplanationSaved({ ...state, messages: [] }, t, true)).toThrow(/недоступно/);
    expect(() => setExplanationSaved(deleteCourse(state, t.courseId), t, true)).toThrow(
      /недоступно/,
    );
    expect(() => setExplanationSaved(state, { ...t, messageId: 'q' }, true)).toThrow(/недоступно/);
    expect(() => setExplanationSaved(state, { ...t, workspaceId: 'other' }, true)).toThrow(
      /недоступно/,
    );
    expect(() =>
      setExplanationSaved(state, { ...t, courseId: 'foreign-course', messageId: 'foreign' }, false),
    ).toThrow(/недоступно/);
    state.messages[0].savedAt = now;
    expect(() => validateWorkspace(state)).toThrow(/Only tutor/);
  });
  it('a late scoped bookmark preserves newer content and the newly active workspace', () => {
    const state = fixture();
    const t = target(state);
    state.activeWorkspaceId = 'other';
    state.messages[1].content = 'Latest committed explanation';
    const result = mergeWorkspace(state, 'my-learning', (view) =>
      setExplanationSaved(view, t, true, now),
    );
    expect(result.activeWorkspaceId).toBe('other');
    expect(savedExplanations(result).map((m) => m.id)).toEqual(['foreign']);
    expect(result.messages.find((m) => m.id === 'a')).toMatchObject({
      content: 'Latest committed explanation',
      savedAt: now,
    });
    expect(result.messages.find((m) => m.id === 'foreign')).toEqual(state.messages[2]);
  });
  it('keeps historical citation snapshots after deletion or revision and reports the change', () => {
    const state = fixture();
    const answer = state.messages[1];
    expect(hasChangedEvidence(state, answer)).toBe(false);
    const revised = {
      ...state,
      sources: state.sources.map((s) => ({ ...s, pages: [{ page: 7, text: 'New edition' }] })),
    };
    expect(hasChangedEvidence(revised, answer)).toBe(true);
    expect(hasChangedEvidence({ ...state, sources: [] }, answer)).toBe(true);
    expect(answer.citations?.[0].excerpt).toBe('Атомарность — всё или ничего.');
    expect(hasChangedEvidence(state, { ...answer, citations: [] })).toBe(false);
  });
  it('course/workspace deletion removes its bookmarks while leaving other explanations intact', () => {
    const state = fixture();
    const saved = setExplanationSaved(state, target(state), true, now);
    expect(deleteCourse(saved, state.courses[0].id).messages.map((m) => m.id)).toEqual(['foreign']);
    expect(removeWorkspace(saved, 'my-learning').messages.map((m) => m.id)).toEqual(['foreign']);
  });
});
