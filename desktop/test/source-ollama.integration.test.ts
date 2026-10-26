import { expect, it, vi } from 'vitest';
import { emptyWorkspace } from '../src/types/state';
import { createCourse } from '../src/learning/courses';
import { OllamaProvider } from '../src/ai/providers/ollama';
import { answerFromSources } from '../src/ai/sourceLearning';

it.skipIf(process.env.OLLAMA_INTEGRATION !== '1')(
  'real qwen3:4b answers with a validated local source citation',
  async () => {
    const state = emptyWorkspace();
    const course = createCourse({
      name: 'Databases',
      goal: 'Understand transactions',
      knowledge: 'Tables',
      currentLevel: 'Beginner',
      targetLevel: 'Apply',
      explanationLanguage: 'Russian',
    });
    state.courses = [course];
    state.sources = [
      {
        id: 'source-test',
        workspaceId: 'my-learning',
        title: 'Transaction notes',
        type: 'pasted',
        libraryIds: ['test-library'],
        courseIds: [],
        tags: [],
        importedAt: new Date().toISOString(),
        pages: [
          {
            page: 4,
            text: 'Atomicity: a transaction either completes all its operations or applies none of them. A failed transaction is rolled back.',
          },
        ],
      },
    ];
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
      const answer = await answerFromSources(
        new OllamaProvider('http://127.0.0.1:11434', 'qwen3:4b'),
        state,
        course,
        'Explain atomicity in one short sentence.',
        { kind: 'all' },
        'sources-only',
      );
      expect(answer.content).toContain('From your sources');
      expect(answer.citations[0].sourceId).toBe('source-test');
      expect(answer.citations[0].page).toBe(4);
      expect(answer.content).not.toContain('General model knowledge');
    } finally {
      spy.mockRestore();
    }
  },
  610000,
);
