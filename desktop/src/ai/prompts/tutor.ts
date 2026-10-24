import type { Course, Topic, Workspace } from '../../types/state';
import { topicMastery } from '../../learning/mastery';
export function tutorContext(state: Workspace, course: Course, topic?: Topic): string {
  const topics = state.topics.filter((t) => t.courseId === course.id);
  const selected = topics.find((t) => t.id === topic?.id);
  return JSON.stringify({
    currentTopic: selected?.title,
    currentConcept: selected && {
      id: selected.id,
      description: selected.description.slice(0, 1200),
      prerequisiteCount: selected.dependsOn.length,
      prerequisites: selected.dependsOn.slice(0, 24).map((id) => {
        const prerequisite = topics.find((t) => t.id === id);
        return {
          id,
          title: prerequisite?.title,
          description: prerequisite?.description.slice(0, 400),
          mastery: topicMastery(state, id),
        };
      }),
    },
    goal: course.goal,
    concepts: topics
      .slice(0, 24)
      .map((t) => ({ title: t.title, mastery: topicMastery(state, t.id) })),
    recentMistakes: state.attempts
      .filter((a) => a.courseId === course.id && !a.accurate)
      .slice(-10)
      .map((a) => ({
        topic: topics.find((t) => t.id === a.topicId)?.title,
        response: a.response.slice(0, 400),
        feedback: a.feedback.slice(0, 400),
        confidence: a.confidence,
      })),
    dueReviews: state.cards
      .filter((c) => c.courseId === course.id && new Date(c.due) <= new Date())
      .slice(0, 10)
      .map((c) => c.front.slice(0, 200)),
    resumePoint: state.sessions.find((s) => s.courseId === course.id)?.nextStep,
  });
}
