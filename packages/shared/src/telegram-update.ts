import { z } from 'zod';

const messageEntitySchema = z.object({
  type: z.string(),
  offset: z.number().int(),
  length: z.number().int(),
  url: z.string().optional(),
});

/** The subset of a Telegram `Message` that ingest reads. Unknown fields are stripped. */
export const telegramMessageSchema = z.object({
  message_id: z.number().int(),
  message_thread_id: z.number().int().optional(),
  is_topic_message: z.boolean().optional(),
  from: z.object({ id: z.number().int(), is_bot: z.boolean() }).optional(),
  chat: z.object({ id: z.number().int(), type: z.string() }),
  text: z.string().optional(),
  caption: z.string().optional(),
  entities: z.array(messageEntitySchema).optional(),
  caption_entities: z.array(messageEntitySchema).optional(),
});

/** Telegram `Update`. The webhook is registered with `allowed_updates: ["message"]`. */
export const telegramUpdateSchema = z.object({
  update_id: z.number().int(),
  message: telegramMessageSchema.optional(),
});

export type TelegramMessage = z.infer<typeof telegramMessageSchema>;
export type TelegramUpdate = z.infer<typeof telegramUpdateSchema>;
