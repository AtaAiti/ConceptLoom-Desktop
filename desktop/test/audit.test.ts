import { describe, expect, it } from 'vitest';
import {
  emptyWorkspace,
  lessonContentSchema,
  type LessonContent,
  type Topic,
} from '../src/types/state';
import { generatedLessonSchema } from '../src/ai/schemas';
import { topicDepths } from '../src/learning/conceptloom';
import { mergeSettings } from '../src/db/settings';

const lesson: LessonContent = {
  concept: 'Concept',
  explanation: 'Explanation',
  examples: ['Example'],
  connection: 'Connection',
  summary: 'Summary',
  flashcards: [{ front: 'Question', back: 'Answer' }],
  exercises: ['recognition', 'recall'].map((id) => ({
    id,
    type: 'free-response',
    dimension: 'recognition',
    prompt: 'Explain',
    options: [],
    answers: ['Answer'],
    rationale: 'Reason',
    criteria: ['Criterion'],
  })),
};

describe('audit regressions', () => {
  it('rejects incomplete new lessons while preserving readable legacy lessons', () => {
    expect(lessonContentSchema.safeParse(lesson).success).toBe(true);
    expect(generatedLessonSchema.safeParse(lesson).success).toBe(false);
    const complete = {
      ...lesson,
      exercises: (['recognition', 'recall', 'application', 'transfer'] as const).map(
        (dimension) => ({ ...lesson.exercises[0], id: dimension, dimension }),
      ),
    };
    expect(generatedLessonSchema.safeParse(complete).success).toBe(true);
  });
  it('lays out a dense valid DAG without recomputing every path', () => {
    const topics: Topic[] = Array.from({ length: 30 }, (_, i) => ({
      id: String(i),
      courseId: 'course',
      title: `Topic ${i}`,
      description: '',
      approved: true,
      dependsOn: Array.from({ length: i }, (_, j) => String(j)),
    }));
    expect([...topicDepths(topics).values()]).toEqual(Array.from({ length: 30 }, (_, i) => i));
  });
  it('saves draft changes without reverting a separately changed theme, including consent revocation', () => {
    const initial = {
      ...emptyWorkspace().settings,
      provider: 'codex' as const,
      accountDataConsent: true,
    };
    const result = mergeSettings({ ...initial, theme: 'light' }, initial, {
      ...initial,
      accountDataConsent: false,
      dailyMinutes: 40,
    });
    expect(result.theme).toBe('light');
    expect(result.accountDataConsent).toBe(false);
    expect(result.dailyMinutes).toBe(40);
  });
});
