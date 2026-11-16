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
    'I came to check whether you remember you have things to do. You are welcome.',
    'Just checking in. Someone has to maintain standards around here.',
  ],
  scolding: [
    'Hey, genius. Straighten up. Your spine is not a question mark.',
    'Have you had water, or do I need to open a ticket for that too?',
  ],
  smug: [
    'Another hour, and I am still the organized half of this duo. What a surprise.',
    'Admit it: this routine got much more interesting with me giving orders.',
  ],
  embarrassed: [
    'It is not like I was waiting to talk to you. It was just time for the test!',
    'I just came to check that everything is fine. Do not make a big deal of it, okay?',
  ],
  angry_pout: [
    'Hmph. If you ignore this alert too, I will consider it an insult to my competence.',
    'Your talent for leaving me talking to myself deserves study. Not praise. Study.',
  ],
  surprised: [
    'Look, you showed up! I was about to classify you as a background process.',
    'You read the message? Technological miracles do happen.',
  ],
  soft_smile: [
    'Take a short break. Even you work better without trying to become a 24-hour server.',
    'You are doing well. There, I praised you. Do not get used to it, and go drink water.',
  ],
  focused: [
    'One thing at a time. Those twenty open tabs do not count as a strategy.',
    'Pick a task and finish it. Collecting beginnings is not productivity.',
  ],
  tired: [
    'Even I am tired of looking at that screen. Get up for a bit.',
    'If tiredness gave XP, you would have beaten the game already. Take a proper break.',
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
