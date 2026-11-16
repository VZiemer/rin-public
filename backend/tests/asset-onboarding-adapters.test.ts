import { afterEach, expect, test, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { S3UploadedAssetSource } from '../src/adapters/outbound/assets/uploaded-asset.js';
import { S3RinAssetStorage } from '../src/adapters/outbound/assets/s3.js';
import { DynamoDbAssetOnboardingRepository } from '../src/adapters/outbound/dynamodb/asset-onboarding-repository.js';
import { BedrockAssetUsageAnalyzer } from '../src/adapters/outbound/agent-model/asset-usage.js';
import { handler } from '../src/bootstrap/asset-upload.js';
import type { AssetOnboarding } from '../src/domain/model/asset-onboarding.js';

afterEach(() => vi.unstubAllEnvs());
// Construct a synthetic 1x1 PNG in memory; no artwork or encoded asset is versioned.
function chunk(name: string, data: Buffer) {
  const type = Buffer.from(name);
  let crc = 0xffffffff;
  for (const byte of Buffer.concat([type, data])) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const length = Buffer.alloc(4), checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, type, data, checksum]);
}
const header = Buffer.alloc(13);
header.writeUInt32BE(1, 0);
header.writeUInt32BE(1, 4);
header[8] = 8;
header[9] = 6;
const bytes = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', header),
  chunk('IDAT', deflateSync(Buffer.from([0, 0, 0, 0, 255]))),
  chunk('IEND', Buffer.alloc(0)),
]);
const hash = createHash('sha256').update(bytes).digest('hex');
const image = {
  id: 'rin_new',
  name: 'rin_new',
  expression: 'NEUTRAL' as const,
  objectKey: 'assistants/RIN/rin_new.png',
  sha256: hash,
  sizeBytes: bytes.length,
  contentType: 'image/png' as const,
};
const record: AssetOnboarding = {
  userId: '01900000-0000-7000-8000-000000000001',
  assistantId: 'RIN',
  image,
  status: 'pending',
  revision: 0,
  createdAt: '2026-10-14T18:00:00Z',
  updatedAt: '2026-10-14T18:00:00Z',
  turns: [],
  deliveredDevices: [],
};

test('S3 derives a named image descriptor from actual bytes, pinning the GET to the inspected ETag', async () => {
  const send = vi
    .fn()
    .mockResolvedValueOnce({ ContentLength: bytes.length, ContentType: 'image/png', ETag: 'etag' })
    .mockResolvedValueOnce({
      ContentLength: bytes.length,
      Body: { transformToByteArray: async () => bytes },
    });
  expect(
    await new S3UploadedAssetSource({ send } as never, 'bucket').inspect(image.objectKey),
  ).toEqual(image);
  expect(send.mock.calls[1]?.[0].input).toMatchObject({
    IfMatch: 'etag',
    Bucket: 'bucket',
    Key: image.objectKey,
  });
});

test('upload metadata preserves the friendly name of an existing content-addressed upload', async () => {
  const send = vi
    .fn()
    .mockResolvedValueOnce({
      ContentLength: bytes.length,
      ContentType: 'image/png',
      Metadata: { 'image-name': 'rin_pajamas', expression: 'TIRED' },
    })
    .mockResolvedValueOnce({
      ContentLength: bytes.length,
      Body: { transformToByteArray: async () => bytes },
    });
  expect(
    await new S3UploadedAssetSource({ send } as never, 'bucket').inspect(
      `assistants/RIN/${hash}.png`,
    ),
  ).toMatchObject({ id: 'rin_pajamas', expression: 'TIRED', sha256: hash });
});

test('S3 rejects foreign paths and oversized files before downloading', async () => {
  const send = vi.fn().mockResolvedValue({ ContentLength: 9 * 1024 * 1024 });
  const source = new S3UploadedAssetSource({ send } as never, 'bucket');
  await expect(source.inspect('assistants/YUI/test.png')).rejects.toThrow('invalid_asset_key');
  await expect(source.inspect('assistants/RIN/../test.png')).rejects.toThrow('invalid_asset_key');
  expect(send).not.toHaveBeenCalled();
  await expect(source.inspect(image.objectKey)).rejects.toThrow('invalid_avatar_image');
  expect(send).toHaveBeenCalledTimes(1);
});

test('named immutable S3 objects are verified by their actual SHA even without a stored S3 SHA checksum', async () => {
  const send = vi
    .fn()
    .mockResolvedValueOnce({ ContentLength: bytes.length, ContentType: 'image/png' })
    .mockResolvedValueOnce({
      ContentLength: bytes.length,
      Body: { transformToByteArray: async () => bytes },
    });
  await new S3RinAssetStorage({ send } as never, 'bucket').verify('RIN', image);
  send
    .mockResolvedValueOnce({ ContentLength: bytes.length, ContentType: 'image/png' })
    .mockResolvedValueOnce({
      ContentLength: bytes.length,
      Body: { transformToByteArray: async () => bytes },
    });
  await expect(
    new S3RinAssetStorage({ send } as never, 'bucket').verify('RIN', {
      ...image,
      sha256: 'a'.repeat(64),
    }),
  ).rejects.toThrow('asset_metadata_mismatch');
});

test('Dynamo atomically reserves image identity on create and uses revision CAS afterwards', async () => {
  const send = vi.fn().mockResolvedValue({});
  const repo = new DynamoDbAssetOnboardingRepository({ send } as never, 'table');
  expect(await repo.save(record, null)).toBe(true);
  const items = send.mock.calls[0]?.[0].input.TransactItems;
  expect(items).toHaveLength(2);
  expect(items[0].Put).toMatchObject({
    Item: { PK: `USER#${record.userId}`, SK: 'ASSET_ONBOARDING#RIN#rin_new' },
    ConditionExpression: 'attribute_not_exists(PK)',
  });
  expect(items[1].Put).toMatchObject({
    Item: { PK: 'ASSISTANT#RIN', SK: 'AVATAR_IMAGE#rin_new', sha256: hash },
  });
  expect(await repo.save({ ...record, revision: 1 }, 0)).toBe(true);
  expect(send.mock.calls[1]?.[0].input).toMatchObject({
    ConditionExpression: 'revision = :revision',
    ExpressionAttributeValues: { ':revision': 0 },
  });
  send.mockRejectedValueOnce(
    Object.assign(new Error('conditional'), { name: 'ConditionalCheckFailedException' }),
  );
  expect(await repo.save(record, 0)).toBe(false);
});

test('Dynamo paginates past completed records and strips storage keys', async () => {
  const send = vi
    .fn()
    .mockResolvedValueOnce({
      Items: [
        { ...record, status: 'completed', PK: 'pk', SK: 'sk', entityType: 'ASSET_ONBOARDING' },
      ],
      LastEvaluatedKey: { PK: 'pk', SK: 'sk' },
    })
    .mockResolvedValueOnce({ Items: [{ ...record, PK: 'pk', SK: 'sk' }] });
  expect(
    await new DynamoDbAssetOnboardingRepository({ send } as never, 'table').listOpen(record.userId),
  ).toEqual([record]);
  expect(send.mock.calls[1]?.[0].input.ExclusiveStartKey).toEqual({ PK: 'pk', SK: 'sk' });
});

test('Bedrock interpretation carries clarification history and validates structured output', async () => {
  const decision = { status: 'clarify', question: 'Das 22h às 6h?' };
  const send = vi
    .fn()
    .mockResolvedValue({ output: { message: { content: [{ text: JSON.stringify(decision) }] } } });
  const analyzer = new BedrockAssetUsageAnalyzer({ send } as never, 'model');
  expect(
    await analyzer.analyze(
      { ...record, turns: [{ answer: 'à noite', question: 'Quais horários?' }] },
      'das 22h às 6h',
    ),
  ).toEqual(decision);
  expect(send.mock.calls[0]?.[0].input.messages[0].content[0].text).toContain('Quais horários');
  expect(send.mock.calls[0]?.[0].input.system[0].text).toContain('Do not discard unsupported conditions');
  send.mockResolvedValueOnce({
    output: {
      message: {
        content: [{ text: '{"status":"understood","usage":{"rules":{"weather":"RAIN"}}}' }],
      },
    },
  });
  await expect(analyzer.analyze(record, 'quando chover')).rejects.toThrow();
});

test('S3 handler supports configuration tests, rejects foreign buckets, and ignores unrelated objects', async () => {
  vi.stubEnv('APP_ENV', 'dev');
  vi.stubEnv('ASSET_ONBOARDING_ENABLED', 'true');
  vi.stubEnv('ASSET_BUCKET_NAME', 'expected-bucket');
  expect(await handler({ Event: 's3:TestEvent' })).toEqual({ status: 'test' });
  const event = (bucket: string, key: string) => ({
    Records: [
      {
        eventSource: 'aws:s3',
        eventName: 'ObjectCreated:Put',
        s3: { bucket: { name: bucket }, object: { key } },
      },
    ],
  });
  await expect(handler(event('foreign-bucket', image.objectKey))).rejects.toThrow(
    'Unexpected asset bucket',
  );
  expect(await handler(event('expected-bucket', 'assistants%2FYUI%2Fimage.png'))).toEqual({
    results: [],
  });
  expect(await handler(event('expected-bucket', 'assistants%2FRIN%2Fnotes.txt'))).toEqual({
    results: [],
  });
  vi.stubEnv('APP_ENV', 'production');
  expect(await handler(event('expected-bucket', image.objectKey))).toEqual({ status: 'disabled' });
});
