import { describe, expect, it } from 'vitest';
import { createSessionToken, credentialsMatch, SESSION_MAX_AGE_SECONDS, verifySessionToken } from './auth';

const SECRET = '0123456789abcdef0123456789abcdef';
const expected = { username: 'admin', password: 'a-long-password' };

describe('credentialsMatch', () => {
  it('accepts the configured credentials', () => {
    expect(credentialsMatch({ username: 'admin', password: 'a-long-password' }, expected)).toBe(true);
  });

  it.each([
    ['wrong username', { username: 'Admin', password: 'a-long-password' }],
    ['wrong password', { username: 'admin', password: 'a-long-passwor' }],
    ['empty input', { username: '', password: '' }],
  ])('rejects %s', (_label, given) => {
    expect(credentialsMatch(given, expected)).toBe(false);
  });
});

describe('session token', () => {
  it('round-trips', async () => {
    const token = await createSessionToken('admin', SECRET);

    expect(await verifySessionToken(token, SECRET)).toBe(true);
  });

  it('rejects a token signed with another secret', async () => {
    const token = await createSessionToken('admin', SECRET);

    expect(await verifySessionToken(token, 'f'.repeat(32))).toBe(false);
  });

  it('rejects an expired token', async () => {
    const issued = new Date(Date.now() - (SESSION_MAX_AGE_SECONDS + 60) * 1000);
    const token = await createSessionToken('admin', SECRET, issued);

    expect(await verifySessionToken(token, SECRET)).toBe(false);
  });

  it.each([undefined, '', 'garbage', 'a.b.c'])('rejects %j', async (token) => {
    expect(await verifySessionToken(token, SECRET)).toBe(false);
  });
});
