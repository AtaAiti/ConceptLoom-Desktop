import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { MAX_TEXT_CHARACTERS } from './materials';

GlobalWorkerOptions.workerSrc = workerUrl;

export async function extractPdfText(
  bytes: Uint8Array,
  progress: (message: string) => void,
): Promise<string> {
  const task = getDocument({
    data: bytes,
    cMapUrl: `${import.meta.env.BASE_URL}pdf-assets/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${import.meta.env.BASE_URL}pdf-assets/standard_fonts/`,
    useSystemFonts: false,
    useWorkerFetch: false,
    useWasm: false,
  });
  try {
    const document = await task.promise;
    if (document.numPages > 300)
      throw new Error(
        'Import up to 300 PDF pages at a time. Split this PDF into smaller sections.',
      );
    const pages: string[] = [];
    let length = 0;
    for (let index = 1; index <= document.numPages; index++) {
      progress(`Reading PDF · page ${index} of ${document.numPages}…`);
      const page = await document.getPage(index);
      const text = await page.getTextContent();
      const content = text.items
        .map((item) => ('str' in item ? `${item.str}${item.hasEOL ? '\n' : ' '}` : ''))
        .join('')
        .trim();
      if (content) pages.push(`Page ${index}\n${content}`);
      length += content.length + 20;
      page.cleanup();
      if (length > MAX_TEXT_CHARACTERS)
        throw new Error('This PDF contains too much text. Split it into smaller sections.');
    }
    if (!pages.length)
      throw new Error(
        'This PDF has no readable text layer. It may be a scan: use a PDF with selectable text, or paste text obtained with OCR.',
      );
    return pages.join('\n\n');
  } catch (error) {
    if (error instanceof Error && error.name === 'PasswordException')
      throw new Error('This PDF is password protected. Save an unlocked copy and try again.');
    if (
      error instanceof Error &&
      ['InvalidPDFException', 'UnknownErrorException'].includes(error.name)
    )
      throw new Error('This PDF could not be read. Open it in a PDF reader and save a new copy.');
    throw error;
  } finally {
    await task.destroy();
  }
}
