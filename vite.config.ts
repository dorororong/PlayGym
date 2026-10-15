import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  // Blockly 가 크다 (~800kB). 정적 단일 페이지라 나누지 않는다
  build: { chunkSizeWarningLimit: 1500 },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 60000,
  },
});
