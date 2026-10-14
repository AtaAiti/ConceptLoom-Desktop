export const MAX_TEXT_CHARACTERS = 1_000_000;
export const MAX_TEXT_BYTES = 2 * 1024 * 1024;
export const MAX_PDF_BYTES = 25 * 1024 * 1024;

export function materialText(content: string): string {
  const value = content
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .trim();
  if (!value)
    throw new Error('The material is empty. Paste text or choose a file with readable text.');
  if (value.length > MAX_TEXT_CHARACTERS)
    throw new Error(
      'This material is too long. Split it into sections of up to 1,000,000 characters.',
    );
  return value;
}

export function materialTitle(title: string, content: string): string {
  const value =
    title.trim() ||
    content
      .split('\n')
      .find((line) => line.trim())
      ?.trim() ||
    'Pasted text';
  return value.slice(0, 200);
}

export async function readMaterial(
  file: File,
  progress: (message: string) => void,
): Promise<string> {
  const pdf = /\.pdf$/i.test(file.name);
  if (!pdf && !/\.(txt|md|markdown)$/i.test(file.name))
    throw new Error('Choose a PDF, TXT, or Markdown file.');
  if (file.size > (pdf ? MAX_PDF_BYTES : MAX_TEXT_BYTES))
    throw new Error(
      pdf ? 'PDF files must be smaller than 25 MB.' : 'Text files must be smaller than 2 MB.',
    );
  if (!pdf) return materialText(await file.text());
  const { extractPdfText } = await import('./pdf');
  return materialText(await extractPdfText(new Uint8Array(await file.arrayBuffer()), progress));
}
