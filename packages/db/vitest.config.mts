import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The first run downloads a mongod binary (~100 MB) into the cache; later runs start it in ~1s.
    hookTimeout: 120_000,
  },
});
