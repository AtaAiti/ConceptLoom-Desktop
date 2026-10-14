import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
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
