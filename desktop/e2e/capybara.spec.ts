import { expect, test } from '@playwright/test';
import { emptyWorkspace } from '../src/types/state';
import { createCourse } from '../src/learning/courses';
import { newCard } from '../src/learning/reviews';

test('CAPYBARA layouts, theme persistence, source preview and review focus', async ({ page }) => {
  const state = emptyWorkspace();
  state.settings.onboardingComplete = true;
  state.workspaces[0].name = 'Базы данных';
  state.workspaces[0].goal = 'Подготовка к экзамену';
  const course = createCourse({
    name: 'Индексы и деревья',
    goal: 'Объяснить выбор индекса',
    knowledge: '',
    currentLevel: 'Beginner',
    targetLevel: 'Apply',
    explanationLanguage: 'Russian',
    targetLanguage: '',
  });
  state.courses = [course];
  state.topics = [
    {
      id: 'tree',
      courseId: course.id,
      title: 'Листовые узлы B+ дерева',
      description: 'Связь листьев объясняет эффективный последовательный обход диапазона ключей.',
      dependsOn: [],
      approved: true,
    },
  ];
  state.cards = [
    newCard(
      course.id,
      'tree',
      'Что хранится в листьях B+ дерева и зачем они связаны между собой?',
      'Листья содержат ключи и ссылки на записи. Связи между соседними листьями позволяют читать диапазон последовательно.',
    ),
  ];
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
      courseIds: [course.id],
      title: 'Лекция 5.pdf',
      type: 'pdf',
      importedAt: new Date().toISOString(),
      pageCount: 2,
      pages: [
        {
          page: 1,
          text: 'Структуры индексов\n\nЛистовые узлы B+ дерева\n\nВнутренние узлы направляют поиск. Листья содержат ключи и ссылки на записи.',
        },
        {
          page: 2,
          text: 'Листья связаны между собой: после поиска начала диапазона можно последовательно перейти к соседнему листу.',
        },
      ],
      tags: ['Индексы'],
      size: 12000,
    },
  ];
  await page.addInitScript((value) => {
    if (!localStorage.getItem('conceptloom-desktop-preview-v1'))
      localStorage.setItem('conceptloom-desktop-preview-v1', JSON.stringify(value));
  }, state);
  await page.route('**/ollama/**', (route) =>
    route.fulfill({ json: { models: [{ name: 'qwen3:4b' }] } }),
  );
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Хороший день для новой связи' })).toBeVisible();
  await page.screenshot({ animations: 'disabled', path: 'test-results/capybara-home.png' });
  for (const label of [
    'Сегодня',
    'Источники',
    'Дорожная карта',
    'Карта знаний',
    'Репетитор',
    'Учебный центр',
  ]) {
    await page.getByRole('navigation').getByRole('button', { name: label, exact: true }).click();
    await expect(page.locator('.page-content')).toBeVisible();
    await page.screenshot({ animations: 'disabled', path: `test-results/capybara-${label}.png` });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  await page.getByRole('button', { name: 'Источники', exact: true }).click();
  await expect(page.locator('.document-paper')).toContainText('Листовые узлы');
  await page
    .locator('.source-page-controls')
    .getByRole('button', { name: '→', exact: true })
    .click();
  await expect(page.locator('.document-paper')).toContainText('Листья связаны');
  await page.getByRole('button', { name: 'Сегодня', exact: true }).click();
  await page.getByRole('button', { name: 'Сменить тему' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.screenshot({ animations: 'disabled', path: 'test-results/capybara-light.png' });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Сменить тему' }).click();
  await page.getByRole('button', { name: 'Повторение', exact: true }).click();
  await expect(page.locator('.sidebar')).not.toBeVisible();
  await page.getByRole('button', { name: 'Открыть ответ', exact: true }).click();
  await page.screenshot({ animations: 'disabled', path: 'test-results/capybara-review.png' });
  await page.getByRole('button', { name: 'Сохранить и выйти' }).click();
  await expect(page.locator('.sidebar')).toBeVisible();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.getByRole('button', { name: 'Сегодня', exact: true }).click();
  await page.screenshot({ animations: 'disabled', path: 'test-results/capybara-1920.png' });
  const broken = await page.locator('.design-icon img:visible').evaluateAll(
    (images) =>
      images.filter((el) => {
        const img = el as HTMLImageElement;
        const b = img.getBoundingClientRect();
        return (
          !img.complete ||
          !img.naturalWidth ||
          Math.abs(b.width - img.naturalWidth) > 0.1 ||
          Math.abs(b.height - img.naturalHeight) > 0.1
        );
      }).length,
  );
  expect(broken).toBe(0);
});
