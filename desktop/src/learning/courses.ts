import { courseSchema, type Course, type Topic, type Workspace } from '../types/state';
import { validateMap } from './conceptloom';

export function createCourse(input: Omit<Course, 'id' | 'createdAt'>): Course {
  return courseSchema.parse({
    ...input,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  });
}
export function initialTopics(course: Course): Topic[] {
  const names =
    course.targetLanguage.toLowerCase() === 'korean'
      ? [
          'Hangul',
          'Sentence order',
          '은/는 · Topic particles',
          '이/가 · Subject particles',
          '을/를 · Object particles',
          '아요 / 어요 · Polite speech',
          'Past tense',
          'Negation',
          'Questions',
          'Everyday conversation',
        ]
      : course.targetLanguage.toLowerCase() === 'english'
        ? [
            'Sentence foundations',
            'Present and past',
            'Present perfect',
            'Past simple vs. present perfect',
            'Expressing opinions',
            'Connected conversation',
          ]
        : [];
  const topics: Topic[] = [];
  names.forEach((title, i) =>
    topics.push({
      id: crypto.randomUUID(),
      courseId: course.id,
      title,
      description: 'Assess this connection before advancing.',
      dependsOn: i ? [topics[i - 1].id] : [],
      approved: true,
    }),
  );
  validateMap(topics);
  return topics;
}
export function deleteCourse(state: Workspace, courseId: string): Workspace {
  return {
    ...state,
    courses: state.courses.filter((c) => c.id !== courseId),
    topics: state.topics.filter((t) => t.courseId !== courseId),
    lessons: state.lessons.filter((t) => t.courseId !== courseId),
    attempts: state.attempts.filter((t) => t.courseId !== courseId),
    cards: state.cards.filter((t) => t.courseId !== courseId),
    reviews: state.reviews.filter((t) => t.courseId !== courseId),
    messages: state.messages.filter((t) => t.courseId !== courseId),
    notes: state.notes.filter((t) => t.courseId !== courseId),
    sessions: state.sessions.filter((t) => t.courseId !== courseId),
  };
}
