import { Logger } from '@aws-lambda-powertools/logger';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { loadLambdaEnv } from '../lib/lambda-env';
import { memoizeAsync } from '../lib/memoize-async';
import { createWebhookHandler } from './create-webhook-handler';

// Lambda entry: wiring only. Created once per container and reused by warm invocations.
const logger = new Logger(); // service name from POWERTOOLS_SERVICE_NAME
const sqs = new SQSClient({});

export const handler = createWebhookHandler({
  logger,
  getConfig: memoizeAsync(() => loadLambdaEnv(['TELEGRAM_WEBHOOK_SECRET', 'TELEGRAM_ALLOWED_CHAT_IDS'], process.env)),
  enqueue: async (job) => {
    const queueUrl = process.env.QUEUE_URL;
    if (!queueUrl) throw new Error('QUEUE_URL is not set');
    await sqs.send(new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: JSON.stringify(job) }));
  },
});
