import { z } from 'zod';
import { parseEnv } from './env';

/** Comma-separated Telegram chat ids ("-1001234567890,-1009876543210") → number[]; at least one id. */
const chatIdList = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id !== ''),
  )
  .pipe(z.array(z.string().regex(/^-?\d+$/, 'must be a comma-separated list of numeric chat ids')).min(1))
  .transform((ids) => ids.map(Number));

/**
 * Every environment variable the app reads; names match `.env.example`.
 * Values live in `.env` locally, SSM Parameter Store on AWS and Vercel env vars for the web app
 * (see CLAUDE.md → Secrets). Never put a value in this file.
 */
export const appEnvShape = {
  MONGODB_URI: z.string().min(1),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(1),
  TELEGRAM_ALLOWED_CHAT_IDS: chatIdList,
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1),
} satisfies z.ZodRawShape;

export type AppEnv = z.infer<z.ZodObject<typeof appEnvShape>>;

/** Call once at startup: `const env = loadAppEnv(process.env)`. Throws if a variable is missing or invalid. */
export function loadAppEnv(source: Record<string, string | undefined>): AppEnv {
  return parseEnv(appEnvShape, source);
}
