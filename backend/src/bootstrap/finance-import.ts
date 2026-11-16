import { z } from 'zod';
import { S3Client } from '@aws-sdk/client-s3';
import { loadConfig } from './config.js';
import { contextRepositories } from './repositories.js';
import { S3StatementStorage } from '../adapters/outbound/finance/statement-storage.js';
import { CsvStatementExtractor } from '../adapters/outbound/finance/csv-statement-extractor.js';
import { ProcessStatement } from '../application/finance/statements.js';
const eventSchema = z.object({
  Records: z
    .array(
      z.object({
        eventSource: z.literal('aws:s3'),
        eventName: z.string(),
        s3: z.object({
          bucket: z.object({ name: z.string() }),
          object: z.object({ key: z.string() }),
        }),
      }),
    )
    .max(100),
});
export async function handler(input: unknown) {
  if (z.object({ Event: z.literal('s3:TestEvent') }).safeParse(input).success)
    return { status: 'test' };
  const config = loadConfig();
  if (!config.financeImportsEnabled) return { status: 'disabled' };
  if (!config.financeBucketName) throw new Error('Statement analysis not configured');
  const repos = contextRepositories();
  const processor = new ProcessStatement(
    repos.financialPlanning,
    new S3StatementStorage(
      new S3Client({ region: config.region, maxAttempts: 2 }),
      config.financeBucketName,
    ),
    new CsvStatementExtractor(),
    { now: () => new Date() },
  );
  for (const record of eventSchema.parse(input).Records) {
    if (
      record.s3.bucket.name !== config.financeBucketName ||
      !record.eventName.startsWith('ObjectCreated:')
    )
      throw new Error('Invalid statement event');
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
    const match = key.match(
      /^statements\/([A-Za-z0-9_-]{1,128})\/([A-Z][A-Z0-9]{1,15})\/([0-9a-f-]{36})\/([a-f0-9]{64})\.(pdf|csv|xlsx)$/,
    );
    if (!match) throw new Error('Invalid statement path');
    const job = await repos.financialPlanning.getStatement(match[1]!, match[2]!, match[3]!);
    if (!job || job.sha256 !== match[4] || job.format !== match[5])
      throw new Error('Statement event mismatch');
    await processor.execute(match[1]!, match[2]!, match[3]!);
  }
  return { status: 'processed' };
}
