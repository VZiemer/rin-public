import { createHash } from 'node:crypto';
import {
  uploadStatementSchema,
  extractedStatementSchema,
  commitStatementSchema,
  type StatementJob,
} from '../../domain/finance/statement.js';
import type { FinancialPlanningRepository } from '../ports/financial-planning.js';
import type { StatementExtractor, StatementStorage } from '../ports/statement.js';
import type { Clock, IdGenerator } from '../ports/runtime.js';
import type { FinanceLedger } from './ledger.js';
import { AppError } from '../../domain/errors/app-error.js';

export class Statements {
  constructor(
    readonly repo: FinancialPlanningRepository,
    private storage: StatementStorage,
    private ledger: FinanceLedger,
    private clock: Clock,
    private ids: IdGenerator,
    private timezone: string,
  ) {}
  async create(user: string, assistant: string, input: unknown) {
    const data = uploadStatementSchema.parse(input),
      now = this.clock.now().toISOString();
    const job: StatementJob = {
      ...data,
      userId: user,
      assistantId: assistant,
      id: this.ids.next(),
      revision: 0,
      status: 'uploaded_pending',
      createdAt: now,
      updatedAt: now,
    };
    if (!(await this.repo.saveStatement(job, null))) throw new AppError('statement_conflict', 409);
    return {
      id: job.id,
      revision: job.revision,
      ...(await this.storage.upload(job)),
      instructions:
        'Upload the file to this URL. Analysis starts after uploading; review the preview before confirming.',
    };
  }
  async get(user: string, assistant: string, id: string) {
    const job = await this.repo.getStatement(user, assistant, id);
    if (!job) throw new AppError('statement_not_found', 404);
    const { sha256: _hash, ...view } = job;
    void _hash;
    const entries = job.preview ? await this.ledger.listEntries(user, assistant) : [];
    return {
      ...view,
      potentialDuplicates:
        job.preview?.rows.flatMap((row, index) =>
          entries.some(
            (e) =>
              e.status === 'active' &&
              e.amountMinor === row.amountMinor &&
              e.occurredOn === row.occurredOn &&
              e.kind === row.kind,
          )
            ? [index]
            : [],
        ) ?? [],
    };
  }
  async commit(user: string, assistant: string, id: string, input: unknown) {
    const command = commitStatementSchema.parse(input);
    let job = await this.repo.getStatement(user, assistant, id);
    if (!job) throw new AppError('statement_not_found', 404);
    if (job.status === 'committed') return { status: 'committed', importedIds: job.importedIds };
    if (job.status === 'committing') {
      if (JSON.stringify(job.reviewedRows) !== JSON.stringify(command.rows))
        throw new AppError('statement_review_conflict', 409);
    } else {
      if (job.status !== 'review' || job.revision !== command.revision)
        throw new AppError('statement_review_conflict', 409);
      if (command.rows.some((row) => row.kind === 'unknown'))
        throw new AppError('statement_unknown_transactions', 422);
      const next: StatementJob = {
        ...job,
        status: 'committing',
        reviewedRows: command.rows,
        revision: job.revision + 1,
        updatedAt: this.clock.now().toISOString(),
      };
      if (!(await this.repo.saveStatement(next, job.revision)))
        throw new AppError('statement_review_conflict', 409);
      job = next;
    }
    const importedIds: string[] = [];
    for (const [index, row] of job.reviewedRows!.entries()) {
      // Transfers and bill settlements never become an invented income or a second card expense.
      if (row.kind === 'transfer' || row.kind === 'card_payment') continue;
      const signature = row.externalId ? ['external', row.externalId] : ['file', job.sha256, index];
      const key = `import-${createHash('sha256')
        .update(JSON.stringify([user, assistant, job.accountId, ...signature]))
        .digest('hex')}`;
      const saved = await this.ledger.recordEntry({
        userId: user,
        assistantId: assistant,
        kind: row.kind as 'income' | 'expense',
        amountMinor: row.amountMinor,
        currency: row.currency,
        categoryId: row.category,
        occurredOn: row.occurredOn,
        timezone: this.timezone,
        note: row.description,
        idempotencyKey: key,
        origin: 'system',
      });
      if (
        saved.entry.amountMinor !== row.amountMinor ||
        saved.entry.kind !== row.kind ||
        saved.entry.occurredOn !== row.occurredOn ||
        saved.entry.currency !== row.currency ||
        saved.entry.note !== row.description
      )
        throw new AppError('statement_identity_conflict', 409);
      importedIds.push(saved.entry.id);
    }
    const completed: StatementJob = {
      ...job,
      status: 'committed',
      importedIds,
      revision: job.revision + 1,
      updatedAt: this.clock.now().toISOString(),
    };
    if (!(await this.repo.saveStatement(completed, job.revision)))
      throw new AppError('statement_review_conflict', 409);
    return { status: 'committed', importedIds };
  }
}
export class ProcessStatement {
  constructor(
    private repo: FinancialPlanningRepository,
    private storage: StatementStorage,
    private extractor: StatementExtractor,
    private clock: Clock,
  ) {}
  async execute(user: string, assistant: string, id: string) {
    const job = await this.repo.getStatement(user, assistant, id);
    if (!job) throw new AppError('statement_not_found', 404);
    if (['review', 'committing', 'committed'].includes(job.status)) return { status: 'skipped' };
    if (
      job.status === 'processing' &&
      this.clock.now().getTime() - Date.parse(job.updatedAt) < 180000
    )
      throw new AppError('statement_processing', 409);
    const { errorCode: previousError, ...retryableJob } = job;
    void previousError;
    const processing: StatementJob = {
      ...retryableJob,
      status: 'processing',
      revision: job.revision + 1,
      updatedAt: this.clock.now().toISOString(),
    };
    if (!(await this.repo.saveStatement(processing, job.revision)))
      throw new AppError('statement_conflict', 409);
    try {
      if (processing.format !== 'csv') throw new AppError('statement_format_disabled', 422);
      const preview = extractedStatementSchema.parse(
        await this.extractor.extract(processing, await this.storage.read(processing)),
      );
      if (!preview.complete || !preview.rows.length)
        throw new AppError('statement_incomplete_split_file', 422);
      const next: StatementJob = {
        ...processing,
        status: 'review',
        preview,
        revision: processing.revision + 1,
        updatedAt: this.clock.now().toISOString(),
      };
      if (!(await this.repo.saveStatement(next, processing.revision)))
        throw new AppError('statement_conflict', 409);
      return { status: 'review' };
    } catch (error) {
      await this.repo.saveStatement(
        {
          ...processing,
          status: 'failed',
          revision: processing.revision + 1,
          updatedAt: this.clock.now().toISOString(),
          errorCode: error instanceof AppError ? error.code : 'statement_analysis_failed',
        },
        processing.revision,
      );
      // Invalid input will not improve on an asynchronous retry. The app reads
      // the sanitized code from the saved job and can explain how to fix it.
      if (error instanceof AppError && error.status === 422) return { status: 'failed' };
      // eslint-disable-next-line preserve-caught-error -- Provider errors may contain private statement text; persist only their sanitized code above.
      throw new Error('Statement analysis failed');
    }
  }
}
