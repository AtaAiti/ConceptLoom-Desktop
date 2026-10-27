import { mapSchema } from '../../src/ai/schemas';
import { validateMap } from '../../src/learning/conceptloom';
import type { Topic } from '../../src/types/state';

// A deliberately narrow regression rubric, not a general semantic map evaluator.
export function checkMapQuality(
  input: unknown,
  fixture: { foundation: string[]; target: string[] },
) {
  const { topics } = mapSchema.parse(input);
  if (topics.length > 15) throw new Error('The route exceeds the prompt limit of 15 concepts.');
  const mapped: Topic[] = topics.map((t) => ({
    id: t.key,
    title: t.title,
    description: t.description,
    dependsOn: t.dependsOn,
    courseId: 'eval',
    approved: true,
  }));
  validateMap(mapped);
  const matches = (t: Topic, terms: string[]) =>
    terms.some((term) => t.title.normalize('NFKC').toLowerCase().includes(term));
  const foundations = mapped.filter((t) => matches(t, fixture.foundation));
  const targets = mapped.filter((t) => matches(t, fixture.target));
  if (!foundations.length || !targets.length)
    throw new Error('A required learning concept is missing.');
  const byId = new Map(mapped.map((t) => [t.id, t]));
  function ancestors(id: string): Set<string> {
    const pending = [...byId.get(id)!.dependsOn];
    const found = new Set<string>();
    while (pending.length) {
      const next = pending.pop()!;
      if (found.has(next)) continue;
      found.add(next);
      pending.push(...byId.get(next)!.dependsOn);
    }
    return found;
  }
  if (!targets.some((target) => foundations.some((base) => ancestors(target.id).has(base.id))))
    throw new Error('The target has no prerequisite path from the required foundation.');
  return {
    concepts: mapped.length,
    foundationKeys: foundations.map((t) => t.id),
    targetKeys: targets.map((t) => t.id),
  };
}
