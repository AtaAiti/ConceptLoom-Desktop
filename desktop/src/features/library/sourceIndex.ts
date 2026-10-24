import { invoke, isTauri } from '@tauri-apps/api/core';
import { z } from 'zod';
import {
  chunkSchema,
  type Source,
  type SourceChunk,
  type SourceScope,
  type SourceCitation,
  type PinnedSource,
} from '../../types/sources';
import type { Workspace } from '../../types/state';

export function chunkSource(source: Source): SourceChunk[] {
  const chunks: SourceChunk[] = [];
  for (const page of source.pages) {
    const chars = Array.from(page.text);
    for (let start = 0; start < chars.length;) {
      let end = Math.min(start + 1200, chars.length);
      if (end < chars.length) {
        for (let i = end - 1; i >= start + 600; i--)
          if (chars[i] === '\n' || chars[i] === ' ') {
            end = i + 1;
            break;
          }
      }
      const text = chars.slice(start, end).join('').trim();
      if (text)
        chunks.push({
          id: `${source.id}:${chunks.length}`,
          workspaceId: source.workspaceId,
          sourceId: source.id,
          text,
          page: page.page,
          section: page.section,
          position: chunks.length,
        });
      start = end;
    }
  }
  return chunks;
}
export function selectedSources(state: Workspace, scope: SourceScope): Source[] {
  return state.sources.filter(
    (s) =>
      s.workspaceId === state.activeWorkspaceId &&
      (scope.kind === 'all' ||
        (scope.kind === 'library' && s.libraryIds.includes(scope.libraryId)) ||
        (scope.kind === 'selected' && scope.sourceIds.includes(s.id))),
  );
}
export function pageChunks(source: Source, index: number): SourceChunk[] {
  const page = source.pages[index];
  if (!page) return [];
  const offset = chunkSource({ ...source, pages: source.pages.slice(0, index) }).length;
  return chunkSource({ ...source, pages: [page] }).map((chunk, position) => ({
    ...chunk,
    id: `${source.id}:${offset + position}`,
    position: offset + position,
  }));
}
export function resolvePinnedSource(state: Workspace, pinned: PinnedSource): SourceChunk {
  if (pinned.workspaceId !== state.activeWorkspaceId)
    throw new Error('Этот фрагмент относится к другому пространству. Выберите источник заново.');
  const source = state.sources.find(
    (s) => s.id === pinned.sourceId && s.workspaceId === pinned.workspaceId,
  );
  const chunk = source && chunkSource(source).find((c) => c.id === pinned.chunkId);
  if (!chunk || chunk.text !== pinned.excerpt || chunk.page !== pinned.page)
    throw new Error(
      'Источник удалён или фрагмент изменился. Выберите фрагмент заново в источниках.',
    );
  return chunk;
}
export interface SourceIndexService {
  search(state: Workspace, scope: SourceScope, query: string): Promise<SourceChunk[]>;
}
export function lexicalSearch(sources: Source[], query: string): SourceChunk[] {
  const words = [...new Set(query.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])].slice(0, 24);
  return sources
    .flatMap(chunkSource)
    .map((chunk) => ({
      chunk,
      score: words.reduce(
        (sum, w) => sum + (chunk.text.toLocaleLowerCase().includes(w) ? 1 : 0),
        0,
      ),
    }))
    .filter((v) => v.score > 0)
    .sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id))
    .slice(0, 6)
    .map((v) => v.chunk);
}
export const sourceIndex: SourceIndexService = {
  async search(state, scope, query) {
    const sources = selectedSources(state, scope);
    if (!sources.length) return [];
    if (!isTauri()) return lexicalSearch(sources, query);
    return z.array(chunkSchema).parse(
      await invoke('search_sources', {
        workspaceId: state.activeWorkspaceId,
        sourceIds: sources.map((s) => s.id),
        query,
      }),
    );
  },
};
export function resolveCitations(
  ids: string[],
  chunks: SourceChunk[],
  sources: Source[],
): SourceCitation[] {
  return [...new Set(ids)].map((id) => {
    const chunk = chunks.find((c) => c.id === id);
    const source = sources.find(
      (s) => s.id === chunk?.sourceId && s.workspaceId === chunk.workspaceId,
    );
    if (!chunk || !source)
      throw new Error('The model cited a source it was not given. Retry generation.');
    return {
      chunkId: chunk.id,
      sourceId: source.id,
      title: source.title,
      page: chunk.page,
      excerpt: chunk.text,
    };
  });
}
