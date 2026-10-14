import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import type { Plugin } from 'vite';

const pdfAssets = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));
function localPdfAssets(): Plugin {
  const assets = Promise.all(
    ['cmaps', 'standard_fonts'].map(async (folder) => {
      const names = await readdir(join(pdfAssets, folder));
      return Promise.all(
        names.map(
          async (name) =>
            [`${folder}/${name}`, await readFile(join(pdfAssets, folder, name))] as const,
        ),
      );
    }),
  ).then((groups) => new Map<string, Buffer>(groups.flat()));
  return {
    name: 'local-pdf-assets',
    configureServer(server) {
      server.middlewares.use('/pdf-assets', (request, response, next) => {
        void assets
          .then((files) => {
            const key = request.url?.split('?')[0].replace(/^\/+/, '');
            const content = key ? files.get(key) : undefined;
            if (!content) {
              next();
              return;
            }
            response.setHeader('Content-Type', 'application/octet-stream');
            response.end(content);
          })
          .catch(next);
      });
    },
    async generateBundle() {
      for (const [name, source] of await assets)
        this.emitFile({ type: 'asset', fileName: `pdf-assets/${name}`, source });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), localPdfAssets()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('pdfjs-dist')) return 'pdf-reader';
          if (id.includes('@xyflow') || id.includes('d3-')) return 'knowledge-map';
          if (id.includes('ts-fsrs')) return 'spaced-repetition';
          if (id.includes('/zod/')) return 'validation';
          if (id.includes('/node_modules/')) return 'vendor';
        },
      },
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    proxy: {
      '/ollama': {
        target: 'http://127.0.0.1:11434',
        rewrite: (path) => path.replace(/^\/ollama/, ''),
      },
    },
  },
  test: { include: ['test/**/*.test.ts'] },
});
