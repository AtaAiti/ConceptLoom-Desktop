import { z } from 'zod';

const text = z.string().trim().min(1).max(20000);
const id = z.string().min(1).max(100);
const date = z.iso.datetime();
export const dimensionSchema = z.enum(['recognition', 'recall', 'application', 'transfer']);
export type Dimension = z.infer<typeof dimensionSchema>;
export const courseSchema = z.object({
  id,
  name: text.max(100),
  goal: text,
  knowledge: z.string().max(20000),
  currentLevel: text.max(100),
  targetLevel: text.max(100),
  explanationLanguage: text.max(100),
  targetLanguage: text.max(100),
  createdAt: date,
});
export type Course = z.infer<typeof courseSchema>;
export const topicSchema = z.object({
  id,
  courseId: id,
  title: text.max(200),
  description: z.string().max(20000),
  dependsOn: z.array(id).max(100),
  approved: z.boolean(),
});
export type Topic = z.infer<typeof topicSchema>;
export const exerciseSchema = z.object({
  id,
  type: z.enum([
    'multiple-choice',
    'fill-blank',
    'translate',
    'build-sentence',
    'correct-mistake',
    'explain-grammar',
    'free-response',
    'recall-vocabulary',
  ]),
  dimension: dimensionSchema,
  prompt: text,
  options: z.array(text).max(8),
  answers: z.array(text).min(1).max(10),
  rationale: text,
  criteria: z.array(text).min(1).max(8),
});
export type Exercise = z.infer<typeof exerciseSchema>;
export const lessonContentSchema = z
  .object({
    concept: text,
    explanation: text.max(8000),
    examples: z.array(text).min(1).max(5),
    connection: text,
    summary: text,
    exercises: z.array(exerciseSchema).min(2).max(8),
    flashcards: z
      .array(z.object({ front: text, back: text }))
      .min(1)
      .max(6),
  })
  .superRefine((lesson, ctx) => {
    if (new Set(lesson.exercises.map((e) => e.id)).size !== lesson.exercises.length)
      ctx.addIssue({ code: 'custom', message: 'Exercise IDs must be unique.' });
    lesson.exercises.forEach((exercise, index) => {
      if (
        exercise.type === 'multiple-choice' &&
        (exercise.options.length < 2 ||
          exercise.answers.length !== 1 ||
          !exercise.options.includes(exercise.answers[0]))
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['exercises', index],
          message: 'A choice question needs valid options and exactly one matching answer.',
        });
      }
    });
  });
export type LessonContent = z.infer<typeof lessonContentSchema>;
export const lessonSchema = z.object({
  id,
  courseId: id,
  topicId: id,
  content: lessonContentSchema,
  createdAt: date,
});
export type Lesson = z.infer<typeof lessonSchema>;
export const attemptSchema = z.object({
  id,
  courseId: id,
  topicId: id,
  exerciseId: id,
  response: text,
  dimension: dimensionSchema,
  accurate: z.boolean(),
  gap: z.boolean(),
  hintUsed: z.boolean(),
  confidence: z.number().int().min(0).max(100),
  feedback: text,
  createdAt: date,
  elapsedSeconds: z.number().min(0).max(86400),
});
export type Attempt = z.infer<typeof attemptSchema>;
export const cardSchema = z.object({
  id,
  courseId: id,
  topicId: id.nullable(),
  front: text,
  back: text,
  due: date,
  stability: z.number().nonnegative(),
  difficulty: z.number().min(0).max(10),
  elapsed_days: z.number().nonnegative(),
  scheduled_days: z.number().nonnegative(),
  learning_steps: z.number().int().nonnegative(),
  reps: z.number().int().nonnegative(),
  lapses: z.number().int().nonnegative(),
  state: z.number().int().min(0).max(3),
  last_review: date.optional(),
});
export type Flashcard = z.infer<typeof cardSchema>;
export const reviewSchema = z.object({
  id,
  courseId: id,
  cardId: id,
  topicId: id.nullable(),
  rating: z.number().int().min(1).max(4),
  createdAt: date,
});
export const messageSchema = z.object({
  id,
  courseId: id,
  role: z.enum(['user', 'assistant']),
  content: text,
  createdAt: date,
});
export const noteSchema = z.object({
  id,
  courseId: id,
  title: text.max(200),
  content: z.string().trim().min(1).max(1000000),
  createdAt: date,
});
export const sessionSchema = z.object({
  id,
  courseId: id,
  topicId: id,
  phase: z.enum(['locate', 'weave', 'build', 'transfer', 'review', 'complete']),
  nextStep: text,
  exerciseId: id.optional(),
  pendingResponse: z.string().max(20000).optional(),
  updatedAt: date,
});
export const settingsSchema = z.object({
  theme: z.enum(['dark', 'light']),
  provider: z.literal('ollama'),
  endpoint: z.string().min(1),
  model: text.max(200),
  explanationLanguage: text.max(100),
  dailyMinutes: z.number().int().min(1).max(240),
  dailyReviews: z.number().int().min(1).max(500),
  onboardingComplete: z.boolean(),
});
export const stateSchema = z.object({
  version: z.literal(1),
  settings: settingsSchema,
  courses: z.array(courseSchema),
  topics: z.array(topicSchema),
  lessons: z.array(lessonSchema),
  attempts: z.array(attemptSchema),
  cards: z.array(cardSchema),
  reviews: z.array(reviewSchema),
  messages: z.array(messageSchema),
  notes: z.array(noteSchema),
  sessions: z.array(sessionSchema),
});
export type Workspace = z.infer<typeof stateSchema>;
export const emptyWorkspace = (): Workspace => ({
  version: 1,
  settings: {
    theme: 'dark',
    provider: 'ollama',
    endpoint: 'http://localhost:11434',
    model: 'qwen3:4b',
    explanationLanguage: 'Russian',
    dailyMinutes: 20,
    dailyReviews: 15,
    onboardingComplete: false,
  },
  courses: [],
  topics: [],
  lessons: [],
  attempts: [],
  cards: [],
  reviews: [],
  messages: [],
  notes: [],
  sessions: [],
});
