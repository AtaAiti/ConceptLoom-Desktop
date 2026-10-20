import { expect, test } from '@playwright/test';
import { emptyWorkspace } from '../src/types/state';

test('provider selection, explicit context consent and remembered local model survive reload', async ({
  page,
}) => {
  const state = emptyWorkspace();
  state.settings.onboardingComplete = true;
  state.settings.model = 'qwen3:8b';
  await page.addInitScript((value) => {
    if (!localStorage.getItem('conceptloom-desktop-preview-v1'))
      localStorage.setItem('conceptloom-desktop-preview-v1', JSON.stringify(value));
  }, state);
  await page.route('**/ollama/**', (route) =>
    route.fulfill({ json: { models: [{ name: 'qwen3:8b' }] } }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  const provider = page.getByLabel('AI provider');
  await provider.selectOption('codex');
  await expect(page.getByLabel('AI model')).toHaveValue('default');
  await expect(
    page.getByText('Подключение аккаунтов доступно в установленном приложении Windows.', {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByRole('alert')).toContainText('Разрешите передачу');
  await page.getByRole('checkbox', { name: /Разрешаю отправлять/ }).check();
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Настройки сохранены.', { exact: true })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/account-settings.png', animations: 'disabled' });
  await page.reload();
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await expect(page.getByLabel('AI provider')).toHaveValue('codex');
  await page.getByLabel('AI provider').selectOption('ollama');
  await expect(page.getByLabel('AI model')).toHaveValue('qwen3:8b');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await expect(page.getByLabel('AI provider')).toHaveValue('ollama');
  await expect(page.getByLabel('AI model')).toHaveValue('qwen3:8b');
});
