import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Importing aws-cdk-lib and synthesizing a stack is slow on a loaded machine (CI, parallel Turbo tasks).
    testTimeout: 30_000,
  },
});
