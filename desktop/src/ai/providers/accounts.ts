import { invoke, isTauri } from '@tauri-apps/api/core';
import { z } from 'zod';
import { parseResponse } from '../schemas';
import type { AIMessage, AIProvider } from './types';
import type { Workspace } from '../../types/state';
import { OllamaProvider } from './ollama';

export type ProviderId = Workspace['settings']['provider'];
export type AccountProviderId = Exclude<ProviderId, 'ollama'>;
export const providerNames: Record<ProviderId, string> = {
  ollama: 'Ollama · локальная модель',
  codex: 'ChatGPT · Codex',
  claude: 'Claude · Claude Code',
  gemini: 'Gemini · Google',
};
export const modelPresets: Record<AccountProviderId, string[]> = {
  codex: ['default'],
  claude: ['default', 'sonnet', 'opus', 'haiku'],
  gemini: ['default'],
};
export function switchProvider(
  settings: Workspace['settings'],
  next: ProviderId,
): Workspace['settings'] {
  const providerModels = { ...settings.providerModels, [settings.provider]: settings.model };
  return {
    ...settings,
    provider: next,
    providerModels,
    accountDataConsent: next === settings.provider && settings.accountDataConsent,
    model: providerModels[next] || (next === 'ollama' ? 'qwen3:4b' : 'default'),
  };
}
export interface AccountStatus {
  installed: boolean;
  compatible: boolean;
  version: string;
  login: 'account' | 'missing' | 'unknown';
  message: string;
}
function nativeOnly() {
  if (!isTauri())
    throw new Error('Подключение аккаунтов доступно в установленном приложении Windows.');
}
export async function accountStatus(provider: AccountProviderId): Promise<AccountStatus> {
  nativeOnly();
  return invoke('account_status', { provider });
}
export async function accountSetup(
  provider: AccountProviderId,
  action: 'install' | 'login',
): Promise<string> {
  nativeOnly();
  return invoke('account_setup', { provider, action });
}
export async function testAccount(provider: AccountProviderId, model: string): Promise<string> {
  nativeOnly();
  return invoke('account_test', { provider, model });
}
export class AccountProvider implements AIProvider {
  constructor(
    private provider: AccountProviderId,
    private model: string,
    private consent: boolean,
  ) {}
  async models() {
    const status = await accountStatus(this.provider);
    if (!status.installed || !status.compatible) throw new Error(status.message);
    return [...new Set([...modelPresets[this.provider], this.model])];
  }
  private async request(
    messages: AIMessage[],
    schema?: unknown,
    jsonMode = false,
  ): Promise<string> {
    nativeOnly();
    if (!this.consent)
      throw new Error('Разрешите передачу учебного контекста выбранному сервису в настройках.');
    return invoke('account_generate', {
      provider: this.provider,
      model: this.model,
      messages,
      schema: schema ?? null,
      jsonMode,
    });
  }
  chat(messages: AIMessage[], structured = false) {
    return this.request(messages, undefined, structured);
  }
  async structured<T>(messages: AIMessage[], schema: z.ZodType<T>): Promise<T> {
    return parseResponse(
      await this.request(messages, z.toJSONSchema(schema, { io: 'input' })),
      schema,
    );
  }
}
export function createProvider(settings: Workspace['settings']): AIProvider {
  return settings.provider === 'ollama'
    ? new OllamaProvider(settings.endpoint, settings.model)
    : new AccountProvider(settings.provider, settings.model, settings.accountDataConsent);
}
