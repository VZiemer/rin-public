import { behaviorScoreSchema, personalityIdSchema } from '../../domain/model/assistant-behavior.js';
import type { AgentOutput } from '../../domain/model/contracts.js';
import type { Clock } from '../ports/runtime.js';
import { BehaviorRuntime } from './runtime.js';
import { HipnoseImages, type HipnoseImageCommand } from '../assets/hipnose-images.js';

type Query = 'moodScore' | 'intimacyScore' | 'personalityId';
type Command =
  | HipnoseImageCommand
  | { kind: 'query'; field: Query }
  | { kind: 'set'; field: Query; value: string }
  | { kind: 'invalid' };
function normalize(text: string) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/** Entire direct user message only. No substring matching, quoted commands, documents or LLM tools. */
export function parseHipnose(text: string): Command | null {
  const normalized = normalize(text).replace(/^(?:rin|yui)[,:]?\s+/, '');
  const query = normalized.replace(/[?!.]+$/, '').trim();
  // The natural outfit command has the same direct-message and diagnostics checks as hipnose.
  const outfit = query.match(/^(?:use|usa) (?:a |uma )?fantasia (.+)$/);
  if (outfit) {
    if (
      /[?"“”'`\r\n;]/.test(text) ||
      /\be\s+(?:use|usa|se vista|humor|intimidade|personalidade)\b/.test(outfit[1]!)
    )
      return { kind: 'invalid' };
    return { kind: 'image-use', target: outfit[1]! };
  }
  if (/^(?:hipnose|hipinose)$/.test(query)) return { kind: 'invalid' };
  if (
    /^(?:como (?:esta|ta|anda)|qual (?:e |eh )?)(?:(?:o |a )?(?:seu|sua|nosso|nossa) )?humor$/.test(
      query,
    )
  )
    return { kind: 'query', field: 'moodScore' };
  if (
    /^(?:como (?:esta|ta|anda)|qual (?:e |eh )?)(?:(?:o |a )?(?:seu|sua|nosso|nossa) )?(?:intimidade|amizade)$/.test(
      query,
    )
  )
    return { kind: 'query', field: 'intimacyScore' };
  if (/^(?:qual (?:e |eh )?|como (?:esta|ta) )(?:(?:a )?sua )?personalidade$/.test(query))
    return { kind: 'query', field: 'personalityId' };
  const prefix =
    /^(?:(?:hipnose|hipinose)(?:\s*[:,]\s*|\s+)|voce (?:esta|ta) (?:hipnotizada|hipnotizado|sob (?:hipnose|hipinose))\s+(?:e\s+)?(?:agora\s+)?)(.+)$/;
  const match = normalized.match(prefix);
  if (!match) return null;
  if (/["“”'`\r\n]/.test(text)) return { kind: 'invalid' };
  const instruction = match[1]!.replace(/[?!.]+$/, '').trim();
  const listing = instruction.match(
    /^(?:(?:me )?(?:liste|lista|listar|mostre|mostrar)(?: (?:as|suas|as suas))? (?:imagens|roupas|visuais)(?: disponiveis)?|quais (?:sao )?(?:as )?(?:imagens|roupas|visuais)(?: (?:disponiveis|voce tem|que voce tem))?)(?: (?:pagina )?(\d{1,3}))?$/,
  );
  if (listing) return { kind: 'image-list', page: Number(listing[1] ?? 1) };
  if (normalized.includes('?')) return { kind: 'invalid' };
  if (
    /^(?:(?:volte|voltar) (?:ao |pro |para o )?(?:modo )?automatico|(?:use )?(?:imagens|roupas|visual) automatic[oa]s?|(?:remova|limpe) (?:a )?(?:imagem|selecao) manual)$/.test(
      instruction,
    )
  )
    return { kind: 'image-auto' };
  const imageUse = instruction.match(
    /^(?:use|usa|usar|utilize|se vista|vista-se|vista|coloque|coloca) (.+)$/,
  );
  if (imageUse) {
    if (
      /[;]|\be\s+(?:agora\s+)?(?:(?:seu|sua|nosso|nossa)\s+)?(?:humor|intimidade|amizade|personalidade|use|usa|se vista|liste|mostre)\b/.test(
        imageUse[1]!,
      )
    )
      return { kind: 'invalid' };
    const rawTarget = text
      .trim()
      .match(/(?:use|usa|usar|utilize|se vista|vista-se|vista|coloque|coloca)\s+(.+?)[!.]*$/i)?.[1];
    return { kind: 'image-use', target: rawTarget ?? imageUse[1]! };
  }
  const setting = instruction.match(
    /^(?:(?:o |a )?(?:seu|sua|nosso|nossa|minha) )?(humor|intimidade|amizade|personalidade)(?:\s*(?:e|eh|=|:)\s*|\s+)([a-z0-9_.-]+(?:,[0-9]+)?)$/,
  );
  if (!setting) return { kind: 'invalid' };
  const field =
    setting[1] === 'humor'
      ? 'moodScore'
      : setting[1] === 'personalidade'
        ? 'personalityId'
        : 'intimacyScore';
  return { kind: 'set', field, value: setting[2]! };
}

function reply(message: string, assistantId: string): AgentOutput {
  return { message, assistantId, avatarState: 'NEUTRAL', priority: 'NORMAL', actions: [] };
}
const help =
  'Use “hipnose: humor 0”, “hipnose: intimidade 10”, “hipnose: personalidade deredere”, “hipnose liste imagens”, “hipnose use seu pijama” ou “hipnose imagens automáticas”. Humor e intimidade aceitam valores de 0 a 10. Envie um comando por mensagem.';
const scoreText = (score: number) => score.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

export class Hipnose {
  constructor(
    private runtime: BehaviorRuntime,
    private clock: Clock,
    private images?: HipnoseImages,
  ) {}
  async handle(
    userId: string,
    assistantId: string,
    message: string,
    deviceId?: string,
  ): Promise<AgentOutput | null> {
    const command = parseHipnose(message);
    if (!command) return null;
    const addressed = normalize(message).match(/^(rin|yui)[,:]?\s+/)?.[1];
    if (addressed && addressed.toUpperCase() !== assistantId) return null;
    const respond = (text: string) => reply(text, assistantId);
    const now = this.clock.now();
    const snapshot = await this.runtime.get(userId, assistantId, now);
    if (!snapshot) return null;
    const current = snapshot.state;
    if (command.kind === 'query') {
      return respond(
        command.field === 'moodScore'
          ? `Meu humor está em ${scoreText(snapshot.currentMoodScore ?? current.moodScore)} de 10. A energia e a sonolência são avaliadas separadamente.`
          : command.field === 'intimacyScore'
            ? `Nossa intimidade está em ${scoreText(current.intimacyScore)} de 10.`
            : `Minha personalidade ativa é ${snapshot.personality.name}.`,
      );
    }
    if (!current.diagnosticsEnabled)
      return respond(
        'O comando de diagnóstico hipnose não está habilitado para este usuário e assistente.',
      );
    if (command.kind === 'invalid') return respond(help);
    if (
      command.kind === 'image-list' ||
      command.kind === 'image-use' ||
      command.kind === 'image-auto'
    )
      return this.images
        ? this.images.handle(current, command, deviceId)
        : respond('O catálogo de imagens não está configurado para hipnose.');
    const parsed =
      command.field === 'personalityId'
        ? personalityIdSchema.safeParse(command.value)
        : behaviorScoreSchema.safeParse(Number(command.value.replace(',', '.')));
    if (!parsed.success) return respond(help);
    if (command.field === 'personalityId') {
      const definition = await this.runtime.personalities.get(String(parsed.data));
      if (!definition?.enabled)
        return respond(
          'Essa personalidade não está disponível. Opções iniciais: tsundere, deredere, dandere, kuudere e yandere.',
        );
    }
    const previous =
      command.field === 'moodScore'
        ? (snapshot.currentMoodScore ?? current.moodScore)
        : current[command.field];
    if (previous !== parsed.data) {
      const stored = await this.runtime.states.get(userId, assistantId);
      // The permission and values just read must still match; the repository guards the actual write.
      if (!stored || stored.version !== current.version || !stored.diagnosticsEnabled)
        return respond('A configuração mudou durante o comando. Envie-o novamente.');
      await this.runtime.states.save(
        {
          ...current,
          [command.field]: parsed.data,
          lastManualChangeAt: now.toISOString(),
          moodAnchorAt:
            command.field === 'moodScore'
              ? now.toISOString()
              : (current.moodAnchorAt ?? current.updatedAt),
          version: current.version + 1,
          updatedAt: now.toISOString(),
        },
        current.version,
        { source: 'hipnose', field: command.field, previous, next: parsed.data },
      );
    }
    return respond(
      command.field === 'personalityId'
        ? `Personalidade alterada para ${String(parsed.data)}.`
        : `${command.field === 'moodScore' ? 'Humor' : 'Intimidade'} definido em ${scoreText(Number(parsed.data))} de 10.`,
    );
  }
}
