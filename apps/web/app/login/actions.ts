'use server';

import { redirect } from 'next/navigation';
import { credentialsMatch } from '@/lib/auth';
import { getWebEnv } from '@/lib/env';
import { endSession, startSession } from '@/lib/session';

export async function login(formData: FormData): Promise<void> {
  const env = getWebEnv();
  const ok = credentialsMatch(
    { username: String(formData.get('username') ?? ''), password: String(formData.get('password') ?? '') },
    { username: env.WEB_LOGIN_USERNAME, password: env.WEB_LOGIN_PASSWORD },
  );
  if (!ok) redirect('/login?error=1');
  await startSession(env.WEB_LOGIN_USERNAME);
  redirect('/');
}

export async function logout(): Promise<void> {
  await endSession();
  redirect('/login');
}
