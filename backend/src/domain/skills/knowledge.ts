export interface KnowledgeDocument {
  id: string;
  domain: string;
  version: string;
  title: string;
  body: string;
  validFrom: string;
  validUntil?: string | undefined;
  audience: 'general';
}

export interface KnowledgeHit {
  sourceId: string;
  version: string;
  domain: string;
  excerpt: string;
}

export interface KnowledgeQuery {
  question: string;
  now: Date;
  domain?: string | undefined;
}
