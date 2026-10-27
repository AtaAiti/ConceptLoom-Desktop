import { describe, expect, it } from 'vitest';
import { emptyWorkspace } from '../src/types/state';
import { defaultWorkspace } from '../src/types/sources';
import { migrateState } from '../src/db/migrate';
import { validateWorkspace } from '../src/db/repository';
import { mergeWorkspace, workspaceView, removeWorkspace } from '../src/db/workspaces';
import { changesBetween } from '../src/db/changes';
import { createCourse } from '../src/learning/courses';
import { newCard } from '../src/learning/reviews';

const course = (workspaceId = 'my-learning') =>
  createCourse({
    workspaceId,
    name: 'Databases',
    goal: 'Design an index',
    knowledge: 'Tables',
    currentLevel: 'Beginner',
    targetLevel: 'Independent',
    explanationLanguage: 'Russian',
  });
describe('workspace migration and isolation', () => {
  it('diffs immutable snapshots while sending validated new/changed records and preserving deletions', () => {
    const app = emptyWorkspace();
    app.courses = [course()];
    app.cards = [
      newCard(app.courses[0].id, null, 'Question', 'Answer'),
      newCard(app.courses[0].id, null, 'Delete me', 'Answer'),
    ];
    const before = validateWorkspace(app);
    const changed = { ...before.cards[0], front: '  Changed question  ' };
    const added = newCard(app.courses[0].id, null, '  New question  ', 'Answer');
    const original = { ...before, cards: [changed, added] };
    const parsed = validateWorkspace(original);
    const patch = changesBetween(before, parsed, original);
    expect(patch.upserts.cards).toEqual(parsed.cards);
    expect(patch.upserts.cards[0]).toMatchObject({ front: 'Changed question' });
    expect(patch.upserts.courses).toEqual([]);
    expect(patch.deletes.cards).toEqual([before.cards[1].id]);
    expect(changesBetween(before, validateWorkspace(before), before).upserts.cards).toEqual([]);
    expect(before.cards[0].front).toBe('Question');
  });
  it('preserves old identities, FSRS and notes; migration is idempotent', () => {
    const old = {
      ...emptyWorkspace(),
      version: 1,
      courses: [course()],
      cards: [] as ReturnType<typeof newCard>[],
      notes: [
        {
          id: 'note',
          courseId: '',
          title: 'Lecture',
          content: 'B+ trees keep data in leaves.',
          createdAt: new Date().toISOString(),
        },
      ],
    };
    old.notes[0].courseId = old.courses[0].id;
    old.cards = [
      { ...newCard(old.courses[0].id, null, 'Question', 'Answer'), stability: 32, reps: 8 },
    ];
    const result = validateWorkspace(migrateState(old));
    expect(result.cards).toEqual(old.cards);
    expect(result.notes).toEqual(old.notes);
    expect(result.sources[0].id).toBe('note');
    expect(result.sources[0].pages[0].text).toBe(old.notes[0].content);
    expect(result.courses[0].workspaceId).toBe('my-learning');
    expect(migrateState(result)).toEqual(result);
  });
  it('scopes reads and late writes to the original workspace, rejects cross-boundary records', () => {
    const app = emptyWorkspace();
    app.workspaces.push({ ...defaultWorkspace(), id: 'other', name: 'Other' });
    app.courses = [course(), course('other')];
    app.cards = app.courses.map((c) => newCard(c.id, null, c.name, 'Answer'));
    app.activeWorkspaceId = 'other';
    expect(workspaceView(app, 'other').cards).toHaveLength(1);
    const next = mergeWorkspace(app, 'my-learning', (s) => ({
      ...s,
      cards: s.cards.map((c) => ({ ...c, front: 'Updated after switch' })),
    }));
    expect(next.activeWorkspaceId).toBe('other');
    expect(workspaceView(next, 'other').cards).toEqual(workspaceView(app, 'other').cards);
    expect(() =>
      mergeWorkspace(app, 'my-learning', (s) => ({
        ...s,
        cards: [...s.cards, newCard(app.courses[1].id, null, 'Leak', 'No')],
      })),
    ).toThrow(/outside/);
    expect(removeWorkspace(app, 'my-learning').cards).toEqual(workspaceView(app, 'other').cards);
    expect(() => removeWorkspace(emptyWorkspace(), 'my-learning')).toThrow();
  });
  it('transmits only a changed card; source context cannot cross workspaces', () => {
    const app = emptyWorkspace();
    app.courses = [course()];
    app.cards = [newCard(app.courses[0].id, null, 'Question', 'Answer')];
    const next = { ...app, cards: app.cards.map((c) => ({ ...c, front: 'Changed' })) };
    const patch = changesBetween(app, next);
    expect(patch.upserts.cards).toHaveLength(1);
    expect(patch.upserts.courses).toEqual([]);
    expect(patch.upserts.sources).toEqual([]);
    expect(patch.deletes.cards).toEqual([]);
    expect(patch.settings).toBeNull();
    app.workspaces.push({ ...defaultWorkspace(), id: 'other' });
    app.libraries.push({
      id: 'lib',
      workspaceId: 'other',
      name: 'Other',
      createdAt: new Date().toISOString(),
    });
    app.sources.push({
      id: 'src',
      workspaceId: 'my-learning',
      libraryIds: ['lib'],
      courseIds: [],
      title: 'Bad',
      type: 'pasted',
      importedAt: new Date().toISOString(),
      tags: [],
      pages: [{ page: null, text: 'Never leak' }],
    });
    expect(() => validateWorkspace(app)).toThrow(/boundaries/);
  });
});
