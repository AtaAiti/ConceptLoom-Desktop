import { expect, test, type Page } from '@playwright/test';
import { emptyWorkspace, type Workspace } from '../src/types/state';
import { defaultWorkspace } from '../src/types/sources';
import { createCourse } from '../src/learning/courses';
import { newCard } from '../src/learning/reviews';

const storageKey = 'conceptloom-desktop-preview-v1';
const date = '2026-10-25T10:00:00.000Z';
test.setTimeout(45000);
function fixture(saved = false) {
  const state = emptyWorkspace();
  state.settings.onboardingComplete = true;
  state.workspaces.push({ ...defaultWorkspace(), id: 'other-space', name: 'Другое пространство' });
  state.courses = ['Базы данных', 'Алгоритмы', 'Чужой курс'].map((name, i) =>
    createCourse({
      name,
      workspaceId: i === 2 ? 'other-space' : state.activeWorkspaceId,
      goal: 'Понять',
      knowledge: '',
      currentLevel: 'Beginner',
      targetLevel: 'Apply',
      explanationLanguage: 'Russian',
    }),
  );
  state.libraries = [
    { id: 'lib', workspaceId: state.activeWorkspaceId, name: 'Лекции', createdAt: date },
  ];
  state.sources = [
    {
      id: 'lecture',
      workspaceId: state.activeWorkspaceId,
      libraryIds: ['lib'],
      courseIds: [],
      title: 'Лекция.pdf',
      type: 'pdf',
      importedAt: date,
      tags: [],
      pages: [
        { page: 7, text: 'Атомарность: все операции вместе или ни одной. Сбой приводит к откату.' },
      ],
    },
  ];
  state.messages = [
    {
      id: 'q',
      courseId: state.courses[0].id,
      role: 'user',
      content: 'Объясни атомарность проще',
      createdAt: date,
    },
    {
      id: 'a',
      courseId: state.courses[0].id,
      role: 'assistant',
      replyTo: 'q',
      content: 'Всё или ничего: при сбое изменения отменяются. Это объяснение нужно сохранить.',
      citations: [
        {
          chunkId: 'lecture:0',
          sourceId: 'lecture',
          title: 'Лекция.pdf',
          page: 7,
          excerpt: state.sources[0].pages[0].text,
        },
      ],
      createdAt: date,
      ...(saved ? { savedAt: date } : {}),
    },
    {
      id: 'foreign',
      courseId: state.courses[2].id,
      role: 'assistant',
      content: 'PRIVATE_FOREIGN_EXPLANATION',
      savedAt: date,
      createdAt: date,
    },
  ];
  state.cards = [newCard(state.courses[0].id, null, 'Что такое атомарность?', 'Всё или ничего')];
  return state;
}
async function seed(page: Page, state: Workspace) {
  await page.addInitScript((value) => {
    if (!localStorage.getItem('conceptloom-desktop-preview-v1'))
      localStorage.setItem('conceptloom-desktop-preview-v1', JSON.stringify(value));
  }, state);
  let calls = 0;
  await page.route('**/ollama/api/tags', (route) => route.fulfill({ json: { models: [] } }));
  await page.route('**/ollama/api/chat', (route) => {
    calls++;
    return route.abort();
  });
  await page.goto('/');
  return () => calls;
}
const study = (page: Page) => page.getByRole('button', { name: 'Учебный центр', exact: true });
const tutor = (page: Page) => page.getByRole('button', { name: 'Репетитор', exact: true });
const readState = (page: Page): Promise<Workspace> =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), storageKey);

test('bookmark survives restart, keeps citations, supports keyboard reading and unbookmark without changing learning data or calling AI', async ({
  page,
}) => {
  const state = fixture();
  const calls = await seed(page, state);
  await study(page).click();
  await expect(
    page.getByText('Здесь появятся ответы, которые вы захотите перечитать.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Открыть репетитора', exact: true }).click();
  await expect(
    page.locator('.message.user').getByRole('button', { name: 'Сохранить объяснение' }),
  ).toHaveCount(0);
  const save = page.getByRole('button', { name: 'Сохранить объяснение', exact: true });
  await save.click();
  await expect(
    page.getByRole('button', { name: 'Убрать из сохранённых', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Ask your tutor').fill('Черновик следующего вопроса');
  await study(page).click();
  await expect(page.locator('.saved-explanation-card')).toHaveCount(1);
  await expect(page.locator('.saved-explanations')).not.toContainText(
    'PRIVATE_FOREIGN_EXPLANATION',
  );
  await tutor(page).click();
  await expect(page.getByLabel('Ask your tutor')).toHaveValue('Черновик следующего вопроса');
  await page.reload();
  await study(page).click();
  await page.getByLabel('Учебное направление', { exact: true }).selectOption(state.courses[1].id);
  await expect(page.getByText('В этом направлении пока нет сохранённых объяснений.')).toBeVisible();
  await page.getByLabel('Учебное направление', { exact: true }).selectOption(state.courses[0].id);
  const trigger = page.locator('.saved-explanation-card');
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Сохранённое объяснение', exact: true });
  await expect(dialog).toContainText('Объясни атомарность проще');
  await expect(dialog).toContainText(state.messages[1].content);
  await expect(dialog.getByRole('button', { name: 'Закрыть объяснение' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Убрать из сохранённых' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Закрыть объяснение' })).toBeFocused();
  const citationTrigger = dialog.getByRole('button', { name: 'Лекция.pdf · с. 7' });
  await citationTrigger.click();
  const citation = page.getByRole('dialog', { name: 'Source excerpt' });
  await expect(citation).toContainText(state.sources[0].pages[0].text);
  await page.keyboard.press('Escape');
  await expect(citationTrigger).toBeFocused();
  await dialog.getByRole('button', { name: 'Убрать из сохранённых' }).click();
  await expect(dialog.getByRole('button', { name: 'Сохранить объяснение' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(dialog).toContainText('Закладка убрана');
  await page.keyboard.press('Escape');
  await expect(page.locator('.saved-explanation-card')).toHaveCount(0);
  await tutor(page).click();
  await expect(page.locator('.message.assistant')).toContainText(state.messages[1].content);
  const after = await readState(page);
  expect([...after.messages].sort((a, b) => a.id.localeCompare(b.id))).toEqual(
    [...state.messages].sort((a, b) => a.id.localeCompare(b.id)),
  );
  for (const key of ['sources', 'cards', 'reviews', 'attempts', 'sessions', 'notes'] as const)
    expect(after[key]).toEqual(state[key]);
  expect(calls()).toBe(0);
});

test('failed save and failed removal retain the durable state and allow retry', async ({
  page,
}) => {
  const state = fixture();
  const calls = await seed(page, state);
  await tutor(page).click();
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Storage is full', 'QuotaExceededError');
    };
  });
  await page.getByRole('button', { name: 'Сохранить объяснение', exact: true }).click();
  await expect(page.locator('.explanation-bookmark').getByRole('alert')).toContainText(
    'Storage is full',
  );
  await expect(
    page.getByRole('button', { name: 'Сохранить объяснение', exact: true }),
  ).toHaveAttribute('aria-pressed', 'false');
  expect((await readState(page)).messages.find((m) => m.id === 'a')?.savedAt).toBeUndefined();
  await page.reload();
  await tutor(page).click();
  await page.getByRole('button', { name: 'Сохранить объяснение', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Убрать из сохранённых', exact: true }),
  ).toBeVisible();
  await study(page).click();
  await page.locator('.saved-explanation-card').click();
  const dialog = page.getByRole('dialog', { name: 'Сохранённое объяснение' });
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new Error('Disk unavailable');
    };
  });
  await dialog.getByRole('button', { name: 'Убрать из сохранённых' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Disk unavailable');
  await expect(dialog.getByRole('button', { name: 'Убрать из сохранённых' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect((await readState(page)).messages.find((m) => m.id === 'a')?.savedAt).toBeTruthy();
  await page.reload();
  await study(page).click();
  await page.locator('.saved-explanation-card').click();
  await dialog.getByRole('button', { name: 'Убрать из сохранённых' }).click();
  await expect(dialog.getByRole('button', { name: 'Сохранить объяснение' })).toBeVisible();
  expect(calls()).toBe(0);
});

for (const changed of ['deleted', 'revised'] as const) {
  test(`historical citation stays readable when source is ${changed}`, async ({ page }) => {
    const state = fixture(true);
    if (changed === 'deleted') state.sources = [];
    else state.sources[0].pages[0].text = 'Новая редакция без прежнего фрагмента.';
    const calls = await seed(page, state);
    await study(page).click();
    await page.locator('.saved-explanation-card').click();
    const dialog = page.getByRole('dialog', { name: 'Сохранённое объяснение' });
    await expect(dialog.getByRole('status')).toContainText(
      'Источник удалён или фрагмент изменился',
    );
    await dialog.getByRole('button', { name: 'Лекция.pdf · с. 7' }).click();
    await expect(page.getByRole('dialog', { name: 'Source excerpt' })).toContainText(
      'Атомарность: все операции вместе или ни одной.',
    );
    expect(calls()).toBe(0);
  });
}

test('saved list is bounded, filterable and isolated between workspaces in dark and light desktop layouts', async ({
  page,
}) => {
  const state = fixture(true);
  state.messages.push(
    ...Array.from({ length: 11 }, (_, i) => ({
      id: `extra-${i}`,
      courseId: state.courses[1].id,
      role: 'assistant' as const,
      content: `Разбор алгоритма ${i}. `.repeat(20),
      createdAt: date,
      savedAt: date,
    })),
  );
  const calls = await seed(page, state);
  await study(page).click();
  const list = page.locator('.saved-explanation-card');
  await expect(list).toHaveCount(10);
  await page.getByRole('button', { name: 'Показать ещё (2)' }).click();
  await expect(list).toHaveCount(12);
  await page.getByLabel('Учебное направление', { exact: true }).selectOption(state.courses[0].id);
  await expect(list).toHaveCount(1);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: 'test-results/saved-explanations-p2.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Сменить тему' }).click();
  await page.setViewportSize({ width: 1000, height: 700 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: 'test-results/saved-explanations-p2-light-1000.png',
    fullPage: true,
    animations: 'disabled',
  });
  await list.click();
  await expect(page.getByRole('dialog', { name: 'Сохранённое объяснение' })).toBeVisible();
  await page.screenshot({
    path: 'test-results/saved-explanation-detail-p2-light.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.keyboard.press('Escape');
  await page.getByLabel('Active workspace').selectOption('other-space');
  await study(page).click();
  await expect(list).toHaveCount(1);
  await expect(list).toContainText('PRIVATE_FOREIGN_EXPLANATION');
  await expect(page.locator('.saved-explanations')).not.toContainText('Всё или ничего');
  await expect(page.getByRole('dialog', { name: 'Сохранённое объяснение' })).not.toBeVisible();
  await list.click();
  const foreignDetail = page.getByRole('dialog', { name: 'Сохранённое объяснение' });
  await expect(foreignDetail).toContainText('В этом ответе нет цитат из источников.');
  await expect(foreignDetail).not.toContainText('Объясни атомарность проще');
  expect(calls()).toBe(0);
});
