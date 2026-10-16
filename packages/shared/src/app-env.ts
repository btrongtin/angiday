import { z } from 'zod';
import { parseEnv } from './env';
import { objectIdSchema } from './ids';

type EnvSource = Record<string, string | undefined>;

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
/**
 * Requires a non-empty database name right after the host(s): `.../angiday?...`. Without this,
 * the driver's `getDb()` (no db argument) silently connects to its default `test` database —
 * the exact mistake that broke the S1 Task 10 demo (code-review finding, ledgered in S1's plan).
 * Matches both the SRV form and the owner's non-SRV, comma-separated multi-host form.
 */
const mongodbUri = z
  .string()
  .min(1)
  .regex(/^mongodb(\+srv)?:\/\/[^/]+\/[^/?]+/, 'must include a database name, e.g. …mongodb.net/angiday?...');

export const appEnvShape = {
  MONGODB_URI: mongodbUri,
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(1),
  TELEGRAM_ALLOWED_CHAT_IDS: chatIdList,
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1),
  WEB_LOGIN_USERNAME: z.string().min(1),
  WEB_LOGIN_PASSWORD: z.string().min(12, 'must be at least 12 characters'),
  SESSION_SECRET: z.string().min(32, 'must be at least 32 characters (openssl rand -hex 32)'),
  GROUP_ID: objectIdSchema,
} satisfies z.ZodRawShape;

export type AppEnv = z.infer<z.ZodObject<typeof appEnvShape>>;
export type AppEnvKey = keyof typeof appEnvShape;

/**
 * Call once at startup. Without `keys` every variable is required; with `keys` only those are
 * validated and returned, so each runtime asks for exactly what it uses:
 * `loadAppEnv(process.env, ['MONGODB_URI', 'GROUP_ID'])`. Throws if a variable is missing or invalid.
 */
export function loadAppEnv(source: EnvSource): AppEnv;
export function loadAppEnv<K extends AppEnvKey>(source: EnvSource, keys: readonly K[]): Pick<AppEnv, K>;
export function loadAppEnv(source: EnvSource, keys?: readonly AppEnvKey[]): Partial<AppEnv> {
  if (!keys) return parseEnv(appEnvShape, source);
  const shape = Object.fromEntries(keys.map((key) => [key, appEnvShape[key]])) as z.ZodRawShape;
  return parseEnv(shape, source) as Partial<AppEnv>;
}
