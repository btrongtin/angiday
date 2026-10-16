import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseEnv } from './env';

const shape = {
  MONGODB_URI: z.string().min(1),
  AWS_REGION: z.string().default('ap-southeast-1'),
};

describe('parseEnv', () => {
  it('returns typed values and applies defaults', () => {
    const env = parseEnv(shape, { MONGODB_URI: 'mongodb://localhost/angiday' });

    expect(env).toEqual({ MONGODB_URI: 'mongodb://localhost/angiday', AWS_REGION: 'ap-southeast-1' });
  });

  it('throws an error naming every missing or empty variable', () => {
    expect(() => parseEnv(shape, { MONGODB_URI: '' })).toThrowError(/MONGODB_URI/);
  });

  it('never leaks the value of an invalid variable into the error', () => {
    const secretShape = { PORT: z.coerce.number().int() };

    expect(() => parseEnv(secretShape, { PORT: 'super-secret-token' })).toThrowError(/PORT/);
    expect(() => parseEnv(secretShape, { PORT: 'super-secret-token' })).not.toThrowError(/super-secret-token/);
  });
});
