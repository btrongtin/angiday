import { describe, expect, it, vi } from 'vitest';
import { loadLambdaEnv } from './lambda-env';

describe('loadLambdaEnv', () => {
  const env = {
    TELEGRAM_WEBHOOK_SECRET_PARAM: '/angiday/telegram-webhook-secret',
    TELEGRAM_ALLOWED_CHAT_IDS_PARAM: '/angiday/allowed-chat-ids',
  };

  it('reads each <KEY>_PARAM from SSM and validates the values', async () => {
    const fetchParameters = vi.fn().mockResolvedValue({
      '/angiday/telegram-webhook-secret': 'deadbeef',
      '/angiday/allowed-chat-ids': '-100123,-100456',
    });

    const result = await loadLambdaEnv(['TELEGRAM_WEBHOOK_SECRET', 'TELEGRAM_ALLOWED_CHAT_IDS'], env, fetchParameters);

    expect(fetchParameters).toHaveBeenCalledWith(['/angiday/telegram-webhook-secret', '/angiday/allowed-chat-ids']);
    expect(result).toEqual({ TELEGRAM_WEBHOOK_SECRET: 'deadbeef', TELEGRAM_ALLOWED_CHAT_IDS: [-100123, -100456] });
  });

  it('fails clearly when CDK did not set a parameter name', async () => {
    await expect(loadLambdaEnv(['MONGODB_URI'], env, vi.fn())).rejects.toThrow('MONGODB_URI_PARAM is not set');
  });

  it('fails validation without echoing the secret value', async () => {
    const fetchParameters = vi.fn().mockResolvedValue({ '/angiday/allowed-chat-ids': 'secret-garbage' });

    const load = loadLambdaEnv(['TELEGRAM_ALLOWED_CHAT_IDS'], env, fetchParameters);

    await expect(load).rejects.toThrow(/TELEGRAM_ALLOWED_CHAT_IDS/);
    await expect(load).rejects.not.toThrow(/secret-garbage/);
  });
});
