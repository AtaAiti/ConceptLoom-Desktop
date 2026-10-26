import type { Workspace } from '../../types/state';
import type { PinnedSource, SourceCitation } from '../../types/sources';
import { pageChunks, resolveCitations, resolvePinnedSource } from './sourceIndex';

export type SourceSelection =
  { sourceId: string; pageIndex: number } | { citation: SourceCitation };
export function sourceSelectionOptions(state: Workspace, value: SourceSelection): PinnedSource[] {
  if ('citation' in value) {
    const pinned = { ...value.citation, workspaceId: state.activeWorkspaceId };
    resolvePinnedSource(state, pinned);
    return [pinned];
  }
  const source = state.sources.find(
    (s) => s.id === value.sourceId && s.workspaceId === state.activeWorkspaceId,
  );
  if (!source) throw new Error('Источник больше не доступен. Выберите другой материал.');
  const chunks = pageChunks(source, value.pageIndex);
  return resolveCitations(
    chunks.map((c) => c.id),
    chunks,
    [source],
  ).map((c) => ({ ...c, workspaceId: state.activeWorkspaceId }));
}
