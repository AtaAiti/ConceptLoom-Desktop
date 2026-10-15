import type { Workspace } from '../types/state';
export const collections = [
  'workspaces',
  'libraries',
  'courses',
  'topics',
  'lessons',
  'sessions',
  'attempts',
  'cards',
  'reviews',
  'messages',
  'notes',
  'sources',
] as const;
export function changesBetween(before: Workspace, after: Workspace) {
  return {
    version: 2,
    activeWorkspaceId: after.activeWorkspaceId,
    settings:
      JSON.stringify(before.settings) === JSON.stringify(after.settings) ? null : after.settings,
    upserts: Object.fromEntries(
      collections.map((key) => {
        const old = new Map(before[key].map((v) => [v.id, JSON.stringify(v)]));
        return [key, after[key].filter((v) => old.get(v.id) !== JSON.stringify(v))];
      }),
    ),
    deletes: Object.fromEntries(
      collections.map((key) => {
        const ids = new Set(after[key].map((v) => v.id));
        return [key, before[key].filter((v) => !ids.has(v.id)).map((v) => v.id)];
      }),
    ),
  };
}
