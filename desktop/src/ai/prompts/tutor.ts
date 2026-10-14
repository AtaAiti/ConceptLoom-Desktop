import type { Course, Topic, Workspace } from '../../types/state';
import { topicMastery } from '../../learning/mastery';
export function tutorContext(state: Workspace, course: Course, topic?: Topic): string {
  const topics = state.topics.filter((t) => t.courseId === course.id);
  return JSON.stringify({
    currentTopic: topic?.title,
    goal: course.goal,
    concepts: topics.map((t) => ({ title: t.title, mastery: topicMastery(state, t.id) })),
    recentMistakes: state.attempts
      .filter((a) => a.courseId === course.id && !a.accurate)
      .slice(-10)
      .map((a) => ({
        topic: topics.find((t) => t.id === a.topicId)?.title,
        response: a.response,
        feedback: a.feedback,
        confidence: a.confidence,
      })),
    dueReviews: state.cards
      .filter((c) => c.courseId === course.id && new Date(c.due) <= new Date())
      .map((c) => c.front),
    resumePoint: state.sessions.find((s) => s.courseId === course.id)?.nextStep,
    notes: state.notes
      .filter((n) => n.courseId === course.id)
      .slice(-3)
      .map((n) => ({ title: n.title, content: n.content.slice(0, 2500) })),
  });
}
