import type { SkillDefinition } from '../../domain/skills/definition.js';
import { SkillRegistry } from './registry.js';

const conversationTools = [
  'get_mood',
  'get_relationship_state',
  'get_world_context',
  'get_world_preferences',
  'set_world_preferences',
  'get_current_time',
  'create_task',
  'create_task_with_optional_reminder',
  'list_tasks',
  'complete_task',
  'create_reminder',
  'list_reminders',
  'complete_reminder',
  'get_today_items',
  'add_shopping_items',
  'add_shopping_items_with_reminder',
  'list_shopping_items',
  'remove_shopping_items',
  'clear_shopping_list',
] as const;

export function builtinSkillDefinitions(): SkillDefinition[] {
  return [
    {
      id: 'flirt',
      version: '1',
      scope:
        'Respond to user-initiated flirting, pickup lines and teasing with the RIN personality.',
      allowedTools: ['get_mood', 'get_relationship_state'],
      contextNeeds: ['profile', 'working_memory'],
      proactive: { canPropose: false, kinds: [] },
      defaultEnabled: false,
      fallbackSkillId: 'conversation',
    },
    {
      id: 'conversation',
      version: '1',
      scope: 'Everyday conversation, tasks, reminders and shopping lists.',
      allowedTools: conversationTools,
      contextNeeds: ['profile', 'working_memory', 'tasks'],
      proactive: { canPropose: true, kinds: ['accepted_follow_up'] },
      defaultEnabled: true,
      fallbackSkillId: 'conversation',
    },
    {
      id: 'finance',
      version: '1',
      scope: 'Personal finance records and analysis, without payments or investments.',
      allowedTools: [
        'get_mood',
        'get_relationship_state',
        'get_current_time',
        'record_finance_movement',
        'query_finance_summary',
        'list_finance_entries',
        'list_finance_bills',
        'set_finance_budget',
        'update_financial_plan',
        'save_financial_debt',
        'query_financial_plan',
        'review_financial_history',
        'list_financial_debts',
        'report_financial_bill_paid',
        'assess_financial_purchase',
      ],
      contextNeeds: ['profile', 'working_memory', 'finance_records'],
      proactive: { canPropose: true, kinds: ['due_bill', 'budget', 'review'] },
      defaultEnabled: true,
      fallbackSkillId: 'conversation',
    },
    {
      id: 'support',
      version: '1',
      scope: 'Listening and emotional support, without diagnosis or treatment.',
      allowedTools: ['get_current_time', 'get_mood', 'get_relationship_state'],
      contextNeeds: ['profile', 'working_memory', 'support_notes'],
      proactive: { canPropose: true, kinds: ['consented_follow_up'] },
      defaultEnabled: true,
      fallbackSkillId: 'conversation',
    },
  ];
}

export function createSkillRegistry(): SkillRegistry {
  const registry = new SkillRegistry();
  for (const definition of builtinSkillDefinitions()) registry.register(definition);
  return registry;
}
