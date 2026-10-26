import { expect, test, type Page } from '@playwright/test';
import { emptyWorkspace, type Workspace } from '../src/types/state';
import { createCourse } from '../src/learning/courses';
import { defaultWorkspace } from '../src/types/sources';
import { newCard } from '../src/learning/reviews';
const key = 'conceptloom-desktop-preview-v1';
function fixture() {
  const state = emptyWorkspace(),
    now = new Date().toISOString();
  state.settings.onboardingComplete = true;
  state.workspaces.push({ ...defaultWorkspace(), id: 'other', name: 'Другое пространство' });
  state.courses = [
    createCourse({
      name: 'Базы данных',
      goal: 'Понять',
      knowledge: '',
      currentLevel: 'Beginner',
      targetLevel: 'Apply',
      explanationLanguage: 'Russian',
    }),
  ];
  state.courses[0].sourceScope = { kind: 'selected', sourceIds: ['a', 'b'] };
  state.courses[0].sourceMode = 'mixed';
  state.libraries = [
    { id: 'lib', workspaceId: state.activeWorkspaceId, name: 'Лекции', createdAt: now },
    { id: 'private-lib', workspaceId: 'other', name: 'Private', createdAt: now },
  ];
  state.sources = [
    {
      id: 'a',
      workspaceId: state.activeWorkspaceId,
      libraryIds: ['lib'],
      courseIds: [],
      title: 'Atomicity.pdf',
      type: 'pdf',
      importedAt: now,
      tags: [],
      pages: [
        { page: 1, text: 'UNRELATED_PAGE_SENTINEL' },
        ...Array.from({ length: 7 }, (_, i) => ({
          page: i + 7,
          text: `Atomicity means all operations commit or none apply. A rollback undoes a failed transaction. Example ${i}.`,
        })),
      ],
    },
    {
      id: 'b',
      workspaceId: state.activeWorkspaceId,
      libraryIds: ['lib'],
      courseIds: [],
      title: 'Isolation.pdf',
      type: 'pdf',
      importedAt: now,
      tags: [],
      pages: [
        { page: 18, text: 'Isolation separates concurrent transactions from uncommitted changes.' },
      ],
    },
    {
      id: 'unselected',
      workspaceId: state.activeWorkspaceId,
      libraryIds: ['lib'],
      courseIds: [],
      title: 'Другой материал',
      type: 'pasted',
      importedAt: now,
      tags: [],
      pages: [{ page: null, text: 'UNSELECTED_PRIVATE_SENTINEL Atomicity Isolation' }],
    },
    {
      id: 'foreign',
      workspaceId: 'other',
      libraryIds: ['private-lib'],
      courseIds: [],
      title: 'PRIVATE_OTHER_SOURCE',
      type: 'pasted',
      importedAt: now,
      tags: [],
      pages: [{ page: null, text: 'FOREIGN_PRIVATE_SENTINEL Atomicity Isolation' }],
    },
  ];
  state.cards = [newCard(state.courses[0].id, null, 'Existing question', 'Existing answer')];
  return state;
}
async function seed(page: Page, state = fixture()) {
  await page.addInitScript((value) => {
    if (!localStorage.getItem('conceptloom-desktop-preview-v1'))
      localStorage.setItem('conceptloom-desktop-preview-v1', JSON.stringify(value));
  }, state);
  await page.route('**/ollama/api/tags', (route) => route.fulfill({ json: { models: [] } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Репетитор', exact: true }).click();
}
const modal = (page: Page) => page.getByRole('dialog', { name: 'Сравнить понятия', exact: true });
const read = (page: Page): Promise<Workspace> =>
  page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), key);
async function open(page: Page) {
  await page.getByRole('button', { name: 'Сравнить понятия', exact: true }).click();
}
async function inputs(page: Page, a = 'Atomicity', b = 'Isolation') {
  await modal(page).getByLabel('Первое понятие', { exact: true }).fill(a);
  await modal(page).getByLabel('Второе понятие', { exact: true }).fill(b);
}
function response(aId: string, bId?: string) {
  return {
    rows: ['Определение', 'Механизм', 'Применение'].map((criterion, i) => ({
      criterion,
      a: { text: 'Все операции применяются целиком или отменяются.', citationIds: [aId] },
      b:
        bId && i !== 2
          ? { text: 'Параллельные транзакции отделены друг от друга.', citationIds: [bId] }
          : { text: null, citationIds: [] },
    })),
    applicationQuestion: 'Какое свойство предотвращает частично выполненный перевод денег?',
  };
}
async function mock(page: Page, options: { invalid?: boolean; gate?: Promise<void> } = {}) {
  const prompts: string[] = [];
  await page.route('**/ollama/api/chat', async (route) => {
    const body = route.request().postDataJSON();
    prompts.push(JSON.stringify(body));
    const chunks = JSON.parse(
      body.messages
        .find((m: { content: string }) => m.content.startsWith('UNTRUSTED_SOURCE_DATA_JSON'))
        .content.split('\n')[1],
    );
    const a = chunks.find((c: { text: string }) => c.text.includes('Atomicity'));
    const b = chunks.find((c: { text: string }) => c.text.includes('Isolation'));
    if (options.gate) await options.gate;
    await route.fulfill({
      json: {
        message: {
          content: JSON.stringify(response(options.invalid ? 'foreign:0' : a.chunkId, b?.chunkId)),
        },
      },
    });
  });
  return prompts;
}
async function generate(page: Page) {
  await modal(page).getByRole('button', { name: 'Сравнить по источникам', exact: true }).click();
}
async function saved(page: Page) {
  await expect(
    modal(page).getByText('Сравнение записано в беседу.', { exact: true }),
  ).toBeVisible();
}

test('two independently grounded columns → missing criterion → atomic history → P2 bookmark/reopen with canonical citations and themes', async ({
  page,
}) => {
  const state = fixture(),
    prompts = await mock(page);
  await seed(page, state);
  await open(page);
  await expect(modal(page).locator('summary')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(modal(page).getByRole('button', { name: 'Закрыть сравнение' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(modal(page).locator('summary')).toBeFocused();
  await expect(modal(page).getByLabel('Atomicity.pdf', { exact: true })).toBeChecked();
  await expect(modal(page).getByLabel('Другой материал', { exact: true })).not.toBeChecked();
  await expect(modal(page)).not.toContainText('PRIVATE_OTHER_SOURCE');
  expect(prompts).toHaveLength(0);
  await inputs(page);
  await generate(page);
  await saved(page);
  expect(prompts).toHaveLength(1);
  for (const sentinel of [
    'FOREIGN_PRIVATE_SENTINEL',
    'UNSELECTED_PRIVATE_SENTINEL',
    'UNRELATED_PAGE_SENTINEL',
  ])
    expect(prompts[0]).not.toContain(sentinel);
  await expect(modal(page)).toContainText('Atomicity — 3; Isolation — 1');
  await expect(
    modal(page).getByRole('region', { name: 'Критерий 3' }).locator('.comparison-missing'),
  ).toContainText('Поиск не нашёл подтверждения');
  const first = modal(page).getByRole('region', { name: 'Критерий 1' });
  await first.getByRole('button', { name: 'Isolation.pdf · с. 18', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Source excerpt' })).toContainText(
    state.sources[1].pages[0].text,
  );
  await page.keyboard.press('Escape');
  await modal(page)
    .locator('.source-comparison')
    .evaluate((el) => el.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/source-comparison-p6.png', animations: 'disabled' });
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'light';
  });
  expect(
    await modal(page)
      .locator('.source-comparison')
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.screenshot({
    path: 'test-results/source-comparison-p6-light.png',
    animations: 'disabled',
  });
  await modal(page).getByRole('button', { name: 'Сохранить объяснение' }).click();
  await expect(modal(page).getByRole('button', { name: 'Убрать из сохранённых' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const result = await read(page);
  expect(result.messages).toHaveLength(2);
  expect(result.messages[1].replyTo).toBe(result.messages[0].id);
  expect(result.messages[1].citations?.map((c) => c.page)).toEqual([7, 18]);
  for (const collection of [
    'cards',
    'reviews',
    'attempts',
    'sessions',
    'topics',
    'sources',
    'courses',
  ] as const)
    expect([...result[collection]].sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      [...state[collection]].sort((a, b) => a.id.localeCompare(b.id)),
    );
  await modal(page).getByRole('button', { name: 'Вернуться в беседу' }).click();
  await expect(page.locator('.message.assistant')).toContainText(
    'Сравнение: Atomicity ↔ Isolation',
  );
  await page.reload();
  await page.getByRole('button', { name: 'Учебный центр', exact: true }).click();
  await expect(page.locator('.saved-explanation-card')).toHaveCount(1);
  await page.locator('.saved-explanation-card').click();
  const explanation = page.getByRole('dialog', { name: 'Сохранённое объяснение', exact: true });
  await expect(explanation).toContainText('Поиск не нашёл подтверждения');
  await expect(explanation).toContainText('Вопрос на применение (без оценки)');
  expect(prompts).toHaveLength(1);
});

test('one-sided missing evidence stays empty in mixed tutor mode; both no-hits spend zero inference', async ({
  page,
}) => {
  const prompts = await mock(page);
  await seed(page);
  await open(page);
  await inputs(page, 'Atomicity', 'Photosynthesis');
  await generate(page);
  await saved(page);
  await expect(modal(page).locator('.comparison-missing')).toHaveCount(3);
  expect((await read(page)).messages[1].citations).toHaveLength(1);
  expect(prompts).toHaveLength(1);
  await modal(page).getByRole('button', { name: 'Новое сравнение' }).click();
  await inputs(page, 'Mitosis', 'Photosynthesis');
  await generate(page);
  await saved(page);
  await expect(modal(page).locator('.comparison-missing')).toHaveCount(6);
  expect(prompts).toHaveLength(1);
  const state = await read(page);
  expect(state.messages).toHaveLength(4);
  expect(state.messages[3].citations).toHaveLength(0);
  expect(state.courses[0].sourceMode).toBe('mixed');
  expect(state.reviews).toHaveLength(0);
});

test('a disk failure preserves the generated result and retries only the atomic write without duplicate messages', async ({
  page,
}) => {
  const prompts = await mock(page);
  await seed(page);
  await open(page);
  await inputs(page);
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
  await generate(page);
  await expect(
    modal(page).getByRole('alert').filter({ hasText: 'Сравнение не записано' }),
  ).toBeVisible();
  expect((await read(page)).messages).toHaveLength(0);
  await modal(page).getByRole('button', { name: 'Повторить запись в беседу' }).click();
  await saved(page);
  expect((await read(page)).messages).toHaveLength(2);
  expect(prompts).toHaveLength(1);
});

test('unknown citations are rejected; retry preserves terms and creates a single message pair', async ({
  page,
}) => {
  const options = { invalid: true },
    prompts = await mock(page, options);
  await seed(page);
  await open(page);
  await inputs(page);
  await generate(page);
  await expect(modal(page).getByRole('alert')).toContainText('Модель вернула неверный ответ');
  expect((await read(page)).messages).toHaveLength(0);
  await expect(modal(page).getByLabel('Первое понятие')).toHaveValue('Atomicity');
  options.invalid = false;
  await generate(page);
  await saved(page);
  expect((await read(page)).messages).toHaveLength(2);
  expect(prompts).toHaveLength(2);
});

test('empty/equal concepts and no selection block requests before inference', async ({ page }) => {
  const state = fixture();
  state.courses[0].sourceScope = { kind: 'none' };
  const prompts = await mock(page);
  await seed(page, state);
  await open(page);
  const button = modal(page).getByRole('button', { name: 'Сравнить по источникам' });
  await expect(button).toBeDisabled();
  await inputs(page, ' Atomicity ', 'atomicity');
  await expect(modal(page).getByRole('alert')).toContainText('два разных понятия');
  await modal(page).getByLabel('Atomicity.pdf', { exact: true }).check();
  await expect(button).toBeDisabled();
  await inputs(page);
  await expect(button).toBeEnabled();
  await modal(page).getByLabel('Atomicity.pdf', { exact: true }).uncheck();
  await expect(button).toBeDisabled();
  expect(prompts).toHaveLength(0);
  expect((await read(page)).messages).toHaveLength(0);
});

test('empty library offers the existing import flow without inference', async ({ page }) => {
  const state = fixture();
  state.sources = [];
  state.courses[0].sourceScope = { kind: 'none' };
  const prompts = await mock(page);
  await seed(page, state);
  await open(page);
  await expect(modal(page)).toContainText('Здесь пока нет источников');
  await modal(page).getByRole('button', { name: 'Добавить источники' }).click();
  await expect(
    page.getByRole('heading', { name: 'Предпросмотр источника', exact: true }),
  ).toBeVisible();
  expect(prompts).toHaveLength(0);
});

test('closing pending comparison discards late generation instead of saving/reopening', async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const prompts = await mock(page, { gate });
  await seed(page);
  await open(page);
  await inputs(page);
  await generate(page);
  await expect.poll(() => prompts.length).toBe(1);
  await page.keyboard.press('Escape');
  await expect(modal(page)).toHaveCount(0);
  const done = page.waitForResponse('**/ollama/api/chat');
  release();
  await done;
  await open(page);
  await expect(modal(page).getByRole('article', { name: 'Результат сравнения' })).toHaveCount(0);
  expect((await read(page)).messages).toHaveLength(0);
});

test('a comparison citation can hand off its exact passage to P1 without leaving a modal over the new draft', async ({
  page,
}) => {
  const prompts = await mock(page);
  await seed(page);
  await open(page);
  await inputs(page);
  await generate(page);
  await saved(page);
  await modal(page)
    .getByRole('region', { name: 'Критерий 1' })
    .getByRole('button', { name: 'Atomicity.pdf · с. 7', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: 'Source excerpt' })
    .getByRole('button', { name: 'Разобрать с репетитором' })
    .click();
  await expect(modal(page)).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Выбранный фрагмент' })).toContainText(
    'Atomicity.pdf · с. 7',
  );
  await expect(page.getByRole('textbox', { name: 'Ask your tutor' })).not.toHaveValue('');
  expect(prompts).toHaveLength(1);
});
