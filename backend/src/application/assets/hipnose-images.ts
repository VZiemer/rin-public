import type { AssistantBehavior } from '../../domain/model/assistant-behavior.js';
import type { AgentOutput, Device } from '../../domain/model/contracts.js';
import type { RinAssetCatalog, RinAssetImage, RinAssetSet } from '../../domain/model/rin-assets.js';
import type { AssistantBehaviorRepository } from '../ports/assistant-behavior.js';
import type { DeviceRepository } from '../ports/device.js';
import type { NotificationGateway } from '../ports/notification.js';
import type {
  AssetSelectionRepository,
  RinAssetCatalogRepository,
  RinAssetStorage,
} from '../ports/rin-assets.js';
import type { Clock } from '../ports/runtime.js';
import { isBundledRinImage } from '../../domain/model/seasonal-assets.js';

export type HipnoseImageCommand =
  | { kind: 'image-list'; page: number }
  | { kind: 'image-use'; target: string }
  | { kind: 'image-auto' };

function normalize(text: string) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}
function words(text: string) {
  const aliases: Record<string, string> = {
    pajamas: 'pijama',
    pyjamas: 'pijama',
    pijamas: 'pijama',
    beach: 'praia',
    bikini: 'biquini',
    swimsuit: 'biquini',
    rabbit: 'coelinha',
    bunny: 'coelinha',
    coelho: 'coelinha',
    empregada: 'maid',
    sexymaid: 'maid sexy',
    nua: 'nude',
    nu: 'nude',
    pelada: 'nude',
    pelado: 'nude',
  };
  return normalize(text)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .flatMap((word) => (aliases[word] ?? word).split(' '));
}
const ignored = new Set([
  'the',
  'an',
  'your',
  'costume',
  'outfit',
  'image',
  'images',
  'a',
  'o',
  'as',
  'os',
  'um',
  'uma',
  'seu',
  'sua',
  'sue',
  'suas',
  'seus',
  'de',
  'da',
  'do',
  'pra',
  'para',
  'com',
  'na',
  'no',
  'imagem',
  'imagens',
  'roupa',
  'roupas',
  'visual',
  'fantasia',
  'fantasias',
]);
type Match = { set: RinAssetSet; image: RinAssetImage };

/** Exact image IDs win. Context matching is conservative: never invent an asset or break a tie. */
export function findHipnoseImages(catalog: RinAssetCatalog, target: string): Match[] {
  const enabled = catalog.sets.filter((set) => set.enabled);
  const exact = enabled.flatMap((set) =>
    set.images.filter((image) => image.id === target.trim()).map((image) => ({ set, image })),
  );
  if (exact.length) return exact;
  const tokens = words(target).filter((word) => !ignored.has(word));
  if (!tokens.length) return [];
  const phrase = tokens.join(' ');
  const named = enabled.flatMap((set) =>
    set.images
      .filter(
        (image) =>
          words(image.id).join(' ') === phrase ||
          words(image.name)
            .filter((word) => !ignored.has(word))
            .join(' ') === phrase,
      )
      .map((image) => ({ set, image })),
  );
  if (named.length) return named;
  return enabled.flatMap((set) => {
    const direct = set.images.filter((image) => {
      const searchable = new Set([...words(image.id), ...words(image.name)]);
      return tokens.every((token) => searchable.has(token));
    });
    if (direct.length) {
      const preferred =
        direct.find((image) => image.expression === 'NEUTRAL') ??
        direct.find((image) => image.expression === set.fallbackExpression) ??
        (direct.length === 1 ? direct[0] : undefined);
      return preferred ? [{ set, image: preferred }] : direct.map((image) => ({ set, image }));
    }
    const searchable = new Set([...words(set.id), ...words(set.name), ...words(set.useCase)]);
    if (!tokens.every((token) => searchable.has(token))) return [];
    const image =
      set.images.find((i) => i.expression === 'NEUTRAL') ??
      set.images.find((i) => i.expression === set.fallbackExpression) ??
      (set.images.length === 1 ? set.images[0] : undefined);
    return image ? [{ set, image }] : set.images.map((image) => ({ set, image }));
  });
}

export class HipnoseImages {
  constructor(
    private deps: {
      catalog: RinAssetCatalogRepository;
      states: AssistantBehaviorRepository;
      clock: Clock;
      deliveries: AssetSelectionRepository;
      delivery?: {
        storage: RinAssetStorage;
        devices: DeviceRepository;
        notifications: NotificationGateway;
      };
    },
  ) {}
  async handle(
    state: AssistantBehavior,
    command: HipnoseImageCommand,
    deviceId?: string,
  ): Promise<AgentOutput> {
    const reply = (message: string, imageName?: string): AgentOutput => ({
      message,
      assistantId: state.assistantId,
      avatarState: 'NEUTRAL',
      priority: 'NORMAL',
      actions: [],
      ...(imageName !== undefined ? { imageName } : {}),
    });
    if (!state.diagnosticsEnabled)
      return reply('Hypnosis mode is not enabled for this user and assistant.');
    if (command.kind === 'image-auto') {
      return reply('I switched back to automatic image selection.');
    }
    const catalog = await this.deps.catalog.get(state.assistantId);
    if (!catalog || !catalog.sets.some((set) => set.enabled))
      return reply('There are no images available in this assistant catalog.');
    if (command.kind === 'image-list') {
      const images = catalog.sets
        .filter((set) => set.enabled)
        .flatMap((set) => set.images.map((image) => ({ set, image })));
      const pages = Math.ceil(images.length / 10);
      if (command.page < 1 || command.page > pages)
        return reply(
          `That page does not exist. Use “hypnosis list images” or a page between 1 and ${pages}.`,
        );
      const lines = images
        .slice((command.page - 1) * 10, command.page * 10)
        .map(
          ({ set, image }) =>
            `• ${image.id} — ${image.name} (${image.expression}). ${set.useCase.slice(0, 150)}`,
        );
      return reply(
        `Available images (${images.length}; page ${command.page}/${pages}):\n${lines.join('\n')}\nUse “hypnosis use NAME” or describe the outfit, as in “hypnosis use beach”.${pages > command.page ? ` Next: “hypnosis list images ${command.page + 1}”.` : ''}`,
      );
    }
    const matches = findHipnoseImages(catalog, command.target);
    if (!matches.length)
      return reply(
        'I could not find an image for that request. Use “hypnosis list images” and choose a catalog name.',
      );
    if (matches.length > 1)
      return reply(
        `More than one image matches the request: ${matches
          .slice(0, 10)
          .map((m) => m.image.id)
          .join(', ')}. Choose with “hypnosis use NAME”.`,
      );
    const { image } = matches[0]!;
    if (!this.deps.delivery)
      return reply(
        'Image downloading is not configured. I could not apply this selection.',
      );
    let prepared: Device[] = [];
    try {
      prepared = await this.prepare(state, image, deviceId);
    } catch {
      /* Storage or device lookup failure must not claim a successful selection. */
    }
    if (!prepared.length)
      return reply(
        'I could not make the image available on your device. Check the app registration and try again.',
      );
    const latest = await this.deps.states.get(state.userId, state.assistantId);
    if (!latest?.diagnosticsEnabled || latest.version !== state.version)
      return reply('The configuration changed during the command. Send it again.');
    // Invalidate only delivery bookkeeping, so the very next scheduler cycle restores
    // the automatic choice even if its previous refresh is less than 30 minutes old.
    for (const device of prepared) {
      await this.deps.deliveries.put(state.assistantId, device, {
        scope: JSON.stringify(['hipnose-temporary', image.id]),
        refreshedAt: this.deps.clock.now().toISOString(),
      });
    }
    return reply(
      `I will use ${image.name} (${image.id}) now. The next conversation or sync will follow automatic rules again.`,
      image.id,
    );
  }
  private async prepare(state: AssistantBehavior, image: RinAssetImage, deviceId?: string) {
    const delivery = this.deps.delivery!;
    const devices = deviceId
      ? [await delivery.devices.get(state.userId, deviceId)]
      : await delivery.devices.list(state.userId, 200);
    const delivered: Device[] = [];
    const available = isBundledRinImage(state.assistantId, image.id)
      ? {
          type: 'avatar_image_select' as const,
          assistantId: state.assistantId,
          imageName: image.id,
        }
      : {
          type: 'avatar_image_available' as const,
          assistantId: state.assistantId,
          imageName: image.id,
          imageUrl: (await delivery.storage.download(state.assistantId, image)).url,
          imageSha256: image.sha256,
        };
    for (const device of devices) {
      if (!device || device.userId !== state.userId || !device.enabled || !device.pushToken)
        continue;
      const owner = await delivery.devices.getOwnership?.(device.id);
      if (
        !owner?.enabled ||
        owner.ownerUserId !== state.userId ||
        owner.pushToken !== device.pushToken
      )
        continue;
      try {
        if ((await delivery.notifications.send(device.pushToken, available)).status === 'sent')
          delivered.push(device);
      } catch {
        /* Only owned devices that accepted availability can receive the temporary selection. */
      }
    }
    return delivered;
  }
}
