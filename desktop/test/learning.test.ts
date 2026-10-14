import { describe, expect, it } from 'vitest';
import { emptyWorkspace, type Attempt, type Exercise, type Topic } from '../src/types/state';
import { gradeExact, publicExercise, topicStatus, validateMap } from '../src/learning/conceptloom';
import { mastery, topicMastery } from '../src/learning/mastery';
import { createCourse, deleteCourse, initialTopics } from '../src/learning/courses';
import { newCard, Rating, reviewCard } from '../src/learning/reviews';
import { validateWorkspace } from '../src/db/repository';
import { statistics } from '../src/learning/planner';

const input = {
  name: 'Korean',
  goal: 'Everyday conversation',
  knowledge: 'Hangul',
  currentLevel: 'Beginner',
  targetLevel: 'A2',
  explanationLanguage: 'Russian',
  targetLanguage: 'Korean',
};
function attempt(dimension: Attempt['dimension'], accurate = true): Attempt {
  return {
    id: crypto.randomUUID(),
    courseId: 'c',
    topicId: 't',
    exerciseId: 'e',
    response: 'answer',
    dimension,
    accurate,
    gap: false,
    hintUsed: false,
    confidence: 90,
    feedback: 'Assessment',
    createdAt: '2026-10-15T12:00:00.000Z',
    elapsedSeconds: 60,
  };
}
describe('evidence-based learning', () => {
  it('immediate answers remain provisional until a delayed FSRS retrieval', () => {
    const state = emptyWorkspace();
    state.attempts = ['recognition', 'recall', 'application', 'transfer'].map((d) =>
      attempt(d as Attempt['dimension']),
    );
    expect(topicMastery(state, 't')).toBe(80);
    state.reviews.push({
      id: 'review',
      courseId: 'c',
      cardId: 'card',
      topicId: 't',
      rating: 3,
      createdAt: '2026-10-17T12:00:00.000Z',
    });
    expect(topicMastery(state, 't')).toBe(100);
  });
  it('opening lessons and self-reported knowledge never grant mastery', () => {
    const state = emptyWorkspace();
    const course = createCourse(input);
    state.courses.push(course);
    state.topics.push(...initialTopics(course));
    expect(topicMastery(state, state.topics[0].id)).toBe(0);
    expect(topicStatus(state, state.topics[0])).toBe('available');
    expect(topicStatus(state, state.topics[1])).toBe('locked');
  });
  it('recognition alone cannot master a concept; mistakes and hints reduce evidence', () => {
    expect(mastery([attempt('recognition')])).toBe(15);
    const dimensions: Attempt['dimension'][] = ['recognition', 'recall', 'application', 'transfer'];
    const evidence = dimensions.map((d) => attempt(d));
    expect(mastery(evidence)).toBe(100);
    expect(mastery([...evidence, attempt('transfer', false)])).toBeLessThan(100);
    expect(mastery(evidence.map((a) => ({ ...a, hintUsed: true })))).toBe(50);
  });
  it('rejects cycles, missing prerequisites and cross-course dependencies', () => {
    const topics: Topic[] = [
      { id: 'a', courseId: 'c', title: 'A', description: '', dependsOn: ['b'], approved: true },
      { id: 'b', courseId: 'c', title: 'B', description: '', dependsOn: ['a'], approved: true },
    ];
    expect(() => validateMap(topics)).toThrow(/cycle/);
    expect(() => validateMap([topics[0]])).toThrow();
    expect(() =>
      validateMap([
        { ...topics[0], dependsOn: [] },
        { ...topics[1], courseId: 'other' },
      ]),
    ).toThrow(/same course/);
  });
  it('conceals answers and uses exact grading only for deterministic types', () => {
    const question: Exercise = {
      id: 'q',
      type: 'fill-blank',
      dimension: 'recall',
      prompt: 'Write the topic particle',
      options: [],
      answers: ['는'],
      criteria: ['Topic particle'],
      rationale: 'Marks the topic',
    };
    expect(publicExercise(question)).not.toHaveProperty('answers');
    expect(publicExercise(question)).not.toHaveProperty('rationale');
    expect(gradeExact(question, ' 는 ')).toBe(true);
    expect(gradeExact(question, '가')).toBe(false);
    expect(gradeExact({ ...question, type: 'translate' }, 'alternate wording')).toBeNull();
  });
});
describe('courses and persistence boundaries', () => {
  it('validates arbitrary courses and does not seed fabricated progress', () => {
    expect(() => createCourse({ ...input, name: ' ' })).toThrow();
    const course = createCourse({ ...input, targetLanguage: 'Databases' });
    expect(initialTopics(course)).toEqual([]);
    const state = emptyWorkspace();
    state.courses.push(course);
    expect(validateWorkspace(state)).toEqual(state);
    expect(statistics(state).streak).toBe(0);
  });
  it('cascades course deletion and rejects orphan records before saving', () => {
    const state = emptyWorkspace();
    const course = createCourse(input);
    state.courses.push(course);
    state.topics.push(...initialTopics(course));
    state.cards.push(newCard(course.id, state.topics[0].id, 'Question', 'Answer'));
    expect(deleteCourse(state, course.id).cards).toEqual([]);
    expect(deleteCourse(state, course.id).topics).toEqual([]);
    expect(() => validateWorkspace({ ...state, courses: [] })).toThrow(/missing course/);
  });
});
describe('real FSRS scheduling', () => {
  it('serializes state, schedules distinct ratings and preserves identity', () => {
    const now = new Date('2026-10-15T12:00:00.000Z');
    const card = newCard('c', null, 'Front', 'Back', now);
    const again = reviewCard(card, Rating.Again, now);
    const easy = reviewCard(card, Rating.Easy, now);
    expect(easy.id).toBe(card.id);
    expect(easy.reps).toBe(1);
    expect(easy.stability).toBeGreaterThan(again.stability);
    expect(new Date(easy.due).getTime()).toBeGreaterThan(new Date(again.due).getTime());
    const restored = JSON.parse(JSON.stringify(easy)) as typeof easy;
    expect(reviewCard(restored, Rating.Good, new Date(restored.due)).reps).toBe(2);
  });
});
