import type { Exercise, LessonContent, Topic, Workspace } from '../../types/state';
import { topicMastery } from '../mastery';

export const phases = [
  { name: 'Locate', detail: 'Find the edge of what you know.' },
  { name: 'Weave', detail: 'Connect the smallest path to your goal.' },
  { name: 'Build', detail: 'Learn one connection. Retrieve it. Apply it.' },
] as const;

export function validateMap(topics: Topic[]): void {
  const byId = new Map(topics.map((t) => [t.id, t]));
  if (byId.size !== topics.length) throw new Error('Every concept needs a unique ID.');
  const active = new Set<string>();
  const visited = new Set<string>();
  function visit(id: string) {
    if (active.has(id)) throw new Error('Dependencies must not form a cycle.');
    if (visited.has(id)) return;
    const topic = byId.get(id);
    if (!topic) throw new Error('A prerequisite is missing from this map.');
    active.add(id);
    for (const dependency of topic.dependsOn) {
      if (byId.get(dependency)?.courseId !== topic.courseId)
        throw new Error('Prerequisites must belong to the same course.');
      visit(dependency);
    }
    active.delete(id);
    visited.add(id);
  }
  topics.forEach((t) => visit(t.id));
}
export function topicStatus(
  state: Workspace,
  topic: Topic,
): 'locked' | 'available' | 'learning' | 'reviewing' | 'mastered' {
  if (!topic.approved || topic.dependsOn.some((id) => topicMastery(state, id) < 61))
    return 'locked';
  const score = topicMastery(state, topic.id);
  if (
    state.cards.some((c) => c.topicId === topic.id && c.reps > 0 && new Date(c.due) <= new Date())
  )
    return 'reviewing';
  if (score >= 81) return 'mastered';
  return state.attempts.some((a) => a.topicId === topic.id) ? 'learning' : 'available';
}
export function frontier(state: Workspace, courseId: string): Topic[] {
  return state.topics.filter(
    (t) =>
      t.courseId === courseId &&
      ['available', 'learning', 'reviewing'].includes(topicStatus(state, t)),
  );
}
const normalize = (value: string) =>
  value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
export function gradeExact(exercise: Exercise, response: string): boolean | null {
  if (['explain-grammar', 'free-response'].includes(exercise.type)) return null;
  const exact = exercise.answers.some((a) => normalize(a) === normalize(response));
  return exercise.type === 'translate' && !exact ? null : exact;
}
export function prepareLesson(content: LessonContent, random = Math.random): LessonContent {
  return {
    ...content,
    exercises: content.exercises.map((exercise) => {
      const options = [...exercise.options];
      for (let i = options.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [options[i], options[j]] = [options[j], options[i]];
      }
      return { ...exercise, options };
    }),
  };
}
// Adapted from checkpoints.mjs: answer material is kept out of the public card.
export function publicExercise(exercise: Exercise) {
  return {
    id: exercise.id,
    type: exercise.type,
    dimension: exercise.dimension,
    prompt: exercise.prompt,
    options: exercise.options,
  };
}
