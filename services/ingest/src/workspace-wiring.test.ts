import { parseEnv } from '@angiday/shared';
import { describe, expect, it } from 'vitest';

// Wiring check: a service imports a JIT package by name through pnpm workspaces.
// Delete once a handler test imports real code from @angiday/shared.
describe('workspace wiring', () => {
  it('resolves @angiday/shared from TypeScript source', () => {
    expect(parseEnv({}, {})).toEqual({});
  });
});
