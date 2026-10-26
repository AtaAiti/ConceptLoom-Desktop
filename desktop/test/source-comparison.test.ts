import { describe, expect, it, vi } from 'vitest';
import { emptyWorkspace } from '../src/types/state';
import { createCourse, deleteCourse } from '../src/learning/courses';
import { defaultWorkspace } from '../src/types/sources';
import {
  chunkSource,
  lexicalSearch,
  selectedSources,
  type SourceIndexService,
} from '../src/features/library/sourceIndex';
import {
  comparisonEvidence,
  comparisonRequestSchema,
  comparisonResponseSchema,
  generateSourceComparison,
  saveSourceComparison,
  COMPARISON_MISSING,
  type ComparisonRequest,
  type ComparisonResult,
} from '../src/ai/sourceComparison';
import type { AIMessage, AIProvider } from '../src/ai/providers/types';
import { validateWorkspace } from '../src/db/repository';
import { mergeWorkspace, workspaceView } from '../src/db/workspaces';
import { changesBetween } from '../src/db/changes';
import { setExplanationSaved, hasChangedEvidence } from '../src/features/tutor/savedExplanations';

function fixture() {
  const state = emptyWorkspace(),
    now = new Date().toISOString();
  state.workspaces.push({ ...defaultWorkspace(), id: 'other' });
  state.courses = [
    createCourse({
      name: 'Databases',
      goal: 'Understand',
      knowledge: '',
      currentLevel: 'Beginner',
      targetLevel: 'Apply',
      explanationLanguage: 'Russian',
    }),
  ];
  state.courses.push({ ...state.courses[0], id: 'foreign-course', workspaceId: 'other' });
  state.topics = [
    {
      id: 'topic',
      courseId: state.courses[0].id,
      title: 'Atomicity',
      description: '',
      approved: true,
      dependsOn: [],
    },
  ];
  state.libraries = [
    { id: 'lib', workspaceId: state.activeWorkspaceId, name: 'Lectures', createdAt: now },
    { id: 'foreign-lib', workspaceId: 'other', name: 'Private', createdAt: now },
  ];
  state.sources = [
    {
      id: 'a',
      workspaceId: state.activeWorkspaceId,
      libraryIds: ['lib'],
      courseIds: [],
      title: 'Atomicity.pdf',
      type: 'pdf',
      importedAt: now,
      tags: [],
      pages: Array.from({ length: 7 }, (_, i) => ({
        page: i + 7,
        text: `Atomicity makes a transaction all or nothing. Example ${i}.`,
      })),
    },
    {
      id: 'b',
      workspaceId: state.activeWorkspaceId,
      libraryIds: ['lib'],
      courseIds: [],
      title: 'Isolation.pdf',
      type: 'pdf',
      importedAt: now,
      tags: [],
      pages: [
        {
          page: 18,
          text: 'Isolation separates concurrent transactions and prevents observation of uncommitted data.',
        },
      ],
    },
    {
      id: 'unselected',
      workspaceId: state.activeWorkspaceId,
      libraryIds: ['lib'],
      courseIds: [],
      title: 'Unselected',
      type: 'pasted',
      importedAt: now,
      tags: [],
      pages: [{ page: null, text: 'UNSELECTED_PRIVATE_SENTINEL Atomicity Isolation' }],
    },
    {
      id: 'foreign',
      workspaceId: 'other',
      libraryIds: ['foreign-lib'],
      courseIds: [],
      title: 'Private',
      type: 'pasted',
      importedAt: now,
      tags: [],
      pages: [{ page: null, text: 'FOREIGN_PRIVATE_SENTINEL Atomicity Isolation' }],
    },
  ];
  return state;
}
const request = (state = fixture()): ComparisonRequest => ({
  workspaceId: state.activeWorkspaceId,
  courseId: state.courses[0].id,
  a: 'Atomicity',
  b: 'Isolation',
  sourceIds: ['a', 'b'],
});
const localIndex: SourceIndexService = {
  search: async (state, scope, query) => lexicalSearch(selectedSources(state, scope), query),
};
function response(aId = 'a:0', bId: string | null = 'b:0'): ComparisonResult {
  return {
    rows: ['Definition', 'Mechanism', 'Application'].map((criterion) => ({
      criterion,
      a: { text: 'All or nothing.', citationIds: [aId] },
      b: bId
        ? { text: 'Separates concurrent transactions.', citationIds: [bId] }
        : { text: null, citationIds: [] },
    })),
    applicationQuestion: 'Which property prevents partial application of changes?',
  };
}
function model(value = response()) {
  const structured = vi.fn(async (_messages: AIMessage[], _schema: unknown) => value);
  return {
    structured,
    provider: { structured, chat: async () => '', models: async () => [] } as unknown as AIProvider,
  };
}
describe('source concept comparison', () => {
  it('runs separate searches, reserves a budget for each side, and excludes unselected/workspace data', async () => {
    const state = fixture(),
      ai = model(),
      index = { search: vi.fn(localIndex.search) };
    const draft = await generateSourceComparison(ai.provider, state, request(state), index);
    expect(index.search.mock.calls.map((call) => call[2])).toEqual(['Atomicity', 'Isolation']);
    expect(draft.chunks.a).toHaveLength(3);
    expect(draft.chunks.b).toHaveLength(1);
    expect(draft.citations.map((c) => [c.sourceId, c.page])).toEqual([
      ['a', 7],
      ['b', 18],
    ]);
    const messages = ai.structured.mock.calls[0][0],
      prompt = JSON.stringify(messages);
    expect(prompt).not.toContain('UNSELECTED_PRIVATE_SENTINEL');
    expect(prompt).not.toContain('FOREIGN_PRIVATE_SENTINEL');
    const payload = JSON.parse(
      messages
        .find((m) => m.content.startsWith('UNTRUSTED_SOURCE_DATA_JSON'))!
        .content.split('\n')[1],
    );
    expect(payload.map((c: { chunkId: string }) => c.chunkId)).toEqual([
      'a:0',
      'a:1',
      'a:2',
      'b:0',
    ]);
    expect(payload[0].text).toBe(state.sources[0].pages[0].text);
  });
  it('deduplicates shared evidence without starving either side or truncating chunks', async () => {
    const state = fixture();
    state.sources[0].pages = [
      { page: 7, text: 'Atomicity is all or nothing; Isolation separates transactions.' },
    ];
    const ai = model(response('a:0', 'a:0'));
    const draft = await generateSourceComparison(
      ai.provider,
      state,
      { ...request(state), sourceIds: ['a'] },
      localIndex,
    );
    expect(draft.chunks.a).toHaveLength(1);
    expect(draft.chunks.b).toHaveLength(1);
    expect(draft.citations).toHaveLength(1);
    const payload = ai.structured.mock.calls[0][0].find((m) =>
      m.content.startsWith('UNTRUSTED_SOURCE_DATA_JSON'),
    )!.content;
    expect(JSON.parse(payload.split('\n')[1])).toHaveLength(1);
  });
  it('forces an unsupported side to null even when general knowledge is enabled for the tutor', async () => {
    const state = fixture();
    state.courses[0].sourceMode = 'mixed';
    state.sources[1].pages[0].text = 'A different topic.';
    const ai = model(response('a:0', null));
    const draft = await generateSourceComparison(ai.provider, state, request(state), localIndex);
    expect(draft.chunks.b).toHaveLength(0);
    const saved = saveSourceComparison(state, draft),
      answer = saved.messages[1];
    expect(answer.content).toContain(COMPARISON_MISSING);
    expect(answer.citations).toHaveLength(1);
    expect(answer.provenance).toBe('source');
    expect(state.courses[0].sourceMode).toBe('mixed');
    await expect(
      generateSourceComparison(model().provider, state, request(state), localIndex),
    ).rejects.toThrow();
  });
  it('both no-hits spend zero inference and save an honest missing comparison and ungraded question', async () => {
    const state = fixture(),
      ai = model();
    const draft = await generateSourceComparison(
      ai.provider,
      state,
      { ...request(state), a: 'Photosynthesis', b: 'Mitosis' },
      localIndex,
    );
    expect(ai.structured).not.toHaveBeenCalled();
    expect(draft.citations).toHaveLength(0);
    expect(draft.result.rows.every((r) => r.a.text === null && r.b.text === null)).toBe(true);
    expect(saveSourceComparison(state, draft).messages[1].content).toContain(
      'Уточните формулировки',
    );
  });
  it('filters broad OR hits that contain only common words of a multi-word concept', async () => {
    const state = fixture();
    const chunks = await comparisonEvidence(
      state,
      { ...request(state), a: 'Atomicity transaction', b: 'Secret transaction' },
      localIndex,
    );
    expect(chunks.a).toHaveLength(3);
    expect(chunks.b).toHaveLength(0);
  });
  it('rejects foreign/stale index data before inference', async () => {
    const state = fixture(),
      ai = model();
    const foreignIndex = { search: async () => chunkSource(state.sources[3]) };
    await expect(
      generateSourceComparison(ai.provider, state, request(state), foreignIndex),
    ).rejects.toThrow('вне выбранных');
    const changed = { ...chunkSource(state.sources[0])[0], text: 'Changed index text' };
    await expect(
      generateSourceComparison(ai.provider, state, request(state), {
        search: async () => [changed],
      }),
    ).rejects.toThrow('изменился');
    expect(ai.structured).not.toHaveBeenCalled();
  });
  it('rejects unknown and opposite-side references, missing text with references, unsupported text without references, and wrong row counts', () => {
    const schema = comparisonResponseSchema(['a:0'], ['b:0']);
    expect(schema.safeParse(response()).success).toBe(true);
    expect(schema.safeParse(response('b:0')).success).toBe(false);
    expect(schema.safeParse(response('unknown')).success).toBe(false);
    for (const cell of [
      { text: null, citationIds: ['a:0'] },
      { text: 'Invented', citationIds: [] },
    ]) {
      const value = response();
      value.rows[0].a = cell;
      expect(schema.safeParse(value).success).toBe(false);
    }
    expect(schema.safeParse({ ...response(), rows: [] }).success).toBe(false);
  });
  it('validates two distinct word concepts, selection, ownership and optional map context before search/model use', async () => {
    const state = fixture(),
      ai = model(),
      index = { search: vi.fn(localIndex.search) };
    for (const patch of [
      { a: '' },
      { a: ' ATOMICITY ', b: 'atomicity' },
      { a: 'Ａ', b: 'A' },
      { a: '+++' },
      { sourceIds: [] },
      { sourceIds: ['a', 'a'] },
      { sourceIds: ['foreign'] },
      { sourceIds: ['deleted'] },
      { workspaceId: 'other' },
      { courseId: 'foreign-course' },
      { topicId: 'deleted-topic' },
    ])
      await expect(
        generateSourceComparison(ai.provider, state, { ...request(state), ...patch }, index),
      ).rejects.toThrow();
    expect(index.search).not.toHaveBeenCalled();
    expect(ai.structured).not.toHaveBeenCalled();
    expect(
      comparisonRequestSchema.parse({ ...request(state), a: ' Atomicity\n transaction ' }).a,
    ).toBe('Atomicity transaction');
  });
  it('writes an atomic pair, supports P2 bookmarks and backup/reopen, and changes no learning data', async () => {
    const state = fixture(),
      req = { ...request(state), topicId: 'topic' };
    const draft = await generateSourceComparison(model().provider, state, req, localIndex);
    const saved = saveSourceComparison(state, draft);
    expect(saved.messages).toHaveLength(2);
    expect(saved.messages[1]).toMatchObject({
      replyTo: draft.userId,
      topicId: 'topic',
      provenance: 'source',
    });
    expect(saved.messages[1].content).toContain('[1]');
    expect(saved.messages[1].content).toContain('Вопрос на применение (без оценки)');
    const marked = setExplanationSaved(
      saved,
      { workspaceId: state.activeWorkspaceId, courseId: req.courseId, messageId: draft.answerId },
      true,
    );
    expect(saveSourceComparison(marked, draft)).toBe(marked);
    expect(validateWorkspace(JSON.parse(JSON.stringify(marked))).messages[1].savedAt).toBeTruthy();
    expect(
      Object.entries(changesBetween(state, saved).upserts)
        .filter(([, rows]) => rows.length)
        .map(([key]) => key),
    ).toEqual(['messages']);
    for (const key of [
      'courses',
      'topics',
      'cards',
      'reviews',
      'attempts',
      'lessons',
      'sessions',
      'sources',
    ] as const)
      expect(saved[key]).toBe(state[key]);
  });
  it('refuses to save changed/deleted evidence, course or topic and never resurrects messages after deletion', async () => {
    const state = fixture(),
      draft = await generateSourceComparison(
        model().provider,
        state,
        { ...request(state), topicId: 'topic' },
        localIndex,
      );
    const changed = structuredClone(state);
    changed.sources[1].pages[0].text = 'Replacement';
    expect(() => saveSourceComparison(changed, draft)).toThrow('изменились');
    expect(() =>
      saveSourceComparison({ ...state, sources: state.sources.filter((s) => s.id !== 'b') }, draft),
    ).toThrow('удалён');
    expect(() => saveSourceComparison(deleteCourse(state, state.courses[0].id), draft)).toThrow(
      'Направление',
    );
    expect(() => saveSourceComparison({ ...state, topics: [] }, draft)).toThrow('Понятие');
    const collision = {
      ...state,
      messages: [
        {
          id: draft.answerId,
          courseId: state.courses[0].id,
          role: 'user' as const,
          content: 'Collision',
          createdAt: draft.createdAt,
        },
      ],
    };
    expect(() => saveSourceComparison(collision, draft)).toThrow('занят');
  });
  it('a queued save targets only its original workspace and historical citations detect later removal', async () => {
    const state = fixture(),
      draft = await generateSourceComparison(model().provider, state, request(state), localIndex);
    const merged = mergeWorkspace(
      { ...state, activeWorkspaceId: 'other' },
      state.activeWorkspaceId,
      (view) => saveSourceComparison(view, draft),
    );
    expect(merged.activeWorkspaceId).toBe('other');
    expect(workspaceView(merged, 'other').messages).toHaveLength(0);
    const original = workspaceView(merged, state.activeWorkspaceId);
    expect(hasChangedEvidence(original, original.messages[1])).toBe(false);
    expect(
      hasChangedEvidence(
        { ...original, sources: original.sources.filter((s) => s.id !== 'b') },
        original.messages[1],
      ),
    ).toBe(true);
  });
});
