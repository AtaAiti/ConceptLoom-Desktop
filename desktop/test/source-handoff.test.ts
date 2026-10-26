import { describe, expect, it, vi } from 'vitest';
import { emptyWorkspace, messageSchema } from '../src/types/state';
import type { Source } from '../src/types/sources';
import {
  chunkSource,
  pageChunks,
  resolvePinnedSource,
  resolveCitations,
} from '../src/features/library/sourceIndex';
import { answerFromSources } from '../src/ai/sourceLearning';
import { createCourse } from '../src/learning/courses';
import { restoreTutorDraft } from '../src/features/tutor/draft';
import { validateWorkspace } from '../src/db/repository';
import { OllamaProvider } from '../src/ai/providers/ollama';

function fixture() {
  const state = emptyWorkspace();
  const course = createCourse({
    name: 'Databases',
    goal: 'Learn',
    knowledge: '',
    currentLevel: 'Beginner',
    targetLevel: 'Apply',
    explanationLanguage: 'Russian',
  });
  state.courses = [course];
  state.libraries = [
    {
      id: 'lib',
      workspaceId: state.activeWorkspaceId,
      name: 'Lectures',
      createdAt: new Date().toISOString(),
    },
  ];
  const source: Source = {
    id: 'source',
    workspaceId: state.activeWorkspaceId,
    libraryIds: ['lib'],
    courseIds: [],
    title: 'Lecture',
    type: 'pdf',
    importedAt: new Date().toISOString(),
    tags: [],
    pages: [
      { page: 1, text: 'Unrelated page. '.repeat(130) },
      { page: 7, text: 'Atomicity means either all operations complete, or none apply.' },
      { page: 8, text: 'OTHER_PAGE_PRIVATE_SENTINEL' },
    ],
  };
  state.sources = [source];
  const chunk = pageChunks(source, 1)[0];
  const pinned = {
    ...resolveCitations([chunk.id], [chunk], [source])[0],
    workspaceId: state.activeWorkspaceId,
  };
  return { state, course, source, chunk, pinned };
}

describe('source → tutor boundary', () => {
  it('preserves global chunk IDs when selecting a page, including text pages without numbers', () => {
    const { source } = fixture();
    expect(pageChunks(source, 1)).toEqual(chunkSource(source).filter((c) => c.page === 7));
    const text = { ...source, pages: source.pages.map((p) => ({ ...p, page: null })) };
    expect(pageChunks(text, 1)[0].id).toBe(pageChunks(source, 1)[0].id);
    expect(pageChunks(source, 99)).toEqual([]);
  });
  it('uses the pinned excerpt even for a question with no lexical match and excludes unrelated history', async () => {
    const { state, course, pinned, chunk } = fixture();
    state.messages = [
      {
        id: 'old',
        courseId: course.id,
        role: 'assistant',
        content: 'HISTORY_PRIVATE_SENTINEL',
        createdAt: new Date().toISOString(),
      },
    ];
    const structured = vi.fn().mockResolvedValue({
      sourceAnswer: 'All or nothing.',
      generalAnswer: '',
      citationIds: [chunk.id],
    });
    const result = await answerFromSources(
      { structured, chat: vi.fn(), models: vi.fn() },
      state,
      course,
      'Объясни это',
      { kind: 'none' },
      'mixed',
      pinned,
    );
    const prompt = JSON.stringify(structured.mock.calls[0][0]);
    expect(prompt).toContain(pinned.excerpt);
    expect(prompt).not.toContain('OTHER_PAGE_PRIVATE_SENTINEL');
    expect(prompt).not.toContain('HISTORY_PRIVATE_SENTINEL');
    expect(result.citations[0].page).toBe(7);
  });
  it('rejects changed, deleted or cross-workspace context before invoking a model', async () => {
    const { state, course, pinned } = fixture();
    const provider = { structured: vi.fn(), chat: vi.fn(), models: vi.fn() };
    for (const candidate of [
      { ...pinned, excerpt: 'changed' },
      { ...pinned, sourceId: 'deleted' },
      { ...pinned, workspaceId: 'other' },
    ]) {
      expect(() => resolvePinnedSource(state, candidate)).toThrow();
      await expect(
        answerFromSources(
          provider,
          state,
          course,
          'Explain',
          { kind: 'all' },
          'sources-only',
          candidate,
        ),
      ).rejects.toThrow();
    }
    expect(provider.structured).not.toHaveBeenCalled();
  });
  it('restores an unanswered contextual question, but never a completed one or another course', () => {
    const { state, course, pinned } = fixture();
    state.messages = [
      messageSchema.parse({
        id: 'question',
        courseId: course.id,
        role: 'user',
        content: 'Explain',
        pinnedSource: pinned,
        createdAt: new Date().toISOString(),
      }),
    ];
    expect(restoreTutorDraft(state, course.id)).toMatchObject({
      question: 'Explain',
      pinned,
      retryMessageId: 'question',
    });
    expect(restoreTutorDraft(state, 'other').pinned).toBeUndefined();
    state.messages.push(
      messageSchema.parse({
        id: 'answer',
        courseId: course.id,
        role: 'assistant',
        content: 'All or nothing',
        replyTo: 'question',
        createdAt: new Date().toISOString(),
      }),
    );
    expect(restoreTutorDraft(state, course.id).question).toBe('');
    expect(validateWorkspace(state).messages[0].pinnedSource).toEqual(pinned);
    state.messages[0].pinnedSource!.workspaceId = 'foreign';
    expect(() => validateWorkspace(state)).toThrow(/boundaries/);
  });
  it('keeps the maximum mixed answer within the persisted message limit', async () => {
    const { state, course, chunk } = fixture();
    const structured = vi.fn(async (_messages, schema) =>
      schema.parse({
        sourceAnswer: 'a'.repeat(9000),
        generalAnswer: 'b'.repeat(9000),
        citationIds: [chunk.id],
      }),
    );
    const result = await answerFromSources(
      { structured, chat: vi.fn(), models: vi.fn() },
      state,
      course,
      'Atomicity',
      { kind: 'all' },
      'mixed',
    );
    expect(
      messageSchema.safeParse({
        id: 'answer',
        courseId: course.id,
        role: 'assistant',
        content: result.content,
        createdAt: new Date().toISOString(),
      }).success,
    ).toBe(true);
  });
});

it.skipIf(process.env.OLLAMA_INTEGRATION !== '1')(
  'real local model answers a pinned fragment without a lexical match',
  async () => {
    const { state, course, pinned } = fixture();
    const originalFetch = globalThis.fetch;
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((input, init) =>
        originalFetch(
          typeof input === 'string' && input.startsWith('/ollama/')
            ? `http://127.0.0.1:11434${input.slice(7)}`
            : input,
          init,
        ),
      );
    try {
      const result = await answerFromSources(
        new OllamaProvider('http://127.0.0.1:11434', 'qwen3:4b'),
        state,
        course,
        'Объясни это простыми словами в двух предложениях.',
        { kind: 'none' },
        'sources-only',
        pinned,
      );
      expect(result.citations).toHaveLength(1);
      expect(result.citations[0]).toMatchObject({
        sourceId: pinned.sourceId,
        page: 7,
        excerpt: pinned.excerpt,
      });
      expect(result.content).not.toContain('General model knowledge');
    } finally {
      spy.mockRestore();
    }
  },
  610000,
);
