import { z } from 'zod';
import { minor } from './planning.js';
export const statementRowSchema = z
  .object({
    occurredOn: z.iso.date(),
    description: z.string().trim().min(1).max(200),
    amountMinor: minor.refine((n) => n > 0),
    currency: z.literal('BRL'),
    kind: z.enum(['income', 'expense', 'transfer', 'card_payment', 'unknown']),
    category: z.string().trim().min(1).max(80),
    externalId: z.string().min(1).max(120).nullable(),
  })
  .strict();
export const extractedStatementSchema = z
  .object({
    complete: z.boolean(),
    warnings: z.array(z.string().max(250)).max(20),
    rows: z.array(statementRowSchema).max(100),
    closingBalanceMinor: z.number().int().safe().nullable(),
    balanceOn: z.iso.date().nullable(),
  })
  .strict();
export const statementJobSchema = z.object({
  userId: z.string().min(1),
  assistantId: z.string().min(1),
  id: z.string().uuid(),
  revision: z.number().int().nonnegative(),
  status: z.enum(['uploaded_pending', 'processing', 'review', 'committing', 'committed', 'failed']),
  format: z.enum(['pdf', 'csv', 'xlsx']),
  accountId: z.string().regex(/^[\w-]{1,80}$/),
  sourceKind: z.enum(['bank', 'card']),
  sizeBytes: z.number().int().min(1).max(4_000_000),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  preview: extractedStatementSchema.optional(),
  reviewedRows: z.array(statementRowSchema).max(100).optional(),
  importedIds: z.array(z.string()).max(100).optional(),
  errorCode: z.string().max(80).optional(),
});
export type StatementJob = z.infer<typeof statementJobSchema>;
export type StatementRow = z.infer<typeof statementRowSchema>;
export type ExtractedStatement = z.infer<typeof extractedStatementSchema>;
export const uploadStatementSchema = z
  .object({
    format: z.literal('csv'),
    accountId: z.string().regex(/^[\w-]{1,80}$/),
    sourceKind: z.enum(['bank', 'card']),
    sizeBytes: z.number().int().min(1).max(4_000_000),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    consentToAnalysis: z.literal(true),
  })
  .strict();
export const commitStatementSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    confirmed: z.literal(true),
    rows: z.array(statementRowSchema).max(100),
    duplicateReviewConfirmed: z.literal(true),
  })
  .strict();
