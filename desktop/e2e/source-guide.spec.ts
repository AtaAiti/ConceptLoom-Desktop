import { expect, test, type Page } from '@playwright/test';
import { emptyWorkspace, type Workspace } from '../src/types/state';
import { createCourse } from '../src/learning/courses';
const key = 'conceptloom-desktop-preview-v1';
function fixture() {
  const state = emptyWorkspace();
  state.settings.onboardingComplete = true;
  state.courses = [
    createCourse({
      name: 'Базы данных',
      goal: 'Понять транзакции',
      knowledge: '',
      currentLevel: 'Beginner',
      targetLevel: 'Apply',
      explanationLanguage: 'Russian',
    }),
  ];
  state.libraries = [
    {
      id: 'lib',
      workspaceId: state.activeWorkspaceId,
      name: 'Лекции',
      createdAt: new Date().toISOString(),
    },
  ];
  state.sources = [
    {
      id: 'lecture',
      workspaceId: state.activeWorkspaceId,
      libraryIds: ['lib'],
      courseIds: [],
      title: 'Лекция.pdf',
      type: 'pdf',
      importedAt: new Date().toISOString(),
      tags: [],
      pages: [
        { page: 1, text: 'OUTSIDE_PRIVATE_SENTINEL' },
        {
          page: 7,
          text:
            'Атомарность означает «всё или ничего»: операции применяются вместе. '.repeat(23) +
            'END_OF_CHOSEN_PAGE',
        },
        {
          page: 8,
          text: 'Откат отменяет изменения при сбое. Изоляция отделяет параллельные транзакции.',
        },
      ],
    },
  ];
  return state;
}
async function seed(page: Page, state = fixture()) {
  await page.addInitScript((value) => {
    if (!localStorage.getItem('conceptloom-desktop-preview-v1'))
      localStorage.setItem('conceptloom-desktop-preview-v1', JSON.stringify(value));
  }, state);
  await page.route('**/ollama/api/tags', (route) => route.fulfill({ json: { models: [] } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Источники', exact: true }).click();
}
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Обзор раздела', exact: true });
const read = (page: Page): Promise<Workspace> =>
  page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), key);
async function open(page: Page) {
  await page.getByRole('button', { name: 'Обзор раздела', exact: true }).click();
}
async function range(page: Page) {
  await dialog(page).getByLabel('С начала', { exact: true }).selectOption('1');
  await dialog(page).getByLabel('До конца', { exact: true }).selectOption('2');
}
function result(id: string) {
  return {
    points: [
      'Атомарность объединяет операции.',
      'При сбое изменения отменяются.',
      'Транзакция выполняется целиком.',
    ].map((text) => ({ text, citationIds: [id] })),
    terms: ['Атомарность', 'Транзакция', 'Операция'].map((term) => ({
      term,
      definition: 'Часть принципа «всё или ничего».',
      citationIds: [id],
    })),
    questions: [
      'Как работает принцип «всё или ничего»?',
      'Как применяются операции транзакции?',
      'Что означает атомарность?',
    ].map((text) => ({ text, citationIds: [id] })),
  };
}
async function mock(page: Page, options: { gate?: Promise<void>; invalid?: boolean } = {}) {
  const prompts: string[] = [];
  await page.route('**/ollama/api/chat', async (route) => {
    const body = route.request().postDataJSON();
    prompts.push(JSON.stringify(body));
    const chunks = JSON.parse(
      body.messages
        .find((m: { content: string }) => m.content.startsWith('UNTRUSTED_SOURCE_DATA_JSON'))
        .content.split('\n')[1],
    );
    expect(body.format.properties.points.items.properties.citationIds.items.enum).toEqual(
      chunks.map((c: { chunkId: string }) => c.chunkId),
    );
    if (options.gate) await options.gate;
    await route.fulfill({
      json: {
        message: {
          content: JSON.stringify(result(options.invalid ? 'invented:0' : chunks[0].chunkId)),
        },
      },
    });
  });
  return prompts;
}
test('complete bounded section → persisted guide → cache after reload → exact question draft and citation; dark/light layout', async ({
  page,
}) => {
  const state = fixture(),
    prompts = await mock(page);
  await seed(page, state);
  await open(page);
  expect(prompts).toHaveLength(0);
  await expect(dialog(page)).toContainText('Обзора пока нет');
  await range(page);
  await dialog(page).getByRole('button', { name: 'Создать обзор', exact: true }).click();
  await expect(dialog(page).getByRole('button', { name: 'Обзор уже сохранён' })).toBeDisabled();
  await expect(dialog(page)).toContainText('Разобраны только: с. 7, с. 8');
  expect(prompts).toHaveLength(1);
  expect(prompts[0]).not.toContain('OUTSIDE_PRIVATE_SENTINEL');
  expect(prompts[0]).toContain('END_OF_CHOSEN_PAGE');
  const saved = await read(page);
  expect(saved.sources[0].guide?.chunkIds.length).toBeGreaterThan(2);
  for (const collection of [
    'cards',
    'reviews',
    'attempts',
    'topics',
    'messages',
    'sessions',
  ] as const)
    expect(saved[collection]).toEqual(state[collection]);
  await dialog(page)
    .locator('.source-guide')
    .evaluate((el) => el.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/source-guide-p5.png', animations: 'disabled' });
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'light';
  });
  expect(
    await dialog(page)
      .locator('.source-guide')
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.screenshot({ path: 'test-results/source-guide-p5-light.png', animations: 'disabled' });
  await dialog(page).getByRole('button', { name: 'Закрыть обзор' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Источники', exact: true }).click();
  await open(page);
  await expect(dialog(page).getByRole('button', { name: 'Обзор уже сохранён' })).toBeDisabled();
  expect(prompts).toHaveLength(1);
  await dialog(page)
    .getByRole('button', { name: 'Лекция.pdf · с. 7', exact: true })
    .first()
    .click();
  await expect(page.getByRole('dialog', { name: 'Source excerpt' })).toContainText(
    'Атомарность означает',
  );
  await page.keyboard.press('Escape');
  await dialog(page)
    .getByRole('button', { name: 'Как работает принцип «всё или ничего»?', exact: true })
    .click();
  await expect(page.getByRole('textbox', { name: 'Ask your tutor' })).toHaveValue(
    'Как работает принцип «всё или ничего»?',
  );
  await expect(page.getByRole('region', { name: 'Выбранный фрагмент' })).toContainText('с. 7');
  expect(prompts).toHaveLength(1);
  expect((await read(page)).messages).toEqual(state.messages);
});
test('failed save keeps generated guide and retries without inference', async ({ page }) => {
  const prompts = await mock(page);
  await seed(page);
  await open(page);
  await range(page);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    let fail = true;
    Storage.prototype.setItem = function (key, value) {
      if (fail && key === 'conceptloom-desktop-preview-v1') {
        fail = false;
        throw new Error('Disk unavailable');
      }
      return original.call(this, key, value);
    };
  });
  await dialog(page).getByRole('button', { name: 'Создать обзор', exact: true }).click();
  await expect(
    dialog(page).getByRole('alert').filter({ hasText: 'Обзор не сохранён' }),
  ).toBeVisible();
  expect((await read(page)).sources[0].guide).toBeUndefined();
  await dialog(page).getByRole('button', { name: 'Сохранить обзор', exact: true }).click();
  await expect(dialog(page).getByRole('button', { name: 'Обзор уже сохранён' })).toBeDisabled();
  expect((await read(page)).sources[0].guide?.result.points).toHaveLength(3);
  expect(prompts).toHaveLength(1);
});
test('changed text shows stale historical guide, blocks old questions, and needs explicit regeneration; language invalidates cache', async ({
  page,
}) => {
  const prompts = await mock(page);
  await seed(page);
  await open(page);
  await range(page);
  await dialog(page).getByRole('button', { name: 'Создать обзор', exact: true }).click();
  await expect(dialog(page).getByRole('button', { name: 'Обзор уже сохранён' })).toBeDisabled();
  await page.evaluate((k) => {
    const state = JSON.parse(localStorage.getItem(k)!);
    state.sources[0].pages[0].text = 'Changed OUTSIDE selected pages';
    localStorage.setItem(k, JSON.stringify(state));
  }, key);
  await page.reload();
  await page.getByRole('button', { name: 'Источники', exact: true }).click();
  await open(page);
  await expect(dialog(page)).toContainText('Обзор устарел');
  await expect(
    dialog(page).getByRole('button', { name: 'Что означает атомарность?', exact: true }),
  ).toBeDisabled();
  expect(prompts).toHaveLength(1);
  await dialog(page).getByRole('button', { name: 'Создать новый обзор' }).click();
  await expect(dialog(page).getByRole('button', { name: 'Обзор уже сохранён' })).toBeDisabled();
  await dialog(page).getByLabel('Язык обзора').fill('English');
  await expect(dialog(page).getByRole('button', { name: 'Создать новый обзор' })).toBeEnabled();
  await dialog(page).getByRole('button', { name: 'Создать новый обзор' }).click();
  await expect(dialog(page).getByRole('button', { name: 'Обзор уже сохранён' })).toBeDisabled();
  expect((await read(page)).sources[0].guide?.outputLanguage).toBe('English');
  expect(prompts).toHaveLength(3);
  // Shortened/replaced documents keep honest historical coverage but get valid new controls.
  await page.evaluate((k) => {
    const state = JSON.parse(localStorage.getItem(k)!);
    state.sources[0].pages = [state.sources[0].pages[1]];
    localStorage.setItem(k, JSON.stringify(state));
  }, key);
  await page.reload();
  await page.getByRole('button', { name: 'Источники', exact: true }).click();
  await open(page);
  await expect(dialog(page)).toContainText('Обзор устарел');
  await expect(dialog(page)).toContainText('Разобраны только: с. 7, с. 8');
  await expect(dialog(page).getByLabel('С начала', { exact: true })).toHaveValue('0');
  await expect(dialog(page).getByLabel('До конца', { exact: true })).toHaveValue('0');
  await expect(dialog(page).getByLabel('Язык обзора')).toHaveValue('English');
  await expect(dialog(page).getByRole('button', { name: 'Создать новый обзор' })).toBeEnabled();
  expect(prompts).toHaveLength(3);
});
test('unreadable and oversized sections block inference; guide works without a course', async ({
  page,
}) => {
  const state = fixture();
  state.courses = [];
  state.sources[0].pages[0].text = ' ';
  state.sources[0].pages[2].text = 'x'.repeat(7201);
  const prompts = await mock(page);
  await seed(page, state);
  await open(page);
  await expect(dialog(page)).toContainText('без читаемого текста');
  await expect(
    dialog(page).getByRole('button', { name: 'Создать обзор', exact: true }),
  ).toBeDisabled();
  await range(page);
  await expect(dialog(page)).toContainText('Раздел слишком длинный');
  expect(prompts).toHaveLength(0);
  await dialog(page).getByLabel('До конца', { exact: true }).selectOption('1');
  await dialog(page).getByRole('button', { name: 'Создать обзор', exact: true }).click();
  await expect(dialog(page).getByRole('button', { name: 'Обзор уже сохранён' })).toBeDisabled();
  expect(prompts).toHaveLength(1);
  await dialog(page)
    .getByRole('button', { name: 'Что означает атомарность?', exact: true })
    .click();
  await expect(page.getByRole('dialog', { name: 'Разобрать фрагмент', exact: true })).toContainText(
    'Сначала создайте',
  );
});
test('unknown model citations reject output with retry and leave source unmodified', async ({
  page,
}) => {
  const prompts = await mock(page, { invalid: true });
  await seed(page);
  await open(page);
  await range(page);
  await dialog(page).getByRole('button', { name: 'Создать обзор', exact: true }).click();
  await expect(dialog(page).getByRole('alert')).toContainText('Модель вернула неверный ответ');
  await expect(
    dialog(page).getByRole('button', { name: 'Создать обзор', exact: true }),
  ).toBeEnabled();
  expect((await read(page)).sources[0].guide).toBeUndefined();
  expect(prompts).toHaveLength(1);
});
test('close during generation discards late result and does not save or reopen', async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const prompts = await mock(page, { gate });
  await seed(page);
  await open(page);
  await range(page);
  await dialog(page).getByRole('button', { name: 'Создать обзор', exact: true }).click();
  await expect.poll(() => prompts.length).toBe(1);
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
  const done = page.waitForResponse('**/ollama/api/chat');
  release();
  await done;
  await open(page);
  await expect(dialog(page)).toContainText('Обзора пока нет');
  expect((await read(page)).sources[0].guide).toBeUndefined();
});
