import { Logger } from '@aws-lambda-powertools/logger';
import { extractPlaceDetails, getModel } from '@angiday/ai';
import { getDb } from '@angiday/db';
import { loadAppEnv } from '@angiday/shared';
import { createReverseGeocoder } from '../geo/nominatim';
import { loadLambdaEnv } from '../lib/lambda-env';
import { memoizeAsync } from '../lib/memoize-async';
import { resolveMapsLink } from '../maps/resolve-maps-link';
import { createTelegramApi } from '../telegram/api';
import { createWorkerHandler } from './create-worker-handler';
import { type ProcessIngestJobDeps, processIngestJob } from './process-ingest-job';

/** Budget for one LLM call; SQS redelivers if it is exceeded (the worker timeout leaves room for re-prompts). */
const EXTRACTION_TIMEOUT_MS = 25_000;

// Lambda entry: wiring only. Config and the Mongo client load once per container.
const logger = new Logger(); // service name from POWERTOOLS_SERVICE_NAME

const getDeps = memoizeAsync(async (): Promise<ProcessIngestJobDeps> => {
  const env = await loadLambdaEnv(['MONGODB_URI', 'TELEGRAM_BOT_TOKEN', 'GOOGLE_GENERATIVE_AI_API_KEY'], process.env);
  const { NOMINATIM_BASE_URL, GEMINI_EXTRACT_MODEL } = loadAppEnv(process.env, ['NOMINATIM_BASE_URL', 'GEMINI_EXTRACT_MODEL']);
  const model = getModel('extract', { apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY, extractModelId: GEMINI_EXTRACT_MODEL });
  return {
    db: await getDb(env.MONGODB_URI),
    telegram: createTelegramApi(env.TELEGRAM_BOT_TOKEN),
    resolveMapsLink: (url) => resolveMapsLink(url),
    reverseGeocode: createReverseGeocoder({ baseUrl: NOMINATIM_BASE_URL }),
    extractPlaceDetails: (input) => extractPlaceDetails(input, { model, abortSignal: AbortSignal.timeout(EXTRACTION_TIMEOUT_MS) }),
    logger,
  };
});

export const handler = createWorkerHandler({
  logger,
  processJob: async (job) => processIngestJob(job, await getDeps()),
});
