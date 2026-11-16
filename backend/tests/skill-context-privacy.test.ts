import { expect, test } from 'vitest';
import { InMemoryDomainRecordRepository } from '../src/adapters/outbound/memory/domain-record-repository.js';
import { prepareDomainRecord, projectSkillContext } from '../src/application/skills/context-policy.js';
import { retentionFor, type DomainRecord } from '../src/domain/skills/domain-record.js';

const now = new Date('2026-10-11T15:00:00.000Z');

function record(partial: Partial<DomainRecord> & Pick<DomainRecord, 'id' | 'domain' | 'sensitivity'>): DomainRecord {
  const retention = retentionFor(partial.sensitivity, now);
  return {
    userId: 'user-a',
    assistantId: 'RIN',
    origin: 'user',
    recordedAt: now.toISOString(),
    payload: {},
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...retention,
    ...partial,
  };
}

test('finance omits emotional detail and support omits amounts', () => {
  const records = [
    record({
      id: 'vent',
      domain: 'support',
      sensitivity: 'emotional',
      payload: { note: 'estou desesperado com o dia' },
    }),
    record({
      id: 'rent',
      domain: 'finance',
      sensitivity: 'financial',
      payload: { category: 'moradia', amountMinor: 120000, currency: 'BRL' },
    }),
  ];
  const finance = projectSkillContext({
    skillId: 'finance',
    userId: 'user-a',
    assistantId: 'RIN',
    records,
    workingSummary: 'Ele desabafou que está desesperado e gastou R$ 80,00.',
    now,
  });
  expect(finance.records.map((item) => item.id)).toEqual(['rent']);
  expect(finance.omitted).toEqual(['emotional']);
  expect(finance.workingSummary).not.toMatch(/desesper/i);

  const support = projectSkillContext({
    skillId: 'support',
    userId: 'user-a',
    assistantId: 'RIN',
    records,
    workingSummary: 'Gastou R$ 80,00 e ficou triste.',
    now,
  });
  expect(support.records.map((item) => item.id)).toEqual(['vent']);
  expect(support.workingSummary).not.toMatch(/R\$/);
  expect(support.workingSummary).toMatch(/triste/);
});

test('emotional notes are not stored permanently without consent and stay isolated', async () => {
  const repo = new InMemoryDomainRecordRepository();
  const vent = record({ id: 'vent', domain: 'support', sensitivity: 'emotional' });
  expect(() => prepareDomainRecord({ ...vent, persist: 'permanent' })).toThrow('consent_required');
  const allowed = prepareDomainRecord({ ...vent, persist: 'permanent', consentId: 'consent-1' });
  await repo.put(allowed);
  await repo.put(record({ id: 'bill', domain: 'finance', sensitivity: 'financial', payload: { currency: 'BRL' } }));
  expect(await repo.get('user-b', 'RIN', 'vent')).toBeNull();
  expect(await repo.get('user-a', 'YUI', 'vent')).toBeNull();
  expect(await repo.deleteDomain('user-a', 'RIN', 'support')).toBe(1);
  expect(await repo.list('user-a', 'RIN', 'finance')).toHaveLength(1);
  expect(allowed.consentId).toBe('consent-1');
});
