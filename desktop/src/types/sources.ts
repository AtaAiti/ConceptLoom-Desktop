import { z } from 'zod';

const id = z.string().min(1).max(200);
export const workspaceInfoSchema = z.object({
  id,
  name: z.string().trim().min(1).max(100),
  description: z.string().max(2000),
  goal: z.string().max(2000),
  icon: z.string().max(8),
  accent: z.enum(['violet', 'mint', 'blue', 'amber']),
  pinned: z.boolean(),
  archived: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  lastOpenedAt: z.iso.datetime(),
});
export type WorkspaceInfo = z.infer<typeof workspaceInfoSchema>;
export const librarySchema = z.object({
  id,
  workspaceId: id,
  name: z.string().trim().min(1).max(100),
  createdAt: z.iso.datetime(),
});
export const sourcePageSchema = z.object({
  page: z.number().int().positive().nullable(),
  section: z.string().max(300).optional(),
  text: z.string().max(1000000),
});
// Citations are app-resolved snapshots, never model-authored titles or page numbers.
export const citationSchema = z.object({
  chunkId: id,
  sourceId: id,
  title: z.string(),
  page: z.number().int().positive().nullable(),
  excerpt: z.string().max(2400),
});
export type SourceCitation = z.infer<typeof citationSchema>;
const guideText = z.string().trim().min(1).max(700);
const guideRefs = z.array(id).min(1).max(6);
export const sourceGuideResultSchema = z.object({
  points: z.array(z.object({ text: guideText, citationIds: guideRefs })).length(3),
  terms: z
    .array(
      z.object({
        term: z.string().trim().min(1).max(100),
        definition: guideText,
        citationIds: guideRefs,
      }),
    )
    .length(3),
  questions: z
    .array(z.object({ text: guideText.max(300), citationIds: z.array(id).length(1) }))
    .length(3),
});
export const sourceGuideSchema = z
  .object({
    sourceId: id,
    workspaceId: id,
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
    startIndex: z.number().int().min(0).max(299),
    endIndex: z.number().int().min(0).max(299),
    coveredPages: z
      .array(
        z.object({
          pageIndex: z.number().int().min(0).max(299),
          page: z.number().int().positive().nullable(),
        }),
      )
      .min(1)
      .max(5),
    chunkIds: z.array(id).min(1).max(6),
    outputLanguage: z.string().trim().min(1).max(100),
    provider: z.enum(['ollama', 'codex', 'claude', 'gemini']),
    model: z.string().min(1).max(200),
    promptVersion: z.string().min(1).max(100),
    createdAt: z.iso.datetime(),
    result: sourceGuideResultSchema,
    citations: z.array(citationSchema).min(1).max(6),
  })
  .superRefine((guide, ctx) => {
    const ids = new Set(guide.chunkIds);
    const items = [...guide.result.points, ...guide.result.terms, ...guide.result.questions];
    if (
      guide.endIndex - guide.startIndex + 1 !== guide.coveredPages.length ||
      guide.coveredPages.some((p, i) => p.pageIndex !== guide.startIndex + i) ||
      ids.size !== guide.chunkIds.length ||
      guide.citations.length !== ids.size ||
      new Set(guide.citations.map((c) => c.chunkId)).size !== ids.size ||
      guide.citations.some(
        (c) =>
          c.sourceId !== guide.sourceId ||
          !ids.has(c.chunkId) ||
          !guide.coveredPages.some((p) => p.page === c.page),
      ) ||
      items.some((item) => item.citationIds.some((id) => !ids.has(id)))
    )
      ctx.addIssue({ code: 'custom', message: 'Invalid source guide coverage or evidence.' });
  });
export type SourceGuide = z.infer<typeof sourceGuideSchema>;
export const sourceSchema = z.object({
  id,
  guide: sourceGuideSchema.optional(),
  workspaceId: id,
  libraryIds: z.array(id).min(1),
  courseIds: z.array(id),
  title: z.string().trim().min(1).max(200),
  type: z.enum(['pdf', 'txt', 'markdown', 'pasted']),
  originalFilename: z.string().max(300).optional(),
  size: z.number().nonnegative().optional(),
  importedAt: z.iso.datetime(),
  pageCount: z.number().int().nonnegative().optional(),
  pages: z.array(sourcePageSchema).min(1).max(300),
  tags: z.array(z.string().max(100)).max(30),
  author: z.string().max(200).optional(),
});
export type Source = z.infer<typeof sourceSchema>;
export type SourcePage = z.infer<typeof sourcePageSchema>;
export const chunkSchema = z.object({
  id,
  workspaceId: id,
  sourceId: id,
  text: z.string(),
  page: z.number().int().positive().nullable(),
  section: z.string().optional(),
  position: z.number().int().nonnegative(),
});
export type SourceChunk = z.infer<typeof chunkSchema>;
export const pinnedSourceSchema = citationSchema.extend({ workspaceId: id });
export type PinnedSource = z.infer<typeof pinnedSourceSchema>;
export const sourceScopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }),
  z.object({ kind: z.literal('all') }),
  z.object({ kind: z.literal('library'), libraryId: id }),
  z.object({ kind: z.literal('selected'), sourceIds: z.array(id) }),
]);
export type SourceScope = z.infer<typeof sourceScopeSchema>;
export type SourceMode = 'sources-only' | 'mixed';
export const defaultWorkspace = (): WorkspaceInfo => ({
  id: 'my-learning',
  name: 'My Learning',
  description: '',
  goal: '',
  icon: '✦',
  accent: 'violet',
  pinned: false,
  archived: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  lastOpenedAt: '2026-01-01T00:00:00.000Z',
});
