import type { KnowledgeDocument, KnowledgeHit, KnowledgeQuery } from '../../domain/skills/knowledge.js';

export interface KnowledgeRepository {
  get(id: string): Promise<KnowledgeDocument | null>;
  put(document: KnowledgeDocument): Promise<void>;
  list(domain?: string): Promise<KnowledgeDocument[]>;
}

export interface KnowledgeGateway {
  query(input: KnowledgeQuery): Promise<KnowledgeHit[]>;
}
