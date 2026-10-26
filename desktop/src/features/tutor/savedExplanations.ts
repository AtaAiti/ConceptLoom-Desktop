import type { Workspace } from '../../types/state';
import { resolvePinnedSource } from '../library/sourceIndex';

export type TutorMessage = Workspace['messages'][number];
export interface ExplanationTarget {
  workspaceId: string;
  courseId: string;
  messageId: string;
}

export function savedExplanations(state: Workspace): TutorMessage[] {
  const courses = new Set(
    state.courses.filter((c) => c.workspaceId === state.activeWorkspaceId).map((c) => c.id),
  );
  return state.messages
    .filter((m) => m.role === 'assistant' && m.savedAt && courses.has(m.courseId))
    .sort((a, b) => b.savedAt!.localeCompare(a.savedAt!) || a.id.localeCompare(b.id));
}

/** Resolve against the latest committed state; never restore a deleted/stale message object. */
export function setExplanationSaved(
  state: Workspace,
  target: ExplanationTarget,
  saved: boolean,
  now = new Date().toISOString(),
): Workspace {
  const course = state.courses.find((c) => c.id === target.courseId);
  const message = state.messages.find(
    (m) => m.id === target.messageId && m.courseId === target.courseId && m.role === 'assistant',
  );
  if (
    target.workspaceId !== state.activeWorkspaceId ||
    course?.workspaceId !== target.workspaceId ||
    !message
  )
    throw new Error('Объяснение больше недоступно в этом пространстве. Откройте список заново.');
  if (!!message.savedAt === saved) return state;
  const { savedAt: _savedAt, ...unsaved } = message;
  const next = saved ? { ...message, savedAt: now } : unsaved;
  return { ...state, messages: state.messages.map((m) => (m.id === message.id ? next : m)) };
}

export function hasChangedEvidence(state: Workspace, message: TutorMessage): boolean {
  return (message.citations ?? []).some((citation) => {
    try {
      resolvePinnedSource(state, { ...citation, workspaceId: state.activeWorkspaceId });
      return false;
    } catch {
      return true;
    }
  });
}
