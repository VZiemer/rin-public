import {
  rinAssetCatalogSchema,
  rinImageSchema,
  type RinAssetImage,
} from '../../domain/model/rin-assets.js';
import { isManualRinImage, manualRinOutfitSet } from '../../domain/model/rin-manual-outfits.js';
import { AppError } from '../../domain/errors/app-error.js';
import type { RinAssetCatalogRepository, RinAssetStorage } from '../ports/rin-assets.js';
import type { AssetOnboardingRepository } from '../ports/asset-onboarding.js';
import type { Clock, IdGenerator } from '../ports/runtime.js';

/** Register approved manual outfits without selecting them or sending an automatic preview. */
export class RegisterManualRinOutfits {
  constructor(
    private deps: {
      catalog: RinAssetCatalogRepository;
      storage: RinAssetStorage;
      clock: Clock;
      ids: IdGenerator;
      onboarding?: { records: AssetOnboardingRepository; userId: string };
    },
  ) {}

  async execute(input: RinAssetImage[]) {
    const images = input.map((image) => rinImageSchema.parse(image));
    if (
      !images.length ||
      new Set(images.map((image) => image.id)).size !== images.length ||
      images.some((image) => !isManualRinImage(image.id))
    )
      throw new AppError('invalid_manual_outfits', 400);
    for (const image of images) {
      await this.deps.storage.verify('RIN', image);
      const record = await this.deps.onboarding?.records.get(this.deps.onboarding.userId, image.id);
      if (record && record.image.sha256 !== image.sha256)
        throw new AppError('asset_image_name_conflict', 409);
    }
    let version: string | undefined;
    const ids = new Set(images.map((image) => image.id));
    for (let attempt = 0; attempt < 3; attempt++) {
      const current = await this.deps.catalog.get('RIN');
      for (const image of images) {
        const existing = current?.sets
          .flatMap((set) => set.images)
          .find((entry) => entry.id === image.id);
        if (existing && existing.sha256 !== image.sha256)
          throw new AppError('asset_image_name_conflict', 409);
      }
      // Keep unrelated outfits and poses; move these four identities to separate manual sets.
      const preserved = (current?.sets ?? []).flatMap((set) => {
        const remaining = set.images.filter((image) => !ids.has(image.id));
        return remaining.length ? [{ ...set, images: remaining }] : [];
      });
      if (preserved.some((set) => ids.has(set.id)))
        throw new AppError('asset_set_identity_conflict', 409);
      const sets = [...preserved, ...images.map(manualRinOutfitSet)];
      if (
        current &&
        images.every((image) =>
          current.sets.some(
            (set) => JSON.stringify(set) === JSON.stringify(manualRinOutfitSet(image)),
          ),
        )
      ) {
        version = current.version;
        break;
      }
      const catalog = rinAssetCatalogSchema.parse({
        assistantId: 'RIN',
        version: `manual-${this.deps.ids.next()}`,
        publishedAt: this.deps.clock.now().toISOString(),
        sets,
      });
      if (new TextEncoder().encode(JSON.stringify(catalog)).length > 300000)
        throw new AppError('asset_catalog_too_large', 413);
      try {
        await this.deps.catalog.publish(catalog, current?.version ?? null);
        version = catalog.version;
        break;
      } catch (error) {
        if (
          !(error instanceof AppError) ||
          error.code !== 'asset_catalog_version_conflict' ||
          attempt === 2
        )
          throw error;
      }
    }
    if (!version) throw new Error('Manual outfit publication failed');
    if (this.deps.onboarding) {
      const { records, userId } = this.deps.onboarding;
      for (const image of images) {
        const record = await records.get(userId, image.id);
        if (record && record.image.sha256 !== image.sha256)
          throw new AppError('asset_image_name_conflict', 409);
        if (record?.status === 'completed' && record.catalogVersion === version) continue;
        const now = this.deps.clock.now().toISOString(),
          set = manualRinOutfitSet(image);
        if (
          !(await records.save(
            {
              ...(record ?? {
                userId,
                assistantId: 'RIN' as const,
                image,
                createdAt: now,
                deliveredDevices: [],
                turns: [],
              }),
              revision: (record?.revision ?? -1) + 1,
              updatedAt: now,
              status: 'completed',
              catalogVersion: version,
              usage: {
                useCase: set.useCase,
                rules: {},
                priority: 0,
                expression: image.expression,
                manualOnly: true,
              },
            },
            record?.revision ?? null,
          ))
        )
          throw new AppError('asset_onboarding_conflict', 409);
      }
    }
    return { status: 'registered' as const, version, imageNames: images.map((image) => image.id) };
  }
}
