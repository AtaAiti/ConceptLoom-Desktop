import type { Workspace } from '../../types/state';
import type { PinnedSource } from '../../types/sources';

export interface TutorDraft {
  id: string;
  question: string;
  pinned?: PinnedSource;
  retryMessageId?: string;
}
export function restoreTutorDraft(state: Workspace, courseId: string | undefined): TutorDraft {
  const pending = [...state.messages]
    .reverse()
    .find(
      (m) =>
        m.courseId === courseId &&
        m.role === 'user' &&
        m.pinnedSource &&
        !state.messages.some((reply) => reply.courseId === courseId && reply.replyTo === m.id),
    );
  return pending
    ? {
        id: pending.id,
        question: pending.content,
        pinned: pending.pinnedSource,
        retryMessageId: pending.id,
      }
    : { id: `empty:${state.activeWorkspaceId}:${courseId ?? ''}`, question: '' };
}
