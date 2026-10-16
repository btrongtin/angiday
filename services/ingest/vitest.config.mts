import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Worker tests start mongodb-memory-server; the first run downloads mongod.
    hookTimeout: 120_000,
  },
});
