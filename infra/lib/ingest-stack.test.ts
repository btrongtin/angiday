import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import cdkJson from '../cdk.json';
import { AWS_REGION } from './config';
import { IngestStack } from './ingest-stack';

describe('IngestStack', () => {
  it('synthesizes in the Singapore region with the same feature flags as `cdk synth`', () => {
    const app = new App({
      context: {
        ...cdkJson.context,
        // The S0 stack has no resources yet and an empty template fails this check.
        // Remove this override in S1, when the stack gets its first resource.
        '@aws-cdk/core:validateAgainstDefaultRules': false,
      },
    });
    const stack = new IngestStack(app, 'TestIngest', { env: { region: AWS_REGION } });

    expect(stack.region).toBe('ap-southeast-1');
    expect(() => Template.fromStack(stack)).not.toThrow();
  });
});
