import { AppError } from '../../domain/errors/app-error.js';
import type { KnowledgeDocument, KnowledgeHit, KnowledgeQuery } from '../../domain/skills/knowledge.js';
import type { KnowledgeGateway, KnowledgeRepository } from '../ports/knowledge.js';

const INJECTION =
  /ignore previous|you may use tool|grant permission|alterar permiss|habilite a ferramenta|system prompt|tool allowlist/i;

export function ingestKnowledge(input: unknown, now: Date): KnowledgeDocument {
  if (!input || typeof input !== 'object') throw new AppError('invalid_knowledge', 422);
  const raw = input as Record<string, unknown>;
  const body = typeof raw.body === 'string' ? sanitize(raw.body) : '';
  if (!body) throw new AppError('invalid_knowledge', 422);
  if (typeof raw.id !== 'string' || typeof raw.domain !== 'string' || typeof raw.version !== 'string') {
    throw new AppError('invalid_knowledge', 422);
  }
  if (typeof raw.title !== 'string' || raw.audience !== 'general') throw new AppError('invalid_knowledge', 422);
  const document: KnowledgeDocument = {
    id: raw.id,
    domain: raw.domain,
    version: raw.version,
    title: raw.title,
    body,
    validFrom: typeof raw.validFrom === 'string' ? raw.validFrom : now.toISOString(),
    audience: 'general',
  };
  if (typeof raw.validUntil === 'string') document.validUntil = raw.validUntil;
  return document;
}

export function curatedKnowledge(now: Date): KnowledgeDocument[] {
  return [
    ingestKnowledge(
      {
        id: 'finance-budget-vs-balance',
        domain: 'finance',
        version: '1',
        title: 'Budget and balance',
        audience: 'general',
        body: 'Remaining budget is the period limit minus spending in the same currency. It is not a bank balance.',
      },
      now,
    ),
    ingestKnowledge(
      {
        id: 'support-boundary',
        domain: 'support',
        version: '1',
        title: 'Support boundaries',
        audience: 'general',
        body: 'Support here means listening and organizing. It does not replace professional care or people close to you.',
      },
      now,
    ),
  ];
}

export async function ensureCuratedKnowledge(repo: KnowledgeRepository, now: Date): Promise<void> {
  for (const document of curatedKnowledge(now)) {
    if (!(await repo.get(document.id))) await repo.put(document);
  }
}

export class RepositoryKnowledgeGateway implements KnowledgeGateway {
  constructor(private readonly repo: KnowledgeRepository) {}

  async query(input: KnowledgeQuery): Promise<KnowledgeHit[]> {
    const documents = await this.repo.list(input.domain);
    const terms = tokens(input.question);
    return documents.flatMap((document) => {
      if (document.validFrom > input.now.toISOString()) return [];
      if (document.validUntil && document.validUntil <= input.now.toISOString()) return [];
      const overlap = terms.filter((term) => tokens(document.body).includes(term));
      if (overlap.length === 0) return [];
      return [
        {
          sourceId: document.id,
          version: document.version,
          domain: document.domain,
          excerpt: document.body,
        },
      ];
    });
  }
}

export function answerWithSources(input: {
  hits: readonly KnowledgeHit[];
  userRecord?: string | undefined;
}): { evidence: 'user' | 'knowledge' | 'both' | 'none'; text: string } {
  const knowledge = input.hits.map((hit) => `General material ${hit.sourceId} v${hit.version}: ${hit.excerpt}`).join(' ');
  if (input.userRecord && knowledge) {
    return { evidence: 'both', text: `In your records: ${input.userRecord} ${knowledge}` };
  }
  if (input.userRecord) return { evidence: 'user', text: `In your records: ${input.userRecord}` };
  if (knowledge) return { evidence: 'knowledge', text: knowledge };
  return { evidence: 'none', text: 'I do not have a sufficient source to make that claim.' };
}

function sanitize(body: string): string {
  const kept = body
    .split('\n')
    .filter((line) => !INJECTION.test(line))
    .join('\n')
    .trim();
  if (INJECTION.test(kept)) return '';
  return kept;
}

function tokens(value: string): string[] {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 3);
}
