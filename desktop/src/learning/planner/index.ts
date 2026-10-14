import type { Workspace } from '../../types/state';
import { topicMastery } from '../mastery';
import { frontier } from '../conceptloom';

export const dayKey = (value: string | Date) => new Date(value).toLocaleDateString('en-CA');
export function statistics(state: Workspace, now = new Date()) {
  const attempts = state.attempts;
  const days = new Set([
    ...attempts.map((a) => dayKey(a.createdAt)),
    ...state.reviews.map((r) => dayKey(r.createdAt)),
  ]);
  let streak = 0;
  const date = new Date(now);
  if (!days.has(dayKey(date))) date.setDate(date.getDate() - 1);
  while (days.has(dayKey(date))) {
    streak++;
    date.setDate(date.getDate() - 1);
  }
  const week = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(now);
    date.setDate(date.getDate() - 6 + i);
    const key = dayKey(date);
    const daily = attempts.filter((a) => dayKey(a.createdAt) === key);
    return {
      key,
      label: date.toLocaleDateString(undefined, { weekday: 'short' }),
      minutes: Math.round(daily.reduce((sum, a) => sum + a.elapsedSeconds, 0) / 60),
      count: daily.length + state.reviews.filter((r) => dayKey(r.createdAt) === key).length,
    };
  });
  return {
    streak,
    week,
    accuracy: attempts.length
      ? Math.round((100 * attempts.filter((a) => a.accurate).length) / attempts.length)
      : 0,
    learned: state.topics.filter((t) => topicMastery(state, t.id) > 20).length,
    mastered: state.topics.filter((t) => topicMastery(state, t.id) >= 81).length,
    due: state.cards.filter((c) => new Date(c.due) <= now).length,
    minutes: Math.round(attempts.reduce((sum, a) => sum + a.elapsedSeconds, 0) / 60),
    lessonsCompleted: state.lessons.filter((l) =>
      l.content.exercises.every((e) =>
        state.attempts.some((a) => a.topicId === l.topicId && a.exerciseId === e.id && a.accurate),
      ),
    ).length,
  };
}
export function todayPlan(state: Workspace) {
  return state.courses.flatMap((course) =>
    frontier(state, course.id)
      .slice(0, 1)
      .map((topic) => ({ course, topic })),
  );
}
