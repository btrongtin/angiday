import { describe, expect, it } from 'vitest';
import { loadAppEnv } from './app-env';

const valid = {
  MONGODB_URI: 'mongodb+srv://user:pass@cluster.mongodb.net/angiday',
  TELEGRAM_BOT_TOKEN: '123456:abc',
  TELEGRAM_WEBHOOK_SECRET: 'deadbeef',
  TELEGRAM_ALLOWED_CHAT_IDS: '-1001234567890, -1009876543210',
  GOOGLE_GENERATIVE_AI_API_KEY: 'key',
  WEB_LOGIN_USERNAME: 'admin',
  WEB_LOGIN_PASSWORD: 'a-long-password',
  SESSION_SECRET: '0123456789abcdef0123456789abcdef',
  GROUP_ID: '65f1c2a4b3d2e1f001234567',
};

describe('loadAppEnv', () => {
  it('parses the variables listed in .env.example', () => {
    const env = loadAppEnv(valid);

    expect(env.MONGODB_URI).toBe(valid.MONGODB_URI);
    expect(env.TELEGRAM_ALLOWED_CHAT_IDS).toEqual([-1001234567890, -1009876543210]);
    expect(env.GROUP_ID).toBe(valid.GROUP_ID);
  });

  it('names every missing variable in one error', () => {
    expect(() => loadAppEnv({})).toThrowError(
      /MONGODB_URI[\s\S]*TELEGRAM_BOT_TOKEN[\s\S]*TELEGRAM_WEBHOOK_SECRET[\s\S]*TELEGRAM_ALLOWED_CHAT_IDS[\s\S]*GOOGLE_GENERATIVE_AI_API_KEY[\s\S]*WEB_LOGIN_USERNAME[\s\S]*WEB_LOGIN_PASSWORD[\s\S]*SESSION_SECRET[\s\S]*GROUP_ID/,
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

  it('rejects a short session secret and a GROUP_ID that is not an ObjectId', () => {
    expect(() => loadAppEnv({ ...valid, SESSION_SECRET: 'short' })).toThrowError(/SESSION_SECRET/);
    expect(() => loadAppEnv({ ...valid, GROUP_ID: 'my-group' })).toThrowError(/GROUP_ID/);
  });

  it('rejects a MONGODB_URI with no database name (would silently connect to the driver default "test" db)', () => {
    expect(() => loadAppEnv({ ...valid, MONGODB_URI: 'mongodb+srv://user:pass@cluster.mongodb.net/' })).toThrowError(
      /MONGODB_URI/,
    );
    expect(() => loadAppEnv({ ...valid, MONGODB_URI: 'mongodb+srv://user:pass@cluster.mongodb.net/?retryWrites=true' })).toThrowError(
      /MONGODB_URI/,
    );
  });

  it('accepts a non-SRV, multi-host MONGODB_URI with a database name', () => {
    const multiHost =
      'mongodb://user:pass@shard-00.mongodb.net:27017,shard-01.mongodb.net:27017/angiday?replicaSet=rs0';

    expect(() => loadAppEnv({ ...valid, MONGODB_URI: multiHost })).not.toThrow();
  });

  describe('with a list of keys', () => {
    it('validates and returns only those keys', () => {
      const env = loadAppEnv(
        { TELEGRAM_WEBHOOK_SECRET: 'deadbeef', TELEGRAM_ALLOWED_CHAT_IDS: '-100123' },
        ['TELEGRAM_WEBHOOK_SECRET', 'TELEGRAM_ALLOWED_CHAT_IDS'],
      );

      expect(env).toEqual({ TELEGRAM_WEBHOOK_SECRET: 'deadbeef', TELEGRAM_ALLOWED_CHAT_IDS: [-100123] });
    });

    it('still fails on a missing listed key', () => {
      expect(() => loadAppEnv({}, ['MONGODB_URI'])).toThrowError(/MONGODB_URI/);
    });
  });
});

describe('NOMINATIM_BASE_URL', () => {
  it('defaults to the public Nominatim instance', () => {
    expect(loadAppEnv({}, ['NOMINATIM_BASE_URL']).NOMINATIM_BASE_URL).toBe('https://nominatim.openstreetmap.org');
  });

  it('keeps a custom URL', () => {
    expect(loadAppEnv({ NOMINATIM_BASE_URL: 'https://geo.example.com/nominatim' }, ['NOMINATIM_BASE_URL']).NOMINATIM_BASE_URL).toBe(
      'https://geo.example.com/nominatim',
    );
  });

  it('rejects a value that is not a URL', () => {
    expect(() => loadAppEnv({ NOMINATIM_BASE_URL: 'not a url' }, ['NOMINATIM_BASE_URL'])).toThrow(/NOMINATIM_BASE_URL/);
  });
});

