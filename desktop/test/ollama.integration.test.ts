import { expect, it } from 'vitest';
import { lessonContentSchema, emptyWorkspace } from '../src/types/state';
import { lessonPrompt } from '../src/ai/prompts/lesson';
import { systemPrompt } from '../src/ai/prompts/system';
import { createCourse, initialTopics } from '../src/learning/courses';
import { parseResponse } from '../src/ai/schemas';
import { z } from 'zod';

it.skipIf(process.env.OLLAMA_INTEGRATION !== '1')(
  'qwen3:4b creates a valid structured lesson locally',
  async () => {
    const state = emptyWorkspace();
    const course = createCourse({
      name: 'Korean',
      goal: 'Basic everyday conversations',
      knowledge: 'Hangul',
      currentLevel: 'Beginner',
      targetLevel: 'A2',
      explanationLanguage: 'Russian',
      targetLanguage: 'Korean',
    });
    state.courses = [course];
    state.topics = initialTopics(course);
    const response = await fetch('http://127.0.0.1:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'qwen3:4b',
        stream: false,
        think: false,
        format: z.toJSONSchema(lessonContentSchema, { io: 'input' }),
        messages: [
          { role: 'system', content: systemPrompt(course) },
          { role: 'user', content: lessonPrompt(state.topics[0], state) },
        ],
        options: { temperature: 0.2, num_ctx: 8192, num_predict: 2400 },
      }),
      signal: AbortSignal.timeout(600000),
    });
    expect(response.ok).toBe(true);
    const raw = (await response.json()) as { message: { content: string } };
    const content = parseResponse(raw.message.content, lessonContentSchema);
    expect(content.exercises.length).toBeGreaterThanOrEqual(2);
    expect(content.flashcards.length).toBeGreaterThanOrEqual(1);
  },
  610000,
);
