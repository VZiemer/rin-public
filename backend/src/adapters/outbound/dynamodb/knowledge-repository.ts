import { z } from 'zod';
import type { KnowledgeRepository } from '../../../application/ports/knowledge.js';
import type { KnowledgeDocument } from '../../../domain/skills/knowledge.js';
import { DynamoStore, type DocumentClient } from './store.js';

const LIBRARY_USER = 'library';
const schema = z.object({
  userId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  id: z.string(),
  domain: z.string(),
  version: z.string(),
  title: z.string(),
  body: z.string(),
  validFrom: z.string(),
  validUntil: z.string().optional(),
  audience: z.literal('general'),
});

type StoredKnowledge = KnowledgeDocument & { userId: string; createdAt: string; updatedAt: string };

export class DynamoDbKnowledgeRepository implements KnowledgeRepository {
  private readonly store: DynamoStore<StoredKnowledge>;

  constructor(client: DocumentClient, table: string) {
    this.store = new DynamoStore(client, table, 'KNOWLEDGE_DOC', schema);
  }

  async get(id: string) {
    const stored = await this.store.get(LIBRARY_USER, id);
    return stored ? toDocument(stored) : null;
  }

  async put(document: KnowledgeDocument) {
    const now = document.validFrom;
    await this.store.put({ ...document, userId: LIBRARY_USER, createdAt: now, updatedAt: now }, document.id);
  }

  async list(domain?: string) {
    const stored = await this.store.list(LIBRARY_USER, 50);
    return stored.map(toDocument).filter((document) => !domain || document.domain === domain);
  }
}

function toDocument(stored: StoredKnowledge): KnowledgeDocument {
  const document: KnowledgeDocument = {
    id: stored.id,
    domain: stored.domain,
    version: stored.version,
    title: stored.title,
    body: stored.body,
    validFrom: stored.validFrom,
    audience: 'general',
  };
  if (stored.validUntil) document.validUntil = stored.validUntil;
  return document;
}
