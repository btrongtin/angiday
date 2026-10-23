import { Logger } from '@aws-lambda-powertools/logger';
import { getDb } from '@angiday/db';
import { loadAppEnv } from '@angiday/shared';
import { createReverseGeocoder } from '../geo/nominatim';
import { loadLambdaEnv } from '../lib/lambda-env';
import { memoizeAsync } from '../lib/memoize-async';
import { resolveMapsLink } from '../maps/resolve-maps-link';
import { createTelegramApi } from '../telegram/api';
import { createWorkerHandler } from './create-worker-handler';
import { type ProcessIngestJobDeps, processIngestJob } from './process-ingest-job';

// Lambda entry: wiring only. Config and the Mongo client load once per container.
const logger = new Logger(); // service name from POWERTOOLS_SERVICE_NAME

const getDeps = memoizeAsync(async (): Promise<ProcessIngestJobDeps> => {
  const env = await loadLambdaEnv(['MONGODB_URI', 'TELEGRAM_BOT_TOKEN'], process.env);
  const { NOMINATIM_BASE_URL } = loadAppEnv(process.env, ['NOMINATIM_BASE_URL']);
  return {
    db: await getDb(env.MONGODB_URI),
    telegram: createTelegramApi(env.TELEGRAM_BOT_TOKEN),
    resolveMapsLink: (url) => resolveMapsLink(url),
    reverseGeocode: createReverseGeocoder({ baseUrl: NOMINATIM_BASE_URL }),
    logger,
  };
});

export const handler = createWorkerHandler({
  logger,
  processJob: async (job) => processIngestJob(job, await getDeps()),
});
