import { describe, expect, it } from 'vitest';
import { SHARED_PACKAGE } from './index';

// S0 wiring check: proves Vitest runs TypeScript source in a JIT package.
// Delete in S1 once real schemas are exported.
describe('@angiday/shared', () => {
  it('exports its package name', () => {
    expect(SHARED_PACKAGE).toBe('@angiday/shared');
  });
});
