import { expect, test } from 'vitest';
import { S3Client } from '@aws-sdk/client-s3';
import { S3StatementStorage } from '../src/adapters/outbound/finance/statement-storage.js';
import type { StatementJob } from '../src/domain/finance/statement.js';

test('the signed PUT covers every x-amz header returned to the Android uploader', async () => {
  const client = new S3Client({
    region: 'us-east-1',
    useDualstackEndpoint: true,
    credentials: { accessKeyId: 'synthetic-key', secretAccessKey: 'synthetic-secret' },
  });
  try {
    const job: StatementJob = {
      userId: 'synthetic-user',
      assistantId: 'RIN',
      id: '01900000-0000-7000-8000-000000000001',
      revision: 0,
      status: 'uploaded_pending',
      format: 'csv',
      accountId: 'synthetic-bank',
      sourceKind: 'bank',
      sizeBytes: 42,
      sha256: 'ab'.repeat(32),
      createdAt: '2026-10-15T12:00:00.000Z',
      updatedAt: '2026-10-15T12:00:00.000Z',
    };
    const ticket = await new S3StatementStorage(client, 'synthetic-bucket').upload(job);
    const url = new URL(ticket.url);
    expect(url.hostname).toBe('synthetic-bucket.s3.dualstack.us-east-1.amazonaws.com');
    const signedHeaders = url.searchParams.get('X-Amz-SignedHeaders')!.split(';');
    for (const header of Object.keys(ticket.headers).filter((key) => key.startsWith('x-amz-'))) {
      expect(signedHeaders).toContain(header);
      expect(url.searchParams.has(header)).toBe(false);
    }
    expect(signedHeaders).toContain('if-none-match');
    expect(signedHeaders).toContain('content-length');
    expect(ticket.headers['x-amz-checksum-sha256']).toBe(
      Buffer.from(job.sha256, 'hex').toString('base64'),
    );
    expect(ticket.headers['if-none-match']).toBe('*');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
  } finally {
    client.destroy();
  }
});
