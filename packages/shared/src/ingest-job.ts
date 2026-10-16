import { z } from 'zod';

/** Body of an SQS message from the webhook to the worker. `updateId` is the correlation id in logs. */
export const ingestJobSchema = z.object({
  route: z.literal('maps_link'),
  updateId: z.number().int(),
  chatId: z.number().int(),
  messageId: z.number().int(),
  /** Forum topic to reply in; absent for General and for chats without topics. */
  threadId: z.number().int().optional(),
  userId: z.number().int().optional(),
  /** The user's text or caption: later slices use it as hints for the LLM. */
  text: z.string(),
  mapsUrl: z.url(),
});

export type IngestJob = z.infer<typeof ingestJobSchema>;
