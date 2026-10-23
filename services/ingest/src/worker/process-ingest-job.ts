import type { ExtractionInput, ExtractionResult } from '@angiday/ai';
import {
  claimTelegramUpdate,
  type Db,
  ensureTags,
  findGroupByTelegramChatId,
  findPlaceByTelegramUpdate,
  listTags,
  markTelegramUpdateDone,
  upsertPlaceFromTelegram,
} from '@angiday/db';
import { type Area, dropPlaceEcho, formatAreaLabel, type IngestJob, matchTags, parseMapsPlaceUrl, stripMapsUrls } from '@angiday/shared';
import { findLegacyDistrict } from '@angiday/shared/legacy-district';
import type { ReverseGeocode } from '../geo/nominatim';
import type { Log } from '../lib/log';
import type { TelegramApi } from '../telegram/api';
import { formatSavedReply } from './format-reply';

export type ProcessOutcome = 'saved' | 'unparsed' | 'duplicate' | 'unknown_group';

export interface ProcessIngestJobDeps {
  db: Db;
  telegram: Pick<TelegramApi, 'sendMessage'>;
  resolveMapsLink: (url: string) => Promise<string | null>;
  reverseGeocode: ReverseGeocode;
  /** Rejects on transport errors (429, network) so SQS retries; see `extractPlaceDetails` in packages/ai. */
  extractPlaceDetails: (input: ExtractionInput) => Promise<ExtractionResult>;
  logger: Log;
}

export const REPLY_UNREADABLE_LINK =
  'Mình chưa đọc được link Google Maps này. Bạn thử bấm "Chia sẻ" trong app Google Maps rồi gửi lại link nhé.';

/**
 * F1 for S3: resolve the link, parse name + coordinates + feature id, reverse-geocode (never fails the job), find the
 * legacy district, extract cuisine / dish type / price / highlights / tags with the LLM, map tag names to ids, save, reply.
 * Safe to run twice for the same update: `telegram_updates` skips finished updates, the place upsert is keyed by the
 * update id, and a place that is already saved is replied from the database (no second geocode, no second LLM call).
 * Throws on transient errors (network, LLM, Telegram, Mongo) so SQS retries; returns for outcomes a retry can't change.
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

  // A retry after the place was saved (the reply or `markDone` failed): answer from what is stored.
  const existing = await findPlaceByTelegramUpdate(db, groupId, job.updateId);
  if (existing?.ingestStatus === 'saved') {
    logger.info('Place already saved; replying again', { groupId, placeId: existing.id });
    const names = new Map((await listTags(db, groupId)).map((tag) => [tag.id, tag.name]));
    await reply(formatSavedReply(existing, existing.tagIds.flatMap((id) => names.get(id) ?? [])));
    await markTelegramUpdateDone(db, groupId, job.updateId);
    return 'saved';
  }

  const resolvedUrl = await deps.resolveMapsLink(job.mapsUrl);
  const parsed = resolvedUrl === null ? null : parseMapsPlaceUrl(resolvedUrl);
  if (resolvedUrl === null || parsed === null) {
    logger.warn('Maps link could not be read', { groupId, mapsUrl: job.mapsUrl, resolvedUrl });
    await reply(REPLY_UNREADABLE_LINK);
    await markTelegramUpdateDone(db, groupId, job.updateId);
    return 'unparsed';
  }

  const geocoded = await deps.reverseGeocode(parsed.lat, parsed.lng);
  const geocodeGap =
    geocoded.kind === 'none' ? geocoded.reason : geocoded.ward === null ? 'no_ward' : geocoded.address === null ? 'no_street' : null;
  if (geocodeGap !== null) {
    logger.warn('Reverse geocoding found nothing or too little; saving with what we have', { groupId, reason: geocodeGap });
  }
  const area: Area = {
    city: geocoded.kind === 'found' ? geocoded.city : null,
    ward: geocoded.kind === 'found' ? geocoded.ward : null,
    legacyDistrict: findLegacyDistrict(parsed.lat, parsed.lng),
  };
  const address = geocoded.kind === 'found' ? geocoded.address : null;

  // The user's own words only: not the Maps link, nor the place name/address the Maps app adds to its share text.
  const note = dropPlaceEcho(stripMapsUrls(job.text), [parsed.name, address ?? '']);
  const existingTags = await listTags(db, groupId);
  const extraction = await deps.extractPlaceDetails({
    note,
    place: { name: parsed.name, address, areaLabel: formatAreaLabel(area) },
    existingTagNames: existingTags.map((tag) => tag.name),
  });
  // Without any words of the user's own, price and tags would be guesses from the place name alone: leave them empty.
  const hasNote = note.trim() !== '';
  const priceRange = hasNote ? extraction.details.priceRange : null;
  const { tagIds, toCreate } = matchTags({
    proposed: hasNote ? extraction.details.tags : [],
    existing: existingTags,
    note,
  });
  const created = await ensureTags(db, groupId, toCreate);
  const allTags = [...existingTags, ...created];
  const finalTagIds = [...new Set([...tagIds, ...created.map((tag) => tag.id)])];

  const place = await upsertPlaceFromTelegram(db, groupId, {
    name: parsed.name,
    mapsUrl: resolvedUrl,
    mapsFeatureId: parsed.featureId,
    location: { type: 'Point', coordinates: [parsed.lng, parsed.lat] },
    address,
    area,
    cuisine: extraction.details.cuisine,
    dishType: extraction.details.dishType,
    priceRange,
    highlights: extraction.details.highlights,
    tagIds: finalTagIds,
    source: {
      telegramChatId: job.chatId,
      telegramMessageId: job.messageId,
      telegramUpdateId: job.updateId,
      telegramUserId: job.userId,
    },
  });
  const tagNames = finalTagIds.flatMap((id) => allTags.find((tag) => tag.id === id)?.name ?? []);
  await reply(formatSavedReply(place, tagNames));
  await markTelegramUpdateDone(db, groupId, job.updateId);
  logger.info('Place saved', {
    groupId,
    placeId: place.id,
    llmAttempts: extraction.attempts,
    inputTokens: extraction.inputTokens,
    outputTokens: extraction.outputTokens,
    tagsCreated: created.length,
  });
  return 'saved';
}
