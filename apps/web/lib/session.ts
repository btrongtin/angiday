import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, verifySessionToken } from './auth';
import { getWebEnv } from './env';

/** Call at the top of every protected page / action. */
export async function requireSession(): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!(await verifySessionToken(token, getWebEnv().SESSION_SECRET))) redirect('/login');
}

export async function startSession(username: string): Promise<void> {
  const token = await createSessionToken(username, getWebEnv().SESSION_SECRET);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
