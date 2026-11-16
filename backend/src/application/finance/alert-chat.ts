import { defaultAlertPreferences, type AlertPreferences } from '../../domain/finance/alerts.js';
import type { SkillResult } from '../../domain/skills/definition.js';
import type { AlertPreferenceRepository } from '../ports/alert-preferences.js';
import type { SkillTurn, SkillTurnHandler } from '../skills/runtime.js';

export function financeAlertChat(repo: AlertPreferenceRepository): SkillTurnHandler {
  return {
    skillId: 'finance',
    handle: (turn) => updateAlertPreferences(repo, turn),
  };
}

export async function updateAlertPreferences(
  repo: AlertPreferenceRepository,
  turn: SkillTurn,
): Promise<SkillResult | null> {
  const text = normalize(turn.message);
  const current = (await repo.get(turn.userId, turn.assistantId)) ?? defaultAlertPreferences(turn.userId, turn.assistantId, turn.now);
  if (text.includes('pausa os alertas')) return save(repo, { ...current, enabled: false, updatedAt: turn.now.toISOString() }, 'I paused financial alerts.');
  if (text.includes('ativa os alertas')) {
    const next: AlertPreferences = { ...current, enabled: true, updatedAt: turn.now.toISOString() };
    delete next.pausedUntil;
    return save(repo, next, 'Financial alerts are back on.');
  }
  if (text.includes('no maximo um alerta')) {
    return save(repo, { ...current, maxPerDay: 1, updatedAt: turn.now.toISOString() }, 'I will send at most one financial alert per day.');
  }
  return null;
}

async function save(repo: AlertPreferenceRepository, preferences: AlertPreferences, statement: string): Promise<SkillResult> {
  await repo.put(preferences);
  return {
    skillId: 'finance',
    facts: [{ id: 'alerts', statement }],
    calculated: [],
    explanations: ['This preference is saved and remains in effect after restarting.'],
    missing: [],
    proposedActions: [],
    tone: { intensity: 'measured', allowSarcasm: false },
  };
}

function normalize(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
