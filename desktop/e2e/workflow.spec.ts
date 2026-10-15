import { expect, test } from '@playwright/test';
import { emptyWorkspace, type LessonContent } from '../src/types/state';
import { createCourse, initialTopics } from '../src/learning/courses';
test('first launch, course persistence, manual card and FSRS review', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Make your first connection' }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Use this model' }).click();
  await page.getByRole('button', { name: 'English', exact: false }).click();
  await page.getByRole('button', { name: 'Set your learning goal' }).click();
  await page.getByLabel('What do you want to be able to do?').fill('Speak English clearly.');
  await page.getByRole('button', { name: 'Create course', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your next study session.' })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/dashboard.png', fullPage: true, animations: 'disabled' });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your next study session.' })).toBeVisible();
  await page.getByRole('button', { name: 'Knowledge Map', exact: true }).click();
  await expect(page.getByText('Sentence foundations', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Study', exact: true }).click();
  await page.getByRole('button', { name: 'Flashcards', exact: true }).click();
  await page.getByRole('button', { name: 'Create card' }).click();
  await page.getByLabel('Front · question').fill('When do we use present perfect?');
  await page.getByLabel('Back · answer').fill('For a past event connected to the present.');
  await page.getByRole('button', { name: 'Save card' }).click();
  await page.getByRole('button', { name: 'Study', exact: true }).click();
  await page.getByRole('button', { name: 'Reviews', exact: true }).click();
  await expect(
    page.getByText('For a past event connected to the present.', { exact: true }),
  ).not.toBeVisible();
  await page.getByRole('button', { name: 'Reveal answer' }).click();
  await page.getByRole('button', { name: 'Easy', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'A clear mind. A clear queue.' })).toBeVisible();
  await page.getByRole('button', { name: 'Statistics', exact: true }).click();
  await expect(page.getByText('Cards reviewed', { exact: true })).toBeVisible();
});

test('lesson diagnosis, deterministic grading, evidence and resume persistence', async ({
  page,
}) => {
  const state = emptyWorkspace();
  const course = createCourse({
    name: 'English',
    goal: 'Speak clearly',
    knowledge: '',
    currentLevel: 'Beginner',
    targetLevel: 'A2',
    explanationLanguage: 'English',
    targetLanguage: 'English',
  });
  state.courses = [course];
  state.topics = initialTopics(course);
  state.settings.onboardingComplete = true;
  const content: LessonContent = {
    concept: 'Sentence foundations',
    explanation: 'A simple statement connects a subject and a verb.',
    examples: ['I learn.', 'You speak.'],
    connection: 'A subject tells us who; a verb tells us what happens.',
    summary: 'Connect a subject to a verb.',
    exercises: [
      {
        id: 'recognition',
        type: 'multiple-choice',
        dimension: 'recognition',
        prompt: 'Which sentence has a subject and a verb?',
        options: ['I learn.', 'The book.'],
        answers: ['I learn.'],
        rationale: 'I is the subject; learn is the verb.',
        criteria: ['Choose subject plus verb'],
      },
      {
        id: 'recall',
        type: 'fill-blank',
        dimension: 'recall',
        prompt: 'I ___ English. Use learn.',
        options: [],
        answers: ['learn'],
        rationale: 'Learn is a verb.',
        criteria: ['Recall the verb'],
      },
      {
        id: 'application',
        type: 'build-sentence',
        dimension: 'application',
        prompt: 'Arrange: learn / I / English',
        options: [],
        answers: ['I learn English'],
        rationale: 'Subject before verb.',
        criteria: ['Build the sentence'],
      },
      {
        id: 'transfer',
        type: 'free-response',
        dimension: 'transfer',
        prompt: 'Invent a new sentence.',
        options: [],
        answers: ['We read.'],
        rationale: 'Use a subject and verb.',
        criteria: ['Contains a subject and verb'],
      },
    ],
    flashcards: [{ front: 'What does a subject tell us?', back: 'Who or what.' }],
  };
  await page.addInitScript((value) => {
    if (!localStorage.getItem('conceptloom-desktop-preview-v1'))
      localStorage.setItem('conceptloom-desktop-preview-v1', JSON.stringify(value));
  }, state);
  await page.route('**/ollama/api/tags', (route) =>
    route.fulfill({ json: { models: [{ name: 'qwen3:4b' }] } }),
  );
  await page.route('**/ollama/api/chat', (route) =>
    route.fulfill({ json: { message: { content: JSON.stringify(content) } } }),
  );
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Learn next connection' }).click();
  await page.getByRole('button', { name: 'Create local lesson' }).click();
  await expect(page.getByRole('heading', { name: 'Locate your knowledge frontier' })).toBeVisible();
  await expect(page.getByText(content.explanation, { exact: true })).not.toBeVisible();
  await page.getByRole('button', { name: /^[AB] I learn\.$/ }).click();
  await page.getByRole('button', { name: 'Check understanding' }).click();
  await expect(page.getByText('Connection demonstrated.', { exact: true })).toBeVisible();
  await expect(page.getByText(content.explanation, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next checkpoint' }).click();
  await expect(page.getByRole('heading', { name: 'I ___ English. Use learn.' })).toBeVisible();
  const persisted = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('conceptloom-desktop-preview-v1')!),
  );
  expect(persisted.attempts).toHaveLength(1);
  expect(persisted.sessions[0].exerciseId).toBe('recall');
  expect(persisted.cards).toHaveLength(1);
  // Opening the next checkpoint must not award additional evidence.
  expect(persisted.attempts[0].dimension).toBe('recognition');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Resume lesson' }).click();
  await expect(page.getByRole('heading', { name: 'I ___ English. Use learn.' })).toBeVisible();
});
