import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
const native = vi.hoisted(() => ({ invoke: vi.fn(), isTauri: vi.fn(() => true) }));
vi.mock('@tauri-apps/api/core', () => native);
import { AccountProvider, createProvider, switchProvider } from '../src/ai/providers/accounts';
import { OllamaProvider } from '../src/ai/providers/ollama';
import { emptyWorkspace, settingsSchema } from '../src/types/state';

afterEach(() => {
  vi.clearAllMocks();
  native.isTauri.mockReturnValue(true);
});
describe('account provider bridge', () => {
  it('preserves older settings and local model/endpoint when switching', () => {
    const {
      accountDataConsent: _consent,
      providerModels: _models,
      ...old
    } = emptyWorkspace().settings;
    const local = settingsSchema.parse({
      ...old,
      model: 'qwen3:8b',
      endpoint: 'http://127.0.0.1:11435',
    });
    expect(local.accountDataConsent).toBe(false);
    let cloud = switchProvider(local, 'claude');
    expect(cloud.model).toBe('default');
    cloud = { ...cloud, model: 'sonnet', accountDataConsent: true };
    const restored = switchProvider(cloud, 'ollama');
    expect(restored.model).toBe('qwen3:8b');
    expect(restored.endpoint).toBe(local.endpoint);
    expect(switchProvider(restored, 'claude').model).toBe('sonnet');
    expect(switchProvider(cloud, 'gemini').accountDataConsent).toBe(false);
    expect(createProvider(restored)).toBeInstanceOf(OllamaProvider);
  });
  it('blocks context transfer without consent and in browser preview', async () => {
    await expect(
      new AccountProvider('codex', 'default', false).chat([{ role: 'user', content: 'private' }]),
    ).rejects.toThrow(/Разрешите/);
    expect(native.invoke).not.toHaveBeenCalled();
    native.isTauri.mockReturnValue(false);
    await expect(
      new AccountProvider('codex', 'default', true).chat([{ role: 'user', content: 'private' }]),
    ).rejects.toThrow(/установленном приложении/);
    expect(native.invoke).not.toHaveBeenCalled();
  });
  it('passes schema and selected provider to native code and validates the answer', async () => {
    const provider = new AccountProvider('gemini', 'default', true);
    const schema = z.object({ accurate: z.boolean() });
    native.invoke.mockResolvedValueOnce('{"accurate":true}');
    expect(await provider.structured([{ role: 'user', content: 'Check answer' }], schema)).toEqual({
      accurate: true,
    });
    expect(native.invoke).toHaveBeenCalledWith(
      'account_generate',
      expect.objectContaining({
        provider: 'gemini',
        model: 'default',
        schema: expect.objectContaining({ type: 'object' }),
      }),
    );
    native.invoke.mockResolvedValueOnce('{"missing":true}');
    await expect(
      provider.structured([{ role: 'user', content: 'Check answer' }], schema),
    ).rejects.toThrow(/неверный ответ/);
  });
  it('does not hide auth or quota errors with a fallback', async () => {
    native.invoke.mockRejectedValueOnce('Лимит аккаунта исчерпан');
    await expect(
      new AccountProvider('claude', 'sonnet', true).chat([{ role: 'user', content: 'Hello' }]),
    ).rejects.toBe('Лимит аккаунта исчерпан');
    expect(native.invoke).toHaveBeenCalledTimes(1);
  });
});
