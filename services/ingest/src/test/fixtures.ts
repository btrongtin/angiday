import type { IngestJob, TelegramMessage, TelegramUpdate } from '@angiday/shared';
import { vi } from 'vitest';
import type { KeyedLog } from '../lib/log';

export const TEST_CHAT_ID = -1001234567890;
export const TEST_SHORT_LINK = 'https://maps.app.goo.gl/AbC123xyz';
export const TEST_PLACE_URL =
  'https://www.google.com/maps/place/Ph%E1%BB%9F+H%C3%B2a/@10.7895162,106.6880276,17z/data=!3m1!4b1!4m6!3m5!1s0x1:0x2!8m2!3d10.7895109!4d106.6906025';

export function createTestLog() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), appendKeys: vi.fn(), removeKeys: vi.fn() } satisfies KeyedLog;
}

export function makeUpdate(message: Partial<TelegramMessage> = {}, updateId = 9001): TelegramUpdate {
  return {
    update_id: updateId,
    message: {
      message_id: 42,
      from: { id: 111, is_bot: false },
      chat: { id: TEST_CHAT_ID, type: 'supergroup' },
      text: `ngon nè ${TEST_SHORT_LINK}`,
      ...message,
    },
  };
}

export function makeJob(overrides: Partial<IngestJob> = {}): IngestJob {
  return {
    route: 'maps_link',
    updateId: 9001,
    chatId: TEST_CHAT_ID,
    messageId: 42,
    userId: 111,
    text: `ngon nè ${TEST_SHORT_LINK}`,
    mapsUrl: TEST_SHORT_LINK,
    ...overrides,
  };
}
