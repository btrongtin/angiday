import { createHash, timingSafeEqual } from 'node:crypto';
import { type IngestJob, routeUpdate, type TelegramUpdate, telegramUpdateSchema } from '@angiday/shared';
import type { APIGatewayProxyStructuredResultV2, LambdaFunctionURLEvent } from 'aws-lambda';
import { errorFields, type Log } from '../lib/log';

// LambdaFunctionURLResult is a union with `string`; we always return the structured object form.
type WebhookResult = APIGatewayProxyStructuredResultV2;

export interface WebhookConfig {
  TELEGRAM_WEBHOOK_SECRET: string;
  TELEGRAM_ALLOWED_CHAT_IDS: number[];
}

export interface WebhookDeps {
  getConfig: () => Promise<WebhookConfig>;
  enqueue: (job: IngestJob) => Promise<void>;
  logger: Log;
}

const SECRET_HEADER = 'x-telegram-bot-api-secret-token';

/** Constant-time comparison; hashing first makes the lengths equal. */
function secretMatches(given: string | undefined, expected: string): boolean {
  if (given === undefined) return false;
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

function parseUpdate(event: LambdaFunctionURLEvent): TelegramUpdate | null {
  if (!event.body) return null;
  const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  try {
    const result = telegramUpdateSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/**
 * Telegram webhook (architecture.md → F1, first hop): verify the secret, route, enqueue, ack fast.
 * Anything we drop gets 200 so Telegram doesn't retry it; only a failed enqueue returns 500.
 */
export function createWebhookHandler({ getConfig, enqueue, logger }: WebhookDeps) {
  return async (event: LambdaFunctionURLEvent): Promise<WebhookResult> => {
    try {
      const config = await getConfig();
      if (!secretMatches(event.headers[SECRET_HEADER], config.TELEGRAM_WEBHOOK_SECRET)) {
        logger.warn('Rejected webhook call: bad secret header');
        return { statusCode: 401 };
      }

      const update = parseUpdate(event);
      if (!update) {
        logger.warn('Dropped webhook body: not a Telegram update');
        return { statusCode: 200 };
      }

      const decision = routeUpdate(update, config.TELEGRAM_ALLOWED_CHAT_IDS);
      logger.info('Routed update', {
        updateId: update.update_id,
        chatId: update.message?.chat.id,
        route: decision.kind === 'enqueue' ? decision.job.route : 'drop',
        dropReason: decision.kind === 'drop' ? decision.reason : undefined,
      });
      if (decision.kind === 'enqueue') await enqueue(decision.job);
      return { statusCode: 200 };
    } catch (error) {
      logger.error('Webhook failed; Telegram will retry', errorFields(error));
      return { statusCode: 500 };
    }
  };
}
