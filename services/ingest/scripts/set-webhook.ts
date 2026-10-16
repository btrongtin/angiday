// Point the bot's webhook at the deployed Function URL, with the secret header and message updates only.
// Usage: pnpm set-webhook --url https://….lambda-url.ap-southeast-1.on.aws/  (reads the root .env)
import { parseArgs } from 'node:util';
import { loadAppEnv } from '@angiday/shared';
import { createTelegramApi } from '../src/telegram/api';

const { values } = parseArgs({ options: { url: { type: 'string' } } });
if (!values.url?.startsWith('https://')) {
  throw new Error('Pass --url <WebhookUrl> (the output of `cdk deploy`)');
}

const env = loadAppEnv(process.env, ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_WEBHOOK_SECRET']);
const telegram = createTelegramApi(env.TELEGRAM_BOT_TOKEN);

await telegram.setWebhook({
  url: values.url,
  secretToken: env.TELEGRAM_WEBHOOK_SECRET,
  allowedUpdates: ['message'],
  dropPendingUpdates: true,
});
const info = await telegram.getWebhookInfo();
console.log({
  url: info.url,
  allowed_updates: info.allowed_updates,
  pending_update_count: info.pending_update_count,
  last_error_message: info.last_error_message ?? null,
});
