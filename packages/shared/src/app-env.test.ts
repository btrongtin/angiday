import { describe, expect, it } from 'vitest';
import { loadAppEnv } from './app-env';

const valid = {
  MONGODB_URI: 'mongodb+srv://user:pass@cluster.mongodb.net/angiday',
  TELEGRAM_BOT_TOKEN: '123456:abc',
  TELEGRAM_WEBHOOK_SECRET: 'deadbeef',
  TELEGRAM_ALLOWED_CHAT_IDS: '-1001234567890, -1009876543210',
  GOOGLE_GENERATIVE_AI_API_KEY: 'key',
};

describe('loadAppEnv', () => {
  it('parses the variables listed in .env.example', () => {
    const env = loadAppEnv(valid);

    expect(env.MONGODB_URI).toBe(valid.MONGODB_URI);
    expect(env.TELEGRAM_ALLOWED_CHAT_IDS).toEqual([-1001234567890, -1009876543210]);
  });

  it('names every missing variable in one error', () => {
    expect(() => loadAppEnv({})).toThrowError(
      /MONGODB_URI[\s\S]*TELEGRAM_BOT_TOKEN[\s\S]*TELEGRAM_WEBHOOK_SECRET[\s\S]*TELEGRAM_ALLOWED_CHAT_IDS[\s\S]*GOOGLE_GENERATIVE_AI_API_KEY/,
    );
  });

  it('rejects a chat id list that is not numeric and does not echo the value', () => {
    const bad = { ...valid, TELEGRAM_ALLOWED_CHAT_IDS: 'my-group' };

    expect(() => loadAppEnv(bad)).toThrowError(/TELEGRAM_ALLOWED_CHAT_IDS/);
    expect(() => loadAppEnv(bad)).not.toThrowError(/my-group/);
  });

  it('rejects an empty chat id list (an empty allowlist would silently drop every message)', () => {
    expect(() => loadAppEnv({ ...valid, TELEGRAM_ALLOWED_CHAT_IDS: ' , ' })).toThrowError(/TELEGRAM_ALLOWED_CHAT_IDS/);
  });
});
