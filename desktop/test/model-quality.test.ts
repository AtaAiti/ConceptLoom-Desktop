import { expect, it } from 'vitest';
import { checkMapQuality } from './helpers/model-quality';

it('checks prerequisite direction, distinct concepts, missing references and cycles in eval maps', () => {
  const fixture = { foundation: ['table'], target: ['join'] };
  const foundation = { key: 'tables', title: 'Tables', description: '', dependsOn: [] as string[] };
  const target = { key: 'joins', title: 'Joins', description: '', dependsOn: ['tables'] };
  expect(checkMapQuality({ topics: [foundation, target] }, fixture).concepts).toBe(2);
  expect(() =>
    checkMapQuality(
      {
        topics: [
          { ...foundation, dependsOn: ['joins'] },
          { ...target, dependsOn: [] },
        ],
      },
      fixture,
    ),
  ).toThrow(/prerequisite path/);
  expect(() =>
    checkMapQuality({ topics: [{ ...foundation, title: 'Tables and joins' }] }, fixture),
  ).toThrow(/prerequisite path/);
  expect(() => checkMapQuality({ topics: [target] }, fixture)).toThrow(/prerequisite/i);
  expect(() =>
    checkMapQuality({ topics: [{ ...foundation, dependsOn: ['joins'] }, target] }, fixture),
  ).toThrow(/cycle/);
});
