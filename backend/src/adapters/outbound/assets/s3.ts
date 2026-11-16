import { S3Client, HeadObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { RinAssetStorage } from '../../../application/ports/rin-assets.js';
import type { RinAssetImage } from '../../../domain/model/rin-assets.js';
import { AppError } from '../../../domain/errors/app-error.js';
import { parseAssistantId } from '../../../domain/model/assistant-id.js';
import { createHash } from 'node:crypto';
import { inspectAvatarImage } from './image-file.js';

export class S3RinAssetStorage implements RinAssetStorage {
  constructor(
    private client: S3Client,
    private bucket: string,
    private urlTtlSeconds = 3600,
  ) {}
  private key(assistantId: string, image: RinAssetImage) {
    const id = parseAssistantId(assistantId);
    if (
      !image.objectKey.startsWith(`assistants/${id}/`) ||
      !/^assistants\/[A-Z][A-Z0-9]{1,15}\/[A-Za-z0-9/_.-]+\.(png|webp|jpg)$/.test(
        image.objectKey,
      ) ||
      image.objectKey.includes('..') ||
      !image.objectKey.endsWith(
        `.${image.contentType === 'image/jpeg' ? 'jpg' : image.contentType.split('/')[1]}`,
      )
    )
      throw new AppError('invalid_asset_key', 400);
    return image.objectKey;
  }
  async verify(assistantId: string, image: RinAssetImage) {
    const result = await this.client.send(
      new HeadObjectCommand({
        Bucket: this.bucket,
        Key: this.key(assistantId, image),
        ChecksumMode: 'ENABLED',
      }),
      { abortSignal: AbortSignal.timeout(5000) },
    );
    if (
      result.ContentLength !== image.sizeBytes ||
      result.ContentType !== image.contentType ||
      (result.ChecksumSHA256 !== undefined &&
        result.ChecksumSHA256 !== Buffer.from(image.sha256, 'hex').toString('base64'))
    )
      throw new AppError('asset_metadata_mismatch', 400);
    const object = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: this.key(assistantId, image),
        Range: `bytes=0-${image.sizeBytes}`,
      }),
      { abortSignal: AbortSignal.timeout(15000) },
    );
    if (!object.Body || object.ContentLength !== image.sizeBytes)
      throw new AppError('asset_metadata_mismatch', 400);
    const bytes = Buffer.from(await object.Body.transformToByteArray());
    if (
      bytes.length !== image.sizeBytes ||
      createHash('sha256').update(bytes).digest('hex') !== image.sha256 ||
      inspectAvatarImage(bytes).contentType !== image.contentType
    )
      throw new AppError('asset_metadata_mismatch', 400);
  }
  async download(assistantId: string, image: RinAssetImage) {
    const url = await getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: this.key(assistantId, image),
      }),
      { expiresIn: this.urlTtlSeconds },
    );
    return { url, expiresAt: new Date(Date.now() + this.urlTtlSeconds * 1000).toISOString() };
  }
}
