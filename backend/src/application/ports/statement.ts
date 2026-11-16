import type { ExtractedStatement, StatementJob } from '../../domain/finance/statement.js';
export interface StatementStorage {
  upload(job: StatementJob): Promise<{ url: string; headers: Record<string, string> }>;
  read(job: StatementJob): Promise<Uint8Array>;
}
export interface StatementExtractor {
  extract(job: StatementJob, bytes: Uint8Array): Promise<ExtractedStatement>;
}
