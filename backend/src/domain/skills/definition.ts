export const skillIds = ['conversation', 'finance', 'support', 'flirt'] as const;
export type SkillId = (typeof skillIds)[number];

export const skillContextNeeds = [
  'profile',
  'working_memory',
  'tasks',
  'finance_records',
  'support_notes',
] as const;
export type SkillContextNeed = (typeof skillContextNeeds)[number];

export interface SkillProactiveCapability {
  canPropose: boolean;
  kinds: readonly string[];
}

/** Stable module descriptor. Adding one does not change the Android response contract. */
export interface SkillDefinition {
  id: SkillId;
  version: string;
  scope: string;
  allowedTools: readonly string[];
  contextNeeds: readonly SkillContextNeed[];
  proactive: SkillProactiveCapability;
  defaultEnabled: boolean;
  fallbackSkillId: 'conversation';
}

export interface SkillActivation {
  userId: string;
  assistantId: string;
  skillId: SkillId;
  enabled: boolean;
  source: 'default' | 'user';
}

export interface SkillContextRequest {
  userId: string;
  assistantId: string;
  skillId: SkillId;
  needs: readonly SkillContextNeed[];
}

export interface SkillFact {
  id: string;
  statement: string;
}

export interface SkillCalculatedValue {
  id: string;
  label: string;
  amountMinor: number;
  currency: string;
}

export interface SkillProposedAction {
  id: string;
  label: string;
  kind: 'ask' | 'confirm' | 'none';
}

export type SkillToneIntensity = 'casual' | 'measured' | 'gentle' | 'serious';

export interface SkillResult {
  skillId: SkillId;
  facts: readonly SkillFact[];
  calculated: readonly SkillCalculatedValue[];
  explanations: readonly string[];
  missing: readonly string[];
  proposedActions: readonly SkillProposedAction[];
  tone: { intensity: SkillToneIntensity; allowSarcasm: boolean };
}

/** Execution limits. Selection stays in-process so it does not add a model call. */
export interface SkillPolicy {
  deadlineMs: number;
  maxModelCalls: number;
  maxTokens: number;
  onDisabled: 'conversation';
  onFailure: 'safe_fallback';
}

export const defaultSkillPolicy: SkillPolicy = {
  deadlineMs: 12_000,
  maxModelCalls: 6,
  maxTokens: 8_000,
  onDisabled: 'conversation',
  onFailure: 'safe_fallback',
};

export function isSkillId(value: string): value is SkillId {
  return (skillIds as readonly string[]).includes(value);
}
