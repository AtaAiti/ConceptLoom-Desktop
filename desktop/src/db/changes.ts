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
// original is the immutable next snapshot before schema parsing cloned its records.
// Return validated records from after; identities only avoid comparing known unchanged data.
export function changesBetween(before: Workspace, after: Workspace, original = after) {
  return {
    version: 2,
    activeWorkspaceId: after.activeWorkspaceId,
    settings:
      before.settings === original.settings ||
      JSON.stringify(before.settings) === JSON.stringify(after.settings)
        ? null
        : after.settings,
    upserts: Object.fromEntries(
      collections.map((key) => {
        if (before[key] === original[key]) return [key, []];
        const old = new Map(before[key].map((v) => [v.id, v]));
        const raw = new Map(original[key].map((v) => [v.id, v]));
        return [
          key,
          after[key].filter((v) => {
            const previous = old.get(v.id);
            if (!previous) return true;
            if (previous === raw.get(v.id)) return false;
            return JSON.stringify(previous) !== JSON.stringify(v);
          }),
        ];
      }),
    ),
    deletes: Object.fromEntries(
      collections.map((key) => {
        if (before[key] === original[key]) return [key, []];
        const ids = new Set(after[key].map((v) => v.id));
        return [key, before[key].filter((v) => !ids.has(v.id)).map((v) => v.id)];
      }),
    ),
  };
}
