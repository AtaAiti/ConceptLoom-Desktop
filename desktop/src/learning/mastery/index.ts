import type { Attempt, Dimension, Workspace } from '../../types/state';

// Adapted from src/progress.mjs: recognition is provisional; hints and gaps matter.
const weights: Record<Dimension, number> = {
  recognition: 15,
  recall: 30,
  application: 30,
  transfer: 25,
};
export function mastery(attempts: Attempt[]): number {
  let score = 0;
  const chronological = [...attempts].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
  );
  for (const dimension of Object.keys(weights) as Dimension[]) {
    const recent = chronological.filter((a) => a.dimension === dimension).slice(-5);
    if (!recent.length) continue;
    const evidence = recent.reduce(
      (sum, a, i) => sum + (a.accurate ? (a.hintUsed ? 0.5 : 1) : 0) * (i + 1),
      0,
    );
    const possible = (recent.length * (recent.length + 1)) / 2;
    score += (weights[dimension] * evidence) / possible;
  }
  return Math.round(score);
}
export function topicMastery(state: Workspace, topicId: string): number {
  const attempts = state.attempts.filter((a) => a.topicId === topicId);
  // FSRS retrieval is recall evidence; negative reviews can lower this dimension.
  const reviews: Attempt[] = state.reviews
    .filter((r) => r.topicId === topicId)
    .map((r) => ({
      id: r.id,
      courseId: r.courseId,
      topicId,
      exerciseId: r.cardId,
      response: String(r.rating),
      dimension: 'recall',
      // Hard is successful but difficult recall: partial evidence, never an Again.
      accurate: r.rating >= 2,
      gap: false,
      hintUsed: r.rating === 2,
      confidence: 50,
      feedback: 'Spaced retrieval',
      createdAt: r.createdAt,
      elapsedSeconds: 0,
    }));
  const score = mastery([...attempts, ...reviews]);
  const firstAttempt = attempts.reduce<Attempt | undefined>(
    (earliest, a) =>
      !earliest || Date.parse(a.createdAt) < Date.parse(earliest.createdAt) ? a : earliest,
    undefined,
  );
  const spacedRecall =
    firstAttempt &&
    state.reviews.some(
      (r) =>
        r.topicId === topicId &&
        r.rating >= 3 &&
        new Date(r.createdAt).getTime() - new Date(firstAttempt.createdAt).getTime() >= 86400000,
    );
  // Immediate accuracy is provisional; Good/Easy recall after a full day lifts the ceiling.
  return spacedRecall ? score : Math.min(80, score);
}
export function masteryLabel(score: number): string {
  return score <= 20
    ? 'New'
    : score <= 40
      ? 'Learning'
      : score <= 60
        ? 'Developing'
        : score <= 80
          ? 'Strong'
          : 'Mastered';
}
