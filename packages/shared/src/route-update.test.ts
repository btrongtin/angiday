import { describe, expect, it } from 'vitest';
import { findMapsUrlInMessage, routeUpdate } from './route-update';
import type { TelegramMessage, TelegramUpdate } from './telegram-update';

const CHAT_ID = -1001234567890;
const LINK = 'https://maps.app.goo.gl/AbC123xyz';

function message(overrides: Partial<TelegramMessage> = {}): TelegramMessage {
  return {
    message_id: 42,
    from: { id: 111, is_bot: false },
    chat: { id: CHAT_ID, type: 'supergroup' },
    text: `ngon nè ${LINK}`,
    ...overrides,
  };
}

function update(msg: TelegramMessage = message()): TelegramUpdate {
  return { update_id: 9001, message: msg };
}

describe('routeUpdate', () => {
  it('enqueues a Maps link from an allowed chat', () => {
    expect(routeUpdate(update(), [CHAT_ID])).toEqual({
      kind: 'enqueue',
      job: {
        route: 'maps_link',
        updateId: 9001,
        chatId: CHAT_ID,
        messageId: 42,
        userId: 111,
        text: `ngon nè ${LINK}`,
        mapsUrl: LINK,
      },
    });
  });

  it.each([
    ['no message (e.g. edited_message only)', { update_id: 9001 }, 'no_message'],
    ['unknown chat', update(message({ chat: { id: -100999, type: 'supergroup' } })), 'unknown_chat'],
    ['message from a bot', update(message({ from: { id: 7, is_bot: true } })), 'from_bot'],
    ['no Maps link', update(message({ text: 'ăn gì đây' })), 'no_maps_link'],
  ] as const)('drops: %s', (_label, input, reason) => {
    expect(routeUpdate(input, [CHAT_ID])).toEqual({ kind: 'drop', reason });
  });

  it('keeps the topic id for a forum topic message', () => {
    const decision = routeUpdate(update(message({ message_thread_id: 77, is_topic_message: true })), [CHAT_ID]);

    expect(decision.kind === 'enqueue' && decision.job.threadId).toBe(77);
  });

  it('ignores a reply-thread id outside forum topics (sending it would fail)', () => {
    const decision = routeUpdate(update(message({ message_thread_id: 41 })), [CHAT_ID]);

    expect(decision.kind === 'enqueue' && decision.job.threadId).toBeUndefined();
  });

  it('uses the caption when the message is a photo', () => {
    const decision = routeUpdate(update(message({ text: undefined, caption: LINK })), [CHAT_ID]);

    expect(decision).toMatchObject({ kind: 'enqueue', job: { mapsUrl: LINK, text: LINK } });
  });
});

describe('findMapsUrlInMessage', () => {
  it('finds a link hidden behind a text_link entity', () => {
    const msg = message({
      text: 'quán này',
      entities: [{ type: 'text_link', offset: 0, length: 8, url: LINK }],
    });

    expect(findMapsUrlInMessage(msg)).toBe(LINK);
  });

  it('returns null when nothing links to Maps', () => {
    const msg = message({
      text: 'xem đây',
      entities: [{ type: 'text_link', offset: 0, length: 7, url: 'https://example.com' }],
    });

    expect(findMapsUrlInMessage(msg)).toBeNull();
  });
});
