import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Importing aws-cdk-lib and synthesizing a stack is slow on a loaded machine (CI, parallel Turbo tasks).
    testTimeout: 30_000,
    // The beforeAll hook bundles both Lambdas with esbuild; the default 10 s is not enough under parallel Turbo tasks.
    hookTimeout: 60_000,
  },
});
