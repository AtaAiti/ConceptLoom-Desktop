import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { emptyWorkspace } from '../src/types/state';
import { defaultWorkspace, sourceGuideSchema } from '../src/types/sources';
import {
  generateSourceGuide,
  guideResponseSchema,
  guideMatches,
  prepareGuideSection,
  saveSourceGuide,
  sourceFingerprint,
} from '../src/ai/sourceGuide';
import type { AIProvider, AIMessage } from '../src/ai/providers/types';
import { validateWorkspace } from '../src/db/repository';
import { changesBetween } from '../src/db/changes';
import { mergeWorkspace, workspaceView } from '../src/db/workspaces';

function fixture() {
  const state = emptyWorkspace();
  state.workspaces.push({ ...defaultWorkspace(), id: 'other' });
  state.libraries = [
    {
      id: 'lib',
      workspaceId: state.activeWorkspaceId,
      name: 'Lectures',
      createdAt: new Date().toISOString(),
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
      importedAt: new Date().toISOString(),
      tags: [],
      pages: [
        { page: 1, text: 'PRIVATE_OUTSIDE_PAGE' },
        { page: 7, text: 'Атомарность — всё или ничего. '.repeat(60) + 'END_OF_LONG_PAGE' },
        { page: 8, text: 'Откат отменяет изменения. Изоляция отделяет транзакции.' },
      ],
    },
  ];
  return state;
}
const request = {
  sourceId: 's',
  workspaceId: 'my-learning',
  startIndex: 1,
  endIndex: 2,
  outputLanguage: 'Russian',
};
function result(id: string) {
  return {
    points: Array.from({ length: 3 }, (_, i) => ({ text: `Point ${i}`, citationIds: [id] })),
    terms: Array.from({ length: 3 }, (_, i) => ({
      term: `Term ${i}`,
      definition: `Definition ${i}`,
      citationIds: [id],
    })),
    questions: Array.from({ length: 3 }, (_, i) => ({ text: `Question ${i}?`, citationIds: [id] })),
  };
}
function model(transform = (value: ReturnType<typeof result>) => value) {
  const prompts: AIMessage[][] = [];
  const structured = vi.fn(async (messages: AIMessage[]) => {
    prompts.push(messages);
    const chunks = JSON.parse(
      messages
        .find((m) => m.content.startsWith('UNTRUSTED_SOURCE_DATA_JSON'))!
        .content.split('\n')[1],
    );
    return transform(result(chunks[0].chunkId));
  });
  return {
    provider: { structured, models: async () => [], chat: async () => '' } as unknown as AIProvider,
    structured,
    prompts,
  };
}
describe('source section guide', () => {
  it('constrains every citation field to the supplied IDs in decoding JSON schema and rejects unknown IDs', () => {
    const schema = guideResponseSchema(['s:1', 's:2']);
    expect(schema.safeParse(result('s:1')).success).toBe(true);
    expect(schema.safeParse(result('invented:0')).success).toBe(false);
    const json = z.toJSONSchema(schema, { io: 'input' }) as any;
    for (const field of ['points', 'terms', 'questions'])
      expect(json.properties[field].items.properties.citationIds.items.enum).toEqual([
        's:1',
        's:2',
      ]);
    expect(() => guideResponseSchema([])).toThrow('читаемых');
  });
  it('transmits every chosen chunk with original page/IDs, excludes outside data, and stores canonical citations', async () => {
    const state = fixture(),
      ai = model();
    const section = prepareGuideSection(state, request);
    expect(section.chunks.length).toBeGreaterThan(2);
    const draft = await generateSourceGuide(ai.provider, state, request);
    const payload = ai.prompts[0].find((m) =>
      m.content.startsWith('UNTRUSTED_SOURCE_DATA_JSON'),
    )!.content;
    expect(payload).toContain('END_OF_LONG_PAGE');
    expect(payload).not.toContain('PRIVATE_OUTSIDE_PAGE');
    const chunks = JSON.parse(payload.split('\n')[1]);
    expect(chunks.map((c: { text: string }) => c.text).join('')).toBe(
      section.chunks.map((c) => c.text).join(''),
    );
    expect(draft.guide.coveredPages).toEqual([
      { pageIndex: 1, page: 7 },
      { pageIndex: 2, page: 8 },
    ]);
    expect(draft.guide.chunkIds).toEqual(section.chunks.map((c) => c.id));
    expect(draft.guide.citations[0]).toMatchObject({
      sourceId: 's',
      page: 7,
      title: 'Lecture',
      excerpt: section.chunks[0].text,
    });
  });
  it('reuses persisted cache without inference, including normalized language; range/provider/model/version changes miss', async () => {
    const state = fixture(),
      ai = model();
    const draft = await generateSourceGuide(ai.provider, state, request);
    const saved = saveSourceGuide(state, draft);
    await generateSourceGuide(ai.provider, saved, { ...request, outputLanguage: ' russian ' });
    expect(ai.structured).toHaveBeenCalledTimes(1);
    const hash = draft.guide.sourceHash;
    expect(guideMatches(draft.guide, hash, { ...request, endIndex: 1 }, state.settings)).toBe(
      false,
    );
    expect(
      guideMatches(draft.guide, hash, { ...request, outputLanguage: 'English' }, state.settings),
    ).toBe(false);
    expect(
      guideMatches(draft.guide, hash, request, { ...state.settings, provider: 'claude' }),
    ).toBe(false);
    expect(
      guideMatches(draft.guide, hash, request, { ...state.settings, model: 'new-model' }),
    ).toBe(false);
    expect(
      guideMatches({ ...draft.guide, promptVersion: 'old' }, hash, request, state.settings),
    ).toBe(false);
  });
  it('hash covers all text, page numbering/order and sections, but ignores title and guide metadata', async () => {
    const source = fixture().sources[0],
      hash = await sourceFingerprint(source);
    expect(await sourceFingerprint({ ...source, title: 'Renamed' })).toBe(hash);
    for (const pages of [
      source.pages.map((p, i) => (i ? p : { ...p, text: 'changed outside section' })),
      [...source.pages].reverse(),
      source.pages.map((p) => ({ ...p, page: 100 })),
      source.pages.map((p) => ({ ...p, section: 'New' })),
    ])
      expect(await sourceFingerprint({ ...source, pages })).not.toBe(hash);
  });
  it('rejects oversized, blank, invalid and foreign ranges before any model call; never truncates silently', async () => {
    const ai = model();
    for (const invalid of [
      { startIndex: -1 },
      { startIndex: 1.2 },
      { endIndex: 300 },
      { startIndex: 2, endIndex: 1 },
      { workspaceId: 'other' },
      { sourceId: 'deleted' },
    ])
      await expect(
        generateSourceGuide(ai.provider, fixture(), { ...request, ...invalid }),
      ).rejects.toThrow();
    const state = fixture();
    state.sources[0].pages = Array.from({ length: 6 }, (_, i) => ({ page: i + 1, text: 'Valid' }));
    await expect(
      generateSourceGuide(ai.provider, state, { ...request, startIndex: 0, endIndex: 5 }),
    ).rejects.toThrow('пяти');
    state.sources[0].pages = [{ page: null, text: '🦫'.repeat(7201) }];
    await expect(
      generateSourceGuide(ai.provider, state, { ...request, startIndex: 0, endIndex: 0 }),
    ).rejects.toThrow('7 200');
    state.sources[0].pages = [{ page: 7, text: '   ' }];
    await expect(
      generateSourceGuide(ai.provider, state, { ...request, startIndex: 0, endIndex: 0 }),
    ).rejects.toThrow('читаемого текста');
    expect(ai.structured).not.toHaveBeenCalled();
  });
  it('rejects insufficient output, unknown references and multi-fragment questions', async () => {
    const transforms = [
      (r: ReturnType<typeof result>) => ({ ...r, points: [] }),
      (r: ReturnType<typeof result>) => ({
        ...r,
        questions: r.questions.map((q) => ({ ...q, citationIds: ['unknown'] })),
      }),
      (r: ReturnType<typeof result>) => ({
        ...r,
        questions: r.questions.map((q) => ({ ...q, citationIds: ['s:1', 's:2'] })),
      }),
    ];
    for (const transform of transforms) {
      const ai = model(transform as Parameters<typeof model>[0]);
      await expect(generateSourceGuide(ai.provider, fixture(), request)).rejects.toThrow();
    }
  });
  it('saves only source metadata, preserves later renames, is idempotent, and survives backup validation', async () => {
    const state = fixture(),
      draft = await generateSourceGuide(model().provider, state, request);
    const renamed = { ...state, sources: [{ ...state.sources[0], title: 'Renamed' }] };
    const saved = saveSourceGuide(renamed, draft);
    expect(saved.sources[0].title).toBe('Renamed');
    expect(saveSourceGuide(saved, draft)).toBe(saved);
    expect(validateWorkspace(JSON.parse(JSON.stringify(saved))).sources[0].guide).toEqual(
      draft.guide,
    );
    const patch = changesBetween(renamed, saved);
    expect(
      Object.entries(patch.upserts)
        .filter(([, rows]) => rows.length)
        .map(([name]) => name),
    ).toEqual(['sources']);
    for (const key of [
      'cards',
      'topics',
      'messages',
      'lessons',
      'reviews',
      'attempts',
      'sessions',
    ] as const)
      expect(saved[key]).toBe(state[key]);
  });
  it('refuses save after source edit/deletion or workspace change and retains stale historical coverage on import', async () => {
    const state = fixture(),
      draft = await generateSourceGuide(model().provider, state, request);
    expect(() => saveSourceGuide({ ...state, sources: [] }, draft)).toThrow('удалён');
    expect(() => saveSourceGuide({ ...state, activeWorkspaceId: 'other' }, draft)).toThrow();
    state.sources[0].pages = [{ page: null, text: 'Replacement' }];
    expect(() => saveSourceGuide(state, draft)).toThrow('изменился');
    state.sources[0].guide = draft.guide;
    expect(validateWorkspace(state).sources[0].guide?.coveredPages).toHaveLength(2);
    expect(
      guideMatches(draft.guide, await sourceFingerprint(state.sources[0]), request, state.settings),
    ).toBe(false);
  });
  it('scoped queued save stays in its original workspace and never enters the destination workspace', async () => {
    const state = fixture(),
      draft = await generateSourceGuide(model().provider, state, request);
    const latest = { ...state, activeWorkspaceId: 'other' };
    const merged = mergeWorkspace(latest, state.activeWorkspaceId, (view) =>
      saveSourceGuide(view, draft),
    );
    expect(merged.activeWorkspaceId).toBe('other');
    expect(merged.sources[0].guide).toEqual(draft.guide);
    expect(workspaceView(merged, 'other').sources).toHaveLength(0);
  });
  it('rejects forged guide ownership, coverage gaps, duplicate or missing evidence in backups', async () => {
    const state = fixture(),
      draft = await generateSourceGuide(model().provider, state, request);
    for (const guide of [
      { ...draft.guide, coveredPages: draft.guide.coveredPages.slice(1) },
      { ...draft.guide, chunkIds: [draft.guide.chunkIds[0], draft.guide.chunkIds[0]] },
      { ...draft.guide, citations: [] },
    ])
      expect(sourceGuideSchema.safeParse(guide).success).toBe(false);
    const saved = saveSourceGuide(state, draft);
    saved.sources[0].guide!.workspaceId = 'other';
    expect(() => validateWorkspace(saved)).toThrow('boundaries');
  });
});
