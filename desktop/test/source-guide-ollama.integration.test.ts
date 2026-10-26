import { expect, it, vi } from 'vitest';
import { emptyWorkspace } from '../src/types/state';
import { OllamaProvider } from '../src/ai/providers/ollama';
import { generateSourceGuide, saveSourceGuide } from '../src/ai/sourceGuide';
import { validateWorkspace } from '../src/db/repository';

it.skipIf(process.env.GUIDE_OLLAMA_INTEGRATION !== '1')(
  'real qwen3:4b produces a validated short-section guide with canonical evidence',
  async () => {
    const state = emptyWorkspace();
    const now = new Date().toISOString();
    state.libraries = [
      {
        id: 'smoke-library',
        workspaceId: state.activeWorkspaceId,
        name: 'Synthetic test',
        createdAt: now,
      },
    ];
    state.sources = [
      {
        id: 'smoke-guide',
        workspaceId: state.activeWorkspaceId,
        libraryIds: ['smoke-library'],
        courseIds: [],
        title: 'Synthetic transaction notes',
        type: 'pasted',
        importedAt: now,
        tags: [],
        pages: [
          {
            page: 7,
            text: "A database transaction is a group of operations treated as one unit. Atomicity means that either all operations are committed or none of them are applied. A rollback cancels the changes of a failed transaction. Isolation keeps concurrent transactions from observing each other's uncommitted changes. These rules help prevent partially applied updates and inconsistent reads.",
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
      const draft = await generateSourceGuide(
        new OllamaProvider('http://127.0.0.1:11434', 'qwen3:4b'),
        state,
        {
          sourceId: 'smoke-guide',
          workspaceId: state.activeWorkspaceId,
          startIndex: 0,
          endIndex: 0,
          outputLanguage: 'Russian',
        },
      );
      expect(draft.guide.result.points).toHaveLength(3);
      expect(draft.guide.result.terms).toHaveLength(3);
      expect(draft.guide.result.questions).toHaveLength(3);
      expect(draft.guide.citations[0]).toMatchObject({
        sourceId: 'smoke-guide',
        page: 7,
        excerpt: state.sources[0].pages[0].text,
      });
      expect(draft.guide.result.points.map((p) => p.text).join('\n')).toMatch(
        /\p{Script=Cyrillic}/u,
      );
      expect(validateWorkspace(saveSourceGuide(state, draft)).sources[0].guide).toEqual(
        draft.guide,
      );
      expect(state.messages).toHaveLength(0);
    } finally {
      spy.mockRestore();
    }
  },
  610000,
);
