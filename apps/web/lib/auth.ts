import { createHash, timingSafeEqual } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';

export const SESSION_COOKIE = 'angiday_session';
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export interface Credentials {
  username: string;
  password: string;
}

const sha256 = (value: string) => createHash('sha256').update(value).digest();
const key = (secret: string) => new TextEncoder().encode(secret);

/** Constant-time; both fields are always compared so timing doesn't reveal which one was wrong. */
export function credentialsMatch(given: Credentials, expected: Credentials): boolean {
  const usernameOk = timingSafeEqual(sha256(given.username), sha256(expected.username));
  const passwordOk = timingSafeEqual(sha256(given.password), sha256(expected.password));
  return usernameOk && passwordOk;
}

/** HS256 JWT for the session cookie (Phase 1 plan → Web auth). */
export async function createSessionToken(username: string, secret: string, now = new Date()): Promise<string> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(username)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + SESSION_MAX_AGE_SECONDS)
    .sign(key(secret));
}

export async function verifySessionToken(token: string | undefined, secret: string): Promise<boolean> {
  if (!token) return false;
  try {
    await jwtVerify(token, key(secret), { algorithms: ['HS256'] });
    return true;
  } catch {
    return false;
  }
}
