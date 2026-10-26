import { describe, expect, it, vi } from 'vitest';
import { OllamaProvider, localEndpoint } from '../src/ai/providers/ollama';
import { parseResponse, mapSchema, verdictSchema } from '../src/ai/schemas';
import { lessonContentSchema } from '../src/types/state';

describe('local-only AI boundary', () => {
  it('rejects external addresses, credentials, paths and query strings', () => {
    expect(localEndpoint('http://localhost:11434')).toBe('http://localhost:11434');
    for (const url of [
      'https://localhost:11434',
      'http://localhost.evil.test',
      'http://example.com',
      'http://user@localhost:11434',
      'http://localhost:11434/api',
      'http://localhost:11434?x=1',
    ])
      expect(() => localEndpoint(url)).toThrow();
  });
  it('validates structured output and rejects malformed or incomplete responses', () => {
    expect(
      parseResponse('{"accurate":true,"feedback":"Correct connection"}', verdictSchema).accurate,
    ).toBe(true);
    expect(() => parseResponse('```json {} ```', mapSchema)).toThrow(/неверный ответ/);
    expect(() => parseResponse('{"concept":"Incomplete"}', lessonContentSchema)).toThrow(
      /неверный ответ/,
    );
  });
  it('reports offline and missing models without exposing transport errors', async () => {
    const provider = new OllamaProvider('http://localhost:11434', 'qwen3:4b');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network internal error')));
    await expect(provider.models()).rejects.toThrow(/Start Ollama/);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 404 })));
    await expect(provider.chat([{ role: 'user', content: 'Hello' }])).rejects.toThrow(
      /unavailable/,
    );
    vi.unstubAllGlobals();
  });
});
