import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { createInternalUserId, parseUserId } from '../src/domain/model/user-id.js';

const LEGACY_USER_ID = process.env.LEGACY_DEV_USER_ID ?? 'dev-user';
const TABLE = process.env.TABLE_NAME ?? 'rin-dev-data';
const REGION = process.env.AWS_REGION ?? 'us-east-1';

function lockKey() {
  return { PK: `MIGRATION#${LEGACY_USER_ID}`, SK: 'DEV_USER' };
}

export async function migrateDevUser(client: Pick<DynamoDBDocumentClient, 'send'>) {
  const issuer = process.env.COGNITO_ISSUER;
  const subject = process.env.COGNITO_DEV_SUBJECT;
  if (issuer?.includes('@') || subject?.includes('@')) throw new Error('email cannot be an identity key');
  const existing = await client.send(new GetCommand({ TableName: TABLE, Key: lockKey() }));
  if (existing.Item) throw new Error(`migration already applied as ${String(existing.Item.userId)}`);
  const userId = process.env.MIGRATION_USER_ID ? parseUserId(process.env.MIGRATION_USER_ID) : createInternalUserId();
  const legacy = await client.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': `USER#${LEGACY_USER_ID}` },
    }),
  );
  const items = legacy.Items ?? [];
  for (const item of items) {
    await client.send(
      new PutCommand({
        TableName: TABLE,
        Item: { ...item, PK: `USER#${userId}`, userId },
        ConditionExpression: 'attribute_not_exists(PK)',
      }),
    );
  }
  if (issuer && subject) {
    const now = new Date().toISOString();
    await client.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: TABLE,
              Item: {
                PK: `AUTH#COGNITO#${issuer}#${subject}`,
                SK: 'IDENTITY',
                entityType: 'AUTH_IDENTITY',
                provider: 'COGNITO',
                issuer,
                subject,
                userId,
                createdAt: now,
              },
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          },
          {
            Put: {
              TableName: TABLE,
              Item: {
                PK: `USER#${userId}`,
                SK: `AUTH_IDENTITY#COGNITO#${issuer}#${subject}`,
                entityType: 'AUTH_IDENTITY',
                provider: 'COGNITO',
                issuer,
                subject,
                userId,
                createdAt: now,
              },
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          },
        ],
      }),
    );
  }
  await client.send(
    new PutCommand({
      TableName: TABLE,
      Item: { ...lockKey(), entityType: 'MIGRATION', userId, legacyUserId: LEGACY_USER_ID },
      ConditionExpression: 'attribute_not_exists(PK)',
    }),
  );
  return { userId, migrated: items.length };
}

const invoked = process.argv[1]?.replaceAll('\\', '/').endsWith('scripts/migrate-dev-user.ts');
if (invoked) {
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
  migrateDevUser(client)
    .then((result) => {
      console.log(JSON.stringify({ userId: result.userId, migrated: result.migrated }));
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
