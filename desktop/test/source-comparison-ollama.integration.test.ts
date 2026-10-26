import { expect, it, vi } from 'vitest';
import { emptyWorkspace } from '../src/types/state';
import { createCourse } from '../src/learning/courses';
import { OllamaProvider } from '../src/ai/providers/ollama';
import { generateSourceComparison, saveSourceComparison } from '../src/ai/sourceComparison';
import { lexicalSearch, selectedSources } from '../src/features/library/sourceIndex';
import { validateWorkspace } from '../src/db/repository';

it.skipIf(process.env.COMPARISON_OLLAMA_INTEGRATION !== '1')(
  'real qwen3:4b compares two concepts with independent canonical citations and Russian output',
  async () => {
    const state = emptyWorkspace(),
      now = new Date().toISOString();
    state.courses = [
      createCourse({
        name: 'Synthetic databases',
        goal: 'Understand',
        knowledge: '',
        currentLevel: 'Beginner',
        targetLevel: 'Apply',
        explanationLanguage: 'Russian',
      }),
    ];
    state.libraries = [
      {
        id: 'smoke-lib',
        workspaceId: state.activeWorkspaceId,
        name: 'Synthetic notes',
        createdAt: now,
      },
    ];
    state.sources = [
      {
        id: 'smoke-a',
        workspaceId: state.activeWorkspaceId,
        libraryIds: ['smoke-lib'],
        courseIds: [],
        title: 'Atomicity notes',
        type: 'pasted',
        importedAt: now,
        tags: [],
        pages: [
          {
            page: 7,
            text: 'Atomicity means a database transaction either commits all of its operations or applies none of them. A failed transaction rolls back all changes. This prevents partial updates, for example debiting one account without crediting the other in a transfer.',
          },
        ],
      },
      {
        id: 'smoke-b',
        workspaceId: state.activeWorkspaceId,
        libraryIds: ['smoke-lib'],
        courseIds: [],
        title: 'Isolation notes',
        type: 'pasted',
        importedAt: now,
        tags: [],
        pages: [
          {
            page: 18,
            text: "Isolation separates concurrent database transactions. It prevents one transaction from reading another transaction's uncommitted changes. Locks or versioned snapshots can enforce isolation. This matters when several users read and update the same records concurrently.",
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
      const draft = await generateSourceComparison(
        new OllamaProvider('http://127.0.0.1:11434', 'qwen3:4b'),
        state,
        {
          workspaceId: state.activeWorkspaceId,
          courseId: state.courses[0].id,
          a: 'Atomicity',
          b: 'Isolation',
          sourceIds: ['smoke-a', 'smoke-b'],
        },
        { search: async (s, scope, query) => lexicalSearch(selectedSources(s, scope), query) },
      );
      expect(draft.result.rows).toHaveLength(3);
      expect(draft.result.rows.some((r) => r.a.text !== null)).toBe(true);
      expect(draft.result.rows.some((r) => r.b.text !== null)).toBe(true);
      expect(draft.citations.map((c) => c.sourceId).sort()).toEqual(['smoke-a', 'smoke-b']);
      expect(draft.result.rows.map((r) => `${r.a.text} ${r.b.text}`).join('\n')).toMatch(
        /\p{Script=Cyrillic}/u,
      );
      expect(validateWorkspace(saveSourceComparison(state, draft)).messages).toHaveLength(2);
      expect(state.cards).toHaveLength(0);
    } finally {
      spy.mockRestore();
    }
  },
  610000,
);
