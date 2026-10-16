import * as path from 'node:path';
import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import { Architecture, FunctionUrlAuthType, Runtime } from 'aws-cdk-lib/aws-lambda';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { NodejsFunction, type NodejsFunctionProps } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import { type IStringParameter, StringParameter } from 'aws-cdk-lib/aws-ssm';
import type { Construct } from 'constructs';
import { SSM_PARAMS, type SsmParamKey, WORKER_TIMEOUT_SECONDS } from './config';

const REPO_ROOT = path.resolve(__dirname, '../..');
const INGEST_SRC = path.join(REPO_ROOT, 'services/ingest/src');

// Optional peer modules the MongoDB driver loads only when a feature needs them (we use none).
const MONGODB_OPTIONAL_MODULES = [
  'kerberos',
  '@mongodb-js/zstd',
  'snappy',
  'mongodb-client-encryption',
  'gcp-metadata',
  'socks',
  'aws4',
];

const commonProps: Partial<NodejsFunctionProps> = {
  runtime: Runtime.NODEJS_24_X,
  architecture: Architecture.ARM_64,
  projectRoot: REPO_ROOT,
  depsLockFilePath: path.join(REPO_ROOT, 'pnpm-lock.yaml'),
  bundling: {
    target: 'node24',
    sourceMap: true,
    // The Lambda runtime ships the AWS SDK v3; everything else (incl. @angiday/*) is inlined by esbuild.
    externalModules: ['@aws-sdk/*', '@smithy/*', ...MONGODB_OPTIONAL_MODULES],
  },
};

/** Ingest pipeline (architecture.md → F1): webhook Lambda (Function URL) → SQS (+ DLQ) → worker Lambda. */
export class IngestStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const params = Object.fromEntries(
      (Object.keys(SSM_PARAMS) as SsmParamKey[]).map((key) => {
        const { name, secure } = SSM_PARAMS[key];
        const param = secure
          ? StringParameter.fromSecureStringParameterAttributes(this, `Param${key}`, { parameterName: name })
          : StringParameter.fromStringParameterName(this, `Param${key}`, name);
        return [key, param];
      }),
    ) as Record<SsmParamKey, IStringParameter>;

    /** Env vars + read grants for exactly the parameters a function needs. */
    const useParams = (fn: NodejsFunction, keys: SsmParamKey[]) => {
      for (const key of keys) {
        fn.addEnvironment(`${key}_PARAM`, SSM_PARAMS[key].name);
        params[key].grantRead(fn);
      }
    };

    const deadLetterQueue = new Queue(this, 'IngestDlq', {
      retentionPeriod: Duration.days(14),
      enforceSSL: true,
    });
    const queue = new Queue(this, 'IngestQueue', {
      // AWS guidance for Lambda event sources: at least 6 × the function timeout.
      visibilityTimeout: Duration.seconds(6 * WORKER_TIMEOUT_SECONDS),
      deadLetterQueue: { queue: deadLetterQueue, maxReceiveCount: 3 },
      enforceSSL: true,
    });

    const webhook = new NodejsFunction(this, 'WebhookFunction', {
      ...commonProps,
      entry: path.join(INGEST_SRC, 'webhook/handler.ts'),
      memorySize: 256,
      timeout: Duration.seconds(10),
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
        POWERTOOLS_SERVICE_NAME: 'ingest-webhook',
        QUEUE_URL: queue.queueUrl,
      },
    });
    useParams(webhook, ['TELEGRAM_WEBHOOK_SECRET', 'TELEGRAM_ALLOWED_CHAT_IDS']);
    queue.grantSendMessages(webhook);
    // Public on purpose: Telegram can't sign with IAM; the handler checks Telegram's secret header.
    const webhookUrl = webhook.addFunctionUrl({ authType: FunctionUrlAuthType.NONE });

    const worker = new NodejsFunction(this, 'WorkerFunction', {
      ...commonProps,
      entry: path.join(INGEST_SRC, 'worker/handler.ts'),
      memorySize: 512,
      timeout: Duration.seconds(WORKER_TIMEOUT_SECONDS),
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
        POWERTOOLS_SERVICE_NAME: 'ingest-worker',
      },
    });
    useParams(worker, ['MONGODB_URI', 'TELEGRAM_BOT_TOKEN']);
    worker.addEventSource(
      new SqsEventSource(queue, {
        batchSize: 1,
        reportBatchItemFailures: true,
        // At most 2 concurrent workers: plenty for 2 people and gentle on Atlas M0 connections.
        maxConcurrency: 2,
      }),
    );

    new CfnOutput(this, 'WebhookUrl', { value: webhookUrl.url });
    new CfnOutput(this, 'WebhookFunctionName', { value: webhook.functionName });
    new CfnOutput(this, 'WorkerFunctionName', { value: worker.functionName });
    new CfnOutput(this, 'DeadLetterQueueName', { value: deadLetterQueue.queueName });
  }
}
