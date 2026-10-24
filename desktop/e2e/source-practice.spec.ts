import { expect, test, type Page } from '@playwright/test';
import { emptyWorkspace, type Workspace } from '../src/types/state';
import { defaultWorkspace } from '../src/types/sources';
import { createCourse } from '../src/learning/courses';
import { newCard } from '../src/learning/reviews';
const storageKey = 'conceptloom-desktop-preview-v1';
test.setTimeout(60000);
function fixture() {
  const state = emptyWorkspace();
  state.settings.onboardingComplete = true;
  const course = createCourse({
    name: 'Базы данных',
    goal: 'Понять транзакции',
    knowledge: '',
    currentLevel: 'Beginner',
    targetLevel: 'Apply',
    explanationLanguage: 'Russian',
  });
  state.workspaces.push({ ...defaultWorkspace(), id: 'other', name: 'Другое пространство' });
  state.courses = [
    course,
    { ...course, id: 'second-course', name: 'Алгоритмы' },
    { ...course, id: 'private', workspaceId: 'other', name: 'PRIVATE_COURSE' },
  ];
  state.topics = [
    {
      id: 'topic',
      courseId: course.id,
      title: 'Атомарность',
      description: '',
      dependsOn: [],
      approved: true,
    },
    {
      id: 'second-topic',
      courseId: 'second-course',
      title: 'Алгоритм',
      description: '',
      dependsOn: [],
      approved: true,
    },
  ];
  state.libraries = [
    {
      id: 'lib',
      workspaceId: state.activeWorkspaceId,
      name: 'Лекции',
      createdAt: course.createdAt,
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
      importedAt: course.createdAt,
      tags: [],
      pages: [
        { page: 1, text: 'OTHER_PAGE_PRIVATE_SENTINEL' },
        {
          page: 7,
          text: 'Атомарность — всё или ничего: операции транзакции выполняются вместе. При сбое откат отменяет изменения.',
        },
      ],
    },
  ];
  state.cards = [
    {
      ...newCard(course.id, null, 'Что такое атомарность?', 'Старая карточка'),
      due: '2099-01-01T00:00:00.000Z',
      reps: 4,
      stability: 20,
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
const dialog = (page: Page) =>
  page.getByRole('dialog', { name: 'Карточки из фрагмента', exact: true });
const trigger = (page: Page) =>
  page.getByRole('button', { name: 'Закрепить · 2 карточки', exact: true });
const read = (page: Page): Promise<Workspace> =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), storageKey);
function response(chunkId: string) {
  return {
    cards: [
      { front: 'Что такое атомарность?', back: 'Всё или ничего.', citationIds: [chunkId] },
      { front: 'Что делает откат?', back: 'Отменяет изменения при сбое.', citationIds: [chunkId] },
    ],
  };
}
async function mock(page: Page) {
  const prompts: string[] = [];
  await page.route('**/ollama/api/chat', (route) => {
    const body = route.request().postDataJSON();
    prompts.push(JSON.stringify(body));
    const chunks = JSON.parse(
      body.messages
        .find((m: { content: string }) => m.content.startsWith('UNTRUSTED_SOURCE_DATA_JSON'))
        .content.split('\n')[1],
    );
    expect(chunks).toHaveLength(1);
    return route.fulfill({
      json: { message: { content: JSON.stringify(response(chunks[0].chunkId)) } },
    });
  });
  return prompts;
}

test('one request → two editable drafts → choose one → reload → citation and FSRS review; old schedules and mastery remain intact', async ({
  page,
}) => {
  const state = fixture();
  const prompts = await mock(page);
  await seed(page, state);
  await nextPage(page);
  await trigger(page).click();
  const modal = dialog(page);
  await expect(modal.getByLabel('Понятие для карточек')).toHaveValue('');
  await expect(modal.getByRole('button', { name: 'Закрыть', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(modal.getByRole('button', { name: 'Создать 2 карточки' })).toBeFocused();
  expect(prompts).toHaveLength(0);
  await modal.getByRole('button', { name: 'Создать 2 карточки' }).click();
  await expect(modal.getByRole('group', { name: 'Карточка 1', exact: true })).toBeVisible();
  expect((await read(page)).cards).toEqual(state.cards);
  await expect(modal).toContainText('Похожий вопрос уже есть');
  await modal.locator('.source-practice').evaluate((element) => element.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/source-practice-p4.png', animations: 'disabled' });
  const first = modal.getByRole('group', { name: 'Карточка 1', exact: true });
  const second = modal.getByRole('group', { name: 'Карточка 2', exact: true });
  await first
    .getByLabel('Лицевая сторона · вопрос')
    .fill('Как транзакция обеспечивает «всё или ничего»?');
  await first
    .getByLabel('Обратная сторона · ответ')
    .fill('Все операции применяются вместе; при сбое изменения отменяются.');
  await second.getByLabel('Добавить карточку 2').uncheck();
  await second.getByLabel('Обратная сторона · ответ').fill('');
  await first.getByLabel('Добавить карточку 1').uncheck();
  await expect(modal.getByRole('button', { name: 'Добавить в повторение (0)' })).toBeDisabled();
  await first.getByLabel('Добавить карточку 1').check();
  await page.setViewportSize({ width: 1000, height: 700 });
  // Theme change through persisted app state is covered by the existing theme tests.
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'light';
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await modal.locator('.source-practice').evaluate((element) => element.scrollTo(0, 0));
  await page.screenshot({
    path: 'test-results/source-practice-p4-light-1000.png',
    animations: 'disabled',
  });
  await modal.getByRole('button', { name: 'Добавить в повторение (1)' }).click();
  await expect(modal.getByRole('status')).toContainText('Сохранено: 1');
  await modal.getByRole('button', { name: 'Открыть карточки' }).click();
  await expect(
    page.getByRole('heading', { name: 'Как транзакция обеспечивает «всё или ничего»?' }),
  ).toBeVisible();
  const saved = await read(page);
  const card = saved.cards.find((c) => c.createdBy === 'ai')!;
  expect(saved.cards).toHaveLength(2);
  expect(card.topicId).toBeNull();
  expect(card.reps).toBe(0);
  expect(card.stability).toBe(0);
  expect(new Date(card.due).getTime()).toBeLessThanOrEqual(Date.now());
  expect(saved.cards.find((c) => c.id === state.cards[0].id)).toEqual(state.cards[0]);
  expect(card.citations?.[0]).toMatchObject({
    sourceId: 'lecture',
    page: 7,
    excerpt: state.sources[0].pages[1].text,
  });
  for (const key of ['attempts', 'reviews', 'sessions', 'topics', 'lessons', 'sources'] as const)
    expect(saved[key]).toEqual(state[key]);
  expect(prompts).toHaveLength(1);
  expect(prompts[0]).not.toContain('OTHER_PAGE_PRIVATE_SENTINEL');
  expect(prompts[0]).not.toContain('PRIVATE_COURSE');
  await page.reload();
  await page.getByRole('button', { name: 'Повторение', exact: true }).click();
  await expect(page.getByRole('heading', { name: card.front, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Открыть ответ', exact: true }).click();
  await expect(page.locator('.review-answer')).toContainText(card.back);
  await page.getByRole('button', { name: 'Лекция.pdf · с. 7', exact: true }).click();
  const citation = page.getByRole('dialog', { name: 'Source excerpt' });
  await expect(citation).toContainText(state.sources[0].pages[1].text);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Хорошо/ }).click();
  const reviewed = await read(page);
  expect(reviewed.cards.find((c) => c.id === card.id)?.reps).toBe(1);
  expect(reviewed.reviews.filter((r) => r.cardId === card.id)).toHaveLength(1);
});

test('failed save retains edited drafts and retries without regeneration or duplicate cards; optional topic belongs to destination', async ({
  page,
}) => {
  const state = fixture();
  const prompts = await mock(page);
  await seed(page, state);
  await nextPage(page);
  await trigger(page).click();
  const modal = dialog(page);
  await modal.getByLabel('Направление для карточек').selectOption('second-course');
  await expect(
    modal.getByLabel('Понятие для карточек').getByRole('option', { name: 'Атомарность' }),
  ).toHaveCount(0);
  await modal.getByLabel('Понятие для карточек').selectOption('second-topic');
  await modal.getByRole('button', { name: 'Создать 2 карточки' }).click();
  const first = modal.getByRole('group', { name: 'Карточка 1', exact: true });
  await first.getByLabel('Обратная сторона · ответ').fill('Мой отредактированный ответ');
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
  await modal.getByRole('button', { name: 'Добавить в повторение (2)' }).click();
  await expect(modal.getByRole('alert')).toContainText('Disk unavailable');
  await expect(first.getByLabel('Обратная сторона · ответ')).toHaveValue(
    'Мой отредактированный ответ',
  );
  expect((await read(page)).cards).toHaveLength(1);
  await modal.getByRole('button', { name: 'Добавить в повторение (2)' }).evaluate((button) => {
    (button as HTMLElement).click();
    (button as HTMLElement).click();
  });
  await expect(modal.getByRole('status')).toContainText('Сохранено: 2');
  const saved = await read(page);
  expect(saved.cards.filter((c) => c.createdBy === 'ai')).toHaveLength(2);
  expect(
    saved.cards
      .filter((c) => c.createdBy === 'ai')
      .every((c) => c.courseId === 'second-course' && c.topicId === 'second-topic' && c.reps === 0),
  ).toBe(true);
  expect(saved.attempts).toEqual([]);
  expect(prompts).toHaveLength(1);
});

test('invalid JSON or foreign citation never creates drafts; explicit retry can recover', async ({
  page,
}) => {
  let requests = 0;
  await page.route('**/ollama/api/chat', (route) => {
    requests++;
    return route.fulfill({
      json: {
        message: {
          content: JSON.stringify(
            requests === 1
              ? { cards: [{ front: 'One', back: 'Only', citationIds: ['lecture:1'] }] }
              : requests === 2
                ? response('invented')
                : response('lecture:1'),
          ),
        },
      },
    });
  });
  await seed(page, fixture());
  await nextPage(page);
  await trigger(page).click();
  const modal = dialog(page);
  for (let i = 0; i < 2; i++) {
    await modal.getByRole('button', { name: 'Создать 2 карточки' }).click();
    await expect(modal.getByRole('alert')).toBeVisible();
    await expect(modal.getByRole('group', { name: 'Карточка 1', exact: true })).toHaveCount(0);
    expect((await read(page)).cards).toHaveLength(1);
  }
  await modal.getByRole('button', { name: 'Создать 2 карточки' }).click();
  await expect(modal.getByRole('group', { name: 'Карточка 1', exact: true })).toBeVisible();
  expect(requests).toBe(3);
});

test('long/empty page, missing course and stale citation have explicit states before inference', async ({
  page,
}) => {
  const state = fixture();
  state.sources[0].pages[0].text = 'Длинный фрагмент. '.repeat(150);
  const prompts = await mock(page);
  await seed(page, state);
  await trigger(page).click();
  const modal = dialog(page);
  await expect(modal.getByRole('button', { name: 'Создать 2 карточки' })).toBeDisabled();
  await modal.getByLabel('Фрагмент для карточек').selectOption({ index: 2 });
  await expect(modal.getByRole('button', { name: 'Создать 2 карточки' })).toBeEnabled();
  await page.keyboard.press('Escape');
  expect(prompts).toHaveLength(0);
  await page.evaluate((key) => {
    const state = JSON.parse(localStorage.getItem(key)!);
    state.courses = [];
    state.topics = [];
    state.cards = [];
    state.sources[0].pages[0].text = '';
    localStorage.setItem(key, JSON.stringify(state));
  }, storageKey);
  await page.reload();
  await page.getByRole('button', { name: 'Источники', exact: true }).click();
  await trigger(page).click();
  await expect(modal).toContainText('нет читаемого текста');
  await expect(
    modal.getByRole('button', { name: 'Создать направление', exact: true }),
  ).toBeVisible();
  expect(prompts).toHaveLength(0);
});

test('cancelling pending generation discards late drafts and source preview/citation use the same entry point', async ({
  page,
}) => {
  const state = fixture();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route('**/ollama/api/chat', async (route) => {
    requests++;
    await gate;
    await route.fulfill({ json: { message: { content: JSON.stringify(response('lecture:1')) } } });
  });
  await seed(page, state);
  await nextPage(page);
  await page.getByRole('button', { name: 'Открыть фрагмент', exact: true }).click();
  const preview = page.getByRole('dialog', { name: 'Предпросмотр источника', exact: true });
  await preview.getByRole('button', { name: 'Закрепить · 2 карточки' }).click();
  await expect(preview).not.toBeVisible();
  await dialog(page).getByRole('button', { name: 'Создать 2 карточки' }).click();
  await expect.poll(() => requests).toBe(1);
  await dialog(page).getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.getByLabel('Active workspace').selectOption('other');
  release();
  await page.getByRole('button', { name: 'Источники', exact: true }).click();
  await expect(dialog(page)).not.toBeVisible();
  await expect(page.locator('.practice-draft')).toHaveCount(0);
  expect((await read(page)).cards).toHaveLength(1);
});

for (const stale of [false, true]) {
  test(`citation entry preserves exact passage; stale=${stale} is validated before inference`, async ({
    page,
  }) => {
    const state = fixture();
    state.messages = [
      {
        id: 'answer',
        courseId: state.courses[0].id,
        role: 'assistant',
        content: 'Атомарность — всё или ничего.',
        createdAt: state.courses[0].createdAt,
        citations: [
          {
            sourceId: 'lecture',
            chunkId: 'lecture:1',
            title: 'Лекция.pdf',
            page: 7,
            excerpt: state.sources[0].pages[1].text,
          },
        ],
      },
    ];
    if (stale) state.sources[0].pages[1].text = 'Новая редакция источника.';
    const prompts = await mock(page);
    await seed(page, state);
    await page.getByRole('button', { name: 'Репетитор', exact: true }).click();
    await page
      .locator('.message.assistant')
      .getByRole('button', { name: 'Лекция.pdf · с. 7', exact: true })
      .click();
    const citation = page.getByRole('dialog', { name: 'Source excerpt' });
    await citation.getByRole('button', { name: 'Закрепить · 2 карточки' }).click();
    await expect(citation).not.toBeVisible();
    const modal = dialog(page);
    if (stale) {
      await expect(modal.getByRole('alert')).toContainText('фрагмент изменился');
      await expect(modal.getByRole('button', { name: 'Создать 2 карточки' })).toBeDisabled();
      expect(prompts).toHaveLength(0);
    } else {
      await expect(modal.getByLabel('Исходный фрагмент')).toContainText(
        state.sources[0].pages[1].text,
      );
      await modal.getByRole('button', { name: 'Создать 2 карточки' }).click();
      await expect(modal.getByRole('group', { name: 'Карточка 1', exact: true })).toBeVisible();
      expect(prompts).toHaveLength(1);
    }
    expect((await read(page)).cards).toHaveLength(1);
  });
}
