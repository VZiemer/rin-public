import { GetObjectCommand, HeadObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { createHash } from 'node:crypto';
import type { UploadedAssetSource } from '../../../application/ports/asset-onboarding.js';
import { rinImageSchema } from '../../../domain/model/rin-assets.js';
import { inspectAvatarImage } from './image-file.js';
import { AppError } from '../../../domain/errors/app-error.js';

export class S3UploadedAssetSource implements UploadedAssetSource {
  constructor(
    private client: Pick<S3Client, 'send'>,
    private bucket: string,
  ) {}
  async inspect(objectKey: string) {
    if (
      !/^assistants\/RIN\/[A-Za-z0-9/_.-]+\.(png|webp|jpg)$/.test(objectKey) ||
      objectKey.includes('..')
    )
      throw new AppError('invalid_asset_key', 400);
    const head = await this.client.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      { abortSignal: AbortSignal.timeout(5000) },
    );
    if (!head.ContentLength || head.ContentLength > 8 * 1024 * 1024)
      throw new AppError('invalid_avatar_image', 400);
    const object = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        IfMatch: head.ETag,
        Range: `bytes=0-${head.ContentLength}`,
      }),
      { abortSignal: AbortSignal.timeout(15000) },
    );
    if (!object.Body || object.ContentLength !== head.ContentLength)
      throw new AppError('asset_metadata_mismatch', 400);
    const bytes = Buffer.from(await object.Body.transformToByteArray());
    const { contentType } = inspectAvatarImage(bytes);
    const extension = contentType === 'image/jpeg' ? 'jpg' : contentType.split('/')[1];
    if (bytes.length !== head.ContentLength || contentType !== head.ContentType)
      throw new AppError('asset_metadata_mismatch', 400);
    if (!objectKey.endsWith(`.${extension}`)) throw new AppError('asset_metadata_mismatch', 400);
    const id =
      head.Metadata?.['image-name'] ??
      objectKey
        .split('/')
        .at(-1)!
        .replace(/\.[^.]+$/, '');
    return rinImageSchema.parse({
      id,
      name: id,
      objectKey,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      sizeBytes: bytes.length,
      contentType,
      expression: head.Metadata?.expression ?? 'NEUTRAL',
    });
  }
}
