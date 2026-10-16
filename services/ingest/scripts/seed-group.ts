// Create (or find) the group for the Telegram chat and make sure all indexes exist.
// Usage: pnpm seed:group [--name "Nhà mình"] [--chat-id -100…]  (reads the root .env)
import { parseArgs } from 'node:util';
import { ensureIndexes, getMongoClient, upsertGroupByTelegramChatId } from '@angiday/db';
import { loadAppEnv } from '@angiday/shared';

const { values } = parseArgs({ options: { name: { type: 'string' }, 'chat-id': { type: 'string' } } });
const env = loadAppEnv(process.env, ['MONGODB_URI', 'TELEGRAM_ALLOWED_CHAT_IDS']);

const chatId = values['chat-id'] === undefined ? env.TELEGRAM_ALLOWED_CHAT_IDS[0] : Number(values['chat-id']);
if (chatId === undefined || !env.TELEGRAM_ALLOWED_CHAT_IDS.includes(chatId)) {
  throw new Error('--chat-id must be one of TELEGRAM_ALLOWED_CHAT_IDS');
}

const client = await getMongoClient(env.MONGODB_URI);
try {
  const db = client.db();
  await ensureIndexes(db);
  const group = await upsertGroupByTelegramChatId(db, { telegramChatId: chatId, name: values.name ?? 'AnGiDay' });
  console.log(`Database: ${db.databaseName}`);
  console.log(`Group "${group.name}" for chat ${group.telegramChatId}`);
  console.log(`GROUP_ID=${group.id}   ← put this in .env, apps/web/.env.local and Vercel`);
} finally {
  await client.close();
}
