import { expect, test, type Page } from '@playwright/test';
import { emptyWorkspace, type Workspace } from '../src/types/state';
import { defaultWorkspace } from '../src/types/sources';
import { createCourse } from '../src/learning/courses';
import { pageChunks } from '../src/features/library/sourceIndex';

const storageKey = 'conceptloom-desktop-preview-v1';
function fixture() {
  const state = emptyWorkspace();
  state.settings.onboardingComplete = true;
  state.courses = [
    createCourse({
      name: 'Базы данных',
      goal: 'Разобраться',
      knowledge: '',
      currentLevel: 'Beginner',
      targetLevel: 'Apply',
      explanationLanguage: 'Russian',
    }),
  ];
  state.workspaces.push({ ...defaultWorkspace(), id: 'other-space', name: 'Другое пространство' });
  state.courses.push({
    ...state.courses[0],
    id: 'other-course',
    workspaceId: 'other-space',
    name: 'Другой курс',
  });
  state.libraries = [
    {
      id: 'lectures',
      workspaceId: state.activeWorkspaceId,
      name: 'Лекции',
      createdAt: new Date().toISOString(),
    },
  ];
  state.sources = [
    {
      id: 'lecture',
      workspaceId: state.activeWorkspaceId,
      libraryIds: ['lectures'],
      courseIds: [],
      title: 'Лекция.pdf',
      type: 'pdf',
      importedAt: new Date().toISOString(),
      tags: [],
      pages: [
        { page: 1, text: 'OTHER_PAGE_PRIVATE_SENTINEL' },
        {
          page: 7,
          text: 'Атомарность: все операции транзакции выполняются вместе либо не применяется ни одна. Сбой приводит к откату.',
        },
        {
          page: 8,
          text: Array.from(
            { length: 100 },
            (_, i) => `Раздел ${i}: независимый пример для проверки выбора фрагмента.`,
          ).join('\n'),
        },
      ],
    },
  ];
  return state;
}
async function seed(page: Page, state: Workspace) {
  await page.addInitScript((value) => {
    if (!localStorage.getItem('conceptloom-desktop-preview-v1'))
      localStorage.setItem('conceptloom-desktop-preview-v1', JSON.stringify(value));
  }, state);
  await page.route('**/ollama/api/tags', (route) => route.fulfill({ json: { models: [] } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Источники', exact: true }).click();
}
async function nextPage(page: Page) {
  await page
    .locator('.source-preview .source-page-controls')
    .getByRole('button', { name: '→', exact: true })
    .click();
}

test('page → tutor retains exact context and retry across reload without duplicates; citation and return work', async ({
  page,
}) => {
  const state = fixture();
  const requests: string[] = [];
  let fail = true;
  await page.route('**/ollama/api/chat', async (route) => {
    const body = route.request().postDataJSON();
    requests.push(JSON.stringify(body));
    if (fail) return route.fulfill({ status: 500, json: { error: 'offline' } });
    const sourceData = body.messages.find((m: { content: string }) =>
      m.content.startsWith('UNTRUSTED_SOURCE_DATA_JSON'),
    );
    const chunks = JSON.parse(sourceData.content.split('\n')[1]);
    expect(chunks).toHaveLength(1);
    await route.fulfill({
      json: {
        message: {
          content: JSON.stringify({
            sourceAnswer: 'Всё или ничего: при сбое применяется откат.',
            generalAnswer: '',
            citationIds: [chunks[0].chunkId],
          }),
        },
      },
    });
  });
  await seed(page, state);
  await nextPage(page);
  await page.getByRole('button', { name: 'Разобрать с репетитором', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Выбранный фрагмент' })).toContainText(
    'Лекция.pdf · с. 7',
  );
  expect(requests).toHaveLength(0);
  const input = page.getByRole('textbox', { name: 'Ask your tutor' });
  await input.fill('Объясни это проще');
  await page.getByRole('button', { name: 'Send question' }).click();
  await expect(page.getByRole('button', { name: 'Send question' })).toBeEnabled();
  await expect(input).toHaveValue('Объясни это проще');
  await expect(page.locator('.messages').getByRole('alert')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Репетитор', exact: true }).click();
  await expect(input).toHaveValue('Объясни это проще');
  await expect(page.getByRole('region', { name: 'Выбранный фрагмент' })).toContainText(
    state.sources[0].pages[1].text,
  );
  fail = false;
  await page.getByRole('button', { name: 'Send question' }).click();
  await expect(page.locator('.message.assistant')).toContainText('Всё или ничего');
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), storageKey);
  expect(saved.messages.filter((m: { role: string }) => m.role === 'user')).toHaveLength(1);
  expect(saved.messages.filter((m: { role: string }) => m.role === 'assistant')).toHaveLength(1);
  expect(saved.courses[0].sourceScope).toBeUndefined();
  expect(requests).toHaveLength(2);
  expect(requests.every((request) => !request.includes('OTHER_PAGE_PRIVATE_SENTINEL'))).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: 'test-results/source-tutor-p1.png',
    animations: 'disabled',
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Сменить тему' }).click();
  await page.setViewportSize({ width: 1000, height: 700 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: 'test-results/source-tutor-p1-light-1000.png',
    animations: 'disabled',
    fullPage: true,
  });
  await page
    .locator('.message.assistant')
    .getByRole('button', { name: 'Лекция.pdf · с. 7' })
    .click();
  const citation = page.getByRole('dialog', { name: 'Source excerpt' });
  await citation.getByRole('button', { name: 'Разобрать с репетитором' }).click();
  await expect(citation).not.toBeVisible();
  expect(requests).toHaveLength(2);
  await page.getByRole('button', { name: 'Вернуться к источнику' }).click();
  await expect(page.getByRole('dialog', { name: 'Предпросмотр источника' })).toContainText(
    state.sources[0].pages[1].text,
  );
  await page.getByRole('button', { name: 'Закрыть просмотр' }).click();
  await page.getByLabel('Active workspace').selectOption('other-space');
  await page.getByRole('button', { name: 'Репетитор', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Выбранный фрагмент' })).not.toBeVisible();
  await expect(input).toHaveValue('');
  await expect(page.locator('.messages')).not.toContainText('Объясни это проще');
});

test('long page requires an explicit fragment choice before opening a tutor draft', async ({
  page,
}) => {
  const state = fixture();
  let requests = 0;
  await page.route('**/ollama/api/chat', (route) => {
    requests++;
    return route.abort();
  });
  await seed(page, state);
  await nextPage(page);
  await nextPage(page);
  await page.getByRole('button', { name: 'Разобрать с репетитором' }).click();
  const dialog = page.getByRole('dialog', { name: 'Разобрать фрагмент' });
  await expect(dialog.getByRole('button', { name: 'Открыть репетитора' })).toBeDisabled();
  const choice = pageChunks(state.sources[0], 2).at(-1)!;
  await dialog.getByLabel('Фрагмент страницы').selectOption(choice.id);
  await expect(dialog.locator('.handoff-excerpt')).toHaveText(choice.text);
  await dialog.getByRole('button', { name: 'Открыть репетитора' }).click();
  await expect(
    page.getByRole('region', { name: 'Выбранный фрагмент' }).locator('.handoff-excerpt'),
  ).toHaveText(choice.text);
  expect(requests).toBe(0);
});

for (const change of ['changed', 'deleted'] as const)
  test(`a ${change} source blocks restored context before inference`, async ({ page }) => {
    let requests = 0;
    await page.route('**/ollama/api/chat', (route) => {
      requests++;
      return route.fulfill({ status: 500, json: {} });
    });
    await seed(page, fixture());
    await nextPage(page);
    await page.getByRole('button', { name: 'Разобрать с репетитором' }).click();
    await page.getByRole('button', { name: 'Send question' }).click();
    await expect(page.locator('.messages').getByRole('alert')).toBeVisible();
    await page.evaluate(
      ({ change, key }) => {
        const value = JSON.parse(localStorage.getItem(key)!);
        if (change === 'changed') value.sources[0].pages[1].text = 'Другой текст';
        else value.sources = [];
        localStorage.setItem(key, JSON.stringify(value));
      },
      { change, key: storageKey },
    );
    await page.reload();
    await page.getByRole('button', { name: 'Репетитор', exact: true }).click();
    await expect(
      page.getByRole('region', { name: 'Выбранный фрагмент' }).getByRole('alert'),
    ).toContainText('Выберите фрагмент заново');
    await expect(page.getByRole('button', { name: 'Send question' })).toBeDisabled();
    expect(requests).toBe(1);
  });

test('a source without a course offers course creation without spending inference', async ({
  page,
}) => {
  const state = fixture();
  state.courses = [];
  await seed(page, state);
  await page.getByRole('button', { name: 'Разобрать с репетитором' }).click();
  const dialog = page.getByRole('dialog', { name: 'Разобрать фрагмент' });
  await expect(dialog).toContainText('Сначала создайте учебное направление');
  await expect(dialog.getByRole('button', { name: 'Создать направление' })).toBeVisible();
});

test('navigation preserves a running request and a late answer never clears a newer fragment draft', async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route('**/ollama/api/chat', async (route) => {
    requests++;
    const body = route.request().postDataJSON();
    const chunks = JSON.parse(
      body.messages
        .find((m: { content: string }) => m.content.startsWith('UNTRUSTED_SOURCE_DATA_JSON'))
        .content.split('\n')[1],
    );
    await gate;
    await route.fulfill({
      json: {
        message: {
          content: JSON.stringify({
            sourceAnswer: 'Ответ на первый вопрос.',
            generalAnswer: '',
            citationIds: [chunks[0].chunkId],
          }),
        },
      },
    });
  });
  await seed(page, fixture());
  await nextPage(page);
  await page.getByRole('button', { name: 'Разобрать с репетитором' }).click();
  await page.getByRole('textbox', { name: 'Ask your tutor' }).fill('Первый запрос ещё выполняется');
  await page.getByRole('button', { name: 'Send question' }).click();
  await expect.poll(() => requests).toBe(1);
  await page.getByRole('button', { name: 'Источники', exact: true }).click();
  await page.getByRole('button', { name: 'Разобрать с репетитором' }).click();
  await expect(page.getByRole('region', { name: 'Выбранный фрагмент' })).toContainText(
    'OTHER_PAGE_PRIVATE_SENTINEL',
  );
  await expect(page.getByRole('button', { name: 'Send question' })).toBeDisabled();
  release();
  await expect(page.locator('.message.assistant')).toContainText('Ответ на первый вопрос');
  await expect(page.getByRole('button', { name: 'Send question' })).toBeEnabled();
  await expect(page.getByRole('textbox', { name: 'Ask your tutor' })).toHaveValue(
    'Помоги разобрать этот фрагмент: объясни главную мысль и задай один вопрос для проверки понимания.',
  );
  await expect(page.getByRole('region', { name: 'Выбранный фрагмент' })).toContainText(
    'OTHER_PAGE_PRIVATE_SENTINEL',
  );
  expect(requests).toBe(1);
});
