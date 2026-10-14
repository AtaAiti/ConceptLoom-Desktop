import { invoke, isTauri } from '@tauri-apps/api/core';
import { z } from 'zod';
import { parseResponse } from '../schemas';

export type AIMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export interface AIProvider {
  models(): Promise<string[]>;
  chat(messages: AIMessage[], structured?: boolean): Promise<string>;
  structured<T>(messages: AIMessage[], schema: z.ZodType<T>): Promise<T>;
}
export function localEndpoint(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Enter a valid local Ollama URL.');
  }
  if (
    url.protocol !== 'http:' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  ) {
    throw new Error(
      'For privacy, Ollama must use an HTTP loopback URL such as http://localhost:11434.',
    );
  }
  return url.origin;
}
const chatSchema = z.object({ message: z.object({ content: z.string().trim().min(1) }) });
const tagsSchema = z.object({ models: z.array(z.object({ name: z.string() })) });
export class OllamaProvider implements AIProvider {
  constructor(
    private endpoint: string,
    private model: string,
  ) {
    localEndpoint(endpoint);
  }
  private async request(path: string, body?: unknown): Promise<unknown> {
    const endpoint = localEndpoint(this.endpoint);
    try {
      if (isTauri()) return await invoke('ollama_request', { endpoint, path, body: body ?? null });
      if (endpoint !== 'http://localhost:11434' && endpoint !== 'http://127.0.0.1:11434')
        throw new Error(
          'Browser preview supports the default local endpoint. Use the desktop app for another port.',
        );
      const response = await fetch(`/ollama${path}`, {
        method: body ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(body ? 600000 : 8000),
      });
      if (!response.ok)
        throw new Error(
          response.status === 404
            ? `Model '${this.model}' is unavailable. Download it with ollama pull ${this.model}.`
            : 'Local AI request failed. Check Ollama and try again.',
        );
      return await response.json();
    } catch (error) {
      console.error('Ollama request failed', error);
      if (
        (error instanceof Error &&
          (error.name === 'TimeoutError' || error.message.includes('timed out'))) ||
        (typeof error === 'string' && error.includes('timed out'))
      )
        throw new Error('The local model took too long. Try again or choose a smaller model.');
      if (error instanceof Error && error.message.includes('preview')) throw error;
      if (error instanceof Error && error.message.includes('unavailable')) throw error;
      if (typeof error === 'string' && error.includes('Model unavailable'))
        throw new Error(`Model '${this.model}' is unavailable. Download it in Ollama first.`);
      throw new Error('Local AI unavailable. Start Ollama and try again.');
    }
  }
  async models(): Promise<string[]> {
    return tagsSchema.parse(await this.request('/api/tags')).models.map((m) => m.name);
  }
  async chat(messages: AIMessage[], structured = false): Promise<string> {
    return this.generate(messages, structured ? 'json' : undefined);
  }
  private async generate(
    messages: AIMessage[],
    format?: string | Record<string, unknown>,
  ): Promise<string> {
    const result = chatSchema.parse(
      await this.request('/api/chat', {
        model: this.model,
        messages,
        stream: false,
        think: false,
        ...(format ? { format } : {}),
        options: {
          temperature: format ? 0.2 : 0.5,
          num_ctx: 8192,
          num_predict: format ? 2400 : 700,
        },
      }),
    );
    return result.message.content;
  }
  async structured<T>(messages: AIMessage[], schema: z.ZodType<T>): Promise<T> {
    const format = z.toJSONSchema(schema, { io: 'input' });
    return parseResponse(await this.generate(messages, format), schema);
  }
}
