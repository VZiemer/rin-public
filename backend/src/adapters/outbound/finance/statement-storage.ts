import {
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHash } from 'node:crypto';
import type { StatementStorage } from '../../../application/ports/statement.js';
import type { StatementJob } from '../../../domain/finance/statement.js';
import { AppError } from '../../../domain/errors/app-error.js';
export class S3StatementStorage implements StatementStorage {
  constructor(
    private client: S3Client,
    private bucket: string,
  ) {}
  private key(job: StatementJob) {
    return `statements/${job.userId}/${job.assistantId}/${job.id}/${job.sha256}.${job.format}`;
  }
  private type(job: StatementJob) {
    return job.format === 'pdf'
      ? 'application/pdf'
      : job.format === 'csv'
        ? 'text/csv'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  async upload(job: StatementJob) {
    if (job.format !== 'csv') throw new AppError('statement_format_disabled', 422);
    const checksum = Buffer.from(job.sha256, 'hex').toString('base64');
    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.key(job),
        ContentType: this.type(job),
        ContentLength: job.sizeBytes,
        ChecksumSHA256: checksum,
        IfNoneMatch: '*',
      }),
      {
        expiresIn: 300,
        // Android sends this header explicitly. Keep it in SignedHeaders instead
        // of hoisting it into the URL, which S3 rejects as an unsigned header.
        unhoistableHeaders: new Set(['x-amz-checksum-sha256']),
      },
    );
    return {
      url,
      headers: {
        'content-type': this.type(job),
        'x-amz-checksum-sha256': checksum,
        'if-none-match': '*',
      },
    };
  }
  async read(job: StatementJob) {
    const input = { Bucket: this.bucket, Key: this.key(job) };
    const head = await this.client.send(new HeadObjectCommand(input), {
      abortSignal: AbortSignal.timeout(5000),
    });
    if (head.ContentLength !== job.sizeBytes) throw new AppError('statement_file_mismatch', 422);
    const object = await this.client.send(
      new GetObjectCommand({ ...input, IfMatch: head.ETag, Range: `bytes=0-${job.sizeBytes - 1}` }),
      { abortSignal: AbortSignal.timeout(15000) },
    );
    if (!object.Body) throw new AppError('statement_file_mismatch', 422);
    const bytes = Buffer.from(await object.Body.transformToByteArray());
    if (
      bytes.length !== job.sizeBytes ||
      createHash('sha256').update(bytes).digest('hex') !== job.sha256
    )
      throw new AppError('statement_file_mismatch', 422);
    if (
      (job.format === 'pdf' && bytes.toString('ascii', 0, 5) !== '%PDF-') ||
      (job.format === 'xlsx' && bytes.toString('ascii', 0, 2) !== 'PK')
    )
      throw new AppError('statement_file_mismatch', 422);
    return bytes;
  }
}
