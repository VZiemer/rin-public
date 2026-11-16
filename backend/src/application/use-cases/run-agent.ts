import { silentLogger, type Logger } from '../ports/logger.js';
import type { UpdateWorkingMemory } from './working-memory.js';
import type { AgentContextBuilder } from '../agent/context-builder.js';
import type { SystemPromptRenderer } from '../agent/prompt-renderer.js';
import type { AgentLoop } from '../agent/loop.js';
import { localTimeContext } from '../agent/local-time.js';
import type { SkillRuntime } from '../skills/runtime.js';
import { DEFAULT_ASSISTANT_ID } from '../../domain/model/assistant-id.js';
import { attachRinVisualAsset } from '../assets/selection.js';
import type { CompleteReportedPayment } from './complete-reported-payment.js';
import type { Hipnose } from '../behavior/hipnose.js';
import type { InteractionDispatcher } from '../ports/behavior-evolution.js';
import type { AgentOutput } from '../../domain/model/contracts.js';
import type { AgentContext } from '../agent/context-builder.js';
import { protectedInteraction } from '../../domain/model/behavior-evolution.js';
import { isSeriousSocialTurn } from '../behavior/social-style.js';
import { skillAssistant } from '../skills/scope.js';
import type { AssetContextChat } from '../assets/onboarding.js';
export class RunAgent {
  constructor(
    private builder: AgentContextBuilder,
    private renderer: SystemPromptRenderer,
    private loop: AgentLoop,
    private workingMemory?: UpdateWorkingMemory,
    private log: Logger = silentLogger,
    private skills?: SkillRuntime,
    private paymentCompletion?: CompleteReportedPayment,
    private hipnose?: Hipnose,
    private feedback?: InteractionDispatcher,
    private assetContextChat?: AssetContextChat,
  ) {}
  async execute(
    userId: string,
    message: string,
    conversationId: string,
    input: {
      deviceId?: string | undefined;
      assistantId?: string | undefined;
      turnId?: string | undefined;
    } = {},
  ) {
    this.log.event('agent_run_started', { conversationId });
    const assistantId = input.assistantId;
    const diagnostic = await this.hipnose?.handle(
      userId,
      assistantId ?? DEFAULT_ASSISTANT_ID,
      message,
      input.deviceId,
    );
    if (diagnostic?.imageName !== undefined) {
      await this.remember(userId, conversationId, message, diagnostic.message, assistantId);
      this.log.event('agent_run_completed', { conversationId });
      return diagnostic;
    }
    if (!diagnostic) {
      const assetReply = await this.assetContextChat?.handle(
        userId,
        assistantId ?? DEFAULT_ASSISTANT_ID,
        message,
      );
      if (assetReply) {
        await this.remember(userId, conversationId, message, assetReply.message, assistantId);
        this.log.event('agent_run_completed', { conversationId });
        return assetReply;
      }
    }
    const context = await this.builder.build(userId, conversationId, assistantId);
    this.log.event('context_loaded', { conversationId });
    const now = new Date(context.runtime.currentTime);
    if (diagnostic) {
      await this.remember(userId, conversationId, message, diagnostic.message, context.assistantId);
      return attachRinVisualAsset(
        diagnostic,
        context.rinAssetCatalog,
        now,
        context.runtime.timezone,
        context.assetEnvironment,
      );
    }
    const completed = await this.paymentCompletion?.execute(userId, message, context);
    if (completed) {
      await this.remember(userId, conversationId, message, completed.message, assistantId);
      this.log.event('agent_run_completed', { conversationId });
      return attachRinVisualAsset(
        { ...completed, assistantId: context.assistantId },
        context.rinAssetCatalog,
        now,
        context.runtime.timezone,
        context.assetEnvironment,
      );
    }
    if (this.skills) {
      let occasion = context.assetEnvironment.occasion;
      let eligible = false;
      const output = await this.skills.handle({
        userId,
        assistantId: assistantId ?? DEFAULT_ASSISTANT_ID,
        conversationId,
        message,
        deviceId: input.deviceId,
        context,
        onSelection: (choice) => {
          occasion = choice.primary === 'flirt' ? 'flirt' : 'conversation';
          eligible =
            (choice.primary === 'flirt' || choice.primary === 'conversation') && !choice.secondary;
        },
      });
      await this.remember(userId, conversationId, message, output.message, assistantId);
      if (eligible)
        await this.recordFeedback(
          context,
          conversationId,
          message,
          output,
          input.turnId,
          occasion === 'flirt' ? 'flirt' : 'conversation',
        );
      this.log.event('agent_run_completed', { conversationId });
      return attachRinVisualAsset(
        { ...output, assistantId: context.assistantId },
        context.rinAssetCatalog,
        now,
        context.runtime.timezone,
        { ...context.assetEnvironment, occasion },
      );
    }
    const output = await skillAssistant.run(context.assistantId, () =>
      this.loop.run(
        { systemPrompt: this.renderer.render(context, message), message },
        {
          userId,
          conversationId,
          deviceId: input.deviceId,
          time: localTimeContext(now, context.runtime.timezone),
        },
      ),
    );
    await this.remember(userId, conversationId, message, output.message, assistantId);
    await this.recordFeedback(
      context,
      conversationId,
      message,
      output,
      input.turnId,
      'conversation',
    );
    this.log.event('agent_run_completed', { conversationId });
    return attachRinVisualAsset(
      { ...output, assistantId: context.assistantId },
      context.rinAssetCatalog,
      now,
      context.runtime.timezone,
      context.assetEnvironment,
    );
  }

  private async remember(
    userId: string,
    conversationId: string,
    message: string,
    reply: string,
    assistantId: string | undefined,
  ) {
    try {
      await this.workingMemory?.execute(userId, conversationId, message, reply, assistantId);
    } catch {
      this.log.event('working_memory_update_failed', { conversationId });
    }
  }

  private async recordFeedback(
    context: AgentContext,
    conversationId: string,
    message: string,
    output: AgentOutput,
    turnId: string | undefined,
    skill: 'conversation' | 'flirt',
  ) {
    if (
      !this.feedback ||
      !turnId ||
      !context.behavior?.state.evolutionEnabled ||
      output.actions.length ||
      protectedInteraction(message) ||
      isSeriousSocialTurn(message) ||
      /^(?:I could not|Confirm the action|nao consegui|não consegui|confirme a acao|confirme a ação)/i.test(output.message)
    )
      return;
    try {
      await this.feedback.dispatch({
        userId: context.profile.userId,
        assistantId: context.assistantId,
        eventId: turnId,
        conversationId,
        occurredAt: context.runtime.currentTime,
        timezone: context.runtime.timezone,
        skill,
        message,
        reply: output.message.slice(0, 1600),
        playfulBanterAllowed:
          (context.assistantId === 'RIN' &&
            !!context.behavior?.state.socialConfig &&
            (context.behavior.state.socialConfig.profanityLevel > 0 ||
              context.behavior.state.socialConfig.humorLevel > 0 ||
              (context.behavior.state.socialConfig.teasingLevel ?? 0) > 0 ||
              (context.behavior.state.socialConfig.sarcasmLevel ?? 0) > 0)) ||
          (context.relationship.boundaries?.conversation !== null &&
            typeof context.relationship.boundaries?.conversation === 'object' &&
            'jokingProfanity' in context.relationship.boundaries.conversation &&
            context.relationship.boundaries.conversation.jokingProfanity === true),
      });
    } catch (error) {
      this.log.event('behavior_feedback_dispatch_failed', {
        errorName: error instanceof Error ? error.name : 'unknown',
      });
    }
  }
}
