import { silentLogger, type Logger } from '../ports/logger.js';
import type { SkillThreadRepository } from '../ports/skill-thread.js';
import { chooseInitiative, type InitiativeProposal, type ProactiveGate, type SkillThread } from './proactive-engine.js';

export class SkillProactiveDispatcher {
  constructor(
    private readonly threads: SkillThreadRepository,
    private readonly log: Logger = silentLogger,
  ) {}

  async dispatch(
    proposals: readonly InitiativeProposal[],
    gate: ProactiveGate,
    send: (proposal: InitiativeProposal) => Promise<boolean>,
  ): Promise<{ status: SkillThread['status']; reason: string }> {
    const choice = chooseInitiative(proposals, gate);
    if (choice.reason !== 'selected') {
      this.log.event('skill_initiative', { reasonCode: choice.reason, status: 'suppressed' });
      return { status: 'suppressed', reason: choice.reason };
    }
    const now = gate.now.toISOString();
    let delivered: boolean;
    try {
      delivered = await send(choice.proposal);
    } catch {
      delivered = false;
    }
    const thread: SkillThread = {
      id: choice.proposal.id,
      userId: choice.proposal.userId,
      assistantId: choice.proposal.assistantId,
      skillId: choice.proposal.skillId,
      cooldownKey: choice.proposal.cooldownKey,
      reasonCode: choice.proposal.reasonCode,
      text: choice.proposal.text,
      factualContext: choice.proposal.factualContext,
      status: delivered ? 'sent' : 'failed',
      createdAt: now,
      updatedAt: now,
    };
    if (delivered) thread.sentAt = now;
    await this.threads.put(thread);
    this.log.event('skill_initiative', {
      skillId: choice.proposal.skillId,
      reasonCode: choice.proposal.reasonCode,
      status: thread.status,
    });
    return { status: thread.status, reason: choice.reason };
  }
}
