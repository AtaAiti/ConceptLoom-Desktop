import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { emptyWorkspace } from '../src/types/state';
import { createCourse } from '../src/learning/courses';

test.beforeEach(async ({ page }) => {
  const state = emptyWorkspace();
  state.courses = [
    createCourse({
      name: 'English',
      goal: 'Read source material',
      knowledge: '',
      currentLevel: 'Beginner',
      targetLevel: 'A2',
      explanationLanguage: 'Russian',
      targetLanguage: 'English',
    }),
  ];
  state.settings.onboardingComplete = true;
  await page.addInitScript((value) => {
    if (!localStorage.getItem('conceptloom-desktop-preview-v1'))
      localStorage.setItem('conceptloom-desktop-preview-v1', JSON.stringify(value));
  }, state);
  await page.route('**/ollama/**', (route) => route.fulfill({ json: { models: [] } }));
  if (process.env.PLAYWRIGHT_PREVIEW === '1') {
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
  }
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Источники', exact: true }).click();
});

test('pasted text over 20,000 characters saves without a title and survives reload', async ({
  page,
}) => {
  const copied = `Copied learning material\n${'한국어 Русский English\n'.repeat(1500)}`;
  await page.getByRole('button', { name: 'Вставить текст', exact: true }).first().click();
  await page.getByLabel('Скопированный текст / заметки').fill(copied);
  await page.getByRole('button', { name: 'Добавить в библиотеку' }).click();
  await expect(
    page.getByRole('heading', { name: 'Copied learning material', exact: true }),
  ).toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Источники', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Copied learning material', exact: true }),
  ).toBeVisible();
  const stored = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('conceptloom-desktop-preview-v1')!).sources[0].pages[0].text,
  );
  expect(stored).toBe(copied.trim());
});

test('extracts PDF text offline with bundled worker and handles corrupt PDF gracefully', async ({
  page,
}) => {
  const externalRequests: string[] = [];
  page.on('request', (request) => {
    if (
      !request.url().startsWith(new URL(page.url()).origin) &&
      !request.url().startsWith('blob:') &&
      !request.url().startsWith('data:')
    )
      externalRequests.push(request.url());
  });
  await page
    .getByLabel('Import learning material')
    .setInputFiles(fileURLToPath(new URL('./fixtures/helloworld.pdf', import.meta.url)));
  await expect(page.getByRole('heading', { name: 'helloworld.pdf', exact: true })).toBeVisible();
  await expect(page.locator('.document-paper')).toContainText(/Hello, world/i);
  expect(externalRequests).toEqual([]);
  await page.getByLabel('Import learning material').setInputFiles({
    name: 'broken.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('Not a PDF'),
  });
  await expect(page.getByRole('alert')).toContainText('This PDF could not be read');
  await expect(page.getByRole('heading', { name: 'helloworld.pdf', exact: true })).toBeVisible();
});
