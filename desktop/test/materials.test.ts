import { expect, it } from 'vitest';
import { materialText, materialTitle, readMaterial } from '../src/features/library/materials';
import { noteSchema } from '../src/types/state';

it('accepts copied multilingual text beyond the previous 20,000-character ceiling', () => {
  const content = 'Русский 한국어 English\n'.repeat(3000);
  const text = materialText(content);
  const title = materialTitle('', text);
  expect(
    noteSchema.parse({
      id: 'n',
      courseId: 'c',
      title,
      content: text,
      createdAt: new Date().toISOString(),
    }).content.length,
  ).toBeGreaterThan(20000);
  expect(title).toBe('Русский 한국어 English');
});

it('normalizes line endings and rejects empty or oversized material', () => {
  expect(materialText('\uFEFF  First\r\nSecond  ')).toBe('First\nSecond');
  expect(() => materialText('  ')).toThrow(/empty/);
  expect(() => materialText('x'.repeat(1000001))).toThrow(/too long/);
  expect(materialTitle('  My notes  ', 'Body')).toBe('My notes');
});

it('reads TXT locally and rejects unsupported files before loading a parser', async () => {
  expect(await readMaterial(new File(['Notes 한국어'], 'source.txt'), () => {})).toBe(
    'Notes 한국어',
  );
  await expect(readMaterial(new File(['binary'], 'source.docx'), () => {})).rejects.toThrow(
    /PDF, TXT/,
  );
});
