import {
  claimTelegramUpdate,
  type Db,
  findGroupByTelegramChatId,
  markTelegramUpdateDone,
  upsertPlaceFromTelegram,
} from '@angiday/db';
import { type IngestJob, parseMapsPlaceUrl } from '@angiday/shared';
import type { Log } from '../lib/log';
import type { TelegramApi } from '../telegram/api';

export type ProcessOutcome = 'saved' | 'unparsed' | 'duplicate' | 'unknown_group';

export interface ProcessIngestJobDeps {
  db: Db;
  telegram: Pick<TelegramApi, 'sendMessage'>;
  resolveMapsLink: (url: string) => Promise<string | null>;
  logger: Log;
}

export const replySaved = (name: string) => `Đã lưu: ${name}`;
export const REPLY_UNREADABLE_LINK =
  'Mình chưa đọc được link Google Maps này. Bạn thử bấm "Chia sẻ" trong app Google Maps rồi gửi lại link nhé.';

/**
 * F1 for S1: resolve the link, parse name + coordinates, save, reply. Safe to run twice for the same
 * update: `telegram_updates` skips finished updates and the place upsert is keyed by the update id.
 * Throws on transient errors (network, Telegram, Mongo) so SQS retries; returns for outcomes a retry can't change.
 */
export async function processIngestJob(job: IngestJob, deps: ProcessIngestJobDeps): Promise<ProcessOutcome> {
  const { db, telegram, logger } = deps;

  const group = await findGroupByTelegramChatId(db, job.chatId);
  if (!group) {
    logger.error('No group for this chat; run `pnpm seed:group`', { chatId: job.chatId });
    return 'unknown_group';
  }
  const groupId = group.id;

  if ((await claimTelegramUpdate(db, groupId, job.updateId)) === 'done') {
    logger.info('Update already processed; skipped', { groupId });
    return 'duplicate';
  }

  const reply = (text: string) =>
    telegram.sendMessage({ chatId: job.chatId, text, replyToMessageId: job.messageId, threadId: job.threadId });

  const resolvedUrl = await deps.resolveMapsLink(job.mapsUrl);
  const parsed = resolvedUrl === null ? null : parseMapsPlaceUrl(resolvedUrl);
  if (resolvedUrl === null || parsed === null) {
    logger.warn('Maps link could not be read', { groupId, mapsUrl: job.mapsUrl, resolvedUrl });
    await reply(REPLY_UNREADABLE_LINK);
    await markTelegramUpdateDone(db, groupId, job.updateId);
    return 'unparsed';
  }

  const place = await upsertPlaceFromTelegram(db, groupId, {
    name: parsed.name,
    mapsUrl: resolvedUrl,
    location: { type: 'Point', coordinates: [parsed.lng, parsed.lat] },
    source: {
      telegramChatId: job.chatId,
      telegramMessageId: job.messageId,
      telegramUpdateId: job.updateId,
      telegramUserId: job.userId,
    },
  });
  await reply(replySaved(place.name));
  await markTelegramUpdateDone(db, groupId, job.updateId);
  logger.info('Place saved', { groupId, placeId: place.id });
  return 'saved';
}
