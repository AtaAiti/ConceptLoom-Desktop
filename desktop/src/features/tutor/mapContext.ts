import type { Topic, Workspace } from '../../types/state';
import type { SourceScope } from '../../types/sources';
import { resolvePinnedSource, selectedSources } from '../library/sourceIndex';

export type MapQuestion = 'connection' | 'example';
export const mapTutorInstruction =
  'Focus on the selected concept and its configured prerequisites. Graph links are a learning plan, not proof from sources. Explain why prior knowledge helps; do not claim a link is source-supported unless supplied passages support it. Do not treat asking for an explanation as demonstrated mastery.';

export function resolveTutorTopic(state: Workspace, courseId: string, topicId: string): Topic {
  const course = state.courses.find(
    (c) => c.id === courseId && c.workspaceId === state.activeWorkspaceId,
  );
  const topic = state.topics.find((t) => t.id === topicId && t.courseId === course?.id);
  if (!topic)
    throw new Error(
      'Понятие больше недоступно в этом направлении. Выберите узел карты заново или уберите контекст.',
    );
  return topic;
}

export function mapQuestion(topic: Topic, kind: MapQuestion): string {
  return kind === 'example'
    ? `Объясни понятие «${topic.title}» на простом примере. Покажи, как в примере используются его предпосылки, и задай один вопрос для проверки понимания.`
    : topic.dependsOn.length
      ? `Почему понятие «${topic.title}» связано с указанными предпосылками? Объясни, зачем они нужны, и задай один вопрос для проверки понимания.`
      : `Объясни понятие «${topic.title}»: с чего начать и как оно помогает достичь моей цели? Задай один вопрос для проверки понимания.`;
}

/** Topic evidence can supplement retrieval only within the learner's existing source scope. */
export function mapSourceChunks(
  state: Workspace,
  courseId: string,
  topicId: string,
  scope: SourceScope,
) {
  const topic = resolveTutorTopic(state, courseId, topicId);
  const allowed = new Set(selectedSources(state, scope).map((s) => s.id));
  return (topic.citations ?? [])
    .filter((c) => allowed.has(c.sourceId))
    .slice(0, 6)
    .map((c) => resolvePinnedSource(state, { ...c, workspaceId: state.activeWorkspaceId }));
}
