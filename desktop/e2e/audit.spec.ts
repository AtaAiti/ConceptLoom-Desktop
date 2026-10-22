import { expect, test, type Page } from '@playwright/test';
import { emptyWorkspace, type LessonContent, type Workspace } from '../src/types/state';
import { createCourse } from '../src/learning/courses';

async function seed(page: Page, state: Workspace) {
  state.settings.onboardingComplete = true;
  await page.addInitScript((value) => {
    if (!localStorage.getItem('conceptloom-desktop-preview-v1'))
      localStorage.setItem('conceptloom-desktop-preview-v1', JSON.stringify(value));
  }, state);
  await page.route('**/ollama/api/tags', (route) => route.fulfill({ json: { models: [] } }));
  await page.goto('/');
}

test('dialogs contain keyboard focus, show save errors, and restore focus; settings preserve external theme', async ({
  page,
}) => {
  await seed(page, emptyWorkspace());
  await page.getByRole('button', { name: 'Источники', exact: true }).click();
  const trigger = page.getByRole('button', { name: 'Вставить текст', exact: true }).first();
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Вставить текст' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Отмена' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByLabel('Название (необязательно)')).toBeFocused();
  await dialog.getByLabel('Скопированный текст / заметки').fill('Preserve my draft');
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Storage is full', 'QuotaExceededError');
    };
  });
  await dialog.getByRole('button', { name: 'Добавить в библиотеку' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Storage is full');
  await expect(dialog.getByLabel('Скопированный текст / заметки')).toHaveValue('Preserve my draft');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await page.reload();
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await page.getByLabel('Daily learning goal (minutes)').fill('35');
  await page.getByRole('button', { name: 'Сменить тему' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await expect(page.getByLabel('Daily learning goal (minutes)')).toHaveValue('35');
});

function learningFixture() {
  const state = emptyWorkspace();
  state.courses = ['First', 'Second'].map((name) =>
    createCourse({
      name,
      goal: 'Learn',
      knowledge: '',
      currentLevel: 'Beginner',
      targetLevel: 'Apply',
      explanationLanguage: 'Russian',
    }),
  );
  state.topics = state.courses.map((course, i) => ({
    id: `topic${i}`,
    courseId: course.id,
    title: `Concept ${i}`,
    description: '',
    dependsOn: [],
    approved: true,
  }));
  const content: LessonContent = {
    concept: 'Concept',
    explanation: 'Explanation',
    examples: ['Example'],
    connection: 'Connection',
    summary: 'Summary',
    flashcards: [{ front: 'Question', back: 'Answer' }],
    exercises: (['recognition', 'recall', 'application', 'transfer'] as const).map((dimension) => ({
      id: dimension,
      type: 'free-response',
      dimension,
      prompt: `Explain ${dimension}`,
      options: [],
      answers: ['Answer'],
      rationale: 'Reason',
      criteria: ['Criterion'],
    })),
  };
  state.lessons = state.topics.map((topic) => ({
    id: `lesson-${topic.id}`,
    courseId: topic.courseId,
    topicId: topic.id,
    content,
    createdAt: new Date().toISOString(),
  }));
  return state;
}

test('a late AI assessment stays in its original course and never appears on another lesson', async ({
  page,
}) => {
  const state = learningFixture();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested = false;
  await page.route('**/ollama/api/chat', async (route) => {
    requested = true;
    await gate;
    await route.fulfill({
      json: {
        message: {
          content: JSON.stringify({ accurate: true, feedback: 'Only first course feedback' }),
        },
      },
    });
  });
  await seed(page, state);
  await page.getByRole('button', { name: 'Сегодня', exact: true }).click();
  await page.getByRole('button', { name: 'Начать занятие', exact: true }).click();
  await page.getByLabel('Your answer').fill('My first answer');
  await page.getByRole('button', { name: 'Проверить понимание', exact: true }).click();
  await expect.poll(() => requested).toBe(true);
  await page.getByLabel('Active course').selectOption(state.courses[1].id);
  await expect(page.getByRole('heading', { name: 'Concept 1', exact: true })).toBeVisible();
  release();
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('conceptloom-desktop-preview-v1')!).attempts.length,
      ),
    )
    .toBe(1);
  await expect(page.getByText('Only first course feedback')).not.toBeVisible();
  await expect(page.getByLabel('Your answer')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Пока не знаю' })).toBeEnabled();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('conceptloom-desktop-preview-v1')!),
  );
  expect(saved.attempts[0].courseId).toBe(state.courses[0].id);
});

test('incomplete legacy lesson can be repaired without discarding prior evidence', async ({
  page,
}) => {
  const state = learningFixture();
  const complete = state.lessons[0].content;
  state.lessons[0].content = { ...complete, exercises: complete.exercises.slice(0, 2) };
  await page.route('**/ollama/api/chat', (route) =>
    route.fulfill({ json: { message: { content: JSON.stringify(complete) } } }),
  );
  await seed(page, state);
  await page.getByRole('button', { name: 'Сегодня', exact: true }).click();
  await page.getByRole('button', { name: 'Начать занятие', exact: true }).click();
  await page.getByRole('button', { name: 'Пока не знаю' }).click();
  await expect(page.getByText('Нашли точку старта.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Обновить задания' }).click();
  await expect(page.getByRole('button', { name: 'Обновить задания' })).not.toBeVisible();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('conceptloom-desktop-preview-v1')!),
  );
  expect(saved.attempts).toHaveLength(1);
  expect(saved.lessons).toHaveLength(2);
  expect(
    saved.lessons.find((l: { topicId: string }) => l.topicId === 'topic0').content.exercises,
  ).toHaveLength(4);
});
