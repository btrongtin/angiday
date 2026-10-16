import { describe, expect, it, vi } from 'vitest';
import { createTelegramApi, TelegramApiError } from './api';

const TOKEN = '123456:SECRET-TOKEN';

function fakeFetch(body: unknown, status = 200) {
  return vi.fn<typeof fetch>().mockResolvedValue(Response.json(body, { status }));
}

describe('createTelegramApi', () => {
  it('sendMessage posts JSON with reply and topic parameters', async () => {
    const fetchFn = fakeFetch({ ok: true, result: { message_id: 555 } });
    const api = createTelegramApi(TOKEN, fetchFn);

    const result = await api.sendMessage({ chatId: -100123, text: 'Đã lưu: Phở Hòa', replyToMessageId: 42, threadId: 77 });

    expect(result).toEqual({ messageId: 555 });
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe(`https://api.telegram.org/bot${TOKEN}/sendMessage`);
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      chat_id: -100123,
      text: 'Đã lưu: Phở Hòa',
      message_thread_id: 77,
      reply_parameters: { message_id: 42, allow_sending_without_reply: true },
      link_preview_options: { is_disabled: true },
    });
  });

  it('omits message_thread_id when there is no topic', async () => {
    const fetchFn = fakeFetch({ ok: true, result: { message_id: 1 } });

    await createTelegramApi(TOKEN, fetchFn).sendMessage({ chatId: -100123, text: 'x' });

    expect(JSON.parse(String(fetchFn.mock.calls[0]![1]?.body))).not.toHaveProperty('message_thread_id');
  });

  it('throws TelegramApiError on ok:false without leaking the token', async () => {
    const api = createTelegramApi(TOKEN, fakeFetch({ ok: false, error_code: 400, description: 'Bad Request: chat not found' }, 400));

    const call = api.sendMessage({ chatId: 1, text: 'x' });

    await expect(call).rejects.toBeInstanceOf(TelegramApiError);
    await expect(call).rejects.toThrow('sendMessage failed (400): Bad Request: chat not found');
  });

  it('redacts the token from network errors', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(new TypeError(`fetch failed for /bot${TOKEN}/sendMessage`));

    const call = createTelegramApi(TOKEN, fetchFn).sendMessage({ chatId: 1, text: 'x' });

    await expect(call).rejects.toThrow(TelegramApiError);
    await expect(call).rejects.not.toThrow(/SECRET-TOKEN/);
  });

  it('setWebhook sends secret_token and allowed_updates', async () => {
    const fetchFn = fakeFetch({ ok: true, result: true });

    await createTelegramApi(TOKEN, fetchFn).setWebhook({
      url: 'https://abc.lambda-url.ap-southeast-1.on.aws/',
      secretToken: 'deadbeef',
      allowedUpdates: ['message'],
      dropPendingUpdates: true,
    });

    expect(JSON.parse(String(fetchFn.mock.calls[0]![1]?.body))).toEqual({
      url: 'https://abc.lambda-url.ap-southeast-1.on.aws/',
      secret_token: 'deadbeef',
      allowed_updates: ['message'],
      drop_pending_updates: true,
    });
  });
});
