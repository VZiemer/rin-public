import { AgentToolRegistry, type AgentTool } from '../agent/tools.js';

export function registryForSkill(tools: readonly AgentTool[], allowed: readonly string[]): AgentToolRegistry {
  const names = new Set(allowed);
  return new AgentToolRegistry(tools.filter((tool) => names.has(tool.name)));
}

const LOW_RISK_SKILL_WRITES = new Set(['record_explicit_expense', 'record_explicit_income']);

export function requiresSkillConfirmation(name: string, risk: 'READ' | 'WRITE' | 'SENSITIVE'): boolean {
  if (risk === 'READ') return false;
  if (LOW_RISK_SKILL_WRITES.has(name)) return false;
  return true;
}
