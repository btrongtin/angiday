import { type IngestJob, ingestJobSchema } from '@angiday/shared';
import type { SQSBatchItemFailure, SQSBatchResponse, SQSEvent } from 'aws-lambda';
import { errorFields, type KeyedLog } from '../lib/log';
import type { ProcessOutcome } from './process-ingest-job';

export interface WorkerDeps {
  processJob: (job: IngestJob) => Promise<ProcessOutcome>;
  logger: KeyedLog;
}

const RECORD_KEYS = ['updateId', 'route'];

/**
 * SQS → worker with partial batch failures: a thrown record is reported in `batchItemFailures`, so only it
 * goes back to the queue (and to the DLQ after maxReceiveCount). The stack uses batchSize 1 anyway.
 */
export function createWorkerHandler({ processJob, logger }: WorkerDeps) {
  return async (event: SQSEvent): Promise<SQSBatchResponse> => {
    const batchItemFailures: SQSBatchItemFailure[] = [];
    for (const record of event.Records) {
      const receiveCount = Number(record.attributes.ApproximateReceiveCount);
      try {
        const job = ingestJobSchema.parse(JSON.parse(record.body));
        logger.appendKeys({ updateId: job.updateId, route: job.route });
        const outcome = await processJob(job);
        logger.info('Job processed', { outcome, receiveCount });
      } catch (error) {
        logger.error('Job failed; SQS will retry', { messageId: record.messageId, receiveCount, ...errorFields(error) });
        batchItemFailures.push({ itemIdentifier: record.messageId });
      } finally {
        logger.removeKeys(RECORD_KEYS);
      }
    }
    return { batchItemFailures };
  };
}
