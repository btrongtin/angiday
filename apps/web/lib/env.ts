import 'server-only';
import { loadAppEnv } from '@angiday/shared';

const WEB_ENV_KEYS = ['MONGODB_URI', 'WEB_LOGIN_USERNAME', 'WEB_LOGIN_PASSWORD', 'SESSION_SECRET', 'GROUP_ID'] as const;

let cached: ReturnType<typeof load> | undefined;
const load = () => loadAppEnv(process.env, WEB_ENV_KEYS);

/** Read lazily at request time, so `next build` (CI) needs no env vars. */
export function getWebEnv() {
  return (cached ??= load());
}
