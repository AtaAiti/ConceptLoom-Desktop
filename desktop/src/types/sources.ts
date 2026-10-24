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
export const sourceSchema = z.object({
  id,
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
// Citations are app-resolved snapshots, never model-authored source titles or page numbers.
export const citationSchema = z.object({
  chunkId: id,
  sourceId: id,
  title: z.string(),
  page: z.number().int().positive().nullable(),
  excerpt: z.string().max(2400),
});
export type SourceCitation = z.infer<typeof citationSchema>;
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
