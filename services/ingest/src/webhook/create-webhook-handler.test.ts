import type { LambdaFunctionURLEvent } from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';
import { createTestLog, makeJob, makeUpdate, TEST_CHAT_ID } from '../test/fixtures';
import { createWebhookHandler } from './create-webhook-handler';

const SECRET = 'deadbeef';

function event(body: unknown, headers: Record<string, string> = { 'x-telegram-bot-api-secret-token': SECRET }) {
  return { headers, body: typeof body === 'string' ? body : JSON.stringify(body), isBase64Encoded: false } as unknown as LambdaFunctionURLEvent;
}

function setup(enqueue = vi.fn().mockResolvedValue(undefined)) {
  const logger = createTestLog();
  const handler = createWebhookHandler({
    getConfig: async () => ({ TELEGRAM_WEBHOOK_SECRET: SECRET, TELEGRAM_ALLOWED_CHAT_IDS: [TEST_CHAT_ID] }),
    enqueue,
    logger,
  });
  return { handler, enqueue, logger };
}

describe('webhook handler', () => {
  it('enqueues a Maps link from the allowed chat and answers 200', async () => {
    const { handler, enqueue } = setup();

    const result = await handler(event(makeUpdate()));

    expect(result.statusCode).toBe(200);
    expect(enqueue).toHaveBeenCalledWith(makeJob());
  });

  it.each([
    ['missing', {}],
    ['wrong', { 'x-telegram-bot-api-secret-token': 'nope' }],
  ])('rejects a %s secret header with 401 and enqueues nothing', async (_label, headers) => {
    const { handler, enqueue } = setup();

    const result = await handler(event(makeUpdate(), headers));

    expect(result.statusCode).toBe(401);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it.each([
    ['a message from another chat', makeUpdate({ chat: { id: -100999, type: 'supergroup' } })],
    ['a message without a Maps link', makeUpdate({ text: 'ăn gì đây' })],
    ['a body that is not JSON', 'not json'],
    ['a body that is not an Update', { hello: 'world' }],
  ])('drops %s with 200 (Telegram must not retry it)', async (_label, body) => {
    const { handler, enqueue } = setup();

    const result = await handler(event(body));

    expect(result.statusCode).toBe(200);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('decodes a base64 body', async () => {
    const { handler, enqueue } = setup();
    const base64 = {
      ...event(makeUpdate()),
      body: Buffer.from(JSON.stringify(makeUpdate())).toString('base64'),
      isBase64Encoded: true,
    } as LambdaFunctionURLEvent;

    await handler(base64);

    expect(enqueue).toHaveBeenCalledOnce();
  });

  it('answers 500 when the queue write fails, so Telegram retries', async () => {
    const { handler, logger } = setup(vi.fn().mockRejectedValue(new Error('SQS down')));

    const result = await handler(event(makeUpdate()));

    expect(result.statusCode).toBe(500);
    expect(logger.error).toHaveBeenCalled();
  });

  it('logs the updateId and route as correlation fields', async () => {
    const { handler, logger } = setup();

    await handler(event(makeUpdate()));

    expect(logger.info).toHaveBeenCalledWith('Routed update', expect.objectContaining({ updateId: 9001, route: 'maps_link' }));
  });
});
