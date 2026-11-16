import type { KnowledgeRepository } from '../../../application/ports/knowledge.js';
import type { KnowledgeDocument } from '../../../domain/skills/knowledge.js';

export class InMemoryKnowledgeRepository implements KnowledgeRepository {
  private readonly documents = new Map<string, KnowledgeDocument>();

  async get(id: string) {
    return this.documents.get(id) ?? null;
  }

  async put(document: KnowledgeDocument) {
    this.documents.set(document.id, document);
  }

  async list(domain?: string) {
    return [...this.documents.values()].filter((document) => !domain || document.domain === domain);
  }
}
