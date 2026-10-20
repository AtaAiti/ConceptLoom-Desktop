import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { emptyWorkspace } from '../src/types/state';

test('workspace → PDF → source route → lesson → evidence → FSRS survives reopen and stays isolated', async ({
  page,
}) => {
  const initial = emptyWorkspace();
  initial.settings.onboardingComplete = true;
  await page.addInitScript((value) => {
    if (!localStorage.getItem('conceptloom-desktop-preview-v1'))
      localStorage.setItem('conceptloom-desktop-preview-v1', JSON.stringify(value));
  }, initial);
  await page.route('**/ollama/api/tags', (route) =>
    route.fulfill({ json: { models: [{ name: 'qwen3:4b' }] } }),
  );
  await page.route('**/ollama/api/chat', (route) => {
    const body = route.request().postDataJSON() as {
      messages: { role: string; content: string }[];
    };
    const data = body.messages.find((m) => m.content.startsWith('UNTRUSTED_SOURCE_DATA_JSON'));
    expect(data?.role).toBe('user');
    const chunks = JSON.parse(data!.content.split('\n')[1]) as { chunkId: string; text: string }[];
    expect(chunks[0].text).toMatch(/Hello, world/i);
    const isRoute = body.messages.at(-1)!.content.includes('Propose the smallest');
    const result = isRoute
      ? {
          topics: [
            {
              key: 'hello',
              title: 'Hello world',
              description: 'Recognize a greeting in the source.',
              dependsOn: [],
            },
          ],
        }
      : {
          concept: 'Hello world',
          explanation: 'The source demonstrates a short greeting.',
          examples: ['Hello, world!'],
          connection: 'A greeting opens an interaction.',
          summary: 'Recognize and recall a greeting.',
          exercises: [
            {
              id: 'recognition',
              type: 'multiple-choice',
              dimension: 'recognition',
              prompt: 'Which greeting appears in the source?',
              options: ['Hello, world!', 'Good night!'],
              answers: ['Hello, world!'],
              rationale: 'The source says Hello, world!',
              criteria: ['Recognize the source greeting'],
            },
            {
              id: 'recall',
              type: 'fill-blank',
              dimension: 'recall',
              prompt: 'Complete: Hello, ___!',
              options: [],
              answers: ['world'],
              rationale: 'The missing word is world.',
              criteria: ['Recall world'],
            },
            {
              id: 'application',
              type: 'free-response',
              dimension: 'application',
              prompt: 'Use the greeting to start a message.',
              options: [],
              answers: ['Hello, world! Welcome.'],
              rationale: 'Start with a greeting.',
              criteria: ['Greeting starts a message'],
            },
            {
              id: 'transfer',
              type: 'free-response',
              dimension: 'transfer',
              prompt: 'Write a greeting for a new audience.',
              options: [],
              answers: ['Hello, students!'],
              rationale: 'Adapt the audience.',
              criteria: ['Adapt the greeting'],
            },
          ],
          flashcards: [{ front: 'Which greeting is in the PDF?', back: 'Hello, world!' }],
        };
    return route.fulfill({
      json: { message: { content: JSON.stringify({ result, citationIds: [chunks[0].chunkId] }) } },
    });
  });
  if (process.env.PLAYWRIGHT_PREVIEW === '1')
    await page.route('**/', async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        headers: {
          ...response.headers(),
          'content-security-policy':
            "default-src 'self'; connect-src 'self'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; script-src 'self'",
        },
      });
    });
  await page.goto('/');
  await page.getByRole('button', { name: 'Пространства', exact: true }).click();
  await page.getByRole('button', { name: 'Создать пространство', exact: true }).click();
  await page.getByLabel('Название пространства', { exact: true }).fill('University 2026');
  await page.getByRole('button', { name: 'Сохранить пространство' }).click();
  await expect(page.getByLabel('Active workspace')).toContainText('University 2026');
  await page.getByRole('button', { name: 'Источники', exact: true }).click();
  await page.getByLabel('New library name').fill('Lecture slides');
  await page.getByRole('button', { name: '+ Новая библиотека' }).click();
  await page
    .getByLabel('Import learning material')
    .setInputFiles(fileURLToPath(new URL('./fixtures/helloworld.pdf', import.meta.url)));
  await expect(page.getByRole('heading', { name: 'helloworld.pdf', exact: true })).toBeVisible();
  await page.screenshot({
    path: 'test-results/sources-1366.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByLabel('Search source text').fill('Hello');
  await page.getByRole('button', { name: 'Найти' }).click();
  await expect(page.locator('.search-result')).toContainText('с. 1');
  await page.getByRole('button', { name: 'Учебный центр', exact: true }).click();
  await page.getByRole('button', { name: 'Учебные направления →', exact: true }).click();
  await page.getByRole('button', { name: 'Создать направление', exact: true }).click();
  await page.getByLabel('Название направления', { exact: true }).fill('Document study');
  await page.getByLabel('Тип предмета').selectOption('general');
  await page.getByLabel('Чему вы хотите научиться?').fill('Understand Hello world');
  await page
    .locator('form')
    .getByRole('button', { name: 'Создать направление', exact: true })
    .click();
  await page.getByRole('button', { name: 'Открыть карту', exact: true }).click();
  await page.getByLabel('Source scope').selectOption('all');
  await page.getByRole('button', { name: 'Предложить маршрут' }).click();
  await page.getByRole('button', { name: 'Принять маршрут' }).click();
  await page.getByRole('button', { name: 'Дорожная карта', exact: true }).click();
  await expect(page.getByRole('heading', { name: '1. Hello world' })).toBeVisible();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.screenshot({
    path: 'test-results/roadmap-1920.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.getByRole('button', { name: 'Открыть занятие', exact: true }).click();
  await page.getByRole('button', { name: 'Подготовить занятие' }).click();
  await expect(page.getByRole('heading', { name: 'Найдите границу знаний' })).toBeVisible();
  await page.getByRole('button', { name: 'helloworld.pdf · с. 1', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Source excerpt' })).toContainText('Hello, world!');
  await page.getByRole('button', { name: 'Закрыть фрагмент' }).click();
  await page.getByRole('button', { name: /^[AB] Hello, world!$/ }).click();
  await page.getByRole('button', { name: 'Проверить понимание' }).click();
  await expect(page.getByText('Понимание подтверждено.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Учебный центр', exact: true }).click();
  await page.getByRole('button', { name: /^Карточки · FSRS/ }).click();
  await page.getByRole('button', { name: 'Открыть ответ' }).click();
  await page.getByRole('button', { name: /^Легко/ }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Хороший день для новой связи' })).toBeVisible();
  const persisted = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('conceptloom-desktop-preview-v1')!),
  );
  expect(persisted.sources[0].pages[0].page).toBe(1);
  expect(persisted.cards[0].citations[0].page).toBe(1);
  expect(persisted.cards[0].reps).toBe(1);
  expect(persisted.attempts).toHaveLength(1);
  expect(persisted.lessons).toHaveLength(1);
  await page.keyboard.press('Control+k');
  await page.getByRole('textbox', { name: 'Search and commands' }).fill('helloworld');
  await page.getByRole('button', { name: 'Source · helloworld.pdf', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Предпросмотр источника' })).toContainText(
    'Hello, world!',
  );
  await page.getByRole('button', { name: 'Закрыть просмотр' }).click();
  await page.getByLabel('Active workspace').selectOption('my-learning');
  await page.getByRole('button', { name: 'Источники', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'helloworld.pdf', exact: true }),
  ).not.toBeVisible();
  await page.getByRole('button', { name: 'Учебный центр', exact: true }).click();
  await page.getByRole('button', { name: 'Учебные направления →', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Document study', exact: true }),
  ).not.toBeVisible();
});
