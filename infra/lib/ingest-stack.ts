import { Stack } from 'aws-cdk-lib';

// Ingest pipeline: webhook Lambda (Function URL), SQS + DLQ, worker Lambda. Resources arrive in S1.
export class IngestStack extends Stack {}
