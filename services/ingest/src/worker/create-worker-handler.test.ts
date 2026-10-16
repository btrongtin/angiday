import type { SQSEvent, SQSRecord } from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';
import { createTestLog, makeJob } from '../test/fixtures';
import { createWorkerHandler } from './create-worker-handler';

function record(messageId: string, body: unknown): SQSRecord {
  return {
    messageId,
    body: typeof body === 'string' ? body : JSON.stringify(body),
    attributes: { ApproximateReceiveCount: '1' },
  } as unknown as SQSRecord;
}

describe('worker handler', () => {
  it('reports no failures when the job succeeds', async () => {
    const processJob = vi.fn().mockResolvedValue('saved');
    const handler = createWorkerHandler({ processJob, logger: createTestLog() });

    const result = await handler({ Records: [record('m1', makeJob())] } as SQSEvent);

    expect(result).toEqual({ batchItemFailures: [] });
    expect(processJob).toHaveBeenCalledWith(makeJob());
  });

  it('reports the failed record so only it is retried', async () => {
    const processJob = vi.fn().mockResolvedValueOnce('saved').mockRejectedValueOnce(new Error('boom'));
    const handler = createWorkerHandler({ processJob, logger: createTestLog() });

    const result = await handler({ Records: [record('ok', makeJob()), record('bad', makeJob({ updateId: 2 }))] } as SQSEvent);

    expect(result).toEqual({ batchItemFailures: [{ itemIdentifier: 'bad' }] });
  });

  it('fails a malformed body (goes to the DLQ after retries, where we can see it)', async () => {
    const processJob = vi.fn();
    const handler = createWorkerHandler({ processJob, logger: createTestLog() });

    const result = await handler({ Records: [record('junk', { route: 'nope' })] } as SQSEvent);

    expect(result.batchItemFailures).toEqual([{ itemIdentifier: 'junk' }]);
    expect(processJob).not.toHaveBeenCalled();
  });

  it('adds updateId/route to every log line of the record and removes them afterwards', async () => {
    const logger = createTestLog();
    const handler = createWorkerHandler({ processJob: vi.fn().mockResolvedValue('saved'), logger });

    await handler({ Records: [record('m1', makeJob())] } as SQSEvent);

    expect(logger.appendKeys).toHaveBeenCalledWith({ updateId: 9001, route: 'maps_link' });
    expect(logger.removeKeys).toHaveBeenCalledWith(['updateId', 'route']);
  });
});
