import type { Workspace } from '../types/state';

export const courseCollections = [
  'topics',
  'lessons',
  'attempts',
  'cards',
  'reviews',
  'messages',
  'notes',
  'sessions',
] as const;
/** A view and commit both capture the same workspace ID, including after an async AI reply. */
export function workspaceView(state: Workspace, workspaceId: string): Workspace {
  const courses = state.courses.filter((c) => c.workspaceId === workspaceId);
  const ids = new Set(courses.map((c) => c.id));
  return {
    ...state,
    activeWorkspaceId: workspaceId,
    courses,
    libraries: state.libraries.filter((l) => l.workspaceId === workspaceId),
    sources: state.sources.filter((s) => s.workspaceId === workspaceId),
    ...Object.fromEntries(
      courseCollections.map((key) => [key, state[key].filter((v) => ids.has(v.courseId))]),
    ),
  };
}
export function mergeWorkspace(
  state: Workspace,
  workspaceId: string,
  change: (view: Workspace) => Workspace,
): Workspace {
  if (!state.workspaces.some((w) => w.id === workspaceId && !w.archived))
    throw new Error('This workspace is no longer active.');
  const view = workspaceView(state, workspaceId);
  const next = change(view);
  const nextCourseIds = new Set(next.courses.map((c) => c.id));
  if (courseCollections.some((key) => next[key].some((v) => !nextCourseIds.has(v.courseId))))
    throw new Error('Cannot write outside this workspace.');
  if (
    next.courses.some((c) => c.workspaceId !== workspaceId) ||
    next.sources.some((s) => s.workspaceId !== workspaceId) ||
    next.libraries.some((l) => l.workspaceId !== workspaceId)
  )
    throw new Error('Cannot write outside this workspace.');
  const owned = new Set(view.courses.map((c) => c.id));
  return {
    ...state,
    settings: next.settings,
    courses: [...state.courses.filter((c) => c.workspaceId !== workspaceId), ...next.courses],
    libraries: [...state.libraries.filter((l) => l.workspaceId !== workspaceId), ...next.libraries],
    sources: [...state.sources.filter((s) => s.workspaceId !== workspaceId), ...next.sources],
    ...Object.fromEntries(
      courseCollections.map((key) => [
        key,
        [...state[key].filter((v) => !owned.has(v.courseId)), ...next[key]],
      ]),
    ),
  };
}
export function removeWorkspace(state: Workspace, id: string): Workspace {
  const remaining = state.workspaces.filter((w) => w.id !== id);
  const active = remaining.find((w) => !w.archived);
  if (!active) throw new Error('Keep at least one active workspace.');
  const removed = new Set(state.courses.filter((c) => c.workspaceId === id).map((c) => c.id));
  return {
    ...state,
    workspaces: remaining,
    activeWorkspaceId: state.activeWorkspaceId === id ? active.id : state.activeWorkspaceId,
    courses: state.courses.filter((c) => !removed.has(c.id)),
    libraries: state.libraries.filter((l) => l.workspaceId !== id),
    sources: state.sources.filter((s) => s.workspaceId !== id),
    ...Object.fromEntries(
      courseCollections.map((key) => [key, state[key].filter((v) => !removed.has(v.courseId))]),
    ),
  };
}
