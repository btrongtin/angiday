import { App } from 'aws-cdk-lib';
import { AWS_REGION } from '../lib/config';
import { IngestStack } from '../lib/ingest-stack';

const app = new App();

new IngestStack(app, 'AngidayIngest', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: AWS_REGION },
});
