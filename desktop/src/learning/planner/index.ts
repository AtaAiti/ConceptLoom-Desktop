import type { Workspace } from '../../types/state';
import { topicMastery } from '../mastery';
import { frontier } from '../conceptloom';

export const dayKey = (value: string | Date) => new Date(value).toLocaleDateString('en-CA');
export function statistics(state: Workspace, now = new Date()) {
  const attempts = state.attempts;
  const activity = new Map<string, { seconds: number; count: number }>();
  for (const record of [...attempts, ...state.reviews]) {
    const key = dayKey(record.createdAt);
    const daily = activity.get(key) ?? { seconds: 0, count: 0 };
    daily.count++;
    if ('elapsedSeconds' in record) daily.seconds += record.elapsedSeconds;
    activity.set(key, daily);
  }
  const days = new Set(activity.keys());
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
    const daily = activity.get(key);
    return {
      key,
      label: date.toLocaleDateString(undefined, { weekday: 'short' }),
      minutes: Math.round((daily?.seconds ?? 0) / 60),
      count: daily?.count ?? 0,
    };
  });
  const scores = state.topics.map((t) => topicMastery(state, t.id));
  return {
    streak,
    week,
    accuracy: attempts.length
      ? Math.round((100 * attempts.filter((a) => a.accurate).length) / attempts.length)
      : 0,
    learned: scores.filter((score) => score > 20).length,
    mastered: scores.filter((score) => score >= 81).length,
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
