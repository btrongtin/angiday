import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { AWS_REGION } from './config';
import { IngestStack } from './ingest-stack';

describe('IngestStack', () => {
  it('synthesizes in the Singapore region', () => {
    const app = new App();
    const stack = new IngestStack(app, 'TestIngest', { env: { region: AWS_REGION } });

    expect(stack.region).toBe('ap-southeast-1');
    expect(() => Template.fromStack(stack)).not.toThrow();
  });
});
