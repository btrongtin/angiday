import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { beforeAll, describe, expect, it } from 'vitest';
import cdkJson from '../cdk.json';
import { AWS_REGION } from './config';
import { IngestStack } from './ingest-stack';

let template: Template;

beforeAll(() => {
  // Same feature flags as `cdk synth`. Bundles both Lambdas with esbuild (a few seconds).
  const app = new App({ context: cdkJson.context });
  const stack = new IngestStack(app, 'TestIngest', { env: { region: AWS_REGION } });
  expect(stack.region).toBe('ap-southeast-1');
  template = Template.fromStack(stack);
});

/** IAM policy documents as JSON strings, for "contains / does not contain" checks. */
function policies(): string[] {
  return Object.values(template.findResources('AWS::IAM::Policy')).map((policy) => JSON.stringify(policy));
}

describe('IngestStack', () => {
  it('has a queue with a DLQ after 3 receives and visibility = 6 × worker timeout', () => {
    template.resourceCountIs('AWS::SQS::Queue', 2);
    template.hasResourceProperties('AWS::SQS::Queue', {
      VisibilityTimeout: 180,
      RedrivePolicy: { deadLetterTargetArn: Match.anyValue(), maxReceiveCount: 3 },
    });
  });

  it('runs both Lambdas on Node 24, ARM64', () => {
    const functions = template.findResources('AWS::Lambda::Function', {
      Properties: { Runtime: 'nodejs24.x', Architectures: ['arm64'] },
    });
    expect(Object.keys(functions)).toHaveLength(2);
  });

  it('subscribes the worker with batch size 1 and partial batch failures', () => {
    template.hasResourceProperties('AWS::Lambda::EventSourceMapping', {
      BatchSize: 1,
      FunctionResponseTypes: ['ReportBatchItemFailures'],
    });
  });

  it('exposes the webhook through a public Function URL', () => {
    template.hasResourceProperties('AWS::Lambda::Url', { AuthType: 'NONE' });
    template.hasResourceProperties('AWS::Lambda::Permission', {
      Action: 'lambda:InvokeFunctionUrl',
      Principal: '*',
      FunctionUrlAuthType: 'NONE',
    });
  });

  it('passes SSM parameter names, never values, to the Lambdas', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Environment: {
        Variables: Match.objectLike({
          TELEGRAM_WEBHOOK_SECRET_PARAM: '/angiday/telegram-webhook-secret',
          TELEGRAM_ALLOWED_CHAT_IDS_PARAM: '/angiday/allowed-chat-ids',
          QUEUE_URL: Match.anyValue(),
        }),
      },
    });
    template.hasResourceProperties('AWS::Lambda::Function', {
      Environment: {
        Variables: Match.objectLike({
          MONGODB_URI_PARAM: '/angiday/mongodb-uri',
          TELEGRAM_BOT_TOKEN_PARAM: '/angiday/telegram-bot-token',
          NOMINATIM_BASE_URL: 'https://nominatim.openstreetmap.org',
        }),
      },
    });
  });

  it('grants each Lambda only what it uses (least privilege)', () => {
    const webhookPolicy = policies().find((p) => p.includes('sqs:SendMessage'));
    const workerPolicy = policies().find((p) => p.includes('/angiday/mongodb-uri'));

    expect(webhookPolicy).toBeDefined();
    expect(webhookPolicy).toContain('/angiday/telegram-webhook-secret');
    expect(webhookPolicy).not.toContain('/angiday/mongodb-uri');
    expect(webhookPolicy).not.toContain('/angiday/telegram-bot-token');

    expect(workerPolicy).toBeDefined();
    expect(workerPolicy).toContain('/angiday/telegram-bot-token');
    expect(workerPolicy).not.toContain('sqs:SendMessage');
    expect(workerPolicy).not.toContain('/angiday/telegram-webhook-secret');
  });

  it('outputs what the deploy steps need', () => {
    for (const output of ['WebhookUrl', 'WebhookFunctionName', 'WorkerFunctionName', 'DeadLetterQueueName']) {
      template.hasOutput(output, {});
    }
  });
});
