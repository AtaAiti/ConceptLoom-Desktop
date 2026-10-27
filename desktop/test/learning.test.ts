import { describe, expect, it } from 'vitest';
import {
  emptyWorkspace,
  type Attempt,
  type Exercise,
  type Topic,
  type LessonContent,
} from '../src/types/state';
import {
  gradeExact,
  publicExercise,
  topicStatus,
  validateMap,
  prepareLesson,
  frontier,
} from '../src/learning/conceptloom';
import { mastery, topicMastery } from '../src/learning/mastery';
import { createCourse, deleteCourse, initialTopics } from '../src/learning/courses';
import { newCard, Rating, reviewCard } from '../src/learning/reviews';
import { validateWorkspace } from '../src/db/repository';
import { statistics, todayPlan } from '../src/learning/planner';

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
  it('mixes choices while keeping answer comparison independent of display order', () => {
    const exercise: Exercise = {
      id: 'e',
      type: 'multiple-choice',
      dimension: 'recognition',
      prompt: 'Pick a verb',
      options: ['learn', 'book'],
      answers: ['learn'],
      rationale: 'Learn is a verb.',
      criteria: ['Verb'],
    };
    const content: LessonContent = {
      concept: 'Verbs',
      explanation: 'Actions',
      connection: 'Words represent actions.',
      examples: ['I learn.'],
      summary: 'Verbs represent actions.',
      exercises: [exercise],
      flashcards: [{ front: 'A verb?', back: 'An action word.' }],
    };
    const mixed = prepareLesson(content, () => 0);
    expect(mixed.exercises[0].options).toEqual(['book', 'learn']);
    expect(gradeExact(mixed.exercises[0], 'learn')).toBe(true);
    expect(content.exercises[0].options).toEqual(['learn', 'book']);
  });
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
  it('counts Hard as partial recall, between Again and Good, without changing FSRS ratings', () => {
    const state = emptyWorkspace();
    state.attempts = (['recognition', 'recall', 'application', 'transfer'] as const).map((d) =>
      attempt(d),
    );
    const score = (rating: number) =>
      topicMastery(
        {
          ...state,
          reviews: [
            {
              id: 'r',
              courseId: 'c',
              cardId: 'card',
              topicId: 't',
              rating,
              createdAt: '2026-10-17T12:00:00.000Z',
            },
          ],
        },
        't',
      );
    expect(score(Rating.Again)).toBe(80);
    expect(score(Rating.Hard)).toBe(80); // Still provisional until strong delayed recall.
    // Isolate recall so the 80-point provisional ceiling cannot mask the distinction.
    state.attempts = [];
    expect(score(Rating.Again)).toBe(0);
    expect(score(Rating.Hard)).toBe(15);
    expect(score(Rating.Good)).toBe(30);
    expect(score(Rating.Easy)).toBe(30);
  });
  it('uses the earliest attempt and chronological recent evidence regardless of storage order', () => {
    const state = emptyWorkspace();
    const oldest = (['recognition', 'recall', 'application', 'transfer'] as const).map((d) =>
      attempt(d),
    );
    const latest = { ...attempt('recall', false), createdAt: '2026-10-18T12:00:00.000Z' };
    state.attempts = [latest, ...oldest];
    state.reviews = [
      {
        id: 'r',
        courseId: 'c',
        cardId: 'card',
        topicId: 't',
        rating: 3,
        createdAt: '2026-10-17T12:00:00.000Z',
      },
    ];
    const sorted = [...state.attempts].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    expect(topicMastery(state, 't')).toBe(85);
    expect(topicMastery({ ...state, attempts: sorted }, 't')).toBe(85);
    expect(mastery([latest, ...oldest])).toBe(mastery([...oldest, latest]));
  });
  it('requires a full day and Good/Easy recall before granting Mastered', () => {
    const state = emptyWorkspace();
    state.attempts = (['recognition', 'recall', 'application', 'transfer'] as const).map((d) =>
      attempt(d),
    );
    const review = {
      id: 'r',
      courseId: 'c',
      cardId: 'card',
      topicId: 't',
      rating: 3,
      createdAt: '2026-10-16T11:59:59.999Z',
    };
    state.reviews = [review];
    expect(topicMastery(state, 't')).toBe(80);
    state.reviews = [{ ...review, createdAt: '2026-10-16T12:00:00.000Z' }];
    expect(topicMastery(state, 't')).toBe(100);
    state.reviews[0].rating = Rating.Hard;
    expect(topicMastery(state, 't')).toBe(80);
  });
  it('keeps practised topics accessible after prerequisite lapses without unlocking new topics', () => {
    const state = emptyWorkspace();
    const course = createCourse(input);
    state.courses = [course];
    const root: Topic = {
      id: 'root',
      courseId: course.id,
      title: 'Foundation',
      description: '',
      dependsOn: [],
      approved: true,
    };
    const child: Topic = { ...root, id: 'child', title: 'Practised concept', dependsOn: ['root'] };
    const fresh = { ...child, id: 'fresh' };
    state.topics = [root, child, fresh];
    state.attempts = [{ ...attempt('application'), courseId: course.id, topicId: child.id }];
    expect(topicStatus(state, child)).toBe('learning');
    expect(topicStatus(state, fresh)).toBe('locked');
    expect(frontier(state, course.id)).toContainEqual(child);
    state.topics = [child, root, fresh];
    expect(todayPlan(state)[0].topic.id).toBe(child.id);
    expect(topicStatus(state, { ...child, approved: false })).toBe('locked');
    // A delayed card review also preserves access when there is no lesson attempt.
    state.attempts = [];
    const card = reviewCard(newCard(course.id, child.id, 'Question', 'Answer'), Rating.Again);
    state.cards = [{ ...card, due: '2026-01-01T00:00:00.000Z' }];
    state.reviews = [
      {
        id: 'r',
        courseId: course.id,
        cardId: card.id,
        topicId: child.id,
        rating: Rating.Again,
        createdAt: '2026-10-17T12:00:00.000Z',
      },
    ];
    expect(topicStatus(state, child)).toBe('reviewing');
    expect(statistics(state).due).toBe(1);
    expect(frontier(state, course.id)).toContainEqual(child);
    // An unreviewed generated card is not evidence that a topic has been practised.
    state.reviews = [];
    expect(topicStatus(state, child)).toBe('locked');
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
  it('preserves daily counts, study minutes and streaks when aggregating attempts and reviews', () => {
    const state = emptyWorkspace();
    const now = new Date(2026, 9, 27, 12);
    const yesterday = new Date(2026, 9, 26, 12).toISOString();
    state.attempts = [
      { ...attempt('recall'), createdAt: yesterday, elapsedSeconds: 30 },
      { ...attempt('application', false), createdAt: yesterday, elapsedSeconds: 60 },
    ];
    state.reviews = [
      {
        id: 'r',
        courseId: 'c',
        topicId: 't',
        cardId: 'card',
        rating: 3,
        createdAt: now.toISOString(),
      },
    ];
    const stats = statistics(state, now);
    expect(stats.streak).toBe(2);
    expect(stats.accuracy).toBe(50);
    expect(stats.minutes).toBe(2);
    expect(stats.week.at(-2)).toMatchObject({ count: 2, minutes: 2 });
    expect(stats.week.at(-1)).toMatchObject({ count: 1, minutes: 0 });
    expect(stats.week.slice(0, 5).every((day) => day.count === 0 && day.minutes === 0)).toBe(true);
  });
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
