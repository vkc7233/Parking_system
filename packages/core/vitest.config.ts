import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
  resolve: {
    alias: {
      '@parking/config': fileURLToPath(new URL('../config/src/index.ts', import.meta.url)),
    },
  },
});
