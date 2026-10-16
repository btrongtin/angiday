export interface SendMessageInput {
  chatId: number;
  text: string;
  replyToMessageId?: number;
  /** Forum topic id; omit for General / chats without topics. */
  threadId?: number;
}

export interface WebhookInfo {
  url: string;
  pending_update_count: number;
  last_error_date?: number;
  last_error_message?: string;
  allowed_updates?: string[];
}

export interface TelegramApi {
  sendMessage(input: SendMessageInput): Promise<{ messageId: number }>;
  setWebhook(input: { url: string; secretToken: string; allowedUpdates: string[]; dropPendingUpdates?: boolean }): Promise<void>;
  getWebhookInfo(): Promise<WebhookInfo>;
}

export class TelegramApiError extends Error {
  constructor(
    readonly method: string,
    readonly errorCode: number | undefined,
    description: string,
  ) {
    super(`Telegram ${method} failed${errorCode === undefined ? '' : ` (${errorCode})`}: ${description}`);
    this.name = 'TelegramApiError';
  }
}

interface TelegramResponse<T> {
  ok?: boolean;
  result?: T;
  error_code?: number;
  description?: string;
}

/** Minimal Bot API client. The token is part of every URL, so errors are built here and never carry it. */
export function createTelegramApi(token: string, fetchFn: typeof fetch = fetch): TelegramApi {
  const redact = (text: string) => text.replaceAll(token, '<token>');

  async function call<T>(method: string, body: Record<string, unknown> = {}): Promise<T> {
    let response: Response;
    try {
      response = await fetchFn(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      throw new TelegramApiError(method, undefined, redact(error instanceof Error ? `${error.name}: ${error.message}` : String(error)));
    }
    const json = (await response.json().catch(() => null)) as TelegramResponse<T> | null;
    if (!json?.ok) {
      throw new TelegramApiError(method, json?.error_code ?? response.status, redact(json?.description ?? 'unexpected response'));
    }
    return json.result as T;
  }

  return {
    async sendMessage({ chatId, text, replyToMessageId, threadId }) {
      const message = await call<{ message_id: number }>('sendMessage', {
        chat_id: chatId,
        text,
        message_thread_id: threadId,
        reply_parameters:
          replyToMessageId === undefined ? undefined : { message_id: replyToMessageId, allow_sending_without_reply: true },
        link_preview_options: { is_disabled: true },
      });
      return { messageId: message.message_id };
    },
    async setWebhook({ url, secretToken, allowedUpdates, dropPendingUpdates = false }) {
      await call<boolean>('setWebhook', {
        url,
        secret_token: secretToken,
        allowed_updates: allowedUpdates,
        drop_pending_updates: dropPendingUpdates,
      });
    },
    getWebhookInfo: () => call<WebhookInfo>('getWebhookInfo'),
  };
}
