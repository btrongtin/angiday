// Closest AWS region to Vietnam (Phase 1 plan → plan-level technical choices).
export const AWS_REGION = 'ap-southeast-1';

/**
 * SSM parameters created once by the owner (locals/setup-guideline.md §6). Keys are the app env names
 * (packages/shared/src/app-env.ts); each Lambda gets `<KEY>_PARAM=<name>` and reads the value at cold start.
 */
export const SSM_PARAMS = {
  MONGODB_URI: { name: '/angiday/mongodb-uri', secure: true },
  TELEGRAM_BOT_TOKEN: { name: '/angiday/telegram-bot-token', secure: true },
  TELEGRAM_WEBHOOK_SECRET: { name: '/angiday/telegram-webhook-secret', secure: true },
  TELEGRAM_ALLOWED_CHAT_IDS: { name: '/angiday/allowed-chat-ids', secure: false },
  GOOGLE_GENERATIVE_AI_API_KEY: { name: '/angiday/gemini-api-key', secure: true },
} as const;

export type SsmParamKey = keyof typeof SSM_PARAMS;

/** Geocoding (≤ 3 s) + one LLM call and up to two re-prompts (25 s budget each) must fit. */
export const WORKER_TIMEOUT_SECONDS = 60;

/** Not a secret, so a plain Lambda env var set by CDK instead of an SSM parameter (ADR-0016). */
export const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';
