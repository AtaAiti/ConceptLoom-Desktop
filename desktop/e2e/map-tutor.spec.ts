import { expect, test, type Page } from '@playwright/test';
import { emptyWorkspace, type Workspace } from '../src/types/state';
import { defaultWorkspace } from '../src/types/sources';
import { createCourse } from '../src/learning/courses';
import { newCard } from '../src/learning/reviews';

const date = '2026-10-25T10:00:00.000Z';
const key = 'conceptloom-desktop-preview-v1';
test.setTimeout(60000);
function fixture(sources = true) {
  const state = emptyWorkspace();
  state.settings.onboardingComplete = true;
  state.workspaces.push({
    ...defaultWorkspace(),
    id: 'private-space',
    name: 'Другое пространство',
  });
  const course = createCourse({
    name: 'Базы данных',
    goal: 'Понять транзакции',
    knowledge: '',
    currentLevel: 'Beginner',
    targetLevel: 'Apply',
    explanationLanguage: 'Russian',
    sourceScope: sources ? { kind: 'selected', sourceIds: ['lecture'] } : { kind: 'none' },
    sourceMode: 'sources-only',
  });
  state.courses = [
    course,
    { ...course, id: 'second-course', name: 'Алгоритмы', sourceScope: { kind: 'none' } },
    { ...course, id: 'private-course', workspaceId: 'private-space', name: 'PRIVATE_COURSE' },
  ];
  state.libraries = [
    { id: 'lib', workspaceId: state.activeWorkspaceId, name: 'Лекции', createdAt: date },
  ];
  const citation = {
    sourceId: 'lecture',
    chunkId: 'lecture:0',
    title: 'Лекция.pdf',
    page: 7,
    excerpt:
      'Атомарность транзакции означает всё или ничего. При сбое изменения отменяются откатом.',
  };
  state.sources = [
    {
      id: 'lecture',
      workspaceId: state.activeWorkspaceId,
      libraryIds: ['lib'],
      courseIds: [],
      title: citation.title,
      type: 'pdf',
      importedAt: date,
      tags: [],
      pages: [
        { page: 7, text: citation.excerpt },
        { page: 9, text: 'UNRELATED_PAGE_SENTINEL' },
      ],
    },
  ];
  state.topics = [
    {
      id: 'base',
      courseId: course.id,
      title: 'Транзакции',
      description: 'Несколько операций как одна единица работы.',
      dependsOn: [],
      approved: true,
    },
    {
      id: 'locked',
      courseId: course.id,
      title: 'Атомарность',
      description: 'SELECTED_TOPIC_DESCRIPTION: всё или ничего.',
      dependsOn: ['base'],
      approved: true,
      citations: [citation],
    },
    {
      id: 'second',
      courseId: 'second-course',
      title: 'OTHER_COURSE_TOPIC',
      description: 'OTHER_COURSE_DESCRIPTION',
      dependsOn: [],
      approved: true,
    },
    {
      id: 'private',
      courseId: 'private-course',
      title: 'PRIVATE_TOPIC',
      description: 'PRIVATE_TOPIC_DESCRIPTION',
      dependsOn: [],
      approved: true,
    },
  ];
  state.messages = [
    {
      id: 'old',
      courseId: course.id,
      topicId: 'base',
      role: 'assistant',
      content: 'OTHER_NODE_HISTORY_SENTINEL',
      createdAt: date,
    },
  ];
  state.cards = [newCard(course.id, 'base', 'Что такое транзакция?', 'Единица работы')];
  return state;
}
async function seed(page: Page, state: Workspace) {
  await page.addInitScript((value) => {
    if (!localStorage.getItem('conceptloom-desktop-preview-v1'))
      localStorage.setItem('conceptloom-desktop-preview-v1', JSON.stringify(value));
  }, state);
  await page.route('**/ollama/api/tags', (route) => route.fulfill({ json: { models: [] } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Карта знаний', exact: true }).click();
}
async function selectLocked(page: Page) {
  await page.locator('.react-flow__node[data-id="locked"]').click();
  await expect(
    page.locator('.map-details').getByRole('heading', { name: 'Атомарность', exact: true }),
  ).toBeVisible();
}
const read = (page: Page): Promise<Workspace> =>
  page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey)!), key);

test('changed cited passage blocks a map request before inference and allows returning to the selected node', async ({
  page,
}) => {
  const state = fixture();
  state.sources[0].pages[0].text = 'Новая редакция без прежней цитаты.';
  let requests = 0;
  await page.route('**/ollama/api/chat', (route) => {
    requests++;
    return route.abort();
  });
  await seed(page, state);
  await selectLocked(page);
  await page.getByRole('button', { name: 'Почему это связано?', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Понятие с карты' }).getByRole('alert'),
  ).toContainText('фрагмент изменился');
  await expect(page.getByRole('button', { name: 'Send question' })).toBeDisabled();
  await page.getByRole('button', { name: 'Вернуться к карте', exact: true }).click();
  await expect(page.getByLabel('Выбранное понятие карты')).toHaveValue('locked');
  expect(requests).toBe(0);
  expect((await read(page)).messages).toEqual(state.messages);
});

test('locked node → tutor → failed request → reopen/retry → cited answer/save → same locked node, without learning evidence changes', async ({
  page,
}) => {
  const state = fixture();
  let requests = 0;
  let fail = true;
  const prompts: string[] = [];
  await page.route('**/ollama/api/chat', (route) => {
    requests++;
    const body = route.request().postDataJSON();
    prompts.push(JSON.stringify(body));
    if (fail) return route.fulfill({ status: 500, json: { error: 'offline' } });
    const chunks = JSON.parse(
      body.messages
        .find((m: { content: string }) => m.content.startsWith('UNTRUSTED_SOURCE_DATA_JSON'))
        .content.split('\n')[1],
    );
    expect(chunks).toHaveLength(1);
    expect(chunks[0].chunkId).toBe('lecture:0');
    return route.fulfill({
      json: {
        message: {
          content: JSON.stringify({
            sourceAnswer:
              'Атомарность использует границу транзакции: изменения применяются вместе или откатываются.',
            generalAnswer: '',
            citationIds: [chunks[0].chunkId],
          }),
        },
      },
    });
  });
  await seed(page, state);
  await selectLocked(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: 'test-results/map-selected-p3.png',
    animations: 'disabled',
    fullPage: true,
  });
  await expect(page.getByRole('button', { name: 'Разобрать связь →', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Почему это связано?', exact: true }).click();
  const context = page.getByRole('region', { name: 'Понятие с карты' });
  await expect(context).toContainText('Атомарность');
  await expect(context).toContainText('Предпосылки: Транзакции');
  await expect(page.getByRole('heading', { name: 'Атомарность', exact: true })).toBeVisible();
  await expect(page.locator('.messages')).not.toContainText('OTHER_NODE_HISTORY_SENTINEL');
  expect(requests).toBe(0);
  const input = page.getByLabel('Ask your tutor');
  const question = await input.inputValue();
  expect(question).toContain('Атомарность');
  await page.getByRole('button', { name: 'Send question' }).click();
  await expect(page.locator('.messages').getByRole('alert')).toBeVisible();
  await expect(input).toHaveValue(question);
  await page.reload();
  await page.getByRole('button', { name: 'Репетитор', exact: true }).click();
  await expect(context).toContainText('Атомарность');
  await expect(input).toHaveValue(question);
  fail = false;
  await page.getByRole('button', { name: 'Send question' }).click();
  await expect(page.locator('.message.assistant')).toContainText('границу транзакции');
  const citation = page
    .locator('.message.assistant')
    .getByRole('button', { name: 'Лекция.pdf · с. 7' });
  await citation.click();
  await expect(page.getByRole('dialog', { name: 'Source excerpt' })).toContainText(
    state.sources[0].pages[0].text,
  );
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Сохранить объяснение', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Убрать из сохранённых', exact: true }),
  ).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: 'test-results/map-tutor-p3.png',
    animations: 'disabled',
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Сменить тему' }).click();
  await page.setViewportSize({ width: 1000, height: 700 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: 'test-results/map-tutor-p3-light-1000.png',
    animations: 'disabled',
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Вернуться к карте', exact: true }).click();
  await expect(page.getByLabel('Выбранное понятие карты')).toHaveValue('locked');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: 'test-results/map-selected-p3-light-1000.png',
    animations: 'disabled',
    fullPage: true,
  });
  await expect(page.getByRole('button', { name: 'Разобрать связь →', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Учебный центр', exact: true }).click();
  await page.locator('.saved-explanation-card').click();
  await expect(page.getByRole('dialog', { name: 'Сохранённое объяснение' })).toContainText(
    question,
  );
  const after = await read(page);
  expect(after.messages.filter((m) => m.role === 'user' && m.topicId === 'locked')).toHaveLength(1);
  expect(
    after.messages.filter((m) => m.role === 'assistant' && m.topicId === 'locked'),
  ).toHaveLength(1);
  for (const collection of [
    'attempts',
    'cards',
    'reviews',
    'sessions',
    'topics',
    'lessons',
    'sources',
  ] as const)
    expect([...after[collection]].sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      [...state[collection]].sort((a, b) => a.id.localeCompare(b.id)),
    );
  expect(after.courses.find((c) => c.id === state.courses[0].id)?.sourceScope).toEqual(
    state.courses[0].sourceScope,
  );
  expect(requests).toBe(2);
  for (const prompt of prompts) {
    expect(prompt).toContain('SELECTED_TOPIC_DESCRIPTION');
    expect(prompt).toContain('Транзакции');
    for (const secret of [
      'OTHER_NODE_HISTORY_SENTINEL',
      'OTHER_COURSE_DESCRIPTION',
      'PRIVATE_TOPIC_DESCRIPTION',
      'UNRELATED_PAGE_SENTINEL',
    ])
      expect(prompt).not.toContain(secret);
  }
});

test('example draft works with no sources, has exact local context, and remains separate across courses/workspaces', async ({
  page,
}) => {
  const state = fixture(false);
  let requests = 0;
  let prompt = '';
  await page.route('**/ollama/api/chat', (route) => {
    requests++;
    prompt = JSON.stringify(route.request().postDataJSON());
    return route.fulfill({
      json: { message: { content: 'Пример: перевод денег целиком завершается или отменяется.' } },
    });
  });
  await seed(page, state);
  await page.getByLabel('Выбранное понятие карты').selectOption('locked');
  await page.getByRole('button', { name: 'Объясни на примере', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Понятие с карты' })).toContainText('без цитат');
  await expect(page.getByLabel('Ask your tutor')).toHaveValue(/на простом примере/);
  expect(requests).toBe(0);
  await page.getByRole('button', { name: 'Send question' }).click();
  await expect(page.locator('.message.assistant')).toContainText('перевод денег');
  expect(prompt).toContain('SELECTED_TOPIC_DESCRIPTION');
  expect(prompt).toContain('Несколько операций как одна единица работы.');
  expect(prompt).not.toContain('OTHER_NODE_HISTORY_SENTINEL');
  expect(prompt).not.toContain('UNTRUSTED_SOURCE_DATA_JSON');
  await page.getByLabel('Ask your tutor').fill('Свой вопрос про атомарность');
  await page.getByLabel('Active course').selectOption('second-course');
  await expect(page.getByRole('region', { name: 'Понятие с карты' })).not.toBeVisible();
  await expect(page.getByLabel('Ask your tutor')).toHaveValue('');
  await page.getByLabel('Active course').selectOption(state.courses[0].id);
  await expect(page.getByLabel('Ask your tutor')).toHaveValue('Свой вопрос про атомарность');
  await expect(page.getByRole('region', { name: 'Понятие с карты' })).toContainText('Атомарность');
  await page.getByRole('button', { name: 'Убрать понятие', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Понятие с карты' })).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'Транзакции', exact: true })).toBeVisible();
  await expect(page.getByLabel('Ask your tutor')).toHaveValue('Свой вопрос про атомарность');
  await page.getByLabel('Active workspace').selectOption('private-space');
  await page.getByRole('button', { name: 'Репетитор', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Понятие с карты' })).not.toBeVisible();
  await expect(page.getByLabel('Ask your tutor')).toHaveValue('');
  expect(requests).toBe(1);
});

test('a late answer keeps its original node and cannot clear a new map question', async ({
  page,
}) => {
  const state = fixture(false);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route('**/ollama/api/chat', async (route) => {
    requests++;
    await gate;
    await route.fulfill({ json: { message: { content: 'Ответ только об атомарности.' } } });
  });
  await seed(page, state);
  await selectLocked(page);
  await page.getByRole('button', { name: 'Почему это связано?', exact: true }).click();
  await page.getByRole('button', { name: 'Send question' }).click();
  await expect.poll(() => requests).toBe(1);
  await page.getByRole('button', { name: 'Вернуться к карте', exact: true }).click();
  await page.getByLabel('Выбранное понятие карты').selectOption('base');
  await page.getByRole('button', { name: 'Объясни на примере', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Send question' })).toBeDisabled();
  release();
  await expect(page.getByRole('button', { name: 'Send question' })).toBeEnabled();
  await expect(page.getByLabel('Ask your tutor')).toHaveValue(/«Транзакции» на простом примере/);
  await expect(page.getByRole('region', { name: 'Понятие с карты' })).toContainText('Транзакции');
  await expect(page.locator('.messages')).not.toContainText('Ответ только об атомарности.');
  const after = await read(page);
  expect(after.messages.find((m) => m.content === 'Ответ только об атомарности.')?.topicId).toBe(
    'locked',
  );
  expect(after.attempts).toEqual([]);
  expect(requests).toBe(1);
});

test('sources-only empty evidence spends no inference and an empty map keeps its existing action', async ({
  page,
}) => {
  const state = fixture();
  state.topics.find((t) => t.id === 'locked')!.citations = [];
  state.sources[0].pages = [{ page: 7, text: 'Unrelated.' }];
  let requests = 0;
  await page.route('**/ollama/api/chat', (route) => {
    requests++;
    return route.abort();
  });
  await seed(page, state);
  await selectLocked(page);
  await page.getByRole('button', { name: 'Почему это связано?', exact: true }).click();
  await page.getByRole('button', { name: 'Send question' }).click();
  await expect(page.locator('.message.assistant')).toContainText('No matching passages');
  expect(requests).toBe(0);
  await page.getByRole('button', { name: 'Вернуться к карте', exact: true }).click();
  await page.getByLabel('Active course').selectOption('second-course');
  await page.evaluate((storageKey) => {
    const data = JSON.parse(localStorage.getItem(storageKey)!);
    data.topics = data.topics.filter((t: { courseId: string }) => t.courseId !== 'second-course');
    localStorage.setItem(storageKey, JSON.stringify(data));
  }, key);
  await page.reload();
  await page.getByRole('button', { name: 'Карта знаний', exact: true }).click();
  await page.getByLabel('Active course').selectOption('second-course');
  await expect(page.getByRole('heading', { name: 'Начните с одной связи' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Добавить понятие', exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Почему это связано?', exact: true }),
  ).not.toBeVisible();
});
