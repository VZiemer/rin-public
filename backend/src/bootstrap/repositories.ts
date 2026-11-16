import { DynamoDbDeviceRepository } from '../adapters/outbound/dynamodb/device-repository.js';
import { DynamoDbFinancialPlanningRepository } from '../adapters/outbound/dynamodb/financial-planning-repository.js';
import { DynamoDbAssetOnboardingRepository } from '../adapters/outbound/dynamodb/asset-onboarding-repository.js';
import {
  DynamoDbAssistantBehaviorRepository,
  DynamoDbPersonalityRepository,
} from '../adapters/outbound/dynamodb/assistant-behavior-repository.js';
import { DynamoDbRinAssetCatalogRepository } from '../adapters/outbound/dynamodb/rin-asset-repository.js';
import { DynamoDbAssetDeviceSource } from '../adapters/outbound/dynamodb/asset-device-source.js';
import { DynamoDbAssetSelectionRepository } from '../adapters/outbound/dynamodb/asset-selection-repository.js';
import { DynamoDbWorldSettingsRepository } from '../adapters/outbound/dynamodb/world-repository.js';
import { DynamoDbMemoryRepository } from '../adapters/outbound/dynamodb/memory-repository.js';
import { DynamoDbWorkingMemoryRepository } from '../adapters/outbound/dynamodb/working-memory-repository.js';
import { DynamoDbProactiveMessageRepository } from '../adapters/outbound/dynamodb/proactive-message-repository.js';
import { DynamoDbReminderMessageRepository } from '../adapters/outbound/dynamodb/reminder-message-repository.js';
import { DynamoDbReminderRepository } from '../adapters/outbound/dynamodb/reminder-repository.js';
import { DynamoDbTaskRepository } from '../adapters/outbound/dynamodb/task-repository.js';
import { DynamoDbConfirmationRepository } from '../adapters/outbound/dynamodb/confirmation-repository.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { loadConfig } from './config.js';
import { DynamoDbAssistantRepository } from '../adapters/outbound/dynamodb/assistant-repository.js';
import { DynamoDbAuthIdentityRepository } from '../adapters/outbound/dynamodb/auth-identity-repository.js';
import { DynamoDbSkillEnablementRepository } from '../adapters/outbound/dynamodb/skill-enablement-repository.js';
import { DynamoDbActiveSubjectRepository } from '../adapters/outbound/dynamodb/active-subject-repository.js';
import { DynamoDbDomainRecordRepository } from '../adapters/outbound/dynamodb/domain-record-repository.js';
import { DynamoDbPendingSkillOperationRepository } from '../adapters/outbound/dynamodb/pending-skill-operation-repository.js';
import { DynamoDbFinanceRepository } from '../adapters/outbound/dynamodb/finance-repository.js';
import { DynamoDbFollowUpRepository } from '../adapters/outbound/dynamodb/follow-up-repository.js';
import { DynamoDbSkillThreadRepository } from '../adapters/outbound/dynamodb/skill-thread-repository.js';
import { DynamoDbAlertPreferenceRepository } from '../adapters/outbound/dynamodb/alert-preference-repository.js';
import { DynamoDbSupportConsentRepository } from '../adapters/outbound/dynamodb/support-consent-repository.js';
import { DynamoDbKnowledgeRepository } from '../adapters/outbound/dynamodb/knowledge-repository.js';
import {
  DynamoDbPersonaRepository,
  DynamoDbUserProfileRepository,
  DynamoDbRelationshipRepository,
  DynamoDbRoutineRepository,
  DynamoDbPersonRepository,
  DynamoDbShoppingItemRepository,
  DynamoDbRinStateRepository,
  DynamoDbRinPreferencesRepository,
  DynamoDbRinWorldContextRepository,
  DynamoDbRinEpisodeRepository,
} from '../adapters/outbound/dynamodb/context-repositories.js';
export function contextRepositories() {
  const config = loadConfig();
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: config.region }), {
    marshallOptions: { removeUndefinedValues: true },
  });
  const table = config.tableName;
  return {
    financialPlanning: new DynamoDbFinancialPlanningRepository(client, table),
    assetOnboarding: new DynamoDbAssetOnboardingRepository(client, table),
    assistantBehavior: new DynamoDbAssistantBehaviorRepository(client, table),
    personalities: new DynamoDbPersonalityRepository(client, table),
    rinAssetCatalog: new DynamoDbRinAssetCatalogRepository(client, table),
    assetDevices: new DynamoDbAssetDeviceSource(client, table),
    assetSelections: new DynamoDbAssetSelectionRepository(client, table),
    worldSettings: new DynamoDbWorldSettingsRepository(client, table),
    devices: new DynamoDbDeviceRepository(client, table),
    memory: new DynamoDbMemoryRepository(client, table),
    workingMemory: new DynamoDbWorkingMemoryRepository(client, table, { now: () => new Date() }),
    proactiveMessages: new DynamoDbProactiveMessageRepository(client, table),
    reminderMessages: new DynamoDbReminderMessageRepository(client, table),
    reminders: new DynamoDbReminderRepository(client, table),
    tasks: new DynamoDbTaskRepository(client, table),
    shopping: new DynamoDbShoppingItemRepository(client, table),
    confirmations: new DynamoDbConfirmationRepository(client, table),
    persona: new DynamoDbPersonaRepository(client, table),
    profile: new DynamoDbUserProfileRepository(client, table),
    relationship: new DynamoDbRelationshipRepository(client, table),
    routine: new DynamoDbRoutineRepository(client, table),
    rinState: new DynamoDbRinStateRepository(client, table),
    rinPreferences: new DynamoDbRinPreferencesRepository(client, table),
    rinWorldContext: new DynamoDbRinWorldContextRepository(client, table),
    rinEpisodes: new DynamoDbRinEpisodeRepository(client, table),
    people: new DynamoDbPersonRepository(client, table),
    assistants: new DynamoDbAssistantRepository(client, table),
    identities: new DynamoDbAuthIdentityRepository(client, table),
    skillEnablement: new DynamoDbSkillEnablementRepository(client, table),
    activeSubjects: new DynamoDbActiveSubjectRepository(client, table),
    domainRecords: new DynamoDbDomainRecordRepository(client, table),
    pendingSkillOperations: new DynamoDbPendingSkillOperationRepository(client, table),
    finance: new DynamoDbFinanceRepository(client, table),
    followUps: new DynamoDbFollowUpRepository(client, table),
    skillThreads: new DynamoDbSkillThreadRepository(client, table),
    alertPreferences: new DynamoDbAlertPreferenceRepository(client, table),
    supportConsents: new DynamoDbSupportConsentRepository(client, table),
    knowledge: new DynamoDbKnowledgeRepository(client, table),
  };
}
