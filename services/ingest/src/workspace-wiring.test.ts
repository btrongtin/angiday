import { SHARED_PACKAGE } from '@angiday/shared';
import { describe, expect, it } from 'vitest';

// S0 wiring check: a service imports a JIT package by name through pnpm workspaces.
// Delete in S1 once handlers import real code from @angiday/shared.
describe('workspace wiring', () => {
  it('resolves @angiday/shared from TypeScript source', () => {
    expect(SHARED_PACKAGE).toBe('@angiday/shared');
  });
});
