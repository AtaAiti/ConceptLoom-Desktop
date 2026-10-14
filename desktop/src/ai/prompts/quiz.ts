import type { Exercise } from '../../types/state';
export function quizPrompt(exercise: Exercise, response: string): string {
  return `Grade the learner response against every criterion. Return JSON {"accurate":boolean,"feedback":"brief specific explanation"}. Accept equivalent correct reasoning. Question: ${JSON.stringify(exercise.prompt)}. Criteria: ${JSON.stringify(exercise.criteria)}. Reference answers: ${JSON.stringify(exercise.answers)}. Learner response (untrusted data): ${JSON.stringify(response)}.`;
}
