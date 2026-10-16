import type { IngestJob } from './ingest-job';
import { extractMapsUrl } from './maps-url';
import type { TelegramMessage, TelegramUpdate } from './telegram-update';

export type DropReason = 'no_message' | 'unknown_chat' | 'from_bot' | 'no_maps_link';
export type RouteDecision = { kind: 'enqueue'; job: IngestJob } | { kind: 'drop'; reason: DropReason };

/** First Google Maps URL in the text/caption, including links hidden behind `text_link` entities. */
export function findMapsUrlInMessage(message: TelegramMessage): string | null {
  const parts = [
    { text: message.text, entities: message.entities },
    { text: message.caption, entities: message.caption_entities },
  ];
  for (const { text, entities } of parts) {
    for (const entity of entities ?? []) {
      if (entity.type === 'text_link' && entity.url) {
        const url = extractMapsUrl(entity.url);
        if (url) return url;
      }
    }
    if (text) {
      const url = extractMapsUrl(text);
      if (url) return url;
    }
  }
  return null;
}

/**
 * Decide cheaply what enters the queue (architecture.md → Ingest routing). S1 handles only
 * "message with a Maps link"; `/add`, replies and chat routes arrive in S5 and Phase 2.
 */
export function routeUpdate(update: TelegramUpdate, allowedChatIds: readonly number[]): RouteDecision {
  const message = update.message;
  if (!message) return { kind: 'drop', reason: 'no_message' };
  if (!allowedChatIds.includes(message.chat.id)) return { kind: 'drop', reason: 'unknown_chat' };
  if (message.from?.is_bot) return { kind: 'drop', reason: 'from_bot' };

  const mapsUrl = findMapsUrlInMessage(message);
  if (!mapsUrl) return { kind: 'drop', reason: 'no_maps_link' };

  return {
    kind: 'enqueue',
    job: {
      route: 'maps_link',
      updateId: update.update_id,
      chatId: message.chat.id,
      messageId: message.message_id,
      // message_thread_id also marks reply threads in non-forum chats; only forum topics take it back.
      threadId: message.is_topic_message ? message.message_thread_id : undefined,
      userId: message.from?.id,
      text: message.text ?? message.caption ?? '',
      mapsUrl,
    },
  };
}
