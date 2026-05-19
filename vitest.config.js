import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['plugins/**/__tests__/**/*.test.js'],
    environment: 'node',
    globals: false,
    passWithNoTests: true,
    coverage: { reporter: ['text', 'html'], include: ['plugins/**/*.js'], exclude: ['**/__tests__/**'] }
  }
});
