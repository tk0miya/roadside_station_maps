import * as path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@test-utils': path.resolve(__dirname, 'src/test-utils'),
    },
  },
  test: {
    environment: 'node',
    testTimeout: 30000, // 30 seconds for network requests
    setupFiles: ['src/test-setup.ts'],
    environmentOptions: {
      jsdom: {
        url: 'http://localhost',
      },
    },
  },
});
