import { describe, expect, it, vi } from 'vitest';
import { memoizeAsync } from './memoize-async';

describe('memoizeAsync', () => {
  it('loads once and shares the result', async () => {
    const load = vi.fn().mockResolvedValue('config');
    const get = memoizeAsync(load);

    expect(await Promise.all([get(), get()])).toEqual(['config', 'config']);
    expect(await get()).toBe('config');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('forgets a failed load so the next invocation retries (no poisoned warm container)', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('SSM throttled')).mockResolvedValueOnce('config');
    const get = memoizeAsync(load);

    await expect(get()).rejects.toThrow('SSM throttled');
    expect(await get()).toBe('config');
    expect(load).toHaveBeenCalledTimes(2);
  });
});
