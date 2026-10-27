import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { OllamaProvider } from '../src/ai/providers/ollama';
import { createCourse } from '../src/learning/courses';
import { systemPrompt } from '../src/ai/prompts/system';
import { quizPrompt } from '../src/ai/prompts/quiz';
import { knowledgeMapPrompt } from '../src/ai/prompts/knowledgeMap';
import { mapSchema, verdictSchema } from '../src/ai/schemas';
import { gradingCases, mapCases } from './fixtures/model-quality';
import { checkMapQuality } from './helpers/model-quality';

describe.skipIf(process.env.MODEL_QUALITY_EVAL !== '1')(
  'local model quality regression set',
  () => {
    const model = process.env.EVAL_MODEL || 'qwen3:4b';
    const results: unknown[] = [];
    let modelDigest: string | undefined;
    let restoreFetch: () => void;
    const provider = new OllamaProvider('http://127.0.0.1:11434', model);
    const course = (name: string, goal: string) =>
      createCourse({
        name,
        goal,
        knowledge: '',
        currentLevel: 'Beginner',
        targetLevel: 'Apply',
        explanationLanguage: 'Russian',
      });
    beforeAll(async () => {
      const originalFetch = globalThis.fetch;
      const response = await originalFetch('http://127.0.0.1:11434/api/tags', {
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error('Cannot inspect local Ollama models.');
      const tags = (await response.json()) as { models: { name: string; digest: string }[] };
      const installed = tags.models.find((item) => item.name === model);
      if (!installed) throw new Error(`Download the eval model first: ollama pull ${model}`);
      modelDigest = installed.digest;
      const spy = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation((input, init) =>
          originalFetch(
            typeof input === 'string' && input.startsWith('/ollama/')
              ? `http://127.0.0.1:11434${input.slice(7)}`
              : input,
            init,
          ),
        );
      restoreFetch = () => spy.mockRestore();
    });
    afterAll(() => {
      restoreFetch?.();
      mkdirSync('releases', { recursive: true });
      writeFileSync(
        'releases/model-quality-latest.json',
        JSON.stringify(
          {
            runAt: new Date().toISOString(),
            model,
            modelDigest,
            limits:
              'Synthetic regression set; keyword and dependency checks are not a general semantic evaluation.',
            results,
          },
          null,
          2,
        ),
      );
    });
    for (const fixture of gradingCases) {
      it(`grading: ${fixture.id}`, async () => {
        const started = performance.now();
        try {
          const verdict = await provider.structured(
            [
              {
                role: 'system',
                content: systemPrompt(
                  course('General learning', 'Understand and apply the concepts.'),
                ),
              },
              { role: 'user', content: quizPrompt(fixture.exercise, fixture.response) },
            ],
            verdictSchema,
          );
          results.push({
            kind: 'grading',
            id: fixture.id,
            expected: fixture.accurate,
            verdict,
            passed: verdict.accurate === fixture.accurate,
            elapsedMs: Math.round(performance.now() - started),
          });
          expect(verdict.accurate).toBe(fixture.accurate);
        } catch (error) {
          if (!results.some((item) => (item as { id: string }).id === fixture.id))
            results.push({ kind: 'grading', id: fixture.id, passed: false, error: String(error) });
          throw error;
        }
      }, 610000);
    }
    for (const fixture of mapCases) {
      it(`map: ${fixture.id}`, async () => {
        const started = performance.now();
        let generated: unknown;
        try {
          generated = await provider.structured(
            [
              { role: 'system', content: systemPrompt(course(fixture.name, fixture.goal)) },
              { role: 'user', content: knowledgeMapPrompt },
            ],
            mapSchema,
          );
          const checks = checkMapQuality(generated, fixture);
          results.push({
            kind: 'map',
            id: fixture.id,
            passed: true,
            checks,
            generated,
            elapsedMs: Math.round(performance.now() - started),
          });
        } catch (error) {
          results.push({
            kind: 'map',
            id: fixture.id,
            passed: false,
            generated,
            error: String(error),
          });
          throw error;
        }
      }, 610000);
    }
  },
);
