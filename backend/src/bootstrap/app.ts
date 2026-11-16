import { logger } from './logger.js';
import { FinancialPlanning } from '../application/finance/planning.js';
import { financialPlanningTools } from '../application/finance/planning-tools.js';
import { Statements } from '../application/finance/statements.js';
import { S3StatementStorage } from '../adapters/outbound/finance/statement-storage.js';
import { AssetContextChat } from '../application/assets/onboarding.js';
import { BedrockAssetUsageAnalyzer } from '../adapters/outbound/agent-model/asset-usage.js';
import { S3Client } from '@aws-sdk/client-s3';
import { S3RinAssetStorage } from '../adapters/outbound/assets/s3.js';
import { ReadRinAssets } from '../application/assets/catalog.js';
import { RinVisualAssets } from '../application/assets/selection.js';
import { WorldAssetEnvironment } from '../application/assets/environment.js';
import { withLocalToolTimes } from '../application/agent/localized-tool.js';
import { WorldPreferences, worldTools } from '../application/world/settings.js';
import { ReadWorldContext, worldContextTool } from '../application/world/read-context.js';
import { PublicWorldSources } from '../adapters/outbound/world/public-sources.js';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { BedrockAgentModelGateway } from '../adapters/outbound/agent-model/bedrock.js';
import { OpenAiAgentModelGateway } from '../adapters/outbound/agent-model/openai.js';
import { BedrockOpenAiAgentModelGateway } from '../adapters/outbound/agent-model/bedrock-openai.js';
import type { AgentModelGateway } from '../application/ports/model.js';
import { openAiCredential } from './openai-credential.js';
import { ModelWorkingMemorySummarizer } from '../adapters/outbound/agent-model/working-summary.js';
import { notificationGateway } from './notifications.js';
import { SendNotification } from '../application/use-cases/send-notification.js';
import { Devices } from '../application/use-cases/devices.js';
import { UpdateWorkingMemory } from '../application/use-cases/working-memory.js';
import { taskReminderTools } from '../application/agent/task-reminder-tools.js';
import { shoppingTools } from '../application/agent/shopping-tools.js';
import { Reminders } from '../application/use-cases/reminders.js';
import { Tasks } from '../application/use-cases/tasks.js';
import { ShoppingItems } from '../application/use-cases/shopping-items.js';
import { Confirmations, ConfirmationPolicy } from '../application/agent/confirmation.js';
import { AgentLoop } from '../application/agent/loop.js';
import {
  AgentToolRegistry,
  AgentToolExecutor,
  currentTimeTool,
} from '../application/agent/tools.js';
import { randomUUID } from 'node:crypto';
import { loadConfig } from './config.js';
import { contextRepositories } from './repositories.js';
import { AgentContextBuilder } from '../application/agent/context-builder.js';
import { SystemPromptRenderer } from '../application/agent/prompt-renderer.js';
import { RunAgent } from '../application/use-cases/run-agent.js';
import { createSkillRegistry } from '../application/skills/catalog.js';
import { SkillEnablement } from '../application/skills/enablement.js';
import { SkillRuntime } from '../application/skills/runtime.js';
import { FinanceLedger } from '../application/finance/ledger.js';
import { financeTools } from '../application/finance/tools.js';
import { financeChatHandler } from '../application/finance/chat.js';
import { followUpHandler } from '../application/skills/follow-ups.js';
import { financeAlertChat } from '../application/finance/alert-chat.js';
import { supportChatHandler } from '../application/skills/support.js';
import { supportConsentChat } from '../application/skills/consent-chat.js';
import { ensureCuratedKnowledge } from '../application/skills/knowledge.js';
import { AssistantPreferences } from '../application/use-cases/assistant-preferences.js';
import { StaticAgentModelGateway } from '../adapters/outbound/agent-model/static.js';
import { createHandler } from '../adapters/inbound/http/handler.js';
import { BootstrapAuthenticatedUser } from '../application/use-cases/bootstrap-authenticated-user.js';
import { ResolveAuthenticatedUser } from '../application/use-cases/resolve-authenticated-user.js';
import { CompleteReportedPayment } from '../application/use-cases/complete-reported-payment.js';
import { BehaviorRuntime } from '../application/behavior/runtime.js';
import { Hipnose } from '../application/behavior/hipnose.js';
import { HipnoseImages } from '../application/assets/hipnose-images.js';
import { LambdaClient } from '@aws-sdk/client-lambda';
import { LambdaInteractionDispatcher } from '../adapters/outbound/behavior/interaction-dispatcher.js';
import { behaviorReadTools } from '../application/behavior/tools.js';
async function applyFinanceCorrection(
  finance: FinanceLedger,
  operation: {
    userId: string;
    assistantId: string;
    payload: Record<string, string | number | boolean>;
  },
) {
  const entryId = operation.payload.entryId;
  const amountMinor = operation.payload.amountMinor;
  if (typeof entryId !== 'string' || typeof amountMinor !== 'number')
    throw new Error('invalid_operation');
  const corrected = await finance.correctEntry(
    operation.userId,
    operation.assistantId,
    entryId,
    amountMinor,
    `confirm-${entryId}-${amountMinor}`,
  );
  return {
    skillId: 'finance' as const,
    facts: [{ id: corrected.id, statement: 'The confirmed correction was applied.' }],
    calculated: [
      {
        id: 'amount',
        label: corrected.categoryId,
        amountMinor: corrected.amountMinor,
        currency: corrected.currency,
      },
    ],
    explanations: ['The confirmation was linked to a pending operation.'],
    missing: [],
    proposedActions: [],
    tone: { intensity: 'measured' as const, allowSarcasm: false },
  };
}
function skillRuntime(
  repos: ReturnType<typeof contextRepositories>,
  tools: ConstructorParameters<typeof AgentToolRegistry>[0],
  model: AgentModelGateway,
  finance: FinanceLedger,
  planning: FinancialPlanning,
  modelDeadlineMs: number,
) {
  const skills = createSkillRegistry();
  const clock = { now: () => new Date() };
  const ids = { next: randomUUID };
  return new SkillRuntime({
    skills,
    enablement: new SkillEnablement(skills, repos.skillEnablement),
    subjects: repos.activeSubjects,
    domainRecords: repos.domainRecords,
    pending: repos.pendingSkillOperations,
    handlers: [
      financeChatHandler({
        planning,
        ledger: finance,
        pending: repos.pendingSkillOperations,
        clock,
        ids,
        timezone: 'America/Sao_Paulo',
      }),
      supportChatHandler(),
    ],
    applyPending: (operation) => applyFinanceCorrection(finance, operation),
    followUps: followUpHandler(repos.followUps, ids),
    threads: repos.skillThreads,
    alertChat: financeAlertChat(repos.alertPreferences),
    consentChat: supportConsentChat(repos.supportConsents, repos.followUps, ids),
    tools,
    model,
    modelDeadlineMs,
    renderer: new SystemPromptRenderer(),
    log: logger,
    clock: { now: () => new Date() },
  });
}
export async function createApp() {
  const config = loadConfig();
  const backgroundModel =
    config.modelProvider === 'bedrock'
      ? new BedrockAgentModelGateway(
          new BedrockRuntimeClient({ region: config.region, maxAttempts: 1 }),
          config.bedrockModelId,
          logger,
        )
      : new StaticAgentModelGateway();
  const agentProvider = config.agentModelProvider ?? config.modelProvider;
  const agentBedrockModelId = config.agentBedrockModelId ?? config.bedrockModelId;
  const modelDeadlineMs =
    agentProvider === 'openai' ||
    agentProvider === 'bedrock-openai' ||
    (agentProvider === 'bedrock' && /^openai\.gpt-oss-(?:120|20)b-1:0$/.test(agentBedrockModelId))
      ? 18_000
      : 12_000;
  const model: AgentModelGateway =
    agentProvider === 'bedrock-openai'
      ? new BedrockOpenAiAgentModelGateway(
          new BedrockRuntimeClient({ region: config.region, maxAttempts: 1 }).config.credentials,
          config.region,
          config.bedrockOpenAiModelId,
        )
      : agentProvider === 'openai'
        ? new OpenAiAgentModelGateway(
            openAiCredential(config.region, config.openAiSecretArn, config.openAiApiKey),
            config.openAiModelId,
          )
        : agentProvider === 'bedrock'
          ? agentBedrockModelId === config.bedrockModelId && config.modelProvider === 'bedrock'
            ? backgroundModel
            : new BedrockAgentModelGateway(
                new BedrockRuntimeClient({ region: config.region, maxAttempts: 1 }),
                agentBedrockModelId,
                logger,
              )
          : new StaticAgentModelGateway();
  const repos = contextRepositories();
  const behavior = new BehaviorRuntime(
    repos.assistantBehavior,
    repos.personalities,
    repos.assistants,
  );
  await ensureCuratedKnowledge(repos.knowledge, new Date());
  const tasks = new Tasks(repos.tasks, { now: () => new Date() }, { next: randomUUID });
  const reminders = new Reminders(repos.reminders, { now: () => new Date() }, { next: randomUUID });
  const shopping = new ShoppingItems(
    repos.shopping,
    { now: () => new Date() },
    { next: randomUUID },
  );
  const finance = new FinanceLedger(repos.finance, { now: () => new Date() }, { next: randomUUID });
  const planning = new FinancialPlanning(
    repos.financialPlanning,
    finance,
    { now: () => new Date() },
    config.timezone,
  );
  const tools = [
    ...behaviorReadTools(behavior, { now: () => new Date() }),
    currentTimeTool({ now: () => new Date() }),
    ...taskReminderTools(tasks, reminders),
    ...shoppingTools(shopping, reminders),
    ...financeTools(finance),
    ...financialPlanningTools(planning),
    worldContextTool(
      new ReadWorldContext({
        settings: repos.worldSettings,
        world: repos.rinWorldContext,
        clock: { now: () => new Date() },
      }),
    ),
    ...worldTools(
      new WorldPreferences(repos.worldSettings, new PublicWorldSources(), {
        now: () => new Date(),
      }),
    ),
  ];
  const localizedTools = tools.map(withLocalToolTimes);
  const registry = new AgentToolRegistry(localizedTools);
  const executor = new AgentToolExecutor(registry, logger);
  const confirmations = new Confirmations(
    repos.confirmations,
    { now: () => new Date() },
    { next: randomUUID },
    executor,
  );
  const builder = new AgentContextBuilder(
    { ...repos, assistants: repos.assistants, behavior },
    { get: async () => ({ currentTime: new Date().toISOString(), timezone: config.timezone }) },
    repos.memory,
    repos.workingMemory,
    repos.tasks,
    repos.reminders,
  );
  return createHandler({
    financialPlanning: planning,
    ...(config.financeImportsEnabled && config.financeBucketName
      ? {
          statements: new Statements(
            repos.financialPlanning,
            new S3StatementStorage(
              new S3Client({ region: config.region, useDualstackEndpoint: true }),
              config.financeBucketName,
            ),
            finance,
            { now: () => new Date() },
            { next: randomUUID },
            config.timezone,
          ),
        }
      : {}),
    ...(config.assetBucketName
      ? {
          rinAssets: new ReadRinAssets(
            repos.rinAssetCatalog,
            new S3RinAssetStorage(new S3Client({ region: config.region }), config.assetBucketName),
            repos.assistants,
          ),
        }
      : {}),
    enableDebugEndpoints: config.enableDebugEndpoints,
    notifications: new SendNotification(
      repos.devices,
      await notificationGateway(config.region, config.firebaseSecretArn),
      { now: () => new Date() },
      new RinVisualAssets(
        repos.rinAssetCatalog,
        { now: () => new Date() },
        config.timezone,
        logger,
        new WorldAssetEnvironment(
          repos.worldSettings,
          repos.rinWorldContext,
          repos.rinState,
          config.timezone,
          repos.assistantBehavior,
        ),
      ),
    ),
    devices: new Devices(repos.devices, { now: () => new Date() }),
    reminders,
    tasks,
    confirmations,
    environment: config.environment,
    devUserId: config.devUserId,
    cognito: {
      ...(config.cognitoIssuer ? { issuer: config.cognitoIssuer } : {}),
      ...(config.cognitoAudience ? { audience: config.cognitoAudience } : {}),
    },
    resolveUser: new ResolveAuthenticatedUser(repos.identities),
    bootstrapUser: new BootstrapAuthenticatedUser(repos.identities, repos.profile, {
      now: () => new Date(),
    }),
    profiles: repos.profile,
    ids: { next: randomUUID },
    assistants: repos.assistants,
    assistantPreferences: new AssistantPreferences(repos.profile, repos.assistants),
    agent: new RunAgent(
      builder,
      new SystemPromptRenderer(),
      new AgentLoop(
        model,
        registry,
        executor,
        5,
        new ConfirmationPolicy(),
        confirmations,
        logger,
        Date.now,
        modelDeadlineMs,
      ),
      new UpdateWorkingMemory(
        repos.workingMemory,
        config.modelProvider === 'bedrock'
          ? new ModelWorkingMemorySummarizer(backgroundModel)
          : { summarize: async (previous) => previous || 'Conversation started in static mode.' },
        { now: () => new Date() },
      ),
      logger,
      skillRuntime(repos, localizedTools, model, finance, planning, modelDeadlineMs),
      new CompleteReportedPayment(reminders),
      new Hipnose(
        behavior,
        { now: () => new Date() },
        new HipnoseImages({
          catalog: repos.rinAssetCatalog,
          states: repos.assistantBehavior,
          clock: { now: () => new Date() },
          deliveries: repos.assetSelections,
          ...(config.assetBucketName && config.firebaseSecretArn
            ? {
                delivery: {
                  storage: new S3RinAssetStorage(
                    new S3Client({ region: config.region }),
                    config.assetBucketName,
                  ),
                  devices: repos.devices,
                  notifications: await notificationGateway(config.region, config.firebaseSecretArn),
                },
              }
            : {}),
        }),
      ),
      config.behaviorFeedbackEnabled && config.behaviorFeedbackFunctionArn
        ? new LambdaInteractionDispatcher(
            new LambdaClient({ region: config.region, maxAttempts: 1 }),
            config.behaviorFeedbackFunctionArn,
          )
        : undefined,
      config.environment === 'dev' &&
        config.assetOnboardingEnabled &&
        config.assetBucketName &&
        config.modelProvider === 'bedrock'
        ? new AssetContextChat({
            userId: config.internalUserId ?? '',
            records: repos.assetOnboarding,
            analyzer: new BedrockAssetUsageAnalyzer(
              new BedrockRuntimeClient({ region: config.region, maxAttempts: 1 }),
              config.bedrockModelId,
            ),
            catalog: repos.rinAssetCatalog,
            storage: new S3RinAssetStorage(
              new S3Client({ region: config.region }),
              config.assetBucketName,
            ),
            clock: { now: () => new Date() },
            ids: { next: randomUUID },
          })
        : undefined,
    ),
  });
}
