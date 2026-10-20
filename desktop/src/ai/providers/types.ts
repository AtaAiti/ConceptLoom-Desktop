import type { z } from 'zod';

export type AIMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export interface AIProvider {
  models(): Promise<string[]>;
  chat(messages: AIMessage[], structured?: boolean): Promise<string>;
  structured<T>(messages: AIMessage[], schema: z.ZodType<T>): Promise<T>;
}
