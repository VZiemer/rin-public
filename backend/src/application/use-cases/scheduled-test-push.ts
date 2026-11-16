import {
  androidAvatarStates,
  androidEmotionStates,
  type AgentOutput,
} from '../../domain/model/contracts.js';
import type { Clock } from '../ports/runtime.js';
import type { RandomSource, ScheduledPushClaims } from '../ports/scheduled-push.js';
import type { SendNotification } from './send-notification.js';

export const testPushTimezone = 'America/Sao_Paulo';
const messages: Record<(typeof androidEmotionStates)[number], readonly string[]> = {
  neutral: [
    'Vim conferir se você ainda lembra que tem coisas para fazer. De nada.',
    'Passando só para fiscalizar. Alguém precisa manter algum padrão por aqui.',
  ],
  scolding: [
    'Ei, gênio. Endireita essa postura. Sua coluna não é um ponto de interrogação.',
    'Já bebeu água ou vou ter que abrir um chamado para isso também?',
  ],
  smug: [
    'Mais uma hora e eu continuo sendo a parte organizada desta dupla. Que surpresa.',
    'Pode admitir: essa rotina ficou bem mais interessante comigo dando ordens.',
  ],
  embarrassed: [
    'Não é como se eu estivesse esperando para falar com você. Era só a hora do teste!',
    'Eu só vim ver se está tudo bem. Não transforma isso num evento, tá?',
  ],
  angry_pout: [
    'Hmph. Se você ignorar mais esse aviso, vou considerar uma afronta à minha competência.',
    'Seu talento para me deixar falando sozinha merece estudo. Não elogio. Estudo.',
  ],
  surprised: [
    'Olha só, você apareceu! Já estava quase te catalogando como processo em segundo plano.',
    'Você leu a mensagem? Milagres tecnológicos acontecem mesmo.',
  ],
  soft_smile: [
    'Faz uma pausa pequena. Até você funciona melhor sem tentar virar um servidor 24 horas.',
    'Está indo bem. Pronto, elogiei. Não se acostuma e vai beber água.',
  ],
  focused: [
    'Uma coisa de cada vez. Essas vinte abas abertas não contam como estratégia.',
    'Escolhe uma tarefa e termina. Colecionar começos não é produtividade.',
  ],
  tired: [
    'Até eu cansei de olhar essa tela. Levanta um pouco, criatura.',
    'Se cansaço desse XP, você já teria zerado o jogo. Faz uma pausa decente.',
  ],
};
const avatarByEmotion: Record<
  (typeof androidEmotionStates)[number],
  (typeof androidAvatarStates)[number]
> = {
  neutral: 'NEUTRAL',
  scolding: 'SCOLDING',
  smug: 'SMUG',
  embarrassed: 'EMBARRASSED',
  angry_pout: 'ANGRY_POUT',
  surprised: 'SURPRISED',
  soft_smile: 'SOFT_SMILE',
  focused: 'FOCUSED',
  tired: 'TIRED',
};

export function randomTestMessage(random: RandomSource): AgentOutput {
  const emotion = androidEmotionStates[random.integer(androidEmotionStates.length)];
  if (!emotion) throw new Error('Invalid random emotion index');
  const variants = messages[emotion];
  const message = variants[random.integer(variants.length)];
  if (!message) throw new Error('Invalid random message index');
  return { message, avatarState: avatarByEmotion[emotion], priority: 'NORMAL', actions: [] };
}

function localParts(date: Date) {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: testPushTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
}

export function isScheduledTestWindow(scheduledAt: string, now: Date): boolean {
  const slot = new Date(scheduledAt);
  if (!Number.isFinite(slot.getTime()) || !Number.isFinite(now.getTime())) return false;
  const age = now.getTime() - slot.getTime();
  if (age < 0 || age >= 5 * 60_000 || slot.getUTCSeconds() !== 0 || slot.getUTCMilliseconds() !== 0)
    return false;
  const planned = localParts(slot);
  const actual = localParts(now);
  const hour = Number(planned.hour);
  const actualMinutes = Number(actual.hour) * 60 + Number(actual.minute);
  return (
    planned.minute === '00' &&
    hour >= 8 &&
    hour <= 20 &&
    actualMinutes >= 8 * 60 &&
    actualMinutes <= 20 * 60 &&
    ['year', 'month', 'day'].every((part) => planned[part] === actual[part])
  );
}

export class ScheduledTestPush {
  constructor(
    private notifications: Pick<SendNotification, 'execute'>,
    private claims: ScheduledPushClaims,
    private clock: Clock,
    private random: RandomSource,
    private userId: string,
    private deviceId: string,
  ) {}

  async execute(scheduledAt: string) {
    const now = this.clock.now();
    if (!isScheduledTestWindow(scheduledAt, now))
      return { status: 'skipped', reason: 'outside_window' } as const;
    const slot = new Date(scheduledAt).toISOString();
    if (!(await this.claims.claim(this.userId, this.deviceId, slot, now)))
      return { status: 'skipped', reason: 'duplicate' } as const;
    const payload = randomTestMessage(this.random);
    const result = await this.notifications.execute(this.userId, this.deviceId, payload);
    return { ...result, avatarState: payload.avatarState };
  }
}
